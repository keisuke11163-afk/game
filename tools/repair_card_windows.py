#!/usr/bin/env python3
"""Clear the transparent illustration windows in the six rarity card frames.

These areas are intentionally transparent so the card art can appear underneath.
Polygon masks avoid medallions, gems, the name banner, and bright corner stars.
Original RGB pixels outside the mask are preserved byte-for-byte.
"""
from pathlib import Path
import json

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
CARDS = ROOT / "assets" / "cards"

# All coordinates refer to the existing 512 x 768 assets.
# The tapered top excludes the two medallions; the lower bevel excludes the
# wood/metal border, attached sparkles, and the name ribbon.
WINDOWS = {
    "frame-common.png": [
        (158, 139), (353, 139), (353, 185), (427, 185),
        (438, 194), (438, 464), (427, 479), (411, 487),
        (107, 487), (94, 479), (91, 466), (91, 195),
        (101, 185), (158, 185)
    ],
    "frame-uncommon.png": [
        (156, 154), (356, 154), (356, 187), (430, 187),
        (440, 198), (440, 467), (429, 484), (415, 496),
        (102, 496), (82, 484), (79, 466), (79, 199),
        (90, 187), (156, 187)
    ],
    "frame-rare.png": [
        (158, 174), (354, 174), (354, 198), (424, 198),
        (439, 210), (439, 475), (424, 495), (409, 504),
        (106, 504), (85, 495), (81, 475), (81, 210),
        (94, 198), (158, 198)
    ],
    "frame-epic.png": [
        (158, 191), (351, 191), (351, 220), (427, 220),
        (437, 235), (437, 480), (427, 497), (412, 505),
        (106, 505), (89, 497), (81, 480), (81, 233),
        (91, 220), (158, 220)
    ],
    "frame-legendary.png": [
        (160, 208), (350, 208), (350, 224), (407, 224),
        (419, 237), (419, 474), (409, 487), (389, 494),
        (124, 494), (108, 488), (94, 476), (94, 238),
        (106, 225), (160, 225)
    ],
    "frame-special.png": [
        (159, 173), (355, 173), (355, 189), (418, 189),
        (428, 205), (428, 466), (416, 481), (407, 491),
        (112, 491), (97, 480), (90, 466), (90, 205),
        (99, 190), (159, 190)
    ],
}


def main():
    report = {}
    for name, polygon in WINDOWS.items():
        path = CARDS / name
        image = Image.open(path).convert("RGBA")
        if image.size != (512, 768):
            raise RuntimeError(f"Unexpected size {name} {image.size}; original preserved")
        mask = Image.new("L", image.size, 0)
        ImageDraw.Draw(mask).polygon(polygon, fill=255)
        alpha = np.array(image.getchannel("A"))
        m = np.array(mask) > 0
        changed = int(np.count_nonzero(alpha[m]))
        if changed:
            arr = np.array(image)
            arr[m, :3] = 0  # invisible pixels: optimize PNG size
            arr[m, 3] = 0
            # Visible pixels remain unchanged (no generated or painted objects).
            Image.fromarray(arr, "RGBA").save(path, optimize=True)
        report[name] = {"window_mask_pixels": int(m.sum()),
                        "pixels_cleared": changed}
        print(name, changed)
    out = ROOT / "reports" / "card-window-cleanup.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


if __name__ == "__main__":
    main()
