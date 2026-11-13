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

## 担当の分け方

| 領域 | フォルダ・ファイル | 内容 |
|---|---|---|
| ゲームロジック | `js/game/`、`data/` | ターン進行、兵士の進軍、カード効果、勝敗判定、数値データ |
| 画面（UI） | `index.html`、`css/`、`js/ui/`、`js/main.js` | レイアウト、手札の表示、アニメーション、入力、Game と UI の接続 |
| 共有 | `CLAUDE.md` | 変更は2人で相談してから。PRで相手の承認を必須とする |

ロジックと画面のつなぎ方は、下の「ロジックとUIの約束」に従う。この約束を変えるときは、2人で相談してからこのファイルを更新する。

## 技術

- HTML / CSS / JavaScript（フレームワークなし、ES Modules）
- 起動：リポジトリのルートで `python3 -m http.server` を実行し、`http://localhost:8000` を開く（Windows は `python -m http.server`）
- 数値はコードに直接書かない（バランス調整をJSONだけでできるようにするため）
  - カードの数値 → `data/cards.json`
  - ルールの数値（城HP、手札枚数、レーンの長さなど）→ `data/rules.json`
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
  ui/              … 画面表示と入力
    Renderer.js
    HandView.js
    Animations.js
data/
  cards.json       … カードの定義
  rules.json       … ルールの数値
```

## ロジックとUIの約束

UIはゲームの状態を直接書き換えない。必ず Game のメソッドを呼ぶ。

### 用語

- プレイヤーID：`"p1"`、`"p2"`。先攻は `"p1"`
- カード種類（type）：`cards.json` のキー。例：`"infantry"`
- カードID（cardId）：山札の1枚1枚につく一意のID。例：`"c07"`。同じ種類のカードでもIDは別
- 兵士ID（soldierId）：場に出た兵士につく一意のID。例：`"s03"`

### UIから呼ぶもの

| メソッド | 説明 |
|---|---|
| `game.getState(viewerId)` | 今の状態をただのオブジェクトで返す。`viewerId` の手札は中身まで、相手の手札は枚数だけ入る |
| `game.playCard(cardId, target)` | カードを使う。STEP 1 では対象が自動で決まるので `target` は省略してよい（将来の魔物や対象選択のために残す） |
| `game.discard(cardIds)` | 手札を捨てる。`phase` が `"discard"` のときだけ使える |
| `game.endTurn()` | ターンを終える。手札が上限を超えていたら `phase` が `"discard"` になり、捨て終わるまで次の人の番にならない |
| `game.on(type, handler)` / `game.off(type, handler)` | イベントの購読と解除。`handler` はペイロードのオブジェクトを1つ受け取る |

- 操作が許されないとき（自分の番でない、1ターンに2枚目を出した、など）は例外を投げず、`{ ok: false, reason: "..." }` を返す。成功したら `{ ok: true }`
- イベントは操作の中で同期的に、起きた順に発行される。UIはキューにためて順番にアニメーションする

### getState() の形

```js
{
  turn: 3,                     // 通算ターン数（1から）
  currentPlayer: "p1",
  phase: "main",               // "main" | "discard" | "gameOver"
  winner: null,                // 決着したら "p1" か "p2"
  deckCount: 18,
  discardCount: 5,
  players: {
    p1: {
      castleHp: 92,
      hand: [{ cardId: "c07", type: "infantry" }],  // viewer 本人のみ。相手は null
      handCount: 7,
      playedThisTurn: false,
      soldiers: [{ soldierId: "s03", type: "knight", hp: 5, attack: 5, position: 3 }]
    },
    p2: { /* 同じ形 */ }
  }
}
```

### Gameが出すイベント

UIはこれを受けてアニメーションする。イベントを増やすときは、この表に追記する。

| イベント | ペイロード |
|---|---|
| `turnStarted` | `{ playerId, turn }` |
| `cardDrawn` | `{ playerId, cardIds }` |
| `deckShuffled` | `{ deckCount }` |
| `cardPlayed` | `{ playerId, cardId, type }` |
| `discardRequired` | `{ playerId, count }` … 捨てる必要がある枚数 |
| `cardDiscarded` | `{ playerId, cardIds }` |
| `soldierDeployed` | `{ playerId, soldierId, type, position }` |
| `soldierMoved` | `{ playerId, soldierId, from, to }` |
| `soldierDamaged` | `{ playerId, soldierId, amount, hp }` |
| `soldierDestroyed` | `{ playerId, soldierId, reason }` … `reason` は `"killed"` か `"reachedCastle"` |
| `spellCast` | `{ playerId, type, target }` |
| `castleDamaged` | `{ playerId, amount, hp, source }` … `playerId` は城の持ち主。`source` は `{ kind: "soldier", soldierId }` か `{ kind: "spell", type }` |
| `castleHealed` | `{ playerId, amount, hp }` |
| `gameOver` | `{ winner }` |

兵士が城に着いたときは `soldierMoved` → `castleDamaged` → `soldierDestroyed` の順に出す。

### データの形

`data/rules.json`

```json
{
  "castleMaxHp": 100,
  "initialHand": 6,
  "drawPerTurn": 2,
  "firstTurnDraw": 0,
  "maxHand": 8,
  "laneLength": 6
}
```

`data/cards.json`（キーがカード種類）

```json
{
  "infantry":  { "name": "歩兵", "kind": "soldier", "hp": 3, "attack": 3, "speed": 2, "count": 10 },
  "knight":    { "name": "騎士", "kind": "soldier", "hp": 5, "attack": 5, "speed": 3, "count": 6 },
  "fireball":  { "name": "ファイアボール", "kind": "spell", "effect": "damageEnemyCastle", "amount": 8, "count": 6 },
  "thunder":   { "name": "サンダー", "kind": "spell", "effect": "damageEnemySoldiers", "amount": 3, "count": 6 },
  "heal":      { "name": "ヒール", "kind": "spell", "effect": "healOwnCastle", "amount": 10, "count": 6 }
}
```

## ゲームのルール（現在：STEP 1）

STEP 1 は、2人が同じ端末で交互に遊ぶ最小版。数値はすべて仮（`data/` で調整する）。

- 城HP：100（上限も100）
- 山札：2人共通。シャッフルして使う。使ったカードと捨てたカードは捨て札置き場へ
- 山札が尽きたら、捨て札をシャッフルして新しい山札にする。両方とも空なら引かない
- 初期手札：6枚ずつ
- 先攻は p1。先攻の最初のターンだけはドローしない
- ターンの流れ
  1. ドロー：2枚引く
  2. 進軍：自分の兵士が全員前に進む。相手の城に着いた兵士は、攻撃力ぶんのダメージを与えて消える
  3. メイン：カードを1枚出す（出さなくてもよい）
  4. ターン終了：手札が8枚を超えていたら、本人が選んで8枚になるまで捨てる
- レーン：城と城の間は6マス。自分の兵士は自分のレーンを進む
  - 出した兵士は位置0（自分の城の前）に置かれ、出したターンには動かない
  - 進軍で位置が6以上になったら「相手の城に着いた」とする（ぴったりでなくてよい）
  - 例：歩兵は出した次のターンから 2 → 4 → 6 で、3ターン目に城に着く。騎士は2ターン目に着く
- 兵士が受けたダメージは回復しない。HPが0以下になったら消える
- 勝利：相手の城HPを0以下にした瞬間に勝ち。その時点でゲームを止める

### STEP 1 のカード

| 名前 | 種類 | 効果 | 枚数 |
|---|---|---|---|
| 歩兵 | 兵士 | HP3・攻撃3・1ターンに2マス進む | 10 |
| 騎士 | 兵士 | HP5・攻撃5・1ターンに3マス進む | 6 |
| ファイアボール | 魔法 | 相手の城に8ダメージ | 6 |
| サンダー | 魔法 | 相手のレーン上の兵士全員に3ダメージ | 6 |
| ヒール | 魔法 | 自分の城HP+10（上限100） | 6 |

### STEP 1 の画面

- スマホの縦画面が基準。PCのブラウザでも崩れないようにする
- 上に相手の城、下に自分の城、その間に2本のレーン（6マス）
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

## 今後の予定（まだ作らない）

STEP 2 以降で追加する。今のSTEPで頼まれていないものは先回りして作らない。

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
