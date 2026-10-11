'use strict';
/* =========================================================
   九宮符 試作：三條規則的畫符消除，五場戰鬥的小旅程
   ① 每回合從手牌挑 3 張寫進九宮格
   ② 填滿一條線（橫、直、斜）就發動，然後燒掉：劍是傷害，盾是護盾
   ③ 一條線三張同類 ×3；一筆同時完成好幾條線，每條再乘上線數
   ========================================================= */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = (s, r = document) => r.querySelector(s);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const sample = (a, n) => shuffle(a.slice()).slice(0, n);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let UID = 1;

const LINES = [
  { c: [0, 1, 2], n: '上列' }, { c: [3, 4, 5], n: '中列' }, { c: [6, 7, 8], n: '下列' },
  { c: [0, 3, 6], n: '左行' }, { c: [1, 4, 7], n: '中行' }, { c: [2, 5, 8], n: '右行' },
  { c: [0, 4, 8], n: '斜線', diag: true }, { c: [2, 4, 6], n: '斜線', diag: true },
];

/* ---------- 字牌：每張只有一句話的能力 ---------- */
const CARDS = {
  sword:  { suit: '劍', glyph: '劍', text: '' },
  shield: { suit: '盾', glyph: '盾', text: '' },
  zhan:   { suit: '劍', glyph: '斬', v: 7, text: '數字大，沒有特殊能力。' },
  lian:   { suit: '劍', glyph: '連', v: 3, text: '它所在的線發動時，這回合多寫 1 筆。' },
  shuang: { suit: '劍', glyph: '雙', v: 3, text: '發動時數字翻倍。' },
  feng:   { suit: '劍', glyph: '鋒', v: 2, text: '留在符上每過一回合，數字 +2。' },
  bao:    { suit: '劍', glyph: '爆', v: 3, text: '燒掉時，對所有敵人造成 6 傷害。' },
  heng:   { suit: '劍', glyph: '恆', v: 3, text: '發動後不會燒掉。' },
  chou:   { suit: '劍', glyph: '抽', v: 2, text: '寫下時抽 1 張牌。' },
  zhong:  { suit: '劍', glyph: '中', v: 3, text: '寫在中宮時，數字 ×3。' },
  wan:    { suit: '萬', glyph: '萬', v: 3, text: '算劍也算盾，讓這條線更容易同類。' },
  jian:   { suit: '盾', glyph: '堅', v: 7, text: '數字大，沒有特殊能力。' },
  fan:    { suit: '盾', glyph: '反', v: 3, text: '它所在的線產生的護盾，也化為等量傷害。' },
  cang:   { suit: '盾', glyph: '藏', v: 3, text: '它發動的回合，護盾保留到下回合。' },
  ink:    { suit: '墨', glyph: '墨', v: 0, text: '敵人潑的墨：沒有數字，會打斷同類。' },
};
const REWARD_POOL = [['zhan'], ['jian'], ['lian'], ['shuang'], ['feng'], ['bao'], ['heng'], ['chou'], ['zhong'], ['wan'], ['fan'], ['cang'], ['sword', 5], ['shield', 5]];

/* ---------- 朱印：每個只改一條規則 ---------- */
const CHARMS = {
  center: { name: '中宮印', text: '中宮的字，數字 ×2。' },
  pure:   { name: '純劍印', text: '三劍同線的倍率從 ×3 變成 ×5。' },
  wall:   { name: '鐵壁印', text: '三盾同線的倍率從 ×3 變成 ×5。' },
  combo:  { name: '連擊印', text: '一筆完成 2 條線以上時，每條再 ×2。' },
  blade:  { name: '盾刃印', text: '回合結束時，護盾的一半化為傷害打向目標。' },
  diag:   { name: '斜印', text: '斜線發動時 ×2。' },
  ember:  { name: '燼印', text: '本場戰鬥每燒掉 1 個字，之後每條造成傷害的線 +1。' },
  brush:  { name: '長筆印', text: '每回合可以多寫 1 筆。' },
  keep:   { name: '不滅印', text: '每回合第一條發動的線不會燒掉。' },
  sleeve: { name: '袖裡印', text: '每回合多抽 1 張牌。' },
  ink:    { name: '墨鬥印', text: '敵人潑的墨算作劍 3，墨連成的線也會發動。' },
};
const STARTER_CHARMS = ['center', 'pure', 'blade', 'keep', 'ember', 'combo'];

/* ---------- 格印：替九宮格的某一格加特性 ---------- */
const MARKS = {
  gold: { name: '金格', short: '金', text: '寫在這格的字，數字 ×2。' },
  stay: { name: '恆格', short: '恆', text: '這格的字發動後不會燒掉。' },
  fire: { name: '火格', short: '火', text: '經過這格的線發動時，額外 +6 傷害。' },
};

/* ---------- 敵人：意圖照固定順序循環 ---------- */
const FOES = {
  crow:    { name: '腐鴉', glyph: '鴉', hp: 16, moves: [['atk', 5], ['ink', 1], ['atk', 6]] },
  wolf:    { name: '荒原狼', glyph: '狼', hp: 28, moves: [['atk', 7], ['buff', 2], ['atk', 8]] },
  beetle:  { name: '骨甲蟲', glyph: '甲', hp: 28, moves: [['block', 8], ['atk', 6]] },
  general: { name: '骸骨將軍', glyph: '將', hp: 80, tag: '菁英', moves: [['atk', 10], ['tear', 1], ['atk', 13], ['ink', 2]] },
  skel:    { name: '骸兵', glyph: '骸', hp: 16, moves: [['atk', 4]] },
  shroom:  { name: '菌菇人', glyph: '菇', hp: 36, moves: [['ink', 1], ['atk', 9]] },
  scorp:   { name: '沙蠍', glyph: '蠍', hp: 24, moves: [['atk2', 4], ['atk', 6]] },
  king:    { name: '腐骨之王', glyph: '王', hp: 190, tag: '首領', boss: true, moves: [['ink', 2], ['atk', 14], ['tear', 2], ['atk', 11], ['buff', 3]] },
};
const STAGES = [
  { name: '第一戰', foes: ['crow', 'crow'], after: ['card', 'item', 'remove'] },
  { name: '第二戰', foes: ['wolf', 'beetle'], after: ['card', 'charm'] },
  { name: '菁英戰', foes: ['general', 'skel'], after: ['card', 'item', 'mark'] },
  { name: '第四戰', foes: ['shroom', 'scorp', 'crow'], after: ['card', 'charm', 'remove'] },
  { name: '首領戰', foes: ['king'], after: [] },
];

/* =========================================================
   狀態
   ========================================================= */
let G, F;
const has = id => G.charms.includes(id);
const hasRelic = id => G.relics.includes(id);

/* 桌上的物品：法器放左邊一直有效；道具放右邊，用一次就沒了（最多 3 個） */
const ITEMS = {
  inkstone: { kind: 'relic', name: '老硯台', text: '每回合寫下的第一個字，數字 +1。' },
  burner: { kind: 'relic', name: '香爐', text: '每燒掉 4 個字，得到 3 護盾。' },
  candle: { kind: 'relic', name: '長明燭', text: '每場戰鬥的前 3 回合，第一條發動的線傷害 +4。蠟燭每回合燒短一截。' },
  slips: { kind: 'item', name: '備用符紙', text: '抽 2 張牌。', use() { drawCards(2); floatOn($('.hand'), '+2', 'note'); } },
  cinnabar: { kind: 'item', name: '朱砂', text: '這回合多寫 1 筆。', use() { F.writesLeft++; floatOn($('.u-ink'), '+1', 'note'); } },
};
const newCard = (id, v) => ({ uid: UID++, id, v: v != null ? v : CARDS[id].v, grow: 0 });

function newRun() {
  G = { hp: 50, maxHp: 50, deck: [], charms: [], marks: Array(9).fill(null), relics: ['inkstone'], items: [{ id: 'slips', k: UID++ }, { id: 'cinnabar', k: UID++ }], pos: {}, stage: 0, stats: { maxHit: 0, maxCombo: 1, burned: 0, turns: 0 } };
  for (const v of [3, 3, 3, 4, 4]) G.deck.push(newCard('sword', v));
  for (const v of [3, 3, 3, 4, 4]) G.deck.push(newCard('shield', v));
  F = null;
}

const suitOf = c => c.id === 'ink' ? (has('ink') ? '劍' : '墨') : CARDS[c.id].suit;
function cardValue(c, i) {
  if (c.id === 'ink') return has('ink') ? 3 : 0;
  let v = c.v + c.grow + (c.bonus || 0);
  if (c.id === 'zhong' && i === 4) v *= 3;
  if (c.id === 'shuang') v *= 2;
  if (i === 4 && has('center')) v *= 2;
  if (G.marks[i] === 'gold') v *= 2;
  return v;
}

/* =========================================================
   戰鬥
   ========================================================= */
function startStage(i) {
  G.stage = i;
  const st = STAGES[i];
  F = {
    enemies: st.foes.map((id, k) => ({ k, id, ...FOES[id], max: FOES[id].hp, block: 0, str: 0, mi: 0, dead: false })),
    target: 0, board: Array(9).fill(null), hand: [], discard: [], sel: null,
    draw: shuffle(G.deck.map(c => ({ ...c, grow: 0 }))),
    writesLeft: 3, block: 0, keepBlock: false, keptThisTurn: false, burned: 0, busy: false, turn: 0,
    lit: new Set(), burning: new Set(), notes: [], last: null, fid: ++FID, zoom: false,
    candle: G.relics.includes('candle') ? 3 : 0, candleUsed: false, ash: 0, firstWritten: false,
  };
  renderFight();
  banner(st.name);
  startTurn();
}

const alive = () => F.enemies.filter(e => !e.dead);
function target() {
  let t = F.enemies[F.target];
  if (!t || t.dead) { t = alive()[0]; if (t) F.target = t.k; }
  return t;
}

function drawCards(n) {
  for (let i = 0; i < n; i++) {
    if (!F.draw.length) { F.draw = shuffle(F.discard); F.discard = []; }
    if (!F.draw.length) break;
    F.hand.push(F.draw.pop());
  }
}

function startTurn() {
  F.turn++; G.stats.turns++;
  if (F.turn > 1 && F.candle > 0) F.candle--;
  F.candleUsed = false; F.firstWritten = false;
  if (!F.keepBlock) F.block = 0;
  F.keepBlock = false; F.keptThisTurn = false;
  for (const c of F.board) if (c && c.id === 'feng') c.grow += 2;
  F.writesLeft = 3 + (has('brush') ? 1 : 0);
  drawCards(5 + (has('sleeve') ? 1 : 0) - F.hand.length);
  F.notes = [];
  renderFight();
}

async function writeCard(card, i) {
  F.board[i] = card;
  if (hasRelic('inkstone') && !F.firstWritten) card.bonus = (card.bonus || 0) + 1;
  F.firstWritten = true;
  F.hand = F.hand.filter(c => c !== card);
  F.writesLeft--; F.sel = null;
  if (card.id === 'chou') drawCards(1);
  const lines = LINES.filter(L => L.c.includes(i) && L.c.every(j => F.board[j]));
  if (!lines.length) { renderFight(); return autoEndTurn(); }
  await fire(lines, false);
  autoEndTurn();
}
// 這回合的牌出完了（墨用完或手牌空了）：看一下結果就自動下筆，鏡頭退回總覽看敵人出手
function autoEndTurn() {
  if (!F || F.won || (F.writesLeft > 0 && F.hand.length)) return;
  const fid = F.fid;
  setTimeout(() => { if (F && F.fid === fid && !F.busy && !F.won) endTurn(); }, 650);
}

function scoreLine(L, combo, extra = 0) {
  const cs = L.c.map(j => F.board[j]);
  const suits = cs.map(suitOf);
  const real = suits.filter(s => s !== '萬');
  let same = null;
  if (!real.length) same = '劍';
  else if (real.every(s => s === real[0]) && real[0] !== '墨') same = real[0];
  let sw = 0, sh = 0;
  cs.forEach((c, k) => {
    const v = cardValue(c, L.c[k]), s = suits[k];
    if (s === '劍') sw += v; else if (s === '盾') sh += v; else if (s === '萬') { if (same === '盾') sh += v; else sw += v; }
  });
  let m = 1; const tags = [];
  if (same) { const x = (same === '劍' && has('pure')) || (same === '盾' && has('wall')) ? 5 : 3; m *= x; tags.push(`×${x}`); }
  if (combo > 1) { m *= combo; tags.push(`×${combo}`); if (has('combo')) { m *= 2; tags.push('×2'); } }
  if (L.diag && has('diag')) { m *= 2; tags.push('×2'); }
  let dmg = sw * m, blk = sh * m;
  if (blk && cs.some(c => c.id === 'fan')) { dmg += blk; tags.push(`+${blk}`); }
  if (dmg > 0 && has('ember') && F.burned) { dmg += F.burned; tags.push(`+${F.burned}`); }
  if (L.c.some(j => G.marks[j] === 'fire')) { dmg += 6; tags.push('+6'); }
  if (extra && dmg > 0) { dmg += extra; tags.push(`+${extra}`); }
  const base = [sw ? `劍 ${sw}` : '', sh ? `盾 ${sh}` : ''].filter(Boolean).join(' ') || '0';
  const res = [dmg ? `${dmg} 傷` : '', blk ? `${blk} 盾` : ''].filter(Boolean).join(' ') || '—';
  return { dmg, blk, text: `${base}${tags.length ? ' ' + tags.join(' ') : ''} → <b>${res}</b>` };
}

async function fire(lines, byInk) {
  const prevBusy = F.busy;
  F.busy = true;
  const combo = lines.length;
  if (!byInk) { G.stats.maxCombo = Math.max(G.stats.maxCombo, combo); if (combo > 1) banner(`一筆 ${combo} 線！`); }
  const toBurn = new Set();
  F.notes = [];
  for (let k = 0; k < lines.length; k++) {
    const L = lines[k];
    const inkOnly = byInk && !has('ink');
    F.lit = new Set(L.c);
    let r;
    if (inkOnly) r = { dmg: 0, blk: 0, text: '墨線 → <b>燒掉</b>' };
    else {
      const candle = F.candle > 0 && !F.candleUsed;   // 長明燭：每回合第一條線 +4
      r = scoreLine(L, combo, candle ? 4 : 0);
      if (candle && r.dmg > 0) F.candleUsed = true;
    }
    F.notes.push(r.text);
    if (r.dmg > 0) { const t = target(); if (t) hurtEnemy(t, r.dmg); G.stats.maxHit = Math.max(G.stats.maxHit, r.dmg); }
    if (r.blk > 0) { F.block += r.blk; floatOn($('#top .stat.blk'), `+${r.blk}`, 'blk'); }
    renderFight();
    await sleep(700);
    const keepThis = !inkOnly && has('keep') && !F.keptThisTurn;
    if (keepThis) F.keptThisTurn = true;
    const cells = L.c.map(j => F.board[j]).filter(Boolean);
    for (const j of L.c) {
      const c = F.board[j];
      if (!c || keepThis || c.id === 'heng' || G.marks[j] === 'stay') continue;
      toBurn.add(j);
    }
    if (!inkOnly) {
      if (cells.some(c => c.id === 'lian')) { F.writesLeft++; floatOn($('.u-ink'), '+1', 'note'); }
      if (cells.some(c => c.id === 'cang')) { F.keepBlock = true; floatOn($('#top .stat.blk'), '保留', 'blk'); }
    }
    if (!alive().length) break;
  }
  F.lit = new Set(); F.burning = toBurn; renderFight();
  await sleep(480);
  let aoe = 0, words = 0;
  for (const j of toBurn) {
    const c = F.board[j];
    F.board[j] = null;
    if (!c) continue;
    if (c.id !== 'ink') { c.bonus = 0; F.discard.push(c); words++; }
    F.burned++; G.stats.burned++;
    if (c.id === 'bao') aoe += 6;
  }
  F.burning = new Set();
  if (hasRelic('burner') && words) {
    puff();
    F.ash += words;
    while (F.ash >= 4) { F.ash -= 4; F.block += 3; floatOn($('#top .stat.blk'), '+3', 'blk'); }
  }
  if (aoe) { for (const e of alive()) hurtEnemy(e, aoe); }
  F.busy = prevBusy;   // 先解除忙碌再重畫，「下筆」才不會一直灰著
  renderFight();
  if (!alive().length && !prevBusy) await winFight();
}

function hurtEnemy(e, n) {
  const b = Math.min(e.block, n);
  e.block -= b;
  e.hp -= n - b;
  const el = monEl(e.k);
  floatOn(monTag(e.k), n - b > 0 ? `-${n - b}` : '格擋', 'dmg');
  if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
  if (e.hp <= 0) { e.hp = 0; e.dead = true; }
}

function hitPlayer(n) {
  const b = Math.min(F.block, n);
  F.block -= b;
  const loss = n - b;
  G.hp -= loss;
  floatOn($('#top .stat.hp'), loss > 0 ? `-${loss}` : '擋下', loss > 0 ? 'hurt' : 'blk');
}

async function placeInk() {
  const empty = F.board.map((c, i) => c ? -1 : i).filter(i => i >= 0);
  if (!empty.length) return;
  const i = empty[Math.floor(Math.random() * empty.length)];
  F.board[i] = newCard('ink');
  renderFight();
  await sleep(300);
  const lines = LINES.filter(L => L.c.includes(i) && L.c.every(j => F.board[j]));
  if (lines.length) await fire(lines, true);
}

function tear() {
  const filled = F.board.map((c, i) => c && c.id !== 'ink' ? i : -1).filter(i => i >= 0);
  if (!filled.length) return;
  const i = filled[Math.floor(Math.random() * filled.length)];
  F.board[i].bonus = 0;
  F.discard.push(F.board[i]);
  F.board[i] = null;
}

async function endTurn() {
  if (!F || F.busy) return;
  F.busy = true; F.sel = null;
  if (has('blade') && F.block > 0) {
    const d = Math.floor(F.block / 2);
    const t = target();
    if (t && d) hurtEnemy(t, d);
  }
  F.discard.push(...F.hand); F.hand = [];
  const wasZoom = F.zoom;
  setZoom(false);
  renderFight();
  await sleep(wasZoom ? 750 : 350);
  if (!alive().length) { F.busy = false; return winFight(); }
  for (const e of alive()) {
    e.block = 0;
    const [type, v] = e.moves[e.mi % e.moves.length];
    e.mi++;
    const el = monEl(e.k);
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    stir();
    if (type === 'atk') hitPlayer(v + e.str);
    else if (type === 'atk2') { hitPlayer(v + e.str); renderFight(); await sleep(260); hitPlayer(v + e.str); }
    else if (type === 'buff') { e.str += v; floatOn(monTag(e.k), `力量 +${v}`, 'note'); }
    else if (type === 'block') { e.block += v; floatOn(monTag(e.k), `+${v} 格擋`, 'blk'); }
    else if (type === 'ink') { for (let n = 0; n < v; n++) await placeInk(); floatOn($('.w-board .paper'), '潑墨', 'note'); }
    else if (type === 'tear') { for (let n = 0; n < v; n++) tear(); floatOn($('.w-board .paper'), '撕符', 'note'); }
    renderFight();
    await sleep(560);
    if (G.hp <= 0) return endRun(false);
    if (!alive().length) { F.busy = false; return winFight(); }
  }
  F.busy = false;
  startTurn();
}

async function winFight() {
  if (F.won) return;
  F.won = true;
  banner('勝利');
  await sleep(1100);
  if (G.stage === STAGES.length - 1) return endRun(true);
  G.hp = Math.min(G.maxHp, G.hp + 8);
  runSteps(STAGES[G.stage].after.slice());
}

/* =========================================================
   畫面
   ========================================================= */
function renderTop() {
  const top = $('#top');
  top.innerHTML = `
    <span class="stat hp"><i>命</i>${Math.max(0, G.hp)}/${G.maxHp}</span>
    <span class="stat blk"><i>盾</i>${F && !F.won ? F.block : 0}</span>
    <span class="charms">${G.charms.map(id => `<span class="charm" title="${esc(CHARMS[id].text)}">${CHARMS[id].name}</span>`).join('')}</span>
    <span class="stage" aria-label="第 ${G.stage + 1} 場，共 ${STAGES.length} 場">${G.stage + 1}/${STAGES.length}</span>
    <button class="btn ib" id="deckBtn" type="button" aria-label="牌組">牌 ${G.deck.length}</button>
    <button class="btn ib" id="helpBtn" type="button" aria-label="規則">？</button>`;
  $('#deckBtn').onclick = showDeck;
  $('#helpBtn').onclick = showHelp;
  // 手機沒有滑鼠提示：點朱印直接看說明
  top.querySelector('.charms').onclick = e => { const c = e.target.closest('.charm'); if (c) modal(`<h3>${esc(c.textContent)}</h3><p>${esc(c.title)}</p>`); };
}

function cardHTML(c, extra = '', style = '') {
  const d = CARDS[c.id];
  const v = c.v + (c.grow || 0);
  return `<div class="card s-${d.suit} ${extra}" data-uid="${c.uid}"${d.text ? ` title="${esc(d.text)}"` : ''}${style ? ` style="${style}"` : ''}>
    <span class="cnum">${v}</span><span class="cg">${d.glyph}</span>
    <span class="cs">${d.suit === '萬' ? '萬用' : d.suit}</span>
    ${d.text ? `<span class="ct">${d.text}</span>` : ''}</div>`;
}

function intentText(e) {
  const [t, v] = e.moves[e.mi % e.moves.length];
  if (t === 'atk') return [`攻 ${v + e.str}`, ''];
  if (t === 'atk2') return [`攻 ${v + e.str}×2`, ''];
  if (t === 'buff') return ['強化', 'soft'];
  if (t === 'block') return [`擋 ${v}`, 'soft'];
  if (t === 'ink') return [`墨 ×${v}`, 'soft'];
  if (t === 'tear') return [`撕 ×${v}`, 'soft'];
  return ['', 'soft'];
}

/* ---------- 戰鬥畫面：一張供桌，鏡頭在「總覽」與「放大符紙」之間移動 ---------- */
let FID = 0;
// 隔著供桌對弈的古神：前兩場燈婆、中間兩場古龍、最後一場雷淵之眼
const ANCIENTS = {
  1: { name: '守燭人・燈婆', text: '提著燈的老婆婆，笑著看你下筆。' },
  2: { name: '玄冥古龍', text: '盤在黑暗裡的老龍，鬚上掛著冰。' },
  3: { name: '雷淵之眼・太一', text: '一圈符牌圍著的巨眼，什麼都看得見。' },
};
const ANCIENT_OF_STAGE = [1, 1, 2, 2, 3];
function stir() {
  const a = $('.w-ancient');
  if (a) { a.classList.remove('stir'); void a.offsetWidth; a.classList.add('stir'); }
}
const monEl = k => $(`.mon[data-k="${k}"]`);
const monTag = k => $(`.mon[data-k="${k}"] .mon-tag`);

function setZoom(on) {
  if (!F) return;
  F.zoom = on;
  const d = $('#main .duel');
  if (!d) return;
  if (on) fitCamera();
  d.classList.toggle('zoom', on);
}

// 放大時：符紙盡量大，但留一點兩側道具、上方敵人名牌，且不壓到下方的手牌列
function fitCamera() {
  const d = $('#main .duel'); if (!d) return;
  const w = $('.world', d), p = $('.w-board .paper', d), ui = $('.ui', d);
  const Hw = w.offsetHeight, bw = p.offsetWidth, bh = p.offsetHeight;
  if (!bw || !bh) return;
  const s = Math.min(0.82 * w.offsetWidth / bw, 0.6 * Hw / bh);
  const uiTop = d.offsetHeight - ui.offsetHeight;
  const center = Math.min(uiTop - 8 - bh * s / 2, Hw * .5 + bh * s / 2);
  d.style.setProperty('--zs', s.toFixed(3));
  d.style.setProperty('--zy', Math.round(center - Hw * .72) + 'px');
}
addEventListener('resize', () => { if (F && F.zoom) fitCamera(); });

function puff() {
  const b = $('.it-burner');
  if (b) { b.classList.remove('puff'); void b.offsetWidth; b.classList.add('puff'); }
}

const PILE_INFO = {
  draw: () => `<h3>符紙疊（抽牌堆）</h3><p class="dim">還有 ${F.draw.length} 張，看不到順序。</p>
    <div class="deck">${[...F.draw].sort((a, b) => a.id.localeCompare(b.id)).map(c => cardHTML(c)).join('') || '<span class="dim">抽完了，會把香爐裡的洗回來。</span>'}</div>`,
  ash: () => `<h3>棄牌堆</h3><p class="dim">燒掉的字和沒用完的手牌都放進這裡；抽牌堆抽完時，會全部洗回去。</p>
    <div class="deck">${F.discard.map(c => cardHTML(c)).join('') || '<span class="dim">還是空的。</span>'}</div>`,
};

function nudge(el) {
  if (!el) return;
  el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope');
}
// 小木桌（#241）是梯形：遠端桌緣在 41cqh，左右各內縮 13%，越靠近玩家越寬
const TABLE_TOP = 41, TABLE_RATIO = .953, THING_W = 13, THING_H = 9;
function tableEdge(yPct) {
  const w = $('#main .world');
  if (!w) return 3;
  const t = Math.min(Math.max((yPct - TABLE_TOP) / (TABLE_RATIO * w.offsetWidth / w.offsetHeight * 100), 0), 1);
  return Math.max(0, 13 - 16 * t);
}
function thingHTML(id, key, n, idx) {
  const d = ITEMS[id];
  let p = G.pos[key];
  if (!p) {   // 預設：法器沿左邊桌緣、道具沿右邊桌緣排下來
    const y = 44 + n * 13, edge = tableEdge(y + THING_H) + 1;
    p = { x: d.kind === 'relic' ? edge : 100 - edge - THING_W, y };
  }
  const cls = id === 'candle' ? ` c-${['out', 'low', 'mid', 'full'][F.candle]}` : '';
  const tag = id === 'burner' ? `<b>${F.ash}/4</b>` : '';
  return `<button class="it it-${id}${cls}" type="button" data-id="${id}" data-key="${key}" data-kind="${d.kind}"${idx != null ? ` data-idx="${idx}"` : ''}
    style="left:${p.x}cqw;top:${p.y}cqh" aria-label="${d.name}"><i></i>${tag}</button>`;
}
function showItem(id, idx) {
  const d = ITEMS[id];
  const usable = d.kind === 'item';
  modal(`<h3>${d.name}</h3><p class="dim">${usable ? '道具・用一次就沒了' : '法器・放在桌上一直有效'}</p><p>${d.text}</p>
    ${usable ? `<button class="btn primary" id="useIt" type="button" ${F.busy ? 'disabled' : ''}>使用</button>` : ''}`);
  if (usable) $('#useIt').onclick = () => { $('#modal').hidden = true; $('#modal').innerHTML = ''; useItem(+idx); };
}
function useItem(idx) {
  if (!F || F.busy) return;
  const it = G.items[idx];
  if (!it) return;
  G.items.splice(idx, 1);
  delete G.pos['i:' + it.k];
  ITEMS[it.id].use();
  renderFight();
}

// 物品下緣不能壓到手牌列；放到符紙上時推到旁邊
function maxThingY(world, it) {
  const d = world.closest('.duel'), ui = $('.ui', d);
  return (d.offsetHeight - ui.offsetHeight - it.offsetHeight - 4) / world.offsetHeight * 100;
}
function clearOfBoard(world, it, x, y) {
  const W = world.offsetWidth, H = world.offsetHeight, b = $('.w-board', world);
  const bw = b.offsetWidth, bh = b.offsetHeight, bl = b.offsetLeft - bw / 2, bt = b.offsetTop - bh / 2;
  const iw = it.offsetWidth, ih = it.offsetHeight;
  let px = x / 100 * W;
  const py = y / 100 * H;
  if (px < bl + bw && px + iw > bl && py < bt + bh && py + ih > bt) {
    px = px + iw / 2 < bl + bw / 2 ? bl - iw - 2 : bl + bw + 2;
    const edge = tableEdge((py + ih) / H * 100) / 100 * W;
    px = Math.min(Math.max(px, edge), W - edge - iw);
  }
  return { x: +(px / W * 100).toFixed(2), y: +(py / H * 100).toFixed(2) };
}
// 手牌拖到格子上：拖動時跟著手指走，空格亮起來；沒拖動就照舊當成點選
let CD = null, suppressClick = false;
function bindCardDrag(hand) {
  hand.addEventListener('pointerdown', e => {
    const el = e.target.closest('.card');
    if (!el || !F || F.busy || e.button > 0) return;
    CD = { el, uid: +el.dataset.uid, sx: e.clientX, sy: e.clientY, ghost: null, cell: null };
  });
}
function startCardDrag(d) {
  const r = d.el.getBoundingClientRect();
  d.ox = d.sx - r.left; d.oy = d.sy - r.top;
  const g = d.el.cloneNode(true);
  g.classList.remove('sel');
  g.classList.add('ghost');
  g.style.cssText = `--cw:${d.el.offsetWidth}px;width:${d.el.offsetWidth}px;height:${d.el.offsetHeight}px`;
  $('#fx').append(g);
  d.ghost = g;
  d.el.classList.add('lifted');
  F.cardDrag = true; F.sel = d.uid;
  if (!F.zoom) setZoom(true);   // 在總覽時拖牌，鏡頭自動湊近符紙
  renderFight();                // 空格亮起來（手牌這時不重畫）
}
addEventListener('pointermove', e => {
  const d = CD;
  if (!d) return;
  if (!d.ghost) {
    if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return;
    startCardDrag(d);
  }
  d.ghost.style.left = (e.clientX - d.ox) + 'px';
  d.ghost.style.top = (e.clientY - d.oy) + 'px';
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const cell = under && under.closest('.duel .cell');
  if (cell !== d.cell) {
    if (d.cell) d.cell.classList.remove('drop');
    d.cell = cell;
    if (cell && !F.board[+cell.dataset.i]) cell.classList.add('drop');
  }
});
function endCardDrag(e) {
  const d = CD;
  CD = null;
  if (!d || !d.ghost) return;   // 沒拖動：交給 click 當點選
  suppressClick = true;
  setTimeout(() => { suppressClick = false; }, 0);
  d.ghost.remove();
  F.cardDrag = false;
  const i = d.cell ? +d.cell.dataset.i : -1;
  const card = F.hand.find(c => c.uid === d.uid);
  if (e.type === 'pointerup' && i >= 0 && card && !F.busy) {
    if (!F.board[i] && F.writesLeft > 0) return writeCard(card, i);
    F.sel = null;
    renderFight();
    return nudge(F.board[i] ? $(`.cell[data-i="${i}"]`) : $('.u-ink'));
  }
  F.sel = null;
  renderFight();
}
addEventListener('pointerup', endCardDrag);
addEventListener('pointercancel', endCardDrag);

// 在桌面上滑動：往上滑湊近符紙，往下滑退回總覽（拖物品、拖牌時不算）
function bindSwipe(world) {
  let sw = null;
  world.addEventListener('pointerdown', e => {
    if (e.target.closest('.it') || e.button > 0) return;
    sw = { x: e.clientX, y: e.clientY };
  });
  world.addEventListener('pointerup', e => {
    if (!sw) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
    sw = null;
    if (Math.abs(dy) < 45 || Math.abs(dx) > Math.abs(dy) || !F || F.dragging) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    setZoom(dy < 0);
  });
  world.addEventListener('pointercancel', () => { sw = null; });
}

// 按住拖動；放開時沒移動就當成點一下（看說明）
function bindDrag(world) {
  let d = null;
  world.addEventListener('pointerdown', e => {
    const it = e.target.closest('.it');
    if (!it || e.button > 0) return;
    const r = world.getBoundingClientRect(), ir = it.getBoundingClientRect(), k = world.offsetWidth / r.width;
    d = { it, r, k, sx: e.clientX, sy: e.clientY, ox: (e.clientX - ir.left) * k, oy: (e.clientY - ir.top) * k, moved: false };
    try { it.setPointerCapture(e.pointerId); } catch (err) { /* 合成事件沒有真的指標 */ }
  });
  world.addEventListener('pointermove', e => {
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 6) return;
    if (!d.moved) { d.moved = true; F.dragging = true; d.it.classList.add('dragging'); }
    const W = world.offsetWidth, H = world.offsetHeight;
    d.y = Math.min(Math.max(((e.clientY - d.r.top) * d.k - d.oy) / H * 100, TABLE_TOP + 1), maxThingY(world, d.it));
    const edge = tableEdge(d.y + d.it.offsetHeight / H * 100) + .5;   // 留在梯形桌面上
    d.x = Math.min(Math.max(((e.clientX - d.r.left) * d.k - d.ox) / W * 100, edge), 100 - edge - d.it.offsetWidth / W * 100);
    d.it.style.left = d.x + 'cqw';
    d.it.style.top = d.y + 'cqh';
  });
  const end = e => {
    if (!d) return;
    const cur = d;
    d = null;
    if (!cur.moved) { if (e.type === 'pointerup') showItem(cur.it.dataset.id, cur.it.dataset.idx); return; }
    F.dragging = false;
    G.pos[cur.it.dataset.key] = clearOfBoard(world, cur.it, cur.x, cur.y);
    renderFight();
  };
  world.addEventListener('pointerup', end);
  world.addEventListener('pointercancel', end);
}

function buildDuel() {
  const main = $('#main');
  main.classList.add('s-fight-pad');
  main.innerHTML = `
    <div class="duel" data-fid="${F.fid}">
      <div class="world">
        <div class="w-ancient a${ANCIENT_OF_STAGE[G.stage] || 1}" data-a="${ANCIENT_OF_STAGE[G.stage] || 1}"></div>
        <div class="w-table"></div><div class="w-light"></div>
        <div class="w-foes"></div>
        <div class="w-board"><div class="paper"><div class="board"></div></div></div>
        <div class="w-things"></div>
      </div>
      <div class="ui">
        <div class="u-row">
          <button class="stack s-draw" type="button" data-p="draw" aria-label="抽牌堆"><i></i><i></i><i></i><b></b></button>
          <div class="u-mid"><div class="u-note" aria-live="polite"></div><span class="u-ink" role="img"></span></div>
          <button class="seal-end" id="endBtn" type="button" aria-label="下筆，提早結束回合"><span>下</span><span>筆</span></button>
          <button class="stack s-ash" type="button" data-p="ash" aria-label="棄牌堆"><i></i><i></i><i></i><b></b></button>
        </div>
        <div class="hand"></div>
      </div>
    </div>`;
  const duel = $('.duel', main);
  $('#endBtn').onclick = endTurn;
  $('.u-row', duel).addEventListener('click', e => { const p = e.target.closest('.stack'); if (p) modal(PILE_INFO[p.dataset.p]()); });
  bindSwipe($('.world', duel));
  bindDrag($('.world', duel));
  bindCardDrag($('.hand', duel));
  $('.world', duel).onclick = e => {
    if (suppressClick) return;
    const mon = e.target.closest('.mon');
    if (mon) { if (!F.busy) { F.target = +mon.dataset.k; renderFight(); } return; }
    const anc = e.target.closest('.w-ancient');
    if (anc) { const a = ANCIENTS[anc.dataset.a]; modal(`<h3>${a.name}</h3><p class="dim">${a.text}</p>`); return; }
    const it = e.target.closest('.it');
    if (it) { if (e.detail === 0) showItem(it.dataset.id, it.dataset.idx); return; }   // 鍵盤操作；滑鼠與觸控由拖動處理
    if (!e.target.closest('.w-board')) { if (F.zoom) setZoom(false); return; }   // 放大時點符紙以外的地方：退回總覽
    if (!F.zoom) { setZoom(true); return; }
    const el = e.target.closest('.cell'); if (!el || F.busy) return;
    const i = +el.dataset.i;
    if (F.board[i]) return nudge(el);
    if (F.sel == null) return nudge($('.hand', duel));
    if (F.writesLeft <= 0) return nudge($('.u-ink', duel));
    const card = F.hand.find(c => c.uid === F.sel);
    if (card) writeCard(card, i);
  };
  $('.hand', duel).onclick = e => {
    if (suppressClick) return;
    const el = e.target.closest('.card'); if (!el || F.busy) return;
    const uid = +el.dataset.uid;
    F.sel = F.sel === uid ? null : uid;
    if (F.sel != null && !F.zoom) setZoom(true);   // 拿起一張牌，鏡頭自動湊近符紙
    renderFight();
  };
}

function renderFight() {
  renderTop();
  let duel = $('#main .duel');
  if (!duel || duel.dataset.fid !== String(F.fid)) { buildDuel(); duel = $('#main .duel'); }
  duel.classList.toggle('zoom', !!F.zoom);
  const t = target();
  $('.w-foes', duel).innerHTML = F.enemies.map(e => {
    const [it, cls] = intentText(e);
    const art = window.ART && window.ART['foes/' + e.id];
    const kind = e.boss ? 'boss' : e.tag === '菁英' ? 'elite' : FOES[e.id].hp < 20 ? 'minion' : '';
    const extra = [e.str ? `力 ${e.str}` : '', e.block ? `擋 ${e.block}` : ''].filter(Boolean).join(' ');
    return `<div class="mon ${kind} ${e.dead ? 'dead' : ''} ${t === e && alive().length > 1 ? 'target' : ''}" data-k="${e.k}" title="${esc(e.name)}">
      ${art ? `<img class="fig" src="../${art.src}" alt="${esc(e.name)}">` : `<div class="token" aria-hidden="true">${e.glyph}</div>`}
      <div class="mon-tag">
        <div class="hpbar"><b style="width:${e.hp / e.max * 100}%"></b><span>${e.hp}/${e.max}</span></div>
        ${extra ? `<div class="mx">${extra}</div>` : ''}
        ${e.dead ? '' : `<div class="intent ${cls}">${it}</div>`}
      </div>
    </div>`;
  }).join('');
  $('.board', duel).innerHTML = F.board.map((c, i) => {
    const mark = G.marks[i] ? `<span class="mark m-${G.marks[i]}" title="${esc(MARKS[G.marks[i]].text)}">${MARKS[G.marks[i]].short}</span>` : '';
    const cls = ['cell', i === 4 ? 'center' : '', F.lit.has(i) ? 'lit' : '', F.burning.has(i) ? 'burn' : '', !c && F.sel != null && F.writesLeft > 0 && !F.busy ? 'can' : ''].join(' ');
    const inner = c ? `${c.id !== 'ink' || has('ink') ? `<span class="num">${cardValue(c, i)}</span>` : ''}<span class="glyph s-${suitOf(c)}">${CARDS[c.id].glyph}</span>` : '';
    return `<div class="${cls}" data-i="${i}">${inner}${mark}</div>`;
  }).join('');
  if (!F.dragging) {
    $('.w-things', duel).innerHTML = G.relics.map((id, n) => thingHTML(id, 'r:' + id, n)).join('')
      + G.items.map((it, n) => thingHTML(it.id, 'i:' + it.k, n, n)).join('');
  }
  for (const [sel, n] of [['.s-draw', F.draw.length], ['.s-ash', F.discard.length]]) {
    const st = $(sel, duel);
    $('b', st).textContent = n;
    st.classList.toggle('empty', !n);
  }
  const ink = $('.u-ink', duel);
  ink.innerHTML = F.writesLeft > 6 ? `<b>${F.writesLeft}</b>` : '<i></i>'.repeat(F.writesLeft) || '<i class="o"></i>';
  ink.setAttribute('aria-label', `還能寫 ${F.writesLeft} 筆`);
  const nk = F.notes.join('|');
  if (duel.dataset.nk !== nk) {   // 新的結果才重畫，讓它淡出一次就好
    duel.dataset.nk = nk;
    $('.u-note', duel).innerHTML = F.notes.slice(-2).map(n => `<div>${n}</div>`).join('');
  }
  const end = $('#endBtn');
  end.disabled = !!F.busy;
  if (!F.cardDrag) $('.hand', duel).innerHTML = F.hand.map((c, i, arr) => {
    const off = i - (arr.length - 1) / 2;
    return cardHTML(c, F.sel === c.uid ? 'sel' : '', `--r:${(off * 4.5).toFixed(1)}deg;--y:${(Math.abs(off) ** 1.6 * 5).toFixed(1)}px;z-index:${i + 1}`);
  }).join('');
}

/* ---------- 戰後的選擇 ---------- */
function runSteps(steps) {
  $('#main').classList.remove('s-fight-pad');
  const step = steps.shift();
  if (!step) return startStage(G.stage + 1);
  const next = () => runSteps(steps);
  renderTop();
  const main = $('#main');
  const head = `<p class="dim">戰鬥結束，回復 8 生命。目前生命 ${G.hp}/${G.maxHp}</p>`;
  if (step === 'card') {
    const offers = sample(REWARD_POOL, 3).map(([id, v]) => newCard(id, v));
    main.innerHTML = `<div class="screen">${head}<h2>選一張字牌加入牌組</h2>
      <div class="choices">${offers.map(c => cardHTML(c, 'pick new')).join('')}</div>
      <button class="btn" id="skip" type="button">略過</button></div>`;
    main.querySelector('.choices').onclick = e => { const el = e.target.closest('.card'); if (!el) return; G.deck.push(offers.find(c => c.uid === +el.dataset.uid)); next(); };
    $('#skip').onclick = next;
  } else if (step === 'remove') {
    main.innerHTML = `<div class="screen"><h2>可以移除一張牌</h2><p class="dim">牌組越精簡，越容易湊出同類連線。</p>
      <div class="deck">${G.deck.map(c => cardHTML(c, 'pick')).join('')}</div>
      <button class="btn" id="skip" type="button">不移除</button></div>`;
    main.querySelector('.deck').onclick = e => { const el = e.target.closest('.card'); if (!el) return; G.deck = G.deck.filter(c => c.uid !== +el.dataset.uid); next(); };
    $('#skip').onclick = next;
  } else if (step === 'charm') {
    const pool = Object.keys(CHARMS).filter(id => !has(id));
    const offers = sample(pool, 3);
    main.innerHTML = `<div class="screen"><h2>選一個朱印</h2><p class="dim">朱印會改寫一條規則，決定你的流派。</p>
      <div class="choices">${offers.map(id => `<div class="opt" data-id="${id}"><div class="og">印</div><b>${CHARMS[id].name}</b><small>${CHARMS[id].text}</small></div>`).join('')}</div>
      <button class="btn" id="skip" type="button">略過</button></div>`;
    main.querySelector('.choices').onclick = e => { const el = e.target.closest('.opt'); if (!el) return; G.charms.push(el.dataset.id); next(); };
    $('#skip').onclick = next;
  } else if (step === 'item') {
    const full = G.items.length >= 3;
    const pool = Object.keys(ITEMS).filter(id => ITEMS[id].kind === 'relic' ? !hasRelic(id) : !full);
    const offers = sample(pool, 3);
    main.innerHTML = `<div class="screen"><h2>選一件放上供桌</h2><p class="dim">法器放在左邊，一直有效；道具放在右邊，用一次就沒了，最多放 3 個。</p>
      <div class="choices">${offers.map(id => `<div class="opt" data-id="${id}"><div class="og it-art it-${id}"><i></i></div><span class="tag">${ITEMS[id].kind === 'relic' ? '法器' : '道具'}</span><b>${ITEMS[id].name}</b><small>${ITEMS[id].text}</small></div>`).join('')}</div>
      <button class="btn" id="skip" type="button">略過</button></div>`;
    main.querySelector('.choices').onclick = e => {
      const el = e.target.closest('.opt'); if (!el) return;
      const id = el.dataset.id;
      if (ITEMS[id].kind === 'relic') G.relics.push(id); else G.items.push({ id, k: UID++ });
      next();
    };
    $('#skip').onclick = next;
  } else if (step === 'mark') {
    main.innerHTML = `<div class="screen"><h2>選一種格印</h2><p class="dim">格印刻在九宮格的某一格，之後每場戰鬥都有效。</p>
      <div class="choices">${Object.entries(MARKS).map(([id, m]) => `<div class="opt" data-id="${id}"><div class="og">${m.short}</div><b>${m.name}</b><small>${m.text}</small></div>`).join('')}</div></div>`;
    main.querySelector('.choices').onclick = e => {
      const el = e.target.closest('.opt'); if (!el) return;
      const mid = el.dataset.id;
      main.innerHTML = `<div class="screen"><h2>把「${MARKS[mid].name}」刻在哪一格？</h2><p class="dim">中宮會被四條線經過，角落三條，邊上兩條。</p>
        <div class="minib">${G.marks.map((m, i) => `<div data-i="${i}">${m ? MARKS[m].short : i === 4 ? '中' : ''}</div>`).join('')}</div></div>`;
      main.querySelector('.minib').onclick = ev => { const c = ev.target.closest('[data-i]'); if (!c) return; G.marks[+c.dataset.i] = mid; next(); };
    };
  }
}

function buildName() {
  const count = id => G.deck.filter(c => c.id === id).length;
  const swords = G.deck.filter(c => CARDS[c.id].suit === '劍').length;
  const score = {
    '中宮連線流': (has('center') ? 2 : 0) + (has('combo') ? 2 : 0) + count('zhong') * 2 + (G.marks[4] ? 1 : 0),
    '純劍流': (has('pure') ? 3 : 0) + (swords / G.deck.length > 0.7 ? 2 : 0) + count('zhan'),
    '盾反流': (has('blade') ? 2 : 0) + (has('wall') ? 2 : 0) + count('fan') * 2 + count('cang') + count('jian'),
    '留陣成長流': (has('keep') ? 2 : 0) + count('heng') * 2 + count('feng') * 2 + G.marks.filter(m => m === 'stay').length * 2,
    '燼燒流': (has('ember') ? 3 : 0) + count('bao') * 2,
    '墨鬥流': has('ink') ? 4 : 0,
  };
  const best = Object.entries(score).sort((a, b) => b[1] - a[1])[0];
  return best[1] >= 2 ? best[0] : '萬象流';
}

function endRun(win) {
  $('#main').classList.remove('s-fight-pad');
  if (F) F.busy = true;
  renderTop();
  const s = G.stats;
  $('#main').innerHTML = `<div class="screen">
    <h2>${win ? '擊敗腐骨之王' : '旅程中斷'}</h2>
    <p class="dim">${win ? '你寫出的符，燒穿了荒骨原。' : `倒在${STAGES[G.stage].name}。`}</p>
    <p class="dim">你的流派</p><div class="build">${buildName()}</div>
    <dl class="summary">
      <div><dt>最高單線傷害</dt><dd>${s.maxHit}</dd></div>
      <div><dt>一筆最多幾線</dt><dd>${s.maxCombo}</dd></div>
      <div><dt>燒掉的字</dt><dd>${s.burned}</dd></div>
      <div><dt>總回合數</dt><dd>${s.turns}</dd></div>
    </dl>
    <p class="dim">法器：${G.relics.map(id => ITEMS[id].name).join('、') || '無'}　朱印：${G.charms.map(id => CHARMS[id].name).join('、') || '無'}　格印：${G.marks.map((m, i) => m ? `${MARKS[m].name}（第 ${i + 1} 格）` : '').filter(Boolean).join('、') || '無'}</p>
    <div class="deck">${G.deck.map(c => cardHTML(c)).join('')}</div>
    <button class="btn primary big" id="again" type="button">再玩一次</button></div>`;
  $('#again').onclick = startScreen;
}

function startScreen() {
  $('#main').classList.remove('s-fight-pad');
  newRun();
  $('#top').innerHTML = '';
  const offers = sample(STARTER_CHARMS, 3);
  $('#main').innerHTML = `<div class="screen">
    <h2>九宮符・試作</h2>
    <ol class="rules">
      <li>每回合從手牌挑 <b>3 張</b>，寫進九宮格。</li>
      <li>填滿一條線（橫、直、斜）就<b>發動</b>，然後燒掉：<b>劍</b>是傷害，<b>盾</b>是護盾。</li>
      <li>一條線三張同類 <b>×3</b>；一筆同時完成好幾條線，每條再<b>乘上線數</b>。</li>
    </ol>
    <p class="dim">符上的字會留到下回合。五場戰鬥，最後是腐骨之王。</p>
    <h3>先選一個起始朱印</h3>
    <div class="choices">${offers.map(id => `<div class="opt" data-id="${id}"><div class="og">印</div><b>${CHARMS[id].name}</b><small>${CHARMS[id].text}</small></div>`).join('')}</div>
  </div>`;
  $('#main .choices').onclick = e => { const el = e.target.closest('.opt'); if (!el) return; G.charms.push(el.dataset.id); startStage(0); };
}

/* ---------- 彈窗與特效 ---------- */
function modal(html) {
  const m = $('#modal');
  m.innerHTML = `<div class="mbox">${html}<button class="btn" type="button" id="mclose">關閉</button></div>`;
  m.hidden = false;
  const close = () => { m.hidden = true; m.innerHTML = ''; };
  $('#mclose').onclick = close;
  m.onclick = e => { if (e.target === m) close(); };
}
function showDeck() {
  modal(`<h3>牌組（${G.deck.length}）</h3><div class="deck">${G.deck.map(c => cardHTML(c)).join('')}</div>`);
}
function showHelp() {
  const seen = new Set(G.deck.map(c => c.id));
  modal(`<h3>規則</h3>
    <ol class="rules" style="max-width:none">
      <li>每回合從手牌挑 3 張，寫進九宮格。</li>
      <li>填滿一條線（橫、直、斜）就發動，然後燒掉：劍是傷害，盾是護盾。</li>
      <li>一條線三張同類 ×3；一筆同時完成好幾條線，每條再乘上線數。</li>
    </ol>
    <p class="dim">中宮被四條線經過，角落三條，邊上兩條。敵人會潑墨（佔掉一格、打斷同類）或撕掉符上的字。</p>
    <h3>你的朱印</h3><div class="gloss">${G.charms.map(id => `<div><b>${CHARMS[id].name}</b><span>${CHARMS[id].text}</span></div>`).join('') || '<span class="dim">還沒有。</span>'}</div>
    <h3>牌組裡的字</h3><div class="gloss">${[...seen].filter(id => CARDS[id].text).map(id => `<div><b>${CARDS[id].glyph}</b><span>${CARDS[id].text}</span></div>`).join('') || '<span class="dim">目前只有基本的劍和盾。</span>'}</div>`);
}
function floatOn(el, text, cls) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  const d = document.createElement('div');
  d.className = 'float ' + cls;
  d.textContent = text;
  d.style.left = (r.left + r.width / 2) + 'px';
  d.style.top = (r.top + r.height * 0.3) + 'px';
  $('#fx').append(d);
  setTimeout(() => d.remove(), 1200);
}
function banner(text) {
  const d = document.createElement('div');
  d.className = 'banner';
  d.textContent = text;
  $('#fx').append(d);
  setTimeout(() => d.remove(), 1250);
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { if (!$('#modal').hidden) $('#modal').hidden = true; else if (F && F.zoom) setZoom(false); return; }
  if (!F || F.busy || !$('#endBtn')) return;
  if (e.key === ' ' || e.key.toLowerCase() === 'e') { e.preventDefault(); endTurn(); }
  if (/^[1-6]$/.test(e.key)) { const c = F.hand[+e.key - 1]; if (c) { F.sel = F.sel === c.uid ? null : c.uid; renderFight(); } }
});

/* ---------- 氛圍：前景餘燼與滑鼠視差 ---------- */
(function ambience() {
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.addEventListener('pointermove', e => {
    const root = document.documentElement;
    root.style.setProperty('--mx', ((e.clientX / innerWidth) * 2 - 1).toFixed(3));
    root.style.setProperty('--my', ((e.clientY / innerHeight) * 2 - 1).toFixed(3));
  });
  if (reduce) return;
  const cv = document.createElement('canvas');
  cv.id = 'embers';
  cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0;
  const fit = () => { W = cv.width = innerWidth; H = cv.height = innerHeight; };
  fit(); addEventListener('resize', fit);
  const spawn = () => ({ x: Math.random() * W, y: H + 10, r: Math.random() * 1.8 + .6, vy: -(Math.random() * .5 + .25), vx: (Math.random() - .5) * .3, life: 0, max: 400 + Math.random() * 400, hue: 20 + Math.random() * 25 });
  const ps = Array.from({ length: 28 }, () => { const p = spawn(); p.y = Math.random() * H; p.life = Math.random() * p.max; return p; });
  (function tick() {
    ctx.clearRect(0, 0, W, H);
    for (const p of ps) {
      p.x += p.vx + Math.sin((p.life + p.x) / 60) * .15; p.y += p.vy; p.life++;
      const a = Math.sin(Math.PI * Math.min(1, p.life / p.max)) * .55;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 95%, 62%, ${a})`;
      ctx.shadowColor = `hsla(${p.hue}, 100%, 55%, ${a})`; ctx.shadowBlur = 8;
      ctx.fill();
      if (p.life > p.max || p.y < -10) Object.assign(p, spawn());
    }
    requestAnimationFrame(tick);
  })();
})();

startScreen();
