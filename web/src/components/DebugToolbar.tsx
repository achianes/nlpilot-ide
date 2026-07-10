import { useDebug } from "../state/debug";
import { useStore } from "../state/store";

export function DebugToolbar() {
  const status = useDebug((s) => s.status);
  const nlt = useDebug((s) => s.nlt);
  const active = useStore((s) => s.active);
  const d = useDebug();

  const stepping = useDebug((s) => s.stepping);
  const isPy = !!active && active.endsWith(".py");
  const isNlt = !!active && active.endsWith(".nlt");

  // Which engine is driving the flow controls?
  const nltActive = nlt.status === "running" || nlt.status === "paused";
  // While a step/continue is in flight the target is executing: freeze controls.
  const paused = (status === "paused" || nlt.status === "paused") && !stepping;
  const running = status !== "idle" || nltActive;
  const idle = !running;

  return (
    <div className="dbg-toolbar">
      {isNlt && (
        <>
          <button onClick={d.nltGenerate} disabled={nlt.status === "generating" || nltActive}
            title="Compile all blocks to Python (no run)">
            {nlt.status === "generating" ? "⏳ Generating…" : "⚙ Generate"}
          </button>
          <button onClick={d.nltRun} disabled={!idle} title="Debug the .nlt (real run, block by block)">▶ Debug .nlt</button>
        </>
      )}
      {isPy && (
        <button onClick={d.run} disabled={!idle} title="Run (uses breakpoints)">▶ Run</button>
      )}
      <button onClick={d.cont} disabled={!paused} title="Continue">⏵</button>
      <button onClick={d.stepOver} disabled={!paused} title="Step over">⤼</button>
      <button onClick={d.stepInto} disabled={!paused} title="Step into">⤓</button>
      <button onClick={d.stepOut} disabled={!paused} title="Step out">⤒</button>
      <button onClick={d.stop} disabled={idle} title="Stop">⏹</button>
      <span className={`dbg-status ${paused ? "paused" : running ? "running" : "idle"}`}>
        {stepping ? "executing…" : nltActive ? `nlt:${nlt.status}` : status}
      </span>
    </div>
  );
}
