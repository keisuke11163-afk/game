// バランス確認のシミュレーションを回して表を出す。
//   node tests/sim/run.js                       … 決まった組み合わせを各1000試合
//   node tests/sim/run.js --games 200 --seed 7  … 試合数とシードを変える
//   node tests/sim/run.js --match smart,random  … 1つの組み合わせだけ
//   node tests/sim/run.js --rules '{"castleMaxHp":30}' --cards '{"fireball":{"count":3}}'
//       … data/ の値を一部だけ上書きして試す（cards はカードごとに中身をまぜる）
//   node tests/sim/run.js --json                … 結果を JSON で出す
//   node tests/sim/run.js --no-monsters         … 魔物と強化なしで回す
// 同じ引数なら、誰が回しても同じ結果になる。
import { buildData, loadOptionalData } from '../helpers.js';
import { runMany } from './sim.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? def : args[i + 1];
};
const die = (msg) => {
  console.error(msg);
  process.exit(1);
};
const games = Number(opt('games', 1000));
const seed = Number(opt('seed', 1));
if (!Number.isInteger(games) || games < 1) die('--games は1以上の整数にしてください');
if (!Number.isInteger(seed)) die('--seed は整数にしてください');
let rulesPatch;
let cardsPatch;
try {
  rulesPatch = JSON.parse(opt('rules', '{}'));
  cardsPatch = JSON.parse(opt('cards', '{}'));
} catch (err) {
  die(`--rules / --cards は JSON で書いてください（${err.message}）`);
}

const DEFAULT_MATCHES = [
  'random,random', 'aggro,aggro', 'smart,smart', 'defensive,defensive', 'guard,guard',
  'defensive,aggro', 'aggro,defensive', 'random,smart', 'smart,random', 'random,pass',
];

const matches = opt('match', null) ? [opt('match')] : DEFAULT_MATCHES;
const { rules, cards } = buildData({ rules: rulesPatch, cards: cardsPatch });
const gameOptions = args.includes('--no-monsters') ? {} : loadOptionalData();
const rows = matches.map((m) => runMany({ games, seed, cards, rules, gameOptions, strategies: m.split(',') }));

if (args.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  const pct = (x) => `${Math.round(x * 100)}%`;
  console.log(`試合数 ${games}・シード ${seed}`);
  console.log('「決着」は3000手番までに決着した試合数。手番は決着した試合だけで数える。');
  console.log('| 組み合わせ | 決着 | 平均手番（中央値・最大） | p1 の勝率 | 兵士からの城ダメージ | 戦い/試合 | 魔物を倒す/試合 | 魔物の城ダメージ/試合 | 魔物で決着 | 捨てる場面 | 出せる種類が2以上 |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    console.log(
      `| ${r.strategies.join(' vs ')} | ${r.decided}/${r.games} | ${r.avgTurns?.toFixed(1)}（${r.medianTurns}・${r.maxTurns}） | ${pct(r.winRate.p1 || 0)}±${pct(r.p1Margin ?? 0)} | ${pct(r.soldierDamageShare)} | ${r.clashesPerGame.toFixed(1)} | ${r.monstersDefeatedPerGame.toFixed(1)} | ${r.monsterCastleDamagePerGame.toFixed(1)} | ${pct(r.endedByMonsterRate)} | ${pct(r.discardRate)} | ${pct(r.choiceRate)} |`,
    );
  }
}
