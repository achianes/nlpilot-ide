import { isDirty, useStore } from "../state/store";

function base(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function Tabs() {
  const open = useStore((s) => s.open);
  const active = useStore((s) => s.active);
  const setActive = useStore((s) => s.setActive);
  const closeFile = useStore((s) => s.closeFile);

  return (
    <div className="tabs">
      {open.map((f) => (
        <div
          key={f.path}
          className={`tab ${active === f.path ? "active" : ""}`}
          onClick={() => setActive(f.path)}
          title={f.path}
        >
          <span className="tab-name">{base(f.path)}</span>
          <span className="tab-close" onClick={(e) => { e.stopPropagation(); closeFile(f.path); }}>
            {isDirty(f) ? "●" : "×"}
          </span>
        </div>
      ))}
    </div>
  );
}
