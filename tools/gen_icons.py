"""
Procedural pixel-art icon generator for Are Tete Survivors. Replaces the
emoji icons currently used for weapons/passives/skills/branches/misc with
small flat-color, dark-outlined pixel-art PNGs matching the game's existing
aesthetic (see build_chibi_rabbit.py's outline convention for the same
flat+outline look, applied here in pure 2D instead of via 3D render).

Design: draw on a small coarse grid (COARSE x COARSE "pixel units") using a
handful of reusable primitive shape functions, then nearest-neighbor
upscale to the final size so edges stay crisp/blocky (real pixel art),
finishing with a 1px dark outline pass computed on the coarse grid (so the
outline itself is exactly 1 "fat pixel" thick, not blurry at the final
resolution).

Usage:
  python tools/gen_icons.py --sample     # render the ~10-icon style checkpoint sheet
  python tools/gen_icons.py --all        # render the full ~80-icon set to assets/icons/
"""
import argparse
import math
import os

from PIL import Image, ImageDraw

COARSE = 20          # working grid resolution (coarse "pixel units")
FINAL = 64            # output PNG size (COARSE cell -> FINAL/COARSE real pixels)
OUTLINE = (26, 20, 18, 255)
CELL = FINAL // COARSE

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'assets', 'icons')
SAMPLE_DIR = os.path.join(os.path.dirname(__file__), '_icon_samples')


def new_canvas():
    return Image.new('RGBA', (COARSE, COARSE), (0, 0, 0, 0))


def hex_to_rgba(h, alpha=255):
    h = h.lstrip('#')
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16), alpha)


def lighten(rgba, amt=40):
    r, g, b, a = rgba
    return (min(255, r + amt), min(255, g + amt), min(255, b + amt), a)


def darken(rgba, amt=40):
    r, g, b, a = rgba
    return (max(0, r - amt), max(0, g - amt), max(0, b - amt), a)


def poly(draw, points, color):
    draw.polygon(points, fill=color)


def circle(draw, cx, cy, r, color):
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=color)


def apply_bevel_shading(canvas):
    """Fake light-from-upper-left shading: darken the lower-right rim of the
    silhouette, lighten the upper-left rim, so flat-filled primitives read as
    a soft bevel instead of a single flat color. Same coarse-grid alpha-
    neighbor technique as the outline pass below, applied before it runs."""
    px = canvas.load()
    shaded = canvas.copy()
    spx = shaded.load()
    for y in range(COARSE):
        for x in range(COARSE):
            r, g, b, a = px[x, y]
            if a <= 40:
                continue
            shadow_edge = any(
                nx >= COARSE or ny >= COARSE or px[nx, ny][3] <= 40
                for nx, ny in ((x + 1, y), (x, y + 1), (x + 1, y + 1))
            )
            highlight_edge = any(
                nx < 0 or ny < 0 or px[nx, ny][3] <= 40
                for nx, ny in ((x - 1, y), (x, y - 1), (x - 1, y - 1))
            )
            if shadow_edge and not highlight_edge:
                spx[x, y] = darken((r, g, b, a), 35)
            elif highlight_edge and not shadow_edge:
                spx[x, y] = lighten((r, g, b, a), 35)
    return shaded


def outline_and_upscale(canvas):
    """1px (coarse-grid) dark outline around the alpha silhouette, then
    nearest-neighbor upscale for a crisp blocky look."""
    alpha = canvas.split()[-1]
    px = alpha.load()
    outline_mask = Image.new('L', (COARSE, COARSE), 0)
    om = outline_mask.load()
    for y in range(COARSE):
        for x in range(COARSE):
            if px[x, y] > 40:
                continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, ny = x + dx, y + dy
                if 0 <= nx < COARSE and 0 <= ny < COARSE and px[nx, ny] > 40:
                    om[x, y] = 255
                    break
    outline_layer = Image.new('RGBA', (COARSE, COARSE), (0, 0, 0, 0))
    outline_layer.paste(Image.new('RGBA', (COARSE, COARSE), OUTLINE), (0, 0), outline_mask)
    merged = Image.alpha_composite(outline_layer, canvas)
    return merged.resize((FINAL, FINAL), Image.NEAREST)


# ---------------------------------------------------------------------------
# Primitive shape library. Each takes (draw, color) and paints into the
# COARSE x COARSE grid (roughly centered, ~14-18 units across). Reused across
# many icons via color/size/rotation variation rather than one bespoke
# function per icon id.
# ---------------------------------------------------------------------------

def p_blade(draw, color, hue2=None):
    poly(draw, [(10, 2), (13, 8), (11, 15), (10, 17), (9, 15), (7, 8)], color)
    poly(draw, [(6, 14), (14, 14), (14, 16), (6, 16)], hue2 or darken(color, 60))
    poly(draw, [(9, 16), (11, 16), (11, 19), (9, 19)], darken(color, 80))


def p_crescent(draw, color):
    circle(draw, 10, 10, 8, color)
    circle(draw, 14, 8, 7, (0, 0, 0, 0))
    # punch the second circle as transparency via separate compositing done by caller


def p_moon(draw, color):
    circle(draw, 10, 10, 8, color)
    circle(draw, 7, 8, 1, darken(color, 50))
    circle(draw, 12, 13, 1, darken(color, 50))


def p_crown(draw, color):
    poly(draw, [(3, 15), (3, 9), (7, 12), (10, 5), (13, 12), (17, 9), (17, 15)], color)
    circle(draw, 10, 7, 1, lighten(color, 60))
    poly(draw, [(3, 15), (17, 15), (17, 17), (3, 17)], darken(color, 30))


def p_acorn(draw, color):
    poly(draw, [(5, 8), (15, 8), (14, 6), (6, 6)], darken(color, 20))
    for i in range(6, 15, 2):
        draw.line([(i, 6), (i + 1, 8)], fill=darken(color, 40), width=1)
    circle(draw, 10, 13, 6, color)


def p_thorn(draw, color):
    draw.line([(4, 17), (10, 3)], fill=darken(color, 20), width=2)
    poly(draw, [(6, 13), (9, 12), (7, 10)], color)
    poly(draw, [(8, 8), (11, 7), (9, 5)], color)
    circle(draw, 10, 3, 2, lighten(color, 30))


def p_leaf(draw, color):
    poly(draw, [(10, 2), (17, 10), (10, 18), (3, 10)], color)
    draw.line([(10, 3), (10, 17)], fill=darken(color, 40), width=1)


def p_log(draw, color):
    poly(draw, [(2, 8), (18, 6), (18, 14), (2, 16)], color)
    circle(draw, 3, 12, 3, darken(color, 20))
    circle(draw, 3, 12, 1, darken(color, 50))


def p_tree(draw, color, narrow=False):
    w = 4 if narrow else 7
    poly(draw, [(10 - w, 12), (10 + w, 12), (10, 2)], color)
    poly(draw, [(10 - w + 1, 15), (10 + w - 1, 15), (10, 6)], lighten(color, 15))
    poly(draw, [(8, 15), (12, 15), (12, 18), (8, 18)], darken(color, 60))


def p_beast_head(draw, color, horned=False):
    circle(draw, 10, 12, 6, color)
    poly(draw, [(4, 8), (7, 9), (5, 3)], color)
    poly(draw, [(16, 8), (13, 9), (15, 3)], color)
    if horned:
        poly(draw, [(6, 6), (7, 8), (5, 8)], (230, 230, 220, 255))
        poly(draw, [(14, 6), (13, 8), (15, 8)], (230, 230, 220, 255))
    circle(draw, 8, 12, 1, (20, 20, 20, 255))
    circle(draw, 12, 12, 1, (20, 20, 20, 255))
    poly(draw, [(9, 15), (11, 15), (10, 17)], darken(color, 60))


def p_arrow(draw, color):
    draw.line([(4, 16), (16, 4)], fill=color, width=2)
    poly(draw, [(16, 4), (10, 6), (14, 10)], color)
    draw.line([(4, 16), (7, 16)], fill=darken(color, 20), width=2)
    draw.line([(4, 16), (4, 13)], fill=darken(color, 20), width=2)


def p_rock(draw, color):
    poly(draw, [(4, 12), (7, 5), (13, 4), (17, 10), (14, 16), (6, 17)], color)
    poly(draw, [(7, 5), (13, 4), (11, 9)], lighten(color, 25))


def p_snowflake(draw, color):
    for a in range(0, 360, 60):
        rad = math.radians(a)
        x2, y2 = 10 + 8 * math.cos(rad), 10 + 8 * math.sin(rad)
        draw.line([(10, 10), (x2, y2)], fill=color, width=2)
        bx, by = 10 + 5 * math.cos(rad), 10 + 5 * math.sin(rad)
        pa = rad + math.radians(90)
        draw.line([(bx - 1.5 * math.cos(pa), by - 1.5 * math.sin(pa)),
                   (bx + 1.5 * math.cos(pa), by + 1.5 * math.sin(pa))], fill=color, width=1)
    circle(draw, 10, 10, 2, color)


def p_chain(draw, color):
    for i, (cx, cy) in enumerate([(6, 6), (10, 10), (14, 14)]):
        draw.ellipse([cx - 4, cy - 3, cx + 4, cy + 3], outline=color, width=2)


def p_gear(draw, color):
    circle(draw, 10, 10, 6, color)
    for a in range(0, 360, 45):
        rad = math.radians(a)
        x, y = 10 + 8 * math.cos(rad), 10 + 8 * math.sin(rad)
        circle(draw, x, y, 2, color)
    circle(draw, 10, 10, 3, darken(color, 50))


def p_star(draw, color, points=5, r=8, cx=10, cy=10):
    pts = []
    for i in range(points * 2):
        rad = math.radians(i * 360 / (points * 2) - 90)
        rr = r if i % 2 == 0 else r * 0.42
        pts.append((cx + rr * math.cos(rad), cy + rr * math.sin(rad)))
    poly(draw, pts, color)


def p_comet(draw, color):
    p_star(draw, color, points=4, r=5, cx=13, cy=7)
    for i in range(5):
        draw.line([(11 - i, 9 + i), (10 - i, 9 + i)], fill=lighten(color, 10), width=1)


def p_owl(draw, color):
    circle(draw, 10, 11, 7, color)
    circle(draw, 7, 9, 3, (250, 250, 245, 255))
    circle(draw, 13, 9, 3, (250, 250, 245, 255))
    circle(draw, 7, 9, 1.4, (20, 20, 20, 255))
    circle(draw, 13, 9, 1.4, (20, 20, 20, 255))
    poly(draw, [(9, 11), (11, 11), (10, 13)], darken(color, 60))
    poly(draw, [(4, 5), (6, 8), (3, 8)], color)
    poly(draw, [(16, 5), (14, 8), (17, 8)], color)


def p_fist(draw, color):
    poly(draw, [(5, 8), (15, 8), (16, 16), (4, 16)], color)
    for x in (7, 10, 13):
        draw.line([(x, 8), (x, 11)], fill=darken(color, 30), width=1)
    poly(draw, [(3, 10), (5, 9), (5, 15), (3, 14)], color)


def p_mountain(draw, color):
    poly(draw, [(2, 17), (7, 6), (11, 12), (14, 5), (18, 17)], color)
    poly(draw, [(7, 6), (9, 9), (5, 9)], (250, 250, 250, 255))
    poly(draw, [(14, 5), (16, 8), (12, 8)], (250, 250, 250, 255))


def p_bell(draw, color):
    poly(draw, [(6, 13), (7, 6), (13, 6), (14, 13)], color)
    poly(draw, [(4, 13), (16, 13), (16, 15), (4, 15)], darken(color, 10))
    circle(draw, 10, 17, 1.6, darken(color, 30))
    circle(draw, 10, 5, 1.3, darken(color, 20))


def p_gate(draw, color):
    poly(draw, [(3, 4), (17, 4), (17, 6), (3, 6)], color)
    poly(draw, [(2, 7), (18, 7), (18, 9), (2, 9)], color)
    draw.line([(5, 4), (5, 18)], fill=color, width=2)
    draw.line([(15, 4), (15, 18)], fill=color, width=2)


def p_cloak(draw, color):
    poly(draw, [(10, 2), (16, 17), (10, 14), (4, 17)], color)
    circle(draw, 10, 3, 1.6, darken(color, 20))


def p_boots(draw, color):
    poly(draw, [(6, 3), (12, 3), (12, 12), (17, 12), (17, 16), (6, 16)], color)
    poly(draw, [(6, 14), (17, 14), (17, 16), (6, 16)], darken(color, 40))


def p_shield(draw, color):
    poly(draw, [(10, 2), (17, 5), (17, 11), (10, 18), (3, 11), (3, 5)], color)
    poly(draw, [(10, 4), (15, 6.5), (15, 10.5), (10, 15), (5, 10.5), (5, 6.5)], lighten(color, 20))


def p_clover(draw, color):
    for dx, dy in ((-3, -3), (3, -3), (-3, 3), (3, 3)):
        circle(draw, 10 + dx, 10 + dy, 4, color)
    draw.line([(10, 12), (10, 18)], fill=darken(color, 20), width=1)


def p_ring(draw, color):
    draw.ellipse([4, 4, 16, 16], outline=color, width=3)
    circle(draw, 10, 4, 1.6, lighten(color, 40))


def p_book(draw, color):
    poly(draw, [(4, 4), (16, 4), (16, 16), (4, 16)], color)
    draw.line([(10, 4), (10, 16)], fill=darken(color, 40), width=1)
    for y in (7, 9, 11, 13):
        draw.line([(5, y), (9, y)], fill=darken(color, 20), width=1)
        draw.line([(11, y), (15, y)], fill=darken(color, 20), width=1)


def p_paw(draw, color):
    circle(draw, 10, 13, 5, color)
    for dx, dy in ((-5, -4), (-2, -7), (2, -7), (5, -4)):
        circle(draw, 10 + dx, 13 + dy, 2, color)


def p_eye(draw, color):
    poly(draw, [(2, 10), (10, 4), (18, 10), (10, 16)], color)
    circle(draw, 10, 10, 4, (20, 20, 20, 255))
    circle(draw, 10, 10, 1.6, (240, 240, 240, 255))


def p_hands(draw, color):
    poly(draw, [(10, 2), (13, 8), (12, 17), (10, 15), (8, 17), (7, 8)], color)
    draw.line([(10, 4), (10, 15)], fill=darken(color, 30), width=1)


def p_wind(draw, color):
    for i, y in enumerate((6, 10, 14)):
        draw.line([(2 + i, y), (16 - i, y)], fill=color, width=2)


def p_tophat(draw, color):
    poly(draw, [(6, 2), (14, 2), (14, 11), (6, 11)], color)
    poly(draw, [(2, 11), (18, 11), (18, 14), (2, 14)], darken(color, 20))
    draw.line([(6, 8), (14, 8)], fill=darken(color, 40), width=1)


def p_basket(draw, color):
    poly(draw, [(4, 8), (16, 8), (14, 17), (6, 17)], color)
    for y in range(9, 16, 2):
        draw.line([(4 + (y - 8) * 0.2, y), (16 - (y - 8) * 0.2, y)], fill=darken(color, 30), width=1)
    draw.arc([5, 1, 15, 11], 200, 340, fill=darken(color, 10), width=2)


def p_fleur(draw, color):
    p_crown(draw, color)


def p_wing(draw, color):
    # fan of feathers pivoting from a base point, classic pixel-art wing silhouette
    base = (4, 17)
    tips = [(6, 3), (10, 2), (14, 4), (17, 8), (17, 13)]
    for i in range(len(tips) - 1):
        poly(draw, [base, tips[i], tips[i + 1]], color if i % 2 == 0 else darken(color, 15))
    draw.line([base, tips[0]], fill=darken(color, 35), width=1)
    draw.line([base, tips[-1]], fill=darken(color, 35), width=1)


def p_footprints(draw, color):
    poly(draw, [(6, 5), (9, 5), (9, 12), (6, 12)], color)
    circle(draw, 7.5, 3, 1.3, color)
    poly(draw, [(12, 9), (15, 9), (15, 16), (12, 16)], color)
    circle(draw, 13.5, 7, 1.3, color)


def p_flame(draw, color):
    poly(draw, [(10, 2), (14, 9), (13, 15), (10, 18), (7, 15), (6, 9)], color)
    poly(draw, [(10, 7), (12, 12), (10, 16), (8, 12)], lighten(color, 50))


def p_target(draw, color):
    circle(draw, 10, 10, 8, color)
    circle(draw, 10, 10, 5, (250, 250, 250, 255))
    circle(draw, 10, 10, 2.5, color)


def p_backpack(draw, color):
    poly(draw, [(5, 6), (15, 6), (15, 17), (5, 17)], color)
    poly(draw, [(6, 8), (14, 8), (14, 12), (6, 12)], darken(color, 20))
    draw.line([(6, 3), (6, 6)], fill=darken(color, 10), width=2)
    draw.line([(14, 3), (14, 6)], fill=darken(color, 10), width=2)


def p_skull(draw, color):
    circle(draw, 10, 9, 6, color)
    poly(draw, [(6, 12), (14, 12), (13, 17), (7, 17)], color)
    circle(draw, 7.5, 9, 1.6, (20, 20, 20, 255))
    circle(draw, 12.5, 9, 1.6, (20, 20, 20, 255))
    poly(draw, [(9, 15), (11, 15), (10, 13)], darken(color, 50))


def p_bolt(draw, color):
    poly(draw, [(11, 2), (5, 11), (9, 11), (7, 18), (15, 8), (11, 8)], color)


def p_explosion(draw, color):
    p_star(draw, color, points=8, r=8)
    p_star(draw, lighten(color, 40), points=8, r=4)


def p_box(draw, color):
    poly(draw, [(3, 6), (17, 6), (17, 17), (3, 17)], color)
    poly(draw, [(3, 6), (10, 3), (17, 6)], lighten(color, 15))
    draw.line([(10, 6), (10, 17)], fill=darken(color, 30), width=1)
    draw.line([(3, 10), (17, 10)], fill=darken(color, 30), width=1)


def p_magnet(draw, color):
    draw.arc([4, 3, 16, 19], 0, 180, fill=color, width=4)
    draw.line([(4, 11), (4, 17)], fill=color, width=4)
    draw.line([(16, 11), (16, 17)], fill=color, width=4)
    draw.line([(3, 15), (6, 15)], fill=(230, 230, 230, 255), width=2)
    draw.line([(14, 15), (17, 15)], fill=(230, 230, 230, 255), width=2)


def p_gem(draw, color):
    poly(draw, [(10, 2), (16, 8), (10, 18), (4, 8)], color)
    poly(draw, [(10, 2), (16, 8), (10, 10)], lighten(color, 35))
    draw.line([(4, 8), (16, 8)], fill=darken(color, 30), width=1)


def p_coin(draw, color):
    circle(draw, 10, 10, 8, color)
    circle(draw, 10, 10, 6, lighten(color, 20))
    circle(draw, 10, 10, 5, color)


def p_map(draw, color):
    poly(draw, [(3, 4), (10, 6), (17, 4), (17, 16), (10, 14), (3, 16)], color)
    draw.line([(10, 6), (10, 14)], fill=darken(color, 30), width=1)


def p_abacus(draw, color):
    poly(draw, [(3, 4), (17, 4), (17, 16), (3, 16)], darken(color, 10))
    for y in (7, 10, 13):
        draw.line([(4, y), (16, y)], fill=darken(color, 40), width=1)
        for x in (7, 13):
            circle(draw, x, y, 1.3, color)


def p_hammer(draw, color):
    poly(draw, [(4, 3), (12, 3), (12, 9), (4, 9)], color)
    poly(draw, [(7, 9), (9, 9), (9, 18), (7, 18)], darken(color, 30))


PRIMITIVES = {
    'blade': p_blade, 'crescent': p_crescent, 'moon': p_moon, 'crown': p_crown,
    'acorn': p_acorn, 'thorn': p_thorn, 'leaf': p_leaf, 'log': p_log, 'tree': p_tree,
    'beast_head': p_beast_head, 'arrow': p_arrow, 'rock': p_rock, 'snowflake': p_snowflake,
    'chain': p_chain, 'gear': p_gear, 'star': p_star, 'comet': p_comet, 'owl': p_owl,
    'fist': p_fist, 'mountain': p_mountain, 'bell': p_bell, 'gate': p_gate, 'cloak': p_cloak,
    'boots': p_boots, 'shield': p_shield, 'clover': p_clover, 'ring': p_ring, 'book': p_book,
    'paw': p_paw, 'eye': p_eye, 'hands': p_hands, 'wind': p_wind, 'tophat': p_tophat,
    'basket': p_basket, 'fleur': p_fleur, 'wing': p_wing, 'footprints': p_footprints,
    'flame': p_flame, 'target': p_target, 'backpack': p_backpack, 'skull': p_skull,
    'bolt': p_bolt, 'explosion': p_explosion, 'box': p_box, 'magnet': p_magnet,
    'gem': p_gem, 'coin': p_coin, 'map': p_map, 'abacus': p_abacus, 'hammer': p_hammer,
}


def render_icon(primitive_name, color_hex, embellish=None):
    canvas = new_canvas()
    draw = ImageDraw.Draw(canvas)
    color = hex_to_rgba(color_hex)
    PRIMITIVES[primitive_name](draw, color)
    if embellish == 'sparkle':
        p_star(draw, (255, 255, 255, 230), points=4, r=2.4, cx=16, cy=4)
    elif embellish == 'corona':
        for a in range(0, 360, 30):
            rad = math.radians(a)
            x, y = 10 + 9.5 * math.cos(rad), 10 + 9.5 * math.sin(rad)
            circle(draw, x, y, 0.8, lighten(color, 60))
    canvas = apply_bevel_shading(canvas)
    return outline_and_upscale(canvas)


# ---------------------------------------------------------------------------
# id -> (primitive, color, embellish) lookup, covering every icon field in
# js/data.js. Weapon trees (base/evolved/super) mostly share a primitive with
# an escalating color/embellishment rather than needing fully distinct shapes.
# ---------------------------------------------------------------------------
ICON_MAP = {
    # base weapons
    'moonlightDagger': ('blade', '#bcd6ff', None), 'crescentBlade': ('crescent', '#c7f0d0', None),
    'crownBoomerang': ('crown', '#ffd76a', None), 'acornShot': ('acorn', '#c98a4a', None),
    'thornVortex': ('thorn', '#c76bd6', None), 'branchTrap': ('log', '#8a6a4a', None),
    'moonHowl': ('beast_head', '#9fb8ff', None), 'silverArrow': ('arrow', '#d8d8e0', None),
    'travelersSling': ('rock', '#a8a8a8', None), 'frostCharm': ('snowflake', '#a8e0ff', None),
    'undyingVine': ('leaf', '#7fd88a', None), 'chainWeight': ('chain', '#9a9aa8', None),
    'stardustShot': ('star', '#e0d0ff', None), 'owlFamiliar': ('owl', '#c9a86a', None),
    'quakingStrike': ('fist', '#c98a4a', None), 'blessingChime': ('bell', '#ffe6f0', None),
    # evolved weapons
    'moonlightFlurry': ('blade', '#eaf4ff', 'sparkle'), 'eternalCrescent': ('crescent', '#d6fff0', 'sparkle'),
    'royalFlush': ('gem', '#ffe08a', 'sparkle'), 'goldenAcornBarrage': ('acorn', '#ffd76a', 'sparkle'),
    'endlessBriar': ('thorn', '#e05a9a', 'sparkle'), 'ancientOakFall': ('tree', '#5a8a4a', 'sparkle'),
    'eternalHowl': ('moon', '#c9d8ff', 'sparkle'), 'moonsilverVolley': ('arrow', '#e8e8ff', 'sparkle'),
    'merchantsBarrage': ('coin', '#ffd76a', 'sparkle'), 'blizzardCharm': ('snowflake', '#c8f0ff', 'sparkle'),
    'worldTreeRoots': ('tree', '#3d7a4a', 'sparkle'), 'greatChainFlail': ('gear', '#7a7a8a', 'sparkle'),
    'meteorShower': ('comet', '#e0d0ff', 'sparkle'), 'greatHornedGuardian': ('owl', '#c9a86a', 'sparkle'),
    'canyonRupture': ('mountain', '#c98a4a', 'sparkle'), 'sanctuaryChime': ('gate', '#ffe6f0', 'sparkle'),
    # super evolved
    'moonlightGoddess': ('blade', '#fff9e0', 'corona'), 'crescentSovereign': ('crescent', '#e0fff0', 'corona'),
    'royalAscension': ('crown', '#fff0a0', 'corona'), 'lunarSovereign': ('moon', '#ffe0f5', 'corona'),
    # passives
    'forestCloak': ('cloak', '#7fd88a', None), 'sharpenedBlade': ('blade', '#d8d8e0', None),
    'travelersBoots': ('boots', '#c98a4a', None), 'forestBlessing': ('tree', '#7fd88a', None),
    'knightsEmblem': ('shield', '#a8c8ff', None), 'fourLeafCharm': ('clover', '#7fd88a', None),
    'guidingBell': ('bell', '#ffd76a', None), 'ringOfSwiftness': ('ring', '#e7b8ff', None),
    'travelersJournal': ('book', '#c98a4a', None), 'wolfsBond': ('paw', '#9fb8ff', None),
    'hawkEye': ('wing', '#d8a86a', None), 'merchantsEye': ('abacus', '#c98a4a', None),
    'winterCloak': ('cloak', '#a8e0ff', None), 'rootedHeart': ('leaf', '#7fd88a', None),
    'ironResolve': ('hammer', '#9a9aa8', None), 'starMap': ('map', '#e0d0ff', None),
    'nightVision': ('eye', '#c9a86a', None), 'stoneFist': ('fist', '#a8a8a8', None),
    'travelersPrayer': ('hands', '#ffe6f0', None), 'moonPriestessBlessing': ('moon', '#c9d8ff', 'sparkle'),
    # character skills
    'nimbleFootwork': ('wind', '#7fe6a8', None), 'opportunisticStrike': ('tophat', '#8a1f2b', None),
    'butlersLoyalty': ('basket', '#c98a4a', None), 'royalAuthority': ('crown', '#ffd76a', None),
    'queensStrike': ('fleur', '#ffd76a', None), 'guardianHalo': ('wing', '#ffe6f0', None),
    'fugitivesInstinct': ('footprints', '#5fbf7a', None), 'survivalInstinct': ('leaf', '#5fbf7a', None),
    'guidingSpirit': ('flame', '#ff9a5a', None), 'huntersReflexes': ('target', '#c7f0d0', None),
    'criticalSweep': ('star', '#c7f0d0', None), 'forestsWard': ('leaf', '#3d7a4a', None),
    'discerningMerchant': ('map', '#c98a4a', None), 'weightOfGoods': ('backpack', '#c98a4a', None),
    'loyalPackmule': ('beast_head', '#c98a4a', None),
    # branch defs
    'poison': ('skull', '#7fbf6a', None), 'paralysis': ('bolt', '#ffe45a', None),
    'explosion': ('explosion', '#ff8a5a', None), 'power': ('target', '#ff5a5a', None),
    # permanent shop upgrades
    'permMaxHP': ('shield', '#ff5470', None), 'permPower': ('fist', '#ff9a5a', None),
    'permSpeed': ('wind', '#7fe6a8', None), 'permLuck': ('clover', '#7fd88a', None),
    'permRegen': ('leaf', '#5cf29a', None), 'permPickup': ('magnet', '#7fe0ff', None),
    # costumes
    'butlerRabbit': ('beast_head', '#e8e8ec', None), 'princess': ('crown', '#b98af0', None),
    'escapee': ('leaf', '#5fbf7a', None), 'huntress': ('crescent', '#3d7a4a', None),
    'wanderer': ('backpack', '#c98a4a', None),
    # misc canvas-drawn (Chest, Companion)
    'chest': ('box', '#c98a4a', None), 'companionAttacker': ('flame', '#ff9a5a', None),
    'companionCollector': ('magnet', '#7fe0ff', None),
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--sample', action='store_true')
    p.add_argument('--all', action='store_true')
    args = p.parse_args()

    if args.sample:
        os.makedirs(SAMPLE_DIR, exist_ok=True)
        sample_ids = ['moonlightDagger', 'crownBoomerang', 'moonlightGoddess', 'frostCharm',
                      'owlFamiliar', 'guardianHalo', 'butlersLoyalty', 'forestCloak', 'poison', 'chest']
        cols = 5
        size = FINAL + 16
        sheet = Image.new('RGBA', (cols * size, ((len(sample_ids) + cols - 1) // cols) * size), (20, 30, 24, 255))
        for i, icon_id in enumerate(sample_ids):
            prim, color, emb = ICON_MAP[icon_id]
            icon = render_icon(prim, color, emb)
            icon.save(os.path.join(SAMPLE_DIR, f'{icon_id}.png'))
            x, y = (i % cols) * size + 8, (i // cols) * size + 8
            sheet.paste(icon, (x, y), icon)
        sheet.save(os.path.join(SAMPLE_DIR, '_sheet.png'))
        print(f'Sample sheet: {os.path.join(SAMPLE_DIR, "_sheet.png")}')

    if args.all:
        os.makedirs(OUT_DIR, exist_ok=True)
        missing_prims = set()
        for icon_id, (prim, color, emb) in ICON_MAP.items():
            if prim not in PRIMITIVES:
                missing_prims.add(prim)
                continue
            icon = render_icon(prim, color, emb)
            icon.save(os.path.join(OUT_DIR, f'{icon_id}.png'))
        print(f'Generated {len(ICON_MAP) - len(missing_prims)} icons to {OUT_DIR}')
        if missing_prims:
            print('Missing primitives:', missing_prims)


if __name__ == '__main__':
    main()
