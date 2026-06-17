import * as THREE from 'three';
import { woodMaterial, brassMaterial, leatherMaterial, stoneMaterial } from './Materials.js';
import { tryLoadAsset } from '../objects/AssetLoader.js';

// ── Chairs / seats live on the floor (y 0). Figurines (controller) sit at radius 4.5. ──
const CHAIR_R = 4.65;

// ─────────────────────────────────────────────────────────────────────────────
// Procedural textures (wood / brass / leather / stone now live in Materials.js)
// ─────────────────────────────────────────────────────────────────────────────

function rugTexture() {
  const S = 512;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const cx = S / 2, cy = S / 2;
  ctx.fillStyle = '#1a2452'; ctx.fillRect(0, 0, S, S);
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, S * 0.5);
  g.addColorStop(0, '#243066'); g.addColorStop(1, '#141d44');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, S * 0.5, 0, Math.PI * 2); ctx.fill();
  [0.46, 0.40, 0.30].forEach((r, i) => {
    ctx.strokeStyle = i === 1 ? '#c79a3a' : 'rgba(199,154,58,0.5)';
    ctx.lineWidth = i === 1 ? 8 : 3;
    ctx.beginPath(); ctx.arc(cx, cy, S * r, 0, Math.PI * 2); ctx.stroke();
  });
  // Compass spokes
  ctx.strokeStyle = 'rgba(199,154,58,0.5)'; ctx.lineWidth = 3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a) * S * 0.4, cy + Math.sin(a) * S * 0.4); ctx.stroke();
  }
  ctx.fillStyle = '#c79a3a'; ctx.font = `${S * 0.12}px serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⚜', cx, cy);
  return new THREE.CanvasTexture(c);
}

function skyTexture() {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2f6fb0');
  g.addColorStop(0.45, '#69a7d8');
  g.addColorStop(0.62, '#bfe0f2');   // bright horizon haze
  g.addColorStop(0.64, '#9fc7e8');
  g.addColorStop(1, '#5a93c4');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // Sun glow
  const sun = ctx.createRadialGradient(W * 0.32, H * 0.3, 0, W * 0.32, H * 0.3, 260);
  sun.addColorStop(0, 'rgba(255,250,225,0.95)');
  sun.addColorStop(1, 'rgba(255,250,225,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, W, H);
  // Puffy clouds
  for (let i = 0; i < 22; i++) {
    const x = Math.random() * W, y = Math.random() * H * 0.5;
    const r = 30 + Math.random() * 70;
    const grd = ctx.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main builder
// ─────────────────────────────────────────────────────────────────────────────

export function buildEnvironment(scene) {
  const stoneMat = stoneMaterial({ rx: 2, ry: 2 });
  const woodMat = woodMaterial({ rx: 3, ry: 1 });
  const beamMat = woodMaterial({ rx: 6, ry: 1, tint: 0x7a563a, rough: 0.85 });

  buildSkyAndOcean(scene);
  buildFloor(scene, stoneMat);
  buildWalls(scene, stoneMat);
  buildBalcony(scene, stoneMat, woodMat);
  buildBeams(scene, beamMat);
  buildChandelier(scene);
  buildBanners(scene);
  buildWallDetails(scene);
  buildChairs(scene);
  buildProps(scene);   // chips are now functional, managed by GameController/ChipsView
  buildAtmosphere(scene);
}

// ── Atmosphere: sun shafts through the balcony + floating dust motes ──────────
function shaftTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const ctx = c.getContext('2d');
  const v = ctx.createLinearGradient(0, 0, 0, 256);
  v.addColorStop(0, 'rgba(255,240,210,0)');
  v.addColorStop(0.18, 'rgba(255,238,200,0.55)');
  v.addColorStop(1, 'rgba(255,234,194,0)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, 64, 256);
  // soft horizontal falloff so the shaft has feathered edges
  ctx.globalCompositeOperation = 'destination-out';
  const h = ctx.createLinearGradient(0, 0, 64, 0);
  h.addColorStop(0, 'rgba(0,0,0,1)'); h.addColorStop(0.5, 'rgba(0,0,0,0)'); h.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = h; ctx.fillRect(0, 0, 64, 256);
  return new THREE.CanvasTexture(c);
}

function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(16, 16, 16, 0, Math.PI * 2); ctx.fill();
  return new THREE.CanvasTexture(c);
}

function buildAtmosphere(scene) {
  // Sun shafts angling in from the open balcony (-z), additive + bloom-friendly.
  const shaftTex = shaftTexture();
  const shaftMat = new THREE.MeshBasicMaterial({
    map: shaftTex, transparent: true, opacity: 0.5, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
  });
  for (const [x, rotY] of [[-2.4, 0.12], [0.2, -0.05], [2.6, -0.16]]) {
    const shaft = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 7.5), shaftMat);
    shaft.position.set(x, 3.4, -4.6);
    shaft.rotation.set(-0.38, rotY, 0);   // tilt to lean into the room
    scene.add(shaft);
  }

  // Floating dust motes catching the light (drifted in main.js).
  const N = 150;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 13;
    pos[i * 3 + 1] = Math.random() * 5 + 0.6;
    pos[i * 3 + 2] = (Math.random() - 0.5) * 13 - 1;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const motes = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.045, map: dotTexture(), color: 0xffe6b0, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  }));
  scene.add(motes);
  scene.userData.dustMotes = motes;
}

// ── Sky dome + ocean + islands + castle ──
function buildSkyAndOcean(scene) {
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(120, 48, 32),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }),
  );
  scene.add(sky);

  // Ocean — just below the balcony ledge so the sea fills the view through the arch
  const ocean = new THREE.Mesh(
    new THREE.PlaneGeometry(280, 220, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x2f74b0, roughness: 0.35, metalness: 0.1 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.set(0, -0.6, -60);
  scene.add(ocean);
  scene._ocean = ocean;

  // Distant islands
  const islandMat = new THREE.MeshStandardMaterial({ color: 0x3f6b3a, roughness: 1 });
  const sandMat = new THREE.MeshStandardMaterial({ color: 0xc8b27a, roughness: 1 });
  const islands = [[-26, -42, 3.5], [22, -50, 5], [-40, -60, 6], [6, -70, 7]];
  for (const [x, z, s] of islands) {
    const sand = new THREE.Mesh(new THREE.CylinderGeometry(s * 1.3, s * 1.5, 0.6, 16), sandMat);
    sand.position.set(x, -1.2, z); scene.add(sand);
    const hill = new THREE.Mesh(new THREE.ConeGeometry(s, s * 1.1, 16), islandMat);
    hill.position.set(x, s * 0.55 - 1, z); scene.add(hill);
  }

  // Distant castle on the largest island
  buildCastle(scene, -40, -60);

  // A couple of ship silhouettes
  const shipMat = new THREE.MeshStandardMaterial({ color: 0x2a2030, roughness: 1 });
  for (const [x, z, rot] of [[12, -34, 0.4], [-14, -40, -0.3]]) {
    const ship = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 1.1), shipMat);
    hull.position.y = 0.3; ship.add(hull);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.4, 0.12), shipMat);
    mast.position.y = 1.6; ship.add(mast);
    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.6),
      new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 1, side: THREE.DoubleSide }));
    sail.position.set(0, 1.7, 0); ship.add(sail);
    ship.position.set(x, -0.5, z); ship.rotation.y = rot;
    scene.add(ship);
  }

  // Puffy stylized clouds (soft billboards)
  const cloudTex = cloudTexture();
  for (const [x, y, z, s] of [[-30, 16, -55, 18], [25, 20, -65, 22], [-8, 24, -75, 26], [40, 14, -50, 16], [10, 12, -45, 13]]) {
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(s, s * 0.55),
      new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
    cloud.position.set(x, y, z);
    scene.add(cloud);
  }

  // Distant birds (tiny dark V shapes)
  const birdMat = new THREE.MeshBasicMaterial({ color: 0x2a2630, fog: false });
  for (const [x, y, z] of [[-16, 11, -38], [-13, 12, -39], [-10, 10.5, -37], [20, 13, -48], [23, 13.5, -49]]) {
    const bird = new THREE.Group();
    for (const sx of [-1, 1]) {
      const wing = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.18), birdMat);
      wing.position.x = sx * 0.5; wing.rotation.z = -sx * 0.5; bird.add(wing);
    }
    bird.position.set(x, y, z); scene.add(bird);
  }
}

function cloudTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S * 0.6;
  const ctx = c.getContext('2d');
  for (let i = 0; i < 18; i++) {
    const x = 40 + Math.random() * (S - 80);
    const y = S * 0.3 + (Math.random() - 0.5) * 30;
    const r = 26 + Math.random() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

// ── Wall sconces, shelves, shield plaques ──
function buildWallDetails(scene) {
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.5 });
  const wood = woodMaterial({ rx: 1, ry: 2 });
  const gold = brassMaterial();
  const flameMat = new THREE.MeshStandardMaterial({ color: 0xffd070, emissive: 0xff7a18, emissiveIntensity: 3, transparent: true, opacity: 0.92 });

  // Sconces on both side walls
  for (const sx of [-1, 1]) {
    for (const z of [-4.4, 0.4]) {
      const x = sx * 6.6;
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.3, 0.1), iron);
      bracket.position.set(x, 3.0, z); scene.add(bracket);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.07, 0.12, 10), iron);
      cup.position.set(x - sx * 0.18, 3.05, z); scene.add(cup);
      for (const wo of [-0.06, 0.06]) {
        const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8),
          new THREE.MeshStandardMaterial({ color: 0xf6edd2, roughness: 0.6 }));
        wax.position.set(x - sx * 0.18 + wo, 3.2, z); scene.add(wax);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.13, 6), flameMat);
        flame.position.set(x - sx * 0.18 + wo, 3.37, z); scene.add(flame);
      }
    }

    // A wall shelf with bottles
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 2.4), wood);
    shelf.position.set(sx * 6.55, 2.0, 3.4); scene.add(shelf);
    for (let i = 0; i < 4; i++) {
      const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.38, 8),
        new THREE.MeshStandardMaterial({ color: [0x2a6b3a, 0x6b2a2a, 0x2a4a6b, 0x5a4a2a][i], roughness: 0.4, metalness: 0.1 }));
      bottle.position.set(sx * 6.55, 2.27, 2.6 + i * 0.5); scene.add(bottle);
    }

    // Round shield plaque
    const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.08, 16), gold);
    shield.rotation.z = Math.PI / 2;
    shield.position.set(sx * 6.62, 4.6, -1); scene.add(shield);
    const boss = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), iron);
    boss.position.set(sx * 6.55, 4.6, -1); scene.add(boss);
  }
}

function buildCastle(scene, x, z) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x7a8190, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5a3a6a, roughness: 1 });
  const towers = [[0, 0, 2.2, 9], [4, 1, 1.6, 7], [-4, 1.5, 1.8, 8], [2, -3, 1.4, 6]];
  for (const [ox, oz, r, h] of towers) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.1, h, 12), mat);
    t.position.set(ox, h / 2, oz); g.add(t);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(r * 1.25, r * 1.6, 12), roofMat);
    roof.position.set(ox, h + r * 0.7, oz); g.add(roof);
  }
  g.position.set(x, 5.6, z);
  g.scale.setScalar(1.4);
  scene.add(g);
}

// ── Stone floor + rug ──
function buildFloor(scene, stoneMat) {
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(8.6, 64),
    stoneMaterial({ rx: 6, ry: 6, tint: 0xb8c0cc }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(5.0, 64),
    new THREE.MeshStandardMaterial({ map: rugTexture(), roughness: 0.95 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.02;
  rug.receiveShadow = true;
  scene.add(rug);
}

// ── Left/right stone walls ──
function buildWalls(scene, stoneMat) {
  const WALL_H = 6.5;
  for (const sx of [-1, 1]) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(0.6, WALL_H, 15), stoneMat);
    wall.position.set(sx * 7, WALL_H / 2, -1);
    wall.receiveShadow = true; wall.castShadow = true;
    scene.add(wall);

    // Base trim + top cornice
    for (const ty of [0.35, WALL_H - 0.35]) {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 15),
        new THREE.MeshStandardMaterial({ color: 0x4a525f, roughness: 0.9 }));
      trim.position.set(sx * 7, ty, -1); scene.add(trim);
    }
  }

  // South wall behind the camera (closes the room; off-screen from the default view)
  const back = new THREE.Mesh(new THREE.BoxGeometry(14.6, 6.5, 0.6), stoneMat);
  back.position.set(0, 3.25, 10.5); back.receiveShadow = true;
  scene.add(back);
}

// ── Open balcony arch to the ocean (north / -z) ──
function buildBalcony(scene, stoneMat, woodMat) {
  const Z = -7.2;
  // Flanking wall segments either side of the opening
  for (const sx of [-1, 1]) {
    const seg = new THREE.Mesh(new THREE.BoxGeometry(4.0, 6.5, 0.6), stoneMat);
    seg.position.set(sx * 5.3, 3.25, Z); seg.castShadow = true; seg.receiveShadow = true;
    scene.add(seg);
  }
  // Big stone columns at the opening edges
  for (const sx of [-1, 1]) {
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 6.5, 14), stoneMat);
    col.position.set(sx * 3.4, 3.25, Z); col.castShadow = true;
    scene.add(col);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.5, 0.4, 14), stoneMat);
    cap.position.set(sx * 3.4, 6.45, Z); scene.add(cap);
  }
  // Lintel + arch over the opening
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(8.0, 1.0, 0.7), stoneMat);
  lintel.position.set(0, 6.0, Z); lintel.castShadow = true;
  scene.add(lintel);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.35, 10, 40, Math.PI), stoneMat);
  arch.position.set(0, 6.0, Z); scene.add(arch);

  // Balcony railing (wood) just inside the opening
  const railZ = Z + 0.6;
  const railTop = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.18, 0.3),
    woodMaterial({ rx: 6, ry: 1 }));
  railTop.position.set(0, 1.05, railZ); scene.add(railTop);
  const railBase = railTop.clone(); railBase.position.y = 0.15; scene.add(railBase);
  const balusterMat = woodMaterial({ rx: 1, ry: 1, tint: 0x8a6444 });
  for (let i = -6; i <= 6; i++) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 8), balusterMat);
    b.position.set(i * 0.52, 0.6, railZ); scene.add(b);
  }
}

// ── Chunky overhead beams (high, never block the table) ──
function buildBeams(scene, beamMat) {
  for (let i = -1; i <= 1; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(14.4, 0.5, 0.6), beamMat);
    beam.position.set(0, 6.0, i * 3.4); beam.castShadow = true;
    scene.add(beam);
  }
  // A couple along the other axis
  for (const z of [-4.5, 1.5]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 12), beamMat);
    beam.position.set(0, 6.2, z + 1.5); scene.add(beam);
  }
  // Support posts in the corners
  for (const [x, z] of [[-6.6, 5.8], [6.6, 5.8], [-6.6, -6.6], [6.6, -6.6]]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 6.3, 0.55), beamMat);
    post.position.set(x, 3.15, z); post.castShadow = true; scene.add(post);
  }
}

// ── Iron chandelier above the table ──
const CHANDELIER_Y = 4.3;     // height above the table it hangs at
const CHANDELIER_SIZE = 2.6;  // target max dimension

function buildChandelier(scene) {
  tryLoadAsset('/assets/chandelier.glb', { reskin: false }).then((model) => {
    if (model) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      model.scale.setScalar(CHANDELIER_SIZE / (Math.max(size.x, size.y, size.z) || 1));
      model.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(model);
      const c = b2.getCenter(new THREE.Vector3());
      // Center it over the table at the hang height.
      model.position.set(-c.x, CHANDELIER_Y - c.y, -c.z);
      scene.add(model);
    } else {
      buildProceduralChandelier(scene);
    }
  });
}

function buildProceduralChandelier(scene) {
  const g = new THREE.Group();
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.5 });

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.07, 8, 40), iron);
  ring.rotation.x = Math.PI / 2; g.add(ring);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 8, 32), iron);
  ring2.rotation.x = Math.PI / 2; ring2.position.y = 0.2; g.add(ring2);

  // Chains up to the ceiling
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), iron);
    chain.position.set(Math.cos(a) * 1.0, 0.9, Math.sin(a) * 1.0);
    chain.rotation.z = Math.cos(a) * 0.18; chain.rotation.x = -Math.sin(a) * 0.18;
    g.add(chain);
  }

  // Candles + flames around the ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const x = Math.cos(a) * 1.2, z = Math.sin(a) * 1.2;
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.12, 8), iron);
    cup.position.set(x, 0.06, z); g.add(cup);
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xf6edd2, roughness: 0.6 }));
    wax.position.set(x, 0.22, z); g.add(wax);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd070, emissive: 0xff7a18, emissiveIntensity: 3, transparent: true, opacity: 0.92 }));
    flame.position.set(x, 0.4, z); g.add(flame);
  }

  g.position.set(0, 4.4, 0);
  scene.add(g);
}

// ── Simplified gold heraldry shapes drawn on a canvas ──
function drawHeraldry(ctx, kind, cx, cy, s) {
  ctx.fillStyle = '#d8b24a'; ctx.strokeStyle = '#d8b24a'; ctx.lineWidth = s * 0.06;
  ctx.save(); ctx.translate(cx, cy);
  if (kind === 'crown') {
    ctx.beginPath();
    ctx.moveTo(-s, s * 0.5); ctx.lineTo(-s, -s * 0.3); ctx.lineTo(-s * 0.5, s * 0.1);
    ctx.lineTo(0, -s * 0.55); ctx.lineTo(s * 0.5, s * 0.1); ctx.lineTo(s, -s * 0.3);
    ctx.lineTo(s, s * 0.5); ctx.closePath(); ctx.fill();
  } else if (kind === 'sword') {
    ctx.fillRect(-s * 0.12, -s, s * 0.24, s * 1.4);     // blade
    ctx.fillRect(-s * 0.5, s * 0.3, s, s * 0.18);        // crossguard
    ctx.beginPath(); ctx.arc(0, -s, s * 0.18, 0, Math.PI * 2); ctx.fill(); // pommel tip
  } else if (kind === 'star') {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? s : s * 0.42;
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      i === 0 ? ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath(); ctx.fill();
  } else { // serpent/dragon — coiled S
    ctx.lineWidth = s * 0.3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, -s * 0.7);
    ctx.bezierCurveTo(s * 0.8, -s * 0.4, -s * 0.8, s * 0.3, s * 0.6, s * 0.7);
    ctx.stroke();
  }
  ctx.restore();
}

// ── Hanging cloth banners on the side walls ──
function buildBanners(scene) {
  const defs = [
    { x: -6.62, z: -2.6, color: '#1a2452', kind: 'crown' },
    { x: -6.62, z: 1.4, color: '#5a1a1a', kind: 'sword' },
    { x: 6.62, z: -2.6, color: '#15502f', kind: 'serpent' },
    { x: 6.62, z: 1.4, color: '#3a1a5a', kind: 'star' },
  ];
  for (const d of defs) {
    const S = 256;
    const c = document.createElement('canvas'); c.width = S / 2; c.height = S;
    const ctx = c.getContext('2d');
    ctx.fillStyle = d.color; ctx.fillRect(0, 0, S / 2, S);
    // notched bottom
    ctx.fillStyle = '#0a0814';
    ctx.beginPath(); ctx.moveTo(0, S); ctx.lineTo(S / 4, S - 26); ctx.lineTo(S / 2, S); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#c79a3a'; ctx.lineWidth = 7; ctx.strokeRect(8, 8, S / 2 - 16, S - 40);
    drawHeraldry(ctx, d.kind, S / 4, S * 0.42, 42);

    const tex = new THREE.CanvasTexture(c);

    // Waved cloth geometry
    const geo = new THREE.PlaneGeometry(1.5, 3.0, 8, 1);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(pos.getX(i) * 3.0) * 0.12);
    }
    pos.needsUpdate = true; geo.computeVertexNormals();

    const banner = new THREE.Mesh(geo,
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, side: THREE.DoubleSide }));
    banner.position.set(d.x, 3.7, d.z);
    banner.rotation.y = d.x < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(banner);

    // Top hanging rod
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 8),
      new THREE.MeshStandardMaterial({ color: 0x2a2a30, metalness: 0.6, roughness: 0.4 }));
    rod.rotation.x = Math.PI / 2;
    rod.position.set(d.x - Math.sign(d.x) * 0.05, 5.25, d.z);
    rod.rotation.z = Math.PI / 2;
    rod.rotation.y = d.x < 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(rod);
  }
}

// Turned baluster front leg
function turnedLeg(mat) {
  const profile = [
    [0.0, 0], [0.11, 0], [0.11, 0.06], [0.07, 0.12], [0.1, 0.2],
    [0.06, 0.34], [0.1, 0.46], [0.07, 0.56], [0.09, 0.62], [0.0, 0.62],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.Mesh(new THREE.LatheGeometry(profile, 12), mat);
}

// ── Throne chair (4 player seats + 2 decorative) ──
function makeChair(cushionColor, opts = {}) {
  const lowBack = opts.lowBack || false;
  const g = new THREE.Group();
  const wood = woodMaterial({ rx: 1, ry: 2, tint: 0x8a6444 });
  const woodHi = woodMaterial({ rx: 1, ry: 1, tint: 0xc8a274 });
  const tuft = leatherMaterial(cushionColor);
  const brass = brassMaterial();

  const backH = lowBack ? 1.15 : 1.55;       // backrest panel height
  const crestY = 0.78 + backH / 2 + 0.1;     // top of the panel
  const BZ = -0.46;                          // backrest z

  // Contact shadow
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.98, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.015; g.add(shadow);

  // Seat frame + beveled cap + tufted cushion
  const seat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 1.08), wood);
  seat.position.y = 0.6; seat.castShadow = true; g.add(seat);
  const seatBevel = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.06, 1.16), woodHi);
  seatBevel.position.y = 0.7; g.add(seatBevel);
  const pad = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.17, 0.86), tuft);
  pad.position.y = 0.8; g.add(pad);

  // Backrest outer frame + brass edge trim
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.26, backH + 0.2, 0.18), wood);
  back.position.set(0, 0.78 + backH / 2, BZ); back.castShadow = true; g.add(back);
  for (const sx of [-1, 1]) {
    const sideTrim = new THREE.Mesh(new THREE.BoxGeometry(0.07, backH + 0.1, 0.2), brass);
    sideTrim.position.set(sx * 0.6, 0.78 + backH / 2, BZ + 0.01); g.add(sideTrim);
  }
  // Tufted back cushion (proud of the frame)
  const backPad = new THREE.Mesh(new THREE.BoxGeometry(0.96, backH, 0.1), tuft);
  backPad.position.set(0, 0.8 + backH / 2, BZ + 0.08); g.add(backPad);

  // Pointed fantasy crest + brass fleur finial
  const crestBar = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.22, 0.22), wood);
  crestBar.position.set(0, crestY, BZ); g.add(crestBar);
  const peak = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.42, 4), wood);
  peak.rotation.y = Math.PI / 4; peak.position.set(0, crestY + 0.28, BZ); g.add(peak);
  const finialBall = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), brass);
  finialBall.position.set(0, crestY + 0.52, BZ); g.add(finialBall);
  const finialTop = new THREE.Mesh(new THREE.OctahedronGeometry(0.08), brass);
  finialTop.position.set(0, crestY + 0.66, BZ); finialTop.scale.set(0.7, 1.3, 0.7); g.add(finialTop);

  // Compass roundel on the lower back
  const roundel = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 16), brass);
  roundel.rotation.x = Math.PI / 2; roundel.position.set(0, 1.02, BZ + 0.06); g.add(roundel);

  // Armrests: scrolled — flat top + curved front + brass cap
  for (const sx of [-1, 1]) {
    const armTop = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 1.0), wood);
    armTop.position.set(sx * 0.62, 1.04, -0.02); armTop.castShadow = true; g.add(armTop);
    const scroll = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.06, 8, 14, Math.PI), wood);
    scroll.position.set(sx * 0.62, 1.0, 0.48); scroll.rotation.y = Math.PI / 2; g.add(scroll);
    const armPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.5, 10), wood);
    armPost.position.set(sx * 0.62, 0.78, 0.46); g.add(armPost);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), brass);
    cap.position.set(sx * 0.62, 1.1, 0.5); g.add(cap);
  }

  // Front turned legs + back legs, with brass foot caps
  for (const [lx, lz, turned] of [[-0.52, 0.46, true], [0.52, 0.46, true], [-0.52, -0.46, false], [0.52, -0.46, false]]) {
    if (turned) {
      const leg = turnedLeg(wood);
      leg.position.set(lx, 0, lz); leg.castShadow = true; g.add(leg);
    } else {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.62, 0.16), wood);
      leg.position.set(lx, 0.31, lz); leg.castShadow = true; g.add(leg);
    }
    const footCap = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.07, 8), brass);
    footCap.position.set(lx, 0.035, lz); g.add(footCap);
  }
  // Cross brace between front legs
  const brace = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.08, 0.08), wood);
  brace.position.set(0, 0.22, 0.46); g.add(brace);

  return g;
}

// The 4 cardinal seats get the imported chair models; flip CHAIR_FACING if a
// model's back ends up toward the table.
const CHAIR_MODELS = ['/assets/chair_1.glb', '/assets/chair_2.glb', '/assets/chair_3.glb', '/assets/chair_4.glb'];
const CHAIR_SEAT_ANGLES = [Math.PI / 2, Math.PI, -Math.PI / 2, 0]; // south(player), west, north, east
const CHAIR_HEIGHT = 2.3;
const CHAIR_FACING = 0;   // matches the character facing; flip to Math.PI if backs face the table

function buildChairs(scene) {
  const cushionColors = [0x1a2452, 0x3a1a5a, 0x5a1a1a, 0x15502f];
  CHAIR_SEAT_ANGLES.forEach((a, i) => {
    const x = Math.cos(a) * CHAIR_R, z = Math.sin(a) * CHAIR_R;
    const faceCenter = Math.atan2(-x, -z) + CHAIR_FACING;

    tryLoadAsset(CHAIR_MODELS[i], { reskin: false }).then((chair) => {
      if (chair) {
        // Scale to a consistent height, stand on the floor, face the table.
        const box = new THREE.Box3().setFromObject(chair);
        const size = box.getSize(new THREE.Vector3());
        chair.scale.setScalar(CHAIR_HEIGHT / (size.y || 1));
        chair.updateMatrixWorld(true);
        const b2 = new THREE.Box3().setFromObject(chair);
        const c = b2.getCenter(new THREE.Vector3());
        chair.position.set(x - c.x, -b2.min.y, z - c.z);
        chair.rotation.y = faceCenter;
      } else {
        // Fallback to the procedural chair if the model is missing.
        chair = makeChair(cushionColors[i]);
        chair.position.set(x, 0, z);
        chair.rotation.y = Math.atan2(-x, -z);
      }
      scene.add(chair);
    });
  });
}

// ── Edge props: barrels (imported SOT model), crates, chest ──
const BARREL_SPOTS = [[-6.0, 4.6], [-6.4, 3.4], [6.3, -4.4]];
const BARREL_H = 1.05;          // world height to fit the barrel model to

// Imported SOT props the user mapped from the blueprint. Lantern/candle also emit
// a warm light. Crate/chest fall back to procedural meshes if a model is missing.
const SCENE_PROPS = [
  { url: '/assets/furniture_09.glb', h: 0.85, x: 6.2,  z: 4.4,  fallback: (s) => addCrateStack(s, 6.2, 4.4) },  // crate
  { url: '/assets/furniture_07.glb', h: 0.8,  x: 5.9,  z: -5.6, fallback: (s) => addChest(s, 5.9, -5.6) },       // chest
  { url: '/assets/furniture_05.glb', h: 1.2,  x: -6.3, z: -5.0, light: 0xffb060 },                               // lantern
  { url: '/assets/furniture_10.glb', h: 0.42, x: 6.6,  z: 1.2,  light: 0xffb866 },                               // candle cluster
];

function buildProps(scene) {
  buildBarrels(scene);
  for (const p of SCENE_PROPS) {
    tryLoadAsset(p.url, { reskin: false }).then((m) => {
      if (!m) { p.fallback?.(scene); return; }
      const box = new THREE.Box3().setFromObject(m);
      const size = box.getSize(new THREE.Vector3());
      m.scale.setScalar(p.h / (size.y || 1));
      m.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(m);
      const c = bb.getCenter(new THREE.Vector3());
      m.position.set(p.x - c.x, -bb.min.y, p.z - c.z);
      m.rotation.y = Math.random() * Math.PI * 2;
      m.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(m);
      if (p.light) {
        const L = new THREE.PointLight(p.light, 0.7, 4.5, 2);
        L.position.set(p.x, p.h * 0.7, p.z);
        scene.add(L);
      }
    });
  }
}

// Load the imported SOT barrel once, then clone it to each spot (falls back to a
// procedural barrel if the model is missing).
function buildBarrels(scene) {
  tryLoadAsset('/assets/sot_barrel.glb', { reskin: false }).then((model) => {
    for (const [x, z] of BARREL_SPOTS) {
      if (!model) { addBarrel(scene, x, z); continue; }
      const b = model.clone(true);
      const box = new THREE.Box3().setFromObject(b);
      const size = box.getSize(new THREE.Vector3());
      b.scale.setScalar(BARREL_H / (size.y || 1));
      b.updateMatrixWorld(true);
      const bb = new THREE.Box3().setFromObject(b);
      const c = bb.getCenter(new THREE.Vector3());
      b.position.set(x - c.x, -bb.min.y, z - c.z);
      b.rotation.y = Math.random() * Math.PI * 2;
      b.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(b);
    }
  });
}

function addBarrel(scene, x, z) {
  const woodMat = woodMaterial({ rx: 3, ry: 1, tint: 0x9a6e48 });
  const metalMat = brassMaterial({ dark: true });
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 14), woodMat);
  barrel.position.set(x, 0.5, z); barrel.castShadow = true; scene.add(barrel);
  for (const yo of [-0.28, 0, 0.28]) {
    const hoop = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.025, 6, 20), metalMat);
    hoop.position.set(x, 0.5 + yo, z); hoop.rotation.x = Math.PI / 2; scene.add(hoop);
  }
}

function addCrateStack(scene, x, z) {
  const woodMat = woodMaterial({ rx: 2, ry: 2, tint: 0xa07a52 });
  for (const [ox, oy, oz, s] of [[0, 0.4, 0, 0.9], [0.15, 1.12, 0.1, 0.72]]) {
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), woodMat);
    crate.position.set(x + ox, oy, z + oz); crate.castShadow = true; scene.add(crate);
  }
}

function addChest(scene, x, z) {
  const woodMat = woodMaterial({ rx: 2, ry: 1, tint: 0x7a5232 });
  const goldMat = brassMaterial();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.9), woodMat);
  base.position.set(x, 0.35, z); base.castShadow = true; scene.add(base);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.34, 0.9), woodMat);
  lid.position.set(x, 0.87, z); lid.castShadow = true; scene.add(lid);
  for (const yb of [0.35, 0.87]) {
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.08, 0.94), goldMat);
    band.position.set(x, yb, z); scene.add(band);
  }
}
