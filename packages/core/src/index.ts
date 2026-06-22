/**
 * @dream/core — 公開 API
 *
 * Phase 0 は契約だけを公開する。runAgentLoop / llm-client / prompt-builder /
 * action-validator / trace / memory / voice / overlay / recorder は次Wave以降。
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
