"""Phase 4: GenTracer line-steps generated <nlpilot> code correctly.

Driven synchronously: get_command pops a prefilled script of commands (default
'continue' when exhausted); emit records pauses. No Ollama, no subprocess.
"""

import sys
from collections import deque

from nlpilot_ide.server.engines.nlpilot_engine import GEN_FILE, GenTracer


def _run(src, commands, breakpoints={0}):
    emitted = []
    cmds = deque(commands)

    def emit(evt, payload):
        if evt == "nlt_line":
            emitted.append(payload["genLine"])

    def get_command():
        return (cmds.popleft() if cmds else "continue", None)

    tracer = GenTracer(emit, get_command, current_index=lambda: 0, breakpoints=set(breakpoints))
    tracer.block_started()
    code = compile(src, GEN_FILE, "exec")
    ns = {}
    sys.settrace(tracer.trace)
    try:
        exec(code, ns, ns)
    finally:
        sys.settrace(None)
    return emitted


def test_step_into_every_line():
    src = "a = 1\nb = 2\nc = a + b\n"
    lines = _run(src, ["stepInto", "stepInto", "stepInto"])
    assert lines == [1, 2, 3]


def test_step_over_skips_function_body():
    src = "def f(x):\n    return x + 1\ny = f(5)\nz = y * 2\n"
    # pause at line 1 (def) -> into; pause at line 3 (call) -> over; pause line 4
    lines = _run(src, ["stepInto", "stepOver"])
    assert lines == [1, 3, 4]


def test_step_into_enters_function_body():
    src = "def f(x):\n    return x + 1\ny = f(5)\nz = y * 2\n"
    lines = _run(src, ["stepInto", "stepInto", "stepInto", "stepInto"])
    assert lines == [1, 3, 2, 4]


def test_continue_runs_to_end():
    src = "a = 1\nb = 2\nc = 3\n"
    # break at first line then continue: only the first line pauses
    lines = _run(src, ["continue"])
    assert lines == [1]


def test_no_breakpoint_no_pause():
    src = "a = 1\nb = 2\n"
    lines = _run(src, [], breakpoints=set())  # not a breakpointed block
    assert lines == []


def test_stop_aborts():
    from nlpilot_ide.server.engines.nlpilot_engine import _StopDebug

    src = "a = 1\nb = 2\nc = 3\n"
    raised = False
    try:
        _run(src, ["stop"])
    except _StopDebug:
        raised = True
    assert raised
