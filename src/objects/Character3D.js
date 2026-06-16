import * as THREE from 'three';
import { clothMaterial } from '../room/Materials.js';
import { tryLoadAsset } from './AssetLoader.js';

// Per-class AI character models (in public/assets). Missing files fall back to
// the procedural bust, so the game still runs without them.
const CHARACTER_GLB = {
  Jester: '/assets/char_jester.glb',
  Noble: '/assets/char_noble.glb',
  Sorcerer: '/assets/char_sorcerer.glb',
  Assassin: '/assets/char_assassin.glb',
  Knight: '/assets/char_knight.glb',
  Summoner: '/assets/char_summoner.glb',
  Ranger: '/assets/char_ranger.glb',
  Alchemist: '/assets/char_alchemist.glb',
};
const MODEL_TARGET_H = 2.0;       // world height to scale each character to
const MODEL_FACING_OFFSET = 0;    // flip to Math.PI if models face away from center

// ── Shared little "held cards" texture (navy back with gold edge) ──
let _heldTex = null;
function heldCardTexture() {
  if (_heldTex) return _heldTex;
  const W = 96, H = 140;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a2452'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#c79a3a'; ctx.lineWidth = 6; ctx.strokeRect(5, 5, W - 10, H - 10);
  ctx.fillStyle = '#c79a3a'; ctx.font = '54px serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⚜', W / 2, H / 2);
  _heldTex = new THREE.CanvasTexture(c);
  return _heldTex;
}

function makePortraitTexture(cls) {
  const S = 256;
  const c = document.createElement('canvas'); c.width = S; c.height = S * 0.42;
  const ctx = c.getContext('2d');
  const W = S, H = S * 0.42;
  // Parchment plaque
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2a2036'); g.addColorStop(1, '#191222');
  ctx.fillStyle = g; roundRect(ctx, 0, 0, W, H, 14); ctx.fill();
  ctx.strokeStyle = '#c79a3a'; ctx.lineWidth = 5; roundRect(ctx, 3, 3, W - 6, H - 6, 12); ctx.stroke();
  // Emoji crest
  ctx.font = `${H * 0.5}px serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(cls.emoji, 14, H * 0.5);
  // Name
  ctx.fillStyle = '#f0dca0'; ctx.font = `bold ${H * 0.34}px Georgia, serif`;
  ctx.fillText(cls.name, H * 0.7, H * 0.5);
  return new THREE.CanvasTexture(c);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// Seated upper-body figure, themed per class. Local +z faces the table center.
function buildBust(cls) {
  const g = new THREE.Group();
  const robe = clothMaterial(cls.color);
  const robeDark = clothMaterial(new THREE.Color(cls.color).multiplyScalar(0.6).getHex());
  const skinTone = cls.name === 'Summoner' ? 0xe0c0a0 : 0xe8c9a0;
  const skin = new THREE.MeshStandardMaterial({ color: skinTone, roughness: 0.55 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc79a3a, metalness: 0.7, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.8 });

  // Torso (tapered) — sits in the chair
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.46, 1.15, 14), robe);
  torso.position.y = 1.15; torso.castShadow = true; g.add(torso);

  // Chest trim / collar
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.14, 14), gold);
  collar.position.y = 1.66; g.add(collar);

  // Shoulders
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(0.40, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), robe);
  shoulders.position.y = 1.62; shoulders.scale.set(1, 0.6, 0.8); g.add(shoulders);

  // Neck + head
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.16, 10), skin);
  neck.position.y = 1.78; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 14), skin);
  head.position.y = 2.0; head.castShadow = true; g.add(head);

  // Arms reaching forward to hold cards
  for (const sx of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.7, 10), robe);
    arm.position.set(sx * 0.32, 1.42, 0.22);
    arm.rotation.x = -0.9; arm.rotation.z = sx * 0.25;
    g.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skin);
    hand.position.set(sx * 0.2, 1.2, 0.52); g.add(hand);
  }

  // Fan of held cards in front of the chest
  const heldMat = new THREE.MeshStandardMaterial({ map: heldCardTexture(), roughness: 0.5, side: THREE.DoubleSide });
  for (let i = 0; i < 3; i++) {
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.3), heldMat);
    card.position.set((i - 1) * 0.08, 1.26, 0.56);
    card.rotation.x = -0.5;
    card.rotation.z = (i - 1) * 0.22;
    g.add(card);
  }

  // ── Class-specific headgear ──
  switch (cls.name) {
    case 'Jester': {
      for (const [ox, oz, tilt] of [[-0.12, 0.06, -0.3], [0.12, -0.04, 0.3]]) {
        const h = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.34, 8), robe);
        h.position.set(ox, 2.28, oz); h.rotation.z = tilt; g.add(h);
        const bell = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), gold);
        bell.position.set(ox + tilt * 0.2, 2.46, oz); g.add(bell);
      }
      const brim = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.045, 6, 16), gold);
      brim.position.y = 2.12; brim.rotation.x = Math.PI / 2; g.add(brim);
      break;
    }
    case 'Noble': {
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.21, 0.12, 12), gold);
      band.position.y = 2.16; g.add(band);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 6), gold);
        spike.position.set(Math.cos(a) * 0.18, 2.3, Math.sin(a) * 0.18); g.add(spike);
      }
      break;
    }
    case 'Sorcerer': {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, 0.06, 14), robeDark);
      brim.position.y = 2.16; g.add(brim);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 14), robe);
      cone.position.y = 2.5; cone.rotation.x = 0.15; g.add(cone);
      const star = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x9cd0ff, emissive: 0x3a70ff, emissiveIntensity: 1.1 }));
      star.position.set(0.0, 2.62, 0.2); g.add(star);
      break;
    }
    case 'Assassin': {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), robeDark);
      hood.position.y = 2.02; hood.scale.set(1, 1.15, 1.1); g.add(hood);
      // shadowed face
      head.material = new THREE.MeshStandardMaterial({ color: 0x2a2a30, roughness: 0.9 });
      break;
    }
    case 'Knight': {
      const helm = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.34, 12), new THREE.MeshStandardMaterial({ color: 0xbfc6cc, metalness: 0.6, roughness: 0.35 }));
      helm.position.y = 2.02; g.add(helm);
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.07, 0.12), dark);
      visor.position.set(0, 2.04, 0.18); g.add(visor);
      const plume = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.3, 8), robe);
      plume.position.set(0, 2.34, -0.05); g.add(plume);
      break;
    }
    case 'Summoner': {
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12),
        new THREE.MeshStandardMaterial({ color: 0xff5a4a, emissive: 0xcc2a1a, emissiveIntensity: 1.0, roughness: 0.2 }));
      orb.position.y = 2.5; g.add(orb);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 8, 24),
        new THREE.MeshStandardMaterial({ color: 0xff7a5a, emissive: 0xaa3020, emissiveIntensity: 0.8 }));
      ring.position.y = 2.5; ring.rotation.x = 1.2; g.add(ring);
      break;
    }
    case 'Ranger': {
      const hood = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.4, 10), robe);
      hood.position.y = 2.16; g.add(hood);
      const feather = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.28, 6), new THREE.MeshStandardMaterial({ color: 0xe8e0cc, roughness: 0.7 }));
      feather.position.set(0.18, 2.3, -0.05); feather.rotation.z = -0.6; g.add(feather);
      break;
    }
    case 'Alchemist': {
      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), robeDark);
      cap.position.y = 2.06; g.add(cap);
      for (const sx of [-0.085, 0.085]) {
        const goggle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12),
          new THREE.MeshStandardMaterial({ color: 0x46e6c4, emissive: 0x1f9a86, emissiveIntensity: 0.7, roughness: 0.2 }));
        goggle.position.set(sx, 2.0, 0.19); goggle.rotation.x = Math.PI / 2; g.add(goggle);
      }
      break;
    }
    default: break;
  }

  // Optional cape behind shoulders for caster/noble types
  if (['Noble', 'Sorcerer', 'Assassin', 'Ranger'].includes(cls.name)) {
    const cape = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0, 4, 1), robeDark);
    const pos = cape.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setZ(i, Math.sin(pos.getX(i) * 4) * 0.05 - 0.12);
    }
    pos.needsUpdate = true;
    cape.material.side = THREE.DoubleSide;
    cape.position.set(0, 1.3, -0.32); g.add(cape);
  }

  return g;
}

export class Character3D {
  constructor(scene, cls, position, isHuman = false) {
    this.scene = scene;
    this.cls = cls;
    this.isHuman = isHuman;

    this.group = new THREE.Group();
    this.group.position.copy(position);
    scene.add(this.group);

    // Procedural bust shows immediately; the AI model swaps in once loaded.
    this.body = buildBust(cls);
    this.body.rotation.y = Math.atan2(-position.x, -position.z);
    this.group.add(this.body);
    this.figure = this.body;

    // Floating name plaque (billboards to camera)
    this._buildPortrait();

    this._loadModel();
  }

  async _loadModel() {
    const url = CHARACTER_GLB[this.cls.name];
    if (!url) return;
    const model = await tryLoadAsset(url, { reskin: false });
    if (!model || !this.group.parent) return;   // missing file or destroyed meanwhile

    // Scale to a consistent height and stand its feet on the floor, facing center.
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    model.scale.setScalar(MODEL_TARGET_H / (size.y || 1));
    model.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(model);
    const c = b2.getCenter(new THREE.Vector3());
    model.position.x -= c.x;
    model.position.z -= c.z;
    model.position.y -= b2.min.y;
    model.rotation.y = Math.atan2(-this.group.position.x, -this.group.position.z) + MODEL_FACING_OFFSET;

    this.group.remove(this.body);
    this.group.add(model);
    this.model = model;
    this.figure = model;
    if (this._folded) this.setFolded(true);   // preserve fold state if it changed mid-load
  }

  _buildPortrait() {
    const tex = makePortraitTexture(this.cls);
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
    this.portrait = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.44), mat);
    this.portrait.position.set(0, 2.95, 0);
    this.group.add(this.portrait);
  }

  update(camera) {
    if (this.portrait) this.portrait.quaternion.copy(camera.quaternion);
  }

  setActive(on) {
    this.figure.traverse(child => {
      if (child.isMesh && child.material && 'emissive' in child.material) {
        if (!child.userData._baseEmissive) {
          child.userData._baseEmissive = child.material.emissive.clone();
          child.userData._baseEmissiveI = child.material.emissiveIntensity || 0;
        }
        if (on) {
          child.material.emissive = new THREE.Color(0xffcf5a);
          child.material.emissiveIntensity = 0.28;
        } else {
          child.material.emissive.copy(child.userData._baseEmissive);
          child.material.emissiveIntensity = child.userData._baseEmissiveI;
        }
      }
    });
  }

  setFolded(on) {
    this._folded = on;
    this.figure.traverse(child => {
      if (child.isMesh) {
        child.material.transparent = on;
        child.material.opacity = on ? 0.32 : 1.0;
      }
    });
    if (this.portrait) this.portrait.material.opacity = on ? 0.32 : 1.0;
  }

  destroy() {
    this.scene.remove(this.group);
  }
}
