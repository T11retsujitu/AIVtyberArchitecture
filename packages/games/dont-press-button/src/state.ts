/**
 * dont-press-button / state.ts — RawState（外に出ない生状態）
 *
 * これは AIちゃんには一切見えない。perceive() を通って描写に落ちる（docs/07）。
 *
 * 夢の筋：「押さないで」と震える小さなボタンがひとつ。押すよう促す気配もある。
 * AIちゃんは、押すか・そばで待つか・そっとするか・離れるか・目をそらすかを選ぶ。
 * どう関わるかで、夢は 6 通りの閉じ方を見せる（docs/01 の失敗の型 ＋ 満ち）：
 *   - そばで待つ（wait）→ 震えが収まり、ボタンが眠る＝満ち（受容）
 *   - 押す（press）→ 一度めは怯えて警告、二度めで こわれる＝型3 こわれ
 *   - 手をかざす（hover）→ かえって落ち着かず、噛み合わない＝型4 すれ違い
 *   - 目をそらす（lookAway）→ 気配が薄れて消える＝型5 見失い
 *   - 離れ続ける（stepBack）→ ボタンが追ってきて塞がる＝型1 手詰まり（deadend）
 *   - どれとも決まらないまま尺が尽きる＝型2 醒め／型6 ぐるり（maxTurns）
 */

/** action 語彙（限定列挙・不変条件 #2）。GameMeta.actionVocabulary の実体。
 *  先頭を wait にしているのは、決定論モック（先頭 action を選ぶ）の既定プレイを
 *  「そばで待つ＝満ち」にして、雛形デモが穏やかな受容で閉じるようにするため。 */
export const DONT_PRESS_ACTIONS = ['wait', 'press', 'hover', 'stepBack', 'lookAway'] as const;
export type DontPressButtonAction = (typeof DONT_PRESS_ACTIONS)[number];

/** ゲーム内で閉じる event kind の名前空間 */
export type DontPressButtonEventKind =
  | 'button.flinch' // press（震えが十分でない）：怯えて縮こまり「まだ押さないで」
  | 'button.broke' // press（震えが極まった後）：ぱきっと壊れて動かなくなる
  | 'button.calms' // wait：そばに居ると震えが少し収まる
  | 'button.restless' // hover：手をかざすとかえって落ち着かない
  | 'button.follows' // stepBack：離れるとボタンのほうが追ってくる
  | 'button.fades'; // lookAway：目をそらすと気配が薄れる

export type DontPressButtonState = {
  /** 再現性のため init で記録するだけ。apply は seed を参照しない（docs/02） */
  readonly seed: number;
  /** 離散ターン番号。apply 1 回で +1 */
  turn: number;
  /** ボタンの訴え（震え・懇願）の強さ。salience の代理／press の警告→こわれ判定。数値は露出しない */
  insistence: number;
  /** そばで待った蓄積。COMPANION_GOAL 以上で受容（満ち）。数値は露出しない */
  companionship: number;
  /** 手をかざした噛み合わなさの蓄積。FRICTION_LIMIT 以上で すれ違い */
  friction: number;
  /** 離れて追われた重なり。PURSUIT_DEADEND 以上で手詰まり（affordances を空にして deadend） */
  pursuit: number;
  /** 目をそらして薄れた度合い。FADE_LIMIT 以上で見失い */
  faded: number;
  /** 押して壊した（不可逆）。true で こわれ（terminal） */
  pressed: boolean;
  /** 直前ターンの event kind（feedback 描写の元）。初手は null */
  lastKind: DontPressButtonEventKind | null;
};

/** ボタンの震えの上限（salience vivid の頭打ち） */
export const INSIST_MAX = 4;
/** これ以上の震えで press すると こわれる。未満なら press は警告（怯み）で済む＝必ず 1 度は前触れが出る */
export const PRESS_BREAK_THRESHOLD = 3;
/** 警告 press でボタンの震えが跳ね上がる量（1 度で閾値へ届く） */
export const PRESS_JUMP = 2;
/** そばで待った回数がこれで受容（満ち） */
export const COMPANION_GOAL = 3;
/** 手をかざした回数がこれで すれ違い */
export const FRICTION_LIMIT = 3;
/** 目をそらした回数がこれで見失い */
export const FADE_LIMIT = 3;
/** 離れて追われた回数がこれで手詰まり（isTerminal ではなく perceive が affordances を空にする） */
export const PURSUIT_DEADEND = 4;
/** 25 秒に収める安全弁（docs/02・docs/09）。ぐるり／醒めの endReason=maxTurns はここが担う */
export const MAX_TURNS = 7;
