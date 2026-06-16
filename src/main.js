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

// Seated poker view: you're sitting at the south edge looking across the felt to
// the open balcony and the ocean beyond.
const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(0, 4.1, 8.5);
camera.lookAt(0, 1.05, -0.7);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

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

// ── Animation loop ─────────────────────────────────────────────────────────
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  const elapsed = clock.getElapsedTime();
  controller.update(delta * 1000, elapsed);
  renderer.render(scene, camera);
}

animate();
