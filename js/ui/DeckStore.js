// 複数のデッキを端末に保存する。旧版の1枠は最初の枠に引き継ぐ。
import { EDITION } from './edition.js';
// マイデッキは版ごとに分ける（日本と西洋のカードは混ぜない）
const KEY = EDITION === 'western' ? 'cf-mydecks-v2' : `cf-mydecks-${EDITION}-v1`;
const LEGACY_KEY = EDITION === 'western' ? 'cf-mydeck-v1' : null;
export const DECK_SLOTS = 4;
let memory;

function validList(list) {
  return list && typeof list === 'object' && !Array.isArray(list)
    && Object.values(list).every(n => Number.isInteger(n) && n > 0);
}

function read() {
  if (memory) return memory;
  memory = { active: 0, slots: Array(DECK_SLOTS).fill(null) };
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(saved?.slots)) {
      memory.slots = memory.slots.map((_, i) => {
        const deck = saved.slots[i];
        return validList(deck?.list) && typeof deck.name === 'string'
          ? { name: deck.name.slice(0, 24), list: deck.list } : null;
      });
      memory.active = Number.isInteger(saved.active) && memory.slots[saved.active] ? saved.active
        : Math.max(0, memory.slots.findIndex(Boolean));
    } else {
      const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY));
      if (validList(legacy)) memory.slots[0] = { name: 'マイデッキ', list: legacy };
    }
  } catch { /* ストレージが使えない間も、このページで編成できる */ }
  return memory;
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
    return true;
  } catch { return false; }
}

export const deckChoice = slot => `custom:${slot}`;
export function deckSlot(choice) {
  if (choice === 'custom') return read().active;
  const match = /^custom:(\d+)$/.exec(choice ?? '');
  return match && Number(match[1]) < DECK_SLOTS ? Number(match[1]) : null;
}

export function loadDecks() {
  return structuredClone(read());
}

export function loadMyDeck(slot = read().active) {
  const deck = read().slots[slot];
  return deck ? { ...deck.list } : null;
}

export function selectMyDeck(slot) {
  const state = read();
  if (!state.slots[slot] || state.active === slot) return;
  state.active = slot;
  persist();
}

export function saveMyDeck(slot, name, list) {
  const state = read();
  state.slots[slot] = { name, list: { ...list } };
  state.active = slot;
  return persist();
}

export function deleteMyDeck(slot) {
  const state = read();
  state.slots[slot] = null;
  if (state.active === slot) state.active = Math.max(0, state.slots.findIndex(Boolean));
  return persist();
}
