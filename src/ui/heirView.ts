import { heirOrigin, planInheritance, type InheritPlan } from '../identity/dynasty';
import type { Game } from '../game/state';
import { endingFor } from '../progression/endings';
import { button, card, el } from './dom';

/**
 * The heir card (E2): at the end of a career, who takes the ship and what comes down to him, in plain words, before he does.
 * It reuses the epilogue's "send your heir to sea" flow and changes nothing about the new-game screen. The list on it is the
 * hand-off's own plan (`planInheritance`), so what it says is what `Game.inheritFrom` then does.
 */

export interface HeirChoice { name?: string; repudiate: boolean }

/** The three parts of the screen (head, body, foot), to be put in a `screen` in place of the epilogue. */
export function heirScreen(g: Game, onTake: (c: HeirChoice) => void, onBack: () => void): HTMLElement[] {
  // The ending says what the heir does with the name; the card starts from it and lets the player decide.
  let repudiate = endingFor(g).id === 'repudiation';
  let typed = '';
  const body = el('div', { class: 'screen-body' });
  const input = el('input', { type: 'text', class: 'captain-name', maxlength: '40', 'aria-label': 'Your name' }) as HTMLInputElement;
  input.addEventListener('input', () => { typed = input.value; });

  const render = (): void => {
    const plan: InheritPlan = planInheritance(g, { repudiate, origin: heirOrigin(g) });
    if (!typed) input.value = plan.person.name;
    body.replaceChildren(el('div', { class: 'scroll-narrow' },
      el('p', { class: 'epilogue-lede' },
        `${plan.person.father} is done. The ship goes to ${plan.person.name.split(' ')[0]}, ${plan.person.age}, ${plan.person.relation === 'natural son' ? 'his natural son' : plan.person.relation === 'ward' ? 'his ward' : `his ${plan.person.relation}`}.`),
      card('Who you are', el('label', {}, 'Your name ', input),
        el('div', { class: 'row' },
          button('Keep the family name', () => { repudiate = false; if (!typed) input.value = ''; render(); }, { primary: !repudiate, ghost: repudiate }),
          button('Put it off', () => { repudiate = true; if (!typed) input.value = ''; render(); }, { primary: repudiate, ghost: !repudiate })),
        el('p', { class: 'flavour' }, repudiate
          ? 'You take another name. Neither the name at court, the title, the patrons’ memory nor the grants come with it, and half the purse stays behind. The charts, the Houses and the world are not the name’s and are yours.'
          : 'You take the family name, and its shadow with it: what the Book says of him will be said of you until you have done something of your own.')),
      card('What comes down to you', ...plan.words.map((w) => el('p', {}, w))),
    ));
  };
  render();

  return [
    el('div', { class: 'screen-head' }, el('h1', {}, 'Your heir'), el('div', { class: 'sub' }, `Generation ${g.generation + 1}`)),
    body,
    el('div', { class: 'screen-foot' },
      button('Take the ship', () => onTake({ name: typed.trim() || undefined, repudiate }), { primary: true }),
      button('Not yet', onBack)),
  ];
}
