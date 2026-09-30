import type { OfficerRole } from '../crew/crew';
import type { Game } from '../game/state';

/**
 * What the wardroom says when the ship gets somewhere.
 *
 * The officers have arcs and opinions at the big decisions, and were silent on
 * the long road between. These are one-line remarks at the places a voyage
 * remembers — a first sight of the Cape, the line, Melinde, Calecute — each
 * said once per career by whichever officer would have something to say.
 */
interface Bark { place: string; role: OfficerRole; text: string }

const BARKS: Bark[] = [
  { place: 'funchal', role: 'mestre', text: 'Sugar and wine, sir, and the last good water before the coast. Fill every cask.' },
  { place: 'funchal', role: 'capelao', text: 'They say the first cane was planted here by a man who did not live to taste the sugar. That is most of what we do.' },
  { place: 'arguim', role: 'piloto', text: 'Past here there are no Portuguese charts worth the paper, sir. I would sooner we sounded every league.' },
  { place: 'arguim', role: 'escrivao', text: 'The garrison’s gold is gum and slaves and whatever the Azenegue choose to sell. I will keep the books honest, sir, for what it is worth.' },
  { place: 'arguim', role: 'cirurgiao', text: 'A dry, bad air off the desert. The men will want more water than they know.' },
  { place: 'mina', role: 'escrivao', text: 'This is where the King’s money comes from, sir. I have counted the gold twice. It has never once been less than I was told, and never more.' },
  { place: 'mina', role: 'cirurgiao', text: 'Fever country, sir. Nobody who has been here long looks well. I would not keep the men ashore after dark.' },
  { place: 'mina', role: 'lingua', text: 'The traders here have been weighing gold since before anyone in Portugal knew the word. They will know a false weight from across the room.' },
  { place: 'mpinda', role: 'capelao', text: 'The Kongo king is baptised, sir, and so is half his court. It is a strange thing to see a crowned head on the floor of a chapel, praying to the same God as ours.' },
  { place: 'mpinda', role: 'lingua', text: 'Nobody in Kongo thinks of themselves as savage, sir. They think of us as the ones with odd manners and good iron.' },
  { place: 'benguela', role: 'piloto', text: 'We are at the end of the known coast, sir. From here it is Dias’s book and what we write ourselves.' },
  { place: 'benguela', role: 'contramestre', text: 'Men have been talking about the Cape, sir. Nobody has said they are afraid. Nobody has said anything else either.' },
  { place: 'mocambique', role: 'piloto', text: 'We have done it, sir. Nobody on the Guinea coast will believe it, but we have rounded the Cape and we are in the Indian Ocean.' },
  { place: 'mocambique', role: 'cirurgiao', text: 'It is hotter than Mina and the flies are worse, sir, but the men are better. Something in the air, or the food.' },
  { place: 'melinde', role: 'lingua', text: 'The sheikh has been courteous to every Portuguese ship since Gama’s, sir. I do not think it is for love. I think it is a good policy.' },
  { place: 'melinde', role: 'piloto', text: 'Everything I know of the Indian Ocean I know from men who have not seen it, sir. The pilots here have. Ask them.' },
  { place: 'calecute', role: 'escrivao', text: 'There is more pepper on this quay than in the whole of Lisbon, sir. I would not believe it if I had not counted the sacks.' },
  { place: 'calecute', role: 'contramestre', text: 'Two years out, sir, and every man aboard has spent them looking at this. I have not heard a complaint since we raised the coast.' },
  { place: 'cochim', role: 'capelao', text: 'There are Christians here older than Portugal, sir. They have been kneeling in this country longer than we have had a King.' },
  { place: 'cochim', role: 'mestre', text: 'A good harbour, sir, and a good place to careen. I have been waiting two years to see her keel.' },
  // The places that are not ports.
  { place: 'equator', role: 'piloto', text: 'We are on the line, sir. The pole star has gone down into the sea behind us, and every sailor in the ship knows it.' },
  { place: 'equator', role: 'capelao', text: 'The hands want to duck the new men, sir, as they did at Bojador. I have told them it is a pagan custom and they have asked me which bit.' },
  { place: 'cape', role: 'mestre', text: 'Every man who has been here says it is the worst sea in the world, sir. Nobody has ever told me it was the quietest.' },
  { place: 'cape', role: 'contramestre', text: 'She is holding, sir. Do not tell the men how close it is.' },
  { place: 'bojador', role: 'piloto', text: 'Bojador, sir. Gil Eanes put his shoulder to it in 1434 and found nothing but a shoal and a wind. Men have been afraid of it for a hundred years.' },
  { place: 'monsoon', role: 'piloto', text: 'The wind is steady, sir, and steadier than any I have met. They are right about this sea.' },
];

/** Where the ship is, for the places that are not ports. */
function seaPlace(g: Game): string | null {
  const { lat, lon } = g.ship.state.pos;
  if (lat > -1.5 && lat < 1.5 && lon > -30 && lon < 10) return 'equator';
  if (lat < -33 && lon > 15 && lon < 28) return 'cape';
  if (lat > 25.5 && lat < 27.5 && lon > -17 && lon < -13) return 'bojador';
  if (lat > -8 && lat < 12 && lon > 50 && lon < 70) return 'monsoon';
  return null;
}

/** At most one remark, and only from an officer who is aboard and has not said it. */
export function barkAt(g: Game): string | null {
  const place = g.dockedAt ?? seaPlace(g);
  if (!place) return null;
  for (const b of BARKS) {
    if (b.place !== place) continue;
    const key = `bark:${b.place}:${b.role}`;
    if (g.secretsHeard.includes(key)) continue;
    const o = g.crew.officers.find((x) => x.alive && !x.ashoreAt && x.role === b.role);
    if (!o) continue;
    g.secretsHeard.push(key);
    return `${o.name}, the ${o.role === 'piloto' ? 'pilot' : o.role === 'mestre' ? 'master' : o.role === 'contramestre' ? 'boatswain' : o.role === 'escrivao' ? 'clerk' : o.role === 'cirurgiao' ? 'surgeon' : o.role === 'capelao' ? 'chaplain' : o.role === 'lingua' ? 'interpreter' : 'envoy'}: “${b.text}”`;
  }
  return null;
}
