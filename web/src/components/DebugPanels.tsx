import { useEffect, useRef } from "react";
import { useDebug } from "../state/debug";
import { useStore } from "../state/store";

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

export function DebugSidebar() {
  const hasNlt = useDebug((s) => !!s.nlt.generated);
  return (
    <aside className="dbg-sidebar">
      {hasNlt && <Blocks />}
      <Variables />
      <CallStack />
    </aside>
  );
}

export { Console };
