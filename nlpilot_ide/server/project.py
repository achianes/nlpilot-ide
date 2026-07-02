"""Project file access, confined to a single root directory.

The IDE opens one folder (the "project root"). All file/tree operations are
resolved against it and rejected if they escape it (path-traversal guard).
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

# Directories never shown in the tree.
_IGNORE = {
    ".git", "__pycache__", "node_modules", ".venv", "venv", "dist",
    ".nlpilot_cache", ".nlpilot_templates", ".mypy_cache", ".pytest_cache",
}
# Extensions the editor opens as text.
_TEXT_EXT = {
    ".nlt", ".py", ".json", ".md", ".txt", ".toml", ".yaml", ".yml",
    ".ini", ".cfg", ".ts", ".tsx", ".js", ".jsx", ".css", ".html",
}


@dataclass
class Node:
    name: str
    path: str  # relative to root, POSIX-style
    is_dir: bool
    children: list["Node"] | None = None

    def to_dict(self) -> dict:
        d = {"name": self.name, "path": self.path, "isDir": self.is_dir}
        if self.children is not None:
            d["children"] = [c.to_dict() for c in self.children]
        return d


class ProjectError(Exception):
    pass


class Project:
    def __init__(self, root: str | os.PathLike):
        self.root = Path(root).resolve()
        if not self.root.is_dir():
            raise ProjectError(f"not a directory: {self.root}")

    def set_root(self, root: str | os.PathLike) -> None:
        p = Path(root).resolve()
        if not p.is_dir():
            raise ProjectError(f"not a directory: {p}")
        self.root = p

    def _resolve(self, rel: str) -> Path:
        """Resolve a client-supplied relative path inside the root, or raise."""
        rel = (rel or "").strip().lstrip("/")
        target = (self.root / rel).resolve()
        try:
            target.relative_to(self.root)
        except ValueError:
            raise ProjectError(f"path escapes project root: {rel}")
        return target

    def tree(self, max_depth: int = 8) -> Node:
        return self._walk(self.root, "", max_depth)

    def _walk(self, path: Path, rel: str, depth: int) -> Node:
        node = Node(name=path.name or str(path), path=rel, is_dir=True, children=[])
        if depth <= 0:
            return node
        try:
            entries = sorted(
                path.iterdir(),
                key=lambda p: (not p.is_dir(), p.name.lower()),
            )
        except OSError:
            return node
        for entry in entries:
            if entry.name in _IGNORE or entry.name.startswith("."):
                continue
            child_rel = f"{rel}/{entry.name}" if rel else entry.name
            if entry.is_dir():
                node.children.append(self._walk(entry, child_rel, depth - 1))
            elif entry.suffix.lower() in _TEXT_EXT:
                node.children.append(
                    Node(name=entry.name, path=child_rel, is_dir=False)
                )
        return node

    def read(self, rel: str) -> str:
        p = self._resolve(rel)
        if not p.is_file():
            raise ProjectError(f"not a file: {rel}")
        if p.stat().st_size > 5_000_000:
            raise ProjectError("file too large (>5MB)")
        return p.read_text(encoding="utf-8", errors="replace")

    def write(self, rel: str, content: str) -> None:
        p = self._resolve(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8", newline="")
