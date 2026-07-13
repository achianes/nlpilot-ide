import { useCallback, useEffect, useRef, useState } from "react";
import { useDebug } from "../state/debug";
import { useStore } from "../state/store";
import { ws } from "../ws/client";
import { Cmd } from "../ws/protocol";
import { DragBar, useSplitSize } from "./Split";

/** Map a mouse event on the screenshot <img> to screenshot-pixel coords. */
function imgCoords(e: React.MouseEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  const r = img.getBoundingClientRect();
  const sx = img.naturalWidth / r.width;
  const sy = img.naturalHeight / r.height;
  return { x: (e.clientX - r.left) * sx, y: (e.clientY - r.top) * sy };
}

/** Live visual of the run: frozen @capture frames AND every env.screenshot(...)
 *  and the live browser view. Dockable in the sidebar, or "detach" to a floating,
 *  always-on-top, draggable + resizable window inside the IDE. */
function CapturePanel() {
  const frame = useDebug((s) => s.nlt.frame);
  const [h, setH] = useSplitSize("capture", 220);
  const [detached, setDetached] = useState(() => localStorage.getItem("screen:detached") === "1");
  useEffect(() => localStorage.setItem("screen:detached", detached ? "1" : "0"), [detached]);

  // floating window geometry (persisted)
  const [box, setBox] = useState(() => {
    try { return JSON.parse(localStorage.getItem("screen:box") || "") ; }
    catch { return { x: 80, y: 80, w: 480, h: 320 }; }
  });
  useEffect(() => localStorage.setItem("screen:box", JSON.stringify(box)), [box]);

  const drag = useRef<{ px: number; py: number; b: any; mode: "move" | "size" } | null>(null);
  const onDown = useCallback((mode: "move" | "size") => (e: React.MouseEvent) => {
    e.preventDefault();
    drag.current = { px: e.clientX, py: e.clientY, b: { ...box }, mode };
    const onMove = (ev: MouseEvent) => {
      const d = drag.current; if (!d) return;
      const dx = ev.clientX - d.px, dy = ev.clientY - d.py;
      if (d.mode === "move") setBox({ ...d.b, x: Math.max(0, d.b.x + dx), y: Math.max(0, d.b.y + dy) });
      else setBox({ ...d.b, w: Math.max(200, d.b.w + dx), h: Math.max(140, d.b.h + dy) });
    };
    const onUp = () => { drag.current = null; document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.userSelect = ""; };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
  }, [box]);

  // interactive remote control is possible only while the debugger is paused
  // (the browser's driver is idle then)
  const nltStatus = useDebug((s) => s.nlt.status);
  const canInteract = nltStatus === "paused";

  if (!frame) return null;
  const isLive = frame.label.includes("(live)");
  const onImgClick = (e: React.MouseEvent<HTMLImageElement>) => {
    if (!canInteract || !isLive) return;
    const { x, y } = imgCoords(e);
    ws.send(Cmd.NLT_UI_CLICK, { x, y });
  };
  const onImgWheel = (e: React.WheelEvent<HTMLImageElement>) => {
    if (!canInteract || !isLive) return;   // else fall through to local image scroll
    e.preventDefault();
    ws.send(Cmd.NLT_UI_SCROLL, { dx: e.deltaX, dy: e.deltaY });
  };
  const img = (
    <img
      src={`data:image/${frame.mime};base64,${frame.b64}`}
      alt={frame.label}
      className={canInteract && isLive ? "screen-interactive" : ""}
      onClick={onImgClick}
      onWheel={onImgWheel}
      draggable={false}
    />
  );

  if (detached) {
    return (
      <div className="screen-float" style={{ left: box.x, top: box.y, width: box.w, height: box.h }}>
        <div className="screen-float-head" onMouseDown={onDown("move")}>
          <span>SCREEN — {frame.label}{canInteract && isLive ? " · click/scroll" : ""}</span>
          <button className="mini" onClick={() => setDetached(false)} title="Dock back into the sidebar">⇲ dock</button>
        </div>
        <div className="capture-body">{img}</div>
        <div className="screen-float-resize" onMouseDown={onDown("size")} />
      </div>
    );
  }

  return (
    <>
      <div className="panel capture-panel" style={{ flex: `0 0 ${h}px` }}>
        <div className="panel-head">
          SCREEN — {frame.label}{canInteract && isLive ? " · click/scroll" : ""}
          <button className="mini" onClick={() => setDetached(true)} title="Detach to a floating, always-on-top window">⇱ detach</button>
        </div>
        <div className="capture-body">{img}</div>
      </div>
      <DragBar dir="h" size={h} setSize={setH} min={100} max={800} />
    </>
  );
}

function Variables() {
  const locals = useDebug((s) => s.locals);
  const names = Object.keys(locals);
  return (
    <div className="panel">
      <div className="panel-head">VARIABLES</div>
      <div className="panel-body">
        {names.length === 0 ? (
          <div className="panel-empty">no locals</div>
        ) : (
          <table className="vars">
            <tbody>
              {names.map((n) => (
                <tr key={n}>
                  <td className="vname">{n}</td>
                  <td className="vval">{locals[n]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CallStack() {
  const frames = useDebug((s) => s.frames);
  const openFile = useStore((s) => s.openFile);
  return (
    <div className="panel">
      <div className="panel-head">CALL STACK</div>
      <div className="panel-body">
        {frames.length === 0 ? (
          <div className="panel-empty">not paused</div>
        ) : (
          frames.map((f, i) => (
            <div
              key={i}
              className="frame"
              onClick={() => f.file.indexOf("/") >= 0 && openFile(f.file).catch(() => {})}
              title={`${f.file}:${f.line}`}
            >
              <span className="fname">{f.name}</span>
              <span className="floc">{f.file.split("/").pop()}:{f.line}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Console() {
  const lines = useDebug((s) => s.console);
  const clear = useDebug((s) => s.clearConsole);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollTo(0, ref.current.scrollHeight);
  }, [lines]);
  return (
    <div className="panel console">
      <div className="panel-head">
        CONSOLE
        <button className="mini" onClick={clear}>clear</button>
      </div>
      <div className="panel-body cout" ref={ref}>
        {lines.map((l, i) => (
          <span key={i} className={l.stream === "err" ? "cerr" : "cstd"}>{l.text}</span>
        ))}
      </div>
    </div>
  );
}

function Blocks() {
  const nlt = useDebug((s) => s.nlt);
  const toggleBp = useDebug((s) => s.nltToggleBreakpoint);
  if (!nlt.generated) return null;

  function statusOf(index: number): { icon: string; cls: string } {
    if (nlt.activeBlock === index && nlt.status === "paused") return { icon: "▶", cls: "run" };
    if (nlt.activeBlock === index && nlt.status === "running") return { icon: "…", cls: "run" };
    const st = nlt.blocks[index];
    if (!st) return { icon: "·", cls: "idle" };
    if (st.ok) return { icon: "✓", cls: "ok" };
    if (st.ok === false || st.error) return { icon: "✗", cls: "err" };
    return { icon: "·", cls: "idle" };
  }

  return (
    <div className="panel">
      <div className="panel-head">BLOCKS</div>
      <div className="panel-body">
        {nlt.generated.map((b) => {
          const s = statusOf(b.index);
          const st = nlt.blocks[b.index];
          const bp = nlt.breakpoints.includes(b.index);
          return (
            <div key={b.index} className={`blk ${nlt.activeBlock === b.index ? "active" : ""}`}>
              <div className="blk-row">
                <span className={`blk-bp ${bp ? "on" : ""}`} onClick={() => toggleBp(b.index)} title="Toggle block breakpoint">●</span>
                <span className={`blk-status ${s.cls}`}>{s.icon}</span>
                <span className="blk-name">#{b.index} @{b.backend}</span>
                <span className="blk-loc">L{b.lineStart}{b.lineEnd !== b.lineStart ? `-${b.lineEnd}` : ""}</span>
              </div>
              {st?.failures?.length ? (
                <div className="blk-fail">✗ {st.failures.join("; ")}</div>
              ) : null}
              {st?.error ? <div className="blk-fail">{st.error}</div> : null}
              {st?.attempts && st.attempts > 1 ? (
                <div className="blk-note">self-corrected ({st.attempts} attempts)</div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DebugSidebar({ width }: { width?: number }) {
  const hasNlt = useDebug((s) => !!s.nlt.generated);
  return (
    <aside className="dbg-sidebar" style={width ? { width } : undefined}>
      <CapturePanel />
      {hasNlt && <Blocks />}
      <Variables />
      <CallStack />
    </aside>
  );
}

export { Console };
