import { clamp, haversine, NM, type LatLon } from '../core/math';
import { Rng } from '../core/rng';
import { PORTS, anchorageOf, portDef } from '../world/ports';
import { HULL_CLASSES } from '../ship/hull';

export interface Title {
  id: string;
  name: string;
  english: string;
  standing: number;
  /** Annual stipend in cruzados. */
  stipend: number;
  /** Share of a voyage's cargo the captain keeps rather than the Crown. */
  share: number;
  blurb: string;
}

export const TITLES: Title[] = [
  {
    id: 'escudeiro', name: 'Escudeiro', english: 'Squire', standing: 0, stipend: 0, share: 0.12,
    blurb: 'A man of the household with a horse and no land. You have been given a ship because better-connected men would not take her.',
  },
  {
    id: 'cavaleiro', name: 'Cavaleiro', english: 'Knight', standing: 60, stipend: 25, share: 0.16,
    blurb: 'Knighted for service at sea. The rank is real and the pay is not.',
  },
  {
    id: 'cavaleiro-fidalgo', name: 'Cavaleiro-Fidalgo', english: 'Knight-Nobleman', standing: 160, stipend: 70, share: 0.2,
    blurb: 'Your name is now spoken at court by people who have not met you.',
  },
  {
    id: 'fidalgo', name: 'Fidalgo da Casa Real', english: 'Nobleman of the Royal House', standing: 340, stipend: 160, share: 0.25,
    blurb: 'Of the King\'s household. You may address him directly, and he will occasionally listen.',
  },
  {
    id: 'capitao', name: 'Capitão', english: 'Captain', standing: 600, stipend: 300, share: 0.3,
    blurb: 'Given command of ships other than your own, and expected to bring them all home.',
  },
  {
    id: 'capitao-mor', name: 'Capitão-mor', english: 'Captain-Major', standing: 1000, stipend: 550, share: 0.34,
    blurb: 'Commander of a fleet, with authority over every Portuguese ship in the waters you sail.',
  },
  {
    id: 'almirante', name: 'Almirante do Mar da Índia', english: 'Admiral of the Sea of India', standing: 1800, stipend: 1200, share: 0.4,
    blurb: 'A title invented for the man who found the road. It carries a tenth of everything that comes home on it, in perpetuity, to your heirs.',
  },
];

export function titleFor(standing: number): Title {
  let t = TITLES[0];
  for (const c of TITLES) if (standing >= c.standing) t = c;
  return t;
}

export function nextTitle(standing: number): Title | null {
  for (const c of TITLES) if (standing < c.standing) return c;
  return null;
}

export interface Monarch {
  name: string;
  from: number;
  to: number;
  /** How much the Crown will risk on speculative voyages, 0-1. */
  ambition: number;
  blurb: string;
}

export const MONARCHS: Monarch[] = [
  {
    name: 'Dom Afonso V', from: 1438, to: 1481, ambition: 0.35,
    blurb: 'The Africano. His attention is on Morocco and on a claim to Castile, and the Guinea trade is farmed out to a merchant in Lisbon for an annual rent.',
  },
  {
    name: 'Dom João II', from: 1481, to: 1495, ambition: 0.9,
    blurb: 'The Perfect Prince. He took the Guinea trade back into royal hands within a year, built the fortress at Mina, sent men overland to find Prester John, and turned down Columbus because his own cosmographers correctly calculated that the Genoese had the size of the world badly wrong.',
  },
  {
    name: 'Dom Manuel I', from: 1495, to: 1521, ambition: 0.85,
    blurb: 'The Fortunate, and he did not have to do very much to earn it. The road to India was found in his second year, and the pepper of the whole East began arriving on the Tagus in his fourth.',
  },
];

export function monarchAt(year: number): Monarch {
  let m = MONARCHS[0];
  for (const c of MONARCHS) if (year >= c.from) m = c;
  return m;
}

// ---------------------------------------------------------------------------
// Discoveries
// ---------------------------------------------------------------------------

export type DiscoveryKind = 'coast' | 'port' | 'people' | 'passage' | 'island' | 'padrao';

export interface Discovery {
  id: string;
  kind: DiscoveryKind;
  name: string;
  /** Where the player reckoned he was, since that is what he reports. */
  lat: number;
  lon: number;
  t: number;
  value: number;
  /** Already presented at court and paid for. */
  reported: boolean;
}

/** Great landmarks of the route, each worth a great deal on its own. */
export interface Landmark {
  id: string;
  name: string;
  lat: number;
  lon: number;
  radiusNm: number;
  value: number;
  announce: string;
}

export const LANDMARKS: Landmark[] = [
  {
    id: 'bojador', name: 'Cabo Bojador', lat: 26.13, lon: -14.5, radiusNm: 45, value: 45,
    announce: 'Cape Bojador is astern. For a generation this headland was the end of the world: fifteen expeditions turned back from it, and the men aboard them were not cowards. The water shoals for miles offshore and the current runs south hard enough that everyone knew a ship could go past and never come back. Gil Eanes went past in 1434 and came back, and after that it was simply a cape.',
  },
  {
    id: 'verde', name: 'Cabo Verde', lat: 14.75, lon: -17.53, radiusNm: 40, value: 35,
    announce: 'The westernmost point of Africa, and the desert ends here. After a thousand miles of sand the coast turns green in the space of an afternoon.',
  },
  {
    id: 'equator', name: 'A Linha', lat: 0, lon: 0, radiusNm: 99999, value: 70,
    announce: 'You have crossed the line. The pole star is gone from the sky astern of you, and with it the only method of finding latitude that most pilots have ever used. From here south, everything depends on the sun and on tables that half the pilots in Lisbon still do not have.',
  },
  {
    id: 'congo', name: 'Rio do Padrão', lat: -6.05, lon: 12.4, radiusNm: 60, value: 55,
    announce: 'The sea here is brown and tastes fresh over the side, twenty leagues out from any land. Whatever river does this is not like any river in Europe.',
  },
  {
    id: 'boa-esperanca', name: 'Cabo da Boa Esperança', lat: -34.36, lon: 18.47, radiusNm: 70, value: 150,
    announce: 'The land falls away to the eastward. Bartolomeu Dias was blown past this cape in a gale without ever seeing it and only understood what he had done when he turned north and found the coast on his left hand. He called it the Cape of Storms. The King renamed it the Cape of Good Hope, because of what lay beyond it.',
  },
  {
    id: 'agulhas', name: 'Cabo das Agulhas', lat: -34.83, lon: 20.0, radiusNm: 45, value: 60,
    announce: 'The true southern tip, and the compass needle here points to true north with no variation at all, which is why it has the name it has. Two oceans meet over the bank ahead and the sea shows it.',
  },
  {
    id: 'indico', name: 'O Mar da Índia', lat: -26, lon: 34, radiusNm: 260, value: 120,
    announce: 'You are in the Indian Ocean. No Portuguese ship has been in this water. Everything from here is a coast that exists in Arab rutters and Venetian rumour and on no chart in Lisbon.',
  },
  {
    id: 'india', name: 'A Índia', lat: 11.25, lon: 75.77, radiusNm: 130, value: 400,
    announce: 'India. Eighty years of caravels working a mile at a time down the side of Africa, and it ends on this beach, in front of a city where nobody is particularly surprised to see a ship.',
  },
];

// ---------------------------------------------------------------------------
// Patents
// ---------------------------------------------------------------------------

export type ObjectiveKind =
  | 'reach' | 'chart' | 'contact' | 'cargo' | 'padrao' | 'name' | 'return';

export interface Objective {
  kind: ObjectiveKind;
  description: string;
  /** Target port, landmark, people, or good. */
  target?: string;
  /** Quantity for cargo objectives, or count for padrões. */
  amount?: number;
  progress: number;
  complete: boolean;
}

export interface Patent {
  id: string;
  title: string;
  issued: number;
  monarch: string;
  /** Advance paid on issue. */
  advance: number;
  /** Paid on completion. */
  reward: number;
  standingReward: number;
  objectives: Objective[];
  /** Voyage must be completed and reported at this port. */
  returnTo: string;
  narrative: string;
  complete: boolean;
  failed: boolean;
  /**
   * True for the commission that opens the route. Discharging it is the end of
   * the game — everything after India is a different story, told by different
   * people, in armed carracks.
   */
  final?: boolean;
}

const PATENT_TEMPLATES: {
  minStanding: number;
  build: (rng: Rng, year: number) => Omit<Patent, 'id' | 'issued' | 'monarch' | 'complete' | 'failed'>;
}[] = [
  // --- The island tier -----------------------------------------------------
  //
  // Where a man learned this trade, and where he had to learn it.
  //
  // Every first commission used to be Guinea: two and a half thousand miles
  // before anything happened, on a coast where the one thing that could not be
  // practised was the thing the whole enterprise turned on. Getting *down* the
  // African coast is a fortnight of fair wind and requires nothing of anybody.
  // Getting back is the problem the Portuguese spent sixty years solving, and
  // the answer — the volta do mar, standing out into the ocean away from where
  // you want to go until the wind comes round behind you — is completely
  // counter-intuitive and cannot be discovered by being told about it.
  //
  // Madeira is five hundred miles off and poses exactly the same problem in
  // miniature: a fair wind out, and a dead muzzler home along a coast where the
  // trades blow onto your shoulder all summer. A man who has made that run
  // twice has the volta in his hands, and the Guinea voyage is then a question
  // of victualling rather than of seamanship. Which is the order in which these
  // things were actually learned.
  {
    minStanding: 0,
    build: () => ({
      title: 'The Madeira sugar',
      advance: 120, reward: 240, standingReward: 22, returnTo: 'lisboa',
      narrative:
        'A short run and an easy one, and the Casa gives it to men it has not made up its mind about. Madeira is five hundred miles south-west and the wind will put you there in a week without your having to think about it. Load sugar and bring it home. The Contador will tell you it is a fortnight’s work. The Contador has never tried to beat back up this coast in July.',
      objectives: [
        { kind: 'reach', description: 'Call at Funchal', target: 'funchal', progress: 0, complete: false },
        { kind: 'cargo', description: 'Bring home 25 caixas of sugar', target: 'acucar', amount: 25, progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
  {
    minStanding: 0,
    build: () => ({
      title: 'The turn of the sea',
      advance: 150, reward: 300, standingReward: 34, returnTo: 'lisboa',
      narrative:
        'You are to go to Madeira and come home by way of Terceira, in the Azores, which is eight hundred miles to the north-west of it and in the wrong direction entirely. There is no cargo in this and no discovery. The pilots of the Casa will tell you that the way home from the south is not south-east but out into the ocean until the wind changes hands, and that a man who has not done it does not believe them. Go and do it. Then you will be trusted with the Guinea run.',
      objectives: [
        { kind: 'reach', description: 'Call at Funchal', target: 'funchal', progress: 0, complete: false },
        { kind: 'reach', description: 'Make Angra, in the Azores', target: 'angra', progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
  {
    minStanding: 0,
    build: () => ({
      title: 'Beyond Cape Não',
      advance: 110, reward: 210, standingReward: 35, returnTo: 'lisboa',
      narrative:
        'Quem passar o Cabo de Não, ou voltará ou não. For a generation this kingdom could not get past a headland eight hundred miles from this quay, and the reason was never that nobody could sail to it. The reason was that nobody could sail back. Take the quadrant and the lead down that coast, put on the chart what is actually there, and give two capes names a pilot can use. It pays badly. It is how a man becomes a pilot rather than a carrier.',
      objectives: [
        { kind: 'chart', description: 'Survey 200 miles of the Barbary coast', amount: 200, progress: 0, complete: false },
        { kind: 'name', description: 'Put two headlands on the chart by name', amount: 2, progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },

  // --- The Guinea tier -----------------------------------------------------
  {
    minStanding: 30,
    build: () => ({
      title: 'The Guinea trade',
      advance: 180, reward: 340, standingReward: 30, returnTo: 'lisboa',
      narrative:
        'The Casa da Mina requires a cargo of gold from the fortress at São Jorge, and the King requires that the coast between Cape Verde and the Mina be sailed and reported on. It is a run that has been made a hundred times. It is also the only run you are going to be trusted with until you have made it.',
      objectives: [
        { kind: 'reach', description: 'Call at São Jorge da Mina', target: 'mina', progress: 0, complete: false },
        { kind: 'cargo', description: 'Bring home 30 marcos of gold', target: 'ouro', amount: 30, progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
  {
    // A survey commission. The whole apparatus of this game — the reckoning, the
    // sights, the running survey — was optional right up until the Cape, because
    // nothing the Crown asked for before then required any of it. This asks for
    // exactly that and nothing else.
    minStanding: 30,
    build: () => ({
      title: 'The King\'s coast',
      advance: 130, reward: 250, standingReward: 55, returnTo: 'lisboa',
      narrative:
        'The Crown has a great many reports of the Guinea coast and no two of them agree about where anything is. Pilots are working from a chart that puts Cape Verde a hundred miles from where it stands. You are not asked to bring back anything. You are asked to sail that coast with the lead going and the quadrant out, set a pillar where the land is worth naming, and come home with the truth about it. It pays badly. It is how a man becomes a pilot rather than a carrier.',
      objectives: [
        { kind: 'chart', description: 'Survey 300 miles of coast', amount: 300, progress: 0, complete: false },
        // Not a padrão. The pillars are cut at Lisbon, cost ninety cruzados and
        // twenty renown to have aboard at all, and may only be set up beyond
        // the charted world — which is two thousand miles further on than this
        // commission sends anybody. Naming what you survey is the thing a
        // surveyor actually does, and the chart table already has the tool.
        { kind: 'name', description: 'Put two headlands on the chart by name', amount: 2, progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
  {
    // A diplomatic commission, which is the third thing the game does and the
    // one the player had no reason to touch on a first voyage.
    minStanding: 45,
    build: () => ({
      title: 'The pepper of Guinea',
      advance: 210, reward: 430, standingReward: 45, returnTo: 'lisboa',
      narrative:
        'Malagueta is not pepper and everyone in Lisbon knows it, but until somebody reaches the Indies it is what the apothecaries have, and the Venetians are charging what they like for the real thing. The grain coast lies below Cape Verde among people we have traded with twice and quarrelled with once. Go and put it on a footing. The cargo matters less than whether they will still be dealing with us in ten years.',
      objectives: [
        { kind: 'reach', description: 'Call at Serra Leoa', target: 'serra-leoa', progress: 0, complete: false },
        { kind: 'contact', description: 'Come to terms with the Temne', target: 'temne', progress: 0, complete: false },
        { kind: 'cargo', description: 'Bring home 40 quintais of malagueta', target: 'malagueta', amount: 40, progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
  {
    minStanding: 80,
    build: () => ({
      title: 'Beyond the Congo',
      advance: 320, reward: 640, standingReward: 70, returnTo: 'lisboa',
      narrative:
        'Diogo Cão has set a padrão at the mouth of a great river below the equator and returned with four hostages and a report that the kingdom behind it is large, orderly and curious about us. You are to go further than he did, set your own pillars, and find where this coast ends.',
      objectives: [
        { kind: 'reach', description: 'Reach the mouth of the Congo', target: 'mpinda', progress: 0, complete: false },
        { kind: 'padrao', description: 'Raise 2 padrões on new headlands', amount: 2, progress: 0, complete: false },
        { kind: 'chart', description: 'Chart 400 miles of unknown coast', amount: 400, progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
  {
    minStanding: 170,
    build: () => ({
      title: 'The end of Africa',
      advance: 620, reward: 1500, standingReward: 190, returnTo: 'lisboa',
      narrative:
        'The King is convinced the continent has a southern end and that the sea beyond it joins the sea of the Indies. Two expeditions have gone overland to find Prester John and one of them has not been heard from. You are to settle the question by sea. Take enough water. There is nothing down there.',
      objectives: [
        { kind: 'reach', description: 'Round the Cape of Good Hope', target: 'boa-esperanca', progress: 0, complete: false },
        { kind: 'chart', description: 'Chart 700 miles of unknown coast', amount: 700, progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
  {
    minStanding: 360,
    build: () => ({
      title: 'The road to the Indies',
      final: true,
      advance: 1400, reward: 4200, standingReward: 520, returnTo: 'lisboa',
      narrative:
        'Everything since 1415 has been preparation for this. You are to pass the Cape, sail up the eastern side of Africa until you find pilots who know the crossing, and go to India. You will carry a letter for any Christian prince you find. You will bring back pepper. The King has been advised that you will probably not return, and has decided that the attempt is worth making regardless.',
      objectives: [
        { kind: 'reach', description: 'Round the Cape of Good Hope', target: 'boa-esperanca', progress: 0, complete: false },
        { kind: 'contact', description: 'Open relations with a people of the eastern coast', target: 'swahili', progress: 0, complete: false },
        { kind: 'reach', description: 'Reach Calicut', target: 'calecute', progress: 0, complete: false },
        { kind: 'cargo', description: 'Bring home 120 quintais of pepper', target: 'pimenta', amount: 120, progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
  {
    minStanding: 820,
    build: () => ({
      title: 'The pepper fleet',
      final: true,
      advance: 3000, reward: 9000, standingReward: 700, returnTo: 'lisboa',
      narrative:
        'The route is known and the Crown now wants volume. Load until she is down to her marks, establish a factory where you can, and understand that the Zamorin\'s Muslim merchants have had several years to think about what your arrival means for them.',
      objectives: [
        { kind: 'cargo', description: 'Bring home 400 quintais of pepper', target: 'pimenta', amount: 400, progress: 0, complete: false },
        { kind: 'cargo', description: 'Bring home 60 quintais of cinnamon', target: 'canela', amount: 60, progress: 0, complete: false },
        { kind: 'contact', description: 'Secure a factory on the Malabar coast', target: 'malabar', progress: 0, complete: false },
        { kind: 'return', description: 'Report at Lisbon', target: 'lisboa', progress: 0, complete: false },
      ],
    }),
  },
];

export class Crown {
  standing = 0;
  /**
   * What the captain has of his own, which is not much.
   *
   * Two hundred and forty plus the Crown's advance bought the entire profitable
   * stock of several goods at once, so the purse never bound and the first
   * voyage had no financial decision in it. It should be tight enough that what
   * to fill her with is a real question.
   */
  gold = 85;
  /** Total renown ever earned, which titles are measured against. */
  lifetimeStanding = 0;
  discoveries: Discovery[] = [];
  landmarksFound = new Set<string>();
  patent: Patent | null = null;
  completedPatents: string[] = [];
  hasKingsLetter = false;
  padroesRaised = 0;
  /** Set the day the India commission is discharged at Lisbon. The end. */
  routeOpened = false;
  /** Pillars still in the hold. Shipped at Lisbon and not replaceable at sea. */
  padraoStock = 0;
  /** Where the pillars stand, which outlives the voyage that set them. */
  padraoSites: { name: string; lat: number; lon: number; t: number }[] = [];
  /** Coastline charted since the current patent was issued, nautical miles. */
  chartedSincePatent = 0;

  private nextId = 1;
  private rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed ^ 0xc0de);
  }

  /** True when one of your own pillars already stands within sight of here. */
  padraoNear(at: LatLon, withinNm = 60): boolean {
    return this.padraoSites.some(
      (p) => haversine(at, { lat: p.lat, lon: p.lon }) / 1852 < withinNm,
    );
  }

  get title(): Title {
    return titleFor(this.lifetimeStanding);
  }

  /** Patents the Crown will consider issuing right now. */
  offers(year: number): Patent[] {
    const monarch = monarchAt(year);
    return PATENT_TEMPLATES
      .filter((t) => this.lifetimeStanding >= t.minStanding)
      .slice(-3)
      .map((t) => {
        const body = t.build(this.rng, year);
        return {
          ...body,
          id: `pat${this.nextId++}`,
          issued: 0,
          monarch: monarch.name,
          complete: false,
          failed: false,
          // A cautious king pays less up front and demands more.
          advance: Math.round(body.advance * (0.6 + monarch.ambition * 0.6)),
        };
      });
  }

  accept(p: Patent, t: number): void {
    this.patent = { ...p, issued: t };
    this.gold += p.advance;
    this.chartedSincePatent = 0;
  }

  /** Register a discovery. Returns true if it was new. */
  record(kind: DiscoveryKind, name: string, at: LatLon, value: number, t: number): Discovery | null {
    const key = `${kind}:${name}`;
    if (this.discoveries.some((d) => `${d.kind}:${d.name}` === key)) return null;
    const d: Discovery = {
      id: `disc${this.nextId++}`,
      kind, name, lat: at.lat, lon: at.lon, t, value, reported: false,
    };
    this.discoveries.push(d);
    return d;
  }

  /** Landmarks passed at this position, first time only. */
  checkLandmarks(pos: LatLon, previousLat: number): Landmark[] {
    const hit: Landmark[] = [];
    for (const l of LANDMARKS) {
      if (this.landmarksFound.has(l.id)) continue;
      if (l.id === 'equator') {
        if (previousLat > 0 && pos.lat <= 0) { this.landmarksFound.add(l.id); hit.push(l); }
        continue;
      }
      const dist = haversine(pos, { lat: l.lat, lon: l.lon }) / NM;
      if (dist <= l.radiusNm) { this.landmarksFound.add(l.id); hit.push(l); }
    }
    return hit;
  }

  /** Advance patent objectives. */
  progressObjective(kind: ObjectiveKind, target: string | undefined, amount = 1): Objective | null {
    if (!this.patent || this.patent.complete) return null;
    for (const o of this.patent.objectives) {
      if (o.complete || o.kind !== kind) continue;
      if (o.target && target && o.target !== target) continue;
      if (o.target && !target) continue;
      o.progress += amount;
      if (!o.amount || o.progress >= o.amount) {
        o.progress = o.amount ?? 1;
        o.complete = true;
      }
      return o;
    }
    return null;
  }

  /** Cargo objectives are checked against the hold rather than accumulated. */
  syncCargoObjectives(quantityOf: (id: string) => number): void {
    if (!this.patent) return;
    for (const o of this.patent.objectives) {
      if (o.kind !== 'cargo' || !o.target || !o.amount) continue;
      o.progress = Math.min(o.amount, quantityOf(o.target));
      o.complete = o.progress >= o.amount;
    }
  }

  get patentReady(): boolean {
    if (!this.patent) return false;
    return this.patent.objectives.every((o) => o.complete || o.kind === 'return');
  }

  /** Settle a completed patent at court. */
  settle(t: number): { gold: number; standing: number; lines: string[] } {
    const lines: string[] = [];
    let gold = 0;
    let standing = 0;

    for (const d of this.discoveries) {
      if (d.reported) continue;
      d.reported = true;
      standing += d.value;
      gold += Math.round(d.value * 1.6);
      lines.push(`${d.name} — entered on the padrão real. ${d.value} renown.`);
    }

    if (this.patent && this.patentReady) {
      const ret = this.patent.objectives.find((o) => o.kind === 'return');
      if (ret) { ret.complete = true; ret.progress = 1; }
      this.patent.complete = true;
      gold += this.patent.reward;
      standing += this.patent.standingReward;
      lines.push(`Commission "${this.patent.title}" discharged. ${this.patent.reward} cruzados, ${this.patent.standingReward} renown.`);
      this.completedPatents.push(this.patent.id);
      if (this.patent.final) this.routeOpened = true;
      this.patent = null;
    }

    this.gold += gold;
    this.standing += standing;
    this.lifetimeStanding += standing;
    void t;
    return { gold, standing, lines };
  }

  /** Hull classes the Crown will grant or sell at your present standing. */
  availableHulls() {
    return HULL_CLASSES.filter((h) => h.standing <= this.lifetimeStanding);
  }

  /** Sum of everything the Crown could still pay you for. */
  unreportedValue(): number {
    return this.discoveries.filter((d) => !d.reported).reduce((s, d) => s + d.value, 0);
  }
}

/** Ports the player has not yet reached, for objective descriptions. */
export function portName(id: string): string {
  const p = PORTS.find((x) => x.id === id);
  return p ? p.name : id;
}

export function portPosition(id: string): LatLon {
  return anchorageOf(portDef(id));
}

export { clamp };
