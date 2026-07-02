/**
 * dont-move / perception.ts — RawState → AIChanPerception（docs/07）
 *
 * AIちゃんに渡るのはここの出力だけ。RawState の数値は一切出さない（不変条件 #1）。
 *
 * 歪み：**なし**（docs/04 §5 の「歪みなし」パターン。真実＝描写）。
 * クィブル（勝ち回・AIちゃん＞視聴者）に信頼できない語り手は不要——
 * 情報差は「抜け穴に気づくかどうか」だけで作る。レバーは嘘をつかず、
 * ただ開幕は salience: faint でさりげなく置く（チェーホフの銃の作法・docs/techniques/chekhovs-gun.md）。
 *
 * 量 → 質の対応表（このゲーム固有。docs/07 完了ゲートの要請。真実＝描写の2列）：
 *   roomShift   → 出口（exit-1）の salience faint→clear→vivid ＋「近づいてくる」描写／GOAL-1 で closing
 *   stepWarned  → feedback strange（「うごいたね」と部屋がかなしそうに軋む）＋ closing の予感
 *   stepped     → feedback bad（床が破れる）＋「破れた床」の描写
 *   reached     → feedback strange（届かない空振り）／極まれば すれ違いの closing
 *   drowse      → 出口の salience 減衰（霧に溶ける）＋「まぶたが、おもい」／見失いの closing
 *   turn / seed → 露出しない（closure で局面、seed は開幕描写のゆらぎにのみ使う）
 *   lastKind    → feedback.description / valence
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
  DROWSE_LIMIT,
  REACH_LIMIT,
  ROOM_GOAL,
  type DontMoveEventKind,
  type DontMoveState,
} from './state.js';
import { isTerminal } from './terminal.js';

const EXIT_REF = 'exit-1';
const LEVER_REF = 'lever-1';

/** 出口の存在感：はじめは目を引く（clear）。部屋が動くほど近く（vivid）、
 *  まどろむほど霧に溶ける（faint）＝型5 見失いの clear→faint 減衰。 */
function exitSalience(state: DontMoveState): Salience {
  if (state.stepped) return 'faint';
  if (state.drowse >= 2) return 'faint';
  if (state.roomShift >= 2) return 'vivid';
  return 'clear';
}

function exitDescription(state: DontMoveState): string {
  if (state.stepped) return '出口は、破れた床のむこうで、ぼやけてしまった。';
  if (state.drowse >= 2) return '出口が、霧のむこうにうすれていく。まぶたが、おもい。';
  if (state.roomShift >= ROOM_GOAL - 1) return '出口が、もう足もとまで来ている。手をのばさなくても、届きそう。';
  if (state.roomShift >= 1) return '出口が、さっきより近い。……部屋のほうが、動いてる気がする。';
  return state.seed % 2 === 0
    ? '出口は、とおくにある。あるいて行けば、すぐなのに。'
    : '出口のあかりが、とおくに見える。歩けば、届く距離なのに。';
}

/** レバー：開幕はさりげなく（faint）。一度きしめば、意味が見えてくる（clear）。 */
function leverElement(state: DontMoveState): SceneElement {
  if (state.roomShift >= 1) {
    return {
      ref: LEVER_REF,
      description: '床のレバー。引くたび、部屋がきしんで動く。……この部屋、歩けるんだ。',
      salience: 'clear',
    };
  }
  return {
    ref: LEVER_REF,
    description: '足もとの床に、ふるいレバーがひとつ、生えている。ひんやりしてる。',
    salience: 'faint',
  };
}

function sceneSummary(state: DontMoveState): string {
  if (state.stepped) return 'しずかになった部屋。床は破れて、声はもう聞こえない。';
  if (state.roomShift >= ROOM_GOAL) return '部屋が、出口のまえで止まった。「うごかないで」の声は、まんぞくそう。';
  if (state.roomShift >= 1) return '「うごかないで」と部屋は言う。……でも部屋のほうは、動いてくれるみたい。';
  if (state.drowse >= 2) return '「うごかないで」の声が、こもりうたみたいに聞こえてくる。';
  return state.seed % 2 === 0
    ? '——うごかないで、と部屋が言っている。一歩も、うごかないで、と。'
    : '「そこから、うごかないでね」と部屋が言う。声は、しんけんだ。';
}

const FEEDBACK_BY_KIND: Record<DontMoveEventKind, FeedbackSignal> = {
  'room.stirs': {
    description: 'レバーに触れると、部屋ぜんたいが、きしんで、みじろぎした。……いま、動いた？',
    valence: 'strange',
  },
  'room.slides': {
    description: 'レバーを引くと、部屋が、すーっと出口のほうへすべった。わたしは、うごいてない。',
    valence: 'good',
  },
  'room.arrives': {
    description: '部屋が、出口のまえで、そっと止まった。とうちゃく、みたい。',
    valence: 'good',
  },
  'room.waits': {
    description: 'じっとしている。なにも起きない。……まぶたが、すこし、おもくなってきた。',
    valence: 'neutral',
  },
  'exit.unreachable': {
    description: '手をのばしても、とどかない。ゆびさきが、空をかいた。',
    valence: 'strange',
  },
  'room.creaks': {
    description: '「……うごいたね？」と、部屋がかなしそうに軋んだ。床が、すこしざわついている。',
    valence: 'strange',
  },
  'floor.tears': {
    description: 'もう一歩、ふみだした。足もとで、床が、びりっと破れた。',
    valence: 'bad',
  },
};

const ALL_AFFORDANCES: readonly Affordance[] = [
  {
    action: 'lever',
    label: '床のレバーに、そっと触れてみる',
    hint: 'ひんやりしてる。どこかに、つながっていそう',
  },
  { action: 'stay', label: '言われたとおり、じっとしている' },
  { action: 'reach', label: 'うごかないまま、出口へ手をのばす' },
  { action: 'step', label: 'おもいきって、一歩ふみだす' },
];

function closure(state: DontMoveState): ClosureHint {
  if (state.turn === 0) return 'opening';
  // 何かの閉じ方が目前＝閉じの予感（残りターン感ではなく局面の質で出す・docs/01）。
  if (
    state.stepped ||
    state.stepWarned ||
    state.roomShift >= ROOM_GOAL - 1 ||
    state.reached >= REACH_LIMIT - 1 ||
    state.drowse >= DROWSE_LIMIT - 1
  ) {
    return 'closing';
  }
  return 'unfolding';
}

export function perceive(state: DontMoveState): AIChanPerception {
  // 終端（満ち／こわれ／すれ違い／見失い）は affordances 空。
  // 空なら runAgentLoop が dead-end として閉じる（docs/09）。バックストップのみで専用経路は無い。
  const affordances: Affordance[] = isTerminal(state) ? [] : [...ALL_AFFORDANCES];

  const exit: SceneElement = {
    ref: EXIT_REF,
    description: exitDescription(state),
    salience: exitSalience(state),
  };

  const feedback: FeedbackSignal[] =
    state.lastKind === null ? [] : [FEEDBACK_BY_KIND[state.lastKind]];

  return {
    turn: state.turn,
    scene: {
      summary: sceneSummary(state),
      elements: [exit, leverElement(state)],
    },
    affordances,
    feedback,
    closure: closure(state),
  };
}
