'use strict';
/* =========================================================
   燼符行 EMBERWRIT — 核心工具與共用定義
   ========================================================= */
const VERSION = '1.0.0';

/* ---------- 可存檔的亂數產生器 (mulberry32) ---------- */
class Rng {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() {
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  sample(arr, n) { return this.shuffle(arr.slice()).slice(0, n); }
  weighted(entries) {
    const tot = entries.reduce((s, e) => s + e[1], 0);
    let r = this.next() * tot;
    for (const [it, w] of entries) { if ((r -= w) < 0) return it; }
    return entries[entries.length - 1][0];
  }
}
let RNG = new Rng(Date.now());

/* ---------- 小工具 ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 10);

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'tip') el._tip = v, el.classList.add('has-tip');
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const c of kids.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  return el;
}

const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無法存檔時照常遊玩 */ } },
  del(k) { try { localStorage.removeItem(k); } catch (e) { } },
};

const Settings = Object.assign({ speed: 1 }, Store.get('ew_settings', {}));
function saveSettings() { Store.set('ew_settings', Settings); }

const sleep = ms => new Promise(r => setTimeout(r, ms * (Settings.speed || 1)));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------- 派系 ---------- */
const FACTIONS = {
  flame: {
    name: '赤焰', full: '赤焰劍宗', glyph: '焰', hero: '焚心劍客', hp: 80,
    starter: 'flame_start', charm: 'ember_stone',
    tag: '灼燒 · 力量 · 連斬',
    desc: '以灼燒層層堆疊，再用力量與多段攻擊一口氣收割。最直接的輸出派系。',
  },
  frost: {
    name: '玄霜', full: '玄霜結社', glyph: '霜', hero: '霜語守衛', hp: 86,
    starter: 'frost_start', charm: 'frost_pendant',
    tag: '格擋 · 虛弱 · 冰凍',
    desc: '格擋可以跨回合保留，再以虛弱、冰凍拖慢敵人，最後用盾擊反打。',
  },
  bone: {
    name: '骸契', full: '骸契祭司', glyph: '骸', hero: '骨契術士', hp: 72,
    starter: 'bone_start', charm: 'bone_box',
    tag: '友軍 · 骨 · 犧牲',
    desc: '把友軍召喚到道上替你擋刀。友軍死亡會留下骨，用骨支付強力的骨費卡牌。',
  },
  storm: {
    name: '雷樞', full: '雷樞機工', glyph: '雷', hero: '雷樞機工', hp: 76,
    starter: 'storm_start', charm: 'storm_coil',
    tag: '走位 · 感電 · 連擊',
    desc: '在三條道之間穿梭閃避，移動本身就能造成傷害。感電讓每一段攻擊都更痛。',
  },
  neutral: { name: '無屬', full: '無屬', glyph: '符' },
};
const MAIN_FACTIONS = ['flame', 'frost', 'bone', 'storm'];

/* ---------- 狀態 ---------- */
const STATUS = {
  str: { name: '力量', good: true, desc: n => `攻擊的每段傷害 ${n >= 0 ? '+' : ''}${n}。` },
  dex: { name: '敏捷', good: true, desc: n => `從卡牌獲得的格擋 +${n}。` },
  thorns: { name: '荊棘', good: true, desc: n => `被攻擊時，對攻擊者造成 ${n} 傷害。` },
  ritual: { name: '儀式', good: true, desc: n => `每回合結束時獲得 ${n} 力量。` },
  weak: { name: '虛弱', desc: n => `造成的攻擊傷害 ×0.75。剩餘 ${n} 回合。` },
  vuln: { name: '易傷', desc: n => `受到的攻擊傷害 ×1.5。剩餘 ${n} 回合。` },
  frail: { name: '脆弱', desc: n => `從卡牌獲得的格擋 ×0.75。剩餘 ${n} 回合。` },
  burn: { name: '灼燒', desc: n => `回合開始時受到 ${n} 傷害（無視格擋），之後層數 -1。` },
  freeze: { name: '冰凍', desc: n => `跳過接下來 ${n} 次行動。` },
  shock: { name: '感電', desc: n => `每次受到攻擊時額外承受 ${n} 傷害。回合結束時減半。` },
  strDown: { name: '怒焰', desc: n => `回合結束時失去 ${n} 力量。` },
  flameBarrier: { name: '炎障', good: true, desc: n => `本回合被攻擊時，對攻擊者施加 ${n} 灼燒。` },
  drawNext: { name: '蓄勢', good: true, desc: n => `下回合多抽 ${n} 張牌。` },
  energyNext: { name: '蓄能', good: true, desc: n => `下回合多獲得 ${n} 能量。` },
};
const DEBUFFS = ['weak', 'vuln', 'frail', 'burn', 'freeze', 'shock'];

/* ---------- 印記（可轉移的卡牌附魔）---------- */
const SIGILS = {
  echo:   { name: '迴響', glyph: '迴', w: 1, desc: '每場戰鬥第一次打出時，效果觸發兩次。' },
  light:  { name: '輕盈', glyph: '輕', w: 1, desc: '費用 -1。' },
  sturdy: { name: '堅韌', glyph: '堅', w: 3, desc: '打出時獲得 4 格擋。' },
  sharp:  { name: '鋒銳', glyph: '銳', w: 3, desc: '此牌的每段攻擊傷害 +3。', atkOnly: true },
  swift:  { name: '疾風', glyph: '疾', w: 3, desc: '打出時獲得 1 步。' },
  innate: { name: '先手', glyph: '先', w: 2, desc: '戰鬥開始時必定在起手牌中。' },
  retain: { name: '恆存', glyph: '恆', w: 2, desc: '回合結束時不會被棄掉。' },
  brand:  { name: '灼印', glyph: '灼', w: 3, desc: '打出時對隨機敵人施加 3 灼燒。' },
  gild:   { name: '金印', glyph: '金', w: 3, desc: '打出時獲得 2 金幣。' },
  draw:   { name: '引靈', glyph: '引', w: 2, desc: '打出時抽 1 張牌。' },
  bone:   { name: '骸印', glyph: '骨', w: 3, desc: '打出時獲得 1 骨。' },
  vamp:   { name: '汲命', glyph: '汲', w: 2, desc: '打出時回復 2 生命。' },
};
const MAX_SIGILS = 2;

/* ---------- 關鍵字說明 ---------- */
const KEYWORDS = {
  '格擋': '抵擋即將受到的傷害。每回合開始時清除。',
  '灼燒': '回合開始時受到等同層數的傷害（無視格擋），之後層數 -1。',
  '感電': '每次受到攻擊時額外承受等同層數的傷害。回合結束時減半。',
  '虛弱': '造成的攻擊傷害 ×0.75。',
  '易傷': '受到的攻擊傷害 ×1.5。',
  '脆弱': '從卡牌獲得的格擋 ×0.75。',
  '冰凍': '跳過下一次行動。首領免疫冰凍，改為承受 2 虛弱。',
  '力量': '攻擊的每段傷害增加。',
  '荊棘': '被攻擊時對攻擊者造成傷害。',
  '消耗': '打出後移出本場戰鬥。',
  '恆存': '回合結束時不會被棄掉。',
  '虛無': '回合結束時若還在手牌中，就會被消耗。',
  '步': '移動到相鄰一道。每回合有 1 步免費移動。',
  '正前方': '只能攻擊與你在同一道的敵人。',
  '友軍': '召喚到道上的單位。你的回合結束時攻擊同道敵人，並替該道承受攻擊。',
  '骨': '友軍死亡或被犧牲時獲得 1 骨。部分卡牌以骨為代價。',
  '犧牲': '摧毀一名友軍（仍會獲得骨）。',
  '能量': '打出卡牌所需的資源，每回合回滿。',
};

/* ---------- 共鳴：同回合打出 3 張同派系牌 ---------- */
const RESONANCE = {
  flame: { desc: '對所有敵人施加 3 灼燒', fire(C) { C.applyAll('burn', 3); } },
  frost: { desc: '獲得 7 格擋', fire(C) { C.block(7, true); } },
  bone:  { desc: '獲得 2 骨，所有友軍 +1 攻擊', fire(C) { C.gainBones(2); for (const a of C.allyList()) a.atk++; } },
  storm: { desc: '獲得 1 能量與 1 步', fire(C) { C.gainEnergy(1); C.gainSteps(1); } },
};

/* ---------- 燼階（難度）---------- */
const HEAT = [
  { name: '燼階 0', desc: '標準旅程。' },
  { name: '燼階 1', desc: '菁英敵人生命 +20%。' },
  { name: '燼階 2', desc: '以 90% 生命出發；營火休息回復 25%；換幕時只回復一半的已損生命。' },
  { name: '燼階 3', desc: '開局沒有燭火（沒有額外生命）。' },
  { name: '燼階 4', desc: '所有敵人攻擊傷害 +15%。' },
  { name: '燼階 5', desc: '首領生命 +25%。' },
];
