# Game assets (.glb)

Drop Blender-exported `.glb` files here. Vite serves this folder at the site
root, so a file at `public/assets/table.glb` is fetched in code as
`/assets/table.glb`.

Suggested filenames (matched by the loader / examples):

- `table.glb`
- `chair.glb`
- `chips.glb`
- `card.glb`

## Getting them here from Blender

Open `blender/generate_assets.py` in Blender (Scripting workspace), set near the
top:

```python
EXPORT     = True
EXPORT_DIR = "C:/Users/kucer/fantasy-poker/public/assets/"
```

then Run Script. It writes the `.glb` files straight into this folder.

For the geometry-only workflow you do **not** need to bake — the in-game loader
([src/objects/AssetLoader.js](../../src/objects/AssetLoader.js)) re-skins each
mesh with the textured materials by matching the Blender **material name**
(use role words: `wood`, `brass`, `felt`, `leather`, `stone`, `parchment`).
