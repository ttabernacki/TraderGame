/**
 * Which story is being played.
 *
 * Both campaigns share one world: the same coastlines, winds, currents and
 * ports, the same physics and the same three navigation frames. What a campaign
 * decides is where and when the career starts, in what ship, under whose flag,
 * and which of the story systems (the Crown's commissions, the rival, the
 * pilot's first voyage) are running at all.
 */
export type CampaignId = 'carreira' | 'xiyang';

export interface CampaignDef {
  id: CampaignId;
  title: string;
  tagline: string;
  blurb: string;
  /** The day the career begins. */
  start: { year: number; month: number; day: number };
  /** The port she lies in. */
  port: string;
  hullId: string;
  shipName: string;
  /** Whose ship she is, for the opening line of the log. */
  opening: string;
  /** Still being built: offered on the title screen with a warning. */
  inDevelopment: boolean;
}

export const CAMPAIGNS: CampaignDef[] = [
  {
    id: 'carreira',
    title: 'Carreira da Índia',
    tagline: 'Portugal, 1482',
    blurb: 'Eighty years of caravels have worked their way a headland at a time down the western side of Africa, and nobody yet knows whether it has an end. '
      + 'You have a lateen caravel, a crew who have heard what happens south of the line, a quadrant, and a set of tables that do not run past the equator. '
      + 'The wind belts will carry you south whether you like it or not, and will not carry you back the way you came. '
      + 'Your latitude you can find from the sun and the pole star. Your longitude nobody on earth can find, and will not for another two hundred and sixty years.',
    start: { year: 1482, month: 7, day: 12 },
    port: 'lisboa',
    hullId: 'caravela-latina',
    shipName: 'São Cristóvão',
    opening: 'The São Cristóvão lies in the Tagus, stored and watered. Whatever happens after this is written in this book.',
    inDevelopment: false,
  },
  {
    id: 'xiyang',
    title: 'Down the Western Ocean',
    tagline: 'Ming, 1405',
    blurb: 'The Yongle Emperor has ordered the largest fleet the world has ever seen down the Yangzi and out to the Western Ocean, to carry his name to every king from Champa to Calicut. '
      + 'It waits at the Taiping anchorage at Changle for the north-east monsoon. You command one of its ships. '
      + 'The ocean ahead is not unknown: Arab, Gujarati and Malay pilots have sailed it for centuries, and the needle routes in your book say where every island lies. '
      + 'What is unknown is whether forty kings will take the Emperor’s calendar, and whether the court will still pay when you come home.',
    start: { year: 1405, month: 12, day: 20 },
    port: 'changle',
    hullId: 'nau',
    shipName: 'Qinghe',
    opening: 'The Qinghe lies in the Taiping anchorage off Changle among three hundred sail, stored and watered, waiting on the monsoon.',
    inDevelopment: true,
  },
];

export const CAMPAIGN_BY_ID = new Map(CAMPAIGNS.map((c) => [c.id, c]));

export function campaignDef(id: CampaignId | undefined): CampaignDef {
  return CAMPAIGN_BY_ID.get(id ?? 'carreira') ?? CAMPAIGNS[0];
}
