/**
 * dont-move / game.ts — DreamGame の実体（docs/02 契約）
 *
 * core の runAgentLoop はこの 1 本を、契約越しにだけ触る。
 * クィブル型の第1号（勝ち回・docs/techniques/quibble.md）。
 * これで実装ゲームは 3 本目——以後、DreamGame 契約の breaking change は禁止（不変条件 #4）。
 */

import type { DreamGame } from '@dream/core';
import { applyAction } from './apply-action.js';
import { perceive } from './perception.js';
import { isTerminal } from './terminal.js';
import {
  DONT_MOVE_ACTIONS,
  MAX_TURNS,
  type DontMoveAction,
  type DontMoveState,
} from './state.js';

export const dontMove: DreamGame<DontMoveState, DontMoveAction> = {
  meta: {
    id: 'dont-move',
    title: '一歩も、うごかないで',
    actionVocabulary: DONT_MOVE_ACTIONS,
    maxTurns: MAX_TURNS,
    // 公開用の冒頭フック（0〜2秒の問い・docs/11）。メカニクス語なし（assertNoRawMechanicsText でガード）。
    hook: '「うごかないで」と部屋が言う。出口は、とおくにある。',
  },

  init(seed: number): DontMoveState {
    return {
      seed, // 開幕描写のゆらぎ（perceive の seed % 2 分岐）にのみ使う。機構は seed 非依存。
      turn: 0,
      roomShift: 0,
      stepWarned: false,
      stepped: false,
      reached: 0,
      drowse: 0,
      lastKind: null,
    };
  },

  perceive,
  apply: applyAction,
  isTerminal,
};

export type { DontMoveState, DontMoveAction } from './state.js';
