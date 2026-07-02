import { useDebug } from "../state/debug";
import { useStore } from "../state/store";

export function DebugToolbar() {
  const status = useDebug((s) => s.status);
  const nlt = useDebug((s) => s.nlt);
  const active = useStore((s) => s.active);
  const d = useDebug();

  const isPy = !!active && active.endsWith(".py");
  const isNlt = !!active && active.endsWith(".nlt");

  // Which engine is driving the flow controls?
  const nltActive = nlt.status === "running" || nlt.status === "paused";
  const paused = status === "paused" || nlt.status === "paused";
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
        {nltActive ? `nlt:${nlt.status}` : status}
      </span>
    </div>
  );
}
