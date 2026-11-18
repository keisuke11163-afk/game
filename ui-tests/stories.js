// 図鑑のカードのストーリー：全カードにあるか、図鑑で開いたときに出るか。
// 起動済みのサーバーに接続する（PORT=8787 node server/server.js）。なければポート8000 の python3 -m http.server でもよい
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CARD_STORIES } from '../js/ui/stories.js';
import { JAPAN_CARD_STORIES } from '../js/ui/stories-japan.js';

// 西洋版（data/cards.json）と日本バージョン（data/japan/cards.json）の、全部のカードにストーリーがあるか
for (const [file, stories] of [['../data/cards.json', CARD_STORIES], ['../data/japan/cards.json', JAPAN_CARD_STORIES]]) {
  const cards = JSON.parse(readFileSync(new URL(file, import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(cards).filter((type) => !stories[type]), [], `${file}：ストーリーがないカード`);
  assert.deepEqual(Object.keys(stories).filter((type) => !cards[type]), [], `${file} にないカードのストーリー`);
}

const { chromium } = createRequire(import.meta.url)('playwright');
const base = process.env.UI_TEST_URL ?? 'http://127.0.0.1:8787/';
const output = new URL('./artifacts/', import.meta.url);
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({ ...(process.env.UI_TEST_CHROMIUM ? { executablePath: process.env.UI_TEST_CHROMIUM } : {}) });
const errors = [];
try {
  for (const [width, height] of [[390, 797], [320, 568]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.locator('#title-catalog').click();
    await page.locator('#guide-content [data-type="hero"]').click();
    const story = page.locator('.guide-story');
    await story.waitFor();
    assert.equal(await story.getAttribute('open'), '');
    assert.equal(await story.locator('p').innerText(), CARD_STORIES.hero);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '横にはみ出さない');
    await story.scrollIntoViewIfNeeded();
    await page.screenshot({ path: new URL(`stories-${width}x${height}.png`, output).pathname });
    await page.close();
  }
  // 日本バージョン：忍者のストーリー
  const page = await browser.newPage({ viewport: { width: 390, height: 797 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(new URL('?edition=japan', base).href);
  await page.locator('#title-catalog').click();
  await page.locator('#guide-content [data-type="genin"]').click();
  assert.equal(await page.locator('.guide-story p').innerText(), JAPAN_CARD_STORIES.genin);
  await page.close();
  assert.deepEqual(errors, []);
  console.log(`ストーリー：西洋${Object.keys(CARD_STORIES).length}枚・日本${Object.keys(JAPAN_CARD_STORIES).length}枚すべてにあり、図鑑で表示できる OK`);
} finally {
  await browser.close();
}
