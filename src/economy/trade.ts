import { clamp } from '../core/math';
import type { Rng } from '../core/rng';
import { polityOfPort } from '../diplomacy/polities';
import { PORTS, portDef } from '../world/ports';
import { good } from './goods';

/**
 * The trade of the world beyond the counter in front of you.
 *
 * Everything here is what a merchant of the period actually had to work with,
 * and what he did not. He knew the prices of the last place he stood in and of
 * the places his letters came from, and all of them were months old. The world
 * moved while he was at sea — a war in Gujarat, a closed road through Cairo, a
 * glut on the Tagus — and he heard about it when he heard about it. Most of the
 * markets he traded in did not want his coin, and wanted some particular thing
 * he might or might not have thought to bring. Somebody else was always buying.
 * And the King took his share of anything that was worth taking.
 */

export type Region = 'europe' | 'atlantic' | 'maghreb' | 'guinea' | 'kongo' | 'cape' | 'brazil'
  | 'swahili' | 'arabia' | 'india' | 'east';

export const REGION_NAME: Record<Region, string> = {
  europe: 'Portugal and Castile', atlantic: 'The islands', maghreb: 'The Moroccan coast',
  guinea: 'Guinea', kongo: 'Kongo and Angola', cape: 'The Cape', brazil: 'The land of the Holy Cross',
  swahili: 'The Swahili coast', arabia: 'Arabia and the Gulf', india: 'India', east: 'Malacca and beyond',
};

const ISLANDS = new Set(['funchal', 'angra', 'ponta-delgada', 'las-palmas', 'ribeira-grande', 'sao-tome-porto', 'ilha-santa-helena']);

export function regionOf(portId: string): Region {
  if (ISLANDS.has(portId)) return 'atlantic';
  const pol = polityOfPort(portId);
  if (pol) return pol.network;
  const p = portDef(portId);
  switch (p.people) {
    case 'portuguese': case 'castilian': return p.lat > 30 ? 'europe' : p.lat > 0 ? 'guinea' : 'kongo';
    case 'moor': return 'maghreb';
    case 'guanche': return 'atlantic';
    case 'wolof': case 'mandinka': case 'temne': case 'akan': case 'edo': return 'guinea';
    case 'kongo': case 'ndongo': return 'kongo';
    case 'khoikhoi': return 'cape';
    case 'tupi': return 'brazil';
    case 'swahili': return 'swahili';
    case 'arab': return 'arabia';
    case 'malay': return 'east';
    default: return 'india';
  }
}

/** Days for news to get from one region to another, roughly: by the sea roads of the time. */
const REGION_ORDER: Region[] = ['brazil', 'europe', 'atlantic', 'maghreb', 'guinea', 'kongo', 'cape', 'swahili', 'arabia', 'india', 'east'];
export function newsDelayDays(from: Region, to: Region): number {
  if (from === to) return 12;
  // The Levant road: Europe hears of India through Cairo and Venice, not round the Cape.
  const levant = (a: Region, b: Region) => (a === 'europe' && (b === 'india' || b === 'arabia'))
    || (b === 'europe' && (a === 'india' || a === 'arabia'));
  if (levant(from, to)) return 110;
  const d = Math.abs(REGION_ORDER.indexOf(from) - REGION_ORDER.indexOf(to));
  return 25 + d * 32;
}

// ---------------------------------------------------------------------------
// Price knowledge

export interface Quote { ask: number; bid: number; stock: number; wanted: boolean; local: boolean }

export interface PriceSheet {
  /** When the prices on it were true. */
  t: number;
  source: 'seen' | 'letter' | 'broker';
  quotes: Record<string, Quote>;
  /** A good whose price on this sheet is a lie, until you go and find out. */
  falseGood?: string;
}

export function sheetAgeWord(days: number): string {
  if (days < 3) return 'today';
  if (days < 45) return `${Math.round(days)} days old`;
  if (days < 100) return `${Math.round(days / 30)} months old`;
  if (days < 365) return `${Math.round(days / 30)} months old — stale`;
  return 'more than a year old';
}

/** 0-1: how much a sheet this old is still worth believing. */
export function sheetConfidence(days: number): number {
  return clamp(1 - days / 300, 0.1, 1);
}

// ---------------------------------------------------------------------------
// The world's markets, moving

export interface ShockDef {
  key: string;
  title: string;
  text: string;
  region: Region;
  ports: string[];
  goods: Record<string, { ask?: number; bid?: number }>;
  days: [number, number];
  from?: number;
  to?: number;
}

export interface Shock {
  id: number;
  key: string;
  start: number;
  end: number;
  /** When the news reaches each region. */
  arrive: Partial<Record<Region, number>>;
}

const SPICES = ['pimenta', 'canela', 'cravo', 'noz', 'maca', 'gengibre', 'cardamomo'];
const spiceBid = (m: number) => Object.fromEntries(SPICES.map((s) => [s, { bid: m }]));
const MALABAR = ['calecute', 'cochim', 'cananor', 'coulao'];

export const SHOCKS: ShockDef[] = [
  {
    key: 'mamluk-road', title: 'The Sultan closes the Red Sea road', region: 'arabia',
    text: 'The Mamluk customs at Jiddah and Alexandria have doubled their dues, and the spice galleys of Venice came home half empty. Every spice is dearer in Europe this year.',
    ports: ['lisboa', 'porto', 'lagos'], goods: spiceBid(1.3), days: [200, 360],
  },
  {
    key: 'venice-glut', title: 'Venice is dumping pepper', region: 'europe',
    text: 'The Venetians have had a good year out of Alexandria and are selling pepper in Antwerp and Lisbon under what it cost them, to break the Portuguese price.',
    ports: ['lisboa', 'porto', 'lagos'], goods: { pimenta: { bid: 0.75 }, gengibre: { bid: 0.8 } }, days: [150, 280],
  },
  {
    key: 'flanders-fleet', title: 'The Flanders fleet is in the Tagus', region: 'europe',
    text: 'Forty sail from Antwerp and Bruges, with cloth, brass and iron. The quays are full and the goods are cheap.',
    ports: ['lisboa', 'porto'], goods: { la: { ask: 0.75 }, linho: { ask: 0.8 }, bacias: { ask: 0.8 }, manilhas: { ask: 0.8 }, ferramenta: { ask: 0.8 }, cobre: { ask: 0.8 } }, days: [60, 120],
  },
  {
    key: 'lisbon-plague', title: 'Plague in Lisbon', region: 'europe',
    text: 'The court has gone to Évora and the merchants with it. Whoever is left in the city is not buying.',
    ports: ['lisboa'], goods: Object.fromEntries(['pimenta', 'canela', 'cravo', 'noz', 'ouro', 'marfim', 'pedras', 'perolas', 'seda', 'acucar', 'malagueta'].map((g) => [g, { bid: 0.72 }])), days: [90, 180],
  },
  {
    key: 'sugar-boom', title: 'Sugar is wanted everywhere', region: 'europe',
    text: 'Antwerp cannot get enough of Madeira sugar this year, and the price on the Tagus has followed it up.',
    ports: ['lisboa', 'porto', 'funchal'], goods: { acucar: { bid: 1.4, ask: 1.15 } }, days: [150, 300],
  },
  {
    key: 'gold-caravans', title: 'The caravans are down from the gold fields', region: 'guinea',
    text: 'The Akan traders have come down from the forest in numbers, with more gold than the coast has seen in years.',
    ports: ['mina', 'axim', 'acara'], goods: { ouro: { ask: 0.72 } }, days: [60, 150],
  },
  {
    key: 'sahel-drought', title: 'Drought in the Sahel', region: 'guinea',
    text: 'The rains failed along the Senegal. Grain is worth more than cloth, and a horse more than both.',
    ports: ['arguim', 'portudal', 'cantor', 'cacheu'], goods: { trigo: { bid: 1.9 }, arroz: { bid: 1.7 }, cavalos: { bid: 1.35 } }, days: [120, 240],
  },
  {
    key: 'castilian-interlopers', title: 'Castilian ships on the Mina coast', region: 'guinea',
    text: 'Three Castilian caravels have been trading along the coast in defiance of the treaty, and they paid in good cloth. Everything is dearer and the brass is worth less.',
    ports: ['mina', 'axim', 'acara', 'serra-leoa'], goods: { ouro: { ask: 1.25 }, manilhas: { bid: 0.75 }, bacias: { bid: 0.8 } }, days: [80, 160], to: 1480 + 30,
  },
  {
    key: 'kongo-famine', title: 'Famine on the Congo', region: 'kongo',
    text: 'Locusts and a dry year. The river towns will give a great deal for grain and salt.',
    ports: ['mpinda', 'luanda', 'benguela'], goods: { trigo: { bid: 2 }, arroz: { bid: 1.8 }, sal: { bid: 1.8 } }, days: [100, 200],
  },
  {
    key: 'sofala-fair', title: 'Gold from Monomotapa', region: 'swahili',
    text: 'A great fair up the Zambezi, and the gold has come down to the coast faster than the Kilwa merchants can buy it.',
    ports: ['sofala', 'quiloa', 'mocambique'], goods: { ouro: { ask: 0.75 }, marfim: { ask: 0.8 } }, days: [80, 160],
  },
  {
    key: 'gujarat-war', title: 'War in Gujarat', region: 'india',
    text: 'The Sultan of Gujarat is at war on his northern border and the looms of Cambay are idle. Cloth is dear all round the Indian Ocean.',
    ports: ['cambaia', 'diu', 'chaul', 'quiloa', 'mombaca', 'melinde', 'malaca'], goods: { calico: { ask: 1.6, bid: 1.4 }, anil: { ask: 1.5 } }, days: [150, 300],
  },
  {
    key: 'deccan-war', title: 'Vijayanagara and Bijapur at war', region: 'india',
    text: 'Both kings are buying horses at any price, and the Ormuz horse ships are being met at sea.',
    ports: ['goa', 'onor', 'cananor', 'calecute', 'chaul'], goods: { cavalos: { bid: 1.6 } }, days: [180, 360],
  },
  {
    key: 'pepper-glut', title: 'A great pepper harvest in Malabar', region: 'india',
    text: 'The best harvest anybody remembers. The warehouses of Calicut and Cochin are overflowing.',
    ports: MALABAR, goods: { pimenta: { ask: 0.7 }, gengibre: { ask: 0.8 } }, days: [100, 200],
  },
  {
    key: 'clove-fleet-late', title: 'The clove junks are late', region: 'east',
    text: 'The ships from the Moluccas have not come to Malacca, and nobody knows why. Cloves, nutmeg and mace are dear from Malacca to Calicut.',
    ports: ['malaca', ...MALABAR], goods: { cravo: { ask: 1.5, bid: 1.3 }, noz: { ask: 1.4, bid: 1.25 }, maca: { ask: 1.4, bid: 1.25 } }, days: [120, 240],
  },
  {
    key: 'ormuz-silver', title: 'Silver is short in the Gulf', region: 'arabia',
    text: 'The Persian mints are buying every mark of silver that comes into Ormuz.',
    ports: ['ormuz', 'mascate', 'cambaia', 'calecute'], goods: { prata: { bid: 1.35 } }, days: [120, 240],
  },
  {
    key: 'ivory-demand', title: 'Ivory is wanted in Cambay', region: 'india',
    text: 'The ivory carvers of Gujarat and the bangle-makers of the Deccan have run short.',
    ports: ['cambaia', 'diu', 'lisboa'], goods: { marfim: { bid: 1.4 } }, days: [120, 240],
  },
];

const SHOCK_BY_KEY = new Map(SHOCKS.map((s) => [s.key, s]));
export function shockDef(key: string): ShockDef { return SHOCK_BY_KEY.get(key)!; }

// ---------------------------------------------------------------------------
// Fairs and seasons: when a market is at its best, every year

export interface Fair {
  key: string;
  name: string;
  ports: string[];
  /** Months, 1-12. */
  months: number[];
  goods: Record<string, { ask?: number; bid?: number; quality?: number }>;
  text: string;
}

export const FAIRS: Fair[] = [
  { key: 'malabar-pepper', name: 'The pepper harvest', ports: MALABAR, months: [12, 1, 2],
    goods: { pimenta: { ask: 0.8, quality: 0.15 }, gengibre: { ask: 0.85, quality: 0.1 } },
    text: 'Pepper is picked from December, and new pepper is cheap and good.' },
  { key: 'moluccas', name: 'The clove ships from the Moluccas', ports: ['malaca'], months: [1, 2, 3],
    goods: { cravo: { ask: 0.8, quality: 0.1 }, noz: { ask: 0.8, quality: 0.1 }, maca: { ask: 0.8 } },
    text: 'The junks from the spice islands come in on the north-east monsoon.' },
  { key: 'ormuz-horses', name: 'The horse market at Ormuz', ports: ['ormuz', 'mascate'], months: [3, 4, 5],
    goods: { cavalos: { ask: 0.8, quality: 0.15 } },
    text: 'Arabian and Persian horses are brought down to the Gulf in spring.' },
  { key: 'deccan-horses', name: 'Horse buying in the Deccan', ports: ['goa', 'onor', 'chaul', 'cananor'], months: [10, 11, 12],
    goods: { cavalos: { bid: 1.25 } },
    text: 'The kings buy their cavalry for the campaigning season when the rains end.' },
  { key: 'mina-gold', name: 'The gold season at Mina', ports: ['mina', 'axim', 'acara'], months: [12, 1, 2, 3],
    goods: { ouro: { ask: 0.85, quality: 0.1 } },
    text: 'In the dry months the traders come down from the forest with gold dust.' },
  { key: 'sofala-gold', name: 'The Sofala gold fair', ports: ['sofala', 'quiloa'], months: [9, 10, 11],
    goods: { ouro: { ask: 0.85 }, marfim: { ask: 0.85 } },
    text: 'Gold and ivory come down from the interior before the rains.' },
  { key: 'madeira-sugar', name: 'The sugar harvest on Madeira', ports: ['funchal'], months: [6, 7, 8],
    goods: { acucar: { ask: 0.8, quality: 0.1 } },
    text: 'New sugar from the mills, cheap until the Flemish buyers arrive.' },
  { key: 'cambay-cloth', name: 'Cloth after the rains at Cambay', ports: ['cambaia', 'diu'], months: [10, 11, 12],
    goods: { calico: { ask: 0.85, quality: 0.1 }, anil: { ask: 0.85 } },
    text: 'The looms work through the monsoon and the bales come to the quay when it ends.' },
  { key: 'lisbon-spices', name: 'The Casa sells the spices', ports: ['lisboa'], months: [9, 10, 11],
    goods: Object.fromEntries(SPICES.map((s) => [s, { bid: 1.1 }])),
    text: 'The Flemish and German buyers come to Lisbon in the autumn and pay well for spice.' },
];

export function fairsAt(portId: string, month: number): Fair[] {
  return FAIRS.filter((f) => f.ports.includes(portId) && f.months.includes(month));
}

// ---------------------------------------------------------------------------
// What a market takes in payment

export interface Payment {
  /** Coin buys this much less than its face: 1 where coin is money, more where it is a curiosity. */
  coin: number;
  /** Goods taken in barter at a premium over what they would fetch for coin. */
  takes: Record<string, number>;
  line: string;
}

const GUINEA_TAKES = { manilhas: 1.4, bacias: 1.35, panos: 1.3, la: 1.25, linho: 1.25, sal: 1.25, cavalos: 1.4 };
const INDIA_TAKES = { ouro: 1.2, prata: 1.3, cobre: 1.3, coral: 1.3, cavalos: 1.2 };

export const PAYMENT: Record<string, Payment> = {
  portuguese: { coin: 1, takes: {}, line: 'Coin, like anywhere in Christendom.' },
  castilian: { coin: 1, takes: {}, line: 'Coin, and they are not particular whose.' },
  moor: { coin: 1.05, takes: { la: 1.2, linho: 1.2, trigo: 1.2, ouro: 1.1 }, line: 'Coin or cloth. Wheat in a lean year.' },
  guanche: { coin: 1.6, takes: { ferramenta: 1.5, contas: 1.3 }, line: 'Iron. Coin is a stranger here.' },
  wolof: { coin: 1.35, takes: { ...GUINEA_TAKES, cavalos: 1.55 }, line: 'Horses above all, and cloth. Coin is taken at a discount.' },
  mandinka: { coin: 1.3, takes: { ...GUINEA_TAKES, cavalos: 1.5 }, line: 'Horses, cloth and salt. Coin at a discount.' },
  temne: { coin: 1.5, takes: GUINEA_TAKES, line: 'Brass and cloth. Coin buys little.' },
  akan: { coin: 1.35, takes: { ...GUINEA_TAKES, manilhas: 1.45, bacias: 1.4 }, line: 'Brass bracelets and basins, then cloth. Coin at a discount.' },
  edo: { coin: 1.45, takes: { manilhas: 1.45, coral: 1.45, panos: 1.25, bacias: 1.3 }, line: 'Brass bracelets and red coral, which the Oba wears.' },
  kongo: { coin: 1.6, takes: { panos: 1.3, la: 1.3, linho: 1.3, contas: 1.3, espelhos: 1.3, ferramenta: 1.25 }, line: 'Cloth and beads. The money here is shells from Luanda.' },
  ndongo: { coin: 1.6, takes: { panos: 1.3, la: 1.3, contas: 1.3, ferramenta: 1.3, sal: 1.3 }, line: 'Cloth, iron and salt. Coin is no use.' },
  khoikhoi: { coin: 2.6, takes: { ferramenta: 1.6, contas: 1.4, bacias: 1.4, manilhas: 1.4 }, line: 'Iron and brass. Coin means nothing here.' },
  tupi: { coin: 2.6, takes: { ferramenta: 1.7, contas: 1.5, espelhos: 1.5 }, line: 'Axes, knives and mirrors. There is no money.' },
  swahili: { coin: 1.1, takes: { calico: 1.35, contas: 1.3, panos: 1.2, cobre: 1.2 }, line: 'Cambay cloth and beads, the currency of the whole coast.' },
  arab: { coin: 1, takes: { prata: 1.2, ouro: 1.1, cobre: 1.2, coral: 1.2, calico: 1.15 }, line: 'Coin, silver, coral.' },
  gujarati: { coin: 1, takes: { prata: 1.25, cobre: 1.25, ouro: 1.15, cavalos: 1.2 }, line: 'Coin, and silver and copper better than coin.' },
  malabar: { coin: 1.1, takes: INDIA_TAKES, line: 'Gold, silver, copper and coral. Nothing Portugal makes is wanted.' },
  sinhalese: { coin: 1.15, takes: { calico: 1.3, prata: 1.2, cobre: 1.2, coral: 1.2 }, line: 'Cloth, silver and coral.' },
  tamil: { coin: 1.1, takes: { calico: 1.2, prata: 1.2, cobre: 1.2, coral: 1.25, cavalos: 1.25 }, line: 'Silver, coral and horses.' },
  malay: { coin: 1.05, takes: { calico: 1.35, prata: 1.25, cobre: 1.2 }, line: 'Indian cloth before anything, and silver.' },
};

/**
 * The table above is written as a merchant would say it; the game takes a
 * little over half of each premium and discount. At full strength a hold of
 * brass bracelets carried to Mina and bartered for gold returned thirty-four
 * times its cost, against twenty-one when the same bracelets were sold for
 * coin and the coin spent: true to the period, and the end of every other
 * decision in the game. Scaled, the right cargo beats coin by about a quarter.
 */
const COIN_WEIGHT = 0.7;
const TAKES_WEIGHT = 0.6;
const PAYMENT_CACHE = new Map<string, Payment>();
export function paymentAt(portId: string): Payment {
  const people = portDef(portId).people;
  let p = PAYMENT_CACHE.get(people);
  if (!p) {
    const raw = PAYMENT[people] ?? PAYMENT.portuguese;
    p = {
      coin: 1 + (raw.coin - 1) * COIN_WEIGHT,
      takes: Object.fromEntries(Object.entries(raw.takes).map(([k, v]) => [k, 1 + (v - 1) * TAKES_WEIGHT])),
      line: raw.line,
    };
    PAYMENT_CACHE.set(people, p);
  }
  return p;
}

// ---------------------------------------------------------------------------
// Other buyers

export interface Competition { who: string; level: number }

export const COMPETITION: Record<string, Competition> = {
  lisboa: { who: 'Florentine and German buyers', level: 0.25 },
  calecute: { who: 'Cairo and Gujarati merchants', level: 0.65 },
  cochim: { who: 'Gujarati merchants', level: 0.3 },
  cananor: { who: 'Mappila merchants', level: 0.3 },
  coulao: { who: 'Tamil merchants', level: 0.25 },
  malaca: { who: 'Gujarati, Chinese and Javanese merchants', level: 0.55 },
  ormuz: { who: 'Persian and Arab merchants', level: 0.5 },
  adem: { who: 'the Karimi merchants of Cairo', level: 0.6 },
  cambaia: { who: 'every merchant in the Indian Ocean', level: 0.45 },
  diu: { who: 'Gujarati merchants', level: 0.4 },
  quiloa: { who: 'Arab gold buyers', level: 0.4 },
  sofala: { who: 'Kilwa merchants', level: 0.35 },
  melinde: { who: 'Gujarati ships', level: 0.25 },
  mombaca: { who: 'Arab merchants', level: 0.35 },
  mina: { who: 'Castilian interlopers', level: 0.15 },
  axim: { who: 'Castilian interlopers', level: 0.2 },
  portudal: { who: 'Castilian caravels', level: 0.2 },
  cantor: { who: 'Mandinka traders from upriver', level: 0.2 },
};

// ---------------------------------------------------------------------------
// The Crown's share

/** Goods the King keeps for himself: sold in Lisbon to the Casa, or under licence. */
export const MONOPOLY = ['pimenta', 'ouro', 'malagueta', 'marfim'];
/** What the Casa pays for a monopoly good, as a share of the market price. */
export const CASA_SHARE = 0.72;
export const LICENCE_YEARS = 3;
/** Tons of hold each officer's chest takes. */
export const CHEST_TONS = 0.35;
export function licenceCost(goodId: string): number {
  return Math.round(good(goodId).lisbon * 14);
}

// ---------------------------------------------------------------------------
// Quality

/** Where a thing is at its best, above the ordinary run of it. */
const SOURCE_QUALITY: Record<string, Record<string, number>> = {
  calecute: { pimenta: 0.2, gengibre: 0.15 },
  cochim: { pimenta: 0.15 },
  cananor: { gengibre: 0.2 },
  columbo: { canela: 0.3, perolas: 0.15 },
  malaca: { cravo: 0.15, noz: 0.15, maca: 0.15, canfora: 0.2 },
  ormuz: { cavalos: 0.2, perolas: 0.2 },
  mina: { ouro: 0.1 },
  sofala: { ouro: 0.15, marfim: 0.15 },
  cambaia: { calico: 0.15, anil: 0.2 },
  funchal: { acucar: 0.2 },
  ugoton: { panos: 0.15 },
};

export function qualityAtSource(portId: string, goodId: string, month: number, noise: number): number {
  let q = 0.5 + (SOURCE_QUALITY[portId]?.[goodId] ?? 0) + noise;
  for (const f of fairsAt(portId, month)) q += f.goods[goodId]?.quality ?? 0;
  return clamp(q, 0.15, 0.95);
}

export function gradeWord(q: number): string {
  if (q >= 0.72) return 'Fine';
  if (q >= 0.55) return 'Good';
  if (q >= 0.38) return 'Common';
  if (q >= 0.22) return 'Poor';
  return 'Spoiled';
}

/** What quality does to the price a buyer will give. */
export function qualityFactor(q: number | undefined): number {
  return 0.8 + 0.4 * (q ?? 0.5);
}

// ---------------------------------------------------------------------------
// Contracts: a price agreed now for goods delivered later

export interface Contract {
  id: number;
  house: string;
  houseName: string;
  goodId: string;
  qty: number;
  /** Per unit, whatever the Tagus is paying on the day. */
  price: number;
  advance: number;
  made: number;
  due: number;
  port: string;
  status: 'offered' | 'open' | 'kept' | 'broken';
}

// ---------------------------------------------------------------------------
// The books of a voyage

export type EntryKind = 'buy' | 'sell' | 'barter' | 'spoiled' | 'shares' | 'casa' | 'fine' | 'contract' | 'antwerp' | 'licence' | 'report';

export interface Entry { t: number; kind: EntryKind; text: string; amount: number }

export interface VoyageBook {
  n: number;
  start: number;
  end?: number;
  entries: Entry[];
}

export function bookTotals(b: VoyageBook): { spent: number; taken: number; lost: number; net: number } {
  let spent = 0, taken = 0, lost = 0;
  for (const e of b.entries) {
    if (e.kind === 'spoiled') lost += -e.amount;
    else if (e.amount < 0) spent += -e.amount;
    else taken += e.amount;
  }
  return { spent, taken, lost, net: taken - spent };
}

// ---------------------------------------------------------------------------

export interface TradeState {
  sheets: Record<string, PriceSheet>;
  shocks: Shock[];
  /** Ids of shocks you have heard of, and when. */
  heard: Record<number, number>;
  lastShockT: number;
  nextId: number;
  contracts: Contract[];
  books: VoyageBook[];
  licences: Record<string, number>;
  quintaladas: boolean;
  /** Sales made through the Casa's factor at Antwerp, and when the money comes. */
  antwerp: { goodId: string; qty: number; amount: number; due: number }[];
  antwerpGlut: Record<string, number>;
  antwerpT: number;
  /** When you last walked away from a bargain here, and whether it worked. */
  walked: Record<string, number>;
  /** Contract offers last refreshed. */
  offersT: number;
}

export function newTrade(t: number): TradeState {
  return {
    sheets: {}, shocks: [], heard: {}, lastShockT: t, nextId: 1, contracts: [],
    books: [{ n: 1, start: t, entries: [] }], licences: {}, quintaladas: true,
    antwerp: [], antwerpGlut: {}, antwerpT: t, walked: {}, offersT: -1e12,
  };
}

export function currentBook(s: TradeState): VoyageBook {
  return s.books[s.books.length - 1];
}

/** Roll the world's markets forward to now: new shocks, backdated to when they happened. */
export function rollShocks(s: TradeState, now: number, year: number, rng: Rng): Shock[] {
  const made: Shock[] = [];
  let guard = 0;
  while (now - s.lastShockT > 0 && guard++ < 30) {
    const gap = rng.range(55, 110) * 86400;
    if (s.lastShockT + gap > now) break;
    s.lastShockT += gap;
    const live = new Set(s.shocks.filter((x) => x.end > s.lastShockT).map((x) => x.key));
    const pool = SHOCKS.filter((d) => !live.has(d.key) && (d.from ?? 0) <= year && (d.to ?? 9999) >= year);
    if (pool.length === 0) continue;
    const def = pool[Math.floor(rng.next() * pool.length)];
    const start = s.lastShockT;
    const arrive: Partial<Record<Region, number>> = {};
    for (const r of REGION_ORDER) arrive[r] = start + newsDelayDays(def.region, r) * 86400 * rng.range(0.8, 1.25);
    const shock: Shock = { id: s.nextId++, key: def.key, start, end: start + rng.range(def.days[0], def.days[1]) * 86400, arrive };
    s.shocks.push(shock);
    made.push(shock);
  }
  // Forget what ended long ago.
  s.shocks = s.shocks.filter((x) => now - x.end < 400 * 86400);
  return made;
}

/** Price multipliers at a port from everything happening in the world, and the season. */
export function worldMod(s: TradeState, portId: string, goodId: string, t: number, month: number): { ask: number; bid: number } {
  let ask = 1, bid = 1;
  for (const x of s.shocks) {
    if (t < x.start || t > x.end) continue;
    const d = shockDef(x.key);
    if (!d.ports.includes(portId)) continue;
    const m = d.goods[goodId];
    if (!m) continue;
    ask *= m.ask ?? 1;
    bid *= m.bid ?? 1;
  }
  for (const f of fairsAt(portId, month)) {
    const m = f.goods[goodId];
    if (!m) continue;
    ask *= m.ask ?? 1;
    bid *= m.bid ?? 1;
  }
  return { ask, bid };
}

export function portsInRegion(r: Region): string[] {
  return PORTS.filter((p) => regionOf(p.id) === r).map((p) => p.id);
}

// ---------------------------------------------------------------------------
// Antwerp

/** Goods the Casa's factor in Antwerp will sell for you, and what he gets for them there. */
export const ANTWERP: Record<string, number> = {
  pimenta: 1.95, canela: 1.9, cravo: 1.9, noz: 1.9, maca: 1.9, gengibre: 1.8, cardamomo: 1.8,
  malagueta: 1.5, marfim: 1.6, acucar: 1.7, seda: 1.5, porcelana: 1.4, pedras: 1.3, perolas: 1.4, ambar: 1.4,
};
export const ANTWERP_DAYS = 100;
export const ANTWERP_FREIGHT = 0.1;

export function antwerpBid(s: TradeState, goodId: string): number {
  const f = ANTWERP[goodId];
  if (!f) return 0;
  const glut = s.antwerpGlut[goodId] ?? 0;
  return good(goodId).lisbon * f * (1 - ANTWERP_FREIGHT) / (1 + glut * 1.2);
}

export function decayAntwerp(s: TradeState, now: number): void {
  const days = Math.max(0, (now - s.antwerpT) / 86400);
  s.antwerpT = now;
  for (const k of Object.keys(s.antwerpGlut)) s.antwerpGlut[k] = Math.max(0, s.antwerpGlut[k] - days / 240);
}

/** How much of Antwerp's appetite one unit takes up. */
export function antwerpWeight(goodId: string): number {
  return good(goodId).lisbon / 18000;
}
