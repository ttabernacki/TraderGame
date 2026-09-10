import { isLand, nearestShore } from './landmass';
import { rhumbStep, wrap360, type LatLon } from '../core/math';

export type PortSize = 'anchorage' | 'village' | 'town' | 'city' | 'emporium';

export interface PortDef {
  id: string;
  /** Name as the Portuguese wrote it. */
  name: string;
  /** Modern name, shown once charted, for the player's orientation. */
  modern?: string;
  lat: number;
  lon: number;
  people: string;
  size: PortSize;
  /** 0-1. Drives market depth and how much they can pay. */
  wealth: number;
  /** Goods available here, id to relative abundance. */
  produces: Record<string, number>;
  /** Goods wanted here, id to relative hunger. */
  wants: Record<string, number>;
  /** Already on Portuguese charts at the start of the campaign. */
  known: boolean;
  /** Renown awarded for being the first Portuguese to make contact. */
  discovery: number;
  /** Quality of shelter, 0-1. A poor roadstead is dangerous in an onshore blow. */
  anchorage: number;
  /** Fresh water and provisions obtainable, 0-1. */
  refit: number;
  /** Portuguese fortress or factory present from the outset. */
  feitoria?: boolean;
  blurb: string;
}

export const PORTS: PortDef[] = [
  // --- Portugal ------------------------------------------------------------
  {
    id: 'lisboa', name: 'Lisboa', modern: 'Lisbon', lat: 38.69, lon: -9.24,
    people: 'portuguese', size: 'city', wealth: 0.8, known: true, discovery: 0,
    anchorage: 0.95, refit: 1, feitoria: true,
    produces: { la: 1, linho: 0.9, manilhas: 1, bacias: 1, ferramenta: 1, contas: 1, espelhos: 0.8, vinho: 1, azeite: 1, trigo: 1, sal: 1, coral: 0.5, cavalos: 0.4 },
    wants: { pimenta: 1, canela: 1, cravo: 1, noz: 1, maca: 1, gengibre: 1, ouro: 1, marfim: 0.9, pedras: 1, perolas: 0.9, seda: 0.8, porcelana: 0.8, malagueta: 0.7, acucar: 0.6, ambar: 0.9 },
    blurb: 'The Tagus, the Casa da Mina, and a king who wants the Indies.',
  },
  {
    id: 'lagos', name: 'Lagos', lat: 37.09, lon: -8.68,
    people: 'portuguese', size: 'town', wealth: 0.5, known: true, discovery: 0,
    anchorage: 0.7, refit: 0.8, feitoria: true,
    produces: { vinho: 1, sal: 1, azeite: 0.8, linho: 0.6 },
    wants: { ouro: 1, marfim: 0.8, malagueta: 0.8, panos: 0.5 },
    blurb: 'Where the Guinea caravels fit out, and where the Infante\'s captains were paid.',
  },
  {
    id: 'porto', name: 'Porto', lat: 41.14, lon: -8.72,
    people: 'portuguese', size: 'town', wealth: 0.55, known: true, discovery: 0,
    anchorage: 0.55, refit: 0.9,
    produces: { vinho: 1, la: 0.9, linho: 1, ferramenta: 0.8 },
    wants: { acucar: 0.8, pimenta: 0.9, couros: 0.6 },
    blurb: 'Shipwrights on the Douro, and a bar that has drowned better pilots than you.',
  },

  // --- Atlantic islands ----------------------------------------------------
  {
    id: 'funchal', name: 'Funchal', modern: 'Madeira', lat: 32.63, lon: -16.91,
    people: 'portuguese', size: 'town', wealth: 0.6, known: true, discovery: 0,
    anchorage: 0.6, refit: 0.9, feitoria: true,
    produces: { acucar: 1, vinho: 1, trigo: 0.5 },
    wants: { la: 0.8, ferramenta: 0.8, manilhas: 0.4, pimenta: 0.7 },
    blurb: 'Sugar terraces climbing out of the sea, and the first landfall on every southbound voyage.',
  },
  {
    id: 'angra', name: 'Angra', modern: 'Terceira, Azores', lat: 38.65, lon: -27.22,
    people: 'portuguese', size: 'town', wealth: 0.5, known: true, discovery: 0,
    anchorage: 0.75, refit: 0.85, feitoria: true,
    produces: { trigo: 1, vinho: 0.7, couros: 0.7 },
    wants: { pimenta: 0.9, acucar: 0.6, la: 0.6, ferramenta: 0.7 },
    blurb: 'The turn of the volta do mar. Every homeward ship in the Atlantic comes here whether it means to or not.',
  },
  {
    id: 'ponta-delgada', name: 'Ponta Delgada', modern: 'São Miguel, Azores', lat: 37.73, lon: -25.67,
    people: 'portuguese', size: 'village', wealth: 0.4, known: true, discovery: 0,
    anchorage: 0.5, refit: 0.7,
    produces: { trigo: 1, anil: 0.6, vinho: 0.6 },
    wants: { la: 0.6, ferramenta: 0.7, pimenta: 0.8 },
    blurb: 'Wheat fields on a volcano.',
  },
  {
    id: 'las-palmas', name: 'Las Palmas', modern: 'Gran Canaria', lat: 28.13, lon: -15.44,
    people: 'castilian', size: 'town', wealth: 0.45, known: true, discovery: 0,
    anchorage: 0.6, refit: 0.7,
    produces: { acucar: 0.9, vinho: 0.7, trigo: 0.6 },
    wants: { la: 0.7, ferramenta: 0.7, ouro: 1 },
    blurb: 'Castilian, and pointedly so. They watch your cargo and count your guns.',
  },
  {
    id: 'ribeira-grande', name: 'Ribeira Grande', modern: 'Santiago, Cape Verde', lat: 15.03, lon: -23.66,
    people: 'portuguese', size: 'town', wealth: 0.45, known: true, discovery: 0,
    anchorage: 0.55, refit: 0.75, feitoria: true,
    produces: { sal: 1, couros: 0.8, panos: 0.9, cavalos: 0.5 },
    wants: { la: 0.7, ferramenta: 0.8, vinho: 0.8, trigo: 0.9 },
    blurb: 'The last Portuguese roof before the open ocean. Water here, or regret it.',
  },

  // --- Morocco -------------------------------------------------------------
  {
    id: 'ceuta', name: 'Ceuta', lat: 35.89, lon: -5.31,
    people: 'portuguese', size: 'town', wealth: 0.45, known: true, discovery: 0,
    anchorage: 0.8, refit: 0.8, feitoria: true,
    produces: { trigo: 0.7, couros: 0.8 },
    wants: { ferramenta: 0.8, la: 0.7, vinho: 0.6 },
    blurb: 'Taken in 1415, and held ever since at a cost nobody in Lisbon likes to total up.',
  },
  {
    id: 'arzila', name: 'Arzila', modern: 'Asilah', lat: 35.47, lon: -6.05,
    people: 'moor', size: 'town', wealth: 0.4, known: true, discovery: 0,
    anchorage: 0.4, refit: 0.5,
    produces: { couros: 0.9, cera: 0.7, trigo: 0.6 },
    wants: { ferramenta: 0.8, la: 0.9, coral: 0.7 },
    blurb: 'A Moorish port under an uneasy Portuguese hand.',
  },
  {
    id: 'safim', name: 'Safim', modern: 'Safi', lat: 32.30, lon: -9.26,
    people: 'moor', size: 'town', wealth: 0.42, known: true, discovery: 0,
    anchorage: 0.35, refit: 0.5,
    produces: { trigo: 1, couros: 0.8, cera: 0.6, goma: 0.5 },
    wants: { la: 0.9, ferramenta: 0.8, coral: 0.6 },
    blurb: 'Grain for Portugal, when the Sharif permits it.',
  },

  // --- Guinea --------------------------------------------------------------
  {
    id: 'arguim', name: 'Arguim', modern: 'Arguin, Mauritania', lat: 20.59, lon: -16.46,
    people: 'moor', size: 'village', wealth: 0.35, known: true, discovery: 0,
    anchorage: 0.45, refit: 0.4, feitoria: true,
    produces: { goma: 1, ouro: 0.35, couros: 0.7 },
    wants: { la: 0.9, trigo: 1, cavalos: 0.9, ferramenta: 0.8, sal: 0.4 },
    blurb: 'A stone fort on a sandbank, tapping the caravan road before it reaches the Moors.',
  },
  {
    id: 'portudal', name: 'Portudal', modern: 'Senegal coast', lat: 14.44, lon: -17.03,
    people: 'wolof', size: 'village', wealth: 0.35, known: true, discovery: 6,
    anchorage: 0.3, refit: 0.5,
    produces: { couros: 0.9, marfim: 0.6, panos: 0.8, cera: 0.6 },
    wants: { cavalos: 1, ferramenta: 0.9, la: 0.8, manilhas: 0.7 },
    blurb: 'The Damel\'s people. One good horse buys more here than a hold full of cloth.',
  },
  {
    id: 'cantor', name: 'Cantor', modern: 'Gambia River', lat: 13.47, lon: -16.57,
    people: 'mandinka', size: 'village', wealth: 0.4, known: true, discovery: 10,
    anchorage: 0.5, refit: 0.6,
    produces: { ouro: 0.5, marfim: 0.8, cera: 0.7, cola: 0.8, panos: 0.7 },
    wants: { sal: 1, la: 0.8, coral: 0.9, ferramenta: 0.8, manilhas: 0.7 },
    blurb: 'Up the Gambia, where the gold of the interior first shows its face.',
  },
  {
    id: 'cacheu', name: 'Cacheu', modern: 'Guinea-Bissau', lat: 12.17, lon: -16.19,
    people: 'mandinka', size: 'village', wealth: 0.3, known: false, discovery: 12,
    anchorage: 0.45, refit: 0.5,
    produces: { marfim: 0.7, cera: 0.8, cola: 0.7, arroz: 0.9 },
    wants: { manilhas: 0.9, ferramenta: 0.8, sal: 0.7, contas: 0.6 },
    blurb: 'Rivers within rivers, and a hundred creeks that all look the same.',
  },
  {
    id: 'serra-leoa', name: 'Serra Leoa', modern: 'Freetown', lat: 8.48, lon: -13.25,
    people: 'temne', size: 'village', wealth: 0.28, known: true, discovery: 14,
    anchorage: 0.85, refit: 0.7,
    produces: { malagueta: 0.9, marfim: 0.8, arroz: 0.8, cola: 0.7 },
    wants: { manilhas: 1, bacias: 0.9, ferramenta: 0.8, contas: 0.7 },
    blurb: 'The finest harbour on the coast, under mountains that thunder in the wet season.',
  },
  {
    id: 'axim', name: 'Axim', modern: 'Ghana', lat: 4.87, lon: -2.24,
    people: 'akan', size: 'village', wealth: 0.5, known: true, discovery: 12,
    anchorage: 0.3, refit: 0.5,
    produces: { ouro: 0.85, marfim: 0.6, malagueta: 0.7 },
    wants: { manilhas: 1, bacias: 0.9, panos: 0.9, contas: 0.7, ferramenta: 0.8 },
    blurb: 'Gold washed from the rivers behind, and a surf that will stave in your boat.',
  },
  {
    id: 'mina', name: 'São Jorge da Mina', modern: 'Elmina', lat: 5.08, lon: -1.36,
    people: 'akan', size: 'town', wealth: 0.65, known: true, discovery: 0,
    anchorage: 0.35, refit: 0.8, feitoria: true,
    produces: { ouro: 1, marfim: 0.7, malagueta: 0.6, panos: 0.5 },
    wants: { manilhas: 1, bacias: 1, panos: 0.9, contas: 0.8, ferramenta: 0.9, la: 0.7 },
    blurb: 'The castle raised in 1482, and the single richest thing Portugal owns. A fifth of the Crown\'s revenue lands on this beach.',
  },
  {
    id: 'acara', name: 'Acará', modern: 'Accra', lat: 5.53, lon: -0.20,
    people: 'akan', size: 'village', wealth: 0.42, known: true, discovery: 8,
    anchorage: 0.25, refit: 0.4,
    produces: { ouro: 0.6, malagueta: 0.7, panos: 0.6 },
    wants: { manilhas: 0.9, bacias: 0.8, contas: 0.7, ferramenta: 0.7 },
    blurb: 'Open beach, hard surf, good gold.',
  },
  {
    id: 'ugoton', name: 'Ugoton', modern: 'port of Benin City', lat: 5.62, lon: 5.12,
    people: 'edo', size: 'town', wealth: 0.55, known: false, discovery: 20,
    anchorage: 0.5, refit: 0.5,
    produces: { malagueta: 1, marfim: 0.9, panos: 0.8, cola: 0.6 },
    wants: { coral: 1, manilhas: 0.9, bacias: 0.9, ferramenta: 0.7 },
    blurb: 'Up a creek from a city of earth walls longer than any in Europe. The Oba sells pepper and buys coral, and grants audience through a curtain.',
  },
  {
    id: 'sao-tome-porto', name: 'Povoação de São Tomé', modern: 'São Tomé', lat: 0.34, lon: 6.73,
    people: 'portuguese', size: 'village', wealth: 0.35, known: true, discovery: 10,
    anchorage: 0.6, refit: 0.75, feitoria: true,
    produces: { acucar: 0.9, arroz: 0.5, trigo: 0.3 },
    wants: { ferramenta: 0.9, la: 0.7, vinho: 0.9, trigo: 0.8 },
    blurb: 'A fever island on the line, planted with cane and worked at a cost the accounts do not show.',
  },
  {
    id: 'mpinda', name: 'Mpinda', modern: 'mouth of the Congo', lat: -6.02, lon: 12.42,
    people: 'kongo', size: 'town', wealth: 0.45, known: false, discovery: 40,
    anchorage: 0.55, refit: 0.6,
    produces: { marfim: 1, panos: 0.9, cera: 0.7, cola: 0.5 },
    wants: { panos: 0.8, manilhas: 0.9, espelhos: 0.8, la: 0.8, ferramenta: 0.8 },
    blurb: 'The river runs fresh twenty leagues out to sea. Somewhere up it is a king who will want to hear about your God.',
  },
  {
    id: 'luanda', name: 'Ilha de Luanda', modern: 'Luanda', lat: -8.81, lon: 13.24,
    people: 'ndongo', size: 'village', wealth: 0.35, known: false, discovery: 26,
    anchorage: 0.75, refit: 0.55,
    produces: { sal: 0.8, marfim: 0.8, cera: 0.7, panos: 0.6 },
    wants: { panos: 0.9, manilhas: 0.9, ferramenta: 0.8, vinho: 0.5 },
    blurb: 'A sheltered island where the shells that serve as money in the Kongo are gathered.',
  },
  {
    id: 'benguela', name: 'Baía de Benguela', modern: 'Benguela', lat: -12.58, lon: 13.41,
    people: 'ndongo', size: 'anchorage', wealth: 0.2, known: false, discovery: 24,
    anchorage: 0.55, refit: 0.35,
    produces: { marfim: 0.7, couros: 0.6 },
    wants: { ferramenta: 0.8, manilhas: 0.7, sal: 0.5 },
    blurb: 'Dry country, few people, and the desert beginning to show its teeth.',
  },

  // --- The long empty coast ------------------------------------------------
  {
    id: 'angra-pequena', name: 'Angra Pequena', modern: 'Lüderitz', lat: -26.63, lon: 15.15,
    people: 'khoikhoi', size: 'anchorage', wealth: 0.08, known: false, discovery: 34,
    anchorage: 0.7, refit: 0.2,
    produces: { couros: 0.4 },
    wants: { ferramenta: 0.9, bacias: 0.7 },
    blurb: 'Bartolomeu Dias set a stone cross here. There is nothing else, and the fog comes in without warning.',
  },
  {
    id: 'santa-helena-baia', name: 'Baía de Santa Helena', modern: 'St Helena Bay', lat: -32.75, lon: 18.03,
    people: 'khoikhoi', size: 'anchorage', wealth: 0.1, known: false, discovery: 30,
    anchorage: 0.6, refit: 0.45,
    produces: { couros: 0.5 },
    wants: { ferramenta: 0.9, bacias: 0.8, contas: 0.5 },
    blurb: 'Good water and a wide beach. Da Gama careened here, and left with a spear in his leg.',
  },
  {
    id: 'sao-bras', name: 'Aguada de São Brás', modern: 'Mossel Bay', lat: -34.16, lon: 22.13,
    people: 'khoikhoi', size: 'anchorage', wealth: 0.12, known: false, discovery: 36,
    anchorage: 0.65, refit: 0.55,
    produces: { couros: 0.7 },
    wants: { ferramenta: 0.9, bacias: 0.9, contas: 0.6 },
    blurb: 'Cattle on the hills and a spring behind the dunes. The one reliable watering place beyond the Cape.',
  },
  {
    id: 'ilha-santa-helena', name: 'Ilha de Santa Helena', modern: 'St Helena', lat: -15.93, lon: -5.72,
    people: 'portuguese', size: 'anchorage', wealth: 0.05, known: false, discovery: 45,
    anchorage: 0.5, refit: 0.7,
    produces: {},
    wants: {},
    blurb: 'A green rock alone in the whole South Atlantic, with water enough for a fleet. Worth more to a homeward Indiaman than a cargo of pepper.',
  },
  {
    id: 'porto-seguro', name: 'Porto Seguro', modern: 'Bahia, Brazil', lat: -16.44, lon: -39.06,
    people: 'tupi', size: 'anchorage', wealth: 0.15, known: false, discovery: 70,
    anchorage: 0.6, refit: 0.6,
    produces: { anil: 0.7, panos: 0.4 },
    wants: { ferramenta: 1, espelhos: 0.9, contas: 0.8, bacias: 0.8 },
    blurb: 'A wooded shore far to the west, found by a fleet that swung too wide on the volta do mar largo.',
  },

  // --- Swahili coast -------------------------------------------------------
  {
    id: 'sofala', name: 'Çofala', modern: 'Sofala, Mozambique', lat: -20.15, lon: 34.76,
    people: 'swahili', size: 'town', wealth: 0.7, known: false, discovery: 60,
    anchorage: 0.35, refit: 0.6,
    produces: { ouro: 1, marfim: 0.9, ambar: 0.5, panos: 0.6 },
    wants: { calico: 1, contas: 0.6, manilhas: 0.5, la: 0.6, ferramenta: 0.7 },
    blurb: 'The port the whole legend of Prester John and the gold mines points to. It is real, and the gold is real, and it has been going north to Kilwa for four hundred years.',
  },
  {
    id: 'mocambique', name: 'Moçambique', modern: 'Ilha de Moçambique', lat: -15.03, lon: 40.74,
    people: 'swahili', size: 'town', wealth: 0.6, known: false, discovery: 55,
    anchorage: 0.8, refit: 0.7,
    produces: { marfim: 0.8, ouro: 0.5, ambar: 0.4, arroz: 0.6 },
    wants: { calico: 0.9, la: 0.6, ferramenta: 0.7, coral: 0.7 },
    blurb: 'A coral island with a fine harbour, ruled by a sultan who will take you for Moors until he sees you at prayer.',
  },
  {
    id: 'quiloa', name: 'Quíloa', modern: 'Kilwa Kisiwani', lat: -8.96, lon: 39.52,
    people: 'swahili', size: 'city', wealth: 0.8, known: false, discovery: 65,
    anchorage: 0.85, refit: 0.75,
    produces: { ouro: 0.9, marfim: 0.9, ambar: 0.5, porcelana: 0.5, panos: 0.7 },
    wants: { calico: 0.9, coral: 0.8, la: 0.5, cavalos: 0.7 },
    blurb: 'Stone palaces, a great mosque, and coins minted here for three centuries. The richest city on this coast, and it controls Sofala.',
  },
  {
    id: 'mombaca', name: 'Mombaça', modern: 'Mombasa', lat: -4.06, lon: 39.68,
    people: 'swahili', size: 'city', wealth: 0.75, known: false, discovery: 62,
    anchorage: 0.9, refit: 0.7,
    produces: { marfim: 0.8, ouro: 0.6, arroz: 0.7, panos: 0.7 },
    wants: { calico: 0.8, coral: 0.8, cavalos: 0.6, ferramenta: 0.6 },
    blurb: 'A deep creek and a proud city. They welcomed da Gama with warmth and a plan to seize his ships in the night.',
  },
  {
    id: 'melinde', name: 'Melinde', modern: 'Malindi', lat: -3.22, lon: 40.13,
    people: 'swahili', size: 'town', wealth: 0.65, known: false, discovery: 70,
    anchorage: 0.55, refit: 0.8,
    produces: { marfim: 0.7, arroz: 0.8, panos: 0.7, ouro: 0.4 },
    wants: { calico: 0.8, coral: 0.8, la: 0.6, ferramenta: 0.6 },
    blurb: 'At odds with Mombasa, and therefore glad to see you. It was a pilot from here who took da Gama across to India in twenty-three days.',
  },
  {
    id: 'magadoxo', name: 'Magadoxo', modern: 'Mogadishu', lat: 2.03, lon: 45.35,
    people: 'swahili', size: 'town', wealth: 0.6, known: false, discovery: 58,
    anchorage: 0.3, refit: 0.5,
    produces: { panos: 0.9, marfim: 0.6, incenso: 0.6 },
    wants: { calico: 0.7, ferramenta: 0.7, coral: 0.6 },
    blurb: 'Weavers and a hostile surf.',
  },

  // --- Arabia and the Gulf -------------------------------------------------
  {
    id: 'socotora', name: 'Socotorá', modern: 'Socotra', lat: 12.60, lon: 53.92,
    people: 'arab', size: 'village', wealth: 0.3, known: false, discovery: 48,
    anchorage: 0.45, refit: 0.5,
    produces: { incenso: 1, ambar: 0.5, tamaras: 0.6 },
    wants: { arroz: 0.9, trigo: 0.8, ferramenta: 0.7 },
    blurb: 'Dragon\'s blood trees and a Christian community nobody in Lisbon believed existed.',
  },
  {
    id: 'adem', name: 'Adem', modern: 'Aden', lat: 12.78, lon: 45.05,
    people: 'arab', size: 'emporium', wealth: 0.85, known: false, discovery: 72,
    anchorage: 0.8, refit: 0.75,
    produces: { incenso: 1, tamaras: 0.8, cavalos: 0.7, seda: 0.5, calico: 0.6 },
    wants: { pimenta: 0.7, canela: 0.7, ouro: 0.9, cavalos: 0.4 },
    blurb: 'The gate of the Red Sea. Every grain of pepper that reaches Venice passes through here, and the men who own it will not thank you for arriving.',
  },
  {
    id: 'dofar', name: 'Dofar', modern: 'Dhofar, Oman', lat: 16.95, lon: 54.08,
    people: 'arab', size: 'town', wealth: 0.5, known: false, discovery: 50,
    anchorage: 0.4, refit: 0.5,
    produces: { incenso: 1, cavalos: 0.6, tamaras: 0.8 },
    wants: { arroz: 0.9, calico: 0.7, ferramenta: 0.6 },
    blurb: 'The frankincense coast, green for two months a year and burnt the other ten.',
  },
  {
    id: 'mascate', name: 'Mascate', modern: 'Muscat', lat: 23.61, lon: 58.60,
    people: 'arab', size: 'town', wealth: 0.6, known: false, discovery: 54,
    anchorage: 0.85, refit: 0.7,
    produces: { tamaras: 1, cavalos: 0.8, perolas: 0.6 },
    wants: { arroz: 1, trigo: 0.8, calico: 0.7, ferramenta: 0.6 },
    blurb: 'A black rock harbour, and horses bred for the Indian market.',
  },
  {
    id: 'ormuz', name: 'Ormuz', modern: 'Hormuz', lat: 27.09, lon: 56.46,
    people: 'arab', size: 'emporium', wealth: 0.95, known: false, discovery: 80,
    anchorage: 0.7, refit: 0.65,
    produces: { perolas: 1, cavalos: 1, seda: 0.8, pedras: 0.7, tamaras: 0.7 },
    wants: { pimenta: 0.9, canela: 0.8, ouro: 0.9, calico: 0.6, arroz: 0.9 },
    blurb: 'A barren salt island that is nonetheless the richest market in the world. If the world were a ring, Hormuz would be the jewel in it.',
  },

  // --- India ---------------------------------------------------------------
  {
    id: 'diu', name: 'Diu', lat: 20.71, lon: 70.99,
    people: 'gujarati', size: 'city', wealth: 0.8, known: false, discovery: 66,
    anchorage: 0.8, refit: 0.75,
    produces: { calico: 1, anil: 0.9, seda: 0.6, pedras: 0.5 },
    wants: { cavalos: 1, ouro: 0.9, coral: 0.8, incenso: 0.6, pimenta: 0.5 },
    blurb: 'Gujarat\'s window on the sea, and its fleet is not a merchant fleet.',
  },
  {
    id: 'cambaia', name: 'Cambaia', modern: 'Khambhat', lat: 21.72, lon: 72.61,
    people: 'gujarati', size: 'emporium', wealth: 0.88, known: false, discovery: 68,
    anchorage: 0.3, refit: 0.7,
    produces: { calico: 1, anil: 1, seda: 0.7, pedras: 0.6, acucar: 0.6 },
    wants: { cavalos: 1, ouro: 1, coral: 0.9, marfim: 0.7, incenso: 0.6 },
    blurb: 'Cloth for the whole ocean, at the head of a gulf where the tide comes in faster than a horse can run.',
  },
  {
    id: 'chaul', name: 'Chaul', lat: 18.55, lon: 72.89,
    people: 'gujarati', size: 'town', wealth: 0.6, known: false, discovery: 52,
    anchorage: 0.55, refit: 0.6,
    produces: { calico: 0.8, pimenta: 0.5, acucar: 0.6 },
    wants: { cavalos: 0.9, ouro: 0.8, coral: 0.7 },
    blurb: 'A river port under the Nizam Shah.',
  },
  {
    id: 'goa', name: 'Goa', lat: 15.50, lon: 73.84,
    people: 'gujarati', size: 'city', wealth: 0.78, known: false, discovery: 64,
    anchorage: 0.85, refit: 0.8,
    produces: { cavalos: 1, calico: 0.7, pimenta: 0.6, anil: 0.6 },
    wants: { ouro: 1, coral: 0.8, pedras: 0.6, cavalos: 0.3 },
    blurb: 'Deep water, an island that can be held, and the horse market that supplies the Deccan. Remember it.',
  },
  {
    id: 'onor', name: 'Onor', modern: 'Honavar', lat: 14.28, lon: 74.44,
    people: 'malabar', size: 'town', wealth: 0.5, known: false, discovery: 44,
    anchorage: 0.5, refit: 0.55,
    produces: { pimenta: 0.7, arroz: 0.9, cardamomo: 0.5 },
    wants: { cavalos: 0.9, ouro: 0.8, coral: 0.7 },
    blurb: 'Rice and pepper behind a bar that shifts every monsoon.',
  },
  {
    id: 'cananor', name: 'Cananor', modern: 'Kannur', lat: 11.87, lon: 75.38,
    people: 'malabar', size: 'city', wealth: 0.7, known: false, discovery: 74,
    anchorage: 0.6, refit: 0.7,
    produces: { pimenta: 0.95, gengibre: 0.8, canela: 0.5, cardamomo: 0.7 },
    wants: { ouro: 1, coral: 0.9, cavalos: 0.9, bacias: 0.5 },
    blurb: 'The Kolathiri raja is a rival of the Zamorin, which makes him worth cultivating.',
  },
  {
    id: 'calecute', name: 'Calecute', modern: 'Kozhikode', lat: 11.25, lon: 75.77,
    people: 'malabar', size: 'emporium', wealth: 0.95, known: false, discovery: 120,
    anchorage: 0.35, refit: 0.7,
    produces: { pimenta: 1, gengibre: 0.9, canela: 0.7, cravo: 0.6, noz: 0.55, maca: 0.5, pedras: 0.7, calico: 0.7 },
    wants: { ouro: 1, coral: 0.9, cavalos: 0.9, seda: 0.5, pedras: 0.4 },
    blurb: 'The end of the road. Pepper by the mountain, ships from China to Cairo in the roads, and a Zamorin who has been offered better than anything in your hold.',
  },
  {
    id: 'cochim', name: 'Cochim', modern: 'Kochi', lat: 9.97, lon: 76.26,
    people: 'malabar', size: 'city', wealth: 0.72, known: false, discovery: 78,
    anchorage: 0.9, refit: 0.8,
    produces: { pimenta: 1, gengibre: 0.9, canela: 0.6, cardamomo: 0.8, arroz: 0.6 },
    wants: { ouro: 1, coral: 0.85, cavalos: 0.8, la: 0.4 },
    blurb: 'A sheltered lagoon and a raja weak enough to need you. The best harbour on the coast, and the one that will make your fortune if Calicut turns on you.',
  },
  {
    id: 'coulao', name: 'Coulão', modern: 'Kollam', lat: 8.88, lon: 76.58,
    people: 'malabar', size: 'town', wealth: 0.6, known: false, discovery: 56,
    anchorage: 0.6, refit: 0.65,
    produces: { pimenta: 0.85, gengibre: 0.7, canela: 0.5 },
    wants: { ouro: 0.9, coral: 0.8, cavalos: 0.7 },
    blurb: 'An old pepper port with a Christian community older than Portugal.',
  },
  {
    id: 'columbo', name: 'Columbo', modern: 'Colombo', lat: 6.94, lon: 79.83,
    people: 'sinhalese', size: 'town', wealth: 0.65, known: false, discovery: 82,
    anchorage: 0.45, refit: 0.6,
    produces: { canela: 1, pedras: 0.9, perolas: 0.6, marfim: 0.5 },
    wants: { ouro: 1, calico: 0.7, cavalos: 0.7, coral: 0.6 },
    blurb: 'All the cinnamon in the world grows within twenty leagues of this beach.',
  },
  {
    id: 'negapatao', name: 'Negapatão', modern: 'Nagapattinam', lat: 10.77, lon: 79.86,
    people: 'tamil', size: 'town', wealth: 0.55, known: false, discovery: 50,
    anchorage: 0.4, refit: 0.55,
    produces: { calico: 0.9, arroz: 0.8, perolas: 0.7 },
    wants: { cavalos: 0.8, ouro: 0.8, pimenta: 0.4 },
    blurb: 'Coromandel cloth, bound for the eastern islands.',
  },
  {
    id: 'malaca', name: 'Malaca', modern: 'Melaka', lat: 2.20, lon: 102.26,
    people: 'malay', size: 'emporium', wealth: 0.92, known: false, discovery: 140,
    anchorage: 0.7, refit: 0.7,
    produces: { cravo: 1, noz: 1, maca: 0.9, canfora: 0.8, porcelana: 0.9, seda: 0.8, pedras: 0.6 },
    wants: { calico: 1, pimenta: 0.5, ouro: 0.9, la: 0.4 },
    blurb: 'The strait through which the clove islands send everything they grow. Whoever holds Malacca has his hand on the throat of Venice.',
  },
];

export const PORT_BY_ID = new Map(PORTS.map((p) => [p.id, p]));

export function portDef(id: string): PortDef {
  const p = PORT_BY_ID.get(id);
  if (!p) throw new Error(`unknown port: ${id}`);
  return p;
}

/**
 * Where a ship actually lies when calling here. Some historical coordinates sit
 * a little inside the simplified coastline, so the anchorage is nudged seaward
 * until it is in open water.
 */
const anchorageCache = new Map<string, LatLon>();

export function anchorageOf(p: PortDef): LatLon {
  const hit = anchorageCache.get(p.id);
  if (hit) return hit;

  let pos: LatLon = { lat: p.lat, lon: p.lon };
  if (isLand(pos)) {
    const shore = nearestShore(pos, 120);
    // Head away from the nearest coast, which from inside land points outward.
    const out = wrap360(shore.bearing);
    for (let nm = 1; nm <= 40; nm += 1.5) {
      const cand = rhumbStep({ lat: p.lat, lon: p.lon }, out, nm * 1852);
      if (!isLand(cand)) { pos = cand; break; }
    }
  }
  anchorageCache.set(p.id, pos);
  return pos;
}

/** Ports within `nm` of a position, nearest first. */
export function portsNear(pos: LatLon, nm: number): { def: PortDef; at: LatLon; distNm: number }[] {
  const out: { def: PortDef; at: LatLon; distNm: number }[] = [];
  for (const def of PORTS) {
    const at = anchorageOf(def);
    const dLat = at.lat - pos.lat;
    const dLon = (at.lon - pos.lon) * Math.cos((pos.lat * Math.PI) / 180);
    const distNm = Math.sqrt(dLat * dLat + dLon * dLon) * 60;
    if (distNm <= nm) out.push({ def, at, distNm });
  }
  return out.sort((a, b) => a.distNm - b.distNm);
}
