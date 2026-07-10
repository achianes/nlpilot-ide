import React from "react";
import ReactDOM from "react-dom/client";
// Core editor only (no bundled languages), then just the ones we use — keeps the
// bundle small while staying fully offline.
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import "monaco-editor/esm/vs/basic-languages/python/python.contribution";
import "monaco-editor/esm/vs/basic-languages/markdown/markdown.contribution";
import "monaco-editor/esm/vs/basic-languages/yaml/yaml.contribution";
import "monaco-editor/esm/vs/basic-languages/shell/shell.contribution";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import { loader } from "@monaco-editor/react";
import { App } from "./App";
import { useStore } from "./state/store";
import { genLineToSource, genLineToSourceSpan, sourceToGen, useDebug } from "./state/debug";
import "./styles.css";

// Bundle Monaco locally instead of fetching from the jsdelivr CDN, so the desktop
// app works fully offline. We only wire the base editor worker (enough for .nlt
// Monarch + Python highlighting + plain editing).
self.MonacoEnvironment = { getWorker: () => new editorWorker() };
loader.config({ monaco });

// Dev handles for debugging the IDE itself from the console.
import * as blocks from "./blocks/nltBlocks";
import * as BlocklyNS from "blockly";
(window as any).__ide = { store: useStore, debug: useDebug, monaco, genLineToSource, genLineToSourceSpan, sourceToGen, blocks, Blockly: BlocklyNS };

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
