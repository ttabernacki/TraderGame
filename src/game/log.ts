export type LogKind =
  | 'departure' | 'landfall' | 'weather' | 'navigation' | 'discovery' | 'crew'
  | 'trade' | 'contact' | 'crown' | 'peril' | 'note';

export interface LogEntry {
  t: number;
  date: string;
  time: string;
  kind: LogKind;
  text: string;
  /** Position as the pilot reckoned it, which is what a real log records. */
  lat?: number;
  lon?: number;
  important?: boolean;
}

export class Logbook {
  entries: LogEntry[] = [];

  add(e: LogEntry): void {
    // Collapse an identical message repeated in the same hour.
    const last = this.entries[this.entries.length - 1];
    if (last && last.text === e.text && e.t - last.t < 3600) return;
    this.entries.push(e);
    if (this.entries.length > 1200) this.entries.shift();
  }

  recent(n: number): LogEntry[] {
    return this.entries.slice(-n).reverse();
  }

  ofKind(kind: LogKind): LogEntry[] {
    return this.entries.filter((e) => e.kind === kind);
  }

  serialize(): LogEntry[] {
    return this.entries;
  }
}
