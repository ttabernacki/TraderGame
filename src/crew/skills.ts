export type SkillId =
  | 'navegacao' | 'marinharia' | 'cartografia' | 'comercio' | 'diplomacia' | 'lideranca';

/**
 * A thing the captain can do that another captain cannot.
 *
 * This is the whole point of the tree. A node that adds eight per cent to a
 * number is a spreadsheet entry: nobody builds a character around it and nobody
 * remembers taking it. A node that lets you fix your longitude, or lie-to in a
 * gale and still make ground, or stop needing the Crown's commission at all,
 * changes which routes exist and which voyages are possible — and two captains
 * who took different ones are playing different games.
 */
export type PerkId =
  // Seamanship
  | 'windward' | 'press' | 'crowd' | 'driveAcross' | 'spare' | 'coasting' | 'lieTo' | 'neverLose'
  // Navigation
  | 'guards' | 'celestial' | 'lunars' | 'deadReckoning' | 'leadsman' | 'setAndDrift' | 'pilotsInstinct' | 'homeward'
  // Cartography
  | 'traverse' | 'crownsMan' | 'farSight' | 'cosmographer' | 'sheetTrade' | 'copyist' | 'casaClerks' | 'secretChart'
  // Leadership
  | 'loved' | 'fairShares' | 'followAnywhere' | 'feared' | 'hardRations' | 'lash' | 'nobodyDares'
  // Diplomacy
  | 'readCourt' | 'treaty' | 'giftsOfState' | 'keptWord' | 'feitoria' | 'force' | 'gunboat' | 'tribute' | 'viceroy'
  // Trade
  | 'factorsEye' | 'patience' | 'brokers' | 'ownAccount' | 'credit' | 'licences' | 'antwerpEarly' | 'kingsPartner';

export interface SkillDef {
  id: SkillId;
  name: string;
  english: string;
  blurb: string;
}

export const SKILLS: SkillDef[] = [
  {
    id: 'marinharia', name: 'Marinharia', english: 'Seamanship',
    blurb: 'Handling the ship: setting, trimming, and knowing when to take it all in.',
  },
  {
    id: 'navegacao', name: 'Navegação', english: 'Navigation',
    blurb: 'Reckoning a position from course, distance, and the height of the heavens.',
  },
  {
    id: 'cartografia', name: 'Cartografia', english: 'Cartography',
    blurb: 'Turning what you saw into a sheet another man can sail by.',
  },
  {
    id: 'lideranca', name: 'Liderança', english: 'Leadership',
    blurb: 'Keeping men at their work three months out of sight of land.',
  },
  {
    id: 'diplomacia', name: 'Diplomacia', english: 'Diplomacy',
    blurb: 'Arriving on a strange beach and leaving it with a treaty instead of a spear in you.',
  },
  {
    id: 'comercio', name: 'Comércio', english: 'Trade',
    blurb: 'Knowing what a thing is worth here, and what it will be worth in Lisbon.',
  },
];

export interface SkillNode {
  id: string;
  tree: SkillId;
  /**
   * 1 and 2 are the trunk. 3, 4 and 5 are a school — `school` says which of
   * the two — and 6 is that school's capstone. 7 is the crown of the whole
   * tree, open to a master of either school.
   */
  tier: number;
  school?: 'a' | 'b';
  name: string;
  /** What it does, in the words the captain's book would use. */
  effect: string;
  /** Points to buy it, in its own school. Twice that from the other school. */
  cost: number;
  /** How much of this tree's hundred it is worth, for everything that scales. */
  level: number;
  perk?: PerkId;
}

/** The two schools of each discipline. */
export const SCHOOLS: Record<SkillId, { a: string; b: string }> = {
  marinharia: { a: 'The driver', b: 'The keeper' },
  navegacao: { a: 'The heavens', b: 'The board and the lead' },
  cartografia: { a: 'The surveyor', b: 'The trade in sheets' },
  lideranca: { a: 'Loved', b: 'Feared' },
  diplomacia: { a: 'The envoy', b: 'The conqueror' },
  comercio: { a: 'The factor', b: 'The venturer' },
};

type N = Omit<SkillNode, 'cost' | 'level'>;
const COST: Record<number, number> = { 1: 1, 2: 2, 3: 2, 4: 3, 5: 3, 6: 4, 7: 5 };
const LEVEL: Record<number, number> = { 1: 10, 2: 10, 3: 15, 4: 15, 5: 20, 6: 30, 7: 0 };
const node = (n: N): SkillNode => ({ ...n, cost: COST[n.tier], level: LEVEL[n.tier] });

/**
 * The trees.
 *
 * Each discipline has a trunk of two, then a fork into two schools of three,
 * each crowned by a capstone that needs all three below it. A school from the
 * trunk to its capstone is fifteen points against a career of forty-odd, so a
 * captain masters two or three disciplines and never sees the rest. Two nodes
 * of the other school may be learned at twice the price; its capstone never.
 * Every node past the trunk changes something a player does, not a number he
 * reads.
 */
export const NODES: SkillNode[] = [
  // --- Seamanship ---------------------------------------------------------
  node({ id: 'sea-hands', tree: 'marinharia', tier: 1, name: 'Smart hands',
    effect: 'Sail is made and shortened a good deal faster.' }),
  node({ id: 'sea-windward', tree: 'marinharia', tier: 2, name: 'Working to windward', perk: 'windward',
    effect: 'She lies two degrees closer to the wind, and the watch hold a better trim.' }),
  node({ id: 'sea-press', tree: 'marinharia', tier: 3, school: 'a', name: 'Press her', perk: 'press',
    effect: 'You carry canvas long past the point another man would hand it — and the spars sometimes go.' }),
  node({ id: 'sea-crowd', tree: 'marinharia', tier: 4, school: 'a', name: 'Crowd her', perk: 'crowd',
    effect: 'Every stitch drawing and every sheet flat: she makes a twentieth more of whatever canvas is set.' }),
  node({ id: 'sea-topmen', tree: 'marinharia', tier: 5, school: 'a', name: 'Topmen',
    effect: 'A picked watch aloft. Your seamanship tells in everything she does.' }),
  node({ id: 'sea-drive', tree: 'marinharia', tier: 6, school: 'a', name: 'Drive her across', perk: 'driveAcross',
    effect: 'Passages other men make in a month you make in three weeks: more drive from her canvas, and pressing her costs half the spars.' }),
  node({ id: 'sea-spare', tree: 'marinharia', tier: 3, school: 'b', name: 'Spare her', perk: 'spare',
    effect: 'Worked gently, she wears and leaks at half the rate. You will never be the fastest.' }),
  node({ id: 'sea-tacking', tree: 'marinharia', tier: 4, school: 'b', name: 'Conning her in close water', perk: 'coasting',
    effect: 'She is never caught in stays, and you can hand the watch a coast and an offing and let them run it.' }),
  node({ id: 'sea-lieto', tree: 'marinharia', tier: 5, school: 'b', name: 'Lying-to', perk: 'lieTo',
    effect: 'In a gale you lie-to under a scrap of canvas, and the seas that would come aboard pass under her.' }),
  node({ id: 'sea-never', tree: 'marinharia', tier: 6, school: 'b', name: 'Never lose a ship', perk: 'neverLose',
    effect: 'Once in a career, the sea that should have had her does not: she is got off, pumped out, and brought home.' }),

  // --- Navigation ---------------------------------------------------------
  node({ id: 'nav-leeway', tree: 'navegacao', tier: 1, name: 'Allowance for leeway',
    effect: 'You plot the course she actually makes rather than the one she is steering.' }),
  node({ id: 'nav-variation', tree: 'navegacao', tier: 2, name: 'Reading the compass',
    effect: 'You recognise magnetic variation for what it is and allow for most of it.' }),
  node({ id: 'nav-guards', tree: 'navegacao', tier: 3, school: 'a', name: 'The rule of the Guards', perk: 'guards',
    effect: 'You work the pole star’s circle properly, and your sights are a good deal truer in any sea.' }),
  node({ id: 'nav-celestial', tree: 'navegacao', tier: 4, school: 'a', name: 'The heavens', perk: 'celestial',
    effect: 'Sights hold their accuracy in a seaway and in weather that defeats other pilots.' }),
  node({ id: 'nav-astrolabe', tree: 'navegacao', tier: 5, school: 'a', name: 'The astrolabe on deck',
    effect: 'A master of the instrument: your navigation tells in every sight you take.' }),
  node({ id: 'nav-lunars', tree: 'navegacao', tier: 6, school: 'a', name: 'Longitude by lunars', perk: 'lunars',
    effect: 'You can fix your longitude. No other man alive can, and the ocean stops being a guess.' }),
  node({ id: 'nav-dr', tree: 'navegacao', tier: 3, school: 'b', name: 'The board', perk: 'deadReckoning',
    effect: 'Your reckoning drifts at half the rate with no sight at all. You never need a clear sky.' }),
  node({ id: 'nav-lead', tree: 'navegacao', tier: 4, school: 'b', name: 'The leadsman’s art', perk: 'leadsman',
    effect: 'Your soundings are a third truer, and a depth tells you more about where you are.' }),
  node({ id: 'nav-set', tree: 'navegacao', tier: 5, school: 'b', name: 'Set and drift', perk: 'setAndDrift',
    effect: 'You feel the current under her and allow for it: the board lays off far more of the set.' }),
  node({ id: 'nav-instinct', tree: 'navegacao', tier: 6, school: 'b', name: 'The pilot’s instinct', perk: 'pilotsInstinct',
    effect: 'With any charted land in sight you know exactly where you are: bearings twice as often and twice as true.' }),
  node({ id: 'nav-homeward', tree: 'navegacao', tier: 7, name: 'The road home', perk: 'homeward',
    effect: 'You have sailed it so often it sails itself. From any port, give the word and she is brought home to Lisbon by the proper road, safe, in the time the road takes.' }),

  // --- Cartography --------------------------------------------------------
  node({ id: 'cart-hand', tree: 'cartografia', tier: 1, name: 'A neat hand',
    effect: 'Coastlines are drawn with much less relative error.' }),
  node({ id: 'cart-survey', tree: 'cartografia', tier: 2, name: 'Running survey',
    effect: 'You chart a coast accurately from further offshore.' }),
  node({ id: 'cart-correct', tree: 'cartografia', tier: 3, school: 'a', name: 'Closing the traverse', perk: 'traverse',
    effect: 'Your sightings count for half as much again on the sheet: a coast comes right in fewer passes.' }),
  node({ id: 'cart-crown', tree: 'cartografia', tier: 4, school: 'a', name: 'The Crown’s man', perk: 'crownsMan',
    effect: 'Discoveries and padrões are worth far more standing — and rather less coin.' }),
  node({ id: 'cart-far', tree: 'cartografia', tier: 5, school: 'a', name: 'The long glass', perk: 'farSight',
    effect: 'You survey a coast from a third further off.' }),
  node({ id: 'cart-cosmo', tree: 'cartografia', tier: 6, school: 'a', name: 'Cosmographer', perk: 'cosmographer',
    effect: 'Your chart is the chart. The Casa pays in renown and coin both, and other men sail by your survey.' }),
  node({ id: 'cart-sheets', tree: 'cartografia', tier: 3, school: 'b', name: 'The trade in sheets', perk: 'sheetTrade',
    effect: 'Your charts sell. Every voyage pays you again — and the Crown knows you are selling them.' }),
  node({ id: 'cart-copy', tree: 'cartografia', tier: 4, school: 'b', name: 'The copyist', perk: 'copyist',
    effect: 'A sheet copied from another pilot or a factor comes into your book far truer than he drew it.' }),
  node({ id: 'cart-clerks', tree: 'cartografia', tier: 5, school: 'b', name: 'Friends in the Casa', perk: 'casaClerks',
    effect: 'The Casa’s clerks pay a quarter more for what you sell them, and look the other way.' }),
  node({ id: 'cart-secret', tree: 'cartografia', tier: 6, school: 'b', name: 'The secret chart', perk: 'secretChart',
    effect: 'You sell one chart and keep the true one: the trade in sheets pays twice over.' }),

  // --- Leadership ---------------------------------------------------------
  node({ id: 'lead-known', tree: 'lideranca', tier: 1, name: 'Known to the men',
    effect: 'Morale falls more slowly on a long passage.' }),
  node({ id: 'lead-discipline', tree: 'lideranca', tier: 2, name: 'Discipline',
    effect: 'Mutinies are far less likely to take hold.' }),
  node({ id: 'lead-loved', tree: 'lideranca', tier: 3, school: 'a', name: 'Loved', perk: 'loved',
    effect: 'They volunteer for the hard work and their spirits hardly fall. They will not be driven.' }),
  node({ id: 'lead-word', tree: 'lideranca', tier: 4, school: 'a', name: 'The captain’s word',
    effect: 'The crew will sail water they believe is cursed because you told them to.' }),
  node({ id: 'lead-shares', tree: 'lideranca', tier: 5, school: 'a', name: 'Fair shares', perk: 'fairShares',
    effect: 'The officers trust your arithmetic: taking back their chests costs no loyalty, and every port lifts the men.' }),
  node({ id: 'lead-follow', tree: 'lideranca', tier: 6, school: 'a', name: 'They would follow you anywhere', perk: 'followAnywhere',
    effect: 'You may give the order that ends other expeditions — press on past the turning point, and they go.' }),
  node({ id: 'lead-feared', tree: 'lideranca', tier: 3, school: 'b', name: 'Feared', perk: 'feared',
    effect: 'They work through exhaustion and never break. They also run the moment you touch a quay.' }),
  node({ id: 'lead-rations', tree: 'lideranca', tier: 4, school: 'b', name: 'Short allowance', perk: 'hardRations',
    effect: 'Nobody takes a biscuit you did not give him: the stores last an eighth longer.' }),
  node({ id: 'lead-lash', tree: 'lideranca', tier: 5, school: 'b', name: 'The lash', perk: 'lash',
    effect: 'Unrest is put down before it becomes anything: grievances take half as long to fade.' }),
  node({ id: 'lead-dares', tree: 'lideranca', tier: 6, school: 'b', name: 'Nobody dares', perk: 'nobodyDares',
    effect: 'No man aboard will be the first to come aft. There is never a mutiny.' }),

  // --- Diplomacy ----------------------------------------------------------
  node({ id: 'dip-courtesy', tree: 'diplomacia', tier: 1, name: 'Courtesy',
    effect: 'First contact goes better, and fewer misunderstandings turn violent.' }),
  node({ id: 'dip-court', tree: 'diplomacia', tier: 2, name: 'Reading a court', perk: 'readCourt',
    effect: 'You learn a court twice as fast: its factions, its temper, what its ruler wants.' }),
  node({ id: 'dip-treaty', tree: 'diplomacia', tier: 3, school: 'a', name: 'Treaty', perk: 'treaty',
    effect: 'Courts accept terms more readily from a man who writes them down properly.' }),
  node({ id: 'dip-gifts', tree: 'diplomacia', tier: 4, school: 'a', name: 'Gifts of state', perk: 'giftsOfState',
    effect: 'A well-chosen present counts for half as much again.' }),
  node({ id: 'dip-word', tree: 'diplomacia', tier: 5, school: 'a', name: 'A man of his word', perk: 'keptWord',
    effect: 'Promises kept are worth half again in trust, and the coast hears of them twice as loudly.' }),
  node({ id: 'dip-feitoria', tree: 'diplomacia', tier: 6, school: 'a', name: 'Ambassador', perk: 'feitoria',
    effect: 'Leave a factor ashore and come back to a feitoria that has been trading without you.' }),
  node({ id: 'dip-force', tree: 'diplomacia', tier: 3, school: 'b', name: 'A show of force', perk: 'force',
    effect: 'You may run out the guns instead of asking. It is quicker, and that coast never forgets it.' }),
  node({ id: 'dip-gunboat', tree: 'diplomacia', tier: 4, school: 'b', name: 'Gunboat manners', perk: 'gunboat',
    effect: 'Force is remembered half as bitterly: you know exactly how far to go.' }),
  node({ id: 'dip-tribute', tree: 'diplomacia', tier: 5, school: 'b', name: 'Tribute', perk: 'tribute',
    effect: 'A town that yields to the guns pays for the privilege, in gold.' }),
  node({ id: 'dip-viceroy', tree: 'diplomacia', tier: 6, school: 'b', name: 'Viceroy', perk: 'viceroy',
    effect: 'At the mouth of a gun you take not only leave to trade but ground for a feitoria and the trade to yourself.' }),

  // --- Trade --------------------------------------------------------------
  node({ id: 'tra-weights', tree: 'comercio', tier: 1, name: 'Weights and measures',
    effect: 'You see the true quality of what is put in front of you.' }),
  node({ id: 'tra-bargain', tree: 'comercio', tier: 2, name: 'Bargaining',
    effect: 'Noticeably better prices in every market on the coast.' }),
  node({ id: 'tra-eye', tree: 'comercio', tier: 3, school: 'a', name: 'The factor’s eye', perk: 'factorsEye',
    effect: 'Your correspondents write from every factory on the coast: their prices are in your book.' }),
  node({ id: 'tra-patience', tree: 'comercio', tier: 4, school: 'a', name: 'Patience at the table', perk: 'patience',
    effect: 'The merchant tires of you last, and you read his face far better across the cloth.' }),
  node({ id: 'tra-brokers', tree: 'comercio', tier: 5, school: 'a', name: 'Brokers you can trust', perk: 'brokers',
    effect: 'Price letters cost half as much, and none of your brokers lies to you.' }),
  node({ id: 'tra-own', tree: 'comercio', tier: 6, school: 'a', name: 'Merchant prince', perk: 'ownAccount',
    effect: 'You fit out your own voyages. The Crown’s commission becomes a thing you may take or decline.' }),
  node({ id: 'tra-credit', tree: 'comercio', tier: 3, school: 'b', name: 'Credit', perk: 'credit',
    effect: 'You may buy against the value of your cargo — and owe it whether the cargo comes home or not.' }),
  node({ id: 'tra-licences', tree: 'comercio', tier: 4, school: 'b', name: 'The King’s licences', perk: 'licences',
    effect: 'Licences cost half, and the King’s officers are half as likely to be on the quay when you are not licensed.' }),
  node({ id: 'tra-antwerp', tree: 'comercio', tier: 5, school: 'b', name: 'A correspondent in Antwerp', perk: 'antwerpEarly',
    effect: 'The Casa’s factor in Antwerp sells for you from the first voyage, and the houses pay more on contract.' }),
  node({ id: 'tra-partner', tree: 'comercio', tier: 6, school: 'b', name: 'The King’s partner', perk: 'kingsPartner',
    effect: 'The Casa takes the King’s goods from you at nine-tenths of the market, and the houses offer a third contract.' }),
];

export const NODE_BY_ID = new Map(NODES.map((n) => [n.id, n]));

export function nodesOf(tree: SkillId): SkillNode[] {
  return NODES.filter((n) => n.tree === tree)
    .sort((a, b) => (a.school ?? '').localeCompare(b.school ?? '') || a.tier - b.tier);
}

/** What the captain has bought, and what he has left to spend. */
export interface CaptainSkills {
  points: number;
  /** Node ids, in the order they were taken. */
  taken: string[];
  /** The shape of the trees this was bought against. */
  v?: number;
  /** Progress toward the next point earned by practice, per discipline. */
  practice?: Partial<Record<SkillId, number>>;
  /** Points already earned by practice, per discipline. */
  earned?: Partial<Record<SkillId, number>>;
  /** The one reckoning-up a career allows. */
  respecUsed?: boolean;
  /** Never lose a ship, spent. */
  reprieved?: boolean;
}

export function newCaptainSkills(): CaptainSkills {
  // Three to begin with: enough to open a tree and feel the shape of the
  // choice, not enough to hedge.
  return { points: 3, taken: [], v: 2, practice: {}, earned: {} };
}

/** What each discipline's practice is counted in, and how much of it is a point. */
export const PRACTICE: Record<SkillId, { per: number; unit: string; cap: number }> = {
  marinharia: { per: 2, unit: 'gales weathered', cap: 3 },
  navegacao: { per: 25, unit: 'sights worked', cap: 3 },
  cartografia: { per: 500, unit: 'miles of coast surveyed', cap: 3 },
  lideranca: { per: 1, unit: 'voyages home with the company whole', cap: 3 },
  diplomacia: { per: 3, unit: 'treaties made and promises kept', cap: 3 },
  comercio: { per: 1500, unit: 'cruzados cleared on a voyage', cap: 3 },
};

/** Count some practice; returns the points it has earned, if any. */
export function addPractice(c: CaptainSkills, tree: SkillId, amount: number): number {
  const rule = PRACTICE[tree];
  c.practice = c.practice ?? {};
  c.earned = c.earned ?? {};
  if ((c.earned[tree] ?? 0) >= rule.cap || amount <= 0) return 0;
  let acc = (c.practice[tree] ?? 0) + amount;
  let got = 0;
  while (acc >= rule.per && (c.earned[tree] ?? 0) + got < rule.cap) { acc -= rule.per; got++; }
  c.practice[tree] = (c.earned[tree] ?? 0) + got >= rule.cap ? 0 : acc;
  c.earned[tree] = (c.earned[tree] ?? 0) + got;
  c.points += got;
  return got;
}

/** Old trees' costs by node, for refunding a captain who learned the old shape. */
const OLD_COST: Record<string, number> = {
  'sea-hands': 1, 'sea-windward': 2, 'sea-press': 2, 'sea-spare': 2, 'sea-tacking': 3, 'sea-lieto': 4,
  'nav-leeway': 1, 'nav-guards': 2, 'nav-celestial': 2, 'nav-dr': 2, 'nav-variation': 3, 'nav-lunars': 4,
  'cart-hand': 1, 'cart-survey': 2, 'cart-crown': 2, 'cart-sheets': 2, 'cart-correct': 3, 'cart-cosmo': 4,
  'lead-known': 1, 'lead-discipline': 2, 'lead-loved': 2, 'lead-feared': 2, 'lead-word': 3, 'lead-follow': 4,
  'dip-courtesy': 1, 'dip-court': 2, 'dip-treaty': 2, 'dip-force': 2, 'dip-gifts': 3, 'dip-feitoria': 4,
  'tra-weights': 1, 'tra-bargain': 2, 'tra-credit': 2, 'tra-eye': 2, 'tra-house': 3, 'tra-own': 4,
};

/**
 * A captain from before the trees were redrawn: everything he bought is given
 * back as points to spend again. Returns the points refunded.
 */
export function migrateCaptain(c: CaptainSkills): number {
  if (c.v === 2) return 0;
  const back = c.taken.reduce((sum, id) => sum + (OLD_COST[id] ?? 0), 0);
  c.points += back;
  c.taken = [];
  c.v = 2;
  c.practice = c.practice ?? {};
  c.earned = c.earned ?? {};
  return back;
}

/** Spent points, all of them, for the one reckoning-up a career allows. */
export function respec(c: CaptainSkills): number {
  const back = c.taken.reduce((sum, id) => sum + (costFor(c, NODE_BY_ID.get(id)!, true) ?? 0), 0);
  c.points += back;
  c.taken = [];
  c.respecUsed = true;
  return back;
}

export type SkillSet = Record<SkillId, number>;

/**
 * The captain's own levels, derived from what he has bought.
 *
 * Everything in the simulation still reads a 0-100 level through `skill()`, so
 * the tree feeds the existing model rather than replacing it: the nodes are
 * where the interesting, discrete capability lives, and the level is what all
 * the continuous things — how fast sail comes in, how well a coast is drawn —
 * go on scaling with.
 */
export function levelsOf(c: CaptainSkills): SkillSet {
  const out: SkillSet = {
    navegacao: 0, marinharia: 0, cartografia: 0,
    comercio: 0, diplomacia: 0, lideranca: 0,
  };
  for (const id of c.taken) {
    const n = NODE_BY_ID.get(id);
    if (n) out[n.tree] += n.level;
  }
  return out;
}

export function perksOf(c: CaptainSkills): Set<PerkId> {
  const out = new Set<PerkId>();
  for (const id of c.taken) {
    const p = NODE_BY_ID.get(id)?.perk;
    if (p) out.add(p);
  }
  return out;
}

/** The school a captain chose in a tree: the one his first school node was in. */
export function schoolOf(c: CaptainSkills, tree: SkillId): 'a' | 'b' | null {
  for (const id of c.taken) {
    const n = NODE_BY_ID.get(id);
    if (n && n.tree === tree && n.school) return n.school;
  }
  return null;
}

/**
 * What a node costs this captain: its price in his own school, twice that in
 * the other. `refund` prices it as it was bought, for a respec.
 */
export function costFor(c: CaptainSkills, n: SkillNode, refund = false): number {
  if (!n.school) return n.cost;
  const mine = schoolOf(c, n.tree);
  if (refund) {
    // The first school node bought is the school; anything of the other was double.
    return !mine || mine === n.school ? n.cost : n.cost * 2;
  }
  return !mine || mine === n.school ? n.cost : n.cost * 2;
}

/** Why a node cannot be bought, or null when it can. */
export function blockedReason(c: CaptainSkills, n: SkillNode): string | null {
  if (c.taken.includes(n.id)) return 'Already yours.';
  const tree = nodesOf(n.tree);
  const has = (tier: number, school?: 'a' | 'b') => tree.some((m) => m.tier === tier
    && (school === undefined || m.school === school) && c.taken.includes(m.id));
  if (n.tier === 7) {
    const caps = tree.filter((m) => m.tier === 6);
    if (!caps.some((m) => c.taken.includes(m.id))) {
      return `The capstone of either school comes first: ${caps.map((m) => m.name).join(' or ')}.`;
    }
    return c.points < n.cost ? `${n.cost} points; you have ${c.points}.` : null;
  }
  if (n.tier === 2 && !has(1)) return `${tree.find((m) => m.tier === 1)!.name} comes first.`;
  if (n.tier >= 3 && !has(2)) return `${tree.find((m) => m.tier === 2)!.name} comes first.`;
  const mine = schoolOf(c, n.tree);
  const other = !!n.school && !!mine && mine !== n.school;
  if (other) {
    if (n.tier === 6) return `The capstone of the other school is not for you: you are ${SCHOOLS[n.tree][mine!].toLowerCase()}.`;
    const dipped = c.taken.filter((id) => { const m = NODE_BY_ID.get(id); return m && m.tree === n.tree && m.school === n.school; }).length;
    if (dipped >= 2) return 'Two of the other school is as far as a man goes.';
  }
  if (n.tier >= 4 && n.school && !has(n.tier - 1, n.school)) {
    return `${tree.find((m) => m.tier === n.tier - 1 && m.school === n.school)!.name} comes first.`;
  }
  const price = costFor(c, n);
  if (c.points < price) return `${price} points; you have ${c.points}.`;
  return null;
}

export function buyNode(c: CaptainSkills, id: string): boolean {
  const node = NODE_BY_ID.get(id);
  if (!node || blockedReason(c, node)) return false;
  c.points -= costFor(c, node);
  c.taken.push(node.id);
  return true;
}

/** Normalised 0-1 value used throughout the simulation. */
export function skill(set: SkillSet, id: SkillId): number {
  return Math.max(0, Math.min(1, set[id] / 100));
}

export function rankOf(level: number): string {
  if (level >= 95) return 'Master';
  if (level >= 75) return 'Expert';
  if (level >= 55) return 'Accomplished';
  if (level >= 35) return 'Competent';
  if (level >= 15) return 'Practised';
  return 'Novice';
}
