"""Phase 2: drive the Python debug engine end-to-end over the WebSocket."""

import textwrap

from fastapi.testclient import TestClient

from nlpilot_ide.server.app import create_app
from nlpilot_ide.server.ws_protocol import Cmd, Evt


SCRIPT = textwrap.dedent(
    """\
    x = 1
    print("before")
    y = 2
    print("after")
    """
)


def _collect_until(ws, end_type, limit=200):
    msgs = []
    for _ in range(limit):
        m = ws.receive_json()
        msgs.append(m)
        if m["type"] == end_type:
            return msgs
    raise AssertionError(f"never saw {end_type}; got {[m['type'] for m in msgs]}")


def test_run_hits_breakpoint_then_finishes(tmp_path):
    (tmp_path / "prog.py").write_text(SCRIPT, encoding="utf-8")
    client = TestClient(create_app(root=tmp_path))

    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == Evt.HELLO

        # Run with a breakpoint on line 3 (`y = 2`).
        ws.send_json({"type": Cmd.RUN, "payload": {"path": "prog.py", "breakpoints": [3]}})
        assert ws.receive_json()["type"] == Evt.RUN_START

        # Collect the pause batch: line + stack + vars + the "before" stdout all
        # arrive around the breakpoint (order across the two pipes isn't fixed).
        msgs = []
        seen_line = seen_vars = seen_out = False
        for _ in range(200):
            m = ws.receive_json()
            msgs.append(m)
            if m["type"] == Evt.PY_LINE:
                seen_line = True
            elif m["type"] == Evt.PY_VARS:
                seen_vars = True
            elif m["type"] == Evt.STDOUT and "before" in m["payload"]["text"]:
                seen_out = True
            if seen_line and seen_vars and seen_out:
                break

        line_evt = next(m for m in msgs if m["type"] == Evt.PY_LINE)
        assert line_evt["payload"]["line"] == 3
        assert line_evt["payload"]["file"] == "prog.py"

        # Variables at the pause include x (already assigned), not y yet.
        vars_evt = next(m for m in msgs if m["type"] == Evt.PY_VARS)
        assert vars_evt["payload"]["locals"].get("x") == "1"
        assert seen_out

        # Continue to completion.
        ws.send_json({"type": Cmd.CONTINUE, "payload": {}})
        tail = _collect_until(ws, Evt.RUN_END)
        outs2 = [m["payload"]["text"] for m in tail if m["type"] == Evt.STDOUT]
        assert any("after" in t for t in outs2)


def test_step_over_advances_line(tmp_path):
    (tmp_path / "prog.py").write_text(SCRIPT, encoding="utf-8")
    client = TestClient(create_app(root=tmp_path))

    with client.websocket_connect("/ws") as ws:
        ws.receive_json()  # hello
        ws.send_json({"type": Cmd.RUN, "payload": {"path": "prog.py", "breakpoints": [1]}})
        assert ws.receive_json()["type"] == Evt.RUN_START

        # pause at line 1
        for _ in range(200):
            m = ws.receive_json()
            if m["type"] == Evt.PY_LINE:
                assert m["payload"]["line"] == 1
                break

        # step over → next line
        ws.send_json({"type": Cmd.STEP_OVER, "payload": {}})
        for _ in range(200):
            m = ws.receive_json()
            if m["type"] == Evt.PY_LINE:
                assert m["payload"]["line"] == 2
                break

        ws.send_json({"type": Cmd.STOP, "payload": {}})
