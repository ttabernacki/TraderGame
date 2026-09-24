/**
 * The states of the coasts, and the men who rule them.
 *
 * Diplomacy was a conversation with a port. But a port is not who decides:
 * a Kongo river mouth answers to the Manikongo at Mbanza Kongo, Sofala and
 * Moçambique pay tribute to the sultan of Kilwa, and Melinde will do anything
 * to spite Mombaça. This is the political map — who rules what, what they
 * want, what they fear, who in their court has to be satisfied, and who they
 * are at war with — so that what you do at one harbour is done to a state,
 * and the state has neighbours.
 */

export type Temper = 'proud' | 'pious' | 'mercantile' | 'wary' | 'warlike';
export type Cares = 'trade' | 'faith' | 'war' | 'custom';
export type Network = 'maghreb' | 'guinea' | 'kongo' | 'cape' | 'brazil' | 'swahili' | 'arabia' | 'india' | 'east';

export interface FactionDef {
  id: string;
  name: string;
  cares: Cares;
  /** Share of the court's voice. */
  weight: number;
}

export interface Custom {
  /** The situation, second person. */
  scene: string;
  options: [string, string, string];
  right: number;
  /** What somebody who knows these people would whisper. */
  hint: string;
}

export interface PolityDef {
  id: string;
  name: string;
  people: string;
  ports: string[];
  /** Where the ruler sits, or the port nearest him. */
  seat: string;
  /** What the ruler is called. */
  title: string;
  /** Rulers in order, as the years pass or as succession goes. */
  rulers: string[];
  temper: Temper;
  /** What the ruler wants, as good ids. */
  wants: string[];
  factions: FactionDef[];
  network: Network;
  allies: string[];
  feuds: string[];
  customs: Custom[];
  blurb: string;
}

// Courts, by kind. Each has the same voices in different proportions.
const ISLAMIC_PORT = (merchants = 0.5): FactionDef[] => [
  { id: 'merchants', name: 'The merchants', cares: 'trade', weight: merchants },
  { id: 'ulema', name: 'The qadi and the imams', cares: 'faith', weight: (1 - merchants) * 0.6 },
  { id: 'guard', name: 'The sultan’s guard', cares: 'war', weight: (1 - merchants) * 0.4 },
];
const AFRICAN_KINGDOM = (war = 0.25): FactionDef[] => [
  { id: 'elders', name: 'The elders of the court', cares: 'custom', weight: 0.45 - war / 2 },
  { id: 'traders', name: 'The traders', cares: 'trade', weight: 0.55 - war / 2 },
  { id: 'warriors', name: 'The war chiefs', cares: 'war', weight: war },
];
const INDIAN_COURT: FactionDef[] = [
  { id: 'merchants', name: 'The Moorish merchants', cares: 'trade', weight: 0.4 },
  { id: 'brahmins', name: 'The Brahmins', cares: 'custom', weight: 0.3 },
  { id: 'nairs', name: 'The Nair captains', cares: 'war', weight: 0.3 },
];
const HERDERS: FactionDef[] = [
  { id: 'elders', name: 'The old men', cares: 'custom', weight: 0.6 },
  { id: 'young', name: 'The young men', cares: 'war', weight: 0.4 },
];

const C_ISLAM: Custom[] = [
  {
    scene: 'A servant offers you dates and water from a brass dish before anything is said.',
    options: ['Take them with your right hand, and thank God for them', 'Take them with whichever hand is free', 'Wave them away and come to business'],
    right: 0, hint: 'The left hand is unclean to them. Hospitality comes before business, always.',
  },
  {
    scene: 'It is the hour of prayer, and the whole court rises and turns away from you.',
    options: ['Wait in silence until they are done', 'Take the chance to speak to the vizier alone', 'Cross yourself and pray as well, aloud'],
    right: 0, hint: 'They pray five times a day. Wait, and say nothing.',
  },
];
const C_GUINEA: Custom[] = [
  {
    scene: 'You are left standing in the sun outside the enclosure for most of the morning.',
    options: ['Wait without complaint until you are called', 'Send word that you are a king’s envoy and will not wait', 'Go back to the boat'],
    right: 0, hint: 'A great man keeps visitors waiting to show he is great. Waiting well is the first gift.',
  },
  {
    scene: 'The ruler speaks only through a spokesman, holding a carved staff, and never to you directly.',
    options: ['Speak to the spokesman as though he were the king', 'Address the ruler directly over his head', 'Say nothing until the ruler speaks himself'],
    right: 0, hint: 'The linguist’s staff carries the king’s voice. Speak to the staff.',
  },
];
const C_KONGO: Custom[] = [
  {
    scene: 'Everyone who comes before the king throws dust over their own head and kneels.',
    options: ['Kneel as they do', 'Bow as you would to Dom João', 'Remain standing, as the King of Portugal’s man'],
    right: 0, hint: 'The Manikongo is a king as great as ours in his own country. Kneel.',
  },
];
const C_INDIA: Custom[] = [
  {
    scene: 'Food is set before you on a green leaf, and a servant pours water over your hands.',
    options: ['Eat with your right hand from the leaf', 'Ask for a plate and a knife', 'Touch nothing, out of caution'],
    right: 0, hint: 'Eat from the leaf, with the right hand, and never touch the serving vessels.',
  },
  {
    scene: 'The king chews betel and does not look at you. A courtier indicates a place to stand, a long way off.',
    options: ['Stand where you are placed, and wait to be addressed', 'Walk closer, to be heard', 'Sit, since he does not rise'],
    right: 0, hint: 'Distance from the king is rank. Stand where you are put.',
  },
];
const C_HERDERS: Custom[] = [
  {
    scene: 'An old man offers you sour milk from a gourd, and everybody watches you.',
    options: ['Drink it and hand it back with thanks', 'Politely refuse', 'Offer to pay for it'],
    right: 0, hint: 'Refusing what is offered is refusing the man.',
  },
];

const C_CASTILE: Custom[] = [
  {
    scene: 'The governor keeps you standing while he reads your papers, very slowly, twice.',
    options: ['Wait, hat in hand, as a courtesy', 'Remind him of the treaty of Alcáçovas', 'Sit down without being asked'],
    right: 0, hint: 'He is a hidalgo and you are a Portuguese trader. Let him have his moment.',
  },
];

export const POLITIES: PolityDef[] = [
  {
    id: 'castile', name: 'The Castilian Canaries', people: 'castilian', ports: ['las-palmas'], seat: 'las-palmas',
    title: 'Governor', rulers: ['Pedro de Vera', 'Alonso de Lugo'], temper: 'proud',
    wants: ['acucar', 'trigo'],
    factions: [
      { id: 'merchants', name: 'The Genoese sugar merchants', cares: 'trade', weight: 0.45 },
      { id: 'friars', name: 'The friars', cares: 'faith', weight: 0.2 },
      { id: 'garrison', name: 'The garrison', cares: 'war', weight: 0.35 },
    ],
    network: 'maghreb', allies: [], feuds: [], customs: C_CASTILE,
    blurb: 'Castile\u2019s islands, won by treaty and still being conquered. They will trade with Portugal and watch every sail it sends south.',
  },
  {
    id: 'fez', name: 'The Sultanate of Fez', people: 'moor', ports: ['arzila', 'safim'], seat: 'safim',
    title: 'Sultan', rulers: ['Muhammad al-Shaykh', 'Muhammad al-Burtuqali'], temper: 'wary',
    wants: ['ferramenta', 'la'], factions: ISLAMIC_PORT(0.4), network: 'maghreb',
    allies: [], feuds: [], customs: C_ISLAM,
    blurb: 'Portugal took Ceuta and Arzila from them by the sword. They trade with you the way a man trades with a neighbour who burned his barn.',
  },
  {
    id: 'azenegue', name: 'The Azenegue of Arguim', people: 'moor', ports: ['arguim'], seat: 'arguim',
    title: 'Sheikh', rulers: ['Sidi Ahmad', 'Sidi Bakr'], temper: 'mercantile',
    wants: ['trigo', 'panos'], factions: ISLAMIC_PORT(0.65), network: 'maghreb',
    allies: [], feuds: [], customs: C_ISLAM,
    blurb: 'Desert nomads at the end of the caravan road, who bring gum and gold dust down to the Crown’s fort.',
  },
  {
    id: 'jolof', name: 'The Kingdom of Jolof', people: 'wolof', ports: ['portudal'], seat: 'portudal',
    title: 'Buurba', rulers: ['Birayma Kuran', 'Bumi Jeleen'], temper: 'warlike',
    wants: ['cavalos', 'ferramenta'], factions: AFRICAN_KINGDOM(0.4), network: 'guinea',
    allies: [], feuds: ['kaabu'], customs: C_GUINEA,
    blurb: 'A horse-riding kingdom of the Senegal whose kings trade captives for horses at a price that rises every year.',
  },
  {
    id: 'kaabu', name: 'Kaabu, of the Mansa of Mali', people: 'mandinka', ports: ['cantor', 'cacheu'], seat: 'cantor',
    title: 'Mansa', rulers: ['Mansa Sama', 'Mansa Dala'], temper: 'proud',
    wants: ['panos', 'bacias'], factions: AFRICAN_KINGDOM(0.3), network: 'guinea',
    allies: [], feuds: ['jolof'], customs: C_GUINEA,
    blurb: 'The western march of the old empire of Mali, whose gold fairs on the Gambia draw merchants from Timbuktu.',
  },
  {
    id: 'temne', name: 'The Temne of Serra Leoa', people: 'temne', ports: ['serra-leoa'], seat: 'serra-leoa',
    title: 'Bai', rulers: ['Bai Farma', 'Bai Sherbro'], temper: 'wary',
    wants: ['bacias', 'manilhas'], factions: AFRICAN_KINGDOM(0.2), network: 'guinea',
    allies: [], feuds: [], customs: C_GUINEA,
    blurb: 'Kings of the watering place under the mountain, careful of strangers who come for water and stay for slaves.',
  },
  {
    id: 'eguafo', name: 'The Gold Coast kingdoms', people: 'akan', ports: ['axim', 'mina', 'acara'], seat: 'mina',
    title: 'Omanhene', rulers: ['Caramansa', 'Nana Kwamena'], temper: 'mercantile',
    wants: ['manilhas', 'panos', 'la'], factions: AFRICAN_KINGDOM(0.2), network: 'guinea',
    allies: [], feuds: [], customs: C_GUINEA,
    blurb: 'The Akan chiefs who let the King’s masons build São Jorge da Mina, and who own the gold that comes down to it.',
  },
  {
    id: 'benin', name: 'The Kingdom of Benin', people: 'edo', ports: ['ugoton'], seat: 'ugoton',
    title: 'Oba', rulers: ['Oba Ozolua', 'Oba Esigie'], temper: 'proud',
    wants: ['coral', 'bacias', 'la'], factions: AFRICAN_KINGDOM(0.35), network: 'guinea',
    allies: [], feuds: [], customs: C_GUINEA,
    blurb: 'A great walled city and a king who is half a god, whose bronze-casters make portraits of every stranger who comes.',
  },
  {
    id: 'kongo', name: 'The Kingdom of Kongo', people: 'kongo', ports: ['mpinda'], seat: 'mpinda',
    title: 'Manikongo', rulers: ['Nzinga a Nkuwu', 'Mvemba a Nzinga'], temper: 'pious',
    wants: ['ferramenta', 'la', 'cavalos'], factions: AFRICAN_KINGDOM(0.25), network: 'kongo',
    allies: [], feuds: ['ndongo'], customs: C_KONGO,
    blurb: 'A great kingdom up the river with a king at Mbanza Kongo who is curious about everything Portugal is — its God included.',
  },
  {
    id: 'ndongo', name: 'The Kingdom of Ndongo', people: 'ndongo', ports: ['luanda', 'benguela'], seat: 'luanda',
    title: 'Ngola', rulers: ['Ngola Kiluanje', 'Ngola Kiluanje II'], temper: 'warlike',
    wants: ['ferramenta', 'panos'], factions: AFRICAN_KINGDOM(0.4), network: 'kongo',
    allies: [], feuds: ['kongo'], customs: C_KONGO,
    blurb: 'Kongo’s restless southern tributary, whose Ngola would like very much to owe nothing to anybody.',
  },
  {
    id: 'khoi', name: 'The herdsmen of the Cape', people: 'khoikhoi', ports: ['angra-pequena', 'santa-helena-baia', 'sao-bras'], seat: 'sao-bras',
    title: 'Headman', rulers: ['the old headman', 'his son'], temper: 'wary',
    wants: ['bacias', 'contas'], factions: HERDERS, network: 'cape',
    allies: [], feuds: [], customs: C_HERDERS,
    blurb: 'Cattle people who trade oxen for brass and bells, and who remember every stranger who took water without asking.',
  },
  {
    id: 'tupi', name: 'The Tupi of the coast', people: 'tupi', ports: ['porto-seguro'], seat: 'porto-seguro',
    title: 'Morubixaba', rulers: ['Cunhambebe', 'Tibiriçá'], temper: 'warlike',
    wants: ['ferramenta', 'espelhos'], factions: HERDERS, network: 'brazil',
    allies: [], feuds: [], customs: C_HERDERS,
    blurb: 'Villages in the forest behind the beach, who want iron above everything and take very badly to being cheated.',
  },
  {
    id: 'kilwa', name: 'The Sultanate of Kilwa', people: 'swahili', ports: ['quiloa', 'sofala', 'mocambique'], seat: 'quiloa',
    title: 'Sultan', rulers: ['al-Fudail', 'Ibrahim ibn Sulaiman'], temper: 'proud',
    wants: ['la', 'coral'], factions: ISLAMIC_PORT(0.55), network: 'swahili',
    allies: ['mombasa'], feuds: [], customs: C_ISLAM,
    blurb: 'Lords of the gold of Sofala and the richest city on the coast, with a great mosque of coral stone and no great opinion of Christians.',
  },
  {
    id: 'mombasa', name: 'The Sultanate of Mombaça', people: 'swahili', ports: ['mombaca'], seat: 'mombaca',
    title: 'Sultan', rulers: ['Sultan Shah', 'Sultan Ahmad'], temper: 'warlike',
    wants: ['ferramenta', 'la'], factions: ISLAMIC_PORT(0.45), network: 'swahili',
    allies: ['kilwa'], feuds: ['malindi'], customs: C_ISLAM,
    blurb: 'The strongest harbour on the coast and the proudest, at war with Melinde for as long as anybody can remember.',
  },
  {
    id: 'malindi', name: 'The Sultanate of Melinde', people: 'swahili', ports: ['melinde'], seat: 'melinde',
    title: 'Sultan', rulers: ['Sultan Wagerage', 'Sultan Ali'], temper: 'mercantile',
    wants: ['cavalos', 'la', 'coral'], factions: ISLAMIC_PORT(0.6), network: 'swahili',
    allies: [], feuds: ['mombasa'], customs: C_ISLAM,
    blurb: 'Smaller than Mombaça and frightened of it, and so the friend of anybody Mombaça hates.',
  },
  {
    id: 'mogadishu', name: 'The Sultanate of Magadoxo', people: 'swahili', ports: ['magadoxo'], seat: 'magadoxo',
    title: 'Sultan', rulers: ['Sultan Abu Bakr', 'Sultan Fakhr'], temper: 'wary',
    wants: ['la', 'ferramenta'], factions: ISLAMIC_PORT(0.6), network: 'swahili',
    allies: [], feuds: [], customs: C_ISLAM,
    blurb: 'The northern end of the coast, trading with Arabia and India and suspicious of anybody from the south.',
  },
  {
    id: 'mahra', name: 'The Mahra of Socotorá and Dofar', people: 'arab', ports: ['socotora', 'dofar'], seat: 'dofar',
    title: 'Sultan', rulers: ['Sultan Said', 'Sultan Amr'], temper: 'wary',
    wants: ['trigo', 'la'], factions: ISLAMIC_PORT(0.5), network: 'arabia',
    allies: [], feuds: [], customs: C_ISLAM,
    blurb: 'Frankincense country, and an island of old Christians who have forgotten most of what that means.',
  },
  {
    id: 'aden', name: 'The Tahirid Sultanate of Adem', people: 'arab', ports: ['adem'], seat: 'adem',
    title: 'Sultan', rulers: ['Amir ibn Abd al-Wahhab', 'Amir ibn Dawud'], temper: 'proud',
    wants: ['coral', 'la'], factions: ISLAMIC_PORT(0.55), network: 'arabia',
    allies: ['hormuz'], feuds: [], customs: C_ISLAM,
    blurb: 'The gate of the Red Sea, and the Mamluks’ friend. Everything that goes to Cairo and Venice passes here.',
  },
  {
    id: 'hormuz', name: 'The Kingdom of Ormuz', people: 'arab', ports: ['ormuz', 'mascate'], seat: 'ormuz',
    title: 'Shah', rulers: ['Salghur Shah', 'Turan Shah'], temper: 'mercantile',
    wants: ['ouro', 'coral'], factions: ISLAMIC_PORT(0.65), network: 'arabia',
    allies: ['aden'], feuds: [], customs: C_ISLAM,
    blurb: 'A barren island and the richest market in the world. "If the world were an egg, Ormuz would be its yolk."',
  },
  {
    id: 'gujarat', name: 'The Sultanate of Gujarat', people: 'gujarati', ports: ['diu', 'cambaia'], seat: 'cambaia',
    title: 'Sultan', rulers: ['Mahmud Begada', 'Muzaffar Shah'], temper: 'proud',
    wants: ['cavalos', 'ouro'], factions: ISLAMIC_PORT(0.55), network: 'india',
    allies: ['calicut'], feuds: [], customs: C_ISLAM,
    blurb: 'Great cloth-making cities whose merchants are everywhere in the ocean, and whose sultan has a navy at Diu.',
  },
  {
    id: 'bijapur', name: 'The Sultanate of Bijapur', people: 'gujarati', ports: ['goa', 'chaul'], seat: 'goa',
    title: 'Adil Shah', rulers: ['Yusuf Adil Shah', 'Ismail Adil Shah'], temper: 'warlike',
    wants: ['cavalos'], factions: ISLAMIC_PORT(0.4), network: 'india',
    allies: [], feuds: ['vijayanagara'], customs: C_ISLAM,
    blurb: 'Deccan cavalry kingdoms that buy every horse from Arabia and Ormuz for their wars with Vijayanagara.',
  },
  {
    id: 'vijayanagara', name: 'The Empire of Vijayanagara', people: 'malabar', ports: ['onor', 'negapatao'], seat: 'onor',
    title: 'Raya', rulers: ['Saluva Narasimha', 'Krishnadevaraya'], temper: 'proud',
    wants: ['cavalos', 'coral'], factions: INDIAN_COURT, network: 'india',
    allies: [], feuds: ['bijapur'], customs: C_INDIA,
    blurb: 'The great Hindu empire of the south, whose capital is larger than Rome and whose armies need horses more than anything.',
  },
  {
    id: 'kolathiri', name: 'The Kolathiri of Cananor', people: 'malabar', ports: ['cananor'], seat: 'cananor',
    title: 'Kolathiri', rulers: ['Udaya Varman', 'Kerala Varma'], temper: 'wary',
    wants: ['coral', 'ouro'], factions: INDIAN_COURT, network: 'india',
    allies: [], feuds: ['calicut'], customs: C_INDIA,
    blurb: 'The northern Malabar kingdom, jealous of the Zamorin and not ashamed to say so.',
  },
  {
    id: 'calicut', name: 'The Zamorin of Calecute', people: 'malabar', ports: ['calecute'], seat: 'calecute',
    title: 'Zamorin', rulers: ['Mana Vikrama', 'Manavedan'], temper: 'proud',
    wants: ['coral', 'ouro', 'seda'], factions: INDIAN_COURT, network: 'india',
    allies: ['gujarat'], feuds: ['cochin', 'kolathiri'], customs: C_INDIA,
    blurb: 'Lord of the pepper of Malabar, whose port every ship of the ocean calls at, and whose Moorish merchants own his ear.',
  },
  {
    id: 'cochin', name: 'The Raja of Cochim', people: 'malabar', ports: ['cochim', 'coulao'], seat: 'cochim',
    title: 'Raja', rulers: ['Unni Goda Varma', 'Unni Rama Varma'], temper: 'mercantile',
    wants: ['coral', 'la'], factions: INDIAN_COURT, network: 'india',
    allies: [], feuds: ['calicut'], customs: C_INDIA,
    blurb: 'A pepper port that pays tribute to the Zamorin and would give a great deal to stop.',
  },
  {
    id: 'kotte', name: 'The Kingdom of Kotte', people: 'sinhalese', ports: ['columbo'], seat: 'columbo',
    title: 'King', rulers: ['Vira Parakramabahu', 'Dharma Parakramabahu'], temper: 'pious',
    wants: ['la', 'coral'], factions: INDIAN_COURT, network: 'east',
    allies: [], feuds: [], customs: C_INDIA,
    blurb: 'The cinnamon island, whose Buddhist kings keep the tooth of the Buddha and do not care who knows it.',
  },
  {
    id: 'malacca', name: 'The Sultanate of Malaca', people: 'malay', ports: ['malaca'], seat: 'malaca',
    title: 'Sultan', rulers: ['Sultan Mahmud Shah', 'Sultan Ahmad Shah'], temper: 'mercantile',
    wants: ['la', 'ouro'], factions: ISLAMIC_PORT(0.7), network: 'east',
    allies: [], feuds: [], customs: C_ISLAM,
    blurb: 'Where every ship of the East meets — Chinese, Javanese, Gujarati — under a sultan who taxes all of them.',
  },
];

export const POLITY_BY_ID = new Map(POLITIES.map((p) => [p.id, p]));
const BY_PORT = new Map<string, PolityDef>();
for (const p of POLITIES) for (const port of p.ports) BY_PORT.set(port, p);

export function polityOfPort(portId: string): PolityDef | null {
  return BY_PORT.get(portId) ?? null;
}

export function politiesOfPeople(peopleId: string): PolityDef[] {
  return POLITIES.filter((p) => p.people === peopleId);
}

export const TEMPER_WORD: Record<Temper, string> = {
  proud: 'Proud — insults are never forgotten, and gifts are measured',
  pious: 'Devout — his faith, and yours, matter to him',
  mercantile: 'A merchant prince — what you bring matters more than who you are',
  wary: 'Wary — trust is slow to come and quick to go',
  warlike: 'A warlord — strength impresses him, and he wants allies',
};
