/**
 * praise-room / demo.ts — 縦 1 本を回して trace を眺める（鍵不要）
 *
 *   pnpm --filter @dream/praise-room build
 *   node packages/games/praise-room/dist/demo.js [seed]
 *
 * 本物の LLM に差し替えるときは createMockLlmClient を AnthropicLlmClient 等に置くだけ。
 */

import { runAgentLoop, createActionValidator, createPromptBuilder } from '@dream/core';
import { createMockLlmClient } from '@dream/core/testing';
import { praiseRoom } from './game.js';

async function main(): Promise<void> {
  const seedArg = process.argv[2];
  const seed = seedArg ? Number(seedArg) : 1;

  const trace = await runAgentLoop(
    praiseRoom,
    {
      llm: createMockLlmClient(),
      prompt: createPromptBuilder(),
      validator: createActionValidator(),
    },
    { seed },
  );

  console.log(`\n=== ${trace.title}（${trace.gameId}）seed=${trace.seed} ===`);
  for (const t of trace.turns) {
    const mark = t.corrected ? ' [是正]' : '';
    console.log(`\n[${t.perception.closure}] ${t.perception.scene.summary}`);
    console.log(`  AIちゃん: ${t.response.speech}`);
    console.log(`  → ${t.action}${mark}`);
  }
  console.log(`\n--- 終わり方: ${trace.endReason} / ${trace.turns.length} ターン ---\n`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
