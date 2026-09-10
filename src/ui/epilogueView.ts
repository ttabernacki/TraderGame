import { formatLat } from '../core/math';
import { OFFICER_ROLES } from '../crew/crew';
import { officerTitle, traitDef } from '../progression/officers';
import type { Game } from '../game/state';
import { button, card, el, kv } from './dom';

/**
 * The end of the carreira.
 *
 * A game about a voyage has to end when the voyage ends, and it has to end by
 * saying what the voyage was — not with a score, but with the things that
 * actually happened to the people who went. The historical version of this
 * screen is the last page of Álvaro Velho's roteiro, which lists who came back.
 *
 * Everything on it is drawn from the run: the men who died, the pillars still
 * standing, the rumours that turned out to be true, the other captain and where
 * he got to. There is nothing generic here except the frame.
 */
export class EpilogueView {
  root = el('div', { class: 'screen' });

  constructor(g: Game, onRestart: () => void) {
    const lost = g.crew.deaths;
    const home = g.crew.count;
    const years = ((g.clock.t - g.startT) / 86400 / 365.25);
    const officersLost = g.crew.officers.filter((o) => !o.alive);
    const ashore = g.crew.officers.filter((o) => o.alive && o.ashoreAt);
    const trueLeads = g.leads.filter((l) => l.followed && !l.false);
    const falseLeads = g.leads.filter((l) => l.followed && l.false);
    const delivered = g.ventures.filter((v) => v.delivered);
    const broken = g.ventures.filter((v) => v.failed);

    const body = el('div', { class: 'screen-body' },
      el('div', { class: 'scroll-narrow' },
        el('p', { class: 'epilogue-lede' },
          'The pepper is landed at the Casa da Índia and weighed under the eyes of four clerks, '
          + 'and by the end of the week the price of it in Venice has begun to move. Nobody in '
          + 'this country will ever again have to buy an eastern spice from a man who bought it '
          + 'from a man who bought it in Alexandria. That is what the voyage was for, and it is '
          + 'now done, and it will not need doing again.'),

        card('The ship',
          kv('Sailed from Lisbon', '12 July 1482'),
          kv('Home', g.clock.formatDate()),
          kv('The voyage took', `${years.toFixed(1)} years`),
          kv('Her name', g.ship.name),
          kv('Furthest south', formatLat(g.furthestSouth)),
          kv('Coastline charted', `${(g.chart.coverage() * 100).toFixed(1)}% of the route`),
        ),

        card('The company',
          kv('Sailed with', `${home + lost} men`),
          kv('Came home', `${home}`),
          kv('Buried at sea', `${lost}`),
          lost > home
            ? el('p', { class: 'flavour' },
                'More went over the side than came up the Tagus, which was the ordinary rate '
                + 'and was not thought to make the voyage a failure by anyone but the men.')
            : el('p', { class: 'flavour' },
                'A better return than the route usually gave. It will not be believed in Lisbon '
                + 'and it will be believed even less on the next voyage out.'),
          ...officersLost.map((o) => el('p', {},
            `${o.name}, ${officerTitle(o).toLowerCase()} — died on the passage.`)),
          ...ashore.map((o) => el('p', {},
            `${o.name} was put ashore among strangers and has not been heard of since.`)),
        ),

        card('The men who came back',
          ...g.crew.officers.filter((o) => o.alive && !o.ashoreAt).map((o) => {
            const def = OFFICER_ROLES.find((r) => r.role === o.role);
            const t = traitDef(o.trait);
            return el('p', {},
              el('b', {}, o.name),
              ` — ${def?.english.toLowerCase() ?? o.role}. `,
              fateOf(o.name, o.loyalty, t?.id),
            );
          }),
        ),

        g.crown.padraoSites.length > 0
          ? card('What is still standing',
              ...g.crown.padraoSites.map((p) => el('p', {},
                `${p.name}, ${formatLat(p.lat)}. The stone is cut with the arms of Portugal and `
                + 'the date, and it is not going anywhere.')),
            )
          : null,

        (trueLeads.length > 0 || falseLeads.length > 0)
          ? card('What you were told',
              trueLeads.length > 0
                ? el('p', {}, `${trueLeads.length} reports ran down true. `
                    + 'Every one of them was a man saying what he thought he knew to a stranger '
                    + 'in a language neither of them spoke well.')
                : null,
              falseLeads.length > 0
                ? el('p', {}, `${falseLeads.length} came to nothing but open water, which is `
                    + 'the ordinary result and is why nobody sailed on one report alone.')
                : null,
            )
          : null,

        (delivered.length > 0 || broken.length > 0)
          ? card('The private account',
              kv('Charters discharged', `${delivered.length}`),
              kv('Charters broken', `${broken.length}`),
              kv('Freight earned', `${delivered.reduce((s, v) => s + v.fee, 0)} cruzados`),
              broken.length > delivered.length
                ? el('p', { class: 'flavour' },
                    'The Rua Nova has a long memory and one street’s worth of people to '
                    + 'remind each other with.')
                : null,
            )
          : null,

        card('The other man',
          el('p', {}, g.rival.frontierLat > g.furthestSouth
            ? `${g.rival.name} is at sea somewhere off Guinea and does not yet know that the `
              + 'thing he has spent his life working towards was done last month by somebody '
              + 'else. He will be told at Mina, by a factor, in the middle of a conversation '
              + 'about something else.'
            : `${g.rival.name} got further down that coast than you did and has been saying so `
              + 'for years. It will not matter now. The route is finished and there is only one '
              + 'name that goes on it.'),
          kv('His standing', `${Math.round(g.rival.standing)}`),
          kv('Yours', `${Math.round(g.crown.lifetimeStanding)}`),
        ),

        card('What became of it',
          el('p', {},
            'Within twenty years Portuguese fleets are fighting in the Indian Ocean, there is a '
            + 'viceroy at Goa, and the Venetian galley trade in spices has effectively stopped. '
            + 'Within a hundred the Dutch have taken most of it away again. The route itself '
            + 'never becomes safe: ships are lost on it, at the Cape and off Mozambique and on '
            + 'the Kentish Knock, for another three hundred years.'),
          el('p', {},
            `Of the ${home + lost} men who went out in ${g.ship.name}, ${home} were paid off at `
            + 'Belém. Their names are not recorded anywhere, and neither is yours in the version '
            + 'of this that gets written down.'),
        ),

        el('p', { class: 'quote' },
          '"E assim partimos." — And so we departed. The last words of the roteiro of the first '
          + 'voyage to India, written by a man whose own name is not certainly known.'),
      ),
    );

    this.root.append(
      el('div', { class: 'screen-head' },
        el('h1', {}, 'The carreira is opened'),
        el('div', { class: 'sub' }, `${g.crown.title.name} · ${g.clock.formatDate()}`),
      ),
      body,
      el('div', { class: 'screen-foot' },
        button('Fit out another ship', onRestart, { primary: true }),
      ),
    );
  }
}

/**
 * Where the years after the voyage take a man.
 *
 * Keyed on his character first and on how he left it with his captain second,
 * so three men of the same middling regard do not all get the same sentence —
 * and picked deterministically from his own name, so re-reading the page never
 * changes what became of him.
 */
function fateOf(name: string, loyalty: number, trait?: string): string {
  switch (trait) {
    case 'ambitious':
      return loyalty > 0.6
        ? 'Had a command of his own within three years, and said publicly, more than once, where he learned it.'
        : 'Had a command of his own within three years and gave evidence against you at the inquiry into the accounts.';
    case 'exact':
      return 'Went into the Armazém as a examiner of pilots, and failed most of them.';
    case 'curious':
      return 'His drawings of the coast were copied into the Casa\u2019s master chart without his name on them, which he minded less than you would expect.';
    case 'drunk':
      return loyalty > 0.55
        ? 'Kept dry for two more voyages, on the strength of a conversation in the great cabin nobody else ever heard about.'
        : 'Was found dead behind a wine shop in the Alfama within the year.';
    case 'pious':
      return 'Gave a silver lamp to the Ermida do Restelo out of his pay, and never went to sea again.';
    case 'hardhorse':
      return 'Was boatswain of two more India ships, and there are men alive who will not say his name.';
    case 'veteran':
      return 'Went out again the following season, as he had after every other voyage, and did not come back from that one.';
    case 'timid':
      return 'Bought a share in a coasting vessel and did very well out of the Azores run, which he had always said was where the money was.';
    case 'sealawyer':
      return 'Wrote his own account of the voyage and submitted it to the Casa, where it is presumably still filed.';
    default:
      break;
  }
  if (loyalty > 0.8) return 'Signed for the next voyage before the cargo was out of her.';
  if (loyalty < 0.3) {
    return 'Took his pay, and told the Casa his version of the voyage before you had finished telling yours.';
  }
  // Three men of the same regard should not read as one man three times.
  const ordinary = [
    'Took his pay, drank a good deal of it, and was aboard again in the spring.',
    'Took his pay and went into a coasting vessel out of Setúbal. Never sailed south again.',
    'Married in Belém on the strength of his share and was at sea again within eighteen months.',
    'Took his pay, and is on the muster of a ship that sailed in the following decade and did not return.',
  ];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 9973;
  return ordinary[h % ordinary.length];
}
