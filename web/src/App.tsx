import { useEffect, useState } from "react";
import { ws } from "./ws/client";
import { Evt, type Message } from "./ws/protocol";
import { useStore } from "./state/store";
import { useDebug } from "./state/debug";
import { FileTree } from "./components/FileTree";
import { Tabs } from "./components/Tabs";
import { EditorPane } from "./components/EditorPane";
import { DebugToolbar } from "./components/DebugToolbar";
import { DebugSidebar, Console } from "./components/DebugPanels";
import { GenView } from "./components/GenView";
import { BusyOverlay } from "./components/BusyOverlay";

export function App() {
  const [connected, setConnected] = useState(false);
  const loadTree = useStore((s) => s.loadTree);
  const root = useStore((s) => s.root);
  const active = useStore((s) => s.active);
  const save = useStore((s) => s.save);
  const ingest = useDebug((s) => s.ingest);
  const nlt = useDebug((s) => s.nlt);
  const showGen = !!nlt.generated;

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
        <aside className="sidebar">
          <div className="sidebar-head">
            <span>EXPLORER</span>
            <button
              className="folder-btn"
              title="Change project folder"
              onClick={async () => {
                // Native OS folder picker in the desktop app; text prompt in browser.
                const pyapi = (window as any).pywebview?.api;
                let p: string | null = null;
                if (pyapi?.pick_folder) {
                  p = await pyapi.pick_folder();
                } else {
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
              <div className="gen-pane">
                <GenView />
              </div>
            )}
          </div>
          <div className="console-strip">
            <Console />
          </div>
        </section>
        <DebugSidebar />
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
