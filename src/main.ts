import './style.css';

import { DEG, clamp } from './core/math';
import { Game } from './game/state';
import { portDef } from './world/ports';
import type { Difficulty } from './game/difficulty';
import { rollOfficerEvent } from './game/officerEvents';
import { rollSeaEvent } from './game/seaEvents';
import { sightOpportunities, takeSight } from './navigation/navigator';
import { KNOTS } from './ship/physics';
import { sightingRangeNm } from './navigation/charts';
import { Renderer, type RenderFrame } from './render/renderer';
import { Sound } from './render/sound';
import { InputState, Ui } from './ui';

/**
 * Let the game draw into the corners of a phone screen.
 *
 * `viewport-fit=cover` is what makes `env(safe-area-inset-*)` report anything
 * other than zero, and without it a notched phone letterboxes the page in
 * portrait and leaves two black bars in landscape. The tag is set here rather
 * than in the HTML because the page is also served inside a host that writes
 * its own head, where the markup in index.html never arrives.
 */
function claimTheWholeScreen(): void {
  let meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'viewport');
    document.head.append(meta);
  }
  const content = meta.getAttribute('content') ?? 'width=device-width, initial-scale=1';
  if (!/viewport-fit/.test(content)) {
    meta.setAttribute('content', `${content}, viewport-fit=cover`);
  }
}
claimTheWholeScreen();

const canvas = document.getElementById('scene') as HTMLCanvasElement;
const uiHost = document.getElementById('ui') as HTMLElement;

let game: Game | null = null;
/** The ship sailing behind the title screen, which belongs to no campaign. */
let demo: Game | null = null;
let renderer: Renderer | null = null;
let renderedHullId = '';
/** Seconds the title scene has been running, for the camera's slow sweep. */
let titleT = 0;

const input = new InputState();
input.attach(canvas);

// Audio cannot begin until the player has touched the page, so it is started
// from the first interaction rather than at load.
const sound = new Sound();
const wake = () => sound.start();
window.addEventListener('pointerdown', wake, { once: true });
window.addEventListener('keydown', wake, { once: true });
window.addEventListener('touchend', wake, { once: true });
// A phone suspends the audio context whenever the page goes to the background,
// and coming back does not resume it — so the wind stops and never restarts.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) sound.resume();
});

const ui = new Ui(uiHost, {
  onNewGame: (difficulty) => startNew(difficulty),
  onContinue: () => continueSaved(),
  onCycleCamera: () => {
    if (!renderer || !game) return;
    const mode = renderer.cycleCamera();
    game.pushAlert(
      { chase: 'From astern', deck: 'From the quarterdeck', beam: 'From off the beam', masthead: 'From the masthead' }[mode],
      'note',
    );
  },
  onVirtualKey: (key, down) => input.setVirtual(key, down),
  onToggleSound: () => { sound.start(); sound.setMuted(!sound.isMuted()); return !sound.isMuted(); },
});

/**
 * Put a ship somewhere and let her settle into a steady state there.
 *
 * Used both by the title scene and by the development hooks: a scene is only
 * worth looking at once the sails have taken up, she has way on, and the sea
 * around her is the sea the weather says it is rather than the one she was
 * carrying a moment ago.
 */
function settle(
  g: Game, lat: number, lon: number, hour: number, heading: number, canvas = 1,
): void {
  g.ship.state.pos = { lat, lon };
  g.ship.state.heading = heading;
  g.nav.estimated = { lat, lon };
  g.clock.t = Math.floor(g.clock.t / 86400) * 86400 + hour * 3600;
  g.setCanvas(canvas);
  g.anchored = false;
  g.dockedAt = null;
  g.refreshEnvironment();
  // Take the new weather whole rather than slewing into it over several
  // seconds, so the first frame is the sea it says it is.
  renderer?.ocean.reseed();

  for (const s of g.ship.state.sails) {
    s.side = g.physics.beta >= 0 ? -1 : 1;
    s.shifting = 0;
  }
  for (let i = 0; i < 900; i++) {
    g.ship.state.heading = heading;
    g.ship.state.yawRate = 0;
    g.update(1 / 30);
  }
  g.ship.state.heading = heading;
  g.displayHeading = heading;
}

/**
 * The ship sailing behind the title.
 *
 * The opening screen of a game about being at sea was a page of prose on a flat
 * gradient. Everything needed to show the thing itself was already built and
 * simply was not started until the player pressed Sail. This runs a ship that
 * belongs to nobody, on a reach in the north-east trades at the end of the
 * afternoon, with the camera walking slowly round her; the title sits over it
 * behind a scrim dark enough to read against.
 */
function startTitleScene(): void {
  demo = new Game(1482);
  demo.mode = 'sailing';
  demo.clock.paused = false;
  // Real time. The sea has to move like the sea, not like a time-lapse.
  demo.clock.scaleIndex = 1;
  ensureRenderer(demo);
  if (renderer) {
    renderer.cameraMode = 'beam';
    renderer.lookPitch = -6;
  }
  settle(demo, 21.5, -22, 17.9, 236, 0.9);
}

function startNew(difficulty: Difficulty = 'watch'): void {
  demo = null;
  game = new Game();
  game.difficulty = difficulty;
  game.mode = 'sailing';
  ensureRenderer(game);
  ui.attach(game);
  // A new captain begins at court, not on the quay. The King's commission is
  // the briefing — it says what the voyage is for, what it pays, and who else
  // is trying to do it — and choosing between the three on offer is the first
  // decision of the game. Opening on the market instead left a player at anchor
  // in Lisbon with a purse, no orders, and nothing telling him where to go.
  if (renderer) renderer.cameraMode = 'chase';
  ui.setMode('court');
}

function continueSaved(): void {
  demo = null;
  const raw = Ui.loadSave();
  if (!raw) { startNew(); return; }
  try {
    game = Game.deserialize(raw);
  } catch {
    startNew();
    return;
  }
  ensureRenderer(game);
  if (renderer) renderer.cameraMode = 'chase';
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

/**
 * Follow the screen as it changes shape.
 *
 * A phone browser hides its address bar when the page is scrolled and shows it
 * again when it is not, which changes the height of the viewport without
 * always firing a `resize` on the window — iOS in particular reports it only on
 * `visualViewport`. An orientation change arrives before the new dimensions are
 * readable, so it is re-read on the next frame as well.
 */
function relayout(): void {
  renderer?.resize();
  ui.resize();
}
window.addEventListener('resize', relayout);
window.visualViewport?.addEventListener('resize', relayout);
window.addEventListener('orientationchange', () => {
  relayout();
  requestAnimationFrame(relayout);
  setTimeout(relayout, 300);
});

/** Continuous controls, applied every frame while the sailing view is up. */
function applyContinuousInput(g: Game, dt: number): void {
  if (g.mode !== 'sailing') return;

  // The helm holds where it is put, as a tiller does when the helmsman is told
  // to keep her so. Letting it spring back to amidships makes a sustained turn
  // impossible without holding a key down for a minute.
  // Two ways of steering the same ship, and which one you get depends on how
  // fast the clock is running.
  //
  // Below about a quarter of an hour to the second the wheel is a wheel: the
  // helm goes over and stays where it is put. Above that, holding a rudder over
  // is meaningless — a frame covers minutes, she would be round and round
  // before the player let go — but *conning* her is not. The same keys then
  // give the order a captain actually gave: so many degrees to starboard, which
  // the quartermaster puts on and holds. She answers at once, she stays where
  // she is put, and the clock does not have to stop for it.
  const conning = g.clock.scaleIndex > 3;
  const helm = input.helmAxis();
  if (helm !== 0) {
    if (conning) {
      // Degrees a second of real time, so a press is a nudge and a hold is a
      // deliberate alteration.
      g.alterCourse(helm * dt * 26);
    } else {
      // Touching the wheel takes the ship back off the watch. Anything else
      // means the player pulls the helm over, the quartermaster quietly pulls
      // it back, and the ship appears to ignore him.
      if (g.holdCourse) {
        g.holdCourse = false;
        g.pushAlert('You have the helm.', 'note');
      }
      g.setHelm(clamp(g.ship.state.rudder + helm * dt * 1.6, -1, 1));
    }
  } else if (input.isDown('x')) {
    if (conning) g.steadyAsSheGoes();
    else g.setHelm(clamp(g.ship.state.rudder * Math.max(0, 1 - dt * 5), -1, 1));
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

  // The title's ship and the player's ship are drawn by the same code; only
  // one of them exists at a time.
  const shown = game ?? demo;
  if (shown && renderer) {
    ensureRenderer(shown);
    // Only the player's ship answers the helm. The title's does not.
    if (game) applyContinuousInput(game, realDt);

    // A slow sweep across her quarter rather than a full circuit: enough that
    // the frame is never quite still, bounded so she never wanders behind the
    // column of text and out of the picture.
    if (!game) {
      titleT += realDt;
      renderer.lookYaw = Math.sin(titleT * 0.09) * 15;
    }

    const before = shown.clock.t;
    shown.update(realDt);
    const simDt = shown.clock.t - before;

    const frame = buildFrame(shown);
    renderer.render(frame, realDt, simDt);
    sound.update({
      windKnots: frame.windKnots,
      apparentKnots: frame.apparentKnots,
      speedKnots: frame.speedKnots,
      waveHeight: frame.waveHeight,
      roll: shown.displayHeel + renderer.drawnRoll,
      rate: shown.clock.scale,
      bells: game && game.mode === 'sailing' ? game.clock.bells : 0,
      belowDecks: false,
    });
    if (game) ui.update(game);
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
    // The shown attitude, not the simulated one: see Game.displayHeading.
    heading: g.displayHeading,
    heel: g.displayHeel,
    velocityE: Math.sin(cogRad) * ground,
    velocityN: Math.cos(cogRad) * ground,
    sails: g.ship.state.sails,
    trimSign: p.beta >= 0 ? -1 : 1,
    sailPressures: pressures,
    // Shown, not instantaneous: the pennant and the telltales have to agree
    // with the sea they are flying over.
    apparentBeta: g.displayBeta,
    apparentKnots: g.displayApparent,
    speedKnots: p.speedKnots,
    rudder: g.ship.state.rudder,
    // The shown weather, not the instantaneous one: see Game.displayWind.
    windFrom: g.displayWind.from,
    windKnots: g.displayWind.speed,
    waveHeight: g.displayWave,
    swellFrom: g.displaySwell,
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

// A handle on the running simulation, for driving the renderer into particular
// conditions while working on it. Stripped from production builds.
if (import.meta.env.DEV) {
  Object.defineProperty(window, 'dev', {
    get: () => ({
      game,
      demo,
      renderer,
      /** Put the ship somewhere, at a time of day, sailing at a steady state. */
      place(lat: number, lon: number, hour: number, heading: number, canvas = 1) {
        if (game) settle(game, lat, lon, hour, heading, canvas);
      },
      /** Drop her straight into a port, for looking at the port screens. */
      anchorAt(id: string) {
        if (!game) return;
        const def = portDef(id);
        game.ship.state.pos = { lat: def.lat, lon: def.lon };
        game.nav.estimated = { lat: def.lat, lon: def.lon };
        game.enterPort(def);
        ui.setMode('port');
      },
      rollOfficerEvent,
      rollSeaEvent,
      sightOpportunities,
      takeSight,
    }),
  });
}

ui.showTitle();
// The title's words come up first and the sea follows a frame later. Building
// the renderer compiles shaders, which is the one genuinely slow thing at load,
// and doing it in the same task as the first paint holds the whole screen blank
// while it happens.
requestAnimationFrame(() => startTitleScene());
requestAnimationFrame(frame);
