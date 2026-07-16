"""Desktop shell: start the backend in a thread, open a pywebview window on it.

`nlpilot-ide` (console entry point) → native window loading the local server.
Falls back to a clear message if the frontend isn't built yet.
"""

from __future__ import annotations

import threading
import time
from urllib.request import urlopen

import uvicorn
import webview

from ..server.run import HOST, PORT

_URL = f"http://{HOST}:{PORT}"


def _serve() -> None:
    uvicorn.run("nlpilot_ide.server.app:app", host=HOST, port=PORT, log_level="warning")


def _wait_for_server(timeout: float = 10.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urlopen(f"{_URL}/api/health", timeout=0.5)
            return True
        except Exception:  # noqa: BLE001
            time.sleep(0.1)
    return False


class _Api:
    """Exposed to the web app as window.pywebview.api — native dialogs, etc.

    NOTE: the window reference is a PRIVATE (underscore) attribute on purpose.
    pywebview enumerates public attributes of this object to expose them to JS and
    recurses into non-callable ones; a public `window` would make it descend into
    the pywebview Window (a .NET object under the EdgeChromium backend) and crash
    with "'_Api' value cannot be converted to System.Drawing.Rectangle". The
    leading underscore makes pywebview skip it.
    """

    def __init__(self) -> None:
        self._window = None

    def pick_folder(self):
        """Open the OS folder picker; return the chosen absolute path or None."""
        if not self._window:
            return None
        result = self._window.create_file_dialog(webview.FOLDER_DIALOG)
        if result:
            return result[0]
        return None


def main() -> None:
    # Spawn debug subprocesses with pythonw on Windows so no console window flashes.
    import sys
    if sys.platform == "win32":
        import multiprocessing
        import os

        pyw = os.path.join(os.path.dirname(sys.executable), "pythonw.exe")
        if os.path.exists(pyw):
            multiprocessing.set_executable(pyw)

    t = threading.Thread(target=_serve, daemon=True)
    t.start()
    if not _wait_for_server():
        raise RuntimeError("backend did not start in time")
    api = _Api()
    window = webview.create_window(
        "nlpilot-ide", _URL, width=1400, height=900, js_api=api,
        text_select=True,  # allow selecting/copying console output etc.
    )
    api._window = window
    webview.start()


if __name__ == "__main__":
    main()
