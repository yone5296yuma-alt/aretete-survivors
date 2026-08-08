"""
Python port of pixel-editor.html's auto-pixelate + skeleton rig + FK posing +
gap-repair pipeline, so it can run outside the browser (direct file I/O,
verifiable with real screenshots via the Read tool) instead of round-tripping
large base64 PNGs through chat text, which proved unreliable for images of
this size.

Mirrors the JS implementation 1:1 (same bone list, same rest-angle math, same
backward-mapping render, same gap/connectivity repair passes) so results are
consistent with what the in-browser tool would produce.
"""
import math
import json
import numpy as np
from PIL import Image

# ---------------------------------------------------------------------------
# Skeleton definition (matches BONE_DEFS in pixel-editor.html)
# ---------------------------------------------------------------------------
BONE_DEFS = [
    ("spine", "hip", "chest"),
    ("neck", "chest", "head"),
    ("lUpperArm", "chest", "lElbow"),
    ("lLowerArm", "lElbow", "lHand"),
    ("rUpperArm", "chest", "rElbow"),
    ("rLowerArm", "rElbow", "rHand"),
    ("lThigh", "hip", "lKnee"),
    ("lShin", "lKnee", "lFoot"),
    ("rThigh", "hip", "rKnee"),
    ("rShin", "rKnee", "rFoot"),
]
BONE_NAMES = [b[0] for b in BONE_DEFS]
PARENT_BONE_OF = {}
for i, (name, a, b) in enumerate(BONE_DEFS):
    PARENT_BONE_OF[b] = i

NEIGHBORS_8 = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]


def dist_to_segment(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy or 1e-6
    t = ((px - ax) * dx + (py - ay) * dy) / len2
    t = max(0.0, min(1.0, t))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy)


def auto_pixelate(src_path, n, palette_size, seed=42):
    img = Image.open(src_path).convert("RGBA")
    w, h = img.size
    s = max(w, h)
    padded = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    padded.paste(img, ((s - w) // 2, (s - h) // 2))
    small = padded.resize((n, n), Image.LANCZOS)
    arr = np.array(small).astype(np.float64)  # n,n,4

    alpha = arr[:, :, 3]
    mask = alpha >= 40
    colors = arr[mask][:, :3]  # (k,3)

    rng = np.random.default_rng(seed)
    palette = kmeans_palette(colors, palette_size, rng)

    out_rgb = np.zeros((n, n, 3), dtype=np.uint8)
    out_alpha = np.zeros((n, n), dtype=np.uint8)
    if len(palette) > 0:
        flat = arr[:, :, :3].reshape(-1, 3)
        d = ((flat[:, None, :] - palette[None, :, :]) ** 2).sum(axis=2)
        nearest = palette[d.argmin(axis=1)].reshape(n, n, 3)
        out_rgb[mask] = nearest[mask].round().astype(np.uint8)
    out_alpha[mask] = 255
    return out_rgb, out_alpha


def kmeans_palette(colors, k, rng, iters=8):
    if len(colors) == 0:
        return np.zeros((0, 3))
    if len(colors) <= k:
        return colors.copy()
    idx = rng.choice(len(colors), size=k, replace=False)
    centers = colors[idx].copy()
    for _ in range(iters):
        d = ((colors[:, None, :] - centers[None, :, :]) ** 2).sum(axis=2)
        assign = d.argmin(axis=1)
        for i in range(k):
            sel = colors[assign == i]
            if len(sel) > 0:
                centers[i] = sel.mean(axis=0)
    return centers


def rgb_key(rgb):
    return int(rgb[0]) << 16 | int(rgb[1]) << 8 | int(rgb[2])


def default_joints(n, arm_raise=0.0):
    def P(fx, fy):
        return {"x": fx * n, "y": fy * n}
    return {
        "hip": P(0.5, 0.55), "chest": P(0.5, 0.32), "head": P(0.5, 0.14),
        "lElbow": P(0.28, 0.40), "lHand": P(0.20, 0.55),
        "rElbow": P(0.72, 0.40), "rHand": P(0.80, 0.55),
        "lKnee": P(0.40, 0.78), "lFoot": P(0.38, 0.98),
        "rKnee": P(0.60, 0.78), "rFoot": P(0.62, 0.98),
    }


def bind_pixels_to_skeleton(rgb, alpha, joints, n):
    bind_bone = -np.ones((n, n), dtype=np.int32)
    bind_along = np.zeros((n, n))
    bind_perp = np.zeros((n, n))
    color_counts = [dict() for _ in BONE_DEFS]

    for y in range(n):
        for x in range(n):
            if alpha[y, x] < 40:
                continue
            cx, cy = x + 0.5, y + 0.5
            best, best_d = 0, float("inf")
            for bi, (name, a, b) in enumerate(BONE_DEFS):
                A, B = joints[a], joints[b]
                d = dist_to_segment(cx, cy, A["x"], A["y"], B["x"], B["y"])
                if d < best_d:
                    best_d, best = d, bi
            name, a, b = BONE_DEFS[best]
            A, B = joints[a], joints[b]
            dx, dy = B["x"] - A["x"], B["y"] - A["y"]
            length = math.hypot(dx, dy) or 1.0
            ux, uy = dx / length, dy / length
            pxu, pyu = -uy, ux
            rx, ry = cx - A["x"], cy - A["y"]
            bind_bone[y, x] = best
            bind_along[y, x] = rx * ux + ry * uy
            bind_perp[y, x] = rx * pxu + ry * pyu
            key = (int(rgb[y, x, 0]), int(rgb[y, x, 1]), int(rgb[y, x, 2]))
            color_counts[best][key] = color_counts[best].get(key, 0) + 1

    dom_color = []
    for cc in color_counts:
        if cc:
            dom_color.append(max(cc.items(), key=lambda kv: kv[1])[0])
        else:
            dom_color.append(None)
    return bind_bone, bind_along, bind_perp, dom_color


def rotate_vec(v, deg):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    return {"x": v["x"] * c - v["y"] * s, "y": v["x"] * s + v["y"] * c}


def solve_pose(rest_joints, bone_deltas):
    world = {"hip": dict(rest_joints["hip"])}
    cum = {}
    for i, (name, a, b) in enumerate(BONE_DEFS):
        parent_idx = PARENT_BONE_OF.get(a)
        parent_cum = cum[parent_idx] if parent_idx is not None else 0.0
        cum[i] = parent_cum + bone_deltas.get(name, 0.0)
        rest_vec = {"x": rest_joints[b]["x"] - rest_joints[a]["x"], "y": rest_joints[b]["y"] - rest_joints[a]["y"]}
        rot = rotate_vec(rest_vec, cum[i])
        A = world[a]
        world[b] = {"x": A["x"] + rot["x"], "y": A["y"] + rot["y"]}
    return world


def bone_frame(A, B):
    dx, dy = B["x"] - A["x"], B["y"] - A["y"]
    length = math.hypot(dx, dy) or 1.0
    return {"A": A, "ux": dx / length, "uy": dy / length, "pxu": -dy / length, "pyu": dx / length}


def render_pose_frame(rgb, alpha, rest_joints, bind_bone, bind_along, bind_perp, bone_deltas, n):
    world = solve_pose(rest_joints, bone_deltas)
    out_rgb = np.zeros((n, n, 3), dtype=np.uint8)
    out_alpha = np.zeros((n, n), dtype=np.uint8)
    for bi, (name, a, b) in enumerate(BONE_DEFS):
        rf = bone_frame(rest_joints[a], rest_joints[b])
        pf = bone_frame(world[a], world[b])
        for dy in range(n):
            for dx in range(n):
                ddx = dx + 0.5 - pf["A"]["x"]
                ddy = dy + 0.5 - pf["A"]["y"]
                along = ddx * pf["ux"] + ddy * pf["uy"]
                perp = ddx * pf["pxu"] + ddy * pf["pyu"]
                sx = int(math.floor(rf["A"]["x"] + along * rf["ux"] + perp * rf["pxu"]))
                sy = int(math.floor(rf["A"]["y"] + along * rf["uy"] + perp * rf["pyu"]))
                if sx < 0 or sy < 0 or sx >= n or sy >= n:
                    continue
                if bind_bone[sy, sx] != bi or alpha[sy, sx] < 40:
                    continue
                out_rgb[dy, dx] = rgb[sy, sx]
                out_alpha[dy, dx] = 255
    return out_rgb, out_alpha, world


def connect_joints(out_rgb, out_alpha, world, dom_color, n):
    LINE_R = 1.4
    for bi, (name, a, b) in enumerate(BONE_DEFS):
        color = dom_color[bi]
        if color is None:
            continue
        A, B = world[a], world[b]
        min_x = max(0, int(math.floor(min(A["x"], B["x"]) - LINE_R)))
        max_x = min(n - 1, int(math.ceil(max(A["x"], B["x"]) + LINE_R)))
        min_y = max(0, int(math.floor(min(A["y"], B["y"]) - LINE_R)))
        max_y = min(n - 1, int(math.ceil(max(A["y"], B["y"]) + LINE_R)))
        for y in range(min_y, max_y + 1):
            for x in range(min_x, max_x + 1):
                if out_alpha[y, x]:
                    continue
                if dist_to_segment(x + 0.5, y + 0.5, A["x"], A["y"], B["x"], B["y"]) <= LINE_R:
                    out_rgb[y, x] = color
                    out_alpha[y, x] = 255


def flood_reach_from_border(alpha, n):
    reached = np.zeros((n, n), dtype=bool)
    stack = []
    for x in range(n):
        if not alpha[0, x]:
            stack.append((x, 0))
        if not alpha[n - 1, x]:
            stack.append((x, n - 1))
    for y in range(n):
        if not alpha[y, 0]:
            stack.append((0, y))
        if not alpha[y, n - 1]:
            stack.append((n - 1, y))
    while stack:
        x, y = stack.pop()
        if x < 0 or y < 0 or x >= n or y >= n or reached[y, x] or alpha[y, x]:
            continue
        reached[y, x] = True
        for dx, dy in NEIGHBORS_8:
            stack.append((x + dx, y + dy))
    return reached


def fill_small_gaps(out_rgb, out_alpha, rest_joints, bone_deltas, dom_color, n):
    world = solve_pose(rest_joints, bone_deltas)
    bone_segs = [(world[a], world[b]) for (name, a, b) in BONE_DEFS]
    SMALL = max(4, round(n * 0.12))
    reached = flood_reach_from_border(out_alpha, n)
    visited = np.zeros((n, n), dtype=bool)
    for y in range(n):
        for x in range(n):
            if out_alpha[y, x] or visited[y, x]:
                continue
            touches_border = bool(reached[y, x])
            cells = [(x, y)]
            visited[y, x] = True
            i = 0
            while i < len(cells):
                cx, cy = cells[i]
                i += 1
                for dx, dy in NEIGHBORS_8:
                    nx, ny = cx + dx, cy + dy
                    if nx < 0 or ny < 0 or nx >= n or ny >= n or visited[ny, nx] or out_alpha[ny, nx]:
                        continue
                    visited[ny, nx] = True
                    cells.append((nx, ny))
            if touches_border and len(cells) > SMALL:
                continue
            for cx, cy in cells:
                best, best_d = 0, float("inf")
                for bi, (A, B) in enumerate(bone_segs):
                    d = dist_to_segment(cx + 0.5, cy + 0.5, A["x"], A["y"], B["x"], B["y"])
                    if d < best_d:
                        best_d, best = d, bi
                color = dom_color[best]
                if color is not None:
                    out_rgb[cy, cx] = color
                    out_alpha[cy, cx] = 255


def bridge_disconnected_islands(out_rgb, out_alpha, n):
    visited = np.zeros((n, n), dtype=bool)
    comps = []
    for y in range(n):
        for x in range(n):
            if not out_alpha[y, x] or visited[y, x]:
                continue
            cells = [(x, y)]
            visited[y, x] = True
            i = 0
            while i < len(cells):
                cx, cy = cells[i]
                i += 1
                for dx, dy in NEIGHBORS_8:
                    nx, ny = cx + dx, cy + dy
                    if nx < 0 or ny < 0 or nx >= n or ny >= n or visited[ny, nx] or not out_alpha[ny, nx]:
                        continue
                    visited[ny, nx] = True
                    cells.append((nx, ny))
            comps.append(cells)
    if len(comps) <= 1:
        return
    comps.sort(key=len, reverse=True)
    main = comps[0]
    for island in comps[1:]:
        best_d, ix, iy, mx, my = float("inf"), 0, 0, 0, 0
        for px, py in island:
            for qx, qy in main:
                d = (px - qx) ** 2 + (py - qy) ** 2
                if d < best_d:
                    best_d, ix, iy, mx, my = d, px, py, qx, qy
        bridge_color = out_rgb[iy, ix].copy()
        x0, y0 = mx, my
        dx, dy = abs(ix - x0), -abs(iy - y0)
        sx = 1 if x0 < ix else -1
        sy = 1 if y0 < iy else -1
        err = dx + dy
        while True:
            if not out_alpha[y0, x0]:
                out_rgb[y0, x0] = bridge_color
                out_alpha[y0, x0] = 255
            if x0 == ix and y0 == iy:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy


def bone_rest_angle(joints, bone_name):
    for name, a, b in BONE_DEFS:
        if name == bone_name:
            A, B = joints[a], joints[b]
            return math.degrees(math.atan2(B["y"] - A["y"], B["x"] - A["x"]))
    raise KeyError(bone_name)


def pose_from_angles(joints, absolute_angles):
    cum = {}
    deltas = {}
    for i, (name, a, b) in enumerate(BONE_DEFS):
        parent_idx = PARENT_BONE_OF.get(a)
        parent_cum = cum[parent_idx] if parent_idx is not None else 0.0
        if name in absolute_angles:
            target_cum = absolute_angles[name] - bone_rest_angle(joints, name)
            while target_cum > 180:
                target_cum -= 360
            while target_cum <= -180:
                target_cum += 360
            deltas[name] = target_cum - parent_cum
            cum[i] = target_cum
        else:
            deltas[name] = 0.0
            cum[i] = parent_cum
    return deltas


def merge_deltas(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = out.get(k, 0.0) + v
    return out


def lerp_pose(a, b, t):
    out = {}
    for k in set(list(a.keys()) + list(b.keys())):
        out[k] = a.get(k, 0.0) + (b.get(k, 0.0) - a.get(k, 0.0)) * t
    return out


def keyframe_frames(keyframes, n):
    segs = len(keyframes) - 1
    out = []
    for i in range(n):
        t = (i / (n - 1)) * segs
        seg = min(segs - 1, int(math.floor(t)))
        out.append(lerp_pose(keyframes[seg], keyframes[seg + 1], t - seg))
    return out


def samples_for(n, fn):
    return [fn(i / n) for i in range(n)]


def walk_frames(joints, n):
    def f(t):
        p = t * math.pi * 2
        return {
            "lThigh": 26 * math.sin(p), "rThigh": -26 * math.sin(p),
            "lShin": max(0.0, -16 * math.sin(p + 0.7)), "rShin": max(0.0, -16 * math.sin(p + math.pi + 0.7)),
            "lUpperArm": -18 * math.sin(p), "rUpperArm": 18 * math.sin(p),
            "spine": 3 * math.sin(p * 2), "neck": -1.5 * math.sin(p * 2),
        }
    return samples_for(n, f)


def idle_frames(joints, n):
    def f(t):
        p = t * math.pi * 2
        return {"spine": 2 * math.sin(p), "neck": -1.5 * math.sin(p), "lUpperArm": 3 * math.sin(p), "rUpperArm": -3 * math.sin(p)}
    return samples_for(n, f)


def attack_frames_gen(joints, n):
    keys = [
        merge_deltas(pose_from_angles(joints, {"rUpperArm": -95, "rLowerArm": -105}), {"spine": -6}),
        merge_deltas(pose_from_angles(joints, {"rUpperArm": 25, "rLowerArm": 20}), {"spine": 8, "lThigh": -10, "rThigh": 10}),
        merge_deltas(pose_from_angles(joints, {"rUpperArm": 45, "rLowerArm": 55}), {"spine": 2}),
    ]
    return keyframe_frames(keys, n)


def hurt_frames_gen(joints, n):
    keys = [
        {},
        {"spine": -14, "neck": 10, "lUpperArm": -10, "rUpperArm": 10, "lThigh": 6, "rThigh": 6},
        {"spine": -6, "neck": 4},
        {},
    ]
    return keyframe_frames(keys, n)


def cheer_frames_gen(joints, n):
    keys = [
        {},
        merge_deltas(pose_from_angles(joints, {"lUpperArm": -100, "rUpperArm": -80, "lLowerArm": -100, "rLowerArm": -80}), {"spine": -4}),
        merge_deltas(pose_from_angles(joints, {"lUpperArm": -95, "rUpperArm": -85, "lLowerArm": -95, "rLowerArm": -85}), {"spine": 2, "neck": -4}),
        merge_deltas(pose_from_angles(joints, {"lUpperArm": -100, "rUpperArm": -80, "lLowerArm": -100, "rLowerArm": -80}), {"spine": -4}),
    ]
    return keyframe_frames(keys, n)


CLIP_META = {
    "idle": {"fps": 3, "loop": True, "count": 4, "gen": idle_frames},
    "walk": {"fps": 10, "loop": True, "count": 8, "gen": walk_frames},
    "attack": {"fps": 12, "loop": False, "count": 5, "gen": attack_frames_gen},
    "hurt": {"fps": 14, "loop": False, "count": 6, "gen": hurt_frames_gen},
    "cheer": {"fps": 6, "loop": True, "count": 6, "gen": cheer_frames_gen},
}
CLIP_NAMES = ["idle", "walk", "attack", "hurt", "cheer"]


def generate_all_motions(rgb, alpha, joints, n):
    bind_bone, bind_along, bind_perp, dom_color = bind_pixels_to_skeleton(rgb, alpha, joints, n)
    frames = []  # list of (rgb, alpha)
    clips = {}
    offset = 0
    for clip_name in CLIP_NAMES:
        meta = CLIP_META[clip_name]
        deltas_list = meta["gen"](joints, meta["count"])
        local_frames = []
        for deltas in deltas_list:
            out_rgb, out_alpha, world = render_pose_frame(rgb, alpha, joints, bind_bone, bind_along, bind_perp, deltas, n)
            connect_joints(out_rgb, out_alpha, world, dom_color, n)
            fill_small_gaps(out_rgb, out_alpha, joints, deltas, dom_color, n)
            bridge_disconnected_islands(out_rgb, out_alpha, n)
            local_frames.append((out_rgb, out_alpha))
        frames.extend(local_frames)
        clips[clip_name] = {
            "frames": list(range(offset, offset + len(local_frames))),
            "fps": meta["fps"], "loop": meta["loop"],
        }
        offset += len(local_frames)
    return frames, clips


def count_interior_holes(alpha, n):
    reached = flood_reach_from_border(alpha, n)
    holes = 0
    for y in range(n):
        for x in range(n):
            if not alpha[y, x] and not reached[y, x]:
                holes += 1
    return holes


def connected_components_8(alpha, n):
    visited = np.zeros((n, n), dtype=bool)
    count = 0
    for y in range(n):
        for x in range(n):
            if not alpha[y, x] or visited[y, x]:
                continue
            count += 1
            stack = [(x, y)]
            visited[y, x] = True
            while stack:
                cx, cy = stack.pop()
                for dx, dy in NEIGHBORS_8:
                    nx, ny = cx + dx, cy + dy
                    if nx < 0 or ny < 0 or nx >= n or ny >= n or visited[ny, nx] or not alpha[ny, nx]:
                        continue
                    visited[ny, nx] = True
                    stack.append((nx, ny))
    return count
