# nlpilot-ide

The reference editor/debugger IDE for the [nlpilot](https://github.com/achianes/nlpilot)
natural-language automation framework — a web-tech desktop app (no more tkinter).

Debugs two things behind one UI:

- **`.nlt` scripts** — click **Generate** to compile every block to Python, then
  step through the generated code line by line. The current generated line and its
  source `.nlt` block light up together (dual synced view). Editing the `.nlt`
  during a session halts it and prompts a regenerate.
- **plain Python** — classic line-level debugging (breakpoints, step in/over/out,
  variables, call stack, console) via `bdb`.

## Stack

- **Backend**: FastAPI + WebSocket (`nlpilot_ide/server`)
- **Frontend**: React + TypeScript + Monaco (`web/`), Monaco bundled locally (offline)
- **Desktop shell**: pywebview (`nlpilot_ide/desktop`)

## Quick start

```bash
pip install -e .
pip install -e ../nlpilot          # the nlpilot framework, editable
cd web && npm install && npm run build && cd ..
nlpilot-ide                        # native window
# or browser dev with hot reload:
#   nlpilot-ide-server             # backend on :8760
#   cd web && npm run dev          # frontend on :5173
```

See [DEV.md](DEV.md) for the full dev guide and [REBUILD_PLAN.md](REBUILD_PLAN.md)
for architecture and roadmap.
