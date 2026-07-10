import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly";
import {
  defineNltBlocks, nltToWorkspaceJson, TOOLBOX,
  workspaceToNltWithMap, type BlockLineSpan,
} from "../blocks/nltBlocks";
import { useStore } from "../state/store";
import { genLineToSource, useDebug } from "../state/debug";

// Dark theme matching the rest of the IDE.
const DARK_THEME = Blockly.Theme.defineTheme("nlt-dark-blocks", {
  name: "nlt-dark-blocks",
  base: Blockly.Themes.Zelos,
  componentStyles: {
    workspaceBackgroundColour: "#1e1e1e",
    toolboxBackgroundColour: "#252526",
    toolboxForegroundColour: "#d4d4d4",
    flyoutBackgroundColour: "#2d2d2d",
    flyoutForegroundColour: "#d4d4d4",
    flyoutOpacity: 1,
    scrollbarColour: "#3c3c3c",
    scrollbarOpacity: 0.6,
    insertionMarkerColour: "#ffffff",
    markerColour: "#4ec9b0",
    cursorColour: "#4ec9b0",
  },
});

const CATEGORY_HINTS: Record<string, string> = {
  Backends: "B — @web, @android(serial), @capture, @redrat… switch the target",
  Actions: "A — go to, type, click, wait, screenshot, start app, unlock, save",
  Checks: "C — EXPECT assertions and one-line if/otherwise",
  Control: "K — nested if/otherwise, repeat N times, repeat until",
  LLM: "L — ask the model, ask about an image",
  "Capture / IR": "V — freeze frame, template match, use remote, press signal, channel",
  Advanced: "X — @allow imports, @workdir, literal Python, comments",
};

// "Toggle breakpoint" in every block's right-click menu (registered once).
let ctxRegistered = false;
function registerBreakpointMenu(getMap: () => BlockLineSpan[]) {
  if (ctxRegistered) return;
  ctxRegistered = true;
  Blockly.ContextMenuRegistry.registry.register({
    id: "nlt_toggle_breakpoint",
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    weight: 0,
    displayText: () => "● Toggle breakpoint",
    preconditionFn: () => "enabled",
    callback: (scope: any) => {
      const id = scope.block?.id;
      const span = getMap().find((m) => m.id === id);
      const active = useStore.getState().active;
      if (span && active && active.endsWith(".nlt")) {
        useDebug.getState().nltToggleSourceBreakpoint(active, span.start);
      }
    },
  });
}

/** Scratch-style visual composer with two-way sync AND live debugging: the
 *  currently executing block glows and follows the stepper; right-click a block
 *  to toggle its breakpoint (badge shown). */
export function BlocksView() {
  const active = useStore((s) => s.active);
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<Blockly.WorkspaceSvg | null>(null);
  const mapRef = useRef<BlockLineSpan[]>([]);
  const syncing = useRef(false);
  const [preview, setPreview] = useState("");

  const isNlt = !!active && active.endsWith(".nlt");
  const nlt = useDebug((s) => s.nlt);

  useEffect(() => {
    if (!hostRef.current) return;
    defineNltBlocks();
    registerBreakpointMenu(() => mapRef.current);
    const ws = Blockly.inject(hostRef.current, {
      toolbox: TOOLBOX as any,
      renderer: "zelos",
      theme: DARK_THEME,
      grid: { spacing: 24, length: 2, colour: "#2f2f2f", snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.85 },
      trashcan: true,
    });
    wsRef.current = ws;

    setTimeout(() => {
      document.querySelectorAll<HTMLElement>(".blocklyToolboxCategory").forEach((row) => {
        const label = row.querySelector(".blocklyToolboxCategoryLabel")?.textContent ?? "";
        if (CATEGORY_HINTS[label]) row.title = CATEGORY_HINTS[label];
      });
    }, 150);

    // .nlt text -> blocks (text is the source of truth on entry)
    const buf = useStore.getState().open.find((f) => f.path === useStore.getState().active);
    syncing.current = true;
    try {
      if (buf && buf.content.trim()) {
        Blockly.serialization.workspaces.load(nltToWorkspaceJson(buf.content) as any, ws);
      } else {
        const saved = localStorage.getItem(`blocks:${active ?? "_scratch"}`);
        if (saved) Blockly.serialization.workspaces.load(JSON.parse(saved), ws);
      }
    } catch { /* start empty */ }
    syncing.current = false;
    const first = workspaceToNltWithMap(ws);
    mapRef.current = first.map;
    setPreview(first.text);

    // blocks -> .nlt text (debounced, only when something really changed)
    let timer: number | undefined;
    const onChange = (e: Blockly.Events.Abstract) => {
      if (syncing.current || (e as any).isUiEvent) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          localStorage.setItem(
            `blocks:${active ?? "_scratch"}`,
            JSON.stringify(Blockly.serialization.workspaces.save(ws)));
          const { text, map } = workspaceToNltWithMap(ws);
          mapRef.current = map;
          setPreview(text);
          const st = useStore.getState();
          const a = st.active;
          if (a && a.endsWith(".nlt")) {
            const f = st.open.find((x) => x.path === a);
            if (f && f.content !== text) {
              st.edit(a, text);
              useDebug.getState().nltMarkStale(a);
            }
          }
        } catch { /* ignore */ }
      }, 400);
    };
    ws.addChangeListener(onChange);

    const ro = new ResizeObserver(() => Blockly.svgResize(ws));
    ro.observe(hostRef.current);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
      ws.dispose();
      wsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // ---- live debug: glow the executing block, follow the stepper ----
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    let id: string | null = null;
    if (nlt.file === active && nlt.sourceLine != null &&
        (nlt.status === "paused" || nlt.status === "running")) {
      const hit = mapRef.current.find(
        (m) => nlt.sourceLine! >= m.start && nlt.sourceLine! <= m.end);
      id = hit?.id ?? null;
    }
    ws.highlightBlock(id); // null clears the glow
    if (id) {
      try { (ws as any).centerOnBlock?.(id); } catch { /* older API */ }
    }
  }, [nlt.sourceLine, nlt.status, nlt.file, active]);

  // ---- breakpoint badges on blocks ----
  useEffect(() => {
    const ws = wsRef.current;
    if (!ws) return;
    const bpLines = new Set<number>();
    if (nlt.generated && nlt.file === active) {
      for (const [idx, gl] of nlt.lineBreakpoints) {
        const blk = nlt.generated.find((b) => b.index === idx);
        const src = blk ? genLineToSource(blk, gl) : null;
        if (src) bpLines.add(src);
      }
      for (const idx of nlt.breakpoints) {
        const blk = nlt.generated.find((b) => b.index === idx);
        if (blk) bpLines.add(blk.lineStart);
      }
    }
    for (const m of mapRef.current) {
      const block = ws.getBlockById(m.id);
      if (!block) continue;
      let has = false;
      for (const l of bpLines) if (l >= m.start && l <= m.end) { has = true; break; }
      block.setWarningText(has ? "breakpoint — pauses here" : null);
    }
  }, [nlt.lineBreakpoints, nlt.breakpoints, nlt.generated, nlt.file, active, preview]);

  return (
    <div className="blocks-view">
      <div className="blocks-bar">
        <span className="blocks-title">VISUAL COMPOSER</span>
        <span className="blocks-hint">
          {isNlt
            ? `two-way sync with ${active!.split("/").pop()} · right-click a block for breakpoints · Debug runs here too`
            : "open a .nlt tab to sync — this canvas is a scratchpad"}
        </span>
      </div>
      <div className="blocks-main">
        <div className="blocks-host" ref={hostRef} />
        <pre className="blocks-preview">{preview || "# drag blocks to build your .nlt"}</pre>
      </div>
    </div>
  );
}
