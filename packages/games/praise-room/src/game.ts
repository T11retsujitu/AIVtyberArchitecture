/**
 * praise-room / game.ts — DreamGame の実体（docs/02 契約）
 *
 * core の runAgentLoop はこの 1 本を、契約越しにだけ触る。
 */

import type { DreamGame } from '@dream/core';
import { applyAction } from './apply-action.js';
import { perceive } from './perception.js';
import { isTerminal } from './terminal.js';
import {
  MAX_TURNS,
  PRAISE_ROOM_ACTIONS,
  type PraiseRoomAction,
  type PraiseRoomState,
} from './state.js';

export const praiseRoom: DreamGame<PraiseRoomState, PraiseRoomAction> = {
  meta: {
    id: 'praise-room',
    title: 'ほめ部屋',
    actionVocabulary: PRAISE_ROOM_ACTIONS,
    maxTurns: MAX_TURNS,
  },

  init(seed: number): PraiseRoomState {
    return {
      seed,
      turn: 0,
      // seed で初手の近さに揺らぎを与える（再現性は保ったまま take の入りを変える）。
      closeness: seed % 2 === 0 ? 0 : 1,
      warmth: 0,
      withdrawn: 0,
      lastKind: null,
    };
  },

  perceive,
  apply: applyAction,
  isTerminal,
};

export type { PraiseRoomState, PraiseRoomAction } from './state.js';
