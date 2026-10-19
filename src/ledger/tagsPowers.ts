import type { TagDef } from './tags';

/**
 * The Ledger tags the Powers engine and the Traffic add (BUILD_PLAN C2).
 *
 * Kept in their own file so that the vocabulary the Powers read is easy to see; `tags.ts` spreads
 * them into `TAGS`. Each is written by a scene (progression/trafficScenes) or by the rumour mill,
 * and each is read by the Book's Life page; `passenger.died` is also read by the muster roll.
 *
 * Voice: the ship's. Counts and names, no adjectives. "Parcel" is the clerks' word and stays in the
 * clerks' mouths; these lines say people.
 */
export const POWERS_TAGS = {
  'traffic.carried': {
    doc: 'Took people aboard to be landed and sold at the other end, on a factor’s word. The count is in the note.',
    did: 'They are in the ship’s book by number. The trade at both ends runs a little easier for it.',
    tone: -0.6, readers: ['book'], planned: ['powers', 'company', 'titles'],
  },
  'traffic.refused': {
    doc: 'Would not take people aboard for sale, and said so at a cost to the ship.',
    did: 'The factor will find another ship. It cost you his goodwill and the freight, and it moved nothing else.',
    tone: 0.4, readers: ['book'], planned: ['powers', 'company'],
  },
  'hearing.contested': {
    doc: 'Put a question about the trade to a court or a captain of the King’s, in the open, against the factor’s interest.',
    did: 'It was heard and entered. The Casa has a copy, and the Casa did not ask for one.',
    tone: 0.6, readers: ['book'], planned: ['powers', 'company', 'titles'],
  },
  'person.redeemed': {
    doc: 'Bought a named person out of the trade and set them free, at a place of their choosing.',
    did: 'One person is free, and their name is in the Book. It matters to them and to the Book, and not to the trade.',
    tone: 0.7, readers: ['book'], planned: ['company', 'titles', 'epilogue'],
  },
  'practice.changed': {
    doc: 'Changed how the trade is done at one named place, once, at real cost.',
    did: 'At {target} it is done differently now, and the people of that coast know who made it so.',
    tone: 0.9, readers: ['book'], planned: ['powers', 'titles'],
  },
  'passenger.died': {
    doc: 'People carried aboard for sale died on the passage. Names in actors where known; the count in magnitude.',
    did: '{n} of those carried died on the passage; they are in the muster.',
    tone: -0.5, readers: ['book', 'epilogue.muster'], planned: ['powers', 'company'],
  },
} as const satisfies Record<string, TagDef>;
