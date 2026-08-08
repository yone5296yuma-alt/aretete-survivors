"""
Procedural chibi mascot body builder (metaballs -> mesh), run headless in Blender.
Bypasses VRoid Studio entirely for super-deformed (~2.5-3 head tall) proportions,
which VRoid's human-skeleton-based sliders can't produce cleanly.

Usage:
  blender --background --python tools/build_chibi_rabbit.py -- --outdir tools/_render_out/chibi_preview

Iterate by eye: run, look at the rendered PNGs, tweak the coordinates/radii
below, run again. This first pass is silhouette only (no vest/bowtie/emblem
yet) so proportions can be locked in before adding clothing detail.
"""
import argparse
import math
import os
import sys

import bpy
from mathutils import Euler, Vector


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--outdir", required=True)
    p.add_argument("--size", type=int, default=768)
    return p.parse_args(argv)


def add_element(mb_data, co, radius, mtype="BALL", size=None, rotation=None, stiffness=2.0):
    e = mb_data.elements.new()
    e.co = co
    e.radius = radius
    e.stiffness = stiffness
    e.type = mtype
    if size:
        e.size_x, e.size_y, e.size_z = size
    if rotation:
        e.rotation = rotation
    return e


def build_body():
    mb_data = bpy.data.metaballs.new("ChibiBody")
    mb_data.resolution = 0.035
    mb_data.render_resolution = 0.02
    mb_obj = bpy.data.objects.new("ChibiBody", mb_data)
    bpy.context.collection.objects.link(mb_obj)

    # Head: dominant mass.
    add_element(mb_data, (0, 0, 1.62), 0.66)
    # Belly: the dominant round bulge. No separate narrow "chest" ball here --
    # a thin middle element between two big spheres produces a wasp-waist
    # stalk instead of a cute neck-in, so head and belly blend directly.
    # Default stiffness (not raised) so the two actually fuse smoothly
    # instead of touching at a pinched point with a visible seam.
    add_element(mb_data, (0, 0, 0.86), 0.60)
    # Base taper down toward the feet. Kept close enough to the belly to
    # guarantee real overlap -- metaball fusion has a sharp connected/
    # disconnected threshold around a distance/radius-sum ratio of ~0.7, so
    # leave real margin rather than cutting it close.
    add_element(mb_data, (0, 0, 0.34), 0.36)

    def dir_quat(direction):
        return Vector(direction).normalized().to_track_quat("X", "Z")

    # Ears: thick capsules pointing mostly upward from the top of the head,
    # one much taller and leaning back-right, one shorter with a blunter tip
    # drooping left, matching the reference's asymmetric floppy-ear pose.
    ear_r = 0.20
    add_element(
        mb_data, (-0.22, 0.0, 2.20), ear_r, mtype="CAPSULE",
        size=(0.26, 0, 0), rotation=dir_quat((-0.22, 0.05, 1.0)), stiffness=3.0,
    )
    add_element(
        mb_data, (0.26, 0.0, 2.18), 0.185, mtype="CAPSULE",
        size=(0.46, 0, 0), rotation=dir_quat((0.30, -0.05, 0.92)), stiffness=3.0,
    )

    # Arms: thin, hugging close against the belly's sides rather than poking
    # out as separate shoulder-height pads. Long and mostly vertical, based
    # near the belly's widest point so only a sliver shows past its curve.
    # Positioned low, alongside the belly (not the chest/vest height) so only
    # a thin sliver peeks past the belly's curve instead of flaring out next
    # to the vest like a shoulder pad.
    arm_r = 0.09
    add_element(
        mb_data, (-0.38, 0.0, 0.68), arm_r, mtype="CAPSULE",
        size=(0.26, 0, 0), rotation=dir_quat((-0.10, 0.0, -1.0)), stiffness=3.0,
    )
    add_element(
        mb_data, (0.38, 0.0, 0.68), arm_r, mtype="CAPSULE",
        size=(0.26, 0, 0), rotation=dir_quat((0.10, 0.0, -1.0)), stiffness=3.0,
    )

    # Feet: small nubs peeking out at the very bottom, not full-length legs.
    foot_r = 0.16
    add_element(mb_data, (-0.20, 0.03, 0.10), foot_r, mtype="CAPSULE",
                size=(0.08, 0, 0), rotation=dir_quat((-0.05, 0.3, -0.6)))
    add_element(mb_data, (0.20, 0.03, 0.10), foot_r, mtype="CAPSULE",
                size=(0.08, 0, 0), rotation=dir_quat((0.05, 0.3, -0.6)))

    return mb_obj


def convert_to_mesh(mb_obj):
    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    eval_obj = mb_obj.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(eval_obj)
    real_obj = bpy.data.objects.new("ChibiBodyMesh", mesh)
    bpy.context.collection.objects.link(real_obj)
    bpy.data.objects.remove(mb_obj, do_unlink=True)
    return real_obj


def add_flat_material(obj, color, name="FurWhite"):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.65
    if "Specular IOR Level" in bsdf.inputs:
        bsdf.inputs["Specular IOR Level"].default_value = 0.15
    obj.data.materials.append(mat)


# Front-facing direction is +Y: the camera for the "+Y" render sits at
# center + (0,1,0)*distance looking back toward -Y, so it sees the +Y-facing
# hemisphere of the character. All face/clothing-front details below use
# positive Y offsets to land on that visible side.

def new_flat_mat(color, name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.5
    return mat


def add_sphere(name, location, radius, scale=(1, 1, 1), rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=location, segments=20, ring_count=12)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    bpy.ops.object.shade_smooth()
    if material:
        obj.data.materials.append(material)
    return obj


def add_cone(name, location, radius1, depth, scale=(1, 1, 1), rotation=(0, 0, 0), material=None):
    bpy.ops.mesh.primitive_cone_add(radius1=radius1, radius2=0.0, depth=depth, location=location, vertices=16)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = scale
    obj.rotation_euler = rotation
    bpy.ops.object.shade_smooth()
    if material:
        obj.data.materials.append(material)
    return obj


def build_vest(vest_color):
    """Vest as a torso-shaped blob (same elements as the body's torso, scaled
    slightly larger so it sits just outside the fur) trimmed to a chest-to-hip
    band with a boolean cube. Solid, not hollow -- fine for a flat-shaded
    silhouette sprite."""
    mb_data = bpy.data.metaballs.new("VestBlobData")
    mb_data.resolution = 0.035
    mb_obj = bpy.data.objects.new("VestBlob", mb_data)
    bpy.context.collection.objects.link(mb_obj)
    scale = 1.08
    e1 = mb_data.elements.new()
    e1.co = (0, 0, 0.86)
    e1.radius = 0.60 * scale

    bpy.context.view_layer.update()
    deps = bpy.context.evaluated_depsgraph_get()
    eval_obj = mb_obj.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(eval_obj)
    vest_obj = bpy.data.objects.new("Vest", mesh)
    bpy.context.collection.objects.link(vest_obj)
    bpy.data.objects.remove(mb_obj, do_unlink=True)

    # An ellipsoid cutter (not a flat-sided cube) so the vest's top/bottom
    # edges taper into a soft curve like real cloth, instead of a hard
    # razor-flat band that reads as a rigid rectangle.
    z_lo, z_hi = 0.20, 0.90
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1.0, location=(0, 0, (z_lo + z_hi) / 2), segments=24, ring_count=16)
    cutter = bpy.context.active_object
    cutter.scale = (1.4, 1.4, (z_hi - z_lo) / 2)

    bpy.context.view_layer.objects.active = vest_obj
    vest_obj.select_set(True)
    bool_mod = vest_obj.modifiers.new("Trim", "BOOLEAN")
    bool_mod.operation = "INTERSECT"
    bool_mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=bool_mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)

    bpy.ops.object.shade_smooth()
    vest_obj.data.materials.append(new_flat_mat(vest_color, "VestGreen"))
    return vest_obj


def build_bowtie(color):
    left = add_cone("BowLeft", (-0.12, 0.52, 0.95), 0.11, 0.05,
                     rotation=(math.radians(90), 0, math.radians(-100)),
                     material=new_flat_mat(color, "BowPink"))
    right = add_cone("BowRight", (0.12, 0.52, 0.95), 0.11, 0.05,
                      rotation=(math.radians(90), 0, math.radians(100)))
    right.data.materials.append(left.data.materials[0])
    knot = add_sphere("BowKnot", (0, 0.54, 0.95), 0.05,
                       material=left.data.materials[0])
    return [left, right, knot]


def build_buttons(color):
    mat = new_flat_mat(color, "GoldButton")
    b1 = add_sphere("Button1", (0, 0.66, 0.75), 0.035, material=mat)
    b2 = add_sphere("Button2", (0, 0.68, 0.52), 0.035, material=mat)
    return [b1, b2]


def build_emblem(apple_color, leaf_color):
    # Screen-right chest (world -X, since the +Y-facing camera mirrors X).
    apple = add_sphere("EmblemApple", (-0.28, 0.63, 0.66), 0.07, scale=(1.0, 0.55, 1.0),
                        material=new_flat_mat(apple_color, "EmblemApple"))
    leaf = add_cone("EmblemLeaf", (-0.23, 0.67, 0.74), 0.038, 0.10,
                     rotation=(math.radians(70), 0, math.radians(30)),
                     material=new_flat_mat(leaf_color, "EmblemLeaf"))
    return [apple, leaf]


def build_face(eye_color, nose_color):
    mat_eye = new_flat_mat(eye_color, "EyeDark")
    mat_nose = new_flat_mat(nose_color, "NoseDark")
    l_eye = add_sphere("EyeL", (-0.20, 0.60, 1.62), 0.055, scale=(1.0, 0.5, 0.8), material=mat_eye)
    r_eye = add_sphere("EyeR", (0.20, 0.60, 1.62), 0.055, scale=(1.0, 0.5, 0.8))
    r_eye.data.materials.append(mat_eye)
    nose = add_sphere("Nose", (0, 0.64, 1.48), 0.035, scale=(1.0, 0.6, 0.7), material=mat_nose)
    return [l_eye, r_eye, nose]


def enable_freestyle_outline(thickness=2.5, color=(0.16, 0.11, 0.09)):
    scene = bpy.context.scene
    scene.render.use_freestyle = True
    view_layer = bpy.context.view_layer
    view_layer.use_freestyle = True
    linesets = view_layer.freestyle_settings.linesets
    lineset = linesets[0] if len(linesets) else linesets.new("Lineset")
    if lineset.linestyle is None:
        lineset.linestyle = bpy.data.linestyles.new("OutlineStyle")
    ls = lineset.linestyle
    ls.color = color
    ls.thickness = thickness
    # Metaball-derived meshes have uneven triangulation that throws stray
    # "crease" lines across the surface; only silhouette/border edges are
    # wanted for the flat illustrated outline look.
    lineset.select_crease = False
    lineset.select_silhouette = True
    lineset.select_border = True


def setup_render(size):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 32
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def add_light():
    world = bpy.data.worlds.new("FlatWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.85, 0.86, 0.88, 1.0)
    bg.inputs["Strength"].default_value = 1.1
    bpy.context.scene.world = world
    for name, energy, rot in [
        ("Key", 1.8, (55, 0, 35)),
        ("Fill", 0.8, (60, 0, -140)),
    ]:
        data = bpy.data.lights.new(name, type="SUN")
        data.energy = energy
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.rotation_euler = Euler((math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2])), "XYZ")


def add_ortho_camera(center, height, distance, direction):
    cam_data = bpy.data.cameras.new("SpriteCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = height * 1.2
    cam_obj = bpy.data.objects.new("SpriteCam", cam_data)
    bpy.context.collection.objects.link(cam_obj)
    axis = {"+X": Vector((1, 0, 0)), "-X": Vector((-1, 0, 0)),
            "+Y": Vector((0, 1, 0)), "-Y": Vector((0, -1, 0))}[direction]
    cam_obj.location = center + axis * distance
    look_dir = (center - cam_obj.location).normalized()
    cam_obj.rotation_euler = look_dir.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam_obj
    return cam_obj


def render_to(path):
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)

    mb_obj = build_body()
    obj = convert_to_mesh(mb_obj)
    add_flat_material(obj, (0.96, 0.97, 0.98))

    vest_color = (0.30, 0.35, 0.31)
    pink = (0.80, 0.42, 0.52)
    gold = (0.85, 0.72, 0.35)
    build_vest(vest_color)
    build_bowtie(pink)
    build_buttons(gold)
    build_emblem(pink, gold)
    build_face((0.14, 0.10, 0.09), (0.14, 0.10, 0.09))

    setup_render(args.size)
    enable_freestyle_outline()
    add_light()

    center = Vector((0, 0, 1.25))
    height = 2.9
    distance = height * 2.2
    for direction in ["+Y", "-Y", "+X"]:
        cam = add_ortho_camera(center, height, distance, direction)
        render_to(os.path.join(args.outdir, f"body_{direction}.png"))
        bpy.data.objects.remove(cam, do_unlink=True)

    print("Done. Renders in", args.outdir)


if __name__ == "__main__":
    main()
