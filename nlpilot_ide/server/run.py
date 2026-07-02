"""Launch the backend with uvicorn. Used by the desktop shell and for browser mode.

`python -m nlpilot_ide.server.run` → serves on http://127.0.0.1:8760
"""

from __future__ import annotations

import uvicorn

HOST = "127.0.0.1"
PORT = 8760


def main() -> None:
    uvicorn.run("nlpilot_ide.server.app:app", host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
