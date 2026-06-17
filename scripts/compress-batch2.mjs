// Compress the second grouped export into public/assets/batch2_NN.glb
import fs from 'fs';
import { execSync } from 'child_process';

const SRC = 'public/assets/Meshy_AI_assets_20260616_105756';
function walk(d) {
  let o = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = d + '/' + e.name;
    if (e.isDirectory()) o = o.concat(walk(f));
    else if (e.name.endsWith('.glb')) o.push(f);
  }
  return o;
}
const files = walk(SRC).sort();
let n = 1;
for (const src of files) {
  const label = `batch2_${String(n).padStart(2, '0')}`;
  const out = `public/assets/${label}.glb`;
  try {
    execSync(`npx gltf-transform optimize "${src}" "${out}" --compress meshopt --texture-compress webp --simplify false`, { stdio: 'ignore' });
    console.log(`${label}: ${(fs.statSync(out).size / 1e6).toFixed(1)} MB`);
  } catch (e) {
    console.log(`FAILED ${label}: ${e.message}`);
  }
  n++;
}
console.log('done');
