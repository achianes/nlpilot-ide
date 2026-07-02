import { useEffect, useState } from "react";

/** Full-window modal shown while a long operation (Generate) is running. Blocks
 *  interaction and shows a spinner + elapsed seconds so the wait feels alive. */
export function BusyOverlay({ title, detail }: { title: string; detail?: string }) {
  const [secs, setSecs] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="spinner" />
        <div className="overlay-title">{title}</div>
        {detail && <div className="overlay-detail">{detail}</div>}
        <div className="overlay-secs">{secs}s</div>
      </div>
    </div>
  );
}
