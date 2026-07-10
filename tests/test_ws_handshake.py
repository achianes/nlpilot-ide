"""Phase 0: verify the WS hub says hello and answers ping with pong."""

from fastapi.testclient import TestClient

from nlpilot_ide.server.app import create_app
from nlpilot_ide.server.ws_protocol import Cmd, Evt


def test_health():
    client = TestClient(create_app())
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_hello_and_ping_pong():
    client = TestClient(create_app())
    with client.websocket_connect("/ws") as ws:
        hello = ws.receive_json()
        assert hello["type"] == Evt.HELLO
        assert hello["payload"]["version"] == "0.1.0"

        ws.send_json({"type": Cmd.PING, "payload": {"t": 42}})
        pong = ws.receive_json()
        assert pong["type"] == Evt.PONG
        assert pong["payload"]["echo"] == {"t": 42}


def test_unknown_command_errors():
    client = TestClient(create_app())
    with client.websocket_connect("/ws") as ws:
        ws.receive_json()  # hello
        ws.send_json({"type": "bogus", "payload": {}})
        err = ws.receive_json()
        assert err["type"] == Evt.ERROR
        assert "bogus" in err["payload"]["reason"]
