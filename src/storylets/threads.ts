import type { SeaEvent } from '../game/seaEvents';
import type { Game } from '../game/state';
import { defOf, markSnap, type QuestDef, type QuestState, type Step } from './arc';
import { leadOf, noteExpired, onSweep, registerSource, withoutTrace } from './engine';
import { inPlace } from './places';
import { allHold, evalReq } from './qualities';
import type { Candidate, Storylet } from './types';

/**
 * The thread source: every arc's steps as storylets, and its offer as a storylet that is an invitation.
 *
 * A step is due when the ship lies in its place, the arc's beat is open (`open.<arc>.<step>`) and its `needs`
 * hold. An arc merged into the Fronts' texture (`auto`) has no invitation: its first beat is due wherever the
 * arc would have been offered, and the thread is taken up as the person is heard.
 */

const stepId = (arc: string, step: string): string => `quest:${arc}:${step}`;
export const offerId = (arc: string): string => `offer:${arc}`;

/** The one place a thread is put on the Game's list of arcs. Used by the Quarters' offer card and by `auto` arcs. */
export function takeThread(g: Game, id: QuestDef['id']): QuestState {
  const def = defOf(id);
  const q: QuestState = {
    id, step: def.first, stepT: g.clock.t, fired: false, flags: {}, started: g.clock.t,
    journal: [{ t: g.clock.t, text: def.blurb }],
  };
  g.quests.push(q);
  g.noteDeed('thread.taken', { target: id, magnitude: 0.2, note: `Took up ${def.title}.` });
  g.logEvent('crown', `Took up: ${def.title}. ${def.blurb}`, true);
  return q;
}

function stepStorylet(def: QuestDef, key: string, st: Step): Storylet {
  const first = key === def.first && !!def.auto;
  return {
    id: stepId(def.id, key),
    source: 'thread',
    arc: def.id,
    kind: st.kind ?? 'arc',
    priority: st.priority ?? 50,
    place: first && def.offeredAt.length ? { either: [{ ports: def.offeredAt }, st.at] } : st.at,
    requires: first
      ? [{ any: [{ all: [...def.requires, { not: { q: 'story.@.taken' } }] }, { q: `open.@.${key}` }] }, ...(st.needs ?? [])]
      : [{ q: `open.@.${key}` }, ...(st.needs ?? [])],
    expires: st.expires ? { when: st.expires.when, settle: (g) => { const q = g.quests.find((x) => x.id === def.id); return q ? st.expires!.settle(g, q) : ''; } } : undefined,
    scene: (g) => st.scene(g, g.quests.find((x) => x.id === def.id) ?? takeThread(g, def.id)),
    writes: st.writes ?? [],
    hooks: st.hooks.map((h) => stepId(def.id, h)),
    homeward: st.homeward,
    carries: st.carries,
  };
}

function offerStorylet(def: QuestDef): Storylet {
  return {
    id: offerId(def.id),
    source: 'thread',
    arc: def.id,
    kind: 'arc',
    priority: 0,
    place: { ports: def.offeredAt },
    requires: [...def.requires, { not: { q: 'story.@.taken' } }],
    scene: (g) => {
      const o = def.offer(g);
      return {
        id: offerId(def.id), title: def.title, text: o.text, severity: 'note', council: false,
        choices: [{ label: o.accept, detail: def.blurb, resolve: (gg) => { gg.acceptQuest(def.id); return `${def.title} — in the Book, under Missions.`; } }],
      };
    },
    writes: [],
    hooks: [stepId(def.id, def.first)],
    offer: { thread: def.id },
  };
}

/** Every storylet of an arc, offer first. */
export function storyletsOf(def: QuestDef): Storylet[] {
  const out: Storylet[] = [];
  if (!def.auto && def.offeredAt.length) out.push(offerStorylet(def));
  for (const [key, st] of Object.entries(def.steps)) out.push(stepStorylet(def, key, st));
  return out;
}

let ALL: Storylet[] = [];
let DEFS: QuestDef[] = [];
export function registerThreads(defs: QuestDef[]): void {
  DEFS = defs;
  ALL = defs.flatMap(storyletsOf);
}
export const threadStorylets = (): Storylet[] => ALL;
export const threadDefs = (): QuestDef[] => DEFS;

/** Threads that could be picked up in this port (the Quarters' "somebody on the quay with a story"). */
export function offersAt(g: Game, portId: string): QuestDef[] {
  return DEFS.filter((d) => !d.auto && d.offeredAt.includes(portId) && !g.quests.some((q) => q.id === d.id) && d.available(g));
}

function questOf(g: Game, id: string): QuestState | undefined {
  return g.quests.find((q) => q.id === id);
}

function candidate(s: Storylet, port: string | null): Candidate {
  const def = defOf(s.arc as QuestDef['id']);
  const key = s.id.split(':')[2];
  const st = def.steps[key];
  const take = (gg: Game): SeaEvent | null => {
    let q = questOf(gg, def.id);
    if (!q) q = takeThread(gg, def.id);
    gg.web.fired[s.id] = gg.clock.t;
    markSnap(gg);
    const ev = st.scene(gg, q);
    return {
      ...ev,
      choices: ev.choices?.map((c) => ({ ...c, resolve: (g2: Game) => { const out = c.resolve(g2); delete g2.web.fired[s.id]; return out; } })),
    };
  };
  return {
    id: s.id, source: 'thread', kind: s.kind, priority: s.priority,
    quarter: st.quarter ?? 'waterfront',
    delivery: port ? 'person' : 'now',
    preview: (gg) => {
      const q = questOf(gg, def.id);
      if (!q && def.auto && key === def.first) {
        const o = def.offer(gg);
        return { who: o.who, line: leadOf(o.text) };
      }
      const ev = withoutTrace(gg, q?.flags, () => st.scene(gg, q ?? takeThreadPreview(def)));
      return { who: st.marker?.(gg, q ?? takeThreadPreview(def))?.label ?? ev.title, line: `${ev.title}. ${leadOf(ev.text, 140)}` };
    },
    take,
  };
}

/** A throwaway record for previewing a scene of an arc not yet taken up. */
function takeThreadPreview(def: QuestDef): QuestState {
  return { id: def.id, step: def.first, stepT: 0, fired: false, flags: {}, started: 0, journal: [] };
}

registerSource({
  id: 'thread',
  due: (g, port) => {
    const out: Candidate[] = [];
    for (const s of ALL) {
      if (s.offer) continue;
      if (g.web.expired.includes(s.id)) continue;
      if (!inPlace(g, s.place)) continue;
      if (!allHold(g, s.requires, s.arc)) continue;
      out.push(candidate(s, port));
    }
    return out;
  },
  all: () => ALL,
});

// -- The doors the world shuts ------------------------------------------------------------------------------------------

onSweep((g) => {
  for (const s of ALL) {
    if (!s.expires || g.web.expired.includes(s.id)) continue;
    const q = questOf(g, s.arc!);
    if (!q || q.outcome || !evalReq(g, { q: `open.@.${s.id.split(':')[2]}` }, s.arc)) continue;
    if (!evalReq(g, s.expires.when, s.arc)) continue;
    noteExpired(g, s.id);
    const line = s.expires.settle?.(g);
    if (line) g.logEvent('crown', line, true);
  }
});

