"""nlpilot debug engine.

Two capabilities:

1. `generate(source)` — compile every block to Python WITHOUT running it, via
   nlpilot's `Runner.generate_text()` (no backend setup). LLM-only; may hit
   Ollama. Runs in the server thread pool.

2. `NlpilotDebugSession` — actually runs the `.nlt` in a subprocess with a
   `DebugHook` + a `GenTracer`. The tracer uses `sys.settrace` on each block's
   generated code (filename `<nlpilot>`) to line-step INSIDE the generated Python,
   reporting (block index, generated-line, locals) at every pause. The IDE maps
   the block index back to the source `.nlt` block for the dual-view highlight.

The tracer is written to be unit-testable in isolation (see tests): it takes an
`emit` callback and a blocking `get_command` provider, independent of pipes.
"""

from __future__ import annotations

import os
import queue
import sys
import threading
import time
import traceback
from multiprocessing import Pipe, Process

GEN_FILE = "<nlpilot>"  # filename nlpilot compiles generated code under


# ---------------------------------------------------------------------------
# tracer: line-steps inside generated code (testable, pipe-independent)
# ---------------------------------------------------------------------------
class GenTracer:
    """Line-stepper for generated `<nlpilot>` code.

    modes: 'run' (only stop on a breakpointed block's first line), 'step' (stop
    every line), 'next' (stop at the same frame — step over calls), 'return'
    (run until the current frame returns). Commands drive transitions.
    """

    def __init__(self, emit, get_command, current_index, breakpoints,
                 line_breakpoints=None):
        self.emit = emit                    # emit(event_type, payload_dict)
        self.get_command = get_command      # blocking () -> (cmd, arg)
        self.current_index = current_index  # callable () -> active block index
        self.breakpoints = breakpoints      # set[int] of block indices to break on
        # set[(block_index, gen_line)] — breakpoints on specific generated lines
        self.line_breakpoints = line_breakpoints if line_breakpoints is not None else set()
        self.mode = "run"
        self.stopframe = None
        self.quitting = False
        self._block_first_line_seen = False
        self.on_pause = None                # optional: called after each pause (live view)

    def block_started(self) -> None:
        """Called at each block's on_before_exec: decide initial mode."""
        self._block_first_line_seen = False
        if self.current_index() in self.breakpoints:
            self.mode = "step"  # pause at the block's first executable line
        # else keep whatever mode continued from the previous block ('run' or step)

    def trace(self, frame, event, arg):
        if self.quitting:
            raise _StopDebug()
        if frame.f_code.co_filename != GEN_FILE:
            return None  # never descend into nlpilot/backend internals
        if event == "line":
            if self._should_stop(frame):
                self._pause(frame)
        elif event == "return" and self.mode == "return" and frame is self.stopframe:
            self.mode = "step"  # stop at the caller's next line
        return self.trace

    def _should_stop(self, frame) -> bool:
        # a breakpoint on this exact generated line stops in ANY mode
        if (self.current_index(), frame.f_lineno) in self.line_breakpoints:
            return True
        if self.mode == "step":
            return True
        if self.mode == "next":
            return frame is self.stopframe
        return False  # 'run' / 'return'

    def _pause(self, frame) -> None:
        locals_repr = {
            str(k): _safe_repr(v)
            for k, v in frame.f_locals.items()
            if not str(k).startswith("__") and k not in ("env", "args")
        }
        self.emit("nlt_line", {
            "index": self.current_index(),
            "genLine": frame.f_lineno,
            "locals": locals_repr,
        })
        if self.on_pause:
            try:
                self.on_pause()   # live view of the backend (browser/phone/…)
            except Exception:  # noqa: BLE001
                pass
        while True:
            cmd, arg = self.get_command()
            if cmd == "stepInto" or cmd == "step":
                self.mode = "step"
                return
            if cmd == "stepOver" or cmd == "next":
                self.mode = "next"
                self.stopframe = frame
                return
            if cmd == "stepOut" or cmd == "return":
                self.mode = "return"
                self.stopframe = frame
                return
            if cmd == "continue":
                self.mode = "run"
                return
            if cmd == "stop":
                self.quitting = True
                raise _StopDebug()
            if cmd == "eval":
                try:
                    val = eval(arg, frame.f_globals, frame.f_locals)  # noqa: S307
                    self.emit("nlt_eval", {"expr": arg, "value": _safe_repr(val), "ok": True})
                except Exception as e:  # noqa: BLE001
                    self.emit("nlt_eval", {"expr": arg, "value": str(e), "ok": False})
            # unknown command: keep waiting


class _StopDebug(BaseException):
    """Raised inside the tracer to abort the debugged run. Subclasses BaseException
    so nlpilot's executor (which catches Exception to self-correct) does not swallow
    it and retry."""


def _safe_repr(v) -> str:
    try:
        s = repr(v)
        return s[:200] + "..." if len(s) > 200 else s
    except Exception as e:  # noqa: BLE001
        return f"<repr error: {e}>"


# ---------------------------------------------------------------------------
# hook: bridges nlpilot phase events + the tracer to the parent over a pipe
# ---------------------------------------------------------------------------
def _make_hook(send, tracer):
    from nlpilot.debug import DebugHook  # imported in the child process

    class IDEHook(DebugHook):
        def __init__(self):
            self._index = 0
            self._live_env = None

        def on_run_start(self, blocks):
            send(("nlt_run_start", {"blocks": len(blocks)}))

        def on_block_enter(self, index, block):
            self._index = index
            send(("nlt_block_enter", {
                "index": index,
                "backend": block.backend,
                "lineStart": block.line_start,
                "lineEnd": block.line_end,
                "lineMap": list(getattr(block, "line_map", ()) or ()),
            }))

        def on_compile(self, index, code, from_cache):
            send(("nlt_compile", {"index": index, "code": code, "fromCache": from_cache}))

        def on_before_exec(self, index, code, namespace):
            self._index = index
            # forward visual output to the IDE panel: frozen @capture frames and
            # every env.screenshot(...) on any backend
            env = namespace.get("env")
            if env is not None and not getattr(env, "_ide_frame_hooked", False):
                import base64
                import os as _os

                def _send_frame(jpg_bytes):
                    send(("nlt_frame",
                          {"jpeg": base64.b64encode(jpg_bytes).decode("ascii")}))

                def _send_shot(filename, img_bytes):
                    ext = _os.path.splitext(filename)[1].lower().lstrip(".") or "png"
                    mime = "jpeg" if ext in ("jpg", "jpeg") else ext
                    send(("nlt_screenshot", {
                        "name": _os.path.basename(filename),
                        "mime": mime,
                        "b64": base64.b64encode(img_bytes).decode("ascii"),
                    }))

                try:
                    if hasattr(env, "on_frame"):
                        env.on_frame = _send_frame
                    env.on_screenshot = _send_shot
                    env._ide_frame_hooked = True
                except Exception:  # noqa: BLE001
                    pass

            # live embedded view: grab the backend's screen at every pause/step
            self._live_env = env

            def _live():
                e = self._live_env
                png = e.grab_png() if e is not None and hasattr(e, "grab_png") else None
                if png:
                    import base64 as _b64
                    send(("nlt_screenshot", {
                        "name": f"{getattr(e, 'name', 'backend')} (live)",
                        "mime": "png",
                        "b64": _b64.b64encode(png).decode("ascii"),
                    }))

            tracer.on_pause = _live
            tracer.block_started()
            # settrace installs the global trace for the thread; the exec() that
            # runs immediately after creates the <nlpilot> frame, which the tracer
            # then follows line by line.
            sys.settrace(tracer.trace)

        def on_exception(self, index, error, traceback_str):
            sys.settrace(None)
            send(("nlt_exception", {"index": index, "error": error, "traceback": traceback_str}))

        def on_correction(self, index, attempt, new_code):
            send(("nlt_correction", {"index": index, "attempt": attempt, "code": new_code}))

        def on_assertions(self, index, failures):
            send(("nlt_assertions", {"index": index, "failures": failures}))

        def on_block_exit(self, index, result):
            sys.settrace(None)
            send(("nlt_block_exit", {
                "index": index, "ok": result.ok, "attempts": result.attempts,
                "error": result.error,
            }))

        def on_run_end(self, report):
            send(("nlt_run_end", {"ok": report.ok}))

        def current_index(self):
            return self._index

    return IDEHook()


# ---------------------------------------------------------------------------
# subprocess entry
# ---------------------------------------------------------------------------
def _nlpilot_process_main(source, base_dir, cmd_conn, io_conn, breakpoints,
                          line_breakpoints=None):
    line_breakpoints = line_breakpoints if line_breakpoints is not None else set()
    # Redirect stdout/stderr onto the SAME pipe as the debug events, so console
    # output and block enter/exit arrive in true execution order (two pipes
    # would race and e.g. show a PASS line after its block's exit marker).
    class _Redir:
        def __init__(self, stream):
            self.stream = stream

        def write(self, text):
            if text:
                try:
                    cmd_conn.send((self.stream, {"text": text}))
                except (OSError, EOFError, BrokenPipeError):
                    pass

        def flush(self):
            pass

    cmd_queue: "queue.Queue" = queue.Queue()

    def reader():
        while True:
            try:
                if not cmd_conn.poll(0.05):
                    continue
                msg = cmd_conn.recv()
            except (EOFError, OSError, BrokenPipeError):
                break
            if not msg:
                continue
            cmd = msg[0]
            arg = msg[1] if len(msg) > 1 else None
            if cmd == "add_block_breakpoint":
                breakpoints.add(int(arg))
            elif cmd == "remove_block_breakpoint":
                breakpoints.discard(int(arg))
            elif cmd == "add_line_breakpoint":
                line_breakpoints.add((int(arg[0]), int(arg[1])))
            elif cmd == "remove_line_breakpoint":
                line_breakpoints.discard((int(arg[0]), int(arg[1])))
            else:
                cmd_queue.put((cmd, arg))

    def emit(event_type, payload):
        try:
            cmd_conn.send((event_type, payload))
        except (OSError, EOFError, BrokenPipeError):
            pass

    def send(msg):
        try:
            cmd_conn.send(msg)
        except (OSError, EOFError, BrokenPipeError):
            pass

    def get_command():
        return cmd_queue.get()

    tracer = GenTracer(emit, get_command, current_index=lambda: hook.current_index(),
                       breakpoints=breakpoints, line_breakpoints=line_breakpoints)

    threading.Thread(target=reader, daemon=True).start()

    _old = sys.stdout, sys.stderr
    sys.stdout, sys.stderr = _Redir("stdout"), _Redir("stderr")
    old_cwd = os.getcwd()
    try:
        if base_dir and os.path.isdir(base_dir):
            os.chdir(base_dir)
        from nlpilot import Config, Runner

        hook = _make_hook(send, tracer)
        # tracer.current_index closure resolves hook after creation:
        tracer.current_index = lambda: hook.current_index()
        runner = Runner(Config.load())
        runner.run_text(source, base_dir=base_dir, hook=hook)
    except _StopDebug:
        pass
    except Exception:  # noqa: BLE001
        send(("stderr", {"text": traceback.format_exc()}))
    finally:
        sys.settrace(None)
        sys.stdout, sys.stderr = _old
        try:
            os.chdir(old_cwd)
        except Exception:  # noqa: BLE001
            pass
        time.sleep(0.1)
        send(("nlt_run_end", {"ok": False}))
        try:
            cmd_conn.close()
        except Exception:  # noqa: BLE001
            pass


# ---------------------------------------------------------------------------
# parent-side session
# ---------------------------------------------------------------------------
class NlpilotDebugSession:
    def __init__(self, source: str, base_dir: str, breakpoints: set[int] | None,
                 line_breakpoints: set | None = None):
        self.source = source
        self.base_dir = base_dir
        self._breakpoints = set(breakpoints or set())
        self._line_breakpoints = {tuple(x) for x in (line_breakpoints or set())}
        self.proc: Process | None = None
        self.cmd_conn = None
        self.io_conn = None
        self._ended = False

    def start(self) -> None:
        parent_cmd, child_cmd = Pipe()
        parent_io, child_io = Pipe()
        self.proc = Process(
            target=_nlpilot_process_main,
            args=(self.source, self.base_dir, child_cmd, child_io,
                  self._breakpoints, self._line_breakpoints),
            name="NlpilotDebug",
            daemon=True,
        )
        self.proc.start()
        child_cmd.close()
        child_io.close()
        self.cmd_conn = parent_cmd
        self.io_conn = parent_io

    @property
    def alive(self) -> bool:
        return bool(self.proc and self.proc.is_alive())

    def send(self, cmd: str, arg=None) -> None:
        if self.cmd_conn:
            try:
                self.cmd_conn.send((cmd, arg))
            except (OSError, BrokenPipeError, EOFError):
                pass

    def add_breakpoint(self, index: int) -> None:
        self.send("add_block_breakpoint", int(index))

    def remove_breakpoint(self, index: int) -> None:
        self.send("remove_block_breakpoint", int(index))

    def add_line_breakpoint(self, index: int, line: int) -> None:
        self.send("add_line_breakpoint", (int(index), int(line)))

    def remove_line_breakpoint(self, index: int, line: int) -> None:
        self.send("remove_line_breakpoint", (int(index), int(line)))

    def poll_messages(self) -> list[dict]:
        out: list[dict] = []
        for conn in (self.cmd_conn, self.io_conn):
            if not conn:
                continue
            try:
                while conn.poll(0):
                    out.append(self._normalize(conn.recv()))
            except (EOFError, OSError, BrokenPipeError):
                pass
        if not self.alive and not self._ended:
            self._ended = True
            out.append({"type": "nlt.runEnd", "payload": {}})
        return [m for m in out if m]

    def _normalize(self, msg) -> dict | None:
        kind, payload = msg[0], (msg[1] if len(msg) > 1 else {})
        mapping = {
            "nlt_run_start": "nlt.runStart",
            "nlt_block_enter": "nlt.blockEnter",
            "nlt_compile": "nlt.compile",
            "nlt_line": "nlt.line",
            "nlt_eval": "nlt.eval",
            "nlt_exception": "nlt.exception",
            "nlt_correction": "nlt.correction",
            "nlt_assertions": "nlt.assertions",
            "nlt_block_exit": "nlt.blockExit",
            "nlt_run_end": "nlt.runEnd",
            "nlt_frame": "nlt.frame",
            "nlt_screenshot": "nlt.screenshot",
            "stdout": "stdout",
            "stderr": "stderr",
        }
        t = mapping.get(kind)
        if not t:
            return None
        if t == "nlt.runEnd":
            self._ended = True
        return {"type": t, "payload": payload}

    def stop(self) -> None:
        self.send("stop")
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


# ---------------------------------------------------------------------------
# compile-only generate (runs in the server, not a subprocess)
# ---------------------------------------------------------------------------
def generate(source: str, base_dir: str) -> list[dict]:
    """Compile all blocks to Python without running. May call Ollama."""
    from nlpilot import Config, Runner

    old_cwd = os.getcwd()
    try:
        if base_dir and os.path.isdir(base_dir):
            os.chdir(base_dir)
        runner = Runner(Config.load())
        blocks = runner.generate_text(source, base_dir=base_dir)
    finally:
        try:
            os.chdir(old_cwd)
        except Exception:  # noqa: BLE001
            pass
    return [
        {
            "index": b.index,
            "backend": b.backend,
            "code": b.code,
            "fromCache": b.from_cache,
            "lineStart": b.line_start,
            "lineEnd": b.line_end,
            "lineMap": list(getattr(b, "line_map", ()) or ()),
            "raw": bool(getattr(b, "raw", False)),
            "device": getattr(b, "device", "") or "",
        }
        for b in blocks
    ]
