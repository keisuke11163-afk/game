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
