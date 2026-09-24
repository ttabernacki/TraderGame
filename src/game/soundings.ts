import {
  NM, clamp, cosd, haversine, sind, wrap180, wrap360, type LatLon,
} from '../core/math';
import {
  LEAD_REACH_M, bottomAt, elevationAt, groundAgrees, groundCellKey, nearestShore,
  offingFromDepth, type Ground,
} from '../world/landmass';
import { portDef } from '../world/ports';
import { skill } from '../crew/skills';
import type { SeaEvent } from './seaEvents';
import { readTide } from '../navigation/tides';
import type { Game } from './state';

/**
 * The lead line, as an instrument of navigation.
 *
 * It was on the HUD as a number and it was a hazard warning: so many fathoms,
 * and shoaling. That is the smaller half of what a lead was for. The larger
 * half is that the bottom of the sea is a *shape*, and a shape you know is a
 * chart you can use in the dark.
 *
 * Two things come up on the line, and they answer different questions.
 *
 * The depth answers *how far off*. The shelf shoals toward the coast at a rate
 * a pilot could learn, so sixty fathoms is a distance and not merely a comfort
 * — and because it is measured square across the coast, on a shore that runs
 * north and south it is a correction in longitude. That is the whole point.
 * Longitude is the thing this century cannot have, and in soundings it can have
 * it, which is why the Channel was run on the lead for three hundred years and
 * why the English called the western approaches "soundings" as though it were a
 * place.
 *
 * The tallow in the base of the lead answers *where along*. It comes up with
 * the ground on it — fine white sand, black ooze, broken shell, coral — and the
 * ground does not move. Write it in the book with the depth beside it and you
 * have a fingerprint of that patch of bottom, and the next time you come over
 * it in fog with no sight for a week, you know the place. This is the one
 * mechanism in the game by which a second voyage down a coast is genuinely
 * better than the first, rather than merely more profitable.
 */

export interface LeadCast {
  ok: boolean;
  message: string;
  /** Depth on the line, as the leadsman called it. */
  fathoms?: number;
  ground?: Ground;
  /** Distance off the coast the depth implies. */
  offingNm?: number;
  /** How far the correction shifted the reckoning. */
  movedNm?: number;
  /** The book knew this ground, and said so. */
  recognised?: string;
}

/** How long the ship loses to a cast, in seconds: hove to, line down, line in. */
const CAST_SECONDS = 1500;

/**
 * Heave the lead.
 *
 * Refused above nine knots, which is not fussiness: a hundred fathoms of line
 * goes down at the speed it sinks and the ship keeps going, so at any speed the
 * line streams aft and finds the bottom somewhere the ship has already left.
 * Sounding properly means taking the way off her, and that is the cost.
 */
export function castLead(g: Game): LeadCast {
  if (g.dockedAt) {
    return { ok: false, message: 'She is alongside. The depth here is whatever the tide leaves.' };
  }
  const speed = Math.abs(g.physics?.speedKnots ?? 0);
  if (speed > 9) {
    return {
      ok: false,
      message: `She is going ${speed.toFixed(0)} knots. The line will stream aft faster than it `
        + 'sinks and find the bottom a mile behind her, if it finds it at all. Take the way off '
        + 'her first.',
    };
  }

  const truth = g.ship.state.pos;
  const nav = g.nav;
  const nvSkill = skill(g.skills, 'navegacao');
  g.clock.t += CAST_SECONDS;

  // Where the pilot reckons the coast lies from him. With the land in sight he
  // takes the bearing off the masthead; out of sight of it he has only his
  // chart and his reckoning, which is the case the lead is actually for.
  // Everything about the correction is taken in the pilot's own frame — his
  // reckoned position against the coast as his chart draws it — and never from
  // the masthead.
  //
  // This looks wrong and is not. The lead gives one fact, "I am so far from the
  // land", and the pilot's job is to move his board until it agrees. If the
  // *distance* is compared against the coast near his reckoning while the
  // *direction* is taken off the real land in front of him, the two halves of
  // the correction describe two different stretches of coastline, and a fifty
  // mile disagreement gets applied along an axis that has nothing to do with
  // it. Measured off Arguim, that put the ship further out than it found her.
  //
  //
  // And the coast is the coast *as the soundings draw it*. A depth becomes a
  // distance off only through somebody's record of how this bottom shoals, and
  // that record was written against a chart: the Casa's roteiros against the
  // Casa's sheet, a local pilot's against the real shore he knows by eye, your
  // own against your own chart. The lead matches the reckoning to that drawing
  // — it moves the board and nothing else — and it can be no truer than the
  // drawing it is matched to.
  const frame = g.soundingFrame(nav.estimated);
  const believed = frame
    ? nearestShore({ lat: nav.estimated.lat - frame.shift.dLat, lon: nav.estimated.lon - frame.shift.dLon }, 90)
    : { land: -1, signed: Infinity, bearing: 0, distance: Infinity };
  const inland = believed.signed <= 0;
  const believedOff = believed.land >= 0 ? believed.signed / NM : Infinity;
  const shoreBearing = wrap360(believed.bearing + (inland ? 180 : 0));

  // Whether anybody knows how this bottom shoals toward the land. Without that,
  // a depth is a fact about the water and not a distance off. It is judged at
  // the reckoned position — the pilot looks for his soundings where he thinks
  // he is — so a board that is badly out can look in the wrong page.
  const profile = frame?.source ?? null;

  const depth = g.sounding.depth;
  const reach = LEAD_REACH_M * g.ship.effects.leadReach;
  if (depth > reach) {
    // No bottom is not nothing. It says she is outside the hundred-fathom line,
    // and a reckoning that had her inside it was wrong.
    const edge = offingFromDepth(reach);
    let moved = 0;
    if (profile && Number.isFinite(believedOff) && believedOff < edge) {
      moved = nav.applySounding(shoreBearing, edge, believedOff, Math.hypot(9, frame?.sigmaNm ?? 0), g.clock.t, 'no bottom').movedNm;
    }
    g.logEvent('navigation',
      `The deep-sea lead goes down with ${Math.round(reach / 1.8288)} fathoms of line on it and comes up dry. `
      + 'No bottom.' + (moved > 1
        ? ` The reckoning had her inside the hundred-fathom line, so she is further off the land `
          + `than the board says — ${moved.toFixed(0)} miles of it.`
        : ' She is in blue water and the lead has nothing to tell you.'));
    return {
      ok: true,
      message: `No bottom at ${Math.round(reach / 1.8288)} fathoms.`,
      movedNm: moved,
    };
  }

  // What the leadsman actually calls, with everything in it that goes wrong:
  // the stretch of a wet line, the ship's remaining way, and the tide.
  //
  // The tide used to be a flat 1.1 metres of unremovable error, on the grounds
  // that nobody had a table for it. That was true of the game and false of the
  // period: a pilot carried the establishment of the port and the age of the
  // moon and had the state of the tide to within half an hour, which is most of
  // the correction. So it is his skill that decides how much of it he takes
  // out, and a good one gets his soundings down to the stretch of the line.
  const readSigma = (0.9 + depth * 0.022) * (1.3 - nvSkill * 0.55)
    + speed * 0.35;
  const tide = readTide(truth, g.clock.t);
  const swing = tide ? (tide.range / 2) * tide.springs : 0.55;
  const tideSigma = swing * (1.05 - nvSkill * 0.8);
  const sigmaD = Math.hypot(readSigma, tideSigma);
  const called = Math.max(2, depth + g.rng.normal(0, sigmaD));
  const fathoms = called / 1.8288;
  const ground = bottomAt(truth, depth);

  const offing = offingFromDepth(called);
  // The doubt in the offing, taken from the profile's own steepness rather than
  // assumed: a fathom of doubt is worth very little where the bottom falls away
  // and a great deal where it is nearly flat.
  const slopeNm = (offingFromDepth(called + sigmaD) - offingFromDepth(Math.max(1, called - sigmaD))) / 2;
  // And the bottom is not the smooth ramp the rule pretends it is.
  const sigmaOff = Math.hypot(Math.abs(slopeNm), 0.45 + offing * 0.055, frame?.sigmaNm ?? 0);

  let moved = 0;
  if (profile && Number.isFinite(believedOff)) {
    moved = nav.applySounding(
      shoreBearing, offing, believedOff, sigmaOff, g.clock.t, `${fathoms.toFixed(0)} fathoms`,
    ).movedNm;
  }

  // Does the book know this ground?
  const cell = groundCellKey(truth);
  const known = recallSounding(g, cell);
  let recognised: string | undefined;
  let recalledMove = 0;
  if (known && groundAgrees(known.ground, ground) && Math.abs(known.fathoms - fathoms) < 9) {
    recognised = known.where;
    // Knowing the patch of bottom is knowing the place. It fixes her no better
    // than the reckoning that wrote the page did, which is the whole ethic of
    // the chart in this game — but it fixes her.
    //
    // Blended against the board on the page's own doubt rather than asserted
    // over it, so a page out of an older save — written on a reckoning instead
    // of on the ground — cannot throw a good board across the gulf.
    // See Navigator.rememberedFix.
    recalledMove = nav.rememberedFix(
      { lat: known.lat, lon: known.lon }, Math.max(known.doubt, 2.5), g.clock.t,
    );
  }

  // Written where the pilot believes he is — his book has no other position to
  // give it — with the doubt he had when he wrote it.
  writeSounding(g, cell, fathoms, ground, nav.estimated,
    Math.max(3, Math.hypot(nav.sigmaLat, nav.sigmaLon)));

  const call = `By the deep, ${fathoms.toFixed(0)}. ${capitalise(ground)} on the tallow.`;
  g.logEvent('navigation', call
    + (recognised
      ? ` The pilot has the book open before the lead is inboard: this is the ground off `
        + `${recognised}, written down in his own hand.`
        + (recalledMove > 2
          ? ` The page is surer than the board and the board comes across to it — `
            + `${recalledMove.toFixed(0)} miles.`
          : ' It agrees with where he already had her.')
      : !profile
        ? ' Nobody has sounded this coast before, so how the bottom shoals toward the land is '
          + 'anybody\u2019s guess: it tells you the water under her, not how far off the land '
          + 'she is. It goes in the book, and the next ship down this coast will know.'
      : Number.isFinite(believedOff)
        ? ` It puts her ${offing.toFixed(0)} miles off the land by ${profile}, against `
          + (believedOff < 0
            ? `a board that has her ${Math.abs(believedOff).toFixed(0)} miles inland, which she is not.`
            : `${believedOff.toFixed(0)} by the reckoning.`)
          + `${moved > 2 ? ` The board is corrected ${moved.toFixed(0)} miles.` : ''}`
        : ' There is no coast on the board near enough to reckon an offing from.'),
    recognised !== undefined || moved > 8);

  return {
    ok: true,
    message: call,
    fathoms,
    ground,
    offingNm: profile ? offing : undefined,
    movedNm: moved,
    recognised,
  };
}

interface RecalledSounding {
  ground: Ground;
  fathoms: number;
  lat: number;
  lon: number;
  doubt: number;
  where: string;
}

/** What the book says about a patch of bottom, if it has ever been over it. */
function recallSounding(g: Game, cell: string): RecalledSounding | null {
  for (const e of g.rutter.entries) {
    for (const n of e.notes) {
      if (!n.fact || n.fact.tag !== 'sounding' || n.fact.target !== cell) continue;
      const ground = (n.source ?? '') as Ground;
      return {
        ground,
        fathoms: n.fact.value ?? 0,
        // The cast's own position, not the page's. A page is opened under the
        // name of the nearest thing on the chart and keeps for ever the
        // position it was opened at, so reading the entry handed back wherever
        // the *first* cast ever filed under that name happened to be.
        lat: n.fact.lat ?? e.lat,
        lon: n.fact.lon ?? e.lon,
        // A page out of an older save was written on a reckoning rather than
        // on the ground itself, so it is trusted no further than that.
        doubt: n.fact.doubt ?? 120,
        where: e.title,
      };
    }
  }
  return null;
}

/**
 * Write the cast into the roteiro.
 *
 * Filed under whatever the nearest thing with a name is, because that is how a
 * pilot indexed his own soundings — not by coordinates, which he did not have,
 * but by "off the river with the two hills behind it". The ground is carried in
 * the note's source field so a later cast can be compared against it.
 */
function writeSounding(
  g: Game, cell: string, fathoms: number, ground: Ground, at: LatLon, doubtNm: number,
): void {
  const where = nearestName(g) ?? `the coast in ${Math.abs(g.nav.estimated.lat).toFixed(0)}° `
    + `${g.nav.estimated.lat >= 0 ? 'north' : 'south'}`;
  const { entry } = g.rutter.open(
    'coast', `coast:${where}`, where, g.nav.estimated, g.clock.t);
  // The patch of bottom does not move, and the tallow and the depth identify
  // it. What the book records is where the pilot *believed* he was when he
  // sounded it, and how sure he was — so recognising the ground again puts the
  // board back where it was then, no better than it was then. A sounding
  // taken just out of a harbour is worth a great deal; one taken at the end of
  // a month of blue water is worth what that reckoning was worth.
  g.rutter.note(entry,
    `Soundings: ${fathoms.toFixed(0)} fathoms, ${ground}.`,
    'observed', g.clock.t,
    {
      source: ground,
      fact: {
        tag: 'sounding', value: fathoms, target: cell,
        lat: at.lat, lon: at.lon,
        doubt: doubtNm,
      },
    });
}

/** The nearest named thing on the chart, by the pilot's own reckoning. */
function nearestName(g: Game): string | null {
  let best: string | null = null;
  let bestNm = 90;
  for (const pl of g.chart.places) {
    const d = haversine(g.chart.placeAt(pl), g.nav.estimated) / NM;
    if (d < bestNm) { bestNm = d; best = pl.name; }
  }
  for (const [id, p] of g.chart.ports) {
    const d = haversine({ lat: p.lat, lon: p.lon }, g.nav.estimated) / NM;
    if (d < bestNm) { bestNm = d; best = portDef(id)?.name ?? null; }
  }
  return best;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Which headland is this?
// ---------------------------------------------------------------------------

interface Candidate {
  key: string;
  name: string;
  /** Where the chart puts it, which is what fixing on it will hand you. */
  lat: number;
  lon: number;
  /** Doubt in the chart's own longitude for it. */
  doubtNm: number;
  /** Miles from the reckoning, which is why it occurred to the pilot at all. */
  fromReckoningNm: number;
  /** Miles from where she really is. Never shown. */
  fromTruthNm: number;
  /** What the book has to say for it. */
  evidence: string;
}

/**
 * Raising the land used to be a log line.
 *
 * It is the most consequential moment of any passage and it asked the player
 * nothing. A coast is up. Which coast? The pilot has a reckoning he stopped
 * believing a fortnight ago, a latitude off the quadrant that is worth
 * something, a lump of land standing at a particular height, and a book with
 * other men's headlands in it. He has to *decide*, and then the ship acts on
 * the decision — because a captain who says "that is Cape Verde" writes Cape
 * Verde's longitude into his board and sails on from there.
 *
 * Get it right and it is the best fix in the game. Get it wrong and you have
 * not merely failed to improve the reckoning: you have replaced an honest doubt
 * of sixty miles with a confident error of a hundred and sixty, and nothing
 * will tell you until the coast stops matching the book.
 *
 * Standing in with the lead is the third answer and the expensive one. It costs
 * most of a day and it does not name the place, but it gives the offing and the
 * ground, and the ground may be in the book.
 */
/**
 * Switched off.
 *
 * Naming a headland off the chart was meant to be the best fix in the game and
 * the worst mistake in it. In play it is neither: the candidates are a list of
 * names with a distance beside each, there is nothing on the deck that lets you
 * tell one from another, and so it is not a judgement — it is a guess with a
 * heavy penalty for losing. A mechanism that cannot be played well is not a
 * hard decision, it is a dice roll wearing a decision's clothes, and this one
 * rolled for the whole reckoning.
 *
 * The lead is the answer that was always the good one: standing in and sounding
 * costs most of a day, names nothing, and tells you the truth. That is still
 * here and still does everything it did, and the pilot's hint at a charted town
 * (see Game.portInSight) covers the case this was invented for.
 *
 * Everything below is left intact and still under test. One flag brings it back.
 */
export const LANDFALL_NAMING = false;

export function landfallScene(g: Game): SeaEvent | null {
  if (!LANDFALL_NAMING) return null;
  // If the lookout can already name a place on this coast there is no question
  // to put: he is looking at a town that is on the chart and he says so. The
  // scene is for the other case, which is most of them — a coast up ahead, a
  // reckoning three weeks old, and nothing on the shore with a name on it.
  if (g.portInSight()?.sure) return null;
  const cands = candidates(g);
  if (cands.length === 0) return null;

  const truth = g.ship.state.pos;
  const shore = nearestShore(truth, 90);
  // What stands behind the beach, sampled behind the beach.
  const inland = shore.land >= 0
    ? {
      lat: truth.lat + ((shore.distance / NM + 6) * cosd(shore.bearing)) / 60,
      lon: truth.lon
        + ((shore.distance / NM + 6) * sind(shore.bearing)) / (60 * Math.max(cosd(truth.lat), 1e-6)),
    }
    : truth;
  const height = elevationAt(inland);

  const look = height > 900 ? 'It stands high and bold — a wall of it, blue with distance, and the top lost'
    : height > 380 ? 'It rises to a fair height behind the shore, broken, with a summit or two on it'
      : height > 120 ? 'Low hills behind a long shore, nothing on it to fix the eye'
        : 'Low. Very low — a line of white where the surf is, and almost nothing above it';

  const lastFix = g.nav.fixes[g.nav.fixes.length - 1];
  const fixAge = lastFix ? (g.clock.t - lastFix.t) / 86400 : 999;
  const latLine = lastFix && fixAge < 3
    ? `The quadrant gives ${Math.abs(g.nav.estimated.lat).toFixed(1)}° `
      + `${g.nav.estimated.lat >= 0 ? 'north' : 'south'}, taken ${fixAge < 1 ? 'today' : `${fixAge.toFixed(0)} days back`}, `
      + `and that much you can lean on.`
    : `Nobody has had a sight in ${fixAge > 90 ? 'weeks' : `${fixAge.toFixed(0)} days`}. The latitude on the board `
      + `is as good as the reckoning, which is to say ±${g.nav.sigmaLat.toFixed(0)} miles.`;

  const trend = coastTrend(truth);

  return {
    id: 'landfall:identify',
    title: 'What land is this?',
    severity: 'note',
    text:
      `Land from the masthead, ${g.sounding.shoreDistNm.toFixed(0)} miles off. ${look}. `
      + `The coast trends ${trend}. ${latLine} `
      + 'The pilot has the roteiro open on the binnacle and the master is waiting to be told what '
      + 'to write in the board, because whatever you say now is what the ship is navigated from '
      + 'until something proves it wrong.',
    choices: [
      ...cands.map((c) => ({
        label: `Call it ${c.name}`,
        detail: `${c.fromReckoningNm.toFixed(0)} miles from the reckoning. ${c.evidence}`,
        resolve: (gg: Game) => identify(gg, c),
      })),
      {
        label: 'Name nothing. Stand in and sound.',
        detail: 'Most of a day gone, and the coast no better named — but the lead does not guess.',
        resolve: (gg: Game) => {
          gg.clock.t += 9 * 3600;
          gg.crew.fatigue = clamp(gg.crew.fatigue + 0.04, 0, 1);
          const cast = gg.heaveTheLead();
          return 'You will not have a headland guessed at. She stands in under easy sail with the '
            + 'lead going all afternoon and the pilot writing. '
            + (cast.recognised
              ? `And the ground comes up off the tallow that he has written down before: this is ${cast.recognised}, `
                + 'and the whole afternoon has paid for itself twice over.'
              : cast.fathoms !== undefined
                ? `${cast.message} She is ${(cast.offingNm ?? 0).toFixed(0)} miles off, which is `
                  + 'worth more than a name, and the ground is in the book now against the day she comes back.'
                : `${cast.message} The coast falls away steeply here and there is nothing to be had from it.`);
        },
      },
    ],
  };
}

function identify(g: Game, c: Candidate): string {
  const right = c.fromTruthNm < 55;
  // Where the board stood before it was moved. Read after applyLandfall it is
  // the candidate's own longitude, so the shift always came out "east".
  const was = { ...g.nav.estimated };
  // What the board is worth afterwards.
  //
  // Two things decide it, and only one of them can be known. The first is how
  // well the chart has the place he has named — that is `doubtNm`, and it is
  // why fixing on a coast Lisbon drew badly is worth less than fixing on one
  // he surveyed himself. The second is whether he has named the right place at
  // all, which nothing aboard can tell him.
  //
  // So what is carried forward is the size of the leap: a pilot who shifts the
  // board four miles is as sure as the chart is, and one who shifts it two
  // hundred has staked everything on a shape against a book and ought to be
  // watching his latitude like a hawk until a sight settles it. That keeps the
  // error circle honest, keeps the noon sight being offered, and leaves the
  // mistake catchable — without telling him he made one.
  const leap = c.fromReckoningNm;
  g.nav.applyLandfall(
    { lat: c.lat, lon: c.lon }, g.clock.t,
    Math.max(c.doubtNm, leap * 0.35),
    Math.max(2.5, leap * 0.22),
  );
  // How far the board just moved. Said the same way whether he is right or
  // wrong, because it is a fact about the paper and not about the coast — the
  // master writes the shift in either way, and it is the only thing the player
  // is given to be uneasy about. Without it the reckoning could be thrown two
  // hundred miles by one click with nothing on screen to mark it.
  const shift = leap > 25
    ? ` The board goes ${leap.toFixed(0)} miles ${wrap180(c.lon - was.lon) < 0 ? 'west' : 'east'} `
      + 'to agree with him, which the master enters without comment and without looking up.'
    : '';

  if (right) {
    g.crew.morale = clamp(g.crew.morale + 0.06, 0, 1);
    return `It is ${c.name}, and within an hour there is no doubt of it — the shape of the thing `
      + 'against the book, the bearing of the point opening as she runs down, the ground the lead '
      + 'brings up. The board is squared off from it and for the first time since the last sight '
      + `the ship knows where she is. The pilot is insufferable for two days.${shift}`;
  }
  // Nothing tells him. That is the point of the mechanism.
  return `It is ${c.name}, says the pilot, and rules the board off from it with a great deal of `
    + 'confidence, and the master writes it in, and the watch is changed. Everything about the '
    + `afternoon is exactly as it would be if he were right.${shift}`;
}

/** How the shore lies, which the book records for every headland worth naming. */
function coastTrend(p: LatLon): string {
  const s = nearestShore(p, 90);
  if (s.land < 0) return 'nowhere the eye can follow';
  // Two probes a little up and down the coast, and the line between them.
  const step = 12 / 60;
  const a = nearestShore({ lat: p.lat + step, lon: p.lon }, 90);
  const b = nearestShore({ lat: p.lat - step, lon: p.lon }, 90);
  if (a.land < 0 || b.land < 0) return 'away out of sight both ways';
  const dLon = (a.distance * sind(a.bearing) - b.distance * sind(b.bearing)) / NM;
  const slant = Math.abs(dLon) / (2 * 12);
  if (slant < 0.25) return 'true north and south as far as the eye carries';
  return dLon > 0 ? 'north and south, falling away to the eastward' : 'north and south, and bends away west';
}

/**
 * The places it could plausibly be.
 *
 * Only things on the pilot's own chart, at their charted positions — a man
 * cannot mistake this headland for somewhere he has never heard of. The window
 * widens with his doubt, which is correct and which is also what makes the
 * whole thing hard after a long passage: the worse the reckoning, the more
 * candidates it admits, and the more evenly they are spread.
 */
function candidates(g: Game): Candidate[] {
  const truth = g.ship.state.pos;
  const est = g.nav.estimated;
  const doubt = Math.max(g.nav.sigmaLat, g.nav.sigmaLon);
  const window = clamp(2.2 * doubt + 40, 70, 260);

  const out: Candidate[] = [];
  const push = (key: string, name: string, lat: number, lon: number, doubtNm: number, ev: string) => {
    if (out.some((o) => o.key === key)) return;
    out.push({
      key, name, lat, lon, doubtNm,
      fromReckoningNm: haversine(est, { lat, lon }) / NM,
      fromTruthNm: haversine(truth, { lat, lon }) / NM,
      evidence: ev,
    });
  };

  for (const [id, p] of g.chart.ports) {
    const def = portDef(id);
    if (!def) continue;
    const lonDoubt = clamp(Math.sqrt(1 / Math.max(p.wLon, 1e-9)), 1.2, 90);
    const seen = p.visited
      ? 'You have lain there.'
      : p.passes > 0
        ? `On the chart from ${p.passes} reckoning${p.passes === 1 ? '' : 's'} of your own, never entered.`
        : 'On the chart before you sailed, on somebody else’s word. Never seen.';
    push(`port:${id}`, def.name, p.lat, p.lon, lonDoubt, seen);
  }
  for (const pl of g.chart.places) {
    const at = g.chart.placeAt(pl);
    push(`place:${pl.id}`, pl.name, at.lat, at.lon, 6, 'Your own name, in your own hand.');
  }

  if (out.length === 0) return [];

  // What actually occurs to him: near the reckoning, or near enough to the
  // truth that the land in front of him keeps suggesting it.
  const plausible = out.filter((c) =>
    c.fromReckoningNm < window || c.fromTruthNm < window * 0.55);
  if (plausible.length === 0) return [];

  plausible.sort((a, b) => a.fromReckoningNm - b.fromReckoningNm);
  const chosen = plausible.slice(0, 3);
  // Keep the honest answer on the list when it is in front of him at all: a
  // choice between three wrong headlands is not a decision, it is a tax.
  const trueOne = plausible.find((c) => c.fromTruthNm < 55);
  if (trueOne && !chosen.includes(trueOne)) chosen[chosen.length - 1] = trueOne;
  // And shuffle, so the right answer is not always the first one offered.
  for (let i = chosen.length - 1; i > 0; i--) {
    const j = Math.floor(g.rng.next() * (i + 1));
    [chosen[i], chosen[j]] = [chosen[j], chosen[i]];
  }
  return chosen;
}

