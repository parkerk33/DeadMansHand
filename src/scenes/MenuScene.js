import Phaser from 'phaser';
import { CLASS_LIST, CLASSES } from '../classes/ClassDefinitions.js';

const CARD_W = 168;
const CARD_H = 230;
const GAP = 16;
const START_X = (1280 - (4 * CARD_W + 3 * GAP)) / 2;
const ROW1_Y = 145;
const ROW2_Y = ROW1_Y + CARD_H + GAP;

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
    this.selectedClass = null;
    this.cardObjects = [];
  }

  create() {
    this._drawBackground();
    this._drawTitle();
    this._drawClassCards();
    this._drawInfoPanel();
    this._drawStartButton();
  }

  _drawBackground() {
    // Dark stone gradient
    const g = this.add.graphics();
    g.fillGradientStyle(0x0a0a18, 0x0a0a18, 0x12102a, 0x12102a, 1);
    g.fillRect(0, 0, 1280, 720);

    // Decorative rune border
    g.lineStyle(2, 0x3a2060, 0.6);
    for (let i = 0; i < 8; i++) {
      g.strokeRect(i * 4, i * 4, 1280 - i * 8, 720 - i * 8);
    }
    g.lineStyle(1, 0x9b59b6, 0.4);
    g.strokeRect(20, 20, 1240, 680);
  }

  _drawTitle() {
    this.add.text(640, 52, 'FANTASY POKER', {
      fontSize: '54px',
      color: '#f0d080',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      stroke: '#4a2080',
      strokeThickness: 6,
      shadow: { offsetX: 2, offsetY: 2, color: '#000', blur: 8, fill: true },
    }).setOrigin(0.5);

    this.add.text(640, 106, 'Choose Your Class', {
      fontSize: '20px',
      color: '#c0a0e0',
      fontFamily: 'Georgia, serif',
    }).setOrigin(0.5);
  }

  _drawClassCards() {
    CLASS_LIST.forEach((cls, i) => {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const x = START_X + col * (CARD_W + GAP);
      const y = row === 0 ? ROW1_Y : ROW2_Y;

      const container = this.add.container(x, y);

      // Card background
      const bg = this.add.rectangle(CARD_W / 2, CARD_H / 2, CARD_W, CARD_H, 0x12102a);
      bg.setStrokeStyle(2, cls.color, 0.6);

      // Top color band
      const band = this.add.rectangle(CARD_W / 2, 0, CARD_W, 50, cls.color, 0.25);
      band.setOrigin(0.5, 0);

      // Emoji icon
      const emoji = this.add.text(CARD_W / 2, 24, cls.emoji, {
        fontSize: '28px',
      }).setOrigin(0.5);

      // Class name
      const name = this.add.text(CARD_W / 2, 60, cls.name.toUpperCase(), {
        fontSize: '14px',
        color: '#ffffff',
        fontFamily: 'Georgia, serif',
        fontStyle: 'bold',
      }).setOrigin(0.5);

      // Divider
      const div = this.add.rectangle(CARD_W / 2, 76, CARD_W - 20, 1, cls.color, 0.5);

      // Passive
      const passiveLabel = this.add.text(8, 84, '⚡ PASSIVE', {
        fontSize: '9px', color: '#f0d080', fontFamily: 'Georgia, serif', fontStyle: 'bold',
      });
      const passiveName = this.add.text(8, 97, cls.passive.name, {
        fontSize: '10px', color: '#e0d0f0', fontFamily: 'Georgia, serif', fontStyle: 'italic',
      });
      const passiveDesc = this.add.text(8, 110, cls.passive.description, {
        fontSize: '9px', color: '#b0a0c8', fontFamily: 'Georgia, serif',
        wordWrap: { width: CARD_W - 16 },
      });

      const passiveBottom = 110 + passiveDesc.height;

      // Ultimate
      const ultiLabel = this.add.text(8, passiveBottom + 6, '💥 ULTIMATE', {
        fontSize: '9px', color: '#ff9060', fontFamily: 'Georgia, serif', fontStyle: 'bold',
      });
      const ultiName = this.add.text(8, passiveBottom + 19, cls.ultimate.name, {
        fontSize: '10px', color: '#e0d0f0', fontFamily: 'Georgia, serif', fontStyle: 'italic',
      });
      const ultiDesc = this.add.text(8, passiveBottom + 32, cls.ultimate.description, {
        fontSize: '9px', color: '#b0a0c8', fontFamily: 'Georgia, serif',
        wordWrap: { width: CARD_W - 16 },
      });

      container.add([bg, band, emoji, name, div, passiveLabel, passiveName, passiveDesc, ultiLabel, ultiName, ultiDesc]);
      container.setSize(CARD_W, CARD_H);
      container.setInteractive();

      // Selection glow object (starts invisible)
      const glow = this.add.rectangle(x + CARD_W / 2, y + CARD_H / 2, CARD_W + 8, CARD_H + 8, cls.color, 0);
      glow.setStrokeStyle(3, cls.color, 0);

      this.cardObjects.push({ container, bg, glow, cls, col, row });

      container.on('pointerover', () => {
        if (this.selectedClass !== cls.name) {
          bg.setFillStyle(0x1e1a3a);
          this.tweens.add({ targets: container, scaleX: 1.02, scaleY: 1.02, duration: 100 });
        }
      });

      container.on('pointerout', () => {
        if (this.selectedClass !== cls.name) {
          bg.setFillStyle(0x12102a);
          this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 100 });
        }
      });

      container.on('pointerdown', () => this._selectClass(cls.name));
    });
  }

  _selectClass(className) {
    this.selectedClass = className;
    const cls = CLASSES[className];

    // Update all cards visually
    this.cardObjects.forEach(obj => {
      const isSelected = obj.cls.name === className;
      obj.bg.setFillStyle(isSelected ? 0x1e183a : 0x12102a);
      obj.bg.setStrokeStyle(isSelected ? 3 : 2, obj.cls.color, isSelected ? 1 : 0.6);
      this.tweens.add({
        targets: obj.container,
        scaleX: isSelected ? 1.04 : 1,
        scaleY: isSelected ? 1.04 : 1,
        duration: 150,
      });
    });

    // Update info panel
    this._updateInfoPanel(cls);

    // Enable start button
    if (this.startBtn) {
      this.startBtn.setFillStyle(cls.color);
      this.startBtnText.setColor('#ffffff');
      this.startBtn.setInteractive();
    }
  }

  _drawInfoPanel() {
    const panelY = ROW2_Y + CARD_H + 18;
    const panelH = 720 - panelY - 24;

    this.infoBg = this.add.rectangle(640, panelY + panelH / 2, 860, panelH, 0x12102a, 0.8);
    this.infoBg.setStrokeStyle(1, 0x3a2060, 0.8);

    this.infoText = this.add.text(640, panelY + panelH / 2, 'Select a class to see details', {
      fontSize: '14px', color: '#806090', fontFamily: 'Georgia, serif',
      align: 'center',
    }).setOrigin(0.5);
  }

  _updateInfoPanel(cls) {
    this.infoText.setText(
      `${cls.emoji}  ${cls.name.toUpperCase()}  —  ${cls.lore}`
    );
    this.infoText.setColor(cls.colorStr);
  }

  _drawStartButton() {
    const btnY = 694;
    this.startBtn = this.add.rectangle(640, btnY, 280, 42, 0x2a1a4a);
    this.startBtn.setStrokeStyle(2, 0x5a3080, 0.8);

    this.startBtnText = this.add.text(640, btnY, 'SELECT A CLASS TO BEGIN', {
      fontSize: '15px', color: '#604080', fontFamily: 'Georgia, serif', fontStyle: 'bold',
    }).setOrigin(0.5);

    // Not interactive until a class is selected
    this.startBtn.on('pointerover', () => {
      if (this.selectedClass) this.tweens.add({ targets: this.startBtn, scaleX: 1.05, scaleY: 1.05, duration: 100 });
    });
    this.startBtn.on('pointerout', () => {
      this.tweens.add({ targets: this.startBtn, scaleX: 1, scaleY: 1, duration: 100 });
    });
    this.startBtn.on('pointerdown', () => {
      if (!this.selectedClass) return;
      this.cameras.main.fadeOut(400, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.registry.set('playerClass', this.selectedClass);
        this.scene.start('GameScene');
      });
    });
  }
}
