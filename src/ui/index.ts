import { clamp } from '../core/math';
import type { Game, GameMode } from '../game/state';
import { AudienceView } from './audienceView';
import { ChartView } from './chartView';
import { CourtView } from './courtView';
import { CrewView } from './crewView';
import { clear, el } from './dom';
import { Hud } from './hud';
import { LogbookView } from './logbookView';
import { PortView } from './portView';
import { SightView } from './sightView';
import { GameOverView, TitleView } from './titleView';

const SAVE_KEY = 'carreira-da-india:save';

export interface UiCallbacks {
  onNewGame: () => void;
  onContinue: () => void;
  onCycleCamera: () => void;
}

/**
 * Owns every screen and decides which one is showing. The sailing view is the
 * 3D scene with the head-up display over it; everything else is a full-screen
 * panel that suspends the clock while it is open.
 */
export class Ui {
  root: HTMLElement;
  hud = new Hud();

  private chart: ChartView;
  private sight: SightView;
  private logbook: LogbookView;
  private crew: CrewView;
  private port: PortView;
  private audience: AudienceView;
  private court: CourtView;
  private overlay = el('div', { id: 'overlay' });
  private game: Game | null = null;
  private cb: UiCallbacks;

  constructor(host: HTMLElement, cb: UiCallbacks) {
    this.root = host;
    this.cb = cb;

    const back = () => this.setMode('sailing');
    this.chart = new ChartView(back);
    this.sight = new SightView(back);
    this.logbook = new LogbookView(back);
    this.crew = new CrewView(back);
    this.port = new PortView(back, () => this.setMode('audience'), () => this.setMode('court'));
    this.audience = new AudienceView(() => this.setMode('port'));
    this.court = new CourtView(() => this.setMode('port'));

    host.append(this.hud.root, this.overlay);
    this.hud.setVisible(false);
  }

  attach(g: Game): void {
    this.game = g;
    this.setMode(g.mode);
  }

  showTitle(): void {
    this.game = null;
    this.hud.setVisible(false);
    clear(this.overlay);
    const hasSave = !!localStorage.getItem(SAVE_KEY);
    const t = new TitleView(this.cb.onNewGame, this.cb.onContinue, hasSave);
    this.overlay.append(t.root);
  }

  setMode(mode: GameMode): void {
    const g = this.game;
    if (!g) return;
    g.mode = mode;
    g.clock.paused = mode !== 'sailing';

    clear(this.overlay);
    this.hud.setVisible(mode === 'sailing');

    switch (mode) {
      case 'sailing':
        break;
      case 'chart':
        this.overlay.append(this.chart.root);
        this.chart.open(g);
        requestAnimationFrame(() => this.chart.resize());
        break;
      case 'sight':
        this.overlay.append(this.sight.root);
        this.sight.open(g);
        break;
      case 'logbook':
        this.overlay.append(this.logbook.root);
        this.logbook.open(g);
        break;
      case 'crew':
        this.overlay.append(this.crew.root);
        this.crew.open(g);
        break;
      case 'port':
        if (!g.dockedAt) { this.setMode('sailing'); return; }
        this.overlay.append(this.port.root);
        this.port.open(g);
        break;
      case 'audience':
        this.overlay.append(this.audience.root);
        this.audience.open(g);
        break;
      case 'court':
        this.overlay.append(this.court.root);
        this.court.open(g);
        break;
      case 'gameover':
        this.overlay.append(new GameOverView(g, g.gameOverReason ?? 'The ship was lost.', this.cb.onNewGame).root);
        break;
      case 'title':
        this.showTitle();
        break;
      default:
        break;
    }
  }

  update(g: Game): void {
    if (g.mode === 'gameover' && !this.overlay.querySelector('.screen')) {
      this.setMode('gameover');
      return;
    }
    if (g.mode === 'sailing') this.hud.update(g);
  }

  resize(): void {
    if (this.game?.mode === 'chart') this.chart.resize();
  }

  /** Returns true when the key was consumed. */
  handleKey(e: KeyboardEvent, g: Game): boolean {
    const k = e.key.toLowerCase();

    if (k === 'escape') {
      if (g.mode === 'audience') { this.setMode('port'); return true; }
      if (g.mode === 'court') { this.setMode('port'); return true; }
      if (g.mode !== 'sailing' && g.mode !== 'gameover' && g.mode !== 'title') {
        this.setMode('sailing');
        return true;
      }
      return false;
    }

    // Typing in a field should never steer the ship.
    const active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return false;

    if (g.mode !== 'sailing') {
      // Toggling the same panel closes it.
      const toggles: Record<string, GameMode> = { c: 'chart', n: 'sight', l: 'logbook', k: 'crew', p: 'port' };
      if (toggles[k] === g.mode) { this.setMode('sailing'); return true; }
      return false;
    }

    switch (k) {
      case 'c': this.setMode('chart'); return true;
      case 'n': this.setMode('sight'); return true;
      case 'l': this.setMode('logbook'); return true;
      case 'k': this.setMode('crew'); return true;
      case 'p':
        if (g.dockedAt) { this.setMode('port'); return true; }
        return false;
      case 'v': this.cb.onCycleCamera(); return true;
      case 'r':
        if (g.sounding.aground) {
          g.pushAlert(g.tryRefloat(), 'note');
          return true;
        }
        return false;
      case ' ': {
        if (g.sounding.aground) { g.pushAlert(g.tryRefloat(), 'note'); return true; }
        if (g.anchored) g.pushAlert(g.weighAnchor(), 'note');
        else g.pushAlert(g.letGoAnchor(), 'note');
        if (g.dockedAt && g.anchored) this.setMode('port');
        return true;
      }
      case '[': g.clock.cycleScale(-1); return true;
      case ']': g.clock.cycleScale(1); return true;
      case 't': g.autoTrim = !g.autoTrim;
        g.pushAlert(g.autoTrim ? 'The watch will keep her trimmed.' : 'You have the sheets yourself.', 'note');
        return true;
      case 'f5':
        this.save(g); return true;
      default:
        return false;
    }
  }

  save(g: Game): void {
    try {
      localStorage.setItem(SAVE_KEY, g.serialize());
      g.pushAlert('The voyage is recorded.', 'note');
    } catch {
      g.pushAlert('Could not write the save.', 'warning');
    }
  }

  static loadSave(): string | null {
    try {
      return localStorage.getItem(SAVE_KEY);
    } catch {
      return null;
    }
  }

  static clearSave(): void {
    try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  }
}

/** Continuous key state for the helm and the sails. */
export class InputState {
  private down = new Set<string>();
  private pointerDown = false;
  private lastPointer = { x: 0, y: 0 };
  lookDelta = { x: 0, y: 0 };
  wheelDelta = 0;

  attach(canvas: HTMLCanvasElement): void {
    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.down.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.down.clear());

    canvas.addEventListener('pointerdown', (e) => {
      this.pointerDown = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointerup', (e) => {
      this.pointerDown = false;
      canvas.releasePointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.pointerDown) return;
      this.lookDelta.x += e.clientX - this.lastPointer.x;
      this.lookDelta.y += e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.wheelDelta += e.deltaY;
    }, { passive: false });
  }

  isDown(k: string): boolean {
    return this.down.has(k);
  }

  /** Helm demand from the keys, -1 to 1. */
  helmAxis(): number {
    let v = 0;
    if (this.isDown('a') || this.isDown('arrowleft')) v -= 1;
    if (this.isDown('d') || this.isDown('arrowright')) v += 1;
    return v;
  }

  canvasAxis(): number {
    let v = 0;
    if (this.isDown('s') || this.isDown('arrowdown')) v -= 1;
    if (this.isDown('w') || this.isDown('arrowup')) v += 1;
    return v;
  }

  trimAxis(): number {
    let v = 0;
    if (this.isDown('q')) v -= 1;
    if (this.isDown('e')) v += 1;
    return v;
  }

  consumeLook(): { x: number; y: number } {
    const d = { ...this.lookDelta };
    this.lookDelta = { x: 0, y: 0 };
    return d;
  }

  consumeWheel(): number {
    const d = this.wheelDelta;
    this.wheelDelta = 0;
    return clamp(d, -400, 400);
  }
}
