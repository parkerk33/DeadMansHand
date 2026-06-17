import * as THREE from 'three';
import { PokerGame } from '../game/PokerGame.js';
import { botDecide } from '../game/BotPlayer.js';
import { Card3D, CARD_DECK_POS } from '../objects/Card3D.js';
import { Character3D } from '../objects/Character3D.js';
import { BettingRound, settlePots, CHIP_UNIT } from '../game/BettingEngine.js';
import { setupLighting, animateLights } from '../room/Lighting.js';
import { createTable, FELT_TOP_Y } from '../room/Table.js';
import { buildEnvironment } from '../room/Environment.js';
import { tryLoadAsset } from '../objects/AssetLoader.js';
import { ChipsView } from '../objects/ChipsView.js';
import { ChipPhysics } from '../physics/ChipPhysics.js';
import { Tweener } from '../utils/Tweener.js';

// Prototype: real rigid-body physics for chips dropping into the pot. Set false to
// fall back to the hand-animated tween/scatter.
const USE_CHIP_PHYSICS = true;

// The hero table is assembled from imported pieces (bottom → top):
//   base   = pedestal/foot from the floor up to the underside of the top
//   center = furn_08, the play surface — community cards rest on its TOP (= FELT_TOP_Y)
//   border = furn_11, the outer wood rim, concentric around the center (NOT stacked)
//   tray   = dealer tray prop resting on the surface
// Tuning knobs per piece:
//   diam        target footprint (max of width/depth) in world units
//   sizeX/sizeZ independent per-axis footprint (overrides diam on that axis)
//   flattenY    independent world thickness for slab pieces (omit → scale uniformly)
//   fitHeight   pillar mode: scale by height instead of footprint
//   diamCap     cap footprint after a height-fit
//   top/bottom  anchor that face to a world Y
//   offset      [x,y,z] XZ shift (for off-centre props like the tray)
//
// Blueprint table = Poker Table (furn_08, felt+rim) on a Table Pedestal column on a
// wide Pedestal Base (bottom → top): a short wide foot, a narrower turned column,
// then the tabletop whose surface sits at FELT_TOP_Y.
const TABLE_PARTS = [
  { key: 'base',     url: '/assets/sot_pedestal_base.glb', fitHeight: 0.45, diamCap: 2.3, bottom: 0 },
  { key: 'pedestal', url: '/assets/sot_pedestal.glb',      fitHeight: 0.72, diamCap: 1.5, bottom: 0.4 },
  { key: 'center',   url: '/assets/furniture_08.glb',      diam: 5.3, flattenY: 0.16, top: FELT_TOP_Y, hideProcedural: true },
  // Dealer tray + furn_11 rim removed for now — the felt tabletop stands on its own.
];

// Imported low-poly props (decimated from the heavy Meshy originals).
const DEALER_BTN_URL = '/assets/dealer_button_lp.glb';
const DEALER_BTN_DIAM = 0.42;  // dealer button disc
const DEALER_BTN_R = 1.95;     // radius from centre the button sits at (in front of the dealer seat)

// Height at which cards rest on the felt.
const CARD_Y = FELT_TOP_Y + 0.015;
const SEAT_R = 4.5;

// Figurines stand on the FLOOR (y 0) around the table, facing the center.
const SEAT_POSITIONS = [
  new THREE.Vector3(0, 0, SEAT_R),     // 0: human (south, nearest camera)
  new THREE.Vector3(-SEAT_R, 0, 0),    // 1: bot west (left)
  new THREE.Vector3(0, 0, -SEAT_R),    // 2: bot north (far)
  new THREE.Vector3(SEAT_R, 0, 0),     // 3: bot east (right)
];

// Hole cards laid on the felt in front of each seat, toward the center.
const HOLE_POSITIONS = [
  [new THREE.Vector3(-0.3, CARD_Y, 2.15),  new THREE.Vector3(0.3, CARD_Y, 2.15)],   // south
  [new THREE.Vector3(-2.15, CARD_Y, -0.3), new THREE.Vector3(-2.15, CARD_Y, 0.3)],  // west
  [new THREE.Vector3(-0.3, CARD_Y, -2.15), new THREE.Vector3(0.3, CARD_Y, -2.15)],  // north
  [new THREE.Vector3(2.15, CARD_Y, -0.3),  new THREE.Vector3(2.15, CARD_Y, 0.3)],   // east
];

const COMMUNITY_POSITIONS = [
  new THREE.Vector3(-0.64, CARD_Y, -0.15),
  new THREE.Vector3(-0.32, CARD_Y, -0.15),
  new THREE.Vector3(0, CARD_Y, -0.15),
  new THREE.Vector3(0.32, CARD_Y, -0.15),
  new THREE.Vector3(0.64, CARD_Y, -0.15),
];

// Where each player's hole card lands on the felt.
function holePos(player, cardIndex) {
  return HOLE_POSITIONS[player][cardIndex].clone();
}

// First-person held hand: the human's hole cards are parented to the CAMERA and
// positioned in camera-local space, so they stay in hand as you look around.
// (-z is forward/away; -y is down; the cards face back toward the eye.)
const HELD_LOCAL = new THREE.Vector3(0, -0.42, -1.15);
const HELD_SCALE = 0.72;
const HELD_SPREAD = 0.34;   // horizontal gap between cards
const HELD_TILT_X = -0.35;  // tilt the faces up toward the eye
const HELD_FAN = 0.2;       // per-card fan rotation

// Turn timing (seconds)
const TURN_TIME = 20;        // the human's clock; auto-check/fold on timeout
const BOT_THINK_MIN = 1.3;   // bots act somewhere in this window
const BOT_THINK_MAX = 4.0;

export class GameController {
  constructor(renderer, scene, camera, classes) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;

    this.tweener = new Tweener();
    this.lights = null;

    // Game state
    this.game = null;
    this.selectedClasses = classes; // array of 4 class objects, index 0 = human
    this.characters = [];
    this.holeCard3Ds = [[], [], [], []];  // [playerIdx][0|1]
    this.communityCard3Ds = [];
    this.bState = null;
    this.abilityUsed = { passive: false, ultimate: false };
    this.pendingAction = null; // 'jester_swap', 'sorcerer_swap', etc.
    this.peekedCard = null;
    this.peekTimer = null;
    this.markedTarget = -1;
    this.knightCharge = false;
    this.nobleDecreeActive = false;
    this.assassinBonus = false;
    this.alchemistStoneUsed = false;
    this.summoner_familiar = false;

    this._buildRoom();
    this._buildUI();
  }

  _buildRoom() {
    this.lights = setupLighting(this.scene);
    this.tableGroup = createTable(this.scene);
    buildEnvironment(this.scene);
    this._loadTableAssembly();
    this._loadStaticProps();
    this.chipsView = new ChipsView(this.scene, this.tweener, (cv) => {
      this._buildDenomPanel(cv);
      this._buildRaiseChips(cv);
    });

    // Optional chip physics — init is async (WASM); wire it into ChipsView when ready.
    if (USE_CHIP_PHYSICS) {
      this.chipPhysics = new ChipPhysics(this.scene);
      this.chipPhysics.init().then(() => this.chipsView.setPhysics(this.chipPhysics))
        .catch((e) => console.info('[physics] disabled:', e?.message || e));
    }
  }

  // Populate the collapsible chip-denominations legend from the loaded chip colours.
  _buildDenomPanel(cv) {
    const list = document.getElementById('denom-list');
    if (!list) return;
    list.innerHTML = '';
    for (const d of cv.getDenoms()) {
      const row = document.createElement('div');
      row.className = 'denom-row';
      row.innerHTML = `<span class="denom-swatch" style="background:${d.color}"></span><span>${d.value}</span>`;
      list.appendChild(row);
    }
  }

  // Rebuild each player's remaining stack and current-street bet from live state.
  // The pot is a persistent physical pile fed by collectBetsToPot / awardPot, so
  // it is intentionally NOT rebuilt here.
  _refreshChips() {
    if (!this.chipsView || !this.game) return;
    const stacks = [0, 0, 0, 0], bets = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      stacks[i] = this.game.players[i].chips;
      // Folded players show no bet — their committed chips have been thrown into
      // the pot (see _applyAction), so don't re-render them in front of the seat.
      bets[i] = (this.round && !this.game.players[i].folded) ? (this.round.roundBets[i] || 0) : 0;
    }
    this.chipsView.update({ stacks, bets });
  }

  // Load the imported dealer button, wrapped in a holder group whose origin is its
  // felt-contact centre so positioning is trivial. (Deck pile removed for now.)
  _loadStaticProps() {
    tryLoadAsset(DEALER_BTN_URL, { reskin: false }).then((btn) => {
      if (!btn) return;
      this._fitAndAnchor(btn, DEALER_BTN_DIAM);
      const holder = new THREE.Group();
      holder.add(btn);
      this.dealerButton = holder;
      this.scene.add(holder);
      this._placeDealerButton();
    });
  }

  // Scale obj to a target footprint and shift it so its X/Z centre and bottom face
  // sit at the local origin (ready to drop into a positioned holder group).
  _fitAndAnchor(obj, diam) {
    let box = new THREE.Box3().setFromObject(obj);
    const size = box.getSize(new THREE.Vector3());
    obj.scale.setScalar(diam / (Math.max(size.x, size.z) || 1));
    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    obj.position.set(-c.x, -box.min.y, -c.z);
    obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }

  // Move the dealer button onto the felt in front of the current dealer seat.
  _placeDealerButton() {
    if (!this.dealerButton || !this.game) return;
    const dir = SEAT_POSITIONS[this.game.dealerIndex].clone();
    dir.y = 0; dir.normalize();
    this.dealerButton.position.set(dir.x * DEALER_BTN_R, FELT_TOP_Y, dir.z * DEALER_BTN_R);
    this.dealerButton.visible = true;
  }

  // Assemble the hero table from the imported pieces (see TABLE_PARTS). Each loads
  // independently and is fitted/anchored by its config; the procedural table stays
  // as the fallback and is hidden once the play-surface piece (center) loads.
  _loadTableAssembly() {
    this.tableParts = {};
    for (const part of TABLE_PARTS) {
      tryLoadAsset(part.url, { reskin: false }).then((obj) => {
        if (!obj) return;   // missing piece: others still assemble, procedural stays if center failed
        const placed = part.tile ? this._tileRimPart(obj, part) : this._placeTablePart(obj, part);
        placed.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        if (!part.tile) this.scene.add(placed);   // _tileRimPart already adds its group
        this.tableParts[part.key] = placed;
        if (part.hideProcedural && this.tableGroup) this.tableGroup.visible = false;
      });
    }
  }

  // Tile a single rim segment around the table edge into a continuous rail. Returns
  // the group of clones (already added to the scene).
  _tileRimPart(template, part) {
    const t = part.tile;
    const box = new THREE.Box3().setFromObject(template);
    const size = box.getSize(new THREE.Vector3());
    const fit = t.segH / (size.y || 1);             // base scale fits the target height
    const segLen0 = (size.x || 1) * fit;            // natural segment length at that scale
    const count = t.count || Math.max(6, Math.round((2 * Math.PI * t.radius) / segLen0));
    const lenScale = ((2 * Math.PI * t.radius) / count / (segLen0 || 1)) * (t.overlap || 1);

    const ring = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + (t.angleOffset || 0);
      const seg = template.clone(true);
      seg.scale.set(fit * lenScale, fit, fit);      // stretch length to close the ring; keep height/thickness
      seg.updateMatrixWorld(true);
      const b = new THREE.Box3().setFromObject(seg);
      const c = b.getCenter(new THREE.Vector3());
      seg.position.set(-c.x, -b.min.y, -c.z);       // centre on X/Z, bottom at the holder origin

      const holder = new THREE.Group();
      holder.add(seg);
      holder.position.set(Math.cos(a) * t.radius, t.y, Math.sin(a) * t.radius);
      holder.rotation.y = -a + (t.rotOffset || 0);  // turn the length tangent to the ring
      ring.add(holder);
    }
    this.scene.add(ring);
    return ring;
  }

  // Scale a piece to its target footprint (or height in pillar mode), centre it on
  // X/Z (plus optional offset), and anchor its top or bottom face to a world Y.
  _placeTablePart(obj, part) {
    let box = new THREE.Box3().setFromObject(obj);
    let size = box.getSize(new THREE.Vector3());
    let sx, sy, sz;
    if (part.fitHeight != null) {
      sx = sy = sz = part.fitHeight / (size.y || 1);
      const diam = Math.max(size.x, size.z) * sx;
      if (part.diamCap && diam > part.diamCap) { const k = part.diamCap / diam; sx *= k; sy *= k; sz *= k; }
    } else {
      const uni = part.diam != null ? part.diam / (Math.max(size.x, size.z) || 1) : 1;
      sx = part.sizeX != null ? part.sizeX / (size.x || 1) : uni;
      sz = part.sizeZ != null ? part.sizeZ / (size.z || 1) : uni;
      sy = part.flattenY != null ? part.flattenY / (size.y || 1) : uni;
    }
    obj.scale.set(sx, sy, sz);

    obj.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(obj);
    const c = box.getCenter(new THREE.Vector3());
    const off = part.offset || [0, 0, 0];
    obj.position.x += off[0] - c.x;
    obj.position.z += off[2] - c.z;
    if (part.top != null) obj.position.y += part.top - box.max.y;
    else if (part.bottom != null) obj.position.y += part.bottom - box.min.y;
    return obj;
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  _buildUI() {
    // Nothing to build here — all HTML is pre-existing in index.html.
    // Wire up action buttons.
    const $ = id => document.getElementById(id);
    $('btn-fold').addEventListener('click', () => this._humanAction('fold'));
    $('btn-check').addEventListener('click', () => this._humanCheckCall());
    $('btn-raise').addEventListener('click', () => this._showRaisePanel());
    $('btn-ability').addEventListener('click', () => this._useAbility());

    // Chip-picker raise controls
    this.raiseSel = 0; this.raiseInc = 1; this.raiseCounts = {};
    for (const b of document.querySelectorAll('.inc-btn')) {
      b.addEventListener('click', () => {
        this.raiseInc = Number(b.dataset.inc);
        for (const o of document.querySelectorAll('.inc-btn')) o.classList.toggle('active', o === b);
      });
    }
    $('btn-raise-pot').addEventListener('click', () => this._raisePreset('pot'));
    $('btn-raise-allin').addEventListener('click', () => this._raisePreset('allin'));
    $('btn-raise-clear').addEventListener('click', () => this._raiseSetAmount(0));
    $('btn-raise-confirm').addEventListener('click', () => this._raiseConfirm());
    $('btn-cancel-raise').addEventListener('click', () => this._hideRaisePanel());

    const denomToggle = $('denom-toggle');
    if (denomToggle) {
      denomToggle.addEventListener('click', () => {
        const list = $('denom-list');
        const open = list.classList.toggle('open');
        denomToggle.textContent = `⛁ Chip Values ${open ? '▴' : '▾'}`;
      });
    }
  }

  _showPanel(id) { document.getElementById(id).style.display = 'flex'; }
  _hidePanel(id) { document.getElementById(id).style.display = 'none'; }

  // Build the clickable denomination chips in the raise panel from the loaded chip
  // colours (so the picker matches the 3D chips). Keyed ids let keys 1–5 add them.
  _buildRaiseChips(cv) {
    const wrap = document.getElementById('raise-chips');
    if (!wrap) return;
    wrap.innerHTML = '';
    cv.getDenoms().forEach((d, i) => {
      const btn = document.createElement('button');
      btn.className = 'raise-chip';
      btn.id = `raise-chip-${i}`;
      btn.style.background = d.color;
      btn.textContent = d.value;
      btn.addEventListener('click', () => this._raiseAddChip(d.value));
      wrap.appendChild(btn);
    });
  }

  _showRaisePanel() {
    if (!this.round) return;
    this.raiseLegal = this.round.legalActions(0);
    this._raiseSetAmount(0);
    this._showPanel('raise-panel');
  }
  _hideRaisePanel() { this._hidePanel('raise-panel'); this.chipsView?.clearHighlight(); }

  // Add chips of one denomination to the bet (individual or ×5 stack), tracking the
  // exact chips clicked so we can highlight the matching ones on the player's stack.
  _raiseAddChip(value) {
    const L = this.raiseLegal;
    if (!L) return;
    const add = Math.min(this.raiseInc, Math.floor((L.allInCommit - this.raiseSel) / value));
    if (add <= 0) return;
    this.raiseCounts[value] = (this.raiseCounts[value] || 0) + add;
    this.raiseSel += value * add;
    this._afterRaiseChange();
  }

  _raisePreset(kind) {
    if (!this.raiseLegal) return;
    const amt = kind === 'allin' ? this.raiseLegal.allInCommit : this.raiseLegal.toCall + this.game.pot;
    this._raiseSetAmount(Math.min(amt, this.raiseLegal.allInCommit));
  }

  // Set the bet to an absolute amount (clear / presets); chip counts derive from the
  // standard breakdown of that amount.
  _raiseSetAmount(v) {
    this.raiseSel = Math.max(0, Math.round(v));
    this.raiseCounts = this.chipsView ? this.chipsView.denomCounts(this.raiseSel) : {};
    this._afterRaiseChange();
  }

  _afterRaiseChange() {
    const L = this.raiseLegal || { minRaiseCommit: 0, allInCommit: 0, toCall: 0 };
    const valid = this.raiseSel >= L.minRaiseCommit && this.raiseSel <= L.allInCommit;
    document.getElementById('raise-total').textContent = this.raiseSel;
    document.getElementById('raise-bounds').textContent =
      `to call ${L.toCall} · min ${L.minRaiseCommit} · max ${L.allInCommit}`;
    const confirm = document.getElementById('btn-raise-confirm');
    confirm.disabled = !valid;
    confirm.textContent = valid ? `RAISE TO ${this.raiseSel}` : `MIN ${L.minRaiseCommit}`;
    this.chipsView?.highlightStackChips(0, this.raiseCounts);   // glow the chips on your stack
  }

  _raiseConfirm() {
    const L = this.raiseLegal;
    if (!L || this.raiseSel < L.minRaiseCommit || this.raiseSel > L.allInCommit) return;
    const amount = this.raiseSel;
    this._hideRaisePanel();
    this._setActionButtons(false);
    this._hideMsg();
    this._applyAction(0, 'raise', amount);
  }

  _showMsg(text, duration = 0) {
    const el = document.getElementById('msg-overlay');
    el.textContent = text;
    el.style.display = 'block';
    if (duration > 0) setTimeout(() => { el.style.display = 'none'; }, duration);
  }
  _hideMsg() { document.getElementById('msg-overlay').style.display = 'none'; }

  _updatePot() {
    document.getElementById('pot-display').textContent = `Pot: ${this.game.pot}`;
  }

  _updatePlayerPanels() {
    for (let i = 0; i < 4; i++) {
      const p = this.game.players[i];
      const panel = document.getElementById(`player-panel-${i}`);
      if (!panel) continue;
      panel.querySelector('.p-name').textContent = p.name;
      panel.querySelector('.p-chips').textContent = `${p.chips} chips`;
      panel.querySelector('.p-class').textContent = this.selectedClasses[i].emoji;
      panel.classList.toggle('folded', p.folded);
      panel.classList.toggle('inactive', !p.active);
      panel.classList.toggle('active-turn', this.bState && this.bState.currentIdx === i);
    }
  }

  _setActionButtons(enabled) {
    ['btn-fold','btn-check','btn-raise','btn-ability'].forEach(id => {
      document.getElementById(id).disabled = !enabled;
    });
  }

  _updateAbilityButton() {
    const cls = this.selectedClasses[0];
    const btn = document.getElementById('btn-ability');
    btn.innerHTML = `${cls.emoji} ${cls.ultimate.name} <kbd>E</kbd>`;
    btn.disabled = this.abilityUsed.ultimate;
    document.getElementById('passive-name').textContent = `Passive: ${cls.passive.name}`;
    document.getElementById('passive-desc').textContent = cls.passive.description;
    document.getElementById('ultimate-desc').textContent = cls.ultimate.description;
  }

  // ── Start game ─────────────────────────────────────────────────────────────

  startGame(selectedClasses) {
    this.selectedClasses = selectedClasses;

    // Clear any previous characters/cards
    this._clearTable();

    const configs = [
      { name: 'You', isHuman: true, class: selectedClasses[0] },
      { name: 'Bot West', isHuman: false, class: selectedClasses[1] },
      { name: 'Bot North', isHuman: false, class: selectedClasses[2] },
      { name: 'Bot East', isHuman: false, class: selectedClasses[3] },
    ];

    this.game = new PokerGame(configs, 1500, 25);

    // Spawn opponent figurines. The human (index 0) is the seated viewpoint, so
    // we don't render their own avatar (it would block the table).
    this.characters = [null];
    for (let i = 1; i < 4; i++) {
      const char = new Character3D(this.scene, selectedClasses[i], SEAT_POSITIONS[i], false);
      this.characters.push(char);
    }

    this._updatePlayerPanels();
    this._updateAbilityButton();
    this._setActionButtons(false);
    this._startRound();
  }

  _clearTable() {
    // Remove existing characters
    for (const c of this.characters) c?.destroy();
    this.characters = [];

    // Remove all hole cards
    for (const cards of this.holeCard3Ds) {
      for (const c of cards) c?.destroy();
    }
    this.holeCard3Ds = [[], [], [], []];

    // Remove community cards
    for (const c of this.communityCard3Ds) c?.destroy();
    this.communityCard3Ds = [];
  }

  // ── Round lifecycle ─────────────────────────────────────────────────────────

  _startRound() {
    this.abilityUsed = { passive: false, ultimate: false };
    this.markedTarget = -1;
    this.knightCharge = false;
    this.nobleDecreeActive = false;
    this.assassinBonus = false;
    this.alchemistStoneUsed = false;
    this.summoner_familiar = false;
    this.pendingAction = null;

    // Clear previous cards
    for (const cards of this.holeCard3Ds) { for (const c of cards) c?.destroy(); }
    this.holeCard3Ds = [[], [], [], []];
    for (const c of this.communityCard3Ds) c?.destroy();
    this.communityCard3Ds = [];

    this.game.startRound();
    this._placeDealerButton();
    const blinds = this.game.postBlinds();
    this._updatePot();
    this._updatePlayerPanels();
    this.round = null;                 // preflop round not created yet
    this.chipsView?.clear();           // new hand: empty pot/bets, then show fresh stacks
    this._refreshChips();
    this._showMsg(`Blinds posted — SB: ${blinds.sbAmt}, BB: ${blinds.bbAmt}`, 2000);

    // Deal hole cards after short delay
    setTimeout(() => this._dealHoleCards(), 2200);
  }

  _dealHoleCards() {
    this.game.dealHoleCards();

    // Only the bots' cards animate onto the felt; the human's cards go into the
    // first-person held fan. The deal-complete counter tracks the bot cards.
    let animCount = 0;
    const botCards = this.game.activePlayers.filter((p) => !p.isHuman).length * 2;
    const onDone = () => { animCount++; if (animCount >= botCards) this._onHoleCardsDealt(); };

    for (let i = 0; i < 4; i++) {
      const p = this.game.players[i];
      if (!p.active) continue;
      for (let j = 0; j < 2; j++) {
        if (p.isHuman) {
          // Face-up card, placed into the held fan (no felt animation).
          const card = new Card3D(this.scene, p.holeCards[j], false);
          this.holeCard3Ds[i].push(card);
        } else {
          const card = new Card3D(this.scene, p.holeCards[j], true);
          card.setPosition(CARD_DECK_POS.x, CARD_DECK_POS.y, CARD_DECK_POS.z);
          card.moveTo(this.tweener, holePos(i, j), (i * 2 + j) * 150, 0.4, onDone);
          this.holeCard3Ds[i].push(card);
        }
      }
    }

    this._layoutHeldHand();
    if (botCards === 0) this._onHoleCardsDealt();
  }

  // Position the human's hole cards as a fanned hand parented to the camera so
  // they stay in view while the player looks around (mouse-look).
  _layoutHeldHand() {
    const cards = this.holeCard3Ds[0].filter(Boolean);
    const n = cards.length;
    cards.forEach((c, i) => {
      if (c.mesh.parent !== this.camera) {
        c.mesh.removeFromParent();
        this.camera.add(c.mesh);
      }
      const t = n > 1 ? i - (n - 1) / 2 : 0;   // e.g. -0.5, +0.5 for two cards
      c.mesh.scale.setScalar(HELD_SCALE);
      c.mesh.position.set(
        HELD_LOCAL.x + t * HELD_SPREAD,
        HELD_LOCAL.y - Math.abs(t) * 0.05,
        HELD_LOCAL.z,
      );
      c.mesh.rotation.set(HELD_TILT_X, 0, -t * HELD_FAN);
      c.mesh.castShadow = false;
      c.faceDown = false;
    });
  }

  _onHoleCardsDealt() {
    // Apply Summoner passive: first hole card is wild
    if (this.selectedClasses[0].name === 'Summoner' && !this.summoner_familiar) {
      this.summoner_familiar = true;
      this.game.players[0].holeCards[0].wild = true;
      this.holeCard3Ds[0][0]?.destroy();
      const wildCard = new Card3D(this.scene, this.game.players[0].holeCards[0], false);
      const pos = holePos(0, 0);
      wildCard.setPosition(pos.x, pos.y, pos.z);
      this.holeCard3Ds[0][0] = wildCard;
      this._layoutHeldHand();
      this._showMsg('Familiar Bond: first hole card is wild! ✨', 2500);
    }

    // Apply Jester passive: optionally swap one hole card
    if (this.selectedClasses[0].name === 'Jester' && !this.abilityUsed.passive) {
      this._enableJesterPassive();
      return;
    }

    // Apply Ranger passive: peek at flop card briefly
    if (this.selectedClasses[0].name === 'Ranger' && !this.abilityUsed.passive) {
      this._doRangerPeek();
      return;
    }

    // Apply Alchemist passive: enable suit change
    if (this.selectedClasses[0].name === 'Alchemist' && !this.abilityUsed.passive) {
      this._enableAlchemistPassive();
      return;
    }

    // Apply Sorcerer passive: show peek button on next reveal
    if (this.selectedClasses[0].name === 'Sorcerer' && !this.abilityUsed.passive) {
      this._showMsg('Foresight: tap any card before reveal to peek!', 2000);
    }

    this._startBettingRound('preflop');
  }

  _startBettingRound(phase) {
    const startIdx = phase === 'preflop'
      ? this.game.nextActiveIndex(this.game.bigBlindIndex)
      : this.game.nextActiveIndex(this.game.dealerIndex);

    this.round = new BettingRound(this.game, phase, startIdx, {
      bigBlind: this.game.bigBlind,
      noRaise: this.nobleDecreeActive || false,
      marked: this.markedTarget >= 0 ? [this.markedTarget] : [],
    });
    this.bState = this.round;          // alias so ability code can read currentBet/noRaise/etc.

    this._refreshChips();              // show this street's bets (blinds preflop) + accumulated pot
    this._updatePlayerPanels();
    this._advanceBetting();
  }

  _advanceBetting() {
    const idx = this.round.actor();
    if (idx < 0) { this._clearTurn(); this._onBettingRoundEnd(); return; }

    this.round.currentIdx = idx;        // point the highlight at the actor
    this._updatePlayerPanels();

    const p = this.game.players[idx];
    if (p.isHuman) {
      this._promptHumanAction();
      this._startTurn(idx, TURN_TIME);
    } else {
      // Bots "think" for a short randomized time; they act when it elapses.
      const think = BOT_THINK_MIN + Math.random() * (BOT_THINK_MAX - BOT_THINK_MIN);
      this._startTurn(idx, think);
    }
  }

  // ── Turn timer ──────────────────────────────────────────────────────────────

  _startTurn(idx, limit) {
    this._clearTurnTimeout();
    this.turn = { idx, start: performance.now(), limit };
    this._turnTimeout = setTimeout(() => this._onTurnExpire(idx), limit * 1000);
  }

  _onTurnExpire(idx) {
    if (!this.turn || this.turn.idx !== idx || !this.round || this.round.complete) return;
    this.turn = null;
    if (this.game.players[idx].isHuman) {
      const legal = this.round.legalActions(0);
      this._setActionButtons(false);
      this._hideRaisePanel();
      this._showMsg(legal.canCheck ? "Time's up — auto-check." : "Time's up — auto-fold.", 1500);
      this._applyAction(0, legal.canCheck ? 'check' : 'fold');
    } else {
      this._doBotAction(idx);
    }
  }

  _clearTurnTimeout() {
    if (this._turnTimeout) { clearTimeout(this._turnTimeout); this._turnTimeout = null; }
  }

  _clearTurn() {
    this._clearTurnTimeout();
    this.turn = null;
    // Reset every panel's timer bar.
    for (let i = 0; i < 4; i++) {
      const fill = document.querySelector(`#player-panel-${i} .p-timer > i`);
      if (fill) fill.style.width = '0%';
    }
  }

  _promptHumanAction() {
    const legal = this.round.legalActions(0);
    document.getElementById('btn-check').innerHTML =
      (legal.canCheck ? 'CHECK' : `CALL ${legal.toCall}`) + ' <kbd>Spc</kbd>';
    this._setActionButtons(true);
    document.getElementById('btn-raise').disabled = !legal.canRaise;
    this._updateAbilityButton();
    this._showMsg('Your turn!', 0);
  }

  _humanAction(action) {
    this._setActionButtons(false);
    this._hideMsg();
    this._applyAction(0, action, 0);
  }

  // The single CHECK/CALL button: check when nothing is owed, otherwise call.
  _humanCheckCall() {
    const legal = this.round.legalActions(0);
    this._humanAction(legal.canCheck ? 'check' : 'call');
  }

  _doBotAction(idx) {
    const p = this.game.players[idx];
    const legal = this.round.legalActions(idx);
    const { action, raiseAmount } = botDecide(p, this.game.communityCards, {
      currentBet: this.round.currentBet,
      roundBets: this.round.roundBets,
      pot: this.game.pot,
      noRaise: !legal.canRaise,
    }, this.game.bigBlind);

    let act = action, amount = 0;
    if (act === 'raise' && !legal.canRaise) act = legal.canCheck ? 'check' : 'call';
    if (act === 'check' && !legal.canCheck) act = 'call';
    if (act === 'call' && !legal.canCall) act = 'check';
    if (act === 'raise') {
      amount = Math.max(legal.minRaiseCommit, Math.min(raiseAmount || legal.minRaiseCommit, legal.allInCommit));
    }
    this._applyAction(idx, act, amount);
  }

  // Snap a raise's total commitment to the chip grid so it's always makeable with
  // real chips. All-in commits the exact (already chip-aligned) stack untouched.
  _snapRaise(idx, amount) {
    const legal = this.round.legalActions(idx);
    if (amount >= legal.allInCommit) return legal.allInCommit;
    const snapped = Math.round(amount / CHIP_UNIT) * CHIP_UNIT;
    return Math.max(legal.minRaiseCommit, Math.min(snapped, legal.allInCommit));
  }

  _applyAction(idx, action, amount) {
    this._clearTurnTimeout();           // an action was taken; stop this turn's clock
    this.turn = null;
    if (action === 'raise' || action === 'bet') amount = this._snapRaise(idx, amount);
    const p = this.game.players[idx];
    const res = this.round.apply(idx, action, amount);
    let msg = '';

    if (action === 'fold') {
      // Throw any committed chips (e.g. a blind folding preflop) into the pot.
      if (this.round.roundBets[idx] > 0) {
        this.chipsView?.collectSeatToPot(idx);
        this.characters[idx]?.playGesture?.('toss');   // planned: character flicks the chips in
      }
      this.characters[idx]?.setFolded(true);
      for (const c of this.holeCard3Ds[idx]) c?.setFaceDown();
      msg = `${p.name} folds.`;
    } else if (action === 'check') {
      msg = `${p.name} checks.`;
    } else if (res.kind === 'raise') {
      msg = `${p.name} raises to ${res.currentBet}.`;
    } else {
      msg = `${p.name} calls ${res.committed}.`;
    }

    this._updatePot();
    this._updatePlayerPanels();
    this._refreshChips();             // stack shrinks, bet pile grows in front of the actor
    if (msg) this._showMsg(msg, 1800);

    setTimeout(() => this._advanceBetting(), 600);
  }

  _onBettingRoundEnd() {
    const { phase } = this.bState;
    const alive = this.game.inHandPlayers;

    // Slide each player's bet physically into the pot, THEN advance — so the pot is
    // settled before a showdown awards it.
    const proceed = () => {
      if (alive.length <= 1) { this._endRound(); return; }
      this.nobleDecreeActive = false;
      this.knightCharge = false;
      this.markedTarget = -1;          // Assassin's mark only lasts the round
      if (phase === 'preflop') setTimeout(() => this._dealFlop(), 1000);
      else if (phase === 'flop') setTimeout(() => this._dealTurn(), 1000);
      else if (phase === 'turn') setTimeout(() => this._dealRiver(), 1000);
      else if (phase === 'river') setTimeout(() => this._showdown(), 1000);
    };

    if (this.chipsView) this.chipsView.collectBetsToPot(proceed);
    else proceed();
  }

  _dealFlop() {
    // Sorcerer passive: peek at next card
    if (this.selectedClasses[0].name === 'Sorcerer' && !this.abilityUsed.passive) {
      this._doSorcererPeek('flop');
      return;
    }
    this.game.dealFlop();
    let done = 0;
    for (let i = 0; i < 3; i++) {
      const card = new Card3D(this.scene, this.game.communityCards[i], true);
      card.setPosition(CARD_DECK_POS.x, CARD_DECK_POS.y, CARD_DECK_POS.z);
      const dest = COMMUNITY_POSITIONS[i].clone();
      card.moveTo(this.tweener, dest, i * 200, 0.45, () => {
        card.reveal(this.tweener, null);
        done++;
        if (done === 3) this._startBettingRound('flop');
      });
      this.communityCard3Ds.push(card);
    }
    this._updatePot();
  }

  _dealTurn() {
    if (this.selectedClasses[0].name === 'Sorcerer' && !this.abilityUsed.passive) {
      this._doSorcererPeek('turn');
      return;
    }
    this.game.dealTurn();
    const i = this.game.communityCards.length - 1;
    const card = new Card3D(this.scene, this.game.communityCards[i], true);
    card.setPosition(CARD_DECK_POS.x, CARD_DECK_POS.y, CARD_DECK_POS.z);
    card.moveTo(this.tweener, COMMUNITY_POSITIONS[i].clone(), 0, 0.45, () => {
      card.reveal(this.tweener, () => this._startBettingRound('turn'));
    });
    this.communityCard3Ds.push(card);
    this._updatePot();
  }

  _dealRiver() {
    if (this.selectedClasses[0].name === 'Sorcerer' && !this.abilityUsed.passive) {
      this._doSorcererPeek('river');
      return;
    }
    this.game.dealRiver();
    const i = this.game.communityCards.length - 1;
    const card = new Card3D(this.scene, this.game.communityCards[i], true);
    card.setPosition(CARD_DECK_POS.x, CARD_DECK_POS.y, CARD_DECK_POS.z);
    card.moveTo(this.tweener, COMMUNITY_POSITIONS[i].clone(), 0, 0.45, () => {
      card.reveal(this.tweener, () => this._startBettingRound('river'));
    });
    this.communityCard3Ds.push(card);
    this._updatePot();
  }

  _showdown() {
    // Reveal all hole cards
    for (let i = 0; i < 4; i++) {
      const p = this.game.players[i];
      if (!p.active || p.folded) continue;
      for (const c of this.holeCard3Ds[i]) c?.reveal(this.tweener, null);
    }

    // Correct side-pot settlement (handles all-ins).
    const result = settlePots(this.game, this.game.communityCards);

    // How much the human won this hand (for class bonuses).
    let humanWon = 0;
    for (const pot of result.pots) {
      if (pot.winners.includes(0)) humanWon += Math.floor(pot.amount / pot.winners.length);
    }
    const cls = this.selectedClasses[0].name;
    const human = this.game.players[0];
    if (humanWon > 0 && cls === 'Noble') {
      const bonus = Math.round(humanWon * 0.15 / CHIP_UNIT) * CHIP_UNIT;  // keep chip-aligned
      human.chips += bonus;
      this._showMsg(`Tax Collection! +${bonus} bonus chips! 👑`, 2500);
    }
    if (humanWon > 0 && cls === 'Assassin' && this.assassinBonus) {
      human.chips += Math.round(humanWon * 0.25 / CHIP_UNIT) * CHIP_UNIT;
    }

    const winNames = result.summary || 'No one';
    this._showMsg(`🏆 ${winNames} wins!`, 0);
    this._updatePlayerPanels();
    this._updatePot();

    // Slide the physical pot to the biggest winner, then rebuild stacks with the
    // new totals. (Split/side pots animate to one seat; the chip counts stay correct.)
    const tally = {};
    for (const pot of result.pots) {
      for (const w of pot.winners) tally[w] = (tally[w] || 0) + pot.amount / pot.winners.length;
    }
    let winnerSeat = this.game.inHandPlayers[0]?.index ?? 0, best = -1;
    for (const k of Object.keys(tally)) { if (tally[k] > best) { best = tally[k]; winnerSeat = +k; } }
    this.round = null;                 // hand over → stacks rebuild from new totals
    if (this.chipsView) this.chipsView.awardPot(winnerSeat, () => this._refreshChips());
    else this._refreshChips();

    setTimeout(() => {
      if (this.game.isGameOver()) {
        const survivor = this.game.activePlayers[0];
        this._showMsg(`Game Over! ${survivor ? survivor.name : 'No one'} wins the game!`, 0);
        document.getElementById('btn-next-round').style.display = 'none';
        document.getElementById('btn-menu').style.display = 'block';
      } else {
        this._showMsg(`${winNames} wins! Next round?`, 0);
        document.getElementById('btn-next-round').style.display = 'block';
      }
    }, 3200);
  }

  _endRound() {
    const alive = this.game.inHandPlayers;
    if (alive.length === 1) {
      // Assassin blade in the dark
      if (alive[0].index === 0 && this.selectedClasses[0].name === 'Assassin') {
        this.assassinBonus = true;
      }
    }
    this._showdown();
  }

  nextRound() {
    document.getElementById('btn-next-round').style.display = 'none';
    this._hideMsg();
    for (let i = 0; i < 4; i++) this.characters[i]?.setFolded(false);
    this._startRound();
  }

  // ── Abilities ───────────────────────────────────────────────────────────────

  _useAbility() {
    if (this.abilityUsed.ultimate) return;
    this._clearTurnTimeout();    // using your ultimate pauses the auto-fold clock
    this.turn = null;
    const cls = this.selectedClasses[0];
    switch (cls.name) {
      case 'Jester':    this._doJesterUltimate(); break;
      case 'Noble':     this._doNobleUltimate(); break;
      case 'Sorcerer':  this._doSorcererUltimate(); break;
      case 'Assassin':  this._doAssassinUltimate(); break;
      case 'Knight':    this._doKnightUltimate(); break;
      case 'Summoner':  this._doSummonerUltimate(); break;
      case 'Ranger':    this._doRangerUltimate(); break;
      case 'Alchemist': this._doAlchemistUltimate(); break;
    }
  }

  // ── JESTER ──────────────────────────────────────────────────────────────────

  _enableJesterPassive() {
    this._showMsg('Sleight of Hand: Click a hole card to swap it with the top of the deck!', 0);
    const handler = (event) => {
      const hit = this._raycastCards(event, this.holeCard3Ds[0]);
      if (!hit) return;
      const idx = this.holeCard3Ds[0].indexOf(hit);
      if (idx < 0) return;
      globalThis.removeEventListener('click', handler);
      this._hideMsg();
      this.abilityUsed.passive = true;

      // Swap with top of deck
      const newCard = this.game.deck.deal();
      if (!newCard) { this._startBettingRound('preflop'); return; }
      this.game.players[0].holeCards[idx] = newCard;
      hit.destroy();
      this.holeCard3Ds[0][idx] = new Card3D(this.scene, newCard, false);
      this._layoutHeldHand();
      this._showMsg('Card swapped!', 1800);
      setTimeout(() => this._startBettingRound('preflop'), 2000);
    };
    globalThis.addEventListener('click', handler);
  }

  _doJesterUltimate() {
    // Force each opponent to discard worst hole card and draw fresh
    for (let i = 1; i < 4; i++) {
      const p = this.game.players[i];
      if (!p.active || p.folded) continue;
      // Knight is immune
      if (this.selectedClasses[i].name === 'Knight') continue;
      // Find worst card (lower value)
      const worstIdx = p.holeCards[0].value <= p.holeCards[1].value ? 0 : 1;
      const newCard = this.game.deck.deal();
      if (!newCard) continue;
      p.holeCards[worstIdx] = newCard;
      // Update 3D card (stays face-down for bots)
      const pos = holePos(i, worstIdx);
      this.holeCard3Ds[i][worstIdx]?.destroy();
      const c3d = new Card3D(this.scene, newCard, true);
      c3d.setPosition(pos.x, pos.y, pos.z);
      this.holeCard3Ds[i][worstIdx] = c3d;
    }
    this.abilityUsed.ultimate = true;
    this._showMsg('Grand Illusion! All opponents redraw their worst card! 🃏', 2500);
    this._updateAbilityButton();
  }

  // ── NOBLE ────────────────────────────────────────────────────────────────────

  _doNobleUltimate() {
    this.nobleDecreeActive = true;
    if (this.bState) this.bState.noRaise = true;
    this.abilityUsed.ultimate = true;
    this._showMsg('Royal Decree! No raises this round! 👑', 2500);
    this._updateAbilityButton();
    this._hideRaisePanel();
  }

  // ── SORCERER ─────────────────────────────────────────────────────────────────

  _doSorcererPeek(nextPhase) {
    const peeked = this.game.deck.peek();
    if (!peeked) { this._doContinueAfterPeek(nextPhase); return; }
    this.abilityUsed.passive = true;

    // Show a brief overlay with the next card
    const canvas = document.createElement('canvas');
    canvas.width = 120; canvas.height = 170; canvas.style.cssText =
      'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:999;border:3px solid gold;border-radius:8px';
    document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,120,170);
    const isRed = peeked.suit === '♥' || peeked.suit === '♦';
    ctx.fillStyle = isRed ? '#cc0000' : '#111';
    ctx.font = 'bold 20px Georgia'; ctx.fillText(peeked.rank, 6, 22);
    ctx.font = '56px Georgia'; ctx.textAlign='center'; ctx.fillText(peeked.suit, 60, 110);
    ctx.font = '14px Georgia'; ctx.fillStyle='#555'; ctx.fillText('Next card', 60, 158);

    this._showMsg('Foresight: Next card revealed! 🔮', 0);
    setTimeout(() => {
      canvas.remove();
      this._hideMsg();
      this._doContinueAfterPeek(nextPhase);
    }, 2800);
  }

  _doContinueAfterPeek(phase) {
    if (phase === 'flop') { this.game.dealFlop(); this._animateCommunityCards(0, 3, 'flop'); }
    else if (phase === 'turn') { this.game.dealTurn(); this._animateCommunityCards(3, 1, 'turn'); }
    else if (phase === 'river') { this.game.dealRiver(); this._animateCommunityCards(4, 1, 'river'); }
  }

  _animateCommunityCards(startIdx, count, nextPhase) {
    let done = 0;
    for (let i = 0; i < count; i++) {
      const ci = startIdx + i;
      const card = new Card3D(this.scene, this.game.communityCards[ci], true);
      card.setPosition(CARD_DECK_POS.x, CARD_DECK_POS.y, CARD_DECK_POS.z);
      card.moveTo(this.tweener, COMMUNITY_POSITIONS[ci].clone(), i * 200, 0.45, () => {
        card.reveal(this.tweener, null);
        done++;
        if (done === count) this._startBettingRound(nextPhase);
      });
      this.communityCard3Ds[ci] = card;
    }
    this._updatePot();
  }

  _doSorcererUltimate() {
    if (!this.bState || this.game.communityCards.length === 0) {
      this._showMsg('No community cards to swap yet!', 2000); return;
    }
    this._showMsg('Arcane Swap: Click a community card to swap with your hole card! 🔮', 0);
    const commHandler = (event) => {
      const commMeshes = this.communityCard3Ds.filter(Boolean).map(c => c.mesh);
      const hitComm = this._raycastMeshes(event, commMeshes);
      if (!hitComm) return;
      const ci = this.communityCard3Ds.findIndex(c => c?.mesh === hitComm);
      if (ci < 0) return;
      globalThis.removeEventListener('click', commHandler);

      this._showMsg('Now click one of YOUR hole cards!', 0);
      const holeHandler = (event2) => {
        const holeMeshes = this.holeCard3Ds[0].filter(Boolean).map(c => c.mesh);
        const hitHole = this._raycastMeshes(event2, holeMeshes);
        if (!hitHole) return;
        const hi = this.holeCard3Ds[0].findIndex(c => c?.mesh === hitHole);
        if (hi < 0) return;
        globalThis.removeEventListener('click', holeHandler);

        // Perform the swap
        const tmp = this.game.players[0].holeCards[hi];
        this.game.players[0].holeCards[hi] = this.game.communityCards[ci];
        this.game.communityCards[ci] = tmp;

        // Rebuild 3D cards: hole card returns to the held fan, board card to felt
        this.holeCard3Ds[0][hi]?.destroy();
        this.holeCard3Ds[0][hi] = new Card3D(this.scene, this.game.players[0].holeCards[hi], false);
        this._layoutHeldHand();

        this.communityCard3Ds[ci]?.destroy();
        const cCard = new Card3D(this.scene, this.game.communityCards[ci], false);
        cCard.setPosition(COMMUNITY_POSITIONS[ci].x, COMMUNITY_POSITIONS[ci].y, COMMUNITY_POSITIONS[ci].z);
        this.communityCard3Ds[ci] = cCard;

        this.abilityUsed.ultimate = true;
        this._hideMsg();
        this._showMsg('Arcane Swap complete!', 2000);
        this._updateAbilityButton();
      };
      globalThis.addEventListener('click', holeHandler);
    };
    globalThis.addEventListener('click', commHandler);
  }

  // ── ASSASSIN ────────────────────────────────────────────────────────────────

  _doAssassinUltimate() {
    // Find chip leader among opponents
    let leader = null, maxChips = -1;
    for (let i = 1; i < 4; i++) {
      const p = this.game.players[i];
      if (p.active && !p.folded && p.chips > maxChips) { maxChips = p.chips; leader = p; }
    }
    if (!leader) { this._showMsg('No valid target!', 2000); return; }
    this.markedTarget = leader.index;
    if (this.round) this.round.marked.add(leader.index);   // they may no longer raise
    this.abilityUsed.ultimate = true;
    this._showMsg(`Mark Target! ${leader.name} cannot raise this round! 🗡️`, 2500);
    this._updateAbilityButton();
  }

  // ── KNIGHT ──────────────────────────────────────────────────────────────────

  _doKnightUltimate() {
    // Only usable on the human's own betting turn.
    if (!this.round || this.round.actor() !== 0) {
      this._showMsg('Charge can only be used on your betting turn!', 2000); return;
    }
    const minBet = Math.max(this.game.bigBlind * 2, this.game.pot * 2);
    const commit = Math.max(0, minBet - (this.round.roundBets[0] || 0));
    this._setActionButtons(false);
    this.round.apply(0, 'raise', commit);
    this.knightCharge = true;
    this.abilityUsed.ultimate = true;
    this._updatePot();
    this._updatePlayerPanels();
    this._showMsg(`Charge! Bet forced up to ${this.round.currentBet}! ⚔️`, 2000);
    this._updateAbilityButton();
    setTimeout(() => this._advanceBetting(), 2200);
  }

  // ── SUMMONER ────────────────────────────────────────────────────────────────

  _doSummonerUltimate() {
    const wildCard = { rank: '★', suit: '★', value: 14, wild: true };
    this.game.communityCards.push(wildCard);
    const ci = this.game.communityCards.length - 1;
    const card = new Card3D(this.scene, wildCard, false);
    const destIdx = Math.min(ci, 4);
    const dest = COMMUNITY_POSITIONS[destIdx].clone();
    card.setPosition(0, CARD_Y + 1.6, 0);
    card.moveTo(this.tweener, dest, 0, 0.6, null);
    this.communityCard3Ds[ci] = card;
    this.abilityUsed.ultimate = true;
    this._showMsg('Summon Elemental! Wild card added to the board! ✨', 2500);
    this._updateAbilityButton();
  }

  // ── RANGER ──────────────────────────────────────────────────────────────────

  _doRangerPeek() {
    // Peek at first community card to be dealt (simulate)
    const futureDeck = this.game.deck;
    futureDeck.deal(); // burn card (discarded intentionally for peek preview)
    const peeked = futureDeck.peek();
    // Put burn card back somehow — we can't easily do that, so just re-use deck.peek() pattern
    // Actually PokerGame.js doesn't have undealing, so just show what deck.peek() currently is
    this.abilityUsed.passive = true;
    if (peeked) {
      const canvas = document.createElement('canvas');
      canvas.width = 120; canvas.height = 170; canvas.style.cssText =
        'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);z-index:999;border:3px solid gold;border-radius:8px';
      document.body.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0,0,120,170);
      const isRed = peeked.suit === '♥' || peeked.suit === '♦';
      ctx.fillStyle = isRed ? '#cc0000' : '#111';
      ctx.font = 'bold 20px Georgia'; ctx.fillText(peeked.rank, 6, 22);
      ctx.font = '56px Georgia'; ctx.textAlign='center'; ctx.fillText(peeked.suit, 60, 110);
      ctx.font = '14px Georgia'; ctx.fillStyle='#555'; ctx.fillText('Flop card!', 60, 158);
      this._showMsg('Tracker: Sneak peek at an upcoming card! 🏹', 0);
      setTimeout(() => {
        canvas.remove();
        this._hideMsg();
        this._startBettingRound('preflop');
      }, 2800);
    } else {
      this._startBettingRound('preflop');
    }
  }

  _doRangerUltimate() {
    if (this.game.communityCards.length === 0) {
      this._showMsg("No community cards yet!", 2000); return;
    }
    this._showMsg("Hunter's Mark: Click a community card to replace it! 🏹", 0);
    const handler = (event) => {
      const meshes = this.communityCard3Ds.filter(Boolean).map(c => c.mesh);
      const hit = this._raycastMeshes(event, meshes);
      if (!hit) return;
      const ci = this.communityCard3Ds.findIndex(c => c?.mesh === hit);
      if (ci < 0) return;
      globalThis.removeEventListener('click', handler);

      const newCard = this.game.deck.deal();
      if (!newCard) { this._showMsg('Deck empty!', 2000); return; }
      this.game.communityCards[ci] = newCard;
      this.communityCard3Ds[ci]?.destroy();
      const card = new Card3D(this.scene, newCard, false);
      card.setPosition(COMMUNITY_POSITIONS[ci].x, COMMUNITY_POSITIONS[ci].y, COMMUNITY_POSITIONS[ci].z);
      this.communityCard3Ds[ci] = card;
      this.abilityUsed.ultimate = true;
      this._hideMsg();
      this._showMsg("Hunter's Mark: Card replaced!", 2000);
      this._updateAbilityButton();
    };
    globalThis.addEventListener('click', handler);
  }

  // ── ALCHEMIST ────────────────────────────────────────────────────────────────

  _enableAlchemistPassive() {
    if (this.alchemistStoneUsed) { this._startBettingRound('preflop'); return; }
    this._showMsg("Philosopher's Stone: Click a hole card to change its suit!", 0);
    const handler = (event) => {
      const meshes = this.holeCard3Ds[0].filter(Boolean).map(c => c.mesh);
      const hit = this._raycastMeshes(event, meshes);
      if (!hit) return;
      const hi = this.holeCard3Ds[0].findIndex(c => c?.mesh === hit);
      if (hi < 0) return;
      globalThis.removeEventListener('click', handler);
      this._doAlchemistStone(hi);
    };
    globalThis.addEventListener('click', handler);
  }

  _doAlchemistStone(hi) {
    const suits = ['♠','♥','♦','♣'];
    const card = this.game.players[0].holeCards[hi];
    const currentSuit = card.suit;
    const nextSuit = suits[(suits.indexOf(currentSuit) + 1) % 4];
    card.suit = nextSuit;
    // Rebuild the 3D card back into the held fan
    this.holeCard3Ds[0][hi]?.destroy();
    this.holeCard3Ds[0][hi] = new Card3D(this.scene, card, false);
    this._layoutHeldHand();
    this.alchemistStoneUsed = true;
    this.abilityUsed.passive = true;
    this._hideMsg();
    this._showMsg(`Suit changed to ${nextSuit}! ⚗️`, 2000);
    setTimeout(() => this._startBettingRound('preflop'), 2200);
  }

  _doAlchemistUltimate() {
    if (this.game.communityCards.length === 0) {
      this._showMsg("No community cards to transmute!", 2000); return;
    }
    this._showMsg("Grand Transmutation: Click a community card to shift its value! ⚗️", 0);
    const handler = (event) => {
      const meshes = this.communityCard3Ds.filter(Boolean).map(c => c.mesh);
      const hit = this._raycastMeshes(event, meshes);
      if (!hit) return;
      const ci = this.communityCard3Ds.findIndex(c => c?.mesh === hit);
      if (ci < 0) return;
      globalThis.removeEventListener('click', handler);

      const card = this.game.communityCards[ci];
      // Shift value up by 1 (wraps Ace)
      const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
      const ri = RANKS.indexOf(card.rank);
      if (ri < 0) { this._showMsg('Cannot transmute this card!', 2000); return; }
      card.rank = RANKS[(ri + 1) % RANKS.length];
      card.value = (ri + 1) % 13 + 2;

      // Rebuild 3D card
      this.communityCard3Ds[ci]?.destroy();
      const c3d = new Card3D(this.scene, card, false);
      c3d.setPosition(COMMUNITY_POSITIONS[ci].x, COMMUNITY_POSITIONS[ci].y, COMMUNITY_POSITIONS[ci].z);
      this.communityCard3Ds[ci] = c3d;
      this.abilityUsed.ultimate = true;
      this._hideMsg();
      this._showMsg(`Transmuted to ${card.rank}${card.suit}! ⚗️`, 2000);
      this._updateAbilityButton();
    };
    globalThis.addEventListener('click', handler);
  }

  // ── Raycasting helpers ──────────────────────────────────────────────────────

  _getMouseNDC(event) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
  }

  _raycastMeshes(event, meshes) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(this._getMouseNDC(event), this.camera);
    const hits = raycaster.intersectObjects(meshes, false);
    return hits.length > 0 ? hits[0].object : null;
  }

  _raycastCards(event, card3Ds) {
    const meshes = card3Ds.filter(Boolean).map(c => c.mesh);
    const hit = this._raycastMeshes(event, meshes);
    if (!hit) return null;
    return card3Ds.find(c => c?.mesh === hit) || null;
  }

  // ── Animation loop ──────────────────────────────────────────────────────────

  update(deltaMs, time) {
    this.tweener.update(deltaMs);
    this.chipPhysics?.step();
    if (this.lights) animateLights(this.lights, time);

    // Billboard characters toward camera
    for (const char of this.characters) {
      char?.update(this.camera);
    }

    // Active player glow
    if (this.bState && this.game) {
      for (let i = 0; i < 4; i++) {
        this.characters[i]?.setActive(this.bState.currentIdx === i);
      }
    }

    // Turn-timer bar on the active player's panel
    if (this.turn) {
      const rem = Math.max(0, this.turn.limit - (performance.now() - this.turn.start) / 1000);
      const frac = this.turn.limit > 0 ? rem / this.turn.limit : 0;
      const fill = document.querySelector(`#player-panel-${this.turn.idx} .p-timer > i`);
      if (fill) {
        fill.style.width = (frac * 100).toFixed(1) + '%';
        fill.classList.toggle('low', frac < 0.33);
      }
    }
  }
}
