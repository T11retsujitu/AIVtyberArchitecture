/**
 * serve.mjs — 依存ゼロの静的サーバ（任意）。?src= で take を fetch したいとき用。
 *
 *   node packages/render/serve.mjs [port] [root]
 *
 * 既定 root はリポジトリのカレント（cwd）。ビューアと takes/ の両方を同一オリジンで配れる：
 *   http://localhost:5173/packages/render/viewer/?src=/takes/praise-room-seed42.json
 *
 * サーバ不要ならビューアに .json をドラッグ&ドロップするだけでよい（file:// でも動く）。
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const port = Number(process.argv[2]) || 5173;
const root = resolve(process.argv[3] ?? '.');
const TYPES = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.json':'application/json',
  '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webm':'video/webm' };

createServer(async (req, res) => {
  try {
    const url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    // ディレクトリトラバーサル防止：正規化後も root 配下であること
    const path = normalize(join(root, url === '/' ? '/packages/render/viewer/index.html' : url));
    if (!path.startsWith(root)) { res.writeHead(403).end('forbidden'); return; }
    const body = await readFile(path);
    res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('not found');
  }
}).listen(port, () => {
  console.log(`serving ${root} → http://localhost:${port}/packages/render/viewer/`);
  console.log(`例: http://localhost:${port}/packages/render/viewer/?src=/takes/praise-room-seed42.json`);
});
