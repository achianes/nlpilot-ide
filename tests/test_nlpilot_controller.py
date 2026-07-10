"""Phase 4: controller wiring for nlpilot generate + command routing.

The real nlpilot debug run needs Ollama + live backends, so it is not exercised
here (the tracer has its own unit tests). This covers the compile-only generate
path (LLM mocked) and command routing."""

from fastapi.testclient import TestClient

from nlpilot_ide.server import controller as controller_mod
from nlpilot_ide.server.app import create_app
from nlpilot_ide.server.ws_protocol import Cmd, Evt


def test_generate_over_ws(tmp_path, monkeypatch):
    (tmp_path / "flow.nlt").write_text(
        "@bash\nlist files\n@http\nget json\n", encoding="utf-8"
    )

    def fake_generate(source, base_dir):
        # emulate nlpilot.generate output shape without calling Ollama
        return [
            {"index": 0, "backend": "bash", "code": "env.log('ls')",
             "fromCache": False, "lineStart": 2, "lineEnd": 2},
            {"index": 1, "backend": "http", "code": "env.log('get')",
             "fromCache": True, "lineStart": 4, "lineEnd": 4},
        ]

    monkeypatch.setattr(controller_mod, "nlt_generate", fake_generate)

    client = TestClient(create_app(root=tmp_path))
    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == Evt.HELLO
        ws.send_json({"type": Cmd.NLT_GENERATE, "payload": {"path": "flow.nlt"}})
        m = ws.receive_json()
        assert m["type"] == Evt.NLT_GENERATED
        blocks = m["payload"]["blocks"]
        assert len(blocks) == 2
        assert blocks[0]["backend"] == "bash"
        assert blocks[0]["lineStart"] == 2
        assert blocks[1]["fromCache"] is True


def test_generate_missing_file_errors(tmp_path):
    client = TestClient(create_app(root=tmp_path))
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()  # hello
        ws.send_json({"type": Cmd.NLT_GENERATE, "payload": {"path": "nope.nlt"}})
        m = ws.receive_json()
        assert m["type"] == Evt.ERROR
        assert "generate failed" in m["payload"]["reason"]


def test_flow_command_without_session_is_ignored(tmp_path):
    client = TestClient(create_app(root=tmp_path))
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()  # hello
        # continue with no active session → no reply, no crash; ping still works
        ws.send_json({"type": Cmd.CONTINUE, "payload": {}})
        ws.send_json({"type": Cmd.PING, "payload": {"n": 1}})
        assert ws.receive_json()["type"] == Evt.PONG
