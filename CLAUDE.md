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
| 画面（UI） | `index.html`、`css/`、`js/ui/`、`js/main.js`、`assets/`、`sw.js`、`manifest.webmanifest`、`ui-tests/` | レイアウト、手札の表示、アニメーション、入力、Game と UI の接続、画像素材、ホーム画面に追加・オフライン（PWA）、画面のスモークテスト |
| 共有 | `CLAUDE.md` | 変更は2人で相談してから。PRで相手の承認を必須とする |

ロジックと画面のつなぎ方は、下の「ロジックとUIの約束」に従う。この約束を変えるときは、2人で相談してからこのファイルを更新する。

## 技術

- HTML / CSS / JavaScript（フレームワークなし、ES Modules）。**例外：three.js を `js/vendor/three/` に置いてある**（図鑑・デッキ編成の拡大表示のカードを3Dで描くためだけに使う。人間に確認して入れた。npm からは入れず、ファイルをそのまま置く。拡大表示を開いたときにだけ読み込む）
- 起動：リポジトリのルートで `python3 -m http.server` を実行し、`http://localhost:8000` を開く（Windows は `python -m http.server`）
- 自動テスト：リポジトリのルートで `node --test`（Node.js 22.7 以上。`package.json` がなくても `.js` を ES Modules として読めるのが 22.7 から。外部パッケージは使わない）。ロジックを変えたら必ず全部通してからPRを出す。新しい機能にはテストを足す
- 画面のスモークテスト：`node ui-tests/smoke.js`（タイトル→ひとりで遊ぶ→1手出す→結果→再戦。Playwright は環境にあるものを使い、リポジトリには入れない）。画面を大きく変えたら通す
- **オフライン用の一覧**：配るファイル（`index.html`・`css/`・`js/`・`data/`・`assets/`）を変えたら、`node js/ui/build-precache.js` で `js/ui/precache.js` を作り直して同じPRに入れる（忘れると、2回目以降の起動で古い版が出る）
- バランスのシミュレーション：`node tests/sim/run.js`（いろいろな戦い方の組み合わせで各1000試合）。乱数はシード付きなので、同じ引数なら誰が回しても同じ結果になる
  - `--games 200`（試合数）、`--seed 7`、`--match smart,random`（1つの組み合わせだけ）、`--rules '{"castleMaxHp":30}'`・`--cards '{"fireball":{"count":3}}'`（`data/` を書き換えずに一部の値だけ試す）、`--json`
  - 「出せる種類が2以上」の列は、出せるカードが2種類以上あったターンの割合（目安）。本当に迷うかは人が遊んで確かめる
  - 戦い方（`js/game/strategies.js`。ひとりで遊ぶモードの CPU も同じものを使う）：`random`（出せるカードからランダム）、`aggro`（城への魔法 → 兵士）、`smart`（ほどよく考える）、`defensive`（守り優先）、`rush`（攻め重視：城への魔法 → 兵士。武器・盾・強化は使うが回復はしない）、`guard`（兵士で守る）、`pass`（何も出さない）
- 数値はコードに直接書かない（バランス調整をJSONだけでできるようにするため）
  - カードの数値 → `data/cards.json`
  - ルールの数値（城HP、手札枚数、道の長さ `laneLength` など）→ `data/rules.json`
- ゲームロジックは画面（DOM）に一切触らない。後でオンライン対戦にするとき、ロジックをそのままサーバーに移すため
- ゲームロジックは乱数を外から渡せるようにする（`new Game({ rng })`）。テストで山札の順番を固定するため

## フォルダ構成

```
index.html
sw.js              … サービスワーカー（オフライン。PWA。UI担当）
manifest.webmanifest … ホーム画面に追加するときの情報（UI担当）
README.md          … このリポジトリの入口（遊び方・起動・フォルダ）
.gitignore
css/               … 画面のスタイル。style.css が土台、theme.css・step5.css などが上に重なる
js/
  main.js          … 起動。Game と UI をつなぐ（UI担当）
  game/            … ゲームロジック（DOMを使わない）
    Game.js
    Player.js
    Castle.js
    Card.js
    Soldier.js
    Road.js        … 道（となりの席どうし・広場の通り道）
    Monster.js     … 魔物と、強化のデータのチェック
    Weather.js     … 天候のデータのチェック
    Elements.js    … 属性の相性表のチェックと倍率
    Reactions.js   … 属性の反応のデータのチェックと、組から反応を探す
    Stage.js       … ステージ（マップ）のデータのチェックと選び方
    Setup.js       … 城の種類・デッキのデータのチェックと、山札1組（Pile）。カードの引き当て（候補 allowed で絞れる）
    Factions.js    … 四大陣営：factions.json のチェックと、陣営モードの候補（「四大陣営（PR-A）」の節）
    visibility.js  … オンラインで、イベントをプレイヤーごとに隠す決まり
    strategies.js  … 戦い方（random / aggro / smart / defensive / rush / guard / pass）。シミュレーションと CPU が使う
  ui/              … 画面表示と入力
    Renderer.js    … 盤面（道・広場・城・兵士・魔物）
    HandView.js    … 手札
    Animations.js  … 演出
    RoomView.js・LocalSetup.js … 部屋・ひとりで遊ぶの設定
    Tutorial.js・HelpView.js・CardGuide.js … 案内・遊び方・図鑑
    Settings.js・Sound.js・Music.js … 設定・効果音・BGM
    MatchStats.js  … 結果のまとめと戦績
    ChatView.js    … チャットとスタンプ（💬ボタン・吹き出し）
    DeckEditor.js・DeckStore.js … デッキ編成の画面と、マイデッキの保存（この端末の localStorage）
    CardZoom.js    … デッキ編成・図鑑でカードを長押しすると拡大（傾き・偏光・360度回転）
    CardGL.js      … 拡大表示のカードを、Blender 製の板（assets/models/card-slab.glb）と three.js で描く。凹凸は枠の高さの地図から作った本物のメッシュ（光・影・金属の映り込みは three.js）。宝石は内側から光り、金属・宝石の上に向きと時間で瞬く星形の粒（キラキラ）を散らす。ランク報酬の裏（`assets/skins/back-rank-*-relief.png`）も同じくメッシュ。偏光は CardRelief.js と同じ色。読めないときは Card3D.js（CSS の 3D）のまま。`?card3d=css` か `?fx=lite` で CSS に固定
    stories.js     … 図鑑で読むカードのストーリー（画面だけで使う文。カードを増やしたら1つ足す。ui-tests/stories.js が確かめる）
    card-shapes.js … カードの枠・ランクの裏の凹凸を、色ではなく形の部品（外形・はみ出す飾り・帯・メダル・宝石のカット・紋章の輪と葉）で組み立てる。位置は絵を測って書いた。build-card-relief.js が使う（宝石を足した・動かしたときはここを直す）
    stories-factions.js … 四大陣営の台帳から足したカードのストーリー（自動生成。docs/four-factions/import/build.mjs）
    art.js・config.js … 画像の割り当てと、UIの数値（CPUの強さの割り当ても）
    precache.js    … オフライン用の一覧（自動生成。node js/ui/build-precache.js）
data/
  cards.json       … カードの定義
  rules.json       … ルールの数値
  monsters.json    … 魔物の定義（STEP 3）
  castles.json     … 城の種類（STEP 5）
  decks.json       … デッキ対戦のデッキ（STEP 5）
  rarities.json    … レアリティと排出率（コモン〜レジェンド）
  upgrades.json    … コインで買う強化（STEP 3）
  weather.json     … 天候（晴れ・雨・大雨・霧・嵐・砂嵐・コインの雨）
  stages.json      … ステージ（草原・溶岩・氷・古代遺跡・闇の森・砂漠）
  stamps.json      … チャットのスタンプの一覧
  elements.json    … 属性の相性
  reactions.json   … 属性の反応（「属性の反応」の節）
ui-tests/          … 画面のスモークテスト（node ui-tests/smoke.js。Playwright は環境にあるものを使う。UI担当）
docs/              … 設計メモ。archive/ は終わった依頼（Codex 向けのプロンプトなど）。four-factions/ は四大陣営の仕様書・台帳と、取り込みの道具（import/）
tests/             … 自動テスト（node --test）。Node.js だけで動く
  helpers.js       … data/ と fixtures/ の読み込み、シード付き乱数、イベントの記録
  fixtures/        … テスト用の固定データ（data/ を調整してもロジックのテストが落ちないように）
  *.test.js        … テスト本体
  sim/             … バランス確認のシミュレーション
    sim.js         … 1試合・何試合も回して数字を集める
    strategies.js  … js/game/strategies.js をそのまま出すだけ（戦い方の本体はそちら）
    run.js         … 表を出すコマンド（2人）
    multi.js       … 2人・4人・8人で、道の形（広場・輪）と勝利条件を比べる
    castles.js     … 城の種類・デッキの勝率
    teams.js       … チーム戦の分け方ごとの勝率と長さ
server/            … オンライン対戦のサーバー（Node.js だけ。ロジック担当）
  server.js        … HTTP（合言葉で入る・操作を受ける・SSE で送る）。node server/server.js で起動
  rooms.js         … 部屋と席。Game を動かし、プレイヤーごとに隠して送る
                     画面のファイルのほか、/sw.js と /manifest.webmanifest（PWA）も配る
assets/            … 画像素材（UI担当）
  STYLE.md         … 絵柄の決まりと、画像生成AIに使う共通の指示文
  CREDITS.md       … 素材ごとの出どころとライセンス
  bg/              … 背景
  castles/         … 城
  units/           … 兵士（盤面に置くもの）
  cards/           … カードの絵と枠
  fx/              … 演出（爆発・雷・回復・土けむりなど）
  ui/              … ボタン・看板・帯などの画面部品
  models/          … 3Dのモデル（.glb）と、それを作る Blender のスクリプト（make-card.py。python3 assets/models/make-card.py。bpy が要る）
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

- プレイヤーID：`"p1"`〜`"p8"`（人数は `rules.playerCount`）。先攻は `setup.firstPlayer`（省略すると `"p1"`。「コイントス・後攻の補正・マリガン」）
- カード種類（type）：`cards.json` のキー。例：`"infantry"`
- カードID（cardId）：山札の1枚1枚につく一意のID。例：`"c07"`。同じ種類のカードでもIDは別
- 兵士ID（soldierId）：場に出た兵士につく一意のID。例：`"s03"`
- カードIDは山札をシャッフルしたあとの順に振る。IDから種類は分からない
- 付着（attachment）：兵士に残っている属性（`"fire"` などの属性ID か、水霧 `"mist"`）。属性つきの攻撃が当たると付き、別の属性で攻撃されると「反応」が起きる（「属性の反応」の節）
- 反応ID（reaction）：`data/reactions.json` の `reactions` のキー。例：`"evaporate"`（蒸発）
- 道ID（roadId）：道のID。2人のIDを席順で `-` でつなぐ（3人以上の広場のときは、2人ずつの組の「通り道」。STEP 5 の「真ん中の広場を通る道」）。例：`"p1-p2"`。`rules.laneCount`（レーンの数）が2以上のときは、同じ2人の間に道が `laneCount` 本でき、`"p1-p2#1"`、`"p1-p2#2"` … のように番号がつく（1本のときは番号なし）
- 陣営（faction）：カードの所属。`"kingdom"` / `"forest"` / `"demon"` / `"dragon"`（`data/factions.json` のキー）か、全陣営共通の `"common"`。書いていないカードは旧カード（陣営なし）。陣営モード（`setup.faction`）の山札は「選んだ陣営＋共通」だけ（「四大陣営（PR-A）」の節）
- 対象（target）：カードを出す先。`{ playerId }`（兵士は送り込む相手、攻撃の魔法は攻める相手、ヒール・城壁は自分）、`{ playerId, roadId }`（レーンが2本以上のときの、兵士を出す道と、`scope: "lane"` の魔法で狙う道）、`{ soldierId }`（武器・盾：道の上の自分の兵士）、`{ monsterId }`（ファイアボールで魔物を狙う）

### UIから呼ぶもの

| メソッド | 説明 |
|---|---|
| `new Game({ cards, rules, rng, monsters, upgrades, castles, decks, stages, elements, reactions, factions, setup })` | ゲームを作る。`factions`（`data/factions.json`）を渡すと、カードの `faction` が陣営のIDか `"common"` かを確かめ、`setup.faction`（陣営のID。省略・`null` なら陣営なし＝今までどおり全カード）で陣営モード（共有山札だけ。「四大陣営（PR-A）」の節）になる。`reactions`（`data/reactions.json`）を渡すと属性の反応が起きる（省略すると反応も付着もない）。`stages`（`data/stages.json`）を渡すと、`setup.stage`（ステージのIDか `"random"`。省略すると `"random"`）のステージで遊ぶ。`cards` / `rules` / `monsters` / `upgrades` / `castles` / `decks` は `data/` の JSON の中身（Game はファイルを読まない）。`cards` / `rules` 以外は省略でき、省略すると魔物は出ず・強化は買えず・城の種類はなし。`setup` は席ごとの選択 `{ castles: [...], decks: [...] }`（省略すると `rules.defaultCastle` / `rules.defaultDeck`）。`rng` は 0以上1未満を返す乱数で、省略すると `Math.random`。作った時点で初期手札は配られていて、`phase` は `"ready"`。イベントは出さない |
| `game.start()` | ゲームを始める。全イベントを `on()` で購読してから呼ぶと、先攻（`setup.firstPlayer`。省略すると p1）のターン1が始まる（`turnStarted` → ドロー → 進軍）。`rules.mulligan` が `true` なら、先に `phase` が `"mulligan"` になり、全員が `mulligan()` を選んでからターン1 |
| `game.mulligan(playerId, cardIds)` | マリガン（`phase` が `"mulligan"` のときだけ。1人1回。自分の番でなくてよい）。`cardIds`（0枚でもよい）を山札に戻してシャッフルし、同じ枚数を引き直す。全員が選んだら先攻のターン1が始まる |
| `game.getState(viewerId)` | 今の状態をただのオブジェクトで返す。`viewerId` の手札は中身まで、相手の手札は枚数だけ入る |
| `game.canPlayCard(cardId, target)` | そのカードを今出せるかを返す（読むだけで、状態は変わらない）。出せないときは `{ ok: false, reason }`。`playCard` と同じ判定なので、UIは出せない理由を前もって表示できる。`target` を省略して、対象が2つ以上あるときは `{ ok: true, needsTarget: true }` |
| `game.getTargets(cardId)` | そのカードを今出せる対象の一覧（読むだけ）。出せないときは空の配列。対象の形は下の「対象」 |
| `game.playCard(cardId, target)` | カードを使う。対象が1つしかないときは `target` を省略してよい（2人なら、魔物がいないときは今のカードはすべて省略できる。魔物がいるとファイアボールは「相手の城か魔物か」を選ぶ）。対象が2つ以上あるのに省略すると `{ ok: false, reason: "対象を選んでください", needsTarget: true }` |
| `game.discard(cardIds)` | 手札を捨てる。`phase` が `"discard"` のときだけ使える。捨てる必要がある枚数ちょうどを1回で渡す（多い・少ない・重複・手札にないカードは `{ ok: false }`）。捨て終わったら、自動で次の人のターンが始まる（`endTurn()` を呼び直さない） |
| `game.canBuyUpgrade(upgradeId)` | 強化を今買えるか（読むだけ）。`{ ok }` か `{ ok: false, reason }` |
| `game.buyUpgrade(upgradeId)` | コインで強化を買う。自分のメインの場面（`phase` が `"main"`）で何回でも。メインの1枚とは別 |
| `game.canDefend(cardId, target)` / `game.getDefenseTargets(cardId)` | 攻撃を受けているとき（`phase` が `"defend"`）に、その防御カードを今出せるか／出せる対象の一覧（読むだけ）。`canPlayCard` / `getTargets` の防御版。出せるのは `getState().defense.defenderId` の手札だけ |
| `game.defend(cardId, target)` | 攻撃を受けた人が、防御カードをその場で出す（何枚でも）。出せるカードがなくなったら、自動で攻撃を受ける。対象が1つなら `target` は省略できる |
| `game.passDefense()` | 防御しないで（これ以上出さずに）攻撃を受ける |
| `game.canFuse(cardIdA, cardIdB)` / `game.fuse(cardIdA, cardIdB)` | 手札の同じ種類のカード2枚を合成して、1つ上のレアリティのカード1枚にする（`phase` が `"main"` の自分の番に、何回でも。メインの1枚には数えない）。`canFuse` は読むだけ。レジェンドは合成できない |
| `game.endTurn()` | ターンを終える。手札が上限を超えていたら `phase` が `"discard"` になり、捨て終わるまで次の人の番にならない |
| `game.surrender(playerId)` | 降参する。自分の番でなくても使える。城が2つ（2人・2チーム）のときは、相手の勝ちですぐ終わる（`gameOver` の `reason` は `"surrender"`）。城が3つ以上のときは、降参した人（チーム戦はチーム全員）の城が壊れて（`castleDamaged`、`source: { kind: "surrender" }`）抜け、`playerEliminated` のあと、残りの試合を見守る（番が来ない）。残りの城が1つになったら `gameOver`（`reason` は `"lastStanding"`） |
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
| `game.debugSetDeck(types, playerId)` | 山札をカード種類の並びで作り直す（`deckMode` が `"own"` のときは `playerId` の山札。省略すると手番の人）。配列の先頭から順に引かれる。カードIDは新しく振り、元の山札はゲームから消える |

- どれも `{ ok: true }` か `{ ok: false, reason }` を返す。イベントは出さないので、呼んだあとは `getState()` を読み直して描き直す
- `start()` の前に呼べば、開始時の状態を作れる
- 山札の順番を毎回同じにしたいときは、`new Game()` にシード付きの `rng` を渡す

### getState() の形

```js
{
  deckMode: "shared",          // "shared"（全員共通の山札）| "own"（1人1つ）
  faction: null,               // 陣営モードの陣営ID（"kingdom" など）か null（「四大陣営（PR-A）」）
  playerOrder: ["p1", "p2"],   // 席順（手番の順）。p1〜p8
  round: 2,                    // 周回（席順の最初の人のターンが始まるたびに1増える。start() の前は 0）
  monsters: [{ monsterId: "m01", type: "slime", roadId: "p1-p2", square: 1, hp: 4, maxHp: 4, attack: 1, element: "water", attackIn: 3, reward: 2, castleAttack: 2 }],
  roads: [{ roadId: "p1-p2#1", players: ["p1", "p2"], length: 3, lane: 0 }, /* laneCount 本ぶん */],  // 道。length はいつも laneLength。lane は同じ2人の間の何本目か（0から）
  turn: 3,                     // 通算ターン数（1から）
  currentPlayer: "p1",
  phase: "main",               // "ready"（start() の前）| "main" | "discard" | "defend"（攻撃を受ける人の防御待ち）| "gameOver"
  defense: null,               // "defend" のときだけ { defenderId, attackerId, kind: "castle" | "soldiers", amount, soldierIds }
  winner: null,                // 決着したら勝った人のID（"p1"〜"p8"）
  deckCount: 18,               // "own" のときは viewer 本人の山札の数（viewer がいなければ null）
  discardCount: 5,
  exhaustedCount: 1,           // 使い切り置き場の枚数（使い切りのカードを使うとここへ行き、山札に戻らない）
  players: {
    p1: {
      castleHp: 32,
      castleMaxHp: 40,         // その城の上限。後攻（p2）は castleMaxHp + secondPlayerCastleBonus
      hand: [{ cardId: "c07", type: "infantry" }],  // viewer 本人のみ。相手は null
      handCount: 7,
      playedThisTurn: false,   // このターンにメインのカードを出したか
      reactionsThisTurn: 0,    // このターンに起こした属性の反応の回数（自分のターンの始めに0へ）
      eliminated: false,       // 負けて抜けたか（3人以上のときに使う。2人ならいつも false）
      cardsPlayedThisTurn: 2,  // このターンに出した枚数（メイン・付加・防御すべて）
      armor: 0,                // 城壁の残り
      coins: 2,                // コイン（魔物のとどめでもらう）
      castleType: "standard",  // 城の種類（castles を渡さなければ null）
      maxHand: 8,              // 手札の上限（城の種類で変わる）
      deckId: null,            // "own" のときのデッキのID
      deckCount: null, discardCount: null, exhaustedCount: null,  // "own" のときだけ、その人の山札などの数
      soldiers: [{
        soldierId: "s03", type: "knight", hp: 4, attack: 6, position: 3, roadId: "p1-p2", targetId: "p2",
        weapon: "waterSpear",  // 持っている武器のカード種類か null
        element: "water",      // "fire" | "water" | "wind" | "earth" | null
        shield: 0,             // 盾の残り
        attachment: { element: "fire", turns: 2 },  // 付着（属性の反応）か null。水霧なら element は "mist"
        statuses: {
          poison: { amount: 1, turns: 2 } /* か null */, frozen: 0 /* 凍結の残り回数 */,
          burn: null /* やけど { amount, turns } */, slow: 0 /* 鈍足の残り回数 */, blind: 0 /* 命中低下の残りターン */,
          dot: null /* 継続ダメージ { amount, turns } */
        }
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
| `overdriveChanged` | `{ playerId, active, hp, attack }` … 背水の陣になった（`active: true`）／終わった。`playerId` は城の持ち主。城HPが変わるイベント（`castleDamaged` / `castleHealed` / `monsterAttackedCastle`）のすぐあとに出る |
| `mulliganStarted` | `{ playerIds, firstPlayer }` … マリガンの場面が始まった（`start()` のとき。`rules.mulligan` が `true`） |
| `mulliganDone` | `{ playerId, count, returnedIds, cardIds }` … 引き直した。オンラインでは本人以外に `{ playerId, count }` だけ送る |
| `timeChanged` | `{ time, previous, rounds, cause, playerId }` … 昼と夜が変わった。`time` は `"night"` / `"day"`、`rounds` は夜が続く周回（昼なら0）、`cause` は `"natural"` か `"card"`（ムーンライズ・ドーンブレイク。`playerId` は出した人） |
| `stageEruption` | `{ roadId, square, amount }` … 溶岩のステージの噴火（広場なら `roadId` は `"plaza"`）。このあと、そのマスの兵士の `soldierDamaged`（`cause: "eruption"`）→ `statusApplied`（`"burn"`） |
| `cardDrawn` | `{ playerId, cardIds }` |
| `deckShuffled` | `{ deckCount, playerId }` … `playerId` は、`"own"` のときだれの山札か（`"shared"` なら `null`） |
| `cardPlayed` | `{ playerId, cardId, type }` |
| `cardsFused` | `{ playerId, cardIds: [a, b], cardId, from, to }` … 手札の2枚（`from` の種類）が、1枚（`to` の種類）になった。オンラインでは本人以外に `{ playerId }` だけ送る |
| `discardRequired` | `{ playerId, count }` … 捨てる必要がある枚数 |
| `cardDiscarded` | `{ playerId, cardIds }` |
| `soldierDeployed` | `{ playerId, soldierId, type, roadId, targetId, position, hp, attack }` … `hp` / `attack` は出した時点の値 |
| `soldierMoved` | `{ playerId, soldierId, roadId, from, to, cause?, slipped? }` … `cause` は押し戻されたときだけ `"pushed"`（ゲイルフォース。`to` が `from` より小さい）。`slipped: true` は氷のステージで滑って1マス余分に進んだとき |
| `soldiersClashed` | `{ attacker: { playerId, soldierId }, defender: { playerId, soldierId }, roadId, square }` … 道の上で兵士同士がぶつかった。`attacker` は進軍中の側。`square` は**攻める側が止まったマス**の道のマス番号（1マス先の相手と戦うときも攻める側のマス） |
| `soldierDamaged` | `{ playerId, soldierId, amount, hp, cause, blocked }` … `cause` は `"fight"` / `"spell"` / `"poison"` / `"shot"`（弓兵・魔法使いに撃たれた）/ `"burn"`（やけど）/ `"heat"`（溶岩の灼熱）/ `"eruption"`（噴火）/ `"dot"`（反応の継続ダメージ）/ `"reaction"`（反応の巻き添え）。`blocked` は盾が受けた量（`amount` は与えようとしたダメージ） |
| `soldierDestroyed` | `{ playerId, soldierId, reason }` … `reason` は `"killed"` / `"reachedCastle"` / `"eliminated"`（持ち主が抜けた）/ `"roadClosed"`（道がなくなった）/ `"returned"`（弓兵・魔法使いが帰った） |
| `soldierShot` | `{ playerId, soldierId, role, target, amount }` … 弓兵・魔法使いが撃った。`target` は `{ kind: "soldier", playerId, soldierId }` / `{ kind: "monster", monsterId }` / `{ kind: "castle", playerId }`。このあと `soldierDamaged`（`cause: "shot"`）／`monsterDamaged` …／`castleDamaged`（`source: { kind: "soldier", soldierId }`） |
| `spellCast` | `{ playerId, type, target, targetKind, roadId? }` … `roadId` は、レーンを選んだ魔法（`scope: "lane"`）のときだけ入る。 `target` は効果を受けるプレイヤーIDか魔物IDの**文字列**、`targetKind` は `"player"` か `"monster"`（`playCard` に渡す `target` のオブジェクトとは形が違う）（ファイアボール・サンダーは相手、ヒールは自分） |
| `castleDamaged` | `{ playerId, amount, blocked, hp, source }` … `playerId` は城の持ち主。`amount` は与えようとしたダメージ（兵士は攻撃力 × `soldierCastleDamageMultiplier`、魔法は値そのまま）（`hp` は0未満にならない）。`blocked` は城壁が受けた量（`hp` は城壁で減らしたあとの値）。`source` は `{ kind: "soldier", soldierId }` か `{ kind: "spell", type }` |
| `castleHealed` | `{ playerId, amount, hp }` … `amount` は実際に増えた量（上限で止まったぶんは含まない） |
| `weaponEquipped` | `{ playerId, soldierId, type, attack, element }` … 武器を持たせた。`attack` は持たせたあとの攻撃力（重ねると足し算。`element` は最後の武器の属性に上書き） |
| `shieldAdded` | `{ playerId, soldierId, amount, shield }` … `shield` は足したあとの盾 |
| `castleArmored` | `{ playerId, armor }` … 城壁を置いた |
| `armorExpired` | `{ playerId }` … 城壁が消えた（その人のターンの始め） |
| `statusApplied` | `{ playerId, soldierId, status, turns }` … `status` は `"poison"` / `"frozen"` / `"burn"`（やけど）/ `"slow"`（鈍足。`amount` 付き）/ `"blind"`（命中低下。`chance` 付き）/ `"dot"`（継続ダメージ。`amount` 付き） |
| `statusCleared` | `{ playerId, soldierId, status }` |
| `roundStarted` | `{ round }` … 周回の始め（`turnStarted` のすぐあと） |
| `monsterAppeared` | `{ monsterId, type, roadId, square, hp, attack, element }` |
| `monsterAttackedCastle` | `{ monsterId, playerId, amount, hp }` … 放置された魔物が城を攻めた。`playerId` は城の持ち主、`amount` は実際に減った量。城HPが0以下になったら、このあとすぐ `gameOver`（城を落とされた方の負け） |
| `monsterClashed` | `{ attacker: { playerId, soldierId }, monsterId, roadId, square }` … 兵士が魔物と戦う。`square` は兵士が止まったマス |
| `monsterDamaged` | `{ monsterId, amount, hp, by }` … `by` は `{ playerId, soldierId }`（兵士）か `{ playerId, type }`（魔法） |
| `monsterDefeated` | `{ monsterId, playerId, reward }` … `playerId` はとどめを刺した人 |
| `coinsChanged` | `{ playerId, delta, coins, reason }` … `reason` は `"reward"` / `"upgrade"` / `"turn"` / `"card"` / `"weather"` / `"stolen"`（ミミックに奪われた）/ `"steal"`（奪った） |
| `upgradeBought` | `{ playerId, upgradeId, cost }` … このあと効果のイベント（`castleHealed` / `cardDrawn` / `soldierBuffed`） |
| `soldierBuffed` | `{ playerId, soldierId, attack }` … とぎ石・訓練・バフサイコロで攻撃力が上がった |
| `diceRolled` | `{ playerId, type, dice, value, amount, rolls, cost? }` … サイコロのカードを振った（「サイコロのカード」の節） |
| `playerEliminated` | `{ playerId, by }` … 城が落ちて抜けた（`lastStanding`）。`by` は落とした人 |
| `defenseRequested` | `{ defenderId, attackerId, kind, amount, soldierIds? }` … 攻撃が当たる前に、受ける人に防御を聞く。`kind` は `"castle"`（城に当たる）か `"soldiers"`（兵士に当たる。`soldierIds` が当たる兵士）。このあと `defend()` / `passDefense()` が来るまで止まる |
| `defenseEnded` | `{ defenderId }` … 防御が終わった。このあと攻撃が当たる（`castleDamaged` / `soldierDamaged` …） |
| `roadClosed` | `{ roadId, monsterIds }` … 道がなくなった。その道の魔物（`monsterIds`）も消える |
| `roadOpened` | `{ roadId, players }` … 抜けた人の両どなりをつなぐ道ができた |
| `spellReflected` | `{ defenderId, attackerId, amount }` … 反射。このあと撃った人の城に `castleDamaged` |
| `soldierDecoyed` | `{ defenderId, attackerId, soldierId }` … 身代わり。このあと兵士の `soldierDestroyed`（`"reachedCastle"`）。城にダメージは入らない |
| `cardStolen` | `{ playerId, victimId, cardId }` … 盗賊。`cardId` から種類は分からない（奪った本人だけが `state` で種類を見られる） |
| `spiritSummoned` | `{ playerId, type, spirit, amount, turns, targetId }` … 精霊を呼んだ。`spirit` は `"fire"` / `"water"` / `"wind"` / `"earth"`。`targetId` は火の精霊が攻める相手（ほかは `null`） |
| `spiritTriggered` | `{ playerId, type, spirit, amount, targetId? }` … 火・水の精霊が効いた（このあと `castleDamaged`（`source: { kind: "spirit", type }`）／`castleHealed`） |
| `spiritEnded` | `{ playerId, type, reason }` … `reason` は `"expired"`（終わった）か `"replaced"`（ほかの精霊に入れ替わった） |
| `mpChanged` | `{ playerId, delta, mp, reason }` … `reason` は `"cast"`（魔法・精霊で使った）／`"card"`（マナ回復）／`"drained"`（MPドレインで奪われた）／`"drain"`（MPドレインで奪った）。上限や0で止まったぶんは `delta` に含まない |
| `monsterEvolved` | `{ monsterId, rewardRarity, hp, maxHp, attack, castleAttack, count }` … 放置された魔物が強くなった（`count` は強くなった回数）。`monsterAppeared` の後の周回の始め、魔物の城への攻撃のあと |
| `attachmentChanged` | `{ playerId, soldierId, element, turns, cause }` … 兵士の付着が変わった。`element` が `null` なら消えた。`cause` は `"hit"`（属性つきの攻撃が当たった）／`"reaction"`（反応で変わった・消えた）／`"expired"`（期限で消えた） |
| `reactionTriggered` | `{ attackerId, playerId, soldierId, reaction, name, attached, element, multiplier, chain?, chaos? }` … 属性の反応が起きた。`playerId` / `soldierId` は標的、`attached` は使った付着（凍結中は `"ice"`、やけど中は `"fire"`、水霧は `"mist"`）、`element` は攻撃の属性、`multiplier` は倍率（ないなら `null`）。`chain` は、反応で残った付着から続けて起きたとき、前の反応のID。`chaos: true` は混沌でランダムに選ばれた |
| `gameOver` | `{ winner, reason }` … `reason` は `"castleDestroyed"` / `"lastStanding"` / `"roundLimit"` / `"surrender"`（降参） |

#### イベントの順番

- ターンの始め：`turnStarted` → ドロー → 進軍
  - ドロー：山札が途中で尽きたら `deckShuffled` → 残りを引く。`cardDrawn` は引いたぶんを1回にまとめて出す。1枚も引かなければ `cardDrawn` は出さない
  - 進軍：兵士は出した順に1体ずつ動く。城に着いた兵士は `soldierMoved` → `castleDamaged` → `soldierDestroyed`（`"reachedCastle"`）の順に出す
  - 城に着いた兵士の `soldierMoved.to` は `laneLength` にそろえる（`laneLength` 以上に進んでも `laneLength`）
  - 兵士同士が戦うとき：`soldierMoved`（止まった位置まで。動かなければ出さない）→ `soldiersClashed` → `soldierDamaged`（守る側）→ `soldierDamaged`（攻める側）→ HPが0以下の兵士の `soldierDestroyed`（`"killed"`）。両方消えるときは**守る側 → 攻める側**の順（`soldierDamaged` と同じ順番）
  - 戦いで相手だけが消えて進み続けるとき（`advanceAfterWin`）：上の戦いのイベントのあと、続きの `soldierMoved`（さっき止まったマスから）→（また相手に会えば）`soldiersClashed` …、城に着けば `castleDamaged` → `soldierDestroyed`（`"reachedCastle"`）。1体の兵士の `soldierMoved` が1回の進軍で2回以上出ることがある
  - 進軍の途中で城HPが0以下になったら、残りの兵士は動かさずにすぐ `gameOver` を出す
- 進軍（STEP 2）：1体ずつ「毒の `soldierDamaged`（`cause: "poison"`）→（0なら `soldierDestroyed` で、動かない）→（凍結なら休んで、0回になったら `statusCleared`）→ 動く」
  - 属性の反応があるとき：毒 → やけど → 継続ダメージ（`cause: "dot"`）→ 鈍足の残りが1減る → 凍結 → 動く
- 属性の反応：攻撃の `reactionTriggered` → その攻撃の `soldierDamaged`（倍率を掛けたあと）→（0なら `soldierDestroyed`）→ 付着の `attachmentChanged`（`cause: "reaction"`）→ 特殊効果（`statusApplied`・巻き添えの `soldierDamaged`（`cause: "reaction"`）…）。兵士同士の戦いでは、`soldiersClashed` → `reactionTriggered` → `soldierDamaged`（守る側）→ `soldierDamaged`（攻める側）→ `soldierDestroyed` → 付着・特殊効果（守る側への攻撃 → 攻める側への攻撃の順）。反応が起きなければ、`soldierDamaged` のあとに付着の `attachmentChanged`（`cause: "hit"`）
- ターンの終わり（属性の反応があるとき）：手番の人の兵士の命中低下・付着の残りが1減る（0なら `statusCleared`（`"blind"`）／`attachmentChanged`（`cause: "expired"`））→ 次の人の `turnStarted`
- 強化を買ったとき：`coinsChanged`（`reason: "upgrade"`）→ `upgradeBought` → 効果のイベント
- 周回の始め（席順の最初の人のターン）：`turnStarted` → `roundStarted` → 放置された魔物の `monsterAttackedCastle`（出た順）→ `monsterAppeared`（道の順）→ 城壁の `armorExpired` → ドロー → 進軍。魔物の攻撃で城HPが0以下になったら、`monsterAttackedCastle` → `gameOver` で止まる（落とされた方の負け）
- 兵士と魔物の戦い：`soldierMoved`（動いたら）→ `monsterClashed` → `monsterDamaged` → `soldierDamaged`（兵士）→（魔物が0なら）`monsterDefeated` → `coinsChanged` →（兵士が0なら）`soldierDestroyed`。1マスごとに相手の兵士 → 魔物の順に確かめる
- ファイアボールで魔物：`cardPlayed` → `spellCast`（`target` は `monsterId`）→ `monsterDamaged` →（0なら）`monsterDefeated` → `coinsChanged`
- ターンの始めに城壁が残っていたら、`turnStarted` のすぐあと（ドローの前）に `armorExpired`
- カードを出したとき：`cardPlayed` のあと
  - 兵士：`soldierDeployed`
  - ファイアボール：`spellCast` → `castleDamaged`
  - サンダー：`spellCast` → 相手の兵士1体ずつ `soldierDamaged` →（HPが0なら）`soldierDestroyed`（`"killed"`）
  - ヒール：`spellCast` → `castleHealed`
  - 毒の霧・氷の息：`spellCast` → 相手の兵士1体ずつ `statusApplied`
  - 武器：`weaponEquipped`／盾：`shieldAdded`／城壁：`castleArmored`
- ターン終了：手札が上限を超えていたら `discardRequired`。捨てたら `cardDiscarded` → 次の人の `turnStarted` …
- 周回の上限（`maxRounds`）に来たら、次の周回の `turnStarted` の代わりに `gameOver`（`reason: "roundLimit"`）
- `lastStanding` で城が落ちたとき：`castleDamaged`（兵士なら `soldierDestroyed`（`"reachedCastle"`）のあと）→ `playerEliminated` → 抜けた人の兵士の `soldierDestroyed`（`"eliminated"`）→ `roadClosed` → その道の兵士の `soldierDestroyed`（`"roadClosed"`）… → `roadOpened` →（残りが1人なら）`gameOver`
- `gameOver` はいちばん最後に1回だけ出る。そのあとの操作はすべて `{ ok: false }`

### データの形

`data/rules.json`

```json
{
  "castleMaxHp": 40,
  "secondPlayerCastleBonus": 1,
  "initialHand": 5,
  "drawPerTurn": 1,
  "firstTurnDraw": 1,
  "drawUntilHand": 5,
  "maxHand": 8,
  "laneLength": 3,
  "laneCount": 3,
  "advanceAfterWin": false,
  "soldierCastleDamageMultiplier": 2,
  "monsterFirstRound": 3,
  "monsterCooldownRounds": 2,
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
  "heal":      { "name": "ヒール", "kind": "spell", "effect": "healOwnCastle", "amount": 10, "count": 3, "exhaust": true },
  "flameSword":  { "name": "炎の剣", "kind": "weapon", "attackBonus": 1, "element": "fire", "count": 2 },
  "shield":      { "name": "盾", "kind": "defense", "effect": "shieldSoldier", "amount": 3, "count": 3 },
  "poisonMist":  { "name": "毒の霧", "kind": "spell", "effect": "poisonEnemySoldiers", "amount": 1, "turns": 3, "count": 3 }
}
```

- `laneCount`：同じ2人の間の道（レーン）の本数（1〜5。省略すると1）。兵士は出すときにどのレーンに出すかを選び、**兵士同士が戦うのは同じレーンの上だけ**。**魔物は2人の間に1体だけ**（どのレーンに出るかはランダム）。魔物のいないレーンの兵士は、魔物に止められず城へ進める。魔物を倒したあとの `monsterCooldownRounds` は、2人の間全体にかかる
- カードの `scope`（`damageEnemySoldiers` / `poisonEnemySoldiers` / `freezeEnemySoldiers` の魔法だけ。省略すると `"all"`）：`"all"` は相手の全レーンの兵士に効く。`"lane"` は選んだ1レーンの相手の兵士だけに効く（対象は `{ playerId, roadId }`）。`laneCount` が1のときは `"lane"` でも `"all"` と同じ（対象を選ばない）
- `monsterFirstRound`：魔物が出はじめる周回（省略すると3）。`monsterCooldownRounds`：魔物を倒した道に次の魔物が出ない周回の数（省略すると0）。`monsterSpawnChance`：周回の始めに、魔物がいない道ごとに魔物が出る確率（0〜1の数。省略すると0）
- `elementBonus`：**使わなくなった**（属性の相性は `data/elements.json` の倍率。「属性を10種にした」）
- カードの `kind`：`soldier` / `spell` / `weapon`（`attackBonus`、`element`）/ `defense`（`effect`: `shieldSoldier` / `armorCastle`、`amount`）。魔法の `effect` に `poisonEnemySoldiers`（`amount`, `turns`）と `freezeEnemySoldiers`（`turns`）が増えた。`element` は `fire` / `water` / `wind` / `earth`。魔法にも `element` を書ける（属性の反応の付着・反応だけに使う。「属性の反応」の節）
- `secondPlayerCastleBonus`：後攻（p2）の城だけ、HPと上限がこのぶん多い（先攻有利をやわらげるため）。0以上の整数
- `advanceAfterWin`：`true` なら、戦いで相手だけが消えたとき、残りの歩数で進み続ける（`false` ならそのターンはその場で止まる）。省略すると `false`
- `soldierCastleDamageMultiplier`：城に着いた兵士が与えるダメージ ＝ 攻撃力 × この値（1以上の整数）。省略すると 1
- `firstTurnDraw`：先攻の最初のターンに引く枚数（2ターン目以降と後攻は `drawPerTurn`）
- `exhaust`：`true` のカードは使い切り。使うと使い切り置き場へ行き、山札に戻らない。省略すると `false`。手札の上限で捨てたときは、ふつうに捨て札置き場へ行く（山札に戻る）
- カードの説明文は UI が `kind` / `effect` と数値から組み立てる。カードに `description` を書けば、そちらを優先する（Game は `description` を使わない）

## ゲームのルール（現在：STEP 1）

STEP 1 は、2人が同じ端末で交互に遊ぶ最小版。数値はすべて仮（`data/` で調整する）。

- 城HP：40（上限も40）。後攻（p2）の城は 41 で始まる（上限も41）
- 山札：2人共通。シャッフルして使う。使ったカードと捨てたカードは捨て札置き場へ
  - 兵士カードも、出した時点で捨て札置き場へ行く（場の兵士とは別に扱う）
  - 使い切りのカード（ヒール）は、使ったら使い切り置き場へ行き、二度と山札に戻らない。手札の上限で捨てたときは捨て札置き場へ行く（山札に戻る）
- 山札が尽きたら、捨て札をシャッフルして新しい山札にする。両方とも空なら引かない
- 初期手札：5枚ずつ
- 先攻は p1。先攻の最初のターンも1枚引く
- ターンの流れ
  1. ドロー：1枚引く
  2. 進軍：自分の兵士が出した順に1体ずつ前に進む。相手の兵士とぶつかったら戦う。相手の城に着いた兵士は、攻撃力の2倍（`soldierCastleDamageMultiplier`）のダメージを与えて消える
  3. メイン：カードを1枚出す（出さなくてもよい）
     - 出しても何も起きないカードは出せない（道の上に相手の兵士がいないときのサンダー、城HPが満タンのときのヒール）
  4. ターン終了：手札が8枚を超えていたら、本人が選んで8枚になるまで捨てる
     - 捨てる枚数ちょうどを一度に選ぶ。捨て終わったら、そのまま次の人のターンになる
- 道：城と城の間は**1本の道**で、3マス（`laneLength`）。両方のプレイヤーの兵士が同じ道を向かい合って進む
  - 出した兵士は位置0（自分の城の前のマス）に置かれ、出したターンには動かない。そのマスに相手の兵士がいても出せる
  - 進軍で位置が `laneLength`（3）以上になったら「相手の城に着いた」とする（ぴったりでなくてよい）
  - 例：歩兵は出した次のターンから 2 → 4 で、2回目の進軍で城に着く。騎士は 3 で1回目に着く（どちらも邪魔されなかった場合）
  - 自分の兵士同士は、同じマスに何体いてもよい
- 兵士同士の戦い
  - 進軍は1マスずつ進める。進む前と、1マス進むごとに、**同じマスか1つ先のマス**に相手の兵士がいないか確かめる。いたら、そこで止まって戦う
  - 戦う相手が何体かいるときは、先に出された兵士と戦う
  - 戦い：お互いに攻撃力ぶんのダメージを同時に与える。HPが0以下になった兵士は消える
  - 相手だけが消えても、そのターンはその場で止まる（続きは次の進軍で）。両方とも生き残ったら、次の進軍でもう一度戦う（`advanceAfterWin` を `true` にすると、相手だけが消えたときに残りの歩数で進み続ける。今は `false`）
  - 戦いは進軍している側のターンにだけ起きる
- 真ん中のマス（道のマス番号1）は、STEP 3 で魔物が出る場所。STEP 1 では普通のマスとして通れる
  - STEP 3 の予定：魔物がいる間、兵士は真ん中のマスの手前で止まって魔物を攻撃する。倒すまで先へは進めない
  - `laneLength` を変えるときは、真ん中がひとつに決まるよう奇数にする
- 兵士が受けたダメージは回復しない。HPが0以下になったら消える
- 勝利：相手の城HPを0以下にした瞬間に勝ち。その時点でゲームを止める

### STEP 1 のカード

| 名前 | 種類 | 効果 | 枚数 |
|---|---|---|---|
| 歩兵 | 兵士 | HP5・攻撃3（城には6）・1ターンに2マス進む（遅いけど打たれ強い。サンダーに耐える） | 10 |
| 騎士 | 兵士 | HP4・攻撃5（城には10）・1ターンに3マス進む（速くて強いけど、歩兵より打たれ弱い） | 6 |
| ファイアボール | 魔法 | 相手の城に8ダメージ（すぐ効いて防げないので、枚数は抑える。回復を減らしたぶん、攻めが報われるよう4→6枚） | 6 |
| サンダー | 魔法 | 道の上にいる相手の兵士全員に3ダメージ | 6 |
| ヒール | 魔法 | 自分の城HP+10（上限はその城の上限）。**使い切り**（回復が強すぎて攻めが報われなかったため、6→3枚） | 3 |

### STEP 1 の画面

- スマホの縦画面が基準。PCのブラウザでも崩れないようにする
- 上に相手の城、下に自分の城、その間に道（3マス）が `laneCount` 本（今は3本）横に並ぶ。自分の兵士は上へ、相手の兵士は下へ進む
- 真ん中のマスは、魔物の居場所だと分かるように見た目を少し変えておく（STEP 1 では魔物は出ない）
- 兵士同士がぶつかったら、戦っていることが分かる演出を入れる
- 手札は画面下に並べ、左右にスライドできるようにする
- 兵士の進軍と魔法の命中は、アニメーションで見せる
- 手番が変わるときは画面を隠して「プレイヤー2の番です」と出す（相手に手札が見えないように）。タップしたら表示する
- 相手の手札は枚数だけ表示する
- 捨てる必要があるときは、手札から選ぶ画面を出す
- 山札と捨て札の枚数を表示する

### ひとりで遊ぶ（CPU と対戦）

- タイトルの「ひとりで遊ぶ」から、CPU の強さを3段階で選ぶ。URL に `?local=1&cpu=hard`（`easy` / `normal` / `hard`）でもすぐ始まる
- CPU は `js/game/strategies.js` の戦い方をそのまま使う。Game の公開メソッドだけを使い、自分の手札しか見ない（ずるをしない）

| 強さ | 戦い方 | random（ランダムに出す）に勝つ割合（先攻のとき） |
|---|---|---|
| よわい（`easy`） | `defensive`（守り優先） | 約18% |
| ふつう（`normal`） | `rush`（攻め重視。守らない） | 約21% |
| つよい（`hard`） | `smart`（ほどよく考える） | 約91% |

（コインの強化・精霊・兵士の追加で、以前の「rush が最弱」の順が入れかわったので、割り当てを直した。測定：`node tests/sim/run.js --games 200 --match <戦い方>,random`）

- 先攻・後攻は毎回ランダム（後攻の補正は「コイントス・後攻の補正・マリガン」の節）。「もう1回」は同じ強さで始まる
- 交代の画面は出さない（オンラインと同じく、だれの番かを帯で知らせる）。メニューから降参できる
- 強さの割り当ては `js/ui/config.js` の `UI_CONFIG.cpuLevels`（`js/main.js` の `CPU_LEVELS` が読む）。カードや数値を変えたら、`node tests/sim/run.js --match rush,random` などで弱い順が変わっていないか確かめる

## 完成の目安（STEP 1）

- 2人で最後まで遊べて、勝敗が表示される
- 山札が尽きても止まらない
- 手番交代で相手の手札が見えない
- ブラウザのコンソールにエラーが出ない

## レーン（STEP 2 の続き・仮）

「魔物と戦うか、相手の攻撃を必ず受けるか」しか選べず戦略性が低かったので、城と城の間の道を3本（`rules.laneCount`）にして、**兵士を出すときにどの道に出すかを選べる**ようにした（人間に確認して決めた）。

- 兵士は、出した道だけを進む。**兵士同士は同じ道の上でだけ戦う**。別の道なら、すれちがって城まで進む
- 魔物は2人の間に1体だけで、出る道はランダム。魔物のいない道なら魔物に止められないので、「魔物を倒して稼ぐか」「魔物を避けて城を攻めるか」「相手の兵士を迎え撃つか」を選べる
- 魔法は、カードごとに効く範囲を変える（`scope`）：サンダー・氷の息・猛毒は選んだ1レーンだけ（`"lane"`）、毒の霧・大雷・大氷結は全レーン（`"all"`）。範囲が狭いぶん、カードの数値は今のまま。ファイアボール・ヒールなど城に関する魔法は、レーンを選ばない
- 確かめたこと（`node tests/sim/run.js --games 300`）：smart 同士の平均42手番（レーンなしは48）、p1 勝率50%。smart vs random 72%。CPU の兵士の出し先は `js/game/strategies.js`（相手の兵士が来ている道に迎え撃つ、なければ魔物のいる道）
- 画面：道が横に `laneCount` 本並ぶ。兵士を出すときは、光っている道をタップして選ぶ（`js/ui/Renderer.js` のレーン、`js/ui/Targeting.js`）。レーンを選んだ魔法は、その道だけに雷・霧の演出が出る。魔物の居場所（真ん中のマス）は全レーンに印がつく（どの道に出るかは出るまで分からない）

## STEP 2：カード拡張（武器・防御・属性・状態異常）

トラップ（落とし穴）は、ルールがややこしくなるため**入れない**（レビューで決めた）。

**数値はすべて仮**（`data/cards.json`・`data/rules.json` で調整する）。カードの枚数と数値は、実装のPRでシミュレーションして決める。

### カードの種類（`kind`）と出し方（`slot`）
| `kind` | 出し方（`slot`、`kind` から決まる） | 対象 | 何をするか |
|---|---|---|---|
| `soldier` | メイン（1ターン1枚） | 送り込む相手 `{ playerId }` | 今と同じ |
| `spell` | メイン | `effect` による | 今と同じ＋状態異常の魔法 |
| `weapon`（武器） | 付加（何枚でも） | 道の上の自分の兵士 `{ soldierId }` | 兵士に持たせる。攻撃力が上がり、属性がつく。**1体に1つ**（新しく持たせると前の武器は消える） |
| `defense`（防御） | 防御（何枚でも） | `effect` による | 兵士に盾をつける・城を守る |

- 「メイン」を出したかどうかは `playedThisTurn`。付加・防御は、メインを出す前でも後でも出せる
- 付加・防御も、出しても何も起きないときは出せない（例：道の上に自分の兵士がいないときの武器、同じ武器をもう持っている兵士、全員がもう同じ状態のときの毒の霧・氷の息、今と同じか強い城壁があるときの城壁）

### 属性
- 属性は 火（`fire`）・水（`water`）・風（`wind`）・土（`earth`）の4つ（人間に確認して、木をなくして風・土にした）。**相性は「属性を10種にした」の節の図（水→火・土、風→火、土→風 など。有利1.5倍・不利0.75倍）が最新**（昔の「水→火→風→土→水の輪」は使わない）。**強弱の組み合わせは仮**
- 兵士は、属性つきの武器を持つとその属性になる（持っていなければ属性なし）
- 兵士同士の戦いで、自分の属性が相手の属性に強いとき、与えるダメージが倍率で増える（今は `data/elements.json` の1.5倍（不利は0.75倍）。「属性を10種にした」）。属性なしの相手には増えない
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

### ドロー
- **ドロー**：毎ターン `drawPerTurn` 枚が最低。**`rules.drawPerPlayed: true` のときは、前のターンに出した枚数ぶん引く**（人間の指示で、「使った枚数では増やさない」を変えた。仕様の変更の経緯は「カードのレアリティと合成」の節）。先攻の最初のターンは `firstTurnDraw`
  - 付加・防御を出したぶん手札が減るコストは、次のターンの補充で戻る。手札が上限を超えたら、ふつうにターン終了で捨てる

### STEP 2 のカード（仮）
枚数：炎の剣・水の槍・（木の斧→風の弓）各2、盾・城壁・毒の霧・氷の息 各3（山札は32 → 50枚。調整後は、ファイアボール6・ヒール3に変えたので49枚）。

| 名前（type） | 種類 | 効果 | 長所 | 短所 |
|---|---|---|---|---|
| 炎の剣（`flameSword`） | 武器・火 | 攻撃+1、火 | 風の兵士に強い | 水の武器に返される |
| 水の槍（`waterSpear`） | 武器・水 | 攻撃+1、水 | 火の兵士に強い | 土の武器に返される |
| 風の弓（`windBow`） | 武器・風 | 攻撃+1、風 | 土の兵士に強い | 火の武器に返される |
| 土の槌（`earthHammer`） | 武器・土 | 攻撃+1、土 | 水の兵士に強い | 風の武器に返される |
| 盾（`shield`） | 防御 | 兵士に盾3 | 何枚でも重なる。兵士が城まで届きやすくなる | 城は守れない。攻撃力は上がらない |
| 城壁（`wall`） | 防御 | 自分の城を5守る（次の自分のターンまで）。**使い切り** | ファイアボールも兵士も止める | 1ターンで消える。重ならない。1試合に3回まで |
| 毒の霧（`poisonMist`） | 魔法（メイン） | 相手1人の兵士全員に毒（1ダメージ×4回） | サンダー（3）より合計のダメージが大きく（4）、盾が効かない | すぐには効かない。その間に城に着かれることがある |
| 氷の息（`frostBreath`） | 魔法（メイン） | 相手1人の兵士全員を凍結（1回休み） | 城の前まで来た兵士を1ターン止められる | ダメージがない。メインを使う |

### 追加カード（STEP 2 の続き・仮）
既存の `effect` だけで作れるカード10種を足した（ルール・イベントの変更なし）。**数値はすべて仮**。枚数は、下の「攻撃と防御の比率」で調整したあとの値。

| 名前（type） | 種類 | 効果 | 長所 | 短所 |
|---|---|---|---|---|
| 槍兵（`spearman`）×3 | 兵士 | HP3・攻撃4・速さ2 | 歩兵より攻撃が高い | 歩兵より打たれ弱い |
| 重装兵（`heavy`）×2 | 兵士 | HP9・攻撃2・速さ1 | とても打たれ強い | 遅く、攻撃が低い |
| 巨人（`giant`）×2 | 兵士 | HP7・攻撃5・速さ1 | 強くて打たれ強い | 城に着くまで3ターンかかる |
| 隕石（`meteor`）×2 | 魔法・使い切り | 相手の城に14 | ファイアボールの倍近いダメージ | 1試合に1回きり（山札に戻らない） |
| 大雷（`bigThunder`）×2 | 魔法・使い切り | 相手の兵士全員に5 | サンダーで倒せない兵士も倒せる | 使い切り |
| 猛毒（`venom`）×3 | 魔法 | 相手の兵士全員に毒（2ダメージ×2回） | 毒の霧より早く効く | 毒の霧と同じ合計4で、続く期間が短い |
| 大氷結（`deepFreeze`）×3 | 魔法・使い切り | 相手の兵士全員を2回休ませる | 氷の息より長く止められる | 使い切り・ダメージなし |
| 鉄の剣（`ironSword`）×1 | 武器 | 攻撃+2・属性なし | 武器の中でいちばん強い | 属性がないので、属性の強みも弱みも出ない（属性つきの武器を上書きすると属性が消える） |
| 大盾（`bigShield`）×3 | 防御・使い切り | 兵士に盾6 | 盾の倍の厚み | 使い切り |
| 土嚢（`sandbag`）×4 | 防御 | 自分の城を3守る（次の自分のターンまで） | 使い切りでないので何度も使える | 城壁（5）より薄い |

- 確かめたこと（`node tests/sim/run.js --games 300`）：smart 同士の p1 勝率51%・平均48手番、smart vs random は68%（追加前は70%）。全員共通の山札では決着しなくなる試合なし
- デッキ対戦（`data/decks.json`）：3つのデッキに新カードを足した。籠城に新カードを入れすぎると勝率が23%まで落ちたので、`tests/sim/castles.js` で確かめながら直した（バランス49%・突撃52%・籠城51%）
- 見た目は仮の絵（既存の絵の使い回し）。専用の絵ができたら `js/ui/art.js` を差しかえる

### 攻撃と防御の比率（半々）

攻撃と防御の枚数は、全員共通の山札でほぼ半々にする（人間に確認して決めた）。数え方：
- **攻撃側**：兵士・武器・城や兵士を直接ダメージする魔法（ファイアボール・隕石・サンダー・大雷）
- **防御側**：防御カード（盾・大盾・城壁・土嚢）・ヒール・相手の兵士を弱らせる魔法（氷の息・大氷結・毒の霧・猛毒）

| | 枚数 |
|---|---|
| 攻撃側 | 36（歩兵8・騎士4・槍兵3・重装兵2・巨人2・武器4・ファイアボール5・隕石2・サンダー4・大雷2） |
| 防御側 | 35（盾6・大盾3・城壁4・土嚢4・ヒール4・氷の息4・大氷結3・毒の霧4・猛毒3） |

- 確かめたこと（`node tests/sim/run.js --games 400`）：全組み合わせが決着。smart 同士は平均51手番（半々にする前は42）。CPU の強さの順は変わらない（rush 32%・defensive 48%・smart 63%、いずれも random に勝つ割合）
- 防御が増えたぶん試合は少し長くなる。決着しない試合は、周回の上限（`maxRounds`）で必ず終わる
- デッキ対戦（`data/decks.json`）は、バランスが攻撃23・防御17、突撃が攻撃22・防御13、籠城が攻撃21・防御17。デッキは役割の違いを残すため、半々にはしていない（`node tests/sim/castles.js`：バランスに勝つ割合は突撃55%・籠城53%）

## 攻撃を受けたときの防御（STEP 2 の続き）

企画書の「相手の対応：攻撃されたら、防御カードを何枚でも出して受けられる」を入れた（人間に確認して決めた）。`rules.defenseReaction: true` のとき（省略すると `false`）。

- **聞くとき**：兵士が城に着いたとき（城にダメージ）／ファイアボール・隕石が城に当たるとき／サンダー・大雷が兵士に当たるとき。毒・凍結は、防御カードで防げないので聞かない。兵士同士の戦い・魔物の城への攻撃も聞かない
- **出せるカード**：城に当たるなら城壁・土嚢（`armorCastle`）。兵士に当たるなら盾・大盾（`shieldSoldier`。当たる兵士だけ）。ヒールなどは今までどおり自分のターン。自分のターンに前もって盾・城壁を出すのも今までどおりできる
- **手札になければ止まらない**：出せる防御カードが手札になければ、聞かずにそのまま当たる
- **流れ**：攻撃が当たる前に `phase` が `"defend"` になる（`currentPlayer` は攻める人のまま）。受ける人は `defend()` を何枚でも → `passDefense()`（出せるカードがなくなったら自動）。攻める人はそのあいだ何もできない（`playCard` / `endTurn` は `{ ok: false, reason: "相手が防御を選んでいます" }`）。降参はできる。返事が来たら攻撃が当たり、残りの進軍・ターンが続く
- **イベントの順番**：`spellCast`（魔法のとき）→ `defenseRequested` → `cardPlayed`（防御カード）→ `castleArmored` / `shieldAdded` … → `defenseEnded` → `castleDamaged` / `soldierDamaged` …。兵士が城に着くときは、`soldierMoved` → `defenseRequested` → … → `defenseEnded` → `castleDamaged` → `soldierDestroyed`
- **オンライン**：`POST /api/action` の `method` に `defend` / `passDefense` を足した（攻撃を受ける人だけが、自分の番でなくても送れる）。`state` の `playable` は、防御を選ぶあいだ、受ける人には「防御カードを出せるか」を、ほかの人には全部 `ok: false`（「相手が防御を選んでいます」）を返す
- **画面**：受ける人には「防御のチャンス！」の帯を出し、「ターン終了」ボタンが「防御しない」になる。出せる防御カードだけが光る。2人で交代して遊ぶ（ひとつの端末）ときは、手札を見せ合えないので聞かない（`defenseReaction` を切る）
- **CPU**：戦い方に `respond(game, pid, rng, ctx)` を足した。`never`（aggro・rush・pass：防御しない）、`always`（defensive：出せるなら出す）、`smart`（smart・guard：城HPが半分を切りそう・大きなダメージ・兵士がやられそうなときだけ）、`random`（半分の確率）
- 確かめたこと（`node tests/sim/run.js --games 400`）：全組み合わせが決着。smart 同士は平均61手番（防御なしは51）。CPU の強さの順は変わらない（rush 32%・defensive 55%・smart 70%、いずれも random に勝つ割合）。**試合は長くなる**（1試合10分前後の目安に対して長めなので、遊んで確かめる）

### ロジックとUIの約束に足すもの（STEP 2）
- `getState()`
  - 兵士：`weapon`（武器のカード種類か `null`）、`element`（`"fire"` / `"water"` / `"wind"` / `"earth"` / `null`）、`shield`（盾の残り）、`statuses`（`{ poison: { amount, turns } | null, frozen: 回数 | 0 }`）
  - プレイヤー：`armor`（城壁の残り）、`cardsPlayedThisTurn`
- イベント（「Gameが出すイベント」の表に足す）
  - `weaponEquipped`：`{ playerId, soldierId, type, attack, element }`（`attack` は持たせたあとの攻撃力）
  - `shieldAdded`：`{ playerId, soldierId, amount, shield }`（`shield` は足したあとの盾）
  - `castleArmored`：`{ playerId, armor }` / `armorExpired`：`{ playerId }`
  - `statusApplied`：`{ playerId, soldierId, status, turns }` / `statusCleared`：`{ playerId, soldierId, status }`
  - `soldierDamaged` に `cause`（`"fight"` / `"spell"` / `"poison"`）と `blocked`（盾が受けた量）を足す
  - `castleDamaged` に `blocked`（城壁が受けた量）を足す。`amount` は今と同じく「与えようとしたダメージ」、`hp` は城壁で減らしたあとの値
- イベントの順番
  - 進軍：1体ずつ「毒のダメージ →（凍結なら休んで `statusCleared`）→ 動く …」。毒で消えたら、その兵士は動かない
  - 城壁はターンの始め（`turnStarted` のあと、ドローの前）に `armorExpired`

## STEP 3：魔物とコイン

**数値はすべて仮**（`data/monsters.json`・`data/upgrades.json`・`data/rules.json`）。

### 魔物
- 魔物の種類は `data/monsters.json`（キーが魔物の種類）。Game は `new Game({ cards, rules, rng, monsters, upgrades })` で受け取る（ファイルは読まない）。`monsters` を渡さなければ魔物は出ない（STEP 1・2 のまま）
- **周回（`round`）**：席順の最初の人（まだ負けていない人）のターンが始まるたびに1増える（1から）。`getState().round`
- **出現**：`rules.monsterFirstRound`（仮：3）周目から、周回の始めに、魔物がいない道ごとに `rules.monsterSpawnChance`（仮：0.35）の確率で1体出る。種類は `monsters.json` の `weight` の重みでランダム
  - 出る場所は道の真ん中のマス（道のマス番号 `floor(laneLength / 2)`。**道3マス（#18）なら1**）。1本の道に1体まで（2人なら道は1本なので1体まで）
  - 出るとき真ん中のマスに兵士がいても出る（その兵士は次の進軍で、そのマスで魔物と戦う）
- 魔物を倒した道には、`rules.monsterCooldownRounds`（仮：2）周のあいだ次の魔物が出ない（魔物が道をふさぎ続けて、兵士が城に届かなくならないように）
- `monsterSpawnChance` が 0 のときは乱数を使わない（魔物を渡しても渡さなくても、同じシードなら山札の並びは同じ）
- **兵士と魔物**：兵士は進軍で、相手の兵士と同じように「同じマスか1つ先のマス」に魔物がいたら止まって戦う（お互いに攻撃力ぶんを同時に与える。属性も効く）。**倒すまで先へは進めない**
  - 1マスごとに、相手の兵士 → 魔物 の順に確かめる
  - **道3マスでの止まり方**：真ん中（マス1）は、兵士を出すマス（自分の城の前、マス0）の1つ先。なので魔物がいる間、兵士は出したマスから動かず、進軍のたびにその場で魔物と戦う。真ん中より先（相手の城の前のマス）にいる兵士は、魔物に止められずそのまま城へ進む
  - 魔物がいる間は、自分の兵士と相手の兵士は真ん中をはさんで2マス離れているので、ぶつからない（魔物が壁になる）
  - 戦うのは進軍している側のターンだけ。魔物から兵士を攻めることはない
- **魔法**：ファイアボール（`damageEnemyCastle`）は、自分の道（自分が両はしのどちらか）の魔物も対象にできる（`{ monsterId }`）。サンダー・毒・凍結は魔物には効かない
- **とどめボーナス**：魔物のHPを0にした人（兵士の持ち主か、魔法を使った人）が、その魔物の `reward` だけコインをもらう
- **放置すると城を攻める**：魔物は出てから `attackEvery` 周ごとに、周回の始めに、その道の両はしの2人のうちランダムな1人の城に `castleAttack` ダメージ
  - **魔物の攻撃で城HPが0以下になってもよい**（レビューで決めた）。2人のときは、落とされた方の負け（相手の勝ち）。3人以上のときの扱いは STEP 5 で決める。城壁は効かない
  - 城が落ちたら、そこでゲームを止める（残りの魔物の攻撃・魔物の出現・ドロー・進軍はしない）
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
| `goblin` | ゴブリン | 7 | 3 | 風 | 3 | 2周ごとに城へ3 | 3 |
| `dragon` | ドラゴン | 12 | 5 | 火 | 6 | 2周ごとに城へ5 | 1 |

- 強い魔物ほどごほうびが多いが、倒しに行った兵士がやられやすい（大きな見返りには大きなリスク）

### 追加の魔物・強化（STEP 3 の続き・仮）
データだけで足した（ルール・イベントの変更なし）。**数値はすべて仮**。

| type | 名前 | HP | 攻撃 | 属性 | ごほうび | 放置したとき | 出やすさ | 長所・短所 |
|---|---|---|---|---|---|---|---|---|
| `bat` | コウモリ | 3 | 2 | なし | 1 | 2周ごとに城へ1 | 4 | すぐ倒せるが、ごほうびが少ない |
| `skeleton` | スケルトン | 6 | 3 | なし | 3 | 2周ごとに城へ2 | 3 | 属性がないので、属性の武器の強みも弱みも出ない |
| `golem` | ゴーレム | 14 | 2 | 土 | 5 | 4周ごとに城へ3 | 2 | 硬くて倒すのに時間がかかるが、城への攻撃はゆっくり |
| `demon` | デーモン | 10 | 4 | 火 | 5 | 2周ごとに城へ4 | 1 | ごほうびが多いが、倒しに行った兵士がやられやすい |

| id | 名前 | 値段 | 効果 | 回数 |
|---|---|---|---|---|
| `greatRepair` | 大修理 | 6 | 城HP+12 | 1回 |
| `greatRecruit` | 大補充 | 5 | 3枚引く | 2回 |
| `whetstone` | 名匠のとぎ石 | 7 | 兵士全員の攻撃+2 | 1回 |

- 確かめたこと：`node tests/sim/run.js --games 300` で、全組み合わせが300/300決着。smart 同士の平均50.7手番（追加前48）、smart vs random は67%
- 魔物の見た目は仮の絵。専用の絵ができたら `js/ui/art.js` を差しかえる

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
  - 周回の始め：`turnStarted` → `roundStarted` → 魔物の城への攻撃（出た順）→ `monsterAppeared`（道の順）→（STEP 2 の `armorExpired`）→ ドロー → 進軍。魔物の攻撃で城が落ちたら `monsterAttackedCastle` → `gameOver` で止まる
  - 兵士と魔物の戦い：`soldierMoved` → `monsterClashed` → `monsterDamaged` → `soldierDamaged`（兵士）→（魔物が0なら）`monsterDefeated` → `coinsChanged` →（兵士が0なら）`soldierDestroyed`
  - ファイアボールで魔物：`spellCast`（`target` は `monsterId`）→ `monsterDamaged` →（0なら）`monsterDefeated` → `coinsChanged`

## STEP 4：オンライン対戦

### しくみ
- サーバーは `server/`（Node.js 22.7 以上。**外部パッケージなし**）。Game（`js/game/`）をそのまま動かす。乱数もサーバーだけが持つ
- 起動：リポジトリのルートで `node server/server.js`（ポートは環境変数 `PORT`、省略すると 8787）。`data/` の JSON はサーバーが読み、間違っていれば起動したときにエラーで止まる
- **画面のファイル（`index.html`・`css/`・`js/`・`data/`・`assets/`）も同じサーバーが配る**。`http://localhost:8787` を開けば、画面とサーバーが同じ場所なので、画面はつなぎ先を `/api/...` と書くだけでよい
- 人数は部屋に入った人数（CPU を含めて2〜8）。**自動では始まらず、部屋主が「開始」を押して始める**（下の「部屋（ロビー）」）。`rules.playerCount` はオンラインでは使わない
- 通信は HTTP だけ（WebSocket は使わない。外部パッケージなしで作れて、ブラウザでもそのまま使えるため）
  - ブラウザ → サーバー：`fetch` で `POST`（JSON）
  - サーバー → ブラウザ：Server-Sent Events（`EventSource` で受け取る）
- **合言葉で部屋に入る**：同じ合言葉を入れた人が同じ部屋に入る（最大8人）。入った順に `p1`、`p2` …
- 見えてはいけない情報は、サーバーが `js/game/visibility.js` の決まりでプレイヤーごとに隠してから送る（Game はそのまま）

### 送るもの（ブラウザ → サーバー）
| URL | 送る JSON | 返る JSON |
|---|---|---|
| `POST /api/join` | `{ passphrase, name }` … 合言葉（1〜32文字）と表示名（1〜16文字） | `{ ok: true, roomId, playerId, token }` か `{ ok: false, reason }`。`token` はその人だけの鍵（以後ずっと使う） |
| `POST /api/action` | `{ token, method, args }` … `method` は試合の操作 `playCard` / `discard` / `endTurn` / `buyUpgrade` / `fuse` / `defend` / `passDefense` と、部屋の操作 `start` / `setRules` / `setSeat` / `addCpu` / `removeCpu` / `backToRoom` / `rematch` / `surrender` / `leave` のどれか（部屋の操作は自分の番でなくても送れる。`defend`・`passDefense` は攻撃を受ける人だけが送れる。部屋の操作の中身は下の「部屋（ロビー）」）。`args` は Game のメソッドに渡す引数の配列（例：`["c07", { "playerId": "p2" }]`） | Game のメソッドの返り値（`{ ok }` / `{ ok: false, reason }`）。自分の番でない人の操作は `{ ok: false, reason: "あなたの番ではありません" }` |

- `rematch`：人が全員送ったら（CPU は送らない）、同じ部屋・同じ席・同じ設定で新しい試合が始まる（負けた人もすぐ「もう1回」できるように）

### 届くもの（サーバー → ブラウザ）
`GET /api/stream?token=...` を `EventSource` で開く。メッセージは JSON で、`type` で分かれる。

| `type` | 中身 | いつ |
|---|---|---|
| `room` | `{ roomId, you, hostId, players: [{ playerId, name, connected, left, cpu, castle, deck }], capacity, minPlayers, started, settings, choices, rematchVotes }` … `you` は受け取った人の今の `playerId`（始まる前に誰かが出ると席が詰まって変わる。自分が出たときは `null`）。`hostId` は部屋主。`left` は試合中に自分から部屋を出たか。`cpu` は CPU の強さ（人なら `null`。CPU の `connected` はいつも `true`）。`castle` / `deck` は席の城・デッキ。`settings` は `{ winCondition, deckMode }`。`choices` は選べるもの `{ winConditions, deckModes, castles, decks, cpuLevels }`（どれも `[{ id, name }]`）。`rematchVotes` は「もう1回」を送った人のIDの配列（新しい試合が始まると空に戻る） | 入ったとき・誰かが入った／抜けたとき・設定が変わったとき・始まったとき |
| `event` | `{ event, payload }` … Game のイベント（「Gameが出すイベント」の表）を、その人向けに隠したもの | 起きた順に |
| `state` | `{ state, playable, upgrades }` … `state` は `getState(自分)`。`playable` は自分の手札の各カードの `{ cardId, ok, reason, needsTarget, targets }`（自分の番でないときは全部 `ok: false`）。`upgrades` は `{ upgradeId: { ok, reason } }` | 操作のたび（その操作のイベントを全部送ったあと）・つないだとき |

- つなぎ直したとき（`EventSource` は自動でつなぎ直す）は、`room` と `state` が届くので、それで画面を描き直す
- 試合の途中でつなぎ直した人は、それまでのイベントを受け取れない（`state` は届く）。画面は `state` から描けるようにする
- `token` は URL に入る（`EventSource` の決まり）。サーバーのアクセスログに残ることがあるので、ログを人に見せない
- 表示名（`name`）は人が入れた文字列そのまま。画面では `textContent` で出す（HTML として入れない）
- エラーの返事：壊れた JSON は 400、大きすぎる本文（16KB 超）は 413、知らない token は 403。どれも `{ ok: false, reason }`
- 手札にないカードを出そうとしたときの理由は、相手の手札にあるかどうかにかかわらず「そのカードは手札にありません」（文の違いから相手の手札が分からないように）
- 始まる前に全員が帰った部屋（30秒だれもつないでいない）は、次に同じ合言葉で入った人のために作り直す。30分だれもつないでいない部屋は消す。部屋は全部で1000まで
- **試合中に相手が抜けたとき**（決めた）
  - 接続が切れただけなら、**自動では決着しない**（待つ時間の上限はない）。残った人には「接続が切れています。戻るのを待っています…」と「やめる」ボタンを出す。「やめる」は部屋を出てタイトルへ戻る（勝ち負けはつかない）
  - ページを読み直した・閉じて開き直した人は、同じタブなら元の部屋につなぎ直す（画面が `token` を `sessionStorage` に覚えておく）
  - **自分から部屋を出る**（`leave`。「タイトルへ戻る」を押したとき）：もう戻れない。残った人には `room` の `players[].left` で伝わり、「○○さんが部屋を出ました」と出る。出た人がいる部屋では「もう1回」はできず、同じ合言葉で入ると新しい部屋になる
  - **降参**（`surrender`。メニューから、確認のため2回押す）：自分の番でなくてもできる。城が2つなら相手の勝ちで終わる（`gameOver` の `reason` は `"surrender"`）。3つ以上なら城が壊れて抜け、残りの試合を見守る（「MP・武器の加算・魔物の成長・降参の観戦」の節）
- 画面は、イベントで演出し、`state` で答え合わせをする（同じ端末のときと同じ）。出せない理由は `playable` を使う（ブラウザに Game はない）

### 部屋（ロビー）（人間に確認して決めた）
「8人がそろわないと始まらない」のではなく、**8人まで入れる部屋で、好きなときに始める**。足りなければ CPU を足せる。

- **部屋主**：最初に入った人。部屋主が出たら、残っている人のうちいちばん前の席の人が部屋主になる（CPU はなれない）
- **始まる前**（`started: false`）
  - `start`：部屋主だけ。CPU を含めて `minPlayers`（2）人以上で始まる。始まったら、その部屋には入れない
  - `setRules`、`args: [{ winCondition?, deckMode?, teams? }]`：部屋主だけ。勝ち方（`"firstDestroy"`：最初に城を落とした人の勝ち／`"lastStanding"`：バトルロイヤル）と山札（`"shared"`：共通の山札／`"own"`：1人1つのデッキ）とチームの分け方（`"off"`：個人戦／`"auto"`：自動で2チーム／`"choose"`：各自で選ぶ。下の「チーム」）
  - `setSeat`、`args: [{ castle?, deck?, team? }, playerId?]`：席の城の種類・デッキ（`castles.json` / `decks.json` のキー）・チーム（`"t1"`〜`"t4"`。各自で選ぶときに使う）。自分の席は自分で、CPU の席は部屋主が `playerId` を付けて選ぶ。デッキは `deckMode` が `"own"` のときに使われる
  - `addCpu`、`args: [level?]`：部屋主だけ。`level` は `"easy"` / `"normal"`（省略したとき）/ `"hard"`（戦い方は `js/main.js` の `CPU_LEVELS` と同じ：defensive / rush / smart）。名前は「CPU1（つよい）」など。返り値に `playerId`
  - `removeCpu`、`args: [playerId]`：部屋主だけ。CPU を外す（席が詰まる）
  - `leave`：始まる前に出た人は席ごと消え、うしろの席が詰まる（`playerId` が変わるので、画面は `room` の `you` を見る）。人が全員出たら CPU も消える
- **試合中・試合のあと**
  - CPU は、サーバーが `js/game/strategies.js` の戦い方で動かす（自分の手札しか見ない）。1手ごとに少し間をおく（`createGameServer({ cpuDelayMs })`、省略すると 700ミリ秒）。人の番・人の防御になったら止まって待つ。CPU が攻めて人が防御を選ぶあいだも待つ
  - `backToRoom`：試合が終わったあと、部屋主だけ。始まる前の状態に戻る（設定を変えたり、人が入ったりできる）。試合中に出た人の席は、ここで消える（出た人がいても、部屋に戻せばまた遊べる）
- 試合の `rules` は `data/rules.json` に、部屋の人数（`playerCount`）と `settings` を上書きしたもの。城への魔法は `castleSpellRange`（今は `"any"`：誰にでも）のまま
- **チーム**（人間に確認して決めた。ルールは STEP 5 の「チーム戦」）
  - `"auto"`：始めるたびに、席をシャッフルして2チームに半分ずつ分ける（奇数ならチームAが1人少ない）。「もう1回」でも分け直す
  - `"choose"`：各自が `setSeat` でチームを選ぶ（入った順に A・B・A・B … で始まる）。CPU のチームは部屋主が選ぶ。チームは4つまで（A〜D）、1チーム7人まで。2チーム以上に分かれていないと始められない
  - `room` の `players[].team`：始まる前は各自で選んだチーム、試合中・試合のあとはその試合のチーム（個人戦なら `null`）。`choices.teamModes` / `choices.teams`（`[{ id, name }]`。名前は チームA〜D）
- 広場（3人以上）・チーム戦は、STEP 5 のルールのとおり（部屋が `rules.json` と `setup.teams` を渡すだけ）

### 隠す情報（`js/game/visibility.js`）
| イベント | 本人以外に送るとき |
|---|---|
| `cardDrawn` | `cardIds` を消し、`count`（枚数）だけにする |
| `cardDiscarded` | `cardIds` はそのまま（捨てたカードは表向き）。種類は `state` の捨て札には出ない |
| `cardPlayed` | そのまま |

- `getState(自分)` は、相手の手札を `null` にしている（STEP 1 のとおり）
- 山札の順番・乱数は送らない

## STEP 5：拡張（最大8人・デッキ対戦・城の種類・勝利条件）

> **注意（#16 のレビューで決めたこと）**：3人以上のルール（道のつなぎ方・勝ち方・魔物の扱い）は、まだ決めていない。この STEP 5 の「人数」「勝利条件」に書いた**輪（となりどうし）の道と、3人以上の勝ち方は試作**で、STEP 5 で実際に遊んでから「全体の設計」の「3人以上のルールの案」（真ん中に広場・チーム戦）に合わせて作り直す。2人のときの遊び方（城の種類・デッキ対戦を含む）は、ここに書いたとおり。

**数値はすべて仮**。設定はすべて `data/`（`rules.json`・`castles.json`・`decks.json`）で切り替える。

### 人数
- `rules.playerCount`：2〜8（省略すると2）。席順に `p1`〜`p8`。道は「となりの席どうし」（#16）
- 席ごとの城ボーナス：`rules.seatCastleBonus`（席ごとの数の配列、省略できる）。省略すると、2人なら `[0, secondPlayerCastleBonus]`、3人以上なら席 i（0から）に `round(secondPlayerCastleBonus × i ÷ (人数−1))`（後ろの席ほど少し多い）
- 兵士は道でつながった相手（となりの2人）にだけ送れる。ファイアボールなど城への魔法の届く相手は `rules.castleSpellRange`：`"neighbors"`（となりだけ）か `"any"`（誰にでも）。**仮：`"any"`**（シミュレーションで、勝利条件が「最初に落とした人」のとき、4人・8人とも「誰にでも」の方が席ごとの勝率の差が小さく、考える人が勝ちやすく、試合も短かった。「最後の1人」ではほとんど差がない）。サンダー・毒の霧・氷の息は、この設定にかかわらず誰の兵士にでも使える。2人ならどちらも同じ

### 真ん中の広場を通る道（`rules.roadLayout: "plaza"`。人間に確認して決めた）
3人以上のときは、輪（となりどうし）ではなく、真ん中の広場を通ってだれの城へも行ける形にする（`data/rules.json` は `"plaza"`。`"ring"` にすると今までの輪の道）。**2人のときは広場にしない**（今までどおり道が `laneCount` 本）。

```
     城A     城B
       ＼   ／
        広場（魔物）
       ／   ＼
     城D     城C
```

- **道は1本**（`laneCount` は使わず1本。レーンがあると画面がごちゃごちゃになるため）。兵士は「自分の城の前（マス0）→ 広場（真ん中のマス）→ 狙った城の前 → 城」と進む。道3マスなら2人のときと同じ歩数
- 兵士はまだ負けていない相手ならだれにでも送れる（対象 `{ playerId }`）
- **戦う相手**：**自分の方に向かってくる兵士**（相手が自分の城を狙っている）と、**自分が狙っている人の兵士**とだけ戦う。それ以外の人の兵士とは、同じマスにいても戦わずにすれちがう（例：p1→p2 と p3→p2 は戦わない。p1→p2 と p4→p1 は戦う。p1→p2 と p2→p3 は戦う）。「同じマスか1つ先のマス」で確かめるのは今までと同じで、場所は広場と各城の道で比べる。何体かいるときは、先に出された兵士と戦う
- **魔物**：広場に1体だけ（`roadId` は `"plaza"`、`square` は真ん中のマス）。どの城の兵士も、広場の手前で止まって戦う。だれでもファイアボールで狙える。倒したあとの `monsterCooldownRounds` は広場全体にかかる
  - **HP は人数に比例**：出た時点で残っている人数 ÷ 2 倍（四捨五入。2人のときの HP が基準。8人なら4倍）
  - **城への攻撃も人数に合わせる**：攻めるときは、残っている人数の半分（切り上げ）の城をランダムに選んで攻める（2人のときの「2人に1人」と同じ割合。8人なら4つの城）。ダメージは今までと同じで、同じ回に攻める城には同じダメージ
- **通り道**：`getState().roads` には、まだ負けていない2人ずつの組すべての「通り道」が入る（`roadId` は今と同じ `"p1-p3"` の形。広場で重なっている）。兵士の `roadId` は自分と狙った人の通り道。抜けた人がいると、その人への通り道は消える（`roadClosed`。そこを進んでいた兵士も消える）。新しい道はできない（`roadOpened` は出ない）
- 理由：だれの城へも同じ条件で行けるので、席の場所で有利・不利が出にくい。関係ない兵士とは戦わないので、狙われた人が守る形になり、乱戦がわかりやすい

#### ロジックとUIの約束に足すもの（広場）
- `getState().layout`：`"plaza"`（広場）か `"lanes"`（今までの道）
- 兵士の `place`：広場のときだけ、今いる場所。`{ at: "spoke", playerId, square }`（`playerId` の城から広場への道の上。`square` はその城から数えたマス）か `{ at: "plaza" }`。となりの道のときは `null`。画面は兵士をこれで置く
- 魔物の `roadId` が `"plaza"` なら広場にいる
- 確かめたこと（`node tests/sim/multi.js --games 200`）：全試合が決着。最初に落とした人の勝ち：4人は平均45手番、8人は36手番（輪の道は43・43）。バトルロイヤル：4人119手番（周回の上限で終わる21%）、8人206手番（上限で終わる30%）で、**とても長い**。8人のバトルロイヤルで smart 1人が random 7人に勝つ割合は33%（人数ぶんの1＝13%よりは高い）。長さは遊んで確かめる（短くするなら城HP・`maxRounds` を調整する）

### チーム戦（`setup.teams`。人間に確認して決めた）
- **チーム**：`new Game({ ..., setup: { teams: ["t1", "t2", "t1", "t2"] } })`（席ごとのチームID。`"t1"`〜`"t4"`）。**2〜4チーム、1チーム7人まで**（8人なら1対7もできる）。省略するとチーム戦ではない（今までどおり）
- **城はチームで1つ**。城の持ち主は、チームでいちばん前の席の人（**代表**）。盤面（道・広場・兵士を送る先・城への魔法の対象）は代表で考える。城が2つ（2チーム）なら2人のときと同じ道（`laneCount` 本）、3つ以上なら広場（`roadLayout: "plaza"` のとき）
- **城HP** ＝ 代表の城HP ＋ `rules.teamCastleHpShare`（仮：0.25）× ほかのメンバーの城HPの合計。城HPは、その人の `castleMaxHp` ＋ 自分の城の種類の `hpBonus`（席ごとの城ボーナスは使わない）。城の種類のほかの効果（城への魔法・兵士の攻撃・手札の上限）は、メンバーごとに自分が選んだ城のもの
- **城壁も共有**（城に置く）。代表の城に攻撃が来たときの防御（`defenseRequested`）を聞かれるのは代表（ほかのメンバーの手札では防御できない。仮）
- **手番**：`rules.teamTurns`。`"rotate"`（仮・決めた）：チームを順に回し、1回の手番はメンバー1人（2チームなら A1 → B1 → A2 → B2 …。チームの中は順番）。`"all"`：チームの手番でメンバー全員が順に動く。周回は、最初のチームの手番が来るたびに1増える
- **手札・兵士・コイン・精霊は1人ずつ別**。味方には兵士を送れず、城への魔法も撃てない。**味方の兵士とは戦わない**。相手チームのメンバーの兵士とは、1人のときと同じ決まりで戦う（広場なら「自分の陣地に向かってくる・自分が狙っている陣地の兵士」）
- **勝ち方**：城を落とされたチームはメンバー全員が抜ける（`playerEliminated` が1人ずつ）。`firstDestroy` は最初に城を落としたチーム、`lastStanding` は最後まで城が残ったチームの勝ち。`gameOver` に `winnerTeam` が付く（チーム戦のときだけ）
- **城の見た目**（画面）：チームの人数（`teams[t].size`）が多いほど城を豪華にする（UI担当）
- 確かめたこと（`node tests/sim/teams.js --games 200`、全員 smart）：

| 分け方 | 勝ち方 | 平均手番 | 周回の上限で決着 | チームの勝率 |
|---|---|---|---|---|
| 2対2 | 最初に落とした | 86 | 27% | 49%・51% |
| 4対4 | 最初に落とした | 107 | 60% | 48%・53% |
| 3対5 | 最初に落とした | 107 | 56% | 51%・49% |
| 1対7 | 最初に落とした | 95 | 45% | 62%（1人側）・38% |
| 2人×4チーム | 最初に落とした | 66 | 0% | 23〜27% |
| 2人×4チーム | 最後の1チーム | 159 | 56% | 22〜28% |

  - 決め方：案どおり「城HP＝人数ぶん（`teamCastleHpShare: 1`）」だと、1周で動ける回数は1人のときと同じなのに城HPだけ増えるので、4対4の98%が周回の上限で決着した。`"all"`（全員が動く）は同じ人数なら公平だが、1対7・3対5は人数が多い方が100%勝つ。0.25 は人数が違っても勝率が近く、長さもほどほど
  - **周回の上限で決着する試合がまだ多い**（2チームで3〜6割）。遊んで長ければ、チーム戦の城HP・`maxRounds` を調整する

#### ロジックとUIの約束に足すもの（チーム戦）
- `getState().teams`：`{ t1: { members: ["p1", "p3"], castleOwner: "p1", size: 2 }, … }`（チームの順）。チーム戦でなければ `null`
- `getState().winnerTeam`：勝ったチーム（チーム戦でなければ `null`）
- `players.pX.team`（チームID か `null`）・`players.pX.castleOwner`（城の持ち主。チーム戦でなければ本人）。チームのメンバーは同じ `castleHp` / `castleMaxHp` / `armor` を持つ
- 城のイベント（`castleDamaged` / `castleHealed` / `castleArmored` / `armorExpired`）の `playerId` は、代表とは限らない（回復した人・城壁を置いた人のこともある）。画面は `players[playerId].castleOwner` の城に出す
- 兵士の `targetId` は相手の城の持ち主（代表）。広場の `place` の `playerId` も城の持ち主

### 勝利条件（`rules.winCondition`）
| 値 | 勝ち方 | 城が落ちた人 |
|---|---|---|
| `"firstDestroy"`（省略したとき） | **最初にどこかの城を落とした人の勝ち**（2人なら今と同じ） | — |
| `"lastStanding"` | 最後まで城が残った1人の勝ち。**長い**（8人で平均約160手番。抜けた人は終わるまで待つ）ので少人数向け | 負けて抜ける（`playerEliminated`）。その人の兵士は消え、手札は捨て札へ。その人の道はなくなり、両どなりが新しい道でつながる（なくなった道の兵士・魔物も消える） |

- **周回の上限 `rules.maxRounds`**（仮：60。0 なら上限なし。2人の smart 同士で上限まで行くのは、全員共通の山札で約5%、デッキ対戦で1〜11%）：その周回を全員が終えても決着していなければ、城HPの残りの割合（`castleHp ÷ castleMaxHp`）がいちばん多い人の勝ち。同じなら城HPが多い人、それも同じなら席順が後ろの人（先攻有利をやわらげる）。必ず決着させるため
- `gameOver` に `reason` を足す：`"castleDestroyed"`（城を落とした）／`"lastStanding"`（最後の1人）／`"roundLimit"`（周回の上限）

### 城の種類（`data/castles.json`）
- 席ごとに城の種類を選べる：`new Game({ ..., castles, setup: { castles: ["fortress", "tower"] } })`。`setup` を省略すると全員 `rules.defaultCastle`（仮：`"standard"`）
- 城の種類ごとに：`hpBonus`（城HPと上限に足す）、`maxHandBonus`（手札の上限に足す）、`castleSpellBonus`（自分が使う城への魔法のダメージに足す）、`soldierAttackBonus`（自分が出す兵士の攻撃力に足す）。どれも省略すると0

| type | 名前 | 長所 | 短所 |
|---|---|---|---|
| `standard` | ふつうの城 | — | — |
| `fortress` | とりで | 城HP+2 | 手札の上限−2 |
| `tower` | 魔法の塔 | 城への魔法+2 | 城HP−6 |
| `barracks` | 兵舎 | 出す兵士の攻撃+1（城には×2なので+2） | 城HP−12 |

- 道3マス・兵士の城ダメージ×2（#18）に合わせて数値を直した。smart 同士で、ふつうの城に勝つ割合はどれも48〜51%（`node tests/sim/castles.js`。ヒール・ファイアボールの枚数調整のあとに直した）

### デッキ対戦（`rules.deckMode`）
- `"shared"`（省略したとき）：今と同じ、全員共通の山札
- デッキ（仮）：`balanced`（バランス）、`assault`（突撃：歩兵と武器が多い）、`siege`（籠城：盾・城壁・状態異常の魔法が多い）。smart 同士で、バランスに勝つ割合は、突撃49%・籠城49%（籠城は盾5→4枚で直した。カード1枚で10%以上動く敏感なデッキなので、変えたら必ず2000試合で確かめる）
- `"own"`：1人1つずつ山札・捨て札・使い切り置き場を持つ。中身は `data/decks.json` のデッキ（`{ name, cards: { type: 枚数 } }`）。席ごとに選ぶ：`setup: { decks: ["assault", "balanced"] }`。省略すると全員 `rules.defaultDeck`
  - `getState()`：`deckMode`。`"own"` のとき、いちばん上の `deckCount` / `discardCount` / `exhaustedCount` は viewer 本人の数（viewer がいなければ `null`）、`players.pX.deckCount` などにそれぞれの数。`"shared"` のときは `players.pX` の方が `null`
  - `deckShuffled` に `playerId`（`"own"` のとき、だれの山札か。`"shared"` のときは `null`）を足す

### ロジックとUIの約束に足すもの（STEP 5）
- `new Game({ cards, rules, rng, monsters, upgrades, castles, decks, setup })`。`castles` / `decks` / `setup` は省略できる
- `getState()`：`deckMode`、`players.pX.castleType`、`players.pX.maxHand`、`players.pX.deckCount` / `discardCount` / `exhaustedCount`（`"own"` のときだけ数）
- イベント
  - `playerEliminated`：`{ playerId, by }`（`by` は城を落とした人）
  - `roadClosed`：`{ roadId, monsterIds }` → その道の兵士の `soldierDestroyed`（`reason: "roadClosed"`）／`roadOpened`：`{ roadId, players }`
  - `gameOver`：`{ winner, reason }`
- 順番（`"lastStanding"` で城が落ちたとき）：`castleDamaged`（兵士が城に着いたときは、そのあとの `soldierDestroyed`（`"reachedCastle"`））→ `playerEliminated` → 抜けた人の兵士の `soldierDestroyed`（`"eliminated"`）→ `roadClosed` →（その道の兵士の `soldierDestroyed`（`"roadClosed"`））→ `roadOpened` →（残りが1人なら）`gameOver`

## ゴッドフィールド風の変更（人間に確認して決めた）

「ゴッドフィールドに似せる」ため、ターン進行とカードを変えた。案の全体は `docs/godfield-proposal.md`。採用したのは A1 と B1〜B5（A2・A3・B6 は採用しない）。**数値はすべて仮。**

- **A1 補充**：`rules.drawUntilHand`（省略すると 0 ＝ 今までどおり）。0 より大きいと、毎ターンのドローは「手札がその枚数になるまで」（`drawPerTurn` は最低枚数）。仮：5
- カード（`data/cards.json`。説明文は `description` に書いてある）

| 名前（type） | 種類 | 効果 | 長所 | 短所 | 枚数 |
|---|---|---|---|---|---|
| 反射（`reflect`） | 防御（`reflectSpell`） | 城に魔法（ファイアボール・隕石）を撃たれたとき、相手の城に返す | 大ダメージを逆手に取れる | 魔法にしか使えない。自分のターンには出せない | 2 |
| 身代わり（`decoy`） | 防御（`nullifySoldier`）・使い切り | 城に着いた兵士1体のダメージを無効にする（兵士は消える） | 城への一撃を確実に止める | 魔法には使えない。使い切り | 2 |
| 天の恵み（`blessing`） | 魔法（`redrawHand`） | 手札を全部捨てて、同じ枚数を引き直す | 手札事故を直せる | 何も攻めない。メインを使う | 2 |
| 神頼み（`prayer`） | 魔法（`randomEffect`） | 山札の上の1枚をタダで出す（対象は出せる中からランダム。出せないカードは捨てるだけ） | 当たれば逆転 | 外れもある。メインを使う | 2 |
| 盗賊（`thief`） | 魔法（`stealCard`）・使い切り | 相手の手札から1枚ランダムに奪う | 切り札を奪える | 相手に手札がないと出せない。使い切り | 2 |

- 反射・身代わりは、`rules.defenseReaction` が `true` のときの「攻撃を受けたとき」にだけ出せる（`defend()`）。出すと防御はそこで終わり、攻撃は反射／無効になる。自分のターンに `canPlayCard` で調べると「攻撃を受けたときにだけ使えます」
- 神頼みでタダで出したカードの `cardPlayed` には `free: true` が付く。盗賊で奪ったカードの ID は `cardStolen` で全員に見えるが、種類は奪った本人にしか見えない
- 確かめたこと（`node tests/sim/run.js --games 300` / `--games 400`）：全組み合わせが決着。smart 同士は平均62手番、CPU の強さの順は変わらない（先攻のとき random に勝つ割合：rush 16%・defensive 41%・smart 61%）。CPU の `smart`（`guard` も）は新カードを使う：反射・身代わりは城壁より先に出す。ほかに出すものがないとき、相手の手札が3枚以上なら盗賊、自分の手札が4枚以上なら天の恵み、最後に神頼み（先攻のとき random に勝つ割合は smart 78%）
- 画面（人間に確認して、同じ変更で入れた）：新カードの仮の絵（`js/ui/art.js`）、`spellReflected` / `soldierDecoyed` / `cardStolen` の演出と、神頼み（`cardPlayed` の `free: true`）の扱い（`js/ui/Animations.js`）、反射・身代わりの説明（`js/ui/text.js`）。出せるカードを光らせるのは、防御カード全般と同じしくみ（`canDefend`）。専用の絵ができたら `art.js` を差しかえる。UI 担当のレビューを受けること

### 魔法カードの追加（「魔法カード増やして」）
既存の `effect` だけで4種を足した（ルール・イベントの変更なし）。**数値はすべて仮**。

| 名前（type） | 効果 | 長所 | 短所 | 枚数 |
|---|---|---|---|---|
| 小回復（`minorHeal`） | 自分の城HP+5 | 使い切りでないので何度も使える | ヒール（10）の半分 | 2 |
| 毒の雨（`toxicRain`） | 選んだ1レーンの相手の兵士に毒（1×6回） | 毒の霧（4）より合計が大きい（6） | 1レーンだけ。効くのが遅い | 2 |
| 氷河（`glacier`） | 選んだ1レーンの相手の兵士を3回休ませる | 氷の息（1回）より長く止められる | 1レーンだけ・使い切り | 2 |
| 雷光（`bolt`） | 相手の全レーンの兵士に2ダメージ | 使い切りでなく、全レーンに届く | サンダー（3）より弱い | 3 |

- 防御側が増えて試合が長くなったので、城壁・土嚢・毒の霧・氷の息を各4→3枚に減らした（山札は86枚。攻撃側39・防御側47で、「半々」からは防御に寄っている。遊んで確かめる）
- 確かめたこと（`node tests/sim/run.js --games 400`）：全組み合わせが決着。smart 同士は平均64手番（追加前は58〜62）。CPU の強さの順は変わらない（先攻のとき random に勝つ割合：rush 8%・defensive 38%・smart 75%）。**試合は少し長くなった**ので、遊んで確かめる
- 見た目は仮の絵（`js/ui/art.js`）

### 精霊カード（人間に確認して決めた）
基本4属性（火・水・風・土）それぞれに「精霊」と「大精霊」を作った。**数値はすべて仮**。`kind: "spell"`・`effect: "summonSpirit"`、`spirit` に種類、`amount` と `turns`（続くターン数）を書く（`data/cards.json`）。

- **1人1体まで**（複数枚で強くなりすぎないように、1種類だけ選ぶ形）。新しく呼ぶと、今の精霊と入れ替わる（`spiritEnded` の `reason: "replaced"`）。同じカードの精霊が来ているときは呼べない（「同じ精霊がもう来ています」）
- **呼んだターンは効かない。** 次の自分のターンから `turns` 回効き、自分のターンの終わりに残りが1つ減り、0で消える。`getState().players.pX.spirit` は `{ type, spirit, amount, turns, targetId }` か `null`
- 「ここでの火・水・風・土」は精霊カードだけの属性。**兵士同士の戦いの属性も、火・水・風・土の4つにした**（精霊の風・土とは別の仕組みで、効き方は関係ない）

| 種類 | 精霊（枚数2） | 大精霊（使い切り・枚数1） | 効き方 |
|---|---|---|---|
| 火 | 3ダメージ×3ターン | 5×3 | 自分のターンの始めに、選んだ相手の城にダメージ（城壁は受ける。防御は聞かない） |
| 水 | +2×4ターン | +3×4 | 自分のターンの始めに、自分の城を回復 |
| 風 | 速さ最低2・3ターン | 最低3・3ターン | 自分の兵士の速さが、最低でもその値になる |
| 土 | -1・3ターン | -2・3ターン | 自分の城と兵士が受けるダメージ（城・兵士同士の戦い・魔法・魔物）が軽くなる。ただし最低1（毒は軽くならない） |

- 長所と短所：火・水は少しずつ効くので、すぐには効かず、入れ替えられると無駄になる。風は兵士がいないと意味がない。土はダメージを0にはできない。大精霊は強いが使い切り・1枚だけ
- CPU（`smart` 系）は、精霊が来ていなければ呼ぶ（大精霊は城HPが半分を切ったときだけ）
- 確かめたこと（`node tests/sim/run.js --games 400`）：全組み合わせが決着。smart 同士は平均65手番、CPU の強さの順は変わらない（先攻のとき random に勝つ割合：rush 7%・defensive 25%・smart 64%）。精霊を足して、random に勝つ割合は下がった（random も精霊を出すため）。**試合の長さと迷う場面は、遊んで確かめる**
- 画面：城のそばに「💧 あと4」のバッジを出す（`js/ui/Renderer.js`）。絵は仮（`js/ui/art.js`）

### 戦いの属性を4つにした（木 → 風・土）
人間の指示で、兵士同士の戦いの属性を 火・水・風・土 の4つにした（木はなくした）。**強弱の組み合わせは仮。**

- 強弱：（昔は水→火→風→土→水の輪だったが、のちに「属性を10種にした」の図に変えた。そちらが最新）
- 武器：木の斧をやめて、風の弓（`windBow`）と土の槌（`earthHammer`）にした（各1枚。武器は炎の剣・水の槍・風の弓・土の槌 各1と鉄の剣1）。魔物は、ゴブリンを風、ゴーレムを土にした
- デッキ（`data/decks.json`）：木の斧を風の弓に置きかえた（土の槌は入れていない）
- 確かめたこと：`node --test` は全部通る。`node tests/sim/run.js --games 400` は全組み合わせが決着し、CPU の強さの順は変わらない。デッキ対戦の勝率は、いったん突撃61%・籠城58%（A1 の5枚補充から）とずれていたが、下の「デッキ対戦の再調整」で直した
- 画面：属性のアイコン・武器の絵・説明文を風・土に直した（`js/ui/look.js`・`art.js`・`text.js`）。絵は仮

### 属性を10種にした（火水風土氷雷闇光無混沌）。固定+2は乗算に変えた。相性は人間の図に合わせて直した（人間の指示：図に合わせて 有利1.5・不利0.75、混沌は基本相性なし。仮）
- 属性：火・水・風・土・氷（`ice`）・雷（`thunder`）・闇（`dark`）・光（`light`）・無（属性なし。`element` を書かない／`null`）・混沌（`chaos`）。今の火水風土はそのまま。精霊（`SPIRIT_KINDS`）は火水風土のまま別扱い
- 相性（`data/elements.json`。「A→B」＝AはBに有利）：水→火、火→氷、氷→水、風→火、水→土、土→雷、土→風、雷→水、光⇄闇（互いに有利）。**混沌・無は基本相性なし**（混沌は後で「反応」の仕組みに使う予定。属性としては残す）。書いていない組み合わせは1.0。不利は逆向きの矢印（相手が自分に有利を取れる組み合わせ。例：火は水と風に不利、氷は火に不利）。光闇は互いに有利だけで不利は出ない
- 書き方：`multipliers`（`advantage` 1.5・`disadvantage` 0.75）と、`elements` の各属性に `name`・`beats`（有利を取れる相手）。**不利は `beats` の逆向きから決まる**（JSONの二重管理をしない）。`weakAgainst`（その相手を攻撃すると不利になる）は、`beats` から出ない不利を足したいときの任意キー（今のデータでは使わない）。JSON を直すだけで相性を変えられる。検証は `validateElements()`（`js/game/Elements.js`）。`new Game({ elements })` は省略でき、省略すると組み込みの `DEFAULT_ELEMENTS`（`data/elements.json` と同じ中身）
- ダメージの順番（`Game.fightDamage`の1か所だけ）：基本の攻撃力（背水・夜を含む）→ ×属性倍率（**切り上げ**。結果は最低1）→ ＋天候の属性ボーナス → ステージ倍率。城に着く兵士・魔法には属性補正を入れない（今まで通り）
- **`rules.elementBonus`（有利なら+2）は使わなくなった**（`data/rules.json` から消した。書いても効かない）
- 画面：新属性の色・アイコン・説明は仮（`js/ui/look.js`・`art.js` の仮の SVG・`HelpView.js`）。氷・雷・闇・光・混沌の武器と魔法は作った（「闇・光・混沌のカードを足した」の節）。氷・雷・闇・光・混沌の魔物・ステージはまだ作っていない（データは足していない）
- 確かめたこと：`node --test` 全部通る（`tests/elements.test.js`）。`node tests/sim/run.js --games 200 --match smart,smart`：平均42.3手番・p1 勝率47%（固定+2のときは42.6・46%）

### デッキ対戦の再調整（`data/decks.json`）
`node tests/sim/castles.js --games 800`（smart 同士、席を入れかえ）で、バランスに勝つ割合が 突撃59%・籠城66% だったので、データだけ直した（仮）。
- 籠城：防御を減らした（盾5→3、大盾2→0、城壁2→1、凍結系を減らす）。防御を厚くするほど勝率が上がったので、強みを残しつつ減らした。山札は38→30枚
- 突撃：隕石を外し、騎士3→2・歩兵6→7
- 結果：バランス51%・突撃54%・籠城49%（平均手番44〜49）。突撃はまだ目安（49〜52%）よりやや高い。**遊んで確かめる**

## 兵士を4系統×5レアリティにした（人間に確認して決めた）

兵士は **普通の兵士・騎兵・弓兵・魔法使い** の4系統で、それぞれコモン〜レジェンドの5段階（合計20体）。合成は同じ系統の1つ上へ。今までの兵士6種は組み込んだ（歩兵・槍兵・重装兵・巨人・勇者は普通の兵士、騎士は騎兵）。**数値はすべて仮。**

| 系統 | コモン | アンコモン | レア | エピック | レジェンド | 特徴 |
|---|---|---|---|---|---|---|
| 普通の兵士 | 歩兵 5/5/2 | 槍兵 4/7/2 | 重装兵 11/6/2 | 巨人 13/9/2 | 勇者 16/12/3 | 進んで城を攻める。基準 |
| 騎兵 | 斥候騎兵 3/4/4 | 騎兵 4/5/4 | 騎士 5/7/5 | 聖騎士 8/8/5 | 竜騎士 10/10/5 | 速い（1〜2ターンで城）。打たれ弱く、攻撃は少し低い |
| 弓兵 | 見習い弓兵 3/3 | 弓兵 4/5 | 長弓兵 5/7 | 狙撃手 6/9 | 天弓の射手 8/12 | 動かずに撃つ（下） |
| 魔法使い | 見習い魔法使い 3/2 | 魔法使い 3/4 | 魔導士 4/6 | 大魔導士 5/8 | 賢者 7/11 | 動かずに撃つ。撃つ相手がいなければ城を撃つ（下） |

（HP/攻撃/速さ。弓兵・魔法使いは HP/攻撃）

- **道を5マスにした**（`rules.laneLength: 5`。人間の指示）：3マスだと速さ3で1ターンで城に着き、騎兵の「速い」が出せなかったため。真ん中（魔物・広場）はマス2。普通の兵士は速さ2（勇者は3）で、城まで2〜3ターン
- **城HPを70 → 60にした**：道が長くなって試合が延びた（smart 同士 平均71手番・周回の上限で決着17%）ので、前の指示「60手番くらい」に合わせた（60で平均59手番・上限8%。55は54手番、65は67手番）
- **弓兵・魔法使い**（`role: "archer"` / `"mage"`、`range`（撃てる距離）、`stay`（残るターン数）。`speed` は書かない）
  - 出したマス（自分の城の前）から**動かない**。出した次の自分のターンから、進軍のときに撃つ
  - 自分のマスから `range`（2）マス先までの、**戦う相手の兵士**（ほかの兵士がぶつかって戦う相手と同じ決まり）のうち、いちばん近い1体（同じなら先に出された方）を撃つ。**反撃は受けない**。ダメージは攻撃力（属性も効く。盾が先に受ける）
  - 相手の兵士がいなければ、射程の中の**魔物**を撃つ（とどめを刺せばごほうび）
  - **魔法使いだけ**は、兵士も魔物もいなければ、**狙った相手の城**に攻撃力ぶんのダメージ（城壁は受ける。防御は聞かない）
  - **2ターンで帰る**（自分のターンごとに1減る。撃つ相手がいない・凍っているときも減る）。帰るときは `soldierDestroyed`（`"returned"`）
  - **守りにも使える**：道の上にいるので、向かってくる兵士はふつうにぶつかって戦う（そのときは同時に攻撃し合う）
- `getState()` の兵士に `role`（`"melee"` / `"archer"` / `"mage"`）・`range`・`turnsLeft`（弓兵・魔法使いの残りターン。ほかは `null`）を足した
- 排出の重み（`weight`）：コモン1・アンコモン0.75・レア以上0.5（兵士の割合が少し増えた）
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均59手番・p1 勝率51%・周回の上限で決着8%。CPU の強さの順は変わらない（先攻のとき random に勝つ割合：rush 41%・defensive 18%・smart 97%）。3人以上（`multi.js`）・チーム戦（`teams.js`）もほぼ前と同じ
- 画面（UI担当）：新しい兵士14体のカードの絵と盤面の絵、`soldierShot` の演出（矢・魔法弾）、5マスの道、弓兵・魔法使いの残りターンの表示

## カードのレアリティと合成（人間に確認して決めた）

レアリティは コモン（`common`）・アンコモン（`uncommon`）・レア（`rare`）・エピック（`epic`）・レジェンド（`legendary`）の5段階（`data/rarities.json`。キーの並びが低い順）。**数値はすべて仮。**

- **試合の中で合成する**：手札の**同じ種類**のカード2枚 → 1つ上のレアリティの**別のカード**1枚（`game.fuse()`）。使った2枚はゲームから消える（山札・捨て札には戻らない）。メインの1枚には数えず、何回でもできる（手札が減ることがコスト）。レジェンドはこれ以上合成できない
- **カードの書き方**（`data/cards.json`）：`rarity`、`fuseTo`（合成してできるカード種類。1つ上のレアリティのカードだけ。レジェンドは書かない）、`weight`（同じレアリティの中での出やすさ。省略すると1）。レアリティごとに別のカードなので、数値も効果もカードごとに決める（上位互換にしすぎない）
- **系統**（`fuseTo` でつながる5段階。2つの系統が途中で合流してもよい）：兵士（歩兵→重装兵→騎士→巨人→勇者）／城攻め（ファイアボール→業火→隕石→星降り→終末の炎）／対兵士（雷光→サンダー→大雷→雷神の怒り→天罰）／回復（小回復→ヒール→大回復→聖なる光→女神の祝福）／毒・氷・武器・盾・城壁・精霊・特殊（神頼み→天の恵み→盗賊→身代わり→反射）
- **排出率**：`rarities.json` の `dropRate`（%、合計100）が、レアリティごとの出る割合（仮：50 / 28 / 14 / 6 / 2）。カードごとの排出率は、そのレアリティの割合を `weight` で分けたもの（`dropRates()` in `js/game/Setup.js`）
- **山札**：`new Game({ rarities })` を渡すと、全員共通の山札は `rules.deckSize`（仮：100）枚を排出率で引き当てて作る（乱数は `rng`。試合ごとに中身が変わる）。`rarities` を渡さないときは今までどおり `count` 枚ずつ（テストの固定データ用。デッキ対戦 `deckMode: "own"` は `decks.json` のまま）
- CPU：`smart` 系は、ターンの最初に手札の同じカードを合成する
- 城HP：上限を **40**、先攻・後攻とも同じ（`secondPlayerCastleBonus` は 0）にした（人間の指示。いったん100にしたが長すぎたので40に決めた）。`node tests/sim/run.js --games 200 --match smart,smart`：城HP 40 で平均61手番・周回上限で終わる試合は5.5%（100 だと平均110手番・上限で終わるのが60%）。遊んで長ければ下げる
- 画面（UI担当）：レアリティの色・名前の表示と、合成の操作は未実装（`rarities.json` の `color` を使える）。ひとりで遊ぶ・同じ端末のときに `rarities` を渡すのも `js/main.js` 側。オンラインは `POST /api/action` の `method` に `fuse` を足した

### 適応（どのカードとでも合成できるカード。人間に確認して決めた）
- `adapt`（適応。`kind: "spell"`・`effect: "wild"`・**スペシャル**・`weight` 1）。**手札のどのカードとも合成できる**：適応＋カードX → Xを2枚合成したのと同じ結果（Xの `fuseTo`）。使った2枚（適応とX）は消える。Xがレジェンド（合成先なし）なら合成できない。**適応どうしは合成できない**
- **手札から出せない**（合成専用）。`canPlayCard` の理由は「適応は合成に使うカードです（出せません）」。手札の枠を取るのが短所
- `cards.json`：`fuseTo` は書かない（書くと起動時に例外）。`cardsFused` の `from` は、合成の相手になったカード（Xの種類）
- CPU（`smart` 系）：同じ種類の組を先に合成し、残った適応は、合成先のある中でいちばんレアリティの高いカードと合成する
- **スペシャル**（`rarities.json` の `special`。`special: true`）：合成・ラッキーの「1つ上」の並びに入らない別枠のレアリティ。色は虹色（`color` は仮に紫、画面は虹色のグラデーション）。**排出率は今までと同じ**にした（適応は約0.82%。レアを 14 → 13.18、スペシャル 0.82）。スペシャルのカードに `fuseTo` は書けない。魔物のごほうび・ラッキーには出ない
- 画面：虹色のカード（`css/rarity-fx.css` の `.wild`・`data-rarity=special`。枠の絵はレアの枠を色相で回して使う。専用の枠の絵ができたら `cardFrame.js` を直す）と虹色の仮の絵（`js/ui/art.js`）。合成の画面に「適応 ＋ ○○」の組を出す。専用の絵ができたら差しかえる

### 使い切りをなくし、兵士を強くした（人間の指示）
- 全カードの `exhaust` を外した（使ったカードは捨て札に行き、山札に戻る）。回復・城壁が何度も使えて決着しにくくなった（周回上限で終わる試合：約5.5% → 約18.7%）ので、**兵士を強くして攻めが報われるようにした**（`node tests/sim` 相当、smart 同士300試合）
- 兵士（仮）：攻撃 +2（歩兵5・槍兵6・重装兵4・騎士7・巨人7・勇者10）、速さ：歩兵2→3、重装兵1→2、巨人1→2（槍兵・騎士・勇者は変えない）。HP は変えない
- 確かめたこと：smart 同士の平均44手番（強化前63）、周回上限で終わる試合 5.7%、p1 勝率52%。smart vs random は 71%（変わらず）。試して選ばなかった案：攻撃+1だけ（上限で終わる10.7%）、攻撃+2だけ（9.7%）、攻撃+3（4.7%・平均41手番で、攻撃が強すぎる）
- 注意：歩兵の速さが騎士と同じ3になり、歩兵は「1回で城に着く」。歩兵と騎士の差は HP（5 と 4）と攻撃（5 と 7）だけ。**遊んで、歩兵が強すぎないか確かめる**。試合は短くなった（44手番）ので、10分前後の目安に対して短すぎないかも遊んで確かめる

### 城HPを70にした（人間の指示：60手番くらいを目安）
兵士・コイン強化で試合が短くなった（平均31手番）ので、城HP上限を 40 → **70**（先攻・後攻とも同じ）にした。`node tests/sim/run.js --match smart,smart`（smart 同士）：HP50＝平均43手番、60＝52、65＝56、**70＝62（周回上限で終わる10.6%）**、80＝70（13.7%）、100＝84（25.7%）。先攻勝率は49〜53%。上限で終わる試合が1割あるので、長ければ65に下げる

### コインで兵士を強化しまくれるようにした（人間の指示）
終盤は魔物が強くなる想定なので、コインで軍を育てられるようにした（`upgrades.json`。数値はすべて仮）。
- **訓練**（`effect: "trainArmy"`、`amount`）：いる兵士と、**これから出す兵士**の攻撃力が、ずっと +amount（とぎ石は今いる兵士だけだった）。訓練 +1（3コイン・3回まで）・猛特訓 +3（10コイン・1回まで）
- **鍛錬**（`effect: "fortifyArmy"`）：同じく HP が +amount。鍛錬 +1（3コイン・3回まで）・超鍛錬 +3（10コイン・1回まで）
- `getState().players.pX.armyAttack` / `armyHp`（今までに買った合計）。`soldierBuffed` に、鍛錬のときは `hp` も付く。CPU（`smart` 系）は、とぎ石の次に買う
- 回数の上限は、最初10/5/10/5回だったが、3/1/3/1回に減らした（人間の指示）。ただし上限を変えても平均手番はほとんど変わらない（10/5/10/5：29.9、5/2/5/2：30.2、3/1/3/1：30.8、1/1/1/1：33.8）。コインが足りなくて、そもそも上限まで買えないため。長さを変えるには、コストかコインの入手量を動かす
- 確かめたこと（`node tests/sim/run.js --games 400`）：smart 同士は平均31手番・周回上限で終わる試合は0.7%（強化前は42手番）。**試合が短くなりすぎた**。先攻のとき random に勝つ割合：rush 53%・defensive 29%・smart 90%
- 注意：**「終盤にかけて魔物が強くなる」仕様は、まだ実装していない**（今の魔物は周回で変わらない）。実装するなら、先に人間に確認する

### 魔物は放置するとヤバい・倒すとドパが出る（人間の指示：重要視する）
魔物の「放置の怖さ」と「倒したときのごほうびの嬉しさ」を、この遊びの大事な要素とする。カードや数値を変えるときも、この2つが弱まっていないかを確かめる。

- **放置するほど攻撃が重くなる**：`rules.monsterAttackGrowth`（省略すると0。仮：1）。魔物が城を攻めるたびに、ダメージが `castleAttack` から +growth ずつ増える（例：スライム 2 → 3 → 4 …）。早く倒さないと城が削り殺される。`getState().monsters[].castleAttack` は「次に攻めるときのダメージ」（攻めるたびに増える）
- **ごほうびがラッキーでブレる（ガチャ感）**：`rules.rewardLuckyChance`（0〜1、省略すると0。仮：0.15）。魔物のごほうびが、この確率で**1つ上のレアリティ**になる（レジェンドの上はないので、ブレない）。`monsterDefeated` は `rewardRarity`（実際に出たレアリティ）・`baseRarity`（本来のレアリティ）・`lucky`（ラッキーだったか）を持つ。UI はこれで派手に見せる（演出は UI 担当）。確率が0のときは乱数を使わない
- **排出率が見える**：`game.getDropRates()`（読むだけ。`rarities` を渡していなければ `null`）が `{ rarities: [{ id, name, dropRate }], cards: { type: { name, rarity, rate } }, monsters: { type: { name, odds: [{ rarity, rate, lucky }] } } }` を返す。UI が「排出率を見る」画面を作れる。`dropRates()` / `rewardOdds()`（`js/game/Setup.js`）はブラウザからも読める。表で見るなら `node tests/sim/droprates.js`

### 新しい魔物を5種足した（人間の指示。仮）
データだけで足した（ルール・イベントの変更なし）。ごほうびは `rewardRarity`。

| type | 名前 | HP | 攻撃 | 属性 | ごほうび | 放置したとき | 出やすさ | 長所・短所 |
|---|---|---|---|---|---|---|---|---|
| `ghost` | ゴースト | 5 | 3 | なし | アンコモン | 2周ごとに城へ2 | 3 | 柔らかく倒しやすいが、放置するとじわじわ削る |
| `treant` | トレント | 9 | 2 | 土 | アンコモン | 3周ごとに城へ2 | 3 | 硬いがゆっくり |
| `mimic` | ミミック | 8 | 1 | なし | レア | 1/4周ごとに城へ1 | 2 | 弱いのにレアが出る当たり枠。ただし8HPあるので、倒す手間がかかる |
| `vampire` | ヴァンパイア | 11 | 4 | 水 | エピック | 2周ごとに城へ4 | 1 | 大きな見返り・大きなリスク |
| `demonKing` | 魔王 | 20 | 6 | 火 | **レジェンド** | 2周ごとに城へ6 | 1 | HP20・攻撃6で、倒すのが大変。放置すると城が大きく削れる |

- 魔物は全部で12種（コウモリ・スライム・ゴブリン・スケルトン・ゴーレム・デーモン・ドラゴン・上の5種）。魔物の絵はまだない（`js/ui/art.js` の `MONSTER_ART` に足すまで、名前の1文字目の仮の絵が出る。UI担当）
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均63手番（周回上限12%）。先攻のとき random に勝つ割合は smart 95%

### 魔物のごほうびをカードにした（人間の指示）
コインの価値が下がったので、魔物を倒したごほうびを**カード**にした。`data/monsters.json` の `reward`（コイン）をやめて、`rewardRarity`（そのレアリティのカードが1枚、とどめを刺した人の手札に入る。同じレアリティの中は `weight` の重み）にした。コインは魔物からは出ない。`reward`（コイン）も書ける（どちらか1つは必須。テスト用・互換のため）。
- 割り当て（仮）：コウモリ・スライム＝コモン／ゴブリン・スケルトン＝アンコモン／ゴーレム・デーモン＝レア／ドラゴン＝エピック（強い魔物ほど高いレアリティ。大きな見返りには大きなリスク）
- イベント：`monsterDefeated` に `rewardRarity`（コインのごほうびなら `null`）を足した → `cardDrawn`（`cardIds` は本人だけ。ほかの人には `count`）。`getState().monsters[].reward`（コインの魔物だけ。ほかは0）と `rewardRarity`
- CPU：ファイアボール系で魔物にとどめを刺すのは、ごほうびがレア以上のカード（または5コイン以上）のときだけ
- 確かめたこと：`node tests/sim/run.js --games 300`：smart 同士は平均42手番・全組み合わせ決着。CPU の強さの順（rush 42%・defensive 29%・smart 86%）は、先に書いたとおり rush > defensive のまま

### コインの入手手段を増やした（人間の指示）
コインが魔物のとどめだけでは少なかったので、次の2つとカードを足した（**数値はすべて仮**）。
- **最初に5枚**（`rules.initialCoins`、省略すると0）／**自分のターンの始めに1枚**（`rules.coinPerTurn`、省略すると0。`turnStarted` の後、ドローの前。`coinsChanged` の `reason` は `"turn"`）
- **コインを増やすカード**（`effect: "gainCoins"`、`amount`。魔法なのでメインを使う）。5段階の系統：小銭袋（コモン+1）→金貨（アンコモン+3）→財宝（レア+8）→金脈（エピック+20）→王の財宝（レジェンド+50）。`coinsChanged` の `reason` は `"card"`。CPU（`smart` 系）は、ほかに出すものがないときに出す
- **コインで買えるもの（強化）を足した**（`upgrades.json`。数値はすべて仮）：
  - 入手券（`effect: "gainCard"`、`rarity`）：買うと、そのレアリティのカードを1枚（`weight` の重みで）手札に加える（`cardDrawn` が出る）。コモン2（5回まで）・アンコモン6（3回）・レア15（2回）・エピック35（1回）・レジェンド80（1回）。`rarities` を渡していないと買えない
  - 超修理：城HP+20、20コイン、1回／大量補充：5枚引く、12コイン、1回
  - CPU（`smart` 系）は、買える入手券のうち高いものを先に買う
- コインのカードの `weight` は、一度 0.5 にして出にくくしたが、人間の指示で元（省略＝1）に戻した
- `coinsChanged.reason` は `"reward"` / `"upgrade"` / `"turn"` / `"card"`
- 確かめたこと：`node tests/sim/run.js --games 300`：smart 同士は平均43手番・周回上限で終わる6.7%・p1 勝率52%（変更前とほぼ同じ）。**CPU の強さの順が変わった**（先攻のとき random に勝つ割合：rush 44%・defensive 30%・smart 89%。以前は rush < defensive < smart）。強い CPU がコインで強化を買うため smart が大きく伸びた。`CPU_LEVELS`（`js/main.js`）の割り当てを見直すか決める必要がある

### コインで排出率を上げる・出した枚数ぶん引く（人間に確認して決めた）
- **運命の祈り**（`upgrades.json` の `luck`、効果 `boostDrops`。仮：コスト3・1試合2回まで）：買うと、自分の**次の `amount` 枚（仮：5）のドロー**が、山札からではなく、`fromRarity`（仮：レア）以上のレアリティの排出率を `boost` 倍（仮：4倍）にして引き当てたカードになる（山札は減らない）。効いているあいだは重ねて買えない。`rarities` を渡していないと買えない。`getState().players.pX.luck` は `{ draws, boost }` か `null`。CPU の smart 系は、とぎ石の次に買う
- **出した枚数ぶん引く**：`rules.drawPerPlayed`（省略すると `false`。仮：`true`）。ターンの始めに引く枚数は `max(drawPerTurn（先攻の最初は firstTurnDraw）, drawUntilHand − 手札, 前のターンに出した枚数)`。合成は「出した」に数えない
- 確かめたこと（`node tests/sim/run.js --games 200`）：全組み合わせが決着。城HP100のときは平均110手番で上限60周に近かった。城HP40にして解消（上の城HPの項）。**運命の祈りの強さは遊んで確かめる**

## MP・武器の加算・魔物の成長・降参の観戦（人間の指示。仮）

**数値はすべて仮**。`data/` のJSONで調べて直す。

- **MP（魔法のコスト）**：`rules.initialMp`（仮：10）・`rules.maxMp`（仮：30。0 なら MP を使わない＝コストなし）。**攻撃の魔法**（`damageEnemyCastle` / `damageEnemySoldiers` / `poisonEnemySoldiers` / `freezeEnemySoldiers`）と**精霊**（`summonSpirit`）を出すと、レアリティのぶん MP を使う（`rarities.json` の `mpCost`：コモン1・アンコモン2・レア3・エピック4・レジェンド5。カードの `mpCost` で個別に変えられる）。足りなければ出せない（`canPlayCard` の理由は「MPが足りません（○必要・あと○）」）。兵士・武器・防御・回復・コイン・神頼みでタダで出すカードは MP を使わない。自然回復はなく、マナ回復のカードだけで増える
- 人間の指示：MP/SP 上限は30。初期値10のまま
- **マナ回復のカード**（`effect: "gainMp"`、`amount`。メインを使わず何枚でも）：魔力のかけら（コモン+1）→魔力のしずく（アンコモン+2）→魔力の水晶（レア+5）→魔力の泉（エピック+10）→世界樹のしずく（レジェンド+20）の5段階の系統（合成でつながる）。上限を超えたぶんは捨てる。MP が満タンなら出せない
- `getState()`：`maxMp`、`mpCosts`（MP を使うカード種類 → 必要な MP）、`players.pX.mp`。イベント `mpChanged`
- CPU：MP が上限の半分以下になったら、ターンの最初にマナ回復のカードを出す（`pass` 以外）
- **武器は重ねられる**：攻撃力は足し算（`weaponBonus` に足す）。属性は上書き（最後に持たせた武器。属性なしの鉄の剣なら属性が消える）。同じ武器も重ねられる。（以前は「1体に1つ」で、持ちかえると攻撃力が下がっていた）
- **開幕のコインは 0**（`rules.initialCoins`）。**速さ**：歩兵2・騎兵3（騎兵は4→3。斥候騎兵は4のまま）
- **排出率の恒久強化**（`upgrades.json` の `permLuck`、効果 `permanentLuck`：`amount`（買うたびに増える%）・`boost`・`fromRarity`。仮：コストは買うたびに 3 → 5 → 8 → 11（`costs`）・4回まで・15%ずつ・レア以上3倍）：買うと、その試合ずっと、ドローのたびに確率 `amount`% × 買った回数で、山札からではなく排出率（レア以上が `boost` 倍）で引き当てる（山札は減らない）。運命の祈り（次の5ドローだけ）とは別に重なる。`getState().players.pX.permLuck` は `{ chance, boost }` か `null`。CPU（`smart` 系）は、運命の祈りより先に買う
- **魔物は後半ほど強く、放置するほど育つ**
  - 後半ほど強い魔物が出やすい：`rules.monsterLateBias`（仮：0.15）。魔物の出やすさ（`weight`）に × (1 + 値 × ごほうびの段階（コモン0〜レジェンド4）× `monsterFirstRound` を過ぎた周回の数)
  - 放置するとレアリティが上がる：`rules.monsterEvolveEvery`（仮：3。0 なら強くならない）周ごとに、魔物の HP・攻撃・城への攻撃が `rules.monsterEvolveMultiplier`（仮：1.2）倍（HP は増えたぶん回復）になり、ごほうびのレアリティが1つ上がる（レジェンドの上はない）。倒したときは、育ったあとのレアリティのごほうびが出る。イベント `monsterEvolved`。`getState().monsters[]` に `evolveCount`
  - 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均55手番・p1 勝率53%、smart vs random は91%（育たないときは93%）。放置の怖さは出た（魔物で決着する試合：random 同士で約4割、smart 同士は約2%）。**強すぎないかは遊んで確かめる**
- **降参（3人以上）**：城が壊れて抜け、残りの試合を見守る（上の `surrender` の表）。画面は観戦中の帯を出し、ターン終了・強化・合成を押せなくする
- 画面：MP の表示（上のバー。自分は「✦10/30」）、手札に必要な MP の札、合成の演出（レアリティが高いほど光・火花・揺れが大きい）、魔物が育つ演出、城が落ちた帯（`js/ui/Animations.js`）。マナ回復カードの絵は仮（`js/ui/art.js` に足すまで「魔」の仮の絵が出る）

## 天候・魔物の駒・チャット・体力ゲージ（人間の指示。仮）

**数値はすべて仮**（`data/weather.json`・`data/rules.json`・`data/cards.json`・`data/stamps.json`）。

### 天候（`new Game({ weather })`。`weather.json` を渡さなければ天候なし）
- 周回の始め（`roundStarted` のすぐあと）に、天候が切り替わる。`rules.weatherFirstRound`（仮：2）周目から。ふつうの天気のときは、`rules.weatherChangeChance`（仮：0.6）の確率で新しい天候になる（`weight` の重みで選ぶ）。天候は `rounds: [最短, 最長]` 周続き、終わったらふつうの天気に戻る。`weatherChangeChance` が 0 なら乱数を使わず天候は出ない
- **天候の呪文**（`weatherCall`・`effect: "changeWeather"`・スペシャル・メインを使う）：今と違う天候にランダムに変える（`weatherChanged` の `cause` は `"card"`）。出る割合はスペシャルの中で適応と 2:1（適応の排出率は約0.82% → 約0.55%）。`weather` を渡していないと出せない。ほかに変えられる天候がないとき（定義が今の天候1つだけ）も出せない。呪文で `weatherFirstRound` より前に始めた天候も、周回ごとに減って終わる
- 天候の効果（`weather.json` のキー）

| 天候 | キー | 効果 |
|---|---|---|
| 晴れ `sunny` | `elementBonus: { fire: 2 }` | 火属性の兵士・魔物・火の精霊のダメージ +2（魔法使いが城を撃つときも） |
| 雨 `rain` | `elementBonus: { water: 2 }` | 水属性のダメージ +2・水の精霊の回復 +2 |
| 大雨 `heavyRain` | 雨 ＋ `lightning: 5` | 周回の始めに雷が落ち、ランダムな1つの城に5ダメージ（城壁は受ける） |
| 霧 `fog` | `missChance: 0.3` | 兵士の戦い・射撃（弓兵・魔法使い）・攻撃魔法（城・兵士・魔物へ）が30%で外れる（ダメージ0） |
| 嵐 `storm` | `stopMarch: true` | 進む兵士（`melee`）が動かない。弓兵・魔法使いは撃てる |
| 砂嵐 `sandstorm` | `sandDamage: 1` | 周回の始めに、全員の城（城壁は無視）と兵士に1ダメージ。**城は砂嵐では落ちない**（HP1で止まる。全員の城が同時に落ちて勝者がいなくなるのを防ぐ。人間の指示）。兵士は倒れる |
| コインの雨 `coinRain` | `coinPerTurn: 2` | 自分のターンの始めに2コイン（`coinsChanged` の `reason` は `"weather"`） |

- `getState().weather`：`{ type, name, icon, description, roundsLeft }`（ふつうの天気なら `null`）。`weatherEnabled`：天候を使うルールか
- イベント：`weatherChanged`（`{ weather, previous, rounds, cause: "natural" | "card", playerId, name, icon, description, previousName }`。`weather` が `null` なら天候が終わった）／`weatherLightning`（`{ playerId, amount }`。このあと `castleDamaged`（`source: { kind: "weather", weather }`））／`attackMissed`（`{ playerId, kind: "fight" | "shot" | "spell", soldierId? / monsterId? / type? }`。外した側。魔物が外したときは `playerId: null` と `monsterId`）
- 砂嵐の城ダメージは `castleDamaged`（`amount` は実際に減った量。HP1の城には出ない。`blocked: 0`・`source: { kind: "weather" }`）、兵士は `soldierDamaged`（`cause: "weather"`）
- 順番（周回の始め）：`turnStarted` → `roundStarted` → `weatherChanged` → 雷・砂嵐 → 魔物の城への攻撃 → …。天候で城が落ちたら、そこで `gameOver`
- 画面：上のバッジ（天候名・あと何周）、背景の効果、変わった瞬間の**警報**（サイレン・赤いふち・帯。良い天候は金・雨は青。`js/ui/config.js` の `weatherTone`）。タップで飛ばせる
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士の平均43手番・p1 勝率50%（天候なしと同じ）

### 倒した魔物は駒になる
- （のちに変更：魔物のカードの多くは効果のカードにした。下の「魔物のカードを「効果」にする」。駒のままなのはゴブリン・スケルトン（弓兵）・ゴーレム（護衛））
- 魔物のとどめを刺した人の手札に、その魔物の**兵士カード**（`cards.json` の `beast_<魔物の種類>`、`monster: "<種類>"`）が1枚入る（ごほうびのカードとは別。`monsterDefeated` に `pieceType`、このあと `cardDrawn`）。兵士カードと同じように、兵士の枠で出せる
- 魔物の駒は HP・攻撃が魔物と同じ（`monsters.json` の値）、速さは1〜2。合成できない（`fuseTo` なし）。山札・ごほうび・入手券では出ない（`weight: 0`）。**出しても捨てても使い切り置き場へ行き、山札に戻らない**（シャッフルで山札に混ざらないように）。魔物は放置で強くなる（`monsterEvolve*`）が、駒は元の強さ
- 絵は魔物の絵を使う（`js/ui/art.js`）

### 画面の揺れ・体力ゲージ
- **画面の揺れ**：兵士・魔物がダメージを受けたとき、魔法を使ったとき、天候が変わったときに、盤面ぜんたいが揺れる（強いほど大きく。`UI_CONFIG.screenShake`）。城に当たったときの揺れは今までどおり。設定で動きを減らしているときは揺れない
- **兵士の体力ゲージ**：兵士の頭の上に細い帯。残りHP ÷ 上限で、緑 → 黄 → 赤。減った分は白い影が遅れて追いかける。`getState()` の兵士に `maxHp`（鍛錬で増える）を足した

### チャットとスタンプ
- 使える場所：**オンライン対戦**（文字とスタンプ）と、**ひとりで遊ぶ**（文字とスタンプ。CPU はスタンプで返す。文字には、ことばに合うスタンプを選んで返す（`js/main.js` の `CPU_TEXT_REPLY`）。ずるはしない）。2人で交代して遊ぶときは出ない（人間の指示で、ひとりで遊ぶにも文字を足した）
- スタンプは `data/stamps.json`（`{ id, icon, label }` の配列）。画面とサーバーが同じ一覧を読む
- `POST /api/action` の `method` に `chat`（`args: [{ text }]` か `[{ stamp }]`）。文字は制御文字を空白にして前後を取り、1〜40文字。つづけて送れるのは0.6秒ごと。CPU の席・形の違う送り方は `{ ok: false, reason }`。試合の前・中・あとのいつでも送れる
- 届くもの：`{ type: "chat", id, playerId, name, text | stamp, at }`。つないだとき（つなぎ直したときも）、直近30通が `{ type: "chatLog", messages }` で届く（つなぎ直すたびに全部届くので、画面は受けたら表示を作り直す）。もう部屋にいない人の発言は `playerId: null`・`left: true`（名前は残る）。文字は人が入れたものなので、画面は `textContent` で出す

## デッキ編成（コスト制。`rules.deckMode: "cost"`。人間の指示。仮）

今までの山札（`"shared"`：全員共通／`"own"`：`decks.json` の見本から選ぶ）は残し、**別モード**として足した。1人1つの山札を、コストの決まりに合うように編成する。

- **コスト**（`rarities.json` の `deckCost`）：コモン1・アンコモン2・レア3・エピック4・レジェンド5。**スペシャルはレアと同じ扱い**（`deckAs: "rare"`。コスト3・同じカードの上限・レアの合計枚数に数える）
- **決まり**（`checkCostDeck()` in `js/game/Setup.js`。画面もサーバーも同じものを使う）
  - 合計コストは **90 以上 100 以下**（`rules.deckCostMin` / `deckCostMax`。少なくていいと、レジェンドだけの少ない枚数で山札がすぐ尽きて回せるので、下限をつけた）
  - 同じカードは、コモン・アンコモンが10枚まで、レア以上は3枚まで（`maxCopies`）
  - レアリティごとの合計枚数：コモン・アンコモンは無制限、レア20・エピック10・レジェンド5まで（`deckLimit`。`null` は無制限）
  - 魔物の駒（`beast_*`）は入れられない。天候の呪文・適応はスペシャルなのでレアの枠で入れられる
- **山札が尽きたら、捨て札を混ぜて山札に戻す**（今までと同じ）。1人1つの山札・捨て札・使い切り置き場を持つ（`own` と同じ。`getState()` の `deckMode` は `"cost"`）
- **Game**：`new Game({ rarities, decks, setup: { deckLists, decks } })`。席ごとに、`setup.deckLists[席]`（`{ カード種類: 枚数 }`。決まりに合わなければ `new Game()` が例外）か、なければ `setup.decks[席]`／`rules.defaultCostDeck`（`decks.json` の `costDeck: true` の見本）。`rarities` が必須。`players.pX.deckId` は見本のID か `"custom"`
- **見本のデッキ**（`decks.json` の `costDeck: true`）：`costBalance`（バランス・コスト92）・`costAssault`（突撃・91）・`costFortress`（籠城・96）。`own` の見本の一覧には出ない。確かめたこと（`node tests/sim/costdecks.js`、smart 同士）：勝率 45〜52%・全部決着
- **オンライン**：部屋の `setRules` の `deckMode` に `"cost"`。`setSeat` に `{ costDeck: 見本のID }` か `{ deckList: { 種類: 枚数 } }`（`null` で見本に戻す。決まりに合わなければ `{ ok: false, reason }`）。`room` の `players[].costDeck`（見本のID か `"custom"`）、`choices.costDecks`。ほかの人のマイデッキは選べない（自分の席だけ）
- **画面**：タイトルの「デッキ編成」（コストのメーター・レアリティごとの枚数・足せない理由を出す。決まりに合うときだけ保存できる）。マイデッキはこの端末に保存（`js/ui/DeckStore.js`）。「ひとりで遊ぶ／同じ端末」の詳細設定と、オンラインの部屋で「マイデッキ」を選べる

## 永続の毒と解毒薬／山札の既定を各自のデッキにした（人間の指示。仮）

- **毒（永続）**：毒の5枚（毒の霧1・猛毒2・毒の雨3・死の霧4・疫病5。レアリティごとの毎ターンのダメージ）は `effect: "poisonEnemy"`（`amount`）。**選んだ相手（陣地）の兵士全員と城**を、**永続の毒状態**にする。毒の兵士は持ち主のターンの進軍の前に、毒の城は持ち主のターンの始め（`armorExpired` のあと、コインの前）に、毎回 `amount` ダメージ。**盾・城壁・土の精霊は効かない**（毒で城が落ちたら、そこで決着）。**重ねがけは足し算**（毒の量が増える。上限なし。城も兵士も。人間の指示で「上書き」から変えた）。相手がいればいつでも出せる。範囲は全レーン（`scope` なし）。MP を使う（攻撃の魔法）。兵士の毒は `turns: null`（永続）。ターン数つきの `poisonEnemySoldiers` は、テスト用に残してある（`cards.json` では使わない）
- **解毒薬**（`antidote`・`effect: "curePoison"`・スペシャル・`weight` 1）：**自分の毒状態（兵士も城も）をすべて治す**。毒にかかっていないと出せない（「毒にかかっているものがありません」）。メインを使わず何枚でも出せる（`slot: "support"`）。MP は使わない。CPU（`smart` 系）は、毒にかかっていれば先に使い、毒カードは強いものから出す
- `getState().players.pX.castlePoison`（城の毒の量か `null`。チーム戦では城を共有）、兵士の `statuses.poison` は `{ amount, turns: null }`（永続）。イベント：`castlePoisoned`（`{ playerId, amount }`）・`castleCured`（`{ playerId }`）。`statusApplied` に `amount` が付き、永続の毒は `turns: null`。毒の城のダメージは `castleDamaged`（`source: { kind: "poison" }`、`blocked: 0`）
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均28手番（上書きのときは33、毒を直接ダメージにしていたときは41）で、**かなり短くなった**。smart vs random は84%。数値は遊んで確かめる（試合が短すぎれば、毒の量を 1・1・2・3・5 などに弱める）
- 画面：城のそばに「毒 N」のバッジ、城が緑がかる。解毒薬の絵は仮の絵（`js/ui/art.js`）
- **カードの長押し拡大**（人間の指示）：デッキ編成・図鑑で、カード（`data-zoom` 属性つき）を約0.4秒長押しすると、カードを大きく出す（`js/ui/CardZoom.js`・`css/card-zoom.css`）。なぞる・端末を傾けると、カードが傾いて偏光（`Hologram.js` の光）が動く。外をタップ・Esc・×で閉じる。長押しのあとに指を離しても、カードの追加・詳細は開かない。動きを減らす設定のときは傾けない
- **画面の大きさへの合わせ方**（人間の指示：実機の大きさに合わせて確かめることを怠らない）：`css/fit.css`（最後に読む）に、高さ・向きごとの調整を書く。画面を変えたら、`390x797`（ホーム画面アプリ）・`375x667`・`360x640`・`390x664`（ブラウザの帯あり）・`320x568`・横向き `844x390` で、**上が切れない・スクロールなしで収まる**ことを確かめる
- **デッキ名**：保存済みのデッキは、名前を変えた時点ですぐ保存する（カードの変更は保存ボタンまで保存しない）
- **山札の既定は「プレイヤーごと別（コスト制）」**：ひとりで遊ぶ（設定を選ばずに始めたときも）・同じ端末・オンラインの部屋で、最初から1人1つの山札。編成したマイデッキが決まりに合っていれば自分の席で使い、CPU は見本のデッキ。「みんな共通」は設定で選べる。`data/rules.json` の `deckMode` は変えていない（シミュレーションの基準を変えないため）

## 忍者（`role: "ninja"`。日本バージョンのために足した。人間に確認して決めた）

日本バージョン（タイトルで切り替える。カードは全部日本専用に作り直し、西洋版とは混ぜない）の忍者のための役割。**相手から見えず、敵の兵士をすり抜ける**（人間の指示）。ロジックだけ先に入れた（`data/cards.json`（西洋版）には忍者はいない）。

- 書き方：`cards.json` の兵士に `role: "ninja"`。`hp`・`attack`・`speed` を書く（進む兵士。`range`・`stay` は書かない）
- **すり抜け**：忍者は相手の兵士と戦わない。相手の兵士も忍者を止めず、弓兵・魔法使いも撃たない（`foesOf` が忍者を数えない）。**魔物には止められる**（倒すまで進めない）。城に着けば、ふつうの兵士と同じく攻撃力 × `soldierCastleDamageMultiplier` のダメージ（防御も聞く）
- **見えない**：`getState(viewerId)` は、ほかの陣地の忍者を `soldiers` に入れない（`viewerId` が `null` のときも入れない）。味方（チーム戦の同じ陣地）には見える
- **妖術（魔法）の的にならない**：兵士を狙う魔法・毒（`damageEnemySoldiers` / `poisonEnemySoldiers` / `freezeEnemySoldiers` / `poisonEnemy`）は忍者に当たらず、対象の数え方（「相手の兵士がいません」）にも入れない（いるかどうかが分からないように）。`Player.visibleSoldiers` が忍者を除いた兵士。天候（砂嵐）は当たる
- **イベント**：忍者に関わるイベント（`soldierDeployed` / `soldierMoved` / `soldierDamaged` / `soldierDestroyed` / `statusApplied` / `statusCleared` / `weaponEquipped` / `shieldAdded` / `soldierBuffed` / `monsterClashed`）には、持ち主の陣地 `stealth`（例：`"p1"`）が付く。`filterEventFor(type, payload, viewerId, viewerSide)`（`js/game/visibility.js`）は、`stealth` がその人の陣地でなければ `null`（送らない）を返す。サーバーは `null` のイベントを送らない。**城・魔物へのダメージ（`castleDamaged` / `monsterDamaged`）と、カードを出したこと（`cardPlayed`）は見える**（「忍者を出した」ことは分かるが、どこにいるかは分からない）
- 画面（ひとりで遊ぶ・同じ端末）は、オンラインと同じく、見ている人の陣地で `stealth` のイベントを飛ばす（UI担当。日本バージョンの画面のPRで入れる）
- 確かめたこと：`tests/ninja.test.js`（見えない・すり抜け・弓兵に撃たれない・魔法の的にならない・魔物には止められる・イベントを隠す）。西洋版のシミュレーションは変わらない（忍者がいないため）

## バランス調整：ファイアボール弱体化・城壁の永続・毒の期限・コインの制限（人間の指示。仮）

攻撃（城への魔法）が防御・ほかの攻撃より強すぎ、毒も強すぎたので調整した。数値はすべて仮（`data/`）。いずれも、`rules.json` に書かなければ従来どおり（テストの固定データ用）。

- **城への魔法を弱くした**（`cards.json`）：ファイアボール 8→5・業火 11→9・隕石 14→14（変えない）・星降り 22→19・終末の炎 36→25（人間の指示で数値を直した）
- **城壁は永続で、上限40**（`rules.armorMax`、仮：40）：次の自分のターンで消えなくなった。置くと**足し算**で、上限まで積める（上限に達していたら出せない）。ダメージは先に城壁が受ける（毒は無視）。0 または省略なら従来どおり（重ならず、次のターンの始めに消える）。`armorExpired` は `armorMax` があると出ない
- **毒は5ターンで治り、量は10まで**（`rules.poisonTurns`、仮：5／`rules.poisonMax`、仮：10）：兵士は進軍のたび、城は持ち主のターンの始めに、ダメージを受けるごとに残りが1減って 0 で治る。重ねがけは足し算（上限 `poisonMax`）で、残りターンは5に戻る。城の毒が期限で治るときは `castleCured`、兵士は `statusCleared`。`getState().players.pX.castlePoisonTurns`（城の毒の残り。永続なら `null`）。0 または省略なら従来どおり（永続・上限なし）
- **部屋の画面からもチャットできる／チャットの見た目**（人間の指示）：部屋の「💬 チャット」ボタンで同じチャットを開く（未読の数つき）。届いた発言は画面に、**枠なし**で、左にアイコン・右に色つきの名前（席ごとの色）と小さいランクのアイコン・その下にランク名、さらにその下に文字かスタンプを出し、画面の真ん中あたり（高さの4割）から、ゆらゆら揺れながら、数秒とどまって上へ登って消える。未読の数は、ボタンの右上のすみの丸い円の中に出す（`js/ui/ChatView.js`・`css/chat.css`）。サーバーは、アカウントのある人の発言に `profile`（`{ icon, iconImage, rank: { tierIndex, division, color, name, divisionLabel } | null }`。ゲスト・合言葉だけの人は付かない）を添える（`createGameServer` が `profileOf` を渡す）。アイコンがなければ名前の頭文字
- **カジュアル対戦の部屋：ルールは部屋主の席の「ルールを変更」画面で変える。部屋主は譲れる**（人間の指示）：部屋の下の「対戦ルール」は、部屋主も含めて見るだけ。部屋主は （`args: [playerId]`。部屋にいる人だけ。CPU・自分・ランク戦は不可）で部屋主を譲れる。CPU の追加は席の下に残した
- **カジュアル対戦の部屋：ルールは部屋主の席の「ルールを変更」画面で変える。部屋主は譲れる**（人間の指示）：部屋の下の「対戦ルール」は、部屋主も含めて見るだけ。部屋主は `transferHost`（`args: [playerId]`。部屋にいる人だけ。CPU・自分・ランク戦は不可）で部屋主を譲れる。CPU の追加は席の下に残した
- **カジュアル対戦（合言葉の部屋）で城のHPを入力できる**（人間の指示）：部屋主が `setRules` の `castleHp`（10〜200の整数。選ぶのではなく自分で入力）で決める。試合の `rules.castleMaxHp` を上書きする（初期値は `rules.json` のまま）。`room.settings.castleHp` は数、`choices.castleHpRange`（`{ min, max }`）。ランクマッチは変えられない。画面は部屋の「対戦ルール」に数の入力欄を足した（`js/ui/RoomView.js`）
- **コインのカードは1ターン1枚まで**（`rules.coinCardsPerTurn`、仮：1）：`gainCoins` が対象。出せないときの理由は「コインのカードは1ターンに1枚までです」。0 または省略なら無制限
- **王の財宝（レジェンドのコイン）はデッキ編成で1枚まで**：`cards.json` のカードに `maxCopies`（1以上の整数）を書くと、レアリティの `maxCopies` より厳しい上限になる（`checkCostDeck`）
- 画面：`js/ui/text.js` の城壁・毒の説明文を `armorMax` / `poisonTurns` / `poisonMax` に合わせた。城の毒の残りターンのバッジ表示は未対応
- 確かめたこと：`node --test` は全部通る。`node tests/sim/run.js --games 300`：全組み合わせが決着。smart 同士は平均38.7手番・p1 勝率49%、smart vs random 85%

## 吸収・捨て身・爆発のカード（仕様書4章。レア・合成しない。人間に確認して決めた。数値は仮）

仕様書（`docs/system-spec-4-8.md`）の4章から、カード4枚を足した。**SP は今の MP と同じもの**（呼び名は MP のまま）。最初は各5段階（20枚）で作ったが、「カードを増やしすぎ」なので1枚ずつにまとめた。いったんスペシャルにしたが「スペシャルにしては弱い」ので**レア・合成しない（`fuseTo: null`）**にした（人間の指示）。数値はレアの段の値。シミュレーションでの調整はしない（人間の指示）。

| カード（`effect`） | 効果 | MP | 長所／短所 |
|---|---|---|---|
| 魔力強奪 `manaRaid`（`drainMp`） | 相手の MP を4奪って自分の MP にする（自分の上限を超えたぶんは捨てる） | 使わない | MP 回復のカードがなくても魔法を撃てる／相手の MP が0なら出せない（「相手のMPがありません」） |
| 命の簒奪 `lifeSteal`（`drainCastle`） | 相手の城に8ダメージ。城HPを実際に減らしたぶん、自分の城を回復（城壁が受けたぶんは回復しない） | 3 | 攻めと回復を一度に／魔物は狙えない |
| 決死の砲撃 `desperateShot`（`sacrificeAttack`、`selfDamage`） | 自分の城HPを6払って、相手の城に20ダメージ | 3 | 大きな威力／自分の城が削れる。城HPが `selfDamage` 以下なら出せない（「城のHPが足りません（○より多く必要です）」） |
| 火薬庫 `powderKeg`（`damageAllSoldiers`） | 場にいる兵士全員（**自分の兵士も**、全レーン）に8ダメージ | 3 | まとめて倒せる／味方も巻き込む。場に兵士がいなければ出せない |

- **`fuseTo: null`**（`cards.json`）：合成しないカード（同じカード2枚でも、適応とでも合成できない。理由は「このカードは合成できません」）。書き忘れ（`fuseTo` なし）は今までどおり起動時に例外。MP はレアのコスト（3）。排出率はレアの枠（13.18%）の中で `weight` 1
- どれもメイン（1ターン1枚）。命の簒奪・決死の砲撃は城への魔法と同じく、魔法の塔の `castleSpellBonus` が乗り、攻撃を受けたときの防御（城壁・土嚢・反射）を聞く。反射されたときは回復しない
- 決死の砲撃の支払いは、城壁・土の精霊を通さず、霧で外れても払う。`castleDamaged`（`source: { kind: "sacrifice", type }`、`blocked: 0`）
- 命の簒奪の回復は `castleDamaged` → `castleHealed`。相手の城が落ちたときは回復せずに決着
- 火薬庫は対象を選ばない（`{ playerId: 自分 }`）。席順に、各プレイヤーの兵士へ `soldierDamaged`（`cause: "spell"`）。忍者には当たらない。防御は聞かない。霧で外れることがある
- 魔力強奪のイベント：`spellCast` → `mpChanged`（相手、`reason: "drained"`）→ `mpChanged`（自分、`reason: "drain"`）
- CPU：`random` は出せるカードとして使う。`smart` などの戦い方は、まだ選んで使わない
- 画面（UI担当にお願いしたいこと）：カードの絵（今は仮の絵）、`js/ui/text.js` の効果アイコン、`js/ui/DeckEditor.js` の分類、`js/ui/CardGuide.js` の MP を使う effect の一覧、`js/ui/Animations.js` の演出。説明文は `cards.json` の `description` に書いてある
- 魔法スキン（`data/shop.json` の `fxskin_*`）を4枚ぶん足した（全魔法に1つずつ、のテストに合わせた。レア扱い）
- 確かめたこと：`node --test` 全部通る（`tests/drain-sacrifice.test.js`）

## 合成・高レアリティの機会を増やす調整（人間の指示。仮）

カードの種類が増えると、同じカードがそろいにくくなって合成の機会が減り、高レアリティを手に入れる機会も減る。そこで次のように変えた（数値は人間の指示）。
- **適応の排出率を約0.33% → 約2.5%**（解毒薬・天候の呪文が増えて、スペシャル0.82%を3枚で分けていたため下がっていた）。`rarities.json` のスペシャルを 0.82 → 3、コモンを 50 → 47.82（合計100）。`cards.json` の適応の `weight` を 1 → 7.625（解毒薬 約0.33%・天候の呪文 約0.16% は今までどおり）
- **排出率アップの強化を安くした**：運命の祈り 5 → 3コイン（2回まで）。幸運の加護 12 → **買うたびに 3 → 5 → 8 → 11コイン**（3回 → 4回まで）
- `upgrades.json` の `costs`（省略できる）：買うたびの値段の配列（1回目・2回目…。回数が配列より多ければ最後の値段）。`costs[0]` は `cost` と同じにする（違うと起動時に例外）。`upgradeBought.cost` は実際に払った値段
- `getState().players.pX.upgradeCosts`：`{ upgradeId: 次に買うときの値段 }`（だれからも見える）。画面は強化の値段をここから出す（`js/main.js` の `refreshUpgrades`・`js/ui/UpgradePanel.js`。UI担当の確認がほしい）
- 確かめたこと：`node --test` 全部通る（排出率の恒久強化のテストを4回までに直した。適応のテストは、山札の並びが変わって相手が防御カードを持つようになったので、相手の手札を決めるようにした）

## カードの整理と剣の強化（人間の指示。仮）

- **神頼み（`prayer`）・小銭袋（`coinPouch`）・金貨（`goldCoin`）をなくした**。特殊の系統は 天の恵み（アンコモン）→ 盗賊 → 身代わり → 反射、コインの系統は 財宝（レア）→ 金脈 → 王の財宝 から始まる。`randomEffect`（神頼みの効果）のしくみは Game に残してある（使うカードはない）。この節より上の記述で神頼み・小銭袋・金貨に触れている所は、昔の経緯として読む
- **剣を強くした**：魔剣 +3 → **+4**、聖剣 +4 → **+6**、神剣 +6 → **+9**
- 画面のテスト（`ui-tests/layout.js`）の手札にあった神頼みを、天の恵みに替えた（UI担当の確認がほしい）
- 合成できないときの理由：レジェンドだけ「レジェンドはこれ以上合成できません」、スペシャル・`fuseTo: null` は「このカードは合成できません」（以前はスペシャルにもレジェンドの文が出ていた）

## 魔物のカードを「効果」にする（人間の指示。仮）

**これからは、倒した魔物のカード（`beast_<魔物>`）は兵士（駒）ではなく、効果のカード（魔法）として作る**（人間の指示）。魔物ごとに効果を決めて、1体ずつ置きかえる。駒のままにすると決めた魔物（ゴブリン・スケルトン（弓兵）・ゴーレム（護衛））は、駒（兵士）のまま。

- 書き方：`cards.json` の魔物のカードを `kind: "spell"`・`monster: "<魔物>"`・`effect` にする（`monster` は兵士か魔法に書ける）。手に入れ方（とどめを刺した人の手札に入る）・使い切り（使っても捨てても山札に戻らない）・合成できない（「魔物のカードは合成できません」）・排出では出ない（`weight: 0`）は、駒のときと同じ。MP は使わない（`MP_EFFECTS` に入れていない効果）
- 魔物のカードには魔法スキン（`fxskin_*`）を作らない（キャラのスキン `charSkin:beast_<魔物>` を使う。`tests/economy.test.js` を合わせた）

| 魔物 | カード | 効果（`effect`） |
|---|---|---|
| コウモリ（`beast_bat`） | 効果 | 超音波：相手の兵士全員を1ターン止める（`freezeEnemySoldiers`、`turns: 1`） |
| スライム（`beast_slime`） | 効果 | 自分の城HPか MP のどちらかをランダムに5回復（`healCastleOrMp`。満タンの方は選ばない。両方満タンなら出せない） |
| ゴブリン（`beast_goblin`） | 駒（兵士） | 今までどおり（HP7・攻撃3・速さ2） |
| スケルトン（`beast_skeleton`） | 駒（弓兵） | HP6・攻撃3・射程2・2ターンで帰る（`role: "archer"`） |
| ゴースト（`beast_ghost`） | 効果 | 相手の手札を2枚ランダムに奪う（`stealCard`、`amount: 2`。`stealCard` に `amount` を書けるようにした。省略すると1枚） |
| トレント（`beast_treant`） | 効果 | 自分の城HPを10回復し、城壁を5置く（`healAndArmor`：`amount`・`armor`。城壁の決まりは城壁のカードと同じ） |
| ゴーレム（`beast_golem`） | 駒（護衛） | 城の護衛：HP14・攻撃2。自分の城の前（マス0）から動かず、**出した道と左右のとなりの道**（1体で3本まで）の城の前を守る。4ターンで帰る（`role: "guard"`・`stay: 4`） |
| デーモン（`beast_demon`） | 効果 | 相手の城と兵士を毒3にする（`poisonEnemy`、`amount: 3`） |
| ミミック（`beast_mimic`） | 効果 | 相手のコインを5枚奪う（持っている分だけ。`stealCoins`。相手が0枚なら出せない。`coinsChanged` の `reason` は `"stolen"`（奪われた）／`"steal"`（奪った）） |
| ドラゴン（`beast_dragon`） | 効果 | 相手の城に15ダメージ（`damageEnemyCastle`。防御を聞く・魔物も狙える） |
| ヴァンパイア（`beast_vampire`） | 効果 | 相手の城に10ダメージ、自分の城を10回復（`damageCastleAndHeal`：`amount`・`heal`） |
| 魔王（`beast_demonKing`） | 効果 | 相手の城と、相手の兵士全員に15ダメージ（`damageEnemyAll`。兵士が先、城は防御を聞く。忍者には当たらない） |

- **護衛（`role: "guard"`）**：`hp`・`attack`・`stay` を書く（`speed`・`range` は書かない）。動かず、自分から戦いには行かない。相手の兵士は、護衛のいる道か、そのとなりの道（同じ2人の間で `lane` が1つ違う道）を進むとき、護衛を「自分の道の相手の城の前（マス0）にいる兵士」として扱い、いつもの決まり（同じマスか1つ先）でぶつかって戦う（同時に攻撃し合う）。弓兵・魔法使いも、となりの道の護衛を撃てる。弓兵・魔法使いと同じく、自分のターンごとに `turnsLeft` が1減り、0で帰る（`soldierDestroyed` の `reason` は `"returned"`。凍っていても減る）。広場（3人以上）では、自分の道だけを守る
- **魔物のカードは MP を使わない**（`mpCostOf` が `monster` のカードを0にする。ドラゴン・デーモン・コウモリ・魔王のように、ふつうなら MP を使う効果でも）

- ヴァンパイアのカード：メイン（1ターン1枚）。城への攻撃は防御（城壁・土嚢・反射）を聞く。魔法の塔の `castleSpellBonus` は乗せない（10ちょうど）。**回復は、外れても・防がれても・反射されても起きる**。相手の城が落ちたら回復せずに決着。イベント：`spellCast` →（防御）→ `castleDamaged` → `castleHealed`
- 確かめたこと：`node --test` 全部通る（`tests/drain-sacrifice.test.js` に4件）

## サイコロのカード（仕様書7章。人間の指示。数値は仮）

サイコロデッキを組めるように、サイコロのカードを8枚足した（どれも**スペシャル**。ゴッドサイコロだけデッキ編成ではレジェンド枠。合成しない。デッキ編成ではレアと同じ扱いで、1種類3枚まで）。排出率は1枚約0.33%（`weight` 1。ゴッドサイコロは下）。適応（約2.5%）・解毒薬・天候の呪文の排出率を変えないよう、スペシャルの枠を 3 → 5.301、コモンを 47.82 → 45.519 にした。攻撃サイコロの MP は `mpCost: 3`（スペシャルにはレアリティの MP がないため、カードに書く）。`effect: "dice"`、`dice` に種類、`per` に目に掛ける数を書く。効果の量は **出た目（1〜6）× `per`（端数は切り上げ）**。

| カード | `dice` | 効果 | 出し方 | MP |
|---|---|---|---|---|
| 攻撃サイコロ `attackDice` | `attack` | 相手の城に 目×3.5（4〜21）。防御を聞く。魔法の塔のボーナスは乗せない | メイン | 3 |
| ヒールサイコロ `healDice` | `heal` | 自分の城を 目×3（3〜18）回復。満タンなら出せない | メイン | なし |
| マナサイコロ `manaDice` | `mana` | MP を 目×2（2〜12）回復。満タンなら出せない | 何枚でも | なし |
| コインサイコロ `coinDice` | `coin` | 目×2（2〜12）コイン | 何枚でも（ただしコインのカードと合わせて1ターン `coinCardsPerTurn` 枚まで） | なし |
| シールドサイコロ `shieldDice` | `shield` | 目×3（3〜18）の城壁（城壁のカードと同じ決まり。上限なら出せない） | 何枚でも | なし |
| バフサイコロ `buffDice` | `buff` | 選んだ自分の兵士1体の攻撃力 +目×1（1〜6。ずっと） | 何枚でも | なし |
| ランダムサイコロ `randomDice` | `random` | **振る前にコストを払う**：城HP4・コイン3・MP3 のうち払えるものを1つランダムに払う（`randomCost`。城HPは払っても城が落ちないとき＝HP5以上のときだけ。どれも払えなければ出せない：「払えるコストがありません」）。そのあと2回振る：1回目の目で、上の6つのうち今使えるサイコロのどれかを選ぶ（使えるものが6つなら 1=攻撃・2=ヒール・3=マナ・4=コイン・5=シールド・6=バフ）。2回目の目は必ず4〜6。対象はランダム | メイン | なし（コストは左） |

- **ゴッドサイコロ** `godDice`（`dice: "god"`。人間の指示）：1回振って、その目で6つのサイコロの効果が**全部**起きる（倍率はそれぞれのサイコロのカードの `per`：相手の城に 目×3.5・自分の城 目×3 回復・MP 目×2・コイン 目×2・城壁 目×3・**自分の兵士全員**の攻撃+目）。使えない効果（城・MP が満タン、城壁が上限、兵士なし）は飛ばす。起きる順は ヒール → マナ → コイン → シールド → バフ → 攻撃（攻撃は防御を聞くので最後）。**コストなし**（MP も使わない）・メイン。`diceRolled` は1回で、`dice: "god"`・`amount` は種類ごとの量 `{ attack, heal, mana, coin, shield, buff }`。コインのカードの1ターン1枚には数えない
  - **スペシャルだがレジェンド枠**：カードに `deckAs: "legendary"` を書いた（デッキ編成で、コスト5・レジェンドの合計枚数に数える。`deckRarityOf()` はカードの `deckAs` → レアリティの `deckAs` の順に見る）。排出率はレジェンドのカード1枚（`weight` 1）と同じくらいの約0.12%（`weight: 0.36`）。適応などの排出率を変えないよう、スペシャルの枠を 5.301 → 5.42、コモンを 45.519 → 45.4 にした
- ランダムサイコロのコスト（「何も払わないと強い」ので人間の指示で足した）：城HPは城壁を通さず `castleDamaged`（`source: { kind: "sacrifice", type }`）、コインは `coinsChanged`（`reason: "cost"`）、MP は `mpChanged`（`reason: "cast"`）。`diceRolled` に `cost: { kind: "hp" | "coins" | "mp", amount }` が付く
- イベント `diceRolled`：`{ playerId, type, dice, value, amount, rolls, cost? }`（`dice` は実際に起きた種類、`value` は効果に使った目、`amount` は効果の量、`rolls` は振った目の並び。ランダムサイコロは2つ）。カードを出した `cardPlayed` のあと、効果のイベント（`spellCast` → `castleDamaged`、`castleHealed`、`mpChanged`、`coinsChanged`、`castleArmored`、`soldierBuffed`）の前に出る。画面はこれでサイコロを振る演出を出す（UI担当）
- `Card.slot`：マナ・コイン・シールド・バフのサイコロは `support`（`SUPPORT_DICE`）、ほかはメイン
- 確かめたこと：`node --test` 全部通る（`tests/dice.test.js`）

## ゲイルフォース（押し戻しの魔法。人間に確認して決めた。仮）

- **ゲイルフォース**（`galeForce`・`kind: "spell"`・`effect: "pushBackEnemySoldiers"`・`amount: 2`・**アンコモン**・`weight` 1）：選んだ相手の兵士全員（**全レーン**）を `amount` マス押し戻す（`position` を減らす）。**自分の城の前（マス0）より後ろには下がらない**（マス1なら1マスだけ）。メインを使い、MP を使う（攻撃の魔法と同じ。アンコモンなので2）
- 押し戻せる兵士（マス0より前にいる、見える兵士）がいないと出せない（「押し戻せる兵士がいません（みんな城の前にいます）」）。忍者には効かない（ほかの魔法と同じ）。ダメージではないので、霧でも外れず、防御も聞かない（凍結と同じ）
- `scope: "lane"` を書くと、選んだ1レーンだけになる（今のカードは全レーン）
- 合成：ゲイルフォース2枚 → **氷河**（レア。同じ「足止め」の系統に合流させた。仮）
- イベント：`cardPlayed` → `spellCast` → 下がった兵士ごとに `soldierMoved`（出した順。`cause: "pushed"`）。マス0で動かない兵士には出さない
- 長所と短所：城の前まで来た兵士を、凍結（1回休み）より大きく戻せる。ただしダメージはなく、兵士は次の進軍でまた進んでくる
- CPU（`smart` 系）：次の進軍で城に着きそうな兵士がいるとき、凍結がなければ使う
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士は平均39.7手番・p1 勝率49%（追加前とほぼ同じ）。CPU の弱い順は変わらない（`--games 200` で random に勝つ割合：defensive 10%・rush 16%・smart 89%。追加前は 8%・17%・84%）
- 画面：説明文・札（`js/ui/text.js`）、道に土けむりと風の音の演出（`Animations.js` の `mist`・`Sound.js` の `gust`）、押し戻しは今の進軍の動きで後ろへ下がる。チュートリアルは押し戻しを「進軍した」と数えない。絵は仮の SVG（`js/ui/art.js`）、魔法のスキン `fxskin_galeForce`（`data/shop.json`）。専用の絵ができたら差しかえる

## 背水の陣とBGMの切り替え（人間に確認して決めた。仮）

- **背水の陣**（`rules.overdriveHpRatio`、仮：0.3333／`rules.overdriveAttack`、仮：10。どちらかが0なら使わない）：城HPが「上限 × `overdriveHpRatio`（四捨五入）」以下（城HP60なら20以下。部屋で城HPを変えても同じ割合）になると、その城の兵士全員（チーム戦は城を共有するメンバー全員）の攻撃が +`overdriveAttack`。戦い・射撃・城へのダメージに効く（城へは「攻撃力×`soldierCastleDamageMultiplier`」なので +20）。回復して線を超えたら終わる。イベント `overdriveChanged`、`getState().players.pX.overdrive`（`true` / `false`）。`getState()` の兵士の `attack` には足さない（夜と同じ）
- 確かめたこと：`--match smart,smart --games 600` で平均39手番・先攻の勝率46%（背水の陣なしと同じくらい）。**先に城HPが1/3以下になった側が勝つ割合**は、背水の陣なしで19%、+5で22%、**+10で27%**（smart 同士400試合）。逆転は起きやすくなったが、強すぎてはいない。遊んで確かめる
- 画面：城が赤く燃える（`css/stage.css` の `.castle.overdrive`）、「🔥 背水の陣！」の帯と画面の揺れ
- **BGM**（`js/ui/Music.js`・`js/ui/musicScene.js`）：場面の優先は **ピンチ**（どこかの城が背水の陣）＞**ボス戦**（`UI_CONFIG.bossMonsters`＝ドラゴン・デーモン・魔王か、ごほうびがエピック以上まで育った魔物）＞**夜**＞**魔物がいる**＞ふつう。試合中の場面どうしは、曲を止めずに8拍の切れ目で次の曲へ移る。夜・ボス・ピンチの曲を足した（音源ファイルなし。今までと同じく音符で書いた旋律）

## コイントス・後攻の補正・マリガン（人間に確認して決めた。仮）

- **先攻（コイントス）**：`new Game({ setup: { firstPlayer } })`（省略すると席順の最初の人）。ひとりで遊ぶ・同じ端末は画面がシードから、オンラインはサーバーが部屋の乱数で、ランダムに選んで渡す（チーム戦は席順のまま。`firstPlayer` を変えると例外）。周回は先攻のターンで増える（先攻が抜けたら、先攻から席順に数えて残っている人）。`getState().firstPlayer`。画面は、試合の始めにコインが回る演出で知らせる（`Animations.coinToss`・`css/coin-toss.css`。演出なしの設定なら帯だけ）
- **後攻の補正**（先攻以外の人。チーム戦では使わない）：初期手札 +`secondPlayerHandBonus`（仮：1）、最初から城壁 `secondPlayerArmor`（仮：5）。今までの `secondPlayerCastleBonus`（城HP）は0のまま
- **マリガン**（`rules.mulligan`、仮：`true`）：`start()` のあと `phase` が `"mulligan"`（`getState().mulligan` は `{ pending: まだ選んでいない人 }`）。そのあいだ `playCard` / `endTurn` などは「最初の手札を選んでいるところです」。降参はできる（2人なら相手の勝ち）
  - CPU：兵士が1枚もない手札なら全部戻し、それ以外は戻さない（`mulliganChoice` in `js/game/strategies.js`）
  - オンライン：`POST /api/action` の `method` に `mulligan`（`args: [cardIds]`。自分の手札だけ。自分の番でなくても送れる）。CPU は少し間をおいて選ぶ
  - 画面：「捨てる」と同じバーで、0枚から何枚でも選ぶ（「このまま始める」／「引き直す（N枚）」）。**2人で交代して遊ぶときはしない**（手札を見せ合えないため）
- テスト：本物の `data/rules.json` で、マリガン・後攻の補正と関係のない仕組みを確かめるテストは、`tests/helpers.js` の `PLAIN_START` でこの3つを切る
- 確かめたこと（`node tests/sim/run.js --match smart,smart --games 600`。シミュレーションは p1 が先攻）：全試合決着、平均40手番、**先攻の勝率45%±4%**（補正が手札+1だけ・城壁5だけなら47%、補正なしは前の測定で52%）。後攻がやや有利なので、遊んで確かめる（直すなら `secondPlayerHandBonus` か `secondPlayerArmor` を0にする）。CPU の弱い順は変わらない（random に勝つ割合：defensive 8%・rush 13%・smart 78%。random が後攻の補正をもらうため smart の数字は下がった）

## 魔法4種：チェーン・ブラスト／イグニッション・バースト／シールド・ブラスト／ピュリファイ・フレア（人間に確認して決めた。仮）

| 名前（type・effect） | 効果 | 長所 | 短所 | レアリティ（MP）・合成先 |
|---|---|---|---|---|
| チェーン・ブラスト（`chainBlast`・`chainBlast`） | 相手の兵士1体（対象 `{ soldierId }`）に `amount`（4）。同じ道の前後1マス（同じマスも）と、となりのレーンの同じマスにいる同じ陣地の兵士に半分（切り上げ、2） | 固まった部隊をまとめて削れる | 1体だけなら4で終わる | アンコモン（2）→ 大雷 |
| イグニッション・バースト（`ignitionBurst`・`ignitionBurst`） | 自分の城に `selfDamage`（6。城壁が先に受ける。`castleDamaged` の `source.kind` は `"self"`）。代わりに相手の兵士全員と相手の城に `amount`（7）。防御は聞かない | 盤面も城も一気に削れる | 自分も痛い。城HPが `selfDamage + 1`（7）以下だと出せない（自滅させない） | レア（3）→ 星降り |
| シールド・ブラスト（`shieldBlast`・`armorBlast`） | 自分の城壁の値と同じダメージを相手の城に。城壁は0（`castleArmored` の `armor: 0`）。**使い切り**（`exhaust`）。城に当たる魔法なので、相手は防御（反射など）を出せる | 城壁を積むほど大きなとどめ（最大 `armorMax`＝40） | 城壁が全部なくなる。城壁がないと出せない | エピック（4）→ 終末の炎 |
| ピュリファイ・フレア（`purifyFlare`・`purifyFlare`） | 自分の兵士の毒・やけど・凍結と城の毒を全部治し（`statusCleared` / `castleCured`）、相手の兵士全員に `amount`（1） | 守りと攻めを同時に | 治すものも相手の兵士もいなければ出せない。ダメージは小さい | アンコモン（2）→ 大回復 |

- どれも攻撃の魔法（メインの1枚・MP を使う）。「シビレ」はないので、治すのは毒・やけど・凍結
- `spellCast` は、チェーン・ブラストのとき `roadId`（狙った兵士の道）と `soldierId` を持つ
- CPU（smart 系）：浄化（自分に状態異常があれば）→ シールド・ブラスト（城壁10以上か、相手の城を落とせるとき）→ イグニッション・バースト（自分の城HPが半分より多く、相手の兵士2体以上か相手の城を落とせるとき）→ チェーン・ブラスト（いちばん前の相手の兵士）
- 確かめたこと（`node tests/sim/run.js --games 300`）：全組み合わせが決着。smart 同士 平均36.7手番・p1 勝率52%。CPU の弱い順は変わらない（`--games 200`、random に勝つ割合：defensive 12%・rush 19%・smart 87%）
- 画面：説明文・札（`js/ui/text.js`）、演出（チェーン＝雷の演出、イグニッション・シールド＝火の玉、浄化＝金色の霧）、仮の SVG の絵、ストーリー、魔法のスキン

## ステージ（マップ）と昼と夜（人間に確認して決めた。仮）

**数値はすべて仮**（`data/stages.json`・`data/rules.json`）。

### ステージ（`new Game({ stages, setup: { stage } })`）
- 試合の最初に1つ決まり、試合のあいだ変わらない。`setup.stage` がIDならそのステージ、省略か `"random"` なら `weight` の重みでランダム（山札を作ったあとに乱数を使う。`stages` を渡さなければ乱数を使わない）
- **合う属性の武器を持った兵士は、ダメージが `elementMultiplier`（1.5）倍**（小数は切り上げ）。武器を持っていて、兵士の属性（最後に持たせた武器の属性）がステージの `element` と同じときだけ。兵士同士の戦い・魔物との戦い・射撃・城へのダメージに効く（城へは「攻撃力×1.5（切り上げ）」× `soldierCastleDamageMultiplier`）。魔法・魔物には効かない（人間の指示）
- 溶岩＝火（フレイムソード。旧名：炎の剣）・氷＝水（アクアスピア。旧名：水の槍。「氷の剣」はないので水の槍に当てた）・闇の森＝風（ゲイルボウ。旧名：風の弓）・砂漠＝土（アースハンマー。旧名：土の槌）。遺跡・草原は属性なし

| ステージ（ID） | 属性 | ギミック |
|---|---|---|
| 草原・王都（`meadow`） | なし | なし（標準） |
| 溶岩（`lava`） | 火 | 城への魔法+3（`effectBonus`）。**ターンの終わりに、手番の人の兵士全員に灼熱1**（`heat`。盾は効く）、自分の城から数えて `lavaSquares`（1・3）のマスにいる兵士は**やけど**。**周回の始めに40%で噴火**（`eruption`）：ランダムな道の1マス（城の前のマス以外。広場なら広場）の兵士に3ダメージとやけど |
| 氷（`ice`） | 水 | 進む兵士が止められずに歩き切ったら、25%で**滑って1マス余分に進む**（`slipChance`）。凍結の休み+1・盾+1（`effectBonus`） |
| 古代遺跡（`ruins`） | なし | 自分のターンの始めに **MP+1**（`mpPerTurn`。`maxMp` が0なら何もしない）。城・兵士へのダメージの魔法+2 |
| 闇の森（`darkForest`） | 風 | **夜になりやすく（50%）、夜が1周長い**（`nightChance`・`nightRoundsBonus`） |
| 砂漠・荒野（`desert`） | 土 | 弓兵・魔法使いの**射程−1**（最低1。`rangePenalty`）。**砂嵐が4倍起きやすい**（`weatherWeights`） |

- **やけど**（`burn`。ステージの `burn`：1ダメージ×2回）：持ち主の進軍の前に `amount` ダメージ（盾は効かない）。回数が来たら治る（`statusCleared`）。重ねがけは量・回数を大きい方にそろえる。`statuses.burn` は `{ amount, turns }` か `null`
- 「移動マス−1」（氷）は、滑ると逆の効果になるので入れていない。「溶岩の裂け目噴火」は噴火で表した
- **選び方**：ふだんは毎試合ランダム。ひとりで遊ぶ・同じ端末の詳細設定（`js/ui/LocalSetup.js`）と、オンラインの部屋主の「ルールを変更」（`setRules` の `stage`。`"random"` かステージのID。`room.settings.stage`、`choices.stages`）で決めたステージも選べる
- `getState().stage`：`{ id, name, icon, description, element, elementMultiplier }` か `null`
- 画面：ステージごとに、盤面の景色（`#scenery`）・道・飛び石・城の色味を変える（`css/stage.css`。今はグラデーションと模様で描いた仮の見た目）。背景の絵 `assets/bg/stage-<ステージ>.png`（`darkForest` は `stage-dark-forest.png`）を置いて `assets/asset-manifest.json` に足せば、`js/ui/Renderer.js` の `setStage` が自動でそちらを使う（作り方は `assets/STYLE.md`）。2人のときは、相手の城を大きく（1.35倍）、自分の城を小さく（0.78倍）見せる（奥行き。人間の指示。`css/stage.css`）。背景の絵は草原・古代遺跡・闇の森・氷・溶岩の5枚がある（`assets/bg/stage-*.png`。城と城の間の地面（フィールド）だけの絵で、城はゲームの城のまま（人間の指示）。砂漠はまだ CSS の見た目）。絵があるときは、画面側の道の枠を消し、飛び石は道にぴったり合う画面側のもの（砂漠と同じ石。`ui/kingdom-platform.png`）を地面の絵の上に3列に並べる。真ん中のマスは、どのステージでも大きな石の台（人間の指示）。**真ん中のマス（魔物・のちのワールドボスの場所）は、ほかのマスの `UI_CONFIG.midCellScale`（1.8）倍の高さ**（画面だけ。`js/ui/Renderer.js` の `rowCenter` と `--cell-rows` が同じ比率を使う）。上の「○周目」の前にステージのアイコン。試合の始めにステージの説明をお知らせで出す。噴火の演出
- シミュレーション：`node tests/sim/run.js` は毎試合ランダムなステージで回す。`--stage lava` で1つに決める、`--no-stages` でステージなし
- 確かめたこと（`--games 200 --match smart,smart --stage …`）：どのステージも全試合決着。平均手番：草原38・溶岩38・氷35・遺跡33・闇の森39・砂漠36、先攻の勝率49〜53%。CPU の弱い順は変わらない（random に勝つ割合：defensive 10%・rush 13%・smart 84%）

### 昼と夜（`rules.nightChance` など）
- 周回の始め（天候のあと）に、昼なら `nightChance`（仮：0.15。ステージの `nightChance` が優先。0 なら乱数を使わず夜にならない）の確率で夜になる（`nightFirstRound`（仮：3）周目から）。夜は `nightRounds`（仮：2）＋ステージの `nightRoundsBonus` 周続き、昼に戻る。イベント `timeChanged`。`getState().time`（`"day"` / `"night"`）・`nightRoundsLeft`
- **夜の効果**：**獣**（魔物の駒＝`monster` のある兵士カードと、`beast: true` の兵士）の攻撃 +`nightBeastAttack`（仮：2。**ビースト覚醒**）／**暗殺者・忍者**（`role: "ninja"`）の攻撃 +`nightStealthAttack`（仮：2）／**魔物の城への攻撃** +`nightMonsterAttack`（仮：1。夜の脅威）。`getState()` の兵士の `attack` には夜の分を足さない（戦い・城へのダメージのときに足す）
- **刻の魔法**（`effect: "setTime"`、`time`。スペシャル・メインを使う・MPなし）：**ムーンライズ**（`moonrise`、昼のときだけ。夜にする）／**ドーンブレイク**（`dawnbreak`、夜のときだけ。昼に戻す）。出せないときは「もう夜です」「もう昼です」
- **暗殺者**（`assassin`。スペシャルの兵士・`role: "ninja"`・HP3/攻撃4/速さ3）：忍者と同じく、相手から見えず、敵の兵士をすり抜け、魔物には止められる。夜は攻撃+2。ひとりで遊ぶときも、相手の暗殺者のイベント（`stealth` 付き）は画面に出さない（`js/main.js`）
- 排出率：ムーンライズ・ドーンブレイク・暗殺者（スペシャル、`weight` 各0.5）を足しても、適応・解毒薬・サイコロなどの排出率が変わらないよう、スペシャルの枠を 5.42 → 5.91、コモンを 45.4 → 44.91 にした（`data/rarities.json`。#152・#153 とまとめたときに直した）
- CPU（`smart` 系）：自分に獣・暗殺者がいれば昼にムーンライズ。夜に、自分には獣・暗殺者がいなくて、相手に獣が見えるか魔物がいればドーンブレイク
- 画面：夜は盤面に青い影、「○周目」の前に🌙、夜になった・明けたの帯

### まだ作っていないもの
- **ワールドレイド**（ボスごとに専用ステージ：ドラゴン＝溶岩・古代竜＝古代遺跡・魔王＝闇の魔城）：遊び方（だれとだれが、どこで、何人で、何を倒すか）がまだ決まっていないので、人間に確認してから作る

## 属性の反応（人間の指示。数値はすべて仮）

兵士に属性が**付着**しているところへ**別の属性**で攻撃すると、その組が表にあれば**反応**が起きる。反応は**特殊効果＋追加ダメージ（倍率）**。反応のあと付着が別の属性に変わる・消えるので、続けて別の反応につながる（連鎖）。データは `data/reactions.json`、チェックと照合は `js/game/Reactions.js`（`validateReactions(data, elements)`）。`new Game({ reactions })` で受け取る（省略すると反応も付着もなく、今までと同じ）。

- **付着**：属性つきの攻撃（属性を持つ兵士の戦い・射撃、`element` のある魔法）が**兵士に**当たると、標的にその属性が付く（`rules.attachTurns`、仮：3（人間の指示：付着を3ターンに延ばした。最初は2）。上書き）。無属性の攻撃・外れた攻撃（天候の霧・命中低下）は付かない。城・魔物には付かない。魔物の攻撃も付けない
  - 凍結中は**氷**、やけど中は**火**が付着しているものとして照合する（付着 `attachment` があればそちらが先）。それを反応で使ったときは、その凍結・やけどは治る（`statusCleared`）
  - 減り方（決めた）：**持ち主のターンの終わりに1減り、0で消える**。相手のターンに付けた付着（3）は、持ち主の次のターン・相手の次のターンまで残る
- **反応**：攻撃した人の**自分のターンに、`rules.reactionsPerTurn` 回まで**（仮：1。`players.pX.reactionsThisTurn`、自分のターンの始めに0へ）。相手のターンの反撃（守る側の兵士の攻撃）では反応せず、付着だけする。回数を使い切ったあとの攻撃は、反応せずに付着を上書きする。0 なら反応も付着もない
- **ダメージの順番**：基本の攻撃（背水・夜を含む）→ ×属性相性（切り上げ）→ ＋天候 → ステージ倍率 → **×反応の倍率（切り上げ）** → 土の精霊で軽くする。魔法は「カードの値 → ×反応の倍率」。倍率のない反応は掛けない
- **魔法の属性**：`cards.json` の魔法に `element` を書ける（今のカードには書いていない）。兵士に当たる魔法（`damageEnemySoldiers`・チェーン・ブラスト・火薬庫・イグニッション・バースト・ピュリファイ・フレア・魔王）だけが付着・反応の起点になる。ダメージのない魔法（毒・凍結・押し戻し）は付着させない（仮）
- **今の武器は火・水・風・土だけ**なので、実際のカードで起きるのは 蒸発・泥・炎拡散・霧・砂嵐（と、やけど中の兵士に火以外）。氷・雷が絡む反応は、データと判定だけ作ってある（テストは固定のカードで確かめる）

| 組 | id | 名前 | 倍率 | 特殊効果（仮） | 付着のその後 |
|---|---|---|---|---|---|
| 火+水 | `evaporate` | 蒸発 | ×1.5 | — | 消える |
| 火+氷 | `melt` | 融解 | ×1.5 | — | 水に変わる |
| 水+氷 | `freeze` | 凍結 | — | 凍結1 | 消える（凍結中なので、氷として照合される） |
| 水+雷 | `shock` | 感電 | — | 継続ダメージ1×2（盾は効かない）＋隣のマスの兵士に半分（切り上げ） | 消える |
| 水+土 | `mud` | 泥 | — | 鈍足（速さ−1・2回の進軍。最低1） | 消える |
| 風+火 | `flameSpread` | 炎拡散 | — | 標的と隣のマスの兵士にやけど（1×2） | 消える |
| 風+水 | `fog` | 霧 | — | 命中低下（30%・2ターン） | 水霧（`mist`）に変わる |
| 風+土 | `sandstorm` | 砂嵐 | — | 継続ダメージ1×2＋命中低下（30%・2ターン） | 消える |
| 風+氷 | `blizzard` | 吹雪 | — | 標的と隣のマスの兵士に鈍足（−1・2回） | 消える |
| 風+雷 | `stormThunder` | 雷嵐 | — | 同じ道の兵士全員に半分（切り上げ） | 消える |
| 水霧+氷 | `frozenMist` | 凍結霧 | — | 凍結1＋命中低下（30%・2ターン） | 消える |

- 組の順番は関係ない。同じ属性どうしは反応せず、付着の残りが戻る
- **水霧**（`mist`）は、`mist` の組（凍結霧）を先に探し、なければ**水として**照合する（水霧に火 → 蒸発、雷 → 感電）
- **混沌**：攻撃か付着が混沌なら、`chaosPool` からランダムに1つ（`rng`。混沌どうしは起きない）。`reactionTriggered` に `chaos: true`
- **範囲**（決めた）：「隣のマス」（`scope: "adjacent"`）は、標的と**同じ道**の、前後1マス（**同じマスも**）にいる**標的と同じ陣地**の兵士。「同じ道」（`"lane"`）は、同じ道の同じ陣地の兵士全員。となりのレーンには及ばない。忍者は巻き込まない。巻き添えのダメージは属性なし（`cause: "reaction"`。付着・反応は起きない）
- **新しい状態**：鈍足（`slow`。持ち主の進軍のたびに1減る）・命中低下（`blind`。その兵士の戦い・射撃が、天候の霧と同じしくみ（`rollMiss`）でその確率で外れる。持ち主のターンの終わりに1減る）・継続ダメージ（`dot`。持ち主の進軍の前、やけどのあとに受ける。盾は効かない）。重ねがけは量・回数を大きい方にそろえる
- **データの書き方**（`reactions.json`）：`reactions.<id>` に `name`・`elements`（2つ）・`multiplier`（省略・`null` で倍率なし）・`effects`・`attachment`（反応のあとの付着。省略・`null` で消える）。`effects` は `{ kind, ... }` の配列で、`kind` は `status`（`status: "frozen" | "burn"`・`turns`・やけどは `amount`）／`dot`（`amount`・`turns`）／`slow`（`amount`・`turns`）／`blind`（`chance`・`turns`）／`splash`（`ratio`・`scope: "adjacent" | "lane"`。標的は含まない）。`splash` 以外は `scope`（`"target"`（省略）／`"adjacent"`／`"lane"`。標的も含む）で範囲を広げられる
- 忍者：`attachmentChanged` / `reactionTriggered` も忍者の陣地（`stealth`）を付けて隠す（ふつうは忍者に攻撃は当たらない）
- CPU（`strategies.js`）は反応を狙わない（今回は変えていない）
- シミュレーション：`node tests/sim/run.js` は反応ありで回す（`--no-reactions` で反応なし）。表の「反応/試合」は1試合あたりの反応の回数と、1回でも起きた試合の割合
- 確かめたこと（`node tests/sim/run.js --games 200`）：smart 同士は平均42.6手番・p1 勝率49%（反応なし 42.8・49%）、smart vs random は40.7手番・66%（反応なしと同じ）。全試合決着。**反応は1試合あたり0.03〜0.04回（起きた試合は3〜5%）でとても少ない**（のちに、下の「属性の武器・魔法を足した」で増やした）（兵士同士がぶつかるのが1試合3回ほどで、属性の魔法もないため）。反応を遊びの中心にするなら、属性の魔法を足す・CPU に狙わせる・`attachTurns` を延ばす、などを人間と決める
- 画面（UI担当にお願いしたいこと）：付着のアイコン、反応の名前と倍率の演出、鈍足・命中低下・継続ダメージの表示（今は `statusApplied` の汎用の表示が出るだけ）

## 属性の武器・魔法を足した（人間の指示：反応を実際に起きやすくする）

属性の反応が1試合0.03〜0.04回しか起きなかったので、氷・雷の武器と、属性つきの魔法を足し、付着を3ターンに延ばした（`rules.attachTurns` 2 → 3）。既存カードの数値・効果は変えていない。CPU（`strategies.js`）も変えていない（新カードは既存の `damageEnemySoldiers` / 武器なので、既存の扱いで使われる）。**数値はすべて仮。**

| 名前（type） | 種類 | 効果 | 長所 | 短所 | 枚数・合成先 |
|---|---|---|---|---|---|
| 氷の刃（`iceBlade`） | 武器・氷 | 攻撃+1、氷 | 氷の武器（反応の起点が増える） | ほかの武器と同じで、鉄の剣より弱い | コモン1・→鉄の剣 |
| 雷の斧（`thunderAxe`） | 武器・雷 | 攻撃+1、雷 | 水の付着に感電を起こせる | 同上 | コモン1・→鉄の剣 |
| 火炎弾（`flameBolt`） | 魔法・火 | 選んだ1レーンの相手の兵士全員に2 | 火が付着して反応のきっかけになる | サンダー（3）より弱い | コモン1・→サンダー |
| 水流（`waterJet`） | 魔法・水 | 同上（水） | 同上（蒸発・感電・凍結などの起点） | 同上 | 同上 |
| 突風（`gust`） | 魔法・風 | 同上（風） | 同上 | 同上 | 同上 |
| 地鳴り（`tremor`） | 魔法・土 | 同上（土） | 同上 | 同上 | 同上 |
| 氷の礫（`iceShard`） | 魔法・氷 | 同上（氷） | 同上 | 同上 | 同上 |
| 雷撃（`sparkBolt`） | 魔法・雷 | 同上（雷） | 同上 | 同上 | 同上 |

- 魔法は `effect: "damageEnemySoldiers"`・`scope: "lane"`・`amount: 2`・`element`。MP はコモンのコスト（1）。忍者には当たらない・防御を聞くなど、既存の決まりのまま。デッキ対戦（`decks.json`）・コスト制の見本には入れていない（勝率を動かさないため）
- 全員共通の山札は排出率で引くので、コモンが8枚増えたぶん、コモンの中のほかのカードの出る割合は下がる（仕様どおり）。「攻撃と防御の比率」の枚数の記述は、昔の経緯としてそのまま残す
- 周辺：魔法スキン `fxskin_*` を6枚（`data/shop.json`。武器にスキンはない）、ストーリー8枚（`js/ui/stories.js`）、武器の絵文字（`js/ui/look.js`）。専用の絵がないので、カードの絵は名前の仮の絵（`art.js` の `CARD_TYPES` に足すまで）
- テスト：`tests/attribute-cards.test.js`（付着が3ターン残る・水流→火炎弾で蒸発・水流→雷撃で感電・氷の礫→水流で凍結・氷の刃／雷の斧でも付着と反応・1ターン1回の制限）
- 確かめたこと（`node tests/sim/run.js --games 200`）：全組み合わせが決着。**反応は1試合あたり 0.25〜0.29回（起きた試合は22〜23%）**（以前は 0.03〜0.04回・3〜5%）。smart 同士は平均49.8手番・p1 勝率44%（反応なし 50.1手番・45%）、smart vs random は42.6手番・67%。CPU の弱い順は変わらない（random に勝つ割合：defensive 11%・rush 15%・smart 67%）。**遊んで、反応が多すぎ・少なすぎないか確かめる**（rush は属性の魔法を使わないので反応が少ない：0.10回）

## 闇・光・混沌のカードを足した（人間の指示：他の属性のカードも作って）

氷・雷のときと同じ形で、闇・光・混沌の武器3枚と魔法3枚を足した（すべてコモン。既存カードの数値・効果・CPU は変えていない。デッキ対戦・コスト制の見本には入れていない）。**数値はすべて仮。**

| 名前（type） | 種類 | 効果 | 長所 | 短所 | 枚数・合成先 |
|---|---|---|---|---|---|
| 闇の鎌（`darkScythe`） | 武器・闇 | 攻撃+1、闇 | 光の兵士に有利（1.5倍） | 光の兵士に有利を取られる（相性は互い）。鉄の剣より弱い | コモン1・→鉄の剣 |
| 光の槍（`lightLance`） | 武器・光 | 攻撃+1、光 | 闇の兵士に有利（1.5倍） | 同上 | コモン1・→鉄の剣 |
| 混沌の杖（`chaosStaff`） | 武器・混沌 | 攻撃+1、混沌 | 付着・反応の起点になると、混沌の決まりでランダムな反応（`chaosPool`） | 基本の相性はなく（等倍）、何が起きるか選べない | コモン1・→鉄の剣 |
| 闇弾（`shadowBolt`） | 魔法・闇 | 選んだ1レーンの相手の兵士全員に2 | 闇が付着する | サンダー（3）より弱い | コモン1・→サンダー |
| 聖光線（`holyRay`） | 魔法・光 | 同上（光） | 同上 | 同上 | 同上 |
| 混沌の渦（`chaosVortex`） | 魔法・混沌 | 同上（混沌） | 付着や反応がランダムな反応になる | 同上。どの反応が出るか選べない | 同上 |

- 魔法は `effect: "damageEnemySoldiers"`・`scope: "lane"`・`amount: 2`・`element`。MP はコモンのコスト（1）。魔法には魔法スキン `fxskin_shadowBolt` / `fxskin_holyRay` / `fxskin_chaosVortex`（`data/shop.json`）がある（武器にスキンはない）。ストーリー6枚（`js/ui/stories.js`）、武器の絵文字（`js/ui/look.js`）。専用の絵がないので、カードの絵は名前の仮の絵
- 闇・光の付着には反応の表がないので、反応は起きず付着だけ残る（上書き）。混沌は、混沌の付着に別の属性、または混沌の攻撃が付着に当たると、`chaosPool` からランダムに反応が起きる（混沌どうし・属性なしの攻撃では起きない）
- テスト：`tests/attribute-cards2.test.js`（データ検証・闇↔光の相性1.5倍と混沌の等倍・付着・闇光は反応なし・混沌の反応の再現性とばらつき・混沌どうし／無属性は反応なし）
- 確かめたこと（`node tests/sim/run.js --games 200`）：全組み合わせが決着。smart 同士は平均49.3手番・p1 勝率37%±7%・**反応 0.28回/試合（起きた試合25%）**（反応なし：48.8手番・39%）。smart vs random は45.0手番・63%（反応なし 45.3・62%）。CPU の弱い順は変わらない（random に勝つ割合：defensive 10%・rush 17%・smart 63%）。前回（氷・雷まで）は smart 同士 49.8手番・0.29回/試合で、ほぼ同じ。コモンが6枚増えたぶん、コモンの中の出る割合は薄まるだけ。**反応が多すぎ・少なすぎないかは遊んで確かめる**
- まだ作っていない：闇・光・混沌の魔物・ステージ

## 四大陣営（PR-A：基礎スキーマと陣営制限。人間に確認して決めた）

人間が添付した「CASTLE FIELD 四大陣営統合仕様書 v1.0」と全295カードの台帳を `docs/four-factions/` に入れた（受け取ったまま。PR-B 以降とテストの基準）。**実装の判断はこの節を正とする**。仕様書と食い違ったら、実装を止めて人間に確認する。PR-A では、新カード（台帳の「新規案」213枚）・改名・戦闘効果・奥義は作っていない。

- **陣営の印**：`data/cards.json` のカードに任意の `faction`。`kingdom`（王国軍）・`forest`（森の同盟）・`demon`（魔族軍）・`dragon`（竜族帝国）は `data/factions.json` のキー、`common`（全陣営共通）は `js/game/Factions.js` の `COMMON_FACTION`（factions.json には入れない）
  - 台帳の「既存」78枚と「改名」4枚（旧名：炎の剣 `flameSword`・水の槍 `waterSpear`・風の弓 `windBow`・土の槌 `earthHammer`。森。**ID は今のまま**。名前は PR-B1 で台帳の名前（フレイムソード・アクアスピア・ゲイルボウ・アースハンマー）にした）の計82枚に付けた。共通は7種（魔力のかけら〜世界樹のしずく・適応・天の恵み）
  - **faction のないカード＝旧カード**（見習い魔法使い〜賢者・鉄の剣・魔剣・盗賊・財宝系・属性の魔法と武器・チェーン・ブラスト・サイコロ・解毒薬・天候の呪文・ムーンライズ・ドーンブレイク・暗殺者・魔物のカードなど）。陣営モードの候補にはならないが、今までのモード・デッキ編成・魔物のごほうびでは今までどおり使える
- **`implemented`**（任意の true / false。省略は true）：`false` のカードは陣営モードの候補から外す（PR-B1 で、どのモードの引き当てからも外すようにした。「四大陣営（PR-B1）」の節）
- **チェック**（`Card.validateDefinitions`）：`factions` を渡すと `faction` は陣営のIDか `common` だけ（渡さなければ文字列かどうかだけ）。**合成先が別の陣営なら例外**（「○○の合成先は別の陣営です」。カードと `fuseTo` 先の両方に `faction` があって違うとき。`common` → 陣営のカードも不可。片方が旧カードなら確かめない）
- **陣営をまたいでいた合成先は `fuseTo: null`（合成しない）にした**（人間の指示。新しいカードを作って付けかえない）：シールド・ブラスト（王国）→終末の炎（竜族）、ゲイルフォース（森）→氷河（魔族）、天の恵み（共通）→盗賊（旧カード）。**聖騎士（王国）→竜騎士（竜族）も陣営またぎ**なので `null` にした（仕様 5.3 が「撤去／再設計」としている。台帳では聖騎士→グランドパラディン。PR-B1 でグランドパラディン（王国）へつないだ）。この4つは陣営なしの今までのモードでも合成できなくなった（smart 同士600試合：平均48.2→46.6手番・先攻46→47%）
  - （解消済み・PR-B1）森の4つの武器→鉄の剣（旧カード）は、人間の決定で台帳の次の段（ブレイズソード・タイドスピア・ストームボウ・グラナイトハンマー）に付けかえた。鉄の剣は旧カードのまま残る
- **陣営モードの入り口**：`new Game({ ..., factions, setup: { faction: "kingdom" } })`。`deckMode` が `"shared"` のときだけ（`own` / `cost` で指定すると例外「陣営モードは共有山札（deckMode "shared"）だけです」）。全員が同じ陣営の共有山札。`factions` を渡していない・知らない陣営も例外。**省略・`null` なら今までと完全に同じ**（同じシードで山札の並びも同じ）。`getState().faction`
  - デッキ編成（`cost`）・`own`・マイデッキは**陣営の制限なし**（今のまま）。異陣営戦（1人1つの陣営で、個別のランダム山札）は PR-E で別のモードとして作る
- **候補（pool）**：`Factions.js` の `isLegalForFaction(def, factionId)`＝その陣営のカード＋`common`。ただし `weight` が0・`monster` のあるカード・`implemented: false` は入れない。faction のないスペシャル（サイコロ・解毒薬・天候の呪文・刻の魔法・暗殺者）は入らない（仕様の「特殊サイコロは別枠」）。共通の適応は入る
  - Game は `poolOf(playerId)`（今は全員同じ候補。PR-E で席ごとにする）を、カードの種類を選ぶ経路に渡す：**共有山札を作る**（排出率で `deckSize` 枚。`rarities` なしの `count` 枚ずつでも候補の外は入れない）・**運命の祈り**・**幸運の加護**（ドローの引き当て）・**入手券**（`gainCard`。`canBuyUpgrade` も候補の中にそのレアリティがなければ「その強化はありません」）・**排出率の表示**（`getDropRates(viewerId)`。候補の中だけで100%）
  - `js/game/Setup.js` の `dropRates` / `sampleType` / `sampleTypeOfRarity` / `nextRarityWithCards` / `rewardOdds` / `sampleDeckTypes` に任意の `allowed`（種類の Set か `(type, def) => boolean`。省略で今までと同じ）。`cards.json` 全体は絞らない（カードを作る・デッキ編成は全種類が前提）。候補が空なら `sampleType` などは `null`（山札を作るときは例外）
  - **排出率は候補の中で按分される**：候補にないレアリティの割合は、ほかのレアリティに配られる。たとえばスペシャルは候補が適応だけなので、適応の排出率は約2.5% → 約5.9%になる（調整は PR-E）
  - **魔物のごほうびは例外**（仕様 5.1-4）：陣営モードでも候補で絞らない（旧カード・ほかの陣営のカードも出うる。ラッキーで1つ上がるレアリティも全カードで決める）。魔物が育つときのレアリティの繰り上げも、魔物のレアリティの話なので絞らない。`getDropRates` の `monsters` も同じ
  - 合成（`canFuse` / `fuse`）は `fuseTo` をたどるだけなので、上の合成先の検査で同じ陣営になる（適応＋カードX も、X の合成先）
- **部屋**（`server/rooms.js`）：`settings.faction`（`null`＝陣営なし／陣営ID）。部屋主が `setRules` の `faction` で選ぶ（始まる前だけ・ランク戦は不可）。山札が `shared` でないのに選ぶと「陣営モードは共有山札（みんな共通）だけです」、山札を `shared` 以外に変えると陣営は `null` に戻る。`choices.factions`（`[{ id, name }]`。「なし」は画面が先頭に足す）。試合を始めるときに `setup.faction` を Game に渡す（試合中は変わらない）。**画面の陣営の選び方は PR-E で作る**（今は部屋の画面に出ない）
- データの読み込み：`server/server.js` の `loadData`・`js/main.js`・`tests/helpers.js` の `loadOptionalData` が `data/factions.json` を読んで Game に渡す
- シミュレーション：`node tests/sim/run.js --faction kingdom`。PR-A の時点（今の82枚だけ）の smart 同士200試合：王国（候補42種類）平均94.8手番・決着200/200（40%が周回の上限。城への攻撃魔法がないため）／森（24種類）51.8手番・200/200（兵士がいないので72%が魔物で決着）／魔族（19種類）16.6手番・200/200（兵士なし・毒で速い）／竜族（18種類）14.4手番・200/200（兵士は竜騎士だけ）。**どの陣営もカードが足りないので、遊べる形になるのは PR-B 以降**
- テスト：`tests/four-factions-a.test.js`（台帳の数・faction の対応・検査・候補・全経路・合成・部屋）
- これからの PR（仕様書7章）：**B** 台帳の295種類をデータに入れる（改名・合成先の付けかえ・`implemented: false`）→ **C** 戦闘のしくみ（森の精霊反応・魔族の呪い／蘇生・竜族の飛行／轟雷爆炎・王国の浄化／カウンター）→ **D** 陣営奥義のゲージ・画面・演出 → **E** 対戦モード（異陣営戦の個別山札）・排出率の調整・バランス

## 四大陣営（PR-B1：台帳の取り込み 王国軍・全陣営共通・森の武器。人間に確認して決めた）

台帳の295種類を陣営ごとに分けて `data/cards.json` に入れる（B1＝王国軍59・全陣営共通7・森の同盟の武器20の計86行。B2＝森の残り、B3＝魔族、B4＝竜族）。**数値はすべて仮**（仕様書の仮値か、既存カードを雛形にした値）。

- **取り込みの道具**（`docs/four-factions/import/`。読み方は同じ場所の `README.md`）：`mapping.mjs`（**対応表**。台帳の1行ごとに kind・effect・数値・role・`implemented` とその理由・図鑑のストーリー）→ `node docs/four-factions/import/build.mjs`（冪等。`--check` で一致の確認だけ）が `data/cards.json`（新規行の追加・更新と、対応表で決めた既存カードの改名・合成先だけ）・`data/shop.json`（新しい兵士・魔法のスキン）・`js/ui/stories-factions.js`（図鑑のストーリー。`stories.js` が混ぜる）・`table.md`（対応表の一覧）を書き出す。数値を直すときは `mapping.mjs` を直して作り直し、`node js/ui/build-precache.js` も実行する
- **新しいカードのID**：`<chain_id>_<rarity>`（例：`king_cavalry_legendary`）。既存のIDとぶつかったら `build.mjs` が止まる。台帳で `chain_id` が空の8行はどれも既存カード（新しいIDはいらない）
- **機械的に付けるもの**：`faction`・`rarity`・`element`（台帳の属性。**武器と魔法だけ**。兵士に属性を持たせるスキーマはまだない）・`fuseTo`（台帳の `next_name`）・`count: 0`・`weight`（兵士はコモン1・アンコモン0.75・レア以上0.5、ほかは1）
- **カードの新しいキー**（`Card.validateDefinitions`）
  - `implemented: false`：効果がまだないカード。**`effect` を省略できる**（`effectPlan`＝将来の効果の説明。文字列）。どのモードでも引き当てない（陣営なしの山札・運命の祈り・幸運の加護・入手券・魔物のごほうび・陣営モードの候補）・デッキ編成に入れられない（`isDeckable`）・手札に来ても出せない／防御に使えない／合成の元にも先にもならない（「このカードの効果はまだありません」）。`true` のカードは今までどおりの厳しい検査
  - `implementationNote`（文字列）：実装のメモ（false の理由など）。Game は使わない
  - `factionOnly: true`：**陣営モードの候補でだけ引き当てる**（陣営なしの山札・ドローの引き当て・入手券・魔物のごほうびには出ない）。台帳から足した新しいカードに全部付けた。陣営なしのモードの山札を今までと同じにするため（人間に確認していない。報告事項）。デッキ編成（カスタム）には、効果のあるカードなら入れられる（仕様：カスタムは陣営の制限なし）
  - 判定は `Setup.js` の `isDrawable(def, hasPool)`（`dropRates` / `sampleType` / `sampleTypeOfRarity` / `nextRarityWithCards` / `sampleDeckTypes`、Game の `count` 枚ずつの山札・入手券の可否が使う）
- **王国軍**（新規24枚）：
  - グランドパラディン（`king_cavalry_legendary`）：騎兵系の最上位（レジェンド）。HP10・攻撃10・速さ5（竜騎士と同格の仮値）。**聖騎士の合成先**にした（人間の決定。PR-A では null）。`implemented: true`
  - 光の武器：ルミナスランス系5枚（`king_light_lance_*`）・聖鉄の剣・祝福の剣・光輝の剣（`king_light_sword_common/uncommon/rare`。光輝の剣→既存の聖剣→神剣）。攻撃+1/+2/+4/+6/+9・光。`true`。**既存の聖剣・神剣には光属性を付けた**（人間の決定。攻撃+6・+9は変えない。`mapping.mjs` の `reelement`）
  - 光の攻撃魔法：ルミナ〜ディヴァインノヴァ（`king_light_spell_*`）。`damageEnemySoldiers`・光・2/3/5/7/12。コモン〜レアは選んだ1レーン（`scope: "lane"`）、エピック以上は全レーン（仕様の案）。MP はレアリティの標準。`true`
  - 聖術師系5枚（`king_priest_*`。見習い聖術師〜セラフィム）：**`implemented: false`**。浄化・守護の効果も、兵士に光属性を持たせるスキーマもないので、ふつうの魔法使いとして出すと「既存効果の代用」になるため。データは魔法使い型（動かず撃つ。HP4〜10・攻撃2〜9・射程2・2ターン。仮）
  - カウンター5枚（`king_counter_*`。パリィ〜ディヴァインリベンジ）：**`implemented: false`**（防御の場面で軽減・無効・反撃を起こすしくみがない）。`effectPlan` に仕様の仮値
  - 既存の35枚（兵士・回復・盾・城防御・特殊防御）は変えていない。身代わり→反射、ピュリファイ・フレア→大回復は、台帳は合成先なしだが同じ王国なので今のまま
- **全陣営共通**（7枚）：変更なし
- **森の同盟の武器**（新規16枚）：フレイムソード系（火）・アクアスピア系（水）・ゲイルボウ系（風）・アースハンマー系（土）のアンコモン〜レジェンド（`forest_fire_sword_*` / `forest_water_lance_*` / `forest_wind_bow_*` / `forest_earth_hammer_*`）。攻撃+2/+4/+6/+9。`true`
  - コモンの既存4枚は、**名前だけ**台帳の名前に変えた（炎の剣→フレイムソード、水の槍→アクアスピア、風の弓→ゲイルボウ、土の槌→アースハンマー。ID は今のまま）。合成先を鉄の剣から台帳の次の段（ブレイズソード・タイドスピア・ストームボウ・グラナイトハンマー）に付けかえた（人間の決定）。鉄の剣・魔剣は旧カードのまま
- 件数：新規40枚（王国24・森16）。うち `implemented: true` 30枚（王国14・森16）、`false` 10枚（王国の聖術師5・カウンター5）。`cards.json` は 136 → 176種類
- **陣営なしのモードへの影響**：新しいカードは引き当てに出ない（`factionOnly`）。ただし人間が決めた合成先の付けかえ（森の武器4枚・聖騎士）は陣営なしのモードでも効くので、合成で新しいカードが手に入る。smart 同士600試合：平均46.60→46.48手番・先攻46.8→46.5%・決着600/600・周回の上限2.3→2.2%・反応0.27回/試合（付けかえを戻すと PR-A と完全に同じ数字になることを確かめた）
- 確かめたこと（`node tests/sim/run.js --games 200 --match smart,smart --faction …`。PR-A 時点との比較）：
  - 王国：候補 42→56種類、平均 94.8→84.9手番、決着200/200、**周回の上限で決着 40%→27.5%**（光の攻撃魔法で兵士を減らせるようになった。城を攻める魔法はまだない）、先攻42→46%
  - 森：候補 24→40種類、平均 51.8→54.5手番、決着200/200、魔物で決着 72%→80%、「出せる種類が2以上」81%→38%（**森にはまだ兵士がいないので、武器を出す相手がいない**。B2 で兵士が入るまで遊べる形ではない）
- 画面：新しいカードの絵はまだない（名前の1文字目の仮の絵）。説明文は `text.js` が kind / effect から作る（`implemented: false` は `description` の「【準備中】…」）。`node ui-tests/stories.js`・`smoke.js`・`deck-editor.js`・`collection.js`・`all-cards-3d.js` は通る
- テスト：`tests/four-factions-b1.test.js`（台帳との一致・既存136枚の固定ハッシュ・ID衝突・生成の冪等・implemented の除外（全経路）・王国／森の陣営モード・光の魔法のダメージと付着と範囲・光と森の武器の攻撃補正と属性・グランドパラディンの進軍・合成と系統）。`tests/four-factions-a.test.js` は、改名・付けかえに合わせて直した
- **まだ作っていない**：森の残り（兵士・魔法・精霊・回復・防御。B2）・魔族（B3）・竜族（B4）。聖術師・カウンターの効果（PR-C）。陣営奥義（PR-D）。異陣営戦（PR-E）

## 全体の設計（STEP 2〜5 の見通し）

STEP 2 以降で作り直しにならないよう、Game をどう広げるかを先に決めておく。**ここに書いた形は「これから作るときの約束」で、各STEPの実装PRで少しずつ入る。** 入った時点で「ロジックとUIの約束」の表に移す。
ここで決めたことのうち、ゲームの遊び方が変わるもの（道のつなぎ方・魔物の置き場所・3人以上の勝ち方）は、人間の確認を受けてから実装に入る。
**3人以上のルールは、まだ決めていない。** 下の「3人以上のルールの案（STEP 5 で遊んでから決める）」に案として書き、STEP 5 で実際に遊んでから決める。今決めて作るのは、2人の遊び方を変えない土台（席順・`opponentsOf`・対象の選び方・カードID）だけ。

### 2人専用の前提をなくす
今の Game には「2人」が決め打ちされている所がある。これを次のように直す。**席順・道・`roadId` / `targetId`・`getTargets`・カードIDの振り方は、もう入った**（「ロジックとUIの約束」に書いた）。人数を変える `rules.playerCount` と、負けた人の扱いは STEP 5 で入る。

| 今 | 直したあと |
|---|---|
| `PLAYER_IDS = ['p1', 'p2']` | 人数は `rules.playerCount`（2〜8、省略すると2）。IDは席順に `"p1"`〜`"p8"`。`getState().playerOrder` に席順（手番の順）の配列が入る |
| `opponentOf(id)`（相手は1人） | `opponentsOf(id)`（まだ負けていない相手全員）と `neighborsOf(id)`（道でつながっている相手）に分ける |
| 道は1本（`laneLength` マス） | 道は `getState().roads` の配列で表す。**2人なら道は1本（今と同じ）。** 3人以上の道の形は STEP 5 で決める（案は下の「広場」） |
| 兵士の位置は `position` だけ | 兵士は `roadId`（どの道か）と `position`（自分の城から数えたマス）を持つ。`targetId`（道の向こうの人）も入れる（`roadId` と持ち主から分かるが、UIが毎回計算しなくてすむように） |
| 道のマス番号は「p1 の城側が 0」 | 道のマス番号は「その道の `players[0]`（席順が前の人）の城側が 0」。2人なら今と同じ |
| 魔法の相手は自動で決まる（済：城への魔法の届く相手は `rules.castleSpellRange`） | 相手が2人以上いるときは `playCard(cardId, target)` の `target` で選ぶ（下の「対象の選び方」）。対象が1つなら今と同じく省略できる |
| 後攻の城ボーナス（p2 だけ） | `secondPlayerCastleBonus` はそのまま残す（2人用）。3人以上のときは別のキー（`seatCastleBonus`：席ごとのボーナスの配列）を STEP 5 で足す |

- 道の ID（`roadId`）：2人のときは `"p1-p2"`。3人以上のときの決め方は STEP 5 で道の形と一緒に決める
- 手番は席順。`getState()` に `round`（全員が1回ずつ手番を終えると1増える。1から）を足す
- **勝つ人は必ず1人**（引き分けはない）。2人のときは、城を落とされた方の負け（相手の兵士・魔法だけでなく、**魔物に落とされても負け**。下の「魔物」）。城へのダメージは1つずつ順に処理し、どこかの城HPが0以下になった時点でゲームを止める

### 3人以上のルールの案（STEP 5 で遊んでから決める）

ここは**案**。STEP 5 で実際に遊んでから決める。決まるまで、ここに書いたことを前提にした実装を他のSTEPに入れない。

#### 道：真ん中に広場を置く（済：STEP 5 の「真ん中の広場を通る道」。下は最初の案）
輪（となりどうし）ではなく、真ん中に広場を置く形にする。

```
     城A     城B
       ＼   ／
        広場（魔物）
       ／   ＼
     城D     城C
```

- 各城から真ん中の広場へ1本ずつ道がある（8人なら8本）。広場を通って、どの城へも行ける
- 兵士は「自分の城 → 広場 → 狙った城」と進む。狙う城は兵士を出すときに選ぶ（2人なら選ばなくてよい）
- 魔物は広場に1体。いる間は、倒すまで広場の手前で足止め（2人のときのルールと同じ）。どの席からでも同じ条件で狙える
- 魔物のHPや攻撃は、プレイヤーの人数に応じて強くする
- 広場では、他の人の兵士ともぶつかって戦う
- 人数が多いときは、画面をズームアウトできるようにする
- 2人なら「城A ─ 広場 ─ 城B」で、今の1本道とまったく同じ（広場 ＝ 真ん中のマス）
- 広場での乱戦の決まり（誰と誰が戦うか）や、集中攻撃への対策は、STEP 5 で遊びながら決める

#### チーム戦：チームで1つの城を共有し、城HPを増やす（済：STEP 5 の「チーム戦」。下は最初の案。城HPと手番は変えた）
- チームの城は1つ。広場から見た城の数はチーム数になる（2対2なら城2つで、2人戦と同じ形の盤面）
- 勝ち方は「相手チームの城を落とした方の勝ち」
- 城HPは、まず「1人ぶんのHP × チームの人数」から試す
- 手番はチームを交互に回す（チームA → チームB → チームA …）
- 手札は1人ずつ別。チーム内の相談はできる
- 細かい数値は STEP 5 で遊びながら調整する

#### まだ決めていないこと（STEP 5 で決める）
- 3人以上の個人戦の勝ち方（最初に城を落とした人の勝ち／最後の1人まで、など）と、決着しないときの決まり（周回の上限など）
- 魔物が城を落としたときの扱い（2人のときは落とされた方の負け）
- 負けた人が出たときの、その人の道と兵士の扱い
- 3人以上のときの席ごとの城ボーナス
- ファイアボール（すぐ効く・防げない）が誰にでも撃てると、いちばん弱い城に集まりやすい。対象を絞るかは、シミュレーションして決める

### 対象の選び方（済）
- `game.getTargets(cardId)` を足す：そのカードを今出せる対象の一覧を返す（読むだけ。出せないときは空の配列）。UIはこれでタップできる場所を光らせる。対象が1つだけなら `target` を省略してよい
- `target` の形は4つ。キーと値がちょうど一致するものだけ受け付ける（値が `undefined` のキーは無いものとみなす）。違うときは `{ ok: false, reason: "そこには出せません" }`
  - プレイヤー：`{ playerId: "p2" }`（城への魔法・回復・兵士を送る相手）
  - 兵士：`{ soldierId: "s03" }`（武器・盾など、兵士につけるカード）
  - 道のマス：`{ roadId: "p1-p2", square: 1 }`（今は使うカードがない。形だけ残す）
  - 魔物：`{ monsterId: "m01" }`（STEP 3）
- 今のカードの対象

| カード | 対象 | 2人のとき |
|---|---|---|
| 歩兵・騎士 | 送り込む相手 `{ playerId }`（となりの人だけ） | 1人なので省略できる |
| ファイアボール | 城を攻める相手 `{ playerId }`（まだ負けていない相手なら誰でも） | 省略できる |
| サンダー | 兵士を攻める相手 `{ playerId }`。**その人の兵士全員**（どの道にいても）に効く | 省略できる |
| ヒール | 自分 `{ playerId }` | 省略できる |

- `canPlayCard(cardId, target)` も同じ `target` を受け取る。`target` を省略して、対象が2つ以上あるときは `{ ok: true, needsTarget: true }`（出せるけど選ぶ必要がある）。そのまま `playCard(cardId)` を呼ぶと `{ ok: false, reason: "対象を選んでください", needsTarget: true }`

### 1ターンに出せる枚数（STEP 2 から。のちに変更：下の「出せる枚数を増やした」）
- カードは `kind` から決まる `slot` で3つに分かれる（`cards.json` に `slot` は書かない）
  - `"main"`（メイン）：1ターン1枚。兵士・城や兵士を攻める魔法・**ヒール**（回復が何枚も重なって決着しなくならないように、メインにする）
  - `"addon"`（付加）：自分の兵士につける（武器など）。メインと一緒に、何枚でも出せる。**その兵士の次の進軍・戦いから効く**。「この攻撃にこの付加をつける」形にはせず、兵士につける形にする（1枚ずつ `playCard` で出せて、画面も「兵士をタップ」だけで分かるため）
  - `"defense"`（防御）：何枚でも出せる（兵士の盾・城の守り）
- `getState().players.pX.playedThisTurn` は「このターンにメインのカードを出したか」の意味のまま残す。ほかに `cardsPlayedThisTurn`（出した枚数）を足す
- ドローは `drawPerTurn` 枚が最低で、`drawPerPlayed` なら前のターンに出した枚数ぶん（STEP 2 の「ドロー」）

### 出せる枚数を増やした（人間の指示：試合が遅いため）
カードを出せる枚数が少なく試合が遅かったので、出し方（`slot`）を5つにした。**数値は仮**（`data/rules.json`）。
- `soldier`（兵士）：1ターンに `rules.soldiersPerTurn` 枚まで（仮：3。省略すると1。1以上の整数）。`getState().players.pX.soldiersPlayedThisTurn` に出した枚数
- `main`（攻撃の魔法：城・兵士へのダメージ、毒、凍結、天の恵み、神頼み、盗賊。**回復（`healOwnCastle`）もここ**）：1ターン1枚。兵士とは別枠（兵士を出したあとでも1枚出せる）。`playedThisTurn` は「この枠を使ったか」
- `support`（精霊・コインを増やすカード＝`summonSpirit` / `gainCoins`）：メインを使わず何枚でも。回復は、何枚でも使えると決着しなくなるので1枠のまま（人間の指示）
- `addon`（武器）・`defense`（防御）：今までどおり何枚でも
- 出した枚数ぶん次のターンに引く（`drawPerPlayed`）ので、たくさん出すと手札もすぐ戻る
- 確かめたこと（`node tests/sim/run.js --games 200`）：smart 同士は平均手番が58→43、全組み合わせが決着。CPU は smart 系が出せなくなるまで続けて出し、aggro・rush・defensive も兵士・城への魔法を続けて出す。**短くなりすぎていないか、遊んで確かめる**

### カードID（済）
- カードIDはシャッフルしたあとの順に振る（IDから種類が分からないように）。ただし捨て札から山札を作り直すときは同じIDのまま戻るので、一度見たカードはIDで分かる。オンライン（STEP 4）では、相手の `cardDrawn` に `cardIds` を見せない

### 魔物（STEP 3）
- 2人なら道は1本で、魔物は真ん中のマスに1体まで（3人以上は、上の案のとおり広場に1体。STEP 5 で決める）
- `getState().monsters`：魔物の配列（いなければ空の配列）。それぞれ `{ monsterId, type, roadId, square, hp, maxHp, attack, ... }`
- 魔物の攻撃（放置したとき）で城HPが0以下になってもよい。2人のときは、落とされた方の負け（3人以上のときの扱いは STEP 5 で決める）

### 山札（STEP 5 のデッキ対戦。済：「STEP 5」の節）
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
- 見えてはいけない情報（相手の手札の中身・山札の順番）は、**どのイベントのどのキーを誰に見せるかを `js/game/` の中の1か所（表）にまとめ**、サーバーはその表を使ってプレイヤーごとに隠してから送る（知識をロジック側の1か所に置くため）
- ブラウザから見ると、呼び出しは非同期になる（送ってから返事が届く）。UIは Game と同じ名前のメソッドを持つ「クライアント」越しに呼び、返事は Promise で受け取る。出せない理由を前もって出すために、サーバーは状態と一緒に「手札の各カードを今出せるか（`canPlayCard` の結果）と対象の一覧」を送る

### 決まっている方針について
- 「ドラゴンのブレスは合計 50 + 15×(相手の人数−1)」は、城HPが100だったころの数値。今の城HP（40）に合わせて、**数値は `cards.json` で決める**（STEP 2〜3 で、人数に応じて増える形だけを守る）

## 今後の予定（まだ作らない）

STEP 2 以降で追加する。今のSTEPで頼まれていないものは先回りして作らない。作り方の見通しは上の「全体の設計」に書いた。

1. カード拡張：武器・防御・属性・状態異常（STEP 2 で作った。トラップは入れない）
2. 魔物とコイン：中央に出る魔物（ランダム）、とどめボーナス、コインでの強化（STEP 3 で作った）
3. 見た目：イラスト、演出、城が壊れていく表現、効果音
4. オンライン対戦：合言葉で部屋に入る（STEP 4 で作った。上の「STEP 4」）
5. 拡張：最大8人、デッキ対戦、城の種類、勝利条件の設定画面（STEP 5 でロジックを作った。設定画面は画面側）

決まっている方針：
- 防御カードは何枚でも出せる。攻撃は1ターン1枚（付加効果のカードは一緒に出せる）
- ドローは `drawPerTurn` が最低で、`drawPerPlayed` が `true` なら前のターンに出した枚数ぶん引く（人間の指示で変更。以前は1枚固定だった）
- 魔物は放置するとランダムな城を攻撃する
- ドラゴンのブレスは、合計 50 + 15×(相手の人数−1) のダメージを相手全員で分ける
