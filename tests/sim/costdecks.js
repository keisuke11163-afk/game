// コスト制の見本のデッキ（decks.json の costDeck: true）どうしの勝率。smart 同士、席を入れかえて回す。
//   node tests/sim/costdecks.js [--games 150]
import { runMany } from './sim.js';
import { buildData, loadOptionalData } from '../helpers.js';

const games = Number(process.argv[process.argv.indexOf('--games') + 1]) || 150;
// --set japan で日本バージョンのデッキ
const set = process.argv.includes('--set') ? process.argv[process.argv.indexOf('--set') + 1] : null;
const { cards, rules } = buildData({ rules: { deckMode: 'cost' }, set });
const opts = loadOptionalData(set);
const ids = Object.keys(opts.decks).filter((id) => opts.decks[id].costDeck);
console.log(`コスト制の見本（smart 同士・各 ${games * 2} 試合）。勝率は左のデッキの勝つ割合（目安 45〜55%）`);
for (const a of ids) {
  for (const b of ids) {
    if (a >= b) continue;
    const run = (seed, x, y) => runMany({ games, seed, cards, rules, strategies: ['smart', 'smart'], gameOptions: { ...opts, setup: { decks: [x, y] } } });
    const r1 = run(1, a, b);
    const r2 = run(2, b, a);
    const win = (r1.winRate.p1 + r2.winRate.p2) / 2;
    console.log(`${a} vs ${b}: ${(win * 100).toFixed(0)}%・平均${r1.avgTurns.toFixed(0)}手番・決着 ${r1.decided}/${r1.games}`);
  }
}
