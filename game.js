const CELL = 30;
const COLS = 10;
const ROWS = 20;
const BOARD_X = 40;
const BOARD_Y = 20;

const COLORS = [0x00f0f0, 0xf0f000, 0xa000f0, 0x00f000, 0xf00000, 0x0000f0, 0xf0a000];

// I, O, T, S, Z, J, L
const SHAPES = [
  [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  [[1, 1], [1, 1]],
  [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
];

const LINE_SCORES = [0, 100, 300, 500, 800];
const HOLD_DELAY = 0.18;   // seconds before key repeat starts
const HOLD_REPEAT = 0.06;  // seconds between repeats
const SOFT_INTERVAL = 0.05;

function rotateCW(m) {
  const n = m.length;
  const out = Array.from({ length: n }, () => Array(n).fill(0));
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      out[c][n - 1 - r] = m[r][c];
    }
  }
  return out;
}

class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
  }

  create() {
    this.board = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
    this.score = 0;
    this.lines = 0;
    this.state = 'playing';
    this.leftHold = 0;
    this.rightHold = 0;
    this.leftRepeat = 0;
    this.rightRepeat = 0;
    this.softTimer = 0;
    this.nextIdx = Phaser.Math.Between(0, SHAPES.length - 1);

    this.boardGfx = this.add.graphics();
    this.previewGfx = this.add.graphics();

    const panelX = BOARD_X + COLS * CELL + 60;
    this.add.text(panelX, BOARD_Y, '下一个', { fontSize: '20px', color: '#ffffff' });
    this.scoreText = this.add.text(panelX, 210, '', { fontSize: '20px', color: '#ffffff' });
    this.linesText = this.add.text(panelX, 245, '', { fontSize: '20px', color: '#ffffff' });
    this.levelText = this.add.text(panelX, 280, '', { fontSize: '20px', color: '#ffffff' });
    this.add.text(panelX, 340,
      '← → 移动\n↑ 旋转\n↓ 加速\n空格 硬降\nP 暂停', { fontSize: '16px', color: '#888888' });

    this.overlayText = this.add.text(190, 320, '', {
      fontSize: '36px',
      color: '#ffffff',
      align: 'center',
      backgroundColor: '#00000088',
      padding: { x: 16, y: 12 },
    }).setOrigin(0.5).setVisible(false);

    this.cursors = this.input.keyboard.createCursorKeys();
    const onKey = (name, fn) => {
      this.input.keyboard.on(name, (event) => {
        if (!event.repeat) fn();
      });
    };
    onKey('keydown-LEFT', () => this.movePiece(-1));
    onKey('keydown-RIGHT', () => this.movePiece(1));
    onKey('keydown-UP', () => this.rotatePiece());
    onKey('keydown-SPACE', () => this.hardDrop());
    onKey('keydown-DOWN', () => this.softDrop());
    onKey('keydown-P', () => this.togglePause());
    this.input.keyboard.on('keydown-R', (event) => {
      if (!event.repeat && this.state === 'over') this.scene.restart();
    });

    this.dropTimer = this.time.addEvent({
      delay: this.dropDelay(),
      loop: true,
      callback: () => this.drop(),
    });
    this.spawnPiece();
  }

  update(time, delta) {
    if (this.state !== 'playing') return;
    const dt = delta / 1000;

    if (this.cursors.left.isDown) {
      this.leftHold += dt;
      if (this.leftHold > HOLD_DELAY) {
        this.leftRepeat -= dt;
        if (this.leftRepeat <= 0) {
          this.movePiece(-1);
          this.leftRepeat = HOLD_REPEAT;
        }
      }
    } else {
      this.leftHold = 0;
    }

    if (this.cursors.right.isDown) {
      this.rightHold += dt;
      if (this.rightHold > HOLD_DELAY) {
        this.rightRepeat -= dt;
        if (this.rightRepeat <= 0) {
          this.movePiece(1);
          this.rightRepeat = HOLD_REPEAT;
        }
      }
    } else {
      this.rightHold = 0;
    }

    if (this.cursors.down.isDown) {
      this.softTimer -= dt;
      if (this.softTimer <= 0) {
        this.softDrop();
        this.softTimer = SOFT_INTERVAL;
      }
    }

    this.draw();
  }

  canPlace(shape, px, py) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const bx = px + c;
        const by = py + r;
        if (bx < 0 || bx >= COLS || by >= ROWS) return false;
        if (by >= 0 && this.board[by][bx] !== -1) return false;
      }
    }
    return true;
  }

  spawnPiece() {
    const idx = this.nextIdx;
    this.nextIdx = Phaser.Math.Between(0, SHAPES.length - 1);
    const shape = SHAPES[idx];
    this.piece = {
      idx,
      shape,
      x: Math.floor((COLS - shape[0].length) / 2),
      y: 0,
    };
    if (!this.canPlace(shape, this.piece.x, this.piece.y)) {
      this.gameOver();
    }
    this.drawPreview();
  }

  movePiece(dx) {
    if (this.state !== 'playing') return;
    const { shape, x, y } = this.piece;
    if (this.canPlace(shape, x + dx, y)) {
      this.piece.x += dx;
    }
  }

  rotatePiece() {
    if (this.state !== 'playing') return;
    const rotated = rotateCW(this.piece.shape);
    for (const kick of [0, -1, 1, -2, 2]) {
      if (this.canPlace(rotated, this.piece.x + kick, this.piece.y)) {
        this.piece.shape = rotated;
        this.piece.x += kick;
        return;
      }
    }
  }

  // returns true if the piece moved down
  drop() {
    if (this.state !== 'playing') return false;
    const { shape, x, y } = this.piece;
    if (this.canPlace(shape, x, y + 1)) {
      this.piece.y += 1;
      return true;
    }
    this.lockPiece();
    return false;
  }

  softDrop() {
    if (this.drop()) {
      this.score += 1;
      this.updatePanel();
    }
  }

  hardDrop() {
    if (this.state !== 'playing') return;
    let dist = 0;
    while (this.canPlace(this.piece.shape, this.piece.x, this.piece.y + 1)) {
      this.piece.y += 1;
      dist++;
    }
    this.score += dist * 2;
    this.updatePanel();
    this.lockPiece();
  }

  lockPiece() {
    const { shape, x, y, idx } = this.piece;
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c] && y + r >= 0) {
          this.board[y + r][x + c] = idx;
        }
      }
    }
    this.clearLines();
    this.spawnPiece();
  }

  clearLines() {
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (this.board[r].every((v) => v !== -1)) {
        this.board.splice(r, 1);
        this.board.unshift(Array(COLS).fill(-1));
        cleared++;
        r++;
      }
    }
    if (cleared > 0) {
      this.lines += cleared;
      this.score += LINE_SCORES[cleared] * this.level();
      this.updatePanel();
      this.dropTimer.reset({ delay: this.dropDelay(), loop: true, callback: () => this.drop() });
    }
  }

  level() {
    return Math.floor(this.lines / 10) + 1;
  }

  dropDelay() {
    return Math.max(1000 - (this.level() - 1) * 90, 120);
  }

  ghostY() {
    let gy = this.piece.y;
    while (this.canPlace(this.piece.shape, this.piece.x, gy + 1)) gy++;
    return gy;
  }

  togglePause() {
    if (this.state === 'over') return;
    if (this.state === 'playing') {
      this.state = 'paused';
      this.dropTimer.paused = true;
      this.overlayText.setText('已暂停').setVisible(true);
    } else {
      this.state = 'playing';
      this.dropTimer.paused = false;
      this.overlayText.setVisible(false);
    }
  }

  gameOver() {
    this.state = 'over';
    this.dropTimer.paused = true;
    this.overlayText.setText('游戏结束\n按 R 重新开始').setVisible(true);
  }

  updatePanel() {
    this.scoreText.setText(`分数: ${this.score}`);
    this.linesText.setText(`行数: ${this.lines}`);
    this.levelText.setText(`等级: ${this.level()}`);
  }

  drawPreview() {
    const g = this.previewGfx;
    g.clear();
    const boxSize = 96;
    const cell = boxSize / 4;
    const px = BOARD_X + COLS * CELL + 60;
    const py = BOARD_Y + 40;
    g.fillStyle(0x101820);
    g.fillRect(px, py, boxSize, boxSize);
    const shape = SHAPES[this.nextIdx];
    const ox = (boxSize - shape[0].length * cell) / 2;
    const oy = (boxSize - shape.length * cell) / 2;
    g.fillStyle(COLORS[this.nextIdx]);
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (shape[r][c]) {
          g.fillRect(px + ox + c * cell + 1, py + oy + r * cell + 1, cell - 2, cell - 2);
        }
      }
    }
  }

  draw() {
    const g = this.boardGfx;
    g.clear();

    g.fillStyle(0x101820);
    g.fillRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL);

    const drawPiece = (shape, x, y, color, alpha) => {
      g.fillStyle(color, alpha);
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (shape[r][c] && y + r >= 0) {
            g.fillRect(
              BOARD_X + (x + c) * CELL + 1,
              BOARD_Y + (y + r) * CELL + 1,
              CELL - 2,
              CELL - 2
            );
          }
        }
      }
    };

    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const v = this.board[r][c];
        if (v !== -1) {
          g.fillStyle(COLORS[v]);
          g.fillRect(BOARD_X + c * CELL + 1, BOARD_Y + r * CELL + 1, CELL - 2, CELL - 2);
        }
      }
    }

    // ghost piece
    if (this.state === 'playing' && this.piece) {
      const gy = this.ghostY();
      if (gy > this.piece.y) {
        drawPiece(this.piece.shape, this.piece.x, gy, COLORS[this.piece.idx], 0.25);
      }
      drawPiece(this.piece.shape, this.piece.x, this.piece.y, COLORS[this.piece.idx], 1);
    }

    g.lineStyle(2, 0xffffff, 0.3);
    g.strokeRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL);
  }
}

const config = {
  type: Phaser.AUTO,
  parent: 'game',
  width: 560,
  height: 640,
  backgroundColor: '#16213e',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
};

new Phaser.Game(config);
