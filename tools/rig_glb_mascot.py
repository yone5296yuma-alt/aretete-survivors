"""
Rig a static (unrigged) glb mascot mesh -- like the Tripo-generated bunny --
with a simple custom armature, then pose/render/export frames the same way
vrm_sprite_pipeline.py does for VRM humanoids. This mesh has no bones and no
standard humanoid layout, so instead of the VRM human-bone lookup, a small
hand-placed skeleton (root/spine/head/ears/arms/legs) is built and bound via
Blender's automatic (envelope) weighting -- reasonable for a simple blobby
mascot body.

Usage:
  blender --background --python tools/rig_glb_mascot.py -- ^
      --input path.glb --outdir dir --mode calibrate
      (or --mode render --name butlerRabbit3d)

calibrate: renders the rest pose plus small single-bone test rotations from
the front, so weighting/bone placement can be checked by eye before trusting
it for real animation poses. Always run this first on a new mesh.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

# Bone layout as fractions of total figure height (0=feet, 1=ear tip), tuned
# against this specific bunny's bounding box; recalibrate per-mesh if reused.
BONES = {
    "root": {"parent": None, "head": (0, 0, 0.06), "tail": (0, 0, 0.20)},
    "spine": {"parent": "root", "head": (0, 0, 0.20), "tail": (0, 0, 0.55)},
    "head": {"parent": "spine", "head": (0, 0, 0.55), "tail": (0, 0, 0.85)},
    "earL": {"parent": "head", "head": (-0.10, 0, 0.80), "tail": (-0.18, 0, 0.98)},
    "earR": {"parent": "head", "head": (0.12, 0, 0.80), "tail": (0.22, 0, 0.98)},
    "armL": {"parent": "spine", "head": (-0.24, 0, 0.45), "tail": (-0.26, 0, 0.28)},
    "armR": {"parent": "spine", "head": (0.24, 0, 0.45), "tail": (0.26, 0, 0.28)},
    "legL": {"parent": "root", "head": (-0.13, 0, 0.10), "tail": (-0.13, 0, 0.0)},
    "legR": {"parent": "root", "head": (0.13, 0, 0.10), "tail": (0.13, 0, 0.0)},
}


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--outdir", required=True)
    p.add_argument("--name", default="mascot")
    p.add_argument("--mode", choices=["calibrate", "render"], default="calibrate")
    p.add_argument("--size", type=int, default=512)
    return p.parse_args(argv)


def import_glb(path):
    bpy.ops.import_scene.gltf(filepath=path)
    mesh_obj = next((o for o in bpy.context.selected_objects if o.type == "MESH"), None)
    if mesh_obj is None:
        raise RuntimeError("no mesh found after glb import")
    return mesh_obj


def world_bbox(mesh_obj):
    deps = bpy.context.evaluated_depsgraph_get()
    eval_obj = mesh_obj.evaluated_get(deps)
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for corner in eval_obj.bound_box:
        world = eval_obj.matrix_world @ Vector(corner)
        mins.x, mins.y, mins.z = min(mins.x, world.x), min(mins.y, world.y), min(mins.z, world.z)
        maxs.x, maxs.y, maxs.z = max(maxs.x, world.x), max(maxs.y, world.y), max(maxs.z, world.z)
    return mins, maxs


def build_armature(mesh_obj):
    mins, maxs = world_bbox(mesh_obj)
    height = maxs.z - mins.z
    base_z = mins.z

    def to_world(frac):
        return Vector((frac[0] * height, frac[1] * height, base_z + frac[2] * height))

    arm_data = bpy.data.armatures.new("MascotArmature")
    arm_obj = bpy.data.objects.new("MascotArmature", arm_data)
    bpy.context.collection.objects.link(arm_obj)
    bpy.context.view_layer.objects.active = arm_obj
    bpy.ops.object.mode_set(mode="EDIT")
    edit_bones = arm_data.edit_bones
    created = {}
    for name, spec in BONES.items():
        b = edit_bones.new(name)
        b.head = to_world(spec["head"])
        b.tail = to_world(spec["tail"])
        b.envelope_distance = 0.16 * height
        b.head_radius = 0.10 * height
        b.tail_radius = 0.10 * height
        created[name] = b
    for name, spec in BONES.items():
        if spec["parent"]:
            created[name].parent = created[spec["parent"]]
    bpy.ops.object.mode_set(mode="OBJECT")

    bpy.ops.object.select_all(action="DESELECT")
    mesh_obj.select_set(True)
    arm_obj.select_set(True)
    bpy.context.view_layer.objects.active = arm_obj
    # Envelope (distance-based) weighting instead of automatic heat-diffusion
    # weighting -- the heat solver failed silently on this mesh (likely thin
    # disconnected geometry like the whiskers confusing it), leaving every
    # bone with zero influence and a completely rigid mesh under posing.
    # Envelope weighting is purely geometric and doesn't have that failure mode.
    bpy.ops.object.parent_set(type="ARMATURE_ENVELOPE")
    return arm_obj


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
    lineset.select_crease = False
    lineset.select_silhouette = True
    lineset.select_border = True


def setup_render(size):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 128
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"


def add_light():
    # Previous version used a bright near-white world background (strength
    # 1.1) as fill light - that's a huge ambient softbox surrounding the
    # whole scene, which washes out the Key/Fill directional contrast and is
    # why earlier renders read flat despite having two sun lamps. Dropping
    # the world to a dim ambient floor and doing the actual fill/shading via
    # a proper 3-light rig (key/fill/rim) gives real shading gradients.
    world = bpy.data.worlds.new("FlatWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0.65, 0.68, 0.75, 1.0)
    bg.inputs["Strength"].default_value = 0.3
    bpy.context.scene.world = world
    lights = [
        ("Key", 3.2, (55, 0, 35)),     # main directional light, upper-front-right
        ("Fill", 1.0, (65, 0, -140)),  # softer opposite-side fill, keeps shadows from crushing to black
        ("Rim", 2.0, (110, 0, 200)),   # backlight for edge/silhouette separation from the background
    ]
    for name, energy, rot in lights:
        data = bpy.data.lights.new(name, type="SUN")
        data.energy = energy
        data.angle = math.radians(3.0)  # small penumbra - soft but not shadowless
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.rotation_euler = Euler((math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2])), "XYZ")


def add_ortho_camera(center, height, distance, direction):
    cam_data = bpy.data.cameras.new("SpriteCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = height * 1.25
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


def reset_pose(arm_obj):
    for pb in arm_obj.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)


def apply_pose(arm_obj, deltas):
    for bone_name, (rx, ry, rz) in deltas.items():
        pb = arm_obj.pose.bones.get(bone_name)
        if not pb:
            continue
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))


def calibrate(mesh_obj, arm_obj, outdir, size):
    setup_render(size)
    add_light()
    reset_pose(arm_obj)
    bpy.context.view_layer.update()
    mins, maxs = world_bbox(mesh_obj)
    center = (mins + maxs) / 2
    height = maxs.z - mins.z
    distance = height * 2.4

    cal_dir = os.path.join(outdir, "_calibrate")
    os.makedirs(cal_dir, exist_ok=True)
    cam = add_ortho_camera(center, height, distance, "+Y")
    render_to(os.path.join(cal_dir, "rest.png"))

    for bone_name in BONES:
        for axis_i, axis_name in enumerate("XYZ"):
            reset_pose(arm_obj)
            angles = [0, 0, 0]
            angles[axis_i] = 35
            apply_pose(arm_obj, {bone_name: tuple(angles)})
            bpy.context.view_layer.update()
            render_to(os.path.join(cal_dir, f"{bone_name}_{axis_name}.png"))
    reset_pose(arm_obj)
    bpy.data.objects.remove(cam, do_unlink=True)
    print(f"Calibration renders in {cal_dir}")


POSES = {
    "idle": {"fps": 3, "loop": True, "keys": [
        {},
        {"spine": (2, 0, 0)},
    ]},
    "walk": {"fps": 10, "loop": True, "keys": [
        {"legL": (25, 0, 0), "legR": (-25, 0, 0)},
        {},
        {"legL": (-25, 0, 0), "legR": (25, 0, 0)},
        {},
    ]},
    "attack": {"fps": 12, "loop": False, "keys": [
        {"armR": (0, 0, -55)},
        {"armR": (0, 0, 25)},
        {"armR": (0, 0, 40)},
    ]},
    "hurt": {"fps": 14, "loop": False, "keys": [
        {"spine": (-10, 0, 0), "head": (-8, 0, 0)},
        {},
    ]},
    "cheer": {"fps": 6, "loop": True, "keys": [
        {},
        {"armL": (0, 0, 100), "armR": (0, 0, -100)},
    ]},
}


def render_clips(mesh_obj, arm_obj, outdir, name, size):
    setup_render(size)
    add_light()
    reset_pose(arm_obj)
    bpy.context.view_layer.update()
    mins, maxs = world_bbox(mesh_obj)
    center = (mins + maxs) / 2
    height = maxs.z - mins.z
    distance = height * 2.4
    add_ortho_camera(center, height, distance, "-Y")

    for clip_name, clip in POSES.items():
        clip_dir = os.path.join(outdir, name, clip_name)
        os.makedirs(clip_dir, exist_ok=True)
        for i, deltas in enumerate(clip["keys"]):
            reset_pose(arm_obj)
            apply_pose(arm_obj, deltas)
            bpy.context.view_layer.update()
            render_to(os.path.join(clip_dir, f"{i:03d}.png"))
    reset_pose(arm_obj)


def main():
    args = parse_args()
    os.makedirs(args.outdir, exist_ok=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mesh_obj = import_glb(args.input)
    arm_obj = build_armature(mesh_obj)
    enable_freestyle_outline()

    if args.mode == "calibrate":
        calibrate(mesh_obj, arm_obj, args.outdir, args.size)
    else:
        render_clips(mesh_obj, arm_obj, args.outdir, args.name, args.size)


if __name__ == "__main__":
    main()
