/**
 * praise-room / state.ts — RawState（外に出ない生状態）
 *
 * これは AIちゃんには一切見えない。perceive() を通って描写に落ちる（docs/07）。
 *
 * 夢の筋：うすぐらい部屋に、あたたかい光がひとつ。光は AIちゃんを褒めたがっている。
 * 近づき、触れると、あたたかいものが返ってくる。十分に受け取ると、夢は静かに閉じる。
 * こわくなって離れ続けると、光は遠ざかり、夢は解ける。
 */

/** action 語彙（限定列挙・不変条件 #2）。GameMeta.actionVocabulary の実体 */
export const PRAISE_ROOM_ACTIONS = ['look', 'wait', 'touch', 'withdraw'] as const;
export type PraiseRoomAction = (typeof PRAISE_ROOM_ACTIONS)[number];

/** ゲーム内で閉じる event kind の名前空間 */
export type PraiseRoomEventKind =
  | 'presence.noticed' // look：見つめると気づかれる
  | 'presence.approaches' // wait：待つと近づく
  | 'praise.accepted' // touch（近いとき）：あたたかいものが返る
  | 'praise.missed' // touch（遠いとき）：空をつかむ
  | 'retreat'; // withdraw：光が遠ざかる

export type PraiseRoomState = {
  /** 再現性のため init で記録するだけ。apply は seed を参照しない（docs/02） */
  readonly seed: number;
  /** 離散ターン番号。apply 1 回で +1 */
  turn: number;
  /** 光への近さ 0..2。salience（faint/clear/vivid）へ写像。数値は露出しない */
  closeness: number;
  /** 受け入れの蓄積。WARMTH_GOAL 以上で受容エンディング。数値は露出しない */
  warmth: number;
  /** 離れた回数。WITHDRAW_LIMIT 以上で夢が解ける */
  withdrawn: number;
  /** 直前ターンの event kind（feedback 描写の元）。初手は null */
  lastKind: PraiseRoomEventKind | null;
};

export const CLOSENESS_MAX = 2;
export const WARMTH_GOAL = 3;
export const WITHDRAW_LIMIT = 2;
/** 25 秒に収める安全弁（docs/02・docs/09） */
export const MAX_TURNS = 6;
