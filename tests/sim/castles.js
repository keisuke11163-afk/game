// 城の種類とデッキのシミュレーション（STEP 5）。2人・smart 同士で、p1 だけ種類を変えて p1 の勝率を見る（p2 はふつうの城／バランスのデッキ）。
// 席を入れかえた試合も回して平均する（先攻・後攻の差を消すため）。
//   node tests/sim/castles.js [--games 500]
import { buildData, loadOptionalData } from '../helpers.js';
import { runMany } from './sim.js';

const args = process.argv.slice(2);
const games = Number(args[args.indexOf('--games') + 1] || 500);
const opts = loadOptionalData();
const { rules, cards } = buildData();
const pct = (x) => `${Math.round(x * 100)}%`;

function rate(setupA, setupB, extraRules = {}) {
  const r = { ...rules, ...extraRules };
  const a = runMany({ games, seed: 1, cards, rules: r, strategies: ['smart', 'smart'], gameOptions: { ...opts, setup: setupA } });
  const b = runMany({ games, seed: 2, cards, rules: r, strategies: ['smart', 'smart'], gameOptions: { ...opts, setup: setupB } });
  return { win: ((a.winRate.p1 || 0) + (b.winRate.p2 || 0)) / 2, turns: (a.avgTurns + b.avgTurns) / 2 };
}

console.log(`各 ${games}×2 試合（席を入れかえ）。smart 同士`);
console.log('| 城の種類 | ふつうの城に勝つ割合 | 平均手番 |');
console.log('|---|---|---|');
for (const t of Object.keys(opts.castles)) {
  const r = rate({ castles: [t, 'standard'] }, { castles: ['standard', t] });
  console.log(`| ${opts.castles[t].name}（${t}） | ${pct(r.win)} | ${r.turns.toFixed(0)} |`);
}
console.log('');
console.log('| デッキ（own） | バランスに勝つ割合 | 平均手番 |');
console.log('|---|---|---|');
for (const d of Object.keys(opts.decks)) {
  const r = rate({ decks: [d, 'balanced'] }, { decks: ['balanced', d] }, { deckMode: 'own' });
  console.log(`| ${opts.decks[d].name}（${d}） | ${pct(r.win)} | ${r.turns.toFixed(0)} |`);
}
