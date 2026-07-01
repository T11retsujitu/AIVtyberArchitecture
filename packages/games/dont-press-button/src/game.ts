/**
 * dont-press-button / game.ts — DreamGame の実体（docs/02 契約）
 *
 * core の runAgentLoop はこの 1 本を、契約越しにだけ触る。
 * 公開第1作（Shorts の顔）。praise-room はキャラ一貫性の検証台として据え置き。
 */

import type { DreamGame } from '@dream/core';
import { applyAction } from './apply-action.js';
import { perceive } from './perception.js';
import { isTerminal } from './terminal.js';
import {
  DONT_PRESS_ACTIONS,
  MAX_TURNS,
  type DontPressButtonAction,
  type DontPressButtonState,
} from './state.js';

export const dontPressButton: DreamGame<DontPressButtonState, DontPressButtonAction> = {
  meta: {
    id: 'dont-press-button',
    title: '押さないでボタン',
    actionVocabulary: DONT_PRESS_ACTIONS,
    maxTurns: MAX_TURNS,
    // 公開用の冒頭フック（0〜2秒の問い・docs/11）。メカニクス語なし（assertNoRawMechanicsText でガード）。
    hook: '「押さないで」と、ボタンがふるえている。',
  },

  init(seed: number): DontPressButtonState {
    return {
      seed,
      turn: 0,
      // seed で初手の震えに揺らぎを与える（再現性は保ったまま入りを変える）。
      // どちらも PRESS_BREAK_THRESHOLD 未満なので「初手 press は必ず警告」の前触れは保たれる。
      insistence: seed % 2 === 0 ? 1 : 2,
      companionship: 0,
      friction: 0,
      pursuit: 0,
      faded: 0,
      pressed: false,
      lastKind: null,
    };
  },

  perceive,
  apply: applyAction,
  isTerminal,
};

export type { DontPressButtonState, DontPressButtonAction } from './state.js';
