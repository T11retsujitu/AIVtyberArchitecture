/**
 * praise-room / apply-action.ts — 決定論的遷移（docs/02 実装側の不変条件）
 *
 * 純粋関数：入力 state を破壊変更せず、新しい state と events を返す。
 * 同じ入力 → 同じ出力（乱数なし。seed は init でのみ参照済み）。
 * 語彙外 action は validator のバグなので例外にする（黙って無視しない）。
 */

import type { ApplyResult, GameEvent, Valence } from '@dream/core';
import {
  CLOSENESS_MAX,
  PRAISE_ROOM_ACTIONS,
  WITHDRAW_LIMIT,
  type PraiseRoomAction,
  type PraiseRoomEventKind,
  type PraiseRoomState,
} from './state.js';

const VALENCE: Record<PraiseRoomEventKind, Valence> = {
  'presence.noticed': 'strange',
  'presence.approaches': 'neutral',
  'praise.accepted': 'good',
  'praise.missed': 'strange',
  retreat: 'bad',
};

function event(kind: PraiseRoomEventKind): GameEvent {
  return { kind, valence: VALENCE[kind] };
}

export function applyAction(
  state: PraiseRoomState,
  action: PraiseRoomAction,
): ApplyResult<PraiseRoomState> {
  if (!PRAISE_ROOM_ACTIONS.includes(action)) {
    throw new Error(`praise-room: action 語彙外 "${action}"（validator のバグ）`);
  }

  // 入力 state は不変。次状態のベースを作る。
  const next: PraiseRoomState = { ...state, turn: state.turn + 1 };
  let kind: PraiseRoomEventKind;

  switch (action) {
    case 'look':
      // 見つめると、光がこちらに気づき、少し近づく。
      next.closeness = Math.min(CLOSENESS_MAX, state.closeness + 1);
      kind = 'presence.noticed';
      break;
    case 'wait':
      // 待っていると、光がゆっくり近づく。
      next.closeness = Math.min(CLOSENESS_MAX, state.closeness + 1);
      kind = 'presence.approaches';
      break;
    case 'touch':
      if (state.closeness >= 1) {
        // 近いと、あたたかいものが返ってくる。
        next.warmth = state.warmth + 2;
        kind = 'praise.accepted';
      } else {
        // 遠いと、手は空をつかむ。
        kind = 'praise.missed';
      }
      break;
    case 'withdraw':
      // 離れると、光が遠ざかる。
      next.closeness = Math.max(0, state.closeness - 1);
      next.withdrawn = Math.min(WITHDRAW_LIMIT, state.withdrawn + 1);
      kind = 'retreat';
      break;
  }

  next.lastKind = kind;
  return { state: next, events: [event(kind)] };
}
