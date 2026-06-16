import * as THREE from 'three';
import { GameController } from './controllers/GameController.js';
import { CLASS_LIST } from './classes/ClassDefinitions.js';

// ── Renderer ───────────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
document.body.appendChild(renderer.domElement);

// ── Scene / Camera ─────────────────────────────────────────────────────────
const scene = new THREE.Scene();
// Light blue atmospheric haze for distance only — interior + table stay crisp,
// the sky/ocean are fog-exempt so the vista reads bright.
scene.fog = new THREE.Fog(0x9fc7e8, 34, 120);

// First-person: the camera sits in the player's eyes at the south seat, looking
// across the felt at the opponents (Liar's Bar-style POV). Hole cards are held
// up in front of the view by GameController (parented to the camera).
const EYE = new THREE.Vector3(0, 2.7, 3.3);
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 400);
camera.position.copy(EYE);
scene.add(camera);   // so camera-parented held cards render

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ── Mouse-look (stationary first-person pan: drag to look around) ───────────
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const baseTarget = new THREE.Vector3(0, 0.8, -1.1);
const baseDir = baseTarget.clone().sub(EYE).normalize();
const baseYaw = Math.atan2(baseDir.x, -baseDir.z);
const basePitch = Math.asin(baseDir.y);
const YAW_LIMIT = 1.15;          // ~66° each way (you're seated, can't spin)
const PITCH_UP = 0.45, PITCH_DOWN = 0.55;
const LOOK_SENS = 0.0026;
let targetYaw = 0, targetPitch = 0, curYaw = 0, curPitch = 0;
let dragging = false, lastX = 0, lastY = 0;

const cv = renderer.domElement;
cv.style.touchAction = 'none';
cv.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
globalThis.addEventListener('pointerup', () => { dragging = false; });
globalThis.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  targetYaw = clamp(targetYaw - (e.clientX - lastX) * LOOK_SENS, -YAW_LIMIT, YAW_LIMIT);
  targetPitch = clamp(targetPitch - (e.clientY - lastY) * LOOK_SENS, -PITCH_DOWN, PITCH_UP);
  lastX = e.clientX; lastY = e.clientY;
});

const _lookDir = new THREE.Vector3();
const _lookAt = new THREE.Vector3();
function applyLook() {
  curYaw += (targetYaw - curYaw) * 0.18;     // smooth follow
  curPitch += (targetPitch - curPitch) * 0.18;
  const yaw = baseYaw + curYaw, pitch = basePitch + curPitch;
  _lookDir.set(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  );
  camera.lookAt(_lookAt.copy(EYE).add(_lookDir));
}

// ── Game controller ────────────────────────────────────────────────────────
const controller = new GameController(renderer, scene, camera, CLASS_LIST.slice(0, 4));

// ── Menu logic ─────────────────────────────────────────────────────────────
let selectedClass = null;

const grid = document.getElementById('class-grid');
const startBtn = document.getElementById('start-btn');

for (const cls of CLASS_LIST) {
  const card = document.createElement('div');
  card.className = 'class-card';
  card.dataset.name = cls.name;
  card.innerHTML = `
    <div class="class-emoji">${cls.emoji}</div>
    <div class="class-name">${cls.name}</div>
    <div class="class-passive">${cls.passive.name}: ${cls.passive.description}</div>
  `;
  card.addEventListener('click', () => {
    document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
    card.classList.add('selected');
    selectedClass = cls;
    startBtn.disabled = false;
  });
  grid.appendChild(card);
}

startBtn.addEventListener('click', () => {
  if (!selectedClass) return;

  // Assign bots random classes (different from player)
  const pool = CLASS_LIST.filter(c => c.name !== selectedClass.name);
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = (Math.random() * (i+1))|0; [arr[i],arr[j]]=[arr[j],arr[i]]; } return arr; };
  const botClasses = shuffle([...pool]).slice(0, 3);
  const classes = [selectedClass, ...botClasses];

  document.getElementById('menu-overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'block';

  controller.startGame(classes);
});

// Next round / menu
document.getElementById('btn-next-round').addEventListener('click', () => {
  document.getElementById('btn-next-round').style.display = 'none';
  controller.nextRound();
});

document.getElementById('btn-menu').addEventListener('click', () => {
  document.getElementById('btn-menu').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  document.getElementById('menu-overlay').style.display = 'flex';
  selectedClass = null;
  document.querySelectorAll('.class-card').forEach(c => c.classList.remove('selected'));
  startBtn.disabled = true;
});

// ── Keyboard shortcuts ─────────────────────────────────────────────────────
// Each key just "clicks" the matching button, so disabled/hidden buttons are
// automatically ignored (a disabled control won't fire click; offsetParent is
// null when its panel is hidden).
const KEYMAP = {
  f: 'btn-fold',
  c: 'btn-check', ' ': 'btn-check',      // check / call
  r: 'btn-raise',                         // open raise options
  e: 'btn-ability',                       // class ultimate
  1: 'btn-min', 2: 'btn-pot', 3: 'btn-2pot', 4: 'btn-allin',
  escape: 'btn-cancel-raise',
  enter: 'btn-next-round',
};
globalThis.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
  const id = KEYMAP[ev.key.toLowerCase()];
  if (!id) return;
  const el = document.getElementById(id);
  if (el && !el.disabled && el.offsetParent !== null) {
    ev.preventDefault();
    el.click();
  }
});

// ── Animation loop ─────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  applyLook();
  controller.update(delta * 1000, elapsed);
  renderer.render(scene, camera);
}

animate();
