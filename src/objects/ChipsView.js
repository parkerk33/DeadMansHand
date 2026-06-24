import * as THREE from 'three';
import { tryLoadAsset } from './AssetLoader.js';
import { FELT_TOP_Y } from '../room/Table.js';

// Functional chips: each player's remaining stack, their bet for the current
// street, and the central pot are all shown as denomination-accurate piles of
// imported chip models. Colour = denomination (verify the mapping in the in-game
// denominations panel; swap the `url`s here to re-assign).
const CHIP_DIAM = 0.12;

export const CHIP_DENOMS = [   // value high → low (6 chips for now; gold = batch2_07)
  { value: 1000, url: 'public/assets/batch2_07_lp.glb' },   // gold
  { value: 500,  url: 'public/assets/batch2_06_lp.glb' },
  { value: 250,  url: 'public/assets/batch2_03_lp.glb' },
  { value: 100,  url: 'public/assets/chip_3_lp.glb' },
  { value: 50,   url: 'public/assets/chip_2_lp.glb' },
  { value: 25,   url: 'public/assets/chip_1_lp.glb' },
];

// A standard small-chip "float" laid down first so stacks/bets look like a real
// rack instead of 1-2 huge-denomination chips. Whatever's left after the float is
// covered greedily by the high denominations. (e.g. 1500 → 8×25 + 4×50 + 6×100 + 1×500.)
const CHIP_FLOAT = [
  { value: 25, max: 8 },
  { value: 50, max: 4 },
  { value: 100, max: 4 },
];

// Seat → outward direction from table centre (south=player, then W, N, E).
const SEAT_DIRS = [
  new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0),
  new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0),
];
const STACK_R = 1.85, STACK_TAN = -0.5;   // player's own pile (offset to one side)
const BET_R = 1.05;                        // bet pushed toward centre
const POT_POS = new THREE.Vector3(0, FELT_TOP_Y, 0.45);
const COL_GAP = 0.16;                       // gap between denomination columns
const CHIP_RADIUS = CHIP_DIAM * 0.46;       // physics collider radius (slightly under visual)

// Break an amount into a realistic, fuller set of chips: lay down the standard
// small-chip float first, then cover the rest greedily with high denominations.
// Returns [{ denom, count }] ordered high → low for stacking.
function breakdown(amount) {
  const counts = new Map();
  let rem = Math.max(0, Math.round(amount));
  for (const f of CHIP_FLOAT) {
    const take = Math.min(f.max, Math.floor(rem / f.value));
    if (take > 0) { counts.set(f.value, (counts.get(f.value) || 0) + take); rem -= take * f.value; }
  }
  for (const d of CHIP_DENOMS) {            // high → low covers the remainder
    const take = Math.floor(rem / d.value);
    if (take > 0) { counts.set(d.value, (counts.get(d.value) || 0) + take); rem -= take * d.value; }
  }
  const out = [];
  for (const d of CHIP_DENOMS) {
    const c = counts.get(d.value) || 0;
    if (c > 0) out.push({ denom: d, count: c });
  }
  return out;
}

// Lay a chip flat (thinnest axis → vertical), scale to CHIP_DIAM, X/Z-centre it,
// bottom at the wrapper origin. Returns { proto, height } for cheap cloning.
function prepChipProto(template) {
  const inner = template.clone(true);
  let box = new THREE.Box3().setFromObject(inner);
  let s = box.getSize(new THREE.Vector3());
  if (s.x <= s.y && s.x <= s.z) inner.rotation.z = Math.PI / 2;
  else if (s.z <= s.y && s.z <= s.x) inner.rotation.x = Math.PI / 2;
  inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner);
  s = box.getSize(new THREE.Vector3());
  inner.scale.multiplyScalar(CHIP_DIAM / (Math.max(s.x, s.z) || 1));
  inner.updateMatrixWorld(true);
  box = new THREE.Box3().setFromObject(inner);
  const c = box.getCenter(new THREE.Vector3());
  inner.position.set(-c.x, -box.min.y, -c.z);
  const proto = new THREE.Group();
  proto.add(inner);
  return { proto, height: box.max.y - box.min.y };
}

// Average a chip's texture (or material colour) into a CSS colour for the legend.
function sampleColor(obj) {
  let img = null, fallback = '#caa84a';
  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (!img && o.material.map && o.material.map.image) img = o.material.map.image;
    if (o.material.color) fallback = '#' + o.material.color.getHexString();
  });
  if (!img) return fallback;
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = 24;
    const ctx = cv.getContext('2d');
    ctx.drawImage(img, 0, 0, 24, 24);
    const d = ctx.getImageData(0, 0, 24, 24).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 40) continue;          // skip transparent
      r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    if (!n) return fallback;
    return `rgb(${Math.round(r / n)},${Math.round(g / n)},${Math.round(b / n)})`;
  } catch {
    return fallback;
  }
}

export class ChipsView {
  constructor(scene, tweener, onReady = null) {
    this.scene = scene;
    this.tweener = tweener;
    this.onReady = onReady;
    this.protos = {};                 // url -> { proto, height }
    this.colors = {};                 // url -> css colour (for the legend)
    this.ready = false;
    this.stackGroups = [null, null, null, null];
    this.betGroups = [null, null, null, null];
    // The pot is a PERSISTENT physical pile — bet chips are moved into it and never
    // recombined; they sit until the whole pot is awarded to the winner.
    this.potGroup = new THREE.Group();
    this.potGroup.position.copy(POT_POS);
    this._potH = 0;
    scene.add(this.potGroup);
    this._pending = null;
    this.physics = null;              // optional ChipPhysics for dropping chips into the pot
    this._load();
  }

  setPhysics(physics) { this.physics = physics; }

  async _load() {
    const urls = [...new Set(CHIP_DENOMS.map((d) => d.url))];
    await Promise.all(urls.map(async (url) => {
      const m = await tryLoadAsset(url, { reskin: false });
      if (m) { this.protos[url] = prepChipProto(m); this.colors[url] = sampleColor(m); }
    }));
    this.ready = true;
    if (this._pending) { this.update(this._pending); this._pending = null; }
    this.onReady?.(this);
  }

  // [{ value, color }] high → low, for the in-game denominations legend.
  getDenoms() {
    return CHIP_DENOMS.map((d) => ({ value: d.value, color: this.colors[d.url] || '#caa84a' }));
  }

  _stackPos(i) {
    const d = SEAT_DIRS[i], tan = new THREE.Vector3(-d.z, 0, d.x);
    return new THREE.Vector3(d.x * STACK_R + tan.x * STACK_TAN, FELT_TOP_Y, d.z * STACK_R + tan.z * STACK_TAN);
  }
  _betPos(i) {
    const d = SEAT_DIRS[i];
    return new THREE.Vector3(d.x * BET_R, FELT_TOP_Y, d.z * BET_R);
  }

  // Build a denomination-accurate pile for `amount`, columns spread along the
  // tangent so each colour is visible. Returns a Group placed at `center`.
  _buildAmount(amount, center, dir) {
    const g = new THREE.Group();
    const bd = breakdown(amount);
    const tan = new THREE.Vector3(-dir.z, 0, dir.x);
    bd.forEach((b, k) => {
      const prep = this.protos[b.denom.url];
      if (!prep) return;
      const off = (k - (bd.length - 1) / 2) * COL_GAP;
      for (let i = 0; i < b.count; i++) {
        const chip = prep.proto.clone(true);
        chip.userData.chipH = prep.height;
        chip.userData.denomValue = b.denom.value;   // so the raise picker can highlight by denom
        chip.position.set(tan.x * off + (Math.random() - 0.5) * 0.005,
          i * prep.height * 0.96,
          tan.z * off + (Math.random() - 0.5) * 0.005);
        chip.rotation.y = Math.random() * Math.PI * 2;
        g.add(chip);
      }
    });
    g.position.copy(center);
    return g;
  }

  _dispose(group) {
    if (group) this.scene.remove(group);
  }

  // Denomination breakdown of an amount as { value: count } (for the raise picker).
  denomCounts(amount) {
    const out = {};
    for (const b of breakdown(amount)) out[b.denom.value] = b.count;
    return out;
  }

  // Glow `counts` chips of each denomination on seat `seatIdx`'s stack — used while
  // building a raise so the player sees which chips they're committing. Replaces any
  // previous highlight.
  highlightStackChips(seatIdx, counts) {
    this.clearHighlight();
    const g = this.stackGroups[seatIdx];
    if (!g) return;
    const byVal = {};
    for (const chip of g.children) {
      const v = chip.userData.denomValue;
      (byVal[v] = byVal[v] || []).push(chip);
    }
    for (const v of Object.keys(counts || {})) {
      const list = byVal[v] || [];
      for (let i = 0; i < Math.min(counts[v], list.length); i++) {
        this._setChipGlow(list[i], true);
        this._hl.push(list[i]);
      }
    }
  }

  clearHighlight() {
    if (this._hl) for (const c of this._hl) this._setChipGlow(c, false);
    this._hl = [];
  }

  _setChipGlow(wrapper, on) {
    wrapper.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      if (on) {
        if (!o.userData._om) o.userData._om = o.material;
        if (!o.userData._hm) {
          const hm = o.userData._om.clone();
          if (hm.emissive !== undefined) { hm.emissive = new THREE.Color(0xffcc44); hm.emissiveIntensity = 0.75; }
          o.userData._hm = hm;
        }
        o.material = o.userData._hm;
      } else if (o.userData._om) {
        o.material = o.userData._om;
      }
    });
  }

  // Refresh only the player stacks and current-street bets (NOT the pot — the pot
  // is a persistent pile fed by collectBetsToPot). stacks/bets are 4-element arrays.
  update({ stacks, bets }) {
    if (!this.ready) { this._pending = { stacks, bets }; return; }
    for (let i = 0; i < 4; i++) {
      this._dispose(this.stackGroups[i]);
      this.stackGroups[i] = this._buildAmount(stacks[i], this._stackPos(i), SEAT_DIRS[i]);
      this.scene.add(this.stackGroups[i]);

      this._dispose(this.betGroups[i]);
      this.betGroups[i] = bets[i] > 0 ? this._buildAmount(bets[i], this._betPos(i), SEAT_DIRS[i]) : null;
      if (this.betGroups[i]) this.scene.add(this.betGroups[i]);
    }
  }

  // Move a finished bet pile's actual chips into the persistent pot, scattered
  // into a loose mound. The chips keep their identity — never recombined.
  _absorbIntoPot(g) {
    for (const chip of [...g.children]) {
      g.remove(chip);
      const a = Math.random() * Math.PI * 2, r = Math.random() * 0.26;
      chip.position.set(Math.cos(a) * r, this._potH, Math.sin(a) * r);
      chip.rotation.y = Math.random() * Math.PI * 2;
      this.potGroup.add(chip);
      this._potH += (chip.userData.chipH || 0.02) * 0.5;
    }
    this.scene.remove(g);
  }

  // Send one bet group's actual chips into the pot: physics slides each chip in
  // from where it sits; otherwise tween the pile in and absorb it.
  _sendGroupToPot(g) {
    if (this.physics && this.physics.ready) {
      const wp = new THREE.Vector3();
      for (const chip of [...g.children]) {
        chip.getWorldPosition(wp);
        g.remove(chip);
        this.physics.queueChip(chip, CHIP_RADIUS, (chip.userData.chipH || 0.02) / 2, wp.x, wp.z);
      }
      this.scene.remove(g);
    } else if (this.tweener) {
      this.tweener.to(g.position, { x: POT_POS.x, z: POT_POS.z }, 0.4, 'easeInOutCubic', () => this._absorbIntoPot(g));
    } else {
      this._absorbIntoPot(g);
    }
  }

  // Throw a single seat's committed chips into the pot immediately (e.g. a blind
  // that folds preflop) — its chips converge on the pot like any collection.
  collectSeatToPot(seatIdx) {
    const g = this.betGroups[seatIdx];
    if (!g) return;
    this.betGroups[seatIdx] = null;
    this._sendGroupToPot(g);
  }

  // Collect every player's bet pile into the persistent pot. onDone fires once the
  // (tween) piles have landed; the physics path advances immediately.
  collectBetsToPot(onDone) {
    const groups = this.betGroups.filter(Boolean);
    this.betGroups = [null, null, null, null];   // detach so update() won't dispose them mid-flight

    if (this.physics && this.physics.ready) {
      for (const g of groups) this._sendGroupToPot(g);
      onDone?.();                                 // chips slide in over the next frames; advance now
      return;
    }

    if (!groups.length || !this.tweener) { for (const g of groups) this._absorbIntoPot(g); onDone?.(); return; }
    let n = groups.length;
    for (const g of groups) {
      this.tweener.to(g.position, { x: POT_POS.x, z: POT_POS.z }, 0.5, 'easeInOutCubic', () => {
        this._absorbIntoPot(g);
        if (--n === 0) onDone?.();
      });
    }
  }

  // Slide the whole pot to a seat, then clear it (the winner's stack rebuilds with
  // the new total separately). onDone fires when the slide finishes.
  awardPot(seatIdx, onDone) {
    if (this.physics && this.physics.hasChips()) {
      this.physics.clear();          // sweep the physical pot away; winner's stack rebuilds
      this._clearPot();
      onDone?.();
      return;
    }
    if (!this.potGroup.children.length || !this.tweener) { this._clearPot(); onDone?.(); return; }
    const target = this._stackPos(seatIdx);
    this.tweener.to(this.potGroup.position, { x: target.x, z: target.z }, 0.7, 'easeInOutCubic', () => {
      this._clearPot();
      onDone?.();
    });
  }

  _clearPot() {
    for (const c of [...this.potGroup.children]) this.potGroup.remove(c);
    this._potH = 0;
    this.potGroup.position.copy(POT_POS);
  }

  // Full reset for a new hand: clear stacks, bets and the pot.
  clear() {
    for (let i = 0; i < 4; i++) {
      this._dispose(this.stackGroups[i]); this.stackGroups[i] = null;
      this._dispose(this.betGroups[i]); this.betGroups[i] = null;
    }
    this._clearPot();
    this.physics?.clear();
  }
}
