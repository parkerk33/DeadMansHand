# AI image-to-3D asset workflow

Generate the props with an AI 3D tool, export `.glb`, drop them in
`public/assets/`, and the game loads them with their baked textures.

## 1. Pick a tool (all have free credits, all export GLB)

| Tool | Link | Notes |
|------|------|-------|
| **Meshy** | https://www.meshy.ai | Image-to-3D + PBR textures, very beginner-friendly. Good first choice. |
| **Tripo** | https://www.tripo3d.ai | Fast, clean results, image- and text-to-3D. |
| **Rodin / Hyper3D** | https://hyper3d.ai | High detail, strong on hard-surface props. |
| **Luma Genie** | https://lumalabs.ai/genie | Free, text-to-3D. |

Meshy or Tripo are the easiest to start with.

## 2. Feed it ONE object at a time

Image-to-3D works best on a single clean object, not a whole sheet.

- **Crop** the reference so only one asset is visible (just the poker table, or
  just one chair), ideally on a plain/transparent background.
- Or use **text-to-3D** with a prompt, e.g.:
  > "stylized medieval fantasy round poker table, dark carved wood, emerald green
  > felt top, aged brass trim and studs, turned pedestal base, Sea of Thieves
  > art style, game asset"
- Generate the four props separately: **table, chair, chips/chip stack, card**.

## 3. Export settings

- **Format:** glTF Binary (`.glb`) — embeds the textures in one file.
- **With textures / PBR:** ON.
- **Up axis:** Y-up if offered (matches Three.js). If it comes in lying on its
  side, we can rotate it on load.
- Keep poly count reasonable (these tools have a "low/medium/high" — medium is
  plenty for web).

## 4. Drop the files in

Save them here with these exact names:

```
public/assets/table.glb
public/assets/chair.glb
public/assets/chips.glb
public/assets/card.glb
```

## 5. See it in the game

AI assets already have their own textures, so load them WITHOUT re-skinning:

```js
import { loadAsset } from './objects/AssetLoader.js';

loadAsset('/assets/table.glb', { reskin: false, scale: 1 }).then(obj => {
  obj.position.set(0, 0, 0);
  scene.add(obj);
});
```

- If it's **too big/small**, change `scale` (try 2, 4, 0.5…).
- If it's **lying on its side**, add `obj.rotation.x = -Math.PI / 2;`.
- If it's **floating or sunk**, tweak `obj.position.y`.

Once a prop looks right, tell me and I'll wire it into `GameController` so it
replaces the matching procedural mesh (correct seat positions, scale, shadows),
with a fallback to the procedural version if the file is missing.
