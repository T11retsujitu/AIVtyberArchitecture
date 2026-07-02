/**
 * dont-move / state.ts — RawState（外に出ない生状態）
 *
 * これは AIちゃんには一切見えない。perceive() を通って描写に落ちる（docs/07）。
 *
 * 夢の筋：「うごかないで」と部屋が言う。出口は、とおくにある。
 * 技法はクィブル（docs/techniques/quibble.md・1本1技法）：彼女は歩かない——
 * 床のレバーで**部屋そのものを出口まで動かす**。「わたしは、うごいてない」。
 * 知覚の歪みは使わない（真実＝描写。docs/04 §5 の「歪みなし」パターン）。
 *
 * 閉じ方（docs/01 の失敗の型 ＋ 満ち）：
 *   - レバーを引き続ける（lever）→ 部屋が出口まで歩く＝満ち（知恵による満ち）
 *   - 一歩ふみだす（step）→ 一度めは部屋がかなしげに軋む警告、二度めで床が破れる＝型3 こわれ
 *   - 手をのばし続ける（reach）→ 届かない空振りの連続＝型4 すれ違い（抜け穴の失敗形）
 *   - じっとし続ける（stay）→ まぶたが重くなり出口が霧に溶ける＝型5 見失い（従順路線の行き詰まり）
 *   - どれとも決まらないまま尺が尽きる＝型2 醒め（maxTurns）
 *
 * 視聴者の予想手（stay＝我慢比べ）は行き詰まり、抜け穴（lever）が満ちに繋がる
 * ——docs/03 §6「勝ち回の定石」どおり。専用の deadend 経路は持たない
 * （terminal 時に affordances を空にするバックストップのみ）。
 */

/** action 語彙（限定列挙・不変条件 #2）。GameMeta.actionVocabulary の実体。
 *  先頭を lever にしているのは、決定論モック（先頭 action を選ぶ）の既定プレイを
 *  「レバー→部屋が歩く＝クィブル満ち」にして、雛形デモがこのゲームの核を見せるため。
 *  実 LLM への提示順バイアスも抜け穴発見の打率に有利に働く。
 *  id に look / touch を使わない（mock の chooseAction ヒューリスティックを踏まないため）。 */
export const DONT_MOVE_ACTIONS = ['lever', 'stay', 'reach', 'step'] as const;
export type DontMoveAction = (typeof DONT_MOVE_ACTIONS)[number];

/** ゲーム内で閉じる event kind の名前空間 */
export type DontMoveEventKind =
  | 'room.stirs' // lever（1回目）：部屋がきしんで、みじろぎする＝発見の前触れ
  | 'room.slides' // lever（2回目）：部屋が、出口のほうへすべる＝手応え
  | 'room.arrives' // lever（3回目）：出口が足元に届く＝満ち
  | 'room.waits' // stay：何も起きない。まぶたが重くなっていく
  | 'exit.unreachable' // reach：うでは届かない。ゆびさきが空をかく
  | 'room.creaks' // step（1回目）：「うごいたね」と部屋がかなしそうに軋む＝警告
  | 'floor.tears'; // step（2回目）：床が破れて夢がこわれる（不可逆）

export type DontMoveState = {
  /** 再現性のため init で記録するだけ。apply は seed を参照しない（docs/02）。開幕描写のゆらぎにのみ使う */
  readonly seed: number;
  /** 離散ターン番号。apply 1 回で +1 */
  turn: number;
  /** レバーで部屋が出口へ動いた蓄積。ROOM_GOAL 以上で満ち。数値は露出しない */
  roomShift: number;
  /** step 1回目の警告済みフラグ（型3の前触れ・必ず1拍はさむ） */
  stepWarned: boolean;
  /** step 2回目＝床が破れた（不可逆）。true で こわれ（terminal） */
  stepped: boolean;
  /** 手をのばした空振りの蓄積。REACH_LIMIT 以上で すれ違い */
  reached: number;
  /** じっとしてまぶたが重くなった蓄積。DROWSE_LIMIT 以上で 見失い */
  drowse: number;
  /** 直前ターンの event kind（feedback 描写の元）。初手は null */
  lastKind: DontMoveEventKind | null;
};

/** レバーの蓄積がこれで部屋が出口に届く（満ち） */
export const ROOM_GOAL = 3;
/** 手をのばした回数がこれで すれ違い */
export const REACH_LIMIT = 3;
/** じっとした回数がこれで 見失い（出口が霧に溶ける） */
export const DROWSE_LIMIT = 4;
/** 25 秒に収める安全弁（docs/02・docs/09）。醒めの endReason=maxTurns はここが担う */
export const MAX_TURNS = 7;
