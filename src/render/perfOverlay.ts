/**
 * R0: a readout for the person holding the real hardware.
 *
 * F7 (or `?perf=1`) toggles it. It shows frame time as the page sees it (mean
 * and 95th percentile over the last two seconds), GPU time where the browser
 * lets a page ask for it (EXT_disjoint_timer_query_webgl2: Chrome on desktop and
 * most Android; not Safari), what the last frame drew, and what the post stack
 * costs in memory. Nothing here runs unless it is switched on.
 */
import type * as THREE from 'three';

export interface PerfSource {
  gl: THREE.WebGLRenderer;
  tier: string;
  mode: string;
  postBytes: number;
  postPasses: number;
}

export class PerfOverlay {
  private el: HTMLDivElement | null = null;
  private times: number[] = [];
  private shown = false;
  private lastDraw = 0;
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null = null;
  private query: WebGLQuery | null = null;
  private pending: WebGLQuery[] = [];
  private gpuMs = NaN;
  private gl2: WebGL2RenderingContext | null = null;
  /** The last frame's totals, for tests and the harness. */
  last = { calls: 0, triangles: 0, lines: 0, points: 0 };

  constructor() {
    try {
      if (new URLSearchParams(location.search).get('perf')) this.shown = true;
    } catch { /* ignore */ }
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F7') { this.shown = !this.shown; if (!this.shown && this.el) this.el.style.display = 'none'; e.preventDefault(); }
    });
  }

  get on(): boolean { return this.shown; }

  /** Call before the frame's drawing; resets the counters. */
  begin(gl: THREE.WebGLRenderer): void {
    gl.info.reset();
    if (!this.shown) return;
    const ctx = gl.getContext() as WebGL2RenderingContext;
    if (!this.gl2) {
      this.gl2 = ctx;
      this.ext = ctx.getExtension('EXT_disjoint_timer_query_webgl2') as typeof this.ext;
    }
    if (this.ext && !this.query) {
      this.query = ctx.createQuery();
      if (this.query) ctx.beginQuery(this.ext.TIME_ELAPSED_EXT, this.query);
    }
  }

  /** Call after the frame's drawing. */
  end(src: PerfSource, realDt: number): void {
    const info = src.gl.info;
    this.last = { calls: info.render.calls, triangles: info.render.triangles, lines: info.render.lines, points: info.render.points };
    if (!this.shown) return;
    const ctx = this.gl2;
    if (ctx && this.ext && this.query) {
      ctx.endQuery(this.ext.TIME_ELAPSED_EXT);
      this.pending.push(this.query);
      this.query = null;
    }
    if (ctx && this.ext) {
      while (this.pending.length) {
        const q = this.pending[0];
        if (!ctx.getQueryParameter(q, ctx.QUERY_RESULT_AVAILABLE)) break;
        const disjoint = ctx.getParameter(this.ext.GPU_DISJOINT_EXT);
        if (!disjoint) this.gpuMs = Number(ctx.getQueryParameter(q, ctx.QUERY_RESULT)) / 1e6;
        ctx.deleteQuery(q);
        this.pending.shift();
      }
    }
    if (realDt > 0 && realDt < 1) this.times.push(realDt * 1000);
    if (this.times.length > 240) this.times.splice(0, this.times.length - 240);
    const now = performance.now();
    if (now - this.lastDraw < 500) return;
    this.lastDraw = now;
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.style.cssText = 'position:fixed;left:8px;top:8px;z-index:9999;padding:6px 8px;background:rgba(0,0,0,.62);color:#cfe;font:11px/1.35 ui-monospace,Menlo,monospace;white-space:pre;pointer-events:none;border-radius:4px';
      document.body.appendChild(this.el);
    }
    this.el.style.display = 'block';
    const sorted = [...this.times].sort((a, b) => a - b);
    const mean = sorted.reduce((a, b) => a + b, 0) / Math.max(sorted.length, 1);
    const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
    const m = info.memory;
    this.el.textContent =
      `${src.mode}/${src.tier}  ${(1000 / Math.max(mean, 0.01)).toFixed(0)} fps\n` +
      `frame ${mean.toFixed(1)} ms  p95 ${p95.toFixed(1)} ms\n` +
      `gpu   ${Number.isNaN(this.gpuMs) ? 'n/a' : this.gpuMs.toFixed(1) + ' ms'}\n` +
      `draws ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(0)}k\n` +
      `progs ${info.programs?.length ?? 0}  geo ${m.geometries}  tex ${m.textures}\n` +
      `post  ${src.postPasses} passes  ${(src.postBytes / 1048576).toFixed(1)} MB RT`;
  }
}
