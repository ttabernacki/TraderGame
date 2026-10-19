import type { StoresPlan } from '../../game/stores';
import type { QuarterId } from './model';

/**
 * What a quarter's view needs from the port screen: the one notice line, the redraw, the places to go, and the little
 * bits of state the old tabs kept on the class (the barter cloth, the quantities typed, the stores being set).
 * Held in one object so each quarter is a small file of functions, not a method of a 2,000-line class.
 */
export class Ctx {
  notice: { text: string; grave?: boolean } | null = null;
  /** Goods the player has been warned about selling out from under a charter. */
  confirmSale: string | null = null;
  quantities = new Map<string, number>();
  marketMode: 'scales' | 'barter' = 'scales';
  barterGive = new Map<string, number>();
  barterTake = new Map<string, number>();
  barterCoin = 0;
  /** How his face reads this time, which changes each time you put it to him. */
  faceNoise = 0;
  /** The loading being set in the Yard, and whether the pilot has had his word before this weighing. */
  storesPlan: StoresPlan | null = null;
  storesAdvised = false;
  /** The Ribeira's drawing table stays open while a design is being worked. */
  ribeiraOpen = false;
  /** Which officer the inland card has selected, until one is sent. */
  inlandMan: string | null = null;
  /** The standing order being composed before a House exists to carry it. */
  stationOrder: string[] = [];

  constructor(
    /** Redraw the whole port screen. */
    public render: () => void,
    public onAudience: () => void,
    public onCourt: () => void,
    /** Go to a quarter (and a section of it). */
    public show: (quarter: QuarterId, section?: string) => void,
  ) {}

  /** A new call at a port. */
  reset(): void {
    this.notice = null; this.confirmSale = null;
    this.quantities.clear();
    this.barterGive.clear(); this.barterTake.clear(); this.barterCoin = 0;
    this.storesPlan = null; this.storesAdvised = false;
  }

  say(text: string, grave = false): void { this.notice = { text, grave }; }
}
