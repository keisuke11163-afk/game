import { UI_CONFIG } from './config.js';
import { DEFAULT_ELEMENTS } from '../game/Elements.js';
const el=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text!==undefined)node.textContent=text;return node;};
export function soldierFamilies(cards){
  return UI_CONFIG.soldierFamilies.map(family=>{const types=[],seen=new Set();let type=family.root;while(cards[type]?.kind==='soldier'&&!seen.has(type)){seen.add(type);types.push(type);type=cards[type].fuseTo;}return {...family,types};});
}
export function renderHelp({cards,rules,monsters,rarities}){
  const box=document.querySelector('#help .help-box'),list=box.querySelector('.help-list');
  const quick=el('section','help-quick');
  const flow=el('p','help-flow');for(const [i,label] of ['カードを選ぶ','光る道に出す','ターン終了'].entries())flow.append(el('span','',`${i+1}. ${label}`));quick.append(flow);
  const road=el('div','help-road');road.setAttribute('role','img');road.setAttribute('aria-label',`自分の城から${rules.laneLength}マスの道を通って相手の城へ。中央に魔物が出ます。`);
  road.append(el('b','','自分の城'));const cells=el('div','help-road-cells');cells.style.gridTemplateColumns=`repeat(${rules.laneLength},minmax(0,1fr))`;
  for(let i=0;i<rules.laneLength;i++)cells.append(el('span',i===Math.floor(rules.laneLength/2)?'middle':'',i===Math.floor(rules.laneLength/2)?'★':'○'));
  road.append(cells,el('b','','相手の城'));quick.append(road,el('p','help-short',`ふたりの盤面：${rules.laneCount??1}本の道から選ぶ。道は${rules.laneLength}マス。兵士は次の自分の番に進む。`));
  quick.append(document.getElementById('help-tutorial'));box.querySelector('.menu-title').after(quick);
  list.replaceChildren();
  for(const text of ['相手の城HPを0にしよう。兵士が城に届くと大ダメージ！','兵士は1ターンに複数枚、攻撃の魔法と回復は合わせて1枚。精霊・コイン・武器・防御、強化、合成は何枚でも使える。',rules.maxMp>0?`攻撃の魔法と精霊は、レアリティの数（コモン1〜レジェンド5）のMPを使う。MPは最大${rules.maxMp}で、マナ回復のカードで増やせる。`:''].filter(Boolean))list.append(el('li','',text));
  const note=box.querySelector('.help-note');
  const details=(title)=>{const section=el('details','help-more');section.append(el('summary','',title));note.before(section);return section;};
  const elements=box.querySelector('.element-guide');
  const attributes=details('属性の強弱を見る');attributes.append(elements,el('p','',`矢印の先の属性に強い（ダメージ${DEFAULT_ELEMENTS.multipliers.advantage}倍）：水→火・土、火→氷、氷→水、風→火、土→雷・風、雷→水、光⇄闇。逆向きは弱い（${DEFAULT_ELEMENTS.multipliers.disadvantage}倍。光と闇は互いに強いだけ）。混沌と属性なしは相性なし。武器で兵士の属性を変えられる。`));
  const monster=details('魔物の駒とごほうび');
  monster.append(el('p','',monsters?`放置すると城を繰り返し攻める${rules.monsterEvolveEvery>0?`。${rules.monsterEvolveEvery}周ごとにレアリティが上がって強くなる`:''}${rules.monsterAttackGrowth>0?`。攻めるたびにダメージがさらに+${rules.monsterAttackGrowth}`:''}。兵士や城への魔法で倒そう。`:'魔物はこの対戦では出現しません。'),el('p','','とどめを刺すと、倒した魔物が兵士カードとして手札に入ります。魔物によっては、ごほうびのカードももう1枚もらえます。'));
  if(rules.rewardLuckyChance>0)monster.append(el('p','',`ラッキーは${Math.round(rules.rewardLuckyChance*100)}%。当たると1つ上のレアリティ（${Object.values(rarities??{}).at(-1)?.name??'最高レアリティ'}はそのまま）。`));
  const multi=details('広場とチーム戦');
  const plaza=el('div','help-plaza');plaza.setAttribute('role','img');plaza.setAttribute('aria-label','自分と相手の城を中央の広場でつなぐ。広場には魔物が1体。');for(const [cls,text]of [['plaza-top','自分の城'],['plaza-left','相手の城'],['plaza-center','広場 ★ 魔物'],['plaza-right','相手の城'],['plaza-bottom','相手の城']])plaza.append(el('span',cls,text));multi.append(plaza,el('p','','3つ以上の城では、広場を通ってどの相手も狙える。広場の魔物は1体。'),el('p','','個人戦は「最初に城を落とした人」か「最後の1人」。最後の1人は長めの対戦。'),el('p','',`チームは城とHPを共有。${rules.teamTurns==='all'?'チームごとに全員が順に動く':'チームを交互に回して1人ずつ動く'}。手札・兵士・コインはそれぞれ別。2チームなら従来のレーンで戦う。`));
  const soldiers=details('兵士の4系統・射程・帰還');
  const families=soldierFamilies(cards);
  soldiers.append(el('p','',`兵士は${Object.values(cards).filter(c=>c.kind==='soldier').length}体。${families.length}系統で、同じカード2枚から同じ系統の次のレアリティへ合成できる。`));
  for(const family of families){const p=el('p','');p.append(el('b','',`${family.name}：`),document.createTextNode(family.note));const def=cards[family.root];if(def?.range)p.append(document.createTextNode(` ${def.name}は射程${def.range}、${def.stay}回の自分の番で帰る。凍結中や撃てない番も残りが減る。`));soldiers.append(p);}
  note.textContent='カードをタップすると効果や、今出せない理由を確認できます。';
}
