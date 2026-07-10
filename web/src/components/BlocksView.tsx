import { useEffect, useRef, useState } from "react";
import * as Blockly from "blockly";
import Editor, { type Monaco } from "@monaco-editor/react";
import {
  defineNltBlocks, getToolbox, loadCustomBlocks, nltToWorkspaceJson,
  workspaceToNltWithMap, type BlockLineSpan, type CustomBlockDef,
} from "../blocks/nltBlocks";
import { useStore } from "../state/store";
import { api } from "../api";
import { genLineToSource, sourceToGen, useDebug } from "../state/debug";
import { defineNltTheme, registerNlt } from "../lang/nlt";
import { DragBar, useSplitSize } from "./Split";

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

// "Toggle breakpoint" in every block's right-click menu (registered once). The
// handler is swapped in per BlocksView instance via `bpHandler`.
let ctxRegistered = false;
let bpHandler: ((blockId: string) => void) | null = null;
function registerBreakpointMenu() {
  if (ctxRegistered) return;
  ctxRegistered = true;
  Blockly.ContextMenuRegistry.registry.register({
    id: "nlt_toggle_breakpoint",
    scopeType: Blockly.ContextMenuRegistry.ScopeType.BLOCK,
    weight: 0,
    displayText: () => "🔴 Toggle breakpoint",
    preconditionFn: () => "enabled",
    callback: (scope: any) => {
      const id = scope.block?.id;
      if (id && bpHandler) bpHandler(id);
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
  const bpIds = useRef<Set<string>>(new Set());   // block ids the user marked
  const pendingSync = useRef(false);              // resolve bps once generate lands
  const [preview, setPreview] = useState("");
  const [, setBpTick] = useState(0);              // re-render outlines
  const [customCount, setCustomCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);   // bump to re-inject the workspace
  const [previewW, setPreviewW] = useSplitSize("blocksPreview", 340);

  const isNlt = !!active && active.endsWith(".nlt");
  const nlt = useDebug((s) => s.nlt);

  // Paint a red outline on every breakpointed block (always visible).
  function paintBreakpoints() {
    const ws = wsRef.current;
    if (!ws) return;
    for (const m of mapRef.current) {
      const b = ws.getBlockById(m.id);
      const root = b?.getSvgRoot();
      if (root) root.classList.toggle("nlt-bp", bpIds.current.has(m.id));
    }
  }

  // Turn the marked block ids into concrete line breakpoints in the debug store.
  function resolveBreakpoints() {
    const st = useDebug.getState();
    const gen = st.nlt.generated;
    const a = useStore.getState().active;
    if (!gen || st.nlt.file !== a) return;
    const lineBps: [number, number][] = [];
    for (const id of bpIds.current) {
      const span = mapRef.current.find((m) => m.id === id);
      if (!span) continue;
      const blk = gen.find((b) => span.start >= b.lineStart && span.start <= b.lineEnd);
      if (!blk) continue;
      const gl = sourceToGen(blk, span.start);
      if (gl != null) lineBps.push([blk.index, gl]);
    }
    useDebug.setState((s) => ({ nlt: { ...s.nlt, lineBreakpoints: lineBps, breakpoints: [] } }));
  }

  // Right-click "Toggle breakpoint": flip the block, show it now, resolve it
  // (generating first if the file was never compiled).
  function toggleBlockBreakpoint(id: string) {
    const s = bpIds.current;
    s.has(id) ? s.delete(id) : s.add(id);
    setBpTick((t) => t + 1);
    paintBreakpoints();
    const st = useDebug.getState();
    const a = useStore.getState().active;
    if (!a || !a.endsWith(".nlt")) return;
    if (!st.nlt.generated || st.nlt.file !== a) {
      pendingSync.current = true;        // resolve once generation lands
      st.nltGenerate();
    } else {
      resolveBreakpoints();
    }
  }
  bpHandler = toggleBlockBreakpoint;

  // Load custom_blocks.json from the project root (optional). Cached in
  // localStorage so the inject effect can define blocks synchronously.
  async function importCustomBlocks(announce: boolean): Promise<void> {
    try {
      const { content } = await api.read("custom_blocks.json");
      const defs = JSON.parse(content) as CustomBlockDef[];
      localStorage.setItem("customBlocksJson", JSON.stringify(defs));
      setReloadKey((k) => k + 1);
      if (announce) {
        useDebug.setState((s) => ({
          console: [...s.console, { stream: "out", text: `[blocks] imported ${defs.length} custom block(s) from custom_blocks.json\n` }],
        }));
      }
    } catch {
      if (announce) {
        useDebug.setState((s) => ({
          console: [...s.console, { stream: "err", text: "[blocks] custom_blocks.json not found or invalid in the project root\n" }],
        }));
      }
    }
  }
  useEffect(() => { importCustomBlocks(false); /* silent on first mount */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!hostRef.current) return;
    defineNltBlocks();
    registerBreakpointMenu();

    // Custom user blocks from custom_blocks.json in the project root (optional).
    let n = 0;
    try {
      const raw = localStorage.getItem("customBlocksJson");
      if (raw) n = loadCustomBlocks(JSON.parse(raw) as CustomBlockDef[]);
    } catch { /* ignore malformed */ }

    const ws = Blockly.inject(hostRef.current, {
      toolbox: getToolbox() as any,
      renderer: "zelos",
      theme: DARK_THEME,
      grid: { spacing: 24, length: 2, colour: "#2f2f2f", snap: true },
      zoom: { controls: true, wheel: true, startScale: 0.85 },
      trashcan: true,
    });
    wsRef.current = ws;
    if (n) setCustomCount(n);

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
    // seed outlines from breakpoints already set (e.g. via the editor gutter)
    seedBreakpointsFromStore();
    setTimeout(paintBreakpoints, 60);

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
          paintBreakpoints();
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
  }, [active, reloadKey]);

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

  // Seed the marked-block set from breakpoints already in the store (so a bp set
  // from the editor gutter shows a red outline here too).
  function seedBreakpointsFromStore() {
    const st = useDebug.getState();
    if (!st.nlt.generated || st.nlt.file !== useStore.getState().active) return;
    const srcLines = new Set<number>();
    for (const [idx, gl] of st.nlt.lineBreakpoints) {
      const blk = st.nlt.generated.find((b) => b.index === idx);
      const s = blk ? genLineToSource(blk, gl) : null;
      if (s) srcLines.add(s);
    }
    for (const idx of st.nlt.breakpoints) {
      const blk = st.nlt.generated.find((b) => b.index === idx);
      if (blk) srcLines.add(blk.lineStart);
    }
    for (const m of mapRef.current)
      for (const l of srcLines) if (l >= m.start && l <= m.end) bpIds.current.add(m.id);
  }

  // When generation lands after a right-click, resolve the held breakpoints.
  useEffect(() => {
    if (pendingSync.current && nlt.generated && nlt.file === active) {
      pendingSync.current = false;
      resolveBreakpoints();
    }
    paintBreakpoints();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nlt.generated, nlt.file, active]);

  function beforePreviewMount(monaco: Monaco) {
    registerNlt(monaco);
    defineNltTheme(monaco);
  }

  return (
    <div className="blocks-view">
      <div className="blocks-bar">
        <span className="blocks-title">VISUAL COMPOSER</span>
        <button className="blocks-import" title="Load custom blocks from custom_blocks.json in the project root"
          onClick={() => importCustomBlocks(true)}>
          ⇩ Import blocks{customCount ? ` (${customCount})` : ""}
        </button>
        <span className="blocks-hint">
          {isNlt
            ? `two-way sync with ${active!.split("/").pop()} · right-click a block for breakpoints · Debug runs here too`
            : "open a .nlt tab to sync — this canvas is a scratchpad"}
        </span>
      </div>
      <div className="blocks-main">
        <div className="blocks-host" ref={hostRef} />
        <DragBar dir="v" size={previewW} setSize={setPreviewW} invert min={180} max={900} />
        <div className="blocks-preview" style={{ width: previewW, flex: "0 0 auto" }}>
          <div className="blocks-preview-head">.nlt preview</div>
          <div className="blocks-preview-editor">
            <Editor
              language="nlt"
              theme="nlt-dark"
              value={preview || "# drag blocks to build your .nlt"}
              beforeMount={beforePreviewMount}
              options={{
                readOnly: true,
                fontSize: 12,
                fontFamily: "'Cascadia Code', Consolas, monospace",
                minimap: { enabled: false },
                lineNumbers: "on",
                folding: false,
                automaticLayout: true,
                scrollBeyondLastLine: false,
                renderWhitespace: "selection",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
