import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() { super({ key: 'BootScene' }); }

  create() {
    const bar = this.add.rectangle(640, 360, 400, 20, 0x333355);
    const fill = this.add.rectangle(440, 360, 0, 16, 0x9b59b6);
    const text = this.add.text(640, 390, 'Loading Fantasy Poker...', {
      fontSize: '20px', color: '#f0d080', fontFamily: 'serif',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: fill,
      width: 396,
      x: 640,
      duration: 600,
      ease: 'Linear',
      onComplete: () => {
        bar.destroy(); fill.destroy(); text.destroy();
        this.scene.start('MenuScene');
      },
    });
  }
}
