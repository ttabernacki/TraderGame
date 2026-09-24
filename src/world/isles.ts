import { LANDMASSES } from './coastlines';

/**
 * The land that was out there and on nobody's chart.
 *
 * Every island in this list is real, stands where the coastline file puts it,
 * and was found by a Portuguese ship within twenty-five years of 1482 — almost
 * always by accident, on the wide swing out into the South Atlantic that the
 * Cape route forced on every ship after Dias. Ascension and St Helena were
 * found by João da Nova on consecutive voyages; Tristão da Cunha named his for
 * himself; the Mascarenes were a line in Arab rutters that nobody in Lisbon had
 * read. None of them is on the Casa's sheet when the game begins, and whoever
 * raises one first gives it its name.
 *
 * What each one *offers* is the ground truth and never changes: Ascension has
 * no water at all and never did, St Helena has enough for a fleet. The shore
 * parties read it from here (see game/shore), so a captain who lands on
 * Ascension with empty casks finds out what the men who named it found out.
 */
export interface OceanIsle {
  id: string;
  /** Landmass id in coastlines.ts. */
  land: string;
  /** Where to point, for rumours and the chart. */
  lat: number;
  lon: number;
  /** What the Portuguese came to call it. */
  suggested: string;
  /** Why, which is the master's argument for it. */
  because: string;
  /** When history found it, and who. Before this year it is anybody's. */
  year: number;
  by: string;
  /** 0-1 ground truth: water, food that keeps the scurvy off, timber. */
  water: number;
  food: number;
  wood: number;
  /** Renown for entering it. */
  value: number;
  /** What the masthead sees. */
  sighting: string;
  /** What the boats find, the first time. */
  landing: string;
  /** Shore description for the landing party. */
  shore: string;
}

export const ISLES: OceanIsle[] = [
  {
    id: 'ascension', land: 'ascension', lat: -7.95, lon: -14.37,
    suggested: 'Ilha da Ascensão', because: 'it being raised on Ascension Day, as it was the first time',
    year: 1501, by: 'João da Nova',
    water: 0.03, food: 0.55, wood: 0.02, value: 45,
    sighting: 'A dark cone standing up out of the sea with a white cap of cloud on it that has not '
      + 'moved all morning, and around it more birds than anybody aboard has ever seen in one place.',
    landing: 'Cinders. The whole island is cinders and red rock, and there is not a spring or a tree '
      + 'on it. But the beaches are covered in turtles as big as a cart, and the birds are so tame '
      + 'the men knock them down with sticks. Meat for a month, and not a drop to drink.',
    shore: 'Black cinder and red rock, and nothing growing on it. Turtles on every beach and birds '
      + 'in clouds.',
  },
  {
    id: 'santa-helena', land: 'santa-helena', lat: -15.96, lon: -5.72,
    suggested: 'Ilha de Santa Helena', because: 'it being the feast of Saint Helena, mother of Constantine',
    year: 1502, by: 'João da Nova',
    water: 0.95, food: 0.6, wood: 0.7, value: 70,
    sighting: 'A great brown wall of cliff, alone in the ocean, with green showing in the clefts of '
      + 'it and water falling white down one of them.',
    landing: 'A valley running down to a beach, and a stream in it you could fill a fleet from. '
      + 'Wild fruit, fish in the rocks, timber on the heights, and not a living soul. Every ship '
      + 'that comes home from the Indies will want to stop here, and none of them knows it exists.',
    shore: 'Sheer cliffs, and a green valley running down to the one beach, with a stream in it.',
  },
  {
    id: 'trindade', land: 'trindade', lat: -20.51, lon: -29.33,
    suggested: 'Ilha da Trindade', because: 'for the Holy Trinity, the island and the two rocks off it',
    year: 1502, by: 'Estêvão da Gama',
    water: 0.3, food: 0.35, wood: 0.25, value: 30,
    sighting: 'A steep rock with spires on it, and two smaller rocks standing off to the east of it '
      + 'like attendants.',
    landing: 'A hard place to land and not worth the landing: a trickle of water off the rock, a '
      + 'few stunted trees, birds, and the surf trying to take the boat the whole time.',
    shore: 'Spires of rock and a beach of broken shell with surf on it all day.',
  },
  {
    id: 'tristao', land: 'tristao', lat: -37.11, lon: -12.29,
    suggested: 'Ilha de Tristão', because: 'after the captain who raised it, which the Casa will think vain',
    year: 1506, by: 'Tristão da Cunha',
    water: 0.8, food: 0.5, wood: 0.15, value: 55,
    sighting: 'A great single mountain coming up out of the grey water of the forties, its top lost '
      + 'in cloud, and seals barking on the rocks at its foot.',
    landing: 'There is water, cold and good, off the mountain. Seals and sea-birds by the thousand '
      + 'and nothing else. The landing is on boulders in a swell that never stops.',
    shore: 'A wall of mountain straight out of the sea, with seals on every rock.',
  },
  {
    id: 'fernando', land: 'fernando', lat: -3.85, lon: -32.42,
    suggested: 'Ilha de São João', because: 'for Saint John, whose feast it was',
    year: 1503, by: 'Fernão de Loronha’s ship',
    water: 0.55, food: 0.55, wood: 0.6, value: 35,
    sighting: 'A needle of rock standing up out of a green island, far out on the western side of '
      + 'the ocean where no land ought to be.',
    landing: 'Trees, a little water in the rocks, birds, and turtles. A good stopping place for a '
      + 'ship that has swung very wide on the volta.',
    shore: 'Green, with a spire of rock standing over it, and turtles on the beaches.',
  },
  {
    id: 'mauricia', land: 'mauricia', lat: -20.28, lon: 57.55,
    suggested: 'Ilha do Cirne', because: 'for the swan — the great grey bird on the beach that cannot fly',
    year: 1507, by: 'Diogo Fernandes Pereira',
    water: 0.9, food: 0.9, wood: 0.95, value: 55,
    sighting: 'A green island ringed with a reef and white surf, mountains in the middle of it, and '
      + 'nobody’s smoke going up anywhere.',
    landing: 'Streams, ebony, turtles, and a fat grey bird the size of a swan that walks up to the '
      + 'men and cannot fly away. There is food here for any ship that ever comes.',
    shore: 'Reef and lagoon, then forest to the tops of the mountains, and no people.',
  },
  {
    id: 'reuniao', land: 'reuniao', lat: -21.11, lon: 55.53,
    suggested: 'Ilha de Santa Apolónia', because: 'for Saint Apollonia, whose day it was',
    year: 1507, by: 'Diogo Fernandes Pereira',
    water: 0.85, food: 0.6, wood: 0.8, value: 40,
    sighting: 'A huge mountain with smoke going up from the top of it that is not anybody’s '
      + 'fire, and cloud piled on its shoulders.',
    landing: 'Rivers coming down black sand, forest, and no anchorage worth the name. Water and '
      + 'wood for the taking, if the boats can live in the surf.',
    shore: 'Black sand and a burning mountain behind it.',
  },
  {
    id: 'madagascar', land: 'madagascar', lat: -19, lon: 47,
    suggested: 'Ilha de São Lourenço', because: 'it being Saint Lawrence’s day',
    year: 1500, by: 'Diogo Dias',
    water: 0.8, food: 0.7, wood: 0.9, value: 80,
    sighting: 'Land, and a great deal of it, running out of sight both ways: high green country, '
      + 'and smoke inland.',
    landing: 'People, cattle, rivers, forest. Whatever it is, it is very large, and the men on the '
      + 'beach have never seen a ship like this one.',
    shore: 'High green country behind a long surf beach, and smoke inland.',
  },
  {
    id: 'brasil', land: 'brasil', lat: -16.4, lon: -39,
    suggested: 'Terra de Vera Cruz', because: 'for the True Cross, it being so large that it must be a continent and not an island',
    year: 1500, by: 'Pedro Álvares Cabral',
    water: 0.95, food: 0.8, wood: 1, value: 120,
    sighting: 'A great round mountain, and then a long coast of forest under it running north and '
      + 'south out of sight, a very long way to the west of where Africa is.',
    landing: 'Forest to the water’s edge, rivers, parrots, and people on the beach painted red '
      + 'and black, who come down to look at the boats without the least fear. It is very large. '
      + 'It may be the thing the Castilians are looking for.',
    shore: 'Forest down to the sand, rivers, and people watching from the trees.',
  },
];

/**
 * Islands that were on the charts and were not in the sea.
 *
 * Antillia and its Seven Cities were drawn west of the Azores on every chart in
 * Europe, and Portuguese captains were given letters patent to go and find them
 * — Fernão Dulmo had one in 1486. São Brandão was seen from the Canaries every
 * few years until well after 1700. They are the price of a rumour: a captain
 * who goes looking spends water on an empty sea, and one who has looked and
 * found nothing can say so, which is also worth something.
 */
export interface Phantom {
  id: string;
  name: string;
  lat: number;
  lon: number;
  tale: string;
}

export const PHANTOMS: Phantom[] = [
  {
    id: 'antilia', name: 'Antília, of the Seven Cities', lat: 34.5, lon: -41.5,
    tale: 'seven Portuguese bishops sailed there fleeing the Moors, and built a city each, and '
      + 'their people are there yet, waiting to be found',
  },
  {
    id: 'sao-brandao', name: 'Ilha de São Brandão', lat: 28.2, lon: -22.8,
    tale: 'it is seen from La Palma on clear evenings, and every ship that goes after it loses it '
      + 'in the haze',
  },
  {
    id: 'hy-brasil', name: 'Ilha do Brasil', lat: 51.6, lon: -16.2,
    tale: 'it lies in a fog that lifts one day in seven years, west of Ireland, and the Bristol men '
      + 'have gone looking for it more than once',
  },
];

/** Landmass index of an isle, for matching what the lookout sees. */
const LAND_INDEX = new Map<string, number>();
LANDMASSES.forEach((l, i) => LAND_INDEX.set(l.id, i));

export function landIndexOf(isle: OceanIsle): number {
  return LAND_INDEX.get(isle.land) ?? -1;
}

export function isleByLand(landIndex: number): OceanIsle | null {
  const id = LANDMASSES[landIndex]?.id;
  return ISLES.find((i) => i.land === id) ?? null;
}

/**
 * Islands the Casa had on its sheet before 1482: the Gulf of Guinea group,
 * found by Fernão Gomes's captains in 1471-73, which the chart's seeded boxes
 * stop short of.
 */
export const KNOWN_IN_1482 = ['principe', 'sao-tome', 'annobon'];

export function landIndexById(id: string): number {
  return LAND_INDEX.get(id) ?? -1;
}

/**
 * Which ports hear of which land.
 *
 * Quay talk runs along the routes people actually sailed: Azores and Canary men
 * believed in the western islands and chased them; Arab and Gujarati pilots had
 * the Comoros and the Mascarenes in their rutters; nobody at all knew what lay
 * in the empty middle of the South Atlantic. `sigma` is how far wrong the
 * teller is likely to be, in degrees.
 */
export interface RumourSource {
  ports: string[];
  tells: string[];
  sigma: number;
  who: string;
}

export const RUMOUR_SOURCES: RumourSource[] = [
  { ports: ['angra', 'ponta-delgada', 'funchal'], tells: ['antilia', 'hy-brasil', 'sao-brandao', 'brasil'],
    sigma: 3, who: 'the island pilots' },
  { ports: ['las-palmas'], tells: ['sao-brandao', 'antilia'], sigma: 1.5, who: 'the Canary fishermen' },
  { ports: ['lisboa', 'porto', 'lagos'], tells: ['antilia', 'hy-brasil', 'brasil', 'sao-brandao'],
    sigma: 4, who: 'men on the quay' },
  { ports: ['ribeira-grande'], tells: ['brasil', 'fernando'], sigma: 3.5, who: 'a ship blown west off the islands' },
  { ports: ['sao-tome-porto', 'mina'], tells: ['ascension', 'santa-helena'], sigma: 4.5,
    who: 'a caravel that ran wide on the way home' },
  { ports: ['sofala', 'mocambique', 'quiloa', 'mombaca', 'melinde'], tells: ['madagascar', 'mauricia', 'reuniao'],
    sigma: 1.2, who: 'the Moorish pilots' },
  { ports: ['calecute', 'cananor', 'cochim', 'goa', 'ormuz', 'mascate'], tells: ['mauricia', 'reuniao'],
    sigma: 1.6, who: 'an Arab pilot with a rutter older than Portugal' },
];
