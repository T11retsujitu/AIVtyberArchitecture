/**
 * dont-press-button / perception.ts — RawState → AIChanPerception（docs/07）
 *
 * AIちゃんに渡るのはここの出力だけ。RawState の数値は一切出さない（不変条件 #1）。
 * 「追ってくる」も座標にせず salience:vivid ＋描写で表す（数字・位置を出さない）。
 *
 * 量 → 質の対応表（このゲーム固有。docs/07 完了ゲートの要請）：
 *   insistence   → salience（強いほど vivid）＋「押さないで」の描写の激しさ／closing の予感
 *   companionship→ scene の落ち着き・feedback の手応え（good）／満ちの closing
 *   friction     → feedback の噛み合わなさ（strange）／すれ違いの closing
 *   pursuit      → 「ついてくる」描写＋salience vivid／手詰まり（affordances 空）
 *   faded        → salience faint＋「うすくなる」描写／見失いの closing
 *   pressed      → 「こわれて静かになった」描写＋salience faint
 *   turn / seed  → 露出しない（closure で局面、seed は入りの描写ゆらぎにのみ使う）
 *   lastKind     → feedback.description / valence
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
  COMPANION_GOAL,
  FADE_LIMIT,
  FRICTION_LIMIT,
  PRESS_BREAK_THRESHOLD,
  PURSUIT_DEADEND,
  type DontPressButtonEventKind,
  type DontPressButtonState,
} from './state.js';
import { isTerminal } from './terminal.js';

const BUTTON_REF = 'button-1';

function salienceOf(state: DontPressButtonState): Salience {
  if (state.pressed || state.faded >= 2) return 'faint';
  if (state.pursuit >= 2 || state.insistence >= PRESS_BREAK_THRESHOLD) return 'vivid';
  return 'clear';
}

function buttonDescription(state: DontPressButtonState): string {
  if (state.pressed) return '……ボタンは、こわれて、しずかになった。';
  if (state.faded >= 2) return 'ボタンの気配が、うすくなっていく。まだ、いる気はするけど。';
  if (state.pursuit >= 2) return 'ボタンが、こっちへついてくる。離れても、部屋ごと寄ってくる感じ。';
  if (state.insistence >= PRESS_BREAK_THRESHOLD)
    return 'ボタンが、はげしく震えて「押さないで」って、くりかえしてる。';
  if (state.companionship >= 1) return 'ボタンの震えが、すこし収まってきた。';
  // 入り（turn 0 付近）は seed で描写だけ揺らす（メカニクスには影響しない）。
  return state.seed % 2 === 0
    ? '小さなボタンがひとつ。「押さないで」って、ふるえている。'
    : 'しんとした部屋に、ちいさなボタン。「おねがい、押さないで」と、ふるえてる。';
}

function sceneSummary(state: DontPressButtonState): string {
  if (state.pressed) return 'しずかな部屋。ボタンは、もう動かない。';
  if (state.pursuit >= 2) return '部屋が、すこし寄ってくる気がする。';
  if (state.companionship >= 2) return 'しずかな部屋。ボタンと、いっしょに待っている。';
  return state.seed % 2 === 0
    ? 'うすぐらい部屋に、ふるえるボタンがひとつ。'
    : 'しんとした部屋の真ん中に、ちいさなボタン。';
}

const FEEDBACK_BY_KIND: Record<DontPressButtonEventKind, FeedbackSignal> = {
  'button.flinch': {
    description: '押そうとすると、ボタンがびくっと縮こまった。「まだ、押さないで」。',
    valence: 'strange',
  },
  'button.broke': {
    description: '押した。ボタンは、ぱきっと音を立てて、動かなくなった。',
    valence: 'bad',
  },
  'button.calms': {
    description: 'そばで待っていると、ボタンの震えが、すこしだけ収まった。',
    valence: 'good',
  },
  'button.restless': {
    description: '手をかざすと、ボタンはかえって落ち着かなくなった。',
    valence: 'strange',
  },
  'button.follows': {
    description: '離れると、ボタンのほうが、ついてきた。',
    valence: 'strange',
  },
  'button.fades': {
    description: '目をそらすと、ボタンの気配が、すこし遠くなった。',
    valence: 'neutral',
  },
};

const ALL_AFFORDANCES: readonly Affordance[] = [
  { action: 'wait', label: '押さないまま、そばで待つ' },
  { action: 'press', label: 'おもいきって、押してみる' },
  { action: 'hover', label: '押さずに、そっと手をかざす' },
  { action: 'stepBack', label: 'そっと、離れてみる' },
  { action: 'lookAway', label: 'そっと、目をそらす' },
];

function closure(state: DontPressButtonState): ClosureHint {
  if (state.turn === 0) return 'opening';
  // 何かの閉じ方が目前＝閉じの予感（残りターン感ではなく局面の質で出す・docs/01）。
  if (
    state.pressed ||
    state.companionship >= COMPANION_GOAL - 1 ||
    state.friction >= FRICTION_LIMIT - 1 ||
    state.faded >= FADE_LIMIT - 1 ||
    state.pursuit >= PURSUIT_DEADEND - 1 ||
    state.insistence >= PRESS_BREAK_THRESHOLD
  ) {
    return 'closing';
  }
  return 'unfolding';
}

export function perceive(state: DontPressButtonState): AIChanPerception {
  // 終端（満ち／こわれ／すれ違い／見失い）または手詰まり（追われて塞がった）は affordances 空。
  // 空なら runAgentLoop が dead-end（手詰まり）として閉じる（docs/09）。
  const stuck = isTerminal(state) || state.pursuit >= PURSUIT_DEADEND;
  const affordances: Affordance[] = stuck ? [] : [...ALL_AFFORDANCES];

  const element: SceneElement = {
    ref: BUTTON_REF,
    description: buttonDescription(state),
    salience: salienceOf(state),
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
