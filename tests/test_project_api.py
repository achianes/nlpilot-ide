"""Phase 1: project file API — tree, read, write, traversal guard."""

import pytest
from fastapi.testclient import TestClient

from nlpilot_ide.server.app import create_app
from nlpilot_ide.server.project import Project, ProjectError


def _client(tmp_path):
    (tmp_path / "sub").mkdir()
    (tmp_path / "hello.nlt").write_text("@web\nGo to example.com\n", encoding="utf-8")
    (tmp_path / "sub" / "a.py").write_text("print(1)\n", encoding="utf-8")
    (tmp_path / "node_modules").mkdir()
    (tmp_path / "node_modules" / "junk.js").write_text("x", encoding="utf-8")
    return TestClient(create_app(root=tmp_path))


def test_tree_lists_and_ignores(tmp_path):
    c = _client(tmp_path)
    tree = c.get("/api/tree").json()
    names = {n["name"] for n in tree["children"]}
    assert "hello.nlt" in names
    assert "sub" in names
    assert "node_modules" not in names  # ignored


def test_read_and_write_roundtrip(tmp_path):
    c = _client(tmp_path)
    got = c.get("/api/file", params={"path": "hello.nlt"}).json()
    assert "Go to example.com" in got["content"]

    r = c.put("/api/file", json={"path": "hello.nlt", "content": "@bash\nls\n"})
    assert r.status_code == 200
    assert c.get("/api/file", params={"path": "hello.nlt"}).json()["content"] == "@bash\nls\n"


def test_traversal_blocked(tmp_path):
    c = _client(tmp_path)
    r = c.get("/api/file", params={"path": "../../etc/passwd"})
    assert r.status_code == 400


def test_project_resolve_guard(tmp_path):
    p = Project(tmp_path)
    with pytest.raises(ProjectError):
        p.read("../outside.txt")
