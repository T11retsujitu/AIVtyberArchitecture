/**
 * agent/trace.ts — DreamTrace（take の素材。docs/09）
 *
 * ループの唯一の成果物。Mode B+ では複数 take を撮り、この trace を見て人間が選定する。
 * 後段（voice / overlay / recorder・次Wave）はこれだけを入力にする。
 */

import type { AIChanPerception } from '../perception/schema.js';
import type { GameEvent } from '../play-api/contract.js';
import type { AgentResponse } from './response-schema.js';

export type EndReason = 'terminal' | 'deadend' | 'maxTurns';

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
};
