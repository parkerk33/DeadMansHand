// The imported chip/card/dealer models are wildly over-tessellated (a chip is
// 350k tris!). Decimate them hard into low-poly gameplay versions (*_lp.glb) that
// can be cloned/stacked cheaply, then re-compress. Run: node scripts/decimate-props.mjs
import fs from 'fs';
import { execSync } from 'child_process';

// [name, target ratio of triangles to keep]
const JOBS = [
  ['chip_1', 0.012],
  ['chip_2', 0.012],
  ['chip_3', 0.010],
  ['dealer_button', 0.006],
  ['card', 0.008],
  ['card_deck', 0.03],
];

function tris(file) {
  const b = fs.readFileSync(file);
  let o = 12;
  while (o < b.length) {
    const l = b.readUInt32LE(o), t = b.readUInt32LE(o + 4);
    if (t === 0x4e4f534a) {
      const j = JSON.parse(b.toString('utf8', o + 8, o + 8 + l));
      let n = 0;
      for (const m of j.meshes || []) for (const p of m.primitives || []) {
        if (p.indices != null) n += j.accessors[p.indices].count / 3;
      }
      return Math.round(n);
    }
    o += 8 + l;
  }
  return 0;
}

for (const [name, ratio] of JOBS) {
  const src = `public/assets/${name}.glb`;
  const out = `public/assets/${name}_lp.glb`;
  try {
    // weld → simplify → re-compress (meshopt + webp) in one optimize pass is not
    // ratio-configurable, so run the standalone simplify then compress.
    execSync(`npx gltf-transform simplify "${src}" "${out}" --ratio ${ratio} --error 0.02`, { stdio: 'ignore' });
    execSync(`npx gltf-transform optimize "${out}" "${out}" --compress meshopt --texture-compress webp --simplify false`, { stdio: 'ignore' });
    console.log(`${name.padEnd(15)} ${tris(src).toLocaleString()} → ${tris(out).toLocaleString()} tris  (${(fs.statSync(out).size / 1e6).toFixed(2)} MB)`);
  } catch (e) {
    console.log(`FAILED ${name}: ${e.message}`);
  }
}
console.log('done');
