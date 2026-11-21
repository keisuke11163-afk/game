// 四大陣営 PR-B：台帳と対応表（mapping.mjs）から、カードのデータを書き出す。
//   node docs/four-factions/import/build.mjs          … 書き出す（何度実行しても同じ結果）
//   node docs/four-factions/import/build.mjs --check  … 書き出さずに、今のファイルと一致するかだけ確かめる（違えば終了コード1）
// 書き出すもの：data/cards.json（新規行の追加・更新と、対応表で決めた既存カードの名前・合成先だけ）、
//   data/shop.json（新しい兵士・魔法のスキン）、js/ui/stories-factions.js（図鑑のストーリー）、docs/four-factions/import/table.md（対応表の一覧）
// 既存カードの効果・数値・IDは変えない（対応表の rename / relink だけ）。
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROWS, SCOPE } from './mapping.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const LEDGER_PATH = join(HERE, '..', 'CASTLE_FIELD_4陣営_全295カード台帳_v1.0.json');
const CARDS_PATH = join(ROOT, 'data', 'cards.json');
const SHOP_PATH = join(ROOT, 'data', 'shop.json');
const STORIES_PATH = join(ROOT, 'js', 'ui', 'stories-factions.js');
const TABLE_PATH = join(HERE, 'table.md');

export const FACTION_IDS = { 王国軍: 'kingdom', 森の同盟: 'forest', 魔族軍: 'demon', 竜族帝国: 'dragon', 全陣営共通: 'common' };
export const ELEMENT_IDS = { 火: 'fire', 水: 'water', 風: 'wind', 土: 'earth', 氷: 'ice', 雷: 'thunder', 闇: 'dark', 光: 'light', 混沌: 'chaos', 無: null, '': null };
const RARITIES = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'special'];
/** 兵士の排出の重み（既存の規則：コモン1・アンコモン0.75・レア以上0.5）。兵士以外は1 */
const SOLDIER_WEIGHT = { common: 1, uncommon: 0.75 };
/** スキンの値段（shop.json の既存の値段とそろえる） */
const SKIN_PRICE = { common: 300, uncommon: 600, rare: 1200, epic: 2400, legendary: 4800 };
const SKIN_FILTER = {
  kingdom: { label: '白金', hue: 20, filter: 'hue-rotate(20deg) brightness(1.4)' },
  forest: { label: '若葉', hue: 85, filter: 'hue-rotate(85deg) saturate(1.4)' },
  demon: { label: '紫紺', hue: 250, filter: 'hue-rotate(250deg) brightness(0.8)' },
  dragon: { label: '紅蓮', hue: 330, filter: 'hue-rotate(330deg) saturate(1.6)' },
};

/** 新しいカードのID：台帳の chain_id と rarity */
export function newCardId(row) {
  if (!row.chain_id) throw new Error(`台帳の「${row.name}」に chain_id がありません（ID の規則を README.md に足してから決める）`);
  if (!RARITIES.includes(row.rarity)) throw new Error(`台帳の「${row.name}」の rarity「${row.rarity}」が分かりません`);
  return `${row.chain_id}_${row.rarity}`;
}

export function inScope(row) {
  return SCOPE.some((s) => s.faction === row.faction && (s.section === undefined || s.section === row.section));
}

// ---------- 書式（既存の cards.json：1行に1カード、Python の json.dumps と同じ「, 」「: 」） ----------
function inline(v) {
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  if (v && typeof v === 'object') return `{${Object.entries(v).map(([k, x]) => `${JSON.stringify(k)}: ${inline(x)}`).join(', ')}}`;
  return JSON.stringify(v);
}
export function formatCards(cards) {
  const lines = Object.entries(cards).map(([k, v]) => `  ${JSON.stringify(k)}: ${inline(v)}`);
  return `{\n${lines.join(',\n')}\n}\n`;
}

/** 台帳と対応表から、書き出す中身を作る（ファイルには書かない） */
export function buildAll({ ledger, cards: cardsIn, shop: shopIn }) {
  const rows = ledger.cards.filter(inScope);
  const byName = new Map(ROWS.map((r) => [r.name, r]));
  if (byName.size !== ROWS.length) throw new Error('対応表に同じ名前の行が2つあります');
  for (const r of ROWS) if (!rows.some((x) => x.name === r.name)) throw new Error(`対応表の「${r.name}」は台帳の取り込み範囲にありません`);

  const cards = structuredClone(cardsIn);
  const shop = structuredClone(shopIn);
  const existingNames = new Map(Object.entries(cardsIn).map(([id, d]) => [d.name, id]));

  // 1) 台帳の名前 → カードID
  const idOf = new Map();
  const plan = [];
  for (const row of rows) {
    const m = byName.get(row.name);
    if (!m) throw new Error(`台帳の「${row.name}」（${row.faction}・${row.section}）が対応表にありません`);
    const isNew = row.status === '新規案';
    if (isNew === Boolean(m.existing)) throw new Error(`「${row.name}」：台帳は「${row.status}」だが、対応表は${m.existing ? '既存' : '新規'}`);
    let id;
    if (isNew) {
      id = newCardId(row);
      // 衝突：同じIDの既存カード（新規として前に書き出したものは除く）
      if (Object.hasOwn(cardsIn, id) && cardsIn[id].name !== row.name) throw new Error(`新しいID「${id}」が既存のカード「${cardsIn[id].name}」とぶつかります`);
      const sameName = existingNames.get(row.name);
      if (sameName && sameName !== id) throw new Error(`新しいカード「${row.name}」と同じ名前の既存カード（${sameName}）があります`);
    } else {
      id = m.id;
      if (!Object.hasOwn(cardsIn, id)) throw new Error(`対応表の「${row.name}」の ID「${id}」が cards.json にありません`);
      const oldName = cardsIn[id].name;
      if (oldName !== row.name && !m.rename) throw new Error(`「${row.name}」：cards.json の ${id} の名前は「${oldName}」（改名は rename: true の行だけ）`);
      if (m.rename && !row.status.startsWith('改名')) throw new Error(`「${row.name}」は台帳で改名ではないのに rename が付いています`);
    }
    if ([...idOf.values()].includes(id)) throw new Error(`ID「${id}」が2回使われています`);
    idOf.set(row.name, id);
    plan.push({ row, m, id, isNew });
  }
  const resolve = (name) => idOf.get(name) ?? existingNames.get(name) ?? null;

  // 2) カードの定義
  const newIds = [];
  for (const { row, m, id, isNew } of plan) {
    const faction = FACTION_IDS[row.faction];
    if (!faction) throw new Error(`台帳の陣営「${row.faction}」が分かりません`);
    const next = row.next_name ? resolve(row.next_name) : null;
    if (row.next_name && !next) throw new Error(`「${row.name}」の合成先「${row.next_name}」が見つかりません`);
    if (!isNew) {
      const def = cards[id];
      if (def.faction !== faction) throw new Error(`既存の「${row.name}」（${id}）の faction が ${def.faction}（台帳は ${faction}）`);
      if (m.rename) def.name = row.name;
      if (m.reelement) {
        const el = ELEMENT_IDS[row.attribute];
        if (!el) throw new Error(`「${row.name}」：reelement だが台帳の属性「${row.attribute}」が1つの属性ではありません`);
        def.element = el;
      }
      if (m.relink) {
        if (!next) throw new Error(`「${row.name}」：relink だが台帳に合成先がありません`);
        def.fuseTo = next;
      }
      continue;
    }
    // 複数の属性・属性以外の語（「火・水・風・土」「水・生命」「土・植物」）は、対応表の def に element を書かない行だけ許す（m.multiAttribute）。element は書かない
    if (!m.multiAttribute && !Object.hasOwn(ELEMENT_IDS, row.attribute)) throw new Error(`「${row.name}」の属性「${row.attribute}」は1つの属性ではありません（複数属性は対応表で multiAttribute: true にする）`);
    if (m.multiAttribute && Object.hasOwn(ELEMENT_IDS, row.attribute)) throw new Error(`「${row.name}」：台帳の属性「${row.attribute}」は1つの属性なので multiAttribute は付けられません`);
    if (m.multiAttribute && m.def.element !== undefined) throw new Error(`「${row.name}」：multiAttribute の行の def に element は書けません`);
    const element = m.multiAttribute ? null : ELEMENT_IDS[row.attribute];
    const { kind, ...rest } = m.def;
    const def = { name: row.name, faction, kind, ...rest };
    // 属性：武器・魔法だけ element に書ける（兵士の属性はスキーマにない。対応表の note に残す）
    if (element && (kind === 'weapon' || kind === 'spell')) def.element = element;
    def.count = 0;
    def.rarity = row.rarity;
    if (next) def.fuseTo = next;
    else if (row.rarity !== 'legendary' && row.rarity !== 'special') def.fuseTo = null;
    def.weight = kind === 'soldier' ? (SOLDIER_WEIGHT[row.rarity] ?? 0.5) : 1;
    def.factionOnly = true;
    def.implemented = m.implemented;
    if (m.effectPlan) def.effectPlan = m.effectPlan;
    const notes = [m.implemented ? null : m.reason, m.note].filter(Boolean);
    if (notes.length) def.implementationNote = notes.join(' ／ ');
    if (m.description) def.description = m.description;
    if (typeof m.implemented !== 'boolean') throw new Error(`「${row.name}」の implemented を決めてください`);
    if (!m.reason) throw new Error(`「${row.name}」の reason（implemented の理由）を書いてください`);
    if (!m.story) throw new Error(`「${row.name}」の story を書いてください`);
    cards[id] = def;
    newIds.push(id);
  }

  // 3) スキン（非魔物の兵士 → skin_<ID>、非魔物の魔法 → fxskin_<ID>）
  for (const id of newIds) {
    const def = cards[id];
    const tone = SKIN_FILTER[def.faction] ?? SKIN_FILTER.kingdom;
    const base = { targetName: def.name, name: `${def.name}・${tone.label}`, rarity: def.rarity, price: SKIN_PRICE[def.rarity], gacha: false, world: 'kingdom' };
    if (def.kind === 'soldier') {
      const f = (c) => `grayscale(1) sepia(1) hue-rotate(${tone.hue}deg) saturate(2.6) brightness(.95) drop-shadow(0 0 2px ${c}) drop-shadow(0 0 1px ${c})`;
      shop.items[`skin_${id}`] = { slot: 'charSkin', target: id, ...base, desc: `${def.name}の見た目が「${tone.label}」の色に。このキャラだけに効く。`, filters: { blue: f('#4da3e8'), orange: f('#f5923e') } };
    } else if (def.kind === 'spell') {
      shop.items[`fxskin_${id}`] = { slot: 'spellSkin', target: id, ...base, desc: `${def.name}を使うときの光が「${tone.label}」の色に。この魔法だけに効く。`, filter: tone.filter };
    }
  }

  // 4) 図鑑のストーリー（新しいカードだけ。既存カードは js/ui/stories.js）
  const stories = plan.filter((p) => p.isNew).map((p) => [p.id, p.m.story]);
  const storiesJs = [
    '// 自動生成（node docs/four-factions/import/build.mjs）。手で直さない：docs/four-factions/import/mapping.mjs の story を直して作り直す。',
    '// 四大陣営の台帳から足したカードの、図鑑のストーリー（js/ui/stories.js の CARD_STORIES に混ぜる）。',
    'export const FACTION_STORIES = {',
    ...stories.map(([id, s]) => `  ${id}: ${JSON.stringify(s)},`),
    '};',
    '',
  ].join('\n');

  // 5) 対応表の一覧（レビュー用）
  const show = (d) => {
    if (!d) return '';
    if (d.kind === 'soldier') return `${d.role ?? 'melee'} HP${d.hp}/攻${d.attack}${d.speed ? `/速${d.speed}` : `/射${d.range}/${d.stay}T`}`;
    if (d.kind === 'weapon') return `攻撃+${d.attackBonus}`;
    return [d.effect ?? '（効果なし）', d.amount !== undefined ? `amount ${d.amount}` : '', d.scope ? `scope ${d.scope}` : ''].filter(Boolean).join(' ');
  };
  const table = [
    '<!-- 自動生成（node docs/four-factions/import/build.mjs）。中身は mapping.mjs を直す -->',
    '# 台帳 → cards.json の対応（取り込み済みの範囲）',
    '',
    '| 陣営 | 区分 | 台帳の名前 | 状態 | ID | 種類 | 効果・数値 | 属性 | 合成先 | implemented | 理由 |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...plan.map(({ row, m, id }) => {
      const d = cards[id];
      return `| ${row.faction} | ${row.section} | ${row.name} | ${row.status} | \`${id}\` | ${d.kind} | ${show(d)} | ${d.element ?? (row.attribute || '—')} | ${d.fuseTo ?? (d.fuseTo === null ? '（合成しない）' : '—')} | ${d.implemented === false ? '**false**' : 'true'} | ${m.reason} |`;
    }),
    '',
  ].join('\n');

  return { cards, shop, storiesJs, table, newIds, plan };
}

function main() {
  const check = process.argv.includes('--check');
  const ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
  const cardsText = readFileSync(CARDS_PATH, 'utf8');
  const shopText = readFileSync(SHOP_PATH, 'utf8');
  const out = buildAll({ ledger, cards: JSON.parse(cardsText), shop: JSON.parse(shopText) });
  const files = [
    [CARDS_PATH, cardsText, formatCards(out.cards)],
    [SHOP_PATH, shopText, `${JSON.stringify(out.shop, null, 2)}\n`],
    [STORIES_PATH, null, out.storiesJs],
    [TABLE_PATH, null, out.table],
  ];
  let changed = 0;
  for (const [path, before, after] of files) {
    let current = before;
    if (current === null) { try { current = readFileSync(path, 'utf8'); } catch { current = ''; } }
    if (current === after) continue;
    changed += 1;
    if (check) console.log(`違う：${path}`);
    else writeFileSync(path, after);
  }
  const nNew = out.newIds.length;
  const nFalse = out.newIds.filter((id) => out.cards[id].implemented === false).length;
  console.log(`取り込み：台帳 ${out.plan.length} 行（新規 ${nNew}・うち implemented: false ${nFalse}）。${check ? (changed ? `${changed} ファイルが違う` : 'すべて一致') : `${changed} ファイルを書き出した`}`);
  if (check && changed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
