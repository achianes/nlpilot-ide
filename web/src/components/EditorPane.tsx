import { useEffect, useRef } from "react";
import Editor, { type Monaco } from "@monaco-editor/react";
import { useStore } from "../state/store";
import { useDebug } from "../state/debug";
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
  const nltToggleBreakpoint = useDebug((s) => s.nltToggleBreakpoint);

  const isNlt = !!active && active.endsWith(".nlt");

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
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const a = useStore.getState().active;
      const line = e.target.position?.lineNumber;
      if (!a || !line) return;
      if (a.endsWith(".nlt")) {
        const gen = useDebug.getState().nlt.generated;
        const blk = gen?.find((b) => line >= b.lineStart && line <= b.lineEnd);
        if (blk) nltToggleBreakpoint(blk.index);
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
      if (gen) {
        for (const idx of nlt.breakpoints) {
          const b = gen.find((x) => x.index === idx);
          if (b) decos.push({
            range: new monaco.Range(b.lineStart, 1, b.lineStart, 1),
            options: { glyphMarginClassName: "bp-glyph" },
          });
        }
        if (nlt.file === active && nlt.activeBlock != null) {
          const b = gen.find((x) => x.index === nlt.activeBlock);
          if (b) {
            decos.push({
              range: new monaco.Range(b.lineStart, 1, b.lineEnd, 1),
              options: { isWholeLine: true, className: "current-block", glyphMarginClassName: "current-glyph" },
            });
            editor.revealLineInCenterIfOutsideViewport(b.lineStart);
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
  }, [breakpoints, paused, active, file?.content, isNlt, nlt.generated, nlt.breakpoints, nlt.activeBlock, nlt.file]);

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
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
        renderWhitespace: "selection",
      }}
    />
  );
}
