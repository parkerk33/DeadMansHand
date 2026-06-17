// Pull the texture image out of the uncompressed "Golden Compass Card Back" Meshy
// export so the procedural cards can use it as their back face. Run:
//   node scripts/extract-cardback.mjs
import fs from 'fs';
import { NodeIO } from '@gltf-transform/core';

const SRC = 'public/assets/Meshy_AI_Golden_Compass_Card_B_0616060303_texture.glb';
const io = new NodeIO();
const doc = await io.read(SRC);
const texs = doc.getRoot().listTextures();
if (!texs.length) { console.log('no textures found'); process.exit(1); }
// pick the largest texture (the card-back art)
let best = texs[0];
for (const t of texs) if ((t.getImage()?.length || 0) > (best.getImage()?.length || 0)) best = t;
const mime = best.getMimeType();
const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
const out = `public/assets/card_back_tex.${ext}`;
fs.writeFileSync(out, best.getImage());
console.log(`wrote ${out} (${mime}, ${(best.getImage().length / 1024).toFixed(0)} KB), size ${best.getSize()}`);
