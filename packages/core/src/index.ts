/**
 * @dream/core — 公開 API
 *
 * 契約（perception / play-api / agent-response）に加え、縦 1 本を回す
 * agent ループ（runAgentLoop / action-validator / prompt-builder / trace）を公開する。
 * llm-client の本物プロバイダ実装 / memory / voice / overlay / recorder は次Wave以降。
 */

// Perception（全ゲームの境界条件・docs/07）
export type {
  AIChanPerception,
  Scene,
  SceneElement,
  Affordance,
  FeedbackSignal,
  Salience,
  Valence,
  ClosureHint,
} from './perception/schema.js';

// 不変条件 #1 の機械的ガード（perceive() への生メカニクス数値混入検出・docs/07）
export {
  findRawMechanics,
  assertNoRawMechanics,
  RAW_MECHANIC_PATTERNS,
  type RawMechanicViolation,
} from './perception/no-raw-mechanics.js';

// Play API 契約（docs/02）
export type {
  DreamGame,
  GameMeta,
  GameEvent,
  ApplyResult,
  GameState,
  GameAction,
} from './play-api/contract.js';

// Agent 応答スキーマ（不変条件 #3）
export {
  AgentResponseSchema,
  agentResponseJsonSchema,
  type AgentResponse,
} from './agent/response-schema.js';

// Agent ループ（docs/09）
export { runAgentLoop } from './agent/agent-loop.js';
export type { RunAgentLoopDeps, RunAgentLoopOptions } from './agent/agent-loop.js';
export { createActionValidator } from './agent/action-validator.js';
export { createPromptBuilder } from './agent/prompt-builder.js';
export type {
  LlmClient,
  PromptBuilder,
  PromptContext,
  ActionValidator,
  ChatMessage,
  Reask,
  ResolveResult,
} from './agent/types.js';
export type { DreamTrace, TraceTurn, EndReason } from './agent/trace.js';
