import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly";
import { defineNltBlocks, TOOLBOX, workspaceToNlt } from "../blocks/nltBlocks";
import { useStore } from "../state/store";

/** Scratch-style visual composer: drag blocks, get a .nlt script. The workspace
 *  is persisted per file (localStorage); Apply writes the generated text into
 *  the active .nlt buffer (save with Ctrl+S afterwards). */
export function BlocksView() {
  const active = useStore((s) => s.active);
  const edit = useStore((s) => s.edit);
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const [preview, setPreview] = useState("");

  const storageKey = `blocks:${active ?? "_scratch"}`;

  useEffect(() => {
    if (!hostRef.current) return;
    defineNltBlocks();
    const ws = Blockly.inject(hostRef.current, {
      toolbox: TOOLBOX as any,
      renderer: "zelos",           // the Scratch-like renderer
      theme: Blockly.Themes.Zelos,
      grid: { spacing: 24, length: 2, colour: "#333", snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.9 },
      trashcan: true,
    });
    wsRef.current = ws;

    // restore the saved workspace for this file
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) Blockly.serialization.workspaces.load(JSON.parse(saved), ws);
    } catch { /* corrupt state — start empty */ }

    const onChange = () => {
      try {
        localStorage.setItem(
          storageKey, JSON.stringify(Blockly.serialization.workspaces.save(ws)));
        setPreview(workspaceToNlt(ws));
      } catch { /* ignore */ }
    };
    ws.addChangeListener(onChange);
    setPreview(workspaceToNlt(ws));

    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(hostRef.current);
    return () => { ro.disconnect(); ws.dispose(); wsRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const canApply = !!active && active.endsWith(".nlt");

  function apply() {
    if (!wsRef.current || !active) return;
    edit(active, workspaceToNlt(wsRef.current));
  }

  return (
    <div className="blocks-view">
      <div className="blocks-bar">
        <span className="blocks-title">VISUAL COMPOSER</span>
        <button onClick={apply} disabled={!canApply}
          title={canApply ? `Replace the content of ${active}` : "Open a .nlt tab first"}>
          ⇒ Apply to {canApply ? active!.split("/").pop() : ".nlt"}
        </button>
        <span className="blocks-hint">drag blocks · stacks top-to-bottom · Ctrl+S after Apply</span>
      </div>
      <div className="blocks-main">
        <div className="blocks-host" ref={hostRef} />
        <pre className="blocks-preview">{preview || "# drag blocks to build your .nlt"}</pre>
      </div>
    </div>
  );
}
