#!/usr/bin/env python3
"""Conservative alpha cleanup for Castlefield PNG assets.

Never blanket-remove backgrounds. A correction only occurs for a very uniform
matte connected to 3+ opaque corners or tiny (<4px) isolated interior pinholes.
Large inner windows, effects, highlights, and intentionally opaque art stay.
"""
from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
FOLDERS = ("cards", "units", "ui", "fx", "bg")


def kind(path):
    rel = path.relative_to(ASSETS).as_posix()
    if rel.startswith("bg/"):
        return "background_keep"
    if rel.startswith("cards/card-"):
        return "illustration_keep"
    if rel.startswith("ui/") and (path.name.startswith("title-") or path.name == "card-back.png"):
        return "possibly_opaque_ui"
    return "cutout_candidate"


def stats(a):
    alpha = a[:, :, 3]
    edge = np.concatenate((alpha[0, :], alpha[-1, :], alpha[:, 0], alpha[:, -1]))
    return {
        "transparent_pct": round(float(np.mean(alpha <= 2) * 100), 2),
        "translucent_pct": round(float(np.mean((alpha > 2) & (alpha < 253)) * 100), 2),
        "opaque_border_pct": round(float(np.mean(edge >= 253) * 100), 2),
    }


def external_matte(a):
    h, w = a.shape[:2]
    if min(h, w) < 64:
        return None
    k = max(4, min(h, w) // 70)
    corners = (a[:k, :k], a[:k, -k:], a[-k:, :k], a[-k:, -k:])
    samples = []
    for patch in corners:
        pixels = patch.reshape(-1, 4).astype(np.float32)
        samples.append((
            np.median(pixels[:, :3], axis=0),
            float(np.mean(pixels[:, 3] >= 252)),
            float(np.max(np.std(pixels[:, :3], axis=0))),
        ))
    group = []
    for color, opacity, deviation in samples:
        if opacity < 0.96 or deviation > 9:
            continue
        hits = [j for j, (c, alpha, sd) in enumerate(samples)
                if alpha >= .96 and sd < 9 and np.linalg.norm(c - color) <= 13]
        if len(hits) >= 3:
            group = hits
            break
    if not group:
        return None
    key = np.median(np.stack([samples[j][0] for j in group]), axis=0)
    delta = np.linalg.norm(a[:, :, :3].astype(np.float32) - key, axis=2)
    candidates = ((delta <= 24) & (a[:, :, 3] >= 250)).astype(np.uint8)
    count, labels, _, _ = cv2.connectedComponentsWithStats(candidates, 8)
    border_ids = set(map(int, np.unique(np.concatenate((
        labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]
    ))))) - {0}
    if not border_ids:
        return None
    matte = np.isin(labels, list(border_ids))
    share = float(np.mean(matte))
    edge = np.concatenate((matte[0, :], matte[-1, :], matte[:, 0], matte[:, -1]))
    if not (.04 <= share <= .94 and np.mean(edge) >= .65):
        return None
    # Edge smoothing only. Never alter opaque interior artwork or its RGB.
    soft = cv2.GaussianBlur(matte.astype(np.uint8) * 255, (3, 3), .45)
    output = a.copy()
    output[:, :, 3] = np.minimum(
        output[:, :, 3].astype(np.uint16), 255 - soft.astype(np.uint16)
    ).astype(np.uint8)
    return output, {"matte_color": [int(round(x)) for x in key],
                    "removed_pct": round(share * 100, 2)}


def small_pinholes(a):
    clear = (a[:, :, 3] == 0).astype(np.uint8)
    n, labels, bounds, _ = cv2.connectedComponentsWithStats(clear, 8)
    h, w = clear.shape
    result = a.copy()
    fixed = 0
    for i in range(1, n):
        x, y, ww, hh, area = map(int, bounds[i])
        if area > 3 or x <= 0 or y <= 0 or x + ww >= w or y + hh >= h:
            continue
        local_alpha = a[y-1:y+hh+1, x-1:x+ww+1, 3]
        valid = local_alpha >= 250
        if np.mean(valid) < .86 or np.count_nonzero(valid) < 5:
            continue
        colors = a[y-1:y+hh+1, x-1:x+ww+1, :3][valid].astype(np.float32)
        if np.max(np.std(colors, axis=0)) > 24:
            continue
        yy, xx = np.where(labels[y:y+hh, x:x+ww] == i)
        result[y+yy, x+xx, :3] = np.median(colors, axis=0).astype(np.uint8)
        result[y+yy, x+xx, 3] = 255
        fixed += int(area)
    return result, fixed


def analyze(path, apply):
    rel = path.relative_to(ASSETS).as_posix()
    out = {"path": rel, "category": kind(path), "status": "unchanged", "notes": []}
    try:
        source = Image.open(path)
        image = np.array(source.convert("RGBA"))
        h, w = image.shape[:2]
        out.update({"width": w, "height": h, "mode": source.mode, **stats(image)})
        if out["category"] != "cutout_candidate":
            out["status"] = "excluded"
            return out
        candidate = image.copy()
        if out["opaque_border_pct"] > 75:
            fixed = external_matte(candidate)
            if fixed:
                candidate, detail = fixed
                out["matte"] = detail
                out["status"] = "would_repair"
            elif out["transparent_pct"] < 1:
                out["status"] = "review_required"
                out["notes"].append("opaque_cutout_needs_visual_review")
        if not rel.startswith("cards/frame-"):
            candidate, holes = small_pinholes(candidate)
            if holes:
                out["pinholes_fixed"] = holes
                out["status"] = "would_repair"
        if apply and out["status"] == "would_repair":
            buffer = io.BytesIO()
            Image.fromarray(candidate, "RGBA").save(buffer, format="PNG", optimize=True)
            payload = buffer.getvalue()
            if len(payload) > max(300_000, path.stat().st_size * 1.5):
                out["status"] = "review_required"
                out["notes"].append("repair_exceeds_image_size_budget")
            else:
                path.write_bytes(payload)
                out["status"] = "repaired"
                out["after"] = stats(candidate)
        return out
    except Exception as e:
        out["status"] = "error"
        out["notes"].append(str(e))
        return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--report", default="reports/asset-alpha-audit.json")
    args = parser.parse_args()
    paths = sorted(p for group in FOLDERS for p in (ASSETS / group).rglob("*.png"))
    results = [analyze(p, args.apply) for p in paths]
    counts = {}
    for item in results:
        counts[item["status"]] = counts.get(item["status"], 0) + 1
    report = {"total_png": len(results), "applied": args.apply,
              "status_counts": counts, "files": results}
    dest = ROOT / args.report
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Audited {len(results)} PNGs: {counts}")
    for r in results:
        if r["status"] in ("repaired", "would_repair", "review_required", "error"):
            print(r["status"], r["path"], r["notes"])
    return 1 if counts.get("error", 0) else 0


if __name__ == "__main__":
    raise SystemExit(main())
