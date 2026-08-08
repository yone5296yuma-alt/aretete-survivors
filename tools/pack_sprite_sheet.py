"""
Pack rendered frames from vrm_sprite_pipeline.py (render mode) into a sprite
sheet PNG + .anim.json manifest matching the format assets.js already loads
(frameW/frameH/clips/variants) -- see assets/player/butlerRabbit.anim.json
for a working example of the target shape.

Usage:
  python tools/pack_sprite_sheet.py --renders tools/_render_out/butlerRabbit \
      --out assets/player/butlerRabbit3d --frame-size 96

By default frames are cleanly downscaled (LANCZOS, no forced pixelation) since
3D renders read better smooth; pass --pixelate to run them through the same
k-means palette quantization used for the photo-cutout pipeline in
rig_pipeline.py, for visual consistency with the pixel-art costumes.
"""
import argparse
import json
import os

import numpy as np
from PIL import Image

CLIP_ORDER = ["idle", "walk", "attack", "hurt", "cheer"]
CLIP_META = {
    "idle": {"fps": 3, "loop": True},
    "walk": {"fps": 10, "loop": True},
    "attack": {"fps": 12, "loop": False},
    "hurt": {"fps": 14, "loop": False},
    "cheer": {"fps": 6, "loop": True},
}


def alpha_bbox(img):
    a = np.array(img.split()[-1])
    ys, xs = np.where(a > 8)
    if len(xs) == 0:
        return None
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def kmeans_quantize(img, palette_size=16, seed=42):
    rgba = np.array(img)
    rgb = rgba[:, :, :3].reshape(-1, 3).astype(np.float32)
    alpha = rgba[:, :, 3].reshape(-1)
    mask = alpha > 8
    if mask.sum() == 0:
        return img
    rng = np.random.default_rng(seed)
    pixels = rgb[mask]
    k = min(palette_size, len(np.unique(pixels, axis=0)))
    idx = rng.choice(len(pixels), size=k, replace=False)
    centers = pixels[idx].copy()
    for _ in range(12):
        dists = ((pixels[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        assign = dists.argmin(axis=1)
        for c in range(k):
            sel = pixels[assign == c]
            if len(sel):
                centers[c] = sel.mean(axis=0)
    dists = ((pixels[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
    assign = dists.argmin(axis=1)
    quantized = rgb.copy()
    quantized[mask] = centers[assign]
    out = np.concatenate([quantized.reshape(rgba.shape[0], rgba.shape[1], 3), rgba[:, :, 3:4]], axis=2)
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--renders", required=True, help="dir containing <clip>/NNN.png subfolders")
    p.add_argument("--out", required=True, help="output path prefix, writes <out>.png and <out>.anim.json")
    p.add_argument("--frame-size", type=int, default=96)
    p.add_argument("--pixelate", action="store_true")
    p.add_argument("--palette-size", type=int, default=24)
    args = p.parse_args()

    clip_frame_paths = {}
    for clip in CLIP_ORDER:
        clip_dir = os.path.join(args.renders, clip)
        if not os.path.isdir(clip_dir):
            continue
        frames = sorted(f for f in os.listdir(clip_dir) if f.endswith(".png"))
        clip_frame_paths[clip] = [os.path.join(clip_dir, f) for f in frames]

    if not clip_frame_paths:
        raise SystemExit(f"no clip subfolders found under {args.renders}")

    all_imgs = []
    all_bboxes = []
    order = []
    for clip in CLIP_ORDER:
        for path in clip_frame_paths.get(clip, []):
            img = Image.open(path).convert("RGBA")
            bbox = alpha_bbox(img)
            if bbox is None:
                bbox = (0, 0, img.width, img.height)
            all_imgs.append(img)
            all_bboxes.append(bbox)
            order.append(clip)

    union_w = max(b[2] - b[0] for b in all_bboxes)
    union_h = max(b[3] - b[1] for b in all_bboxes)
    side = max(union_w, union_h)

    processed = []
    for img, bbox in zip(all_imgs, all_bboxes):
        crop = img.crop(bbox)
        square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        square.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
        frame = square.resize((args.frame_size, args.frame_size), Image.LANCZOS)
        if args.pixelate:
            frame = kmeans_quantize(frame, args.palette_size)
        processed.append(frame)

    sheet = Image.new("RGBA", (args.frame_size * len(processed), args.frame_size), (0, 0, 0, 0))
    for i, frame in enumerate(processed):
        sheet.paste(frame, (i * args.frame_size, 0))

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    sheet.save(f"{args.out}.png")

    clips = {}
    cursor = 0
    for clip in CLIP_ORDER:
        n = len(clip_frame_paths.get(clip, []))
        if n == 0:
            continue
        clips[clip] = {
            "frames": list(range(cursor, cursor + n)),
            "fps": CLIP_META[clip]["fps"],
            "loop": CLIP_META[clip]["loop"],
        }
        cursor += n

    manifest = {
        "frameW": args.frame_size,
        "frameH": args.frame_size,
        "clips": clips,
        "variants": {
            "enrage": {"tint": "#ff2b4a", "tintStrength": 0.4},
            "veteran": {"tint": "#ffd76a", "tintStrength": 0.28, "scale": 1.15},
        },
    }
    with open(f"{args.out}.anim.json", "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"Wrote {args.out}.png ({sheet.width}x{sheet.height}) and {args.out}.anim.json")
    print("Clips:", {k: len(v["frames"]) for k, v in clips.items()})


if __name__ == "__main__":
    main()
