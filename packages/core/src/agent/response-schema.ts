/**
 * agent/response-schema.ts — AgentResponse（LLM 出力の構造化）
 *
 * 規範は docs/09-agent-loop-spec.md。AgentResponse の形そのものは
 * 不変条件 #3「LLM応答は JSON mode / structured output で強制」の実体。
 *
 * 注意：action が「今ターンの affordances に含まれるか」はここでは検証しない。
 * ターン依存の限定列挙は zod 静的スキーマでは表せないため、action-validator（次Wave）が
 * perception.affordances を参照して別途検証する。ここでは構造と最低限の形だけ強制する。
 */

import { z } from 'zod';

export const AgentResponseSchema = z
  .object({
    /** AIちゃんの内的観察メモ。キャラ表現（生真面目さ）。表側字幕には出さなくてよい */
    observation: z.string().min(1),
    /** 発話。25秒ショートのセリフ。メカニクス語・技術用語を含めない（docs/00） */
    speech: z.string().min(1),
    /** 選択した action id。語彙の妥当性は action-validator が検証する */
    action: z.string().min(1),
  })
  .strict();

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/** structured output / tool 定義に渡すための JSON Schema（プロバイダ非依存の素材） */
export const agentResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['observation', 'speech', 'action'],
  properties: {
    observation: { type: 'string', minLength: 1 },
    speech: { type: 'string', minLength: 1 },
    action: { type: 'string', minLength: 1 },
  },
} as const;
