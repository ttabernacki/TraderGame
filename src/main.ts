import './style.css';

import { DEG, clamp } from './core/math';
import { Game } from './game/state';
import { KNOTS } from './ship/physics';
import { sightingRangeNm } from './navigation/charts';
import { Renderer, type RenderFrame } from './render/renderer';
import { InputState, Ui } from './ui';

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiHost = document.getElementById('ui') as HTMLElement;

let game: Game | null = null;
let renderer: Renderer | null = null;
let renderedHullId = '';

const input = new InputState();
input.attach(canvas);

const ui = new Ui(uiHost, {
  onNewGame: () => startNew(),
  onContinue: () => continueSaved(),
  onCycleCamera: () => {
    if (!renderer || !game) return;
    const mode = renderer.cycleCamera();
    game.pushAlert(
      { chase: 'From astern', deck: 'From the quarterdeck', beam: 'From off the beam', masthead: 'From the masthead' }[mode],
      'note',
    );
  },
});

function startNew(): void {
  game = new Game();
  game.mode = 'sailing';
  ensureRenderer(game);
  ui.attach(game);
  ui.setMode('port');
}

function continueSaved(): void {
  const raw = Ui.loadSave();
  if (!raw) { startNew(); return; }
  try {
    game = Game.deserialize(raw);
  } catch {
    startNew();
    return;
  }
  ensureRenderer(game);
  ui.attach(game);
  ui.setMode(game.dockedAt ? 'port' : 'sailing');
}

function ensureRenderer(g: Game): void {
  if (!renderer) {
    renderer = new Renderer(canvas, g.ship.hull);
    renderedHullId = g.ship.hullId;
  } else if (renderedHullId !== g.ship.hullId) {
    renderer.setHull(g.ship.hull);
    renderedHullId = g.ship.hullId;
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

window.addEventListener('keydown', (e) => {
  if (!game) return;
  if (ui.handleKey(e, game)) e.preventDefault();
});

window.addEventListener('resize', () => {
  renderer?.resize();
  ui.resize();
});

/** Continuous controls, applied every frame while the sailing view is up. */
function applyContinuousInput(g: Game, dt: number): void {
  if (g.mode !== 'sailing') return;

  const helm = input.helmAxis();
  if (helm !== 0) {
    g.setHelm(clamp(g.ship.state.rudder + helm * dt * 1.8, -1, 1));
  } else {
    // The helmsman lets her come back toward amidships when nobody is pulling.
    g.ship.state.rudder *= Math.max(0, 1 - dt * 2.2);
  }

  const canvasAxis = input.canvasAxis();
  if (canvasAxis !== 0) {
    g.setCanvas(clamp(g.ship.canvasSet + canvasAxis * dt * 0.42, 0, 1));
  }

  const trim = input.trimAxis();
  if (trim !== 0) g.adjustTrim(trim * dt * 26);

  if (renderer) {
    const look = input.consumeLook();
    if (look.x !== 0 || look.y !== 0) {
      renderer.lookYaw = clamp(renderer.lookYaw + look.x * 0.25, -180, 180);
      renderer.lookPitch = clamp(renderer.lookPitch - look.y * 0.2, -55, 60);
    }
    const wheel = input.consumeWheel();
    if (wheel !== 0) {
      renderer.distance = clamp(renderer.distance * (1 + wheel * 0.0015), 12, 260);
    }
  }
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

let last = performance.now();

function frame(now: number): void {
  const realDt = Math.min((now - last) / 1000, 0.1);
  last = now;

  if (game && renderer) {
    ensureRenderer(game);
    applyContinuousInput(game, realDt);

    const before = game.clock.t;
    game.update(realDt);
    const simDt = game.clock.t - before;

    renderer.render(buildFrame(game), realDt, simDt);
    ui.update(game);
  }

  requestAnimationFrame(frame);
}

function buildFrame(g: Game): RenderFrame {
  const p = g.physics;
  const cogRad = p.courseOverGround * DEG;
  const ground = p.groundKnots * KNOTS;

  // Normalised drawing force per sail, for how hard the canvas bellies.
  const q = 0.5 * 1.225 * Math.pow(p.apparentKnots * KNOTS, 2);
  const pressures = p.perSail.map((f, i) => {
    const mast = g.ship.hull.masts[i];
    const sail = g.ship.state.sails[i];
    const area = Math.max(mast.area * sail.set * sail.condition, 1e-3);
    if (q * area < 1e-3) return 0;
    const coefficient = f.load / (q * area);
    const sign = f.aoa < 0 ? -1 : 1;
    return clamp((coefficient / 1.8) * sign, -1, 1);
  });

  return {
    pos: g.ship.state.pos,
    heading: g.ship.state.heading,
    heel: g.ship.state.heel,
    velocityE: Math.sin(cogRad) * ground,
    velocityN: Math.cos(cogRad) * ground,
    sails: g.ship.state.sails,
    trimSign: p.beta >= 0 ? -1 : 1,
    sailPressures: pressures,
    apparentBeta: p.beta,
    apparentKnots: p.apparentKnots,
    speedKnots: p.speedKnots,
    windFrom: g.weatherNow.wind.from,
    windKnots: g.weatherNow.wind.speed,
    waveHeight: g.weatherNow.waveHeight,
    swellFrom: g.weatherNow.swellFrom,
    cloud: g.weatherNow.cloud,
    visibilityNm: g.weatherNow.visibility,
    dayFromEpoch: g.clock.day,
    hourLocal: g.clock.hour,
    dayOfYear: g.clock.dayOfYear,
    year: g.clock.date.year,
    simTime: g.clock.t,
    sightingRangeNm: sightingRangeNm(g.ship.mastHeight, g.weatherNow.visibility),
  };
}

// Autosave every few minutes of play, and on the way out.
setInterval(() => {
  if (game && game.mode !== 'gameover') ui.save(game);
}, 180000);

window.addEventListener('beforeunload', () => {
  if (game && game.mode !== 'gameover') {
    try { localStorage.setItem('carreira-da-india:save', game.serialize()); } catch { /* ignore */ }
  }
});

ui.showTitle();
requestAnimationFrame(frame);
