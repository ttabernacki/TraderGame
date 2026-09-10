import { angleDelta, wrap360 } from '../core/math';
import type { Game } from '../game/state';
import { el } from './dom';

/**
 * The heading tape.
 *
 * A strip of compass across the top of the view, scrolling as she swings, with
 * everything the helmsman needs to steer by drawn on the same scale: the wind,
 * the water he cannot get to, and the course he is trying to make.
 *
 * The whole difficulty of a sailing game is that three quantities — where she
 * heads, where the wind is, and where you want to go — are all bearings, and
 * reading them off three separate dials means holding the arithmetic in your
 * head. Put on one scale they answer the question directly: the mark is over
 * there, the wind is over here, and the red band between them is the reason you
 * cannot simply steer at it.
 */
export class HeadingTape {
  root = el('canvas', { id: 'heading-tape' }) as HTMLCanvasElement;

  /** Degrees of compass shown across the whole strip. */
  private span = 140;
  private width = 0;
  private height = 0;

  constructor() {
    this.resize();
  }

  resize(): void {
    const rect = this.root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.width = Math.max(rect.width, 1);
    this.height = Math.max(rect.height, 1);
    this.root.width = Math.round(this.width * dpr);
    this.root.height = Math.round(this.height * dpr);
    const ctx = this.root.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // On a narrow screen a wide span squeezes the marks together, so show less
    // compass and let the tape scroll faster instead.
    this.span = this.width < 620 ? 110 : 140;
  }

  update(g: Game): void {
    const ctx = this.root.getContext('2d');
    if (!ctx) return;
    if (Math.abs(this.root.getBoundingClientRect().width - this.width) > 1) this.resize();

    const w = this.width;
    const h = this.height;
    ctx.clearRect(0, 0, w, h);

    const heading = g.displayHeading;
    const perDeg = w / this.span;
    /** Where a compass bearing falls on the strip, or null when it is off it. */
    const x = (bearing: number): number => w / 2 + angleDelta(heading, bearing) * perDeg;
    const onTape = (px: number) => px > -20 && px < w + 20;

    // --- The water she cannot sail to --------------------------------------
    // Everything within the no-go angle either side of the wind's eye. Drawn
    // first and darkly, so the ticks and the marks sit on top of it.
    const windEye = g.weatherNow.wind.from;
    const noGo = g.noGoAngle;
    ctx.fillStyle = 'rgba(150, 44, 34, 0.30)';
    for (const side of [-1, 1]) {
      const a = x(wrap360(windEye + side * noGo));
      const b = x(windEye);
      const left = Math.min(a, b);
      const width = Math.abs(b - a);
      // Only when the two edges are both near the middle of the tape: at the
      // wrap-around they land on opposite ends and would fill the whole strip.
      if (width < w * 0.75) ctx.fillRect(left, 0, width, h);
    }

    // --- Ticks and labels --------------------------------------------------
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const first = Math.ceil((heading - this.span / 2) / 5) * 5;
    for (let b = first; b <= heading + this.span / 2; b += 5) {
      const px = x(wrap360(b));
      if (!onTape(px)) continue;
      const bearing = wrap360(b);
      const major = bearing % 30 < 0.01 || bearing % 30 > 29.99;
      ctx.strokeStyle = major ? 'rgba(224, 212, 186, 0.85)' : 'rgba(224, 212, 186, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 0.5, h - (major ? 13 : 7));
      ctx.lineTo(px + 0.5, h);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = 'rgba(232, 220, 192, 0.9)';
        ctx.font = '11px Georgia, serif';
        ctx.fillText(CARDINALS[bearing] ?? String(Math.round(bearing)).padStart(3, '0'), px, h - 17);
      }
    }

    // --- The wind ----------------------------------------------------------
    // Where it is blowing from, which is the bearing a sailor names it by.
    const windX = x(windEye);
    const windLabel = `${g.weatherNow.wind.speed.toFixed(0)} kn`;
    if (onTape(windX)) {
      drawMark(ctx, windX, h, WIND_COLOUR, 'wind');
      ctx.fillStyle = WIND_COLOUR;
      ctx.font = '11px Georgia, serif';
      ctx.textAlign = 'center';
      ctx.fillText(windLabel, windX, 12);
    } else {
      // Abaft the beam and off the strip. The wind is the one thing that must
      // never disappear from the display — a helmsman who cannot see where it is
      // cannot decide anything — so it is pinned to the edge it went off.
      const right = angleDelta(heading, windEye) > 0;
      ctx.fillStyle = WIND_COLOUR;
      ctx.font = '11px Georgia, serif';
      ctx.textAlign = right ? 'right' : 'left';
      const edge = right ? w - 6 : 6;
      ctx.fillText(`${right ? '' : '◄ '}${windLabel}${right ? ' ►' : ''}`, edge, h - 6);
    }

    // --- The course she is trying to make ----------------------------------
    const dest = g.courseToDestination();
    if (dest) {
      const px = x(dest.bearing);
      if (onTape(px)) {
        drawMark(ctx, px, h, '#e0b64a', 'course');
        ctx.fillStyle = '#e0b64a';
        ctx.font = '11px Georgia, serif';
        ctx.textAlign = 'center';
        ctx.fillText(dest.name.length > 18 ? `${dest.name.slice(0, 17)}…` : dest.name, px, 12);
      } else {
        // Off the strip: an arrow at the edge saying which way to put the helm.
        const right = angleDelta(heading, dest.bearing) > 0;
        ctx.fillStyle = '#e0b64a';
        ctx.font = '15px Georgia, serif';
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(right ? '›› ' : ' ‹‹', right ? w - 4 : 4, h - 12);
      }
    }

    // --- Her head ----------------------------------------------------------
    ctx.strokeStyle = '#f4ead2';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2, h - 20);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.fillStyle = '#f4ead2';
    ctx.beginPath();
    ctx.moveTo(w / 2, h - 20);
    ctx.lineTo(w / 2 - 6, h - 28);
    ctx.lineTo(w / 2 + 6, h - 28);
    ctx.closePath();
    ctx.fill();
  }
}

const WIND_COLOUR = '#7fc4e8';

const CARDINALS: Record<number, string> = {
  0: 'N', 30: '030', 60: '060', 90: 'E', 120: '120', 150: '150',
  180: 'S', 210: '210', 240: '240', 270: 'W', 300: '300', 330: '330',
};

/** A pointer hanging from the top of the tape. */
function drawMark(
  ctx: CanvasRenderingContext2D, px: number, h: number, colour: string, kind: 'wind' | 'course',
): void {
  ctx.save();
  ctx.fillStyle = colour;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (kind === 'wind') {
    // A barb, pointing down the way the wind is going.
    ctx.moveTo(px, h - 6);
    ctx.lineTo(px - 6, h - 18);
    ctx.lineTo(px + 6, h - 18);
  } else {
    // A diamond, which is how a mark is pricked off on a chart.
    ctx.moveTo(px, h - 6);
    ctx.lineTo(px - 6, h - 14);
    ctx.lineTo(px, h - 22);
    ctx.lineTo(px + 6, h - 14);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
