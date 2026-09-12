import { clamp } from '../core/math';
import type { Difficulty } from '../game/difficulty';
import type { Game, GameMode } from '../game/state';
import { AudienceView } from './audienceView';
import { ChartView } from './chartView';
import { RutterView } from './rutterView';
import { BookView, isBookSection } from './bookView';
import { CourtView } from './courtView';
import { CrewView } from './crewView';
import { clear, el } from './dom';
import { EventView } from './eventView';
import { Hud } from './hud';
import { LogbookView } from './logbookView';
import { EpilogueView } from './epilogueView';
import { OrdersView } from './ordersView';
import { PortView } from './portView';
import { SightView } from './sightView';
import { GameOverView, TitleView } from './titleView';
import { TouchControls } from './touch';
import { DeckBar } from './deckBar';
import { ShoreView } from './shoreView';

const SAVE_KEY = 'carreira-da-india:save';

export interface UiCallbacks {
  onNewGame: (difficulty: Difficulty) => void;
  onContinue: () => void;
  onCycleCamera: () => void;
  /** Hold or release a virtual key, for the on-screen controls. */
  onVirtualKey: (key: string, down: boolean) => void;
  /** Turn the sound on or off. Returns whether it is now on. */
  onToggleSound: () => boolean;
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
  private rutter: RutterView;
  private book: BookView;
  /** The page the book was last left open at. */
  private lastSection: GameMode = 'chart';
  private sight: SightView;
  private logbook: LogbookView;
  private crew: CrewView;
  private port: PortView;
  private audience: AudienceView;
  private court: CourtView;
  private shore: ShoreView;
  private orders: OrdersView;
  private overlay = el('div', { id: 'overlay' });
  private touch: TouchControls;
  private bar: DeckBar;
  private events: EventView;
  private game: Game | null = null;
  private cb: UiCallbacks;

  constructor(host: HTMLElement, cb: UiCallbacks) {
    this.root = host;
    this.cb = cb;
    this.touch = new TouchControls({
      setKey: (k, down) => cb.onVirtualKey(k, down),
      tapKey: (k) => {
        const g = this.game;
        if (g) this.handleKey({ key: k, preventDefault() {} } as KeyboardEvent, g);
      },
    });

    // The same routing as the thumb controls, so a click and a key press are
    // the same event as far as everything downstream is concerned.
    this.bar = new DeckBar({
      tapKey: (k) => {
        const g = this.game;
        if (g) this.handleKey({ key: k, preventDefault() {} } as KeyboardEvent, g);
      },
    });

    this.events = new EventView((i) => this.game?.resolveEvent(i));

    const back = () => this.setMode('sailing');
    this.chart = new ChartView(back);
    this.rutter = new RutterView(back);
    this.book = new BookView((m) => this.setMode(m));
    this.sight = new SightView(back);
    this.logbook = new LogbookView(back);
    this.crew = new CrewView(back);
    this.port = new PortView(back, () => this.setMode('audience'), () => this.setMode('court'));
    this.audience = new AudienceView(() => this.setMode('port'));
    this.court = new CourtView(() => this.setMode('port'));
    this.shore = new ShoreView(back, () => this.setMode('chart'));
    this.orders = new OrdersView(back, () => this.setMode('chart'));

    host.append(this.hud.root, this.touch.root, this.bar.root, this.events.root, this.overlay);
    this.hud.setVisible(false);
  }

  attach(g: Game): void {
    this.game = g;
    this.setMode(g.mode);
  }

  showTitle(): void {
    this.game = null;
    this.hud.setVisible(false);
    this.touch.setVisible(false);
    this.bar.setVisible(false);
    clear(this.overlay);
    // Reading localStorage throws outright in some privacy modes, which would
    // otherwise take the title screen down with it before anything is drawn.
    const hasSave = !!Ui.loadSave();
    const t = new TitleView(this.cb.onNewGame, this.cb.onContinue, hasSave);
    this.overlay.append(t.root);
  }

  /**
   * Show one section of the book, and remember it as the page it is left at.
   *
   * The page is built before it is bound in, because the chart measures its own
   * canvas against the element it is sitting in and has to be attached first.
   */
  private openBook(mode: GameMode, page: HTMLElement, build: () => void): void {
    this.lastSection = mode;
    this.overlay.append(this.book.root);
    this.book.show(mode, page);
    build();
  }

  setMode(mode: GameMode): void {
    const g = this.game;
    if (!g) return;
    g.mode = mode;
    g.clock.paused = mode !== 'sailing';

    clear(this.overlay);
    this.hud.setVisible(mode === 'sailing');
    this.touch.setVisible(mode === 'sailing');
    this.bar.setVisible(mode === 'sailing');

    switch (mode) {
      case 'sailing':
        break;
      // The five sections of the one book. Each is the screen it always was;
      // the book only binds them and puts tabs on the head.
      case 'rutter':
        this.openBook(mode, this.rutter.root, () => this.rutter.open(g));
        break;
      case 'chart':
        this.openBook(mode, this.chart.root, () => {
          this.chart.open(g);
          requestAnimationFrame(() => this.chart.resize());
        });
        break;
      case 'sight':
        this.overlay.append(this.sight.root);
        this.sight.open(g);
        break;
      case 'logbook':
        this.openBook(mode, this.logbook.root, () => this.logbook.open(g));
        break;
      case 'crew':
        this.openBook(mode, this.crew.root, () => this.crew.open(g));
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
      case 'shore':
        this.overlay.append(this.shore.root);
        this.shore.open(g);
        break;
      case 'court':
        this.overlay.append(this.court.root);
        this.court.open(g);
        break;
      case 'orders':
        this.openBook(mode, this.orders.root, () => this.orders.open(g));
        break;
      case 'epilogue':
        this.overlay.append(new EpilogueView(g, () => this.cb.onNewGame(g.difficulty)).root);
        break;
      case 'gameover':
        this.overlay.append(new GameOverView(g, g.gameOverReason ?? 'The ship was lost.', () => this.cb.onNewGame(g.difficulty)).root);
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
    // The route is open. Everything after this belongs to somebody else.
    if (g.crown.routeOpened && g.mode !== 'epilogue' && g.mode !== 'title') {
      this.setMode('epilogue');
      return;
    }
    if (g.mode === 'sailing') {
      this.hud.update(g);
      this.touch.setRate(g.clock.scaleLabel);
      this.bar.setRate(g.clock.scaleLabel, g.clock.paused || g.clock.scaleIndex === 0);
      this.bar.setAnchored(g.anchored || !!g.dockedAt);
      this.events.show(g.pendingEvent);
      // The controls go quiet while a decision is outstanding: pressing the
      // helm against a ship whose clock is stopped only reads as a bug.
      this.touch.setVisible(!g.pendingEvent);
      this.bar.setVisible(!g.pendingEvent);
    } else {
      this.events.show(null);
    }
  }

  resize(): void {
    if (this.game?.mode === 'chart') this.chart.resize();
  }

  /** Returns true when the key was consumed. */
  handleKey(e: KeyboardEvent, g: Game): boolean {
    const k = e.key.toLowerCase();

    // A decision on deck takes precedence over everything else aboard.
    if (g.pendingEvent?.choices) {
      return this.events.handleKey(e, g.pendingEvent.choices.length);
    }

    if (k === 'escape') {
      if (g.mode === 'shore') { this.setMode('sailing'); return true; }
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
      const toggles: Record<string, GameMode> = {
        c: 'chart', j: 'rutter', n: 'sight', l: 'logbook', k: 'crew', p: 'port', o: 'orders',
      };
      const want = toggles[k];
      // Toggling the same panel closes it.
      if (want === g.mode) { this.setMode('sailing'); return true; }
      // Inside the book, the letter printed on a tab turns to that tab.
      //
      // It did not, which made five key caps on the head of the book into a
      // promise the book did not keep: with the chart open, L and O and K did
      // nothing at all, and the only way between sections was the mouse. They
      // are one document — moving about inside it without putting it down is
      // most of the reason it was bound in the first place.
      if (want && isBookSection(g.mode) && isBookSection(want)) {
        this.setMode(want);
        return true;
      }
      return false;
    }

    switch (k) {
      case 'c': this.setMode('chart'); return true;
      case 'n': this.setMode('sight'); return true;
      case 'l': this.setMode('logbook'); return true;
      case 'k': this.setMode('crew'); return true;
      case 'o': this.setMode('orders'); return true;
      case 'p':
        if (g.dockedAt) { this.setMode('port'); return true; }
        if (g.anchored && g.shoreHere) { this.setMode('shore'); return true; }
        return false;
      case 'v': this.cb.onCycleCamera(); return true;
      case 'm': {
        const on = this.cb.onToggleSound();
        g.pushAlert(on ? 'Sound on.' : 'Sound off.', 'note');
        return true;
      }
      case 'u': {
        // Land a pillar. The one act in the game that leaves something behind.
        const check = g.padraoCheck();
        if (!check.ok) { g.pushAlert(check.reason, 'warning'); return true; }
        g.pushAlert(g.raisePadrao(), 'note');
        return true;
      }
      case 'j':
        // The book, open at the page it was left at — which is how a book is
        // actually used, and means one key reaches everything.
        this.setMode(isBookSection(this.lastSection) ? this.lastSection : 'rutter');
        return true;
      case 't':
        // About ship. The order a windward passage is made of.
        g.pushAlert(g.aboutShip(), 'note');
        return true;
      case 'b':
        // Astern. Wanted most when she is on the sand, so it is a key and not
        // something buried in a panel.
        g.pushAlert(g.backHer(), 'note');
        return true;
      case ' ': {
        if (g.anchored) g.pushAlert(g.weighAnchor(), 'note');
        else g.pushAlert(g.letGoAnchor(), 'note');
        if (g.dockedAt && g.anchored) this.setMode('port');
        else if (g.anchored && g.shoreHere) this.setMode('shore');
        return true;
      }
      case '[': g.clock.cycleScale(-1); return true;
      case ']': g.clock.cycleScale(1); return true;
      case 'h': {
        // One thing now: give up your own course and let her go back to steering
        // for the mark. The helm is never "yours" to hand over — the watch have
        // it always — so the only question H can answer is whether she is
        // steering the captain's course or the chart's.
        if (g.helmOrder !== null && g.destination) {
          g.resumeCourseForMark();
          g.pushAlert(`The watch will keep her for ${g.destination.name}.`, 'note');
          return true;
        }
        g.steadyAsSheGoes();
        g.pushAlert(
          `Steady at ${(g.helmOrder ?? 0).toFixed(0).padStart(3, '0')}\u00b0.`, 'note');
        return true;
      }
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

  /** Write the voyage out without saying anything about it. */
  static saveQuietly(g: Game): void {
    try { localStorage.setItem(SAVE_KEY, g.serialize()); } catch { /* nowhere to put it */ }
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

    /**
     * Looking about, and closing in.
     *
     * One pointer drags the view round the ship, which is the same whether it
     * is a mouse or a thumb. Two fingers pinch, because there is no wheel on a
     * phone and the camera distance is otherwise fixed for the whole voyage;
     * the pinch is fed in as wheel movement so that both ways of doing it go
     * down the same path and cannot drift apart.
     */
    const live = new Map<number, { x: number; y: number }>();
    let pinchFrom = 0;
    const spread = () => {
      const [a, b] = [...live.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };

    canvas.addEventListener('pointerdown', (e) => {
      live.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this.pointerDown = live.size === 1;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      if (live.size === 2) pinchFrom = spread();
      // A browser throws if the pointer has already been released — which
      // happens easily with two thumbs — and an exception here would take the
      // whole frame loop down with it.
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not ours */ }
    });
    const lift = (e: PointerEvent) => {
      live.delete(e.pointerId);
      this.pointerDown = false;
      pinchFrom = 0;
      // A finger lifted out of a pinch resumes looking from where it is, rather
      // than swinging the view by the distance between the two.
      const rest = [...live.values()][0];
      if (rest) { this.lastPointer = { ...rest }; this.pointerDown = true; }
      try {
        if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      } catch { /* already gone */ }
    };
    canvas.addEventListener('pointerup', lift);
    canvas.addEventListener('pointercancel', lift);
    canvas.addEventListener('pointermove', (e) => {
      if (!live.has(e.pointerId)) return;
      live.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (live.size >= 2) {
        const now = spread();
        if (pinchFrom > 8 && now > 8) {
          // Fingers apart draws her nearer, which is the way round everybody
          // expects a map or a camera to work.
          this.wheelDelta -= (now - pinchFrom) * 2;
          pinchFrom = now;
        }
        return;
      }

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

  /**
   * Hold or release a key from something other than the keyboard.
   *
   * The on-screen controls come in here rather than having a path of their own,
   * so a thumb on the helm and a finger on the A key are, from everything
   * downstream, the same event.
   */
  setVirtual(k: string, down: boolean): void {
    if (down) this.down.add(k);
    else this.down.delete(k);
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
