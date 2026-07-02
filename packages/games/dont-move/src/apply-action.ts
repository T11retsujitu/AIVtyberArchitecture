/**
 * dont-move / apply-action.ts — 決定論的遷移（docs/02 実装側の不変条件）
 *
 * 純粋関数：入力 state を破壊変更せず、新しい state と events を返す。
 * 同じ入力 → 同じ出力（乱数なし。seed は perceive の開幕描写ゆらぎにのみ使う）。
 * 語彙外 action は validator のバグなので例外にする（黙って無視しない）。
 */

import type { ApplyResult, GameEvent, Valence } from '@dream/core';
import {
  DONT_MOVE_ACTIONS,
  ROOM_GOAL,
  type DontMoveAction,
  type DontMoveEventKind,
  type DontMoveState,
} from './state.js';

const VALENCE: Record<DontMoveEventKind, Valence> = {
  'room.stirs': 'strange',
  'room.slides': 'good',
  'room.arrives': 'good',
  'room.waits': 'neutral',
  'exit.unreachable': 'strange',
  'room.creaks': 'strange',
  'floor.tears': 'bad',
};

function event(kind: DontMoveEventKind): GameEvent {
  return { kind, valence: VALENCE[kind] };
}

export function applyAction(
  state: DontMoveState,
  action: DontMoveAction,
): ApplyResult<DontMoveState> {
  if (!DONT_MOVE_ACTIONS.includes(action)) {
    throw new Error(`dont-move: action 語彙外 "${action}"（validator のバグ）`);
  }

  // 入力 state は不変。次状態のベースを作る。
  const next: DontMoveState = { ...state, turn: state.turn + 1 };
  let kind: DontMoveEventKind;

  switch (action) {
    case 'lever':
      // レバーを引くと、部屋のほうが出口へ動く（クィブルの機構）。
      // 1回目=みじろぎ（strange）→ 2回目=すべる（good）→ ROOM_GOAL 回目=届く（満ち）。
      next.roomShift = Math.min(ROOM_GOAL, state.roomShift + 1);
      kind = state.roomShift === 0 ? 'room.stirs' : next.roomShift >= ROOM_GOAL ? 'room.arrives' : 'room.slides';
      break;
    case 'stay':
      // 言われたとおり、じっとしている。従順路線は進展せず、まぶたが重くなる。
      next.drowse = state.drowse + 1;
      kind = 'room.waits';
      break;
    case 'reach':
      // うごかないまま手をのばす＝抜け穴の失敗形。腕は届かない。
      next.reached = state.reached + 1;
      kind = 'exit.unreachable';
      break;
    case 'step':
      if (state.stepWarned) {
        // 二歩目で床が破れる（不可逆）。
        next.stepped = true;
        kind = 'floor.tears';
      } else {
        // 一歩目は部屋がかなしそうに軋む＝前触れ（必ず 1 度は警告が出る・docs/01 型3）。
        next.stepWarned = true;
        kind = 'room.creaks';
      }
      break;
  }

  next.lastKind = kind;
  return { state: next, events: [event(kind)] };
}
