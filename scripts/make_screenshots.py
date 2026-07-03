"""Generate README screenshots with a headless Chrome against a local server.

Seeds demo state through the window.__ide dev handles (no Ollama, no devices),
so the shots are reproducible and contain no personal data.

Run:  python scripts/make_screenshots.py
Writes docs/screenshot-*.png
"""

import os
import sys
import threading
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PORT = 8761
URL = f"http://127.0.0.1:{PORT}"

DEMO_BLOCKS = """[
  {"index":0,"backend":"web","fromCache":false,"lineStart":3,"lineEnd":7,
   "lineMap":[3,4,5,6,7],
   "code":"# L1\\nenv.get(\\"https://duckduckgo.com\\")\\n# L2\\nenv.fill(\\"Search\\", \\"nlpilot\\", submit=True)\\n# L3\\nenv.wait(2)\\n# L4\\nenv.expect(env.has_text(\\"nlpilot\\"), \\"Page does not contain 'nlpilot'\\")\\n# L5\\nenv.screenshot(\\"results.png\\")"},
  {"index":1,"backend":"bash","fromCache":true,"lineStart":10,"lineEnd":11,
   "lineMap":[10,11],
   "code":"# L1\\ncurrent_dir = env.run(\\"pwd\\").strip()\\nprint(current_dir)\\n# L2\\nenv.expect(len(current_dir) > 0, \\"empty output\\")"},
  {"index":2,"backend":"bash","fromCache":false,"lineStart":18,"lineEnd":18,
   "lineMap":[18],
   "code":"# L1\\nenv.run(\\"echo 'hello from a function'\\")"}
]"""


def serve() -> None:
    import uvicorn

    os.environ["NLPILOT_IDE_ROOT"] = str(REPO)
    uvicorn.run("nlpilot_ide.server.app:app", host="127.0.0.1", port=PORT, log_level="warning")


def main() -> None:
    threading.Thread(target=serve, daemon=True).start()
    time.sleep(3)

    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    opts = Options()
    opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1720,1000")
    opts.add_argument("--hide-scrollbars")
    driver = webdriver.Chrome(options=opts)
    out = REPO / "docs"
    out.mkdir(exist_ok=True)

    try:
        driver.get(URL)
        time.sleep(4)  # app + monaco boot

        # ---- shot 1: editor + .nlt syntax + file tree ----
        driver.execute_script(
            "return window.__ide.store.getState().openFile('examples/demo.nlt')")
        time.sleep(3)
        driver.save_screenshot(str(out / "screenshot-editor.png"))

        # ---- shot 2: dual-view debug, paused with exact line mapping ----
        driver.execute_script(f"""
            const {{debug}} = window.__ide;
            const blocks = {DEMO_BLOCKS};
            debug.setState(s => ({{nlt: {{...s.nlt, file: 'examples/demo.nlt'}}}}));
            debug.getState().ingest({{type:'nlt.generated', payload:{{blocks}}}});
            debug.getState().nltToggleBreakpoint(1);
            debug.getState().ingest({{type:'nlt.runStart', payload:{{blocks:3}}}});
            debug.getState().ingest({{type:'stdout', payload:{{text:'── block #0 @web ──\\n'}}}});
            debug.getState().ingest({{type:'nlt.blockExit', payload:{{index:0, ok:true, attempts:1, error:null}}}});
            debug.getState().ingest({{type:'stdout', payload:{{text:'── block #0 ✓ ok ──\\n── block #1 @bash ──\\n[nlpilot] PASS: assertion 1 ok\\n/home/user/project\\n'}}}});
            debug.getState().ingest({{type:'nlt.blockEnter', payload:{{index:1, backend:'bash', lineStart:10, lineEnd:11}}}});
            debug.getState().ingest({{type:'nlt.line', payload:{{index:1, genLine:2,
                locals:{{current_dir: "'/home/user/project'"}}}}}});
        """)
        time.sleep(3)
        driver.save_screenshot(str(out / "screenshot-debug.png"))
        print("saved:", [p.name for p in out.glob("screenshot-*.png")])
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
