import { clamp } from '../../core/math';
import { MONTH, pull } from './core';
import { declareReader } from './modifiers';
import { launch, months, yearOf, att, stageOf, type Ctx } from './moves';
import type { PowerId } from './types';

/**
 * The remaining conflicts (BUILD_PLAN E3): small state machines, each with a plain rumour and a price in force.
 *
 *   senegal     the Wolof edge under pressure from horsemen out of the east; Arguim and Portudal feel it (the Sahel).
 *   akan        the kingdoms of the Mina coast quarrelling over who sells to the Castle (the Gold's other half).
 *   kongo       the succession at Mbanza Kongo, between the old king's failing and one son holding the court.
 *   ndongo      the Ngola's tribute to Kongo, lightly: late, then withheld, then not paid.
 *
 * A machine is a phase, when the phase began and when it must be left, kept in the owning Power's `flags` as
 * `<key>Phase`, `<key>At` and `<key>Until` (the `At`/`Until` names are the ones an heir's clock shifts, and the flags
 * are what a save already carries, so nothing here adds a field to the save). Each phase is one Effect `marketModifiers`
 * reads and one rumour with a true tale and, sometimes, a stale and a false one beside it. A machine gets at most one
 * transition a month, and draws only from its own generator: a stretch of months ticked at once equals the months
 * ticked singly.
 *
 * SOURCES, AND WHAT IS INVENTED (docs/SOURCES.md, "The Fronts staged (E3)"). That the Wolof court was split and sought
 * Portuguese help (the prince called Bemoim at Lisbon in 1488), that the Fula pressed the Senegal valley from the 1490s,
 * that the Songhai under Askia Muhammad were expanding west in the early 1500s, that the Akan coast had several rival
 * kingdoms selling to the Castle, that the throne of Kongo passed to Afonso I after a contest c. 1506-09 and that Ndongo
 * was Kongo's tributary and broke from it, are documented in outline. The sequence, the lengths, the chances and every
 * price below are the game's own. No scene gives a year for any of it.
 */

declareReader('moves.conflicts');

const num = (v: unknown): number => (typeof v === 'number' ? v : 0);
const phaseOf = (c: Ctx, p: PowerId, key: string): number => num(c.st.powers[p].flags[`${key}Phase`]);
const dueAt = (c: Ctx, p: PowerId, key: string): boolean => {
  const u = c.st.powers[p].flags[`${key}Until`];
  return typeof u === 'number' && c.t >= u;
};
function enter(c: Ctx, p: PowerId, key: string, phase: number, dur: number): void {
  const f = c.st.powers[p].flags;
  f[`${key}Phase`] = phase;
  f[`${key}At`] = c.t;
  f[`${key}Until`] = c.t + dur * MONTH;
}
const runs = (c: Ctx, p: PowerId, key: string): number => num(c.st.powers[p].flags[`${key}Runs`]);

/** The phases of a machine, by name, for the Book and the falsifier. Index = the phase number kept in the flags. */
export const MACHINES: Record<'senegal' | 'akan' | 'kongo' | 'ndongo', { power: PowerId; key: string; phases: string[] }> = {
  senegal: { power: 'sahel', key: 'sen', phases: ['quiet', 'pressure', 'war', 'settled'] },
  akan: { power: 'akan', key: 'akq', phases: ['quiet', 'quarrel', 'war', 'settled'] },
  kongo: { power: 'kongo', key: 'ksc', phases: ['waiting', 'failing', 'contest', 'settled'] },
  ndongo: { power: 'kongo', key: 'ndo', phases: ['vassal', 'late', 'withheld', 'free'] },
};

export const machinePhase = (c: Pick<Ctx, 'st'>, m: keyof typeof MACHINES): { phase: number; name: string } => {
  const d = MACHINES[m];
  const n = num(c.st.powers[d.power].flags[`${d.key}Phase`]);
  return { phase: n, name: d.phases[n] ?? d.phases[0] };
};

// ---------------------------------------------------------------------------------------------
// The Senegal: horsemen from the east and the Wolof court

const SEN_PORTS = ['portudal'];

function senegal(c: Ctx): void {
  const p = 'sahel';
  const ph = phaseOf(c, p, 'sen');
  const f = c.st.powers.sahel.flags;
  if (ph === 0) {
    // Documented in outline from the 1480s on (the Wolof prince at Lisbon in 1488; the Fula on the river after); the chance is the game's own.
    const gate = yearOf(c.t) >= 1485 && runs(c, p, 'sen') < 2 && c.t >= num(f.senUntil);
    if (gate && c.rng.chance(0.012 + (att(c, 'sahel') <= -0.2 ? 0.006 : 0))) {
      const dur = months(c.rng, 5, 9);
      enter(c, p, 'sen', 1, dur);
      launch(c, {
        kind: 'stub', power: p, ports: [...SEN_PORTS, 'arguim'], dur, stock: { couros: 0.85, marfim: 0.85 }, price: { cavalos: 1.12 }, blight: 0.01,
        reason: 'Horsemen from the east are pressing the Wolof and the river people, and the caravans and the hides are late.',
        said: 'Horsemen pressed the Wolof edge.', kindName: 'pressure',
        rumour: {
          place: 'portudal',
          truth: { claim: 'Riders out of the east, the Songhai’s men or the Fula’s, are pressing the Wolof on the river, and a good horse is dear on the coast.', vague: 'There is trouble on the river behind Portudal.' },
          stale: { claim: 'The Damel’s horsemen hold the river, and the hides come down on time.', vague: 'The Wolof edge is quiet.' },
          falsehood: { claim: 'The Songhai have taken the Damel’s town and are riding for the coast.', vague: 'The Wolof are broken.' },
        },
      });
    }
    return;
  }
  if (!dueAt(c, p, 'sen')) return;
  if (ph === 1) {
    if (c.rng.chance(0.55)) {
      const dur = months(c.rng, 6, 11);
      enter(c, p, 'sen', 2, dur);
      launch(c, {
        kind: 'war', power: p, ports: SEN_PORTS, dur, closes: true, blight: 0.02, price: { cavalos: 1.3, ferramenta: 1.15 }, stock: { couros: 0.6, panos: 0.7 },
        reason: 'The Damel is at war with the riders from the east, and the coast at Portudal is shut to traders.',
        said: 'Went to war on the Senegal.', kindName: 'war', front: { id: 'traffic', delta: 0.05 },
        rumour: {
          place: 'portudal',
          truth: { claim: 'The Damel has gone to war on the river, and the beach at Portudal is shut to traders until it is done.', vague: 'There is war behind Portudal.' },
          stale: { claim: 'Portudal is open, and the Damel’s people buy horses at any price.', vague: 'Portudal trades as it did.' },
          falsehood: { claim: 'The Damel is dead, and his brothers are at each other’s throats.', vague: 'The Wolof have lost their king.' },
        },
      });
      launch(c, {
        kind: 'stub', power: p, ports: ['arguim'], dur, stock: { goma: 0.75, ouro: 0.9 }, blight: 0.008,
        reason: 'With the river in arms the caravans for Arguim are thin, and the gum is short.', said: 'The caravans thinned.', kindName: 'caravans',
        rumour: { place: 'arguim', truth: { claim: 'The caravans are thin at Arguim, and the factor says it is the war on the river.', vague: 'Arguim is short of gum.' }, stale: { claim: 'The gum is plentiful at Arguim and the factor is paying in horses.', vague: 'Arguim is full.' } },
      });
    } else {
      // The pressure eased of itself: the hides and the horses come down again, a little cheaper for having been held back.
      const dur = months(c.rng, 8, 14);
      enter(c, p, 'sen', 3, dur);
      launch(c, {
        kind: 'welcome', power: p, ports: SEN_PORTS, dur, duesMult: 0.97, stock: { couros: 1.06 }, price: { cavalos: 0.97 },
        reason: 'The riders have gone back east, and what the river people held back is coming down to the beach.',
        said: 'The pressure on the Wolof edge eased.', kindName: 'eased',
        rumour: {
          place: 'portudal',
          truth: { claim: 'The riders have gone back east, and the Wolof road is open.', vague: 'The trouble behind Portudal has passed.' },
          stale: { claim: 'The Wolof edge is in arms.', vague: 'There is war behind Portudal.' },
        },
      });
    }
    return;
  }
  if (ph === 2) {
    // Who holds the river when it is done: the Damel, or the riders.
    const holds = c.rng.chance(0.5);
    const dur = months(c.rng, 14, 26);
    enter(c, p, 'sen', 3, dur);
    f.senHolds = holds ? 'damel' : 'riders';
    if (holds) {
      launch(c, {
        kind: 'welcome', power: p, ports: SEN_PORTS, dur, duesMult: 0.92, stock: { couros: 1.1, panos: 1.1 },
        reason: 'The Damel holds the river again, and his people are selling what they kept back through the war.',
        said: 'The Damel held the river.', kindName: 'held',
        rumour: { place: 'portudal', truth: { claim: 'The Damel has beaten the riders back and holds the river, and what was kept back is on the beach for sale.', vague: 'The Wolof have held.' }, stale: { claim: 'The Damel is hard pressed on the river.', vague: 'The Wolof are in trouble.' } },
      });
    } else {
      launch(c, {
        kind: 'stub', power: p, ports: [...SEN_PORTS, 'arguim'], dur, duesMult: 1.1, stock: { marfim: 0.8 }, price: { cavalos: 1.1, panos: 1.08 },
        reason: 'The riders hold the river road now, and take their toll of what goes up and what comes down.',
        said: 'The riders held the river.', kindName: 'riders',
        rumour: { place: 'portudal', truth: { claim: 'The riders from the east hold the river road now, and take a toll on all of it.', vague: 'There are new masters on the river.' }, stale: { claim: 'The Damel holds the river road.', vague: 'The Wolof hold the road.' } },
      });
    }
    pull(c.st, 'traffic', holds ? -0.03 : 0.06);
    return;
  }
  // ph === 3: the new order has run its term; the machine may run once more, after a rest.
  f.senRuns = runs(c, p, 'sen') + 1;
  f.senPhase = 0;
  f.senUntil = c.t + 30 * MONTH;
}

// ---------------------------------------------------------------------------------------------
// The Mina coast: the kingdoms behind the Castle

const AKAN_BEACH = ['axim', 'acara'];

function akan(c: Ctx): void {
  const p = 'akan';
  const ph = phaseOf(c, p, 'akq');
  const f = c.st.powers.akan.flags;
  const gold = stageOf(c, 'gold');
  const a = att(c, 'akan');
  if (ph === 0) {
    const gate = gold >= 2 && runs(c, p, 'akq') < 3 && c.t >= num(f.akqUntil);
    // Strain and a sour beach make a quarrel likelier; a friendly beach makes it rare.
    if (gate && c.rng.chance(clamp(0.008 + (gold - 2) * 0.006 - a * 0.012, 0.002, 0.04))) {
      const dur = months(c.rng, 4, 8);
      enter(c, p, 'akq', 1, dur);
      launch(c, {
        kind: 'stub', power: p, ports: ['mina'], dur, price: { ouro: 1.05 }, stock: { ouro: 0.9 }, duesMult: 1.08, blight: 0.01,
        reason: 'Two of the kingdoms behind Mina are quarrelling over which of them sells to the Castle, and each of them wants its toll on the beach.',
        said: 'Two kingdoms quarrelled over the Castle’s trade.', kindName: 'quarrel',
        rumour: {
          place: 'mina',
          truth: { claim: 'Two of the kingdoms behind Mina are quarrelling over which of them sells to the Castle, and each wants a toll on the beach.', vague: 'The Akan are at odds behind Mina.' },
          stale: { claim: 'The Akan sell to the Castle through one man, at one price.', vague: 'Mina is orderly.' },
          falsehood: { claim: 'The kingdoms have agreed to sell to Castile and not to the Castle.', vague: 'The Akan are selling elsewhere.' },
        },
      });
    }
    return;
  }
  if (!dueAt(c, p, 'akq')) return;
  if (ph === 1) {
    // A hard Gold or a sour beach turns it to arms; a friendly beach and a quiet fort settle it at once.
    const war = c.rng.chance(clamp(0.3 + (gold - 2) * 0.12 - a * 0.3, 0.05, 0.8));
    if (war) {
      const dur = months(c.rng, 5, 9);
      enter(c, p, 'akq', 2, dur);
      launch(c, {
        kind: 'war', power: p, ports: AKAN_BEACH, dur, closes: true, blight: 0.02, stock: { ouro: 0.6 },
        reason: 'The kingdoms behind the coast are at war, and the beaches at Axim and Acara are shut to traders.',
        said: 'The kingdoms went to war behind the coast.', kindName: 'war', front: { id: 'gold', delta: 0.35 },
        rumour: {
          place: 'mina',
          truth: { claim: 'The kingdoms behind the coast have gone to war, and the beaches at Axim and Acara are shut to traders while it lasts.', vague: 'There is war behind the Mina coast.' },
          stale: { claim: 'The beaches at Axim and Acara are open, and the gold comes down quietly.', vague: 'The beaches are quiet.' },
          falsehood: { claim: 'The Akan have burned the factory at Axim.', vague: 'There has been a burning at Axim.' },
        },
      });
      launch(c, {
        kind: 'stub', power: p, ports: ['mina'], dur, price: { ouro: 1.1 }, stock: { ouro: 0.7 }, blight: 0.012,
        reason: 'With the beaches at war the gold comes down to the Castle by fewer hands, and dearer.', said: 'The gold came down by fewer hands.', kindName: 'dear',
        rumour: { place: 'mina', truth: { claim: 'The Castle is buying less gold and paying more for it, with the beaches at war.', vague: 'Gold is short at Mina.' }, stale: { claim: 'The Castle’s gold is plentiful.', vague: 'Gold is plentiful at Mina.' } },
      });
    } else {
      const dur = 10;
      enter(c, p, 'akq', 3, dur);
      launch(c, {
        kind: 'welcome', power: p, ports: ['mina'], dur, duesMult: 0.95, stock: { ouro: 1.03 },
        reason: 'The kingdoms behind the coast have settled their quarrel, and the tolls on the beach are lifted.',
        said: 'The quarrel behind Mina was settled without a war.', kindName: 'settled', front: { id: 'gold', delta: -0.15 },
        rumour: {
          place: 'mina', front: 'gold',
          truth: { claim: 'The Akan kingdoms have settled their quarrel over the Castle’s trade without a war, and the tolls on the beach are lifted.', vague: 'The Akan have settled it.' },
          stale: { claim: 'The Akan are still at odds behind Mina.', vague: 'The Akan are at odds.' },
        },
      });
    }
    return;
  }
  if (ph === 2) {
    const dur = months(c.rng, 12, 20);
    enter(c, p, 'akq', 3, dur);
    const friendly = a >= 0.15;
    f.akqHolds = friendly ? 'castle' : 'beach';
    launch(c, {
      kind: friendly ? 'welcome' : 'stub', power: p, ports: ['mina'], dur,
      ...(friendly ? { duesMult: 0.92, stock: { ouro: 1.05 } } : { duesMult: 1.1, stock: { ouro: 0.9 }, price: { ouro: 1.04 } }),
      reason: friendly
        ? 'One kingdom holds the beach now, and sells to the Castle on the old terms.'
        : 'One kingdom holds the beach now, and sets its own terms on every ship that lands.',
      said: friendly ? 'One kingdom held the beach and kept the old terms.' : 'One kingdom held the beach and set new terms.', kindName: 'beach',
      front: { id: 'gold', delta: friendly ? -0.2 : 0.2 },
      rumour: {
        place: 'mina',
        truth: { claim: friendly ? 'One kingdom holds the beach now and sells to the Castle on the old terms.' : 'One kingdom holds the beach now and sets its own terms on every ship that lands.', vague: 'The beach has a new master.' },
        stale: { claim: 'The beach is divided among the kingdoms, and the Castle deals with all.', vague: 'The beach is divided.' },
      },
    });
    return;
  }
  f.akqRuns = runs(c, p, 'akq') + 1;
  f.akqPhase = 0;
  f.akqUntil = c.t + 24 * MONTH;
}

// ---------------------------------------------------------------------------------------------
// Kongo: the succession

const KONGO_PORTS = ['mpinda'];

function kongo(c: Ctx): void {
  const p = 'kongo';
  const ph = phaseOf(c, p, 'ksc');
  const f = c.st.powers.kongo.flags;
  const k = c.st.powers.kongo;
  if (ph === 0) {
    // The old king fails somewhere between 1506 and 1509 (the sources differ; no scene says when): 3% a month from 1506, certain by 1509.
    const y = yearOf(c.t);
    const gate = y >= 1506 && !f.kscDone && !f.succession;
    if (gate && (y >= 1509 || c.rng.chance(0.03))) {
      const dur = months(c.rng, 4, 8);
      enter(c, p, 'ksc', 1, dur);
      launch(c, {
        kind: 'succession', power: p, ports: KONGO_PORTS, dur, duesMult: 1.1, stock: { marfim: 0.92 },
        reason: 'The old Manikongo is failing, and the court is counting who stands behind which of his sons; the beach is cautious.',
        said: 'The old king failed, and the court began to count.', kindName: 'failing',
        rumour: {
          place: 'mpinda',
          truth: { claim: 'The old Manikongo is failing, and the elders, the traders and the warriors are each counting who stands behind which of his sons.', vague: 'There is trouble at the Manikongo’s court.' },
          stale: { claim: 'The Manikongo is well, and the court is quiet.', vague: 'The Manikongo’s court is quiet.' },
          falsehood: { claim: 'The Manikongo is dead, and his sons are at war.', vague: 'The Manikongo is dead.' },
        },
      });
    }
    return;
  }
  if (!dueAt(c, p, 'ksc')) return;
  if (ph === 1) {
    const dur = months(c.rng, 4, 9);
    enter(c, p, 'ksc', 2, dur);
    launch(c, {
      kind: 'succession', power: p, ports: KONGO_PORTS, dur, duesMult: 1.25, stock: { marfim: 0.75 }, price: { panos: 1.1, ferramenta: 1.15 }, blight: 0.02,
      reason: 'Two of the old king’s sons have men under arms, and the road to the capital is held by whoever got there first.',
      said: 'Two sons took up arms.', kindName: 'contest',
      rumour: {
        place: 'mpinda',
        truth: { claim: 'Two of the old king’s sons have men under arms, and the road up to the capital is held by whoever reached it first.', vague: 'There is fighting over the Manikongo’s seat.' },
        stale: { claim: 'The old Manikongo’s sons are quiet, and the beach trades as it does.', vague: 'Mpinda is quiet.' },
        falsehood: { claim: 'The Portuguese priests have been driven out of the capital.', vague: 'The priests have been sent away.' },
      },
    });
    return;
  }
  if (ph === 2) {
    // The winner: the party the Traffic and the Ledger have made the stronger. Goodwill toward the captain tilts it to the son who keeps the old terms.
    const bal = k.balance ?? 0;
    const traders = c.rng.chance(clamp(0.5 + bal * 0.3 - k.attitude * 0.1, 0.15, 0.85));
    const dur = months(c.rng, 14, 24);
    enter(c, p, 'ksc', 3, dur);
    f.kscDone = true;
    f.kscWinner = traders ? 'traders' : 'elders';
    k.balance = clamp(bal + (traders ? 0.3 : -0.3), -1, 1);
    if (traders) {
      pull(c.st, 'traffic', 0.18);
      launch(c, {
        kind: 'push', power: p, ports: KONGO_PORTS, dur, stock: { marfim: 1.1, panos: 1.1 },
        reason: 'The son who sells to whoever comes holds the throne, and the traders have the beach.',
        said: 'The traders’ son took the throne.', kindName: 'settled',
        rumour: {
          place: 'mpinda',
          truth: { claim: 'The son the traders backed holds the throne, and the beach at Mpinda sells to whoever comes.', vague: 'There is a new Manikongo.' },
          stale: { claim: 'The old king’s sons are still in arms, and the road is shut.', vague: 'The fighting goes on.' },
        },
      });
    } else {
      pull(c.st, 'traffic', -0.12);
      launch(c, {
        kind: 'register', power: p, ports: KONGO_PORTS, dur, duesMult: 1.12,
        reason: 'The son the elders and the priests backed holds the throne, and his officers count everyone who goes down to the beach.',
        said: 'The elders’ son took the throne.', kindName: 'settled',
        rumour: {
          place: 'mpinda',
          truth: { claim: 'The son the elders backed holds the throne, and his officers count everyone who goes down to the beach at Mpinda.', vague: 'There is a new Manikongo.' },
          stale: { claim: 'The old king’s sons are still in arms, and the road is shut.', vague: 'The fighting goes on.' },
        },
      });
    }
    return;
  }
  // settled and run its term: nothing more of this contest.
  f.kscPhase = 0;
}

// ---------------------------------------------------------------------------------------------
// Ndongo, lightly

const NDONGO_PORTS = ['luanda', 'benguela'];

function ndongo(c: Ctx): void {
  const p = 'kongo';
  const ph = phaseOf(c, p, 'ndo');
  const f = c.st.powers.kongo.flags;
  if (ph === 0) {
    if (yearOf(c.t) >= 1500 && !f.ndoDone && c.rng.chance(0.012)) {
      const dur = months(c.rng, 6, 10);
      enter(c, p, 'ndo', 1, dur);
      launch(c, {
        kind: 'stub', power: p, ports: NDONGO_PORTS, dur, price: { sal: 1.1 }, stock: { marfim: 0.9 }, blight: 0.008,
        reason: 'The Ngola has sent the Manikongo’s tribute late, and the traders on the coast south of Mpinda are waiting to see what comes of it.',
        said: 'The Ngola’s tribute came late.', kindName: 'late',
        rumour: {
          place: 'luanda',
          truth: { claim: 'The Ngola has sent the Manikongo’s tribute late, and the traders on the coast are waiting to see what comes of it.', vague: 'The Ngola is slow with his tribute.' },
          stale: { claim: 'The Ngola pays the Manikongo on the day, as his fathers did.', vague: 'The Ngola pays.' },
          falsehood: { claim: 'The Ngola has declared himself king.', vague: 'The Ngola has broken away.' },
        },
      });
    }
    return;
  }
  if (!dueAt(c, p, 'ndo')) return;
  if (ph === 1) {
    const dur = months(c.rng, 8, 14);
    enter(c, p, 'ndo', 2, dur);
    launch(c, {
      kind: 'stub', power: p, ports: NDONGO_PORTS, dur, price: { sal: 1.2, panos: 1.1 }, stock: { marfim: 0.8 }, blight: 0.012, duesMult: 1.1,
      reason: 'The Ngola is keeping what he owes the Manikongo, and the coast south of the Congo is asking whose beach it is.',
      said: 'The Ngola kept the tribute.', kindName: 'withheld',
      rumour: {
        place: 'luanda',
        truth: { claim: 'The Ngola is keeping the tribute he owes the Manikongo, and the coast south of the Congo is asking whose beach it is.', vague: 'The Ngola is not paying.' },
        stale: { claim: 'The Ngola pays late, but he pays.', vague: 'The Ngola pays.' },
      },
    });
    return;
  }
  if (ph === 2) {
    const dur = months(c.rng, 16, 28);
    enter(c, p, 'ndo', 3, dur);
    f.ndoDone = true;
    launch(c, {
      kind: 'welcome', power: p, ports: NDONGO_PORTS, dur, duesMult: 0.95, stock: { marfim: 1.05, sal: 1.05 },
      reason: 'The Ngola answers to nobody now, and his beaches sell on his terms.',
      said: 'The Ngola answered to nobody.', kindName: 'free',
      rumour: {
        place: 'luanda',
        truth: { claim: 'The Ngola answers to nobody now, and his beaches sell on his terms.', vague: 'The Ngola is his own master.' },
        stale: { claim: 'The Ngola is the Manikongo’s man, and his beaches sell on the Manikongo’s terms.', vague: 'The Ngola is the Manikongo’s man.' },
      },
    });
    return;
  }
  f.ndoPhase = 0;
}

/** One month of the four conflicts, in their own generator. */
export function conflictsTick(c: Ctx): void {
  senegal(c);
  akan(c);
  kongo(c);
  ndongo(c);
}
