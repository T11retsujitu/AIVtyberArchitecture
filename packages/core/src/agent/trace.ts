/**
 * agent/trace.ts — DreamTrace（take の素材。docs/09）
 *
 * ループの唯一の成果物。Mode B+ では複数 take を撮り、この trace を見て人間が選定する。
 * 後段（voice / overlay / recorder・次Wave）はこれだけを入力にする。
 */

import type { AIChanPerception } from '../perception/schema.js';
import type { GameEvent } from '../play-api/contract.js';
import type { AgentResponse } from './response-schema.js';

export type EndReason = 'terminal' | 'deadend' | 'maxTurns' | 'invalidAction';

/**
 * take 失敗の記録（endReason==='invalidAction' のときだけ付く）。
 * 語彙外 action を再試行で直せず、apply できないまま閉じた不良 take のデバッグ素材。
 * 描画前に捨てる前提（Mode B+）。turns には積まない（TraceTurn は valid action 前提）。
 */
export type TraceFailure = {
  reason: 'invalidAction';
  /** 失敗したターン番号 */
  turn: number;
  /** そのターン AIちゃんが見たもの */
  perception: AIChanPerception;
  /** 最後に返ってきた（なお語彙外の）応答 */
  lastResponse: AgentResponse;
  /** 評価した応答の総数（初回 + reask 回数） */
  attempts: number;
};

export type TraceTurn = {
  turn: number;
  /** そのターン AIちゃんが見たもの（描写の再構築素材） */
  perception: AIChanPerception;
  /** 採用された最終応答（再試行後） */
  response: AgentResponse;
  /** 実際に apply へ渡した action（是正後・affordances 内） */
  action: string;
  /** 初回 action が語彙外で是正されたか（劣化マーク） */
  corrected: boolean;
  /** apply が返した生イベント（feedback の元） */
  events: GameEvent[];
};

export type DreamTrace = {
  gameId: string;
  title: string;
  seed: number;
  endReason: EndReason;
  turns: TraceTurn[];
  /** endReason==='invalidAction' のときだけ付く不良 take のデバッグ素材 */
  failure?: TraceFailure;
};
