# 四大陣営の仕様書とカード台帳

- 出どころ：ユーザー（人間）提供の「CASTLE FIELD 四大陣営統合仕様書 v1.0」と、全295カードの台帳（2026-11-21）。中身は受け取ったまま（書き換えない）
  - `CASTLE_FIELD_四大陣営統合仕様書_v1.0.md` … 仕様書
  - `CASTLE_FIELD_4陣営_全295カード台帳_v1.0.json` / `.csv` … カード台帳（`faction`・`section`・`chain_id`・`attribute`・`rarity`・`name`・`status`（既存／新規案／改名）・`next_name`・`note`）
- 使い方：PR-B 以降のカード追加と、テスト（`tests/four-factions-a.test.js`・`tests/four-factions-b1.test.js`）の基準にする。台帳 → `data/cards.json` の取り込みは `import/`（対応表 `mapping.mjs` と生成スクリプト `build.mjs`。`import/README.md`）
- **実装の正は `CLAUDE.md`**（「四大陣営（PR-A）」の節）。仕様書・台帳と `CLAUDE.md` や今の実装が食い違ったら、実装を止めて人間に確認し、`CLAUDE.md` を直す
- 台帳の陣営名 → カードの `faction`：王国軍＝`kingdom`、森の同盟＝`forest`、魔族軍＝`demon`、竜族帝国＝`dragon`、全陣営共通＝`common`
