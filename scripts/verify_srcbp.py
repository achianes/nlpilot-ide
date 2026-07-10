"""Headless check: .nlt source line -> generated breakpoint line mapping in the UI."""

import os
import threading
import time
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
PORT = 8762


def serve():
    import uvicorn

    os.environ["NLPILOT_IDE_ROOT"] = str(REPO)
    uvicorn.run("nlpilot_ide.server.app:app", host="127.0.0.1", port=PORT, log_level="warning")


BLOCK = {
    "index": 0, "backend": "web", "fromCache": False,
    "lineStart": 3, "lineEnd": 7, "lineMap": [3, 4, 5, 6, 7],
    "code": ("# L1\nenv.get('https://x')\n# L2\nenv.fill('S','q',submit=True)\n"
             "# L3\nenv.wait(2)\n# L4\nenv.expect(True,'m')\n# L5\nenv.screenshot('r.png')"),
    "raw": False,
}
RAW = {
    "index": 1, "backend": "bash", "fromCache": False,
    "lineStart": 10, "lineEnd": 13, "lineMap": [10, 11, 12, 13],
    "code": "total = 0\n# a comment\n\nenv.log(total)",
    "raw": True,
}


def main():
    threading.Thread(target=serve, daemon=True).start()
    time.sleep(3)
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    o = Options()
    o.add_argument("--headless=new")
    o.add_argument("--window-size=1400,900")
    d = webdriver.Chrome(options=o)
    try:
        d.get(f"http://127.0.0.1:{PORT}")
        time.sleep(3)
        res = d.execute_script("""
            const {sourceToGen, genLineToSource} = window.__ide;
            const B = arguments[0], R = arguments[1];
            const out = {};
            // marker block: .nlt line 4 (instruction 2) -> first exec line after # L2 = 4
            out.src4  = sourceToGen(B, 4);
            out.src7  = sourceToGen(B, 7);
            out.srcNA = sourceToGen(B, 99);
            // raw block: line 11 is a comment -> snaps to next executable (line 13 -> gen 4)
            out.raw10 = sourceToGen(R, 10);
            out.raw11 = sourceToGen(R, 11);
            // round-trip: bp at gen 4 of B maps back to .nlt 4
            out.back  = genLineToSource(B, out.src4);
            return out;
        """, BLOCK, RAW)
        print(res)
        assert res["src4"] == 4 and res["back"] == 4, "marker mapping broken"
        assert res["src7"] == 10, "last instruction should map to gen line 10"
        assert res["srcNA"] is None
        assert res["raw10"] == 1 and res["raw11"] == 4, "raw snapping broken"
        print("ALL MAPPING CHECKS PASS")
    finally:
        d.quit()


if __name__ == "__main__":
    main()
