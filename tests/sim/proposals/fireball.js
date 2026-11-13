// 「ファイアボール頼みの問題」の案を比べる（各1000試合）。
//   node tests/sim/proposals/fireball.js [--games 1000]
// 案ごとに、#12 の数値（tests/fixtures/）の一部だけを上書きして回す。
import { buildData } from '../../helpers.js';
import { runMany } from '../sim.js';

const args = process.argv.slice(2);
const games = Number(args[args.indexOf('--games') + 1] || 1000);
const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : null;

export const PROPOSALS = {
  '今のルール': {},
  'A 勝ったら進み続ける': { rules: { advanceAfterWin: true } },
  'B 城ダメージ×2': { rules: { soldierCastleDamageMultiplier: 2 } },
  'C1 ファイアボール使い切り': { cards: { fireball: { exhaust: true } } },
  'C2 ファイアボール3枚': { cards: { fireball: { count: 3 } } },
  'A+B': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 2 } },
  'A+C1': { rules: { advanceAfterWin: true }, cards: { fireball: { exhaust: true } } },
  'A+C2': { rules: { advanceAfterWin: true }, cards: { fireball: { count: 3 } } },
  'B+C1': { rules: { soldierCastleDamageMultiplier: 2 }, cards: { fireball: { exhaust: true } } },
  'B+C2': { rules: { soldierCastleDamageMultiplier: 2 }, cards: { fireball: { count: 3 } } },
  'A+B+C1': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 2 }, cards: { fireball: { exhaust: true } } },
  'A+B+C2': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 2 }, cards: { fireball: { count: 3 } } },
  'A+B3': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3 } },
  'B3+C2': { rules: { soldierCastleDamageMultiplier: 3 }, cards: { fireball: { count: 3 } } },
  'A+B3+C2': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3 }, cards: { fireball: { count: 3 } } },
  'A+B3+C1': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3 }, cards: { fireball: { exhaust: true } } },
  'B3+C1': { rules: { soldierCastleDamageMultiplier: 3 }, cards: { fireball: { exhaust: true } } },
  'A+B2+C2(2枚)': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 2 }, cards: { fireball: { count: 2 } } },
  'A+B3+C2(2枚)': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3 }, cards: { fireball: { count: 2 } } },
  'A+B3+C2+城30': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3, castleMaxHp: 30 }, cards: { fireball: { count: 3 } } },
  'A+B2+C2(2枚)+城20': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 2, castleMaxHp: 20 }, cards: { fireball: { count: 2 } } },
  'A+B3+C2(2枚)+城20': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3, castleMaxHp: 20 }, cards: { fireball: { count: 2 } } },
  'A+B3+C2(2枚)+城22': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3, castleMaxHp: 22 }, cards: { fireball: { count: 2 } } },
  'A+B3+C2(2枚)+城18': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3, castleMaxHp: 18 }, cards: { fireball: { count: 2 } } },
  'A+B3+C2(2枚)+後攻+4': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3, secondPlayerCastleBonus: 4 }, cards: { fireball: { count: 2 } } },
  'A+B3+C2(2枚)+後攻+6': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3, secondPlayerCastleBonus: 6 }, cards: { fireball: { count: 2 } } },
  'A+B3+C2(2枚)+城22+後攻+4': { rules: { advanceAfterWin: true, soldierCastleDamageMultiplier: 3, castleMaxHp: 22, secondPlayerCastleBonus: 4 }, cards: { fireball: { count: 2 } } },
};

// 比べる元は、この案を入れる前の数値（tests/fixtures/ = #12 の数値）。data/ は案を入れたあとの値なので使わない
export function dataFor(p) {
  return buildData({ rules: p.rules || {}, cards: p.cards || {}, source: 'fixture' });
}

const SAME = ['random', 'aggro', 'smart', 'defensive', 'guard'];
const pct = (x) => `${Math.round(x * 100)}%`;

console.log(`各 ${games} 試合・シード 1`);
console.log('| 案 | 兵士からの城ダメージ（smart同士 / 全組み合わせ） | 決着 | smart同士の手番（中央値） | 同じ戦い方同士の p1 勝率 | smart がランダムに勝つ | 迷う場面（smart同士） | ファイアボールの割合（smart同士） |');
console.log('|---|---|---|---|---|---|---|---|');
for (const [name, p] of Object.entries(PROPOSALS)) {
  if (only && !only.includes(name.split(' ')[0])) continue;
  const { rules, cards } = dataFor(p);
  const run = (a, b) => runMany({ games, seed: 1, cards, rules, strategies: [a, b] });
  const same = SAME.map((s) => run(s, s));
  const sr = run('smart', 'random');
  const rs = run('random', 'smart');
  const all = [...same, sr, rs, run('defensive', 'aggro'), run('aggro', 'defensive')];
  const smart = same[2];
  const decided = all.reduce((a, r) => a + r.decided, 0);
  const total = all.reduce((a, r) => a + r.games, 0);
  const share = all.reduce((a, r) => a + r.soldierDamageShare, 0) / all.length;
  const p1 = same.map((r) => r.winRate.p1 || 0);
  const p1All = [...p1, sr.winRate.p1 || 0, 1 - (rs.winRate.p2 || 0)];
  const vsRandom = ((sr.winRate.p1 || 0) + (rs.winRate.p2 || 0)) / 2;
  console.log(
    `| ${name} | ${pct(smart.soldierDamageShare)} / ${pct(share)} | ${decided}/${total} | ${smart.avgTurns.toFixed(0)}（${smart.medianTurns}） | ${pct(Math.min(...p1))}〜${pct(Math.max(...p1))} | ${pct(vsRandom)} | ${pct(smart.choiceRate)} | ${pct(smart.spellDamageByType.fireball || 0)} |`,
  );
}
