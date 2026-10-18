/**
 * Generates the golden-save corpus: fixtures/saves/*.json, each the exact string Game.serialize() wrote.
 *
 *   npx esbuild scripts/genSaves.ts --bundle --platform=node --format=cjs --outfile=/tmp/genSaves.cjs \
 *     && node /tmp/genSaves.cjs
 *
 * States are reached by driving the Game API (sailing, trading, audiences), not by hand-editing JSON. The
 * two places a purse is topped up to afford a House / Line are marked below. Re-run after a SAVE_FORMAT bump
 * (and keep the old fixtures in git history: they are what the load-time migrations are tested against).
 * Deterministic for a given build: seeds are fixed.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { Game } from '../src/game/state';
import { Rng } from '../src/core/rng';
import { openLine } from '../src/progression/network';
import { QUESTS } from '../src/progression/quests';
import { startPiece, stepPiece, runView } from '../src/diplomacy/table';
import { SAVE_FORMAT } from '../src/game/save';
import { anchorageOf, portDef } from '../src/world/ports';
import { answerScenes, atQuay, newGame, newTally, sailRoad, TOP_SCALE } from './lib/botlib';
import { play } from './lib/careerCore';

const DIR = 'fixtures/saves';
mkdirSync(DIR, { recursive: true });
const out: { name: string; bytes: number; note: string }[] = [];

function save(name: string, g: Game, note: string): void {
  const json = g.serialize();
  writeFileSync(`${DIR}/${name}.json`, json);
  out.push({ name, bytes: json.length, note });
}

/** Sail for roughly `steps` hours of ship-time toward a port, without arriving. */
function standOut(g: Game, toPort: string, steps: number): void {
  const t = newTally();
  g.weighAnchor();
  g.mode = 'sailing';
  g.setDestinationPort(toPort);
  for (let i = 0; i < steps; i++) {
    answerScenes(g, t);
    g.clock.scaleIndex = TOP_SCALE;
    g.update(0.25);
  }
  answerScenes(g, t);
}

const t = newTally();
const rng = new Rng(11);

// 1. A new game, docked at Lisbon, before anything has been done.
{
  const g = newGame(101);
  save('01-new-game', g, 'fresh Game(101), docked at Lisbon, act I not yet opened');
}

// 2. Mid-voyage at sea, a few days out of the Tagus, route laid for Funchal.
{
  const g = newGame(102);
  g.checkStory(); answerScenes(g, t);
  standOut(g, 'funchal', 40);
  save('02-at-sea', g, 'sailing, ~2 days out of Lisbon for Funchal');
}

// 3. Docked with cargo: Lisbon -> Funchal with a hold bought on the Lisbon quay.
{
  const g = newGame(103);
  g.checkStory(); answerScenes(g, t);
  atQuay(g, 'funchal', t, rng);
  const leg = sailRoad(g, 'funchal', t);
  if (!leg.ok || g.dockedAt !== 'funchal') throw new Error(`03: did not reach Funchal (${leg.why})`);
  // Something in the hold even if the rule bought nothing worth carrying.
  if (g.ship.cargo.length === 0) g.tradeBuy('vinho', 10);
  if (g.ship.cargo.length === 0) throw new Error('03: no cargo');
  save('03-docked-cargo', g, 'docked at Funchal with a hold of trade goods');
}

// 4. Mid-audience: a Silent Trade in progress at the Khoi court (as scripts/silent.ts builds it), two steps in.
{
  const g = newGame(104);
  g.checkStory(); answerScenes(g, t);
  g.ship.addCargo('ferramenta', 6, 8); g.ship.addCargo('manilhas', 6, 5);
  g.ship.addCargo('contas', 6, 3); g.ship.addCargo('espelhos', 6, 9);
  const run = startPiece(g, 'silent', 'khoi', 'sao-bras');
  if (!run) throw new Error('04: piece did not start');
  for (let i = 0; i < 2; i++) {
    const v = runView(g, run)!;
    const lay = v.choices.find((c) => c.id.startsWith('lay:') && !c.disabled);
    if (!lay) break;
    if (stepPiece(g, run, lay.id)) break;
  }
  if (run.outcome) throw new Error('04: piece ended before the save');
  save('04-mid-audience', g, 'a Silent Trade piece (khoi, sao-bras) open with two moves played');
}

// 5. An active venture: a merchant's charter signed and loaded at Lisbon.
{
  let g: Game | null = null;
  for (let seed = 105; seed < 125 && !g; seed++) {
    const c = newGame(seed);
    c.checkStory(); answerScenes(c, t);
    for (const o of [...c.ventureOffers]) {
      if (c.ship.holdFree >= o.quantity * 0.01 && c.acceptVenture(o.id).startsWith('Loaded')) break;
    }
    if (c.activeVentures.length > 0) g = c;
  }
  if (!g) throw new Error('05: no venture could be taken at Lisbon on seeds 105..124');
  save('05-venture', g, `charter in the hold: ${g.activeVentures[0].goodId} to ${g.activeVentures[0].toPort}`);
}

// 6. A House at Funchal and a Line running from it to Lisbon.
{
  const g = newGame(106);
  g.checkStory(); answerScenes(g, t);
  atQuay(g, 'funchal', t, rng);
  const leg = sailRoad(g, 'funchal', t);
  if (!leg.ok) throw new Error(`06: did not reach Funchal (${leg.why})`);
  g.crown.gold += 3000; // fixture shortcut: the purse for a House and a hull
  const officer = g.crew.officers.find((o) => o.alive && !o.ashoreAt);
  if (!officer) throw new Error('06: no officer to leave in the House');
  const said = g.foundFactory(officer.id, []);
  if (g.feitorias.length === 0) throw new Error(`06: no House founded: ${said}`);
  const hull = 'caravela-latina';
  const lineSaid = openLine(g, 'funchal', 'lisboa', g.ship.hullId === hull ? 'caravela-redonda' : hull);
  if (g.lines.length === 0) throw new Error(`06: no Line opened: ${lineSaid}`);
  save('06-line-and-house', g, 'a House at Funchal and a Line Funchal-Lisbon');
}

// 7. Late game with a patent: the career bot's own ship, docked at Lisbon, a commission in hand, act IV or later.
let late: Game | null = null;
{
  let best: Game | null = null;
  for (const seed of [3, 2, 4]) {
    const r = play(seed, {
      maxVoyages: 8, maxYears: 40, debug: false,
      stopAtLisbon: (g) => g.chronicle.act >= 4 && g.dockedAt === 'lisboa' && !!g.crown.patent,
    });
    if (r.exception) throw new Error(`07: career bot failed on seed ${seed}: ${r.exception}`);
    if (r.game.chronicle.act >= 4 && r.game.crown.patent && (r.game.mode as string) !== 'gameover') { best = r.game; break; }
  }
  if (!best) throw new Error('07: no seed produced an act IV+ captain with a patent');
  late = best;
  save('07-late-patent', best, `act ${best.chronicle.act}, patent "${best.crown.patent!.title}", year ${best.clock.date.year}`);
}

// 8. An heir: the late-game captain's child begins a new life with the old chart and book.
{
  const g = newGame(108);
  g.setOrigin('segundo');
  g.inheritFrom(late!);
  g.mode = 'port';
  save('08-heir', g, `generation ${g.generation}, inherits chart, purse and stations`);
}

// 9. A quest thread under way: take up the first thread the Lisbon quay offers, play its opening beat.
{
  let g: Game | null = null;
  for (let seed = 109; seed < 140 && !g; seed++) {
    const c = newGame(seed);
    c.checkStory(); answerScenes(c, t);
    const offer = Object.values(QUESTS).find((q) => q.offeredAt.includes('lisboa') && q.available(c));
    if (!offer) continue;
    c.acceptQuest(offer.id);
    answerScenes(c, t);
    if (c.quests.length > 0) g = c;
  }
  if (!g) throw new Error('09: no quest thread could be taken at Lisbon');
  // Sail a few days on so the thread has a timer running at sea.
  standOut(g, 'funchal', 60);
  save('09-quest-thread', g, `thread "${g.quests[0].id}" taken at Lisbon, a week out`);
}

for (const o of out) console.log(`ok   ${o.name.padEnd(20)} ${(o.bytes / 1024).toFixed(0).padStart(5)} KiB  ${o.note}`);
console.log(`-- ${out.length} saves written to ${DIR} (SAVE_FORMAT ${SAVE_FORMAT})`);
void portDef; void anchorageOf;
