"""
Dead Man's Hand — bake & export (ADVANCED / OPTIONAL)
=====================================================

glTF cannot export Blender's procedural node materials — only image textures.
This script turns the procedural look into real PNG maps so the assets keep
their detail in the web game:

  for each asset collection it will:
    1. apply modifiers (bevel / screw / subsurf) and JOIN parts into one mesh
    2. UV-unwrap (Smart UV Project)
    3. bake DIFFUSE colour, NORMAL, and ROUGHNESS to images
    4. rebuild a single baked material from those images
    5. export <name>.glb (textures embedded) into EXPORT_DIR

USE THIS ONLY IF you want the full Blender look in-game. For most cases the
geometry-only path is easier: just run generate_assets.py with EXPORT=True and
let the game re-skin the meshes (see public/assets/README.md).

HOW TO RUN
----------
1. Run generate_assets.py first (so the collections exist).
2. Open this file in the Text Editor and Run Script.
   Baking uses Cycles and can take a minute. Watch the system console for
   progress (Window > Toggle System Console on Windows).

Tested against Blender 4.x.
"""

import bpy
import os
from math import radians

# ─────────────────────────── CONFIG ───────────────────────────
EXPORT_DIR  = "C:/Users/kucer/fantasy-poker/public/assets/"
TEX_RES     = 1024          # bake image resolution (512 / 1024 / 2048)
SAMPLES     = 8             # cycles bake samples (low is fine for these maps)
UV_MARGIN   = 0.03          # island padding to avoid seams bleeding

# collection name -> output file name
ASSETS = {
    "PokerTable":  "table",
    "ThroneChair": "chair",
    "ChipStack":   "chips",
    "PlayingCard": "card",
}


def _activate(obj):
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj


def _prep_cycles():
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    try:
        sc.cycles.device = "CPU"      # most reliable for baking everywhere
    except Exception:
        pass
    sc.cycles.samples = SAMPLES
    sc.render.bake.margin = 8
    sc.render.bake.use_selected_to_active = False


def _join_collection(coll):
    """Apply modifiers on every object, then join the collection into one mesh."""
    objs = [o for o in coll.all_objects if o.type == "MESH"]
    if not objs:
        return None
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.convert(target="MESH")   # applies all modifiers on selection
    bpy.ops.object.join()                    # -> single object (active)
    return bpy.context.view_layer.objects.active


def _unwrap(obj):
    _activate(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=radians(66), island_margin=UV_MARGIN)
    bpy.ops.object.mode_set(mode="OBJECT")


def _new_image(name, non_color=False):
    img = bpy.data.images.new(name, TEX_RES, TEX_RES, alpha=False)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def _set_bake_target(obj, image):
    """Add/point an Image Texture node in every material slot to `image` and make
    it the active node so bake writes into it."""
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        node = nt.nodes.get("BAKE_TARGET")
        if node is None:
            node = nt.nodes.new("ShaderNodeTexImage")
            node.name = "BAKE_TARGET"
            node.location = (-600, -400)
        node.image = image
        nt.nodes.active = node
        for n in nt.nodes:
            n.select = (n == node)


def _bake_pass(obj, image, bake_type, color_only=False):
    _set_bake_target(obj, image)
    _activate(obj)
    rb = bpy.context.scene.render.bake
    if bake_type == "DIFFUSE":
        rb.use_pass_direct = False
        rb.use_pass_indirect = False
        rb.use_pass_color = True
    bpy.ops.object.bake(type=bake_type)


def _save(image, path):
    image.filepath_raw = path
    image.file_format = "PNG"
    image.save()


def _baked_material(name, diff, norm, rough):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    n, l = nt.nodes, nt.links
    b = nt.nodes.get("Principled BSDF")

    t_d = n.new("ShaderNodeTexImage"); t_d.image = diff
    l.new(t_d.outputs["Color"], b.inputs["Base Color"])

    t_r = n.new("ShaderNodeTexImage"); t_r.image = rough
    l.new(t_r.outputs["Color"], b.inputs["Roughness"])

    t_n = n.new("ShaderNodeTexImage"); t_n.image = norm
    nm = n.new("ShaderNodeNormalMap")
    l.new(t_n.outputs["Color"], nm.inputs["Color"])
    l.new(nm.outputs["Normal"], b.inputs["Normal"])
    return mat


def _export(obj, name):
    os.makedirs(EXPORT_DIR, exist_ok=True)
    _activate(obj)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(EXPORT_DIR, f"{name}.glb"),
        use_selection=True, export_format="GLB", export_apply=True,
    )


def bake_collection(coll_name, out_name):
    coll = bpy.data.collections.get(coll_name)
    if not coll:
        print(f"[bake] skip: collection '{coll_name}' not found")
        return
    print(f"[bake] {coll_name} -> {out_name}.glb")
    _prep_cycles()

    obj = _join_collection(coll)
    if obj is None:
        print(f"[bake]  no meshes in {coll_name}")
        return
    _unwrap(obj)

    diff = _new_image(f"{out_name}_diffuse")
    norm = _new_image(f"{out_name}_normal", non_color=True)
    rough = _new_image(f"{out_name}_rough", non_color=True)

    _bake_pass(obj, diff, "DIFFUSE", color_only=True)
    _bake_pass(obj, norm, "NORMAL")
    _bake_pass(obj, rough, "ROUGHNESS")

    os.makedirs(os.path.join(EXPORT_DIR, "textures"), exist_ok=True)
    _save(diff, os.path.join(EXPORT_DIR, "textures", f"{out_name}_diffuse.png"))
    _save(norm, os.path.join(EXPORT_DIR, "textures", f"{out_name}_normal.png"))
    _save(rough, os.path.join(EXPORT_DIR, "textures", f"{out_name}_rough.png"))

    obj.data.materials.clear()
    obj.data.materials.append(_baked_material(f"{out_name}_baked", diff, norm, rough))

    _export(obj, out_name)
    print(f"[bake]  done: {out_name}.glb")


def main():
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    for coll_name, out_name in ASSETS.items():
        try:
            bake_collection(coll_name, out_name)
        except Exception as e:
            print(f"[bake] ERROR on {coll_name}: {e}")
    print("Bake & export finished.")


if __name__ == "__main__":
    main()
