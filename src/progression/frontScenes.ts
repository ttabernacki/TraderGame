import { clamp } from '../core/math';
import type { SeaChoice, SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { PATRONS, choosePatron, favouriteEvents, isFallen, patronBlocked, reignAt } from '../identity/patrons';
import { PATRON_IDS, type PatronId } from '../identity/state';
import { hasActive, shockTime } from '../world/powers/core';
import { machinePhase } from '../world/powers/conflicts';
import { declareReader } from '../world/powers/readers';
import type { PowersState } from '../world/powers/types';
import { portDef } from '../world/ports';
import { canFundLine, openFundedLine } from './network';
import type { TrafficScene } from './trafficScenes';

/**
 * The Fronts where they touch the captain (BUILD_PLAN E3): the Court, the Crescent, the Gold and the Claim, and the two
 * conflicts that have a face on the road (the Kongo succession, the Wolof edge).
 *
 * Twenty short scenes in the same shape as the Traffic's and the courts' (`TrafficScene`: ports, needs, build, after; a
 * `SeaEvent` answered at the quay, its choices writing the Ledger), so the one engine that surfaces those surfaces these
 * (storylets/sources registers them). Nothing here is a thread's step: each is offered by the state of a Front, an Effect in
 * force, a patron's warning or a place the rival reached first, and says so in `needs`.
 *
 * Six at the Court (Lisbon, and Funchal for the Rua Nova's cousin): the old King failing, the new King's Casa, a favourite
 * falling, the Edict coming, the Edict come, and Easter 1506. Four at the Crescent (the Venetian at Lisbon, an Aden pilot
 * at Melinde, a convoy report at Calecute, the league at Cochim). Four at the Gold (all at Mina; Kwesi connects). Four at
 * the Claim (Castile at the Casa, the harbour-master at Las Palmas, a pillar already standing, an interloper on the beach).
 * One each for the Kongo succession (Mpinda) and the Wolof edge (Arguim).
 *
 * ROAD ORDER. The road runs Lisboa, Funchal, Las Palmas, Arguim, Mina, Mpinda, Benguela, Moçambique, Melinde, Calecute,
 * Cochim; each `after` lists only scenes at the same port or earlier along it, and nothing sends the captain back for a clue.
 * `scripts/powers.ts` checks it with `road.ts: along()`. A scene that is offered at Lisbon on a later voyage is the Carreira's
 * own return (the spine reads the Carreira as round trips); no scene's reward lies behind the captain.
 *
 * SOURCES AND WHAT IS INVENTED: docs/SOURCES.md, "The Fronts staged (E3)". The King's last illness and death (October 1495),
 * the accession of Manuel, the Edict (December 1496) and the forced baptisms (1497), the Lisbon massacre (Easter 1506), the
 * Venetian alarm at the Cape route, the Mamluk and Gujarati convoys and league, fever at São Jorge da Mina, the Treaty of
 * Tordesillas and Castile's interest in the Guinea coast are documented in outline. Every NAME below, every sum, and every
 * face at a quay is the game's own. Scenes state no date beyond what the history gives, and none gives a year for the Kongo succession.
 */

declareReader('scenes.fronts');

const DAY = 86400;
const MONTH = 30 * DAY;
const sid = (id: string): string => `front:${id}`;

function scene(id: string, title: string, text: string, choices: SeaChoice[], severity: SeaEvent['severity'] = 'note'): SeaEvent {
  return { id: sid(id), title, text, severity, choices, council: false };
}
function had(g: Game, id: string): void {
  g.powers.seen[id] = g.clock.t;
  delete g.powers.seen[`fired:${id}`];
}
function again(g: Game, id: string, line: string): string {
  delete g.powers.seen[`fired:${id}`];
  g.powers.seen[`later:${id}`] = g.clock.t;
  return line;
}
const casaRegard = (g: Game, d: number): void => { g.casa.regard = clamp(g.casa.regard + d, -1, 1); };
const spend = (g: Game, n: number): boolean => { if (g.crown.gold < n) return false; g.crown.gold -= n; return true; };
const here = (g: Game): string => g.dockedAt ?? '';

/** The first warned, unfallen favourite of the Court Front whose patron the captain sails for, or null. */
function pendingFavourite(g: Game): ReturnType<typeof favouriteEvents>[number] | null {
  return favouriteEvents(g).find((e) => g.identity.warned[e.id] !== undefined && !g.identity.applied.includes(e.id) && g.identity.patron === e.patron) ?? null;
}
/** The patron he could move to: the first of the others that is open to him and has not fallen. */
function otherPatron(g: Game, from: PatronId): PatronId | null {
  return PATRON_IDS.find((p) => p !== from && !patronBlocked(g, p) && !isFallen(g, p)) ?? null;
}

// ---------------------------------------------------------------------------------------------
// The Court (Lisbon, and Funchal)

const courtOldKing: TrafficScene = {
  id: 'court-old-king', ports: ['lisboa'],
  needs: (g) => g.identity.warned['king-dies'] !== undefined && !g.identity.applied.includes('king-dies'),
  build: (g) => {
    const client = g.identity.patron === 'crown';
    const to = client ? otherPatron(g, 'crown') : null;
    return scene('court-old-king', 'The door that is still open',
      'Fernão Vaz has moved his stool so that his back is to the room. The King is at Alvor, he says, and has been carried there for the waters, and the waters are not doing what was hoped. '
      + 'He says it as he would give a freight, evenly. Nobody at the Casa will say the next sentence aloud, and every clerk on the Ribeira has begun to count whose hand is on whose commission.\n\n'
      + (client
        ? 'He says that a captain who sails under the Crown holds what he holds by the old King’s leave, and that the new reign will read the books from the front. He does not say what to do about it. '
        + 'He turns a page, and the page happens to be the one that lists the other houses that will lend a hull.'
        : 'He says you are not under the Crown this voyage, which is the sort of thing a clerk is glad to be able to say. He asks, as a clerk, whether you have written to the King lately, and what you said.'),
      [
        ...(to ? [{
          label: `Go to ${PATRONS[to].name} now, while it is only a rumour`,
          detail: 'A patron left before it falls is a patron you did not fall with. It will be said you left the King’s house in his illness.',
          resolve: (gg: Game) => {
            had(gg, 'court-old-king');
            const r = choosePatron(gg, to);
            return r.ok ? `Fernão Vaz writes your name in a different column, in the same hand. ${r.text}` : `Fernão Vaz reads the reason out for you: ${r.text}`;
          },
        } satisfies SeaChoice] : []),
        {
          label: 'Write to the King, plainly, what the coast is and what it will cost',
          detail: 'It may be read by a dying man or by the clerks who read his post. Either way it is a true letter.',
          resolve: (gg) => {
            had(gg, 'court-old-king');
            gg.noteDeed('patron.honest', { target: 'portugal', place: 'lisboa', magnitude: 0.6, note: 'Wrote to the old King, in his last illness, what the coast was and what the rest of it would cost.' });
            return 'Fernão Vaz seals it himself and says it will go by the next courier. He does not say that it will arrive in time.';
          },
        },
        {
          label: 'Say you are the King’s man, whoever sits in his chair',
          detail: 'It costs nothing, and will be remembered the way a clerk remembers anything said at that desk.',
          resolve: (gg) => { had(gg, 'court-old-king'); return 'Fernão Vaz inclines his head. He writes nothing down, which is what he does when he means to remember it.'; },
        },
      ], 'warning');
  },
};

const courtNewKing: TrafficScene = {
  id: 'court-new-king', ports: ['lisboa'], after: ['court-old-king'],
  needs: (g) => {
    const at = shockTime('joao-dies');
    return reignAt(g.clock.t) === 'manuel' && at !== null && g.clock.t < at + 30 * MONTH;
  },
  build: (g) => {
    const crown = g.identity.patrons.crown;
    return scene('court-new-king', 'The new seal',
      'The Casa has a new seal and a new set of secretaries, and Fernão Vaz has a table of grants beside him that he is re-reading one by one, with a ruler. '
      + 'The late King’s letters are good, he says; they are good in the late King’s name, and the new King’s name wants putting beside them before a factor on the Mina road will honour them as he used to. '
      + 'There is a fee. It is small, and it is the fee for being on the first sheet and not the fortieth.\n\n'
      + (crown.favour > 0.3 ? 'He says that what you were owed by the old reign will be read at half, but that half of a good account is a good account. ' : 'He says nothing about what you were owed by the old reign, which is its own answer. ')
      + 'On the shelf behind him there are fewer of the old men’s hats than there were in spring.',
      [
        {
          label: 'Pay the fee, and be on the first sheet (25 cruzados)',
          detail: 'It is what the clerks are paid for. The new reign’s Casa will know whose name is already in its book.',
          resolve: (gg) => {
            if (!spend(gg, 25)) return again(gg, 'court-new-king', 'You have not got it today. Fernão Vaz says the first sheet will keep until the next call, though he cannot say for how long.');
            had(gg, 'court-new-king');
            gg.identity.patrons.crown.favour = clamp(gg.identity.patrons.crown.favour + 0.1, -1, 1);
            gg.noteDeed('courtesy.kept', { target: 'portugal', place: 'lisboa', magnitude: 0.4, note: 'Paid the fee to have the old King’s grants set beside the new King’s name, on the first sheet.' });
            return 'He stamps the sheet and has it dried in front of you. The new seal is smaller than the old one, and sharper.';
          },
        },
        {
          label: 'Say the old King’s seal was good enough for the last reign’s factors, and let the grants stand',
          detail: 'It is true, and it is not the answer the Casa wants this year.',
          resolve: (gg) => {
            had(gg, 'court-new-king');
            gg.noteDeed('refusal.honest', { target: 'portugal', place: 'lisboa', magnitude: 0.3, note: 'Would not pay to have the old King’s grants re-sealed, and said the old seal was good.' });
            return 'Fernão Vaz says that is what the late King would have answered, and that the late King could say it. He writes your name down the list, a long way.';
          },
        },
        {
          label: 'Ask whose hat has gone from the shelf, and what the new King does with those who wore them',
          detail: 'A question a clerk will answer exactly once.',
          resolve: (gg) => { had(gg, 'court-new-king'); return 'He answers, in four names. Two are at Tomar and one is in Castile. He asks that you not repeat the fourth.'; },
        },
      ]);
  },
};

const courtFavourite: TrafficScene = {
  id: 'court-favourite', ports: ['lisboa'],
  needs: (g) => pendingFavourite(g) !== null,
  build: (g) => {
    const e = pendingFavourite(g)!;
    const d = PATRONS[e.patron];
    const to = otherPatron(g, e.patron);
    return scene('court-favourite', `${d.short[0].toUpperCase()}${d.short.slice(1)}’s man`,
      'A boy who serves the house you sail for finds you on the Ribeira with a message that is not written down. The man who holds your patron’s chair at court, the one who spoke for '
      + `${d.short} at the King’s table, has missed three audiences. `
      + 'His secretary has been seen carrying his papers to a house in the Alfama that is not his own. Nobody has said he has fallen. Nobody on the Rua Nova will lend against his name, and the factors of the other houses are being very polite.\n\n'
      + 'The boy says that a captain’s standing is borrowed from whoever holds the chair, and that it will be some months before anyone says so out loud. He says it is only a thing he heard.',
      [
        ...(to ? [{
          label: `Take your ship to ${PATRONS[to].name} before it is said aloud`,
          detail: 'Moving early is not the same as being pulled down. It will be noticed that you were the first to leave.',
          resolve: (gg: Game) => {
            had(gg, 'court-favourite');
            const r = choosePatron(gg, to);
            return r.ok ? r.text : `The boy waits for your answer, then reads out why it cannot be done now: ${r.text}`;
          },
        } satisfies SeaChoice] : []),
        {
          label: 'Stay with your patron, and say aloud that you do not leave a friend for a rumour',
          detail: 'If it is only a rumour you have kept a friend. If it is not, you will be seen to have kept him.',
          resolve: (gg) => {
            had(gg, 'court-favourite');
            gg.noteDeed('promise.kept', { target: d.name, place: 'lisboa', magnitude: 0.4, note: `Said at the Ribeira that I would not leave ${d.name} for a rumour of its favourite’s fall.` });
            return 'The boy takes it back to the house. By the evening a clerk you do not know touches his hat to you on the quay.';
          },
        },
        {
          label: 'Ask what the favourite is said to have done, and write it down',
          detail: 'It costs a day and a coin for the boy. You will know more than you did.',
          resolve: (gg) => {
            had(gg, 'court-favourite');
            spend(gg, 2);
            gg.noteDeed('patron.honest', { target: 'portugal', place: 'lisboa', magnitude: 0.3, note: `Asked what ${d.name}’s favourite was said to have done, and wrote it down as it was told.` });
            return 'The answer is a long one and has two versions in it. You write both, and mark which you believe.';
          },
        },
      ], 'warning');
  },
};

const courtEdictWarn: TrafficScene = {
  id: 'court-edict-warn', ports: ['lisboa'],
  needs: (g) => g.identity.warned['edict'] !== undefined && !g.identity.applied.includes('edict'),
  build: (g) => {
    const mine = g.origin === 'converso';
    return scene('court-edict-warn', 'The Rua Nova is not calm',
      'Branca Nunes’s table has a queue at it that is not for loans. The King has promised Castile a Portugal that is clear of its Jews, she says; the street has had it from three sides, and the Rua Nova is counting how long it has. '
      + 'Her own family has been baptised for three generations and she has heard what that is worth when the street is counting.\n\n'
      + (mine ? 'She looks at you for longer than she needs to. She does not say it, and you do not need her to. '
        : '')
      + 'A family is waiting in the back room: a man, his wife, her mother and a boy. They are not hers. They have a letter to Jorge at Funchal that says they will work for their keep. '
      + 'Funchal is the first call out from the Tagus. It is also the first place nobody at Lisbon will think to look.',
      [
        {
          label: 'Take the family to Funchal as passengers, and put them ashore at Jorge’s door',
          detail: 'The weigh-house counts heads going out. Anyone who asks will be told they are passengers, which is true.',
          resolve: (gg) => {
            had(gg, 'court-edict-warn');
            casaRegard(gg, -0.02);
            gg.noteDeed('mercy.shown', { target: 'funchal', place: 'lisboa', magnitude: 0.6, note: 'Took a family of four from the Rua Nova to Funchal as passengers, to Branca Nunes’s cousin, before the Edict was published.' });
            return 'They come aboard at dusk with a single chest. The woman’s mother counts the stairs of the gangway aloud. Branca Nunes does not come down to the quay, and sends a boy with the freight, which is more than the fare.';
          },
        },
        {
          label: 'Say the ship has no room, and offer to speak to the Casa for them',
          detail: 'It is honest, and the Casa will not be moved. She will think the better of the honesty.',
          resolve: (gg) => {
            had(gg, 'court-edict-warn');
            gg.noteDeed('refusal.honest', { target: 'lisboa', place: 'lisboa', magnitude: 0.4, note: 'Told Branca Nunes the ship had no room for a family from the back room, and offered to speak to the Casa.' });
            return 'She says that is an answer a careful man gives. The family is sent out by the other door.';
          },
        },
        {
          label: 'Say nothing of it, and weigh anchor with the tide',
          detail: 'It is not a thing a captain is asked for twice.',
          resolve: (gg) => { had(gg, 'court-edict-warn'); return 'The back room is empty when you pass the door on your way out. The queue at the table has grown.'; },
        },
      ], 'warning');
  },
};

const courtFunchal: TrafficScene = {
  id: 'court-funchal', ports: ['funchal'],
  needs: (g) => g.identity.applied.includes('edict') && g.clock.t < (shockTime('edict') ?? 0) + 30 * MONTH,
  build: (g) => {
    const funded = g.identity.patron === 'ruanova' && canFundLine(g, 'funchal', 'lisboa', 'caravela-latina') === null;
    return scene('court-funchal', 'Jorge on the sugar',
      'Jorge Nunes, Branca’s cousin, keeps a counting-house behind the mill at Funchal. He is a thin man with a limp, and he says the font has come to Madeira too: the priest has been round the terraces with a list. '
      + 'The planters who were baptised a generation ago have been baptised again, in public, to make sure. Nothing has been taken from him. A good deal has been counted.\n\n'
      + 'He says the house at Lisbon is lending less this year, and the sugar is moving slowly, and the men who would have bought a share in a hull will not be seen to. '
      + (g.identity.patron === 'ruanova'
        ? 'He says Branca’s table is still willing to put its name to a ship that runs from here, if the captain is a man who sails for the Rua Nova.'
        : 'He asks, because he is a careful man, whether you know anyone who would put a ship on the Madeira run.'),
      [
        ...(funded ? [{
          label: 'Have the Rua Nova fund a Line from Funchal to Lisbon, on its terms',
          detail: 'It pays the hull, and keeps its cut of every profit besides until the advance is paid. The terms are on the page.',
          resolve: (gg: Game) => { had(gg, 'court-funchal'); return openFundedLine(gg, 'funchal', 'lisboa', 'caravela-latina'); },
        } satisfies SeaChoice] : []),
        {
          label: 'Take his letters and his sugar-ledger back to the Rua Nova, sealed',
          detail: 'It is a small thing, and it is what the house asked.',
          resolve: (gg) => {
            had(gg, 'court-funchal');
            gg.noteDeed('contract.kept', { target: 'funchal', place: 'funchal', magnitude: 0.4, note: 'Carried Jorge Nunes’s letters and ledger from Funchal back to the Rua Nova, sealed.' });
            return 'He gives you the packet in both hands. The seal is his own, and a second one, on the back, is his wife’s.';
          },
        },
        {
          label: 'Tell him that nothing can be done from a ship, and sit with him a while',
          detail: 'It costs a little of the tide.',
          resolve: (gg) => {
            had(gg, 'court-funchal');
            gg.noteDeed('mercy.shown', { target: 'funchal', place: 'funchal', magnitude: 0.3, note: 'Sat with Jorge Nunes at Funchal after the font came to the island.' });
            return 'He pours the wine himself. Neither of you says the word that is on the list.';
          },
        },
      ]);
  },
};

const courtEaster: TrafficScene = {
  id: 'court-easter', ports: ['lisboa'],
  needs: (g) => g.identity.applied.includes('easter-1506'),
  build: () => scene('court-easter', 'The table is shut',
    'Branca Nunes’s table is shut, and the sign has been taken in. Her clerk meets you at the door with a key and says that she is at the house of a friend in Belém, and that it was three days. '
    + 'He does not say what happened; the quay has said it to everyone. The King has had some of those who did it hanged and fined the city, and the Rua Nova has gone to ground regardless, and what was left of its credit has gone with it.\n\n'
    + 'There is a woman in the clerk’s kitchen with two children who is not on any list, and a letter for Funchal that nobody dares to post.',
    [
      {
        label: 'Take the woman and the children to Funchal, in the hold, and the letter with them',
        detail: 'There is no weigh-house form for it. If the Casa asks, they are passengers, which is true.',
        resolve: (gg) => {
          had(gg, 'court-easter');
          gg.noteDeed('mercy.shown', { target: 'lisboa', place: 'lisboa', magnitude: 0.8, note: 'Took a woman and two children from a kitchen on the Rua Nova to Funchal, in the hold, after Easter.' });
          return 'They come aboard before light. The children do not speak until Cascais is abeam, and then the younger one asks whether it is allowed to look at the sea.';
        },
      },
      {
        label: 'Put your name to the petition that the King’s justice be done on those who led it',
        detail: 'It is a public thing. It will be remembered at the Casa, and by the men whose names are on the other list.',
        resolve: (gg) => {
          had(gg, 'court-easter');
          gg.noteDeed('judgement.just', { target: 'lisboa', place: 'lisboa', magnitude: 0.5, note: 'Put my name to the petition that justice be done on those who led the killing in the streets at Easter.' });
          return 'The clerk writes your name under the others and sands it. It is a long page, and it is not the whole city.';
        },
      },
      {
        label: 'Leave the clerk what you can spare for the table’s reopening (30 cruzados)',
        detail: 'It is a loan, and nobody will write it as one.',
        resolve: (gg) => {
          if (!spend(gg, 30)) return again(gg, 'court-easter', 'You have not got it today. The clerk says the key will wait on the hook.');
          had(gg, 'court-easter');
          gg.identity.patrons.ruanova.favour = clamp(gg.identity.patrons.ruanova.favour + 0.15, -1, 1);
          return 'The clerk counts it and puts it in a tin that used to hold figs. He says the table will open when Branca does, and that it will remember.';
        },
      },
    ], 'grave'),
};

// ---------------------------------------------------------------------------------------------
// The Crescent

const crescentVenetian: TrafficScene = {
  id: 'crescent-venetian', ports: ['lisboa'],
  needs: (g, st) => st.fronts.crescent.stage >= 2 && g.chronicle.act >= 2,
  build: (g, st) => {
    const stage = st.fronts.crescent.stage;
    const dear = hasActive(st, 'mamluk', 'stub', g.clock.t);
    return scene('crescent-venetian', 'A factor from Venice',
      'Ser Piero Zane has a house on the Rua Nova with a Venetian flag over the door that nobody has asked him to take down. He is polite and very exact. '
      + `He says that pepper at Lisbon is ${dear ? 'dearer this season than it was, and that he has been told to find out why' : 'cheaper than it ought to be'}, and that the Signoria has been asking in Cairo what the Cape road is worth. `
      + (stage >= 3 ? 'He says the convoys on the Red Sea have changed the arithmetic, and that Venice would like to know how much pepper the Casa has coming and when. ' : 'He does not say how Venice has taken the news of a Portuguese ship at Calecute. His face says it. ')
      + 'He would be grateful for the price at Calecute, if the ship has been, and what the Zamorin’s factors were asking. He will pay for it.',
      [
        {
          label: 'Tell him what you saw of the price at Calecute, for forty cruzados',
          detail: 'It is a price sheet and not a secret. The Casa would still prefer you did not.',
          resolve: (gg) => {
            had(gg, 'crescent-venetian');
            gg.crown.gold += 40;
            gg.noteDeed('fact.sold', { target: 'lisboa', place: 'lisboa', magnitude: 0.4, note: 'Told Ser Piero Zane of Venice what the Zamorin’s factors were asking for pepper at Calecute, for forty cruzados.' });
            return 'He writes it in a small book and counts the money onto the table in coin, one by one. He says the Signoria is obliged.';
          },
        },
        {
          label: 'Say that a captain of the King’s tells the Casa what he sees, and nobody else',
          detail: 'It is the answer Fernão Vaz would give for you. It will be mentioned to him.',
          resolve: (gg) => {
            had(gg, 'crescent-venetian');
            gg.noteDeed('refusal.honest', { target: 'portugal', place: 'lisboa', magnitude: 0.4, note: 'Refused to tell a Venetian factor what pepper fetched at Calecute, and said so at the Casa.' });
            return 'Ser Piero thanks you for the clarity, which he says is the only thing in Lisbon that has not gone up.';
          },
        },
        {
          label: 'Ask him what Venice is paying in Cairo, and trade one answer for the other',
          detail: 'It is a fair exchange and it tells you what Cairo thinks. It will be known on the Rua Nova by dark.',
          resolve: (gg) => {
            had(gg, 'crescent-venetian');
            gg.noteDeed('fact.checked', { target: 'lisboa', place: 'lisboa', magnitude: 0.3, note: 'Traded a Venetian factor’s sheet of Cairo’s prices for pepper for my own of Calecute’s.' });
            return 'He considers it with a good deal of respect, and says the sheet will be at the ship by evening. It is, and in a better hand than yours.';
          },
        },
      ]);
  },
};

const crescentPilot: TrafficScene = {
  id: 'crescent-pilot', ports: ['melinde'], after: ['crescent-venetian'],
  needs: (g, st) => st.fronts.crescent.stage >= 2 && g.chronicle.act >= 3,
  build: () => scene('crescent-pilot', 'A pilot out of Adem',
    'A man waiting at the water-stairs with a roll under his arm turns out to be a pilot out of Adem, Mahmud ibn Salim, who has been put ashore by a dhow that did not wish to meet your ship. '
    + 'He is not a spy and says so with the air of a man who has been called one before. He has the Sultan’s letter to Rome, in a copy, and half of it is in a hand he cannot read; he says the other half was added in a different ink. '
    + 'He wants to go to Calecute, where he has a brother in a house of the Mappila, and no dhow will take him now.\n\n'
    + 'The chamberlain’s man at his elbow says that Melinde would be glad of a friend who took him, and gladder of one who did not have to be asked twice.',
    [
      {
        label: 'Take him to Calecute as a passenger, and ask nothing of his letter',
        detail: 'He is a man who wants to go home. It may be said at Calecute that the ship carries Moors, and at Lisbon the same.',
        resolve: (gg) => {
          had(gg, 'crescent-pilot');
          gg.noteDeed('passenger.aided', { target: 'aden', place: 'melinde', magnitude: 0.5, note: 'Took Mahmud ibn Salim, a pilot out of Adem, from Melinde toward Calecute as a passenger, and did not read his letter.' });
          return 'Mahmud ibn Salim puts the roll away and thanks you in Portuguese, which he has about forty words of. He eats alone, and washes at the rail at dawn.';
        },
      },
      {
        label: 'Take the copy of the Sultan’s letter for the Casa, and send him on his way',
        detail: 'The Casa will want to read it. He will not forgive being asked.',
        resolve: (gg) => {
          had(gg, 'crescent-pilot');
          gg.noteDeed('crown.reported', { target: 'portugal', place: 'melinde', magnitude: 0.3, note: 'Had a copy of the Sultan’s letter to Rome from a pilot out of Adem at Melinde, to be read at the Casa.' });
          return 'He gives it up without a word and looks at the sea. The chamberlain’s man looks at the paving.';
        },
      },
      {
        label: 'Tell him the ship goes the other way',
        detail: 'It is true, and it is all you say.',
        resolve: (gg) => { had(gg, 'crescent-pilot'); return 'He nods, and the roll goes back under his arm. The next dhow in will have him, or it will not.'; },
      },
    ]),
};

const crescentConvoy: TrafficScene = {
  id: 'crescent-convoy', ports: ['calecute'], after: ['crescent-pilot'],
  needs: (g, st) => (st.fronts.crescent.stage >= 3 || hasActive(st, 'mamluk', 'convoy', g.clock.t)) && g.chronicle.act >= 4,
  build: (_g, st) => {
    const league = typeof st.powers.mamluk.flags.league === 'number';
    return scene('crescent-convoy', 'The ships sail in company',
      'A Gujarati master, Ali Karim, who has called at Calecute every season since before there was a Portuguese ship in the Indian Ocean, says over a bowl of fish that nobody sails alone from Adem any more. '
      + 'The Mamluk captains put the ships out in company, under an officer, with guns that were bought at a price he will not repeat. '
      + (league ? 'He says the Zamorin has seen the ships go past his port and has not stopped them, which is more than a favour. ' : 'He says the Zamorin has not yet decided what he thinks of it. ')
      + 'He is not afraid of you, and he is careful about it: his own ship is at the quay and his nephew is at the helm.\n\n'
      + 'He has sixteen sail in the roads this week who are not his and not yours, and a letter in his sleeve that he would rather keep than show.',
      [
        {
          label: 'Let him sail, and say the ship asks nothing of him',
          detail: 'The Rule is the King’s, and what you do here is what the coast will say of it. A ship let go is remembered.',
          resolve: (gg) => {
            had(gg, 'crescent-convoy');
            gg.noteDeed('ship.spared', { target: 'calicut', place: 'calecute', magnitude: 0.5, note: 'Let the Gujarati master Ali Karim sail from Calecute without a stop, and told him the ship asked nothing of him.' });
            return 'Ali Karim bows to the waist and stays there. His nephew sets the sail before he has finished straightening.';
          },
        },
        {
          label: 'Stop her, and read the letter in his sleeve',
          detail: 'It will be said at Adem by evening. The King’s letter is not his, and he knows it.',
          resolve: (gg) => {
            had(gg, 'crescent-convoy');
            gg.noteDeed('ship.stopped', { target: 'calicut', place: 'calecute', magnitude: 0.6, note: 'Stopped the Gujarati master Ali Karim at Calecute and had him hand over the letter in his sleeve.' });
            return 'The letter is a bill of lading and a note to a cousin. He watches you read it with the face of a man writing down what he will say later.';
          },
        },
        {
          label: 'Buy what he knows of the convoys, for thirty cruzados',
          detail: 'He will sell it once. Whoever else he has sold it to will have it too.',
          resolve: (gg) => {
            if (!spend(gg, 30)) return again(gg, 'crescent-convoy', 'You have not got it. He says he will be at the quay until the wind turns.');
            had(gg, 'crescent-convoy');
            gg.noteDeed('fact.checked', { target: 'calicut', place: 'calecute', magnitude: 0.3, note: 'Paid Ali Karim thirty cruzados for what he knew of the Mamluk convoys.' });
            return 'He counts it twice and talks for the length of the bowl. It is more than you asked, and you cannot tell whether all of it is so.';
          },
        },
      ]);
  },
};

const crescentLeague: TrafficScene = {
  id: 'crescent-league', ports: ['cochim'], after: ['crescent-convoy'],
  needs: (g, st) => (st.fronts.crescent.stage >= 4 || typeof st.powers.mamluk.flags.league === 'number') && g.chronicle.act >= 4,
  build: (g) => scene('crescent-league', 'Three courts, one letter',
    'The Raja’s treasurer, Govinda Pillai, has a letter that was brought down the coast in a Mappila boat. He says it is an agreement among three courts, Cairo and Gujarat and Calecute, and that it is not about Cochim and Cochim will pay for it. '
    + 'He has not been asked to join; he was told, and told with some care. He says the Raja would like the Portuguese to hear it from him before they hear it from anyone else.\n\n'
    + 'He says also, without looking at you, that Cochim has no wish to be the place where the next war is fought, and that a captain who could carry a proposal to the Zamorin’s ministers, from a friend and not from a fleet, would find it received.'
    + (g.crew.officers.some((o) => o.alive && !o.ashoreAt && o.role === 'lingua') ? ' Your língua is standing at your elbow and already knows what he is going to be asked.' : ''),
    [
      {
        label: 'Carry a proposal of peace to the Zamorin’s ministers, in the Raja’s name and yours',
        detail: 'It will take weeks and the Zamorin’s ministers may send you back. A man who tried is remembered by both courts.',
        resolve: (gg) => {
          had(gg, 'crescent-league');
          casaRegard(gg, -0.02);
          gg.noteDeed('peace.made', { target: 'calicut', place: 'cochim', magnitude: 0.6, note: 'Carried a proposal from the Raja of Cochim to the Zamorin’s ministers, in the Raja’s name and my own, when three courts had made a league.' });
          return 'The Zamorin’s ministers hear it out and say they will consider it. They do not say they will not. Govinda Pillai writes the date in the Raja’s book.';
        },
      },
      {
        label: 'Thank him, and send the copy of the letter to the Casa by the next ship',
        detail: 'It is what the King will want first. The Raja will notice it was not the other thing.',
        resolve: (gg) => {
          had(gg, 'crescent-league');
          gg.noteDeed('crown.reported', { target: 'portugal', place: 'cochim', magnitude: 0.4, note: 'Sent the Casa a copy of the three courts’ agreement from the Raja of Cochim’s treasurer.' });
          return 'Govinda Pillai says he understood, and gives you the copy in a different hand than the original.';
        },
      },
      {
        label: 'Say the ship will stand beside Cochim if the Zamorin comes down on it',
        detail: 'A word to a small court against a large one. If you do not keep it, Cochim will not forget.',
        resolve: (gg) => {
          had(gg, 'crescent-league');
          gg.noteDeed('ally.sworn', { target: 'cochin', place: 'cochim', magnitude: 0.6, note: 'Told the Raja of Cochim’s treasurer that the ship would stand beside Cochim if the Zamorin came against it.' });
          return 'Govinda Pillai writes it, in Malayalam first and then in Portuguese letters as best he can. He says that is what the Raja hoped for and did not expect.';
        },
      },
    ], 'warning'),
};

// ---------------------------------------------------------------------------------------------
// The Gold (Mina)

const goldGarrison: TrafficScene = {
  id: 'gold-garrison', ports: ['mina'],
  needs: (_g, st) => st.fronts.gold.stage >= 2,
  build: (_g, st) => scene('gold-garrison', 'Men for the Castle',
    'Kwesi finds you on the beach before the Castle’s officers do. He says it in the tone he uses for freight: the Castle is burying men. The garrison that came out in the last ship is not the garrison that is standing on the wall, and the factor has stopped asking the beach for credit because the beach has stopped giving it. '
    + (st.fronts.gold.stage >= 3 ? 'The captain is rationing the dues and the men are rationing the watches. ' : '')
    + 'Kwesi has no love for the Castle and a good deal of business with it, and he says that a garrison that dies is a customer that stops paying.\n\n'
    + 'The Castle’s surgeon is a young man who has not slept in a week. The captain of São Jorge does not say what he needs, because a captain of the Castle does not say it to a ship in the roads. His sergeant says it for him, at the gate: six sick men who would go home if there were a hull to take them.',
    [
      {
        label: 'Take the six sick men aboard for Lisbon, and let the surgeon go with them as far as the Cape Verde current',
        detail: 'They are men in a fever. Your own people will be lying beside them for a month.',
        resolve: (gg) => {
          had(gg, 'gold-garrison');
          gg.crew.sickness = clamp(gg.crew.sickness + 0.08, 0, 1);
          gg.noteDeed('mercy.shown', { target: 'mina', place: 'mina', magnitude: 0.8, note: 'Took six sick men of the Castle’s garrison aboard at Mina, for Lisbon, with the surgeon’s leave.' });
          return 'They are carried down the beach on doors. The sergeant thanks you in a Portuguese that has the country in it. Kwesi stands on the sand with his hands behind him and does not say anything.';
        },
      },
      {
        label: 'Leave the Castle’s surgeon your own physic and vinegar (twenty cruzados)',
        detail: 'It will not save the six. It may save the seventh.',
        resolve: (gg) => {
          if (!spend(gg, 20)) return again(gg, 'gold-garrison', 'You have not got it. The sergeant says he will ask again at the next ship.');
          had(gg, 'gold-garrison');
          gg.noteDeed('mercy.shown', { target: 'mina', place: 'mina', magnitude: 0.5, note: 'Left the Castle’s surgeon at Mina my ship’s physic and vinegar.' });
          return 'The surgeon takes the chest and says he will write down what becomes of it. He means it. Kwesi says the beach will hear of it, which he says about everything he approves.';
        },
      },
      {
        label: 'Say the ship can spare nothing, and the Castle should write to Lisbon',
        detail: 'It is the answer the Casa’s own rules give. The sergeant has heard it.',
        resolve: (gg) => { had(gg, 'gold-garrison'); return 'The sergeant nods, and goes back through the gate. Kwesi looks at the water for a while, and then at his scales.'; },
      },
    ]),
};

const goldFever: TrafficScene = {
  id: 'gold-fever', ports: ['mina'], after: ['gold-garrison'], repeatDays: 240,
  needs: (g, st) => { const u = st.powers.akan.flags.feverUntil; return typeof u === 'number' && g.clock.t < u; },
  build: () => scene('gold-fever', 'The wet season on the beach',
    'The Castle’s bell has been rung for the dead twice since you anchored, which is as often as it rings for the Angelus. Your own people have been ashore for the water and the trade, and your surgeon says two of them have the look that he does not like: a yellowness in the eye, a shaking in the hand at the oar. '
    + 'Kwesi, at the edge of the surf, says that the sickness comes with the standing water behind the town and goes with the dry, and that the beach people sleep on the high ground, and that he has never understood why strangers do not.\n\n'
    + 'The factor has the bark and the vinegar and is selling them to ships at a price that is not the Castle’s own.',
    [
      {
        label: 'Buy the bark and vinegar from the factor, and move the company to the high ground (thirty cruzados)',
        detail: 'It costs two days’ trade. Your surgeon says it is the only thing that has ever worked.',
        resolve: (gg) => {
          if (!spend(gg, 30)) return again(gg, 'gold-fever', 'You have not got it. The factor says he will keep the lot until the tide.');
          had(gg, 'gold-fever');
          gg.crew.sickness = clamp(gg.crew.sickness - 0.1, 0, 1);
          return 'The company sleeps above the town for three nights, in Kwesi’s cousin’s yard, and wakes with dew on the blankets. The two with the yellow eyes are better by the fourth.';
        },
      },
      {
        label: 'Lie off in the roads two nights and trade from the boat',
        detail: 'It costs nothing, and the beach trades a little slower to a ship that stands off.',
        resolve: (gg) => { had(gg, 'gold-fever'); gg.crew.sickness = clamp(gg.crew.sickness + 0.02, 0, 1); return 'The boat’s crew come back wet and sullen. The two with the yellow eyes are no worse.'; },
      },
      {
        label: 'Press on with the trade, and sail on the tide',
        detail: 'The beach sells while the beach sells. Fever does not read the almanac.',
        resolve: (gg) => { had(gg, 'gold-fever'); gg.crew.sickness = clamp(gg.crew.sickness + 0.06, 0, 1); return 'The trade is brisk and the gold is the better for it. By the time the lead is in the water at the next anchorage three of the oarsmen are lying down.'; },
      },
    ], 'warning'),
};

const goldAkan: TrafficScene = {
  id: 'gold-akan', ports: ['mina'], after: ['gold-garrison'],
  needs: (g, st) => st.fronts.gold.stage >= 3 || hasActive(st, 'akan', 'war', g.clock.t) || machinePhase({ st }, 'akan').phase >= 1,
  build: (g, st) => {
    const war = hasActive(st, 'akan', 'war', g.clock.t);
    return scene('gold-akan', 'The elders on the beach',
      'Kwesi brings an elder of the beach to your boat, a woman of sixty with a stool carried behind her and a voice that does not need carrying. Kwesi says her name and then says it is not what she is called on the beach. '
      + (war ? 'The kingdoms behind the coast are at war, and her own is not on the winning side, and she is not here about that. ' : 'The kingdoms behind the coast are quarrelling, and she is not here about that. ')
      + 'She has come about the weights. The Castle’s scales, she says, are not the beach’s, and the difference is the thing the Castle keeps and the beach is tired of. '
      + 'She asks whether the captain of the ship will carry the beach’s words to the captain of the Castle, exactly, and in front of the factor, and not as an interpreter makes them.',
      [
        {
          label: 'Carry them as she says them, in front of the factor, and have the weights put side by side',
          detail: 'The Castle’s captain will not thank you. The beach will remember who said it plainly.',
          resolve: (gg) => {
            had(gg, 'gold-akan');
            casaRegard(gg, -0.02);
            gg.noteDeed('weights.fair', { target: 'eguafo', place: 'mina', magnitude: 0.6, note: 'Carried an Akan elder’s complaint about the Castle’s scales to the factor, word for word, in front of him, and had the weights put side by side.' });
            return 'The factor’s face does what a face does in front of a ship’s company. The scales are laid beside each other on the table, and the difference is a thumb’s width of brass.';
          },
        },
        {
          label: 'Carry them softened, so that the Castle can answer without losing face',
          detail: 'It will be answered. It may not be mended.',
          resolve: (gg) => {
            had(gg, 'gold-akan');
            gg.noteDeed('refusal.curt', { target: 'eguafo', place: 'mina', magnitude: 0.3, note: 'Carried an Akan elder’s complaint about the Castle’s scales softened, so that the factor could answer without losing face.' });
            return 'The factor says the weights are the King’s and the King’s are true. The elder says through Kwesi that she will tell the beach what was said, and then she tells it differently.';
          },
        },
        {
          label: 'Tell her the ship cannot speak for the beach, and give her a place to sit in the shade',
          detail: 'It is honest, and it solves nothing.',
          resolve: (gg) => { had(gg, 'gold-akan'); return 'She sits. Kwesi stays beside her, a little further off than he usually does, and sells nothing for an hour.'; },
        },
      ]);
  },
};

const goldShut: TrafficScene = {
  id: 'gold-shut', ports: ['mina'], after: ['gold-akan'],
  needs: (g, st) => st.fronts.gold.stage >= 4 || hasActive(st, 'akan', 'embargo', g.clock.t) || (hasActive(st, 'akan', 'war', g.clock.t) && st.fronts.gold.stage >= 3),
  build: () => scene('gold-shut', 'The beach is shut',
    'The beach at Mina is empty of canoes. The Castle’s flag is up and the gate is shut by day, and the sergeant who spoke to you last time speaks to you now through the bars. The Akan have stopped selling on the Castle’s terms, and the Castle lives on what it is sent, and the last ship was a long time ago. '
    + 'Kwesi sits on the upturned canoe where he sat the first time you met him, and he does not sell. He says it is not a thing he chose. He says his house has gone with the beach, as it always would, and that he will talk, but not about gold.\n\n'
    + 'He has a letter for the captain of São Jorge. It says what the beach would take to open again, and it has been three times to the gate and three times been sent away unread.',
    [
      {
        label: 'Carry Kwesi’s letter to the captain of the Castle yourself, and wait for an answer',
        detail: 'The captain will not enjoy being asked by a ship. He will read it, if the ship stands in front of him while he does.',
        resolve: (gg) => {
          had(gg, 'gold-shut');
          casaRegard(gg, -0.02);
          gg.noteDeed('favour.done', { target: 'eguafo', place: 'mina', magnitude: 0.6, note: 'Carried Kwesi’s letter, which the beach had sent three times unread, to the captain of São Jorge, and stood in front of him while he read it.' });
          return 'The captain reads it twice, at the table with his back to you. He says the King’s letters say nothing of terms. He keeps the paper.';
        },
      },
      {
        label: 'Leave the Castle your spare powder and iron (forty cruzados’ worth)',
        detail: 'The Castle lives on what it is sent. It may be some time before it is sent anything else.',
        resolve: (gg) => {
          if (!spend(gg, 40)) return again(gg, 'gold-shut', 'You have not got it. The sergeant says the Castle will be glad of whatever it is when you do.');
          had(gg, 'gold-shut');
          gg.noteDeed('favour.done', { target: 'portugal', place: 'mina', magnitude: 0.5, note: 'Left the Castle at Mina forty cruzados’ worth of powder and iron when the beach was shut to it.' });
          return 'The sergeant signs for it through the bars, and for a moment looks like a man who has been given something other than a reason.';
        },
      },
      {
        label: 'Say the ship is a guest, and has no business in it',
        detail: 'It is true. It will not seem true to anyone inside the walls.',
        resolve: (gg) => { had(gg, 'gold-shut'); return 'Kwesi nods slowly. He says it is the answer he would give, and that it is the reason he is sitting on the canoe.'; },
      },
    ], 'warning'),
};

// ---------------------------------------------------------------------------------------------
// The Claim

const claimCastile: TrafficScene = {
  id: 'claim-castile', ports: ['lisboa'],
  needs: (_g, st) => st.fronts.claim.stage >= 2,
  build: (_g, st) => scene('claim-castile', 'Where the line runs',
    'There is a Castilian at the Casa, a pilot called Rodrigo de Soto, and he is being treated with an elaborate courtesy that Fernão Vaz says is the Casa’s way of not saying what it thinks. '
    + `He has a letter from his sovereigns asking where the line falls on the Guinea coast, and who gave the Portuguese pilots the sheets that put the Mina beach so far from where Castile had thought it. ${st.fronts.claim.stage >= 3 ? 'The line is drawn on paper; the water has not read it. ' : ''}`
    + 'He has been told that no one at the Casa can say. He has been told it nine times. He has found a captain who has been there, and he is very polite about it.\n\n'
    + 'He would pay well for a copy of your sheet of the coast. He says it would be for his own use, and that is certainly one of the things it would be for.',
    [
      {
        label: 'Keep the sheets in the Casa’s press, and say so',
        detail: 'It is what the King asks. It costs you what Castile would have paid.',
        resolve: (gg) => {
          had(gg, 'claim-castile');
          gg.noteDeed('chart.shared', { target: 'portugal', place: 'lisboa', magnitude: 0.4, note: 'Told a Castilian pilot at the Casa that my sheets of the Guinea coast were the Casa’s, and left them in the press.' });
          return 'Rodrigo de Soto bows. He says he understood the answer before he asked, and had to ask all the same.';
        },
      },
      {
        label: 'Sell him a copy of your sheet of the coast (two hundred cruzados)',
        detail: 'It is a great deal of money. The Casa will know who sold it, because there is only one man who could have.',
        resolve: (gg) => {
          had(gg, 'claim-castile');
          gg.crown.gold += 200;
          gg.noteDeed('chart.sold', { target: 'castile', place: 'lisboa', magnitude: 0.7, note: 'Sold a copy of my sheet of the Guinea coast to a Castilian pilot for two hundred cruzados.' });
          return 'He counts the money out in Castilian coin, which has an unfamiliar weight. He says that nobody will ever know, in a voice that suggests he is already telling someone.';
        },
      },
      {
        label: 'Put the Portuguese case for the line to the Casa’s council, aloud, with his letter before it',
        detail: 'It takes a morning and a favour, and it is a thing a captain is not asked to do.',
        resolve: (gg) => {
          had(gg, 'claim-castile');
          casaRegard(gg, -0.02);
          gg.noteDeed('claim.argued', { target: 'castile', place: 'lisboa', magnitude: 0.5, note: 'Put the Portuguese case for where the line runs to the Casa’s council, aloud, with the Castilian pilot’s letter before it.' });
          return 'The council listens, and Fernão Vaz writes it into the minute. Rodrigo de Soto, who is standing at the back, writes it into something of his own.';
        },
      },
    ]),
};

const claimCanaries: TrafficScene = {
  id: 'claim-canaries', ports: ['las-palmas'], after: ['claim-castile'],
  needs: (_g, st) => st.fronts.claim.stage >= 3,
  build: () => scene('claim-canaries', 'Castile’s harbour-master',
    'The harbour-master at Las Palmas is Castile’s and wears it. He comes down to the mole with a clerk and a paper, and he asks, politely and in order, what the ship has been doing south of the line. '
    + 'He is not looking for an answer; he is looking for the way a captain gives one. He has a list of Portuguese hulls that have called, and he says he does not like to see a name appear on it twice. '
    + 'The water at Las Palmas is good and the harbour dues are not what they were.\n\n'
    + 'Behind him, on the mole, a Portuguese pilot who has been in Castile’s pay for a year looks the other way.',
    [
      {
        label: 'Answer him plainly, and say what the ship carries and where she is bound',
        detail: 'It is a civil answer to a civil question. It will be written down.',
        resolve: (gg) => {
          had(gg, 'claim-canaries');
          gg.noteDeed('courtesy.kept', { target: 'castile', place: 'las-palmas', magnitude: 0.4, note: 'Answered Castile’s harbour-master at Las Palmas plainly about the ship’s cargo and her course.' });
          return 'He thanks you, and writes it, and the dues are what they were last time. He says he hopes the ship has a good passage, and the clerk underlines something.';
        },
      },
      {
        label: 'Say the ship answers to the King of Portugal’s officers and none other',
        detail: 'It is the Portuguese answer. It will be reported at Seville.',
        resolve: (gg) => {
          had(gg, 'claim-canaries');
          gg.noteDeed('refusal.curt', { target: 'castile', place: 'las-palmas', magnitude: 0.3, note: 'Told Castile’s harbour-master at Las Palmas that the ship answered to the King of Portugal’s officers and none other.' });
          return 'The harbour-master says he has noted it, and that dues are payable at the mole. They are, and in advance.';
        },
      },
      {
        label: 'Ask him which of the Portuguese pilots on his list is the one in Castile’s pay',
        detail: 'He will not tell you. It is the question he has been dreading.',
        resolve: (gg) => {
          had(gg, 'claim-canaries');
          gg.noteDeed('informer.found', { target: 'castile', place: 'las-palmas', magnitude: 0.4, note: 'Asked Castile’s harbour-master at Las Palmas which Portuguese pilot on his list was in Castile’s pay, and saw him look at the mole.' });
          return 'He says he does not know what you mean, and looks at the mole. The pilot on it has gone.';
        },
      },
    ]),
};

const claimPillar: TrafficScene = {
  id: 'claim-pillar', ports: ['mpinda', 'benguela'], after: ['claim-castile'],
  needs: (g) => g.rival.claimed.includes(here(g)),
  build: (g) => {
    const name = g.rival.name;
    const place = g.dockedAt ?? 'the coast';
    const where = g.dockedAt ? portDef(g.dockedAt).name : 'the coast';
    return scene('claim-pillar', 'His stone is here',
      `There is a limestone pillar on the point above the anchorage, cut with the arms of Portugal and a cross, and the name under them is ${name}’s. It has been there long enough for the weather to take the sharpness off the letters. `
      + `He was not a great deal ahead of you; the people on the beach say his ship watered here a few months ago, and the chart the Casa will make of ${where} will carry his name and not yours. `
      + 'The renown for the coast is his, and the Casa has already entered it.\n\n'
      + 'Castile’s ships are looking at the same coast, and a stone that someone else put up is a claim somebody else must answer, and the King has asked for as many of those as can be made.',
      [
        {
          label: 'Raise your own padrão beside his (twenty-five cruzados for the stone)',
          detail: 'It will say that two Portuguese captains were here. It will not say which was first.',
          resolve: (gg) => {
            if (!spend(gg, 25)) return again(gg, 'claim-pillar', 'You have not got it. The stone stays in the hold, and the point is as it was.');
            had(gg, 'claim-pillar');
            gg.noteDeed('claim.made', { target: place, place, magnitude: 0.5, note: `Raised a second padrão beside ${name}’s on the point at ${where}.` });
            return 'The mason cuts the cross a little deeper than the other. The stone goes up against the sky beside his, and the shadow of the one falls across the other for an hour.';
          },
        },
        {
          label: 'Take a rubbing of his pillar to the Casa, and ask it to be argued whose the coast is',
          detail: 'It is a thing a captain is not asked to do. It may stand, or it may be noted.',
          resolve: (gg) => {
            had(gg, 'claim-pillar');
            casaRegard(gg, -0.01);
            gg.noteDeed('claim.argued', { target: place, place, magnitude: 0.4, note: `Took a rubbing of ${name}’s pillar at ${where} to be laid before the Casa, and asked that the coast be argued.` });
            return 'The mason takes it on wet paper and a blunt pencil. It is a better rubbing than the carving deserves.';
          },
        },
        {
          label: 'Leave it, and go on',
          detail: 'It is his, and there are other coasts.',
          resolve: (gg) => { had(gg, 'claim-pillar'); return 'You go on. The pillar stays at the point, and gets smaller behind you until it is a mark on the horizon, and then is not.'; },
        },
      ], 'warning');
  },
};

const claimInterloper: TrafficScene = {
  id: 'claim-interloper', ports: ['mina'], after: ['claim-canaries'],
  needs: (g, st) => st.fronts.claim.stage >= 3 && hasActive(st, 'castile', 'stub', g.clock.t),
  build: () => scene('claim-interloper', 'A Castilian on the beach',
    'There is a caravel at anchor beyond the surf that is not yours and is not the Castle’s. She has her sovereigns’ arms on the stern and no cross on the sail, and her boats have been going in and out of the surf since daybreak. '
    + 'Kwesi says what she is buying, and the price she is paying, and the price is better than the Castle’s. He says it with no pleasure at all. '
    + 'The Castle’s factor says it is an interloper and that the Mina trade is the King’s alone; his captain says it is none of his business until it is. '
    + 'Her master is a stout man with a hat who has been waiting, quite politely, for you to come to a decision.\n\n'
    + 'Your own letter from the King is explicit about interlopers. It does not say what to do with one who has a better price.',
    [
      {
        label: 'Go alongside and stop her, and demand to see her master’s papers',
        detail: 'She will be searched and sent off. It will be reported at Seville and in the Castle’s own book.',
        resolve: (gg) => {
          had(gg, 'claim-interloper');
          gg.noteDeed('ship.stopped', { target: 'castile', place: 'mina', magnitude: 0.6, note: 'Stopped a Castilian caravel on the Mina beach, asked for her master’s papers, and sent her off.' });
          return 'Her master hands the papers across with a bow and does not say anything. He weighs anchor within the hour, and the beach watches him go with a look that is neither relief nor regret.';
        },
      },
      {
        label: 'Warn her off, and let her go on her way',
        detail: 'It is the milder way. The Castle will say it was not enough.',
        resolve: (gg) => {
          had(gg, 'claim-interloper');
          gg.noteDeed('ship.spared', { target: 'castile', place: 'mina', magnitude: 0.4, note: 'Warned a Castilian caravel off the Mina beach and let her go on her way.' });
          return 'The master touches his hat and weighs anchor. The caravel stands off for a day, and a canoe or two goes out to her in the dusk.';
        },
      },
      {
        label: 'Say nothing, and let the beach decide who it sells to',
        detail: 'It is against the letter of the commission. It is what the beach is doing already.',
        resolve: (gg) => {
          had(gg, 'claim-interloper');
          gg.noteDeed('order.breached', { target: 'castile', place: 'mina', magnitude: 0.5, note: 'Let a Castilian interloper trade on the Mina beach, against the letter of the commission.' });
          return 'Her boats go on in and out. The Castle’s captain looks at you across the water and says nothing, which is what he is paid to do.';
        },
      },
    ], 'warning'),
};

// ---------------------------------------------------------------------------------------------
// The conflicts with a face on the road

const kongoSons: TrafficScene = {
  id: 'kongo-sons', ports: ['mpinda'],
  needs: (_g, st) => machinePhase({ st }, 'kongo').phase >= 1 && machinePhase({ st }, 'kongo').phase <= 2,
  build: (_g, st) => {
    const arms = machinePhase({ st }, 'kongo').phase >= 2;
    return scene('kongo-sons', 'Two letters from the capital',
      'The Mani Soyo’s officer at Mpinda has two letters for you, sent down the road a day apart by two men who have not spoken for a month. They are from two of the old king’s sons. '
      + (arms ? 'Each has men under arms and each says the other has not got a drop of the right blood; the road up to Mbanza Kongo is held by whichever of them reached it first, and the beach is quiet in the way of a beach that is counting. '
        : 'The old king is failing, and each son says the other has not the standing for the stool; neither has men in arms yet. ')
      + 'One is addressed to the King of Portugal and one to the captain, and neither says what it wants. They are sealed in two kinds of wax.\n\n'
      + 'The officer says the elders will take the one and the traders the other, and that the priests are waiting to be asked. He says he will carry out whichever the captain chooses, and he will not say which he would choose.',
      [
        {
          label: 'Carry both letters to Lisbon sealed, and answer neither son',
          detail: 'The King will want them. The sons will each want to know why the other was carried.',
          resolve: (gg) => {
            had(gg, 'kongo-sons');
            gg.noteDeed('favour.done', { target: 'kongo', place: 'mpinda', magnitude: 0.4, note: 'Took the old king’s two sons’ letters to Lisbon, sealed, and answered neither.' });
            return 'The officer puts them into your hands with the air of a man giving up two coals. He says the capital will hear that the ship answered neither, and that this will be thought of as an answer.';
          },
        },
        {
          label: 'Tell the officer the ship will stand with whichever son the elders and the priests have chosen',
          detail: 'A word to a court that has not yet chosen. It may have to be kept.',
          resolve: (gg) => {
            had(gg, 'kongo-sons');
            gg.noteDeed('ally.sworn', { target: 'kongo', place: 'mpinda', magnitude: 0.5, note: 'Told the Mani Soyo’s officer at Mpinda that the ship would stand with the son the elders and the priests chose.' });
            return 'The officer says that is a careful answer and that he will carry it. He does not say that it was the one he hoped for.';
          },
        },
        {
          label: 'Say the ship is a guest, and trades at the beach, and has nothing to say of a king’s sons',
          detail: 'It is true and it is dull. Neither of them will think it a good answer.',
          resolve: (gg) => {
            had(gg, 'kongo-sons');
            gg.noteDeed('courtesy.kept', { target: 'kongo', place: 'mpinda', magnitude: 0.3, note: 'Told the Mani Soyo’s officer that the ship was a guest at Mpinda and had nothing to say of the old king’s sons.' });
            return 'The officer says it is how his father would have answered, and that it kept his father alive. He puts the letters back in his sleeve.';
          },
        },
      ]);
  },
};

const senegalRiders: TrafficScene = {
  id: 'senegal-riders', ports: ['arguim'],
  needs: (_g, st) => machinePhase({ st }, 'senegal').phase >= 1 && machinePhase({ st }, 'senegal').phase <= 2,
  build: (_g, st) => {
    const war = machinePhase({ st }, 'senegal').phase >= 2;
    return scene('senegal-riders', 'A lord of the river',
      'A young man in a long blue robe is waiting at the factory gate with two servants and a bundle of hides that he has no apparent wish to sell. He says he is the Damel’s kinsman, which the factor says everybody on the river is, and that his lord’s horsemen are '
      + (war ? 'fighting the riders from the east on the river road, and have been for most of a year, and that the Damel would be glad of a friend with a ship. ' : 'being pressed by riders out of the east, and that the Damel will be glad of a friend with a ship before the rains. ')
      + 'He has no letter, and the factor has a low opinion of men who ask for help without one. He says that a captain of the King of Portugal might know what has been done for his people before: that a Wolof lord’s son was once carried to Lisbon, and spoken to by the King, and sent home with a promise.\n\n'
      + 'He asks for passage to Lisbon, for himself and one servant. He does not say what he will ask of the King when he gets there.',
      [
        {
          label: 'Take him and one servant to Lisbon as passengers',
          detail: 'The King will want to see him. He may not like what he is told. The factor will say the ship carried a man with no letter.',
          resolve: (gg) => {
            had(gg, 'senegal-riders');
            gg.noteDeed('passenger.aided', { target: 'jolof', place: 'arguim', magnitude: 0.5, note: 'Took a Wolof lord’s kinsman and one servant from Arguim toward Lisbon, with no letter, to be heard by the King.' });
            return 'He comes aboard with the bundle of hides, which he does not unwrap. His servant looks at the sea as if it owed him money.';
          },
        },
        {
          label: 'Tell the factor what the young man says, and leave it to him',
          detail: 'It is the factor’s trade and his river. He will do as the Casa says.',
          resolve: (gg) => {
            had(gg, 'senegal-riders');
            gg.noteDeed('crown.reported', { target: 'portugal', place: 'arguim', magnitude: 0.3, note: 'Told the factor at Arguim what a Wolof lord’s kinsman said of the riders on the river, and left it to him.' });
            return 'The factor writes it down in the column for rumours. The young man waits at the gate until the evening, and then is not there.';
          },
        },
        {
          label: 'Say the ship cannot carry a man with no letter, and give him water for the road',
          detail: 'It is the careful answer. It is also a refusal.',
          resolve: (gg) => {
            had(gg, 'senegal-riders');
            gg.noteDeed('refusal.honest', { target: 'jolof', place: 'arguim', magnitude: 0.3, note: 'Told a Wolof lord’s kinsman that the ship could not carry a man with no letter, and gave him water for the road.' });
            return 'He drinks standing, and thanks you in a courteous Arabic, and goes back up the road in the heat.';
          },
        },
      ]);
  },
};

export const FRONT_SCENES: TrafficScene[] = [
  courtOldKing, courtNewKing, courtFavourite, courtEdictWarn, courtFunchal, courtEaster,
  crescentVenetian, crescentPilot, crescentConvoy, crescentLeague,
  goldGarrison, goldFever, goldAkan, goldShut,
  claimCastile, claimCanaries, claimPillar, claimInterloper,
  kongoSons, senegalRiders,
];

export const FRONT_SCENE_BY_ID = new Map(FRONT_SCENES.map((s) => [s.id, s]));

/** Whether a scene may be offered now, given what has been had, its wait and its prerequisites. */
export function frontSceneOffered(g: Game, sc: TrafficScene, port: string): boolean {
  const st: PowersState = g.powers;
  if (!sc.ports.includes(port)) return false;
  const doneAt = st.seen[sc.id];
  if (doneAt !== undefined && !sc.repeatDays) return false;
  if (doneAt !== undefined && sc.repeatDays && g.clock.t - doneAt < sc.repeatDays * DAY) return false;
  const laterAt = st.seen[`later:${sc.id}`];
  if (laterAt !== undefined && g.clock.t - laterAt < (sc.repeatDays ?? 1) * DAY) return false;
  // A scene that waits on another is held only while the other can still be had; if its Front has moved on, it is not required.
  if (sc.after && !sc.after.every((a) => st.seen[a] !== undefined || !afterStillPossible(g, a))) return false;
  return sc.needs(g, st);
}

/** The earlier scene of a chain is a hard prerequisite only while it could still be offered; a Front that has moved on does not hold the later one back. */
function afterStillPossible(g: Game, id: string): boolean {
  const sc = FRONT_SCENE_BY_ID.get(id);
  if (!sc) return true;
  return sc.needs(g, g.powers);
}

/** The next Front scene offered at this port, if any, not yet marked put (the storylet engine's source). */
export function peekFrontScene(g: Game, port: string | null): TrafficScene | null {
  if (!port) return null;
  const st = g.powers;
  for (const sc of FRONT_SCENES) {
    if (!sc.ports.includes(port)) continue;
    const id = sid(sc.id);
    if (st.seen[`fired:${sc.id}`] !== undefined) {
      if (g.pendingEvent?.id === id || g.pendingScenes.some((x) => x.id === id)) continue;
      delete st.seen[`fired:${sc.id}`];
    }
    if (!frontSceneOffered(g, sc, port)) continue;
    return sc;
  }
  return null;
}

/** Build a scene and mark it put; it is had when answered. */
export function putFrontScene(g: Game, sc: TrafficScene): SeaEvent {
  g.powers.seen[`fired:${sc.id}`] = g.clock.t;
  return sc.build(g, g.powers);
}

/** The next Front scene due at this port, if any. Marks it put; it is had when answered. */
export function dueFrontScene(g: Game, port: string | null): SeaEvent | null {
  const sc = peekFrontScene(g, port);
  return sc ? putFrontScene(g, sc) : null;
}
