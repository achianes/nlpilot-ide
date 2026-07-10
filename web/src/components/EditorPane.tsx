import { useEffect, useRef } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { useStore } from "../state/store";
import { genLineToSource, genLineToSourceSpan, useDebug } from "../state/debug";
import { defineNltTheme, langForPath, registerNlt } from "../lang/nlt";

export function EditorPane() {
  const active = useStore((s) => s.active);
  const file = useStore((s) => s.open.find((f) => f.path === s.active));
  const edit = useStore((s) => s.edit);
  const save = useStore((s) => s.save);

  const breakpoints = useDebug((s) => (active ? s.breakpoints[active] ?? [] : []));
  const paused = useDebug((s) => s.paused);
  const toggleBreakpoint = useDebug((s) => s.toggleBreakpoint);
  const nlt = useDebug((s) => s.nlt);

  const isNlt = !!active && active.endsWith(".nlt");
  // Lock the .nlt while its debug session is live — editing would desync the
  // generated code (the stale banner covers the accidental-path anyway).
  const nltLocked =
    isNlt && nlt.file === active && (nlt.status === "running" || nlt.status === "paused");

  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const decoRef = useRef<string[]>([]);

  function beforeMount(monaco: Monaco) {
    registerNlt(monaco);
    defineNltTheme(monaco);
  }

  function onMount(editor: any, monaco: Monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const a = useStore.getState().active;
      if (a) save(a);
    });

    // Toggle a breakpoint by clicking the glyph margin. For .nlt, map the clicked
    // line to the block that contains it and toggle a block breakpoint instead.
    editor.onMouseDown((e: any) => {
      const T = monaco.editor.MouseTargetType;
      // toggle on the glyph margin OR the line number — one comfy click target
      if (e.target.type !== T.GUTTER_GLYPH_MARGIN && e.target.type !== T.GUTTER_LINE_NUMBERS) return;
      const a = useStore.getState().active;
      const line = e.target.position?.lineNumber;
      if (!a || !line) return;
      if (a.endsWith(".nlt")) {
        useDebug.getState().nltToggleSourceBreakpoint(a, line);
      } else {
        toggleBreakpoint(a, line);
      }
    });
  }

  // Recompute decorations when breakpoints, pause state, or file change.
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco || !active) return;
    const decos: any[] = [];

    if (isNlt) {
      // .nlt: breakpoint glyphs on block start lines; highlight the active block's
      // whole source span (dual-view — source side).
      const gen = nlt.generated;
      // nlt state (blocks, breakpoints, highlights) belongs to ONE file — never
      // paint it on a different tab
      if (gen && nlt.file === active) {
        for (const idx of nlt.breakpoints) {
          const b = gen.find((x) => x.index === idx);
          if (b) decos.push({
            range: new monaco.Range(b.lineStart, 1, b.lineStart, 1),
            options: { glyphMarginClassName: "bp-glyph" },
          });
        }
        // line breakpoints: dot on the exact .nlt line they map back to
        for (const [idx, gl] of nlt.lineBreakpoints) {
          const b = gen.find((x) => x.index === idx);
          const src = b ? genLineToSource(b, gl) : null;
          if (src) decos.push({
            range: new monaco.Range(src, 1, src, 1),
            options: { glyphMarginClassName: "bp-glyph" },
          });
        }
        if (nlt.file === active && nlt.activeBlock != null) {
          const b = gen.find((x) => x.index === nlt.activeBlock);
          if (b) {
            // light highlight on the whole block span…
            decos.push({
              range: new monaco.Range(b.lineStart, 1, b.lineEnd, 1),
              options: { isWholeLine: true, className: "current-block" },
            });
            // …and, when the # L<n> markers resolve it, a strong highlight on
            // the EXACT source line being executed.
            // strong highlight covers the WHOLE current instruction — a sentence
            // wrapped over several .nlt lines lights up entirely
            const span = nlt.genLine != null ? genLineToSourceSpan(b, nlt.genLine) : null;
            const start = span?.start ?? nlt.sourceLine ?? b.lineStart;
            const end = span?.end ?? start;
            decos.push({
              range: new monaco.Range(start, 1, end, 1),
              options: {
                isWholeLine: true,
                className: span || nlt.sourceLine ? "current-line" : "",
                glyphMarginClassName: "current-glyph",
              },
            });
            editor.revealLineInCenterIfOutsideViewport(start);
          }
        }
      }
    } else {
      // .py: line breakpoints + current paused line
      for (const line of breakpoints) {
        decos.push({
          range: new monaco.Range(line, 1, line, 1),
          options: { glyphMarginClassName: "bp-glyph" },
        });
      }
      if (paused && paused.file === active) {
        decos.push({
          range: new monaco.Range(paused.line, 1, paused.line, 1),
          options: { isWholeLine: true, className: "current-line", glyphMarginClassName: "current-glyph" },
        });
        editor.revealLineInCenterIfOutsideViewport(paused.line);
      }
    }

    decoRef.current = editor.deltaDecorations(decoRef.current, decos);
  }, [breakpoints, paused, active, file?.content, isNlt, nlt.generated, nlt.breakpoints, nlt.lineBreakpoints, nlt.activeBlock, nlt.file, nlt.sourceLine]);

  if (!file) {
    return (
      <div className="editor-empty">
        <p>Open a file from the tree.</p>
        <p className="hint">Ctrl+S save · click the gutter to set breakpoints · ▶ Run</p>
      </div>
    );
  }

  return (
    <Editor
      key={active ?? ""}
      language={langForPath(file.path)}
      theme="nlt-dark"
      value={file.content}
      onChange={(v) => {
        edit(file.path, v ?? "");
        if (file.path.endsWith(".nlt")) useDebug.getState().nltMarkStale(file.path);
      }}
      beforeMount={beforeMount}
      onMount={onMount}
      options={{
        fontSize: 13,
        fontFamily: "'Cascadia Code', Consolas, monospace",
        minimap: { enabled: false },
        glyphMargin: true,
        folding: false,             // no folding gutter — keep the margin tight
        lineNumbersMinChars: 3,
        lineDecorationsWidth: 4,
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
        renderWhitespace: "selection",
        readOnly: nltLocked,
      }}
    />
  );
}
