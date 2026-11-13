// バランス確認用のシミュレーション。Game を画面なしで最後まで動かし、数字を集める。
// 乱数はすべてシード付きなので、同じ引数なら誰が回しても同じ結果になる。
import { Game, EVENT_TYPES } from '../../js/game/Game.js';
import { seededRng } from '../helpers.js';
import { STRATEGIES } from './strategies.js';

/**
 * 1試合を回す。
 * @param {object} o
 * @param {object} o.cards  cards.json の中身
 * @param {object} o.rules  rules.json の中身
 * @param {string[]} o.strategies 席順（p1, p2, ...）ごとの戦い方の名前
 * @param {number} o.seed
 * @param {number} [o.maxTurns] これを超えたら「決着しない」とする（通算ターン数）
 * @param {object} [o.gameOptions] new Game() に追加で渡すもの
 */
export function runMatch({ cards, rules, strategies, seed, maxTurns = 3000, gameOptions = {} }) {
  const game = new Game({ cards, rules, rng: seededRng(seed), ...gameOptions });
  const aiRng = seededRng(seed ^ 0x9e3779b9);
  const stats = {
    winner: null,
    turns: 0,
    castleDamage: { soldier: 0, spell: 0, other: 0 },
    monstersDefeated: 0,
    monsterCastleDamage: 0,
    spellDamageByType: {},
    clashes: 0,
    discardTurns: 0,
    choiceTurns: 0, // 出せるカードが2種類以上あったターン（「迷う場面」そのものではない。目安）
    mainTurns: 0,
    played: {},
    errors: 0,
    events: {},
  };
  for (const type of EVENT_TYPES) {
    game.on(type, (e) => {
      stats.events[type] = (stats.events[type] || 0) + 1;
      if (type === 'castleDamaged') {
        const kind = e.source?.kind ?? 'other';
        const key = kind in stats.castleDamage ? kind : 'other';
        stats.castleDamage[key] += e.amount - (e.blocked ?? 0);
        if (kind === 'spell') stats.spellDamageByType[e.source.type] = (stats.spellDamageByType[e.source.type] || 0) + e.amount - (e.blocked ?? 0);
      }
      if (type === 'soldiersClashed') stats.clashes += 1;
      if (type === 'monsterDefeated') stats.monstersDefeated += 1;
      if (type === 'monsterAttackedCastle') stats.monsterCastleDamage += e.amount;
      if (type === 'cardPlayed') stats.played[e.type] = (stats.played[e.type] || 0) + 1;
    });
  }
  const players = strategies.map((name) => {
    const s = STRATEGIES[name];
    if (!s) throw new Error(`戦い方 "${name}" はありません。${Object.keys(STRATEGIES).join(', ')}`);
    return s;
  });
  const strategyOf = (pid) => players[Number(pid.slice(1)) - 1];
  const ctx = { cards, rules, discardCount: 0, upgrades: gameOptions.upgrades || {} };
  game.on('discardRequired', (e) => { ctx.discardCount = e.count; });

  game.start();
  let guard = 0;
  for (;;) {
    const now = game.getState(null);
    if (now.phase === 'gameOver' || now.turn > maxTurns) break;
    if (++guard > maxTurns * 20) throw new Error('シミュレーションが進まなくなりました');
    const pid = now.currentPlayer;
    const strat = strategyOf(pid);
    if (now.phase === 'discard') {
      stats.discardTurns += 1;
      const r = game.discard(strat.chooseDiscard(game, pid, aiRng, ctx));
      if (!r.ok) throw new Error(`discard が失敗: ${r.reason}`);
      continue;
    }
    stats.mainTurns += 1;
    const playable = new Set(
      game.getState(pid).players[pid].hand.filter((c) => game.canPlayCard(c.cardId).ok).map((c) => c.type),
    );
    if (playable.size >= 2) stats.choiceTurns += 1;
    strat.takeTurn(game, pid, aiRng, ctx);
    if (game.getState(null).phase === 'gameOver') break;
    const r = game.endTurn();
    if (!r.ok) throw new Error(`endTurn が失敗: ${r.reason}`);
  }
  stats.finalState = game.getState(null);
  stats.winner = stats.finalState.winner;
  stats.turns = stats.finalState.turn;
  return stats;
}

/** 何試合も回してまとめる */
export function runMany({ games, seed = 1, ...rest }) {
  const results = [];
  for (let i = 0; i < games; i++) results.push(runMatch({ ...rest, seed: seed * 100003 + i }));
  return summarize(results, rest.strategies);
}

export function summarize(results, strategies) {
  const decided = results.filter((r) => r.winner);
  const turns = decided.map((r) => r.turns).sort((a, b) => a - b);
  const wins = {};
  for (const r of decided) wins[r.winner] = (wins[r.winner] || 0) + 1;
  const dmg = { soldier: 0, spell: 0, other: 0 };
  const spellBy = {};
  for (const r of results) {
    for (const k of Object.keys(dmg)) dmg[k] += r.castleDamage[k];
    for (const [k, v] of Object.entries(r.spellDamageByType)) spellBy[k] = (spellBy[k] || 0) + v;
  }
  const totalDmg = dmg.soldier + dmg.spell + dmg.other || 1;
  const sum = (f) => results.reduce((a, r) => a + f(r), 0);
  return {
    strategies,
    games: results.length,
    decided: decided.length,
    avgTurns: turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : null,
    medianTurns: turns.length ? turns[Math.floor(turns.length / 2)] : null,
    maxTurns: turns.length ? turns.at(-1) : null,
    // p1 勝率の誤差の目安（±2σ）。1000試合で約 ±3%
    p1Margin: decided.length ? 2 * Math.sqrt(0.25 / decided.length) : null,
    winRate: Object.fromEntries(Object.entries(wins).map(([k, v]) => [k, v / (decided.length || 1)])),
    soldierDamageShare: dmg.soldier / totalDmg,
    spellDamageByType: Object.fromEntries(Object.entries(spellBy).map(([k, v]) => [k, v / totalDmg])),
    clashesPerGame: sum((r) => r.clashes) / results.length,
    monstersDefeatedPerGame: sum((r) => r.monstersDefeated) / results.length,
    monsterCastleDamagePerGame: sum((r) => r.monsterCastleDamage) / results.length,
    discardRate: sum((r) => r.discardTurns) / (sum((r) => r.mainTurns) || 1),
    choiceRate: sum((r) => r.choiceTurns) / (sum((r) => r.mainTurns) || 1),
    playedPerGame: Object.fromEntries(
      Object.entries(
        results.reduce((acc, r) => {
          for (const [k, v] of Object.entries(r.played)) acc[k] = (acc[k] || 0) + v;
          return acc;
        }, {}),
      ).map(([k, v]) => [k, v / results.length]),
    ),
  };
}
