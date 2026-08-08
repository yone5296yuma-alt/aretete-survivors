"""
Blender headless pipeline: VRM (from VRoid Studio) -> posed transparent PNG renders.

Run with Blender's own Python, e.g.:
  blender --background --python tools/vrm_sprite_pipeline.py -- ^
      --input path\\to\\character.vrm --outdir tools\\_render_out --name butlerRabbit --mode calibrate

Two modes:
  calibrate  - renders the rest pose from 4 cardinal directions (front/back/left/right)
               plus a handful of single-axis test rotations on one arm/leg bone.
               Use this ONCE per new VRM to read off, by eye, which camera direction
               is "front" and which local axis/sign each bone needs for its bend.
               Fill in CAMERA_FORWARD and AXIS_SIGN below from what you observe, then
               switch to --mode render.
  render     - renders every clip in POSES using the calibrated constants below and
               writes one PNG per frame into <outdir>/<name>/<clip>/NNN.png.
               A separate script (pack_sprite_sheet.py) assembles those into the
               sheet + anim.json the game actually loads.

This script deliberately does NOT guess VRM's forward axis or each bone's positive
rotation direction — those vary per model/importer version enough that guessing
produced real bugs in the 2D rig (see pixel-editor.html history). Calibrate first.
"""
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Euler, Vector

# ---------------------------------------------------------------------------
# Calibrate these two constants by eye after running --mode calibrate once.
# ---------------------------------------------------------------------------
CAMERA_FORWARD = "+Y"  # one of +X -X +Y -Y : which side the render was taken from that shows the character's FACE
AXIS_SIGN = {
    # bone: (axis_index 0/1/2 for X/Y/Z local euler, sign +1/-1) that BENDS the joint
    # forward (e.g. elbow curling inward, knee bending backward). Fill in after calibrate.
    "upper_arm_bend": (2, 1),
    "lower_arm_bend": (2, 1),
    "upper_leg_bend": (0, 1),
    "lower_leg_bend": (0, 1),
}

HUMAN_BONE_ATTRS = {
    "hips": "hips", "spine": "spine", "chest": "chest", "neck": "neck", "head": "head",
    "lUpperArm": "left_upper_arm", "lLowerArm": "left_lower_arm", "lHand": "left_hand",
    "rUpperArm": "right_upper_arm", "rLowerArm": "right_lower_arm", "rHand": "right_hand",
    "lUpperLeg": "left_upper_leg", "lLowerLeg": "left_lower_leg", "lFoot": "left_foot",
    "rUpperLeg": "right_upper_leg", "rLowerLeg": "right_lower_leg", "rFoot": "right_foot",
    "lShoulder": "left_shoulder", "rShoulder": "right_shoulder",
}


def parse_args():
    argv = sys.argv
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--input", required=True)
    p.add_argument("--outdir", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--mode", choices=["calibrate", "render"], default="calibrate")
    p.add_argument("--size", type=int, default=512)
    return p.parse_args(argv)


def import_vrm(path):
    bpy.ops.import_scene.vrm(filepath=path)
    armature = next((o for o in bpy.context.scene.objects if o.type == "ARMATURE"), None)
    if armature is None:
        raise RuntimeError("no armature found after VRM import")
    return armature


def bone_name_map(armature):
    ext = armature.data.vrm_addon_extension
    human_bones = ext.vrm1.humanoid.human_bones
    mapping = {}
    for short, attr in HUMAN_BONE_ATTRS.items():
        hb = getattr(human_bones, attr, None)
        name = hb.node.bone_name if hb and hb.node else ""
        if name:
            mapping[short] = name
    return mapping


def world_bbox(armature):
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    deps = bpy.context.evaluated_depsgraph_get()
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        eval_obj = obj.evaluated_get(deps)
        for corner in eval_obj.bound_box:
            world = eval_obj.matrix_world @ Vector(corner)
            mins.x, mins.y, mins.z = min(mins.x, world.x), min(mins.y, world.y), min(mins.z, world.z)
            maxs.x, maxs.y, maxs.z = max(maxs.x, world.x), max(maxs.y, world.y), max(maxs.z, world.z)
    return mins, maxs


def setup_render(size):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    world = bpy.data.worlds.new("World") if not scene.world else scene.world
    scene.world = world


def add_light():
    light_data = bpy.data.lights.new(name="KeySun", type="SUN")
    light_data.energy = 3.0
    light_obj = bpy.data.objects.new(name="KeySun", object_data=light_data)
    bpy.context.collection.objects.link(light_obj)
    light_obj.rotation_euler = Euler((math.radians(55), 0, math.radians(35)), "XYZ")
    fill_data = bpy.data.lights.new(name="FillSun", type="SUN")
    fill_data.energy = 1.2
    fill_obj = bpy.data.objects.new(name="FillSun", object_data=fill_data)
    bpy.context.collection.objects.link(fill_obj)
    fill_obj.rotation_euler = Euler((math.radians(60), 0, math.radians(-140)), "XYZ")


def add_ortho_camera(center, height, distance, direction):
    cam_data = bpy.data.cameras.new("SpriteCam")
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = height * 1.15
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


def reset_pose(armature):
    for pb in armature.pose.bones:
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (0, 0, 0)


def apply_pose(armature, bone_map, pose_deltas):
    for short_name, (rx, ry, rz) in pose_deltas.items():
        bone_name = bone_map.get(short_name)
        if not bone_name:
            continue
        pb = armature.pose.bones.get(bone_name)
        if not pb:
            continue
        pb.rotation_mode = "XYZ"
        pb.rotation_euler = (math.radians(rx), math.radians(ry), math.radians(rz))


def calibrate(armature, bone_map, outdir, size):
    setup_render(size)
    add_light()
    reset_pose(armature)
    bpy.context.view_layer.update()
    mins, maxs = world_bbox(armature)
    center = (mins + maxs) / 2
    height = maxs.z - mins.z
    distance = height * 2.5

    cal_dir = os.path.join(outdir, "_calibrate")
    os.makedirs(cal_dir, exist_ok=True)

    for direction in ["+X", "-X", "+Y", "-Y"]:
        cam = add_ortho_camera(center, height, distance, direction)
        render_to(os.path.join(cal_dir, f"rest_{direction}.png"))
        bpy.data.objects.remove(cam, do_unlink=True)

    cam = add_ortho_camera(center, height, distance, CAMERA_FORWARD)
    test_bone = "rUpperArm" if "rUpperArm" in bone_map else next(iter(bone_map))
    for axis_i, axis_name in enumerate("XYZ"):
        for sign, label in [(1, "pos"), (-1, "neg")]:
            reset_pose(armature)
            deltas = {test_bone: [0, 0, 0]}
            deltas[test_bone][axis_i] = 45 * sign
            apply_pose(armature, bone_map, {test_bone: tuple(deltas[test_bone])})
            bpy.context.view_layer.update()
            render_to(os.path.join(cal_dir, f"testbone_{test_bone}_{axis_name}_{label}.png"))
    reset_pose(armature)

    print("BONE_MAP:", json.dumps(bone_map, ensure_ascii=False))
    print(f"Calibration renders written to {cal_dir}")
    print(f"Test bone used: {test_bone}")


# Body-part rotation deltas per keyframe, in the SAME spirit as poseFromAngles
# in pixel-editor.html: named clips made of a few key poses, interpolated.
# Fill in real per-bone target angles once AXIS_SIGN is calibrated; these are
# placeholders using a generic "bend forward" helper so the script runs end to
# end, but will look wrong until calibration constants above are correct.
def bend(part, deg):
    axis_i, sign = AXIS_SIGN[part]
    v = [0, 0, 0]
    v[axis_i] = deg * sign
    return tuple(v)


POSES = {
    "idle": {"fps": 3, "loop": True, "keys": [
        {},
        {"chest": (2, 0, 0)},
    ]},
    "walk": {"fps": 10, "loop": True, "keys": [
        {"rUpperLeg": bend("upper_leg_bend", 25), "lUpperLeg": bend("upper_leg_bend", -25)},
        {},
        {"rUpperLeg": bend("upper_leg_bend", -25), "lUpperLeg": bend("upper_leg_bend", 25)},
        {},
    ]},
    "attack": {"fps": 12, "loop": False, "keys": [
        {"rUpperArm": bend("upper_arm_bend", -60), "rLowerArm": bend("lower_arm_bend", -40)},
        {"rUpperArm": bend("upper_arm_bend", 30), "rLowerArm": bend("lower_arm_bend", 10)},
        {"rUpperArm": bend("upper_arm_bend", 45)},
    ]},
    "hurt": {"fps": 14, "loop": False, "keys": [
        {"chest": (-8, 0, 0)},
        {},
    ]},
    "cheer": {"fps": 6, "loop": True, "keys": [
        {},
        {"lUpperArm": bend("upper_arm_bend", 100), "rUpperArm": bend("upper_arm_bend", 100)},
    ]},
}


def render_clips(armature, bone_map, outdir, name, size):
    setup_render(size)
    add_light()
    reset_pose(armature)
    bpy.context.view_layer.update()
    mins, maxs = world_bbox(armature)
    center = (mins + maxs) / 2
    height = maxs.z - mins.z
    distance = height * 2.5
    add_ortho_camera(center, height, distance, CAMERA_FORWARD)

    for clip_name, clip in POSES.items():
        clip_dir = os.path.join(outdir, name, clip_name)
        os.makedirs(clip_dir, exist_ok=True)
        for i, deltas in enumerate(clip["keys"]):
            reset_pose(armature)
            apply_pose(armature, bone_map, deltas)
            bpy.context.view_layer.update()
            render_to(os.path.join(clip_dir, f"{i:03d}.png"))
    reset_pose(armature)


def main():
    args = parse_args()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    armature = import_vrm(args.input)
    bone_map = bone_name_map(armature)
    os.makedirs(args.outdir, exist_ok=True)
    if args.mode == "calibrate":
        calibrate(armature, bone_map, args.outdir, args.size)
    else:
        render_clips(armature, bone_map, args.outdir, args.name, args.size)


if __name__ == "__main__":
    main()
