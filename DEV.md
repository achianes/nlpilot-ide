# nlpilot-ide — dev guide

Reference editor/debugger for the [nlpilot](https://github.com/achianes/nlpilot) framework.
Debugs `.nlt` scripts at block level and plain Python at line level. See
[REBUILD_PLAN.md](REBUILD_PLAN.md) for the full architecture and phase plan.

## Stack

- **Backend**: FastAPI + WebSocket (`nlpilot_ide/server`)
- **Frontend**: React + TypeScript + Monaco + Vite (`web/`)
- **Shell**: pywebview desktop window (`nlpilot_ide/desktop`)

## Setup

```bash
pip install -e .
pip install -e ../nlpilot          # nlpilot framework, editable
cd web && npm install
```

## Run

**Desktop app** (builds must exist first):

```bash
cd web && npm run build
nlpilot-ide                        # native window on http://127.0.0.1:8760
```

**Browser dev** (hot reload):

```bash
# terminal 1 — backend
nlpilot-ide-server
# terminal 2 — frontend (proxies /ws + /api to :8760)
cd web && npm run dev              # http://127.0.0.1:5173
```

## Test

```bash
python -m pytest tests/ -q         # backend + WS handshake
cd web && npm run build            # typecheck (tsc) + bundle
```

## Status

**Phase 0 done**: FastAPI+WS hub, React+Monaco scaffold, pywebview shell,
end-to-end hello/ping-pong handshake.

**Phase 1 done**: project file API (tree/read/write, path-traversal guard,
`NLPILOT_IDE_ROOT` env), Monaco editor with tabs, file tree, open/save
(Ctrl+S), dirty indicators, `.nlt` language (Monarch: backend directives,
functions, placeholders, EXPECT/SAVE verbs) + `nlt-dark` theme, per-extension
language mapping. Verified live in browser: tree, open, highlight, dirty→save
round trip. 11 pytest passing.

**Phase 2 done**: Python debug engine. `engines/python_engine.py` ports the bdb
`DebuggerBackend` (subprocess + pipes) verbatim and adds `PythonDebugSession`
(non-blocking `poll_messages()` → normalized protocol dicts). `controller.py`
routes WS commands to the engine and translates abs↔project-relative paths. WS
handler runs a command receiver + an event pump concurrently. Frontend: debug
toolbar (Run/Continue/Step Over/Into/Out/Stop), breakpoint gutter (glyph-margin
click), current-line + breakpoint decorations, Variables + Call Stack panels,
streaming Console, `input.request` via prompt. Verified live: breakpoint pause,
locals, call stack, stdout streaming, step-over, breakpoint re-hit across loop
iterations, continue-to-end → idle. 9 pytest passing (incl. E2E debug over WS).

**Known item**: Monaco currently loads from the jsdelivr CDN (default of
`@monaco-editor/react`). Fine online; for the offline desktop build we must
bundle Monaco locally via `loader.config({ monaco })` + `vite-plugin-monaco-editor`.
Tracked for Phase 5 (packaging) — do earlier if offline dev is needed.

**Phase 3 done** (upstream nlpilot): `nlpilot/debug.py` `DebugHook`, `Env.snapshot()`,
`Block` source spans, `Runner.generate()` (compile-only). 4 pytest in nlpilot/tests.

**Phase 4 done**: nlpilot dual-view debugging.
- `engines/nlpilot_engine.py`: `generate()` (compile-only via nlpilot), `GenTracer`
  (settrace line-stepper over `<nlpilot>` generated code — into/over/out/continue/
  stop, testable in isolation), `IDEHook` (DebugHook→pipe), `NlpilotDebugSession`
  (subprocess + `poll_messages`).
- `controller.py`: routes both engines (unified flow commands), `nlt.generate`
  off-thread.
- Frontend: `Generate` + `Debug .nlt` buttons, read-only `GenView` (combined
  generated Python, block headers, current-gen-line highlight, block breakpoints
  via gutter), **dual synced highlight** (gen line ↔ `.nlt` block span),
  edit-invalidates-debug (stale banner + auto-halt).
- Verified live (canned events; real run needs Ollama+backends): gen pane renders,
  dual highlight (`.nlt` block L10-11 ↔ gen L10), locals, stale banner + halt,
  two-editor split layout. GenTracer: 6 pytest. Controller/generate: 3 pytest.
  Total 18 IDE pytest + 4 nlpilot pytest.

nlpilot installed editable into the IDE env: `pip install -e ../nlpilot --no-deps`.

**Phase 5 (in progress)**:
- Monaco bundled locally (offline): `monaco-editor` ESM core + only python/markdown/
  yaml/shell basic-languages + editor.worker, wired via `loader.config({ monaco })`
  in main.tsx. Verified: zero jsdelivr requests, `nlt`/`python` registered, ~655KB
  gzip bundle.
- Blocks panel (dbg sidebar): per-block status (✓/✗/▶/·), assertion failures,
  error, self-correction attempts, block-breakpoint toggle. Verified via canned events.
- Packaging: `pip install -e .` installs `nlpilot-ide` + `nlpilot-ide-server`
  console scripts; desktop shell imports clean. (Full frozen build via PyInstaller
  = TODO.)
- Deferred: deep LLM-I/O panel needs an upstream nlpilot llm hook (prompt/response
  events) — not yet emitted.

NOTE: the preview browser in the current session is stuck at a 0×0 viewport, so
Monaco can't paint view-lines there; logic/decorations/network verified via
`window.__ide` eval instead. Real window rendering is unaffected.
