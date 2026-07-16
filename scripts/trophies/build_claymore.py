"""Build the canonical Claymore trophy source, GLB, and poster in Blender.

Run from the repository root:
  blender --background --python scripts/trophies/build_claymore.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path.cwd()
SOURCE = ROOT / "design-reference" / "trophy-model-sources" / "claymore-v1.blend"
MODEL = ROOT / "public" / "trophies" / "claymore-v1.glb"
POSTER = ROOT / "public" / "trophies" / "claymore-v1.webp"


def material(name: str, color: tuple[float, float, float, float], metallic=0.0, roughness=0.45):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return value


INK = material("Ink", (0.011, 0.010, 0.008, 1), metallic=0.15, roughness=0.3)
BRASS = material("Brass", (0.62, 0.31, 0.09, 1), metallic=0.82, roughness=0.24)
SILVER = material("Sword steel", (0.62, 0.67, 0.67, 1), metallic=0.9, roughness=0.2)
CHARTREUSE = material("Tennis chartreuse", (0.58, 0.71, 0.12, 1), roughness=0.54)
RUST = material("Ciabatta rust", (0.36, 0.095, 0.045, 1), metallic=0.08, roughness=0.48)
WOOD = material("Plinth wood", (0.19, 0.065, 0.025, 1), roughness=0.62)


def bevel(object_, amount=0.008, segments=3):
    modifier = object_.modifiers.new("Soft manufactured edges", "BEVEL")
    modifier.width = amount
    modifier.segments = segments
    bpy.context.view_layer.objects.active = object_
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    return object_


def box(name, location, scale, surface, bevel_size=0.008):
    bpy.ops.mesh.primitive_cube_add(location=location)
    object_ = bpy.context.object
    object_.name = name
    object_.scale = tuple(value / 2 for value in scale)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bevel(object_, bevel_size)
    object_.data.materials.append(surface)
    return object_


def cylinder(name, location, radius, depth, surface, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    object_ = bpy.context.object
    object_.name = name
    bevel(object_, min(radius * 0.08, 0.006), 2)
    object_.data.materials.append(surface)
    return object_


def sphere(name, location, radius, surface):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=32, radius=radius, location=location)
    object_ = bpy.context.object
    object_.name = name
    object_.data.materials.append(surface)
    bpy.ops.object.shade_smooth()
    return object_


def sword(name: str, angle_degrees: float):
    collection = []
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    pivot = bpy.context.object
    pivot.name = f"{name} pivot"
    blade = box(f"{name} blade", (0, 0, 0.41), (0.036, 0.018, 0.43), SILVER, 0.005)
    point = bpy.data.meshes.new(f"{name} point mesh")
    point.from_pydata([(-0.018, -0.009, 0.625), (0.018, -0.009, 0.625), (0, -0.009, 0.69), (-0.018, 0.009, 0.625), (0.018, 0.009, 0.625), (0, 0.009, 0.69)], [], [(0, 1, 2), (3, 5, 4), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)])
    point.update()
    tip = bpy.data.objects.new(f"{name} point", point)
    bpy.context.collection.objects.link(tip)
    tip.data.materials.append(SILVER)
    guard = box(f"{name} guard", (0, -0.001, 0.185), (0.17, 0.035, 0.025), BRASS, 0.006)
    grip = cylinder(f"{name} grip", (0, 0, 0.105), 0.022, 0.14, WOOD, 32)
    pommel = sphere(f"{name} pommel", (0, 0, 0.027), 0.035, BRASS)
    for object_ in (blade, tip, guard, grip, pommel):
        object_.parent = pivot
        collection.append(object_)
    pivot.rotation_euler[1] = math.radians(angle_degrees)
    return collection


def look_at(object_, target):
    direction = Vector(target) - object_.location
    object_.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

box("Lower plinth", (0, 0, 0.035), (0.42, 0.25, 0.07), WOOD, 0.016)
box("Brass plinth rim", (0, 0, 0.085), (0.37, 0.22, 0.035), BRASS, 0.01)
box("Upper plinth", (0, 0, 0.125), (0.31, 0.18, 0.055), RUST, 0.012)
box("Winner engraving plate", (0, -0.096, 0.085), (0.24, 0.012, 0.05), BRASS, 0.005)

cylinder("Central stem", (0, 0, 0.255), 0.035, 0.22, BRASS, 48)
cylinder("Ball cradle", (0, 0, 0.37), 0.095, 0.025, BRASS, 64)
sphere("Tennis ball", (0, -0.002, 0.455), 0.112, CHARTREUSE)

# Pale curved seams make the central sphere read immediately as a tennis ball.
for side in (-1, 1):
    curve = bpy.data.curves.new(f"Ball seam {side}", "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.004
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(3)
    points = [(-0.07 * side, -0.105, 0.39), (-0.025 * side, -0.117, 0.435), (0.025 * side, -0.117, 0.475), (0.07 * side, -0.105, 0.52)]
    for bezier, coordinate in zip(spline.bezier_points, points):
        bezier.co = coordinate
        bezier.handle_left_type = "AUTO"
        bezier.handle_right_type = "AUTO"
    seam = bpy.data.objects.new(f"Ball seam {side}", curve)
    bpy.context.collection.objects.link(seam)
    seam.data.materials.append(SILVER)

sword("Left claymore", -28)
sword("Right claymore", 28)

# A small crown ties the silhouette back to the 2D Claymore mark.
cylinder("Crown collar", (0, 0, 0.62), 0.048, 0.028, BRASS, 40)
sphere("Crown finial", (0, 0, 0.665), 0.04, BRASS)

for object_ in bpy.context.scene.objects:
    if object_.type in {"MESH", "CURVE"}:
        object_.select_set(True)

bpy.context.scene.render.engine = "BLENDER_EEVEE"
bpy.context.scene.render.resolution_x = 720
bpy.context.scene.render.resolution_y = 900
bpy.context.scene.render.resolution_percentage = 100
bpy.context.scene.render.image_settings.file_format = "WEBP"
bpy.context.scene.render.image_settings.color_mode = "RGBA"
bpy.context.scene.render.image_settings.quality = 88
bpy.context.scene.render.film_transparent = True
bpy.context.scene.render.filepath = str(POSTER)
bpy.context.scene.world.color = (0.015, 0.013, 0.01)

bpy.ops.object.camera_add(location=(0.88, -1.28, 0.76))
camera = bpy.context.object
camera.data.lens = 58
look_at(camera, (0, 0, 0.33))
bpy.context.scene.camera = camera

for name, location, energy, size, color in [
    ("Warm key", (-0.8, -0.8, 1.25), 90, 0.8, (1.0, 0.66, 0.34)),
    ("Chartreuse rim", (0.7, 0.15, 0.9), 55, 0.6, (0.58, 0.78, 0.2)),
    ("Front fill", (0, -1.1, 0.35), 35, 0.7, (1.0, 0.9, 0.72)),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    look_at(light, (0, 0, 0.34))

SOURCE.parent.mkdir(parents=True, exist_ok=True)
MODEL.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
backup = SOURCE.with_suffix(".blend1")
if backup.exists():
    backup.unlink()
bpy.ops.render.render(write_still=True)

bpy.ops.object.select_all(action="DESELECT")
for object_ in bpy.context.scene.objects:
    if object_.type in {"MESH", "CURVE"}:
        object_.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=str(MODEL),
    export_format="GLB",
    use_selection=True,
    export_cameras=False,
    export_lights=False,
    export_animations=False,
    export_yup=True,
    export_apply=True,
)

print(f"Saved {SOURCE}")
print(f"Exported {MODEL}")
print(f"Rendered {POSTER}")
