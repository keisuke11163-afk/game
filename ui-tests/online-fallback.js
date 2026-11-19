// SSE が届かない中継（Cloudflare のクイックトンネルなど）でも、オンライン対戦ができるかのテスト：node ui-tests/online-fallback.js
// /api/stream を止めて（返事をしない）、2人が同じ合言葉で部屋に入り、部屋主が始めて、2人とも手札が配られるまでを確かめる。
// 画面はロングポーリング（/api/poll）に自動で切りかえる。サーバーは一時のデータベースで自分で起動する。
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'cf-ui-'));
const port = 8890 + Math.floor(Math.random() * 100);
const base = `http://127.0.0.1:${port}/`;
const server = spawn('node', ['server/server.js'], { cwd: root, env: { ...process.env, PORT: String(port), CF_DB_PATH: join(dir, 'ui.db') }, stdio: 'ignore' });
let browser;
try {
  for (let n = 0; n < 50; n++) { try { if ((await fetch(base)).ok) break; } catch { /* 起動待ち */ } await new Promise((r) => setTimeout(r, 100)); }
  browser = await chromium.launch();
  const errors = [];
  const pass = `fallback-${Date.now()}`;
  const player = async (label) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
    await ctx.route('**/api/stream**', () => { /* 中継が溜め込んで、何も返さない */ });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
    await page.goto(base);
    await page.locator('#home:not([hidden]):not(.home-local)').waitFor({ timeout: 10000 });
    await page.click('#home .home-tile[data-id=casual]');
    await page.fill('#title-pass', pass);
    await page.click('#title-join');
    await page.locator('#room-screen:not([hidden])').waitFor({ timeout: 10000 }); // SSE を4秒待ってから切りかえる
    return page;
  };
  const A = await player('A');
  const B = await player('B');
  await A.locator('#room-screen .room-seat').nth(1).waitFor({ timeout: 10000 }); // 部屋主の画面に、あとから入った人が出る
  assert.equal(await A.locator('#room-screen .room-seat').count(), 2);
  assert.equal(await B.locator('#room-screen .room-seat').count(), 2);
  assert.equal(await A.evaluate(() => sessionStorage.getItem('cf-online-transport')), 'poll');
  await A.locator('.room-start').click();
  for (const page of [A, B]) {
    await page.waitForFunction(() => document.querySelectorAll('#hand .card').length > 0, null, { timeout: 15000 });
  }
  assert.deepEqual(errors, []);
  console.log('SSE が届かない中継でのオンライン対戦：OK');
} finally {
  await browser?.close(); server.kill(); rmSync(dir, { recursive: true, force: true });
}
