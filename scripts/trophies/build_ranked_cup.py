"""Build the ranked-cup Blender source, GLB, and transparent poster.

Run from the repository root:
  blender --background --python scripts/trophies/build_ranked_cup.py
"""

from __future__ import annotations

import math
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path.cwd()
SOURCE = ROOT / "design-reference" / "trophy-model-sources" / "ranked-cup-v1.blend"
MODEL = ROOT / "public" / "trophies" / "ranked-cup-v1.glb"
POSTER = ROOT / "public" / "trophies" / "ranked-cup-v1.webp"


def material(name: str, color: tuple[float, float, float, float], metallic=0.0, roughness=0.45):
    value = bpy.data.materials.new(name)
    value.diffuse_color = color
    value.use_nodes = True
    shader = value.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    return value


INK = material("Ink", (0.011, 0.010, 0.008, 1), metallic=0.12, roughness=0.32)
BRASS = material("Warm brass", (0.72, 0.39, 0.12, 1), metallic=0.86, roughness=0.24)
RUST = material("Ciabatta cup", (0.50, 0.20, 0.075, 1), metallic=0.32, roughness=0.34)
CHARTREUSE = material("Tennis chartreuse", (0.60, 0.76, 0.13, 1), roughness=0.48)
CREAM = material("Ball seam", (0.88, 0.84, 0.70, 1), roughness=0.55)
WOOD = material("Dark plinth", (0.19, 0.065, 0.025, 1), roughness=0.62)


def bevel(object_, amount=0.006, segments=3):
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


def cylinder(name, location, radius, depth, surface, vertices=48, rotation=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation or (0, 0, 0))
    object_ = bpy.context.object
    object_.name = name
    bevel(object_, min(radius * 0.08, 0.006), 2)
    object_.data.materials.append(surface)
    return object_


def revolved_body(name, profile, surface, segments=64):
    vertices = []
    faces = []
    for index in range(segments):
        angle = 2 * math.pi * index / segments
        for radius, height in profile:
            vertices.append((radius * math.cos(angle), radius * math.sin(angle), height))
    rows = len(profile)
    for index in range(segments):
        following = (index + 1) % segments
        for row in range(rows - 1):
            a = index * rows + row
            b = following * rows + row
            faces.append((a, b, b + 1, a + 1))
    mesh = bpy.data.meshes.new(f"{name} mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    object_ = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(object_)
    object_.data.materials.append(surface)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return object_


def handle(name, side):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = 0.014
    curve.bevel_resolution = 3
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(4)
    points = [
        (0.135 * side, 0, 0.445),
        (0.235 * side, 0, 0.435),
        (0.235 * side, 0, 0.325),
        (0.17 * side, 0, 0.285),
        (0.072 * side, 0, 0.305),
    ]
    for index, (point, coordinate) in enumerate(zip(spline.bezier_points, points)):
        point.co = coordinate
        handle_type = "VECTOR" if index in {0, len(points) - 1} else "AUTO"
        point.handle_left_type = handle_type
        point.handle_right_type = handle_type
    object_ = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(object_)
    object_.data.materials.append(BRASS)
    return object_


def front_curve(name, points, surface, depth=0.0035):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.bevel_depth = depth
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    object_ = bpy.data.objects.new(name, curve)
    bpy.context.collection.objects.link(object_)
    object_.data.materials.append(surface)
    return object_


def look_at(object_, target):
    direction = Vector(target) - object_.location
    object_.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

# A compact stepped plinth keeps the model grounded at real-world scale.
box("Lower plinth", (0, 0, 0.035), (0.40, 0.26, 0.07), WOOD, 0.014)
box("Brass plinth", (0, 0, 0.085), (0.35, 0.22, 0.04), BRASS, 0.009)
box("Upper plinth", (0, 0, 0.125), (0.29, 0.18, 0.045), RUST, 0.009)
box("Engraving plate", (0, -0.116, 0.078), (0.25, 0.012, 0.052), BRASS, 0.004)

cylinder("Stem foot", (0, 0, 0.165), 0.072, 0.035, BRASS)
cylinder("Stem", (0, 0, 0.235), 0.032, 0.12, BRASS)
cylinder("Bowl collar", (0, 0, 0.29), 0.075, 0.035, BRASS)

# The rust body and wide brass lip reproduce the 2D RankedCupIcon silhouette.
revolved_body("Cup body", [(0.052, 0.285), (0.09, 0.315), (0.125, 0.38), (0.145, 0.47)], RUST)
bpy.ops.mesh.primitive_torus_add(major_radius=0.145, minor_radius=0.012, major_segments=64, minor_segments=12, location=(0, 0, 0.47))
bpy.context.object.name = "Brass cup rim"
bpy.context.object.data.materials.append(BRASS)
handle("Left handle", -1)
handle("Right handle", 1)

# A raised tennis-ball medallion makes the shelf icon readable in 3D and AR.
cylinder("Tennis badge", (0, -0.143, 0.405), 0.052, 0.018, CHARTREUSE, rotation=(math.pi / 2, 0, 0))
cylinder("Badge rim", (0, -0.154, 0.405), 0.060, 0.008, BRASS, rotation=(math.pi / 2, 0, 0))
cylinder("Badge face", (0, -0.160, 0.405), 0.050, 0.006, CHARTREUSE, rotation=(math.pi / 2, 0, 0))
front_curve("Left ball seam", [(-0.028, -0.165, 0.37), (-0.008, -0.166, 0.39), (-0.008, -0.166, 0.42), (-0.028, -0.165, 0.44)], CREAM)
front_curve("Right ball seam", [(0.028, -0.165, 0.37), (0.008, -0.166, 0.39), (0.008, -0.166, 0.42), (0.028, -0.165, 0.44)], CREAM)

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

bpy.ops.object.camera_add(location=(0.72, -1.15, 0.61))
camera = bpy.context.object
camera.data.lens = 58
look_at(camera, (0, 0, 0.27))
bpy.context.scene.camera = camera

for name, location, energy, size, color in [
    ("Warm key", (-0.7, -0.8, 1.05), 90, 0.75, (1.0, 0.66, 0.34)),
    ("Chartreuse rim", (0.65, 0.2, 0.75), 50, 0.55, (0.58, 0.78, 0.2)),
    ("Front fill", (0, -1.0, 0.34), 32, 0.65, (1.0, 0.9, 0.72)),
]:
    bpy.ops.object.light_add(type="AREA", location=location)
    light = bpy.context.object
    light.name = name
    light.data.energy = energy
    light.data.shape = "DISK"
    light.data.size = size
    light.data.color = color
    look_at(light, (0, 0, 0.3))

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
