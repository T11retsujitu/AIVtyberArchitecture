/**
 * play-api/contract.ts — DreamGame 契約
 *
 * 規範は docs/02-play-api-contract.md。食い違ったら doc を正とする。
 *
 * core のエージェントループ（runAgentLoop）はこの契約「だけ」に依存し、
 * 個々のゲームの中身（RawState の形）を一切知らない。
 */

import type { AIChanPerception, Valence } from '../perception/schema.js';

/** ゲームのメタ情報。actionVocabulary は breaking change 管理の対象（不変条件 #4） */
export type GameMeta<A extends string = string> = {
  /** 安定ID（"praise-room"）。ディレクトリ名と一致させる */
  id: string;
  /** 夢のタイトル（表示・字幕用） */
  title: string;
  /** 全 action 語彙。これが契約の核。3ゲーム実装後は breaking change 禁止 */
  actionVocabulary: readonly A[];
  /** 25秒に収まるターン上限。ループの安全弁 */
  maxTurns: number;
};

/** apply() の 1 ターンで起きたこと。perceive 側で feedback の描写に変換される素材 */
export type GameEvent = {
  /** 機械可読な種別（"praise.accepted" 等。ゲーム内で閉じる名前空間） */
  kind: string;
  /** 質的な含み。perceive が feedback.valence へ写像する手がかり（任意） */
  valence?: Valence;
};

/** apply() の戻り。入力 state は不変、新しい state とイベントを返す */
export type ApplyResult<S> = {
  state: S;
  events: GameEvent[];
};

/**
 * 「AIちゃんが夢の中でプレイできる 1 本のゲーム」を表す最小インターフェース。
 *
 * 不変条件：
 * - apply は純粋（入力 state を変更しない／同じ入力→同じ出力）。乱数は RawState 内の
 *   seed 由来の決定論的乱数のみ。
 * - perceive は state を変更しない（読み取り専用）。座標・px・秒を必ず質に変換する（docs/07）。
 * - actionVocabulary 外の action が apply に来たら validator のバグ。apply は例外にしてよい。
 */
export interface DreamGame<S, A extends string = string> {
  readonly meta: GameMeta<A>;

  /** seed から初期状態を作る。決定論：同じ seed → 同じ初期状態 */
  init(seed: number): S;

  /** 生状態 → AIちゃんが見る描写。AIChanPerception 以外は LLM に出さない */
  perceive(state: S): AIChanPerception;

  /** 決定論的遷移。state を破壊変更せず、新しい状態とイベントを返す */
  apply(state: S, action: A): ApplyResult<S>;

  /** 終端判定。true なら夢は閉じる */
  isTerminal(state: S): boolean;
}

/** DreamGame の S / A をユーティリティとして取り出すための型ヘルパ */
export type GameState<G> = G extends DreamGame<infer S, string> ? S : never;
export type GameAction<G> = G extends DreamGame<unknown, infer A> ? A : never;
