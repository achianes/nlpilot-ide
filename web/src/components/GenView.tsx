import { useEffect, useMemo, useRef } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { useDebug } from "../state/debug";
import type { GenBlock } from "../ws/protocol";

/** Build one read-only document from all generated blocks, with a header before
 *  each block. Returns the text and a map: block index → 1-based line where that
 *  block's code starts in the combined document. */
function buildDoc(blocks: GenBlock[]): { text: string; codeStart: Record<number, number> } {
  const lines: string[] = [];
  const codeStart: Record<number, number> = {};
  for (const b of blocks) {
    lines.push(`# ═══ block ${b.index}  @${b.backend}${b.fromCache ? "  (cached)" : ""}  ·  .nlt L${b.lineStart}-${b.lineEnd}`);
    codeStart[b.index] = lines.length + 1; // next pushed line is code line 1
    for (const cl of b.code.split("\n")) lines.push(cl);
    lines.push("");
  }
  return { text: lines.join("\n"), codeStart };
}

export function GenView() {
  const nlt = useDebug((s) => s.nlt);
  const nltToggleBp = useDebug((s) => s.nltToggleBreakpoint);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decoRef = useRef<string[]>([]);

  const { text, codeStart } = useMemo(
    () => (nlt.generated ? buildDoc(nlt.generated) : { text: "", codeStart: {} }),
    [nlt.generated]
  );

  // line (in combined doc) → block index, for gutter breakpoint clicks
  const lineToBlock = useMemo(() => {
    const map: Record<number, number> = {};
    if (nlt.generated) {
      for (const b of nlt.generated) {
        const start = codeStart[b.index];
        const count = b.code.split("\n").length;
        for (let l = start - 1; l < start + count; l++) map[l] = b.index; // header + code
      }
    }
    return map;
  }, [nlt.generated, codeStart]);

  function onMount(editor: any, monaco: Monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    editor.onMouseDown((e: any) => {
      if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
        const line = e.target.position?.lineNumber;
        const idx = line != null ? lineToBlock[line] : undefined;
        if (idx != null) nltToggleBp(idx);
      }
    });
  }

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const decos: any[] = [];

    // breakpoint glyphs on each breakpointed block's header line
    for (const idx of nlt.breakpoints) {
      const start = codeStart[idx];
      if (start) {
        decos.push({
          range: new monaco.Range(start - 1, 1, start - 1, 1),
          options: { glyphMarginClassName: "bp-glyph" },
        });
      }
    }

    // current generated line (dual-view highlight, gen side)
    if (nlt.status === "paused" && nlt.activeBlock != null && nlt.genLine != null) {
      const start = codeStart[nlt.activeBlock];
      if (start) {
        const docLine = start + nlt.genLine - 1;
        decos.push({
          range: new monaco.Range(docLine, 1, docLine, 1),
          options: { isWholeLine: true, className: "current-line", glyphMarginClassName: "current-glyph" },
        });
        editor.revealLineInCenterIfOutsideViewport(docLine);
      }
    }

    decoRef.current = editor.deltaDecorations(decoRef.current, decos);
  }, [nlt.status, nlt.activeBlock, nlt.genLine, nlt.breakpoints, codeStart]);

  if (!nlt.generated) {
    return (
      <div className="gen-empty">
        <p>Generated Python</p>
        <p className="hint">Click <b>Generate</b> on a .nlt to compile blocks here, then step through them.</p>
      </div>
    );
  }

  return (
    <div className="gen-view">
      <div className="gen-head">GENERATED PYTHON {nlt.stale && <span className="stale">stale — regenerate</span>}</div>
      <div className="gen-host">
        <Editor
          language="python"
          theme="nlt-dark"
          value={text}
          options={{
            readOnly: true,
            fontSize: 12,
            fontFamily: "'Cascadia Code', Consolas, monospace",
            minimap: { enabled: false },
            glyphMargin: true,
            automaticLayout: true,
            scrollBeyondLastLine: false,
            lineNumbers: "on",
          }}
          onMount={onMount}
        />
      </div>
    </div>
  );
}
