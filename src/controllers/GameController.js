import * as THREE from 'three';
import { PokerGame } from '../game/PokerGame.js';
import { botDecide } from '../game/BotPlayer.js';
import { Card3D, CARD_DECK_POS } from '../objects/Card3D.js';
import { Character3D } from '../objects/Character3D.js';
import { setupLighting, animateLights } from '../room/Lighting.js';
import { createTable, FELT_TOP_Y } from '../room/Table.js';
import { buildEnvironment } from '../room/Environment.js';
import { Tweener } from '../utils/Tweener.js';

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
  [new THREE.Vector3(-0.45, CARD_Y, 2.15),  new THREE.Vector3(0.45, CARD_Y, 2.15)],   // south
  [new THREE.Vector3(-2.15, CARD_Y, -0.45), new THREE.Vector3(-2.15, CARD_Y, 0.45)],  // west
  [new THREE.Vector3(-0.45, CARD_Y, -2.15), new THREE.Vector3(0.45, CARD_Y, -2.15)],  // north
  [new THREE.Vector3(2.15, CARD_Y, -0.45),  new THREE.Vector3(2.15, CARD_Y, 0.45)],   // east
];

const COMMUNITY_POSITIONS = [
  new THREE.Vector3(-1.32, CARD_Y, -0.15),
  new THREE.Vector3(-0.66, CARD_Y, -0.15),
  new THREE.Vector3(0, CARD_Y, -0.15),
  new THREE.Vector3(0.66, CARD_Y, -0.15),
  new THREE.Vector3(1.32, CARD_Y, -0.15),
];

// Where each player's hole card lands on the felt.
function holePos(player, cardIndex) {
  return HOLE_POSITIONS[player][cardIndex].clone();
}

const BOT_DELAY = 900;

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
    createTable(this.scene);
    buildEnvironment(this.scene);
  }

  // ── UI helpers ─────────────────────────────────────────────────────────────

  _buildUI() {
    // Nothing to build here — all HTML is pre-existing in index.html.
    // Wire up action buttons.
    const $ = id => document.getElementById(id);
    $('btn-fold').addEventListener('click', () => this._humanAction('fold'));
    $('btn-check').addEventListener('click', () => this._humanAction('check'));
    $('btn-raise').addEventListener('click', () => this._showRaisePanel());
    $('btn-ability').addEventListener('click', () => this._useAbility());

    $('btn-min').addEventListener('click', () => this._humanRaise('min'));
    $('btn-pot').addEventListener('click', () => this._humanRaise('pot'));
    $('btn-2pot').addEventListener('click', () => this._humanRaise('2pot'));
    $('btn-allin').addEventListener('click', () => this._humanRaise('allin'));
    $('btn-cancel-raise').addEventListener('click', () => this._hideRaisePanel());
  }

  _showPanel(id) { document.getElementById(id).style.display = 'flex'; }
  _hidePanel(id) { document.getElementById(id).style.display = 'none'; }
  _showRaisePanel() { this._showPanel('raise-panel'); }
  _hideRaisePanel() { this._hidePanel('raise-panel'); }

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
    btn.textContent = `${cls.emoji} ${cls.ultimate.name}`;
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
    const blinds = this.game.postBlinds();
    this._updatePot();
    this._updatePlayerPanels();
    this._showMsg(`Blinds posted — SB: ${blinds.sbAmt}, BB: ${blinds.bbAmt}`, 2000);

    // Deal hole cards after short delay
    setTimeout(() => this._dealHoleCards(), 2200);
  }

  _dealHoleCards() {
    this.game.dealHoleCards();
    let animCount = 0;
    const total = this.game.activePlayers.length * 2;
    const onDone = () => { animCount++; if (animCount === total) this._onHoleCardsDealt(); };

    for (let i = 0; i < 4; i++) {
      const p = this.game.players[i];
      if (!p.active) continue;
      for (let j = 0; j < 2; j++) {
        const isHuman = i === 0;
        const card = new Card3D(this.scene, p.holeCards[j], !isHuman);
        card.setPosition(CARD_DECK_POS.x, CARD_DECK_POS.y, CARD_DECK_POS.z);
        const dest = holePos(i, j);
        card.moveTo(this.tweener, dest, (i * 2 + j) * 150, 0.4, onDone);
        this.holeCard3Ds[i].push(card);
      }
    }
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
    this.game.currentBet = phase === 'preflop' ? this.game.bigBlind : 0;
    const startIdx = phase === 'preflop'
      ? this.game.nextActiveIndex(this.game.bigBlindIndex)
      : this.game.nextActiveIndex(this.game.dealerIndex);

    this.bState = {
      phase,
      currentBet: this.game.currentBet,
      roundBets: this.game.players.map(p => phase === 'preflop' && !p.folded && p.active
        ? (p.index === this.game.smallBlindIndex ? this.game.smallBlind : p.index === this.game.bigBlindIndex ? this.game.bigBlind : 0)
        : 0),
      actedThisRound: new Set(),
      lastAggressorIdx: phase === 'preflop' ? this.game.bigBlindIndex : -1,
      currentIdx: startIdx,
      noRaise: this.nobleDecreeActive || false,
    };

    this._updatePlayerPanels();
    this._advanceBetting();
  }

  _advanceBetting() {
    const alive = this.game.inHandPlayers;
    if (alive.length <= 1) { this._endRound(); return; }

    // Check if betting is over
    const allActed = alive.every(p => {
      if (p.allIn) return true;
      if (!this.bState.actedThisRound.has(p.index)) return false;
      return (this.bState.roundBets[p.index] || 0) >= this.bState.currentBet;
    });

    if (allActed && this.bState.actedThisRound.size >= alive.filter(p => !p.allIn).length) {
      this._onBettingRoundEnd(); return;
    }

    // Find next player who needs to act
    let idx = this.bState.currentIdx;
    for (let i = 0; i < 4; i++) {
      const p = this.game.players[idx];
      if (p.active && !p.folded && !p.allIn) {
        const alreadyMatched = (this.bState.roundBets[idx] || 0) >= this.bState.currentBet;
        if (!alreadyMatched || !this.bState.actedThisRound.has(idx)) {
          break;
        }
      }
      idx = (idx + 1) % 4;
    }

    this.bState.currentIdx = idx;
    this._updatePlayerPanels();

    const p = this.game.players[idx];
    if (!p.active || p.folded || p.allIn) {
      this.bState.currentIdx = (idx + 1) % 4;
      this._advanceBetting(); return;
    }

    if (p.isHuman) {
      this._promptHumanAction();
    } else {
      setTimeout(() => this._doBotAction(idx), BOT_DELAY);
    }
  }

  _promptHumanAction() {
    const toCall = this.bState.currentBet - (this.bState.roundBets[0] || 0);
    const canCheck = toCall === 0;
    document.getElementById('btn-check').textContent = canCheck ? 'CHECK' : `CALL ${toCall}`;
    document.getElementById('btn-raise').disabled = this.bState.noRaise;
    this._setActionButtons(true);
    this._updateAbilityButton();
    this._showMsg('Your turn!', 0);
  }

  _humanAction(action) {
    this._setActionButtons(false);
    this._hideMsg();
    this._applyAction(0, action, 0);
  }

  _humanRaise(preset) {
    this._hideRaisePanel();
    const p = this.game.players[0];
    const toCall = this.bState.currentBet - (this.bState.roundBets[0] || 0);
    let amount;
    const pot = this.game.pot;
    const minRaise = this.game.bigBlind;
    switch (preset) {
      case 'min':  amount = toCall + Math.max(minRaise, this.bState.currentBet); break;
      case 'pot':  amount = toCall + pot; break;
      case '2pot': amount = toCall + pot * 2; break;
      case 'allin': amount = p.chips; break;
    }
    amount = Math.min(amount, p.chips);
    this._setActionButtons(false);
    this._hideMsg();
    this._applyAction(0, 'raise', amount);
  }

  _doBotAction(idx) {
    const p = this.game.players[idx];
    const bsCopy = { ...this.bState };

    // Assassin mark: chip leader can't raise
    if (this.markedTarget === idx) bsCopy.noRaise = true;

    const { action, raiseAmount } = botDecide(p, this.game.communityCards, {
      currentBet: bsCopy.currentBet,
      roundBets: bsCopy.roundBets,
      pot: this.game.pot,
      noRaise: bsCopy.noRaise,
    }, this.game.bigBlind);

    // If marked and would raise, downgrade to call
    const finalAction = (this.markedTarget === idx && action === 'raise') ? 'call' : action;
    const finalAmount = finalAction === 'raise' ? (raiseAmount || this.game.bigBlind) : 0;

    this._applyAction(idx, finalAction, finalAmount);
  }

  _applyAction(idx, action, raiseAmount) {
    const p = this.game.players[idx];
    const toCall = this.bState.currentBet - (this.bState.roundBets[idx] || 0);
    let msg = '';

    if (action === 'fold') {
      this.game.playerFold(idx);
      this.characters[idx]?.setFolded(true);
      // Fold hole cards face-down visually
      for (const c of this.holeCard3Ds[idx]) c?.setFaceDown();
      msg = `${p.name} folds.`;
    } else if (action === 'check') {
      msg = `${p.name} checks.`;
    } else if (action === 'call') {
      const called = this.game.playerBet(idx, toCall);
      this.bState.roundBets[idx] = (this.bState.roundBets[idx] || 0) + called;
      msg = `${p.name} calls ${called}.`;
      this._updatePot();
    } else if (action === 'raise') {
      const newTotal = this.bState.currentBet + raiseAmount;
      const more = newTotal - (this.bState.roundBets[idx] || 0);
      const actual = this.game.playerBet(idx, more);
      this.bState.roundBets[idx] = (this.bState.roundBets[idx] || 0) + actual;
      this.bState.currentBet = this.bState.roundBets[idx];
      this.bState.lastAggressorIdx = idx;
      // Others who already acted need to re-act
      this.bState.actedThisRound = new Set([idx]);
      msg = `${p.name} raises to ${this.bState.currentBet}.`;
      this._updatePot();
    }

    this.bState.actedThisRound.add(idx);
    this.bState.currentIdx = (idx + 1) % 4;
    this._updatePlayerPanels();
    if (msg) this._showMsg(msg, 1800);

    setTimeout(() => this._advanceBetting(), 600);
  }

  _onBettingRoundEnd() {
    const { phase } = this.bState;
    const alive = this.game.inHandPlayers;

    if (alive.length <= 1) { this._endRound(); return; }

    this.nobleDecreeActive = false;
    this.knightCharge = false;

    if (phase === 'preflop') {
      setTimeout(() => this._dealFlop(), 1000);
    } else if (phase === 'flop') {
      setTimeout(() => this._dealTurn(), 1000);
    } else if (phase === 'turn') {
      setTimeout(() => this._dealRiver(), 1000);
    } else if (phase === 'river') {
      setTimeout(() => this._showdown(), 1000);
    }
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

    const winners = this.game.determineWinners();
    let bonus = 1.0;

    // Noble passive
    if (winners.some(w => w.player.index === 0) && this.selectedClasses[0].name === 'Noble') {
      bonus = 1.15;
      this.game.pot = Math.floor(this.game.pot * bonus);
      this._showMsg(`Tax Collection! Pot boosted to ${this.game.pot}!`, 2500);
    }

    // Assassin passive: if you're last standing with no showdown
    if (this.selectedClasses[0].name === 'Assassin' && this.assassinBonus) {
      this.game.pot = Math.floor(this.game.pot * 1.25);
    }

    this.game.distributePot(winners);

    const winNames = winners.map(w => `${w.player.name} (${w.handName || 'wins'})`).join(', ');
    this._showMsg(`🏆 ${winNames} wins!`, 0);
    this._updatePlayerPanels();
    this._updatePot();

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
      const pos = holePos(0, idx);
      hit.destroy();
      const c3d = new Card3D(this.scene, newCard, false);
      c3d.setPosition(CARD_DECK_POS.x, CARD_DECK_POS.y, CARD_DECK_POS.z);
      c3d.moveTo(this.tweener, pos, 0, 0.4, null);
      this.holeCard3Ds[0][idx] = c3d;
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

        // Rebuild 3D cards
        const hPos = holePos(0, hi);
        this.holeCard3Ds[0][hi]?.destroy();
        const hCard = new Card3D(this.scene, this.game.players[0].holeCards[hi], false);
        hCard.setPosition(hPos.x, hPos.y, hPos.z);
        this.holeCard3Ds[0][hi] = hCard;

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
    if (this.bState) this.bState.noRaise = true; // immediate effect
    this.abilityUsed.ultimate = true;
    this._showMsg(`Mark Target! ${leader.name} cannot raise this round! 🗡️`, 2500);
    this._updateAbilityButton();
  }

  // ── KNIGHT ──────────────────────────────────────────────────────────────────

  _doKnightUltimate() {
    const minBet = Math.max(this.game.bigBlind * 2, this.game.pot * 2);
    // Force raise: others must match or fold
    if (!this.bState) return;
    this.knightCharge = true;
    const actual = this.game.playerBet(0, minBet - (this.bState.roundBets[0] || 0));
    this.bState.roundBets[0] = (this.bState.roundBets[0] || 0) + actual;
    this.bState.currentBet = this.bState.roundBets[0];
    this.bState.actedThisRound = new Set([0]);
    this.bState.lastAggressorIdx = 0;
    this.bState.currentIdx = 1;
    this.abilityUsed.ultimate = true;
    this._updatePot();
    this._showMsg(`Charge! Minimum bet is now ${minBet}! ⚔️`, 2000);
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
    // Rebuild the 3D card
    const pos = holePos(0, hi);
    this.holeCard3Ds[0][hi]?.destroy();
    const c3d = new Card3D(this.scene, card, false);
    c3d.setPosition(pos.x, pos.y, pos.z);
    this.holeCard3Ds[0][hi] = c3d;
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
  }
}
