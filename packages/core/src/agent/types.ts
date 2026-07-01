/**
 * agent/types.ts — ループが依存するコンポーネント契約（docs/09）
 *
 * いずれもプロバイダ非依存・差し替え可能。core はこの型「だけ」を知り、
 * 個々のゲームの中身も具体的な LLM プロバイダも知らない。
 */

import type { AIChanPerception, Affordance } from '../perception/schema.js';
import type { AgentResponse, ClosingResponse } from './response-schema.js';
import type { agentResponseJsonSchema, closingResponseJsonSchema } from './response-schema.js';

/** 締めビートを出す終端理由（docs/09 Closing Beat）。invalidAction は含まない（不良 take は締めない） */
export type ClosingReason = 'terminal' | 'deadend' | 'maxTurns';

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
  /**
   * 終端リアクション（docs/09 Closing Beat）を生成する **任意** メソッド。
   * 夢が閉じたあとの締めのひとこと（observation ＋ speech、action なし）を構造化強制で返す。
   * オプショナルにしてあるのは、complete だけを実装した既存クライアント（テストのインライン
   * リテラル等）を壊さないため。runAgentLoop は typeof で存在を確認し、未実装なら締めを省く。
   */
  closing?(
    messages: ChatMessage[],
    schema: typeof closingResponseJsonSchema,
  ): Promise<ClosingResponse>;
}

/** prompt-builder — docs/00 §1–4 ＋ perception を messages に組む */
export interface PromptBuilder {
  build(perception: AIChanPerception, ctx: PromptContext): ChatMessage[];
  /** 語彙外 action を是正するための追い投げメッセージ */
  correction(validActions: string[]): ChatMessage;
  /**
   * 締めビート用の messages を組む（docs/09 Closing Beat）。行動選択を促さず、
   * 「夢はもう閉じた。最後に見えたものを静かにひとこと」だけを求める。reason で締めのトーンを分ける。
   */
  buildClosing(perception: AIChanPerception, ctx: PromptContext, reason: ClosingReason): ChatMessage[];
}

/** validator の再要求ハンドル。有効な action 一覧を添えて LLM に投げ直す */
export type Reask = (validActions: string[]) => Promise<AgentResponse>;

/**
 * resolve の結果（判別可能ユニオン・docs/12）。
 * - ok:true  … action は affordances 内（apply に渡して安全）。reask で直った場合は corrected:true。
 * - ok:false … 再試行を使い切ってもなお語彙外。フォールバックせず take を失敗にする（#5）。
 */
export type ResolveOutcome =
  | {
      ok: true;
      /** affordances 内に必ず含まれる */
      action: string;
      /** LLM 初回 action が語彙外で、reask で是正したか（軽い劣化マーク） */
      corrected: boolean;
      /** 採用した最終応答（observation/speech 込み） */
      finalResponse: AgentResponse;
    }
  | {
      ok: false;
      reason: 'invalidAction';
      /** 評価した応答の総数（初回 + reask 回数） */
      attempts: number;
      /** 最後に返ってきた（なお語彙外の）応答 */
      lastResponse: AgentResponse;
    };

/**
 * action-validator — 語彙の妥当性と是正（docs/09）。
 * ok:true なら action は affordances 内（apply に渡して安全）。affordances は非空である前提
 * （空のときはループが手前で dead-end 終了させ、resolve を呼ばない）。
 * 再試行を使い切ってもなお語彙外なら ok:false（invalidAction）を返す。フォールバックしない。
 */
export interface ActionValidator {
  resolve(
    response: AgentResponse,
    affordances: Affordance[],
    reask: Reask,
  ): Promise<ResolveOutcome>;
}
