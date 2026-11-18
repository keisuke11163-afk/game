import { soldierFamilies } from './HelpView.js';
import { cardArt, monsterArt, icon } from './art.js';
import { mountMiniCard } from './cardView.js';
import { KIND_LABEL, cardDescription, cardShort, elementName } from './text.js';
import { currentRates, fusionPaths } from './CardInfo.js';
import { rewardOdds } from '../game/Setup.js';
import { CARD_STORIES } from './stories.js';
import { JAPAN_CARD_STORIES } from './stories-japan.js';
import { isJapan } from './edition.js';

const node = (tag, cls, text) => {
  const el = document.createElement(tag); el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
};
const searchText = value => value.normalize('NFKC').toLocaleLowerCase('ja')
  .replace(/[ぁ-ゖ]/g, kana => String.fromCharCode(kana.charCodeAt(0) + 0x60));

export class CardGuide {
  constructor({ cards, rarities, rules, monsters, getContext, debug }) {
    Object.assign(this, { cards, rarities, rules, monsters, getContext, debug });
    this.filters = { rarity: '', kind: '', family: '', query: '' };
    this.screen = node('div', 'screen dim guide-screen'); this.screen.id = 'card-guide'; this.screen.hidden = true;
    this.box = node('section', 'parchment guide-box');
    this.box.setAttribute('role', 'dialog'); this.box.setAttribute('aria-modal', 'true'); this.box.setAttribute('aria-labelledby', 'guide-title');
    const head = node('div', 'progress-head');
    const title = node('h2', 'menu-title', 'カード・魔物図鑑'); title.id = 'guide-title';
    this.closeButton = node('button', 'round-btn', '×'); this.closeButton.type = 'button'; this.closeButton.setAttribute('aria-label', '一覧を閉じる');
    this.closeButton.onclick = () => this.close(); head.append(title, this.closeButton);
    this.tabs = node('div', 'guide-tabs'); this.tabs.setAttribute('role', 'tablist');
    for (const [key, label] of [['cards', 'カード'], ['monsters', '魔物'], ['rates', '排出率']]) {
      const button = node('button', 'small-btn', label); button.type = 'button'; button.dataset.tab = key; button.id = `guide-tab-${key}`;
      button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', 'guide-content');
      button.onclick = () => this.render(key);
      button.onkeydown = (e) => {
        if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault(); const all = [...this.tabs.children], index = all.indexOf(button);
        const next = all[(index + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length]; next.click(); next.focus();
      };
      this.tabs.append(button);
    }
    this.content = node('div', 'guide-content'); this.content.id = 'guide-content'; this.content.setAttribute('role', 'tabpanel');
    this.box.append(head, this.tabs, this.content); this.screen.append(this.box); document.getElementById('app').append(this.screen);
    this.screen.onclick = (e) => { if (e.target === this.screen) this.close(); };
    this.screen.onkeydown = (e) => {
      if (e.key === 'Escape') this.close();
      if (e.key !== 'Tab') return;
      const items = [...this.box.querySelectorAll('button:not(:disabled), select, input, summary')].filter((el) => el.tabIndex >= 0);
      if (e.shiftKey && document.activeElement === items[0]) { e.preventDefault(); items.at(-1)?.focus(); }
      else if (!e.shiftKey && document.activeElement === items.at(-1)) { e.preventDefault(); items[0]?.focus(); }
    };
    for (const id of ['title-catalog', 'menu-catalog']) document.getElementById(id).onclick = () => {
      document.getElementById('menu').hidden = true; this.open('cards');
    };
  }
  open(tab = 'cards') {
    this.returnFocus = document.activeElement; this.screen.hidden = false; this.render(tab); this.closeButton.focus();
  }
  close() { this.screen.hidden = true; this.returnFocus?.focus({ preventScroll: true }); }
  rates() { return currentRates(this.getContext(), this.cards, this.rarities); }
  render(tab) {
    this.tab = tab;
    for (const button of this.tabs.children) {
      const active = button.dataset.tab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1;
    }
    this.content.setAttribute('aria-labelledby', `guide-tab-${tab}`); this.content.replaceChildren(); this.content.scrollTop = 0;
    if (tab === 'cards') this.renderCards();
    if (tab === 'monsters') this.renderMonsters();
    if (tab === 'rates') this.renderRates();
  }
  renderCards() {
    const families = soldierFamilies(this.cards);
    const search = node('label', 'guide-query', 'カード名で探す');
    const query = node('input', ''); query.type = 'search'; query.value = this.filters.query;
    query.placeholder = '例：歩兵、ドラゴン'; query.autocomplete = 'off';
    search.append(query);
    const filters = node('div', 'guide-filters');
    const fields = [
      ['rarity', 'レアリティ', Object.entries(this.rarities ?? {}).map(([id, r]) => [id, r.name])],
      ['kind', '種類', [...Object.entries(KIND_LABEL), ['beast', '魔物の駒']]],
      ['family', '兵士の系統', families.map(f => [f.root, f.name])],
    ];
    const count = node('p', 'guide-count'); count.setAttribute('role', 'status');
    const results = node('div', 'guide-results');
    const selectByKey = {};
    const update = () => {
      const { rarity, kind, family } = this.filters;
      const search = searchText(query.value.trim());
      const familyCards = families.find(f => f.root === family)?.types;
      for (const [key, select] of Object.entries(selectByKey)) select.value = this.filters[key];
      const matches = Object.entries(this.cards).filter(([type, card]) =>
        (!rarity || card.rarity === rarity)
        && (!kind || (kind === 'beast' ? card.monster : card.kind === kind))
        && (!family || familyCards?.includes(type))
        && (!search || searchText(card.name).includes(search)));
      count.textContent = `${matches.length}種`;
      this.renderCardResults(results, matches);
      if (matches.length) return;
      const reset = node('button', 'small-btn guide-reset', '検索と絞り込みを解除');
      reset.type = 'button';
      reset.onclick = () => {
        this.filters = { rarity: '', kind: '', family: '', query: '' };
        query.value = '';
        update();
        query.focus();
      };
      results.append(node('p', 'progress-empty', 'この条件のカードはありません。'), reset);
    };
    for (const [key, label, options] of fields) {
      const field = node('label', '', label), select = node('select', ''); select.setAttribute('aria-label', label);
      for (const [id, text] of [['', 'すべて'], ...options]) { const option = node('option', '', text); option.value = id; select.append(option); }
      selectByKey[key] = select;
      select.onchange = () => {
        this.filters[key] = select.value;
        if (key === 'family' && select.value) this.filters.kind = 'soldier';
        if (key === 'kind' && select.value !== 'soldier') this.filters.family = '';
        update();
      };
      field.append(select); filters.append(field);
    }
    query.oninput = () => { this.filters.query = query.value; update(); };
    this.content.append(search, filters, count, results);
    update();
  }
  renderCardResults(results, matches) {
    results.replaceChildren();
    if (!matches.length) return;
    const rates = this.rates();
    for (const [rarityId, rarity] of Object.entries(this.rarities ?? {})) {
      const members = matches.filter(([, card]) => card.rarity === rarityId);
      if (!members.length) continue;
      results.append(node('h3', 'guide-group-title', `${rarity.name} · ${members.length}種`));
      const grid = node('div', 'guide-grid');
      for (const [type, def] of members) {
        const button = node('button', 'guide-card'); button.type = 'button'; button.dataset.type = type; button.dataset.zoom = type; // 長押しで拡大（CardZoom.js）
        button.style.setProperty('--rarity', rarity.color);
        const art = node('div', 'guide-art'); mountMiniCard(art, type, def, this.rarities);
        const short = node('span', 'guide-short');
        for (const item of cardShort(def)) { const part = node('span', ''); part.innerHTML = icon(item.icon); part.append(document.createTextNode(String(item.text))); short.append(part); }
        const source = def.monster ? '魔物を倒して獲得' : `${rates[type].toFixed(3)}%`;
        button.append(art, node('b', '', def.name), node('small', '', rarity.name), short, node('small', '', source));
        button.onclick = () => this.showCard(type, button); grid.append(button);
      }
      results.append(grid);
    }
  }
  showCard(type, opener) {
    const tab = this.tab;
    const scrollTop = this.content.scrollTop;
    const def = this.cards[type], rarity = this.rarities?.[def.rarity];
    this.content.replaceChildren(); this.content.scrollTop = 0;
    const backLabel = { cards: 'カード一覧', monsters: '魔物一覧', rates: '排出率' }[tab];
    const back = node('button', 'small-btn', `← ${backLabel}へ`); back.type = 'button';
    back.onclick = () => {
      this.render(tab);
      this.content.scrollTop = scrollTop;
      const selector = `[data-type="${CSS.escape(opener.dataset.type)}"]`;
      this.content.querySelector(selector)?.focus({ preventScroll: true });
    };
    this.content.append(back);
    const hero = node('div', 'guide-card-detail'); hero.style.setProperty('--rarity', rarity?.color ?? '#999');
    const art = node('div', 'guide-detail-art'); mountMiniCard(art, type, def, this.rarities);
    const info = node('div', ''); info.append(node('h3', '', def.name), node('span', 'rarity-label', `${rarity?.name ?? ''} ／ ${KIND_LABEL[def.kind]}`));
    hero.append(art, info);
    const family=soldierFamilies(this.cards).find(f=>f.types.includes(type));
    if(family)info.append(node('p','guide-family-info',`${family.name}：${family.note}`));
    const cost = this.getContext().session?.getState(this.getContext().viewerId)?.mpCosts?.[type]
      ?? (this.rules.maxMp > 0 && ['damageEnemyCastle','damageEnemySoldiers','poisonEnemySoldiers','poisonEnemy','freezeEnemySoldiers','summonSpirit'].includes(def.effect) ? def.mpCost ?? rarity?.mpCost ?? 0 : 0);
    info.append(node('p', 'guide-mp', `MPコスト：${cost}。${def.effect === 'gainMp' ? `MPを${def.amount}回復。上限${this.rules.maxMp}、超過分は失われます。` : 'MPは自然回復しません。'} `));
    this.content.append(hero, node('p', 'guide-effect', cardDescription(def, this.rules, { monsters: Boolean(this.monsters), debug: this.debug })));
    const story = (isJapan ? JAPAN_CARD_STORIES : CARD_STORIES)[type];
    if (story) {
      // カードの物語（読み物）。効果の説明のすぐ下に、開いた状態で出す。たためる
      const box = node('details', 'guide-story'); box.open = true;
      box.append(node('summary', '', 'ストーリー'), node('p', '', story));
      this.content.append(box);
    }
    if(def.kind==='soldier')this.content.append(node('p','guide-movement',def.range?`射程${def.range}マス。出した次の自分の番から撃ち、${def.stay}回で帰還。撃てない・凍結の番も回数が減る。向かってくる兵士とは通常の戦いになる。`:`速さ${def.speed}マス。出した番は動かず、次の自分の番から進軍。城に届くと攻撃力×${this.rules.soldierCastleDamageMultiplier??1}のダメージ。`));
    if (def.monster) {
      this.content.append(node('p', 'progress-note', 'とどめを刺すと手札に入ります。使ったり捨てたりすると、使い切り置き場へ移ります。'));
    } else {
      this.content.append(node('p', 'progress-note', `排出率：${this.rates()[type].toFixed(3)}%（現在の加護・運命の祈りを反映）`));
      this.content.append(node('h4', '', '合成の流れ'));
      for (const path of fusionPaths(type, this.cards)) this.content.append(node('p', 'fusion-path', path.map((id) => this.cards[id].name).join(' → ')));
      this.content.append(node('p', 'progress-note', def.fuseTo ? `同じ${def.name}を2枚で、${this.cards[def.fuseTo].name}に合成できます。` : 'これ以上は合成できません。'));
    }
    back.focus({ preventScroll: true });
  }
  renderMonsters() {
    this.content.append(node('p','guide-note','放置するほど城への攻撃が重くなる。とどめを刺すとカード！ 表示は出現時の基準値で、広場では人数に応じてHPが増えます。'));
    for (const [type, def] of Object.entries(this.monsters ?? {})) {
      const row = node('article', 'guide-monster'); const art = node('div', 'guide-art'); art.innerHTML = monsterArt(type, def.name);
      const info = node('div', ''); info.append(node('h3', '', def.name), node('p', '', `HP ${def.hp} ／ 攻撃 ${def.attack} ／ ${elementName(def.element) || '属性なし'}`));
      info.append(node('p', '', `${def.attackEvery}周ごとに城へ${def.castleAttack}ダメージ。攻めるたびに＋${this.rules.monsterAttackGrowth ?? 0}`));
      if (def.rewardRarity) {
        const odds = rewardOdds(this.cards, this.rarities, def.rewardRarity, this.rules.rewardLuckyChance ?? 0);
        info.append(node('p', 'guide-loot', odds.map((o) => `${this.rarities[o.rarity].name} ${o.rate.toFixed(1)}%${o.lucky ? '（ラッキー）' : ''}`).join(' ／ ')));
      } else info.append(node('p', 'guide-loot', `コイン ${def.reward}`));
      const every = this.rules.monsterEvolveEvery ?? 0;
      if (every > 0) {
        const chain = Object.entries(this.rarities ?? {}).filter(([,r]) => !r.special).map(([id]) => id);
        const start = chain.indexOf(def.rewardRarity);
        const stages = start < 0 ? [] : chain.slice(start).map((id, i) => `${i * every}周後：${this.rarities[id].name}`);
        info.append(node('p', 'guide-growth', `出現から${every}周ごとに成長。HP・攻撃・城への攻撃が${this.rules.monsterEvolveMultiplier}倍（端数調整あり）。${stages.join(' → ')}。最高レア到達後も能力は成長。`));
      }
      const piece = Object.keys(this.cards).find(key => this.cards[key].monster === type);
      if (piece) {
        const link = node('button', 'small-btn guide-beast-link', '仲間になった姿を見る');
        link.type = 'button'; link.dataset.type = piece;
        link.onclick = () => this.showCard(piece, link);
        info.append(link);
      }
      row.append(art, info); this.content.append(row);
    }
  }
  renderRates() {
    const ctx = this.getContext(), luck = ctx.session?.getState(ctx.viewerId)?.players[ctx.viewerId]?.luck;
    const rates = this.rates();
    const perm = ctx.session?.getState(ctx.viewerId)?.players[ctx.viewerId]?.permLuck;
    if (perm) this.content.append(node('p', 'guide-note', `幸運の加護：毎ドロー${Math.round(perm.chance * 100)}%で${this.rarities?.[perm.from ?? ctx.permLuckFrom]?.name ?? '対象'}以上の抽選比率${perm.boost}倍。${luck ? '運命の祈りの残り枚数を先に消費します。' : '通常抽選との混合確率を表示しています。'}`));
    this.content.append(node('p', 'progress-note', luck ? `表示時点の運命の祈り：あと${luck.draws}枚。${this.rarities?.[ctx.luckFrom]?.name ?? '対象レアリティ'}以上の抽選比率を上げ、合計100%に再計算しています。` : '表示は現在のドロー確率です。入手券は指定レアリティ、合成は決まったカードを獲得します。'));
    for (const [id, def] of Object.entries(this.rarities ?? {})) {
      const members = Object.entries(this.cards).filter(([, c]) => c.rarity === id);
      const group = node('details', 'rate-group'); group.style.setProperty('--rarity', def.color);
      const total = members.reduce((sum, [key]) => sum + rates[key], 0);
      const summary = node('summary', 'rate-summary', `${def.name}　${total.toFixed(2)}%`);
      const meter = node('meter', ''); meter.max = 100; meter.value = total; meter.setAttribute('aria-hidden', 'true');
      summary.append(meter);
      group.append(summary);
      for (const [key, card] of members) { const row = node('div', 'rate-row'); row.append(node('span', '', card.name), node('b', '', `${rates[key].toFixed(3)}%`)); group.append(row); }
      this.content.append(group);
    }
    this.content.append(node('h3', '', '魔物の報酬とラッキーの内訳'));
    this.renderMonsters();
  }
}
