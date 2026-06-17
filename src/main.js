import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GameController } from './controllers/GameController.js';
import { CLASS_LIST } from './classes/ClassDefinitions.js';
import { initGallery } from './Gallery.js';

// Open the page with ?gallery to inspect/label the raw asset models instead of playing.
const GALLERY_MODE = new URLSearchParams(globalThis.location.search).has('gallery');

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

// ── Post-processing: stylized look (bloom + warm grade + vignette) ──────────
// RenderPass → bloom (glows on flames/gold/daylight) → OutputPass (ACES tonemap
// + sRGB) → grade/vignette. Pushes the real-time render toward the painterly refs.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.55,   // strength
  0.5,    // radius
  0.82,   // threshold — only bright things (flames, gold, sky) bloom
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    warm: { value: new THREE.Vector3(1.06, 1.0, 0.9) },  // warm shadows/overall tint
    saturation: { value: 1.12 },
    vignette: { value: 0.65 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec3 warm; uniform float saturation; uniform float vignette;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      c.rgb *= warm;
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      float vig = smoothstep(0.85, 0.25, length(vUv - 0.5));
      c.rgb *= mix(1.0, vig, vignette);
      gl_FragColor = c;
    }`,
};
composer.addPass(new ShaderPass(GradeShader));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
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

// ── Gallery mode short-circuits the whole game ──────────────────────────────
if (GALLERY_MODE) {
  document.getElementById('menu-overlay').style.display = 'none';
  document.getElementById('hud').style.display = 'none';
  initGallery(scene, camera, renderer);
}

// ── Game controller ────────────────────────────────────────────────────────
const controller = GALLERY_MODE ? null : new GameController(renderer, scene, camera, CLASS_LIST.slice(0, 4));

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
// Each key "clicks" the matching button, so disabled/hidden buttons are ignored
// automatically (a disabled control won't fire click; offsetParent is null when
// its panel is hidden). Values may be a list — the first visible+enabled wins, so
// the same key can serve different contexts (e.g. Enter = confirm raise or next
// round; 1–5 add chips to the bet while the raise panel is open).
const KEYMAP = {
  f: 'btn-fold',
  c: 'btn-check', ' ': 'btn-check',      // check / call
  r: 'btn-raise',                         // open the chip picker
  e: 'btn-ability',                       // class ultimate
  1: 'raise-chip-0', 2: 'raise-chip-1', 3: 'raise-chip-2', 4: 'raise-chip-3', 5: 'raise-chip-4',
  escape: 'btn-cancel-raise',
  enter: ['btn-raise-confirm', 'btn-next-round'],
};
globalThis.addEventListener('keydown', (ev) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.repeat) return;
  const entry = KEYMAP[ev.key.toLowerCase()];
  if (!entry) return;
  const ids = Array.isArray(entry) ? entry : [entry];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el && !el.disabled && el.offsetParent !== null) {
      ev.preventDefault();
      el.click();
      return;
    }
  }
});

// ── Animation loop ─────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  if (!GALLERY_MODE) {
    applyLook();
    controller.update(delta * 1000, elapsed);
  }
  // Drift the dust motes (set up by the environment) for atmosphere.
  const motes = scene.userData.dustMotes;
  if (motes) {
    motes.rotation.y += delta * 0.03;
    motes.position.y = Math.sin(elapsed * 0.25) * 0.12;
  }
  composer.render();
}

animate();
