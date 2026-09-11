import { clamp, compassPoint, cosd, formatLat, formatLon, wrap180 } from '../core/math';
import { LANDMASSES } from '../world/landmass';
import { PORTS, portDef } from '../world/ports';
import type { Game } from '../game/state';
import { append, button, clear, el } from './dom';

/**
 * The chart table.
 *
 * What is drawn here is the pilot's chart, not the world. Coastlines appear
 * where he believed he was when he saw them, so a coast surveyed on a passage
 * with a bad reckoning is drawn in the wrong place and stays wrong. There is no
 * mark showing where the ship truly is, because no such information exists
 * aboard.
 */
export class ChartView {
  root = el('div', { class: 'screen' });

  private canvas = el('canvas', { id: 'chart-canvas' }) as HTMLCanvasElement;
  private overlay = el('div', { class: 'chart-overlay' });
  private tools = el('div', { class: 'chart-tools' });
  private voyage = el('div', { class: 'chart-voyage' });
  private wrap = el('div', { class: 'chart-wrap' });

  private centre = { lat: 38, lon: -12 };
  /** Pixels per degree of latitude. */
  private scale = 16;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private showTrack = true;
  private showPlaces = true;
  private showTrue = false;
  private selectedPort: string | null = null;
  /** The last thing the chart table said back, shown until something else happens. */
  private notice: string | null = null;
  private game: Game | null = null;
  private onClose: () => void;

  constructor(onClose: () => void) {
    this.onClose = onClose;

    this.wrap.append(this.canvas, this.overlay, this.tools, this.voyage, buildLegend());

    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'The chart'),
        el('div', { class: 'sub' }, 'Drawn from the reckoning, and no better than the reckoning'),
      ),
      el('div', { class: 'screen-body', style: { padding: '0', overflow: 'hidden' } }, this.wrap),
      el('div', { class: 'screen-foot' },
        button('Close  (C)', () => this.onClose()),
      ),
    );

    this.bindPointer();
  }

  open(g: Game): void {
    this.game = g;
    this.centre = { ...g.nav.estimated };
    this.buildTools();
    this.buildVoyage();
    this.resize();
    this.draw();
  }

  resize(): void {
    const rect = this.wrap.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.canvas.style.width = `${rect.width}px`;
    this.canvas.style.height = `${rect.height}px`;
    this.draw();
  }

  private buildTools(): void {
    clear(this.tools);
    append(this.tools,
      button('Centre on the reckoning', () => {
        if (this.game) this.centre = { ...this.game.nav.estimated };
        this.draw();
      }),
      button(this.showTrack ? 'Hide the track' : 'Show the track', () => {
        this.showTrack = !this.showTrack; this.buildTools(); this.draw();
      }),
      button(this.showPlaces ? 'Hide names' : 'Show names', () => {
        this.showPlaces = !this.showPlaces; this.buildTools(); this.draw();
      }),
      button(
        this.selectedPort ? `Steer for ${portDef(this.selectedPort).name}` : 'Steer for this spot',
        () => this.steerForSelection(),
        { primary: true },
      ),
      this.game?.destination
        ? button('Cancel the course', () => {
          this.game?.clearDestination(); this.buildTools(); this.buildVoyage(); this.draw();
        })
        : null,
      button('Name this place', () => this.namePlace()),
      button(this.showTrue ? 'Hide the true coast' : 'Compare with the truth', () => {
        this.showTrue = !this.showTrue; this.buildTools(); this.draw();
      }, { title: 'A modern overlay showing where the land actually is. No pilot of this century had this.' }),
    );
  }

  /**
   * What the voyage is for, on the chart, where a pilot would plan it.
   *
   * The chart drew everything the ship had found and nothing about what she was
   * sent to do, so it was a readout — a beautiful one, but you looked at it
   * rather than worked at it. The commission belongs here: each place the King
   * named, how far off it is on your own chart and on what bearing, and a click
   * to lay the course for it. The survey and the doubt in the reckoning are
   * here for the same reason — they are the two numbers that decide whether to
   * stand in with the land or take a sight.
   */
  private buildVoyage(): void {
    const g = this.game;
    clear(this.voyage);
    if (!g) return;

    const patent = g.crown.patent;
    const rows: (Node | null)[] = [];

    if (patent) {
      rows.push(el('div', { class: 'chart-voyage-title' }, patent.title));
      for (const o of patent.objectives) {
        const def = o.target ? PORTS.find((x) => x.id === o.target) : undefined;
        const course = def ? g.courseTo(def.id) : null;
        const detail = o.complete
          ? 'done'
          : course
            ? `${course.bearing.toFixed(0)}° ${compassPoint(course.bearing)} · ${course.distNm.toFixed(0)} miles`
            : o.amount
              ? `${Math.floor(o.progress)} of ${o.amount}`
              : 'open';
        // A place the King named is one click from being the course steered.
        const steerable = !o.complete && !!def && o.kind !== 'return';
        rows.push(el('div', {
          class: `chart-voyage-row${o.complete ? ' done' : ''}${steerable ? ' steerable' : ''}`,
          title: steerable ? `Lay off a course for ${def!.name}` : undefined,
          onclick: steerable
            ? () => {
              g.setDestinationPort(def!.id);
              this.buildTools();
              this.buildVoyage();
              this.draw();
            }
            : undefined,
        },
          el('span', {}, o.description),
          el('em', {}, detail),
        ));
      }
    } else {
      rows.push(el('div', { class: 'chart-voyage-title' }, 'No commission'),
        el('div', { class: 'chart-voyage-row' },
          el('span', {}, 'Sailing on your own account'), el('em', {}, '')));
    }

    rows.push(el('div', { class: 'chart-voyage-rule' }));
    rows.push(el('div', { class: 'chart-voyage-row' },
      el('span', {}, 'Coast surveyed this passage'),
      el('em', {}, `${g.chartedThisPassage.toFixed(0)} miles`)));
    rows.push(el('div', { class: 'chart-voyage-row' },
      el('span', {}, 'Doubt in your position'),
      el('em', {}, `± ${Math.max(g.nav.sigmaLat, g.nav.sigmaLon).toFixed(0)} miles`)));
    rows.push(el('div', { class: 'chart-voyage-row' },
      el('span', {}, 'Since the last observation'),
      el('em', {}, `${g.nav.milesSinceFix.toFixed(0)} miles`)));

    append(this.voyage, ...rows);
  }

  /**
   * Lay off a course for the selected port, or for the middle of the chart if
   * nothing is selected — which is how a pilot marks a spot he means to make
   * for and has no name for yet.
   */
  private steerForSelection(): void {
    const g = this.game;
    if (!g) return;
    if (this.selectedPort) {
      const charted = g.chart.ports.get(this.selectedPort);
      const def = portDef(this.selectedPort);
      // Steer for where it is on *your* chart, not where it truly is.
      const at = charted ?? { lat: def.lat, lon: def.lon };
      g.setDestination(def.name, at.lat, at.lon);
    } else {
      g.setDestination('the marked spot', this.centre.lat, this.centre.lon);
    }
    this.buildTools();
    this.buildVoyage();
    this.draw();
  }

  private namePlace(): void {
    const g = this.game;
    if (!g) return;
    const name = window.prompt('What will you call this place?', 'Cabo de ');
    if (name === null) return;
    const r = g.namePlace(name);
    this.notice = r.message;
    this.buildVoyage();
    this.draw();
    this.updateOverlay(g.nav.estimated);
  }

  private bindPointer(): void {
    this.canvas.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointerup', (e) => {
      this.dragging = false;
      this.canvas.releasePointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.dragging) { this.hover(e); return; }
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.centre.lat = clamp(this.centre.lat + dy / this.scale, -60, 72);
      this.centre.lon = wrap180(this.centre.lon - dx / (this.scale * Math.max(cosd(this.centre.lat), 0.15)));
      this.draw();
    });
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.85 : 1.18;
      this.scale = clamp(this.scale * factor, 0.6, 420);
      this.draw();
    }, { passive: false });
    this.canvas.addEventListener('click', (e) => this.pick(e));
  }

  private toScreen(lat: number, lon: number): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const k = Math.max(cosd(this.centre.lat), 0.15);
    return {
      x: rect.width / 2 + wrap180(lon - this.centre.lon) * this.scale * k,
      y: rect.height / 2 - (lat - this.centre.lat) * this.scale,
    };
  }

  private toGeo(x: number, y: number): { lat: number; lon: number } {
    const rect = this.canvas.getBoundingClientRect();
    const k = Math.max(cosd(this.centre.lat), 0.15);
    return {
      lat: this.centre.lat - (y - rect.height / 2) / this.scale,
      lon: wrap180(this.centre.lon + (x - rect.width / 2) / (this.scale * k)),
    };
  }

  private hover(e: PointerEvent): void {
    const rect = this.canvas.getBoundingClientRect();
    const p = this.toGeo(e.clientX - rect.left, e.clientY - rect.top);
    this.updateOverlay(p);
  }

  private pick(e: MouseEvent): void {
    const g = this.game;
    if (!g) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    let best: string | null = null;
    let bestD = 16;
    for (const cp of g.chart.ports.values()) {
      const s = this.toScreen(cp.lat, cp.lon);
      const d = Math.hypot(s.x - mx, s.y - my);
      if (d < bestD) { bestD = d; best = cp.id; }
    }
    this.selectedPort = best;
    this.notice = null;
    this.draw();
    this.updateOverlay(this.toGeo(mx, my));
  }

  private updateOverlay(p: { lat: number; lon: number }): void {
    const g = this.game;
    if (!g) return;
    clear(this.overlay);

    const nodes: (Node | string)[] = [
      this.notice
        ? el('div', { class: 'chart-notice' }, this.notice)
        : '',
      el('div', { style: { fontWeight: '600', marginBottom: '4px' } }, 'Cursor'),
      el('div', {}, `${formatLat(p.lat)}`),
      el('div', { style: { marginBottom: '7px' } }, `${formatLon(p.lon)}`),
    ];

    if (this.selectedPort) {
      const def = portDef(this.selectedPort);
      const course = g.courseTo(this.selectedPort);
      const rel = g.relationsFor(this.selectedPort);
      nodes.push(
        el('div', { style: { borderTop: '1px solid rgba(90,74,55,0.3)', paddingTop: '6px', fontWeight: '600' } }, def.name),
        def.modern ? el('div', { style: { fontStyle: 'italic', fontSize: '11.5px', opacity: '0.75' } }, def.modern) : '',
        course
          ? el('div', { style: { marginTop: '4px' } },
              `Course ${course.bearing.toFixed(0)}° ${compassPoint(course.bearing)}, ${course.distNm.toFixed(0)} miles by the chart`)
          : '',
        el('div', { style: { marginTop: '3px', fontSize: '11.5px' } },
          rel.met ? (rel.mayTrade ? 'Trade permitted here.' : 'Known, but no leave to trade.') : 'Not yet visited.'),
      );
    } else {
      nodes.push(el('div', { style: { fontSize: '11.5px', fontStyle: 'italic', opacity: '0.72' } },
        'Drag to move the chart, scroll to change the scale, click a port for a course.'));
    }

    for (const n of nodes) this.overlay.append(typeof n === 'string' ? document.createTextNode(n) : n);
  }

  draw(): void {
    const g = this.game;
    const ctx = this.canvas.getContext('2d');
    if (!g || !ctx) return;

    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Vellum.
    const grad = ctx.createLinearGradient(0, 0, rect.width, rect.height);
    grad.addColorStop(0, '#ece0c4');
    grad.addColorStop(0.5, '#e2d4b2');
    grad.addColorStop(1, '#d3c199');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, rect.width, rect.height);

    this.drawGraticule(ctx, rect);
    this.drawRhumbNetwork(ctx, rect);
    if (this.showTrue) this.drawTrueCoast(ctx);
    this.drawChartedCoast(ctx, g);
    if (this.showTrack) this.drawTrack(ctx, g);
    this.drawPorts(ctx, g);
    if (this.showPlaces) this.drawPlaces(ctx, g);
    this.drawLeads(ctx, g);
    this.drawPadroes(ctx, g);
    this.drawRivalFrontier(ctx, g, rect);
    this.drawCourse(ctx, g);
    this.drawReckoning(ctx, g);
    this.drawScaleBar(ctx, rect);
  }

  private drawGraticule(ctx: CanvasRenderingContext2D, rect: DOMRect): void {
    ctx.strokeStyle = 'rgba(120, 96, 60, 0.18)';
    ctx.fillStyle = 'rgba(90, 74, 55, 0.55)';
    ctx.font = '10px serif';
    ctx.lineWidth = 1;

    const step = this.scale > 60 ? 1 : this.scale > 22 ? 2 : this.scale > 9 ? 5 : 10;
    const topLeft = this.toGeo(0, 0);
    const bottomRight = this.toGeo(rect.width, rect.height);

    const latTop = Math.min(topLeft.lat, 84);
    for (let lat = Math.ceil(Math.max(bottomRight.lat, -84) / step) * step; lat <= latTop; lat += step) {
      const y = this.toScreen(lat, this.centre.lon).y;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
      ctx.fillText(`${Math.abs(lat)}° ${lat >= 0 ? 'N' : 'S'}`, 5, y - 3);
      if (lat === 0) {
        ctx.save();
        ctx.strokeStyle = 'rgba(168, 50, 40, 0.4)';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
        ctx.fillStyle = 'rgba(168, 50, 40, 0.75)';
        ctx.font = 'italic 12px serif';
        ctx.fillText('A Linha Equinocial', 60, y - 6);
        ctx.restore();
      }
      // The tropics, which the regimento tables are built around.
      if (Math.abs(Math.abs(lat) - 23) < step * 0.5 && step <= 5) {
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = 'rgba(120, 96, 60, 0.32)';
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke();
        ctx.restore();
      }
    }

    const lonStart = Math.floor(topLeft.lon / step) * step;
    for (let i = 0; i <= 90; i++) {
      const lon = lonStart + i * step;
      if (lon > bottomRight.lon + step) break;
      const x = this.toScreen(this.centre.lat, lon).x;
      if (x < -50 || x > rect.width + 50) continue;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke();
      ctx.fillStyle = 'rgba(90, 74, 55, 0.55)';
      ctx.font = '10px serif';
      ctx.fillText(`${Math.abs(wrap180(lon))}° ${wrap180(lon) >= 0 ? 'E' : 'W'}`, x + 3, 12);
    }
  }

  /** The radiating rhumb lines that give a portolan chart its character. */
  private drawRhumbNetwork(ctx: CanvasRenderingContext2D, rect: DOMRect): void {
    const roses = [
      { x: rect.width * 0.28, y: rect.height * 0.34 },
      { x: rect.width * 0.74, y: rect.height * 0.66 },
    ];
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.lineWidth = 0.7;
    for (const r of roses) {
      for (let i = 0; i < 32; i++) {
        const a = (i * 11.25 * Math.PI) / 180;
        ctx.strokeStyle = i % 8 === 0 ? '#8a3a2a' : i % 4 === 0 ? '#4a6a3a' : '#6a5638';
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x + Math.sin(a) * 4000, r.y - Math.cos(a) * 4000);
        ctx.stroke();
      }
    }
    ctx.restore();

    // A compass rose over the first node.
    const r = roses[0];
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.strokeStyle = '#7a5a34';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(r.x, r.y, 30, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(r.x, r.y, 22, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#8a3a2a';
    ctx.beginPath();
    ctx.moveTo(r.x, r.y - 34); ctx.lineTo(r.x - 4, r.y - 22); ctx.lineTo(r.x + 4, r.y - 22);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  private drawChartedCoast(ctx: CanvasRenderingContext2D, g: Game): void {
    // Group the charted points by landmass and by ring order, then stroke runs
    // of consecutive vertices so the coast reads as a line rather than dots.
    // Two passes, and the split is the whole point of the screen.
    //
    // Coast you have run yourself is drawn firm. Coast you inherited from the
    // Casa's chart — which for everything south of Morocco is a long way from
    // where the land really is — is drawn faint and broken, the way a
    // cartographer draws a coast he has only been told about. It is the same
    // ink either way, so the player can see at a glance which part of his own
    // chart he would stake the ship on, and that turns running a known coast
    // from scenery into work worth doing.
    const byLand = new Map<number, { index: number; lat: number; lon: number; sure: boolean }[]>();
    for (const p of g.chart.points.values()) {
      const idx = Number(p.key.split(':')[1]);
      let arr = byLand.get(p.land);
      if (!arr) byLand.set(p.land, (arr = []));
      arr.push({ index: idx, lat: p.lat, lon: p.lon, sure: p.errorNm <= 20 });
    }

    ctx.lineWidth = 1.6;
    ctx.strokeStyle = '#4a3520';
    ctx.lineJoin = 'round';

    for (const [land, pts] of byLand) {
      pts.sort((a, b) => a.index - b.index);
      const ringLength = LANDMASSES[land].ring.length / 2;
      let run: { index: number; lat: number; lon: number; sure: boolean }[] = [];

      const flush = () => {
        if (run.length < 2) {
          if (run.length === 1) {
            const s = this.toScreen(run[0].lat, run[0].lon);
            ctx.fillStyle = run[0].sure ? '#4a3520' : 'rgba(74, 53, 32, 0.4)';
            ctx.beginPath(); ctx.arc(s.x, s.y, 1.4, 0, Math.PI * 2); ctx.fill();
          }
          run = [];
          return;
        }
        const sure = run[0].sure;
        ctx.save();
        if (!sure) {
          ctx.strokeStyle = 'rgba(74, 53, 32, 0.42)';
          ctx.setLineDash([6, 5]);
          ctx.lineWidth = 1.3;
        }
        ctx.beginPath();
        for (let i = 0; i < run.length; i++) {
          const s = this.toScreen(run[i].lat, run[i].lon);
          if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        }
        ctx.stroke();

        // A little hachuring on the landward side, portolan fashion. Only on
        // coast somebody has actually seen.
        if (sure) {
          ctx.globalAlpha = 0.2;
          ctx.lineWidth = 3.5;
          ctx.stroke();
        }
        ctx.restore();
        run = [];
      };

      for (const p of pts) {
        if (run.length === 0) { run.push(p); continue; }
        const prev = run[run.length - 1];
        const gap = p.index - prev.index;
        const joined = gap === 1 || (prev.index === ringLength - 1 && p.index === 0);
        // A run is broken where the coast stops being consecutive *or* where it
        // changes from surveyed to hearsay, so the two are never stroked as one
        // line in one style.
        if (joined && p.sure === prev.sure) run.push(p);
        else { flush(); run.push(p); }
      }
      flush();
    }
  }

  private drawTrueCoast(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    ctx.strokeStyle = 'rgba(60, 110, 160, 0.45)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 3]);
    for (const land of LANDMASSES) {
      const r = land.ring;
      ctx.beginPath();
      for (let i = 0; i < r.length; i += 2) {
        const s = this.toScreen(r[i], r[i + 1]);
        if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawTrack(ctx: CanvasRenderingContext2D, g: Game): void {
    if (g.chart.track.length < 2) return;
    ctx.save();
    ctx.strokeStyle = 'rgba(168, 50, 40, 0.55)';
    ctx.lineWidth = 1.3;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    for (let i = 0; i < g.chart.track.length; i++) {
      const p = g.chart.track[i];
      const s = this.toScreen(p.lat, p.lon);
      if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
    }
    ctx.stroke();
    ctx.restore();
  }

  private drawPorts(ctx: CanvasRenderingContext2D, g: Game): void {
    ctx.font = '11px serif';
    for (const cp of g.chart.ports.values()) {
      const def = portDef(cp.id);
      const s = this.toScreen(cp.lat, cp.lon);
      if (s.x < -60 || s.x > this.canvas.width || s.y < -30 || s.y > this.canvas.height) continue;

      const rel = g.relationsFor(cp.id);
      const selected = this.selectedPort === cp.id;
      const size = def.size === 'emporium' ? 5.5 : def.size === 'city' ? 4.5 : def.size === 'town' ? 3.5 : 2.5;

      ctx.beginPath();
      ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
      ctx.fillStyle = def.feitoria || rel.factory
        ? '#a83228'
        : cp.visited ? '#4a3520' : 'rgba(74, 53, 32, 0.42)';
      ctx.fill();

      if (selected) {
        ctx.strokeStyle = '#a83228';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.arc(s.x, s.y, size + 4.5, 0, Math.PI * 2); ctx.stroke();
      }

      if (this.scale > 3 || def.size === 'emporium' || def.size === 'city') {
        ctx.fillStyle = cp.visited ? '#2a1f14' : 'rgba(42, 31, 20, 0.5)';
        ctx.fillText(def.name, s.x + size + 3, s.y + 3.5);
      }
    }
  }

  /**
   * Hearsay, pricked off.
   *
   * Drawn as a circle rather than a point, because that is what a rumour
   * actually is: somewhere in there, probably, according to a man in a wine
   * shop. The circle is the error the teller is worth, and a wide one is the
   * game telling the player exactly how much water he will have to search.
   */
  private drawLeads(ctx: CanvasRenderingContext2D, g: Game): void {
    for (const l of g.openLeads) {
      const s = this.toScreen(l.lat, l.lon);
      // The error circle, in the chart's own scale.
      const edge = this.toScreen(l.lat + l.errorNm / 60, l.lon);
      const r = Math.max(Math.abs(edge.y - s.y), 4);
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = 'rgba(120, 74, 40, 0.55)';
      ctx.fillStyle = 'rgba(170, 130, 70, 0.10)';
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // A query mark at the centre: the cartographer's own admission.
      ctx.fillStyle = '#7a4a20';
      ctx.font = 'italic bold 13px serif';
      ctx.textAlign = 'center';
      ctx.fillText('?', s.x, s.y + 4.5);
      ctx.textAlign = 'left';
      ctx.font = 'italic 10.5px serif';
      ctx.fillStyle = 'rgba(122, 74, 32, 0.9)';
      ctx.fillText(shortSource(l.source), s.x + r + 4, s.y + 3.5);
    }
  }

  /** Pillars standing. The only mark on this chart that is not an opinion. */
  private drawPadroes(ctx: CanvasRenderingContext2D, g: Game): void {
    for (const p of g.crown.padraoSites) {
      const s = this.toScreen(p.lat, p.lon);
      ctx.save();
      ctx.strokeStyle = '#3c5a8a';
      ctx.fillStyle = '#3c5a8a';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y + 5);
      ctx.lineTo(s.x, s.y - 7);
      ctx.stroke();
      // The cross on top of it.
      ctx.beginPath();
      ctx.moveTo(s.x - 3.5, s.y - 5);
      ctx.lineTo(s.x + 3.5, s.y - 5);
      ctx.stroke();
      ctx.font = '10px serif';
      ctx.fillText(p.name, s.x + 6, s.y + 14);
      ctx.restore();
    }
  }

  /**
   * How far the other man has got.
   *
   * A line across the chart with his name on it, and everything below it is
   * still there to be found. It is the single most motivating object on the
   * screen, which is why it is drawn in a colour that does not belong on a
   * chart of your own making.
   */
  private drawRivalFrontier(ctx: CanvasRenderingContext2D, g: Game, rect: DOMRect): void {
    const r = g.rival;
    if (r.eclipsed) return;
    const y = this.toScreen(r.frontierLat, this.centre.lon).y;
    if (y < -20 || y > rect.height + 20) return;
    ctx.save();
    ctx.setLineDash([9, 6]);
    ctx.strokeStyle = 'rgba(120, 40, 100, 0.5)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(rect.width, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(110, 34, 92, 0.85)';
    ctx.font = 'italic 11px serif';
    ctx.fillText(`${r.name} is reported this far`, 12, y - 5);
    ctx.restore();
  }

  private drawPlaces(ctx: CanvasRenderingContext2D, g: Game): void {
    ctx.font = 'italic 11px serif';
    ctx.fillStyle = '#5a4a37';
    for (const p of g.chart.places) {
      const s = this.toScreen(p.lat, p.lon);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y - 4); ctx.lineTo(s.x + 3.5, s.y + 3); ctx.lineTo(s.x - 3.5, s.y + 3);
      ctx.closePath();
      ctx.fill();
      ctx.fillText(p.name, s.x + 6, s.y + 3.5);
    }
  }

  /** The reckoned position and the circle of doubt around it. */
  /**
   * The course laid off to the mark she is bound for: a ruled line from the
   * reckoning to the place, and the mark itself. Drawn from the reckoned
   * position, because that is the line the pilot would actually rule on his own
   * chart, and it is wrong in exactly the way his reckoning is wrong.
   */
  private drawCourse(ctx: CanvasRenderingContext2D, g: Game): void {
    const d = g.destination;
    if (!d) return;
    const from = this.toScreen(g.nav.estimated.lat, g.nav.estimated.lon);
    const to = this.toScreen(d.lat, d.lon);

    ctx.save();
    ctx.strokeStyle = 'rgba(140, 60, 40, 0.75)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);

    // The mark: a ruled cross, as a pilot pricks off a place he means to make.
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(to.x - 7, to.y); ctx.lineTo(to.x + 7, to.y);
    ctx.moveTo(to.x, to.y - 7); ctx.lineTo(to.x, to.y + 7);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(to.x, to.y, 9, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = 'rgba(140, 60, 40, 0.9)';
    ctx.font = 'italic 12px Georgia, serif';
    ctx.textAlign = 'left';
    ctx.fillText(d.name, to.x + 13, to.y - 9);
    ctx.restore();
  }

  private drawReckoning(ctx: CanvasRenderingContext2D, g: Game): void {
    const e = g.nav.estimated;
    const s = this.toScreen(e.lat, e.lon);
    const k = Math.max(cosd(this.centre.lat), 0.15);

    const rLat = (g.nav.sigmaLat / 60) * this.scale;
    const rLon = (g.nav.sigmaLon / 60 / Math.max(cosd(e.lat), 0.2)) * this.scale * k;

    // The error in longitude is much the larger, and it never shrinks.
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.beginPath();
    ctx.ellipse(0, 0, Math.max(rLon, 2), Math.max(rLat, 2), 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(168, 50, 40, 0.10)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(168, 50, 40, 0.5)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate((g.ship.state.heading * Math.PI) / 180);
    ctx.fillStyle = '#a83228';
    ctx.beginPath();
    ctx.moveTo(0, -8); ctx.lineTo(5, 7); ctx.lineTo(0, 4); ctx.lineTo(-5, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = '#a83228';
    ctx.font = 'italic 11px serif';
    ctx.fillText('by the reckoning', s.x + 10, s.y - 8);
  }

  private drawScaleBar(ctx: CanvasRenderingContext2D, rect: DOMRect): void {
    // A bar in leagues, which is what these charts were graduated in.
    const targetPx = 130;
    const degPerPx = 1 / this.scale;
    const leaguesPerDeg = 17.5; // Portuguese league of four Italian miles
    let leagues = degPerPx * targetPx * leaguesPerDeg;
    const nice = [10, 25, 50, 100, 250, 500, 1000, 2000];
    leagues = nice.reduce((a, b) => (Math.abs(b - leagues) < Math.abs(a - leagues) ? b : a), nice[0]);
    const px = (leagues / leaguesPerDeg) * this.scale;

    // Bottom centre: the corners belong to the legend and the commission.
    const x = rect.width / 2 - px / 2;
    const y = rect.height - 22;
    ctx.save();
    ctx.strokeStyle = '#4a3520';
    ctx.fillStyle = '#4a3520';
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y - 5); ctx.lineTo(x, y + 5);
    ctx.moveTo(x, y); ctx.lineTo(x + px, y);
    ctx.moveTo(x + px, y - 5); ctx.lineTo(x + px, y + 5);
    ctx.stroke();
    for (let i = 1; i < 4; i++) {
      const tx = x + (px * i) / 4;
      ctx.beginPath(); ctx.moveTo(tx, y - 3); ctx.lineTo(tx, y + 3); ctx.stroke();
    }
    ctx.font = '11px serif';
    ctx.fillText(`${leagues} léguas`, x + px / 2 - 24, y - 9);
    ctx.restore();
  }
}

function buildLegend(): HTMLElement {
  const item = (color: string, label: string) =>
    el('div', {}, el('i', { style: { background: color } }), el('span', {}, label));
  return el('div', { class: 'chart-legend' },
    item('#4a3520', 'Coast you have run yourself'),
    item('rgba(74,53,32,0.42)', 'On the Casa\u2019s chart, position doubtful'),
    item('#a83228', 'Portuguese factory'),
    item('#3c5a8a', 'A padrão of yours'),
    item('rgba(170,130,70,0.55)', 'Where a rumour points'),
    item('rgba(110,34,92,0.6)', 'How far the other man has got'),
    el('div', { style: { marginTop: '5px', fontStyle: 'italic', opacity: '0.7', maxWidth: '190px', lineHeight: '1.4' } },
      el('span', {}, 'The dotted ellipse is the doubt in your own position, not a margin on the chart.')),
  );
}

/** "a pilot at Malindi" → "a pilot", for a label with no room. */
function shortSource(source: string): string {
  const at = source.lastIndexOf(' at ');
  return at > 0 ? source.slice(0, at) : source;
}
