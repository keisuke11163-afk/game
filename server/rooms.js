// 部屋の管理。合言葉ごとに1部屋。Game をそのまま動かし、プレイヤーごとに隠して送る。
// HTTP の部分（server.js）とは分けて、テストしやすくしている。
//
// 部屋の流れ（CLAUDE.md の「部屋（ロビー）」）：
//   入る（最大8人）→ 部屋主がモードを選ぶ・CPU を足す／各自が城・デッキを選ぶ → 部屋主が「開始」
//   → 試合 → 「もう1回」（同じ設定）か「部屋に戻る」（設定を変える・人が入れる）
import { randomBytes } from 'node:crypto';
import { Game, EVENT_TYPES, TEAM_IDS, MAX_TEAM_SIZE } from '../js/game/Game.js';
import { randomUUID } from 'node:crypto';
import { filterEventFor } from '../js/game/visibility.js';
import { STRATEGIES, mulliganChoice } from '../js/game/strategies.js';
import { checkCostDeck } from '../js/game/Setup.js';

/** 試合中の操作（Game のメソッドに渡す） */
const GAME_ACTIONS = ['playCard', 'discard', 'endTurn', 'buyUpgrade', 'fuse', 'defend', 'passDefense', 'mulligan'];
/** 部屋の操作（いつでも送れる。だめなときは理由を返す） */
const RANKED_BLOCKED = ['start', 'transferHost', 'setRules', 'setSeat', 'addCpu', 'removeCpu', 'backToRoom', 'rematch'];
const ROOM_ACTIONS = ['rematch', 'surrender', 'leave', 'start', 'transferHost', 'setRules', 'setSeat', 'addCpu', 'removeCpu', 'backToRoom', 'chat'];
const ACTIONS = [...GAME_ACTIONS, ...ROOM_ACTIONS];
/** 攻撃を受けた人（自分の番でなくても）が送れる操作 */
const DEFENSE_ACTIONS = ['defend', 'passDefense'];
const MAX_ROOMS = 1000;
/** チャット：1通の最大文字数・つづけて送れる間隔（ミリ秒）・部屋に残す履歴の数 */
export const CHAT_MAX_LENGTH = 40;
export const CHAT_INTERVAL_MS = 600;
const CHAT_HISTORY = 30;
/** 1部屋の最大人数（CPU を含む） */
export const MAX_SEATS = 8;
/** 試合を始められる最少人数（CPU を含む） */
const MIN_PLAYERS = 2;

/** 部屋で選べる勝ち方 */
/** 部屋で入力できる城のHPの範囲（整数） */
export const CASTLE_HP_MIN = 10;
export const CASTLE_HP_MAX = 200;

export const WIN_CONDITIONS = {
  firstDestroy: '最初に城を落とした人の勝ち',
  lastStanding: 'バトルロイヤル（最後の1人まで）',
};
/** 部屋で選べる山札 */
export const DECK_MODES = {
  shared: 'みんなで共通の山札',
  own: '1人1つのデッキ',
  cost: 'デッキ編成（コスト制）',
};
/** 部屋で選べるチームの分け方 */
export const TEAM_MODES = {
  off: 'チームなし（個人戦）',
  auto: '自動で2チームに分ける',
  choose: '各自でチームを選ぶ',
};
/** チームの名前（画面に出す） */
export const TEAM_NAMES = { t1: 'チームA', t2: 'チームB', t3: 'チームC', t4: 'チームD' };

/** CPU の強さ → 戦い方（js/main.js の CPU_LEVELS と同じ割り当て） */
export const CPU_LEVELS = {
  easy: { name: 'よわい', strategy: 'defensive' },
  normal: { name: 'ふつう', strategy: 'rush' },
  hard: { name: 'つよい', strategy: 'smart' },
};

export class Room {
  /**
   * @param {string} roomId
   * @param {object} data { cards, rules, monsters, upgrades, castles, decks, rarities, weather }
   * @param {() => () => number} makeRng 試合ごとに乱数を作る関数
   * @param {{ cpuDelayMs?: number }} [options] cpuDelayMs：CPU が1手ごとに待つ時間（0 ならすぐ動く。テスト用）
   */
  constructor(roomId, data, makeRng, { cpuDelayMs = 700, onMatchEnd = null, ranked = null, onRankedVoid = null, cosmeticsOf = null, profileOf = null } = {}) {
    /** チャットに添える、アイコンとランク（アカウントがあるときだけ） */
    this.profileOf = profileOf;
    /** アカウントの装備中の見た目（スキン）を、席に結びつける。相手にも見える */
    this.cosmeticsOf = cosmeticsOf;
    /** ランク戦の部屋なら { cfg, ... }。設定は固定（1対1・最初に城を落とした人の勝ち・コスト制）で、始める・設定を変える・もう1回はできない */
    this.ranked = ranked;
    this.onRankedVoid = onRankedVoid;
    this.lastActionAt = Date.now();
    this.watch = null;
    this.roomId = roomId;
    /** 試合が決着したときに、サーバーが確定した結果を渡す（戦績・経験値の記録。Game や画面は関与しない） */
    this.onMatchEnd = onMatchEnd;
    this.matchMeta = null;
    this.data = data;
    this.makeRng = makeRng;
    this.cpuDelayMs = cpuDelayMs;
    this.capacity = MAX_SEATS;
    /**
     * @type {{playerId: string, name: string, token: string|null, left: boolean, clients: Set<(msg: object) => void>,
     *   cpu: string|null, castle: string|null, deck: string|null}[]}
     * left：自分から部屋を出た（試合中だけ。始まる前に出た人は席ごと消える）。cpu：CPU の強さ（人なら null）
     */
    this.seats = [];
    /** 部屋主の席（人だけ。CPU はなれない） */
    this.host = null;
    this.settings = {
      winCondition: Object.hasOwn(WIN_CONDITIONS, data.rules.winCondition) ? data.rules.winCondition : 'firstDestroy',
      // 山札は、使える見本があればプレイヤーごと（コスト制）が最初の設定。部屋主が「共通」などに変えられる
      deckMode: data.rarities && Object.values(data.decks ?? {}).some((d) => d.costDeck) ? 'cost'
        : Object.hasOwn(DECK_MODES, data.rules.deckMode) ? data.rules.deckMode : 'shared',
      teams: 'off',
      castleHp: data.rules.castleMaxHp,
      // ステージ（data/stages.json）："random"（毎試合ランダム）かステージのID
      stage: 'random',
      // 四大陣営（PR-A）：全員が同じ陣営の共有山札。null なら陣営なし（今までどおり全カード）。共有山札（shared）のときだけ
      faction: null,
    };
    this.game = null;
    /** 今の試合のチーム（席ごと。チームなしなら null） */
    this.lastTeams = null;
    this.rematchVotes = new Set();
    this.lastActive = Date.now();
    this.cpuTimer = null;
    this.cpuRng = null;
    this.cpuActedTurn = null;
    /** チャットの履歴（新しくつないだ人に送る）。席そのものを持つので、席が詰まって playerId が変わっても送るときに引き直せる */
    this.chatLog = [];
    this.chatCount = 0;
  }

  get started() {
    return this.game !== null;
  }

  join(name, userId = null) {
    if (this.game) return { ok: false, reason: 'この部屋は試合中です。終わって部屋に戻るまで待ってください' };
    if (this.seats.length >= this.capacity) return { ok: false, reason: 'この部屋はもう満員です' };
    const seat = this.addSeat({ name, token: randomBytes(16).toString('hex'), cpu: null });
    seat.cosmetics = userId && this.cosmeticsOf ? this.cosmeticsOf(userId) : {};
    seat.userId = userId; // ログイン中のアカウント（なければ null）。戦績の記録に使う
    if (!this.host) this.host = seat;
    this.lastActive = Date.now();
    this.broadcastRoom();
    return { ok: true, roomId: this.roomId, playerId: seat.playerId, token: seat.token };
  }

  addSeat({ name, token, cpu }) {
    const seat = {
      playerId: `p${this.seats.length + 1}`,
      name,
      token,
      left: false,
      clients: new Set(),
      cpu,
      // 各自で選ぶときのチーム（入った順に A・B・A・B …。選び直せる）
      team: TEAM_IDS[this.seats.length % 2],
      castle: this.data.castles ? this.defaultOf(this.data.castles, this.data.rules.defaultCastle) : null,
      deck: this.data.decks ? this.defaultOf(this.plainDecks(), this.data.rules.defaultDeck) : null,
      // デッキ編成（コスト制）：選んだ見本のデッキ（costDeck）と、自分で編成したデッキ（{ 種類: 枚数 }。なければ null）
      costDeck: this.costDecks() ? this.defaultOf(this.costDecks(), this.data.rules.defaultCostDeck) : null,
      deckList: null,
    };
    this.seats.push(seat);
    return seat;
  }

  /** decks.json のうち、「1人1つのデッキ」（own）で選べるもの（コスト制の見本は除く） */
  plainDecks() {
    return Object.fromEntries(Object.entries(this.data.decks ?? {}).filter(([, d]) => !d.costDeck));
  }

  /** コスト制（cost）の見本のデッキ（decks.json の costDeck: true）。使えなければ null */
  costDecks() {
    if (!this.data.decks || !this.data.rarities) return null;
    const found = Object.fromEntries(Object.entries(this.data.decks).filter(([, d]) => d.costDeck));
    return Object.keys(found).length > 0 ? found : null;
  }

  defaultOf(defs, id) {
    return Object.hasOwn(defs, id) ? id : Object.keys(defs)[0] ?? null;
  }

  /** 席を詰めて p1, p2 … を振り直す（始まる前だけ。試合中は席順が Game のプレイヤーIDなので変えない） */
  renumber() {
    this.seats.forEach((s, i) => { s.playerId = `p${i + 1}`; });
  }

  /** 部屋主がいなくなったら、残っている人のうちいちばん前の席の人にする */
  fixHost() {
    if (this.host && this.seats.includes(this.host) && !this.host.left) return;
    this.host = this.seats.find((s) => !s.cpu && !s.left) ?? null;
  }

  get humanSeats() {
    return this.seats.filter((s) => !s.cpu);
  }

  seatByToken(token) {
    if (typeof token !== 'string') return null;
    return this.seats.find((s) => s.token === token) || null;
  }

  seatOf(playerId) {
    return this.seats.find((s) => s.playerId === playerId) || null;
  }

  startGame() {
    this.stopCpu();
    const rules = {
      ...this.data.rules,
      playerCount: this.seats.length,
      winCondition: this.settings.winCondition,
      deckMode: this.settings.deckMode,
      castleMaxHp: this.settings.castleHp ?? this.data.rules.castleMaxHp,
    };
    const setup = {};
    const teams = this.teamsForGame();
    if (teams) setup.teams = teams;
    this.lastTeams = teams;
    if (this.data.stages) setup.stage = this.settings.stage ?? 'random';
    // 陣営モード：共有山札のときだけ（setRules で shared 以外にすると faction は null に戻るが、念のためここでも確かめる）
    if (this.settings.faction && rules.deckMode === 'shared' && this.data.factions) setup.faction = this.settings.faction;
    // コイントス：先攻はランダム（チーム戦はチームの順のまま）
    if (!teams) {
      const coin = this.makeRng();
      setup.firstPlayer = this.seats[Math.floor(coin() * this.seats.length)].playerId;
    }
    if (this.data.castles) setup.castles = this.seats.map((s) => s.castle);
    if (this.data.decks && rules.deckMode === 'own') setup.decks = this.seats.map((s) => s.deck);
    if (rules.deckMode === 'cost') {
      setup.decks = this.seats.map((s) => s.costDeck);
      setup.deckLists = this.seats.map((s) => s.deckList);
    }
    this.game = new Game({ ...this.data, rules, setup, rng: this.makeRng() });
    this.cpuRng = this.makeRng();
    this.cpuActedTurn = null;
    this.rematchVotes.clear();
    const game = this.game;
    this.matchMeta = {
      matchId: randomUUID(), startedAt: Date.now(),
      seats: this.seats.map((s, i) => ({ seat: i, playerId: s.playerId, userId: s.userId ?? null, name: s.name, cpu: s.cpu ?? null, team: teams?.[i] ?? null, deckName: rules.deckMode === 'cost' ? (s.deckList ? 'マイデッキ' : s.costDeck) : null })),
      deckMode: rules.deckMode, winCondition: rules.winCondition,
    };
    // ミッション用：試合のあいだの、合成した回数・魔物のとどめを、席ごとに数える（サーバーが見たゲームのイベントから）
    this.matchMeta.stats = Object.fromEntries(this.seats.map((s) => [s.playerId, { fuses: 0, monsters: 0 }]));
    game.on('cardsFused', (p) => { const st = this.matchMeta?.stats?.[p.playerId]; if (st && this.game === game) st.fuses += 1; });
    game.on('monsterDefeated', (p) => { const st = this.matchMeta?.stats?.[p.playerId]; if (st && this.game === game) st.monsters += 1; });
    game.on('gameOver', (payload) => this.finishMatch(game, payload));
    for (const type of EVENT_TYPES) {
      game.on(type, (payload) => {
        if (this.game !== game) return;
        for (const seat of this.seats) {
          if (seat.clients.size === 0) continue;
          const shown = filterEventFor(type, payload, seat.playerId, game.side(seat.playerId));
          if (shown) this.send(seat, { type: 'event', event: type, payload: shown });
        }
      });
    }
    game.start();
    this.broadcastRoom(); // started と、もう1回の投票を空に戻したことを知らせる
    this.broadcastState();
    this.runCpu();
  }

  /** 決着：確定した勝敗を、記録する側（戦績・経験値）へ渡す。失敗しても試合は止めない */
  finishMatch(game, payload) {
    const meta = this.matchMeta;
    if (!this.onMatchEnd || !meta || this.game !== game) return;
    try {
      const seats = meta.seats.map((m) => {
        const won = payload.winnerTeam ? m.team === payload.winnerTeam : m.playerId === payload.winner;
        return { seat: m.seat, userId: m.userId, name: m.name, cpu: m.cpu, won, left: !!this.seats[m.seat]?.left, deckName: m.deckName, stats: meta.stats?.[m.playerId] ?? { fuses: 0, monsters: 0 } };
      });
      this.onMatchEnd({
        matchId: meta.matchId, modeId: this.ranked?.modeId ?? 'kingdom', roomId: this.roomId, startedAt: meta.startedAt, endedAt: Date.now(),
        turns: game.getState(null).turn, reason: payload.reason, ranked: !!this.ranked, deckMode: meta.deckMode, winCondition: meta.winCondition, seats,
      });
    } catch (err) {
      console.error('match record', err);
    }
  }

  /** つないだとき：部屋と状態を送る */
  connect(seat, client) {
    this.lastActive = Date.now();
    // 1つの席の接続は3本まで（古いものから閉じる扱いにして数えない）
    if (seat.clients.size >= 3) seat.clients.delete(seat.clients.values().next().value);
    seat.clients.add(client);
    this.broadcastRoom();
    if (this.chatLog.length > 0) client({ type: 'chatLog', messages: this.chatLog.map((m) => this.chatMessage(m)) });
    if (this.game) client({ type: 'state', ...this.stateFor(seat.playerId) });
    return () => {
      this.lastActive = Date.now();
      seat.clients.delete(client);
      this.broadcastRoom();
    };
  }

  /** ブラウザからの操作 */
  action(seat, method, args) {
    this.lastActive = Date.now();
    if (typeof method !== 'string' || !ACTIONS.includes(method)) return { ok: false, reason: `"${method}" という操作はありません` };
    if (!Array.isArray(args)) return { ok: false, reason: 'args は配列で送ってください' };
    if (seat.cpu) return { ok: false, reason: 'CPU の席です' };
    if (this.ranked && RANKED_BLOCKED.includes(method)) return { ok: false, reason: 'ランク戦では使えません' };
    switch (method) {
      case 'rematch': return this.voteRematch(seat);
      case 'leave':
        // ランク戦で抜けるのは降参と同じ（負け）。切断・抜けで負けを逃れられないようにする
        if (this.ranked && this.game && this.game.phase !== 'gameOver') this.surrender(seat);
        return this.leave(seat);
      case 'surrender': return this.surrender(seat);
      case 'start': return this.start(seat);
      case 'transferHost': return this.transferHost(seat, args[0]);
      case 'setRules': return this.setRules(seat, args[0]);
      case 'setSeat': return this.setSeat(seat, args[0], args[1]);
      case 'addCpu': return this.addCpu(seat, args[0]);
      case 'removeCpu': return this.removeCpu(seat, args[0]);
      case 'backToRoom': return this.backToRoom(seat);
      case 'chat': return this.chat(seat, args[0]);
      default: break;
    }
    if (!this.game) return { ok: false, reason: 'まだ試合が始まっていません' };
    if (method === 'mulligan') {
      // マリガン：だれでも自分の手札だけ（自分の番でなくても）。args は [cardIds]
      args = [seat.playerId, args[0] ?? []];
    } else if (DEFENSE_ACTIONS.includes(method)) {
      // 防御は、攻撃を受ける人だけが送れる
      if (this.game.phase !== 'defend') return { ok: false, reason: '今は防御する場面ではありません' };
      if (this.game.pending.defenderId !== seat.playerId) return { ok: false, reason: 'あなたは防御する人ではありません' };
    } else if (this.game.currentPlayer !== seat.playerId) {
      return { ok: false, reason: 'あなたの番ではありません' };
    }
    // 手札にないカードは、相手の手札にあってもなくても同じ文にする（文の違いから相手の手札が分からないように）
    if (method === 'playCard' || method === 'defend') {
      const hand = this.game.getState(seat.playerId).players[seat.playerId].hand || [];
      if (!hand.some((c) => c.cardId === args[0])) return { ok: false, reason: 'そのカードは手札にありません' };
    }
    let result;
    try {
      result = this.game[method](...args);
    } catch (err) {
      console.error(err);
      result = { ok: false, reason: '操作の形が正しくありません' };
    }
    if (result?.ok) this.lastActionAt = Date.now();
    this.broadcastState();
    this.runCpu();
    return result;
  }

  // ---------- ランク戦の見張り ----------

  /**
   * ランク戦：つながりが切れたまま戻らない人・手を打たない人を、降参にする（勝ち逃げ・負け逃れをさせない）。
   * 最初から誰もつながなかったときは、勝敗をつけずに終わる（レートは変わらない）。
   */
  startRankedWatch() {
    const cfg = this.ranked.cfg;
    const born = Date.now();
    this.lastActionAt = born;
    this.watch = setInterval(() => this.checkRanked(cfg, born), this.ranked.checkMs ?? 5000);
    this.watch.unref();
  }

  checkRanked(cfg, born) {
    if (!this.game || this.game.phase === 'gameOver') return this.stopWatch();
    const t = Date.now();
    const away = [];
    for (const seat of this.humanSeats) {
      if (seat.clients.size > 0) { seat.lastSeen = t; seat.everConnected = true; continue; }
      const since = seat.lastSeen ?? born;
      if (t - since > (seat.everConnected ? cfg.disconnectGraceMs : cfg.connectGraceMs)) away.push(seat);
    }
    if (away.length === this.humanSeats.length) {
      // 全員いない：勝敗はつけない
      this.stopWatch();
      this.voided = true;
      this.onRankedVoid?.(this);
      return undefined;
    }
    for (const seat of away) this.surrender(seat);
    if (away.length === 0 && t - this.lastActionAt > cfg.idleTurnMs) {
      // つながっているのに手を打たない（放置）
      const g = this.game;
      const pid = g.phase === 'defend' ? g.pending.defenderId : g.currentPlayer;
      const seat = this.seatOf(pid);
      if (seat && !seat.cpu) this.surrender(seat);
    }
    return undefined;
  }

  stopWatch() {
    clearInterval(this.watch);
    this.watch = null;
  }

  // ---------- チャットとスタンプ ----------

  /**
   * チャット（同じ部屋の全員に届く。試合の前・試合中・試合のあと、いつでも）。
   * payload は { text }（1〜CHAT_MAX_LENGTH 文字）か { stamp }（data/stamps.json の id）のどちらか1つ。
   * 文字は人が入れたものなので、画面は textContent で出す。続けて送れるのは CHAT_INTERVAL_MS ごと
   */
  chat(seat, payload) {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return { ok: false, reason: 'メッセージの形が正しくありません' };
    const hasText = payload.text !== undefined;
    const hasStamp = payload.stamp !== undefined;
    if (hasText === hasStamp) return { ok: false, reason: 'text か stamp のどちらか1つを送ってください' };
    const body = {};
    if (hasStamp) {
      if (typeof payload.stamp !== 'string' || !(this.data.stamps ?? []).some((s) => s.id === payload.stamp)) return { ok: false, reason: 'そのスタンプはありません' };
      body.stamp = payload.stamp;
    } else {
      if (typeof payload.text !== 'string') return { ok: false, reason: 'メッセージの形が正しくありません' };
      // 制御文字・改行は空白にして、前後の空白を取る
      const text = payload.text.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();
      if (text === '') return { ok: false, reason: 'メッセージが空です' };
      if ([...text].length > CHAT_MAX_LENGTH) return { ok: false, reason: `メッセージは${CHAT_MAX_LENGTH}文字までです` };
      body.text = text;
    }
    const now = Date.now();
    if (seat.lastChatAt !== undefined && now - seat.lastChatAt < CHAT_INTERVAL_MS) return { ok: false, reason: '少し待ってから送ってください' };
    seat.lastChatAt = now;
    const profile = seat.userId && this.profileOf ? this.profileOf(seat.userId) : null;
    const entry = { id: ++this.chatCount, seat, at: now, ...(profile ? { profile } : {}), ...body };
    this.chatLog.push(entry);
    if (this.chatLog.length > CHAT_HISTORY) this.chatLog.shift();
    const msg = { type: 'chat', ...this.chatMessage(entry) };
    for (const s of this.seats) if (s.clients.size > 0) this.send(s, msg);
    return { ok: true };
  }

  /**
   * 履歴1件を、送る形にする（送る時点の席番号と名前）。
   * もう部屋にいない人（始まる前に出た・部屋に戻るときに消えた席）の発言は playerId を null にする
   * （席が詰まって、同じ番号の別の人の発言に見えないように）
   */
  chatMessage(entry) {
    const { seat, id, at, text, stamp, profile } = entry;
    const here = this.seats.includes(seat);
    return { id, playerId: here ? seat.playerId : null, name: seat.name, at, ...(profile ? { profile } : {}), ...(here ? {} : { left: true }), ...(text !== undefined ? { text } : { stamp }) };
  }

  // ---------- 部屋（試合の前） ----------

  /** 部屋主だけ・試合の前だけの操作か確かめる。だめなら理由を返す */
  lobbyCheck(seat) {
    if (this.game) return { ok: false, reason: '試合中は変えられません（部屋に戻ってから）' };
    if (seat !== this.host) return { ok: false, reason: '部屋主だけが変えられます' };
    return null;
  }

  /**
   * 試合のチーム（席ごとのチームID）。チームなしなら null
   *   auto：席をシャッフルして、2チームに半分ずつ（奇数ならチームAが1人少ない）。試合のたびに分け直す
   *   choose：各自が選んだチーム
   */
  teamsForGame() {
    if (this.settings.teams === 'off') return null;
    if (this.settings.teams === 'choose') return this.seats.map((s) => s.team);
    const rng = this.makeRng();
    const idx = this.seats.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [idx[i], idx[j]] = [idx[j], idx[i]];
    }
    const teams = Array(this.seats.length);
    idx.forEach((seat, k) => { teams[seat] = k < Math.floor(this.seats.length / 2) ? 't1' : 't2'; });
    return teams;
  }

  /** チームで始められないときの理由（始められるなら null） */
  teamProblem() {
    if (this.settings.teams !== 'choose') return null;
    const counts = {};
    for (const s of this.seats) counts[s.team] = (counts[s.team] ?? 0) + 1;
    if (Object.keys(counts).length < 2) return 'チームが1つしかありません（2チーム以上に分かれてください）';
    if (Object.values(counts).some((n) => n > MAX_TEAM_SIZE)) return `1チームは${MAX_TEAM_SIZE}人までです`;
    return null;
  }

  /** 部屋主が試合を始める（CPU を含めて2人以上） */
  start(seat) {
    if (this.game) return { ok: false, reason: 'もう試合が始まっています' };
    if (seat !== this.host) return { ok: false, reason: '部屋主だけが始められます' };
    if (this.seats.length < MIN_PLAYERS) return { ok: false, reason: `${MIN_PLAYERS}人以上で始められます（CPU を足すこともできます）` };
    const teamProblem = this.teamProblem();
    if (teamProblem) return { ok: false, reason: teamProblem };
    try {
      this.startGame();
    } catch (err) {
      // 選んだ組み合わせを Game が受け付けなかった（data/ の間違いなど）。部屋はそのまま
      console.error(err);
      this.game = null;
      this.broadcastRoom();
      return { ok: false, reason: 'この設定では始められませんでした' };
    }
    return { ok: true };
  }

  /** 部屋主がモードを選ぶ：{ winCondition?, deckMode?, teams?, castleHp?, stage?, faction? } */
  setRules(seat, patch) {
    const bad = this.lobbyCheck(seat);
    if (bad) return bad;
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: '設定の形が正しくありません' };
    const next = { ...this.settings };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'winCondition') {
        if (!Object.hasOwn(WIN_CONDITIONS, value)) return { ok: false, reason: 'その勝ち方はありません' };
        next.winCondition = value;
      } else if (key === 'castleHp') {
        const hp = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
        if (!Number.isInteger(hp) || hp < CASTLE_HP_MIN || hp > CASTLE_HP_MAX) {
          return { ok: false, reason: `城のHPは${CASTLE_HP_MIN}〜${CASTLE_HP_MAX}の整数で入力してください` };
        }
        next.castleHp = hp;
      } else if (key === 'stage') {
        if (!this.data.stages) return { ok: false, reason: 'このサーバーではステージを使いません' };
        if (value !== 'random' && !Object.hasOwn(this.data.stages, value)) return { ok: false, reason: 'そのステージはありません' };
        next.stage = value;
      } else if (key === 'faction') {
        // 陣営（全員が同じ陣営の共有山札）。null で陣営なし
        if (value !== null) {
          if (!this.data.factions) return { ok: false, reason: 'このサーバーでは陣営を使いません' };
          if (typeof value !== 'string' || !Object.hasOwn(this.data.factions, value)) return { ok: false, reason: 'その陣営はありません' };
        }
        next.faction = value;
      } else if (key === 'teams') {
        if (!Object.hasOwn(TEAM_MODES, value)) return { ok: false, reason: 'そのチームの分け方はありません' };
        next.teams = value;
      } else if (key === 'deckMode') {
        if (!Object.hasOwn(DECK_MODES, value)) return { ok: false, reason: 'その山札の形はありません' };
        if (value === 'own' && !this.data.decks) return { ok: false, reason: 'デッキがないので、1人1つのデッキは選べません' };
        if (value === 'cost' && !this.costDecks()) return { ok: false, reason: 'デッキ編成に必要なデータがないので、選べません' };
        next.deckMode = value;
      } else {
        return { ok: false, reason: `「${key}」は変えられません` };
      }
    }
    // 陣営モードは共有山札だけ。陣営を選ぶのに山札が共有でなければ断る。山札を共有以外に変えたときは、陣営を外す
    if (next.faction && next.deckMode !== 'shared') {
      if (Object.hasOwn(patch, 'faction')) return { ok: false, reason: '陣営モードは共有山札（みんな共通）だけです' };
      next.faction = null;
    }
    this.settings = next;
    this.broadcastRoom();
    return { ok: true };
  }

  /**
   * 席の城・デッキを選ぶ：{ castle?, deck? }。自分の席か、部屋主なら CPU の席（playerId で指定）
   * デッキは「1人1つのデッキ」のときに使われる（共通の山札でも選んでおける）
   */
  setSeat(seat, patch, playerId) {
    if (this.game) return { ok: false, reason: '試合中は変えられません（部屋に戻ってから）' };
    let target = seat;
    if (playerId !== undefined && playerId !== seat.playerId) {
      target = this.seatOf(playerId);
      if (!target) return { ok: false, reason: 'その席はありません' };
      if (!target.cpu) return { ok: false, reason: 'ほかの人の席は変えられません' };
      if (seat !== this.host) return { ok: false, reason: 'CPU の席は部屋主だけが変えられます' };
    }
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return { ok: false, reason: '設定の形が正しくありません' };
    const next = { castle: target.castle, deck: target.deck, team: target.team, costDeck: target.costDeck, deckList: target.deckList };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'castle') {
        if (!this.data.castles || typeof value !== 'string' || !Object.hasOwn(this.data.castles, value)) return { ok: false, reason: 'その城はありません' };
        next.castle = value;
      } else if (key === 'team') {
        if (!TEAM_IDS.includes(value)) return { ok: false, reason: 'そのチームはありません' };
        next.team = value;
      } else if (key === 'deck') {
        if (!this.data.decks || typeof value !== 'string' || !Object.hasOwn(this.plainDecks(), value)) return { ok: false, reason: 'そのデッキはありません' };
        next.deck = value;
      } else if (key === 'costDeck') {
        // コスト制の見本のデッキを選ぶ（編成したデッキは使わなくなる）
        if (!this.costDecks() || typeof value !== 'string' || !Object.hasOwn(this.costDecks(), value)) return { ok: false, reason: 'そのデッキはありません' };
        next.costDeck = value;
        next.deckList = null;
      } else if (key === 'deckList') {
        // 自分で編成したデッキ（{ カード種類: 枚数 }）。決まりに合わなければ理由を返す。null で見本に戻す
        if (value === null) {
          next.deckList = null;
        } else {
          if (!this.costDecks()) return { ok: false, reason: 'デッキ編成は使えません' };
          const check = checkCostDeck(value, this.data.cards, this.data.rarities, this.data.rules);
          if (!check.ok) return { ok: false, reason: `デッキが決まりに合いません：${check.reason}` };
          next.deckList = Object.fromEntries(Object.entries(value).filter(([, n]) => n > 0));
        }
      } else {
        return { ok: false, reason: `「${key}」は変えられません` };
      }
    }
    Object.assign(target, next);
    this.broadcastRoom();
    return { ok: true };
  }

  /** 部屋主が CPU を1人足す（level：easy / normal / hard。省略すると normal） */
  addCpu(seat, level = 'normal') {
    const bad = this.lobbyCheck(seat);
    if (bad) return bad;
    if (!Object.hasOwn(CPU_LEVELS, level)) return { ok: false, reason: 'その強さの CPU はいません' };
    if (this.seats.length >= this.capacity) return { ok: false, reason: 'この部屋はもう満員です' };
    const n = this.seats.filter((s) => s.cpu).length + 1;
    const cpuSeat = this.addSeat({ name: `CPU${n}（${CPU_LEVELS[level].name}）`, token: null, cpu: level });
    this.broadcastRoom();
    return { ok: true, playerId: cpuSeat.playerId };
  }

  /** 部屋主が、ほかの人（CPU 以外・部屋にいる人）に部屋主を譲る */
  transferHost(seat, playerId) {
    const bad = this.lobbyCheck(seat);
    if (bad) return bad;
    const target = this.seatOf(playerId);
    if (!target || target.cpu || target.left) return { ok: false, reason: 'その人には譲れません' };
    if (target === seat) return { ok: false, reason: 'もう部屋主です' };
    this.host = target;
    this.broadcastRoom();
    return { ok: true };
  }

  /** 部屋主が CPU を外す */
  removeCpu(seat, playerId) {
    const bad = this.lobbyCheck(seat);
    if (bad) return bad;
    const target = this.seatOf(playerId);
    if (!target || !target.cpu) return { ok: false, reason: 'その席に CPU はいません' };
    this.seats.splice(this.seats.indexOf(target), 1);
    this.renumber();
    this.broadcastRoom();
    return { ok: true };
  }

  /** 試合が終わったあと、部屋に戻る（設定を変えたり、人が入ったりできる）。出た人の席はここで消える */
  backToRoom(seat) {
    if (!this.game) return { ok: false, reason: 'もう部屋にいます' };
    if (this.game.phase !== 'gameOver') return { ok: false, reason: 'まだ試合が終わっていません' };
    if (seat !== this.host) return { ok: false, reason: '部屋主だけが部屋に戻せます' };
    this.stopCpu();
    this.game = null;
    this.rematchVotes.clear();
    this.seats = this.seats.filter((s) => !s.left);
    this.renumber();
    this.fixHost();
    this.broadcastRoom();
    return { ok: true };
  }

  /**
   * 自分から部屋を出る。もう戻れない。
   * 試合の前：席ごと消え、うしろの人の席が詰まる（playerId が変わる。room の you で分かる）
   * 試合中・試合のあと：席は残り、残った人には room の players[].left で伝わる（勝ち負けはつけない）
   */
  leave(seat) {
    if (!this.game) {
      this.seats.splice(this.seats.indexOf(seat), 1);
      // 人がいなくなったら、CPU だけ残っても意味がないので空にする
      if (this.humanSeats.length === 0) this.seats = [];
      this.renumber();
      this.fixHost();
      this.send(seat, { type: 'room', ...this.roomInfo(), you: null });
      this.broadcastRoom();
      return { ok: true };
    }
    seat.left = true;
    this.rematchVotes.delete(seat.playerId);
    this.fixHost();
    this.broadcastRoom();
    return { ok: true };
  }

  /** 試合中に部屋を出た人がいるか（いたら「もう1回」はできない。部屋主が「部屋に戻る」と遊べる） */
  get abandoned() {
    return this.seats.some((s) => s.left);
  }

  /** 降参する。自分の番でなくてもできる。城が2つなら相手の勝ち、3つ以上なら城が壊れて抜け、観戦する */
  surrender(seat) {
    if (!this.game) return { ok: false, reason: 'まだ試合が始まっていません' };
    const result = this.game.surrender(seat.playerId);
    this.broadcastState();
    return result;
  }

  voteRematch(seat) {
    if (!this.game || this.game.phase !== 'gameOver') return { ok: false, reason: 'まだ試合が終わっていません' };
    if (this.abandoned) return { ok: false, reason: '部屋を出た人がいるので、もう1回はできません（部屋主が部屋に戻すと遊べます）' };
    this.rematchVotes.add(seat.playerId);
    this.broadcastRoom();
    // CPU は投票しない（人が全員送ったら始まる）
    if (this.humanSeats.every((s) => this.rematchVotes.has(s.playerId))) this.startGame();
    return { ok: true };
  }

  // ---------- CPU ----------

  /** CPU が動く番なら、cpuDelayMs ごとに1手ずつ進める。人の番になったら止まる */
  runCpu() {
    if (this.cpuTimer || !this.game) return;
    if (this.cpuDelayMs <= 0) {
      for (let i = 0; i < 100000 && this.cpuStep(); i++) this.broadcastState();
      return;
    }
    if (!this.cpuWaiting()) return;
    const game = this.game;
    this.cpuTimer = setTimeout(() => {
      this.cpuTimer = null;
      if (this.game !== game) return;
      if (this.cpuStep()) {
        this.broadcastState();
        this.runCpu();
      }
    }, this.cpuDelayMs);
    this.cpuTimer.unref?.();
  }

  stopCpu() {
    if (this.cpuTimer) clearTimeout(this.cpuTimer);
    this.cpuTimer = null;
  }

  /** 今、CPU が何かする場面か */
  cpuWaiting() {
    const st = this.game.getState(null);
    if (st.phase === 'defend') return Boolean(this.seatOf(st.defense.defenderId)?.cpu);
    if (st.phase === 'mulligan') return st.mulligan.pending.some((id) => this.seatOf(id)?.cpu);
    if (st.phase === 'main' || st.phase === 'discard') return Boolean(this.seatOf(st.currentPlayer)?.cpu);
    return false;
  }

  cpuCtx() {
    const ctx = { cards: this.data.cards, rules: this.game.rules ?? this.data.rules, upgrades: this.data.upgrades ?? {}, discardCount: 0 };
    // CPU の攻撃で CPU が防御を選ぶ場面は、その場で返事をして、攻めた CPU の続きを進める（人なら止まって待つ）
    ctx.onDefense = (game) => {
      for (let i = 0; i < 50; i++) {
        const st = game.getState(null);
        if (st.phase !== 'defend') return;
        const def = this.seatOf(st.defense.defenderId);
        if (!def?.cpu) return;
        this.cpuRespond(def, ctx);
      }
    };
    return ctx;
  }

  strategyOf(seat) {
    return STRATEGIES[CPU_LEVELS[seat.cpu].strategy];
  }

  cpuRespond(seat, ctx) {
    const game = this.game;
    try {
      this.strategyOf(seat).respond(game, seat.playerId, this.cpuRng, ctx);
    } catch (err) {
      console.error('CPU の防御でエラーが起きました', err);
    }
    const st = game.getState(null);
    if (st.phase === 'defend' && st.defense.defenderId === seat.playerId) game.passDefense();
  }

  /** CPU の1手（防御の返事・捨てる・1ターンぶん）。何かしたら true */
  cpuStep() {
    const game = this.game;
    if (!game) return false;
    const st = game.getState(null);
    const ctx = this.cpuCtx();
    if (st.phase === 'mulligan') {
      // CPU は全員まとめて引き直しを選ぶ（人が選び終わるまでは、そのまま待つ）
      const cpus = st.mulligan.pending.filter((id) => this.seatOf(id)?.cpu);
      for (const id of cpus) {
        let ids = [];
        try {
          ids = mulliganChoice(game, id, ctx);
        } catch (err) {
          console.error('CPU のマリガンでエラーが起きました', err);
        }
        if (!game.mulligan(id, ids).ok) game.mulligan(id, []);
      }
      return cpus.length > 0;
    }
    if (st.phase === 'defend') {
      const def = this.seatOf(st.defense.defenderId);
      if (!def?.cpu) return false;
      this.cpuRespond(def, ctx);
      return true;
    }
    const seat = this.seatOf(st.currentPlayer);
    if (!seat?.cpu) return false;
    const strategy = this.strategyOf(seat);
    const pid = seat.playerId;
    if (st.phase === 'discard') {
      const me = game.getState(pid).players[pid];
      ctx.discardCount = me.handCount - me.maxHand;
      let ids = [];
      try {
        ids = strategy.chooseDiscard(game, pid, this.cpuRng, ctx);
      } catch (err) {
        console.error('CPU の捨てるカードでエラーが起きました', err);
      }
      // 戦い方が選べなかったときも止まらないように、手札の前から捨てる
      if (!game.discard(ids).ok) game.discard(me.hand.slice(0, ctx.discardCount).map((c) => c.cardId));
      return true;
    }
    if (st.phase !== 'main') return false;
    if (this.cpuActedTurn !== st.turn) {
      this.cpuActedTurn = st.turn;
      try {
        strategy.takeTurn(game, pid, this.cpuRng, ctx);
      } catch (err) {
        console.error('CPU の手番でエラーが起きました', err);
      }
    }
    // 人が防御を選んでいるあいだはターンを終えない（返事が来たら、続きの endTurn をする）
    const now = game.getState(null);
    if (now.phase === 'main' && now.currentPlayer === pid) game.endTurn();
    return true;
  }

  // ---------- 送るもの ----------

  stateFor(playerId) {
    const game = this.game;
    const state = game.getState(playerId);
    const defending = game.phase === 'defend';
    const myTurn = game.currentPlayer === playerId && !defending;
    const hand = state.players[playerId].hand || [];
    const playable = hand.map((c) => {
      // 防御を待っているとき：攻撃を受ける人は防御カードだけ、ほかの人は何もできない
      if (defending) {
        if (game.pending.defenderId !== playerId) {
          return { cardId: c.cardId, ok: false, reason: '相手が防御を選んでいます', needsTarget: false, targets: [] };
        }
        const r = game.canDefend(c.cardId);
        return { cardId: c.cardId, ok: r.ok, reason: r.reason ?? null, needsTarget: !!r.needsTarget, targets: game.getDefenseTargets(c.cardId) };
      }
      if (!myTurn) return { cardId: c.cardId, ok: false, reason: 'あなたの番ではありません', needsTarget: false, targets: [] };
      const r = game.canPlayCard(c.cardId);
      return { cardId: c.cardId, ok: r.ok, reason: r.reason ?? null, needsTarget: !!r.needsTarget, targets: game.getTargets(c.cardId) };
    });
    const upgrades = {};
    for (const id of Object.keys(this.data.upgrades || {})) {
      const r = myTurn ? game.canBuyUpgrade(id) : { ok: false, reason: defending ? '相手が防御を選んでいます' : 'あなたの番ではありません' };
      upgrades[id] = { ok: r.ok, reason: r.reason ?? null };
    }
    return { state, playable, upgrades };
  }

  /** 席のアイコンとランク（アカウントのある人だけ。ランクは試合のあとに変わるので、短く覚えて取り直す） */
  profileFor(seat) {
    if (!seat.userId || !this.profileOf) return null;
    const now = Date.now();
    if (!seat.profileAt || now - seat.profileAt > 5000) { seat.profileCache = this.profileOf(seat.userId); seat.profileAt = now; }
    return seat.profileCache ?? null;
  }

  roomInfo() {
    return {
      roomId: this.roomId,
      players: this.seats.map((s) => ({
        playerId: s.playerId,
        name: s.name,
        connected: s.cpu ? true : s.clients.size > 0,
        cosmetics: s.cosmetics ?? {},
        profile: this.profileFor(s),
        left: s.left,
        cpu: s.cpu,
        castle: s.castle,
        deck: s.deck,
        // コスト制：見本のデッキの id。自分で編成したデッキなら "custom"
        costDeck: s.deckList ? 'custom' : s.costDeck,
        // 試合中・試合のあとは、その試合のチーム。始まる前は、各自で選ぶときのチーム
        team: this.game ? this.lastTeams?.[this.seats.indexOf(s)] ?? null : s.team,
      })),
      hostId: this.host?.playerId ?? null,
      capacity: this.capacity,
      minPlayers: MIN_PLAYERS,
      started: this.started,
      ranked: !!this.ranked,
      settings: { ...this.settings },
      choices: {
        winConditions: Object.entries(WIN_CONDITIONS).map(([id, name]) => ({ id, name })),
        deckModes: Object.entries(DECK_MODES)
          .filter(([id]) => (id !== 'own' || this.data.decks) && (id !== 'cost' || this.costDecks()))
          .map(([id, name]) => ({ id, name })),
        castles: Object.entries(this.data.castles ?? {}).map(([id, d]) => ({ id, name: d.name ?? id })),
        decks: Object.entries(this.plainDecks()).map(([id, d]) => ({ id, name: d.name ?? id })),
        costDecks: Object.entries(this.costDecks() ?? {}).map(([id, d]) => ({ id, name: d.name ?? id })),
        cpuLevels: Object.entries(CPU_LEVELS).map(([id, d]) => ({ id, name: d.name })),
        castleHpRange: { min: CASTLE_HP_MIN, max: CASTLE_HP_MAX },
        teamModes: Object.entries(TEAM_MODES).map(([id, name]) => ({ id, name })),
        // ステージ（stages.json がなければ空）。最初は「ランダム」
        // 陣営（factions.json がなければ空）。「なし」は画面が先頭に足す
        factions: Object.entries(this.data.factions ?? {}).map(([id, d]) => ({ id, name: d.name ?? id })),
        stages: this.data.stages ? [{ id: 'random', name: 'ランダム' }, ...Object.entries(this.data.stages).map(([id, d]) => ({ id, name: d.name ?? id, icon: d.icon ?? null }))] : [],
        teams: TEAM_IDS.map((id) => ({ id, name: TEAM_NAMES[id] })),
      },
      rematchVotes: [...this.rematchVotes],
    };
  }

  send(seat, msg) {
    for (const client of seat.clients) client(msg);
  }

  broadcastRoom() {
    const info = this.roomInfo();
    for (const seat of this.seats) {
      if (seat.clients.size > 0) this.send(seat, { type: 'room', ...info, you: seat.playerId });
    }
  }

  broadcastState() {
    if (!this.game) return;
    for (const seat of this.seats) {
      if (seat.clients.size > 0) this.send(seat, { type: 'state', ...this.stateFor(seat.playerId) });
    }
  }
}

export class Lobby {
  /**
   * @param {object} data
   * @param {() => () => number} makeRng
   * @param {{ cpuDelayMs?: number }} [options] 部屋に渡す（Room の options）
   */
  constructor(data, makeRng, options = {}) {
    this.data = data;
    this.makeRng = makeRng;
    this.options = options;
    /** @type {Map<string, Room>} 合言葉 → 部屋 */
    this.rooms = new Map();
    this.nextRoom = 1;
  }

  join(passphrase, name, userId = null) {
    if (typeof passphrase === 'string' && passphrase.startsWith('\u0000')) return { ok: false, reason: '合言葉が正しくありません' };
    if (typeof passphrase !== 'string' || passphrase.trim().length < 1 || passphrase.length > 32) {
      return { ok: false, reason: '合言葉は1〜32文字で入れてください' };
    }
    if (typeof name !== 'string' || name.trim().length < 1 || name.length > 16) {
      return { ok: false, reason: '名前は1〜16文字で入れてください' };
    }
    const key = passphrase.trim();
    let room = this.rooms.get(key);
    const nobody = (r) => r.humanSeats.every((s) => s.clients.size === 0);
    // 始まる前に全員が帰ってしまった部屋（30秒以上だれもつないでいない）は作り直す
    if (room && !room.started && nobody(room) && Date.now() - room.lastActive > 30 * 1000) room = this.drop(key);
    // 試合中にだれかが自分から出た部屋は、もう遊べないので作り直す（残った人は「相手が部屋を出ました」を見ている）
    if (room && room.abandoned) room = this.drop(key);
    if (!room && this.rooms.size >= MAX_ROOMS) return { ok: false, reason: '部屋がいっぱいです。しばらくしてから入り直してください' };
    // 試合が終わって誰もつないでいない部屋は作り直す
    if (room && room.started && room.game.phase === 'gameOver' && nobody(room)) room = this.drop(key);
    if (!room) {
      room = new Room(`r${this.nextRoom++}`, this.data, this.makeRng, this.options);
      this.rooms.set(key, room);
    }
    return room.join(name.trim(), userId);
  }

  /**
   * ランクマッチが成立したときの部屋を、サーバーが作る（合言葉では入れない）。すぐ試合が始まる。
   * @param {{ userId: string, name: string, deckList?: object|null }[]} users 席の順
   */
  createRankedRoom(users, ranked) {
    const room = new Room(`r${this.nextRoom++}`, this.data, this.makeRng, { ...this.options, ranked });
    room.settings = { winCondition: 'firstDestroy', deckMode: 'cost', teams: 'off', castleHp: this.data.rules.castleMaxHp, stage: 'random', faction: null };
    const seats = {};
    for (const u of users) {
      const r = room.join(u.name, u.userId);
      const seat = room.seatByToken(r.token);
      if (u.deckList) seat.deckList = u.deckList;
      seats[u.userId] = { token: r.token, playerId: r.playerId };
    }
    this.rooms.set(`\u0000ranked:${room.roomId}:${randomBytes(8).toString('hex')}`, room);
    room.startGame();
    room.startRankedWatch();
    return { room, roomId: room.roomId, matchId: room.matchMeta.matchId, seats };
  }

  drop(key) {
    this.rooms.get(key)?.stopCpu();
    this.rooms.get(key)?.stopWatch?.();
    this.rooms.delete(key);
    return null;
  }

  /** このアカウントが、いま進行中の試合に席を持っているか（ランクの待ち行列に並ぶ前の確認） */
  activeSeatOfUser(userId) {
    for (const room of this.rooms.values()) {
      if (room.game && room.game.phase !== 'gameOver' && room.seats.some((s) => s.userId === userId && !s.left)) return true;
    }
    return false;
  }

  findSeat(token) {
    if (typeof token !== 'string') return null;
    for (const room of this.rooms.values()) {
      const seat = room.seatByToken(token);
      if (seat) return { room, seat };
    }
    return null;
  }

  /** しばらく使われていない部屋を消す */
  sweep(maxIdleMs) {
    const now = Date.now();
    for (const [key, room] of this.rooms) {
      const idle = room.humanSeats.every((s) => s.clients.size === 0) && now - room.lastActive > maxIdleMs;
      if (idle) this.drop(key);
    }
  }
}
