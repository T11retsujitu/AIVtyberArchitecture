/**
 * agent/trace.ts — DreamTrace（take の素材。docs/09）
 *
 * ループの唯一の成果物。Mode B+ では複数 take を撮り、この trace を見て人間が選定する。
 * 後段（voice / overlay / recorder・次Wave）はこれだけを入力にする。
 */

import type { AIChanPerception } from '../perception/schema.js';
import type { GameEvent } from '../play-api/contract.js';
import type { AgentResponse, ClosingResponse } from './response-schema.js';

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

/**
 * take の素性（provenance・docs/12 B）。ゲーム面は seed+action 列で決定論再生できるが、
 * LLM/音声の出力は非決定論なので「入力の素性」を残して後で再現できるようにする。
 * runId/createdAt/model 等は core が生成せず**依存注入**する（決定論の足場を壊さないため）。
 * 未指定のフィールドは 'unknown' で埋まる。audio/video の実パスは下流（docs/11 の ArtifactManifest）。
 */
export type TraceProvenance = {
  /** この take の一意 ID（依存注入。未指定なら 'unknown'） */
  runId: string;
  /** 生成時刻 ISO8601（依存注入。core は時計を呼ばない。未指定なら 'unknown'） */
  createdAt: string;
  /** ゲーム実装の版・コミット（再現用・任意） */
  gameVersion?: string;
  gameCommitSha?: string;
  /** LLM の素性（呼び出し側が構築した client の情報） */
  model: { provider: string; name: string; params?: Record<string, unknown> };
  /** プロンプト版・キャラBible版（docs/00） */
  promptVersion: string;
  characterBibleVersion: string;
};

/**
 * 終端リアクション（Closing Beat・docs/09）。夢が閉じたあと、最後の state を perceive し直して
 * 生成する「行動なしの締めのひとこと」。**apply を呼ばず turns にも積まない**ので、
 * trace.turns.map(t => t.action) のリプレイ決定論には一切影響しない（非決定論なのは speech だけ）。
 * endReason が terminal/deadend/maxTurns のときに best-effort で付く（invalidAction には付かない）。
 * LlmClient.closing 未実装 or 生成失敗のときは undefined（締めは garnish なので take は捨てない）。
 * render（docs/11）は turns の後に closing.response.speech を最後の字幕・締めの絵として使う。
 */
export type ClosingBeat = {
  /** 終端 state を perceive() した最後の画面（描写のみ。action は促さない） */
  perception: AIChanPerception;
  /** 締めのひとこと（observation ＋ speech、action なし） */
  response: ClosingResponse;
};

export type DreamTrace = {
  gameId: string;
  title: string;
  seed: number;
  endReason: EndReason;
  turns: TraceTurn[];
  /** 再現に足る素性。常に付く（未指定フィールドは 'unknown'）。docs/12 B */
  provenance: TraceProvenance;
  /**
   * 公開用の冒頭フック（任意）。GameMeta.hook をループが verbatim 複写したもの。
   * 映像フロー（docs/11）の唯一の入力は DreamTrace なので、hook もここを通して render に届く。
   */
  hook?: string;
  /** 終端リアクション（任意・best-effort）。docs/09 Closing Beat */
  closing?: ClosingBeat;
  /** endReason==='invalidAction' のときだけ付く不良 take のデバッグ素材 */
  failure?: TraceFailure;
};
