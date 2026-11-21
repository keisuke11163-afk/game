// 絵（PNGと代替SVG）。assets/STYLE.md の絵柄（太いこげ茶の輪郭線・明るい色・2頭身のちびキャラ）に合わせて、コードで描いている。
// - 本番PNGを読み込み、読み込み前・失敗時にはコードで描いたSVGを表示する
// - どの種類にどの絵を使うかは、ここで決める（data/ には画像の情報を入れない）
// - カード・魔物を増やしたら、CARD_ART / MONSTER_ART に同じキーで足す。なければ仮の絵（名前の1文字目）になる

const INK = '#4a2e1a';
const SKIN = '#ffe2c4';
const STEEL = '#cfd8e0';
const STEEL_D = '#9aa8b5';

/** プレイヤーの色（p1 は空色、p2 は夕焼けオレンジ） */
export const PLAYER_COLORS = {
  blue: { main: '#4da3e8', light: '#bfe3fb', dark: '#2a6cab' },
  orange: { main: '#f5923e', light: '#ffd9b0', dark: '#c05a1c' },
};

export function colorOf(playerId) {
  return Number(String(playerId).slice(1)) % 2 === 0 ? 'orange' : 'blue';
}

const S = `stroke="${INK}" stroke-linejoin="round" stroke-linecap="round"`;
const svg = (viewBox, body, cls = '', fit = 'xMidYMid meet') =>
  `<svg class="art ${cls}" viewBox="${viewBox}" preserveAspectRatio="${fit}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`;

const face = (cx, cy, s = 1) =>
  `<ellipse cx="${cx - 8 * s}" cy="${cy}" rx="${2.6 * s}" ry="${3.6 * s}" fill="${INK}"/>` +
  `<ellipse cx="${cx + 8 * s}" cy="${cy}" rx="${2.6 * s}" ry="${3.6 * s}" fill="${INK}"/>` +
  `<circle cx="${cx - 14 * s}" cy="${cy + 6 * s}" r="${3.4 * s}" fill="#ff9d9d" opacity=".75"/>` +
  `<circle cx="${cx + 14 * s}" cy="${cy + 6 * s}" r="${3.4 * s}" fill="#ff9d9d" opacity=".75"/>` +
  `<path d="M${cx - 3 * s} ${cy + 7 * s} q${3 * s} ${3 * s} ${6 * s} 0" fill="none" ${S} stroke-width="${2 * s}"/>`;

// ---------- 兵士 ----------

function infantryBody(c) {
  return (
    `<ellipse cx="50" cy="93" rx="26" ry="5" fill="#000" opacity=".18"/>` +
    // 剣
    `<path d="M77 70 L90 34" ${S} stroke-width="9"/><path d="M77 70 L90 34" stroke="#eef3f7" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M70 64 L86 70" ${S} stroke-width="5"/><path d="M70 64 L86 70" stroke="#f2c14e" stroke-width="2" stroke-linecap="round"/>` +
    // 足・体
    `<rect x="35" y="84" width="12" height="9" rx="4" fill="#8a5a32" ${S} stroke-width="3"/>` +
    `<rect x="53" y="84" width="12" height="9" rx="4" fill="#8a5a32" ${S} stroke-width="3"/>` +
    `<path d="M30 86 Q28 60 50 60 Q72 60 70 86 Z" fill="${c.main}" ${S} stroke-width="3.5"/>` +
    `<path d="M33 76 H67" stroke="${c.dark}" stroke-width="4"/>` +
    `<circle cx="74" cy="72" r="5.5" fill="${SKIN}" ${S} stroke-width="3"/>` +
    // 頭・かぶと
    `<circle cx="50" cy="42" r="24" fill="${SKIN}" ${S} stroke-width="3.5"/>` +
    `<path d="M25 42 Q24 15 50 15 Q76 15 75 42 Q50 34 25 42 Z" fill="${STEEL}" ${S} stroke-width="3.5"/>` +
    `<path d="M33 24 Q42 18 52 18" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".8"/>` +
    `<path d="M50 15 Q44 2 54 3 Q62 6 54 15 Z" fill="${c.main}" ${S} stroke-width="3"/>` +
    face(50, 48)
  );
}

function knightBody(c) {
  return (
    `<ellipse cx="50" cy="94" rx="32" ry="5" fill="#000" opacity=".18"/>` +
    // やり
    `<path d="M80 80 L92 14" ${S} stroke-width="7"/><path d="M80 80 L92 14" stroke="#c99a5b" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M92 14 L87 26 L97 25 Z" fill="${STEEL}" ${S} stroke-width="2.5"/>` +
    // 馬
    `<rect x="26" y="80" width="9" height="13" rx="4" fill="#f4ead8" ${S} stroke-width="3"/>` +
    `<rect x="62" y="80" width="9" height="13" rx="4" fill="#f4ead8" ${S} stroke-width="3"/>` +
    `<ellipse cx="50" cy="74" rx="29" ry="15" fill="#fbf4e6" ${S} stroke-width="3.5"/>` +
    `<path d="M28 70 Q50 60 72 70 L70 80 Q50 72 30 80 Z" fill="${c.main}" ${S} stroke-width="3"/>` +
    `<path d="M10 66 Q6 50 20 48 Q32 48 32 62 Q30 74 20 74 Q12 74 10 66 Z" fill="#fbf4e6" ${S} stroke-width="3.5"/>` +
    `<path d="M14 49 L12 40 L21 46 Z" fill="#fbf4e6" ${S} stroke-width="3"/>` +
    `<circle cx="17" cy="60" r="2.4" fill="${INK}"/><path d="M22 48 Q30 44 33 56" fill="none" stroke="${c.dark}" stroke-width="4" stroke-linecap="round"/>` +
    // 乗り手
    `<path d="M38 66 Q36 50 52 50 Q68 50 66 66 Z" fill="${STEEL}" ${S} stroke-width="3.5"/>` +
    `<circle cx="52" cy="34" r="19" fill="${SKIN}" ${S} stroke-width="3.5"/>` +
    `<path d="M32 36 Q31 12 52 12 Q73 12 72 36 Q62 30 60 40 L44 40 Q42 30 32 36 Z" fill="${STEEL}" ${S} stroke-width="3.5"/>` +
    `<path d="M52 12 Q46 0 56 1 Q64 4 56 12 Z" fill="${c.main}" ${S} stroke-width="3"/>` +
    face(52, 41, 0.8) +
    // 盾
    `<path d="M26 54 Q36 50 46 54 Q46 70 36 76 Q26 70 26 54 Z" fill="${c.main}" ${S} stroke-width="3.5"/>` +
    `<path d="M36 57 V71 M30 62 H42" stroke="${c.light}" stroke-width="3" stroke-linecap="round"/>`
  );
}

const UNIT_ART = { infantry: infantryBody, knight: knightBody };

/** 盤面の兵士の絵。知らない種類は、歩兵の絵に名前の1文字目を重ねる */
function svgUnitArt(type, color, name = '') {
  const c = PLAYER_COLORS[color] ?? PLAYER_COLORS.blue;
  const draw = UNIT_ART[type];
  if (draw) return svg('0 0 100 100', draw(c), 'unit-art');
  return svg('0 0 100 100', infantryBody(c) +
    `<text x="50" y="82" font-size="20" font-weight="900" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="4" paint-order="stroke">${escapeText(name.charAt(0))}</text>`, 'unit-art');
}

// ---------- 魔物 ----------

const MONSTER_ART = {
  slime: () =>
    `<ellipse cx="50" cy="92" rx="30" ry="5" fill="#000" opacity=".18"/>` +
    `<path d="M14 78 Q10 40 50 22 Q90 40 86 78 Q86 92 50 92 Q14 92 14 78 Z" fill="#5cc6f2" ${S} stroke-width="4"/>` +
    `<path d="M28 50 Q34 36 46 32" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>` +
    `<ellipse cx="38" cy="64" rx="5" ry="7" fill="${INK}"/><ellipse cx="62" cy="64" rx="5" ry="7" fill="${INK}"/>` +
    `<circle cx="39.5" cy="61" r="2" fill="#fff"/><circle cx="63.5" cy="61" r="2" fill="#fff"/>` +
    `<path d="M42 77 Q50 84 58 77" fill="#e2475b" ${S} stroke-width="3"/>`,
  goblin: () =>
    `<ellipse cx="50" cy="94" rx="28" ry="5" fill="#000" opacity=".18"/>` +
    `<path d="M76 84 L90 40" ${S} stroke-width="12"/><path d="M76 84 L90 40" stroke="#a9753f" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M32 92 Q28 66 50 66 Q72 66 68 92 Z" fill="#9c6b3c" ${S} stroke-width="3.5"/>` +
    `<path d="M24 42 L4 30 L22 54 Z" fill="#7cc45a" ${S} stroke-width="3.5"/><path d="M76 42 L96 30 L78 54 Z" fill="#7cc45a" ${S} stroke-width="3.5"/>` +
    `<circle cx="50" cy="46" r="26" fill="#8ed066" ${S} stroke-width="3.5"/>` +
    `<path d="M32 38 L46 44 M68 38 L54 44" ${S} stroke-width="3.5"/>` +
    `<circle cx="40" cy="48" r="4" fill="#fff36b" ${S} stroke-width="2.5"/><circle cx="60" cy="48" r="4" fill="#fff36b" ${S} stroke-width="2.5"/>` +
    `<path d="M38 60 Q50 68 62 60" fill="none" ${S} stroke-width="3"/><path d="M43 62 l2 -5 l3 6 M53 63 l3 -6 l2 5" fill="#fff" ${S} stroke-width="2"/>`,
  dragon: () =>
    `<ellipse cx="50" cy="94" rx="32" ry="5" fill="#000" opacity=".18"/>` +
    `<path d="M22 60 Q-4 40 6 16 Q16 36 34 42 Z" fill="#f08a3c" ${S} stroke-width="3.5"/><path d="M78 60 Q104 40 94 16 Q84 36 66 42 Z" fill="#f08a3c" ${S} stroke-width="3.5"/>` +
    `<path d="M28 92 Q22 62 50 60 Q78 62 72 92 Z" fill="#e2463c" ${S} stroke-width="3.5"/>` +
    `<path d="M40 92 Q38 74 50 72 Q62 74 60 92 Z" fill="#ffd98a" ${S} stroke-width="3"/>` +
    `<path d="M30 22 L24 4 L40 16 Z" fill="#fff1c9" ${S} stroke-width="3"/><path d="M70 22 L76 4 L60 16 Z" fill="#fff1c9" ${S} stroke-width="3"/>` +
    `<path d="M24 44 Q22 14 50 14 Q78 14 76 44 Q76 66 50 66 Q24 66 24 44 Z" fill="#ee5a48" ${S} stroke-width="3.5"/>` +
    `<path d="M32 34 L46 40 M68 34 L54 40" ${S} stroke-width="3.5"/>` +
    `<ellipse cx="40" cy="43" rx="4" ry="5" fill="#fff36b" ${S} stroke-width="2.5"/><ellipse cx="60" cy="43" rx="4" ry="5" fill="#fff36b" ${S} stroke-width="2.5"/>` +
    `<ellipse cx="40" cy="43" rx="1.2" ry="4" fill="${INK}"/><ellipse cx="60" cy="43" rx="1.2" ry="4" fill="${INK}"/>` +
    `<circle cx="45" cy="56" r="1.8" fill="${INK}"/><circle cx="55" cy="56" r="1.8" fill="${INK}"/>`,
  bat: () =>
    `<ellipse cx="50" cy="94" rx="24" ry="4" fill="#000" opacity=".15"/>` +
    `<path d="M50 50 Q30 22 4 34 Q14 46 12 62 Q26 54 34 66 Q42 58 50 66 Q58 58 66 66 Q74 54 88 62 Q86 46 96 34 Q70 22 50 50 Z" fill="#6b5a99" ${S} stroke-width="3.5"/>` +
    `<circle cx="50" cy="56" r="20" fill="#8a77bd" ${S} stroke-width="3.5"/><path d="M36 42 L34 26 L46 38 Z M64 42 L66 26 L54 38 Z" fill="#8a77bd" ${S} stroke-width="3"/>` +
    `<circle cx="43" cy="54" r="4" fill="#ffe94d" ${S} stroke-width="2"/><circle cx="57" cy="54" r="4" fill="#ffe94d" ${S} stroke-width="2"/><path d="M45 66 l2 5 l3 -5 l3 5 l2 -5" fill="#fff" ${S} stroke-width="2"/>`,
  skeleton: () =>
    `<ellipse cx="50" cy="94" rx="26" ry="4" fill="#000" opacity=".15"/>` +
    `<path d="M34 92 V70 Q50 60 66 70 V92 Z" fill="#efe9d8" ${S} stroke-width="3.5"/><path d="M38 76 H62 M38 84 H62" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M26 46 Q24 14 50 14 Q76 14 74 46 Q74 62 62 62 H38 Q26 62 26 46 Z" fill="#f6f1e2" ${S} stroke-width="3.5"/>` +
    `<ellipse cx="40" cy="42" rx="7" ry="9" fill="${INK}"/><ellipse cx="60" cy="42" rx="7" ry="9" fill="${INK}"/><path d="M50 50 l-3 7 h6 Z" fill="${INK}"/>` +
    `<path d="M40 62 V54 M50 62 V54 M60 62 V54" stroke="${INK}" stroke-width="2.5"/>`,
  golem: () =>
    `<ellipse cx="50" cy="94" rx="34" ry="5" fill="#000" opacity=".18"/>` +
    `<path d="M16 90 Q10 52 30 46 H70 Q90 52 84 90 Z" fill="#9a8a6c" ${S} stroke-width="4"/>` +
    `<rect x="30" y="14" width="40" height="36" rx="8" fill="#b3a280" ${S} stroke-width="4"/>` +
    `<rect x="37" y="26" width="9" height="7" rx="2" fill="#7cdc5a" ${S} stroke-width="2.5"/><rect x="54" y="26" width="9" height="7" rx="2" fill="#7cdc5a" ${S} stroke-width="2.5"/>` +
    `<path d="M24 62 L34 70 M76 60 L68 72" stroke="#6b5f48" stroke-width="3"/><path d="M42 42 h16" ${S} stroke-width="3"/>` +
    `<path d="M20 52 q-4 -6 2 -8 M80 52 q4 -6 -2 -8" fill="none" stroke="#5fae4e" stroke-width="4" stroke-linecap="round"/>`,
  demon: () =>
    `<ellipse cx="50" cy="94" rx="28" ry="5" fill="#000" opacity=".18"/>` +
    `<path d="M24 62 Q4 44 12 20 Q24 38 38 44 Z" fill="#6a2f7a" ${S} stroke-width="3.5"/><path d="M76 62 Q96 44 88 20 Q76 38 62 44 Z" fill="#6a2f7a" ${S} stroke-width="3.5"/>` +
    `<path d="M30 92 Q26 62 50 60 Q74 62 70 92 Z" fill="#8f3f9e" ${S} stroke-width="3.5"/>` +
    `<path d="M30 24 L22 6 L40 18 Z M70 24 L78 6 L60 18 Z" fill="#ffd98a" ${S} stroke-width="3"/>` +
    `<path d="M26 44 Q24 16 50 16 Q76 16 74 44 Q74 64 50 64 Q26 64 26 44 Z" fill="#b45bc6" ${S} stroke-width="3.5"/>` +
    `<path d="M32 34 L46 42 M68 34 L54 42" ${S} stroke-width="3.5"/><circle cx="40" cy="44" r="4" fill="#ff5a4a" ${S} stroke-width="2"/><circle cx="60" cy="44" r="4" fill="#ff5a4a" ${S} stroke-width="2"/>` +
    `<path d="M38 56 Q50 64 62 56" fill="none" ${S} stroke-width="3"/>`,
};

function svgMonsterArt(type, name = '') {
  const draw = MONSTER_ART[type];
  if (draw) return svg('0 0 100 100', draw(), 'monster-art');
  return svg('0 0 100 100',
    `<circle cx="50" cy="52" r="34" fill="#a78bda" ${S} stroke-width="4"/>` +
    `<text x="50" y="64" font-size="34" font-weight="900" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="5" paint-order="stroke">${escapeText(name.charAt(0) || '?')}</text>`, 'monster-art');
}

// ---------- 城 ----------

/** 城。壊れ具合は、親の要素の data-damage（0〜3）に合わせて CSS がひび・煙を出す */
function svgCastleArt(color) {
  const c = PLAYER_COLORS[color] ?? PLAYER_COLORS.blue;
  const stone = '#e6dfd0';
  const stoneD = '#c9bfab';
  const tower = (x, y, w, h) =>
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${stone}" ${S} stroke-width="4"/>` +
    `<path d="M${x + 5} ${y + 16} h${w - 10}" stroke="${stoneD}" stroke-width="3" stroke-linecap="round"/>`;
  const roof = (cx, base, half, top) =>
    `<path d="M${cx - half} ${base} L${cx} ${top} L${cx + half} ${base} Z" fill="${c.main}" ${S} stroke-width="4"/>` +
    `<path d="M${cx - half * 0.45} ${base - 6} L${cx - 2} ${top + 12}" stroke="${c.light}" stroke-width="4" stroke-linecap="round" opacity=".8"/>`;
  const win = (x, y) => `<path d="M${x} ${y + 12} v-8 a5 5 0 0 1 10 0 v8 Z" fill="#6b4a2e" ${S} stroke-width="2.5"/>`;
  return svg('0 0 200 150',
    `<ellipse cx="100" cy="142" rx="86" ry="8" fill="#000" opacity=".16"/>` +
    `<g class="castle-flag"><path d="M100 22 V2" ${S} stroke-width="3.5"/><path d="M101 3 L122 9 L101 15 Z" fill="${c.main}" ${S} stroke-width="3"/></g>` +
    tower(20, 62, 40, 78) + tower(140, 62, 40, 78) + tower(78, 44, 44, 70) +
    `<rect x="46" y="84" width="108" height="56" rx="6" fill="${stone}" ${S} stroke-width="4"/>` +
    `<path d="M46 96 h14 v-8 h12 v8 h14 v-8 h12 v8 h14 v-8 h12 v8 h16" fill="none" stroke="${stoneD}" stroke-width="3" stroke-linejoin="round"/>` +
    roof(40, 64, 27, 26) + roof(160, 64, 27, 26) + roof(100, 46, 29, 12) +
    win(35, 78) + win(155, 78) + win(95, 60) +
    `<path d="M84 140 V118 a16 16 0 0 1 32 0 V140 Z" fill="#8a5a32" ${S} stroke-width="4"/>` +
    `<path d="M100 104 V140 M90 110 V140 M110 110 V140" stroke="#6b4426" stroke-width="2.5"/>` +
    // 壊れ具合（CSS で出し分ける）
    `<g class="castle-crack c1" fill="none" ${S} stroke-width="3"><path d="M58 90 l8 10 l-6 8 l9 12"/><path d="M150 70 l-6 9 l7 7"/></g>` +
    `<g class="castle-crack c2" fill="none" ${S} stroke-width="3"><path d="M132 92 l-9 9 l8 9 l-7 12"/><path d="M92 50 l6 8 l-5 8"/><path d="M30 96 l7 8 l-5 9"/></g>` +
    `<g class="castle-crack c3"><path d="M140 62 L140 48 L150 56 L158 44 L166 56 L180 50 L180 62 Z" fill="${stone}" ${S} stroke-width="4"/><path d="M24 100 l10 6 l-4 10 l10 8" fill="none" ${S} stroke-width="3"/></g>` +
    `<g class="castle-smoke"><circle cx="150" cy="40" r="9"/><circle cx="160" cy="26" r="7"/><circle cx="146" cy="16" r="5"/></g>` +
    `<g class="castle-fire"><path d="M52 84 q-8 -14 2 -22 q0 8 6 8 q-2 -10 6 -16 q-2 10 6 16 q4 8 -4 14 Z" fill="#f5923e" ${S} stroke-width="2.5"/><path d="M58 84 q-4 -8 2 -12 q4 4 2 12 Z" fill="#ffe27a"/></g>`,
    'castle-art');
}

// ---------- カードの絵 ----------

const bg = (a, b) => `<rect width="100" height="100" fill="${a}"/><circle cx="50" cy="50" r="46" fill="${b}" opacity=".6"/>`;

const CARD_ART = {
  adapt: () => bg('#f1e4ff', '#fff6e0') +
    `<defs><linearGradient id="rbw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5d73"/><stop offset=".2" stop-color="#ffb347"/><stop offset=".4" stop-color="#fff176"/><stop offset=".6" stop-color="#5fd98f"/><stop offset=".8" stop-color="#4db8f0"/><stop offset="1" stop-color="#b57cf0"/></linearGradient></defs>` +
    `<path d="M50 8 L90 50 L50 92 L10 50 Z" fill="url(#rbw)" ${S} stroke-width="4"/>` +
    `<path d="M50 8 L50 92 M10 50 L90 50" fill="none" stroke="#fff" stroke-width="2.4" opacity=".7"/>` +
    `<path d="M26 34 L40 20" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>` +
    `<path d="M80 18 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z M18 70 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 Z" fill="#fff" ${S} stroke-width="1.6"/>`,
  antidote: () => bg('#d8f5e4', '#f1fff6') +
    `<path d="M40 14 H60 V28 L74 52 Q82 70 72 82 Q64 90 50 90 Q36 90 28 82 Q18 70 26 52 L40 28 Z" fill="#8fe3b0" ${S} stroke-width="4"/>` +
    `<path d="M38 12 H62" stroke="#7a4a12" stroke-width="7" stroke-linecap="round"/>` +
    `<path d="M30 60 Q50 52 70 60 Q74 72 66 80 Q50 88 34 80 Q26 72 30 60 Z" fill="#3fbf7a" opacity=".85"/>` +
    `<path d="M50 62 v16 M42 70 h16" stroke="#fff" stroke-width="5" stroke-linecap="round"/>` +
    `<circle cx="38" cy="44" r="3" fill="#fff" opacity=".8"/>`,
  infantry: (c) => bg('#cfeeb0', '#eaf8d4') + `<g transform="translate(6 8) scale(.88)">${infantryBody(c)}</g>`,
  knight: (c) => bg('#cfeeb0', '#eaf8d4') + `<g transform="translate(6 8) scale(.88)">${knightBody(c)}</g>`,
  fireball: () => bg('#ffd9a8', '#fff0cf') +
    `<path d="M50 10 Q62 26 76 30 Q90 46 82 66 Q74 90 50 90 Q24 90 18 66 Q12 46 28 34 Q28 46 36 46 Q32 24 50 10 Z" fill="#f2622e" ${S} stroke-width="4"/>` +
    `<path d="M50 34 Q62 44 66 60 Q68 80 50 82 Q32 80 34 62 Q36 52 44 50 Q44 42 50 34 Z" fill="#ffc83d" ${S} stroke-width="3"/>` +
    `<ellipse cx="43" cy="64" rx="2.6" ry="4" fill="${INK}"/><ellipse cx="57" cy="64" rx="2.6" ry="4" fill="${INK}"/><path d="M44 72 q6 5 12 0" fill="none" ${S} stroke-width="2.5"/>`,
  thunder: () => bg('#b9c3e6', '#dfe5f7') +
    `<path d="M22 46 Q8 44 12 30 Q16 18 30 22 Q36 8 52 12 Q66 8 72 22 Q90 20 90 36 Q90 48 76 48 Z" fill="#6c7693" ${S} stroke-width="4"/>` +
    `<path d="M30 30 Q36 20 48 20" fill="none" stroke="#a8b2cc" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M56 40 L38 66 H50 L42 92 L68 58 H55 L64 40 Z" fill="#ffd93b" ${S} stroke-width="4"/>`,
  heal: () => bg('#d6f5cf', '#f0fde9') +
    `<path d="M50 84 Q14 60 18 36 Q22 18 38 22 Q46 24 50 32 Q54 24 62 22 Q78 18 82 36 Q86 60 50 84 Z" fill="#f77f9c" ${S} stroke-width="4"/>` +
    `<path d="M30 36 Q32 28 40 28" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".85"/>` +
    `<path d="M14 70 v12 M8 76 h12 M84 12 v12 M78 18 h12 M82 70 v8 M78 74 h8" stroke="#3fb950" stroke-width="5" stroke-linecap="round"/>`,
  flameSword: () => bg('#ffd2b0', '#ffecd9') +
    `<path d="M24 80 L70 18 Q84 10 80 28 L34 88 Z" fill="#ff8a3d" ${S} stroke-width="4"/>` +
    `<path d="M34 76 L72 26" stroke="#ffe27a" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M14 62 L44 92" ${S} stroke-width="10"/><path d="M14 62 L44 92" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M22 86 L12 94" ${S} stroke-width="9"/><path d="M22 86 L12 94" stroke="#8a5a32" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M78 40 q10 -4 8 -16 q8 10 2 22 Z M52 22 q-2 -10 6 -14 q-2 8 4 12 Z" fill="#f2622e" ${S} stroke-width="2.5"/>`,
  waterSpear: () => bg('#bfe6fb', '#e4f5ff') +
    `<path d="M18 90 L66 30" ${S} stroke-width="9"/><path d="M18 90 L66 30" stroke="#c99a5b" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M58 40 Q52 20 70 8 Q72 22 84 22 Q90 28 76 40 Q70 46 58 40 Z" fill="#4db8f0" ${S} stroke-width="4"/>` +
    `<path d="M66 30 Q66 20 72 16" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".85"/>` +
    `<path d="M28 34 q-7 10 0 14 q7 -4 0 -14 Z M84 58 q-6 9 0 12 q6 -3 0 -12 Z" fill="#7fd0f7" ${S} stroke-width="2.5"/>`,
  windBow: () => bg('#d8f5e6', '#f0fff8') +
    `<path d="M24 12 Q80 50 24 88" fill="none" ${S} stroke-width="9"/><path d="M24 12 Q80 50 24 88" fill="none" stroke="#c99a5b" stroke-width="4.5" stroke-linecap="round"/>` +
    `<path d="M24 12 L24 88" stroke="${INK}" stroke-width="2.5"/><path d="M24 50 H88" ${S} stroke-width="5"/><path d="M88 50 l-10 -7 v14 Z" fill="${STEEL}" ${S} stroke-width="3"/>` +
    `<path d="M40 24 q12 -8 24 0 M46 76 q12 8 24 0" fill="none" stroke="#5fd0a0" stroke-width="4" stroke-linecap="round"/>`,
  earthHammer: () => bg('#ecdcc2', '#f6ead4') +
    `<path d="M26 92 L58 40" ${S} stroke-width="10"/><path d="M26 92 L58 40" stroke="#a9753f" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M40 30 L60 12 L90 36 L72 56 Z" fill="#b0834f" ${S} stroke-width="4"/>` +
    `<path d="M52 28 L64 20" stroke="#e4c79a" stroke-width="4" stroke-linecap="round"/>` +
    `<path d="M14 84 l8 -8 l8 8 M70 86 l6 -6 l6 6" fill="none" stroke="#8a6a3f" stroke-width="3.5" stroke-linecap="round"/>`,
  shield: () => bg('#cfe0f2', '#eaf2fb') +
    `<path d="M50 10 Q68 20 84 20 Q86 62 50 90 Q14 62 16 20 Q32 20 50 10 Z" fill="#6f9fd8" ${S} stroke-width="4"/>` +
    `<path d="M50 20 Q62 27 74 28 Q74 56 50 78 Z" fill="#8fb8e8"/>` +
    `<path d="M50 30 l6 13 l14 1 l-11 9 l4 14 l-13 -8 l-13 8 l4 -14 l-11 -9 l14 -1 Z" fill="#ffd93b" ${S} stroke-width="3"/>`,
  wall: () => bg('#e6dcc8', '#f6efe0') +
    `<path d="M10 88 V34 h14 v-12 h14 v12 h12 v-12 h14 v12 h12 v-12 h14 v12 h0 V88 Z" fill="#d9cfbb" ${S} stroke-width="4"/>` +
    `<path d="M10 52 H90 M10 70 H90 M30 34 V52 M60 34 V52 M44 52 V70 M74 52 V70 M26 70 V88 M56 70 V88" stroke="#a89c84" stroke-width="3"/>` +
    `<path d="M18 40 h8" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>`,
  poisonMist: () => bg('#d9c7ef', '#efe5fb') +
    `<path d="M18 62 Q4 58 10 44 Q14 34 26 38 Q30 22 46 26 Q58 14 70 28 Q88 26 90 44 Q96 60 80 64 Q76 78 60 72 Q50 84 38 74 Q24 78 18 62 Z" fill="#9b6fd6" ${S} stroke-width="4"/>` +
    `<circle cx="40" cy="48" r="7" fill="#c9f26b" ${S} stroke-width="3"/><circle cx="62" cy="48" r="7" fill="#c9f26b" ${S} stroke-width="3"/>` +
    `<path d="M44 62 h4 v4 h4 v-4 h4" fill="none" ${S} stroke-width="3"/>` +
    `<circle cx="24" cy="86" r="5" fill="#c9f26b" ${S} stroke-width="2.5"/><circle cx="78" cy="84" r="3.5" fill="#c9f26b" ${S} stroke-width="2.5"/>`,
  frostBreath: () => bg('#cfeefb', '#eefaff') +
    `<g ${S} stroke-width="6" fill="none"><path d="M50 12 V88 M17 31 L83 69 M17 69 L83 31"/><path d="M40 20 L50 30 L60 20 M40 80 L50 70 L60 80 M19 45 L32 40 L28 26 M81 55 L68 60 L72 74 M19 55 L32 60 L28 74 M81 45 L68 40 L72 26"/></g>` +
    `<g stroke="#8fdcff" stroke-width="2.5" stroke-linecap="round" fill="none"><path d="M50 12 V88 M17 31 L83 69 M17 69 L83 31"/></g>` +
    `<circle cx="50" cy="50" r="8" fill="#e9faff" ${S} stroke-width="3"/>`,
  chainBlast: () => bg('#ffe0b8', '#fff4e4') +
    `<g ${S} stroke-width="4"><circle cx="50" cy="50" r="16" fill="#ff8a3d"/><circle cx="20" cy="34" r="9" fill="#ffc06b"/><circle cx="80" cy="34" r="9" fill="#ffc06b"/><circle cx="34" cy="80" r="8" fill="#ffc06b"/><circle cx="68" cy="80" r="8" fill="#ffc06b"/></g>` +
    `<g stroke="#ff8a3d" stroke-width="3" stroke-dasharray="4 4" fill="none"><path d="M36 44 L27 37 M64 44 L73 37 M42 63 L37 73 M58 63 L64 73"/></g>`,
  ignitionBurst: () => bg('#ffc7a6', '#ffe9d8') +
    `<path d="M50 8 Q62 28 74 34 Q92 50 82 72 Q72 92 50 92 Q26 92 18 70 Q10 48 30 34 Q34 46 42 44 Q38 24 50 8 Z" fill="#f2622e" ${S} stroke-width="4"/>` +
    `<path d="M50 44 Q62 56 60 70 Q56 80 48 78 Q38 74 42 60 Q44 52 50 44 Z" fill="#ffd23d" ${S} stroke-width="3"/>`,
  shieldBlast: () => bg('#cfe0f5', '#eef5ff') +
    `<path d="M50 12 L82 24 V50 Q82 76 50 90 Q18 76 18 50 V24 Z" fill="#8fb8e8" ${S} stroke-width="4"/>` +
    `<g ${S} stroke-width="4" fill="#ffd23d"><path d="M50 30 L56 46 L72 46 L59 56 L64 72 L50 62 L36 72 L41 56 L28 46 L44 46 Z"/></g>`,
  purifyFlare: () => bg('#fff3c4', '#fffbe8') +
    `<path d="M50 14 Q60 34 70 40 Q84 54 74 72 Q64 88 50 88 Q34 88 26 72 Q18 54 32 42 Q38 50 44 48 Q40 30 50 14 Z" fill="#ffe27a" ${S} stroke-width="4"/>` +
    `<path d="M50 48 V76 M38 62 H62" ${S} stroke-width="5"/>`,
  moonrise: () => bg('#3b3f78', '#6d6fb3') +
    `<circle cx="54" cy="46" r="26" fill="#fff4c4" ${S} stroke-width="4"/><circle cx="66" cy="38" r="22" fill="#4b4f8c"/>` +
    `<g fill="#fff4c4"><circle cx="20" cy="22" r="2.5"/><circle cx="82" cy="78" r="2"/><circle cx="28" cy="80" r="2"/></g>`,
  dawnbreak: () => bg('#ffd59a', '#fff3dc') +
    `<path d="M8 74 H92" ${S} stroke-width="5"/><path d="M24 74 A26 26 0 0 1 76 74 Z" fill="#ffb347" ${S} stroke-width="4"/>` +
    `<g ${S} stroke-width="4"><path d="M50 30 V40 M24 42 L31 49 M76 42 L69 49 M12 62 H22 M78 62 H88"/></g>`,
  assassin: (c) => bg('#4a4458', '#7a7190') + `<g transform="translate(6 8) scale(.88)">${infantryBody(c)}</g>` +
    `<path d="M22 40 Q50 22 78 40 L74 52 Q50 42 26 52 Z" fill="#2b2633" ${S} stroke-width="3"/>`,
  galeForce: () => bg('#d8f3e6', '#f1fbf6') +
    `<g ${S} stroke-width="6" fill="none"><path d="M14 36 H62 Q78 36 78 24 Q78 14 68 14 Q60 14 60 22"/><path d="M10 54 H76 Q90 54 90 66 Q90 78 78 78 Q68 78 68 70"/><path d="M20 72 H48"/></g>` +
    `<g stroke="#8fe0b8" stroke-width="2.5" stroke-linecap="round" fill="none"><path d="M14 36 H62 Q78 36 78 24 Q78 14 68 14 Q60 14 60 22"/><path d="M10 54 H76 Q90 54 90 66 Q90 78 78 78 Q68 78 68 70"/><path d="M20 72 H48"/></g>`,
  // 追加カード：もとの絵を使い回し、背景の色と一部の飾りで見分ける（専用の絵ができたら差しかえる）
  spearman: (c) => bg('#cfeeb0', '#eaf8d4') + `<g transform="translate(6 8) scale(.88)">${infantryBody(c)}</g>` +
    `<path d="M88 92 L72 14" ${S} stroke-width="8"/><path d="M88 92 L72 14" stroke="#c99a5b" stroke-width="4" stroke-linecap="round"/><path d="M72 4 L79 20 L65 20 Z" fill="${STEEL}" ${S} stroke-width="3"/>`,
  heavy: (c) => bg('#d6dbe3', '#eef1f5') + `<g transform="translate(6 8) scale(.88)">${infantryBody(c)}</g>` +
    `<path d="M62 52 Q78 56 86 52 Q86 74 74 86 Q62 74 62 52 Z" fill="${STEEL}" ${S} stroke-width="4"/>`,
  giant: (c) => bg('#e8d3b8', '#f7ecdd') + `<g transform="translate(-8 -4) scale(1.1)">${knightBody(c)}</g>`,
  meteor: () => bg('#ffc9a0', '#ffe9d2') +
    `<path d="M84 8 L30 56" stroke="#f2622e" stroke-width="14" stroke-linecap="round" opacity=".55"/>` +
    `<circle cx="34" cy="62" r="26" fill="#8a6a50" ${S} stroke-width="4"/><circle cx="26" cy="56" r="6" fill="#6b4f3a"/><circle cx="42" cy="72" r="5" fill="#6b4f3a"/>` +
    `<path d="M16 40 q-6 -14 4 -22 q0 8 6 8 q-2 -8 4 -12 q-2 10 4 14 Z" fill="#ffc83d" ${S} stroke-width="2.5"/>`,
  bigThunder: () => bg('#8f9bd0', '#c9d1f0') +
    `<path d="M22 46 Q8 44 12 30 Q16 18 30 22 Q36 8 52 12 Q66 8 72 22 Q90 20 90 36 Q90 48 76 48 Z" fill="#4c5578" ${S} stroke-width="4"/>` +
    `<path d="M48 36 L26 68 H42 L32 94 L66 54 H50 L62 36 Z" fill="#ffe94d" ${S} stroke-width="4"/>`,
  venom: () => bg('#c2e08a', '#e4f4c4') +
    `<path d="M50 10 Q74 40 74 60 Q74 86 50 88 Q26 86 26 60 Q26 40 50 10 Z" fill="#8fd13a" ${S} stroke-width="4"/>` +
    `<circle cx="42" cy="56" r="5" fill="${INK}"/><circle cx="58" cy="56" r="5" fill="${INK}"/><path d="M42 72 h16" ${S} stroke-width="3"/>`,
  deepFreeze: () => bg('#a9dcf5', '#e2f5ff') +
    `<path d="M50 6 L70 38 L94 50 L70 62 L50 94 L30 62 L6 50 L30 38 Z" fill="#bfeaff" ${S} stroke-width="4"/>` +
    `<path d="M50 20 L50 80 M20 50 H80" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".9"/>`,
  ironSword: () => bg('#dfe3ea', '#f3f5f8') +
    `<path d="M24 80 L70 18 Q84 10 80 28 L34 88 Z" fill="${STEEL}" ${S} stroke-width="4"/>` +
    `<path d="M34 76 L72 26" stroke="#fff" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M14 62 L44 92" ${S} stroke-width="10"/><path d="M14 62 L44 92" stroke="#f2c14e" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M22 86 L12 94" ${S} stroke-width="9"/><path d="M22 86 L12 94" stroke="#8a5a32" stroke-width="4.5" stroke-linecap="round"/>`,
  bigShield: () => bg('#b7cdea', '#dbe8f7') +
    `<path d="M50 4 Q72 16 94 16 Q96 66 50 96 Q4 66 6 16 Q28 16 50 4 Z" fill="#4f82c4" ${S} stroke-width="4"/>` +
    `<path d="M50 20 l8 17 l18 2 l-14 12 l5 18 l-17 -10 l-17 10 l5 -18 l-14 -12 l18 -2 Z" fill="#ffd93b" ${S} stroke-width="3"/>`,
  // ゴッドフィールド風の新カード（仮の絵）
  reflect: () => bg('#d8ecfb', '#f0f8ff') +
    `<circle cx="50" cy="50" r="34" fill="#e6f4ff" ${S} stroke-width="4"/><circle cx="50" cy="50" r="22" fill="#bfe3fb" ${S} stroke-width="3"/>` +
    `<path d="M30 70 L72 28 M72 28 H56 M72 28 V44" fill="none" ${S} stroke-width="7"/><path d="M30 70 L72 28 M72 28 H56 M72 28 V44" fill="none" stroke="#ffd93b" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  decoy: () => bg('#efe0c8', '#faf1e0') +
    `<path d="M50 14 Q70 14 70 34 Q70 48 58 52 L64 90 H36 L42 52 Q30 48 30 34 Q30 14 50 14 Z" fill="#e8c88f" ${S} stroke-width="4"/>` +
    `<ellipse cx="43" cy="34" rx="2.6" ry="3.6" fill="${INK}"/><ellipse cx="57" cy="34" rx="2.6" ry="3.6" fill="${INK}"/><path d="M44 44 q6 4 12 0" fill="none" ${S} stroke-width="2.5"/>` +
    `<path d="M22 70 L38 62 M78 70 L62 62" ${S} stroke-width="5"/>`,
  blessing: () => bg('#fff3c4', '#fffbe6') +
    `<circle cx="50" cy="50" r="30" fill="#fff3a8" ${S} stroke-width="4"/>` +
    `<g stroke="#ffcf3f" stroke-width="5" stroke-linecap="round"><path d="M50 4 V16 M50 84 V96 M4 50 H16 M84 50 H96 M18 18 L26 26 M74 74 L82 82 M82 18 L74 26 M26 74 L18 82"/></g>` +
    `<path d="M50 36 l4 9 l10 1 l-8 7 l3 10 l-9 -6 l-9 6 l3 -10 l-8 -7 l10 -1 Z" fill="#fff" ${S} stroke-width="3"/>`,
  prayer: () => bg('#e6d6f5', '#f5ecfc') +
    `<path d="M50 90 V60 M36 60 Q36 36 50 28 Q64 36 64 60 Z" fill="#f2d2a8" ${S} stroke-width="4"/>` +
    `<path d="M40 56 L50 70 L60 56" fill="none" ${S} stroke-width="4"/>` +
    `<text x="50" y="30" font-size="40" font-weight="900" text-anchor="middle" fill="#ffd93b" stroke="${INK}" stroke-width="4" paint-order="stroke">?</text>` +
    `<circle cx="20" cy="30" r="4" fill="#ffd93b" ${S} stroke-width="2"/><circle cx="82" cy="40" r="3.5" fill="#ffd93b" ${S} stroke-width="2"/>`,
  thief: () => bg('#d5d8e3', '#eceef5') +
    `<path d="M16 60 Q16 22 50 22 Q84 22 84 60 Z" fill="#4a4f66" ${S} stroke-width="4"/>` +
    `<rect x="22" y="40" width="56" height="16" rx="8" fill="#f2d2a8" ${S} stroke-width="3.5"/>` +
    `<ellipse cx="38" cy="48" rx="3.4" ry="3" fill="${INK}"/><ellipse cx="62" cy="48" rx="3.4" ry="3" fill="${INK}"/>` +
    `<rect x="30" y="64" width="24" height="30" rx="4" fill="#b0703c" ${S} stroke-width="3.5" transform="rotate(-12 42 80)"/>` +
    `<rect x="52" y="62" width="24" height="30" rx="4" fill="#4da3e8" ${S} stroke-width="3.5" transform="rotate(10 64 78)"/>`,
  // 精霊カード（仮の絵：色と形で見分ける。大精霊は光の輪つき）
  fireSpirit: () => spiritArt('#ffd9a8', '#f2622e', '#ffc83d'),
  greatFireSpirit: () => spiritArt('#ffd9a8', '#f2622e', '#ffc83d', true),
  waterSpirit: () => spiritArt('#cdeafb', '#4db8f0', '#e4f6ff'),
  greatWaterSpirit: () => spiritArt('#cdeafb', '#4db8f0', '#e4f6ff', true),
  windSpirit: () => spiritArt('#d8f5e6', '#5fd0a0', '#f0fff8'),
  greatWindSpirit: () => spiritArt('#d8f5e6', '#5fd0a0', '#f0fff8', true),
  earthSpirit: () => spiritArt('#ecdcc2', '#b0834f', '#f6ead4'),
  greatEarthSpirit: () => spiritArt('#ecdcc2', '#b0834f', '#f6ead4', true),
  // 魔法の追加カード（仮の絵：既存の絵の色違い）
  minorHeal: () => bg('#e2f7d8', '#f5fdee') +
    `<path d="M50 78 Q22 58 25 40 Q28 28 40 31 Q46 33 50 39 Q54 33 60 31 Q72 28 75 40 Q78 58 50 78 Z" fill="#f9a1b4" ${S} stroke-width="4"/>` +
    `<path d="M80 14 v12 M74 20 h12" stroke="#3fb950" stroke-width="5" stroke-linecap="round"/>`,
  toxicRain: () => bg('#d4c2ec', '#ece2f9') +
    `<path d="M18 44 Q6 40 12 28 Q18 18 30 22 Q36 8 52 12 Q66 8 72 22 Q90 22 90 36 Q90 46 76 46 Z" fill="#7d5fb0" ${S} stroke-width="4"/>` +
    `<g stroke="#9ed12a" stroke-width="5" stroke-linecap="round"><path d="M30 58 v10 M48 62 v14 M66 58 v10 M38 78 v8 M58 80 v8"/></g>`,
  glacier: () => bg('#9fd6f2', '#dff2fc') +
    `<path d="M10 90 L28 40 L40 62 L56 16 L72 58 L84 40 L94 90 Z" fill="#cfeeff" ${S} stroke-width="4"/>` +
    `<path d="M56 16 L48 50 L62 54 Z" fill="#fff" opacity=".85"/>`,
  bolt: () => bg('#cdd5f0', '#eaeefb') +
    `<path d="M58 8 L30 52 H48 L38 92 L72 40 H54 Z" fill="#ffe94d" ${S} stroke-width="4"/>` +
    `<path d="M16 30 l8 4 M80 24 l-8 6 M84 70 l-8 -4" stroke="#8a93c8" stroke-width="4" stroke-linecap="round"/>`,
  sandbag: () => bg('#eadfc6', '#f8f1df') +
    `<path d="M8 86 Q6 66 22 62 H46 Q62 66 60 86 Z" fill="#d7bf8a" ${S} stroke-width="4"/>` +
    `<path d="M40 62 Q38 42 54 38 H76 Q92 42 90 62 Z" fill="#c9ae74" ${S} stroke-width="4"/>` +
    `<path d="M28 74 h18 M58 52 h18" stroke="#a88f58" stroke-width="3" stroke-linecap="round"/>`,
};


// 新しい兵士14種は、見本を添付してOpenAI画像生成で作った本番PNGだけを使用。
// コードで描くSVG・Canvasの兵士や、他の兵士の絵への置き換えはしない。
const NEW_SOLDIER_TYPES = new Set([
  'scout', 'cavalry', 'paladin', 'dragonKnight',
  'apprenticeArcher', 'archer', 'longbowman', 'sniper', 'skyArcher',
  'apprenticeMage', 'mage', 'sorcerer', 'archmage', 'sage',
]);

/** 精霊の絵：ゆらゆらした体と顔。大精霊は後ろに光の輪と星がつく */
function spiritArt(back, body, light, great = false) {
  return bg(back, light) +
    (great ? `<circle cx="50" cy="50" r="42" fill="none" stroke="#ffd93b" stroke-width="5" stroke-dasharray="4 8" stroke-linecap="round"/>` +
      `<path d="M50 4 l3 7 l7 1 l-5 5 l1 7 l-6 -4 l-6 4 l1 -7 l-5 -5 l7 -1 Z" fill="#ffd93b" ${S} stroke-width="2"/>` : '') +
    `<path d="M50 20 Q78 30 74 58 Q72 80 50 88 Q28 80 26 58 Q22 30 50 20 Z" fill="${body}" ${S} stroke-width="4"/>` +
    `<path d="M36 36 Q40 28 50 27" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>` +
    face(50, 56, 1);
}

/** カードの絵（知らない種類は、名前の1文字目を出す） */
function svgCardArt(type, color = 'blue', name = '') {
  const draw = CARD_ART[type];
  const c = PLAYER_COLORS[color] ?? PLAYER_COLORS.blue;
  if (draw) return svg('0 0 100 100', draw(c), 'card-art-svg', 'xMidYMid slice');
  return svg('0 0 100 100', bg('#eadfc6', '#f8f1df') +
    `<text x="50" y="66" font-size="46" font-weight="900" text-anchor="middle" fill="#fff" stroke="${INK}" stroke-width="6" paint-order="stroke">${escapeText(name.charAt(0) || '?')}</text>`, 'card-art-svg', 'xMidYMid slice');
}

// ---------- 小さな記号 ----------

const ICONS = {
  // 氷・雷・闇・光・混沌の属性の仮の記号（専用の絵ができたら PNG_ICONS に足して差しかえる）
  ice: `<path d="M12 2 L15 9 L22 12 L15 15 L12 22 L9 15 L2 12 L9 9 Z" fill="#a5e4ff" ${S} stroke-width="2"/>`,
  thunder: `<path d="M13 2 L5 13 H11 L9 22 L19 9 H13 Z" fill="#ffd84a" ${S} stroke-width="2"/>`,
  dark: `<path d="M15 3 Q5 4 5 13 Q6 21 15 21 Q8 18 9 11 Q10 6 15 3 Z" fill="#6a4c93" ${S} stroke-width="2"/>`,
  light: `<circle cx="12" cy="12" r="5" fill="#fff3a0" ${S} stroke-width="2"/><path d="M12 1 V5 M12 19 V23 M1 12 H5 M19 12 H23" ${S} stroke-width="2" stroke-linecap="round"/>`,
  chaos: `<circle cx="12" cy="12" r="9" fill="#b04fd8" ${S} stroke-width="2"/><path d="M12 3 Q4 9 12 12 Q20 15 12 21" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
  heart: `<path d="M12 21 Q1 13 3 7 Q5 2 9 4 Q11 5 12 7 Q13 5 15 4 Q19 2 21 7 Q23 13 12 21 Z" fill="#f2566e" ${S} stroke-width="2"/>`,
  sword: `<path d="M5 19 L17 5 L20 4 L19 7 L7 21 Z" fill="#eef3f7" ${S} stroke-width="2"/><path d="M4 14 L10 20" ${S} stroke-width="3.4"/><path d="M4 14 L10 20" stroke="#f2c14e" stroke-width="1.4" stroke-linecap="round"/>`,
  boot: `<path d="M8 3 h7 v10 q6 1 6 6 v2 H6 Z" fill="#b98250" ${S} stroke-width="2"/>`,
  target: `<circle cx="12" cy="12" r="9" fill="#fff3d6" ${S} stroke-width="2"/><circle cx="12" cy="12" r="4.5" fill="#f2566e" ${S} stroke-width="1.6"/>`,
  shield: `<path d="M12 2 Q17 5 21 5 Q21 15 12 22 Q3 15 3 5 Q7 5 12 2 Z" fill="#6f9fd8" ${S} stroke-width="2"/>`,
  coin: `<circle cx="12" cy="12" r="9" fill="#ffcf3f" ${S} stroke-width="2"/><path d="M12 7 l1.6 3.3 l3.6 .5 l-2.6 2.5 l.6 3.6 l-3.2 -1.7 l-3.2 1.7 l.6 -3.6 l-2.6 -2.5 l3.6 -.5 Z" fill="#fff3b0" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>`,
  wall: `<path d="M3 21 V9 h4 V5 h4 v4 h2 V5 h4 v4 h4 v12 Z" fill="#d9cfbb" ${S} stroke-width="2"/><path d="M3 15 H21 M9 9 v6 M15 15 v6" stroke="#8d8069" stroke-width="1.5"/>`,
  card: `<rect x="5" y="2" width="14" height="20" rx="3" fill="#b0703c" ${S} stroke-width="2"/><path d="M12 7 l1.5 3 l3.3 .4 l-2.4 2.3 l.6 3.3 l-3 -1.6 l-3 1.6 l.6 -3.3 l-2.4 -2.3 l3.3 -.4 Z" fill="#ffd93b"/>`,
  skull: `<path d="M12 3 Q21 3 21 12 Q21 16 17 17 V21 H7 V17 Q3 16 3 12 Q3 3 12 3 Z" fill="#c9f26b" ${S} stroke-width="2"/><circle cx="8.5" cy="12" r="2" fill="${INK}"/><circle cx="15.5" cy="12" r="2" fill="${INK}"/>`,
  snow: `<g ${S} stroke-width="3.6" fill="none"><path d="M12 2 V22 M3.5 7 L20.5 17 M3.5 17 L20.5 7"/></g><g stroke="#8fdcff" stroke-width="1.5" stroke-linecap="round"><path d="M12 2 V22 M3.5 7 L20.5 17 M3.5 17 L20.5 7"/></g>`,
  fire: `<path d="M12 2 Q14 7 18 9 Q22 14 19 19 Q16 23 12 22 Q6 23 4 17 Q3 12 7 9 Q8 12 10 11 Q9 6 12 2 Z" fill="#f2622e" ${S} stroke-width="2"/><path d="M12 12 Q15 15 14 18 Q12 20 10 18 Q9 15 12 12 Z" fill="#ffc83d"/>`,
  water: `<path d="M12 2 Q20 12 19 16 Q18 22 12 22 Q6 22 5 16 Q4 12 12 2 Z" fill="#4db8f0" ${S} stroke-width="2"/><path d="M9 14 q0 4 3 5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>`,
  wind: `<path d="M3 8 H14 Q18 8 18 5 Q18 3 15.5 3 M3 13 H18 Q22 13 22 16 Q22 19 19 19 M3 18 H10" fill="none" ${S} stroke-width="2.4"/><path d="M3 8 H14 M3 13 H18" fill="none" stroke="#5fd0a0" stroke-width="1.2" stroke-linecap="round"/>`,
  earth: `<path d="M2 21 L9 7 L13 13 L16 9 L22 21 Z" fill="#b0834f" ${S} stroke-width="2"/><path d="M9 7 L10.5 11 L7.5 11 Z" fill="#f6ead4"/>`,
  crown: `<path d="M3 19 L2 7 L8 12 L12 4 L16 12 L22 7 L21 19 Z" fill="#ffcf3f" ${S} stroke-width="2"/><circle cx="12" cy="15" r="1.8" fill="#e2475b"/>`,
  hammer: `<path d="M6 21 L14 11" ${S} stroke-width="4.4"/><path d="M6 21 L14 11" stroke="#a9753f" stroke-width="2" stroke-linecap="round"/><path d="M10 6 L15 2 L22 9 L18 13 Z" fill="${STEEL_D}" ${S} stroke-width="2"/>`,
  stone: `<path d="M3 17 L7 8 L16 6 L21 13 L18 19 L7 20 Z" fill="${STEEL}" ${S} stroke-width="2"/><path d="M8 11 L15 9" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  sound: `<path d="M3 9 h4 l6 -5 v16 l-6 -5 H3 Z" fill="#fff7e0" ${S} stroke-width="2"/><path d="M16 8 q3 4 0 8 M19 5 q5 7 0 14" fill="none" ${S} stroke-width="2"/>`,
  mute: `<path d="M3 9 h4 l6 -5 v16 l-6 -5 H3 Z" fill="#fff7e0" ${S} stroke-width="2"/><path d="M16 9 l6 6 M22 9 l-6 6" ${S} stroke-width="2.4"/>`,
};

/** 小さな記号（24×24）。class="ic" で文字の大きさに合わせて出る */
function svgIcon(name) {
  return `<svg class="ic ic-${name}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] ?? ''}</svg>`;
}

/** 道の脇の木 */
export function treeArt() {
  return svg('0 0 100 110',
    `<ellipse cx="50" cy="102" rx="26" ry="6" fill="#000" opacity=".15"/>` +
    `<rect x="43" y="70" width="14" height="30" rx="5" fill="#a9753f" ${S} stroke-width="4"/>` +
    `<path d="M50 6 Q84 8 86 40 Q92 70 50 76 Q8 70 14 40 Q16 8 50 6 Z" fill="#5fae4e" ${S} stroke-width="4"/>` +
    `<path d="M30 30 Q36 18 50 16" fill="none" stroke="#9ad77f" stroke-width="6" stroke-linecap="round"/>`, 'tree-art');
}

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// 画像の割り当てはUIだけが持つ。読み込み前・失敗時は元のSVGを表示する。
const CARD_TYPES = new Set(["attackDice","healDice","manaDice","coinDice","shieldDice","buffDice","randomDice","godDice","manaRaid","lifeSteal","desperateShot","powderKeg","antidote","weatherCall","manaShard","manaDrop","manaCrystal","manaSpring","worldTreeDew","adapt", ...NEW_SOLDIER_TYPES,"infantry", "knight", "fireball", "thunder", "heal", "flameSword", "waterSpear", "windBow", "earthHammer", "shield", "wall", "poisonMist", "frostBreath", "spearman", "heavy", "giant", "meteor", "bigThunder", "venom", "deepFreeze", "ironSword", "bigShield", "sandbag", "reflect", "decoy", "blessing", "thief", "minorHeal", "toxicRain", "glacier", "bolt", "fireSpirit", "greatFireSpirit", "waterSpirit", "greatWaterSpirit", "windSpirit", "greatWindSpirit", "earthSpirit", "greatEarthSpirit", "hero", "inferno", "starfall", "apocalypse", "raijin", "judgment", "greatHeal", "holyLight", "goddess", "deathMist", "plague", "absoluteZero", "frozenWorld", "magicSword", "holySword", "godSword", "steelShield", "holyShield", "godShield", "stoneWall", "gate", "barrier", "fireKing", "waterKing", "windKing", "earthKing", "treasure", "goldVein", "kingTreasure"]);
const kebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
// 起動時に全部の画像を先に読み込んでおく。読み込めた画像は、代わりのSVGを出さず最初からPNGで描く
// （読み込み中にSVGが一瞬見えて、あとで差し変わるのを防ぐ）。読み込めなかった画像だけ、SVGで描く。
const READY = new Set();
export const isAssetReady = (path) => READY.has(path);
const TITLE_ASSETS = ['ui/natural/paper-tile.png','ui/natural/oak-tile.png','ui/natural/frame.png','ui/natural/neutral-72-left.png','ui/natural/neutral-72-middle.png','ui/natural/neutral-72-right.png','ui/natural/primary-72-left.png','ui/natural/primary-72-middle.png','ui/natural/primary-72-right.png','ui/natural/primary-wide-full.png','ui/natural/neutral-wide-full.png','bg/kingdom-meadow.png','bg/kingdom-valley.png','ui/kingdom-crest.png','ui/logo.png','ui/title-castle-blue.png','ui/title-castle-orange.png','ui/title-knight-blue.png','ui/title-infantry-orange.png'];
export async function preloadAssets(timeoutMs = 8000, onProgress = null, {phase = 'game'} = {}) {
  let paths = [...TITLE_ASSETS];
  if (phase !== 'title') {
    try { const res=await fetch('assets/asset-manifest.json');if(res.ok)paths=[...new Set([...paths,...Object.keys(await res.json())])].filter(p=>p!=='style-reference.png'); } catch {}
  }
  paths=paths.filter(p=>!READY.has(p));let done=0,index=0;
  const load = path => new Promise(resolve=>{
    const img=new Image();let ended=false;
    const finish=ok=>{if(ended)return;ended=true;clearTimeout(timer);if(ok)READY.add(path);done++;onProgress?.(done,paths.length);resolve();};
    const timer=setTimeout(()=>finish(false),timeoutMs);
    img.onload=async()=>{try{await img.decode();}catch{}finish(true);};img.onerror=()=>finish(false);img.src=`assets/${path}`;
  });
  await Promise.all(Array.from({length:Math.min(12,paths.length)},async()=>{while(index<paths.length)await load(paths[index++]);}));
}

export function imageArt(path, fallback = '', cls = '') {
  return `<span class="asset-art ${READY.has(path)?'asset-loaded ':''}${cls}" aria-hidden="true"><span class="asset-wait">…</span><img class="asset-image" src="assets/${path}" alt="" decoding="async" draggable="false"></span>`;
}
document.addEventListener('error', e => { if(e.target instanceof HTMLImageElement && e.target.classList.contains('asset-image')){if(e.target.parentElement.classList.contains('adapt-asset') || e.target.parentElement.classList.contains('icon-asset'))e.target.parentElement.classList.remove('asset-loaded');const wait=e.target.parentElement.querySelector('.asset-wait');if(wait)wait.textContent='画像なし';} },true);
// loadはバブルしないためキャプチャする。インラインハンドラを使わない。
document.addEventListener('load', (e) => {
  if (e.target instanceof HTMLImageElement && e.target.classList.contains('asset-image')) {
    e.target.parentElement.classList.add('asset-loaded');
  }
  if (e.target instanceof HTMLImageElement && e.target.classList.contains('card-frame')) {
    e.target.parentElement.classList.add('has-frame');
  }
}, true);
const WEATHER_ICONS = {
  sunny: 'sunny', rain: 'rain', heavyRain: 'heavy-rain', fog: 'fog',
  storm: 'storm', sandstorm: 'sandstorm', coinRain: 'coin-rain',
};

export function weatherIcon(type, glyph = '🌤️') {
  const icon = document.createElement('span');
  icon.className = 'weather-icon';
  icon.setAttribute('aria-hidden', 'true');
  if (Object.hasOwn(WEATHER_ICONS, type)) {
    icon.innerHTML = imageArt(`ui/weather-${WEATHER_ICONS[type]}.png`, '', 'icon-asset')
      .replace('<span class="asset-wait">…</span>', `<span class="asset-fallback">${escapeText(glyph)}</span>`);
  } else icon.textContent = glyph;
  return icon;
}

function generatedSoldierPng(path, cls, name) {
  return `<span class="asset-art asset-loaded ${cls}"><img class="asset-image" src="assets/${path}" alt="${escapeText(name)}" decoding="sync" draggable="false"></span>`;
}
/** 魔物の駒は、仲間になった姿の専用イラストを使う */
const beastOf = (type) => (typeof type === 'string' && type.startsWith('beast_') ? type.slice(6) : null);
function beastArt(beast, name, cls) {
  const fallback = monsterArt(beast, name);
  return imageArt(`cards/card-beast-${kebab(beast)}.png`, '', `art ${cls} icon-asset`)
    .replace('<span class="asset-wait">…</span>', `<span class="asset-fallback">${fallback}</span>`);
}

export function cardArt(type, color = 'blue', name = '') {
  if (beastOf(type)) return beastArt(beastOf(type), name, 'card-art-svg');
  if (NEW_SOLDIER_TYPES.has(type)) return generatedSoldierPng(`cards/card-${kebab(type)}.png`, 'art card-art-svg', name);
  const fallback = svgCardArt(type, color, name);
  if (type === 'adapt' || type === 'weatherCall') {
    const fallbackClass = type === 'adapt' ? 'adapt-asset' : 'icon-asset';
    return imageArt(`cards/card-${kebab(type)}.png`, fallback, `art card-art-svg ${fallbackClass}`)
      .replace('<span class="asset-wait">…</span>', `<span class="asset-fallback">${fallback}</span>`);
  }
  return CARD_TYPES.has(type) ? imageArt(`cards/card-${kebab(type)}.png`, fallback, 'art card-art-svg') : fallback;
}
export function unitArt(type, color, name = '') {
  if (beastOf(type)) return beastArt(beastOf(type), name, 'unit-art');
  if (NEW_SOLDIER_TYPES.has(type)) return generatedSoldierPng(`units/${kebab(type)}-${color === 'orange' ? 'orange' : 'blue'}.png`, 'art unit-art', name);
  const fallback = svgUnitArt(type, color, name);
  return ['infantry','knight','spearman','heavy','giant','hero'].includes(type)
    ? imageArt(`units/${kebab(type)}-${color === 'orange' ? 'orange' : 'blue'}.png`, fallback, 'art unit-art') : fallback;
}
export function monsterArt(type, name = '') {
  const fallback = svgMonsterArt(type, name);
  return ['slime','goblin','dragon','bat','skeleton','golem','demon','ghost','treant','mimic','vampire','demonKing'].includes(type)
    ? imageArt(`units/monster-${kebab(type)}.png`, fallback, 'art monster-art') : fallback;
}
export function castleArt(color, damage = 0, kind = 'standard') {
  const team = color === 'orange' ? 'orange' : 'blue';
  if (damage >= 4) return imageArt(`castles/castle-${team}-ruined.png`, '', 'art castle-art');
  const stage = Math.max(0, Math.min(3, damage));
  const prefix = ['fortress','tower','barracks'].includes(kind) ? kind : 'castle';
  return imageArt(`castles/${prefix}-${team}${stage ? `-damaged-${stage}` : ''}.png`, svgCastleArt(team), 'art castle-art').replace('<span ', `<span data-damage-stage="${stage}" `);
}
export function spiritSprite(element, great = false) {
  return imageArt(`units/${great ? 'great-' : ''}${element}-spirit.png`, '', 'art spirit-art');
}
// Existing SVGs and rarity characters remain visible until the PNG loads or if it fails.
const ICON_FALLBACK = { 'kind-soldier': 'sword', 'kind-spell': 'fire', 'kind-weapon': 'hammer', 'kind-defense': 'shield', 'kind-wild': 'card' };
const PNG_ICONS = new Set(['mp', 'luck', 'fire', 'water', 'wind', 'earth', 'heart', 'coin',
  'kind-wild', 'kind-soldier', 'kind-spell', 'kind-weapon', 'kind-defense',
  'rarity-common', 'rarity-uncommon', 'rarity-rare', 'rarity-epic', 'rarity-legendary', 'rarity-special']);
export function icon(name, fallbackText = null) {
  if (name === 'card') return imageArt('ui/card-back.png', '', 'ic card-back-icon');
  const fallback = fallbackText === null ? svgIcon(ICON_FALLBACK[name] ?? name) : `<span class="icon-text">${escapeText(fallbackText)}</span>`;
  if (!PNG_ICONS.has(name)) return fallback;
  return imageArt(`ui/icon-${name}.png`, fallback, `ic ic-${name} icon-asset`)
    .replace('<span class="asset-wait">…</span>', `<span class="asset-fallback">${fallback}</span>`);
}
