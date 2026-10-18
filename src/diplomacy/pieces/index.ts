import type { Piece } from '../piece';
import { bow } from './bow';
import { envoy } from './envoy';
import { hostage } from './hostage';
import { pilot } from './pilot';
import { refusal } from './refusal';
import { informer } from './informer';
import { giftTable } from './giftTable';
import { goBetween } from './goBetween';
import { theCase } from './theCase';
import { silentTrade } from './silentTrade';

/** Every piece the Table can offer. New pieces are added here. */
export const PIECES: Piece[] = [bow, silentTrade, giftTable, theCase, goBetween, envoy, informer, refusal, pilot, hostage];
