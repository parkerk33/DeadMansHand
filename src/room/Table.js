import * as THREE from 'three';
import { woodMaterial, brassMaterial, feltBumpTexture } from './Materials.js';

// World-space heights (floor = y 0).
export const TABLE_TOP_Y = 1.06;     // reference top
export const FELT_TOP_Y = 1.18;      // cards rest here
export const TABLE_OUTER_R = 3.25;
export const FELT_R = 2.55;

const CANDLE_R = 2.96;
const CANDLE_COUNT = 4;

// Candles sit at the diagonals so they never crowd the community-card row or
// the player-facing front edge. Lighting.js imports this to place matching lights.
export function candlePositions() {
  const out = [];
  for (let i = 0; i < CANDLE_COUNT; i++) {
    const a = (i / CANDLE_COUNT) * Math.PI * 2 + Math.PI / 4;
    out.push({ x: Math.cos(a) * CANDLE_R, z: Math.sin(a) * CANDLE_R, y: FELT_TOP_Y + 0.32 });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Textures
// ─────────────────────────────────────────────────────────────────────────────

function feltTexture() {
  const S = 1024;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d');
  const cx = S / 2, cy = S / 2;

  // Bright, dominant emerald — stays green all the way to the edge
  const g = ctx.createRadialGradient(cx, cy, S * 0.05, cx, cy, S * 0.5);
  g.addColorStop(0, '#1d9070');
  g.addColorStop(0.55, '#138a66');
  g.addColorStop(0.85, '#0f6a50');
  g.addColorStop(1, '#0b5340');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);

  // Cloth weave speckle (subtle, keeps it green)
  for (let i = 0; i < 9000; i++) {
    const v = (Math.random() * 12 - 6) | 0;
    ctx.fillStyle = `rgba(${25 + v},${130 + v},${100 + v},0.12)`;
    ctx.fillRect(Math.random() * S, Math.random() * S, 2, 2);
  }

  const GOLD = '#c69a3a', GOLD_HI = '#e0bf66';

  // Double gold border ring near the rim
  ctx.strokeStyle = GOLD; ctx.lineWidth = 8;
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.455, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = GOLD_HI; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.435, 0, Math.PI * 2); ctx.stroke();

  // Six player card-zone marks near the rim (paired card outlines + chip ring)
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * S * 0.37, cy + Math.sin(a) * S * 0.37);
    ctx.rotate(a + Math.PI / 2);
    ctx.strokeStyle = 'rgba(224,191,102,0.6)'; ctx.lineWidth = 3;
    for (const ox of [-S * 0.026, S * 0.026]) {
      drawRoundRect(ctx, ox - S * 0.022, -S * 0.03, S * 0.044, S * 0.06, 5); ctx.stroke();
    }
    ctx.restore();
  }

  // Inner decorative ring
  ctx.strokeStyle = 'rgba(198,154,58,0.55)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, S * 0.30, 0, Math.PI * 2); ctx.stroke();

  // Five community card slots across the center
  ctx.strokeStyle = 'rgba(224,191,102,0.55)'; ctx.lineWidth = 3;
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  const slotW = S * 0.066, slotH = S * 0.094, gap = S * 0.018;
  const totalW = slotW * 5 + gap * 4;
  let sx = cx - totalW / 2;
  for (let i = 0; i < 5; i++) {
    drawRoundRect(ctx, sx, cy - slotH / 2, slotW, slotH, 6); ctx.fill(); ctx.stroke();
    sx += slotW + gap;
  }

  // Compass rose centerpiece
  drawCompass(ctx, cx, cy - S * 0.165, S * 0.13, GOLD, GOLD_HI);

  // Pot marker ring
  ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy + S * 0.21, S * 0.05, 0, Math.PI * 2); ctx.stroke();

  return new THREE.CanvasTexture(c);
}

function drawCompass(ctx, cx, cy, R, gold, goldHi) {
  ctx.save(); ctx.translate(cx, cy);
  const R2 = R * 0.34;
  for (let layer = 0; layer < 2; layer++) {
    ctx.save(); ctx.rotate(Math.PI / 4 * layer);
    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);
      ctx.beginPath();
      ctx.moveTo(0, -R); ctx.lineTo(R2 * 0.5, -R2); ctx.lineTo(0, 0);
      ctx.lineTo(-R2 * 0.5, -R2); ctx.closePath();
      ctx.fillStyle = layer === 0 ? gold : goldHi;
      ctx.globalAlpha = layer === 0 ? 0.85 : 0.55; ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  ctx.beginPath(); ctx.arc(0, 0, R2 * 0.55, 0, Math.PI * 2); ctx.fillStyle = gold; ctx.fill();
  ctx.beginPath(); ctx.arc(0, 0, R2 * 0.3, 0, Math.PI * 2); ctx.fillStyle = '#0f5a43'; ctx.fill();
  ctx.restore();
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r); ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h); ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r); ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ─────────────────────────────────────────────────────────────────────────────
// Builder
// ─────────────────────────────────────────────────────────────────────────────

export function createTable(scene) {
  const group = new THREE.Group();

  const woodMat = woodMaterial({ rx: 4, ry: 2 });
  const woodDark = woodMaterial({ rx: 4, ry: 2, tint: 0x6e4a30, rough: 0.82 });
  const woodSkirt = woodMaterial({ rx: 8, ry: 2, tint: 0xc69c6a });
  const brass = brassMaterial();
  const brassDark = brassMaterial({ dark: true });
  const feltMat = new THREE.MeshStandardMaterial({
    map: feltTexture(), bumpMap: feltBumpTexture(6, 6), bumpScale: 0.04,
    roughness: 0.97, metalness: 0.0,
  });

  // ── Contact shadow ──
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(3.7, 48),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.02;
  group.add(shadow);

  // ── Turned baluster pedestal (LatheGeometry) + wide stepped foot ──
  const profile = [
    [0.0, 0.0], [1.5, 0.0], [1.5, 0.14], [1.18, 0.2], [1.18, 0.3],
    [0.82, 0.4], [0.56, 0.52], [0.74, 0.62], [0.5, 0.72], [0.6, 0.8],
    [0.95, 0.92], [1.0, 1.0], [0.0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const pedestal = new THREE.Mesh(new THREE.LatheGeometry(profile, 40), woodMat);
  pedestal.castShadow = true; pedestal.receiveShadow = true; group.add(pedestal);

  // Brass bands at the turn points
  for (const [y, r] of [[0.15, 1.5], [0.31, 1.18], [0.62, 0.74], [0.92, 0.95]]) {
    const bandRing = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 32), brass);
    bandRing.rotation.x = Math.PI / 2; bandRing.position.y = y; group.add(bandRing);
  }

  // ── Underside skirt (carved side, the "belly") ──
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_OUTER_R - 0.08, TABLE_OUTER_R - 0.32, 0.46, 48), woodSkirt);
  skirt.position.y = 0.82; skirt.castShadow = true; group.add(skirt);

  // Carved vertical panels + brass brackets around the skirt (aligned to 6 seats)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = Math.cos(a) * (TABLE_OUTER_R - 0.1), z = Math.sin(a) * (TABLE_OUTER_R - 0.1);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.34, 0.46), woodDark);
    panel.position.set(x, 0.82, z); panel.rotation.y = -a; group.add(panel);
    if (i % 2 === 0) {
      const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.26, 0.14), brass);
      bracket.position.set(x, 0.82, z); bracket.rotation.y = -a; group.add(bracket);
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 6), brassDark);
      rivet.position.set(Math.cos(a) * (TABLE_OUTER_R - 0.04), 0.82, Math.sin(a) * (TABLE_OUTER_R - 0.04));
      group.add(rivet);
    }
  }

  // ── Outer wood rim slab (beveled top edge via stacked discs) ──
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_OUTER_R, TABLE_OUTER_R, 0.34, 48), woodMat);
  rim.position.y = 1.03; rim.castShadow = true; rim.receiveShadow = true; group.add(rim);
  const rimBevel = new THREE.Mesh(new THREE.CylinderGeometry(TABLE_OUTER_R - 0.06, TABLE_OUTER_R, 0.06, 48), woodMat);
  rimBevel.position.y = 1.22; group.add(rimBevel);

  // Brass binding ring + stud ring around the outer rim (the reference "brass-bound" look)
  const binding = new THREE.Mesh(new THREE.TorusGeometry(TABLE_OUTER_R + 0.01, 0.06, 10, 80), brassDark);
  binding.rotation.x = Math.PI / 2; binding.position.y = 1.12; group.add(binding);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.035, 6, 6), brass);
    stud.position.set(Math.cos(a) * (TABLE_OUTER_R + 0.02), 1.16, Math.sin(a) * (TABLE_OUTER_R + 0.02));
    group.add(stud);
  }

  // Six raised carved rim panels facing the seats, each with a brass diamond
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(a) * (TABLE_OUTER_R - 0.02), z = Math.sin(a) * (TABLE_OUTER_R - 0.02);
    const accent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.05, 0.5), woodDark);
    accent.position.set(x, 1.21, z); accent.rotation.y = -a; group.add(accent);
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.07), brass);
    diamond.position.set(x, 1.24, z); diamond.scale.set(0.6, 0.4, 1); diamond.rotation.y = -a; group.add(diamond);
  }

  // ── Felt surface (inset) ──
  const felt = new THREE.Mesh(new THREE.CylinderGeometry(FELT_R, FELT_R, 0.06, 64), feltMat);
  felt.position.y = FELT_TOP_Y - 0.03; felt.receiveShadow = true; group.add(felt);

  // ── Inner wood lip (raised ridge between felt and rim) ──
  const lip = new THREE.Mesh(new THREE.TorusGeometry(FELT_R + 0.07, 0.05, 10, 80), woodDark);
  lip.rotation.x = Math.PI / 2; lip.position.y = FELT_TOP_Y + 0.01; group.add(lip);

  // ── Gold rings ──
  const goldOuter = new THREE.Mesh(new THREE.TorusGeometry(FELT_R + 0.02, 0.035, 10, 90), brass);
  goldOuter.rotation.x = Math.PI / 2; goldOuter.position.y = FELT_TOP_Y + 0.02; group.add(goldOuter);
  const goldInner = new THREE.Mesh(new THREE.TorusGeometry(FELT_R - 0.45, 0.025, 8, 80), brassDark);
  goldInner.rotation.x = Math.PI / 2; goldInner.position.y = FELT_TOP_Y + 0.015; group.add(goldInner);

  // ── Candles (few, at the diagonals; never on the card/chip line) ──
  for (const p of candlePositions()) {
    const holder = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.1, 10), brass);
    holder.position.set(p.x, FELT_TOP_Y + 0.05, p.z); group.add(holder);
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.26, 10),
      new THREE.MeshStandardMaterial({ color: 0xf6edd2, roughness: 0.6 }));
    wax.position.set(p.x, FELT_TOP_Y + 0.23, p.z); wax.castShadow = true; group.add(wax);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.16, 8),
      new THREE.MeshStandardMaterial({ color: 0xffd070, emissive: 0xff7a18, emissiveIntensity: 3.2, transparent: true, opacity: 0.92 }));
    flame.position.set(p.x, FELT_TOP_Y + 0.43, p.z); group.add(flame);
  }

  scene.add(group);
  return group;
}
