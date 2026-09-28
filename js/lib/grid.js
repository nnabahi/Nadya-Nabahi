/* =========================================================
   CanvasGrid — a small reusable helper for drawing/interacting
   with rectangular cell grids on a <canvas>. Used by every
   grid-based simulation (automata, sandpiles, tilings, ...).
   ========================================================= */

export class CanvasGrid {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {number} cols
   * @param {number} rows
   * @param {number} cellSize  pixel size of one cell
   */
  constructor(canvas, cols, rows, cellSize) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.resize(cols, rows, cellSize);
  }

  resize(cols, rows, cellSize) {
    this.cols = cols;
    this.rows = rows;
    this.cellSize = cellSize;
    this.canvas.width = cols * cellSize;
    this.canvas.height = rows * cellSize;
  }

  clear(color = "#0f1115") {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Fill one cell. Row 0 is drawn at the TOP of the canvas. */
  fillCell(col, row, color) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(
      col * this.cellSize,
      row * this.cellSize,
      this.cellSize,
      this.cellSize
    );
  }

  /** Convert a mouse/click event to {col,row}, or null if outside the grid. */
  eventToCell(evt) {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    const x = (evt.clientX - rect.left) * scaleX;
    const y = (evt.clientY - rect.top) * scaleY;
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return null;
    return { col, row };
  }
}
