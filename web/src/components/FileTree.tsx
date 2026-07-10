import { useState } from "react";
import type { TreeNode } from "../api";
import { useStore } from "../state/store";

function Entry({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(depth < 1);
  const openFile = useStore((s) => s.openFile);
  const active = useStore((s) => s.active);
  const pad = { paddingLeft: 6 + depth * 12 };

  if (node.isDir) {
    return (
      <div>
        <div className="tree-row dir" style={pad} onClick={() => setOpen(!open)}>
          <span className="chev">{open ? "▾" : "▸"}</span>
          {node.name || "/"}
        </div>
        {open &&
          node.children?.map((c) => (
            <Entry key={c.path} node={c} depth={depth + 1} />
          ))}
      </div>
    );
  }
  return (
    <div
      className={`tree-row file ${active === node.path ? "active" : ""}`}
      style={pad}
      onClick={() => openFile(node.path)}
      title={node.path}
    >
      {node.name}
    </div>
  );
}

export function FileTree() {
  const tree = useStore((s) => s.tree);
  if (!tree) return <div className="tree-empty">loading…</div>;
  return (
    <div className="tree">
      {tree.children?.map((c) => (
        <Entry key={c.path} node={c} depth={0} />
      ))}
    </div>
  );
}
