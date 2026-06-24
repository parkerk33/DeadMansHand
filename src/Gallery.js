import * as THREE from 'three';
import { loadAsset } from './objects/AssetLoader.js';

// Every grouped model, labelled provisionally. Open the game with ?gallery to
// view them laid out in a grid so the furniture / chips / dealer can be confirmed.
const ITEMS = [
  { file: 'card',          label: 'card' },
  { file: 'card_deck',     label: 'deck' },
  { file: 'chip_1',        label: 'chip_1' },
  { file: 'chip_2',        label: 'chip_2' },
  { file: 'chip_3',        label: 'chip_3' },
  { file: 'dealer_button', label: 'dealer?' },
  { file: 'furniture_01',  label: 'furn_01' },
  { file: 'chair_1',       label: 'chair_1' },
  { file: 'furniture_03',  label: 'furn_03' },
  { file: 'chair_2',       label: 'chair_2' },
  { file: 'furniture_05',  label: 'furn_05' },
  { file: 'chair_3',       label: 'chair_3' },
  { file: 'furniture_07',  label: 'furn_07' },
  { file: 'furniture_08',  label: 'furn_08' },
  { file: 'furniture_09',  label: 'furn_09' },
  { file: 'furniture_10',  label: 'furn_10' },
  { file: 'furniture_11',  label: 'furn_11' },
  { file: 'chandelier',    label: 'chandelier' },
  { file: 'chair_4',       label: 'chair_4' },
  { file: 'furniture_14',  label: 'furn_14' },
  { file: 'furniture_15',  label: 'furn_15' },
  // second grouped export (SOT set) — classified by shape: flat discs are chips
  { file: 'batch2_01',     label: 'chip · b2_01' },
  { file: 'batch2_02',     label: 'prop · b2_02' },
  { file: 'batch2_03',     label: 'chip · b2_03' },
  { file: 'batch2_04',     label: 'chip · b2_04' },
  { file: 'batch2_05',     label: 'chip · b2_05' },
  { file: 'batch2_06',     label: 'chip · b2_06' },
  { file: 'batch2_07',     label: 'chip · b2_07' },
  { file: 'batch2_08',     label: 'prop · b2_08' },
  { file: 'batch2_09',     label: 'prop · b2_09' },
  // standalone Meshy exports that weren't grouped
  { file: 'card_back',     label: 'card back' },
  { file: 'front_alt',     label: 'front (alt)' },
  // third set — individual SOT exports (delivered as single files, not a zip)
  { file: 'sot_barrel',        label: 'barrel' },
  { file: 'sot_dealer_tray',   label: 'dealer tray' },
  { file: 'sot_pedestal',      label: 'pedestal' },
  { file: 'sot_pedestal_base', label: 'pedestal base' },
  { file: 'sot_front',         label: 'front?' },
];

const COLS = 6;
const SPACING = 2.6;
const CELL_SIZE = 1.7;   // target max-dimension each model is scaled to

function labelSprite(text) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = 'rgba(10,8,22,0.85)';
  ctx.fillRect(0, 0, 256, 64);
  ctx.strokeStyle = '#c79a3a'; ctx.lineWidth = 4; ctx.strokeRect(2, 2, 252, 60);
  ctx.fillStyle = '#f0dca0'; ctx.font = 'bold 30px Georgia, serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
  spr.scale.set(1.4, 0.35, 1);
  return spr;
}

export async function initGallery(scene, camera, renderer) {
  scene.background = new THREE.Color(0x1a1620);
  scene.fog = null;

  // Even studio lighting (the game's room/lights aren't built in gallery mode).
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 1.4); key.position.set(5, 10, 7); scene.add(key);
  const fill = new THREE.DirectionalLight(0xbcd0e8, 0.6); fill.position.set(-6, 4, -4); scene.add(fill);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404048, 0.5));

  const rows = Math.ceil(ITEMS.length / COLS);
  const platform = new THREE.Mesh(
    new THREE.BoxGeometry(COLS * SPACING + 1, 0.3, rows * SPACING + 1),
    new THREE.MeshStandardMaterial({ color: 0x2a2632, roughness: 0.9 }),
  );
  platform.position.set(0, -0.15, -((rows - 1) * SPACING) / 2);
  scene.add(platform);

  for (let i = 0; i < ITEMS.length; i++) {
    const col = i % COLS, row = Math.floor(i / COLS);
    const x = (col - (COLS - 1) / 2) * SPACING;
    const z = -row * SPACING;
    const it = ITEMS[i];
    const obj = await loadAsset(`public/assets/${it.file}.glb`, { reskin: false });
    if (obj) {
      const box = new THREE.Box3().setFromObject(obj);
      const size = box.getSize(new THREE.Vector3());
      obj.scale.setScalar(CELL_SIZE / (Math.max(size.x, size.y, size.z) || 1));
      obj.updateMatrixWorld(true);
      const b2 = new THREE.Box3().setFromObject(obj);
      const c2 = b2.getCenter(new THREE.Vector3());
      obj.position.set(x - c2.x, -b2.min.y, z - c2.z);
      scene.add(obj);
    }
    const lbl = labelSprite(it.label);
    lbl.position.set(x, 1.9, z);
    scene.add(lbl);
  }

  // ── Simple orbit controls around the grid center ──
  const target = new THREE.Vector3(0, 0.6, -((rows - 1) * SPACING) / 2);
  let radius = 11, theta = 0, phi = 1.05;
  const apply = () => {
    camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta),
    );
    camera.lookAt(target);
  };
  apply();

  const cv = renderer.domElement;
  let drag = false, lx = 0, ly = 0;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', (e) => { drag = true; lx = e.clientX; ly = e.clientY; });
  globalThis.addEventListener('pointerup', () => { drag = false; });
  globalThis.addEventListener('pointermove', (e) => {
    if (!drag) return;
    theta -= (e.clientX - lx) * 0.005;
    phi = Math.max(0.25, Math.min(1.5, phi - (e.clientY - ly) * 0.005));
    lx = e.clientX; ly = e.clientY; apply();
  });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    radius = Math.max(4, Math.min(28, radius + e.deltaY * 0.01));
    apply();
  }, { passive: false });

  return { update() {} };
}
