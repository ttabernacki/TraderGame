import type { Piece } from '../piece';
import { bow } from './bow';
import { giftTable } from './giftTable';
import { silentTrade } from './silentTrade';

/** Every piece the Table can offer. New pieces are added here. */
export const PIECES: Piece[] = [bow, silentTrade, giftTable];
