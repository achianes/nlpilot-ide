import { isDirty, useStore, type OpenFile } from "../state/store";

function base(path: string) {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Close one tab; if it has unsaved edits ask first: save / discard / cancel.
 *  Returns false if the user cancelled. */
async function confirmAndClose(f: OpenFile): Promise<boolean> {
  const { save, closeFile } = useStore.getState();
  if (isDirty(f)) {
    if (window.confirm(`Save changes to ${base(f.path)} before closing?`)) {
      await save(f.path);
    } else if (!window.confirm(`Close ${base(f.path)} WITHOUT saving?`)) {
      return false; // cancelled — keep the tab open
    }
  }
  closeFile(f.path);
  return true;
}

export function Tabs() {
  const open = useStore((s) => s.open);
  const active = useStore((s) => s.active);
  const setActive = useStore((s) => s.setActive);

  async function closeAll() {
    // snapshot: closing mutates the list
    for (const f of [...useStore.getState().open]) {
      const ok = await confirmAndClose(f);
      if (!ok) return; // user cancelled — stop closing the rest
    }
  }

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
          <span
            className="tab-close"
            onClick={(e) => { e.stopPropagation(); confirmAndClose(f); }}
          >
            {isDirty(f) ? "●" : "×"}
          </span>
        </div>
      ))}
      {open.length > 1 && (
        <button className="tabs-closeall" title="Close all tabs" onClick={closeAll}>
          ×all
        </button>
      )}
    </div>
  );
}
