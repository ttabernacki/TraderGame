import type { Piece, PieceView } from '../piece';

/**
 * The refusal. An envoy asks for what you cannot give: soldiers for a war,
 * guns, a promise of marriage. In 1493 the Mansa's envoy proposed an alliance
 * against the Fulas and Portugal stayed out; here you do the staying out. You
 * compose the reply from three parts, a reason, a consolation and a door, and
 * each court has a hidden face rule: some need the reason to be about you,
 * some about the world, some need a gift and some a smaller help, some need
 * the door closed and some left ajar. A counsellor will tell you how a draft
 * would sound, but only twice.
 */

const ASKS = [
  { id: 'soldiers', text: 'Soldiers for a war against his neighbour', who: 'The envoy' },
  { id: 'guns', text: 'Guns and powder, a hundred men’s worth', who: 'The envoy' },
  { id: 'marriage', text: 'A Portuguese bride for the king’s son', who: 'The envoy' },
];
const REASONS = [
  { id: 'orders', kind: 'self', text: 'My orders from the King forbid it' },
  { id: 'honest', kind: 'self', text: 'I have not the men, and I will not promise what I cannot do' },
  { id: 'distance', kind: 'world', text: 'The distance is too great, and the sea does not allow it' },
  { id: 'weather', kind: 'world', text: 'The monsoon will not wait for what you ask' },
];
const CONSOLE = [
  { id: 'gift', text: 'Offer a gift of your own to the king' },
  { id: 'help', text: 'Offer a smaller help: carry his letter, or his envoy' },
  { id: 'none', text: 'Offer nothing' },
];
const DOORS = [
  { id: 'open', text: 'Leave the door ajar: speak of a later year' },
  { id: 'shut', text: 'Close it plainly, and say so' },
];

const PREVIEWS = 2;

interface S {
  ask: number;
  needKind: 'self' | 'world';
  needConsole: 'gift' | 'help';
  needDoor: 'open' | 'shut';
  /** Current draft: reason, consolation, door, as indexes. */
  draft: number[];
  previews: number;
  said: string[];
}

const COURTS = new Set(['kaabu', 'jolof', 'kongo', 'malindi', 'kilwa', 'cochin', 'calicut', 'eguafo', 'benin']);

function wrong(s: S): ('reason' | 'console' | 'door')[] {
  const out: ('reason' | 'console' | 'door')[] = [];
  if (REASONS[s.draft[0]].kind !== s.needKind) out.push('reason');
  if (CONSOLE[s.draft[1]].id !== s.needConsole) out.push('console');
  if (DOORS[s.draft[2]].id !== s.needDoor) out.push('door');
  return out;
}

export const refusal: Piece<S> = {
  id: 'refusal',
  title: 'The refusal',
  available: (g, pol) => COURTS.has(pol.id) && g.polityState(pol.id).met
    && g.polityState(pol.id).trust > 0.15
    && !g.diplomacy.pieces.runs.some((r) => r.pieceId === 'refusal' && r.polity === pol.id),
  start: ({ rng }) => ({
    ask: Math.floor(rng.next() * ASKS.length),
    needKind: rng.next() < 0.5 ? 'self' : 'world',
    needConsole: rng.next() < 0.5 ? 'gift' : 'help',
    needDoor: rng.next() < 0.5 ? 'open' : 'shut',
    draft: [], previews: 0, said: [],
  }),
  view: (_ctx, s): PieceView => {
    const lines: PieceView['lines'] = [{
      who: 'narrator',
      text: `${ASKS[s.ask].who} asks of you: ${ASKS[s.ask].text.toLowerCase()}. You cannot give it. How you say so will be remembered longer than the answer.`,
    }];
    for (const t of s.said.slice(-3)) lines.push({ who: 'them', text: t });
    const choices: PieceView['choices'] = [];
    const slot = s.draft.length;
    if (slot < 3) {
      const opts = [REASONS, CONSOLE, DOORS][slot];
      lines.push({ who: 'you', text: ['Your reason.', 'Your consolation.', 'The door.'][slot] });
      opts.forEach((o, i) => choices.push({ id: `set:${i}`, label: o.text }));
    } else {
      lines.push({ who: 'you', text: `${REASONS[s.draft[0]].text}. ${CONSOLE[s.draft[1]].text}. ${DOORS[s.draft[2]].text}.` });
      if (s.previews < PREVIEWS) choices.push({ id: 'preview', label: 'Ask the counsellor how it would sound', hint: `${PREVIEWS - s.previews} left` });
      choices.push({ id: 'send', label: 'Send the reply' });
      choices.push({ id: 'redo', label: 'Draft it again' });
    }
    return { title: 'The refusal', lines, choices };
  },
  step: (_ctx, s0, choice) => {
    const s: S = JSON.parse(JSON.stringify(s0));
    if (choice.startsWith('set:') && s.draft.length < 3) { s.draft.push(Number(choice.slice(4))); return { state: s }; }
    if (choice === 'redo') { s.draft = []; return { state: s }; }
    if (choice === 'preview' && s.draft.length === 3 && s.previews < PREVIEWS) {
      s.previews += 1;
      const w = wrong(s)[0];
      s.said.push(!w ? 'The counsellor says it would be heard with dignity.'
        : w === 'reason' ? 'The counsellor winces. “He will think you are putting him off with the wrong kind of excuse.”'
          : w === 'console' ? 'The counsellor says the reply would sound cold. “You give him nothing he can carry home.”'
            : 'The counsellor says he will hear the door in it, and not like the sound.');
      return { state: s };
    }
    if (choice !== 'send' || s.draft.length < 3) return { state: s };
    const w = wrong(s).length;
    const askName = ASKS[s.ask].id;
    if (w === 0) {
      return { state: s, outcome: {
        grade: 'win', line: 'The refusal is received with dignity',
        marks: [{ key: 'refusal', text: 'You refused honestly and kept the friend.', echo: 'They say you are a man who tells the truth, even when it costs him.', tone: 0.8 }],
        measures: { trust: 0.1, respect: 0.03 },
        book: [{ kind: 'custom', tag: 'refusal-face', how: 'told', text: `Here a refusal must give a ${s.needKind === 'self' ? 'reason about yourself' : 'reason from the world'}, ${s.needConsole === 'gift' ? 'a gift' : 'a smaller help'}, and ${s.needDoor === 'open' ? 'a door left ajar' : 'a plain close'}.` }],
        factions: { custom: 0.08 },
      } };
    }
    if (w === 1) {
      return { state: s, outcome: {
        grade: 'half', line: 'The envoy goes home polite, and a little cooler',
        marks: [{ key: 'refusal', text: `You refused his request for ${askName}, not quite as he could take it.`, echo: '', tone: 0 }],
        measures: { trust: 0.0 },
      } };
    }
    return { state: s, outcome: {
      grade: 'fail', line: 'The envoy goes home insulted, and the court looks for another friend',
      marks: [{ key: 'refusal', text: 'Your refusal gave offence.', echo: 'They looked for another friend after your answer, and found one.', tone: -0.8 }],
      measures: { trust: -0.1, interest: -0.04 },
      factions: { custom: -0.1 },
    } };
  },
};
