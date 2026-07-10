import { useEffect, useState } from "react";
import { ws } from "./ws/client";
import { Evt, type Message } from "./ws/protocol";
import { useStore } from "./state/store";
import { useDebug } from "./state/debug";
import { api } from "./api";
import { FileTree } from "./components/FileTree";
import { Tabs } from "./components/Tabs";
import { EditorPane } from "./components/EditorPane";
import { DebugToolbar } from "./components/DebugToolbar";
import { DebugSidebar, Console } from "./components/DebugPanels";
import { GenView } from "./components/GenView";
import { BusyOverlay } from "./components/BusyOverlay";
import { StatusBar } from "./components/StatusBar";
import { DragBar, useSplitSize } from "./components/Split";

export function App() {
  const [connected, setConnected] = useState(false);
  const loadTree = useStore((s) => s.loadTree);
  const root = useStore((s) => s.root);
  const active = useStore((s) => s.active);
  const save = useStore((s) => s.save);
  const ingest = useDebug((s) => s.ingest);
  const nlt = useDebug((s) => s.nlt);
  const showGen = !!nlt.generated;

  // Resizable panes (persisted).
  const [sidebarW, setSidebarW] = useSplitSize("sidebar", 240);
  const [genW, setGenW] = useSplitSize("gen", 520);
  const [consoleH, setConsoleH] = useSplitSize("console", 180);
  const [dbgW, setDbgW] = useSplitSize("dbg", 280);

  useEffect(() => {
    const off = ws.on((msg: Message) => {
      if (msg.type === Evt.HELLO) setConnected(true);
      ingest(msg);
    });
    ws.connect();
    loadTree().catch((e) => console.error("tree load failed", e));
    return off;
  }, [loadTree, ingest]);

  return (
    <div className="app">
      <div className="topbar">
        <h1>nlpilot-ide</h1>
        <span className="root" title={root}>{root}</span>
        <DebugToolbar />
        <div className="spacer" />
        <button onClick={() => active && save(active)} disabled={!active}>Save</button>
        <span className={`status ${connected ? "ok" : "err"}`}>
          {connected ? "● live" : "○ offline"}
        </span>
      </div>
      <div className="main">
        <aside className="sidebar" style={{ width: sidebarW }}>
          <div className="sidebar-head">
            <span>EXPLORER</span>
            <button
              className="folder-btn"
              title="Change project folder"
              onClick={async () => {
                // Native OS folder chooser via the backend (tkinter). Falls back
                // to a text prompt only if that fails.
                let p: string | null = null;
                try {
                  const r = await api.pickFolder();
                  p = r.path || null;
                  if (p === null) return; // user cancelled the dialog
                } catch {
                  p = window.prompt("Project folder path:", root);
                }
                if (!p || p === root) return;
                try {
                  await useStore.getState().setRoot(p);
                } catch (e: any) {
                  window.alert("Could not open folder:\n" + (e?.message ?? e));
                }
              }}
            >
              ⊞ Open
            </button>
          </div>
          <FileTree />
        </aside>
        <DragBar dir="v" size={sidebarW} setSize={setSidebarW} min={140} max={600} />
        <section className="editor-area">
          <Tabs />
          {nlt.stale && (
            <div className="stale-banner">
              .nlt changed — debug halted. Stop &amp; regenerate to sync the generated Python.
            </div>
          )}
          <div className="editor-split">
            <div className="editor-host">
              <EditorPane />
            </div>
            {showGen && (
              <>
                <DragBar dir="v" size={genW} setSize={setGenW} invert min={200} max={1400} />
                <div className="gen-pane" style={{ width: genW, flex: "0 0 auto" }}>
                  <GenView />
                </div>
              </>
            )}
          </div>
          <StatusBar />
          <DragBar dir="h" size={consoleH} setSize={setConsoleH} invert min={60} max={700} />
          <div className="console-strip" style={{ height: consoleH }}>
            <Console />
          </div>
        </section>
        <DragBar dir="v" size={dbgW} setSize={setDbgW} invert min={160} max={700} />
        <DebugSidebar width={dbgW} />
      </div>
      {nlt.status === "generating" && (
        <BusyOverlay
          title="Generating Python from your .nlt…"
          detail={`Calling Ollama (${nlt.file ?? ""}). Each block is one model call — first run can take a while.`}
        />
      )}
    </div>
  );
}
