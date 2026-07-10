# nlpilot IDE — Rebuild Plan

Turn `python_dbg_gui` into the reference editor/debugger for **nlpilot**. Drop tkinter. New stack: Python (FastAPI + WebSocket) backend, React + TypeScript + Monaco frontend, shipped as a pywebview desktop app. Debug both `.nlt` scripts (block-level) and plain Python (line-level).

---

## 1. Why the current design mostly survives

The existing tk app already isolates the debug engine from the UI:

- `DebuggerBackend` (bdb + `sys.settrace`, runs in a subprocess) has **zero tk imports**.
- UI talks to it over a `multiprocessing.Pipe` with a simple message protocol (`('line', ...)`, `('variables', ...)`, `('stack', ...)`, commands back).

So the rebuild is: **keep the engine idea, replace Pipe→tk with WebSocket→React.** The message protocol becomes a JSON WS protocol. ~2k LOC of tk (panels, dialogs, menus, themes, custom notebook) is deleted, not ported.

## 2. Two debug models

nlpilot does not execute like normal Python. It compiles NL → Python → `exec()` in a flat, throwaway namespace, with a self-correction retry loop. Line-stepping is meaningless there. The IDE needs **two engines behind one UI**:

| | Python engine | nlpilot engine |
|---|---|---|
| Unit | source line | **Block** (one `@backend` instruction group) |
| Step | into / over / out (bdb) | next block / step-into-generated-Python |
| Breakpoints | line numbers | block index, backend, "on assertion fail", "on correction" |
| Inspect | frame locals/globals | backend `Env` state, generated code, LLM prompt+response, cache hit, correction attempts, assertions |
| Pause points | every line | block-enter, pre-exec, on-exception, on-correction, block-exit |

The nlpilot engine can *also* drop into the Python engine: when a block's generated code runs, `sys.settrace` can line-step inside that generated Python. Best of both.

## 2b. The nlpilot debug experience (headline UX)

The way a user debugs an `.nlt`:

1. **Generate.** A `Generate` button on the `.nlt` editor compiles every block to
   Python *without running it* — instantiate `get_backend(name)(config)` (no
   `setup()`, so no browser/selenium launch) and call `Compiler.compile()` per
   block. Cheap: LLM calls (or cache hits) only. Result opens beside the `.nlt`
   in a **read-only** generated-Python view (Monaco, `readOnly: true`).

2. **Step the generated Python.** In that read-only view: step-in / step-over /
   step-out / continue, line by line, powered by the Python engine (`sys.settrace`
   on each block's compiled code, filename `<nlpilot>`).

3. **Dual synchronized highlight.** While stepping, two things light up at once:
   - the current **generated-Python line** in the read-only view, and
   - the **source `.nlt` block** it belongs to, in the `.nlt` editor.

   Granularity: nlpilot compiles **per block** (a group of NL lines → one Python
   function), so the finest honest mapping is *gen-Python line → source block*.
   The whole active block is highlighted in the `.nlt` while its Python steps.
   (Per-NL-line mapping is not possible — one block = one opaque LLM translation.)

4. **Edit-invalidates-debug.** Generated code + cache are keyed on the SHA256 of
   block text. If the user edits the `.nlt` while a debug session is live, the
   mapping and cache are stale → the engine **halts the debug session and prompts
   the user to stop and regenerate** before continuing. (Editor can flag the
   changed blocks; only those need recompiling.)

### What this requires from nlpilot (upstream, additive)

- **Block source spans** — `Block` gains `line_start` / `line_end` (1-based, into
  the original `.nlt`) so the engine can map a block index → source lines for
  highlight. Parser (`script.py`) tracks them; `explode_lines` narrows per line.
- **Generate-only path** — `Runner.generate(blocks) -> list[GeneratedBlock]`
  returning `(block, code, from_cache)` per block, instantiating envs WITHOUT
  `setup()`. No execution, no assertions.
- **DebugHook** (already planned, §4) reports, at each pause, the active block
  index + the current line within its generated code, so the engine can drive
  both highlights.

## 3. Target architecture

```
┌────────────────────────── pywebview window ──────────────────────────┐
│  React + TS + Monaco (frontend, static build served by backend)       │
│   - Monaco editors (tabs): .nlt + .py + generated-code view           │
│   - Panels: Blocks timeline · Backends/Env state · LLM I/O · Console  │
│             · Stack · Variables · Assertions · Breakpoints            │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │  WebSocket (JSON events + commands)
┌───────────────────────────────▼───────────────────────────────────────┐
│  FastAPI backend (ide/server)                                          │
│   - WS hub, session state, file I/O, run-config, project index         │
│   - DebugController: routes commands to the right engine               │
└───────────┬───────────────────────────────────┬───────────────────────┘
            │ subprocess + pipe                   │ subprocess + pipe
┌───────────▼─────────────┐          ┌────────────▼──────────────────────┐
│ PythonDebugEngine       │          │ NlpilotDebugEngine                 │
│ (bdb/settrace, reused   │          │ wraps nlpilot Runner; consumes     │
│  from current backend)  │          │ new nlpilot debug-hook events;     │
│                         │          │ can settrace generated code        │
└─────────────────────────┘          └───────────┬────────────────────────┘
                                                  │ imports
                                      ┌───────────▼────────────┐
                                      │ nlpilot (new debug API) │
                                      └─────────────────────────┘
```

## 4. nlpilot changes (upstream, in the nlpilot repo)

Add an **observer/event hook API** — non-invasive, default no-op, zero cost when unused.

New `nlpilot/debug.py`:

```python
class DebugHook:              # base, all methods no-op
    def on_run_start(self, blocks): ...
    def on_block_enter(self, i, block): ...
    def on_compile(self, i, code, from_cache): ...
    def on_before_exec(self, i, code, ns): ...      # ns = exec namespace (live)
    def on_exception(self, i, err, tb): ...
    def on_correction(self, i, attempt, new_code): ...
    def on_assertions(self, i, failures): ...
    def on_block_exit(self, i, result): ...
    def on_run_end(self, report): ...
    def should_pause(self, event, i) -> bool: ...   # breakpoint check → engine blocks here
```

Wiring:
- `Runner.__init__` / `run_blocks`: accept `hook: DebugHook | None`; fire `on_run_start`, `on_block_enter`, `on_block_exit`, `on_run_end` around the loop ([runner.py:56-69](../../../nlpilot/nlpilot/runner.py)).
- `Executor.run_block`: accept the hook; fire `on_compile`, `on_before_exec`, `on_exception`, `on_correction`, `on_assertions` at the existing phase boundaries ([executor.py:34-88](../../../nlpilot/nlpilot/executor.py)).
- Pause = hook method calls `should_pause`; the IDE's hook implementation blocks on a threading event until the user hits continue/step. This gives real breakpoints with no change to nlpilot's control flow.
- Expose `Env` introspection: a `snapshot()` on `backends/base.py` returning safe repr of key backend state (current url, cwd, last response, assertion list).

These are additive. `nlpilot run` from CLI is unchanged (hook stays None).

## 5. New repo layout (python_dbg_gui → nlpilot-ide)

```
nlpilot_ide/
  server/
    app.py            # FastAPI + WS + static serving
    ws_protocol.py    # typed event/command schema (mirrors frontend types)
    controller.py     # DebugController: session, routing, run-config
    engines/
      base.py         # Engine interface
      python_engine.py# ported DebuggerBackend (bdb) + pipe adapter
      nlpilot_engine.py# DebugHook impl → WS events; drives nlpilot Runner
    project.py        # file tree, .nlt/.py open/save, config.json load
  web/                # React + TS + Vite + Monaco
    src/
      editor/         # Monaco tabs, .nlt syntax, generated-code view
      panels/         # Blocks, Backends, LLM-IO, Console, Stack, Vars, Assertions
      ws/             # client, typed messages, reconnect
      state/          # store (zustand)
  desktop/
    main.py           # pywebview: start server thread, open window
  pyproject.toml      # entry point: nlpilot-ide
```

Ollama chat feature: keep as an optional panel (nlpilot already uses Ollama) — port `chat.py` logic to a WS-driven React panel, or defer to phase 5.

## 6. WebSocket protocol (sketch)

Events (server→client): `run.start`, `block.enter`, `block.compile`, `block.beforeExec`, `block.exception`, `block.correction`, `block.assertions`, `block.exit`, `run.end`, `py.line`, `py.stack`, `py.vars`, `stdout`, `stderr`, `env.snapshot`, `llm.call`, `llm.response`.
Commands (client→server): `run`, `stop`, `continue`, `stepBlock`, `stepInto`, `stepOver`, `stepOut`, `setBreakpoint`, `clearBreakpoint`, `eval`, `openFile`, `saveFile`, `setConfig`.

Single typed schema in `ws_protocol.py` + generated/mirrored TS types → no drift.

## 7. Phased delivery

**Phase 0 — Scaffold** (small): FastAPI + WS echo, Vite React app in `web/`, pywebview window loads it, build pipeline (`vite build` → served static). One end-to-end "hello over WS" click.

**Phase 1 — Editor + files**: Monaco tabs, file tree, open/save `.nlt` and `.py`, `.nlt` syntax highlighting (port from `editor.py` patterns), config.json editor.

**Phase 2 — Python engine**: port `DebuggerBackend` unchanged; pipe→WS adapter; run/pause/step/breakpoints/vars/stack/console for plain `.py`. Proves the whole loop with the known-good engine.

**Phase 3 — nlpilot hooks + generate (upstream)**: add `nlpilot/debug.py`
(`DebugHook`) + wiring, `Env.snapshot()`, **Block source spans** (`line_start`/
`line_end` in `script.py`), and **`Runner.generate()`** (compile-only, no
`setup()`). Unit-test: hooks fire in order, spans correct, generate runs without
launching a backend. PR to nlpilot repo.

**Phase 4 — nlpilot engine + dual-view stepping** (headline, per §2b):
- `Generate` button → read-only generated-Python view beside the `.nlt`.
- Step-in/over/out/continue through generated Python (Python engine over
  `<nlpilot>` code).
- **Dual synchronized highlight**: gen-Python current line ↔ source `.nlt` block.
- **Edit-invalidates-debug**: editing `.nlt` mid-session halts debug + prompts
  stop/regenerate; changed blocks flagged for recompile.
- Panels: Blocks timeline, Backends/Env state, LLM-I/O, Assertions, corrections.
- Block-level breakpoints (+ line breakpoints inside generated code).

**Phase 5 — polish**: step-into-generated-code (settrace bridge), Ollama chat panel, themes, keybindings, packaging (`pip install nlpilot-ide` + pywebview build), docs, tests.

## 8. Risks / decisions still open

- **Monorepo vs two repos**: nlpilot changes live in `D:\Programs\nlpilot`; IDE here. Keep separate, IDE depends on nlpilot as a package (editable install during dev). ✔ assumed.
- **pause-in-hook threading**: nlpilot runs blocks synchronously; blocking in the hook is safe (single run thread) but stdout redirection + WS must run off that thread. Handle via the existing subprocess isolation pattern.
- **Vision/GUI backends** (pyautogui, selenium) open real windows during a debug run — fine, but the IDE should surface screenshots in the LLM-I/O panel for the vision backend.
- **Testing**: add pytest for engines + hook ordering (repo currently has zero tests).

---

### Immediate next step
Approve, then I start **Phase 0 scaffold** (server + web + pywebview handshake). Small, reviewable, proves the architecture before bulk work.
