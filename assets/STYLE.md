# 絵柄の決まり

キャッスルフィールドの画像は、すべてこの決まりでそろえる。

## 絵柄

- 明るいカートゥーン調のファンタジー（スマホゲームのような、くっきりした絵）
- 太めのこげ茶の輪郭線、やわらかいアニメ塗りの影
- 2頭身のちびキャラ。小さく表示しても形がわかる、シンプルな形
- あたたかく明るい色
- プレイヤーの色：p1 は空色（SKY BLUE）、p2 は夕焼けオレンジ（SUNSET ORANGE）
- 文字は絵に入れない（文字は画面側で重ねる）

## 画像生成AIの使い方

1. 最初に「絵柄の見本」を作り、気に入ったものを `assets/style-reference.png` として保存する
2. 2枚目以降は、見本の画像を添付して「この絵柄で」と伝え、下の「共通の指示文」を先頭に付ける
3. 背景は透明にする。できないAIなら白背景で作り、あとで背景を消す

### 絵柄の見本（最初に1回だけ）

```
Style reference sheet for a 2D fantasy mobile card battle game.
Bright cartoon fantasy style, thick dark-brown outlines, soft cel shading,
warm and cheerful colors, cute chibi proportions, clean shapes readable at small sizes.
On one sheet: a small stone castle with a blue flag, a chibi foot soldier with a sword,
a chibi knight on a small horse, a fireball, a small green meadow tile with a dirt path.
Plain light background, no text.
```

### 共通の指示文（2枚目以降は毎回、先頭に付ける）

```
Same art style as the reference: bright cartoon fantasy mobile game art,
thick dark-brown outlines, soft cel shading, cute chibi proportions,
3/4 top-down view, transparent background, no text, single object centered.
```

## 素材ごとの指示文

### 背景（`bg/board.png`、9:16）

```
Vertical 9:16 game board background. A sunny fantasy meadow seen from 3/4 top-down view.
One winding dirt road runs from the top edge to the bottom edge through the center.
On the road, 5 evenly spaced round stepping stones. The middle (3rd) stone is larger,
surrounded by a ring of small flowers and mushrooms, like a special spot.
Trees, bushes and flowers only near the left and right edges. Leave empty space at the
top and bottom for castles. No castles, no characters, no text.
```

### 城（`castles/castle-blue.png`、`castles/castle-orange.png`）

```
A cute chubby fantasy stone castle, front view, round towers on both sides,
a tall center tower, pointed roofs and a waving flag in SKY BLUE.
Small arched wooden gate. Transparent background.
```

オレンジ版は `SKY BLUE` を `SUNSET ORANGE` に変える。壊れ具合は「with a few cracks」「half collapsed, broken towers」を足して作る。

### 兵士（`units/infantry-blue.png` など）

```
Chibi foot soldier, big round head with a metal helmet and a SKY BLUE plume,
SKY BLUE tunic, holding a short sword raised, brave cute expression,
full body, facing the viewer. Transparent background.
```

```
Chibi knight riding a small chubby horse, metal helmet with a SKY BLUE plume,
holding a SKY BLUE shield and a lance, full body, facing the viewer.
Transparent background.
```

### カードの絵（`cards/card-<カード種類>.png`、1:1）

```
Square card illustration for a fantasy card game, [内容], centered,
simple soft background vignette, no text, no frame.
```

| ファイル | [内容] |
|---|---|
| `card-infantry.png` | a chibi foot soldier charging with a sword |
| `card-knight.png` | a chibi knight galloping on a small horse |
| `card-fireball.png` | a big swirling fireball with a cheeky face |
| `card-thunder.png` | a dark cloud shooting a bright yellow lightning bolt |
| `card-heal.png` | a glowing pink heart surrounded by green sparkles |

### カードの枠（`cards/frame-soldier.png`、`cards/frame-spell.png`、2:3）

```
Empty card frame for a fantasy card game, 2:3 portrait. [種類].
Square window in the upper half for an illustration, blank banner area below for a name,
small round medallion slots in the top-left and top-right corners. No text.
```

- 兵士：Sturdy wooden frame with metal corner rivets
- 魔法：Lavender magic scroll frame with small gold stars

### 演出（`fx/`）

```
Cartoon game effect sprite, [内容], bright colors, transparent background.
```

| ファイル | [内容] |
|---|---|
| `explosion.png` | a round explosion burst with orange flames and white sparks |
| `lightning.png` | a jagged yellow lightning strike hitting the ground |
| `heal.png` | a green healing sparkle burst with small hearts |
| `dust.png` | a puffy brown dust cloud from a clash |
| `fireball.png` | a flying round fireball with a short flame tail, cheeky face, seen from the side |

- `fireball.png` ができるまでは、画面側（`js/ui/assets.js` の `OVERRIDES`）で `cards/card-fireball.png` を丸く切り抜いて代わりに飛ばしている。ファイルを置けば自動で本物に替わる

### 画面の部品（`ui/`）

```
Fantasy mobile game UI element, [内容], cartoon style, transparent background, no text.
```

| ファイル | [内容] |
|---|---|
| `button-end-turn.png` | a wooden plank button with notched ends |
| `sign-hp.png` | a small wooden signboard on a post |
| `banner-win.png` | a red ribbon banner with a gold crown above it |
| `page-handover.png` | an old parchment page with a slightly curled corner |
| `panel-parchment.png` | a horizontal parchment panel with a simple brown border. The border pattern is uniform all around (same thickness and pattern on every side, plain rounded corners), and the center area is completely plain parchment with no marks, so it can be stretched as a 9-slice |
| `icon-heart.png` | a small chubby red heart icon, simple and bold, readable at 16px |
| `icon-sword.png` | a small short sword icon pointing up-right, silver blade and gold guard, simple and bold, readable at 16px |
| `card-back.png` | the back of a fantasy playing card, 2:3 portrait, warm wooden-brown with a gold star emblem in the center and a gold border |

#### 画面の部品の大きさと、文字が乗る場所

画面側で文字や数字を重ねるので、次の場所はあけておく。

| ファイル | 大きさの目安 | 文字が乗る場所・注意 |
|---|---|---|
| `button-end-turn.png` | 512×192 | 板の真ん中に「ターン終了」「もう1回」「使う」などを重ねる |
| `sign-hp.png` | 256×256 | 看板の板（上から 15〜60% あたり）にHPの数字を重ねる |
| `page-handover.png` | 768×1024 | 内側（上下左右 12% より内側）に文字と城の絵を重ねる |
| `banner-win.png` | 1024×512 | 帯の部分（上から 45〜80% あたり）に「プレイヤー1の勝ち！」を重ねる。王冠は帯の上 |
| `panel-parchment.png` | 512×256 | 9分割で伸ばす。ふちの幅は 56px 以内に収め、真ん中は無地にする（`js/ui/config.js` の `panel.slice` と合わせる） |
| `icon-heart.png`、`icon-sword.png` | 128×128 | 兵士の足元とカードのメダルに 13〜16px で出す。細かい模様は入れない |
| `card-back.png` | 512×768 | 相手の手札・山札・捨て札の束に、小さく（幅 21px ほど）出す |

- カードの枠（`frame-*.png`）は、絵の窓・名前の帯・左右のメダルの位置を `js/ui/config.js` の `card.layout` に合わせる（窓：左 12%・上 13%・幅 76%・高さ 50%、名前の帯：上から 75% を中心に高さ 14%、メダル：左右とも上から 10%・横 14% と 86%）。位置が違う枠を作ったら、`card.layout` の数値を直す
- 背景（`bg/board.png`）の飛び石は、画面のマスとぴったり合わなくてよい。マスの位置は `js/ui/config.js` の `board.road` で背景に合わせる
