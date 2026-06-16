"""
Dead Man's Hand — Blender asset generators
==========================================

Procedurally builds the fantasy poker assets (table, throne chair, chips, card)
to match the reference sheet: dark carved wood, emerald felt, aged brass, tufted
leather. Node-based materials give real surface relief (grain / brushed metal /
quilting) so nothing reads flat in Blender.

HOW TO RUN
----------
1. Blender > "Scripting" workspace > Text Editor > Text > Open... > this file
   (or paste it into a New text block).
2. Click "Run Script"  (or hover the editor and press Alt+P).
3. Each asset is built into its own Collection, spaced along X.

EXPORTING TO THE WEB GAME
-------------------------
glTF/GLB does NOT understand Blender procedural nodes — it only exports image
textures + the Principled base/metallic/roughness factors. So if you want these
to look textured in the Three.js game you must BAKE first:
   - Select the object > Properties > Render > set engine to Cycles
   - Add an Image Texture node (new image, e.g. 1024x1024) to the material,
     keep it selected/active, and use Render > Bake (Combined or Diffuse/Normal)
   - Then File > Export > glTF 2.0 (.glb)
Set EXPORT = True and EXPORT_DIR below to auto-export the raw GLBs (un-baked).

Tested against Blender 4.x.
"""

import bpy
from math import pi, cos, sin, radians
from mathutils import Vector

# ─────────────────────────── CONFIG ───────────────────────────
CLEAR_SCENE = True            # wipe the current scene first
EXPORT      = False           # export each collection to GLB (geometry-only)
# Where GLBs are written. The game serves /public at the site root, so this
# lands them at /assets/*.glb ready for the in-game loader. Use forward slashes.
EXPORT_DIR  = "C:/Users/kucer/fantasy-poker/public/assets/"

# Palette (linear-ish RGBA)
C_WOOD_DARK   = (0.045, 0.020, 0.008, 1)
C_WOOD_LIGHT  = (0.230, 0.110, 0.045, 1)
C_FELT        = (0.020, 0.190, 0.120, 1)
C_BRASS       = (0.640, 0.460, 0.150, 1)
C_PARCHMENT   = (0.880, 0.820, 0.660, 1)
CUSHION = {
    "navy":   (0.030, 0.060, 0.180, 1),
    "crimson":(0.230, 0.030, 0.030, 1),
    "emerald":(0.020, 0.180, 0.090, 1),
    "purple": (0.120, 0.050, 0.230, 1),
}
CHIP = {
    "red":   (0.420, 0.060, 0.050, 1),
    "blue":  (0.040, 0.170, 0.480, 1),
    "green": (0.040, 0.300, 0.150, 1),
    "purple":(0.230, 0.080, 0.460, 1),
}


# ─────────────────────────── SCENE / COLLECTION HELPERS ───────────────────────────
def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.curves):
        for b in list(block):
            if b.users == 0:
                block.remove(b)


def collection(name):
    if name in bpy.data.collections:
        coll = bpy.data.collections[name]
    else:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def to_collection(obj, coll):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


# ─────────────────────────── PRIMITIVE HELPERS ───────────────────────────
def _take():               # grab the object the last operator created
    return bpy.context.active_object


def cylinder(r, depth, loc, verts=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc)
    return _take()


def cube(size, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = _take()
    o.scale = (size[0] / 2, size[1] / 2, size[2] / 2)
    return o


def torus(major, minor, loc, mseg=48, nseg=12):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor,
                                     major_segments=mseg, minor_segments=nseg, location=loc)
    return _take()


def sphere(r, loc, seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    return _take()


def cone(r1, r2, depth, loc, verts=16):
    bpy.ops.mesh.primitive_cone_add(radius1=r1, radius2=r2, depth=depth, vertices=verts, location=loc)
    return _take()


def smooth(obj):
    for p in obj.data.polygons:
        p.use_smooth = True


def bevel(obj, width=0.006, segments=2, angle=True):
    m = obj.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE" if angle else "NONE"
    m.angle_limit = radians(35)
    return m


def lathe(name, profile, coll, segments=64):
    """profile: list of (radius, z) revolved 360 deg around Z -> turned solid."""
    verts = [(r, 0.0, z) for (r, z) in profile]
    edges = [(i, i + 1) for i in range(len(verts) - 1)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, edges, [])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    sc = obj.modifiers.new("Screw", "SCREW")
    sc.axis = "Z"
    sc.angle = radians(360)
    sc.steps = segments
    sc.render_steps = segments
    sc.use_merge_vertices = True
    sc.use_normal_calculate = True
    smooth(obj)
    return obj


def setmat(obj, mat):
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def ring_of_studs(coll, mat, count, radius, z, size=0.012, center=(0, 0)):
    for i in range(count):
        a = 2 * pi * i / count
        s = sphere(size, (center[0] + cos(a) * radius, center[1] + sin(a) * radius, z), seg=8)
        smooth(s)
        setmat(s, mat)
        to_collection(s, coll)


# ─────────────────────────── MATERIALS (node-based relief) ───────────────────────────
def _principled(mat):
    return mat.node_tree.nodes.get("Principled BSDF")


def mat_wood(name, scale=6.0, bump=0.30):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    n, l = nt.nodes, nt.links
    b = _principled(mat)
    b.inputs["Roughness"].default_value = 0.74
    b.inputs["Metallic"].default_value = 0.0

    tc = n.new("ShaderNodeTexCoord")
    mp = n.new("ShaderNodeMapping")
    mp.inputs["Scale"].default_value = (scale, 1.0, 1.0)
    wave = n.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "X"
    wave.inputs["Scale"].default_value = 2.0
    wave.inputs["Distortion"].default_value = 7.0
    wave.inputs["Detail"].default_value = 3.0
    ramp = n.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = C_WOOD_DARK
    ramp.color_ramp.elements[1].color = C_WOOD_LIGHT
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 14.0
    bmp = n.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = bump

    l.new(tc.outputs["Object"], mp.inputs["Vector"])
    l.new(mp.outputs["Vector"], wave.inputs["Vector"])
    l.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    l.new(ramp.outputs["Color"], b.inputs["Base Color"])
    l.new(mp.outputs["Vector"], noise.inputs["Vector"])
    l.new(noise.outputs["Fac"], bmp.inputs["Height"])
    l.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return mat


def mat_brass(name, color=C_BRASS):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    n, l = nt.nodes, nt.links
    b = _principled(mat)
    b.inputs["Base Color"].default_value = color
    b.inputs["Metallic"].default_value = 1.0

    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 30.0
    noise.inputs["Detail"].default_value = 6.0
    rough = n.new("ShaderNodeValToRGB")
    rough.color_ramp.elements[0].color = (0.30, 0.30, 0.30, 1)  # shiny
    rough.color_ramp.elements[1].color = (0.62, 0.62, 0.62, 1)  # patina
    bmp = n.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.12

    l.new(noise.outputs["Fac"], rough.inputs["Fac"])
    l.new(rough.outputs["Color"], b.inputs["Roughness"])
    l.new(noise.outputs["Fac"], bmp.inputs["Height"])
    l.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return mat


def mat_felt(name, color=C_FELT):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    n, l = nt.nodes, nt.links
    b = _principled(mat)
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = 0.97
    noise = n.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 220.0
    bmp = n.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.06
    l.new(noise.outputs["Fac"], bmp.inputs["Height"])
    l.new(bmp.outputs["Normal"], b.inputs["Normal"])
    return mat


def mat_leather(name, color):
    """Diamond-quilted leather: a 45deg-rotated checker drives the bump (tufting)."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    n, l = nt.nodes, nt.links
    b = _principled(mat)
    b.inputs["Base Color"].default_value = color
    b.inputs["Roughness"].default_value = 0.6

    tc = n.new("ShaderNodeTexCoord")
    mp = n.new("ShaderNodeMapping")
    mp.inputs["Rotation"].default_value = (0, 0, radians(45))
    mp.inputs["Scale"].default_value = (10, 10, 10)
    chk = n.new("ShaderNodeTexChecker")
    chk.inputs["Scale"].default_value = 1.0
    grain = n.new("ShaderNodeTexNoise")
    grain.inputs["Scale"].default_value = 200.0
    bmp = n.new("ShaderNodeBump")
    bmp.inputs["Strength"].default_value = 0.45
    bmp2 = n.new("ShaderNodeBump")
    bmp2.inputs["Strength"].default_value = 0.08

    l.new(tc.outputs["Object"], mp.inputs["Vector"])
    l.new(mp.outputs["Vector"], chk.inputs["Vector"])
    l.new(chk.outputs["Fac"], bmp.inputs["Height"])
    l.new(grain.outputs["Fac"], bmp2.inputs["Height"])
    l.new(bmp.outputs["Normal"], bmp2.inputs["Normal"])
    l.new(bmp2.outputs["Normal"], b.inputs["Normal"])
    return mat


def mat_simple(name, color, metallic=0.0, rough=0.7):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    b = _principled(mat)
    b.inputs["Base Color"].default_value = color
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = rough
    return mat


# ─────────────────────────── ASSET: POKER TABLE ───────────────────────────
def build_table(origin=(0, 0, 0)):
    coll = collection("PokerTable")
    ox, oy, _ = origin
    M_wood = mat_wood("Table_Wood", scale=5.0)
    M_woodDark = mat_wood("Table_WoodDark", scale=8.0, bump=0.4)
    M_brass = mat_brass("Table_Brass")
    M_felt = mat_felt("Table_Felt")

    R = 0.75          # outer radius
    TOP_Z = 0.70      # top surface height

    # Turned pedestal + foot (revolved profile)
    profile = [
        (0.00, 0.00), (0.34, 0.00), (0.34, 0.035), (0.27, 0.06), (0.27, 0.10),
        (0.17, 0.14), (0.11, 0.22), (0.15, 0.30), (0.10, 0.38), (0.12, 0.44),
        (0.30, 0.54), (0.42, 0.60), (0.42, TOP_Z - 0.08), (0.0, TOP_Z - 0.08),
    ]
    ped = lathe("Table_Pedestal", profile, coll, segments=64)
    ped.location = (ox, oy, 0)
    setmat(ped, M_wood)

    # Wooden rim slab
    rim = cylinder(R, 0.08, (ox, oy, TOP_Z - 0.02), verts=64)
    bevel(rim, 0.015, 3)
    smooth(rim)
    setmat(rim, M_wood)

    # Carved skirt belly under the slab
    skirt = cone(R - 0.03, R - 0.18, 0.12, (ox, oy, TOP_Z - 0.10), verts=64)
    smooth(skirt)
    setmat(skirt, M_woodDark)

    # Emerald felt inset
    felt = cylinder(R - 0.13, 0.03, (ox, oy, TOP_Z + 0.03), verts=64)
    bevel(felt, 0.004, 2)
    smooth(felt)
    setmat(felt, M_felt)

    # Inner felt gold ring + outer brass binding
    gring = torus(R - 0.13, 0.012, (ox, oy, TOP_Z + 0.045), mseg=64, nseg=10)
    smooth(gring)
    setmat(gring, M_brass)
    binding = torus(R + 0.005, 0.03, (ox, oy, TOP_Z), mseg=80, nseg=12)
    smooth(binding)
    setmat(binding, M_brass)

    # Brass stud ring around the rim
    ring_of_studs(coll, M_brass, 36, R + 0.01, TOP_Z + 0.02, size=0.014, center=(ox, oy))

    for o in (ped, rim, skirt, felt, gring, binding):
        to_collection(o, coll)
    return coll


# ─────────────────────────── ASSET: THRONE CHAIR ───────────────────────────
def build_chair(origin=(0, 0, 0), cushion_color=CUSHION["navy"], low_back=False):
    coll = collection("ThroneChair")
    ox, oy, _ = origin
    M_wood = mat_wood("Chair_Wood", scale=4.0)
    M_brass = mat_brass("Chair_Brass")
    M_leather = mat_leather("Chair_Leather", cushion_color)

    seat_z = 0.46
    back_h = 0.55 if low_back else 0.95
    crest_z = seat_z + 0.12 + back_h + 0.06

    # Seat frame + tufted cushion
    seat = cube((0.62, 0.58, 0.10), (ox, oy, seat_z))
    bevel(seat, 0.012, 2)
    setmat(seat, M_wood)
    cushion = cube((0.52, 0.48, 0.10), (ox, oy, seat_z + 0.09))
    bevel(cushion, 0.03, 3)
    cushion.modifiers.new("Subsurf", "SUBSURF").levels = 2
    smooth(cushion)
    setmat(cushion, M_leather)

    # Back frame + tufted back cushion + brass side trim
    back = cube((0.64, 0.10, back_h + 0.12), (ox, oy - 0.26, seat_z + 0.12 + back_h / 2))
    bevel(back, 0.012, 2)
    setmat(back, M_wood)
    backpad = cube((0.5, 0.07, back_h), (ox, oy - 0.21, seat_z + 0.14 + back_h / 2))
    bevel(backpad, 0.03, 3)
    backpad.modifiers.new("Subsurf", "SUBSURF").levels = 2
    smooth(backpad)
    setmat(backpad, M_leather)
    for sx in (-1, 1):
        trim = cube((0.04, 0.12, back_h + 0.05), (ox + sx * 0.3, oy - 0.26, seat_z + 0.12 + back_h / 2))
        setmat(trim, M_brass)
        to_collection(trim, coll)

    # Pointed crest + brass finial
    crest = cube((0.66, 0.12, 0.12), (ox, oy - 0.26, crest_z))
    bevel(crest, 0.01, 2)
    setmat(crest, M_wood)
    peak = cone(0.22, 0.0, 0.22, (ox, oy - 0.26, crest_z + 0.16), verts=4)
    peak.rotation_euler = (0, 0, radians(45))
    setmat(peak, M_wood)
    finial = sphere(0.045, (ox, oy - 0.26, crest_z + 0.30), seg=12)
    smooth(finial)
    setmat(finial, M_brass)

    # Armrests: top rail + scroll front + post + brass cap
    for sx in (-1, 1):
        rail = cube((0.09, 0.55, 0.08), (ox + sx * 0.33, oy, seat_z + 0.30))
        bevel(rail, 0.02, 2)
        setmat(rail, M_wood)
        post = cylinder(0.05, 0.30, (ox + sx * 0.33, oy + 0.24, seat_z + 0.15), verts=12)
        smooth(post)
        setmat(post, M_wood)
        cap = sphere(0.04, (ox + sx * 0.33, oy + 0.26, seat_z + 0.32), seg=10)
        smooth(cap)
        setmat(cap, M_brass)
        to_collection(rail, coll)
        to_collection(post, coll)
        to_collection(cap, coll)

    # Turned front legs + boxy back legs + brass foot caps
    leg_profile = [
        (0.00, 0.00), (0.055, 0.00), (0.055, 0.03), (0.035, 0.06), (0.05, 0.12),
        (0.03, 0.22), (0.05, 0.30), (0.035, 0.38), (0.045, 0.44), (0.0, 0.44),
    ]
    for sx in (-1, 1):
        leg = lathe(f"Chair_Leg_{sx}", leg_profile, coll, segments=16)
        leg.location = (ox + sx * 0.26, oy + 0.24, 0)
        setmat(leg, M_wood)
        bl = cylinder(0.045, 0.46, (ox + sx * 0.26, oy - 0.24, 0.23), verts=10)
        smooth(bl)
        setmat(bl, M_wood)
        to_collection(bl, coll)
        for lz, lyy in ((0.02, 0.24), (0.02, -0.24)):
            fc = cylinder(0.05, 0.04, (ox + sx * 0.26, oy + lyy, lz), verts=10)
            smooth(fc)
            setmat(fc, M_brass)
            to_collection(fc, coll)

    # Brass studs along the crest
    for sx in (-0.22, -0.07, 0.07, 0.22):
        s = sphere(0.018, (ox + sx, oy - 0.20, crest_z), seg=8)
        smooth(s)
        setmat(s, M_brass)
        to_collection(s, coll)

    for o in (seat, cushion, back, backpad, crest, peak, finial):
        to_collection(o, coll)
    return coll


# ─────────────────────────── ASSET: POKER CHIP + STACK ───────────────────────────
def build_chip(loc, body_color, coll):
    M_body = mat_simple("Chip_Body", body_color, 0.05, 0.45)
    M_brass = mat_brass("Chip_Brass")
    body = cylinder(0.04, 0.01, loc, verts=32)
    bevel(body, 0.0025, 2)
    smooth(body)
    setmat(body, M_body)
    rim = torus(0.04, 0.004, (loc[0], loc[1], loc[2]), mseg=32, nseg=8)
    smooth(rim)
    setmat(rim, M_brass)
    inset = cylinder(0.026, 0.012, (loc[0], loc[1], loc[2]), verts=24)
    setmat(inset, M_brass)
    for o in (body, rim, inset):
        to_collection(o, coll)
    return body


def build_chip_stack(origin=(0, 0, 0), body_color=CHIP["red"], n=14):
    coll = collection("ChipStack")
    ox, oy, oz = origin
    h = 0.011
    for i in range(n):
        jitter = (cos(i * 2.4) * 0.002, sin(i * 1.7) * 0.002)
        build_chip((ox + jitter[0], oy + jitter[1], oz + i * h + h / 2), body_color, coll)
    return coll


# ─────────────────────────── ASSET: PLAYING CARD ───────────────────────────
def build_card(origin=(0, 0, 0)):
    coll = collection("PlayingCard")
    M_card = mat_simple("Card_Parchment", C_PARCHMENT, 0.0, 0.55)
    card = cube((0.063, 0.089, 0.0016), origin)
    bevel(card, 0.004, 3)
    smooth(card)
    setmat(card, M_card)
    to_collection(card, coll)
    return coll


# ─────────────────────────── EXPORT ───────────────────────────
def export_collection(coll, name):
    import os
    bpy.ops.object.select_all(action="DESELECT")
    for o in coll.all_objects:
        o.select_set(True)
    path = bpy.path.abspath(EXPORT_DIR)
    os.makedirs(path, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(path, f"{name}.glb"),
        use_selection=True, export_format="GLB", export_apply=True,
    )


# ─────────────────────────── RUN ───────────────────────────
def main():
    if CLEAR_SCENE:
        clear_scene()

    build_table((0, 0, 0))
    build_chair((2.0, 0, 0), CUSHION["navy"])
    build_chip_stack((-1.2, 0, 0.70), CHIP["red"], n=14)
    build_card((-1.6, 0, 0.71))

    if EXPORT:
        export_collection(collection("PokerTable"), "table")
        export_collection(collection("ThroneChair"), "chair")
        export_collection(collection("ChipStack"), "chips")
        export_collection(collection("PlayingCard"), "card")

    print("Dead Man's Hand assets generated.")


if __name__ == "__main__":
    main()
