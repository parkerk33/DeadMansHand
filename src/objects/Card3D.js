import * as THREE from 'three';

const CW = 0.46, CH = 0.64, CD = 0.016;

let _backTex = null;
function getBackTexture() {
  if (_backTex) return _backTex;
  const W = 400, H = 570;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  const grad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, W * 0.75);
  grad.addColorStop(0, '#1f3262'); grad.addColorStop(1, '#0d1730');
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, W, H, 18); ctx.fill();

  ctx.strokeStyle = '#c69a3a'; ctx.lineWidth = 6;
  roundRect(ctx, 3, 3, W - 6, H - 6, 16); ctx.stroke();
  ctx.strokeStyle = '#7a551c'; ctx.lineWidth = 2;
  roundRect(ctx, 16, 16, W - 32, H - 32, 8); ctx.stroke();
  ctx.strokeStyle = 'rgba(214,179,90,0.5)'; ctx.lineWidth = 1.5;
  roundRect(ctx, 26, 26, W - 52, H - 52, 4); ctx.stroke();

  // Compass rose emblem
  const ecx = W / 2, ecy = H / 2, R = W * 0.30, R2 = W * 0.1;
  ctx.save(); ctx.translate(ecx, ecy);
  for (let layer = 0; layer < 2; layer++) {
    ctx.save(); ctx.rotate(Math.PI / 4 * layer);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -R); ctx.lineTo(R2 * 0.5, -R2); ctx.lineTo(0, 0);
      ctx.lineTo(-R2 * 0.5, -R2); ctx.closePath();
      ctx.fillStyle = layer === 0 ? '#c69a3a' : '#e0bf66';
      ctx.globalAlpha = layer === 0 ? 1 : 0.7; ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(0, 0, R2 * 0.6, 0, Math.PI * 2); ctx.fillStyle = '#c69a3a'; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, R2 * 0.32, 0, Math.PI * 2); ctx.fillStyle = '#17264a'; ctx.fill();
  ctx.restore();

  // Corner flourishes
  ['✦','✦','✦','✦'].forEach((r, i) => {
    ctx.font = '24px serif'; ctx.fillStyle = '#d6b35a';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(r, i < 2 ? 42 : W-42, i % 2 === 0 ? 48 : H-48);
  });

  _backTex = new THREE.CanvasTexture(c);
  return _backTex;
}

function makeFaceTexture(card) {
  const W = 400, H = 570;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  const isRed = card.suit === '♥' || card.suit === '♦';
  const col = isRed ? '#9e1a1a' : '#0d0d20';

  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#fdf8f0'); bg.addColorStop(1, '#f4ecdc');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 18); ctx.fill();

  ctx.strokeStyle = '#c8b888'; ctx.lineWidth = 4;
  roundRect(ctx, 2, 2, W - 4, H - 4, 16); ctx.stroke();
  ctx.strokeStyle = '#e0d0a8'; ctx.lineWidth = 1;
  roundRect(ctx, 12, 12, W - 24, H - 24, 8); ctx.stroke();

  // Top-left
  ctx.fillStyle = col;
  ctx.font = `bold ${W * 0.135}px Georgia, serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(card.wild ? '★' : card.rank, 18, 14);
  ctx.font = `${W * 0.1}px Georgia, serif`;
  ctx.fillText(card.wild ? '★' : card.suit, 16, 62);

  // Center suit
  const centerSize = card.rank === '10' ? W * 0.38 : W * 0.42;
  ctx.font = `${centerSize}px Georgia, serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (card.wild) { ctx.fillStyle = '#e0b000'; }
  ctx.fillText(card.wild ? '★' : card.suit, W / 2, H / 2);

  // Bottom-right (rotated)
  ctx.save();
  ctx.translate(W, H); ctx.rotate(Math.PI);
  ctx.fillStyle = col;
  ctx.font = `bold ${W * 0.135}px Georgia, serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(card.wild ? '★' : card.rank, 18, 14);
  ctx.font = `${W * 0.1}px Georgia, serif`;
  ctx.fillText(card.wild ? '★' : card.suit, 16, 62);
  ctx.restore();

  return new THREE.CanvasTexture(c);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

export const CARD_DECK_POS = new THREE.Vector3(2.3, 1.5, 1.3);

export class Card3D {
  constructor(scene, card, faceDown = true) {
    this.scene = scene;
    this.card = card;
    this.faceDown = faceDown;
    this._isHighlighted = false;

    const edgeMat = new THREE.MeshStandardMaterial({ color: 0xf5edd8, roughness: 0.6 });
    this.faceMat = new THREE.MeshStandardMaterial({ map: makeFaceTexture(card), roughness: 0.4 });
    this.backMat = new THREE.MeshStandardMaterial({ map: getBackTexture(), roughness: 0.4 });

    // BoxGeometry material order: [+x, -x, +y, -y, +z(front=face), -z(back)]
    // When rotation.x = -Math.PI/2: +z face now points UP → card face shows up
    const mats = [edgeMat, edgeMat, edgeMat, edgeMat, this.faceMat, this.backMat];
    this.mesh = new THREE.Mesh(new THREE.BoxGeometry(CW, CH, CD), mats);

    // Card lies flat; face-down = +Math.PI/2, face-up = -Math.PI/2
    this.mesh.rotation.x = faceDown ? Math.PI / 2 : -Math.PI / 2;
    this.mesh.castShadow = true;
    this.mesh.userData.card3D = this;

    scene.add(this.mesh);
  }

  reveal(tweener, onDone) {
    if (!this.faceDown) { onDone?.(); return; }
    this.faceDown = false;
    tweener.to(this.mesh.rotation, { x: 0 }, 0.18, 'linear', () => {
      tweener.to(this.mesh.rotation, { x: -Math.PI / 2 }, 0.18, 'linear', onDone);
    });
  }

  moveTo(tweener, position, delay = 0, duration = 0.35, onDone) {
    setTimeout(() => {
      tweener.to(this.mesh.position, {
        x: position.x, y: position.y + 0.6, z: position.z,
      }, duration * 0.4, 'easeOutCubic', () => {
        tweener.to(this.mesh.position, {
          x: position.x, y: position.y, z: position.z,
        }, duration * 0.6, 'easeInOutCubic', onDone);
      });
    }, delay);
  }

  highlight(on) {
    this._isHighlighted = on;
    const intensity = on ? 2.5 : 0;
    const col = on ? 0xffd700 : 0x000000;
    this.faceMat.emissive = new THREE.Color(col);
    this.faceMat.emissiveIntensity = intensity * 0.15;
    this.backMat.emissive = new THREE.Color(col);
    this.backMat.emissiveIntensity = intensity * 0.15;
  }

  setPosition(x, y, z) {
    this.mesh.position.set(x, y, z);
  }

  setFaceDown() {
    this.faceDown = true;
    this.mesh.rotation.x = Math.PI / 2;
  }

  destroy() {
    this.mesh.removeFromParent();   // works whether parented to scene or camera
    this.mesh.geometry.dispose();
  }
}
