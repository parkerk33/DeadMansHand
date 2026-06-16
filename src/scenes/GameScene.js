import Phaser from 'phaser';
import { PokerGame } from '../game/PokerGame.js';
import { botDecide } from '../game/BotPlayer.js';
import { evaluateBestHand, getHandName } from '../game/HandEvaluator.js';
import { CLASSES, CLASS_LIST } from '../classes/ClassDefinitions.js';
import { RANK_VALUES } from '../game/Deck.js';

// Layout constants
const W = 1280, H = 720;
const CARD_W = 68, CARD_H = 96;
const DECK_X = 900, DECK_Y = 220;

const SEAT = [
  { x: 640, y: 608 },   // 0 = human (bottom)
  { x: 148, y: 370 },   // 1 = bot left
  { x: 640, y: 112 },   // 2 = bot top
  { x: 1132, y: 370 },  // 3 = bot right
];

const HOLE_OFFSETS = [
  [{ x: -42, y: 12 }, { x: 42, y: 12 }],   // human — side by side below seat
  [{ x: -10, y: -38 }, { x: -10, y: 38 }], // left bot — vertical stack
  [{ x: -42, y: -12 }, { x: 42, y: -12 }], // top bot — side by side above
  [{ x: 10, y: -38 }, { x: 10, y: 38 }],   // right bot — vertical stack
];

const COMMUNITY_X = [402, 482, 562, 642, 722];
const COMMUNITY_Y = 340;

export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
    this.game2 = null;        // PokerGame instance (game2 to avoid shadowing Phaser.Scene.game)
    this.playerClass = null;
    this.uiState = 'idle';

    // Betting state
    this.bState = null;

    // Rendered objects
    this.seatUI = [];         // per-player UI elements
    this.holeSprites = [];    // [playerIdx][cardIdx] = CardContainer
    this.commSprites = [];    // [0..4] = CardContainer
    this.commPlaceholders = [];
    this.actionBtns = {};
    this.raisePanel = null;
    this.abilityBtn = null;
    this.msgText = null;
    this.potText = null;
    this.phaseText = null;
    this.abilityUsedThisRound = false;
    this.abilityPanel = null;

    // Passive state
    this.sorcererPeeked = false;
    this.rangerPeekedCard = null;
    this.alchemistStoneUsed = false;
    this.summonerBondActive = false;
    this.markedTarget = -1;    // Assassin ultimate target
    this.noRaiseActive = false; // Noble / Assassin mark decree
    this.chargeForced = false;  // Knight charge
  }

  create() {
    const className = this.registry.get('playerClass') || 'Knight';
    this.playerClass = CLASSES[className];

    const botClasses = CLASS_LIST.filter(c => c.name !== className);
    const picked = Phaser.Utils.Array.Shuffle([...botClasses]).slice(0, 3);

    this.game2 = new PokerGame([
      { name: 'You', isHuman: true, class: this.playerClass },
      { name: 'Aldric', isHuman: false, class: picked[0] },
      { name: 'Morwen', isHuman: false, class: picked[1] },
      { name: 'Sable', isHuman: false, class: picked[2] },
    ]);

    this._drawTable();
    this._createSeatUI();
    this._createCommunitySlots();
    this._createPotDisplay();
    this._createActionButtons();
    this._createAbilityButton();
    this._createMessageBox();
    this._createPhaseIndicator();

    this.cameras.main.fadeIn(500, 0, 0, 0);
    this.time.delayedCall(600, () => this._startRound());
  }

  // ─── TABLE GRAPHICS ───────────────────────────────────────────────────────

  _drawTable() {
    const g = this.add.graphics();

    // Background
    g.fillGradientStyle(0x080812, 0x080812, 0x0f0e22, 0x0f0e22, 1);
    g.fillRect(0, 0, W, H);

    // Table shadow
    g.fillStyle(0x000000, 0.5);
    g.fillEllipse(W / 2, H / 2 + 8, 940, 430);

    // Table felt
    g.fillStyle(0x0e4a1e);
    g.fillEllipse(W / 2, H / 2 - 10, 920, 410);

    // Felt highlight
    g.fillStyle(0x145c26, 0.5);
    g.fillEllipse(W / 2, H / 2 - 60, 780, 260);

    // Gold rail
    g.lineStyle(12, 0x8B6914, 1);
    g.strokeEllipse(W / 2, H / 2 - 10, 920, 410);
    g.lineStyle(3, 0xf0d080, 0.5);
    g.strokeEllipse(W / 2, H / 2 - 10, 930, 420);
    g.lineStyle(2, 0x4a3400, 1);
    g.strokeEllipse(W / 2, H / 2 - 10, 908, 398);

    // Center logo
    g.fillStyle(0x0c421a, 0.6);
    g.fillEllipse(W / 2, H / 2 - 10, 240, 110);
    g.lineStyle(1, 0x1e6e30, 0.5);
    g.strokeEllipse(W / 2, H / 2 - 10, 238, 108);

    this.add.text(W / 2, H / 2 - 28, '⚜', { fontSize: '28px', color: '#3a6e2a', alpha: 0.5 }).setOrigin(0.5);
    this.add.text(W / 2, H / 2 + 4, 'FANTASY POKER', {
      fontSize: '11px', color: '#2a5c20', fontFamily: 'Georgia, serif', fontStyle: 'bold', alpha: 0.4,
    }).setOrigin(0.5).setAlpha(0.4);

    // Decorative corner runes
    const runes = ['᚛', '᚜', '᛫', '᛬'];
    [[30, 30], [W - 30, 30], [30, H - 30], [W - 30, H - 30]].forEach(([rx, ry], i) => {
      this.add.text(rx, ry, runes[i], { fontSize: '22px', color: '#3a2060', alpha: 0.5 }).setOrigin(0.5).setAlpha(0.4);
    });
  }

  // ─── SEAT UI ──────────────────────────────────────────────────────────────

  _createSeatUI() {
    this.seatUI = [];
    this.holeSprites = [[], [], [], []];

    this.game2.players.forEach((p, i) => {
      const { x, y } = SEAT[i];
      const cls = p.class;
      const isHuman = p.isHuman;

      // Seat plate
      const plate = this.add.graphics();
      const pw = 150, ph = isHuman ? 52 : 44;
      plate.fillStyle(0x0a0818, 0.85);
      plate.fillRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 8);
      plate.lineStyle(2, cls.color, 0.7);
      plate.strokeRoundedRect(x - pw / 2, y - ph / 2, pw, ph, 8);

      // Class emoji
      const emojiT = this.add.text(x - 58, y, cls.emoji, { fontSize: '18px' }).setOrigin(0.5);

      // Name
      const nameT = this.add.text(x - 10, y - 10, p.name, {
        fontSize: '12px', color: '#f0e8d0', fontFamily: 'Georgia, serif', fontStyle: 'bold',
      }).setOrigin(0, 0.5);

      // Chips
      const chipsT = this.add.text(x - 10, y + 8, `⬡ ${p.chips}`, {
        fontSize: '12px', color: '#f0d060', fontFamily: 'Georgia, serif',
      }).setOrigin(0, 0.5);

      // Bet indicator (below seat, smaller)
      const betT = this.add.text(x, y + ph / 2 + 10, '', {
        fontSize: '11px', color: '#e0a030', fontFamily: 'Georgia, serif',
      }).setOrigin(0.5, 0);

      // Status badge
      const statusT = this.add.text(x, y - ph / 2 - 10, '', {
        fontSize: '10px', color: '#c0c0c0', fontFamily: 'Georgia, serif',
      }).setOrigin(0.5, 1);

      // Dealer chip placeholder
      const dealerD = this.add.text(x + 60, y - ph / 2 - 8, '', {
        fontSize: '13px', color: '#f0d080', fontFamily: 'Georgia, serif',
      }).setOrigin(0.5);

      // Class name label (small, under emoji)
      const classT = this.add.text(x - 58, y + 12, cls.name, {
        fontSize: '8px', color: cls.colorStr, fontFamily: 'Georgia, serif',
      }).setOrigin(0.5);

      // Hand display (shown at showdown)
      const handT = this.add.text(x, y + ph / 2 + 22, '', {
        fontSize: '10px', color: '#60e080', fontFamily: 'Georgia, serif',
      }).setOrigin(0.5, 0).setAlpha(0);

      this.seatUI.push({ plate, emojiT, nameT, chipsT, betT, statusT, dealerD, handT, classT, player: p });
    });
  }

  _updateSeatUI(i) {
    const ui = this.seatUI[i];
    const p = this.game2.players[i];
    ui.chipsT.setText(`⬡ ${p.chips}`);

    if (!p.active) {
      ui.statusT.setText('ELIMINATED').setColor('#666666');
      ui.plate.setAlpha(0.3);
    } else if (p.folded) {
      ui.statusT.setText('FOLDED').setColor('#888888');
      ui.plate.setAlpha(0.5);
    } else if (p.allIn) {
      ui.statusT.setText('ALL IN').setColor('#ff6040');
    } else {
      ui.statusT.setText('');
      ui.plate.setAlpha(1);
    }

    // Dealer chip
    const isDealerSeat = i === this.game2.dealerIndex;
    ui.dealerD.setText(isDealerSeat ? '🪙D' : '');
  }

  _updateBetDisplay(i, amount) {
    const ui = this.seatUI[i];
    ui.betT.setText(amount > 0 ? `bet: ${amount}` : '');
  }

  // ─── COMMUNITY CARD SLOTS ─────────────────────────────────────────────────

  _createCommunitySlots() {
    this.commPlaceholders = [];
    this.commSprites = [null, null, null, null, null];

    for (let i = 0; i < 5; i++) {
      const g = this.add.graphics();
      g.lineStyle(1, 0x1e6e30, 0.4);
      g.strokeRoundedRect(COMMUNITY_X[i] - CARD_W / 2, COMMUNITY_Y - CARD_H / 2, CARD_W, CARD_H, 4);
      this.commPlaceholders.push(g);
    }
  }

  // ─── POT, PHASE, MESSAGES ─────────────────────────────────────────────────

  _createPotDisplay() {
    this.potText = this.add.text(W / 2, 272, 'POT: 0', {
      fontSize: '18px', color: '#f0d060', fontFamily: 'Georgia, serif', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5);
  }

  _createPhaseIndicator() {
    this.phaseText = this.add.text(W / 2, 250, '', {
      fontSize: '12px', color: '#a090c0', fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);
  }

  _createMessageBox() {
    this.msgText = this.add.text(W / 2, H / 2 - 10, '', {
      fontSize: '26px', color: '#ffffff', fontFamily: 'Georgia, serif', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 5,
      shadow: { offsetX: 0, offsetY: 0, color: '#9b59b6', blur: 20, fill: true },
    }).setOrigin(0.5).setDepth(100).setAlpha(0);
  }

  showMessage(text, duration = 1800, color = '#ffffff') {
    this.msgText.setText(text).setColor(color).setAlpha(1);
    this.tweens.killTweensOf(this.msgText);
    this.tweens.add({
      targets: this.msgText,
      alpha: 0,
      delay: duration,
      duration: 400,
    });
  }

  _updatePot() {
    this.potText.setText(`POT: ${this.game2.pot}`);
  }

  _setPhase(label) {
    this.phaseText.setText(label);
  }

  // ─── ACTION BUTTONS ───────────────────────────────────────────────────────

  _createActionButtons() {
    const btnY = H - 40;
    const configs = [
      { key: 'fold',  label: 'FOLD',       x: 320, color: 0x8b2222, hover: 0xb22222 },
      { key: 'check', label: 'CHECK',      x: 460, color: 0x225588, hover: 0x2266aa },
      { key: 'call',  label: 'CALL',       x: 600, color: 0x226644, hover: 0x2a8855 },
      { key: 'raise', label: 'RAISE ▲',   x: 740, color: 0x664400, hover: 0x886600 },
    ];

    configs.forEach(cfg => {
      const bg = this.add.rectangle(cfg.x, btnY, 120, 38, cfg.color)
        .setStrokeStyle(1, 0xffffff, 0.3)
        .setInteractive({ useHandCursor: true })
        .setAlpha(0);

      const label = this.add.text(cfg.x, btnY, cfg.label, {
        fontSize: '14px', color: '#ffffff', fontFamily: 'Georgia, serif', fontStyle: 'bold',
      }).setOrigin(0.5).setAlpha(0);

      bg.on('pointerover', () => bg.setFillStyle(cfg.hover));
      bg.on('pointerout', () => bg.setFillStyle(cfg.color));
      bg.on('pointerdown', () => this._onActionClick(cfg.key));

      this.actionBtns[cfg.key] = { bg, label };
    });

    // Raise panel
    this._createRaisePanel();
  }

  _createRaisePanel() {
    const panel = this.add.container(640, H - 100).setAlpha(0).setDepth(10);
    const bg = this.add.rectangle(0, 0, 500, 80, 0x0a0818, 0.95).setStrokeStyle(1, 0x664400, 1);

    const minBtn = this._makeRaisePanelBtn(-180, 'MIN', 0x554400);
    const potBtn = this._makeRaisePanelBtn(-60, 'POT', 0x554400);
    const allBtn = this._makeRaisePanelBtn(60, '2×POT', 0x664422);
    const ainBtn = this._makeRaisePanelBtn(180, 'ALL IN', 0x882222);
    const cancelBtn = this.add.text(0, 30, '[ cancel ]', { fontSize: '11px', color: '#888888' })
      .setOrigin(0.5).setInteractive({ useHandCursor: true });

    cancelBtn.on('pointerdown', () => this._hideRaisePanel());
    cancelBtn.on('pointerover', () => cancelBtn.setColor('#cccccc'));
    cancelBtn.on('pointerout', () => cancelBtn.setColor('#888888'));

    panel.add([bg, ...minBtn, ...potBtn, ...allBtn, ...ainBtn, cancelBtn]);
    this.raisePanel = panel;
    this.raisePanelBtns = { minBtn, potBtn, allBtn, ainBtn };
  }

  _makeRaisePanelBtn(x, label, color) {
    const bg = this.add.rectangle(x, -10, 100, 36, color).setStrokeStyle(1, 0xffffff, 0.2).setInteractive({ useHandCursor: true });
    const txt = this.add.text(x, -10, label, { fontSize: '13px', color: '#ffffff', fontFamily: 'Georgia, serif', fontStyle: 'bold' }).setOrigin(0.5);
    bg.on('pointerover', () => bg.setAlpha(0.8));
    bg.on('pointerout', () => bg.setAlpha(1));
    bg.on('pointerdown', () => this._onRaisePreset(label));
    return [bg, txt];
  }

  _showActionButtons(canCheck, callAmount) {
    const checkLabel = canCheck ? 'CHECK' : `CALL ${callAmount}`;
    this.actionBtns.check.label.setText(checkLabel);

    Object.values(this.actionBtns).forEach(({ bg, label }) => {
      bg.setAlpha(1); label.setAlpha(1);
    });

    if (this.noRaiseActive || this.bState?.noRaise) {
      this.actionBtns.raise.bg.setAlpha(0.3);
      this.actionBtns.raise.label.setAlpha(0.3);
      this.actionBtns.raise.bg.disableInteractive();
    }
  }

  _hideActionButtons() {
    this._hideRaisePanel();
    Object.values(this.actionBtns).forEach(({ bg, label }) => {
      bg.setAlpha(0); label.setAlpha(0);
      bg.setInteractive({ useHandCursor: true });
    });
  }

  _showRaisePanel() {
    this.tweens.add({ targets: this.raisePanel, alpha: 1, duration: 150 });
  }

  _hideRaisePanel() {
    this.tweens.add({ targets: this.raisePanel, alpha: 0, duration: 100 });
  }

  _onRaisePreset(label) {
    const p = this.game2.players[0];
    const { currentBet, roundBets, pot } = this.bState;
    const myBet = roundBets[0] || 0;
    const toCall = currentBet - myBet;
    const bigBlind = this.game2.bigBlind;

    let amount;
    if (label === 'MIN') {
      amount = Math.max(toCall + bigBlind, bigBlind * 2);
    } else if (label === 'POT') {
      amount = Math.max(toCall + pot, bigBlind);
    } else if (label === '2×POT') {
      amount = Math.max(toCall + pot * 2, bigBlind);
    } else {
      amount = p.chips; // all-in
    }

    amount = Math.min(amount, p.chips);
    this._hideRaisePanel();
    this._doPlayerAction('raise', amount);
  }

  // ─── ABILITY BUTTON ───────────────────────────────────────────────────────

  _createAbilityButton() {
    const cls = this.playerClass;
    const ax = W - 130, ay = H - 55;

    const bg = this.add.rectangle(ax, ay, 220, 46, 0x1a0a30)
      .setStrokeStyle(2, cls.color, 0.8)
      .setInteractive({ useHandCursor: true });

    const label = this.add.text(ax, ay - 6, `⚡ ${cls.ultimate.name}`, {
      fontSize: '12px', color: cls.colorStr, fontFamily: 'Georgia, serif', fontStyle: 'bold',
    }).setOrigin(0.5);

    const sub = this.add.text(ax, ay + 9, 'USE ULTIMATE  [READY]', {
      fontSize: '9px', color: '#808080', fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);

    bg.on('pointerover', () => { if (!this.abilityUsedThisRound) bg.setFillStyle(0x2a1050); });
    bg.on('pointerout', () => bg.setFillStyle(0x1a0a30));
    bg.on('pointerdown', () => {
      if (this.abilityUsedThisRound) return;
      if (this.uiState !== 'player_turn') return;
      this._activateUltimate();
    });

    this.abilityBtn = { bg, label, sub };
  }

  _refreshAbilityBtn() {
    const used = this.abilityUsedThisRound;
    this.abilityBtn.sub.setText(used ? 'ULTIMATE USED' : 'USE ULTIMATE  [READY]');
    this.abilityBtn.bg.setAlpha(used ? 0.4 : 1);
  }

  // ─── CARD SPRITES ─────────────────────────────────────────────────────────

  _makeCard(x, y, card, faceDown = true) {
    const container = this.add.container(x, y);
    const isRed = card.suit === '♥' || card.suit === '♦';
    const suitColor = isRed ? '#c0392b' : '#1a1a2e';

    // Card face
    const face = this.add.graphics();
    face.fillStyle(0xfaf0e6);
    face.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 5);
    face.lineStyle(1, 0x888888, 0.5);
    face.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 5);

    const rankTL = this.add.text(-CARD_W / 2 + 4, -CARD_H / 2 + 3, card.rank, {
      fontSize: '15px', color: suitColor, fontFamily: 'Georgia, serif', fontStyle: 'bold',
    });
    const suitTL = this.add.text(-CARD_W / 2 + 4, -CARD_H / 2 + 20, card.suit, {
      fontSize: '12px', color: suitColor, fontFamily: 'Georgia, serif',
    });
    const centerSuit = this.add.text(0, 0, card.suit, {
      fontSize: '26px', color: suitColor, fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);
    const rankBR = this.add.text(CARD_W / 2 - 4, CARD_H / 2 - 3, card.rank, {
      fontSize: '15px', color: suitColor, fontFamily: 'Georgia, serif', fontStyle: 'bold',
    }).setOrigin(1, 1);

    // Wild star
    const wildStar = this.add.text(0, -24, card.wild ? '★' : '', {
      fontSize: '14px', color: '#f0d000', fontFamily: 'serif',
    }).setOrigin(0.5);

    // Card back
    const back = this.add.graphics();
    back.fillStyle(0x2d0a5a);
    back.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 5);
    back.lineStyle(2, 0xffd700, 0.6);
    back.strokeRoundedRect(-CARD_W / 2 + 4, -CARD_H / 2 + 4, CARD_W - 8, CARD_H - 8, 3);
    back.fillStyle(0x4a1880, 0.5);
    back.fillRoundedRect(-CARD_W / 2 + 8, -CARD_H / 2 + 8, CARD_W - 16, CARD_H - 16, 2);
    const backRune = this.add.text(0, 0, '⚜', { fontSize: '24px', color: '#5a2a90' }).setOrigin(0.5);

    const faceGroup = [face, rankTL, suitTL, centerSuit, rankBR, wildStar];
    const backGroup = [back, backRune];

    container.add([...faceGroup, ...backGroup]);
    container.setDepth(2);

    const sprite = {
      container,
      card,
      faceDown,
      faceGroup,
      backGroup,
      wildStar,
    };

    sprite.showFace = () => {
      faceGroup.forEach(o => o.setVisible(true));
      backGroup.forEach(o => o.setVisible(false));
      sprite.faceDown = false;
    };
    sprite.showBack = () => {
      faceGroup.forEach(o => o.setVisible(false));
      backGroup.forEach(o => o.setVisible(true));
      sprite.faceDown = true;
    };
    sprite.flip = (cb) => {
      this.tweens.add({
        targets: container, scaleX: 0, duration: 120, ease: 'Linear',
        onComplete: () => {
          if (sprite.faceDown) sprite.showFace(); else sprite.showBack();
          this.tweens.add({ targets: container, scaleX: 1, duration: 120, ease: 'Linear', onComplete: cb });
        },
      });
    };

    faceDown ? sprite.showBack() : sprite.showFace();
    return sprite;
  }

  _clearCards() {
    this.holeSprites.forEach(row => row.forEach(s => s?.container?.destroy()));
    this.holeSprites = [[], [], [], []];
    this.commSprites.forEach(s => s?.container?.destroy());
    this.commSprites = [null, null, null, null, null];
  }

  // ─── ROUND MANAGEMENT ─────────────────────────────────────────────────────

  _startRound() {
    this._clearCards();
    this.abilityUsedThisRound = false;
    this.alchemistStoneUsed = false;
    this.sorcererPeeked = false;
    this.rangerPeekedCard = null;
    this.noRaiseActive = false;
    this.markedTarget = -1;
    this.chargeForced = false;
    this.summonerBondActive = false;

    this.game2.startRound();
    const blinds = this.game2.postBlinds();
    this.game2.dealHoleCards();

    // Apply Summoner passive: mark first hole card as suit-wild
    if (this.playerClass.name === 'Summoner') {
      const hc = this.game2.players[0].holeCards[0];
      if (hc) { hc.suitWild = true; this.summonerBondActive = true; }
    }

    this.game2.players.forEach((_, i) => this._updateSeatUI(i));
    this._updatePot();
    this._updateBetDisplay(blinds.sbIdx, blinds.sbAmt);
    this._updateBetDisplay(blinds.bbIdx, blinds.bbAmt);
    this._setPhase(`Round ${this.game2.roundNumber}`);

    this._dealAnimation(() => {
      this._triggerPassiveOrBetting();
    });
  }

  _dealAnimation(onDone) {
    let count = 0;
    const players = this.game2.players.filter(p => p.active);
    const total = players.length * 2;
    let delay = 0;

    players.forEach(p => {
      for (let c = 0; c < 2; c++) {
        const card = p.holeCards[c];
        const off = HOLE_OFFSETS[p.index][c];
        const tx = SEAT[p.index].x + off.x;
        const ty = SEAT[p.index].y + off.y;
        const faceDown = !p.isHuman;

        this.time.delayedCall(delay, () => {
          const sprite = this._makeCard(DECK_X, DECK_Y, card, true);
          this.holeSprites[p.index][c] = sprite;

          this.tweens.add({
            targets: sprite.container, x: tx, y: ty, duration: 280, ease: 'Quad.Out',
            onComplete: () => {
              if (!faceDown) sprite.flip(null);
              count++;
              if (count === total) onDone();
            },
          });
        });
        delay += 80;
      }
    });
  }

  _triggerPassiveOrBetting() {
    const cls = this.playerClass.name;

    if (cls === 'Jester') {
      this._showPassiveOffer('Sleight of Hand', 'Swap one hole card with top of deck?',
        () => this._doJesterPassive(), () => this._startBetting('pre_flop'));
    } else if (cls === 'Ranger') {
      this._doRangerPassive(() => this._startBetting('pre_flop'));
    } else if (cls === 'Summoner' && this.summonerBondActive) {
      const hc = this.game2.players[0].holeCards[0];
      const s0 = this.holeSprites[0][0];
      if (s0) { s0.wildStar.setText('★'); }
      this.showMessage(`✨ Familiar Bond — your ${hc.rank} is suit-bonded`, 2000, '#e74c3c');
      this.time.delayedCall(1400, () => this._startBetting('pre_flop'));
    } else {
      this._startBetting('pre_flop');
    }
  }

  // ─── PASSIVE ABILITIES ────────────────────────────────────────────────────

  _showPassiveOffer(title, body, onYes, onNo) {
    const panel = this.add.container(W / 2, H / 2).setDepth(50);
    const bg = this.add.rectangle(0, 0, 420, 110, 0x0a0818, 0.95).setStrokeStyle(2, this.playerClass.color, 1);
    const t1 = this.add.text(0, -30, `⚡ ${title}`, { fontSize: '16px', color: this.playerClass.colorStr, fontFamily: 'Georgia, serif', fontStyle: 'bold' }).setOrigin(0.5);
    const t2 = this.add.text(0, -6, body, { fontSize: '12px', color: '#c0b0d0', fontFamily: 'Georgia, serif' }).setOrigin(0.5);

    const yesBg = this.add.rectangle(-70, 26, 110, 30, 0x224422).setStrokeStyle(1, 0x40cc60, 0.8).setInteractive({ useHandCursor: true });
    const yesT = this.add.text(-70, 26, 'Yes, swap!', { fontSize: '12px', color: '#60e080', fontFamily: 'Georgia, serif' }).setOrigin(0.5);
    const noBg = this.add.rectangle(70, 26, 110, 30, 0x2a1010).setStrokeStyle(1, 0xcc4040, 0.8).setInteractive({ useHandCursor: true });
    const noT = this.add.text(70, 26, 'Skip', { fontSize: '12px', color: '#e06060', fontFamily: 'Georgia, serif' }).setOrigin(0.5);

    panel.add([bg, t1, t2, yesBg, yesT, noBg, noT]);

    const close = () => { panel.destroy(); };
    yesBg.on('pointerdown', () => { close(); onYes(); });
    noBg.on('pointerdown', () => { close(); onNo(); });
  }

  _doJesterPassive() {
    // Show both hole cards, let player pick which to replace
    const cards = this.game2.players[0].holeCards;
    const sprites = this.holeSprites[0];
    const topOfDeck = this.game2.deck.peek();
    if (!topOfDeck) { this._startBetting('pre_flop'); return; }

    const panel = this.add.container(W / 2, H / 2 + 60).setDepth(50);
    const bg = this.add.rectangle(0, -10, 280, 70, 0x0a0818, 0.95).setStrokeStyle(2, 0xf0c040, 1);
    const t = this.add.text(0, -32, 'Click a card to swap it', { fontSize: '12px', color: '#f0c040', fontFamily: 'Georgia, serif' }).setOrigin(0.5);
    panel.add([bg, t]);

    sprites.forEach((sprite, idx) => {
      sprite.container.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      sprite.container.once('pointerdown', () => {
        panel.destroy();
        sprites.forEach(s => s.container.disableInteractive());

        // Swap card
        const old = cards[idx];
        const newCard = this.game2.deck.deal();
        cards[idx] = newCard;
        this.game2.deck.remove(old);

        // Update sprite
        sprite.container.destroy();
        const off = HOLE_OFFSETS[0][idx];
        const ns = this._makeCard(SEAT[0].x + off.x, SEAT[0].y + off.y, newCard, false);
        this.holeSprites[0][idx] = ns;

        this.showMessage(`🃏 Swapped ${old.rank}${old.suit} → ${newCard.rank}${newCard.suit}`, 2000, '#f0c040');
        this.time.delayedCall(800, () => this._startBetting('pre_flop'));
      });
    });
  }

  _doRangerPassive(onDone) {
    const nextCard = this.game2.deck.peek();
    if (!nextCard) { onDone(); return; }
    this.rangerPeekedCard = nextCard;
    this.showMessage(`🏹 Tracker — next reveal: ${nextCard.rank}${nextCard.suit}`, 2800, '#27ae60');
    this.time.delayedCall(1400, onDone);
  }

  _doAlchemistStone() {
    if (this.alchemistStoneUsed) return;
    const cards = this.game2.players[0].holeCards;
    const sprites = this.holeSprites[0];
    const suits = ['♠', '♥', '♦', '♣'];

    const panel = this.add.container(W / 2, H / 2 + 80).setDepth(60);
    const bg = this.add.rectangle(0, 0, 380, 90, 0x0a0818, 0.96).setStrokeStyle(2, 0xe67e22, 1);
    const t = this.add.text(0, -30, "⚗️ Philosopher's Stone — change a suit", { fontSize: '13px', color: '#e67e22', fontFamily: 'Georgia, serif' }).setOrigin(0.5);
    panel.add([bg, t]);

    let pickedCard = null, pickedIdx = -1;

    const suitBtns = suits.map((suit, si) => {
      const btn = this.add.rectangle(-130 + si * 88, 16, 78, 28, 0x1a1030).setStrokeStyle(1, 0xe67e22, 0.6).setInteractive({ useHandCursor: true });
      const bt = this.add.text(-130 + si * 88, 16, suit, { fontSize: '18px', color: suit === '♥' || suit === '♦' ? '#cc3333' : '#dddddd', fontFamily: 'serif' }).setOrigin(0.5);
      btn.on('pointerdown', () => {
        if (pickedIdx < 0) return;
        pickedCard.suit = suit;
        this.alchemistStoneUsed = true;
        panel.destroy();
        sprites[pickedIdx].container.destroy();
        const off = HOLE_OFFSETS[0][pickedIdx];
        const ns = this._makeCard(SEAT[0].x + off.x, SEAT[0].y + off.y, pickedCard, false);
        this.holeSprites[0][pickedIdx] = ns;
        this.showMessage(`⚗️ Transmuted to ${suit}`, 1600, '#e67e22');
      });
      panel.add([btn, bt]);
      return btn;
    });

    const cancelBtn = this.add.text(0, 38, '[ cancel ]', { fontSize: '10px', color: '#666666', fontFamily: 'Georgia, serif' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cancelBtn.on('pointerdown', () => panel.destroy());
    panel.add(cancelBtn);

    sprites.forEach((sprite, idx) => {
      sprite.container.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      sprite.container.on('pointerdown', () => {
        pickedCard = cards[idx]; pickedIdx = idx;
        sprites.forEach(s => s.container.setAlpha(0.6));
        sprite.container.setAlpha(1);
      });
    });
  }

  // ─── BETTING ROUND ────────────────────────────────────────────────────────

  _startBetting(phase) {
    this._setPhase(phase.toUpperCase().replace('_', ' '));
    this.uiState = 'betting';

    const bbIdx = this.game2.bigBlindIndex;
    const sbIdx = this.game2.smallBlindIndex;
    const { sbAmt, bbAmt } = this._lastBlinds || { sbAmt: this.game2.smallBlind, bbAmt: this.game2.bigBlind };

    const roundBets = new Array(4).fill(0);
    if (phase === 'pre_flop') {
      roundBets[sbIdx] = this.game2.smallBlind;
      roundBets[bbIdx] = this.game2.bigBlind;
    }

    this.bState = {
      phase,
      currentBet: phase === 'pre_flop' ? this.game2.bigBlind : 0,
      roundBets,
      actedThisRound: new Set(),
      lastAggressorIdx: phase === 'pre_flop' ? bbIdx : -1,
      noRaise: this.noRaiseActive,
    };

    // First to act
    let firstIdx;
    if (phase === 'pre_flop') {
      firstIdx = this.game2.nextActiveIndex(bbIdx);
    } else {
      firstIdx = this.game2.nextActiveIndex(this.game2.dealerIndex);
    }

    this.bState.currentIdx = firstIdx;
    this._processCurrentBettor();
  }

  _storeBlinds(sbAmt, bbAmt) {
    this._lastBlinds = { sbAmt, bbAmt };
  }

  _processCurrentBettor() {
    if (this._isBettingOver()) { this._endBettingRound(); return; }

    let idx = this.bState.currentIdx;
    let tries = 0;

    // Find next player who should act
    while (tries < 4) {
      const p = this.game2.players[idx];
      if (p.active && !p.folded && !p.allIn) break;
      idx = (idx + 1) % 4;
      tries++;
      if (tries >= 4) { this._endBettingRound(); return; }
    }

    this.bState.currentIdx = idx;

    if (this._isBettingOver()) { this._endBettingRound(); return; }

    const p = this.game2.players[idx];

    // Highlight current player
    this.seatUI.forEach((ui, i) => {
      ui.plate.setAlpha(i === idx ? 1 : (this.game2.players[i].active && !this.game2.players[i].folded ? 0.85 : 0.4));
    });

    if (p.isHuman) {
      this.uiState = 'player_turn';
      const toCall = this.bState.currentBet - (this.bState.roundBets[idx] || 0);
      this._showActionButtons(toCall <= 0, toCall);

      // Offer Alchemist passive
      if (this.playerClass.name === 'Alchemist' && !this.alchemistStoneUsed) {
        this.time.delayedCall(300, () => {
          if (this.uiState === 'player_turn') {
            this.showMessage("⚗️ Stone ready — click a hole card to change suit", 2500, '#e67e22');
            this._enableAlchemistPassiveClick();
          }
        });
      }

      this._refreshAbilityBtn();
    } else {
      this.uiState = 'bot_turn';
      const delay = 900 + Math.random() * 700;
      this.time.delayedCall(delay, () => this._doBotAction(p));
    }
  }

  _enableAlchemistPassiveClick() {
    if (this.alchemistStoneUsed) return;
    this._doAlchemistStone();
  }

  _isBettingOver() {
    const inHand = this.game2.players.filter(p => p.active && !p.folded);
    if (inHand.length <= 1) return true;

    const canAct = inHand.filter(p => !p.allIn);
    if (canAct.length === 0) return true;

    return canAct.every(p => {
      const bet = this.bState.roundBets[p.index] || 0;
      return bet === this.bState.currentBet && this.bState.actedThisRound.has(p.index);
    });
  }

  _advanceBettor() {
    const cur = this.bState.currentIdx;
    let next = (cur + 1) % 4;
    for (let i = 0; i < 4; i++) {
      const p = this.game2.players[next];
      if (p.active && !p.folded && !p.allIn) break;
      next = (next + 1) % 4;
    }
    this.bState.currentIdx = next;
    this._processCurrentBettor();
  }

  _doBotAction(player) {
    if (this.uiState !== 'bot_turn') return;

    const effectiveBState = { ...this.bState };
    if (this.markedTarget === player.index) effectiveBState.noRaise = true;

    const decision = botDecide(player, this.game2.communityCards, effectiveBState, this.game2.bigBlind);

    // Enforce mark target: convert raise to call
    if (this.markedTarget === player.index && decision.action === 'raise') {
      decision.action = 'call';
    }

    this._doAction(player.index, decision.action, decision.raiseAmount || 0);
  }

  _onActionClick(key) {
    if (this.uiState !== 'player_turn') return;
    if (key === 'raise') {
      if (this.bState.noRaise) return;
      this._showRaisePanel();
      return;
    }
    const idx = 0;
    const toCall = this.bState.currentBet - (this.bState.roundBets[idx] || 0);
    const callKey = toCall <= 0 ? 'check' : 'call';
    const action = key === 'check' ? callKey : key;
    this._doPlayerAction(action, toCall);
  }

  _doPlayerAction(action, amount) {
    this._hideActionButtons();
    // Disable alchemist passive clicks
    this.holeSprites[0].forEach(s => s?.container?.disableInteractive());
    this.uiState = 'betting';
    this._doAction(0, action, amount);
  }

  _doAction(playerIdx, action, amount) {
    const p = this.game2.players[playerIdx];
    const myBet = this.bState.roundBets[playerIdx] || 0;
    const toCall = this.bState.currentBet - myBet;

    const actionLabels = { fold: 'folds', check: 'checks', call: 'calls', raise: 'raises' };
    let logMsg = `${p.name} ${actionLabels[action] || action}`;

    if (action === 'fold') {
      this.game2.playerFold(playerIdx);
      this.seatUI[playerIdx].plate.setAlpha(0.35);
    } else if (action === 'check') {
      this.bState.actedThisRound.add(playerIdx);
    } else if (action === 'call') {
      const callAmt = Math.min(toCall, p.chips);
      const actual = this.game2.playerBet(playerIdx, callAmt);
      this.bState.roundBets[playerIdx] = myBet + actual;
      this.bState.actedThisRound.add(playerIdx);
      logMsg += ` ${callAmt}`;
    } else if (action === 'raise') {
      // amount = additional chips above their current round bet
      const raiseAmt = Math.min(amount, p.chips);
      const actual = this.game2.playerBet(playerIdx, raiseAmt);
      this.bState.roundBets[playerIdx] = myBet + actual;
      if (this.bState.roundBets[playerIdx] > this.bState.currentBet) {
        this.bState.currentBet = this.bState.roundBets[playerIdx];
        this.bState.actedThisRound.clear();
        this.bState.actedThisRound.add(playerIdx);
        this.bState.lastAggressorIdx = playerIdx;
      } else {
        this.bState.actedThisRound.add(playerIdx);
      }
      logMsg += ` to ${this.bState.roundBets[playerIdx]}`;
    }

    this._updateBetDisplay(playerIdx, this.bState.roundBets[playerIdx] || 0);
    this._updateSeatUI(playerIdx);
    this._updatePot();

    this.showMessage(logMsg, 1000, p.isHuman ? '#80e0ff' : '#e0e0e0');

    // Check if only one player left
    const inHand = this.game2.players.filter(q => q.active && !q.folded);
    if (inHand.length <= 1) {
      this.time.delayedCall(800, () => this._winWithoutShowdown(inHand[0]));
      return;
    }

    this.time.delayedCall(500, () => this._advanceBettor());
  }

  _endBettingRound() {
    // Clear round bet displays
    this.game2.players.forEach((_, i) => this._updateBetDisplay(i, 0));
    this._updatePot();

    const phase = this.bState.phase;
    this.time.delayedCall(400, () => {
      if (phase === 'pre_flop') {
        this.game2.dealFlop();
        this._revealCommunity(3, () => this._startBetting('flop'));
      } else if (phase === 'flop') {
        this.game2.dealTurn();
        this._revealCommunity(1, () => this._startBetting('turn'));
      } else if (phase === 'turn') {
        this.game2.dealRiver();
        this._revealCommunity(1, () => this._startBetting('river'));
      } else if (phase === 'river') {
        this._doShowdown();
      }
    });
  }

  _revealCommunity(count, onDone) {
    const offset = this.game2.communityCards.length - count;
    let revealed = 0;

    const revealOne = (idx) => {
      const card = this.game2.communityCards[offset + idx];
      const x = COMMUNITY_X[offset + idx];
      const sprite = this._makeCard(x, COMMUNITY_Y, card, true);
      this.commSprites[offset + idx] = sprite;

      // Sorcerer foresight: if player peeked this card, briefly show "you saw this"
      const rangerMatch = this.rangerPeekedCard &&
        this.rangerPeekedCard.rank === card.rank && this.rangerPeekedCard.suit === card.suit;

      sprite.flip(() => {
        if (rangerMatch) {
          this.showMessage(`🏹 You predicted: ${card.rank}${card.suit} ✓`, 1400, '#27ae60');
          this.rangerPeekedCard = null;
        }
        revealed++;
        if (revealed < count) {
          this.time.delayedCall(250, () => revealOne(idx + 1));
        } else {
          this.time.delayedCall(300, onDone);
        }
      });
    };

    revealOne(0);
  }

  // ─── WIN WITHOUT SHOWDOWN ─────────────────────────────────────────────────

  _winWithoutShowdown(winner) {
    let bonus = 0;
    if (winner?.isHuman && this.playerClass.name === 'Assassin') {
      bonus = Math.floor(this.game2.pot * 0.25);
      this.game2.pot += bonus;
      this.showMessage(`🗡️ Blade in the Dark! +${bonus} bonus`, 2000, '#566573');
    }

    const winners = winner ? [{ player: winner, handName: 'Everyone folded' }] : [];
    this.game2.distributePot(winners.map ? winners : [{ player: winner }]);
    this._updatePot();
    this.game2.players.forEach((_, i) => this._updateSeatUI(i));

    const name = winner?.name || '???';
    this.showMessage(`${name} wins the pot!`, 2200, '#f0d060');
    this.time.delayedCall(2600, () => this._afterRound());
  }

  // ─── SHOWDOWN ─────────────────────────────────────────────────────────────

  _doShowdown() {
    this._setPhase('SHOWDOWN');
    this.uiState = 'showdown';

    // Apply Summoner passive for evaluation: mark hole card as suit-wild
    if (this.summonerBondActive) {
      const hc = this.game2.players[0].holeCards[0];
      if (hc) hc.wild = true;
    }

    // Reveal all active players' hole cards
    this.game2.players.forEach((p, i) => {
      if (!p.isHuman && !p.folded && p.active) {
        this.holeSprites[i].forEach(s => { if (s && s.faceDown) s.flip(null); });
      }
    });

    this.time.delayedCall(700, () => {
      const winners = this.game2.determineWinners();

      // Show hand names
      this.game2.players.forEach((p, i) => {
        if (!p.folded && p.active) {
          const all = [...p.holeCards, ...this.game2.communityCards];
          const hand = evaluateBestHand(all);
          const name = getHandName(hand);
          this.seatUI[i].handT.setText(name).setAlpha(1);
        }
      });

      // Noble passive: bonus on win
      let nobleBonus = 0;
      if (winners.some(w => w.player.isHuman) && this.playerClass.name === 'Noble') {
        nobleBonus = Math.floor(this.game2.pot * 0.15);
        this.game2.pot += nobleBonus;
        this._updatePot();
      }

      this.game2.distributePot(winners);
      this.game2.players.forEach((_, i) => {
        this._updateSeatUI(i);
        // Clear wild flags
        this.game2.players[i].holeCards.forEach(c => { if (c) c.wild = false; });
      });
      this._updatePot();

      const winnerNames = winners.map(w => w.player.name).join(' & ');
      const handName = winners[0]?.handName || '';
      let msg = `${winnerNames} wins!  ${handName}`;
      if (nobleBonus > 0) msg += `  (+${nobleBonus} Noble bonus)`;
      this.showMessage(msg, 3000, '#f0d060');

      // Fade out hand labels
      this.time.delayedCall(3000, () => {
        this.seatUI.forEach(ui => this.tweens.add({ targets: ui.handT, alpha: 0, duration: 400 }));
        this._afterRound();
      });
    });
  }

  _afterRound() {
    if (this.game2.isGameOver()) {
      this._gameOver();
      return;
    }
    this.time.delayedCall(600, () => this._startRound());
  }

  _gameOver() {
    const leader = this.game2.activePlayers.sort((a, b) => b.chips - a.chips)[0];
    const isPlayerWin = leader?.isHuman;

    const overlay = this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setDepth(200);
    this.add.text(W / 2, H / 2 - 60, isPlayerWin ? '⚔️ VICTORY ⚔️' : '💀 DEFEATED 💀', {
      fontSize: '52px', color: isPlayerWin ? '#f0d060' : '#cc4444', fontFamily: 'Georgia, serif', fontStyle: 'bold',
      stroke: '#000', strokeThickness: 6,
    }).setOrigin(0.5).setDepth(201);

    this.add.text(W / 2, H / 2 + 20, `${leader?.name} wins with ${leader?.chips} chips`, {
      fontSize: '22px', color: '#e0d0c0', fontFamily: 'Georgia, serif',
    }).setOrigin(0.5).setDepth(201);

    const replayBg = this.add.rectangle(W / 2, H / 2 + 90, 220, 44, 0x2a1a4a).setStrokeStyle(2, 0x9b59b6).setDepth(201).setInteractive({ useHandCursor: true });
    this.add.text(W / 2, H / 2 + 90, 'PLAY AGAIN', { fontSize: '18px', color: '#c0a0e0', fontFamily: 'Georgia, serif', fontStyle: 'bold' }).setOrigin(0.5).setDepth(202);

    replayBg.on('pointerdown', () => {
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('MenuScene'));
    });
  }

  // ─── ULTIMATE ABILITIES ───────────────────────────────────────────────────

  _activateUltimate() {
    if (this.abilityUsedThisRound) return;
    this.abilityUsedThisRound = true;
    this._refreshAbilityBtn();

    const cls = this.playerClass.name;
    if (cls === 'Jester') this._ult_Jester();
    else if (cls === 'Noble') this._ult_Noble();
    else if (cls === 'Sorcerer') this._ult_Sorcerer();
    else if (cls === 'Assassin') this._ult_Assassin();
    else if (cls === 'Knight') this._ult_Knight();
    else if (cls === 'Summoner') this._ult_Summoner();
    else if (cls === 'Ranger') this._ult_Ranger();
    else if (cls === 'Alchemist') this._ult_Alchemist();
  }

  _ult_Jester() {
    this.showMessage("🃏 Grand Illusion! Opponents redraw their worst card.", 2200, '#f0c040');
    this.game2.players.forEach((p, i) => {
      if (p.isHuman || p.folded || !p.active) return;
      if (p.class.name === 'Knight') return; // Iron Will
      const vals = p.holeCards.map(c => c.value);
      const worstIdx = vals[0] <= vals[1] ? 0 : 1;
      const old = p.holeCards[worstIdx];
      const newCard = this.game2.deck.deal();
      if (!newCard) return;
      p.holeCards[worstIdx] = newCard;
      this.game2.deck.remove(old);
      // Animate the bot card briefly flipping
      const s = this.holeSprites[i][worstIdx];
      if (s) {
        this.tweens.add({ targets: s.container, y: s.container.y - 20, duration: 200, yoyo: true });
      }
    });
  }

  _ult_Noble() {
    this.bState.noRaise = true;
    this.noRaiseActive = true;
    this.showMessage("👑 Royal Decree! No raises this round.", 2000, '#9b59b6');
    // Dim raise button
    this.actionBtns.raise.bg.setAlpha(0.3);
    this.actionBtns.raise.label.setAlpha(0.3);
    this.actionBtns.raise.bg.disableInteractive();
  }

  _ult_Sorcerer() {
    const comm = this.game2.communityCards;
    if (comm.length === 0) {
      this.showMessage("🔮 No community cards revealed yet!", 1600, '#3498db');
      this.abilityUsedThisRound = false;
      this._refreshAbilityBtn();
      return;
    }

    // Show selection: pick hole card + community card
    const panel = this.add.container(W / 2, H / 2).setDepth(60);
    const bg2 = this.add.rectangle(0, 0, 460, 130, 0x0a0818, 0.96).setStrokeStyle(2, 0x3498db, 1);
    const t = this.add.text(0, -48, '🔮 Arcane Swap — pick your hole card, then a community card', {
      fontSize: '11px', color: '#3498db', fontFamily: 'Georgia, serif', align: 'center', wordWrap: { width: 440 },
    }).setOrigin(0.5);
    panel.add([bg2, t]);

    const cancelT = this.add.text(0, 50, '[ cancel ]', { fontSize: '10px', color: '#666', fontFamily: 'Georgia, serif' }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    cancelT.on('pointerdown', () => { panel.destroy(); this._cleanCardInteraction(); });
    panel.add(cancelT);

    let chosenHole = -1;

    this.holeSprites[0].forEach((sprite, hi) => {
      sprite.container.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      sprite.container.on('pointerdown', () => {
        chosenHole = hi;
        this.holeSprites[0].forEach((s, si) => s?.container.setAlpha(si === hi ? 1 : 0.5));
      });
    });

    this.commSprites.forEach((sprite, ci) => {
      if (!sprite || !this.game2.communityCards[ci]) return;
      sprite.container.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      sprite.container.on('pointerdown', () => {
        if (chosenHole < 0) { this.showMessage('Pick a hole card first', 1000, '#3498db'); return; }
        panel.destroy();
        this._cleanCardInteraction();

        // Swap
        const hCard = this.game2.players[0].holeCards[chosenHole];
        const cCard = this.game2.communityCards[ci];
        this.game2.players[0].holeCards[chosenHole] = cCard;
        this.game2.communityCards[ci] = hCard;

        // Refresh sprites
        const off = HOLE_OFFSETS[0][chosenHole];
        this.holeSprites[0][chosenHole]?.container?.destroy();
        this.holeSprites[0][chosenHole] = this._makeCard(SEAT[0].x + off.x, SEAT[0].y + off.y, cCard, false);
        this.commSprites[ci]?.container?.destroy();
        this.commSprites[ci] = this._makeCard(COMMUNITY_X[ci], COMMUNITY_Y, hCard, false);

        this.showMessage(`🔮 Swapped cards!`, 1800, '#3498db');
        this.holeSprites[0].forEach(s => s?.container.setAlpha(1));
      });
    });
  }

  _ult_Assassin() {
    // Silence the chip leader (can't raise)
    const bots = this.game2.players.filter(p => !p.isHuman && p.active && !p.folded);
    if (bots.length === 0) return;
    const target = bots.sort((a, b) => b.chips - a.chips)[0];
    if (target.class.name === 'Knight') {
      this.showMessage("🗡️ Mark Target blocked by Iron Will!", 2000, '#566573');
      return;
    }
    this.markedTarget = target.index;
    this.showMessage(`🗡️ ${target.name} is marked — they cannot raise this round!`, 2200, '#566573');
  }

  _ult_Knight() {
    const pot = this.game2.pot || this.game2.bigBlind * 2;
    const forced = Math.max(pot * 2, this.game2.bigBlind * 4);
    this.chargeForced = true;
    this.bState.currentBet = Math.max(this.bState.currentBet, forced);
    this.showMessage(`⚔️ Charge! Minimum bet forced to ${Math.floor(forced)}`, 2000, '#bdc3c7');
  }

  _ult_Summoner() {
    if (this.game2.communityCards.length >= 5) {
      this.showMessage('✨ Board is full, cannot add wild card!', 1600, '#e74c3c');
      this.abilityUsedThisRound = false;
      this._refreshAbilityBtn();
      return;
    }
    const wildCard = { suit: '★', rank: '★', value: 0, wild: true };
    this.game2.communityCards.push(wildCard);
    const ci = this.game2.communityCards.length - 1;
    const sprite = this._makeCard(COMMUNITY_X[ci], COMMUNITY_Y, wildCard, false);
    this.commSprites[ci] = sprite;
    this.showMessage('✨ Wild Elemental summoned!', 2000, '#e74c3c');
  }

  _ult_Ranger() {
    const comm = this.game2.communityCards;
    if (comm.length === 0) {
      this.showMessage("🏹 No community cards to replace!", 1600, '#27ae60');
      this.abilityUsedThisRound = false;
      this._refreshAbilityBtn();
      return;
    }

    this.showMessage("🏹 Hunter's Mark — click a community card to replace it", 2500, '#27ae60');

    this.commSprites.forEach((sprite, ci) => {
      if (!sprite || !comm[ci]) return;
      sprite.container.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      sprite.container.once('pointerdown', () => {
        this._cleanCardInteraction();
        const old = comm[ci];
        this.game2.deck.remove(old);
        const newCard = this.game2.deck.deal();
        if (!newCard) return;
        comm[ci] = newCard;
        sprite.container.destroy();
        this.commSprites[ci] = this._makeCard(COMMUNITY_X[ci], COMMUNITY_Y, newCard, true);
        this.commSprites[ci].flip(null);
        this.showMessage(`🏹 Replaced ${old.rank}${old.suit} → ${newCard.rank}${newCard.suit}`, 2000, '#27ae60');
      });
    });
  }

  _ult_Alchemist() {
    const comm = this.game2.communityCards;
    if (comm.length === 0) {
      this.showMessage("⚗️ No community cards yet!", 1600, '#e67e22');
      this.abilityUsedThisRound = false;
      this._refreshAbilityBtn();
      return;
    }

    this.showMessage("⚗️ Grand Transmutation — click a community card to alter its value", 2500, '#e67e22');

    this.commSprites.forEach((sprite, ci) => {
      if (!sprite || !comm[ci] || comm[ci].wild) return;
      sprite.container.setInteractive(new Phaser.Geom.Rectangle(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H), Phaser.Geom.Rectangle.Contains);
      sprite.container.once('pointerdown', () => {
        this._cleanCardInteraction();
        this._showValueChangePanel(ci);
      });
    });
  }

  _showValueChangePanel(ci) {
    const card = this.game2.communityCards[ci];
    const rankList = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
    const curIdx = rankList.indexOf(card.rank);

    const panel = this.add.container(W / 2, H / 2 + 60).setDepth(70);
    const bg2 = this.add.rectangle(0, 0, 260, 80, 0x0a0818, 0.96).setStrokeStyle(2, 0xe67e22, 1);
    const t = this.add.text(0, -22, `Change ${card.rank}${card.suit}`, { fontSize: '14px', color: '#e67e22', fontFamily: 'Georgia, serif' }).setOrigin(0.5);

    const downBg = this.add.rectangle(-60, 12, 80, 30, 0x441a00).setStrokeStyle(1, 0xe67e22, 0.6).setInteractive({ useHandCursor: true });
    const downT = this.add.text(-60, 12, '▼ -1', { fontSize: '13px', color: '#f0a060', fontFamily: 'Georgia, serif' }).setOrigin(0.5);
    const upBg = this.add.rectangle(60, 12, 80, 30, 0x441a00).setStrokeStyle(1, 0xe67e22, 0.6).setInteractive({ useHandCursor: true });
    const upT = this.add.text(60, 12, '+1 ▲', { fontSize: '13px', color: '#f0a060', fontFamily: 'Georgia, serif' }).setOrigin(0.5);

    if (curIdx <= 0) { downBg.setAlpha(0.3); downBg.disableInteractive(); }
    if (curIdx >= rankList.length - 1) { upBg.setAlpha(0.3); upBg.disableInteractive(); }

    const apply = (delta) => {
      panel.destroy();
      const newRank = rankList[curIdx + delta];
      const old = card.rank;
      card.rank = newRank;
      card.value = RANK_VALUES[newRank];
      this.commSprites[ci]?.container?.destroy();
      this.commSprites[ci] = this._makeCard(COMMUNITY_X[ci], COMMUNITY_Y, card, false);
      this.showMessage(`⚗️ Transmuted ${old}${card.suit} → ${newRank}${card.suit}`, 2000, '#e67e22');
    };

    downBg.on('pointerdown', () => apply(-1));
    upBg.on('pointerdown', () => apply(+1));
    panel.add([bg2, t, downBg, downT, upBg, upT]);
  }

  _cleanCardInteraction() {
    this.holeSprites[0].forEach(s => { s?.container?.disableInteractive(); s?.container?.setAlpha(1); });
    this.commSprites.forEach(s => { s?.container?.disableInteractive(); s?.container?.setAlpha(1); });
  }
}
