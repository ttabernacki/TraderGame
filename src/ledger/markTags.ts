import type { Tag } from './tags';

/**
 * Which Ledger tag a court's mark becomes. A mark has a `key` (which piece
 * wrote it) and a `tone` (-1..1); together they say what kind of act it was.
 * A key this table does not know falls to the generic `mark.*` tags, so a new
 * piece is recorded from its first day and can be given its own tags later.
 */
export function tagForMark(key: string, tone: number): Tag {
  const hi = tone > 0.3, lo = tone < -0.3;
  switch (key) {
    case 'greeted': return tone > 0.3 ? 'courtesy.kept' : tone < -0.3 ? 'courtesy.broken' : 'courtesy.plain';
    case 'envoy': return tone > 0.5 ? 'promise.kept' : tone < -0.5 ? 'promise.broken' : 'envoy.mixed';
    case 'peace': return hi ? 'peace.made' : 'peace.left';
    case 'tray': return hi ? 'gift.great' : lo ? 'gift.insult' : 'gift.plain';
    case 'meal':
    case 'hall': return tone > 0.5 ? 'table.kept' : tone < -0.3 ? 'table.spoiled' : 'table.plain';
    case 'case': return hi ? 'judgement.just' : lo ? 'judgement.unjust' : 'judgement.heard';
    case 'hostage': return tone >= 0.7 ? 'hostage.raised' : tone > 0.2 ? 'hostage.freed' : tone <= -0.9 ? 'hostage.died' : 'hostage.ill';
    case 'pilot': return tone > 0.3 ? 'pilot.trusted' : tone <= -0.4 ? 'pilot.misled' : 'pilot.mixed';
    case 'silent': return hi ? 'silent.fair' : tone <= -0.5 ? 'silent.blood' : 'silent.none';
    case 'informer': return hi ? 'informer.found' : lo ? 'informer.wronged' : 'informer.silent';
    case 'refusal': return hi ? 'refusal.honest' : 'refusal.curt';
    default: return hi ? 'mark.for' : lo ? 'mark.against' : 'mark.mixed';
  }
}
