"""Quick headless preview: import a glTF/glb and render it from 4 sides with
the same flat-lighting + Freestyle-outline setup as build_chibi_rabbit.py, so
it can be visually compared against the procedural version and the reference
art on equal footing.

Usage:
  blender --background --python tools/preview_glb.py -- --input path.glb --outdir dir
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
    p.add_argument("--input", required=True)
    p.add_argument("--outdir", required=True)
    p.add_argument("--size", type=int, default=768)
    return p.parse_args(argv)


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
    scene.cycles.samples = 48
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
    for name, energy, rot in [("Key", 1.8, (55, 0, 35)), ("Fill", 0.8, (60, 0, -140))]:
        data = bpy.data.lights.new(name, type="SUN")
        data.energy = energy
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.rotation_euler = Euler((math.radians(rot[0]), math.radians(rot[1]), math.radians(rot[2])), "XYZ")


def world_bbox():
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
    bpy.ops.import_scene.gltf(filepath=args.input)

    setup_render(args.size)
    enable_freestyle_outline()
    add_light()

    mins, maxs = world_bbox()
    center = (mins + maxs) / 2
    height = maxs.z - mins.z
    distance = height * 2.2
    for direction in ["+Y", "-Y", "+X", "-X"]:
        cam = add_ortho_camera(center, height, distance, direction)
        render_to(os.path.join(args.outdir, f"glb_{direction}.png"))
        bpy.data.objects.remove(cam, do_unlink=True)

    print("bbox", mins, maxs)
    print("Done. Renders in", args.outdir)


if __name__ == "__main__":
    main()
