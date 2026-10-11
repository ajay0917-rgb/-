'use strict';
/* =========================================================
   跑圖：存檔、地圖、節點、獎勵、商店、流程輔助
   ========================================================= */
const ROWS = 10;      // 每幕 10 層 + 首領
const COLS = 7;

/* ---------- 跑圖層級工具 ---------- */
function runStat(run, key) {
  let v = run.bonus[key] || 0;
  const ch = run.charms;
  for (let i = 0; i < ch.length; i++) {
    let def = CHARMS[ch[i].id];
    if (ch[i].id === 'blueprint') {
      const nb = ch[i + 1];
      if (!nb || nb.id === 'blueprint' || key === 'charmSlots' || key === 'consSlots') continue;
      def = CHARMS[nb.id];
    }
    if (def.stat && def.stat[key]) v += def.stat[key];
  }
  for (const p of run.perks) { const d = PERKS[p]; if (d.stat && d.stat[key]) v += d.stat[key]; }
  return v;
}
const charmSlots = run => 5 + runStat(run, 'charmSlots');
const consSlots = run => 3 + runStat(run, 'consSlots');
function runHeal(run, n) { run.hp = Math.min(run.maxHp, run.hp + n); }
function runLoseHp(run, n) { run.hp = Math.max(1, run.hp - n); }
function gainGold(run, n) { run.gold += n; run.stats.gold += n; }
function addToDeck(run, c) { run.deck.push(c); }
function upgradeRandom(run, n) {
  const pool = RNG.shuffle(run.deck.filter(canUpgrade));
  const out = pool.slice(0, n);
  for (const c of out) c.up = true;
  return out;
}
function addConsumable(run, id) {
  if (run.cons.length >= consSlots(run)) return false;
  run.cons.push(id); return true;
}
function rollConsumable() { return RNG.pick(Object.keys(CONSUMABLES)); }
function addRandomSigil(c) {
  const d = cardDef(c);
  const opts = Object.entries(SIGILS).filter(([k, s]) => !hasSig(c, k) && (!s.atkOnly || d.t === 'atk') && !(k === 'light' && (d.cost === 0 || d.cost === 'X')) && !(k === 'retain' && d.retain));
  if (!opts.length || (c.sig || []).length >= MAX_SIGILS) return null;
  const k = RNG.weighted(opts.map(([k, s]) => [k, s.w]));
  c.sig = (c.sig || []).concat(k);
  return k;
}
function sigilOk(c, k) {
  const d = cardDef(c), s = SIGILS[k];
  if (d.t === 'status' || d.t === 'curse') return false;
  if ((c.sig || []).length >= MAX_SIGILS || hasSig(c, k)) return false;
  if (s.atkOnly && d.t !== 'atk') return false;
  if (k === 'light' && (d.cost === 0 || d.cost === 'X')) return false;
  return true;
}

function rollRarity(run, kind) {
  if (kind === 'boss') return 'R';
  const rare = (kind === 'elite' ? 0.10 : 0.04) + run.pity * 0.01;
  const unc = kind === 'elite' ? 0.40 : 0.34;
  const r = RNG.next();
  if (r < rare) { run.pity = 0; return 'R'; }
  if (r < rare + unc) return 'U';
  run.pity = Math.min(run.pity + 1, 15);
  return 'C';
}
function rollFaction(run) { return RNG.weighted([[run.primary, 50], [run.secondary, 40], ['neutral', 10]]); }
function rollCards(run, n, o = {}) {
  const out = [], ids = new Set();
  let guard = 0;
  while (out.length < n && guard++ < 200) {
    const r = o.rarity || rollRarity(run, o.kind);
    const f = o.faction || rollFaction(run);
    let pool = cardPool(f, r);
    if (!pool.length) pool = cardPool(run.primary, r);
    const d = RNG.pick(pool);
    if (!d || ids.has(d.id)) continue;
    ids.add(d.id);
    const c = newCard(d.id);
    const upChance = run.act === 2 ? 0.12 : run.act === 3 ? 0.25 : 0;
    if (RNG.chance(upChance)) c.up = true;
    if (RNG.chance(o.kind === 'elite' ? 0.15 : 0.07)) addRandomSigil(c);
    out.push(c);
  }
  return out;
}
function charmPool(run, r) {
  const owned = new Set(run.charms.map(c => c.id));
  return Object.entries(CHARMS).filter(([id, c]) => !owned.has(id) && (r ? c.r === r : ['C', 'U', 'R'].includes(c.r))).map(([id]) => id);
}
function rollCharm(run, r) {
  const rar = r || RNG.weighted([['C', 50], ['U', 35], ['R', 15]]);
  let pool = charmPool(run, rar);
  if (!pool.length) pool = charmPool(run);
  return pool.length ? RNG.pick(pool) : null;
}
function rollCharms(run, n, r) {
  let pool = charmPool(run, r);
  if (pool.length < n) pool = charmPool(run);
  return RNG.sample(pool, n);
}
function charmPrice(id) { return CHARM_PRICE[CHARMS[id].r] || 150; }
function sellValue(id) { return Math.floor(charmPrice(id) / 2); }
function giveCharm(run, id) {
  const inst = { id };
  run.charms.push(inst);
  const d = CHARMS[id];
  if (d.onPickup) d.onPickup(run, inst);
  return inst;
}

/* ---------- 地圖 ---------- */
function genMap(act) {
  const nodes = {};
  const node = (r, c) => {
    const id = `${r}-${c}`;
    if (!nodes[id]) nodes[id] = { id, r, c, type: null, next: [], jx: RNG.next() * 0.5 - 0.25, jy: RNG.next() * 0.4 - 0.2 };
    return nodes[id];
  };
  const starts = [];
  for (let p = 0; p < 6; p++) {
    let c = RNG.int(0, COLS - 1);
    if (p === 1) { let g = 0; while (c === starts[0] && g++ < 20) c = RNG.int(0, COLS - 1); }
    starts.push(c);
    node(0, c);
    for (let r = 0; r < ROWS - 1; r++) {
      let nc = RNG.pick([c - 1, c, c + 1].filter(x => x >= 0 && x < COLS));
      const right = nodes[`${r}-${c + 1}`], left = nodes[`${r}-${c - 1}`];
      if (nc === c + 1 && right && right.next.includes(`${r + 1}-${c}`)) nc = c;
      if (nc === c - 1 && left && left.next.includes(`${r + 1}-${c}`)) nc = c;
      const a = node(r, c), b = node(r + 1, nc);
      if (!a.next.includes(b.id)) a.next.push(b.id);
      c = nc;
    }
  }
  const prev = {};
  for (const n of Object.values(nodes)) for (const id of n.next) (prev[id] = prev[id] || []).push(n.id);
  const special = ['elite', 'rest', 'shop', 'altar'];
  const order = Object.values(nodes).sort((a, b) => a.r - b.r);
  const TREASURE_ROW = 5;
  for (const n of order) {
    if (n.r === 0) { n.type = 'combat'; continue; }
    if (n.r === TREASURE_ROW) { n.type = 'treasure'; continue; }
    if (n.r === ROWS - 1) { n.type = 'rest'; continue; }
    const parents = (prev[n.id] || []).map(id => nodes[id].type);
    let t = 'combat';
    for (let tries = 0; tries < 12; tries++) {
      const w = [['combat', 46], ['event', 22]];
      if (n.r >= 3) w.push(['elite', act === 1 ? 11 : 13]);
      if (n.r >= 3 && n.r !== ROWS - 2) w.push(['rest', 10]);
      if (n.r >= 2) w.push(['shop', 7], ['altar', 5]);
      t = RNG.weighted(w);
      if (!(special.includes(t) && parents.includes(t))) break;
      t = 'combat';
    }
    n.type = t;
  }
  const mid = order.filter(n => n.r >= 2 && n.r <= ROWS - 3 && n.r !== TREASURE_ROW);
  for (const need of ['shop', 'elite', 'altar']) {
    if (!order.some(n => n.type === need)) {
      const cands = mid.filter(n => n.type === 'combat' || n.type === 'event');
      if (cands.length) RNG.pick(cands).type = need;
    }
  }
  return { nodes, boss: { id: 'boss', r: ROWS, c: 3, type: 'boss', next: [] } };
}
function availableNodes(run) {
  const m = run.map;
  if (!run.node) return Object.values(m.nodes).filter(n => n.r === 0).map(n => n.id);
  if (run.node === 'boss') return [];
  const cur = m.nodes[run.node];
  if (cur.r === ROWS - 1) return ['boss'];
  return cur.next.slice();
}

/* ---------- 遊戲狀態與畫面切換 ---------- */
const Game = {
  run: null,
  combat: null,
  meta: Object.assign({ runs: 0, wins: 0, heat: 0, best: 0, history: [] }, Store.get('ew_meta', {})),

  saveMeta() { Store.set('ew_meta', this.meta); },
  save() { if (this.run) { this.run.rng = RNG.s; Store.set('ew_run', this.run); } },
  hasSave() { const r = Store.get('ew_run', null); return !!(r && r.v === VERSION && !r.ended); },
  load() {
    const r = Store.get('ew_run', null);
    if (!r || r.v !== VERSION) return false;
    this.run = r; RNG = new Rng(r.rng || r.seed);
    return true;
  },
  clear() { Store.del('ew_run'); },

  goto(screen, pending) {
    this.run.screen = screen;
    this.run.pending = pending == null ? null : pending;
    this.save();
    UI.render();
  },

  newRun(primary, secondary, heat) {
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    RNG = new Rng(seed);
    const pf = FACTIONS[primary];
    const run = {
      v: VERSION, seed, primary, secondary, heat,
      hp: pf.hp, maxHp: pf.hp, gold: 99, candles: heat >= 3 ? 0 : 1,
      deck: [], charms: [], cons: [], bonus: {}, perks: [], perkState: {}, perkPath: null,
      act: 1, floor: 0, map: null, node: null, visited: [], seenEnc: [], seenEvents: [], combatsThisAct: 0,
      removeCost: 60, pity: 0,
      stats: { kills: 0, dmg: 0, maxHit: 0, cards: 0, gold: 0, elites: 0, start: Date.now() },
      screen: 'ancient', pending: null,
    };
    if (heat >= 2) run.hp = Math.round(run.hp * 0.9);
    for (let i = 0; i < 4; i++) run.deck.push(newCard('strike'));
    for (let i = 0; i < 4; i++) run.deck.push(newCard('defend'));
    run.deck.push(newCard(pf.starter));
    run.deck.push(newCard(FACTIONS[secondary].starter));
    giveCharm(run, pf.charm);
    run.map = genMap(1);
    this.run = run;
    this.meta.runs++; this.saveMeta();
    this.goto('ancient', { act: 1, options: RNG.sample(ANCIENTS[1].pool, 3) });
  },

  async enterNode(id) {
    const run = this.run;
    if (!availableNodes(run).includes(id)) return;
    const n = id === 'boss' ? run.map.boss : run.map.nodes[id];
    run.node = id; run.floor++; run.visited.push(id);
    switch (n.type) {
      case 'combat': return this.startCombat(this.rollEncounter('normal'), 'normal');
      case 'elite': return this.startCombat(this.rollEncounter('elite'), 'elite');
      case 'boss': return this.startCombat(ENCOUNTERS[run.act].boss[0], 'boss');
      case 'event': return this.goto('event', { id: this.rollEvent(), result: null });
      case 'shop': {
        for (const c of run.charms) if (CHARMS[c.id].onShopEnter) CHARMS[c.id].onShopEnter(run, c);
        return this.goto('shop', makeShop(run));
      }
      case 'rest': return this.goto('rest', { done: false });
      case 'treasure': return this.goto('treasure', { charm: rollCharm(run), gold: RNG.int(25, 45), opened: false });
      case 'altar': return this.goto('altar', { done: false });
    }
  },

  rollEncounter(kind) {
    const run = this.run, T = ENCOUNTERS[run.act];
    let pool;
    if (kind === 'elite') pool = T.elite;
    else pool = run.combatsThisAct < 2 ? T.easy : T.normal;
    if (kind !== 'elite') run.combatsThisAct++;
    const key = e => `${run.act}:${e.e.join(',')}`;
    let fresh = pool.filter(e => !run.seenEnc.includes(key(e)));
    if (!fresh.length) fresh = pool;
    const enc = RNG.pick(fresh);
    run.seenEnc.push(key(enc));
    return enc;
  },
  rollEvent() {
    const run = this.run;
    let pool = Object.values(EVENTS).filter(e => e.acts.includes(run.act) && !run.seenEvents.includes(e.id));
    if (!pool.length) pool = Object.values(EVENTS).filter(e => e.acts.includes(run.act));
    const ev = RNG.pick(pool);
    run.seenEvents.push(ev.id);
    return ev.id;
  },

  startCombat(enc, kind) { this.goto('combat', { enc, kind }); },

  async runCombat() {
    const run = this.run, p = run.pending;
    const C = new Combat(run, p.enc, p.kind);
    this.combat = C;
    UI.mountCombat(C);
    await C.start();
    const res = await C.done;
    await sleep(650);
    this.combat = null;
    if (res === 'win') {
      if (p.kind === 'elite') run.stats.elites++;
      this.goto('reward', makeRewards(run, p.kind, C));
    } else if (res === 'candle') {
      run.candles--;
      run.hp = Math.ceil(run.maxHp * 0.5);
      await UI.candleOut();
      this.goto('combat', p);
    } else {
      this.endRun(false);
    }
  },

  afterReward() {
    const run = this.run;
    const kind = run.pending && run.pending.kind;
    if (kind === 'boss') {
      if (run.act >= 3) return this.endRun(true);
      return this.goto('perk', makePerkChoice(run));
    }
    this.goto('map');
  },

  nextAct() {
    const run = this.run;
    run.act++;
    run.map = genMap(run.act);
    run.node = null; run.visited = []; run.combatsThisAct = 0;
    const missing = run.maxHp - run.hp;
    run.hp += Math.round(missing * (run.heat >= 2 ? 0.5 : 0.75));
    this.goto('ancient', { act: run.act, options: RNG.sample(ANCIENTS[run.act].pool, 3) });
  },

  endRun(win) {
    const run = this.run;
    run.ended = true;
    const m = this.meta;
    if (win) {
      m.wins++;
      if (run.heat >= m.heat && m.heat < HEAT.length - 1) m.heat = run.heat + 1;
    }
    const reached = (run.act - 1) * (ROWS + 1) + Math.min(run.floor, ROWS + 1);
    m.best = Math.max(m.best, win ? 99 : reached);
    m.history.unshift({ win, primary: run.primary, secondary: run.secondary, heat: run.heat, act: run.act, floor: run.floor, date: Date.now() });
    m.history = m.history.slice(0, 12);
    this.saveMeta();
    this.clear();
    run.screen = 'gameover';
    run.pending = { win };
    UI.render();
  },
};

/* ---------- 戰後獎勵 ---------- */
function makeRewards(run, kind, C) {
  const items = [];
  let g = kind === 'boss' ? RNG.int(70, 85) : kind === 'elite' ? RNG.int(28, 36) : RNG.int(13, 19);
  g += runStat(run, 'bonusGold');
  items.push({ type: 'gold', n: g, label: kind === 'boss' ? '首領寶藏' : kind === 'elite' ? '菁英戰利品' : '戰利品' });
  if (C.gold) items.push({ type: 'note', n: C.gold, label: '戰鬥中獲得' });
  const cap = 5 + runStat(run, 'interestCap');
  const interest = Math.min(cap, Math.floor(run.gold / 10));
  if (interest > 0) items.push({ type: 'gold', n: interest, label: `利息（每 10 金 +1，上限 ${cap}）` });
  if (C.redraws > 0) items.push({ type: 'gold', n: C.redraws, label: '未使用的重整' });
  const n = Math.max(1, 3 + runStat(run, 'rewardChoices'));
  items.push({ type: 'card', choices: rollCards(run, n, { kind }), free: runStat(run, 'freeCardReroll'), rerollCost: 10 });
  if (kind === 'elite') { const id = rollCharm(run); if (id) items.push({ type: 'charm', id }); }
  if (kind === 'boss') {
    let pool = charmPool(run, 'B');
    items.push({ type: 'bossCharm', choices: RNG.sample(pool, Math.min(3, pool.length)) });
  }
  const consChance = kind === 'elite' ? 0.6 : kind === 'boss' ? 0 : 0.35;
  if (RNG.chance(consChance)) items.push({ type: 'cons', id: rollConsumable() });
  return { kind, items };
}

function makePerkChoice(run) {
  if (!run.perkPath) return { tier: 0, paths: PERK_PATHS[run.primary].map(p => p.id) };
  return { tier: 1, paths: [run.perkPath] };
}
function choosePerk(run, pathId) {
  const path = PERK_PATHS[run.primary].find(p => p.id === pathId);
  run.perkPath = pathId;
  const tierId = path.tiers[run.perks.filter(p => path.tiers.includes(p)).length];
  if (tierId) run.perks.push(tierId);
}

/* ---------- 商店 ---------- */
function makeShop(run) {
  const disc = 1 - runStat(run, 'shopDiscount');
  const price = (base, spread) => Math.round((base + RNG.int(-spread, spread)) * disc);
  const cardPrice = r => r === 'R' ? price(140, 10) : r === 'U' ? price(72, 6) : price(46, 5);
  const cards = [];
  const facs = [run.primary, run.primary, run.secondary, run.secondary, 'neutral'];
  const used = new Set();
  for (const f of facs) {
    let c = null, g = 0;
    while (g++ < 30) { const cand = rollCards(run, 1, { faction: f })[0]; if (cand && !used.has(cand.id)) { c = cand; break; } }
    if (!c) continue;
    used.add(c.id);
    cards.push({ card: c, price: cardPrice(cardDef(c).r) + (c.sig.length ? Math.round(25 * disc) : 0), sold: false });
  }
  if (cards.length) { const s = RNG.pick(cards); s.price = Math.round(s.price / 2); s.sale = true; }
  const charms = rollCharms(run, 3).map(id => ({ id, price: price(charmPrice(id), 8), sold: false }));
  const cons = [rollConsumable(), rollConsumable()].map(id => ({ id, price: Math.round(CONSUMABLES[id].price * disc), sold: false }));
  return { cards, charms, cons, removeCost: Math.round(run.removeCost * disc), removed: false,
    inscribeCost: Math.round(70 * disc), inscribed: false, rerolls: 0 };
}
function shopRerollCost(run, shop) { return Math.max(0, 5 + shop.rerolls * 3 - runStat(run, 'rerollDiscount')); }
function rerollShop(run, shop) {
  const fresh = makeShop(run);
  shop.cards = fresh.cards; shop.charms = fresh.charms;
  shop.rerolls++;
}

/* =========================================================
   流程輔助（需要玩家選擇的操作）
   ========================================================= */
const Flow = {
  async chooseCard(cards, title, canSkip) {
    const r = await UI.pickCards(cards, { title, min: canSkip ? 0 : 1, max: 1, confirm: '選擇', skipText: canSkip ? '略過' : null });
    return r && r[0] ? r[0] : null;
  },
  async removeCard(run, title, filter) {
    const pool = run.deck.filter(c => !filter || filter(c));
    if (!pool.length) { UI.toast('沒有可移除的牌'); return false; }
    const r = await UI.pickCards(pool, { title: title || '移除一張牌', min: 1, max: 1, confirm: '移除', cancel: true, danger: true });
    if (!r || !r.length) return false;
    run.deck.splice(run.deck.indexOf(r[0]), 1);
    return true;
  },
  async removeCards(run, n, title) {
    const k = Math.min(n, run.deck.length);
    const r = await UI.pickCards(run.deck, { title, min: k, max: k, confirm: '移除', danger: true });
    if (!r) return false;
    for (const c of r) run.deck.splice(run.deck.indexOf(c), 1);
    return true;
  },
  async upgradeCard(run) {
    const pool = run.deck.filter(canUpgrade);
    if (!pool.length) { UI.toast('沒有可升級的牌'); return false; }
    const r = await UI.pickCards(pool, { title: '選擇一張牌升級', min: 1, max: 1, confirm: '升級', cancel: true, showUpgrade: true });
    if (!r || !r.length) return false;
    r[0].up = true;
    return true;
  },
  async transformCard(run) {
    const r = await UI.pickCards(run.deck, { title: '選擇一張牌轉化', min: 1, max: 1, confirm: '轉化', cancel: true });
    if (!r || !r.length) return false;
    const c = r[0], d = cardDef(c);
    let f = d.f;
    if (f === 'neutral' || !MAIN_FACTIONS.includes(f)) f = RNG.pick([run.primary, run.secondary]);
    const pool2 = Object.values(CARDS).filter(x => x.f === f && ['C', 'U', 'R'].includes(x.r) && x.id !== c.id);
    const nd = RNG.pick(pool2);
    const old = d.name;
    c.id = nd.id; c.up = false;
    c.sig = (c.sig || []).filter(k => sigilOk({ id: nd.id, sig: [] }, k));
    return `「${old}」化為了「${nd.name}」。`;
  },
  async duplicateCard(run) {
    const r = await UI.pickCards(run.deck, { title: '選擇一張牌複製', min: 1, max: 1, confirm: '複製', cancel: true });
    if (!r || !r.length) return false;
    const c = r[0];
    run.deck.push({ uid: uid(), id: c.id, up: c.up, sig: (c.sig || []).slice() });
    return true;
  },
  async inscribeRandom(run) {
    const pool = run.deck.filter(c => Object.keys(SIGILS).some(k => sigilOk(c, k)));
    if (!pool.length) { UI.toast('沒有可刻印的牌'); return false; }
    const r = await UI.pickCards(pool, { title: '選擇一張牌，刻上隨機印記', min: 1, max: 1, confirm: '刻印', cancel: true });
    if (!r || !r.length) return false;
    const k = addRandomSigil(r[0]);
    if (k) UI.toast(`刻上了「${SIGILS[k].name}」：${SIGILS[k].desc}`);
    return !!k;
  },
  async inscribeChoose(run, n) {
    const keys = RNG.sample(Object.keys(SIGILS), n);
    const k = await UI.chooseSigil(keys, '選擇一個印記');
    if (!k) return false;
    const pool = run.deck.filter(c => sigilOk(c, k));
    if (!pool.length) { UI.toast('沒有能刻上此印記的牌'); return false; }
    const r = await UI.pickCards(pool, { title: `把「${SIGILS[k].name}」刻在哪張牌上？`, min: 1, max: 1, confirm: '刻印', cancel: true });
    if (!r || !r.length) return false;
    r[0].sig = (r[0].sig || []).concat(k);
    return true;
  },
  async inscribeSpecific(run, k) {
    const pool = run.deck.filter(c => sigilOk(c, k));
    if (!pool.length) { UI.toast('沒有能刻上此印記的牌'); return false; }
    const r = await UI.pickCards(pool, { title: `把「${SIGILS[k].name}」刻在哪張牌上？`, min: 1, max: 1, confirm: '刻印' });
    if (!r || !r.length) return false;
    r[0].sig = (r[0].sig || []).concat(k);
    return true;
  },
  async transferSigil(run) {
    const donors = run.deck.filter(c => (c.sig || []).length);
    if (!donors.length) { UI.toast('牌組中沒有帶印記的牌'); return false; }
    const a = await UI.pickCards(donors, { title: '選擇要犧牲的牌（它會被移除，印記留下）', min: 1, max: 1, confirm: '犧牲', cancel: true, danger: true });
    if (!a || !a.length) return false;
    const donor = a[0];
    const recv = run.deck.filter(c => c !== donor && donor.sig.some(k => sigilOk(c, k)));
    if (!recv.length) { UI.toast('沒有能承接這些印記的牌'); return false; }
    const b = await UI.pickCards(recv, { title: `把「${donor.sig.map(k => SIGILS[k].name).join('、')}」轉印到哪張牌上？`, min: 1, max: 1, confirm: '轉印', cancel: true });
    if (!b || !b.length) return false;
    const target = b[0];
    for (const k of donor.sig) if (sigilOk(target, k)) target.sig.push(k);
    run.deck.splice(run.deck.indexOf(donor), 1);
    return true;
  },
  async gainCharm(run, id) {
    if (run.charms.length < charmSlots(run)) { giveCharm(run, id); UI.renderHud(); return true; }
    const pick = await UI.replaceCharm(run, id);
    if (pick == null) return false;
    const old = run.charms[pick];
    gainGold(run, sellValue(old.id));
    run.charms.splice(pick, 1);
    giveCharm(run, id);
    UI.renderHud();
    return true;
  },
  async chooseCharm(run, ids, title) {
    if (!ids.length) return false;
    const id = await UI.chooseCharm(ids, title);
    if (!id) return false;
    return this.gainCharm(run, id);
  },
  async gainConsumable(run, id, quiet) {
    if (addConsumable(run, id)) { UI.renderHud(); return true; }
    if (!quiet) UI.toast('消耗品欄位已滿');
    return false;
  },
};
