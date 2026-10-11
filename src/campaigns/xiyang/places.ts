import type { People } from '../../world/peoples';
import type { PortDef } from '../../world/ports';
import type { Custom, FactionDef, PolityDef } from '../../diplomacy/polities';

/**
 * The places, peoples and courts of the Western Ocean in 1405 that the
 * Portuguese map does not have. Loaded only while the Xiyang campaign runs.
 * Ports the Portuguese already list (Malacca, Calicut, Hormuz, Aden, Malindi
 * and the rest) are shared; the campaign marks them known, because Ming
 * pilots had sailed to every one of them for centuries.
 */

export const XIYANG_PEOPLES: People[] = [
  {
    id: 'han', name: 'The Ming', language: 'Hanyu', faith: 'confucian',
    sophistication: 0.97, disposition: 0.7, rivalNetwork: false,
    gifts: { loves: ['ouro', 'pedras', 'marfim', 'perolas'], scorns: ['contas', 'manilhas'] },
    blurb: 'Home: the Son of Heaven, the dockyards of Longjiang, and a court that counts every gift given and every one received.',
  },
  {
    id: 'cham', name: 'The Cham', language: 'Cham', faith: 'hindu',
    sophistication: 0.65, disposition: 0.25, rivalNetwork: false,
    gifts: { loves: ['seda', 'porcelana', 'ferramenta'], scorns: ['contas'] },
    blurb: 'Seafarers of the long Vietnamese coast, pressed between Dai Viet and the Khmer, who send tribute to Nanjing to be left alone.',
  },
  {
    id: 'siamese', name: 'The Siamese', language: 'Thai', faith: 'buddhist',
    sophistication: 0.75, disposition: 0.2, rivalNetwork: false,
    gifts: { loves: ['seda', 'porcelana', 'ouro'], scorns: ['contas'] },
    blurb: 'Ayutthaya, a river city of a hundred temples, whose kings send tribute to the Ming and take the Ming’s side against Malacca.',
  },
  {
    id: 'javanese', name: 'The Javanese', language: 'Javanese', faith: 'hindu',
    sophistication: 0.85, disposition: -0.05, rivalNetwork: false,
    gifts: { loves: ['porcelana', 'seda', 'ouro'], scorns: ['contas', 'ferramenta'] },
    blurb: 'The heirs of Majapahit, whose western and eastern kings are at war with each other and will each want you for an ally.',
  },
];

const MING_COURT: FactionDef[] = [
  { id: 'eunuchs', name: 'The eunuch directors', cares: 'custom', weight: 0.4 },
  { id: 'merchants', name: 'The merchant houses', cares: 'trade', weight: 0.3 },
  { id: 'admirals', name: 'The admirals', cares: 'war', weight: 0.3 },
];
const SEA_COURT: FactionDef[] = [
  { id: 'merchants', name: 'The merchants of the port', cares: 'trade', weight: 0.5 },
  { id: 'elders', name: 'The court', cares: 'custom', weight: 0.3 },
  { id: 'guard', name: 'The war leaders', cares: 'war', weight: 0.2 },
];
const C_MING: Custom[] = [
  {
    scene: 'The Emperor’s letter is read aloud to the ruler, and everyone present kneels three times and touches the ground nine times with their heads.',
    options: ['Perform the kowtow with them', 'Bow once, as a captain of a great ship may', 'Remain standing: you carry the Emperor’s own authority'],
    right: 0, hint: 'To the Emperor’s letter the ruler kneels; the envoy who carries it kneels too, and is seen to.',
  },
];
const C_SEA: Custom[] = [
  {
    scene: 'You are met at the quay by the harbour-master, who asks, before anything else, what you are carrying and for whom.',
    options: ['Say plainly what is in the holds and in whose name', 'Say that it is not his business', 'Name the Emperor and say nothing of the cargo'],
    right: 0, hint: 'A harbour-master who is told the truth lets you through. One who is told it is not his business finds a reason to keep you waiting.',
  },
];

export const XIYANG_POLITIES: PolityDef[] = [
  {
    id: 'ming', name: 'The Ming Empire', people: 'han', ports: ['changle', 'quanzhou', 'liujiagang'], seat: 'changle',
    title: 'Emperor', rulers: ['Zhu Di, the Yongle Emperor', 'Zhu Gaochi, the Hongxi Emperor', 'Zhu Zhanji, the Xuande Emperor'], temper: 'proud',
    wants: ['pimenta', 'marfim', 'incenso'], factions: MING_COURT, network: 'east',
    allies: [], feuds: [], customs: C_MING,
    blurb: 'The throne that sent you. It wants every king under heaven to know it, and counts what the ships bring home.',
  },
  {
    id: 'champa', name: 'Champa', people: 'cham', ports: ['vijaya'], seat: 'vijaya',
    title: 'King', rulers: ['Jaya Simhavarman V'], temper: 'wary',
    wants: ['seda', 'porcelana'], factions: SEA_COURT, network: 'east',
    allies: [], feuds: [], customs: C_SEA,
    blurb: 'The first landfall on the way west, a long coast of ports and pirates and a king who pays tribute to be let alone.',
  },
  {
    id: 'ayutthaya', name: 'Ayutthaya', people: 'siamese', ports: ['ayutthaya'], seat: 'ayutthaya',
    title: 'King', rulers: ['Intharacha'], temper: 'mercantile',
    wants: ['seda', 'porcelana'], factions: SEA_COURT, network: 'east',
    allies: [], feuds: ['malacca'], customs: C_SEA,
    blurb: 'A river city that sends rice and rhinoceros horn to the Ming, and would like to be the Ming’s friend against Malacca.',
  },
  {
    id: 'majapahit', name: 'Majapahit', people: 'javanese', ports: ['surabaya', 'tuban'], seat: 'surabaya',
    title: 'King', rulers: ['Wikramawardhana', 'Wirabhumi of the east'], temper: 'proud',
    wants: ['porcelana', 'seda'], factions: SEA_COURT, network: 'east',
    allies: [], feuds: [], customs: C_SEA,
    blurb: 'The great empire of the islands, whose western and eastern kings are at war with each other. Calling at the wrong one gets men killed.',
  },
  {
    id: 'palembang', name: 'Palembang', people: 'malay', ports: ['palembang'], seat: 'palembang',
    title: 'Chief', rulers: ['Chen Zuyi'], temper: 'warlike',
    wants: ['ferramenta', 'porcelana'], factions: SEA_COURT, network: 'east',
    allies: [], feuds: [], customs: C_SEA,
    blurb: 'A river port held by a Cantonese pirate chief who robs every ship in the strait and has told the Emperor he will submit.',
  },
  {
    id: 'pasai', name: 'Samudera-Pasai', people: 'malay', ports: ['pasai', 'lambri'], seat: 'pasai',
    title: 'Sultan', rulers: ['Zain al-Abidin'], temper: 'pious',
    wants: ['seda', 'porcelana'], factions: SEA_COURT, network: 'east',
    allies: [], feuds: [], customs: C_SEA,
    blurb: 'The first Muslim kingdom of Sumatra, at the mouth of the strait, a day’s sail from the Bay of Bengal.',
  },
];

export const XIYANG_PORTS: PortDef[] = [
  {
    id: 'changle', name: 'Changle', modern: 'Changle (Taiping anchorage)', lat: 25.95, lon: 119.70,
    people: 'han', size: 'city', wealth: 0.8, known: true, discovery: 0, anchorage: 0.9, refit: 0.95,
    produces: { porcelana: 0.9, seda: 0.8, ferramenta: 0.7, bacias: 0.6, arroz: 0.8, sal: 0.6 },
    wants: { pimenta: 0.9, marfim: 0.7, incenso: 0.7, pedras: 0.6 },
    blurb: 'The Min river mouth. The fleet waits here for the north-east monsoon, three hundred ships at the Taiping anchorage.',
  },
  {
    id: 'quanzhou', name: 'Quanzhou', modern: 'Quanzhou', lat: 24.90, lon: 118.60,
    people: 'han', size: 'emporium', wealth: 0.85, known: true, discovery: 0, anchorage: 0.7, refit: 0.8,
    produces: { seda: 0.9, porcelana: 0.9, cobre: 0.5 },
    wants: { pimenta: 1, incenso: 0.9, marfim: 0.8, perolas: 0.6 },
    blurb: 'Zayton to the Arab merchants, once the greatest port in the world, now past its height.',
  },
  {
    id: 'liujiagang', name: 'Liujiagang', modern: 'Liujiagang (Taicang)', lat: 31.55, lon: 121.65,
    people: 'han', size: 'city', wealth: 0.8, known: true, discovery: 0, anchorage: 0.8, refit: 0.9,
    produces: { seda: 0.9, linho: 0.7, ferramenta: 0.6, arroz: 0.7 },
    wants: { pimenta: 0.9, marfim: 0.7, pedras: 0.6 },
    blurb: 'The river port below Nanjing where the treasure ships are fitted and the fleets assemble.',
  },
  {
    id: 'vijaya', name: 'Vijaya', modern: 'Qui Nhon', lat: 13.80, lon: 109.10,
    people: 'cham', size: 'town', wealth: 0.5, known: true, discovery: 0, anchorage: 0.55, refit: 0.7,
    produces: { arroz: 0.9, marfim: 0.7, goma: 0.6, cera: 0.5 },
    wants: { seda: 0.8, porcelana: 0.8, ferramenta: 0.6 },
    blurb: 'Zhancheng to the Ming: aloeswood, ivory and rice, and the first friendly harbour on the way west.',
  },
  {
    id: 'ayutthaya', name: 'Ayutthaya', modern: 'Gulf of Siam (Ayutthaya)', lat: 13.40, lon: 100.70,
    people: 'siamese', size: 'city', wealth: 0.65, known: true, discovery: 0, anchorage: 0.5, refit: 0.8,
    produces: { arroz: 1, marfim: 0.7, couros: 0.6, cera: 0.6 },
    wants: { porcelana: 0.9, seda: 0.8, ferramenta: 0.5 },
    blurb: 'A river city a day up the Chao Phraya, a hundred temples and a king who sends tribute and wants more than he sends.',
  },
  {
    id: 'surabaya', name: 'Surabaya', modern: 'Surabaya (Gresik)', lat: -7.20, lon: 112.70,
    people: 'javanese', size: 'city', wealth: 0.7, known: true, discovery: 0, anchorage: 0.7, refit: 0.85,
    produces: { pimenta: 0.8, arroz: 0.9, sal: 0.7, cravo: 0.5 },
    wants: { porcelana: 0.9, seda: 0.8, cobre: 0.6 },
    blurb: 'Where Majapahit trades with the world, and where the Chinese merchant colony is large enough to have its own headman.',
  },
  {
    id: 'tuban', name: 'Tuban', modern: 'Tuban', lat: -6.90, lon: 112.05,
    people: 'javanese', size: 'town', wealth: 0.55, known: true, discovery: 0, anchorage: 0.5, refit: 0.7,
    produces: { arroz: 0.8, pimenta: 0.6 },
    wants: { porcelana: 0.8, seda: 0.6 },
    blurb: 'A north-coast harbour of east Java, sheltered and busy.',
  },
  {
    id: 'palembang', name: 'Palembang', modern: 'Palembang', lat: -2.60, lon: 104.90,
    people: 'malay', size: 'town', wealth: 0.5, known: true, discovery: 0, anchorage: 0.5, refit: 0.6,
    produces: { canfora: 0.8, incenso: 0.6, pimenta: 0.5 },
    wants: { ferramenta: 0.8, porcelana: 0.6 },
    blurb: 'A river port held by a pirate who robs the strait and says he will submit, and does not.',
  },
  {
    id: 'pasai', name: 'Pasai', modern: 'Samudera-Pasai', lat: 5.15, lon: 97.35,
    people: 'malay', size: 'town', wealth: 0.6, known: true, discovery: 0, anchorage: 0.55, refit: 0.7,
    produces: { pimenta: 0.9, ouro: 0.5, cera: 0.4 },
    wants: { seda: 0.8, porcelana: 0.8 },
    blurb: 'The first Muslim port of Sumatra, at the mouth of the strait.',
  },
  {
    id: 'lambri', name: 'Lambri', modern: 'Lamreh', lat: 5.55, lon: 95.50,
    people: 'malay', size: 'village', wealth: 0.3, known: true, discovery: 0, anchorage: 0.4, refit: 0.5,
    produces: { pimenta: 0.5, arroz: 0.5 },
    wants: { seda: 0.5 },
    blurb: 'The last landfall before the long crossing of the Bay of Bengal.',
  },
  {
    id: 'galle', name: 'Galle', modern: 'Galle', lat: 6.03, lon: 80.22,
    people: 'sinhalese', size: 'town', wealth: 0.55, known: true, discovery: 0, anchorage: 0.5, refit: 0.7,
    produces: { canela: 0.8, pedras: 0.6, perolas: 0.5 },
    wants: { seda: 0.8, porcelana: 0.8, ferramenta: 0.6 },
    blurb: 'Where the Ming will set up a stone with the Emperor’s words in three languages, for three gods who may not agree.',
  },
];

/** Galle belongs to the king of Kotte. */
export const XIYANG_EXTRA_PORTS: Record<string, string[]> = { kotte: ['galle'] };

/** The ships that sail with the player's own at the start: the admiral's, and the fleet's train. */
export const XIYANG_FLEET: { hullId: string; name: string }[] = [
  { hullId: 'baochuan', name: 'Taiping' },
  { hullId: 'zhanchuan', name: 'Zhenyuan' },
  { hullId: 'zhanchuan', name: 'Anhai' },
  { hullId: 'liangchuan', name: 'Fuhai' },
  { hullId: 'machuan', name: 'Yongan' },
  { hullId: 'shuichuan', name: 'Qingquan' },
  { hullId: 'zuochuan', name: 'Pingjiang' },
  { hullId: 'zhanchuan', name: 'Dingyuan' },
  { hullId: 'liangchuan', name: 'Guangji' },
];
