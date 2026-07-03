"""Draw the nlpilot-ide app icon (multi-size .ico) with Pillow.

Design: dark rounded editor tile, teal play triangle (run/debug), red gutter
breakpoint dot, grey "code" lines. Run: python scripts/make_icon.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "nlpilot_ide" / "desktop" / "nlpilot-ide.ico"

BG = (30, 34, 42, 255)        # dark editor
BORDER = (78, 201, 176, 255)  # teal
PLAY = (78, 201, 176, 255)
DOT = (229, 20, 0, 255)       # breakpoint red
CODE = (140, 150, 165, 255)   # grey code lines
CODE2 = (86, 156, 214, 255)   # blue-ish keyword line


def draw(size: int) -> Image.Image:
    s = size
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = s // 5
    m = max(1, s // 32)  # margin

    # tile + border
    d.rounded_rectangle([m, m, s - m, s - m], radius=r, fill=BG,
                        outline=BORDER, width=max(1, s // 24))

    # code lines (right side)
    lx = int(s * 0.46)
    lw = max(2, s // 14)
    gap = int(s * 0.17)
    y0 = int(s * 0.26)
    widths = [0.36, 0.28, 0.34]
    colors = [CODE2, CODE, CODE]
    for i, (w, c) in enumerate(zip(widths, colors)):
        y = y0 + i * gap
        d.rounded_rectangle([lx, y, lx + int(s * w), y + lw], radius=lw // 2, fill=c)

    # breakpoint dot on the middle line's gutter
    dr = max(2, int(s * 0.055))
    cy = y0 + gap + lw // 2
    d.ellipse([int(s * 0.16) - dr, cy - dr, int(s * 0.16) + dr, cy + dr], fill=DOT)

    # play triangle bottom-left
    px, py = int(s * 0.20), int(s * 0.60)
    pw, ph = int(s * 0.22), int(s * 0.24)
    d.polygon([(px, py), (px, py + ph), (px + pw, py + ph // 2)], fill=PLAY)

    return img


def main() -> None:
    sizes = [16, 24, 32, 48, 64, 128, 256]
    base = draw(256)
    imgs = [draw(s) for s in sizes]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    base.save(OUT, format="ICO", sizes=[(s, s) for s in sizes],
              append_images=imgs)
    print("wrote", OUT)


if __name__ == "__main__":
    main()
