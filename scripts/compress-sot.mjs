// Compress the loose individual Meshy SOT exports (the "third set", delivered as
// single files in Downloads rather than a grouped zip) into clean labeled GLBs.
// Run: node scripts/compress-sot.mjs
import fs from 'fs';
import { execSync } from 'child_process';

const DL = 'C:/Users/kucer/Downloads';
const OUT = 'public/assets';

// source file -> output label (the two Table_Pedestal files are byte-identical, keep one)
const MAP = [
  ['Meshy_AI_SOT_Barrel_0616105631_image-to-3d-texture.glb',           'sot_barrel'],
  ['Meshy_AI_SOT_Card_Dealer_Tray_0616105641_image-to-3d-texture.glb', 'sot_dealer_tray'],
  ['Meshy_AI_SOT_Table_Pedestal_0616105427_image-to-3d-texture.glb',   'sot_pedestal'],
  ['Meshy_AI_SOT_Table_Pedestal_Ba_0616105617_image-to-3d-texture.glb','sot_pedestal_base'],
  ['Meshy_AI_Generate_me_the_front_0616062321_texture.glb',            'sot_front'],
];

for (const [name, label] of MAP) {
  const src = `${DL}/${name}`;
  const out = `${OUT}/${label}.glb`;
  if (!fs.existsSync(src)) { console.log(`MISSING ${name}`); continue; }
  try {
    execSync(
      `npx gltf-transform optimize "${src}" "${out}" --compress meshopt --texture-compress webp --simplify false`,
      { stdio: 'ignore' },
    );
    console.log(`${label}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
  } catch (e) {
    console.log(`FAILED ${label}: ${e.message}`);
  }
}
console.log('done');
