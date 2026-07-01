/**
 * nim-env.ts — 環境変数 → NimClientConfig（docs/13 §2）
 *
 * core は @types/node を持たない（fetch は DOM lib 由来）ため、env の読み取りは
 * こちら（@types/node あり）に閉じる。鍵/URL の局所化点は client と本ファイルだけ。
 */

import type { NimClientConfig } from '@dream/core';

/** model を明示して config を組む（bench の複数モデル用） */
export function nimConfigForModel(model: string): NimClientConfig {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error('NVIDIA_API_KEY が未設定です（.env・docs/13 §2）');

  const cfg: NimClientConfig = { apiKey, model };
  if (process.env.NVIDIA_BASE_URL) cfg.baseUrl = process.env.NVIDIA_BASE_URL;
  if (process.env.NIM_TEMPERATURE) {
    const t = Number(process.env.NIM_TEMPERATURE);
    if (!Number.isFinite(t)) throw new Error(`NIM_TEMPERATURE が数値ではありません: ${process.env.NIM_TEMPERATURE}`);
    cfg.temperature = t;
  }
  if (process.env.NIM_STRUCTURED_OUTPUT === 'json_schema') cfg.structuredOutput = 'json_schema';
  return cfg;
}

/** 1 本回す用（demo）。モデルは NIM_MODEL から */
export function nimConfigFromEnv(): NimClientConfig {
  const model = process.env.NIM_MODEL;
  if (!model) throw new Error('NIM_MODEL が未設定です（1 本回すモデル id を指定・docs/13 §2）');
  return nimConfigForModel(model);
}
