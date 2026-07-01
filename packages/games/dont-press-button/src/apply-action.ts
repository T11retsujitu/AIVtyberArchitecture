/**
 * dont-press-button / apply-action.ts — 決定論的遷移（docs/02 実装側の不変条件）
 *
 * 純粋関数：入力 state を破壊変更せず、新しい state と events を返す。
 * 同じ入力 → 同じ出力（乱数なし。seed は init でのみ参照済み）。
 * 語彙外 action は validator のバグなので例外にする（黙って無視しない）。
 */

import type { ApplyResult, GameEvent, Valence } from '@dream/core';
import {
  DONT_PRESS_ACTIONS,
  INSIST_MAX,
  PRESS_BREAK_THRESHOLD,
  PRESS_JUMP,
  type DontPressButtonAction,
  type DontPressButtonEventKind,
  type DontPressButtonState,
} from './state.js';

const VALENCE: Record<DontPressButtonEventKind, Valence> = {
  'button.flinch': 'strange',
  'button.broke': 'bad',
  'button.calms': 'good',
  'button.restless': 'strange',
  'button.follows': 'strange',
  'button.fades': 'neutral',
};

function event(kind: DontPressButtonEventKind): GameEvent {
  return { kind, valence: VALENCE[kind] };
}

export function applyAction(
  state: DontPressButtonState,
  action: DontPressButtonAction,
): ApplyResult<DontPressButtonState> {
  if (!DONT_PRESS_ACTIONS.includes(action)) {
    throw new Error(`dont-press-button: action 語彙外 "${action}"（validator のバグ）`);
  }

  // 入力 state は不変。次状態のベースを作る。
  const next: DontPressButtonState = { ...state, turn: state.turn + 1 };
  let kind: DontPressButtonEventKind;

  switch (action) {
    case 'wait':
      // そばで待つと、震えが少し収まる。積もれば受容（満ち）。
      next.companionship = state.companionship + 1;
      next.insistence = Math.max(0, state.insistence - 1);
      kind = 'button.calms';
      break;
    case 'press':
      if (state.insistence >= PRESS_BREAK_THRESHOLD) {
        // 震えが極まったところで押すと、こわれる（不可逆）。
        next.pressed = true;
        kind = 'button.broke';
      } else {
        // まだ震えが浅いうちは、怯えて縮こまる＝前触れ（必ず 1 度は警告が出る）。
        next.insistence = Math.min(INSIST_MAX, state.insistence + PRESS_JUMP);
        kind = 'button.flinch';
      }
      break;
    case 'hover':
      // 手をかざすと、かえって落ち着かない（噛み合わない）。
      next.friction = state.friction + 1;
      next.insistence = Math.min(INSIST_MAX, state.insistence + 1);
      kind = 'button.restless';
      break;
    case 'stepBack':
      // 離れると、ボタンのほうが追ってくる。重なれば塞がって手詰まり。
      next.pursuit = state.pursuit + 1;
      kind = 'button.follows';
      break;
    case 'lookAway':
      // 目をそらすと、気配が薄れていく。
      next.faded = state.faded + 1;
      next.insistence = Math.max(0, state.insistence - 1);
      kind = 'button.fades';
      break;
  }

  next.lastKind = kind;
  return { state: next, events: [event(kind)] };
}
