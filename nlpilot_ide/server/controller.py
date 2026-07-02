"""DebugController: one per WS connection. Routes client commands to the active
engine (Python line-debug OR nlpilot block/generated-code debug) and normalizes
paths between the engine (absolute) and the frontend (project-relative).

Only one session is active at a time. Step/continue/stop/eval route to whichever
session is running; breakpoint commands are engine-specific (Python = line,
nlpilot = block index).
"""

from __future__ import annotations

import os
from pathlib import Path

from .engines.nlpilot_engine import NlpilotDebugSession, generate as nlt_generate
from .engines.python_engine import PythonDebugSession
from .project import Project
from .ws_protocol import Cmd, Evt, Message

# Commands routed to the active session (either engine).
_FLOW_CMDS = {Cmd.CONTINUE, Cmd.STEP_INTO, Cmd.STEP_OVER, Cmd.STEP_OUT, Cmd.EVAL}


class DebugController:
    def __init__(self, project: Project):
        self.project = project
        self.session: PythonDebugSession | None = None
        self.nlt: NlpilotDebugSession | None = None

    # --- path helpers ---
    def _abs(self, rel: str) -> str:
        return str((self.project.root / rel).resolve())

    def _to_rel(self, abs_path: str):
        try:
            return Path(abs_path).resolve().relative_to(self.project.root).as_posix()
        except (ValueError, OSError):
            return abs_path

    # --- command handling ---
    def handle(self, msg: Message) -> Message | None:
        t, p = msg.type, msg.payload

        if t == Cmd.PING:
            return Message(Evt.PONG, {"echo": p})
        if t == Cmd.RUN:
            return self._run_python(p)
        if t == Cmd.NLT_RUN:
            return self._run_nlt(p)
        if t == Cmd.STOP:
            self._stop_all()
            return Message(Evt.RUN_END, {})

        # engine-specific breakpoints
        if t == Cmd.SET_BREAKPOINT and self.session:
            self.session.add_breakpoint(int(p["line"]))
            return None
        if t == Cmd.CLEAR_BREAKPOINT and self.session:
            self.session.remove_breakpoint(int(p["line"]))
            return None
        if t == Cmd.NLT_SET_BREAKPOINT and self.nlt:
            self.nlt.add_breakpoint(int(p["index"]))
            return None
        if t == Cmd.NLT_CLEAR_BREAKPOINT and self.nlt:
            self.nlt.remove_breakpoint(int(p["index"]))
            return None
        if t == Cmd.INPUT_RESPONSE and self.session:
            self.session.input_response(p.get("id", ""), p.get("text", ""))
            return None

        if t in _FLOW_CMDS:
            active = self.nlt or self.session
            if active:
                cmd, arg = _flow_arg(t, p)
                active.send(cmd, arg)
            return None

        if t in (Cmd.SET_BREAKPOINT, Cmd.CLEAR_BREAKPOINT, Cmd.NLT_SET_BREAKPOINT,
                 Cmd.NLT_CLEAR_BREAKPOINT, Cmd.INPUT_RESPONSE):
            return None  # no active session; ignore silently

        return Message(Evt.ERROR, {"reason": f"unknown command: {t}"})

    def _run_python(self, p: dict) -> Message:
        self._stop_all()
        rel = p.get("path", "")
        abs_path = self._abs(rel)
        if not os.path.isfile(abs_path):
            return Message(Evt.ERROR, {"reason": f"not a file: {rel}"})
        self.session = PythonDebugSession(
            abs_script_path=abs_path,
            breakpoints=[int(x) for x in p.get("breakpoints", [])],
            script_args=[str(x) for x in p.get("args", [])],
            to_rel=self._to_rel,
        )
        self.session.start()
        return Message(Evt.RUN_START, {"path": rel})

    def _run_nlt(self, p: dict) -> Message:
        self._stop_all()
        rel = p.get("path", "")
        abs_path = self._abs(rel)
        if not os.path.isfile(abs_path):
            return Message(Evt.ERROR, {"reason": f"not a file: {rel}"})
        with open(abs_path, "r", encoding="utf-8") as f:
            source = f.read()
        self.nlt = NlpilotDebugSession(
            source=source,
            base_dir=os.path.dirname(abs_path),
            breakpoints={int(x) for x in p.get("breakpoints", [])},
        )
        self.nlt.start()
        return Message(Evt.NLT_RUN_START, {"path": rel})

    def generate_blocks(self, rel: str) -> list[dict]:
        """Compile-only. Slow (LLM) — call via asyncio.to_thread from the handler."""
        abs_path = self._abs(rel)
        with open(abs_path, "r", encoding="utf-8") as f:
            source = f.read()
        return nlt_generate(source, os.path.dirname(abs_path))

    def poll(self) -> list[dict]:
        out: list[dict] = []
        if self.session:
            msgs = self.session.poll_messages()
            out.extend(msgs)
            if any(m.get("type") == Evt.RUN_END for m in msgs):
                self.session = None
        if self.nlt:
            msgs = self.nlt.poll_messages()
            out.extend(msgs)
            if any(m.get("type") == Evt.NLT_RUN_END for m in msgs):
                self.nlt = None
        return out

    def _stop_all(self) -> None:
        if self.session:
            self.session.stop()
            self.session = None
        if self.nlt:
            self.nlt.stop()
            self.nlt = None

    # legacy alias used by the WS handler on disconnect
    _stop = _stop_all


def _flow_arg(t: str, p: dict | None = None):
    """Map a flow command to the (engine_cmd, arg) pair both engines understand."""
    if t == Cmd.CONTINUE:
        return "continue", None
    if t == Cmd.STEP_INTO:
        return "step", None       # python engine cmd; nlt tracer also accepts 'stepInto'
    if t == Cmd.STEP_OVER:
        return "next", None
    if t == Cmd.STEP_OUT:
        return "return", None
    if t == Cmd.EVAL:
        return "eval", (p or {}).get("expr", "")
    return t, None
