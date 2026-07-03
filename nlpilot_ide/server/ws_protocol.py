"""WebSocket message schema shared across the IDE.

Single source of truth for event/command names. Mirror these in
web/src/ws/protocol.ts to avoid drift.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


# ---- commands: client -> server ----
class Cmd:
    PING = "ping"
    # --- python debug (Phase 2) ---
    RUN = "run"                # {path, breakpoints:[int], args:[str]}
    STOP = "stop"
    CONTINUE = "continue"
    STEP_INTO = "stepInto"
    STEP_OVER = "stepOver"
    STEP_OUT = "stepOut"
    EVAL = "eval"              # {expr}
    SET_BREAKPOINT = "setBreakpoint"    # {path, line}
    CLEAR_BREAKPOINT = "clearBreakpoint"  # {path, line}
    INPUT_RESPONSE = "inputResponse"    # {id, text}
    # --- nlpilot debug (Phase 4) ---
    NLT_GENERATE = "nlt.generate"           # {path}
    NLT_RUN = "nlt.run"                     # {path, breakpoints:[int]}  (block indices)
    NLT_SET_BREAKPOINT = "nlt.setBreakpoint"    # {index}
    NLT_CLEAR_BREAKPOINT = "nlt.clearBreakpoint"  # {index}
    NLT_SET_LINE_BP = "nlt.setLineBreakpoint"     # {index, line}  (line within block code)
    NLT_CLEAR_LINE_BP = "nlt.clearLineBreakpoint"  # {index, line}


# ---- events: server -> client ----
class Evt:
    HELLO = "hello"
    PONG = "pong"
    ERROR = "error"
    # --- python debug (Phase 2) ---
    RUN_START = "run.start"
    RUN_END = "run.end"
    PY_LINE = "py.line"        # {file, line}  — paused here
    PY_STACK = "py.stack"      # {frames:[{file,line,name}]}
    PY_VARS = "py.vars"        # {locals:{}, globals:{}}
    PY_EVAL = "py.eval"        # {expr, value, ok}
    STDOUT = "stdout"          # {text}
    STDERR = "stderr"          # {text}
    INPUT_REQUEST = "input.request"  # {id, prompt}
    # --- nlpilot debug (Phase 4) ---
    NLT_GENERATED = "nlt.generated"    # {blocks:[{index,backend,code,fromCache,lineStart,lineEnd}]}
    NLT_RUN_START = "nlt.runStart"     # {blocks}
    NLT_BLOCK_ENTER = "nlt.blockEnter"  # {index, backend, lineStart, lineEnd}
    NLT_COMPILE = "nlt.compile"        # {index, code, fromCache}
    NLT_LINE = "nlt.line"              # {index, genLine, locals}  — paused here
    NLT_EVAL = "nlt.eval"              # {expr, value, ok}
    NLT_EXCEPTION = "nlt.exception"    # {index, error, traceback}
    NLT_CORRECTION = "nlt.correction"  # {index, attempt, code}
    NLT_ASSERTIONS = "nlt.assertions"  # {index, failures}
    NLT_BLOCK_EXIT = "nlt.blockExit"   # {index, ok, attempts, error}
    NLT_RUN_END = "nlt.runEnd"         # {}


@dataclass
class Message:
    """Envelope for every WS frame. `type` is a Cmd or Evt constant."""

    type: str
    payload: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Message":
        return cls(type=d.get("type", ""), payload=d.get("payload", {}) or {})
