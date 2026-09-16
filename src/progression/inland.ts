import { NM, clamp, haversine } from '../core/math';
import { PORTS, portDef, type PortDef } from '../world/ports';
import { people } from '../world/peoples';
import type { Officer } from '../crew/crew';
import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';

/**
 * Sending a man away from the sea.
 *
 * Everything else in this game happens within sight of salt water. The ship is
 * the world; the coast is the edge of it; a landing party walks four miles up a
 * beach and comes back the same afternoon. And the single most consequential
 * thing the Portuguese Crown actually did in these years happened five hundred
 * miles inland and was done on foot by two men with no ship at all: in 1487
 * João II sent Pêro da Covilhã and Afonso de Paiva overland to find the spice
 * route and the Christian king. Paiva died. Covilhã reached Calicut, saw the
 * Indian Ocean trade with his own eyes, sent a report back through Cairo that
 * told Lisbon the ocean was open — and was then kept in Ethiopia for thirty
 * years and never came home.
 *
 * That is the shape of this system, and it is a shape no other part of the game
 * has: a decision taken in year two that pays, or does not, in year five, and
 * whose price is a man you know by name. You cannot sail to the answer. You can
 * only give somebody a bag of trade goods and a language he half speaks, watch
 * him walk up a river, and go on with your voyage.
 *
 * The rule the errands are written to: what comes back is knowledge, never
 * cargo. The interior of Africa is not a market in this game and will not be
 * made into one. What a returning man is worth is that he has *seen* something,
 * and what you do with what he saw is sail there.
 */

export type ErrandId = 'gold' | 'prester' | 'passage' | 'road';

export interface Errand {
  id: ErrandId;
  name: string;
  /** The order as it would be given, which is also how the choice reads. */
  brief: string;
  /** What you are hoping for, said honestly, including that it may be nothing. */
  hope: string;
  /** Peoples from whose country this errand can be begun at all. */
  from: string[];
  /** Years it takes, before anything goes wrong. */
  years: number;
  /** Chance he simply never comes back. */
  peril: number;
}

export const ERRANDS: Errand[] = [
  {
    id: 'gold',
    name: 'The source of the gold',
    brief: 'Go up the river and keep going until you find where the gold is dug, and come back '
      + 'able to say how far it is and whose it is.',
    hope: 'Every ounce that reaches this coast has walked here on somebody’s head from a '
      + 'place no European has seen. The Casa has been buying it for forty years and does not '
      + 'know within eight hundred miles where it comes out of the ground.',
    from: ['wolof', 'mandinka', 'akan', 'edo', 'kongo', 'temne'],
    years: 2.1,
    peril: 0.3,
  },
  {
    id: 'prester',
    name: 'The Christian king',
    brief: 'Find Prester John, if he is there to be found, and put a letter in his hand from the '
      + 'King of Portugal.',
    hope: 'A Christian kingdom behind the Moors has been an article of faith in Europe for three '
      + 'hundred years. It is half true, which is the worst possible number, and nobody in '
      + 'Lisbon can tell you which half.',
    from: ['swahili', 'arab', 'mandinka', 'kongo'],
    years: 3.4,
    peril: 0.42,
  },
  {
    id: 'passage',
    name: 'Whether the sea goes round',
    brief: 'Go inland and east until you meet people who have seen the other ocean, and find out '
      + 'from them whether this land ends.',
    hope: 'Ptolemy says Africa joins Asia and the Indian Ocean is a lake. If he is right the '
      + 'whole enterprise is a waste of ships. Somebody four hundred miles up that river knows, '
      + 'and has known all along, and has never been asked.',
    from: ['kongo', 'swahili', 'khoikhoi', 'edo', 'akan', 'ndongo'],
    years: 2.8,
    peril: 0.36,
  },
  {
    id: 'road',
    name: 'A road to the interior',
    brief: 'Go to the king inland, stay with him, and come back with leave for our factor to '
      + 'trade above the falls.',
    hope: 'The coast towns are middlemen and know it. A man who has sat in the inland king’s '
      + 'house for a year is worth more to this factory than a fort.',
    from: ['wolof', 'mandinka', 'akan', 'edo', 'kongo', 'swahili'],
    years: 1.6,
    peril: 0.22,
  },
];

export const ERRAND_BY_ID = new Map(ERRANDS.map((e) => [e.id, e]));

export interface Journey {
  id: string;
  errand: ErrandId;
  /** The officer's id. He is still on the books, and still on the wage bill. */
  officerId: string;
  officerName: string;
  /** Where he walked away from. */
  fromPortId: string;
  peopleId: string;
  sentT: number;
  /** When he could first be back, if he is coming back. */
  dueT: number;
  /** How well it was set up: goods, his languages, your standing with them. */
  backing: number;
  /** Set once it has been resolved, so it is resolved once. */
  done?: boolean;
}

/** Which of your officers could be sent, and which could not. */
export function candidates(g: Game): Officer[] {
  return g.crew.officers.filter((o) => o.alive && !o.ashoreAt
    && !g.journeys.some((j) => !j.done && j.officerId === o.id)
    // The pilot and the master are the ship. Everybody else is a man.
    && o.role !== 'piloto' && o.role !== 'mestre');
}

/** Errands that can be begun from this port. */
export function errandsAt(def: PortDef): Errand[] {
  return ERRANDS.filter((e) => e.from.includes(def.people));
}

/**
 * How well the thing is set up before he walks off.
 *
 * Three things, and they are the three things that actually decided it: whether
 * he can talk to anybody, whether the people he is starting among have any
 * reason to see him safely to the next town, and how much he is carrying to pay
 * his way with. None of them is a die roll — all three are the consequence of
 * how the rest of the career has been played.
 */
export function backingFor(g: Game, def: PortDef, o: Officer): number {
  const pe = people(def.people);
  const tongue = o.languages.includes(pe.language) ? 0.35
    : o.languages.length > 1 ? 0.12 : 0;
  const rel = g.relationsFor(def.id);
  const welcome = clamp(rel.regard, -1, 1) * 0.28 + (rel.factory ? 0.14 : 0);
  return clamp(0.18 + tongue + welcome + o.ability * 0.3, 0.05, 0.95);
}

/** What a party costs to fit out, in cruzados of trade goods. */
export function outfitCost(e: Errand): number {
  return Math.round(120 + e.years * 130);
}

// -----------------------------------------------------------------------------
// What comes back

export interface JourneyResult {
  title: string;
  text: string;
  /** Written into the log and shown as a card. */
  severity: 'note' | 'warning' | 'grave';
}

/** A place his walking makes real, drawn where he says it is rather than where it is. */
function revealInlandKnowledge(g: Game, def: PortDef, errand: ErrandId): string {
  // The coast either side of where he came out, laid down from what he walked.
  const drawn = g.chart.copyFrom({ lat: def.lat, lon: def.lon }, 260, 16, g.clock.t);
  // And somewhere he was told about, which is the part you can sail to.
  const far = PORTS.filter((p) => !g.chart.ports.has(p.id)
    && haversine({ lat: def.lat, lon: def.lon }, { lat: p.lat, lon: p.lon }) / NM
      < (errand === 'passage' ? 3200 : 1400));
  const pick = far.length > 0 ? far[Math.floor(g.rng.next() * far.length)] : null;
  if (pick) {
    g.hearFromInland(pick, def);
    return `${drawn} headlands of this coast entered from what he walked, and a name — `
      + `${pick.name} — that nobody on this beach had ever said out loud.`;
  }
  return `${drawn} headlands of this coast entered from what he walked.`;
}

function outcomes(g: Game, j: Journey, def: PortDef, o: Officer | null): JourneyResult {
  const e = ERRAND_BY_ID.get(j.errand)!;
  const pe = people(def.people);
  const name = j.officerName;
  const luck = g.rng.next();
  const well = luck < j.backing;

  // He is dead, or he is not coming, which from the beach is the same thing.
  if (!well && g.rng.next() < e.peril) {
    if (o) { o.alive = false; o.ashoreAt = undefined; }
    g.journeyRecord.lost++;
    return {
      title: `${name} did not come back`,
      severity: 'grave',
      text: `Nobody at ${def.name} will say what happened and it is not clear that anybody knows. `
        + `A man came down eleven months ago with ${name}’s astrolabe and sold it in the `
        + `market, and was gone before the factor heard of it.\n\n`
        + `He was carrying the King’s letter and four hundred cruzados of somebody else’s `
        + `goods, and what he was carrying that mattered was in his head, and it is not anywhere `
        + `now. This is the ordinary result. It was the ordinary result when the Infante was `
        + `doing it and it will be the ordinary result for another two hundred years.`,
    };
  }

  // He is alive and did not get there.
  if (!well) {
    if (o) {
      o.ashoreAt = undefined;
      o.loyalty = clamp(o.loyalty - 0.1, 0, 1);
      if (!o.languages.includes(pe.language)) o.languages.push(pe.language);
    }
    g.journeyRecord.returned++;
    return {
      title: `${name} is back`,
      severity: 'warning',
      text: `He is on the beach with three of the nine he went with and he has been back on this `
        + `coast for two months waiting for a sail.\n\nHe got perhaps a third of the way. `
        + `${e.id === 'prester' ? 'There is a Christian king, everybody says so, and everybody points a different way.'
          : e.id === 'gold' ? 'The gold changes hands four times before it reaches the sea and every man in the chain lies about where he got it, which is how he stays alive.'
            : e.id === 'passage' ? 'Nobody he reached had seen another sea. That is not the same as there not being one, and he is careful to say so.'
              : 'The inland king would not see him, and the coast king made sure of it, which tells you what the coast king is protecting.'} `
        + `He has the language now, which he did not have, and which is worth more than the '
        + 'errand was.`,
    };
  }

  // He got there.
  g.journeyRecord.returned++;
  g.journeyRecord.succeeded++;
  if (o) {
    o.ashoreAt = undefined;
    o.ability = clamp(o.ability + 0.18, 0, 0.97);
    o.loyalty = clamp(o.loyalty + 0.15, 0, 1);
    if (!o.languages.includes(pe.language)) o.languages.push(pe.language);
  }
  const drawn = revealInlandKnowledge(g, def, j.errand);

  switch (j.errand) {
    case 'gold': {
      g.crown.standing += 40;
      g.crown.lifetimeStanding += 40;
      g.crown.record('people', 'The country the gold comes out of',
        { lat: def.lat, lon: def.lon }, 40, g.clock.t);
      g.shiftPeopleRegard(def.people, 0.1);
      return {
        title: 'He has seen it dug',
        severity: 'note',
        text: `${name} came down the river in a canoe with six men of the interior who would not `
          + `come aboard and would not leave the beach until he had.\n\nHe has been to the `
          + `workings. He describes a country of red earth eight hundred miles up, pits sunk by `
          + `hand in the dry season and abandoned in the wet, and a king who takes a share of `
          + `everything and has been taking it since before Portugal existed. He has the `
          + `distances in days, the rivers in order, and the names of the four men through whose `
          + `hands every ounce on this coast has passed.\n\n${drawn}\n\nThe Casa has been buying `
          + `this gold for forty years without knowing any of it.`,
      };
    }
    case 'prester': {
      g.crown.standing += 55;
      g.crown.lifetimeStanding += 55;
      g.crown.record('people', 'The Christian kingdom in the interior',
        { lat: def.lat, lon: def.lon }, 55, g.clock.t);
      return {
        title: 'The letter was delivered',
        severity: 'note',
        text: `He is thin, he is forty in a way he was not when he left, and he is wearing `
          + `something that is not Portuguese.\n\n"There is a king. He is a Christian, of a kind `
          + `nobody at home is going to recognise as one, and he has been a Christian since `
          + `before we were. He is not behind the Moors, he is among them, and he is not going to `
          + `come and take Jerusalem with us because he has a war of his own that has been going `
          + `on for a hundred years." The letter was received. There is an answer, and it is `
          + `courteous, and it asks for craftsmen and gunners rather than offering `
          + `armies.\n\n${drawn}\n\nThree hundred years of the thing being an article of faith, `
          + `and it turns out to be a real place with a real king who has real problems. Half of `
          + `Lisbon will refuse to believe it on exactly that ground.`,
      };
    }
    case 'passage': {
      g.crown.standing += 45;
      g.crown.lifetimeStanding += 45;
      g.crown.record('passage', 'Word of the other ocean',
        { lat: def.lat, lon: def.lon }, 45, g.clock.t);
      return {
        title: 'The land ends',
        severity: 'note',
        text: `${name} has been inland for the better part of three years and has come out at a `
          + `town four hundred miles from where he went in.\n\nHe found men who trade east, and `
          + `east of them men who trade to the sea, and at the end of it a man in a mud-brick `
          + `house who had been to the other coast twice and described the ships there: sewn `
          + `hulls, no nails in them, lateen sails, and they come down with one wind and go back `
          + `with the other twice a year. They are not our ships and they are not anybody’s `
          + `ships we have ever heard of.\n\n${drawn}\n\nPtolemy is wrong. The ocean is not a `
          + `lake, this land has an end to it, and there is a sea on the other side with a trade `
          + `already running on it that is older than the one we are trying to reach.`,
      };
    }
    default: {
      g.crown.standing += 22;
      g.crown.lifetimeStanding += 22;
      const rel = g.relationsFor(def.id);
      rel.regard = clamp(rel.regard + 0.35, -1, 1);
      rel.mayTrade = true;
      g.openTheRoad(def.id);
      return {
        title: 'The road is open',
        severity: 'note',
        text: `He spent fourteen months in the inland king’s house doing very little except `
          + `be there, which he says was the work.\n\nThere is leave for our factor to go above `
          + `the falls, there is a named man on the other end who is answerable for it, and there `
          + `is an understanding about what the coast town takes that the coast town has not been `
          + `told about yet.\n\n${drawn}\n\nWhat this is worth is not in this year’s books. `
          + `It is that the goods that used to arrive here through four hands now arrive through `
          + `two, and will go on doing so after everybody in this conversation is dead.`,
      };
    }
  }
}

/**
 * Whether anything has come back, at the port the ship is lying in.
 *
 * He comes out at the coast where he went in, or near it, because a man on foot
 * with no money goes back the way he knows. So the errand is collected by
 * returning — which is the point, and is why sending a man inland is a promise
 * to come back for him.
 */
export function collectJourney(g: Game, def: PortDef): JourneyResult | null {
  for (const j of g.journeys) {
    if (j.done) continue;
    if (g.clock.t < j.dueT) continue;
    const from = portDef(j.fromPortId);
    if (haversine({ lat: def.lat, lon: def.lon }, { lat: from.lat, lon: from.lon }) / NM > 220) {
      continue;
    }
    j.done = true;
    const o = g.crew.officers.find((x) => x.id === j.officerId) ?? null;
    return outcomes(g, j, def, o);
  }
  return null;
}

/**
 * The same thing as the card the player actually sees.
 *
 * One course of action rather than none, because a card with no button on it
 * cannot be dismissed — and because what is being asked, after three years, is
 * a real question even when there is only one answer to it.
 */
export function journeyScene(g: Game, def: PortDef): SeaEvent | null {
  const r = collectJourney(g, def);
  if (!r) return null;
  return {
    id: `inland:${g.clock.t.toFixed(0)}`,
    title: r.title,
    severity: r.severity,
    text: r.text,
    choices: [{
      label: r.severity === 'grave' ? 'Enter it in the book' : 'Take him aboard',
      detail: r.severity === 'grave'
        ? 'His wage runs to the day he was last seen, and his mother is told what the Casa tells them.'
        : 'He has been three years away from a deck and will want a week to find his feet.',
      resolve: () => r.text.split('\n\n')[0],
    }],
  };
}

/** Journeys still out, for the orders screen and the crew screen. */
export function outstanding(g: Game): Journey[] {
  return g.journeys.filter((j) => !j.done);
}

/** What the wardroom says about a man who is years overdue. */
export function journeyWord(g: Game, j: Journey): string {
  const years = (g.clock.t - j.sentT) / 86400 / 365.25;
  const due = (j.dueT - j.sentT) / 86400 / 365.25;
  const from = portDef(j.fromPortId);
  if (years < due * 0.5) {
    return `${j.officerName} went up from ${from.name} ${years < 0.2 ? 'this season'
      : `${years.toFixed(1)} years ago`}. Nothing has come down.`;
  }
  if (years < due) {
    return `${j.officerName} has been inland ${years.toFixed(1)} years. A trader at the factory `
      + 'says a Christian was seen a long way up, which is a thing traders say.';
  }
  if (years < due * 1.6) {
    return `${j.officerName} is due. Put into ${from.name} and he may be on the beach.`;
  }
  return `${j.officerName} is ${(years - due).toFixed(1)} years overdue. Nobody aboard says he is `
    + 'dead and nobody aboard believes he is not.';
}

export interface JourneyRecord {
  sent: number;
  returned: number;
  succeeded: number;
  lost: number;
}

export function newJourneyRecord(): JourneyRecord {
  return { sent: 0, returned: 0, succeeded: 0, lost: 0 };
}
