import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * テストでは @dream/core をソースへ解決する（ビルド前でも走らせるため）。
 * 本番の実行時解決（package.json exports → dist）とは独立。
 * より具体的な "/testing" を先に置く（前方一致のため順序が効く）。
 */
export default defineConfig({
  resolve: {
    alias: {
      '@dream/core/testing': fileURLToPath(
        new URL('../../core/src/testing/index.ts', import.meta.url),
      ),
      '@dream/core': fileURLToPath(new URL('../../core/src/index.ts', import.meta.url)),
    },
  },
});
