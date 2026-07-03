import { create } from "zustand";
import { ws } from "../ws/client";
import { Cmd, Evt, type Frame, type GenBlock, type Message } from "../ws/protocol";
import { useStore } from "./store";

type Status = "idle" | "running" | "paused";
export interface ConsoleLine { stream: "out" | "err"; text: string; }

export type NltStatus = "idle" | "generating" | "running" | "paused";
export interface NltBlockState { ok?: boolean; error?: string | null; attempts?: number; failures?: string[]; }
export interface NltState {
  file: string | null;          // .nlt path being generated/debugged
  status: NltStatus;
  generated: GenBlock[] | null; // compiled blocks (read-only view source)
  activeBlock: number | null;   // block currently entered/paused
  genLine: number | null;       // 1-based line within the active block's code
  sourceLine: number | null;    // exact .nlt line for genLine (via # L<n> markers)
  blocks: Record<number, NltBlockState>;
  breakpoints: number[];        // block indices
  lineBreakpoints: [number, number][]; // (block index, 1-based gen line)
  stale: boolean;               // .nlt edited since last generate/run
  /** last visual from the run: a frozen @capture frame or any env.screenshot */
  frame: { b64: string; mime: string; label: string } | null;
}

/** Map a 1-based generated-code line to its .nlt source line using the
 *  `# L<n>` markers the compiler asks the model to emit. null = unknown
 *  (old cache entries without markers) → callers fall back to the block span. */
export function genLineToSource(block: GenBlock, genLine: number): number | null {
  if (!block.lineMap?.length) return null;
  const lines = block.code.split("\n");
  // BEGIN_PYTHON blocks: the code IS the source — exact 1:1 mapping.
  if (block.raw && lines.length === block.lineMap.length) {
    return genLine >= 1 && genLine <= lines.length ? block.lineMap[genLine - 1] : null;
  }
  let cur: number | null = null;
  for (let i = 0; i < Math.min(genLine, lines.length); i++) {
    const m = lines[i].match(/^\s*#\s*L(\d+)\b/);
    if (m) cur = parseInt(m[1], 10);
  }
  if (cur == null || cur < 1 || cur > block.lineMap.length) return null;
  return block.lineMap[cur - 1];
}

/** Inverse mapping: a 1-based .nlt source line → the first executable generated
 *  line of that instruction (where a breakpoint can actually fire). */
export function sourceToGen(block: GenBlock, srcLine: number): number | null {
  if (!block.lineMap?.length) return null;
  const lines = block.code.split("\n");
  const firstExecFrom = (start: number): number | null => {
    for (let j = start; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t && !t.startsWith("#")) return j + 1; // 1-based
    }
    return null;
  };
  if (block.raw && lines.length === block.lineMap.length) {
    const k = block.lineMap.indexOf(srcLine);
    return k < 0 ? null : firstExecFrom(k);
  }
  const n = block.lineMap.indexOf(srcLine) + 1; // instruction number for # L<n>
  if (n <= 0) return null;
  const re = new RegExp(`^\\s*#\\s*L${n}\\b`);
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i])) return firstExecFrom(i + 1);
  }
  return null;
}

interface DebugState {
  status: Status;
  /** a step/continue command is in flight — the target is executing; freeze controls */
  stepping: boolean;
  paused: { file: string; line: number } | null;
  frames: Frame[];
  locals: Record<string, string>;
  console: ConsoleLine[];
  // breakpoints per project-relative path → set of 1-based lines
  breakpoints: Record<string, number[]>;

  nlt: NltState;

  ingest: (m: Message) => void;
  toggleBreakpoint: (path: string, line: number) => void;
  run: () => void;
  stop: () => void;
  cont: () => void;
  stepOver: () => void;
  stepInto: () => void;
  stepOut: () => void;
  clearConsole: () => void;

  // nlpilot
  nltGenerate: () => void;
  nltRun: () => void;
  nltToggleBreakpoint: (index: number) => void;
  nltToggleLineBreakpoint: (index: number, line: number) => void;
  nltMarkStale: (path: string) => void;
}

const emptyNlt: NltState = {
  file: null, status: "idle", generated: null, activeBlock: null,
  genLine: null, sourceLine: null, blocks: {}, breakpoints: [],
  lineBreakpoints: [], stale: false, frame: null,
};

// Debug pressed while the generated view was stale/missing: regenerate first,
// then auto-run when nlt.generated arrives.
let pendingRun = false;

/** Save the file if it has unsaved edits — generate/run read from disk. */
async function saveIfDirty(path: string): Promise<void> {
  const st = useStore.getState();
  const f = st.open.find((x) => x.path === path);
  if (f && f.content !== f.saved) await st.save(path);
}

export const useDebug = create<DebugState>((set, get) => ({
  status: "idle",
  stepping: false,
  paused: null,
  frames: [],
  locals: {},
  console: [],
  breakpoints: {},
  nlt: emptyNlt,

  ingest: (m) => {
    switch (m.type) {
      case Evt.RUN_START:
        set({ status: "running", paused: null, frames: [], locals: {} });
        break;
      case Evt.RUN_END:
        set({ status: "idle", stepping: false, paused: null, frames: [] });
        break;
      case Evt.PY_LINE: {
        const { file, line } = m.payload as { file: string; line: number };
        set({ status: "paused", stepping: false, paused: { file, line } });
        // auto-open the paused file so the highlight is visible
        useStore.getState().openFile(file).catch(() => {});
        break;
      }
      case Evt.PY_STACK:
        set({ frames: (m.payload as { frames: Frame[] }).frames });
        break;
      case Evt.PY_VARS:
        set({ locals: (m.payload as { locals: Record<string, string> }).locals ?? {} });
        break;
      case Evt.STDOUT:
        set((s) => ({ console: [...s.console, { stream: "out", text: (m.payload as any).text }] }));
        break;
      case Evt.STDERR:
        set((s) => ({ console: [...s.console, { stream: "err", text: (m.payload as any).text }] }));
        break;
      case Evt.INPUT_REQUEST: {
        const { id, prompt } = m.payload as { id: string; prompt: string };
        const text = window.prompt(prompt || "Script input:") ?? "";
        ws.send(Cmd.INPUT_RESPONSE, { id, text: text + "\n" });
        break;
      }

      case Evt.ERROR: {
        // If a generate/run was in flight, unstick the UI and surface the reason.
        pendingRun = false;
        const reason = (m.payload as any).reason ?? "error";
        set((s) => ({
          nlt: s.nlt.status === "generating" ? { ...s.nlt, status: "idle" } : s.nlt,
          stepping: false,
          console: [...get().console, { stream: "err", text: `[error] ${reason}\n` }],
        }));
        break;
      }

      // ---- nlpilot ----
      case Evt.NLT_GENERATED: {
        set((s) => ({
          nlt: { ...s.nlt, generated: (m.payload as any).blocks as GenBlock[],
                 status: "idle", stale: false },
        }));
        // Debug was pressed on a stale .nlt: fresh code is in, start the run now.
        if (pendingRun) {
          pendingRun = false;
          const file = get().nlt.file;
          if (file) {
            set((s) => ({ nlt: { ...s.nlt, blocks: {} }, console: [] }));
            ws.send(Cmd.NLT_RUN, {
              path: file,
              breakpoints: get().nlt.breakpoints,
              lineBreakpoints: get().nlt.lineBreakpoints,
            });
          }
        }
        break;
      }
      case Evt.NLT_RUN_START:
        set((s) => ({ nlt: { ...s.nlt, status: "running", activeBlock: null, genLine: null, sourceLine: null, blocks: {} }, console: [] }));
        break;
      case Evt.NLT_BLOCK_ENTER: {
        const { index, backend } = m.payload as { index: number; backend: string };
        set((s) => ({
          nlt: { ...s.nlt, activeBlock: index },
          console: [...s.console, { stream: "out", text: `── block #${index} @${backend} ──\n` }],
        }));
        break;
      }
      case Evt.NLT_COMPILE: {
        const { index, code } = m.payload as { index: number; code: string };
        set((s) => ({
          nlt: {
            ...s.nlt,
            generated: s.nlt.generated
              ? s.nlt.generated.map((b) => (b.index === index ? { ...b, code } : b))
              : s.nlt.generated,
          },
        }));
        break;
      }
      case Evt.NLT_LINE: {
        const { index, genLine, locals } = m.payload as
          { index: number; genLine: number; locals: Record<string, string> };
        const blk = get().nlt.generated?.find((b) => b.index === index);
        const sourceLine = blk ? genLineToSource(blk, genLine) : null;
        set((s) => ({
          nlt: { ...s.nlt, status: "paused", activeBlock: index, genLine, sourceLine },
          stepping: false,
          locals: locals ?? {},
        }));
        break;
      }
      case Evt.NLT_ASSERTIONS: {
        const { index, failures } = m.payload as { index: number; failures: string[] };
        set((s) => ({ nlt: { ...s.nlt, blocks: { ...s.nlt.blocks, [index]: { ...s.nlt.blocks[index], failures } } } }));
        break;
      }
      case Evt.NLT_EXCEPTION: {
        const { index, error } = m.payload as { index: number; error: string };
        set((s) => ({ nlt: { ...s.nlt, blocks: { ...s.nlt.blocks, [index]: { ...s.nlt.blocks[index], error } } } }));
        break;
      }
      case Evt.NLT_BLOCK_EXIT: {
        const { index, ok, attempts, error } = m.payload as
          { index: number; ok: boolean; attempts: number; error: string | null };
        const verdict = ok ? "✓ ok" : `✗ FAIL${error ? ` — ${error}` : ""}`;
        set((s) => ({
          nlt: { ...s.nlt, blocks: { ...s.nlt.blocks, [index]: { ...s.nlt.blocks[index], ok, attempts, error } } },
          console: [...s.console, { stream: ok ? "out" : "err", text: `── block #${index} ${verdict}${attempts > 1 ? ` (${attempts} attempts)` : ""} ──\n` }],
        }));
        break;
      }
      case Evt.NLT_FRAME:
        set((s) => ({
          nlt: { ...s.nlt, frame: { b64: (m.payload as any).jpeg, mime: "jpeg", label: "frozen frame" } },
        }));
        break;
      case Evt.NLT_SCREENSHOT: {
        const { name, mime, b64 } = m.payload as { name: string; mime: string; b64: string };
        set((s) => ({ nlt: { ...s.nlt, frame: { b64, mime, label: name } } }));
        break;
      }
      case Evt.NLT_RUN_END:
        set((s) => ({
          nlt: { ...s.nlt, status: "idle", activeBlock: null, genLine: null, sourceLine: null },
          stepping: false,
        }));
        break;
    }
  },

  toggleBreakpoint: (path, line) => {
    const cur = get().breakpoints[path] ?? [];
    const has = cur.includes(line);
    const next = has ? cur.filter((l) => l !== line) : [...cur, line].sort((a, b) => a - b);
    set((s) => ({ breakpoints: { ...s.breakpoints, [path]: next } }));
    // live toggle while a session is active
    if (get().status !== "idle") {
      ws.send(has ? Cmd.CLEAR_BREAKPOINT : Cmd.SET_BREAKPOINT, { path, line });
    }
  },

  run: () => {
    const active = useStore.getState().active;
    if (!active) return;
    set({ console: [], locals: {}, frames: [], paused: null });
    ws.send(Cmd.RUN, { path: active, breakpoints: get().breakpoints[active] ?? [] });
  },
  stop: () => {
    ws.send(Cmd.STOP);
    set((s) => ({ nlt: { ...s.nlt, status: "idle", activeBlock: null, genLine: null, sourceLine: null }, stepping: false }));
  },
  cont: () => { set({ stepping: true }); ws.send(Cmd.CONTINUE); },
  stepOver: () => { set({ stepping: true }); ws.send(Cmd.STEP_OVER); },
  stepInto: () => { set({ stepping: true }); ws.send(Cmd.STEP_INTO); },
  stepOut: () => { set({ stepping: true }); ws.send(Cmd.STEP_OUT); },
  clearConsole: () => set({ console: [] }),

  // ---- nlpilot ----
  nltGenerate: async () => {
    const active = useStore.getState().active;
    if (!active || !active.endsWith(".nlt")) return;
    await saveIfDirty(active); // generate reads from disk
    set((s) => ({ nlt: { ...s.nlt, file: active, status: "generating", stale: false } }));
    ws.send(Cmd.NLT_GENERATE, { path: active });
  },
  nltRun: async () => {
    const active = useStore.getState().active;
    if (!active || !active.endsWith(".nlt")) return;
    await saveIfDirty(active); // run reads from disk
    const n = get().nlt;
    // Edited or never generated → regenerate first, auto-run when it lands.
    if (n.stale || !n.generated || n.file !== active) {
      pendingRun = true;
      set((s) => ({ nlt: { ...s.nlt, file: active, status: "generating", stale: false, generated: n.file === active ? s.nlt.generated : null } }));
      ws.send(Cmd.NLT_GENERATE, { path: active });
      return;
    }
    set((s) => ({ nlt: { ...s.nlt, file: active, blocks: {}, stale: false }, console: [] }));
    ws.send(Cmd.NLT_RUN, {
      path: active,
      breakpoints: get().nlt.breakpoints,
      lineBreakpoints: get().nlt.lineBreakpoints,
    });
  },
  nltToggleBreakpoint: (index) => {
    const cur = get().nlt.breakpoints;
    const has = cur.includes(index);
    const next = has ? cur.filter((i) => i !== index) : [...cur, index].sort((a, b) => a - b);
    set((s) => ({ nlt: { ...s.nlt, breakpoints: next } }));
    if (get().nlt.status !== "idle") {
      ws.send(has ? Cmd.NLT_CLEAR_BREAKPOINT : Cmd.NLT_SET_BREAKPOINT, { index });
    }
  },
  nltToggleLineBreakpoint: (index, line) => {
    const cur = get().nlt.lineBreakpoints;
    const has = cur.some(([i, l]) => i === index && l === line);
    const next: [number, number][] = has
      ? cur.filter(([i, l]) => !(i === index && l === line))
      : [...cur, [index, line] as [number, number]];
    set((s) => ({ nlt: { ...s.nlt, lineBreakpoints: next } }));
    if (get().nlt.status !== "idle") {
      ws.send(has ? Cmd.NLT_CLEAR_LINE_BP : Cmd.NLT_SET_LINE_BP, { index, line });
    }
  },
  nltMarkStale: (path) => {
    const n = get().nlt;
    if (n.file === path && (n.status === "running" || n.status === "paused")) {
      ws.send(Cmd.STOP);
      set((s) => ({ nlt: { ...s.nlt, status: "idle", activeBlock: null, genLine: null, sourceLine: null, stale: true } }));
    } else if (n.file === path && n.generated) {
      // generated view no longer matches the edited source
      set((s) => ({ nlt: { ...s.nlt, stale: true } }));
    }
  },
}));
