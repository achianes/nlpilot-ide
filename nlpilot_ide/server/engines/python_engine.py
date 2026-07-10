"""Python line-level debug engine.

The `DebuggerBackend` (bdb + sys.settrace, runs in an isolated subprocess) is
ported almost verbatim from the old tkinter app's gui/debugger_app.py — it never
imported tk, so only the controller changes. `PythonDebugSession` replaces the
tk `DebuggerApp`: it owns the subprocess + pipes and exposes a non-blocking
`poll_messages()` that yields normalized protocol dicts for the WS layer.
"""

from __future__ import annotations

import bdb
import builtins
import os
import queue
import sys
import threading
import time
import traceback
from bdb import BdbQuit
from multiprocessing import Pipe, Process


# ---------------------------------------------------------------------------
# subprocess side: stdio redirects + the bdb backend (ported, tk-free)
# ---------------------------------------------------------------------------
def _backend_process_main(script_path, child_cmd_conn, child_io_conn, breakpoints, script_args):
    backend = DebuggerBackend(
        script_path_from_gui=script_path,
        cmd_conn=child_cmd_conn,
        io_conn=child_io_conn,
        breakpoints=breakpoints,
        script_args=script_args,
    )
    backend.start()


class StdOutRedirect:
    def __init__(self, conn):
        self.conn = conn

    def write(self, text):
        if text:
            try:
                self.conn.send(("stdout", text))
            except (OSError, EOFError, BrokenPipeError):
                pass

    def flush(self):
        pass


class StdErrRedirect:
    def __init__(self, conn):
        self.conn = conn

    def write(self, text):
        if text:
            try:
                self.conn.send(("stderr", text))
            except (OSError, EOFError, BrokenPipeError):
                pass

    def flush(self):
        pass


class StdInRedirect:
    def __init__(self, io_conn_obj):
        self.conn = io_conn_obj

    def readline_with_prompt(self, prompt_text_from_caller=""):
        unique_input_id = f"input_{time.time()}_{id(self)}"
        try:
            self.conn.send(
                ("gui_input_request_with_prompt", unique_input_id, str(prompt_text_from_caller))
            )
        except (OSError, BrokenPipeError, EOFError):
            raise EOFError("Debugger connection lost while requesting GUI input.")
        while True:
            try:
                kind, *rest = self.conn.recv()
                if kind == "gui_input_response":
                    response_id, user_input_line = rest
                    if response_id == unique_input_id:
                        return user_input_line
                elif kind == "finished":
                    raise EOFError("Debugger finished while waiting for GUI input response.")
            except (EOFError, OSError, BrokenPipeError):
                raise EOFError("Debugger connection lost while waiting for GUI input response.")
            except ValueError:
                raise EOFError("Invalid message received while waiting for GUI input.")

    def readline(self):
        return self.readline_with_prompt("")

    def read(self, size=-1):
        try:
            line = self.readline()
        except EOFError:
            return ""
        return line if (size < 0 or size >= len(line)) else line[:size]

    def write(self, data):
        raise OSError("Cannot write to an input stream.")

    def flush(self):
        pass


class DebuggerBackend(bdb.Bdb):
    def __init__(self, script_path_from_gui, cmd_conn, io_conn, breakpoints=None, script_args=None):
        super().__init__()
        self.main_script_path = self.canonic(script_path_from_gui)
        self.conn_to_gui = cmd_conn
        self.io_conn_to_gui = io_conn
        self.script_args = script_args if script_args is not None else []

        self._gui_cmd_queue = queue.Queue()
        self._user_line_state_sent_this_pause = False
        self._startup_continue_consumed = False

        self._runtime_stop_event = threading.Event()
        self._runtime_thread = None
        self._runtime_bp_lock = threading.RLock()

        self.dynamic_breakpoints = set()

        self.clear_all_breaks()
        if breakpoints:
            for lineno in breakpoints:
                self.dynamic_breakpoints.add((self.main_script_path, int(lineno)))
                self.set_break(self.main_script_path, int(lineno))

        self.original_builtin_input = None
        self.redirected_stdin_instance = None

    def canonic(self, filename):
        if not filename:
            return filename
        if filename.startswith("<") and filename.endswith(">"):
            return filename
        return os.path.normcase(os.path.abspath(filename))

    def _safe_repr(self, v):
        try:
            s = repr(v)
            return s[:200] + "..." if len(s) > 200 else s
        except Exception as e:  # noqa: BLE001
            return f"<repr error: {e}>"

    def _get_locals(self, frame):
        return {
            str(k): self._safe_repr(v)
            for k, v in frame.f_locals.items()
            if not str(k).startswith("__")
        }

    def trace_dispatch(self, frame, event, arg):
        if self.quitting:
            return None

        if event == "line":
            filename = self.canonic(frame.f_code.co_filename)
            lineno = frame.f_lineno
            with self._runtime_bp_lock:
                is_bp = (filename, lineno) in self.dynamic_breakpoints
            if is_bp:
                self.set_step()

        res = super().trace_dispatch(frame, event, arg)

        if res is None and event == "call":
            filename = self.canonic(frame.f_code.co_filename)
            main_dir = os.path.dirname(self.main_script_path)
            if filename.startswith(main_dir) or filename == self.main_script_path:
                return self.trace_dispatch

        return res

    def set_continue(self):
        self._set_stopinfo(self.botframe, None, -1)

    def set_quit(self):
        self.stopframe = self.botframe
        self.returnframe = None
        self.quitting = True
        sys.settrace(None)

    def user_line(self, frame):
        filename = self.canonic(frame.f_code.co_filename)

        if not filename.startswith(os.path.dirname(self.main_script_path)) and filename != self.main_script_path:
            self.set_continue()
            return

        if not self._startup_continue_consumed:
            self._startup_continue_consumed = True
            is_f5_run = False
            try:
                if not self._gui_cmd_queue.empty():
                    c, a = self._gui_cmd_queue.queue[0]
                    if c == "continue":
                        self._gui_cmd_queue.get_nowait()
                        is_f5_run = True
            except Exception:  # noqa: BLE001
                pass

            with self._runtime_bp_lock:
                is_bp = (filename, frame.f_lineno) in self.dynamic_breakpoints

            if is_f5_run and not is_bp and not self.break_here(frame):
                self.set_continue()
                return

        if not self._user_line_state_sent_this_pause:
            try:
                self.conn_to_gui.send(("line", filename, frame.f_lineno))
                stack = []
                curr = frame
                while curr:
                    stack.append((curr.f_code.co_filename, curr.f_lineno, curr.f_code.co_name))
                    curr = curr.f_back
                self.conn_to_gui.send(("stack", stack))
                self.conn_to_gui.send(
                    ("variables", {"locals": self._get_locals(frame), "globals": {}})
                )
            except Exception:  # noqa: BLE001
                pass
            self._user_line_state_sent_this_pause = True

        while True:
            try:
                cmd, arg = self._gui_cmd_queue.get(timeout=0.1)
                if cmd == "step":
                    self._user_line_state_sent_this_pause = False
                    self.set_step()
                    return
                elif cmd == "next":
                    self._user_line_state_sent_this_pause = False
                    self.set_next(frame)
                    return
                elif cmd == "continue":
                    self._user_line_state_sent_this_pause = False
                    self.set_continue()
                    return
                elif cmd == "return":
                    self._user_line_state_sent_this_pause = False
                    self.set_return(frame)
                    return
                elif cmd == "quit":
                    self.set_quit()
                    return
                elif cmd == "eval":
                    try:
                        res = eval(arg, frame.f_globals, frame.f_locals)  # noqa: S307
                        self.conn_to_gui.send(("eval_result", arg, self._safe_repr(res), True))
                    except Exception as e:  # noqa: BLE001
                        self.conn_to_gui.send(("eval_result", arg, str(e), False))
                elif cmd == "execute_code_interactive":
                    try:
                        exec(arg, frame.f_globals, frame.f_locals)  # noqa: S102
                        self.conn_to_gui.send(
                            ("interactive_result", arg, "Executed successfully", "", True, "")
                        )
                    except Exception as e:  # noqa: BLE001
                        self.conn_to_gui.send(("interactive_result", arg, "", str(e), False, str(e)))
            except queue.Empty:
                continue

    def _runtime_command_loop(self):
        while not self._runtime_stop_event.is_set():
            try:
                if not self.conn_to_gui.poll(0.05):
                    continue
                msg = self.conn_to_gui.recv()
                if not msg:
                    continue
                cmd = msg[0]
                arg = msg[1] if len(msg) > 1 else None
                if cmd == "add_breakpoint_runtime":
                    fname, fline = arg
                    canon_path = self.canonic(fname)
                    with self._runtime_bp_lock:
                        self.dynamic_breakpoints.add((canon_path, int(fline)))
                        self.set_break(canon_path, int(fline))
                elif cmd == "remove_breakpoint_runtime":
                    fname, fline = arg
                    canon_path = self.canonic(fname)
                    with self._runtime_bp_lock:
                        self.dynamic_breakpoints.discard((canon_path, int(fline)))
                        self.clear_break(canon_path, int(fline))
                else:
                    self._gui_cmd_queue.put((cmd, arg))
            except Exception:  # noqa: BLE001
                break

    def start(self):
        _old_stdout, _old_stderr, _old_stdin = sys.stdout, sys.stderr, sys.stdin
        _old_cwd = os.getcwd()
        if self.original_builtin_input is None:
            self.original_builtin_input = builtins.input

        try:
            script_dir = os.path.dirname(self.main_script_path)
            if os.path.exists(script_dir):
                try:
                    os.chdir(script_dir)
                    if script_dir not in sys.path:
                        sys.path.insert(0, script_dir)
                except OSError:
                    pass

            sys.argv = [self.main_script_path] + self.script_args
            sys.stdout = StdOutRedirect(self.io_conn_to_gui)
            sys.stderr = StdErrRedirect(self.io_conn_to_gui)
            self.redirected_stdin_instance = StdInRedirect(self.io_conn_to_gui)
            sys.stdin = self.redirected_stdin_instance
            builtins.input = lambda p="": self.redirected_stdin_instance.readline_with_prompt(p).rstrip("\n")

            self._runtime_stop_event.clear()
            self._runtime_thread = threading.Thread(target=self._runtime_command_loop, daemon=True)
            self._runtime_thread.start()

            with open(self.main_script_path, "rb") as f:
                code_obj = compile(f.read(), self.main_script_path, "exec")

            globals_dict = {"__name__": "__main__", "__file__": self.main_script_path}

            threading.settrace(self.trace_dispatch)
            self.runctx(code_obj, globals_dict, globals_dict)

        except (BdbQuit, SystemExit):
            pass
        except Exception:  # noqa: BLE001
            try:
                self.conn_to_gui.send(("stderr", traceback.format_exc()))
            except Exception:  # noqa: BLE001
                pass
        finally:
            self._runtime_stop_event.set()
            sys.stdout, sys.stderr, sys.stdin = _old_stdout, _old_stderr, _old_stdin
            builtins.input = self.original_builtin_input
            try:
                os.chdir(_old_cwd)
            except Exception:  # noqa: BLE001
                pass
            time.sleep(0.2)
            try:
                self.conn_to_gui.send(("finished",))
                self.conn_to_gui.close()
            except Exception:  # noqa: BLE001
                pass


# ---------------------------------------------------------------------------
# parent side: session controller (replaces the tk DebuggerApp)
# ---------------------------------------------------------------------------
class PythonDebugSession:
    """Owns the debug subprocess + pipes. `poll_messages()` drains both pipes and
    returns normalized protocol dicts. `abspath`/`relpath` translate between the
    engine's absolute paths and project-relative paths the frontend uses."""

    def __init__(self, abs_script_path: str, breakpoints: list[int] | None,
                 script_args: list[str] | None, to_rel):
        self.abs_script_path = abs_script_path
        self._breakpoints = breakpoints or []
        self._args = script_args or []
        self._to_rel = to_rel  # callable: abs path -> project-relative (or abs)
        self.proc: Process | None = None
        self.cmd_conn = None
        self.io_conn = None

    def start(self) -> None:
        parent_cmd_conn, child_cmd_conn = Pipe()
        parent_io_conn, child_io_conn = Pipe()
        self.proc = Process(
            target=_backend_process_main,
            args=(self.abs_script_path, child_cmd_conn, child_io_conn,
                  self._breakpoints, self._args),
            name=f"PyDebug-{os.path.basename(self.abs_script_path)}",
            daemon=False,
        )
        self.proc.start()
        child_cmd_conn.close()
        child_io_conn.close()
        self.cmd_conn = parent_cmd_conn
        self.io_conn = parent_io_conn
        # Consume the automatic startup "continue" so run honors breakpoints only.
        self.send("continue")

    @property
    def alive(self) -> bool:
        return bool(self.proc and self.proc.is_alive())

    def send(self, cmd: str, arg=None) -> None:
        if self.cmd_conn:
            try:
                self.cmd_conn.send((cmd, arg))
            except (OSError, BrokenPipeError, EOFError):
                pass

    def add_breakpoint(self, line: int) -> None:
        self.send("add_breakpoint_runtime", (self.abs_script_path, int(line)))

    def remove_breakpoint(self, line: int) -> None:
        self.send("remove_breakpoint_runtime", (self.abs_script_path, int(line)))

    def input_response(self, input_id: str, text: str) -> None:
        if self.io_conn:
            try:
                self.io_conn.send(("gui_input_response", input_id, text))
            except (OSError, BrokenPipeError, EOFError):
                pass

    def poll_messages(self) -> list[dict]:
        """Non-blocking drain of both pipes → list of normalized protocol dicts."""
        out: list[dict] = []
        for conn in (self.cmd_conn, self.io_conn):
            if not conn:
                continue
            try:
                while conn.poll(0):
                    out.append(self._normalize(conn.recv()))
            except (EOFError, OSError, BrokenPipeError):
                pass
        if not self.alive:
            out.append({"type": "run.end", "payload": {}})
        return [m for m in out if m]

    def _normalize(self, msg) -> dict | None:
        kind, *rest = msg
        if kind == "line":
            fname, lineno = rest
            return {"type": "py.line", "payload": {"file": self._to_rel(fname), "line": lineno}}
        if kind == "stack":
            stack = rest[0] if rest else []
            frames = [
                {"file": self._to_rel(f), "line": ln, "name": nm}
                for (f, ln, nm) in stack
            ]
            return {"type": "py.stack", "payload": {"frames": frames}}
        if kind == "variables":
            data = rest[0] if rest else {"locals": {}, "globals": {}}
            return {"type": "py.vars", "payload": data}
        if kind == "stdout":
            return {"type": "stdout", "payload": {"text": rest[0]}}
        if kind == "stderr":
            return {"type": "stderr", "payload": {"text": rest[0]}}
        if kind == "eval_result":
            expr, val, ok = rest
            return {"type": "py.eval", "payload": {"expr": expr, "value": val, "ok": bool(ok)}}
        if kind in ("gui_input_request_with_prompt", "gui_input_request"):
            input_id = rest[0]
            prompt = rest[1] if len(rest) > 1 else ""
            return {"type": "input.request", "payload": {"id": input_id, "prompt": prompt}}
        if kind == "finished":
            return {"type": "run.end", "payload": {}}
        return None

    def stop(self) -> None:
        if self.proc and self.proc.is_alive():
            try:
                self.proc.terminate()
                self.proc.join(timeout=0.5)
            except Exception:  # noqa: BLE001
                pass
        for conn in (self.cmd_conn, self.io_conn):
            try:
                if conn:
                    conn.close()
            except Exception:  # noqa: BLE001
                pass
        self.cmd_conn = self.io_conn = self.proc = None
