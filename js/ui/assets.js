// 画像素材の割り当てと読み込み。
// - どのカード・兵士・城にどの画像を使うかは、ここで決める（data/cards.json には画像の情報を入れない）
// - ファイル名は CLAUDE.md の「画像素材」の決まりどおり。カードを増やしたら、cards.json のキーから自動で一覧に入る
// - 画像がまだないものは、同じ大きさの仮の絵（色付きの形と名前の文字）を作って代わりに使う。
//   assets/ に画像を置いてリロードするだけで、コードを変えずに本物に替わる

import { UI_CONFIG } from './config.js';

const ROOT = 'assets/';

/** プレイヤーの色（ファイル名の最後に付く） */
export const PLAYER_COLOR = { p1: 'blue', p2: 'orange' };

// 画像のキー（コードの中ではこの名前で呼ぶ）
export const castleKey = (color) => `castle:${color}`;
export const unitKey = (type, color) => `unit:${type}:${color}`;
export const cardArtKey = (type) => `card:${type}`;
export const frameKey = (kind) => `frame:${kind}`;

/**
 * 画像がまだないときに、仮の絵の代わりに別の画像を使う（キー → 代わりのキー）。
 * 本物のファイルが置かれたら、そちらが優先される。
 */
export const OVERRIDES = {
  'fx:fireball': 'card:fireball', // fx/fireball.png ができるまでは、カードの絵を丸く切り抜いて飛ばす
};

// 決まった画像（カードの種類によらないもの）。w, h は仮の絵の大きさ（画像素材の目安と同じ）
const FIXED = [
  { key: 'bg:board', path: 'bg/board.png', w: 1080, h: 1920, draw: 'board', label: '背景' },
  { key: 'castle:blue', path: 'castles/castle-blue.png', w: 512, h: 440, draw: 'castle', color: 'blue', label: '城' },
  { key: 'castle:orange', path: 'castles/castle-orange.png', w: 512, h: 440, draw: 'castle', color: 'orange', label: '城' },
  { key: 'fx:explosion', path: 'fx/explosion.png', w: 512, h: 512, draw: 'burst', tint: '#f39a3a', label: '爆発' },
  { key: 'fx:lightning', path: 'fx/lightning.png', w: 256, h: 512, draw: 'bolt', tint: '#ffd84a', label: '雷' },
  { key: 'fx:heal', path: 'fx/heal.png', w: 512, h: 512, draw: 'heal', tint: '#7fd36e', label: '回復' },
  { key: 'fx:dust', path: 'fx/dust.png', w: 512, h: 384, draw: 'dust', tint: '#c9a477', label: '土けむり' },
  { key: 'fx:fireball', path: 'fx/fireball.png', w: 256, h: 256, draw: 'burst', tint: '#f26b2e', label: '火の玉' },
  { key: 'ui:sign-hp', path: 'ui/sign-hp.png', w: 256, h: 256, draw: 'sign', label: '' },
  { key: 'ui:button-end-turn', path: 'ui/button-end-turn.png', w: 512, h: 192, draw: 'plank', label: '' },
  { key: 'ui:page-handover', path: 'ui/page-handover.png', w: 768, h: 1024, draw: 'page', label: '' },
  { key: 'ui:banner-win', path: 'ui/banner-win.png', w: 1024, h: 512, draw: 'banner', label: '' },
  { key: 'ui:panel-parchment', path: 'ui/panel-parchment.png', w: 512, h: 256, draw: 'parchment', label: '' },
  { key: 'ui:icon-heart', path: 'ui/icon-heart.png', w: 128, h: 128, draw: 'heart', label: '' },
  { key: 'ui:icon-sword', path: 'ui/icon-sword.png', w: 128, h: 128, draw: 'sword', label: '' },
  { key: 'ui:card-back', path: 'ui/card-back.png', w: 512, h: 768, draw: 'cardBack', label: '' },
];

/** cards.json から、読み込む画像の一覧を作る */
export function buildManifest(cards) {
  const list = FIXED.map((e) => ({ ...e }));
  const kinds = new Set();
  for (const [type, def] of Object.entries(cards)) {
    const name = def.name ?? type;
    kinds.add(def.kind);
    if (def.effect) SPELL_EFFECTS[type] = def.effect;
    list.push({ key: cardArtKey(type), path: `cards/card-${type}.png`, w: 512, h: 512, draw: 'art', kind: def.kind, label: name });
    if (def.kind === 'soldier') {
      for (const color of Object.values(PLAYER_COLOR)) {
        list.push({ key: unitKey(type, color), path: `units/${type}-${color}.png`, w: 256, h: 256, draw: 'unit', color, label: name });
      }
    }
  }
  for (const kind of kinds) {
    if (kind) list.push({ key: frameKey(kind), path: `cards/frame-${kind}.png`, w: 512, h: 768, draw: 'frame', kind, label: '' });
  }
  return list;
}

// ---------- 読み込み ----------

const loaded = new Map();     // key → { url, w, h, placeholder: boolean, path }

/**
 * 404 よけ：python3 -m http.server が返すフォルダの一覧を見て、実在するファイルだけを調べる。
 * 一覧が取れないサーバーでは null を返す（そのときは全部そのまま読みにいく）。
 * 画像が全部そろったら、この関数と loadAssets() の中の呼び出し1行を消してよい。
 */
async function findExistingFiles(paths) {
  const dirs = [...new Set(paths.map((p) => p.slice(0, p.lastIndexOf('/') + 1)))];
  try {
    const lists = await Promise.all(dirs.map(async (dir) => {
      const res = await fetch(dir, { cache: 'no-store' });
      const html = res.ok && (res.headers.get('content-type') ?? '').includes('text/html') ? await res.text() : '';
      if (!html.includes('Directory listing')) throw new Error(`${dir} の一覧が取れません`);
      return [...html.matchAll(/href="([^"?#]+)"/g)].map((m) => dir + decodeURIComponent(m[1]));
    }));
    return new Set(lists.flat());
  } catch {
    return null;
  }
}

function loadImage(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/**
 * 一覧の画像を全部読み込む。ないものは仮の絵を作る。全部そろったら resolve。
 * @param {object} cards cards.json の中身
 * @param {(done: number, total: number) => void} [onProgress]
 */
export async function loadAssets(cards, onProgress) {
  const manifest = buildManifest(cards);
  const paths = manifest.map((e) => ROOT + e.path);
  const existing = await findExistingFiles(paths);
  // 仮の絵の文字が正しいフォントで描かれるよう、先にフォントを待つ（取れなくても進む）
  await Promise.race([document.fonts?.ready, new Promise((r) => setTimeout(r, 1500))]).catch(() => {});

  let done = 0;
  onProgress?.(done, manifest.length);
  await Promise.all(manifest.map(async (entry) => {
    const url = ROOT + entry.path;
    const img = existing && !existing.has(url) ? null : await loadImage(url);
    if (img) {
      loaded.set(entry.key, { url, w: img.naturalWidth, h: img.naturalHeight, placeholder: false, path: entry.path });
    } else {
      loaded.set(entry.key, { url: await drawPlaceholder(entry), w: entry.w, h: entry.h, placeholder: true, path: entry.path });
    }
    onProgress?.(++done, manifest.length);
  }));
}

function resolveKey(key) {
  const own = loaded.get(key);
  if (own?.placeholder && OVERRIDES[key] && loaded.has(OVERRIDES[key])) return loaded.get(OVERRIDES[key]);
  return own;
}

/** 画像の URL（本物か、代わりの画像か、仮の絵） */
export function src(key) {
  return resolveKey(key)?.url ?? '';
}

/** 画像の縦横比（高さ / 幅） */
export function aspect(key) {
  const a = resolveKey(key);
  return a ? a.h / a.w : 1;
}

/** 仮の絵を使っているファイルの一覧（代わりの画像で間に合わせているものも含む） */
export function placeholders() {
  return [...loaded.values()].filter((a) => a.placeholder).map((a) => `assets/${a.path}`).sort();
}

/** 代わりの画像で間に合わせているもの（キー → 代わりのキー） */
export function standIns() {
  return Object.entries(OVERRIDES).filter(([k, v]) => loaded.get(k)?.placeholder && loaded.has(v));
}

// ---------- 仮の絵 ----------

const INK = '#4a2e1a';
const COLORS = {
  blue: { main: '#5aa9e6', light: '#bfe3fb', dark: '#2f6fa8' },
  orange: { main: '#f39a4a', light: '#ffd9b0', dark: '#c4622a' },
};
const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", sans-serif';
const HEAD_FONT = '"Dela Gothic One", "M PLUS Rounded 1c", sans-serif';

async function drawPlaceholder(e) {
  const c = document.createElement('canvas');
  c.width = e.w;
  c.height = e.h;
  const g = c.getContext('2d');
  g.lineJoin = 'round';
  g.lineCap = 'round';
  (PAINTERS[e.draw] ?? PAINTERS.art)(g, e);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  return blob ? URL.createObjectURL(blob) : c.toDataURL();
}

function path(g, fill, stroke = INK, width = 10) {
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
}

function rrect(g, x, y, w, h, r) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

function label(g, text, x, y, size, { color = '#fff', stroke = INK, font = HEAD_FONT } = {}) {
  if (!text) return;
  g.font = `${size}px ${font}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = size * 0.22;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

/** 「仮」の札（仮の絵だと一目でわかるように） */
function tag(g, w) {
  const s = Math.max(18, w * 0.07);
  label(g, '仮', w - s * 1.1, s * 1.1, s, { color: '#fff7d6' });
}

function heartPath(g, cx, cy, s) {
  g.beginPath();
  g.moveTo(cx, cy + s * 0.9);
  g.bezierCurveTo(cx - s * 1.4, cy, cx - s * 0.9, cy - s * 1.1, cx, cy - s * 0.4);
  g.bezierCurveTo(cx + s * 0.9, cy - s * 1.1, cx + s * 1.4, cy, cx, cy + s * 0.9);
  g.closePath();
}

function starPath(g, cx, cy, r1, r2, n) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = (Math.PI * i) / n - Math.PI / 2;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}

function parchmentFill(g, w, h) {
  const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.7);
  grd.addColorStop(0, '#fbf0d2');
  grd.addColorStop(1, '#ecd7a8');
  return grd;
}

const SPELL_ICON = {
  damageEnemyCastle: (g, cx, cy, s) => { starPath(g, cx, cy, s, s * 0.55, 9); path(g, '#f3833a', INK, s * 0.08); },
  damageEnemySoldiers: (g, cx, cy, s) => {
    g.beginPath();
    g.moveTo(cx + s * 0.2, cy - s); g.lineTo(cx - s * 0.5, cy + s * 0.1); g.lineTo(cx, cy + s * 0.1);
    g.lineTo(cx - s * 0.25, cy + s); g.lineTo(cx + s * 0.55, cy - s * 0.2); g.lineTo(cx + s * 0.05, cy - s * 0.2);
    g.closePath(); path(g, '#ffd84a', INK, s * 0.08);
  },
  healOwnCastle: (g, cx, cy, s) => { heartPath(g, cx, cy, s * 0.8); path(g, '#f58aa0', INK, s * 0.08); },
};

const PAINTERS = {
  board(g, { w, h }) {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#a7d97a');
    grd.addColorStop(1, '#8cc862');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    // 草のまだら
    g.fillStyle = 'rgba(255,255,255,0.12)';
    for (let i = 0; i < 40; i++) {
      g.beginPath();
      g.ellipse((i * 397) % w, (i * 619) % h, 60, 26, 0, 0, Math.PI * 2);
      g.fill();
    }
    // 1本の土の道（少しうねる）
    const road = () => {
      g.beginPath();
      g.moveTo(w * 0.5, -20);
      g.bezierCurveTo(w * 0.62, h * 0.3, w * 0.38, h * 0.65, w * 0.5, h + 20);
    };
    road(); g.strokeStyle = '#b58a55'; g.lineWidth = w * 0.25; g.stroke();
    road(); g.strokeStyle = '#e2bf86'; g.lineWidth = w * 0.22; g.stroke();
    // 道の脇の木
    const tree = (x, y, r) => {
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); path(g, '#5fae4e', INK, 8);
      g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, Math.PI * 2); g.fillStyle = '#7cc764'; g.fill();
    };
    [[0.08, 0.3, 80], [0.92, 0.42, 90], [0.1, 0.62, 70], [0.9, 0.75, 80], [0.06, 0.85, 60], [0.94, 0.18, 70]]
      .forEach(([x, y, r]) => tree(w * x, h * y, r));
  },

  castle(g, { w, h, color }) {
    const c = COLORS[color] ?? COLORS.blue;
    const stone = '#d8d2c4';
    // 左右の塔・真ん中の塔・壁
    rrect(g, w * 0.08, h * 0.38, w * 0.2, h * 0.58, 18); path(g, stone);
    rrect(g, w * 0.72, h * 0.38, w * 0.2, h * 0.58, 18); path(g, stone);
    rrect(g, w * 0.38, h * 0.22, w * 0.24, h * 0.5, 18); path(g, stone);
    rrect(g, w * 0.2, h * 0.52, w * 0.6, h * 0.44, 22); path(g, stone);
    // 屋根
    const roof = (cx, base, half, top) => {
      g.beginPath(); g.moveTo(cx - half, base); g.lineTo(cx, top); g.lineTo(cx + half, base); g.closePath(); path(g, c.main);
    };
    roof(w * 0.18, h * 0.4, w * 0.13, h * 0.16);
    roof(w * 0.82, h * 0.4, w * 0.13, h * 0.16);
    roof(w * 0.5, h * 0.24, w * 0.15, h * 0.02);
    // 旗
    g.beginPath(); g.moveTo(w * 0.5, h * 0.02); g.lineTo(w * 0.5, h * -0.1); path(g, null, INK, 6);
    // 門
    g.beginPath(); g.moveTo(w * 0.42, h * 0.96); g.lineTo(w * 0.42, h * 0.8); g.arc(w * 0.5, h * 0.8, w * 0.08, Math.PI, 0); g.lineTo(w * 0.58, h * 0.96);
    path(g, '#8a5a32');
    label(g, `城（${color === 'blue' ? '空色' : 'オレンジ'}）`, w / 2, h * 0.64, 44);
    tag(g, w);
  },

  unit(g, { w, h, color, label: name }) {
    const c = COLORS[color] ?? COLORS.blue;
    // 体
    g.beginPath(); g.ellipse(w / 2, h * 0.78, w * 0.26, h * 0.18, 0, 0, Math.PI * 2); path(g, c.main, INK, 8);
    // 頭とかぶと
    g.beginPath(); g.arc(w / 2, h * 0.42, w * 0.3, 0, Math.PI * 2); path(g, '#ffe2c4', INK, 8);
    g.beginPath(); g.arc(w / 2, h * 0.4, w * 0.31, Math.PI, 0); g.closePath(); path(g, '#c9d3dc', INK, 8);
    g.beginPath(); g.ellipse(w / 2, h * 0.08, w * 0.06, h * 0.07, 0, 0, Math.PI * 2); path(g, c.main, INK, 6);
    label(g, name, w / 2, h * 0.53, 46);
    tag(g, w);
  },

  art(g, { w, h, kind, label: name, key }) {
    const grd = g.createRadialGradient(w / 2, h / 2, w * 0.1, w / 2, h / 2, w * 0.75);
    grd.addColorStop(0, kind === 'spell' ? '#efe2ff' : '#fff1d6');
    grd.addColorStop(1, kind === 'spell' ? '#b9a2e6' : '#e9c48c');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const type = key.split(':')[1];
    if (kind === 'soldier') {
      PAINTERS.unit(g, { w, h, color: 'blue', label: '' });
    } else {
      const effect = SPELL_EFFECTS[type];
      (SPELL_ICON[effect] ?? SPELL_ICON.damageEnemyCastle)(g, w / 2, h * 0.45, w * 0.28);
    }
    label(g, name, w / 2, h * 0.86, name.length > 5 ? 56 : 72);
    tag(g, w);
  },

  frame(g, { w, h, kind }) {
    const L = UI_CONFIG.card.layout;
    const soldier = kind === 'soldier';
    rrect(g, 8, 8, w - 16, h - 16, soldier ? 28 : 60);
    path(g, soldier ? '#b98250' : '#b49bdc', INK, 14);
    if (soldier) {
      g.strokeStyle = 'rgba(74,46,26,0.25)'; g.lineWidth = 4;
      for (let y = 40; y < h; y += 46) { g.beginPath(); g.moveTo(24, y); g.lineTo(w - 24, y + 8); g.stroke(); }
    } else {
      g.fillStyle = '#f7d96a';
      for (const [x, y] of [[0.1, 0.5], [0.9, 0.5], [0.1, 0.94], [0.9, 0.94]]) { starPath(g, w * x, h * y, 18, 8, 5); g.fill(); }
    }
    // 絵の窓（透明にくりぬく）
    const a = L.art;
    rrect(g, w * a.x, h * a.y, w * a.w, h * a.h, 18); path(g, null, INK, 12);
    g.save(); rrect(g, w * a.x, h * a.y, w * a.w, h * a.h, 18); g.clip(); g.clearRect(0, 0, w, h); g.restore();
    // 名前の帯
    const n = L.name;
    rrect(g, w * 0.08, h * (n.y - n.h / 2), w * 0.84, h * n.h, 20); path(g, '#f6e7c4', INK, 10);
    // 角のメダル
    for (const m of [L.medalLeft, L.medalRight]) {
      g.beginPath(); g.arc(w * m.x, h * m.y, w * m.r, 0, Math.PI * 2);
      path(g, soldier ? '#e3b04b' : '#9b7fd0', INK, 10);
    }
  },

  burst(g, { w, h, tint, label: name }) {
    starPath(g, w / 2, h / 2, w * 0.46, w * 0.26, 10); path(g, tint, INK, 10);
    starPath(g, w / 2, h / 2, w * 0.26, w * 0.15, 8); path(g, '#fff4b8', null);
    label(g, name, w / 2, h / 2, w * 0.1);
  },

  bolt(g, { w, h, tint }) {
    g.beginPath();
    g.moveTo(w * 0.6, 0); g.lineTo(w * 0.2, h * 0.5); g.lineTo(w * 0.5, h * 0.5);
    g.lineTo(w * 0.3, h); g.lineTo(w * 0.85, h * 0.38); g.lineTo(w * 0.55, h * 0.38); g.lineTo(w * 0.8, 0); g.closePath();
    path(g, tint, INK, 10);
  },

  heal(g, { w, h, tint }) {
    for (let i = 0; i < 9; i++) {
      const a = (Math.PI * 2 * i) / 9;
      starPath(g, w / 2 + Math.cos(a) * w * 0.32, h / 2 + Math.sin(a) * h * 0.32, w * 0.06, w * 0.025, 4);
      path(g, '#fff7b0', INK, 4);
    }
    heartPath(g, w / 2, h / 2, w * 0.18); path(g, tint, INK, 10);
    label(g, '+', w / 2, h * 0.47, w * 0.2);
  },

  dust(g, { w, h, tint }) {
    for (const [x, y, r] of [[0.3, 0.6, 0.18], [0.5, 0.5, 0.24], [0.7, 0.6, 0.18], [0.4, 0.72, 0.15], [0.62, 0.74, 0.15]]) {
      g.beginPath(); g.arc(w * x, h * y, w * r, 0, Math.PI * 2); path(g, tint, INK, 8);
    }
  },

  sign(g, { w, h }) {
    rrect(g, w * 0.44, h * 0.55, w * 0.12, h * 0.42, 8); path(g, '#9b6a3e');
    rrect(g, w * 0.06, h * 0.12, w * 0.88, h * 0.5, 22); path(g, '#c98f55');
    g.strokeStyle = 'rgba(74,46,26,0.3)'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(w * 0.12, h * 0.3); g.lineTo(w * 0.88, h * 0.32); g.stroke();
    g.beginPath(); g.moveTo(w * 0.12, h * 0.46); g.lineTo(w * 0.88, h * 0.44); g.stroke();
    tag(g, w);
  },

  plank(g, { w, h }) {
    const n = h * 0.25;
    g.beginPath();
    g.moveTo(n, 10); g.lineTo(w - n, 10); g.lineTo(w - 10, h / 2); g.lineTo(w - n, h - 10);
    g.lineTo(n, h - 10); g.lineTo(10, h / 2); g.closePath();
    path(g, '#c98f55', INK, 12);
    g.strokeStyle = 'rgba(74,46,26,0.3)'; g.lineWidth = 5;
    g.beginPath(); g.moveTo(n, h * 0.4); g.lineTo(w - n, h * 0.42); g.stroke();
    for (const x of [n * 0.9, w - n * 0.9]) { g.beginPath(); g.arc(x, h / 2, 9, 0, Math.PI * 2); path(g, '#e8d6a8', INK, 4); }
  },

  page(g, { w, h }) {
    g.beginPath();
    g.moveTo(20, 20); g.lineTo(w - 20, 20); g.lineTo(w - 20, h - 110); g.lineTo(w - 110, h - 20); g.lineTo(20, h - 20); g.closePath();
    g.fillStyle = parchmentFill(g, w, h); g.fill(); g.strokeStyle = '#8a5a32'; g.lineWidth = 12; g.stroke();
    g.beginPath(); g.moveTo(w - 20, h - 110); g.lineTo(w - 110, h - 110); g.lineTo(w - 110, h - 20); g.closePath();
    path(g, '#d9bd84', '#8a5a32', 10);
    tag(g, w);
  },

  banner(g, { w, h }) {
    const y = h * 0.42;
    g.beginPath();
    g.moveTo(w * 0.04, y); g.lineTo(w * 0.16, y + h * 0.22); g.lineTo(w * 0.04, y + h * 0.44); g.lineTo(w * 0.22, y + h * 0.44);
    g.lineTo(w * 0.22, y); g.closePath(); path(g, '#b8443a');
    g.beginPath();
    g.moveTo(w * 0.96, y); g.lineTo(w * 0.84, y + h * 0.22); g.lineTo(w * 0.96, y + h * 0.44); g.lineTo(w * 0.78, y + h * 0.44);
    g.lineTo(w * 0.78, y); g.closePath(); path(g, '#b8443a');
    rrect(g, w * 0.14, y - h * 0.06, w * 0.72, h * 0.44, 24); path(g, '#e0574a');
    // 王冠
    g.beginPath();
    g.moveTo(w * 0.4, h * 0.3); g.lineTo(w * 0.38, h * 0.08); g.lineTo(w * 0.45, h * 0.18); g.lineTo(w * 0.5, h * 0.03);
    g.lineTo(w * 0.55, h * 0.18); g.lineTo(w * 0.62, h * 0.08); g.lineTo(w * 0.6, h * 0.3); g.closePath();
    path(g, '#f5c842', INK, 10);
    tag(g, w);
  },

  parchment(g, { w, h }) {
    // 9分割で伸ばすので、ふちの模様は均一に、真ん中は無地にする
    rrect(g, 10, 10, w - 20, h - 20, 36);
    g.fillStyle = parchmentFill(g, w, h); g.fill();
    g.strokeStyle = '#8a5a32'; g.lineWidth = 12; g.stroke();
    rrect(g, 30, 30, w - 60, h - 60, 22);
    g.setLineDash([14, 10]); g.strokeStyle = 'rgba(138,90,50,0.55)'; g.lineWidth = 5; g.stroke(); g.setLineDash([]);
  },

  heart(g, { w, h }) {
    heartPath(g, w / 2, h / 2 + 4, w * 0.36); path(g, '#ef5f6e', INK, 10);
  },

  sword(g, { w, h }) {
    g.save(); g.translate(w / 2, h / 2); g.rotate(Math.PI / 4);
    rrect(g, -9, -56, 18, 74, 6); path(g, '#dfe7ee', INK, 7);
    rrect(g, -26, 14, 52, 12, 6); path(g, '#e3b04b', INK, 7);
    rrect(g, -7, 26, 14, 28, 6); path(g, '#9b6a3e', INK, 7);
    g.restore();
  },

  cardBack(g, { w, h }) {
    rrect(g, 10, 10, w - 20, h - 20, 40); path(g, '#9b6a3e', INK, 14);
    rrect(g, 40, 40, w - 80, h - 80, 28); path(g, '#b98250', '#e3b04b', 10);
    starPath(g, w / 2, h / 2, w * 0.22, w * 0.1, 8); path(g, '#e3b04b', INK, 10);
  },
};

// 魔法の効果（仮の絵のアイコンを選ぶために、buildManifest() が cards.json の effect を覚えておく）
const SPELL_EFFECTS = {};
