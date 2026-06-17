// Compress + rename the grouped Meshy models into clean labeled GLBs in
// public/assets/. Run: node scripts/compress-grouped.mjs
import fs from 'fs';
import { execSync } from 'child_process';

// uuid prefix -> output label (provisional; furniture confirmed via the gallery)
const MAP = {
  '9e3700a8': 'card',
  'e1d5214a': 'card_deck',
  'e2dc408f': 'chip_1',
  '78e083e0': 'chip_2',
  'a0968038': 'chip_3',
  'acea453b': 'dealer_button',
  'e125af68': 'furniture_01',
  '0119d0f6': 'furniture_02',
  '1f8dea2f': 'furniture_03',
  '348629a2': 'furniture_04',
  '57f02ab5': 'furniture_05',
  '5cec5f81': 'furniture_06',
  '776d2803': 'furniture_07',
  'a16121ff': 'furniture_08',
  'cceaee86': 'furniture_09',
  'd75dfd3d': 'furniture_10',
  '069c228e': 'furniture_11',
  '1fb52b34': 'furniture_12',
  '62891d33': 'furniture_13',
  '965553b1': 'furniture_14',
  'aec14df2': 'furniture_15',
};

const ROOT = 'public/assets';
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = dir + '/' + e.name;
    if (e.isDirectory()) out = out.concat(walk(fp));
    else if (e.name.endsWith('.glb')) out.push(fp);
  }
  return out;
}

const files = walk(ROOT).filter((f) => f.includes('Meshy_AI_assets_'));
let done = 0;
for (const [uuid, label] of Object.entries(MAP)) {
  const src = files.find((f) => f.includes('/' + uuid));
  if (!src) { console.log(`MISSING ${uuid} (${label})`); continue; }
  const out = `${ROOT}/${label}.glb`;
  try {
    execSync(
      `npx gltf-transform optimize "${src}" "${out}" --compress meshopt --texture-compress webp --simplify false`,
      { stdio: 'ignore' },
    );
    const kb = (fs.statSync(out).size / 1e6).toFixed(1);
    console.log(`${label}: ${kb} MB`);
    done++;
  } catch (e) {
    console.log(`FAILED ${label}: ${e.message}`);
  }
}
console.log(`\nCompressed ${done}/${Object.keys(MAP).length} grouped models.`);
