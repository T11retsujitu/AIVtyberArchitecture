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

/**
 * ClosingResponse — 夢が閉じたあとの「終端リアクション」（docs/09 Closing Beat）。
 *
 * 通常ターンと違い **action を持たない**。夢はもう閉じていて、選ぶものはない。
 * AIちゃんは最後に見えたものを静かにひとこと残すだけ（observation ＋ speech）。
 * これを AgentResponse で代用しない理由（不変条件 #2/#3）：終端では affordances が空で
 * 「action ∈ affordances」が構造的に成立せず、ダミー action を混ぜると語彙の意味論が壊れ、
 * trace の action 列（リプレイの素）にも偽物が入る。専用の 2 フィールド構造にして正直に分ける。
 *
 * parse は **.strict() にしない**（既定の zod object＝未知キーを strip）。理由：締めは best-effort の
 * garnish で、サーバ側構造化強制が効かないモデル（MEMORY: nim-structured-output-broken）が
 * 通常ターンの癖で余剰 `action` を付けて返しても、それを剥がして observation/speech だけを
 * 採用できるようにするため。これでも「未パース文字列を trace に残さない・observation/speech を
 * 必須の構造として強制する」という #3 の核は保たれる（値の欠落・空文字は弾く）。
 */
export const ClosingResponseSchema = z.object({
  observation: z.string().min(1),
  speech: z.string().min(1),
});

export type ClosingResponse = z.infer<typeof ClosingResponseSchema>;

/** ClosingResponse の JSON Schema ミラー。サーバへの構造ヒント（additionalProperties:false は best-effort） */
export const closingResponseJsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['observation', 'speech'],
  properties: {
    observation: { type: 'string', minLength: 1 },
    speech: { type: 'string', minLength: 1 },
  },
} as const;
