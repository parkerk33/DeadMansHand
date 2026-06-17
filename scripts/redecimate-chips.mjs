// Re-decimate the gameplay chips straight from their ORIGINAL high-poly Meshy
// sources, so each face texture is compressed only ONCE (the previous *_lp files
// were simplified from the already-webp chip_N.glb → a second lossy webp pass that
// visibly damaged the printed faces). Run: node scripts/redecimate-chips.mjs
import fs from 'fs';
import { execSync } from 'child_process';

const D37 = 'public/assets/Meshy_AI_assets_20260616_105737';
const D56 = 'public/assets/Meshy_AI_assets_20260616_105756';

// [output label, original source glb, simplify ratio]
const JOBS = [
  ['chip_1', `${D37}/e2dc408f-cd07-4ad4-af20-736c018be40c/Meshy_AI_model.glb`, 0.015],
  ['chip_2', `${D37}/78e083e0-5da1-45ea-bc55-d7738214530b/Meshy_AI_model.glb`, 0.015],
  ['chip_3', `${D37}/a0968038-2302-42f7-a860-3f4d0c3177db/Meshy_AI_model.glb`, 0.012],
  ['batch2_03', `${D56}/5c909f3d-8d71-4794-acce-0e8fe3a3ab5c/Meshy_AI_model.glb`, 0.015],
  ['batch2_06', `${D56}/c50715ac-9078-4215-bc41-30d7804119a3/Meshy_AI_model.glb`, 0.015],
];

function tris(file) {
  const b = fs.readFileSync(file);
  let o = 12;
  while (o < b.length) {
    const l = b.readUInt32LE(o), t = b.readUInt32LE(o + 4);
    if (t === 0x4e4f534a) {
      const j = JSON.parse(b.toString('utf8', o + 8, o + 8 + l));
      let n = 0;
      for (const m of j.meshes || []) for (const p of m.primitives || []) if (p.indices != null) n += j.accessors[p.indices].count / 3;
      return Math.round(n);
    }
    o += 8 + l;
  }
  return 0;
}

for (const [label, src, ratio] of JOBS) {
  const out = `public/assets/${label}_lp.glb`;
  const tmp = `public/assets/${label}_tmp.glb`;
  if (!fs.existsSync(src)) { console.log(`MISSING source ${label}`); continue; }
  try {
    execSync(`npx gltf-transform simplify "${src}" "${tmp}" --ratio ${ratio} --error 0.005`, { stdio: 'ignore' });
    // ONE texture compression pass, from the pristine source texture.
    execSync(`npx gltf-transform optimize "${tmp}" "${out}" --compress meshopt --texture-compress webp --simplify false`, { stdio: 'ignore' });
    fs.unlinkSync(tmp);
    console.log(`${label.padEnd(11)} ${tris(out).toLocaleString()} tris  (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
  } catch (e) {
    console.log(`FAILED ${label}: ${e.message}`);
  }
}
console.log('done');
