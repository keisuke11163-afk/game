<!-- 自動生成（node docs/four-factions/import/build.mjs）。中身は mapping.mjs を直す -->
# 台帳 → cards.json の対応（取り込み済みの範囲）

| 陣営 | 区分 | 台帳の名前 | 状態 | ID | 種類 | 効果・数値 | 属性 | 合成先 | implemented | 理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| 王国軍 | 兵士 | 歩兵 | 既存 | `infantry` | soldier | melee HP5/攻5/速2 | — | spearman | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 槍兵 | 既存 | `spearman` | soldier | melee HP4/攻7/速2 | — | heavy | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 重装兵 | 既存 | `heavy` | soldier | melee HP11/攻6/速2 | — | giant | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 巨人 | 既存 | `giant` | soldier | melee HP13/攻9/速2 | — | hero | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 勇者 | 既存 | `hero` | soldier | melee HP16/攻12/速3 | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 斥候騎兵 | 既存 | `scout` | soldier | melee HP3/攻4/速4 | — | cavalry | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 騎兵 | 既存 | `cavalry` | soldier | melee HP4/攻5/速3 | — | knight | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 騎士 | 既存 | `knight` | soldier | melee HP5/攻7/速5 | — | paladin | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 聖騎士 | 既存 | `paladin` | soldier | melee HP8/攻8/速5 | — | king_cavalry_legendary | true | 既存カード（効果・数値・IDは今のまま）。合成先を台帳どおりグランドパラディンにつないだ（人間の決定。PR-A では null） |
| 王国軍 | 兵士 | グランドパラディン | 新規案 | `king_cavalry_legendary` | soldier | melee HP10/攻10/速5 | — | — | true | ふつうの進む兵士（melee）として実際に進軍・戦闘・城攻撃する。騎兵系の最上位（竜騎士の置き換え）なので、竜騎士と同格の HP10・攻撃10・速さ5（仮） |
| 王国軍 | 兵士 | 見習い弓兵 | 既存 | `apprenticeArcher` | soldier | archer HP3/攻3/射2/2T | — | archer | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 弓兵 | 既存 | `archer` | soldier | archer HP4/攻5/射2/2T | — | longbowman | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 長弓兵 | 既存 | `longbowman` | soldier | archer HP5/攻7/射2/2T | — | sniper | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 狙撃手 | 既存 | `sniper` | soldier | archer HP6/攻9/射2/2T | — | skyArcher | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 天弓の射手 | 既存 | `skyArcher` | soldier | archer HP8/攻12/射2/2T | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士 | 見習い聖術師 | 新規案 | `king_priest_common` | soldier | mage HP4/攻2/射2/2T | 光 | king_priest_uncommon | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 兵士 | 聖術師 | 新規案 | `king_priest_uncommon` | soldier | mage HP5/攻3/射2/2T | 光 | king_priest_rare | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 兵士 | 神官 | 新規案 | `king_priest_rare` | soldier | mage HP6/攻5/射2/2T | 光 | king_priest_epic | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 兵士 | 大神官 | 新規案 | `king_priest_epic` | soldier | mage HP8/攻7/射2/2T | 光 | king_priest_legendary | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 兵士 | セラフィム | 新規案 | `king_priest_legendary` | soldier | mage HP10/攻9/射2/2T | 光 | — | **false** | 浄化・守護の効果がまだない。兵士に属性（光）を持たせるスキーマもない（今の兵士の属性は武器で決まる）。ふつうの魔法使いとして出すと「既存効果の代用で実装済み」になるので false（仕様 PR-B） |
| 王国軍 | 武器 | ルミナスランス | 新規案 | `king_light_lance_common` | weapon | 攻撃+1 | light | king_light_lance_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 王国軍 | 武器 | ホーリーランス | 新規案 | `king_light_lance_uncommon` | weapon | 攻撃+2 | light | king_light_lance_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 王国軍 | 武器 | セイクリッドランス | 新規案 | `king_light_lance_rare` | weapon | 攻撃+4 | light | king_light_lance_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 王国軍 | 武器 | セラフィムランス | 新規案 | `king_light_lance_epic` | weapon | 攻撃+6 | light | king_light_lance_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 王国軍 | 武器 | ディヴァインランス | 新規案 | `king_light_lance_legendary` | weapon | 攻撃+9 | light | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 王国軍 | 武器 | 聖鉄の剣 | 新規案 | `king_light_sword_common` | weapon | 攻撃+1 | light | king_light_sword_uncommon | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+1は仕様書の値 |
| 王国軍 | 武器 | 祝福の剣 | 新規案 | `king_light_sword_uncommon` | weapon | 攻撃+2 | light | king_light_sword_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 王国軍 | 武器 | 光輝の剣 | 新規案 | `king_light_sword_rare` | weapon | 攻撃+4 | light | holySword | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 王国軍 | 武器 | 聖剣 | 既存 | `holySword` | weapon | 攻撃+6 | light | godSword | true | 既存カード（効果・数値・IDは今のまま）。台帳は光の剣系（光）。人間の決定で、光属性を付けた（攻撃+6は変えない） |
| 王国軍 | 武器 | 神剣 | 既存 | `godSword` | weapon | 攻撃+9 | light | — | true | 既存カード（効果・数値・IDは今のまま）。台帳は光の剣系（光）。人間の決定で、光属性を付けた（攻撃+9は変えない） |
| 王国軍 | 攻撃魔法 | ルミナ | 新規案 | `king_light_spell_common` | spell | damageEnemySoldiers amount 2 scope lane | light | king_light_spell_uncommon | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。選んだ1レーン・2ダメージは仕様書の仮値 |
| 王国軍 | 攻撃魔法 | ホーリーレイ | 新規案 | `king_light_spell_uncommon` | spell | damageEnemySoldiers amount 3 scope lane | light | king_light_spell_rare | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。選んだ1レーン・3ダメージは仕様書の仮値 |
| 王国軍 | 攻撃魔法 | プリズムバースト | 新規案 | `king_light_spell_rare` | spell | damageEnemySoldiers amount 5 scope lane | light | king_light_spell_epic | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。選んだ1レーン・5ダメージは仕様書の仮値 |
| 王国軍 | 攻撃魔法 | セラフィックレイ | 新規案 | `king_light_spell_epic` | spell | damageEnemySoldiers amount 7 | light | king_light_spell_legendary | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。全レーン・7ダメージは仕様書の仮値 |
| 王国軍 | 攻撃魔法 | ディヴァインノヴァ | 新規案 | `king_light_spell_legendary` | spell | damageEnemySoldiers amount 12 | light | — | true | 既存の damageEnemySoldiers（兵士へのダメージ）に光属性を付けたもの。光の付着・反応（今の実装）まで実際に効く。全レーン・12ダメージは仕様書の仮値 |
| 王国軍 | 回復魔法 | 小回復 | 既存 | `minorHeal` | spell | healOwnCastle amount 5 | — | heal | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 回復魔法 | ヒール | 既存 | `heal` | spell | healOwnCastle amount 10 | — | greatHeal | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 回復魔法 | 大回復 | 既存 | `greatHeal` | spell | healOwnCastle amount 18 | — | holyLight | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 回復魔法 | 聖なる光 | 既存 | `holyLight` | spell | healOwnCastle amount 30 | — | goddess | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 回復魔法 | 女神の祝福 | 既存 | `goddess` | spell | healOwnCastle amount 50 | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 盾 | 既存 | `shield` | defense | shieldSoldier amount 3 | — | bigShield | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 大盾 | 既存 | `bigShield` | defense | shieldSoldier amount 6 | — | steelShield | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 鋼の盾 | 既存 | `steelShield` | defense | shieldSoldier amount 10 | — | holyShield | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 聖盾 | 既存 | `holyShield` | defense | shieldSoldier amount 16 | — | godShield | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 兵士防御 | 神盾 | 既存 | `godShield` | defense | shieldSoldier amount 30 | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 土嚢 | 既存 | `sandbag` | defense | armorCastle amount 3 | — | wall | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 城壁 | 既存 | `wall` | defense | armorCastle amount 5 | — | stoneWall | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 石壁 | 既存 | `stoneWall` | defense | armorCastle amount 9 | — | gate | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 城門 | 既存 | `gate` | defense | armorCastle amount 15 | — | barrier | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 城防御 | 神の結界 | 既存 | `barrier` | defense | armorCastle amount 25 | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 特殊防御・浄化 | 身代わり | 既存 | `decoy` | defense | nullifySoldier | — | reflect | true | 既存カード（効果・数値・IDは今のまま）。台帳は合成先なしだが、今の合成先（反射）は同じ王国なので今のまま |
| 王国軍 | 特殊防御・浄化 | 反射 | 既存 | `reflect` | defense | reflectSpell | — | — | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | 特殊防御・浄化 | ピュリファイ・フレア | 既存 | `purifyFlare` | spell | purifyFlare amount 1 | — | greatHeal | true | 既存カード（効果・数値・IDは今のまま）。台帳は合成先なしだが、今の合成先（大回復）は同じ王国なので今のまま |
| 王国軍 | 特殊防御・浄化 | シールド・ブラスト | 既存 | `shieldBlast` | spell | armorBlast | — | （合成しない） | true | 既存カード（効果・数値・IDは今のまま） |
| 王国軍 | カウンター | パリィ | 新規案 | `king_counter_common` | defense | （効果なし） | — | king_counter_uncommon | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 王国軍 | カウンター | リポスト | 新規案 | `king_counter_uncommon` | defense | （効果なし） | — | king_counter_rare | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 王国軍 | カウンター | アーケインガード | 新規案 | `king_counter_rare` | defense | （効果なし） | — | king_counter_epic | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 王国軍 | カウンター | セイクリッドカウンター | 新規案 | `king_counter_epic` | defense | （効果なし） | — | king_counter_legendary | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 王国軍 | カウンター | ディヴァインリベンジ | 新規案 | `king_counter_legendary` | defense | （効果なし） | — | — | **false** | 防御の場面で、ダメージを減らす・無効にする・攻撃者へ反撃するしくみがまだない（今の防御は城壁・盾・反射・身代わりだけ）。PR-C で作る |
| 森の同盟 | 武器 | フレイムソード | 改名（既存カードを継承） | `flameSword` | weapon | 攻撃+1 | fire | forest_fire_sword_uncommon | true | 既存カード（効果・数値・IDは今のまま）。名前を台帳の名前に変え（旧名：炎の剣）、合成先を鉄の剣からブレイズソードへ付けかえた（人間の決定） |
| 森の同盟 | 武器 | ブレイズソード | 新規案 | `forest_fire_sword_uncommon` | weapon | 攻撃+2 | fire | forest_fire_sword_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 森の同盟 | 武器 | インフェルノセイバー | 新規案 | `forest_fire_sword_rare` | weapon | 攻撃+4 | fire | forest_fire_sword_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 森の同盟 | 武器 | フェニックスブレード | 新規案 | `forest_fire_sword_epic` | weapon | 攻撃+6 | fire | forest_fire_sword_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 森の同盟 | 武器 | イグニスレガリア | 新規案 | `forest_fire_sword_legendary` | weapon | 攻撃+9 | fire | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 森の同盟 | 武器 | アクアスピア | 改名（既存カードを継承） | `waterSpear` | weapon | 攻撃+1 | water | forest_water_lance_uncommon | true | 既存カード（効果・数値・IDは今のまま）。名前を台帳の名前に変え（旧名：水の槍）、合成先を鉄の剣からタイドスピアへ付けかえた（人間の決定） |
| 森の同盟 | 武器 | タイドスピア | 新規案 | `forest_water_lance_uncommon` | weapon | 攻撃+2 | water | forest_water_lance_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 森の同盟 | 武器 | タイダルランス | 新規案 | `forest_water_lance_rare` | weapon | 攻撃+4 | water | forest_water_lance_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 森の同盟 | 武器 | オーシャンランス | 新規案 | `forest_water_lance_epic` | weapon | 攻撃+6 | water | forest_water_lance_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 森の同盟 | 武器 | リヴァイアサンランス | 新規案 | `forest_water_lance_legendary` | weapon | 攻撃+9 | water | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 森の同盟 | 武器 | ゲイルボウ | 改名（既存カードを継承） | `windBow` | weapon | 攻撃+1 | wind | forest_wind_bow_uncommon | true | 既存カード（効果・数値・IDは今のまま）。名前を台帳の名前に変え（旧名：風の弓）、合成先を鉄の剣からストームボウへ付けかえた（人間の決定） |
| 森の同盟 | 武器 | ストームボウ | 新規案 | `forest_wind_bow_uncommon` | weapon | 攻撃+2 | wind | forest_wind_bow_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 森の同盟 | 武器 | サイクロンボウ | 新規案 | `forest_wind_bow_rare` | weapon | 攻撃+4 | wind | forest_wind_bow_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 森の同盟 | 武器 | シルフィードボウ | 新規案 | `forest_wind_bow_epic` | weapon | 攻撃+6 | wind | forest_wind_bow_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 森の同盟 | 武器 | テンペストボウ | 新規案 | `forest_wind_bow_legendary` | weapon | 攻撃+9 | wind | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 森の同盟 | 武器 | アースハンマー | 改名（既存カードを継承） | `earthHammer` | weapon | 攻撃+1 | earth | forest_earth_hammer_uncommon | true | 既存カード（効果・数値・IDは今のまま）。名前を台帳の名前に変え（旧名：土の槌）、合成先を鉄の剣からグラナイトハンマーへ付けかえた（人間の決定） |
| 森の同盟 | 武器 | グラナイトハンマー | 新規案 | `forest_earth_hammer_uncommon` | weapon | 攻撃+2 | earth | forest_earth_hammer_rare | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+2は仕様書の値 |
| 森の同盟 | 武器 | クエイクハンマー | 新規案 | `forest_earth_hammer_rare` | weapon | 攻撃+4 | earth | forest_earth_hammer_epic | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+4は仕様書の値 |
| 森の同盟 | 武器 | テラブレイカー | 新規案 | `forest_earth_hammer_epic` | weapon | 攻撃+6 | earth | forest_earth_hammer_legendary | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+6は仕様書の値 |
| 森の同盟 | 武器 | ガイアクラッシャー | 新規案 | `forest_earth_hammer_legendary` | weapon | 攻撃+9 | earth | — | true | 既存の武器のしくみ（攻撃補正の足し算・最後の武器の属性）で実際に効く。攻撃補正+9は仕様書の値 |
| 全陣営共通 | MP回復 | 魔力のかけら | 既存 | `manaShard` | spell | gainMp amount 1 | 無 | manaDrop | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | MP回復 | 魔力のしずく | 既存 | `manaDrop` | spell | gainMp amount 2 | 無 | manaCrystal | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | MP回復 | 魔力の水晶 | 既存 | `manaCrystal` | spell | gainMp amount 5 | 無 | manaSpring | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | MP回復 | 魔力の泉 | 既存 | `manaSpring` | spell | gainMp amount 10 | 無 | worldTreeDew | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | MP回復 | 世界樹のしずく | 既存 | `worldTreeDew` | spell | gainMp amount 20 | 無 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | 合成補助 | 適応 | 既存 | `adapt` | spell | wild | 無 | — | true | 既存カード（効果・数値・IDは今のまま） |
| 全陣営共通 | 手札操作 | 天の恵み | 既存 | `blessing` | spell | redrawHand | 無 | （合成しない） | true | 既存カード（効果・数値・IDは今のまま） |
