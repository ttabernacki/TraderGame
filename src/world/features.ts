import { NM, haversine, type LatLon } from '../core/math';

/**
 * The headlands and river mouths a ship discovers by sailing past them.
 *
 * The game had two buttons — "Name this place" on the chart table and a padrão
 * key on the deck bar — and both worked anywhere at all. You could stop in a
 * bight of featureless sand, press one, and have a cape named after you; you
 * could land a limestone pillar on a beach nobody would ever see again. Neither
 * had a *place* in it, so neither meant anything, and the padrão in particular
 * was exactly backwards from the thing it is named after.
 *
 * What a padrão was: a carved limestone pillar, cut in Lisbon, with the arms of
 * Portugal, the king's name and the date on it, landed by boat and set on high
 * ground **where the next ship down the coast would see it**. That is the whole
 * point of it. It is a signpost and a claim in one, and it only works on
 * something a ship can identify from seaward — a headland, or the mouth of a
 * river. Diogo Cão put his at the mouth of the Congo, at Cabo de Santa Maria
 * and at Cabo da Cruz, and two of them are in a Lisbon museum today because
 * they were still standing four hundred years later.
 *
 * So these are the places. Every one is real, at its real position, and each
 * was checked against this game's own simplified coastline before it was
 * written down: there is navigable water within sight of all of them, none sits
 * on top of a port or a route landmark, and the two that did were dropped.
 *
 * A feature has no name until the captain gives it one. `suggested` is what the
 * Portuguese actually called it — offered as what the master proposes, because
 * that is how it happened: somebody says the headland is white, somebody else
 * says it is the feast of Saint Catherine, and the captain decides and it is
 * on every chart for five hundred years.
 */

export type FeatureKind = 'cape' | 'river';

export interface CoastFeature {
  id: string;
  kind: FeatureKind;
  lat: number;
  lon: number;
  /** How close she must come for the masthead to make it out for what it is. */
  radiusNm: number;
  /** Renown for entering it on the padrão real. */
  value: number;
  /** What the Portuguese named it, offered as the master's suggestion. */
  suggested: string;
  /** Why they named it that, which is the master's argument for it. */
  because: string;
  /** What the lookout sees, which is the whole of the scene. */
  sighting: string;
  /** True for coast that was already on a Portuguese chart in 1482. */
  known?: boolean;
}

export const FEATURES: CoastFeature[] = [
  // --- The Saharan coast, already run by 1482 ------------------------------
  {
    id: 'ouro', kind: 'river', lat: 23.72, lon: -15.94, radiusNm: 18, value: 12,
    suggested: 'Rio de Ouro', because: 'because the first men into it came out saying there was gold up it, which there was not',
    known: true,
    sighting: 'A long inlet running back into the desert behind a spit of sand, and no water in it '
      + 'that anybody would drink.\n\nThe pilot says this is the Rio de Ouro, which is a joke '
      + 'sixty years old: Afonso Gonçalves Baldaia came in here in 1436 looking for the gold '
      + 'river and found a dry gully and some nets. The name stuck anyway, because a chart wants '
      + 'a name more than it wants an accurate one.',
  },
  {
    id: 'cabo-branco', kind: 'cape', lat: 20.77, lon: -17.05, radiusNm: 16, value: 14,
    suggested: 'Cabo Branco', because: 'because the cliff is the colour of bone and can be seen for twenty miles',
    known: true,
    sighting: 'A low white headland, chalk-coloured and flat-topped, standing out of a brown coast '
      + 'and visible a very long way off.\n\nIt is the best seamark between Bojador and the '
      + 'Senegal and every pilot on this coast steers by it. Nuno Tristão was the first '
      + 'Portuguese to round it, forty years ago, and the men who did it thought they were at '
      + 'the end of the world.',
  },
  {
    id: 'senegal', kind: 'river', lat: 15.93, lon: -16.51, radiusNm: 20, value: 18,
    suggested: 'Rio de Çanagá', because: 'after the kingdom the people on the bank say it runs up to',
    known: true,
    sighting: 'The sea has gone the colour of weak tea and it tastes fresh over the side four '
      + 'leagues out. Somewhere behind that bar there is a river coming down big enough to push '
      + 'the ocean back.\n\nAnd the coast has changed. For eight hundred miles it has been sand '
      + 'and nothing; here there are trees, and smoke, and people who come out in canoes without '
      + 'being asked. The desert ends at this river and everybody aboard can see that it does.',
  },
  {
    id: 'rio-grande', kind: 'river', lat: 11.70, lon: -15.90, radiusNm: 20, value: 20,
    suggested: 'Rio Grande', because: 'because nobody aboard can find where it begins or where it ends',
    known: true,
    sighting: 'Not a river mouth so much as a drowned country: islands, channels between them, '
      + 'mangrove standing in the water, and a tide that runs through the whole of it at four '
      + 'knots.\n\nThe pilot has been trying to draw it for two hours and has given up twice. '
      + 'There is no single mouth to put on a chart. There are about forty.',
  },
  {
    id: 'verga', kind: 'cape', lat: 10.17, lon: -14.37, radiusNm: 15, value: 18,
    suggested: 'Cabo Verga', because: 'for the single bare spur of rock that stands off it like a yard-arm',
    sighting: 'A green point with one bare grey spur running out of it into the sea, and behind it '
      + 'hills going up in steps until they are lost in cloud.\n\nThis is a wet coast. After the '
      + 'Sahara it is almost indecent: the rain comes down in a solid grey wall for an hour and '
      + 'stops, and the whole ship is filling the casks off the awnings while it does.',
  },
  {
    id: 'palmas', kind: 'cape', lat: 4.37, lon: -7.72, radiusNm: 18, value: 26,
    suggested: 'Cabo das Palmas', because: 'for the palms standing along the top of it in a row, like a colonnade',
    sighting: 'A low green cape with palms along the whole crest of it, and the coast on either '
      + 'side running away at an angle that means something.\n\nThe pilot has the board out. Down '
      + 'to here the coast has run south-east for two thousand miles. From here it runs *east*. '
      + 'If that holds, Africa is not endless after all, and the way round the bottom of it is a '
      + 'question about how far east this goes before it turns south again.',
  },
  {
    id: 'volta', kind: 'river', lat: 5.77, lon: 0.68, radiusNm: 16, value: 22,
    suggested: 'Rio da Volta', because: 'because the surf on the bar turns a boat end for end and sends it back',
    sighting: 'A river coming out through a bar with a surf on it that is running white from one '
      + 'side of the entrance to the other, and a current setting hard along the coast to the '
      + 'east.\n\nThe boat was sent to look and came back without going in. The master will not '
      + 'say it is impossible. He will say that he is not going to be the one to try it, which '
      + 'is a different thing and means the same.',
  },
  {
    id: 'santa-catarina', kind: 'cape', lat: -1.87, lon: 9.35, radiusNm: 16, value: 30,
    suggested: 'Cabo de Santa Catarina', because: 'for the saint on whose day it was raised',
    sighting: 'A flat green point with a bight behind it, and the sun standing almost straight up '
      + 'overhead at noon.\n\nThe pilot has taken it and put the quadrant down without saying '
      + 'anything for a while. She is south of the line. The pole star is gone out of the sky '
      + 'astern and everything he knows how to do he now has to do with the sun and a table half '
      + 'the pilots in Lisbon have never seen.',
  },
  {
    id: 'lopo-goncalves', kind: 'cape', lat: -0.62, lon: 8.70, radiusNm: 15, value: 28,
    suggested: 'Cabo de Lopo Gonçalves', because: 'after the man who first laid eyes on it, which is the other way a coast gets named',
    sighting: 'A low cape of red earth and mangrove with a heavy swell breaking on it, and behind '
      + 'the point the coast at last turns south.\n\nFor a thousand miles she has been running '
      + 'east along the underside of the continent with the men quietly wondering whether it goes '
      + 'east for ever. It does not. It turns here, and everybody on deck understands what that '
      + 'means without being told.',
  },
  {
    id: 'santa-maria', kind: 'cape', lat: -13.87, lon: 12.50, radiusNm: 22, value: 42,
    suggested: 'Cabo de Santa Maria', because: 'for Our Lady, on whose day the boats went in',
    sighting: 'A high bluff of red rock falling straight into the sea, with a white line of surf '
      + 'at the foot of it and nothing green anywhere on it.\n\nThe country behind has gone dry '
      + 'again — not Sahara, but close enough that the men who remember Arguim are making the '
      + 'comparison. The current sets north hard along this shore and the water over the side is '
      + 'cold, which nobody can account for at thirteen degrees south.',
  },
  {
    id: 'cabo-negro', kind: 'cape', lat: -15.67, lon: 11.87, radiusNm: 18, value: 46,
    suggested: 'Cabo Negro', because: 'for the black rock of it, which is like nothing else on this coast',
    sighting: 'A headland of black rock, sheer, with the sea working white at the base of it and a '
      + 'fog bank standing off it that has not moved all morning.\n\nThere is no water here, '
      + 'there is nobody here, and the pilot says the chart he was given in Lisbon simply stops '
      + 'about two hundred miles north of this. From here on the sheet is whatever you draw on '
      + 'it yourself.',
  },
  {
    id: 'cabo-cruz', kind: 'cape', lat: -21.78, lon: 13.95, radiusNm: 20, value: 60,
    suggested: 'Cabo da Cruz', because: 'for the cross that is to stand on it',
    sighting: 'A low dark point on a coast of shifting fog, with a colony of seals on the rocks '
      + 'making a noise like a crowd in a market, and desert behind it running back further than '
      + 'anyone can see.\n\nNo ship has been here. The pilot is certain of it in the way a man is '
      + 'certain of something he has been hoping for: there is no line on any sheet in Lisbon '
      + 'that corresponds to this, and the rutters he copied from at the Casa stop a long way '
      + 'north.',
  },
  {
    id: 'infante', kind: 'river', lat: -33.50, lon: 27.13, radiusNm: 24, value: 70,
    suggested: 'Rio do Infante', because: 'for the Infante Dom Henrique, who began the whole of this and never saw any of it',
    sighting: 'A river coming down through green hills into a coast that runs away to the '
      + 'north-east, and the water alongside is warm again after weeks of cold.\n\nThis is the '
      + 'far side. Whatever the shape of Africa is, she is round it and going up the other edge: '
      + 'the coast is on her *left* hand now and the Indian Ocean is under her. Bartolomeu Dias '
      + 'got this far and his people made him turn back, and he wept about it, and he was right '
      + 'to.',
  },
  {
    id: 'correntes', kind: 'cape', lat: -24.10, lon: 35.50, radiusNm: 20, value: 48,
    suggested: 'Cabo das Correntes', because: 'for the current, which runs past it faster than most ships sail',
    sighting: 'A low sandy cape with nothing much on it, and a current running south past it at '
      + 'three and four knots that is doing more to the ship than the wind is.\n\nThe log says '
      + 'one thing and the land says another and the pilot has been arguing with his own board '
      + 'for a day and a half. A ship working north against this had better keep inshore of it, '
      + 'and inshore of it there is very little water.',
  },
  {
    id: 'bons-sinais', kind: 'river', lat: -17.88, lon: 36.90, radiusNm: 20, value: 55,
    suggested: 'Rio dos Bons Sinais', because: 'for the good signs found in it: men in cotton, and a language the interpreter half knows',
    sighting: 'A wide brown river mouth with dhows in it — sewn hulls, no nails in them anywhere, '
      + 'lateen sails cut differently from ours.\n\nThe men on the bank wear cotton cloth and one '
      + 'of them has a cap embroidered with silk, and when the interpreter tries Arabic on them '
      + 'somebody answers. This is the good sign. It means the trade of the Indian Ocean reaches '
      + 'down this far, and that means it can be reached from here.',
  },
  {
    id: 'delgado', kind: 'cape', lat: -10.68, lon: 40.63, radiusNm: 18, value: 44,
    suggested: 'Cabo Delgado', because: 'because the point of it is so thin that from seaward it is barely there at all',
    sighting: 'A thin low finger of sand and palm running out into the sea, with reef showing on '
      + 'both sides of it and green water over coral for a mile out.\n\nThe lead is going '
      + 'constantly and getting nothing anybody likes. This is a coast to be careful on: it is '
      + 'not the land that takes ships here, it is what lies half a fathom under the water in '
      + 'front of it.',
  },
  {
    id: 'guardafui', kind: 'cape', lat: 11.82, lon: 51.27, radiusNm: 22, value: 58,
    suggested: 'Cabo de Guardafui', because: 'from the Italian — guarda fui, look out — which is what every pilot in this sea calls it',
    sighting: 'A bare brown headland at the corner of the continent, with the monsoon coming '
      + 'round it hard enough to lay her over and a sea running that has no business being where '
      + 'two currents meet.\n\nEvery ship going up to the Red Sea turns this corner and every '
      + 'ship coming down turns it the other way, and the whole trade of Egypt and Venice has '
      + 'been passing this rock twice a year for a thousand years without a single European ever '
      + 'standing on it.',
  },
  {
    id: 'comorim', kind: 'cape', lat: 8.08, lon: 77.55, radiusNm: 20, value: 65,
    suggested: 'Cabo Comorim', because: 'after the goddess whose temple stands on the point, which the pilot pronounces four ways',
    sighting: 'The southern end of India: a low point with a temple on it and three seas meeting '
      + 'off it, each one a different colour and all of them confused.\n\nThe pilot taken aboard '
      + 'at Malindi says that east of this the monsoon works differently and the coast is another '
      + 'country altogether. He says it the way a man says a thing he has known since he was a '
      + 'boy, which is what it is, and which is what none of us have.',
  },
];

/** The feature she is up with, if any. */
export function featureNear(at: LatLon): CoastFeature | null {
  let best: CoastFeature | null = null;
  let bestNm = Infinity;
  for (const f of FEATURES) {
    const d = haversine(at, { lat: f.lat, lon: f.lon }) / NM;
    if (d <= f.radiusNm && d < bestNm) { best = f; bestNm = d; }
  }
  return best;
}
