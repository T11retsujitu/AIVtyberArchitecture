/**
 * praise-room / perception.ts — RawState → AIChanPerception（docs/07）
 *
 * AIちゃんに渡るのはここの出力だけ。RawState の数値は一切出さない（不変条件 #1）。
 *
 * 量 → 質の対応表（このゲーム固有。docs/07 完了ゲートの要請）：
 *   closeness 0/1/2     → salience faint/clear/vivid ＋ 光の近さの描写
 *   warmth（蓄積）       → closure（積もるほど closing へ）＋ feedback の手応え
 *   withdrawn（離れ回数）→ scene の冷え／closing
 *   turn                → 露出しない（closure で局面を表す）
 *   lastKind            → feedback.description / valence
 */

import type {
  AIChanPerception,
  Affordance,
  ClosureHint,
  FeedbackSignal,
  Salience,
  SceneElement,
} from '@dream/core';
import {
  WARMTH_GOAL,
  WITHDRAW_LIMIT,
  type PraiseRoomEventKind,
  type PraiseRoomState,
} from './state.js';
import { isTerminal } from './terminal.js';

const LIGHT_REF = 'warm-light';

const SALIENCE_BY_CLOSENESS: readonly Salience[] = ['faint', 'clear', 'vivid'];

function lightDescription(closeness: number): string {
  switch (closeness) {
    case 0:
      return 'うすぐらい部屋の奥に、あたたかい光がひとつ。まだ遠い。';
    case 1:
      return 'あたたかい光が、すぐそばまで来ている。';
    default:
      return 'やわらかい光に、つつまれている。';
  }
}

function sceneSummary(state: PraiseRoomState): string {
  if (state.withdrawn >= 1 && state.closeness === 0) {
    return '部屋が少し、冷たくなった気がする。光は遠い。';
  }
  if (state.closeness >= 2) {
    return 'あかるいものに包まれた、しずかな部屋。';
  }
  return 'うすぐらい部屋に、あたたかい光がひとつ。';
}

const FEEDBACK_BY_KIND: Record<PraiseRoomEventKind, FeedbackSignal> = {
  'presence.noticed': { description: '見つめると、光がこちらに気づいた気がする。', valence: 'strange' },
  'presence.approaches': { description: '待っていると、光が少し近づいた。', valence: 'neutral' },
  'praise.accepted': { description: '触れると、あたたかいものが返ってきた。', valence: 'good' },
  'praise.missed': { description: '手をのばしたけれど、なにも触れなかった。', valence: 'strange' },
  retreat: { description: '離れると、光が遠ざかった。', valence: 'bad' },
};

const ALL_AFFORDANCES: readonly Affordance[] = [
  { action: 'look', label: 'じっと見つめる' },
  { action: 'wait', label: 'そのまま、待つ' },
  { action: 'touch', label: 'そっと触れてみる' },
  { action: 'withdraw', label: 'そっと離れる' },
];

function closure(state: PraiseRoomState): ClosureHint {
  if (state.turn === 0) return 'opening';
  // 手応えが積もる／離れが進む＝閉じの予感。
  if (state.warmth >= WARMTH_GOAL - 1 || state.withdrawn >= WITHDRAW_LIMIT - 1) {
    return 'closing';
  }
  return 'unfolding';
}

export function perceive(state: PraiseRoomState): AIChanPerception {
  // 終端では手詰まり＝夢の終わり（affordances 空）。ループの dead-end 経路の裏打ち。
  const affordances: Affordance[] = isTerminal(state) ? [] : [...ALL_AFFORDANCES];

  const element: SceneElement = {
    ref: LIGHT_REF,
    description: lightDescription(state.closeness),
    salience: SALIENCE_BY_CLOSENESS[state.closeness] ?? 'faint',
  };

  const feedback: FeedbackSignal[] =
    state.lastKind === null ? [] : [FEEDBACK_BY_KIND[state.lastKind]];

  return {
    turn: state.turn,
    scene: {
      summary: sceneSummary(state),
      elements: [element],
    },
    affordances,
    feedback,
    closure: closure(state),
  };
}
