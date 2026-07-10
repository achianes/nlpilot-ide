import { useEffect, useState } from "react";
import { useDebug } from "../state/debug";

/** One-line narrative of what the debugger is doing right now. Sits above the
 *  console so there is never a silent gap between steps. */
export function StatusBar() {
  const status = useDebug((s) => s.status);
  const stepping = useDebug((s) => s.stepping);
  const paused = useDebug((s) => s.paused);
  const nlt = useDebug((s) => s.nlt);

  // elapsed seconds while a step/continue is executing
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    if (!stepping) { setSecs(0); return; }
    const id = setInterval(() => setSecs((v) => v + 1), 1000);
    return () => clearInterval(id);
  }, [stepping]);

  const nltActive = nlt.status === "running" || nlt.status === "paused";
  let cls = "idle";
  let text = "idle — open a file and press Run / Debug .nlt";

  if (nltActive) {
    const blk = nlt.activeBlock != null && nlt.generated
      ? nlt.generated.find((b) => b.index === nlt.activeBlock)
      : null;
    const blkLabel = blk && nlt.generated
      ? `block ${blk.index + 1}/${nlt.generated.length} @${blk.backend} (.nlt L${blk.lineStart}-${blk.lineEnd})`
      : "starting…";
    if (stepping) {
      cls = "exec";
      text = `executing ${blkLabel}${secs > 0 ? ` — ${secs}s` : ""}… target is running (browser/app may be busy)`;
    } else if (nlt.status === "paused") {
      cls = "paused";
      const src = nlt.sourceLine ? ` = .nlt line ${nlt.sourceLine}` : "";
      text = `paused — ${blkLabel}, generated line ${nlt.genLine ?? "?"}${src} · step or continue`;
    } else {
      cls = "exec";
      text = `running ${blkLabel}${secs > 0 ? ` — ${secs}s` : ""}…`;
    }
  } else if (status === "paused") {
    if (stepping) {
      cls = "exec";
      text = `executing${secs > 0 ? ` — ${secs}s` : ""}…`;
    } else {
      cls = "paused";
      text = `paused — ${paused?.file ?? ""}:${paused?.line ?? ""} · step or continue`;
    }
  } else if (status === "running") {
    cls = "exec";
    text = `running${secs > 0 ? ` — ${secs}s` : ""}… waiting for a breakpoint`;
  }

  return (
    <div className={`statusbar ${cls}`}>
      {(cls === "exec") && <span className="statusbar-spin" />}
      {cls === "paused" && <span className="statusbar-ico">⏸</span>}
      <span>{text}</span>
    </div>
  );
}
