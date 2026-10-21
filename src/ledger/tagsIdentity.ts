import type { TagDef } from './tags';

/**
 * The Ledger tags the captain's identity adds (BUILD_PLAN D5): treaty clauses, patrons, titles.
 *
 * A clause is a Ledger entry with a term: `clause.granted` carries `data` {clause, id, until, poison}
 * and every later fate of it (`lapsed`, `revoked`, `renewed`) carries the same id. Nothing else stores a
 * clause. `identity/clauses.ts` reads these; the Book prints them.
 */
const d = (x: TagDef): TagDef => x;
const B = ['book'];

export const IDENTITY_TAGS = {
  'clause.granted': d({
    doc: 'A court granted a named clause for a term of years: free dues, berth and watering, an exclusive buyer, a fortress licence, a pilot loan, a recognised cartaz, men for hire.',
    did: '{target} has granted it, for a term. It is written in the Book with the day it ends.',
    tone: 0.7, readers: B, planned: ['powers', 'titles'],
  }),
  'clause.poisoned': d({
    doc: 'A court granted a clause with strings on it: a shorter term, half the benefit, and it goes at the first offence.',
    did: '{target} granted it, with a catch. The catch is in the Book beside it.',
    tone: 0.1, readers: B,
  }),
  'clause.refused': d({
    doc: 'A court was asked for a clause and refused it, by the gifts, the mood of the court, or the piece played.',
    did: '{target} said no to it. Nothing is lost but the asking.',
    tone: -0.1, readers: B, silent: true,
  }),
  'clause.renewed': d({
    doc: 'A clause was renewed before it ran out, for a further term, at a price in gifts.',
    did: '{target} has renewed it. The new term runs from today.',
    tone: 0.5, readers: B,
  }),
  'clause.lapsed': d({
    doc: 'A clause ran out its term.',
    did: 'A grant of {target} has run out. Asking again costs gifts.',
    tone: -0.1, readers: B,
  }),
  'clause.revoked': d({
    doc: 'A court took a clause back after too many offences since it was granted.',
    did: '{target} has taken a grant back, and says why.',
    tone: -0.6, readers: B, planned: ['powers'],
  }),
  'patron.chosen': d({
    doc: 'Chose the patron of record for the voyage: the Crown, the Order of Christ and the Church, or the Rua Nova money.',
    did: 'You sail for {target} this voyage. Their orders are on the table and their cut comes off the pay.',
    tone: 0, readers: B, silent: true,
  }),
  'patron.moved': d({
    doc: 'Changed patron of record after word came that the old one was falling, and before the fall.',
    did: 'You left {target} before it fell. The others noticed who was quick.',
    tone: 0.3, readers: B,
  }),
  'patron.fell': d({
    doc: 'The patron of record fell (a favourite, a king, an edict) while the captain was still its client.',
    did: '{target} has fallen, and its clients with it: favour, credit and orders are gone for a time.',
    tone: -0.5, readers: B,
  }),
  'patron.betrayed': d({
    doc: 'Did, under a patron’s flag, a thing that patron cannot forgive.',
    did: '{target} will not forget it, and keeps a note.',
    tone: -0.7, readers: B, planned: ['titles'],
  }),
  'patron.ruined': d({
    doc: 'A betrayed patron turned on the captain: the credit called, the funds clawed back, the Crown’s door shut.',
    did: '{target} has used what it holds over you.',
    tone: -0.9, readers: B,
  }),
  'order.taken': d({
    doc: 'Took a generated order from a patron.',
    did: '{target} has given you an order. The pay is net of its cut.',
    tone: 0.1, readers: B, silent: true,
  }),
  'title.earned': d({
    doc: 'The Ledger now says what the captain is: a title the world will call him by, once word has run ahead.',
    did: 'They will call you {target}. Word of it goes down the road, and changes in the telling.',
    tone: 0.4, readers: B,
  }),
  'title.worn': d({
    doc: 'Put a title on: one of three the captain wears, each a door and a wall.',
    did: 'You wear {target}.',
    tone: 0, readers: B, silent: true,
  }),
  'calling.chosen': d({
    doc: 'At the end of the first act, chose a Calling: Pilot, Factor, Master-builder or Master. One verb unlocked, no cost.',
    did: 'You are {target} now, and a thing you could not do before you can.',
    tone: 0.3, readers: B,
  }),
  'calling.used': d({
    doc: 'Used the verb a Calling unlocked (a night entry, a House without a court, a hull laid down, a seat filled).',
    did: 'Your Calling did what an ordinary captain could not.',
    tone: 0.1, readers: B, silent: true,
  }),
} as const satisfies Record<string, TagDef>;
