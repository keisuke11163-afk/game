// 日本バージョンの画面：タイトルの切り替え・和風の言葉と城・忍者が相手から見えないこと。
// 起動済みのサーバーに接続する（PORT=8787 node server/server.js）
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}) });
const errors = [];
const watch = (page) => {
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.text().startsWith('[sync]')) errors.push(m.text()); });
};
const notBusy = (page) => page.waitForFunction(() => !document.querySelector('#app').classList.contains('busy'), {}, { timeout: 30000 });

try {
  // タイトルで「日本」を選ぶと、覚えて読み直し、日本のカード・言葉になる
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 797 }, serviceWorkers: 'block' });
    const page = await context.newPage();
    watch(page);
    await page.goto(base);
    await page.locator('#edition-switch [data-edition="japan"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.edition === 'japan');
    await page.locator('#title-solo').waitFor();
    assert.equal(await page.locator('#edition-switch [data-edition="japan"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.evaluate(() => document.querySelector('#title').scrollHeight <= document.querySelector('#title').clientHeight), true, 'タイトルはスクロールなしで収まる');
    await page.locator('#title-catalog').click();
    assert.match(await page.locator('#guide-title').innerText(), /妖怪/);
    await page.locator('#guide-content [data-type="genin"]').click();
    assert.match(await page.locator('.guide-effect').innerText(), /相手から見えない/);
    await page.screenshot({ path: new URL('japan-guide-390x797.png', output).pathname });
    await context.close();
  }
  // 対戦：日本の城、相手の忍者は見えない（自分の忍者は見える）
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 797 } });
    watch(page);
    const rules = encodeURIComponent(JSON.stringify({ defenseReaction: false }));
    await page.goto(new URL(`?edition=japan&local=1&cpu=hard&debug=1&seed=5&rules=${rules}`, base).href);
    await page.waitForFunction(() => Boolean(window.castlefield?.game()));
    await notBusy(page);
    await page.evaluate(async () => { (await import('./js/ui/config.js')).UI_CONFIG.speed = 0.05; });
    const ids = await page.evaluate(() => { const me = document.querySelector('#app').dataset.viewer; return { me, cpu: castlefield.game().getState(me).playerOrder.find((p) => p !== me) }; });
    assert.ok(await page.locator('#castle-me svg.castle-art').count(), '日本の城（仮の絵）');
    await page.evaluate(async ({ me, cpu }) => { const g = castlefield.game(); g.debugSetHand(me, ['genin', 'ashigaru']); g.debugSetHand(cpu, ['jonin', 'genin']); await castlefield.refresh(); }, ids);
    const cid = await page.evaluate(({ me }) => castlefield.game().getState(me).players[me].hand.find((c) => c.type === 'genin').cardId, ids);
    await page.locator(`#hand .card[data-id="${cid}"]`).click();
    await page.locator('#card-detail .detail-use').click();
    const lane = page.locator('#board .targetable').first();
    if (await lane.count()) await lane.click();
    await notBusy(page);
    assert.equal(await page.locator('#board .soldier').count(), 1, '自分の忍者は見える');
    await page.locator('#end-turn').click();
    await page.waitForFunction(({ me }) => { const s = castlefield.game().getState(null); return !document.querySelector('#app').classList.contains('busy') && s.currentPlayer === me; }, ids, { timeout: 60000 });
    const cpuNinjas = await page.evaluate(({ cpu }) => castlefield.game().players[cpu].soldiers.filter((s) => s.role === 'ninja').length, ids);
    assert.ok(cpuNinjas > 0, 'CPU が忍者を出した');
    const drawnCpu = await page.evaluate(({ cpu }) => { const hidden = castlefield.game().players[cpu].soldiers.filter((s) => s.role === 'ninja').map((s) => s.soldierId); return [...document.querySelectorAll('#board .soldier')].filter((el) => hidden.includes(el.dataset.id)).length; }, ids);
    assert.equal(drawnCpu, 0, '相手の忍者は盤面に出ない');
    await page.screenshot({ path: new URL('japan-battle-390x797.png', output).pathname });
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log('日本バージョン：タイトルの切り替え・図鑑・日本の城・忍者が相手から見えない OK');
} finally {
  await browser.close();
}
