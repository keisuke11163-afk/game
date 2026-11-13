# キャッスルフィールド（城攻めカードゲーム）

ゴッドフィールドを参考にした、城攻めの対戦カードゲーム。
手札から兵士・武器・魔法のカードを出して相手の城に送り込み、先に城を落とした人が勝つ。
途中で中央に魔物が現れ、とどめを刺した人がボーナスをもらえる。

企画書（全体の仕様）：https://claude.ai/artifact/7RTPauHRXWenSp1grsePnf
このファイルは、企画書から開発に必要な部分を抜き出したもの。

- 企画書は2人とも開ける状態にしておく（共有設定を確認すること）
- **実装の判断はこのファイルを正とする。** 企画書と食い違いを見つけたら、実装を止めて人間に確認し、このファイルを直すPRを出す
- 企画書を更新したら、このファイルの該当箇所も同じPRで直す

## チーム開発のルール（必ず守ること）

このリポジトリは2人で開発している。それぞれが自分のClaude Codeを使って作業する。

- **main に直接コミットしない。** 作業は必ずブランチで行い、プルリクエスト（PR）でまとめる
- ブランチ名：`feature/<内容>`、`fix/<内容>`、`docs/<内容>`（例：`feature/soldier-move`）
- **PRは相手の承認を受けてからマージする。** 自分のPRを自分でマージしない
- **担当外のフォルダは変更しない。** 指示で「触っていい範囲」が示されたら、その外のファイルは編集しない。必要なときは変更せず、PRの説明文に「相手側で必要な変更」として書く
- 作業を始める前に `git pull origin main` で最新を取り込む
- 仕様に書かれていないことを決めるとき、仕様と違うやり方にしたいときは、実装する前に必ず人間に確認する
- 1つのPRは1つの機能にする。大きくなりすぎたら分ける
- コミットメッセージは日本語でよい。何を変えたかが一行でわかるように書く

## ゲームづくりの原則（桜井流）

YouTube「桜井政博のゲーム作るには」の考え方を、このゲーム向けにまとめたもの。仕様を決めるとき、カードを足すとき、PRをレビューするときは、この原則に照らす。

- スキル `sakurai`（https://github.com/kociden/sakurai-skill ）が入っている環境では、企画・調整・レビューのときに必ず読み込む。入っていなくても、以下の原則は守る
- 迷ったら「遊ぶ人が楽しいか」で決める。作る側の都合や好みは理由にしない
- 判断を先送りしない。決まっていないことは、その場で人間に聞いて決める

### カードとルール
- **どのカードにも長所と短所をつける。** 他のカードの完全な上位互換・下位互換を作らない（例：速いけど弱い／遅いけど強い）
- **大きな見返りには、大きなリスクを。** すぐ効く・防げないカードは弱めに、時間がかかる・妨害されうるカードは強めにする
- 平均的なカードばかりにしない。強みは尖らせ、調整は威力以外（速さ・枚数・使い切りなど）で行う
- **必ず決着がつくようにする。** 回復や防御が攻撃を上回り続けて終わらない状態は、仕様の不具合として扱う
- 運だけで勝敗が決まらないようにする。引くカードは運でも、それをどう使うかで差がつくようにする

### 遊びやすさ
- 1試合は10分前後を目安にする。最初の1分で面白さが伝わるようにする（長い説明から始めない）
- 待ち時間を短く。演出・画面切り替え・アニメーションは長すぎないか常に見直す。演出はタップで飛ばせるようにする
- 押して何も起きない操作を作らない。出せないカードは、出せない理由を表示する
- 負けた人も「もう1回」と思えるように、再戦までの操作を短くする

### 手応え
- 攻撃が当たったときは、一瞬止める（ヒットストップ）・画面を揺らす・数字を大きく出す、をセットで入れる
- 強い攻撃ほど、止める時間・揺れ・音を大きくする
- 勝った人を派手に褒める演出を入れる

### 調整のしかた
- 数値は `data/` に出し、JSONを直してリロードするだけで試せるようにする
- デバッグモードを用意する（URLに `?debug=1`：城HPや手札を自由に変えられる、山札の順番を固定できる）
- カードや数値を変えたら、何試合か通して遊び、決着までの手番数と「出すカードに迷う場面があるか」を確かめてPRに書く
- 作った本人は慣れているので、難しさや分かりにくさは「思ったより下げる」くらいでちょうどよい。初めての人に遊んでもらい、説明せずに反応を見る

## 担当の分け方

| 領域 | フォルダ・ファイル | 内容 |
|---|---|---|
| ゲームロジック | `js/game/`、`data/`、`tests/`、`server/` | ターン進行、兵士の進軍、カード効果、勝敗判定、数値データ、自動テストとシミュレーション、オンライン対戦のサーバー |
| 画面（UI） | `index.html`、`css/`、`js/ui/`、`js/main.js`、`assets/` | レイアウト、手札の表示、アニメーション、入力、Game と UI の接続、画像素材 |
| 共有 | `CLAUDE.md` | 変更は2人で相談してから。PRで相手の承認を必須とする |

ロジックと画面のつなぎ方は、下の「ロジックとUIの約束」に従う。この約束を変えるときは、2人で相談してからこのファイルを更新する。

## 技術

- HTML / CSS / JavaScript（フレームワークなし、ES Modules）
- 起動：リポジトリのルートで `python3 -m http.server` を実行し、`http://localhost:8000` を開く（Windows は `python -m http.server`）
- 自動テスト：リポジトリのルートで `node --test`（Node.js 22.7 以上。`package.json` がなくても `.js` を ES Modules として読めるのが 22.7 から。外部パッケージは使わない）。ロジックを変えたら必ず全部通してからPRを出す。新しい機能にはテストを足す
- バランスのシミュレーション：`node tests/sim/run.js`（いろいろな戦い方の組み合わせで各1000試合）。乱数はシード付きなので、同じ引数なら誰が回しても同じ結果になる
  - `--games 200`（試合数）、`--seed 7`、`--match smart,random`（1つの組み合わせだけ）、`--rules '{"castleMaxHp":30}'`・`--cards '{"fireball":{"count":3}}'`（`data/` を書き換えずに一部の値だけ試す）、`--json`
  - 「出せる種類が2以上」の列は、出せるカードが2種類以上あったターンの割合（目安）。本当に迷うかは人が遊んで確かめる
  - 戦い方（`tests/sim/strategies.js`）：`random`（出せるカードからランダム）、`aggro`（城への魔法 → 兵士）、`smart`（ほどよく考える）、`defensive`（守り優先）、`guard`（兵士で守る）、`pass`（何も出さない）
- 数値はコードに直接書かない（バランス調整をJSONだけでできるようにするため）
  - カードの数値 → `data/cards.json`
  - ルールの数値（城HP、手札枚数、道の長さ `laneLength` など）→ `data/rules.json`
- ゲームロジックは画面（DOM）に一切触らない。後でオンライン対戦にするとき、ロジックをそのままサーバーに移すため
- ゲームロジックは乱数を外から渡せるようにする（`new Game({ rng })`）。テストで山札の順番を固定するため

## フォルダ構成

```
index.html
css/
  style.css
js/
  main.js          … 起動。Game と UI をつなぐ（UI担当）
  game/            … ゲームロジック（DOMを使わない）
    Game.js
    Player.js
    Castle.js
    Card.js
    Soldier.js
    Road.js        … 道（となりの席どうしをつなぐ）
    Monster.js     … 魔物と、強化のデータのチェック
    visibility.js  … オンラインで、イベントをプレイヤーごとに隠す決まり
  ui/              … 画面表示と入力
    Renderer.js
    HandView.js
    Animations.js
data/
  cards.json       … カードの定義
  rules.json       … ルールの数値
  monsters.json    … 魔物の定義（STEP 3）
  upgrades.json    … コインで買う強化（STEP 3）
tests/             … 自動テスト（node --test）。Node.js だけで動く
  helpers.js       … data/ と fixtures/ の読み込み、シード付き乱数、イベントの記録
  fixtures/        … テスト用の固定データ（data/ を調整してもロジックのテストが落ちないように）
  *.test.js        … テスト本体
  sim/             … バランス確認のシミュレーション
    sim.js         … 1試合・何試合も回して数字を集める
    strategies.js  … 戦い方（random / aggro / smart / defensive / guard / pass）
    run.js         … 表を出すコマンド
server/            … オンライン対戦のサーバー（Node.js だけ。ロジック担当）
  server.js        … HTTP（合言葉で入る・操作を受ける・SSE で送る）。node server/server.js で起動
  rooms.js         … 部屋と席。Game を動かし、プレイヤーごとに隠して送る
assets/            … 画像素材（UI担当）
  STYLE.md         … 絵柄の決まりと、画像生成AIに使う共通の指示文
  CREDITS.md       … 素材ごとの出どころとライセンス
  bg/              … 背景
  castles/         … 城
  units/           … 兵士（盤面に置くもの）
  cards/           … カードの絵と枠
  fx/              … 演出（爆発・雷・回復・土けむりなど）
  ui/              … ボタン・看板・帯などの画面部品
```

## 画像素材

見た目は、明るいカートゥーン調のファンタジー（太めのこげ茶の輪郭線、やわらかい影、2頭身のちびキャラ）でそろえる。絵柄の決まりと、画像生成AIに毎回付ける共通の指示文は `assets/STYLE.md` に書く。

- **絵柄をそろえる**：新しい絵は、必ず `assets/STYLE.md` の共通の指示文を使って作る。作者や絵柄がばらばらの素材を混ぜない
- **形式**：背景が透明な PNG。背景は 1080×1920（9:16）、城は横 512px、兵士は 256×256、カードの絵は 512×512、カードの枠は 512×768 を目安にする。1枚 300KB 以下に圧縮する
- **ファイル名**：小文字の英字とハイフンだけ。プレイヤーの色は最後に付ける
  - 盤面の兵士：`units/<カード種類>-blue.png`、`units/<カード種類>-orange.png`（例：`units/infantry-blue.png`）
  - 城：`castles/castle-blue.png`、壊れ具合は `castles/castle-blue-damaged-1.png` のように番号を付ける
  - カードの絵：`cards/card-<カード種類>.png`（`<カード種類>` は `cards.json` のキー。例：`cards/card-fireball.png`）
  - カードの枠：`cards/frame-soldier.png`、`cards/frame-spell.png`
- **プレイヤーの色**：p1 は空色（blue）、p2 は夕焼けオレンジ（orange）
- **画像の割り当ては画面側で決める**：どのカードにどの画像を使うかは `js/ui/` に書き、`data/cards.json` には画像の情報を入れない（ロジックを画面に依存させないため）。カードを増やしたら、同じ名前の決まりで画像を足す
- **出どころを記録する**：素材を足すときは、同じPRで `assets/CREDITS.md` に「ファイル名・作った道具（画像生成AIの名前）か配布元・ライセンス・作った日」を書く
- **ライセンスを守る**：使う前に利用規約を確認する。再配布が禁止されている素材は、リポジトリが公開されている間は入れない

## ロジックとUIの約束

UIはゲームの状態を直接書き換えない。必ず Game のメソッドを呼ぶ。

### 用語

- プレイヤーID：`"p1"`、`"p2"`。先攻は `"p1"`
- カード種類（type）：`cards.json` のキー。例：`"infantry"`
- カードID（cardId）：山札の1枚1枚につく一意のID。例：`"c07"`。同じ種類のカードでもIDは別
- 兵士ID（soldierId）：場に出た兵士につく一意のID。例：`"s03"`
- カードIDは山札をシャッフルしたあとの順に振る。IDから種類は分からない
- 道ID（roadId）：となりの席の2人をつなぐ道のID。2人のIDを席順で `-` でつなぐ。例：`"p1-p2"`。2人なら道は `"p1-p2"` の1本だけ
- 対象（target）：カードを出す先。`{ monsterId }`（ファイアボールで魔物を狙う）もある。`{ playerId }`（兵士は送り込む相手、攻撃の魔法は攻める相手、ヒール・城壁は自分）、`{ soldierId }`（武器・盾：道の上の自分の兵士）、`{ roadId, square }`（トラップ：自分の側のマス）。

### UIから呼ぶもの

| メソッド | 説明 |
|---|---|
| `new Game({ cards, rules, rng, monsters, upgrades })` | ゲームを作る。`cards` / `rules` / `monsters` / `upgrades` は `data/` の JSON の中身（Game はファイルを読まない）。`monsters` / `upgrades` は省略でき、省略すると魔物は出ず強化は買えない。`rng` は 0以上1未満を返す乱数で、省略すると `Math.random`。作った時点で初期手札は配られていて、`phase` は `"ready"`。イベントは出さない |
| `game.start()` | ゲームを始める。全イベントを `on()` で購読してから呼ぶと、p1 のターン1が始まる（`turnStarted` → ドロー → 進軍） |
| `game.getState(viewerId)` | 今の状態をただのオブジェクトで返す。`viewerId` の手札は中身まで、相手の手札は枚数だけ入る |
| `game.canPlayCard(cardId, target)` | そのカードを今出せるかを返す（読むだけで、状態は変わらない）。出せないときは `{ ok: false, reason }`。`playCard` と同じ判定なので、UIは出せない理由を前もって表示できる。`target` を省略して、対象が2つ以上あるときは `{ ok: true, needsTarget: true }` |
| `game.getTargets(cardId)` | そのカードを今出せる対象の一覧（読むだけ）。出せないときは空の配列。対象の形は下の「対象」 |
| `game.playCard(cardId, target)` | カードを使う。対象が1つしかないときは `target` を省略してよい（2人なら、魔物がいないときは今のカードはすべて省略できる。魔物がいるとファイアボールは「相手の城か魔物か」を選ぶ）。対象が2つ以上あるのに省略すると `{ ok: false, reason: "対象を選んでください", needsTarget: true }` |
| `game.discard(cardIds)` | 手札を捨てる。`phase` が `"discard"` のときだけ使える。捨てる必要がある枚数ちょうどを1回で渡す（多い・少ない・重複・手札にないカードは `{ ok: false }`）。捨て終わったら、自動で次の人のターンが始まる（`endTurn()` を呼び直さない） |
| `game.canBuyUpgrade(upgradeId)` | 強化を今買えるか（読むだけ）。`{ ok }` か `{ ok: false, reason }` |
| `game.buyUpgrade(upgradeId)` | コインで強化を買う。自分のメインの場面（`phase` が `"main"`）で何回でも。メインの1枚とは別 |
| `game.endTurn()` | ターンを終える。手札が上限を超えていたら `phase` が `"discard"` になり、捨て終わるまで次の人の番にならない |
| `game.on(type, handler)` / `game.off(type, handler)` | イベントの購読と解除。`handler` はペイロードのオブジェクトを1つ受け取る。表にない `type` を渡すと `{ ok: false }` |

- 操作が許されないとき（自分の番でない、1ターンに2枚目を出した、など）は例外を投げず、`{ ok: false, reason: "..." }` を返す。成功したら `{ ok: true }`。`reason` はそのまま画面に出せる日本語の文
- `cards` / `rules` の中身が間違っているときだけは、`new Game()` が例外を投げる（どこが悪いかを書いた Error）
- イベントは操作の中で同期的に、起きた順に発行される。UIはキューにためて順番にアニメーションする
- `handler` の中で例外が出ても、Game は `console.error` に出して処理を続ける（ゲームの状態が途中で止まらないように）

#### デバッグ用（`?debug=1` のときだけ使う）

| メソッド | 説明 |
|---|---|
| `game.debugSetCastleHp(playerId, hp)` | 城HPを変える（1〜その城の上限の整数。後攻の城は上限が高い）。`phase` が `"gameOver"` のときは使えない |
| `game.debugSetHand(playerId, types)` | 手札をカード種類の並びで作り直す（例：`["infantry", "fireball"]`）。カードIDは新しく振り、元の手札はゲームから消える。`phase` が `"discard"` のときは使えない |
| `game.debugSetDeck(types)` | 山札をカード種類の並びで作り直す。配列の先頭から順に引かれる。カードIDは新しく振り、元の山札はゲームから消える |

- どれも `{ ok: true }` か `{ ok: false, reason }` を返す。イベントは出さないので、呼んだあとは `getState()` を読み直して描き直す
- `start()` の前に呼べば、開始時の状態を作れる
- 山札の順番を毎回同じにしたいときは、`new Game()` にシード付きの `rng` を渡す

### getState() の形

```js
{
  playerOrder: ["p1", "p2"],   // 席順（手番の順）
  round: 2,                    // 周回（席順の最初の人のターンが始まるたびに1増える。start() の前は 0）
  monsters: [{ monsterId: "m01", type: "slime", roadId: "p1-p2", square: 2, hp: 4, maxHp: 4, attack: 1, element: "water", attackIn: 3, reward: 2, castleAttack: 2 }],
  roads: [{ roadId: "p1-p2", players: ["p1", "p2"], length: 5 }],  // 道。length はいつも laneLength
  turn: 3,                     // 通算ターン数（1から）
  currentPlayer: "p1",
  phase: "main",               // "ready"（start() の前）| "main" | "discard" | "gameOver"
  winner: null,                // 決着したら "p1" か "p2"
  deckCount: 18,
  discardCount: 5,
  exhaustedCount: 1,           // 使い切り置き場の枚数（使い切りのカードを使うとここへ行き、山札に戻らない）
  players: {
    p1: {
      castleHp: 22,
      castleMaxHp: 25,         // その城の上限。後攻（p2）は castleMaxHp + secondPlayerCastleBonus
      hand: [{ cardId: "c07", type: "infantry" }],  // viewer 本人のみ。相手は null
      handCount: 7,
      playedThisTurn: false,   // このターンにメインのカードを出したか
      eliminated: false,       // 負けて抜けたか（3人以上のときに使う。2人ならいつも false）
      cardsPlayedThisTurn: 2,  // このターンに出した枚数（メイン・付加・防御すべて）
      drawNextTurn: 1,         // 次のターンに引く枚数
      armor: 0,                // 城壁の残り
      coins: 2,                // コイン（魔物のとどめでもらう）
      traps: [{ trapId: "t01", roadId: "p1-p2", square: 1, type: "pit" }],  // type は本人にだけ見え、ほかの人には null
      soldiers: [{
        soldierId: "s03", type: "knight", hp: 4, attack: 6, position: 3, roadId: "p1-p2", targetId: "p2",
        weapon: "waterSpear",  // 持っている武器のカード種類か null
        element: "water",      // "fire" | "water" | "wood" | null
        shield: 0,             // 盾の残り
        statuses: { poison: { amount: 1, turns: 2 } /* か null */, frozen: 0 /* 凍結の残り回数 */ }
      }]
    },
    p2: { /* 同じ形 */ }
  }
}
```

- `getState(null)` のように、どちらのプレイヤーIDでもない値を渡すと、両方の `hand` が `null` になる（手番交代の目隠し中などに使う）
- `turn` は `start()` の前は 0
- `position` は「自分の城から数えたマス」（0 = 自分の城の前、`laneLength - 1` = 相手の城の前）
- 画面で道の上に置くときは「道のマス番号」（その道の `players[0]` の城側を 0 とする。2人なら p1 の城側）に直す
  - 道の `players[0]` の兵士：道のマス番号 = `position`
  - 道の `players[1]` の兵士：道のマス番号 = `laneLength - 1 - position`
- 兵士の `targetId` は、その兵士が向かっている相手（道の向こうの人）

### Gameが出すイベント

UIはこれを受けてアニメーションする。イベントを増やすときは、この表に追記する。

| イベント | ペイロード |
|---|---|
| `turnStarted` | `{ playerId, turn }` |
| `cardDrawn` | `{ playerId, cardIds }` |
| `deckShuffled` | `{ deckCount }` |
| `cardPlayed` | `{ playerId, cardId, type }` … トラップのときは `type` が `null`（相手に種類を見せない。本人は手札で分かる） |
| `discardRequired` | `{ playerId, count }` … 捨てる必要がある枚数 |
| `cardDiscarded` | `{ playerId, cardIds }` |
| `soldierDeployed` | `{ playerId, soldierId, type, roadId, targetId, position, hp, attack }` … `hp` / `attack` は出した時点の値 |
| `soldierMoved` | `{ playerId, soldierId, roadId, from, to }` |
| `soldiersClashed` | `{ attacker: { playerId, soldierId }, defender: { playerId, soldierId }, roadId, square }` … 道の上で兵士同士がぶつかった。`attacker` は進軍中の側。`square` は**攻める側が止まったマス**の道のマス番号（1マス先の相手と戦うときも攻める側のマス） |
| `soldierDamaged` | `{ playerId, soldierId, amount, hp, cause, blocked }` … `cause` は `"fight"` / `"spell"` / `"poison"` / `"trap"`。`blocked` は盾が受けた量（`amount` は与えようとしたダメージ） |
| `soldierDestroyed` | `{ playerId, soldierId, reason }` … `reason` は `"killed"` か `"reachedCastle"` |
| `spellCast` | `{ playerId, type, target, targetKind }` … `target` は効果を受けるプレイヤーIDか魔物IDの**文字列**、`targetKind` は `"player"` か `"monster"`（`playCard` に渡す `target` のオブジェクトとは形が違う）（ファイアボール・サンダーは相手、ヒールは自分） |
| `castleDamaged` | `{ playerId, amount, blocked, hp, source }` … `playerId` は城の持ち主。`amount` は攻撃力・魔法の値そのまま（`hp` は0未満にならない）。`blocked` は城壁が受けた量（`hp` は城壁で減らしたあとの値）。`source` は `{ kind: "soldier", soldierId }` か `{ kind: "spell", type }` |
| `castleHealed` | `{ playerId, amount, hp }` … `amount` は実際に増えた量（上限で止まったぶんは含まない） |
| `weaponEquipped` | `{ playerId, soldierId, type, attack, element }` … 武器を持たせた。`attack` は持たせたあとの攻撃力 |
| `shieldAdded` | `{ playerId, soldierId, amount, shield }` … `shield` は足したあとの盾 |
| `castleArmored` | `{ playerId, armor }` … 城壁を置いた |
| `armorExpired` | `{ playerId }` … 城壁が消えた（その人のターンの始め） |
| `trapSet` | `{ playerId, trapId, roadId, square }` … トラップを伏せた（種類は入れない） |
| `trapTriggered` | `{ playerId, trapId, type, soldierId, roadId, square }` … `playerId` は置いた人。発動したら種類が見える |
| `statusApplied` | `{ playerId, soldierId, status, turns }` … `status` は `"poison"` か `"frozen"` |
| `statusCleared` | `{ playerId, soldierId, status }` |
| `roundStarted` | `{ round }` … 周回の始め（`turnStarted` のすぐあと） |
| `monsterAppeared` | `{ monsterId, type, roadId, square, hp, attack, element }` |
| `monsterAttackedCastle` | `{ monsterId, playerId, amount, hp }` … 放置された魔物が城を攻めた。`playerId` は城の持ち主、`amount` は実際に減った量（城HPは1より下がらない） |
| `monsterClashed` | `{ attacker: { playerId, soldierId }, monsterId, roadId, square }` … 兵士が魔物と戦う。`square` は兵士が止まったマス |
| `monsterDamaged` | `{ monsterId, amount, hp, by }` … `by` は `{ playerId, soldierId }`（兵士）か `{ playerId, type }`（魔法） |
| `monsterDefeated` | `{ monsterId, playerId, reward }` … `playerId` はとどめを刺した人 |
| `coinsChanged` | `{ playerId, delta, coins, reason }` … `reason` は `"reward"` か `"upgrade"` |
| `upgradeBought` | `{ playerId, upgradeId, cost }` … このあと効果のイベント（`castleHealed` / `cardDrawn` / `soldierBuffed`） |
| `soldierBuffed` | `{ playerId, soldierId, attack }` … とぎ石で攻撃力が上がった |
| `gameOver` | `{ winner }` |

#### イベントの順番

- ターンの始め：`turnStarted` → ドロー → 進軍
  - ドロー：山札が途中で尽きたら `deckShuffled` → 残りを引く。`cardDrawn` は引いたぶんを1回にまとめて出す。1枚も引かなければ `cardDrawn` は出さない
  - 進軍：兵士は出した順に1体ずつ動く。城に着いた兵士は `soldierMoved` → `castleDamaged` → `soldierDestroyed`（`"reachedCastle"`）の順に出す
  - 城に着いた兵士の `soldierMoved.to` は `laneLength` にそろえる（5以上に進んでも 5）
  - 兵士同士が戦うとき：`soldierMoved`（止まった位置まで。動かなければ出さない）→ `soldiersClashed` → `soldierDamaged`（守る側）→ `soldierDamaged`（攻める側）→ HPが0以下の兵士の `soldierDestroyed`（`"killed"`）。両方消えるときは**守る側 → 攻める側**の順（`soldierDamaged` と同じ順番）
  - 進軍の途中で城HPが0以下になったら、残りの兵士は動かさずにすぐ `gameOver` を出す
- 進軍（STEP 2）：1体ずつ「毒の `soldierDamaged`（`cause: "poison"`）→（0なら `soldierDestroyed` で、動かない）→（凍結なら休んで、0回になったら `statusCleared`）→ 動く」。1マス進むごとにトラップ → 戦う相手の順に確かめ、トラップなら `soldierMoved`（そのマスまで）→ `trapTriggered` → `soldierDamaged`（`cause: "trap"`）→（0なら）`soldierDestroyed`。トラップにかかったらそのターンは止まる
- 強化を買ったとき：`coinsChanged`（`reason: "upgrade"`）→ `upgradeBought` → 効果のイベント
- 周回の始め（席順の最初の人のターン）：`turnStarted` → `roundStarted` → 放置された魔物の `monsterAttackedCastle`（出た順）→ `monsterAppeared`（道の順）→ 城壁の `armorExpired` → ドロー → 進軍
- 兵士と魔物の戦い：`soldierMoved`（動いたら）→ `monsterClashed` → `monsterDamaged` → `soldierDamaged`（兵士）→（魔物が0なら）`monsterDefeated` → `coinsChanged` →（兵士が0なら）`soldierDestroyed`。1マスごとにトラップ → 相手の兵士 → 魔物の順に確かめる
- ファイアボールで魔物：`cardPlayed` → `spellCast`（`target` は `monsterId`）→ `monsterDamaged` →（0なら）`monsterDefeated` → `coinsChanged`
- ターンの始めに城壁が残っていたら、`turnStarted` のすぐあと（ドローの前）に `armorExpired`
- カードを出したとき：`cardPlayed` のあと
  - 兵士：`soldierDeployed`
  - ファイアボール：`spellCast` → `castleDamaged`
  - サンダー：`spellCast` → 相手の兵士1体ずつ `soldierDamaged` →（HPが0なら）`soldierDestroyed`（`"killed"`）
  - ヒール：`spellCast` → `castleHealed`
  - 毒の霧・氷の息：`spellCast` → 相手の兵士1体ずつ `statusApplied`
  - 武器：`weaponEquipped`／盾：`shieldAdded`／城壁：`castleArmored`／トラップ：`trapSet`
- ターン終了：手札が上限を超えていたら `discardRequired`。捨てたら `cardDiscarded` → 次の人の `turnStarted` …
- `gameOver` はいちばん最後に1回だけ出る。そのあとの操作はすべて `{ ok: false }`

### データの形

`data/rules.json`

```json
{
  "castleMaxHp": 25,
  "secondPlayerCastleBonus": 2,
  "initialHand": 5,
  "drawPerTurn": 1,
  "firstTurnDraw": 1,
  "maxHand": 8,
  "laneLength": 5,
  "elementBonus": 2,
  "trapMaxPosition": 1,
  "drawPerCardUsed": 1,
  "monsterFirstRound": 3,
  "monsterSpawnChance": 0.35
}
```

`data/cards.json`（キーがカード種類）

```json
{
  "infantry":  { "name": "歩兵", "kind": "soldier", "hp": 5, "attack": 3, "speed": 2, "count": 10 },
  "knight":    { "name": "騎士", "kind": "soldier", "hp": 4, "attack": 5, "speed": 3, "count": 6 },
  "fireball":  { "name": "ファイアボール", "kind": "spell", "effect": "damageEnemyCastle", "amount": 8, "count": 6 },
  "thunder":   { "name": "サンダー", "kind": "spell", "effect": "damageEnemySoldiers", "amount": 3, "count": 6 },
  "heal":      { "name": "ヒール", "kind": "spell", "effect": "healOwnCastle", "amount": 10, "count": 6, "exhaust": true },
  "flameSword":  { "name": "炎の剣", "kind": "weapon", "attackBonus": 1, "element": "fire", "count": 2 },
  "shield":      { "name": "盾", "kind": "defense", "effect": "shieldSoldier", "amount": 3, "count": 3 },
  "pit":         { "name": "落とし穴", "kind": "trap", "effect": "pit", "amount": 3, "count": 3 },
  "poisonMist":  { "name": "毒の霧", "kind": "spell", "effect": "poisonEnemySoldiers", "amount": 1, "turns": 3, "count": 3 }
}
```

- `monsterFirstRound`：魔物が出はじめる周回（省略すると3）。`monsterSpawnChance`：周回の始めに、魔物がいない道ごとに魔物が出る確率（0〜1の数。省略すると0）
- `elementBonus`：属性が強いときに増えるダメージ（省略すると0）。`trapMaxPosition`：トラップを置ける、自分の城から数えた位置の上限（省略すると1）。`drawPerCardUsed`：次のターンに引く枚数 ＝ max(`drawPerTurn`, 使った枚数 × これ)（省略すると0 ＝ いつも `drawPerTurn`）
- カードの `kind`：`soldier` / `spell` / `weapon`（`attackBonus`、`element`）/ `defense`（`effect`: `shieldSoldier` / `armorCastle`、`amount`）/ `trap`（`effect`: `pit`、`amount`）。魔法の `effect` に `poisonEnemySoldiers`（`amount`, `turns`）と `freezeEnemySoldiers`（`turns`）が増えた。`element` は `fire` / `water` / `wood`
- `secondPlayerCastleBonus`：後攻（p2）の城だけ、HPと上限がこのぶん多い（先攻有利をやわらげるため）。0以上の整数
- `firstTurnDraw`：先攻の最初のターンに引く枚数（2ターン目以降と後攻は `drawPerTurn`）
- `exhaust`：`true` のカードは使い切り。使うと使い切り置き場へ行き、山札に戻らない。省略すると `false`。手札の上限で捨てたときは、ふつうに捨て札置き場へ行く（山札に戻る）
- カードの説明文は UI が `kind` / `effect` と数値から組み立てる。カードに `description` を書けば、そちらを優先する（Game は `description` を使わない）

## ゲームのルール（現在：STEP 1）

STEP 1 は、2人が同じ端末で交互に遊ぶ最小版。数値はすべて仮（`data/` で調整する）。

- 城HP：25（上限も25）。後攻（p2）の城は 27 で始まる（上限も27）
- 山札：2人共通。シャッフルして使う。使ったカードと捨てたカードは捨て札置き場へ
  - 兵士カードも、出した時点で捨て札置き場へ行く（場の兵士とは別に扱う）
  - 使い切りのカード（ヒール）は、使ったら使い切り置き場へ行き、二度と山札に戻らない。手札の上限で捨てたときは捨て札置き場へ行く（山札に戻る）
- 山札が尽きたら、捨て札をシャッフルして新しい山札にする。両方とも空なら引かない
- 初期手札：5枚ずつ
- 先攻は p1。先攻の最初のターンも1枚引く
- ターンの流れ
  1. ドロー：1枚引く
  2. 進軍：自分の兵士が出した順に1体ずつ前に進む。相手の兵士とぶつかったら戦う。相手の城に着いた兵士は、攻撃力ぶんのダメージを与えて消える
  3. メイン：カードを1枚出す（出さなくてもよい）
     - 出しても何も起きないカードは出せない（道の上に相手の兵士がいないときのサンダー、城HPが満タンのときのヒール）
  4. ターン終了：手札が8枚を超えていたら、本人が選んで8枚になるまで捨てる
     - 捨てる枚数ちょうどを一度に選ぶ。捨て終わったら、そのまま次の人のターンになる
- 道：城と城の間は**1本の道**で、5マス。両方のプレイヤーの兵士が同じ道を向かい合って進む
  - 出した兵士は位置0（自分の城の前のマス）に置かれ、出したターンには動かない。そのマスに相手の兵士がいても出せる
  - 進軍で位置が5以上になったら「相手の城に着いた」とする（ぴったりでなくてよい）
  - 例：歩兵は出した次のターンから 2 → 4 → 6 で、3回目の進軍で城に着く。騎士は 3 → 6 で2回目に着く（どちらも邪魔されなかった場合）
  - 自分の兵士同士は、同じマスに何体いてもよい
- 兵士同士の戦い
  - 進軍は1マスずつ進める。進む前と、1マス進むごとに、**同じマスか1つ先のマス**に相手の兵士がいないか確かめる。いたら、そこで止まって戦う
  - 戦う相手が何体かいるときは、先に出された兵士と戦う
  - 戦い：お互いに攻撃力ぶんのダメージを同時に与える。HPが0以下になった兵士は消える
  - 相手だけが消えても、そのターンはその場で止まる（続きは次の進軍で）。両方とも生き残ったら、次の進軍でもう一度戦う
  - 戦いは進軍している側のターンにだけ起きる
- 真ん中のマス（道のマス番号2）は、STEP 3 で魔物が出る場所。STEP 1 では普通のマスとして通れる
  - STEP 3 の予定：魔物がいる間、兵士は真ん中のマスの手前で止まって魔物を攻撃する。倒すまで先へは進めない
  - `laneLength` を変えるときは、真ん中がひとつに決まるよう奇数にする
- 兵士が受けたダメージは回復しない。HPが0以下になったら消える
- 勝利：相手の城HPを0以下にした瞬間に勝ち。その時点でゲームを止める

### STEP 1 のカード

| 名前 | 種類 | 効果 | 枚数 |
|---|---|---|---|
| 歩兵 | 兵士 | HP5・攻撃3・1ターンに2マス進む（遅いけど打たれ強い。サンダーに耐える） | 10 |
| 騎士 | 兵士 | HP4・攻撃5・1ターンに3マス進む（速くて強いけど、歩兵より打たれ弱い） | 6 |
| ファイアボール | 魔法 | 相手の城に8ダメージ | 6 |
| サンダー | 魔法 | 道の上にいる相手の兵士全員に3ダメージ | 6 |
| ヒール | 魔法 | 自分の城HP+10（上限はその城の上限）。**使い切り** | 6 |

### STEP 1 の画面

- スマホの縦画面が基準。PCのブラウザでも崩れないようにする
- 上に相手の城、下に自分の城、その間に1本の道（5マス）。自分の兵士は上へ、相手の兵士は下へ進む
- 真ん中のマスは、魔物の居場所だと分かるように見た目を少し変えておく（STEP 1 では魔物は出ない）
- 兵士同士がぶつかったら、戦っていることが分かる演出を入れる
- 手札は画面下に並べ、左右にスライドできるようにする
- 兵士の進軍と魔法の命中は、アニメーションで見せる
- 手番が変わるときは画面を隠して「プレイヤー2の番です」と出す（相手に手札が見えないように）。タップしたら表示する
- 相手の手札は枚数だけ表示する
- 捨てる必要があるときは、手札から選ぶ画面を出す
- 山札と捨て札の枚数を表示する

## 完成の目安（STEP 1）

- 2人で最後まで遊べて、勝敗が表示される
- 山札が尽きても止まらない
- 手番交代で相手の手札が見えない
- ブラウザのコンソールにエラーが出ない

## STEP 2：カード拡張（武器・防御・トラップ・属性・状態異常）

**数値はすべて仮**（`data/cards.json`・`data/rules.json` で調整する）。カードの枚数と数値は、実装のPRでシミュレーションして決める。

### カードの種類（`kind`）と出し方（`slot`）
| `kind` | 出し方（`slot`、`kind` から決まる） | 対象 | 何をするか |
|---|---|---|---|
| `soldier` | メイン（1ターン1枚） | 送り込む相手 `{ playerId }` | 今と同じ |
| `spell` | メイン | `effect` による | 今と同じ＋状態異常の魔法 |
| `weapon`（武器） | 付加（何枚でも） | 道の上の自分の兵士 `{ soldierId }` | 兵士に持たせる。攻撃力が上がり、属性がつく。**1体に1つ**（新しく持たせると前の武器は消える） |
| `defense`（防御） | 防御（何枚でも） | `effect` による | 兵士に盾をつける・城を守る |
| `trap`（トラップ） | 防御（何枚でも） | 自分の側の道のマス `{ roadId, square }` | 伏せて置く。相手の兵士が入ったら発動 |

- 「メイン」を出したかどうかは `playedThisTurn`。付加・防御は、メインを出す前でも後でも出せる
- 付加・防御も、出しても何も起きないときは出せない（例：道の上に自分の兵士がいないときの武器、同じ武器をもう持っている兵士、全員がもう同じ状態のときの毒の霧・氷の息、今と同じか強い城壁があるときの城壁）

### 属性
- 属性は 火（`fire`）・水（`water`）・木（`wood`）の3つ。**水は火に強い、火は木に強い、木は水に強い**（じゃんけん）
- 兵士は、属性つきの武器を持つとその属性になる（持っていなければ属性なし）
- 兵士同士の戦いで、自分の属性が相手の属性に強いとき、与えるダメージが `rules.elementBonus`（仮：2）増える。属性なしの相手には増えない
- 理由：武器で強くすると、相手が「強い属性」の武器で返せる。強くするほど狙われるので、出す順番と読み合いが生まれる（大きな見返りには、大きなリスク）

### 状態異常
| 状態 | どうなるか | 終わり方 |
|---|---|---|
| 毒（`poison`） | 持ち主のターンの進軍の前に、`amount` ダメージ。**盾は効かない** | `turns` 回ダメージを受けたら治る（最後の1回で消えた兵士には `statusCleared` は出ない） |
| 凍結（`frozen`） | 次の進軍で動かない（戦いも起こさない）。相手から攻められたら戦う | 進軍を1回休んだら治る |

- 同じ状態がもう一度かかったら、残りの回数を長い方にそろえる（重ねがけで増えない）
- 毒で HP が0になった兵士は消える（`soldierDestroyed` の `reason` は `"killed"`）

### 防御
- 盾（`shieldSoldier`）：兵士に盾を `amount` つける。ダメージは先に盾が受ける。何枚でも重なる
- 城壁（`armorCastle`）：自分の城を `amount` 守る。城へのダメージは先に城壁が受ける。**自分の次のターンの始めに消える**。重ならない（今の城壁より多いときだけ入れかわる）
  - 理由：防御は何枚でも出せるので、重なったり残り続けたりすると、攻撃が通らず決着しなくなる

### トラップ
- 自分の城から数えて `0` 〜 `trapMaxPosition`（`rules`、仮：1。真ん中のマスより手前でないと `new Game()` が例外）のマスに置ける。1つのマスに自分のトラップは1つまで
- 相手の兵士が**進軍で入ったとき**に発動する（そのマスにいる兵士を出したときや、相手の兵士がもともといるときには発動しない）。発動したら消える
- 落とし穴（`pit`）：入った兵士に `amount` ダメージ。その兵士はそのターン、そこで止まる
- **相手には、置いた場所だけが見えて、種類は見えない**（`getState` でも、イベントでも）

### ドロー（「使った枚数ぶん、次のターンに追加で引く」）
- 次のターンに引く枚数 ＝ `max(drawPerTurn, このターンに使った枚数 × drawPerCardUsed)`（`drawPerCardUsed` は `rules`、仮：1）
  - たくさん使うほど多く引ける（付加・防御を出しても手札が減り続けない）。1枚も出さなくても `drawPerTurn` 枚は引ける（手札が出せないカードだけになって止まることがない）
  - 「追加で」を「使った枚数＋いつもの枚数」と読むと、毎ターン手札が増えて捨ててばかりになるため（#12 で直した問題）、この形にした
- 先攻の最初のターンは今と同じく `firstTurnDraw`
- `getState().players.pX.drawNextTurn` に、次のターンに引く枚数が入る（カードを出すたびに決め直すので、ターン中も正しい値）
- **付加・防御は「メインを使わず、出したぶん次に引ける」ので、ほぼタダで出せる**（レビューで指摘）。いちばん強い城壁は使い切りにした。武器・盾・落とし穴をタダのままにするか（ドローの枚数に数えない、など）は、人が遊んで決める

### STEP 2 のカード（仮）
枚数：炎の剣・水の槍・木の斧 各2、盾・城壁・落とし穴・毒の霧・氷の息 各3（山札は34 → 55枚）。

| 名前（type） | 種類 | 効果 | 長所 | 短所 |
|---|---|---|---|---|
| 炎の剣（`flameSword`） | 武器・火 | 攻撃+1、火 | 木の兵士に強い | 水の武器に返される |
| 水の槍（`waterSpear`） | 武器・水 | 攻撃+1、水 | 火の兵士に強い | 木の武器に返される |
| 木の斧（`woodAxe`） | 武器・木 | 攻撃+1、木 | 水の兵士に強い | 火の武器に返される |
| 盾（`shield`） | 防御 | 兵士に盾3 | 何枚でも重なる。兵士が城まで届きやすくなる | 城は守れない。攻撃力は上がらない |
| 城壁（`wall`） | 防御 | 自分の城を5守る（次の自分のターンまで）。**使い切り** | ファイアボールも兵士も止める | 1ターンで消える。重ならない。1試合に3回まで |
| 落とし穴（`pit`） | トラップ | 入った相手の兵士に3ダメージ、そこで止める | 相手に種類が見えない。置いておける | 自分の城の近くにしか置けない。相手の兵士が来なければ何も起きない |
| 毒の霧（`poisonMist`） | 魔法（メイン） | 相手1人の兵士全員に毒（1ダメージ×4回） | サンダー（3）より合計のダメージが大きく（4）、盾が効かない | すぐには効かない。その間に城に着かれることがある |
| 氷の息（`frostBreath`） | 魔法（メイン） | 相手1人の兵士全員を凍結（1回休み） | 城の前まで来た兵士を1ターン止められる | ダメージがない。メインを使う |

### ロジックとUIの約束に足すもの（STEP 2）
- `getState()`
  - 兵士：`weapon`（武器のカード種類か `null`）、`element`（`"fire"` / `"water"` / `"wood"` / `null`）、`shield`（盾の残り）、`statuses`（`{ poison: { amount, turns } | null, frozen: 回数 | 0 }`）
  - プレイヤー：`armor`（城壁の残り）、`traps`（`[{ trapId, roadId, square, type }]`。**`type` は本人にだけ見え、ほかの人には `null`**）、`cardsPlayedThisTurn`、`drawNextTurn`
- イベント（「Gameが出すイベント」の表に足す）
  - `weaponEquipped`：`{ playerId, soldierId, type, attack, element }`（`attack` は持たせたあとの攻撃力）
  - `shieldAdded`：`{ playerId, soldierId, amount, shield }`（`shield` は足したあとの盾）
  - `castleArmored`：`{ playerId, armor }` / `armorExpired`：`{ playerId }`
  - `trapSet`：`{ playerId, trapId, roadId, square }`（種類は入れない）
  - `trapTriggered`：`{ playerId, trapId, type, soldierId, roadId, square }`（`playerId` は置いた人。発動したら種類が見える）
  - `statusApplied`：`{ playerId, soldierId, status, turns }` / `statusCleared`：`{ playerId, soldierId, status }`
  - `soldierDamaged` に `cause`（`"fight"` / `"spell"` / `"poison"` / `"trap"`）と `blocked`（盾が受けた量）を足す
  - `castleDamaged` に `blocked`（城壁が受けた量）を足す。`amount` は今と同じく「与えようとしたダメージ」、`hp` は城壁で減らしたあとの値
- イベントの順番
  - 進軍：1体ずつ「毒のダメージ →（凍結なら休んで `statusCleared`）→ 動く …」。毒で消えたら、その兵士は動かない
  - 1マス進むごとに、トラップ → 戦う相手の順に確かめる。トラップが発動したら `soldierMoved`（そのマスまで）→ `trapTriggered` → `soldierDamaged`（`cause: "trap"`）→（0なら）`soldierDestroyed`
  - 城壁はターンの始め（`turnStarted` のあと、ドローの前）に `armorExpired`

## STEP 3：魔物とコイン

**数値はすべて仮**（`data/monsters.json`・`data/upgrades.json`・`data/rules.json`）。

### 魔物
- 魔物の種類は `data/monsters.json`（キーが魔物の種類）。Game は `new Game({ cards, rules, rng, monsters, upgrades })` で受け取る（ファイルは読まない）。`monsters` を渡さなければ魔物は出ない（STEP 1・2 のまま）
- **周回（`round`）**：席順の最初の人（まだ負けていない人）のターンが始まるたびに1増える（1から）。`getState().round`
- **出現**：`rules.monsterFirstRound`（仮：3）周目から、周回の始めに、魔物がいない道ごとに `rules.monsterSpawnChance`（仮：0.35）の確率で1体出る。種類は `monsters.json` の `weight` の重みでランダム
  - 出る場所は道の真ん中のマス（道のマス番号 `floor(laneLength / 2)`。5マスなら2）。1本の道に1体まで。魔物を使うときは `laneLength` は奇数（偶数なら `new Game()` が例外）
- 魔物を倒した道には、`rules.monsterCooldownRounds`（仮：2）周のあいだ次の魔物が出ない（魔物が道をふさぎ続けて、兵士が城に届かなくならないように）
- `monsterSpawnChance` が 0 のときは乱数を使わない（魔物を渡しても渡さなくても、同じシードなら山札の並びは同じ）
- **兵士と魔物**：兵士は進軍で、相手の兵士と同じように「同じマスか1つ先のマス」に魔物がいたら止まって戦う（お互いに攻撃力ぶんを同時に与える。属性も効く）。**倒すまで先へは進めない**
  - 1マスごとに、トラップ → 相手の兵士 → 魔物 の順に確かめる
  - 戦うのは進軍している側のターンだけ。魔物から兵士を攻めることはない
- **魔法**：ファイアボール（`damageEnemyCastle`）は、自分の道（自分が両はしのどちらか）の魔物も対象にできる（`{ monsterId }`）。サンダー・毒・凍結は魔物には効かない
- **とどめボーナス**：魔物のHPを0にした人（兵士の持ち主か、魔法を使った人）が、その魔物の `reward` だけコインをもらう
- **放置すると城を攻める**：魔物は出てから `attackEvery` 周ごとに、周回の始めに、その道の両はしの2人のうちランダムな1人の城に `castleAttack` ダメージ
  - **魔物の攻撃では城HPは1より下がらない**（城を削れるのは手番の人の行動だけ。魔物の運で勝敗が決まらないように）。城壁は効かない
- 理由（桜井流）：魔物は「倒すとコイン」「放置すると城が削られる」なので、どちらの人にも倒しに行く理由がある。倒すには兵士を道の真ん中で止めることになるので、攻めるか魔物を倒すかで迷いが生まれる

### コインと強化
- コインは魔物のとどめでもらえる。`getState().players.pX.coins`
- 強化の種類は `data/upgrades.json`。自分のメインの場面（`phase` が `"main"`）で、何回でも買える（コインが足りる限り）。メインの1枚とは別
  - `game.canBuyUpgrade(upgradeId)`：買えるか（`{ ok }` / `{ ok: false, reason }`）。読むだけ
  - `game.buyUpgrade(upgradeId)`：買う
- 強化（仮）

| id | 名前 | 値段 | 効果 | 買えないとき |
|---|---|---|---|---|
| `repair` | 修理 | 3 | 自分の城HP+6（上限まで） | 城HPが満タン |
| `recruit` | 補充 | 2 | 1枚引く | 山札も捨て札も空 |
| `sharpen` | とぎ石 | 4 | 道の上の自分の兵士全員の攻撃力+1（ずっと） | 道の上に自分の兵士がいない |

- `upgrades.json` の `limit`：1試合に買える回数（省略すると何回でも）。修理は2回、とぎ石は3回まで（仮）
- 理由：魔物は出続けるので、修理を何回でも買えると回復で決着しなくなるおそれがある。回数に上限をつけた

### 魔物の種類（仮）
| type | 名前 | HP | 攻撃 | 属性 | ごほうび | 放置したとき | 出やすさ |
|---|---|---|---|---|---|---|---|
| `slime` | スライム | 4 | 1 | 水 | 2 | 3周ごとに城へ2 | 5 |
| `goblin` | ゴブリン | 7 | 3 | 木 | 3 | 2周ごとに城へ3 | 3 |
| `dragon` | ドラゴン | 12 | 5 | 火 | 6 | 2周ごとに城へ5 | 1 |

- 強い魔物ほどごほうびが多いが、倒しに行った兵士がやられやすい（大きな見返りには大きなリスク）

### ロジックとUIの約束に足すもの（STEP 3）
- `getState()`：`round`、`monsters`（`[{ monsterId, type, roadId, square, hp, maxHp, attack, element, attackIn }]`。`attackIn` は城を攻めるまでの残り周回）、`players.pX.coins`
- 対象：`{ monsterId }`（ファイアボール）
- メソッド：`canBuyUpgrade(upgradeId)`、`buyUpgrade(upgradeId)`
- イベント
  - `roundStarted`：`{ round }` … `turnStarted` のすぐあと
  - `monsterAppeared`：`{ monsterId, type, roadId, square, hp, attack, element }`
  - `monsterAttackedCastle`：`{ monsterId, playerId, amount, hp }` … `playerId` は城の持ち主。`amount` は実際に減った量
  - `monsterClashed`：`{ attacker: { playerId, soldierId }, monsterId, roadId, square }` … 兵士が魔物と戦う（`square` は兵士が止まったマス）
  - `monsterDamaged`：`{ monsterId, amount, hp, by: { playerId, soldierId? , type? } }`
  - `monsterDefeated`：`{ monsterId, playerId, reward }` … `playerId` はとどめを刺した人
  - `coinsChanged`：`{ playerId, delta, coins, reason }` … `reason` は `"reward"` か `"upgrade"`
  - `upgradeBought`：`{ playerId, upgradeId, cost }` → 効果のイベント（`castleHealed` / `cardDrawn` / `soldierBuffed`）
  - `soldierBuffed`：`{ playerId, soldierId, attack }`
- 順番
  - 周回の始め：`turnStarted` → `roundStarted` → 魔物の城への攻撃（出た順）→ `monsterAppeared`（道の順）→（STEP 2 の `armorExpired`）→ ドロー → 進軍
  - 兵士と魔物の戦い：`soldierMoved` → `monsterClashed` → `monsterDamaged` → `soldierDamaged`（兵士）→（魔物が0なら）`monsterDefeated` → `coinsChanged` →（兵士が0なら）`soldierDestroyed`
  - ファイアボールで魔物：`spellCast`（`target` は `monsterId`）→ `monsterDamaged` →（0なら）`monsterDefeated` → `coinsChanged`

## STEP 4：オンライン対戦

### しくみ
- サーバーは `server/`（Node.js 22.7 以上。**外部パッケージなし**）。Game（`js/game/`）をそのまま動かす。乱数もサーバーだけが持つ
- 起動：リポジトリのルートで `node server/server.js`（ポートは環境変数 `PORT`、省略すると 8787）。`data/` の JSON はサーバーが読む
- 通信は HTTP だけ（WebSocket は使わない。外部パッケージなしで作れて、ブラウザでもそのまま使えるため）
  - ブラウザ → サーバー：`fetch` で `POST`（JSON）
  - サーバー → ブラウザ：Server-Sent Events（`EventSource` で受け取る）
- **合言葉で部屋に入る**：同じ合言葉を入れた人が同じ部屋に入る。人数（`rules.playerCount`、今は2）がそろったら自動で始まる。入った順に `p1`、`p2` …
- 見えてはいけない情報は、サーバーが `js/game/visibility.js` の決まりでプレイヤーごとに隠してから送る（Game はそのまま）

### 送るもの（ブラウザ → サーバー）
| URL | 送る JSON | 返る JSON |
|---|---|---|
| `POST /api/join` | `{ passphrase, name }` … 合言葉（1〜32文字）と表示名（1〜16文字） | `{ ok: true, roomId, playerId, token }` か `{ ok: false, reason }`。`token` はその人だけの鍵（以後ずっと使う） |
| `POST /api/action` | `{ token, method, args }` … `method` は `playCard` / `discard` / `endTurn` / `buyUpgrade` / `rematch` のどれか。`args` は Game のメソッドに渡す引数の配列（例：`["c07", { "playerId": "p2" }]`） | Game のメソッドの返り値（`{ ok }` / `{ ok: false, reason }`）。自分の番でない人の操作は `{ ok: false, reason: "あなたの番ではありません" }` |

- `rematch`：全員が送ったら、同じ部屋・同じ席で新しい試合が始まる（負けた人もすぐ「もう1回」できるように）

### 届くもの（サーバー → ブラウザ）
`GET /api/stream?token=...` を `EventSource` で開く。メッセージは JSON で、`type` で分かれる。

| `type` | 中身 | いつ |
|---|---|---|
| `room` | `{ roomId, players: [{ playerId, name, connected }], capacity, started }` | 入ったとき・誰かが入った／抜けたとき |
| `event` | `{ event, payload }` … Game のイベント（「Gameが出すイベント」の表）を、その人向けに隠したもの | 起きた順に |
| `state` | `{ state, playable, upgrades }` … `state` は `getState(自分)`。`playable` は自分の手札の各カードの `{ cardId, ok, reason, needsTarget, targets }`（自分の番でないときは全部 `ok: false`）。`upgrades` は `{ upgradeId: { ok, reason } }` | 操作のたび（その操作のイベントを全部送ったあと）・つないだとき |

- つなぎ直したとき（`EventSource` は自動でつなぎ直す）は、`room` と `state` が届くので、それで画面を描き直す
- 画面は、イベントで演出し、`state` で答え合わせをする（同じ端末のときと同じ）。出せない理由は `playable` を使う（ブラウザに Game はない）

### 隠す情報（`js/game/visibility.js`）
| イベント | 本人以外に送るとき |
|---|---|
| `cardDrawn` | `cardIds` を消し、`count`（枚数）だけにする |
| `cardDiscarded` | `cardIds` はそのまま（捨てたカードは表向き）。種類は `state` の捨て札には出ない |
| `cardPlayed` | そのまま（トラップは Game が `type: null` にしている） |
| `trapSet` | そのまま（種類は入っていない） |

- `getState(自分)` は、相手の手札を `null`、相手のトラップの種類を `null` にしている（STEP 1・2 のとおり）
- 山札の順番・乱数は送らない

## 全体の設計（STEP 2〜5 の見通し）

STEP 2 以降で作り直しにならないよう、Game をどう広げるかを先に決めておく。**ここに書いた形は「これから作るときの約束」で、各STEPの実装PRで少しずつ入る。** 入った時点で「ロジックとUIの約束」の表に移す。
ここで決めたことのうち、ゲームの遊び方が変わるもの（道のつなぎ方・魔物の置き場所・3人以上の勝ち方）は、人間の確認を受けてから実装に入る。

### 2人専用の前提をなくす
今の Game には「2人」が決め打ちされている所がある。これを次のように直す。**席順・道・`roadId` / `targetId`・`getTargets`・カードIDの振り方は、もう入った**（「ロジックとUIの約束」に書いた）。人数を変える `rules.playerCount` と、負けた人の扱いは STEP 5 で入る。

| 今 | 直したあと |
|---|---|
| `PLAYER_IDS = ['p1', 'p2']` | 人数は `rules.playerCount`（2〜8、省略すると2）。IDは席順に `"p1"`〜`"p8"`。`getState().playerOrder` に席順（手番の順）の配列が入る |
| `opponentOf(id)`（相手は1人） | `opponentsOf(id)`（まだ負けていない相手全員）と `neighborsOf(id)`（道でつながっている相手）に分ける |
| 道は1本（`laneLength` マス） | **道は「となりの席どうし」をつなぐ。** 席を輪にならべ、となり合う2人の間に1本ずつ道がある。2人なら道は1本（今と同じ）、3人なら3本、8人なら8本。どの道も `laneLength` マス |
| 兵士の位置は `position` だけ | 兵士は `roadId`（どの道か）と `position`（自分の城から数えたマス）を持つ。`targetId`（道の向こうの人）も入れる（`roadId` と持ち主から分かるが、UIが毎回計算しなくてすむように） |
| 道のマス番号は「p1 の城側が 0」 | 道のマス番号は「その道の `players[0]`（席順が前の人）の城側が 0」。2人なら今と同じ。輪の端の道も同じ決まりで、たとえば `"p1-p8"` は p1 の城側が 0 |
| 魔法の相手は自動で決まる | 相手が2人以上いるときは `playCard(cardId, target)` の `target` で選ぶ（下の「対象の選び方」）。対象が1つなら今と同じく省略できる |
| 後攻の城ボーナス（p2 だけ） | `secondPlayerCastleBonus` はそのまま残す（2人用）。3人以上のときは別のキー（`seatCastleBonus`：席ごとのボーナスの配列）を STEP 5 で足す |

- 道の ID（`roadId`）：つないでいる2人のIDを席順で `-` でつないだもの。例：`"p1-p2"`、`"p1-p8"`
- 兵士は「となりの人」の城にしか送れない（道があるところだけ）。魔法は、まだ負けていない相手なら誰にでも使える（となりでなくてよい）
  - 理由：8人のとき全員の間に道を作ると28本になり、画面に収まらず、遊ぶ人も追えない。となりだけなら1人2本で、2人のときは今の1本道のまま
- 負けた人が出たら（3人以上で「最後の1人まで」のとき）：その人の道はなくなり、その人の両どなりの人の間に新しい道ができる（まだなければ）。なくなった道の上の兵士は消える
- 手番は席順。負けた人は飛ばす。`getState()` に `round`（席順の最初の人のターンが始まるたびに1増える。1から）を足す。ターン数の上限は `round` で数える
- 3人以上のとき、ファイアボール（すぐ効く・防げない）が誰にでも撃てると、いちばん弱い城に集まりやすい。対象をとなりだけにするかは、STEP 5 でシミュレーションして決める
- 3人以上のときの勝ち方は STEP 5 で `rules.winCondition` として決める。待ち時間と袋だたきを避けるため、**3人以上の基本は「最初にどこかの城を落とした人の勝ち」**（このゲームの説明「先に城を落とした人が勝つ」のとおり）とし、「最後の1人まで」は選べる設定にする。どちらにも、`round` の上限で「城HPの残りの割合がいちばん多い人の勝ち」になる決まりをつける（必ず決着させるため）
- **勝つ人は必ず1人**（引き分けはない）。城を削れるのは手番の人の行動だけにする（魔物の攻撃では城HPは1より下がらない。下の「魔物」）。手番の人の1回の行動で何人かの城が同時に落ちたら、手番の人の勝ち

### 対象の選び方（済）
- `game.getTargets(cardId)` を足す：そのカードを今出せる対象の一覧を返す（読むだけ。出せないときは空の配列）。UIはこれでタップできる場所を光らせる。対象が1つだけなら `target` を省略してよい
- `target` の形は4つ。キーと値がちょうど一致するものだけ受け付ける（値が `undefined` のキーは無いものとみなす）。違うときは `{ ok: false, reason: "そこには出せません" }`
  - プレイヤー：`{ playerId: "p2" }`（城への魔法・回復・兵士を送る相手）
  - 兵士：`{ soldierId: "s03" }`（武器・盾など、兵士につけるカード）
  - 道のマス：`{ roadId: "p1-p2", square: 1 }`（トラップなど）
  - 魔物：`{ monsterId: "m01" }`（STEP 3）
- 今のカードの対象

| カード | 対象 | 2人のとき |
|---|---|---|
| 歩兵・騎士 | 送り込む相手 `{ playerId }`（となりの人だけ） | 1人なので省略できる |
| ファイアボール | 城を攻める相手 `{ playerId }`（まだ負けていない相手なら誰でも） | 省略できる |
| サンダー | 兵士を攻める相手 `{ playerId }`。**その人の兵士全員**（どの道にいても）に効く | 省略できる |
| ヒール | 自分 `{ playerId }` | 省略できる |

- `canPlayCard(cardId, target)` も同じ `target` を受け取る。`target` を省略して、対象が2つ以上あるときは `{ ok: true, needsTarget: true }`（出せるけど選ぶ必要がある）。そのまま `playCard(cardId)` を呼ぶと `{ ok: false, reason: "対象を選んでください", needsTarget: true }`

### 1ターンに出せる枚数（STEP 2 から）
- カードは `kind` から決まる `slot` で3つに分かれる（`cards.json` に `slot` は書かない）
  - `"main"`（メイン）：1ターン1枚。兵士・城や兵士を攻める魔法・**ヒール**（回復が何枚も重なって決着しなくならないように、メインにする）
  - `"addon"`（付加）：自分の兵士につける（武器など）。メインと一緒に、何枚でも出せる。**その兵士の次の進軍・戦いから効く**。「この攻撃にこの付加をつける」形にはせず、兵士につける形にする（1枚ずつ `playCard` で出せて、画面も「兵士をタップ」だけで分かるため）
  - `"defense"`（防御）：何枚でも出せる（城の守り・トラップなど）
- `getState().players.pX.playedThisTurn` は「このターンにメインのカードを出したか」の意味のまま残す。ほかに `cardsPlayedThisTurn`（出した枚数）と `drawNextTurn`（次のターンに引く枚数）を足す
- 「使った枚数ぶん、次のターンに追加で引く」は STEP 2 で数値を決める（手札が増えすぎないように）

### カードID（済）
- カードIDはシャッフルしたあとの順に振る（IDから種類が分からないように）。ただし捨て札から山札を作り直すときは同じIDのまま戻るので、一度見たカードはIDで分かる。オンライン（STEP 4）では、相手の `cardDrawn` に `cardIds` を見せない

### 魔物（STEP 3）
- **魔物は道ごとに出る**（1本の道に1体まで）。真ん中のマスにいる。2人なら道は1本なので1体
  - 理由：魔物が1か所だけだと、3人以上のとき、その道の両どなりの2人しかとどめボーナスを狙えず、どの道に出るかの運で有利が決まる。道ごとなら、誰でも自分の道の魔物を狙える
- `getState().monsters`：魔物の配列（いなければ空の配列）。それぞれ `{ monsterId, type, roadId, square, hp, maxHp, attack, ... }`
- 魔物の攻撃（放置したとき）では、城HPは1より下がらない（魔物の運で勝敗が決まらないように）

### 山札（STEP 5 のデッキ対戦）
- `rules.deckMode`：`"shared"`（今の2人共通の山札）か `"own"`（1人1つずつ山札を持つ）
- `"own"` のとき、山札・捨て札・使い切り置き場はプレイヤーごと。`players.pX.deckCount` / `discardCount` / `exhaustedCount` に入る（`"shared"` のときは `null`）。いちばん上の `deckCount` などは、`"own"` のときは `getState(viewerId)` の viewer 本人の数（viewer がいなければ `null`）

### getState() に増えるもの（予定）
今あるキーは、意味を変えずに足すだけにする（UIを作り直さなくてすむように）。上の「山札」の `"own"` のときだけは、いちばん上の `deckCount` が「自分の山札」の意味になる。

```js
{
  playerOrder: ["p1", "p2"],     // 席順（手番の順）
  round: 1,                      // STEP 5：何周目か
  roads: [{ roadId: "p1-p2", players: ["p1", "p2"], length: 5 }],  // length はいつも laneLength
  monsters: [],                  // STEP 3：魔物
  players: {
    p1: {
      eliminated: false,         // 負けて抜けたか（3人以上）
      coins: 0,                  // STEP 3：コイン
      drawNextTurn: 1,           // STEP 2：次のターンに引く枚数
      soldiers: [{ /* 今のキー */ roadId: "p1-p2", targetId: "p2" }],
    },
  },
}
```

### イベントに増えるもの（予定）
- 今あるイベントのペイロードには、キーを足すだけにする（`soldierDeployed` / `soldierMoved` / `soldiersClashed` に `roadId` など）
- 新しいイベントは、そのSTEPの実装PRで「Gameが出すイベント」の表に足す（例：`playerEliminated`、`monsterAppeared`）

### オンライン対戦（STEP 4）で守ること
- Game はブラウザでもサーバー（Node.js）でも同じコードで動く。DOM・`window`・`fetch`・ファイルを Game の中で使わない（今もそうなっている）
- 乱数はサーバーだけが持つ（`new Game({ rng })` に渡す）。ブラウザは結果だけを受け取る
- 見えてはいけない情報（相手の手札の中身・山札の順番・伏せたトラップの種類）は、**どのイベントのどのキーを誰に見せるかを `js/game/` の中の1か所（表）にまとめ**、サーバーはその表を使ってプレイヤーごとに隠してから送る（知識をロジック側の1か所に置くため）
- ブラウザから見ると、呼び出しは非同期になる（送ってから返事が届く）。UIは Game と同じ名前のメソッドを持つ「クライアント」越しに呼び、返事は Promise で受け取る。出せない理由を前もって出すために、サーバーは状態と一緒に「手札の各カードを今出せるか（`canPlayCard` の結果）と対象の一覧」を送る

### 決まっている方針について
- 「ドラゴンのブレスは合計 50 + 15×(相手の人数−1)」は、城HPが100だったころの数値。今の城HP（25）に合わせて、**数値は `cards.json` で決める**（STEP 2〜3 で、人数に応じて増える形だけを守る）

## 今後の予定（まだ作らない）

STEP 2 以降で追加する。今のSTEPで頼まれていないものは先回りして作らない。作り方の見通しは上の「全体の設計」に書いた。

1. カード拡張：武器・防御・トラップ・属性・状態異常
2. 魔物とコイン：中央に出る魔物（ランダム）、とどめボーナス、コインでの強化
3. 見た目：イラスト、演出、城が壊れていく表現、効果音
4. オンライン対戦：合言葉で部屋に入る
5. 拡張：最大8人、デッキ対戦、城の種類、勝利条件の設定画面

決まっている方針：
- 防御カードは何枚でも出せる。攻撃は1ターン1枚（付加効果のカードは一緒に出せる）
- 使った枚数ぶん、次のターンに追加で引く
- 魔物は放置するとランダムな城を攻撃する
- ドラゴンのブレスは、合計 50 + 15×(相手の人数−1) のダメージを相手全員で分ける
