/**
 * The last coat: two cheap layers laid over the picture in the page, not in the
 * shader, so they cost the GPU nothing.
 *
 * A vignette, which does most of what a lens does for a picture — it keeps the
 * eye off the corners, where a flat parchment-coloured HUD sits on flat sky —
 * and grows with the dark and with the weather. And a glare where the sun is
 * in the frame: the sky's sun is a sprite the tone curve holds below white, and
 * a real lens blooms round anything that bright. Together they are the
 * difference between a render and a photograph.
 */
export class Finish {
  private vignette: HTMLDivElement;
  private glare: HTMLDivElement;
  private lastV = -1;
  private lastGlare = '';

  constructor(canvas: HTMLCanvasElement) {
    this.vignette = document.createElement('div');
    this.vignette.id = 'finish-vignette';
    this.glare = document.createElement('div');
    this.glare.id = 'finish-glare';
    canvas.insertAdjacentElement('afterend', this.glare);
    canvas.insertAdjacentElement('afterend', this.vignette);
  }

  /**
   * `night` and `overcast` are 0 to 1. `sun` is where the sun is on screen as
   * fractions of the width and height, and how strongly it should bloom, or
   * null when it is behind the camera, below the horizon or clouded out.
   */
  update(night: number, overcast: number, sun: { x: number; y: number; strength: number; warm: number } | null, photo: boolean): void {
    const v = (0.26 + night * 0.16 + overcast * 0.10) * (photo ? 0.8 : 1);
    if (Math.abs(v - this.lastV) > 0.004) {
      this.lastV = v;
      this.vignette.style.opacity = v.toFixed(3);
    }
    let key = '';
    if (sun && sun.strength > 0.02) {
      key = `${(sun.x * 100).toFixed(1)}|${(sun.y * 100).toFixed(1)}|${sun.strength.toFixed(2)}|${sun.warm.toFixed(2)}`;
    }
    if (key === this.lastGlare) return;
    this.lastGlare = key;
    if (!sun || sun.strength <= 0.02) {
      this.glare.style.opacity = '0';
      return;
    }
    const s = this.glare.style;
    s.opacity = sun.strength.toFixed(3);
    s.setProperty('--gx', `${(sun.x * 100).toFixed(2)}%`);
    s.setProperty('--gy', `${(sun.y * 100).toFixed(2)}%`);
    // White at noon, amber when the sun is low.
    const r = 255, g = Math.round(250 - sun.warm * 70), b = Math.round(235 - sun.warm * 140);
    s.setProperty('--gc', `${r}, ${g}, ${b}`);
  }
}
