/**
 * agent/types.ts — ループが依存するコンポーネント契約（docs/09）
 *
 * いずれもプロバイダ非依存・差し替え可能。core はこの型「だけ」を知り、
 * 個々のゲームの中身も具体的な LLM プロバイダも知らない。
 */

import type { AIChanPerception, Affordance } from '../perception/schema.js';
import type { AgentResponse } from './response-schema.js';
import type { agentResponseJsonSchema } from './response-schema.js';

/** プロバイダ非依存のメッセージ表現 */
export type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

/** prompt-builder に渡る最小コンテキスト。memory atom（docs/08）は次Wave */
export type PromptContext = {
  /** 夢のタイトル。キャラ表現には影響させない */
  title: string;
};

/**
 * LlmClient — 構造化出力の強制（不変条件 #3）。
 * structured output / JSON mode を必ず使い、返す前に AgentResponseSchema.parse を通す。
 * 形が壊れていれば throw する（語彙外 action はここではなく action-validator が扱う）。
 */
export interface LlmClient {
  complete(
    messages: ChatMessage[],
    schema: typeof agentResponseJsonSchema,
  ): Promise<AgentResponse>;
}

/** prompt-builder — docs/00 §1–4 ＋ perception を messages に組む */
export interface PromptBuilder {
  build(perception: AIChanPerception, ctx: PromptContext): ChatMessage[];
  /** 語彙外 action を是正するための追い投げメッセージ */
  correction(validActions: string[]): ChatMessage;
}

/** validator の再要求ハンドル。有効な action 一覧を添えて LLM に投げ直す */
export type Reask = (validActions: string[]) => Promise<AgentResponse>;

export type ResolveResult = {
  /** affordances 内に必ず含まれる（apply に渡して安全） */
  action: string;
  /** LLM 初回 action が語彙外で是正したか（劣化マーク） */
  corrected: boolean;
  /** 再試行後の最終応答（observation/speech 込み） */
  finalResponse: AgentResponse;
};

/**
 * action-validator — 語彙の妥当性と是正（docs/09）。
 * resolve は必ず affordances 内の action を返す。affordances は非空である前提
 * （空のときはループが手前で dead-end 終了させ、resolve を呼ばない）。
 */
export interface ActionValidator {
  resolve(
    response: AgentResponse,
    affordances: Affordance[],
    reask: Reask,
  ): Promise<ResolveResult>;
}
