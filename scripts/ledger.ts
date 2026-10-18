/**
 * Falsifier for the Ledger (B1): the vocabulary has no dead tags, the Ledger survives a save, old marks migrate, and a
 * played career leaves a Book and an epilogue that differ between careers.
 *   npx esbuild scripts/ledger.ts --bundle --platform=node --format=cjs --outfile=/tmp/ledger.cjs && node /tmp/ledger.cjs
 *
 * Ground truth, not the expression under test: "readers" declared in tags.ts are compared with what the Book's life text,
 * the two chronicles and the muster roll actually print for a synthetic ledger holding only that tag; "emitters" are found
 * by scanning the source tree for the tag's literal outside the files that only read it.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Game } from '../src/game/state';
import { echoFor, hasMark, writeMarkAndRecord } from '../src/diplomacy/marks';
import { ALL_TAGS, TAGS, type Tag } from '../src/ledger/tags';
import { chronicles, chronicleTags, muster, MUSTER_TAGS } from '../src/ledger/chronicle';
import { life, lifeText } from '../src/ledger/life';
import { decayed, didLine, record, weightAt, type Entry } from '../src/ledger/ledger';
import { play } from './lib/careerCore';

let fails = 0;
const check = (name: string, ok: boolean, extra = ''): void => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${extra}`); if (!ok) fails++; };
const load = (f: string): any => JSON.parse(readFileSync(`fixtures/saves/${f}`, 'utf8'));

const synth = (tag: Tag, n = 1, over: Partial<Entry> = {}): Entry[] => Array.from({ length: n }, (_, i) => ({
  t: 1000 + i, place: '', tag, actors: ['captain'], target: 'malindi', magnitude: 1, witnesses: [], note: '', ...over,
}));

// 1. The vocabulary.
{
  check('vocabulary is about seventy tags', ALL_TAGS.length >= 60 && ALL_TAGS.length <= 100, `${ALL_TAGS.length} tags`);
  const bad = ALL_TAGS.filter((t) => !TAGS[t].doc || !TAGS[t].did || TAGS[t].tone < -1 || TAGS[t].tone > 1 || !/^[a-z_]+\.[a-z_]+$/.test(t));
  check('every tag has a doc, a plain line, a tone in range, family.name form', bad.length === 0, bad.join(','));
  const leaked = ALL_TAGS.filter((t) => /[{}]/.test(didLine(synth(t)[0])));
  check('every "what this did" line fills its placeholders', leaked.length === 0, leaked.join(','));
}

// 2. No dead tags: a reader and an emitter for each.
{
  const KNOWN = new Set(['book', 'epilogue.lisbon', 'epilogue.polity', 'epilogue.muster']);
  const noReader = ALL_TAGS.filter((t) => TAGS[t].readers.length === 0);
  check('every tag declares a reader', noReader.length === 0, noReader.join(','));
  const unknown = ALL_TAGS.filter((t) => TAGS[t].readers.some((r) => !KNOWN.has(r)));
  check('declared readers are real consumers', unknown.length === 0, unknown.join(','));

  // Observed readers.
  const baseLife = lifeText([]);
  const baseCh = chronicles([], 'x');
  const baseLis = JSON.stringify(baseCh.lisbon.lines);
  const wrong: string[] = [];
  for (const t of ALL_TAGS) {
    const seen = new Set<string>();
    if (lifeText(synth(t)) !== baseLife) seen.add('book');
    const ch = chronicles(synth(t, 14), 'x');
    if (JSON.stringify(ch.lisbon.lines) !== baseLis) seen.add('epilogue.lisbon');
    if (ch.others.length > 0) seen.add('epilogue.polity');
    const m = muster(synth(t, 1, { actors: ['Ruy'], target: 'Ruy', note: 'lost' }));
    if (m.total > 0) seen.add('epilogue.muster');
    const declared = new Set(TAGS[t].readers);
    for (const r of KNOWN) if (declared.has(r) !== seen.has(r)) wrong.push(`${t}:${r}(${seen.has(r) ? 'read, undeclared' : 'declared, not read'})`);
  }
  check('declared readers match what the Book, chronicles and muster print', wrong.length === 0, wrong.slice(0, 8).join(' '));
  check('chronicle tag lists agree with the vocabulary', chronicleTags('lisbon').every((t) => TAGS[t].readers.includes('epilogue.lisbon'))
    && chronicleTags('polity').every((t) => TAGS[t].readers.includes('epilogue.polity'))
    && MUSTER_TAGS.every((t) => TAGS[t].readers.includes('epilogue.muster')));

  // Emitters: the tag's literal appears in game code that is not a reader.
  const files: string[] = [];
  const walk = (d: string): void => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') && files.push(p); } };
  walk('src');
  const READ_ONLY = /src\/ledger\/(tags|chronicle|life)\.ts$|src\/ui\//;
  const text = files.filter((f) => !READ_ONLY.test(f)).map((f) => readFileSync(f, 'utf8')).join('\n');
  const dead = ALL_TAGS.filter((t) => !text.includes(`'${t}'`));
  check('every tag has an emitter in the game code', dead.length === 0, dead.join(','));

  // The mark tags are emitted through the table, so prove it by writing marks.
  const g = new Game(1);
  g.mode = 'port';
  const markKeys: [string, number][] = [['greeted', 0.5], ['greeted', -0.5], ['greeted', 0], ['envoy', 0.9], ['envoy', -0.8], ['envoy', 0.1], ['peace', 0.8], ['peace', -0.3],
    ['tray', 0.6], ['tray', -0.6], ['tray', 0.1], ['meal', 0.7], ['hall', -0.8], ['meal', 0], ['case', 0.7], ['case', -0.7], ['case', 0.1],
    ['hostage', 0.3], ['hostage', 0.8], ['hostage', -0.2], ['hostage', -1], ['pilot', 0.6], ['pilot', -0.5], ['pilot', 0], ['silent', 0.7], ['silent', -1], ['silent', 0],
    ['informer', 0.7], ['informer', -0.8], ['informer', 0], ['refusal', 0.8], ['refusal', 0], ['newpiece', 0.9], ['newpiece', -0.9], ['newpiece', 0]];
  for (const [key, tone] of markKeys) writeMarkAndRecord(g, 'malindi', { key: `${key}${tone}`.startsWith(key) ? key : key, text: `${key} ${tone}`, echo: 'e', tone });
  const markTags = new Set(g.ledger.map((e) => e.tag));
  const markFamily = ALL_TAGS.filter((t) => /^(courtesy|table|gift|peace|judgement|hostage|pilot|silent|informer|refusal|mark|envoy)\./.test(t) || t.startsWith('promise.'));
  const unreached = markFamily.filter((t) => !markTags.has(t) && !['promise.kept', 'promise.broken'].includes(t) && !t.startsWith('gift.') || (t.startsWith('gift.') && !markTags.has(t) && t !== 'gift.great' && t !== 'gift.insult' && t !== 'gift.plain'));
  check('marks of every kind land in the Ledger under their tag', unreached.length === 0, unreached.join(','));
  check('a mark keeps its echo and its key', echoFor(g.diplomacy.marks, 'malindi', g.clock.t) === 'e' && hasMark(g.diplomacy.marks, 'malindi', 'case', g.clock.t));
}

// 3. Records: notices, decay, queries.
{
  const g = new Game(2);
  g.mode = 'port';
  const alerts0 = g.alerts.length;
  record(g, 'promise.kept', { target: 'kongo', note: 'kept it' });
  check('a landed entry shows one quiet line', g.alerts.length === alerts0 + 1 && /Kongo/.test(g.alerts[g.alerts.length - 1].text) && g.alerts[g.alerts.length - 1].severity === 'note', g.alerts[g.alerts.length - 1]?.text);
  record(g, 'voyage.begun');
  check('silent tags are not announced', g.alerts.length === alerts0 + 1);
  const e = g.ledger[0];
  const yr = 365.25 * 86400;
  check('decay: fresh keeps full weight, 12 years half, 20 years gone',
    weightAt(e, e.t + 5 * yr) === 1 && Math.abs(weightAt(e, e.t + 12 * yr) - 0.5) < 1e-9 && weightAt(e, e.t + 20 * yr) === 0);
  check('decayed() drops what has faded out', decayed(g.ledger, e.t + 20 * yr).length === 0 && decayed(g.ledger, e.t + 1).length === 2);
}

// 4. Save round trip, migration of marks, golden saves.
{
  const src = readFileSync('src/game/save.ts', 'utf8');
  check('SAVE_FORMAT stays 3', /export const SAVE_FORMAT = 3;/.test(src));

  const g = new Game(3);
  g.mode = 'port';
  for (const t of ['promise.broken', 'hand.died', 'claim.made', 'loan.defaulted'] as Tag[]) {
    record(g, t, { target: 'kongo', note: `note ${t}`, actors: t === 'hand.died' ? ['Ruy'] : ['captain'], magnitude: 2 });
  }
  const json = g.serialize();
  const g2 = Game.deserialize(json);
  check('ledger round-trips through serialize/deserialize', JSON.stringify(g2.ledger) === JSON.stringify(g.ledger) && g2.ledger.length === 4);
  check('and a second time', JSON.stringify(Game.deserialize(g2.serialize()).ledger) === JSON.stringify(g.ledger));

  // The marks in golden save 07 become Ledger entries, once.
  const d = load('07-late-patent.json');
  const marks = d.diplomacy.marks.marks as { polity: string; text: string; tone: number; t: number }[];
  check('fixture 07 holds marks and no ledger', marks.length > 0 && !('ledger' in d));
  const m1 = Game.deserialize(JSON.stringify(d));
  check('marks migrate to Ledger entries at load', m1.ledger.length === marks.length
    && marks.every((m) => m1.ledger.some((e) => e.target === m.polity && e.note === m.text && e.t === m.t)),
  `${m1.ledger.length} entries from ${marks.length} marks`);
  check('migrated entries are well formed and in the vocabulary', m1.ledger.every((e) => e.tag in TAGS && e.actors.length > 0 && Number.isFinite(e.magnitude)));
  const m2 = Game.deserialize(m1.serialize());
  check('a second load does not migrate again (??= semantics)', m2.ledger.length === marks.length);
  const d2 = load('07-late-patent.json');
  d2.ledger = [];
  check('a save that already has a Ledger is left alone', Game.deserialize(JSON.stringify(d2)).ledger.length === 0);
  const d3 = load('07-late-patent.json');
  d3.ledger = [{ nonsense: true }, ...m1.ledger.slice(0, 2)];
  check('hand-mangled entries are dropped, good ones kept', Game.deserialize(JSON.stringify(d3)).ledger.length === 2);

  // Every golden save loads with a well-formed Ledger.
  let ok = 0;
  const all = readdirSync('fixtures/saves').filter((f) => f.endsWith('.json'));
  for (const f of all) {
    const gg = Game.deserialize(JSON.stringify(load(f)));
    if (Array.isArray(gg.ledger) && gg.ledger.every((e) => e.tag in TAGS)) ok++;
  }
  check('all golden saves load with a well-formed Ledger', ok === all.length, `${ok}/${all.length}`);
}

// 5. A played career leaves a Book, and two careers tell two epilogues.
{
  const seeds = [1, 3];
  const outs: { seed: number; g: Game }[] = [];
  for (const seed of seeds) {
    const r = play(seed, { maxVoyages: 4, maxYears: 14, debug: false });
    check(`career ${seed}: no exception`, r.exception === '', r.exception);
    outs.push({ seed, g: r.game });
  }
  const texts: string[] = [];
  for (const { seed, g } of outs) {
    const tags = new Set(g.ledger.map((e) => e.tag));
    const chapters = life(g.ledger);
    check(`career ${seed}: the Book has a Life`, g.ledger.length > 0 && chapters.length > 0 && chapters.some((c) => c.lines.length > 0),
      `${g.ledger.length} entries, ${tags.size} kinds, ${chapters.length} chapters`);
    check(`career ${seed}: the Ledger survives a save`, JSON.stringify(Game.deserialize(g.serialize()).ledger) === JSON.stringify(g.ledger));
    const ch = chronicles(g.ledger, 'the captain');
    const m = muster(g.ledger);
    check(`career ${seed}: Lisbon has something to say`, ch.lisbon.lines.length >= 2, `${ch.lisbon.lines.length} lines`);
    console.log(`     kinds: ${[...tags].sort().join(' ')}`);
    console.log(`     chronicles: lisbon + ${ch.others.length} courts; muster ${m.total} dead, ${m.named.length} named (crew.deaths ${g.crew.deaths})`);
    texts.push(JSON.stringify(ch) + JSON.stringify(m));
  }
  check('the epilogue differs between two careers', texts[0] !== texts[1]);
}

console.log(fails === 0 ? '\nledger: all ok' : `\nledger: ${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
