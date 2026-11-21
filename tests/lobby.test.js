// 部屋（ロビー）のテスト：部屋主・モード選び・CPU・開始・部屋に戻る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Lobby, MAX_SEATS } from '../server/rooms.js';
import { loadData } from '../server/server.js';
import { seededRng } from './helpers.js';

function newLobby(options = { cpuDelayMs: 0 }) {
  let seed = 1;
  return new Lobby(loadData(), () => seededRng(seed++), options);
}

/** 入って、席と、届いたメッセージを返す */
function enter(lobby, pass, name) {
  const r = lobby.join(pass, name);
  assert.equal(r.ok, true, r.reason);
  const { room, seat } = lobby.findSeat(r.token);
  const seen = [];
  room.connect(seat, (m) => seen.push(m));
  return { room, seat, seen, lastRoom: () => seen.filter((m) => m.type === 'room').at(-1) };
}

/** 人の席は何もしない（ターン終了・防御しない・前から捨てる）。CPU は勝手に動く。試合が終わるまで回す */
function playOut(room) {
  for (let i = 0; i < 20000; i++) {
    const game = room.game;
    const st = game.getState(null);
    if (st.phase === 'gameOver') return st;
    if (st.phase === 'mulligan') {
      // 人の席は引き直さない（CPU は勝手に選ぶ）
      for (const id of st.mulligan.pending) {
        const s = room.seatOf(id);
        assert.equal(s.cpu, null, 'CPU のマリガンで止まっている');
        assert.equal(room.action(s, 'mulligan', [[]]).ok, true);
      }
      continue;
    }
    if (st.phase === 'defend') {
      const s = room.seatOf(st.defense.defenderId);
      assert.equal(s.cpu, null, 'CPU の防御で止まっている');
      assert.equal(room.action(s, 'passDefense', []).ok, true);
      continue;
    }
    const s = room.seatOf(st.currentPlayer);
    assert.equal(s.cpu, null, 'CPU の番で止まっている');
    if (st.phase === 'discard') {
      const me = game.getState(s.playerId).players[s.playerId];
      assert.equal(room.action(s, 'discard', [me.hand.slice(0, me.handCount - me.maxHand).map((c) => c.cardId)]).ok, true);
    } else {
      assert.equal(room.action(s, 'endTurn', []).ok, true);
    }
  }
  throw new Error('試合が終わりません');
}

test('部屋主：最初に入った人。モードは部屋主だけが選べ、選べない値は断る', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  const b = enter(lobby, 'r', 'B');
  assert.equal(a.lastRoom().hostId, 'p1');
  assert.equal(a.lastRoom().you, 'p1');
  assert.equal(b.lastRoom().you, 'p2');
  assert.equal(a.lastRoom().capacity, MAX_SEATS);
  assert.equal(a.room.action(b.seat, 'setRules', [{ winCondition: 'lastStanding' }]).reason, '部屋主だけが変えられます');
  assert.equal(a.room.action(a.seat, 'setRules', [{ winCondition: 'nope' }]).ok, false);
  assert.equal(a.room.action(a.seat, 'setRules', [{ castleMaxHp: 1 }]).ok, false);
  assert.equal(a.room.action(a.seat, 'setRules', [{ winCondition: 'lastStanding', deckMode: 'own' }]).ok, true);
  assert.deepEqual(b.lastRoom().settings, { winCondition: 'lastStanding', deckMode: 'own', teams: 'off', castleHp: loadData().rules.castleMaxHp, stage: 'random', faction: null });
  const ids = (list) => list.map((x) => x.id);
  assert.deepEqual(ids(b.lastRoom().choices.winConditions), ['firstDestroy', 'lastStanding']);
  assert.deepEqual(ids(b.lastRoom().choices.deckModes), ['shared', 'own', 'cost']);
  assert.ok(ids(b.lastRoom().choices.castles).includes('fortress'));
});

test('城・デッキ：自分の席は自分で、CPU の席は部屋主が選ぶ', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  const b = enter(lobby, 'r', 'B');
  assert.equal(a.room.action(b.seat, 'setSeat', [{ castle: 'tower', deck: 'siege' }]).ok, true);
  assert.equal(a.room.action(b.seat, 'setSeat', [{ castle: 'nope' }]).reason, 'その城はありません');
  assert.equal(a.room.action(b.seat, 'setSeat', [{ castle: 'fortress' }, 'p1']).reason, 'ほかの人の席は変えられません');
  const cpu = a.room.action(a.seat, 'addCpu', ['hard']);
  assert.equal(cpu.playerId, 'p3');
  assert.equal(a.room.action(b.seat, 'setSeat', [{ castle: 'fortress' }, 'p3']).reason, 'CPU の席は部屋主だけが変えられます');
  assert.equal(a.room.action(a.seat, 'setSeat', [{ castle: 'barracks' }, 'p3']).ok, true);
  const players = a.lastRoom().players;
  assert.deepEqual(players.map((p) => [p.playerId, p.castle, p.cpu]), [['p1', 'standard', null], ['p2', 'tower', null], ['p3', 'barracks', 'hard']]);
  assert.equal(players[1].deck, 'siege');
});

test('CPU：部屋主が足し外しでき、席が詰まる。8人まで', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  for (let i = 0; i < 7; i++) assert.equal(a.room.action(a.seat, 'addCpu', [i % 2 ? 'easy' : undefined]).ok, true);
  assert.equal(a.room.action(a.seat, 'addCpu', []).reason, 'この部屋はもう満員です');
  assert.equal(lobby.join('r', 'B').reason, 'この部屋はもう満員です');
  assert.equal(a.room.action(a.seat, 'removeCpu', ['p1']).ok, false); // 人は外せない
  assert.equal(a.room.action(a.seat, 'removeCpu', ['p2']).ok, true);
  assert.deepEqual(a.lastRoom().players.map((p) => p.playerId), ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7']);
  assert.equal(a.lastRoom().players[1].name, 'CPU2（よわい）');
  assert.equal(a.room.action(a.seat, 'addCpu', ['super']).ok, false);
});

test('始まる前に出た人は席ごと消え、部屋主はつぎの人になる', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  const b = enter(lobby, 'r', 'B');
  const c = enter(lobby, 'r', 'C');
  assert.equal(a.room.action(a.seat, 'leave', []).ok, true);
  assert.equal(a.lastRoom().you, null);
  assert.equal(b.lastRoom().you, 'p1');
  assert.equal(c.lastRoom().you, 'p2');
  assert.equal(b.lastRoom().hostId, 'p1');
  assert.equal(b.room.action(b.seat, 'addCpu', []).ok, true);
  // 人が全員出たら、CPU だけ残らない
  b.room.action(b.seat, 'leave', []);
  c.room.action(c.seat, 'leave', []);
  assert.equal(b.room.seats.length, 0);
});

test('開始：自動では始まらず、部屋主が2人以上（CPU を含む）で始める', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  assert.equal(a.room.action(a.seat, 'start', []).ok, false);
  const b = enter(lobby, 'r', 'B');
  assert.equal(a.room.game, null);
  assert.equal(a.room.action(b.seat, 'start', []).reason, '部屋主だけが始められます');
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  assert.equal(a.room.action(a.seat, 'start', []).ok, false);
  assert.equal(lobby.join('r', 'C').ok, false); // 試合中は入れない
  assert.equal(a.room.action(a.seat, 'addCpu', []).ok, false);
  assert.deepEqual(a.room.game.getState(null).playerOrder, ['p1', 'p2']);
});

test('1人＋CPU 7人のバトルロイヤル・デッキ対戦を最後まで遊べる（CPU は人の番で止まる）', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  for (const level of ['easy', 'normal', 'hard', 'easy', 'normal', 'hard', 'hard']) a.room.action(a.seat, 'addCpu', [level]);
  a.room.action(a.seat, 'setRules', [{ winCondition: 'lastStanding', deckMode: 'own' }]);
  a.room.action(a.seat, 'setSeat', [{ castle: 'fortress' }, 'p8']);
  a.room.action(a.seat, 'setSeat', [{ deck: 'assault' }]);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  const st0 = a.room.game.getState('p1');
  assert.equal(st0.playerOrder.length, 8);
  assert.equal(st0.deckMode, 'own');
  assert.equal(st0.players.p1.deckId, 'assault');
  assert.equal(st0.players.p8.castleType, 'fortress');
  const over = playOut(a.room);
  assert.ok(over.winner);
  assert.ok(['lastStanding', 'roundLimit'].includes(a.seen.filter((m) => m.event === 'gameOver').at(-1).payload.reason));
  // 人の手札だけが届く。CPU の手札は届かない
  for (const m of a.seen.filter((x) => x.type === 'state')) {
    for (const id of m.state.playerOrder) if (id !== 'p1') assert.equal(m.state.players[id].hand, null);
  }
});

test('もう1回は人だけの投票で始まる。部屋に戻ると設定を変えられ、人も入れる', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  const b = enter(lobby, 'r', 'B');
  a.room.action(a.seat, 'addCpu', ['hard']);
  a.room.action(a.seat, 'start', []);
  assert.equal(a.room.action(a.seat, 'backToRoom', []).reason, 'まだ試合が終わっていません');
  playOut(a.room);
  a.room.action(a.seat, 'rematch', []);
  assert.equal(a.room.game.phase, 'gameOver');
  a.room.action(b.seat, 'rematch', []);
  assert.notEqual(a.room.game.getState(null).phase, 'gameOver');
  playOut(a.room);
  assert.equal(a.room.action(b.seat, 'backToRoom', []).reason, '部屋主だけが部屋に戻せます');
  assert.equal(a.room.action(a.seat, 'backToRoom', []).ok, true);
  assert.equal(a.lastRoom().started, false);
  assert.equal(a.room.action(a.seat, 'setRules', [{ winCondition: 'lastStanding' }]).ok, true);
  const c = enter(lobby, 'r', 'C');
  assert.equal(c.lastRoom().you, 'p4');
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  assert.equal(a.room.game.getState(null).playerOrder.length, 4);
});

test('試合中に出た人がいても、部屋主が部屋に戻せば、その席を消して続けられる', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  const b = enter(lobby, 'r', 'B');
  const c = enter(lobby, 'r', 'C');
  a.room.action(a.seat, 'start', []);
  a.room.action(a.seat, 'leave', []); // 部屋主が出る → 部屋主は B に
  assert.equal(b.lastRoom().hostId, 'p2');
  playOut(a.room);
  assert.equal(b.room.action(b.seat, 'rematch', []).ok, false);
  assert.equal(b.room.action(b.seat, 'backToRoom', []).ok, true);
  assert.deepEqual(b.lastRoom().players.map((p) => p.name), ['B', 'C']);
  assert.equal(c.lastRoom().you, 'p2');
  assert.equal(b.room.action(b.seat, 'start', []).ok, true);
});

test('CPU は間をおいて1手ずつ動く（cpuDelayMs）', async () => {
  const lobby = newLobby({ cpuDelayMs: 5 });
  const a = enter(lobby, 'r', 'A');
  a.room.action(a.seat, 'addCpu', ['hard']);
  a.room.action(a.seat, 'start', []);
  const wait = async () => { for (let i = 0; i < 200 && a.room.cpuWaiting(); i++) await new Promise((r) => setTimeout(r, 5)); };
  // 人が動く場面で止まる（自分の番か、CPU の攻撃への防御）
  const humanTurn = () => { const now = a.room.game.getState(null); return (now.phase === 'defend' ? now.defense.defenderId : now.currentPlayer) === 'p1'; };
  assert.equal(a.room.action(a.seat, 'mulligan', [[]]).ok, true);
  assert.equal(a.room.game.getState(null).phase, 'mulligan'); // CPU のマリガンも、すぐには選ばない
  await wait();
  assert.equal(humanTurn(), true);
  if (a.room.game.getState(null).phase === 'main') {
    assert.equal(a.room.action(a.seat, 'endTurn', []).ok, true);
    assert.equal(a.room.game.getState(null).currentPlayer, 'p2'); // すぐには動かない
    await wait();
    assert.equal(humanTurn(), true);
  }
  a.room.stopCpu();
});

test('チーム：自動なら2チームに半分ずつ分かれ、もう1回のたびに分け直す', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  for (let i = 0; i < 4; i++) a.room.action(a.seat, 'addCpu', ['hard']);
  assert.equal(a.room.action(a.seat, 'setRules', [{ teams: 'nope' }]).ok, false);
  assert.equal(a.room.action(a.seat, 'setRules', [{ teams: 'auto' }]).ok, true);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  const st = a.room.game.getState(null);
  const sizes = Object.values(st.teams).map((t) => t.size).sort();
  assert.deepEqual(sizes, [2, 3]);
  const shown = a.lastRoom().players.map((p) => p.team);
  assert.deepEqual(shown, st.playerOrder.map((id) => st.players[id].team));
  playOut(a.room);
  assert.ok(a.seen.filter((m) => m.event === 'gameOver').at(-1).payload.winnerTeam);
});

test('チーム：各自で選ぶ。CPU は部屋主が選び、1チームしかないと始められない', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'r', 'A');
  const b = enter(lobby, 'r', 'B');
  a.room.action(a.seat, 'addCpu', []);
  a.room.action(a.seat, 'addCpu', []);
  a.room.action(a.seat, 'setRules', [{ teams: 'choose' }]);
  assert.deepEqual(a.lastRoom().players.map((p) => p.team), ['t1', 't2', 't1', 't2']);
  for (const id of ['p2', 'p4']) assert.equal(a.room.action(a.seat, 'setSeat', [{ team: 't1' }, id]).ok, id !== 'p2');
  assert.equal(a.room.action(b.seat, 'setSeat', [{ team: 't1' }]).ok, true);
  assert.equal(a.room.action(a.seat, 'start', []).reason, 'チームが1つしかありません（2チーム以上に分かれてください）');
  assert.equal(a.room.action(b.seat, 'setSeat', [{ team: 't5' }]).ok, false);
  assert.equal(a.room.action(b.seat, 'setSeat', [{ team: 't3' }]).ok, true);
  assert.equal(a.room.action(a.seat, 'setSeat', [{ team: 't4' }, 'p3']).ok, true);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  assert.deepEqual(Object.keys(a.room.game.getState(null).teams), ['t1', 't3', 't4']);
  playOut(a.room);
});

test('城のHP：部屋主が選べて、試合の城HPに反映される（選べない値は断る）', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'hp', 'A');
  const b = enter(lobby, 'hp', 'B');
  assert.deepEqual(a.lastRoom().choices.castleHpRange, { min: 10, max: 200 });
  assert.equal(b.room.action(b.seat, 'setRules', [{ castleHp: 30 }]).ok, false); // 部屋主だけ
  assert.equal(a.room.action(a.seat, 'setRules', [{ castleHp: 7 }]).ok, false);
  assert.equal(a.room.action(a.seat, 'setRules', [{ castleHp: 30.5 }]).ok, false);
  assert.equal(a.room.action(a.seat, 'setRules', [{ castleHp: 201 }]).ok, false);
  assert.equal(a.room.action(a.seat, 'setRules', [{ castleHp: 30 }]).ok, true);
  assert.equal(a.lastRoom().settings.castleHp, 30);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  const st = a.room.game.getState(null);
  assert.equal(st.players.p1.castleMaxHp, 30);
  assert.equal(st.players.p2.castleMaxHp, 30);
});

test('部屋主を譲る：部屋主だけが、部屋にいる人（CPU 以外）に譲れる。譲ると前の部屋主はルールを変えられない', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'tr', 'A');
  const b = enter(lobby, 'tr', 'B');
  const cpu = a.room.action(a.seat, 'addCpu', ['easy']);
  assert.equal(b.room.action(b.seat, 'transferHost', ['p1']).ok, false); // 部屋主だけ
  assert.equal(a.room.action(a.seat, 'transferHost', ['p1']).ok, false); // 自分には譲れない
  assert.equal(a.room.action(a.seat, 'transferHost', [cpu.playerId]).ok, false); // CPU には譲れない
  assert.equal(a.room.action(a.seat, 'transferHost', ['p2']).ok, true);
  assert.equal(b.lastRoom().hostId, 'p2');
  assert.equal(a.room.action(a.seat, 'setRules', [{ castleHp: 30 }]).ok, false);
  assert.equal(b.room.action(b.seat, 'setRules', [{ castleHp: 30 }]).ok, true);
});

test('チャット：アカウントがある人の発言には、アイコンとランク（profile）が付く。ない人には付かない', () => {
  const profile = { icon: 'infantry', iconImage: 'assets/units/infantry-blue.png', rank: { tierIndex: 2, division: 1, color: '#c90', name: 'ゴールド', divisionLabel: 'ゴールド I' } };
  const lobby = newLobby({ cpuDelayMs: 0, profileOf: (u) => (u === 'u1' ? profile : null) });
  const r1 = lobby.join('pf', 'A', 'u1');
  const r2 = lobby.join('pf', 'B');
  const a = lobby.findSeat(r1.token); const b = lobby.findSeat(r2.token);
  const seen = [];
  b.room.connect(b.seat, (m) => seen.push(m));
  assert.equal(a.room.action(a.seat, 'chat', [{ text: 'やあ' }]).ok, true);
  const msg = seen.find((m) => m.type === 'chat');
  assert.deepEqual(msg.profile, profile);
  assert.equal(b.room.action(b.seat, 'chat', [{ text: 'どうも' }]).ok, true);
  assert.equal(seen.filter((m) => m.type === 'chat').at(-1).profile, undefined);
});

test('部屋主はステージを選べる（最初はランダム）。選んだステージで試合が始まる', () => {
  const lobby = newLobby();
  const a = enter(lobby, 'stage', 'あ');
  enter(lobby, 'stage', 'い');
  assert.equal(a.lastRoom().settings.stage, 'random');
  assert.deepEqual(a.lastRoom().choices.stages.map((s) => s.id), ['random', 'meadow', 'lava', 'ice', 'ruins', 'darkForest', 'desert']);
  assert.equal(a.room.action(a.seat, 'setRules', [{ stage: 'nowhere' }]).ok, false);
  assert.equal(a.room.action(a.seat, 'setRules', [{ stage: 'ice' }]).ok, true);
  assert.equal(a.room.action(a.seat, 'start', []).ok, true);
  assert.equal(a.room.game.getState(null).stage.id, 'ice');
});
