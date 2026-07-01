/**
 * dont-press-button / demo.ts — 縦 1 本を回して trace を眺める（鍵不要）
 *
 *   pnpm --filter @dream/dont-press-button build
 *   node packages/games/dont-press-button/dist/demo.js [seed]
 *
 * seed は 引数 > 環境変数 DREAM_SEED > 既定 1 の順（docs/10）。
 * DreamTrace を DREAM_TAKE_OUT_DIR（既定 ./takes）に JSON 書き出しする。
 * これが packages/render の Tier A ビューアの入力になる（docs/11 §8）。
 *
 * 本物の LLM に差し替えるときは createMockLlmClient を NIM 等に置くだけ（DREAM_LLM=nim）。
 */

import { randomUUID } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { LlmClient } from '@dream/core';
import { runAgentLoop, createActionValidator, createPromptBuilder, createNimLlmClient } from '@dream/core';
import { createMockLlmClient } from '@dream/core/testing';
import { dontPressButton } from './game.js';
import { nimConfigFromEnv } from './nim-env.js';

/** client を選ぶ（docs/13 §1）：DREAM_LLM=nim なら本物、既定は決定論モック。 */
function selectLlm(): { llm: LlmClient; model: { provider: string; name: string; params?: Record<string, unknown> } } {
  if (process.env.DREAM_LLM === 'nim') {
    const cfg = nimConfigFromEnv();
    return {
      llm: createNimLlmClient(cfg),
      model: { provider: 'nim', name: cfg.model, params: { temperature: cfg.temperature ?? 0.8 } },
    };
  }
  return { llm: createMockLlmClient(), model: { provider: 'mock', name: 'deterministic-mock' } };
}

async function main(): Promise<void> {
  const seedArg = process.argv[2] ?? process.env.DREAM_SEED;
  const seed = seedArg ? Number(seedArg) : 1;
  if (!Number.isFinite(seed)) throw new Error(`seed が数値ではありません: ${String(seedArg)}`);

  const { llm, model } = selectLlm();

  const trace = await runAgentLoop(
    dontPressButton,
    {
      llm,
      prompt: createPromptBuilder(),
      validator: createActionValidator(),
    },
    {
      seed,
      // provenance はアプリ側で注入する。core は時計/乱数を持たない（docs/12 B）。
      provenance: {
        runId: randomUUID(),
        createdAt: new Date().toISOString(),
        model,
        promptVersion: 'prompt/0.1',
        characterBibleVersion: 'character-bible/0.1',
        gameVersion: '0.0.0', // TODO: package.json の version と揃える
      },
    },
  );

  console.log(`\n=== ${trace.title}（${trace.gameId}）seed=${trace.seed} ===`);
  if (trace.hook) console.log(`（フック）${trace.hook}`);
  for (const t of trace.turns) {
    const mark = t.corrected ? ' [是正]' : '';
    console.log(`\n[${t.perception.closure}] ${t.perception.scene.summary}`);
    console.log(`  AIちゃん: ${t.response.speech}`);
    console.log(`  → ${t.action}${mark}`);
  }
  // 終端リアクション（docs/09 Closing Beat）：夢が閉じたあとの締めの一言
  if (trace.closing) console.log(`\n[閉じ] AIちゃん: ${trace.closing.response.speech}`);
  console.log(`\n--- 終わり方: ${trace.endReason} / ${trace.turns.length} ターン ---`);

  // trace を JSON で書き出す（映像フローの唯一の受け渡し点・docs/11 §0）
  const outDir = resolve(process.env.DREAM_TAKE_OUT_DIR ?? './takes');
  mkdirSync(outDir, { recursive: true });
  const outPath = resolve(outDir, `${trace.gameId}-seed${trace.seed}.json`);
  writeFileSync(outPath, JSON.stringify(trace, null, 2), 'utf8');
  console.log(`\ntrace → ${outPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
