import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// Shared procedural material library.
//
// The scene looked flat because almost everything was a solid-colour
// MeshStandardMaterial. Real surfaces read as "textured" because of relief —
// wood grain grooves, brushed/scratched brass, quilted leather, stone mortar.
// Every material here ships an albedo `map` AND a grayscale `bumpMap` so light
// catches the surface detail. Canvases + materials are cached by key.
// ─────────────────────────────────────────────────────────────────────────────

const _canvasCache = {};
const _matCache = {};

function cv(key, w, h, draw) {
  if (_canvasCache[key]) return _canvasCache[key];
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  _canvasCache[key] = c;
  return c;
}

function tex(canvas, rx, ry) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.anisotropy = 8;
  return t;
}

function rnd(a, b) { return a + Math.random() * (b - a); }

// ── WOOD ─────────────────────────────────────────────────────────────────────
function woodCanvases() {
  const W = 512, H = 512;
  const albedo = cv('wood_a', W, H, (ctx) => {
    ctx.fillStyle = '#4a2c16'; ctx.fillRect(0, 0, W, H);
    // plank strips
    const planks = 5, pw = W / planks;
    for (let p = 0; p < planks; p++) {
      const base = 60 + (Math.random() * 26 - 13);
      ctx.fillStyle = `rgb(${base + 12},${base - 8},${base - 30})`;
      ctx.fillRect(p * pw, 0, pw, H);
      // seam
      ctx.fillStyle = 'rgba(15,8,3,0.85)';
      ctx.fillRect(p * pw - 1.5, 0, 3, H);
      // grain streaks within plank
      for (let i = 0; i < 60; i++) {
        const x = p * pw + Math.random() * pw;
        const dark = Math.random() < 0.6;
        ctx.strokeStyle = dark ? `rgba(20,10,4,${rnd(0.15, 0.4)})` : `rgba(150,100,55,${rnd(0.06, 0.18)})`;
        ctx.lineWidth = rnd(0.6, 2.2);
        ctx.beginPath();
        for (let y = 0; y <= H; y += 8) {
          const xo = x + Math.sin(y * 0.03 + i) * rnd(2, 6);
          y === 0 ? ctx.moveTo(xo, y) : ctx.lineTo(xo, y);
        }
        ctx.stroke();
      }
      // occasional knot
      if (Math.random() < 0.5) {
        const kx = p * pw + rnd(pw * 0.3, pw * 0.7), ky = rnd(60, H - 60);
        for (let r = 14; r > 0; r -= 2) {
          ctx.strokeStyle = `rgba(20,10,4,${0.5 - r * 0.02})`;
          ctx.lineWidth = 1.5; ctx.beginPath();
          ctx.ellipse(kx, ky, r, r * 1.5, 0, 0, Math.PI * 2); ctx.stroke();
        }
      }
    }
    // edge darkening
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  });

  const bump = cv('wood_b', W, H, (ctx) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, W, H);
    const planks = 5, pw = W / planks;
    for (let p = 0; p < planks; p++) {
      // deep seams
      ctx.fillStyle = '#000'; ctx.fillRect(p * pw - 2, 0, 4, H);
      for (let i = 0; i < 70; i++) {
        const x = p * pw + Math.random() * pw;
        ctx.strokeStyle = Math.random() < 0.7 ? `rgba(40,40,40,${rnd(0.3, 0.6)})` : `rgba(210,210,210,${rnd(0.2, 0.4)})`;
        ctx.lineWidth = rnd(0.6, 2);
        ctx.beginPath();
        for (let y = 0; y <= H; y += 8) {
          const xo = x + Math.sin(y * 0.03 + i) * rnd(2, 6);
          y === 0 ? ctx.moveTo(xo, y) : ctx.lineTo(xo, y);
        }
        ctx.stroke();
      }
    }
  });
  return { albedo, bump };
}

export function woodMaterial({ rx = 2, ry = 1, tint = 0xffffff, rough = 0.78 } = {}) {
  const key = `wood_${rx}_${ry}_${tint}_${rough}`;
  if (_matCache[key]) return _matCache[key];
  const { albedo, bump } = woodCanvases();
  const m = new THREE.MeshStandardMaterial({
    map: tex(albedo, rx, ry), bumpMap: tex(bump, rx, ry), bumpScale: 0.55,
    color: tint, roughness: rough, metalness: 0.02,
  });
  _matCache[key] = m; return m;
}

// ── BRASS / GOLD ─────────────────────────────────────────────────────────────
function brassCanvases() {
  const S = 256;
  const albedo = cv('brass_a', S, S, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#9c742a'); g.addColorStop(0.5, '#c89a3e'); g.addColorStop(1, '#8a6420');
    ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
    // brushed streaks
    for (let i = 0; i < 200; i++) {
      const y = Math.random() * S;
      ctx.strokeStyle = Math.random() < 0.5 ? `rgba(230,200,120,${rnd(0.05, 0.2)})` : `rgba(80,55,15,${rnd(0.05, 0.2)})`;
      ctx.lineWidth = rnd(0.5, 1.5);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + rnd(-6, 6)); ctx.stroke();
    }
    // patina blotches
    for (let i = 0; i < 30; i++) {
      ctx.fillStyle = `rgba(${rnd(60, 90) | 0},${rnd(70, 95) | 0},${rnd(40, 60) | 0},${rnd(0.05, 0.18)})`;
      ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, rnd(6, 22), 0, Math.PI * 2); ctx.fill();
    }
    // bright scratches
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(255,240,190,${rnd(0.1, 0.35)})`;
      ctx.lineWidth = rnd(0.4, 1);
      const x = Math.random() * S, y = Math.random() * S;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd(-20, 20), y + rnd(-20, 20)); ctx.stroke();
    }
  });
  const bump = cv('brass_b', S, S, (ctx) => {
    ctx.fillStyle = '#888'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const y = Math.random() * S;
      ctx.strokeStyle = `rgba(${Math.random() < 0.5 ? '40,40,40' : '210,210,210'},${rnd(0.15, 0.4)})`;
      ctx.lineWidth = rnd(0.5, 1.4);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y + rnd(-5, 5)); ctx.stroke();
    }
  });
  const roughC = cv('brass_r', S, S, (ctx) => {
    ctx.fillStyle = '#6e6e6e'; ctx.fillRect(0, 0, S, S); // base moderately glossy
    for (let i = 0; i < 30; i++) { // patina = rougher (lighter)
      ctx.fillStyle = `rgba(190,190,190,${rnd(0.1, 0.3)})`;
      ctx.beginPath(); ctx.arc(Math.random() * S, Math.random() * S, rnd(6, 22), 0, Math.PI * 2); ctx.fill();
    }
    for (let i = 0; i < 40; i++) { // scratches = shinier (darker)
      ctx.strokeStyle = `rgba(30,30,30,${rnd(0.2, 0.5)})`; ctx.lineWidth = rnd(0.4, 1);
      const x = Math.random() * S, y = Math.random() * S;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + rnd(-20, 20), y + rnd(-20, 20)); ctx.stroke();
    }
  });
  return { albedo, bump, roughC };
}

export function brassMaterial({ dark = false, rx = 1, ry = 1 } = {}) {
  const key = `brass_${dark}_${rx}_${ry}`;
  if (_matCache[key]) return _matCache[key];
  const { albedo, bump, roughC } = brassCanvases();
  const m = new THREE.MeshStandardMaterial({
    map: tex(albedo, rx, ry), bumpMap: tex(bump, rx, ry), bumpScale: 0.18,
    roughnessMap: tex(roughC, rx, ry),
    color: dark ? 0x9a7430 : 0xd8aa48, metalness: 0.85, roughness: 0.5,
  });
  _matCache[key] = m; return m;
}

// ── LEATHER (tufted) ─────────────────────────────────────────────────────────
function leatherCanvases(hex) {
  const S = 256;
  const base = new THREE.Color(hex);
  const hx = '#' + base.getHexString();
  const dk = '#' + base.clone().multiplyScalar(0.5).getHexString();
  const lt = '#' + base.clone().multiplyScalar(1.4).getHexString();
  const N = 4, step = S / N;
  const albedo = cv('leather_a_' + hex, S, S, (ctx) => {
    ctx.fillStyle = hx; ctx.fillRect(0, 0, S, S);
    // grain speckle
    for (let i = 0; i < 4000; i++) {
      ctx.fillStyle = `rgba(0,0,0,${rnd(0.02, 0.07)})`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
    }
    for (let r = -1; r <= N; r++) {
      for (let q = -1; q <= N; q++) {
        const ox = q * step + (r % 2 ? step / 2 : 0), oy = r * step;
        const grd = ctx.createRadialGradient(ox + step / 2, oy + step / 2, 2, ox + step / 2, oy + step / 2, step * 0.72);
        grd.addColorStop(0, lt); grd.addColorStop(0.55, hx); grd.addColorStop(1, dk);
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(ox + step / 2, oy); ctx.lineTo(ox + step, oy + step / 2);
        ctx.lineTo(ox + step / 2, oy + step); ctx.lineTo(ox, oy + step / 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#c69a3a';
        ctx.beginPath(); ctx.arc(ox + step / 2, oy + step / 2, 3.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
  const bump = cv('leather_b_' + hex, S, S, (ctx) => {
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, S, S);
    for (let r = -1; r <= N; r++) {
      for (let q = -1; q <= N; q++) {
        const ox = q * step + (r % 2 ? step / 2 : 0), oy = r * step;
        const grd = ctx.createRadialGradient(ox + step / 2, oy + step / 2, 2, ox + step / 2, oy + step / 2, step * 0.72);
        grd.addColorStop(0, '#e8e8e8'); grd.addColorStop(0.6, '#9a9a9a'); grd.addColorStop(1, '#1a1a1a');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(ox + step / 2, oy); ctx.lineTo(ox + step, oy + step / 2);
        ctx.lineTo(ox + step / 2, oy + step); ctx.lineTo(ox, oy + step / 2); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#000'; // button dimple
        ctx.beginPath(); ctx.arc(ox + step / 2, oy + step / 2, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
  });
  return { albedo, bump };
}

export function leatherMaterial(hex) {
  const key = `leather_${hex}`;
  if (_matCache[key]) return _matCache[key];
  const { albedo, bump } = leatherCanvases(hex);
  const m = new THREE.MeshStandardMaterial({
    map: tex(albedo, 1, 1), bumpMap: tex(bump, 1, 1), bumpScale: 0.45,
    roughness: 0.72, metalness: 0.05,
  });
  _matCache[key] = m; return m;
}

// ── STONE ────────────────────────────────────────────────────────────────────
function stoneCanvases() {
  const S = 512;
  const albedo = cv('stone_a', S, S, (ctx) => {
    ctx.fillStyle = '#6b7689'; ctx.fillRect(0, 0, S, S);
    const bh = 100;
    for (let row = 0; row * bh < S + bh; row++) {
      const y = row * bh, off = row % 2 ? 84 : 0;
      for (let x = off - 168; x < S + 168; x += 168) {
        const v = (Math.random() * 26 - 13) | 0;
        ctx.fillStyle = `rgb(${107 + v},${118 + v},${137 + v})`;
        ctx.fillRect(x + 4, y + 4, 168 - 8, bh - 8);
        // block speckle + corner shading
        for (let i = 0; i < 40; i++) {
          const sv = (Math.random() * 22 - 11) | 0;
          ctx.fillStyle = `rgba(${107 + sv},${118 + sv},${137 + sv},0.5)`;
          ctx.fillRect(x + 4 + Math.random() * 152, y + 4 + Math.random() * (bh - 8), 4, 4);
        }
      }
    }
    // mortar darkening
    ctx.strokeStyle = '#3a414e'; ctx.lineWidth = 8;
    for (let row = 0; row * bh < S + bh; row++) {
      const y = row * bh, off = row % 2 ? 84 : 0;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
      for (let x = off; x < S + 168; x += 168) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
    }
  });
  const bump = cv('stone_b', S, S, (ctx) => {
    ctx.fillStyle = '#9a9a9a'; ctx.fillRect(0, 0, S, S);
    // deep mortar lines
    ctx.strokeStyle = '#101010'; ctx.lineWidth = 9;
    const bh = 100;
    for (let row = 0; row * bh < S + bh; row++) {
      const y = row * bh, off = row % 2 ? 84 : 0;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(S, y); ctx.stroke();
      for (let x = off; x < S + 168; x += 168) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + bh); ctx.stroke(); }
    }
    // surface pitting
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '60,60,60' : '200,200,200'},${rnd(0.1, 0.3)})`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 3, 3);
    }
  });
  return { albedo, bump };
}

export function stoneMaterial({ rx = 3, ry = 3, tint = 0xffffff } = {}) {
  const key = `stone_${rx}_${ry}_${tint}`;
  if (_matCache[key]) return _matCache[key];
  const { albedo, bump } = stoneCanvases();
  const m = new THREE.MeshStandardMaterial({
    map: tex(albedo, rx, ry), bumpMap: tex(bump, rx, ry), bumpScale: 1.1,
    color: tint, roughness: 0.95, metalness: 0.0,
  });
  _matCache[key] = m; return m;
}

// ── CLOTH (woven robe) — solid colour + woven bump relief ──
function clothBumpCanvas() {
  return cv('cloth_b', 128, 128, (ctx) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 128, 128);
    ctx.lineWidth = 1.5;
    for (let i = -128; i < 128; i += 5) {
      ctx.strokeStyle = 'rgba(40,40,40,0.5)';
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 128, 128); ctx.stroke();
      ctx.strokeStyle = 'rgba(210,210,210,0.4)';
      ctx.beginPath(); ctx.moveTo(i + 2, 0); ctx.lineTo(i + 130, 128); ctx.stroke();
    }
    for (let i = -128; i < 128; i += 5) {
      ctx.strokeStyle = 'rgba(40,40,40,0.4)';
      ctx.beginPath(); ctx.moveTo(i, 128); ctx.lineTo(i + 128, 0); ctx.stroke();
    }
  });
}

export function clothMaterial(hex, { rx = 3, ry = 3 } = {}) {
  const key = `cloth_${hex}_${rx}_${ry}`;
  if (_matCache[key]) return _matCache[key];
  const m = new THREE.MeshStandardMaterial({
    color: hex, bumpMap: tex(clothBumpCanvas(), rx, ry), bumpScale: 0.25,
    roughness: 0.85, metalness: 0.0,
  });
  _matCache[key] = m; return m;
}

// ── FELT (plain emerald + cloth bump) for loaded assets ──
export function feltMaterial({ color = 0x0f5c49, rx = 4, ry = 4 } = {}) {
  const key = `felt_${color}_${rx}_${ry}`;
  if (_matCache[key]) return _matCache[key];
  const m = new THREE.MeshStandardMaterial({
    color, bumpMap: feltBumpTexture(rx, ry), bumpScale: 0.04, roughness: 0.97, metalness: 0.0,
  });
  _matCache[key] = m; return m;
}

// ── FELT bump (cloth weave) — pair with a baked felt albedo elsewhere ──
export function feltBumpTexture(rx = 1, ry = 1) {
  const S = 256;
  const canvas = cv('felt_b', S, S, (ctx) => {
    ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '110,110,110' : '150,150,150'},0.5)`;
      ctx.fillRect(Math.random() * S, Math.random() * S, 1.5, 1.5);
    }
  });
  return tex(canvas, rx, ry);
}
