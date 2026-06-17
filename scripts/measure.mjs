// Print bounding box dims by reading POSITION accessor min/max straight from the
// GLB JSON header (no mesh decode needed, so meshopt compression is irrelevant).
import fs from 'fs';

function readGLBJson(path) {
  const buf = fs.readFileSync(path);
  // header: magic(4) version(4) length(4); then chunks: length(4) type(4) data
  let off = 12;
  while (off < buf.length) {
    const len = buf.readUInt32LE(off);
    const type = buf.readUInt32LE(off + 4);
    if (type === 0x4e4f534a) { // 'JSON'
      return JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    }
    off += 8 + len;
  }
  throw new Error('no JSON chunk');
}

for (const f of process.argv.slice(2)) {
  try {
    const g = readGLBJson(`public/assets/${f}.glb`);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const m of g.meshes || []) {
      for (const p of m.primitives || []) {
        const ai = p.attributes && p.attributes.POSITION;
        if (ai == null) continue;
        const a = g.accessors[ai];
        if (!a.min || !a.max) continue;
        for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], a.min[i]); max[i] = Math.max(max[i], a.max[i]); }
      }
    }
    const d = [max[0]-min[0], max[1]-min[1], max[2]-min[2]];
    console.log(`${f.padEnd(20)} W=${d[0].toFixed(2)} H=${d[1].toFixed(2)} D=${d[2].toFixed(2)}  (y: ${min[1].toFixed(2)} .. ${max[1].toFixed(2)})`);
  } catch (e) {
    console.log(`${f}: ERR ${e.message}`);
  }
}
