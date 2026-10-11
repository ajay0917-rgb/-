'use strict';
/* =========================================================
   戰鬥引擎
   三條道：敵人列 / 友軍列 / 英雄列。英雄站在其中一道。
   ========================================================= */
function defaultLanes(n) { return n === 1 ? [1] : n === 2 ? [0, 2] : [0, 1, 2]; }

class Combat {
  constructor(run, enc, kind) {
    this.run = run; this.enc = enc; this.kind = kind;
    this.turn = 0; this.over = false; this.result = null; this.phase = 'start'; this.busy = false;
    this.hero = { hp: run.hp, maxHp: run.maxHp, block: 0, st: {}, lane: 1, powers: {} };
    this.energy = 0; this.steps = 0; this.bones = 0;
    this.played = 0; this.attacksThisTurn = 0; this.skillsThisTurn = 0; this.movesThisTurn = 0; this.twinUsed = 0;
    this.res = {}; this.resFired = {};
    this.redraws = 2 + runStat(run, 'redraws');
    this.enemies = [null, null, null]; this.reserve = [];
    this.allies = [null, null, null];
    this.drawPile = []; this.hand = []; this.discardPile = []; this.exhaustPile = [];
    this.echoUsed = new Set();
    this.heroFresh = new Set();
    this.cur = null;
    this.gold = 0;
    this.drawPile = run.deck.map(c => ({ uid: uid(), id: c.id, up: c.up, sig: (c.sig || []).slice() }));
    RNG.shuffle(this.drawPile);
    const innate = this.drawPile.filter(c => cardDef(c).innate || hasSig(c, 'innate'));
    this.drawPile = this.drawPile.filter(c => !innate.includes(c)).concat(innate);
    const lanes = enc.lanes || defaultLanes(enc.e.length);
    enc.e.forEach((id, i) => { this.enemies[lanes[i]] = this.makeEnemy(id, lanes[i]); });
    this.reserve = (enc.reserve || []).slice();
    this.done = new Promise(r => { this._resolve = r; });
  }

  /* ---------- 建立 ---------- */
  makeEnemy(id, lane) {
    const d = ENEMIES[id];
    let hp = Math.round(RNG.int(d.hp[0], d.hp[1]) * ENEMY_SCALE.hp[this.run.act] * (d.elite ? ENEMY_SCALE.elite : 1));
    const heat = this.run.heat;
    if (d.elite && heat >= 1) hp = Math.round(hp * 1.2);
    if (d.boss && heat >= 5) hp = Math.round(hp * 1.25);
    return { uid: uid(), id, name: d.name, glyph: d.glyph, hp, maxHp: hp, block: 0, st: {}, lane,
      turn: 0, seed: RNG.int(0, 1), intent: null, boss: !!d.boss, elite: !!d.elite, minion: !!d.minion, fresh: false, phase: 0, k: 0 };
  }

  async start() {
    this.trigger('onCombatStart');
    await this.startTurn();
  }

  /* ---------- 查詢 ---------- */
  alive() { return this.enemies.filter(e => e && e.hp > 0); }
  front() { const e = this.enemies[this.hero.lane]; return e && e.hp > 0 ? e : null; }
  randEnemy() { const a = this.alive(); return a.length ? RNG.pick(a) : null; }
  allyList() { return this.allies.filter(Boolean); }
  emptyAllyLane() {
    if (!this.allies[this.hero.lane]) return this.hero.lane;
    const free = [0, 1, 2].filter(l => !this.allies[l]);
    return free.length ? free[0] : null;
  }
  emptyEnemyLane(pref) {
    const free = [0, 1, 2].filter(l => !this.enemies[l]);
    if (!free.length) return null;
    if (pref != null) free.sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref));
    return free[0];
  }
  maxEnergy() { return 3 + runStat(this.run, 'energy'); }
  drawCount() { return Math.max(1, 5 + runStat(this.run, 'drawN')); }

  /* ---------- 觸發來源：英雄晉升 → 護符（依序，含鏡像符）→ 能力 ---------- */
  sources() {
    const out = [];
    for (const p of this.run.perks) out.push({ def: PERKS[p], self: this.run.perkState[p] || (this.run.perkState[p] = {}) });
    const ch = this.run.charms;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (c.id === 'blueprint') {
        const nb = ch[i + 1];
        if (nb && nb.id !== 'blueprint') out.push({ def: CHARMS[nb.id], self: nb, copy: true, owner: c });
      } else out.push({ def: CHARMS[c.id], self: c, owner: c });
    }
    for (const id in this.hero.powers) out.push({ def: POWERS[id], self: { id, n: this.hero.powers[id] } });
    return out;
  }
  trigger(name, ...args) {
    for (const s of this.sources()) {
      const fn = s.def && s.def[name];
      if (!fn) continue;
      if (s.copy && s.def.noCopy && s.def.noCopy.includes(name)) continue;
      const fx = UI.fxCount;
      fn.call(s.def, this, s.self, ...args);
      if (s.owner && UI.fxCount !== fx) UI.pulseCharm(s.owner);
      if (this.over && name !== 'onCombatEnd') return;
    }
  }
  reduce(name, val, ...args) {
    for (const s of this.sources()) {
      const fn = s.def && s.def[name];
      if (!fn) continue;
      val = fn.call(s.def, this, s.self, ...args, val);
    }
    return val;
  }

  /* ---------- 回合流程 ---------- */
  async startTurn() {
    this.turn++;
    const h = this.hero;
    if (!h.powers.barricade) h.block = Math.min(h.block, runStat(this.run, 'retainBlock'));
    delete h.st.flameBarrier;
    this.energy = this.maxEnergy() + (h.st.energyNext || 0); delete h.st.energyNext;
    this.steps = 1 + runStat(this.run, 'freeSteps');
    this.played = 0; this.attacksThisTurn = 0; this.skillsThisTurn = 0; this.movesThisTurn = 0; this.twinUsed = 0;
    this.res = {}; this.resFired = {};
    for (const e of this.alive()) { e.fresh = false; this.declare(e); }
    const n = this.drawCount() + (h.st.drawNext || 0); delete h.st.drawNext;
    this.draw(n);
    this.trigger('onTurnStart');
    this.phase = 'player';
    UI.renderCombat();
  }

  declare(e) {
    const d = ENEMIES[e.id];
    const key = d.ai ? d.ai(e, this) : d.pattern[e.turn % d.pattern.length];
    const mv = d.moves[key];
    const acts = mv.acts.map(a => {
      const b = Object.assign({}, a);
      if (b.a === 'atk' && b.t === 'aim') b.lanes = [this.hero.lane];
      return b;
    });
    e.intent = { key, name: mv.name, acts };
    e.turn++;
  }

  actLanes(e, a) {
    switch (a.t) {
      case 'aim': return a.lanes;
      case 'front': return [e.lane];
      case 'all': return [0, 1, 2];
      case 'home': return [this.hero.lane];
    }
    return [];
  }

  enemyAtkBase(e, a) {
    let d = Math.round(a.d * ENEMY_SCALE.dmg[this.run.act] * (this.run.heat >= 4 ? 1.15 : 1));
    return d + (e.st.str || 0);
  }
  enemyDmg(e, a, vsHero) {
    let m = 1;
    if (e.st.weak) m *= 0.75;
    if (vsHero && this.hero.st.vuln) m *= 1.5;
    return Math.max(0, Math.floor(this.enemyAtkBase(e, a) * m));
  }

  /* 每道即將承受的傷害，用於介面上的危險提示 */
  laneThreat() {
    const out = [0, 1, 2].map(() => ({ hero: 0, ally: 0, hits: 0, sources: [] }));
    for (const e of this.alive()) {
      if (!e.intent || e.st.freeze) continue;
      for (const a of e.intent.acts) {
        if (a.a !== 'atk') continue;
        for (const L of this.actLanes(e, a)) {
          const ally = this.allies[L];
          const dmg = this.enemyDmg(e, a, !ally) * (a.n || 1);
          if (ally) out[L].ally += dmg; else out[L].hero += dmg;
          out[L].hits += a.n || 1;
          out[L].sources.push(e.name);
        }
      }
    }
    return out;
  }

  async endTurn() {
    if (this.phase !== 'player' || this.busy || this.over) return;
    this.busy = true; this.phase = 'end';
    UI.clearSelection();
    const h = this.hero;
    for (const c of this.hand.slice()) {
      const id = c.id;
      if (id === 'cinder') this.dmgHero(3, null);
      else if (id === 'regret') this.loseHp(1);
      else if (id === 'doubt') this.heroDebuff('weak', 1);
      if (this.over) return this.halt();
    }
    const keep = [];
    for (const c of this.hand) {
      const d = cardDef(c);
      if (d.ethereal) this.exhaustPile.push(c);
      else if (d.retain || hasSig(c, 'retain')) keep.push(c);
      else this.discardPile.push(c);
    }
    this.hand = keep;
    this.trigger('onTurnEnd');
    if (this.over) return this.halt();
    if (h.st.strDown) { this.addSt(h, 'str', -h.st.strDown); delete h.st.strDown; }
    if (h.st.burn) {
      const n = h.st.burn;
      UI.float(h, `灼燒 -${n}`, 'burn');
      this.loseHp(n);
      this.decSt(h, 'burn');
      if (this.over) return this.halt();
    }
    UI.renderCombat();
    await sleep(220);

    // 友軍依序攻擊同道敵人
    for (let L = 0; L < 3 && !this.over; L++) {
      const a = this.allies[L];
      if (!a) continue;
      if (this.allyStrike(a)) { UI.lunge(a.uid, -1); UI.renderCombat(); await sleep(300); }
    }
    if (this.over) return this.halt();

    await this.enemyPhase();
    if (this.over) return this.halt();

    // 回合收尾
    for (const e of this.alive()) {
      if (e.st.shock) { e.st.shock = Math.floor(e.st.shock / 2); if (!e.st.shock) delete e.st.shock; }
    }
    for (const s of ['weak', 'vuln', 'frail']) if (h.st[s] && !this.heroFresh.has(s)) this.decSt(h, s);
    this.heroFresh.clear();
    this.spawnReserve(false);
    this.busy = false;
    await this.startTurn();
  }
  halt() { this.busy = false; UI.renderCombat(); }

  async enemyPhase() {
    this.phase = 'enemy';
    const order = this.alive().slice();
    for (const e of order) {
      if (this.over) return;
      if (e.hp <= 0 || e.fresh) continue;
      e.block = 0;
      if (e.st.burn > 0) {
        const n = e.st.burn;
        this.dmgEnemy(e, n, { src: 'burn', pierce: true });
        this.decSt(e, 'burn');
        UI.renderCombat(); await sleep(260);
        if (this.over) return;
        if (e.hp <= 0) continue;
      }
      if (e.st.freeze > 0) {
        this.decSt(e, 'freeze');
        UI.float(e, '冰凍', 'freeze');
        UI.renderCombat(); await sleep(380);
        continue;
      }
      UI.lunge(e.uid, 1);
      await this.execIntent(e);
      if (this.over) return;
      if (e.hp > 0) {
        for (const s of ['weak', 'vuln']) if (e.st[s]) this.decSt(e, s);
        if (e.st.ritual) this.addSt(e, 'str', e.st.ritual);
      }
      UI.renderCombat(); await sleep(160);
    }
  }

  async execIntent(e) {
    if (!e.intent) return;
    for (const a of e.intent.acts) {
      if (this.over || e.hp <= 0) return;
      switch (a.a) {
        case 'atk': {
          const lanes = this.actLanes(e, a).slice();
          const single = a.t !== 'all';
          for (let i = 0; i < (a.n || 1); i++) {
            const ls = a.t === 'home' ? [this.hero.lane] : lanes;
            for (const L of ls) this.enemyHitLane(e, L, a, single);
            UI.renderCombat(); await sleep(230);
            if (this.over || e.hp <= 0) return;
          }
          break;
        }
        case 'blk': e.block += a.v; UI.float(e, `+${a.v} 格擋`, 'block'); break;
        case 'blkAll': for (const x of this.alive()) { x.block += a.v; UI.float(x, `+${a.v} 格擋`, 'block'); } break;
        case 'buff': this.addSt(e, a.s, a.v); UI.float(e, `${STATUS[a.s].name} +${a.v}`, 'buff'); break;
        case 'buffAll': for (const x of this.alive()) { this.addSt(x, a.s, a.v); UI.float(x, `${STATUS[a.s].name} +${a.v}`, 'buff'); } break;
        case 'debuff': this.heroDebuff(a.s, a.v); break;
        case 'summon':
          for (let i = 0; i < (a.n || 1); i++) {
            const L = this.emptyEnemyLane(e.lane);
            if (L == null) break;
            const m = this.makeEnemy(a.id, L); m.fresh = true; this.enemies[L] = m;
          }
          break;
        case 'card': this.addCard(a.id, a.pile || 'discard', a.v || 1); UI.float(this.hero, `+${a.v} ${CARDS[a.id].name}`, 'debuff'); break;
        case 'pull':
          if (this.hero.lane !== e.lane) { this.hero.lane = e.lane; UI.float(this.hero, '被拉過去', 'debuff'); }
          break;
        case 'shift': this.enemyShift(e); break;
        case 'heal': e.hp = Math.min(e.maxHp, e.hp + a.v); break;
      }
      UI.renderCombat(); await sleep(170);
    }
  }

  enemyHitLane(e, L, a, single) {
    const ally = this.allies[L];
    if (ally) { this.dmgAlly(ally, this.enemyDmg(e, a, false), e); return; }
    if (this.hero.lane === L) { this.dmgHero(this.enemyDmg(e, a, true), e); return; }
    if (single) {
      UI.floatLane(L, '落空', 'miss');
      this.trigger('onMiss', e);
    }
  }

  enemyShift(e) {
    const target = this.hero.lane;
    let L = null;
    if (!this.enemies[target]) L = target;
    else { const free = [0, 1, 2].filter(l => !this.enemies[l]); if (free.length) L = RNG.pick(free); }
    if (L == null || L === e.lane) return;
    this.enemies[e.lane] = null; e.lane = L; this.enemies[L] = e;
    UI.float(e, '移位', 'buff');
  }

  spawnReserve(mid) {
    if (!this.reserve.length) return;
    const free = [0, 1, 2].filter(l => !this.enemies[l]);
    RNG.shuffle(free);
    for (const L of free) {
      if (!this.reserve.length) break;
      const e = this.makeEnemy(this.reserve.shift(), L);
      this.enemies[L] = e;
      if (mid) this.declare(e);
      UI.float(e, '增援', 'debuff');
    }
  }

  /* ---------- 傷害 ---------- */
  calcAtk(base, t, o = {}) {
    const h = this.hero;
    const x = { base, add: 0, mult: 1, parts: [], card: o.card || null, target: t, preview: !!o.preview,
      handLeft: this.hand.length - (o.inHand ? 1 : 0) };
    const str = (h.st.str || 0) * (o.strMult || 1);
    if (str) { x.add += str; x.parts.push(`力量 ${str > 0 ? '+' : ''}${str}`); }
    if (x.card && hasSig(x.card, 'sharp')) { x.add += 3; x.parts.push('鋒銳 +3'); }
    if (t && t.lane === h.lane) { x.mult += 0.5; x.parts.push('正對 +0.5'); }
    this.trigger('modAtk', x);
    if (h.st.weak) { x.mult *= 0.75; x.parts.push('虛弱 ×0.75'); }
    if (t && t.st.vuln) { x.mult *= 1.5; x.parts.push('易傷 ×1.5'); }
    let val = Math.floor(Math.max(0, base + x.add) * x.mult + 1e-9);
    if (t && t.st.shock) { val += t.st.shock; x.parts.push(`感電 +${t.st.shock}`); }
    x.val = val;
    return x;
  }

  hit(t, base, o = {}) {
    const hits = o.hits || 1;
    for (let i = 0; i < hits; i++) {
      if (!t || t.hp <= 0 || this.over) break;
      const x = this.calcAtk(base, t, Object.assign({}, o, { card: this.cur }));
      this.dmgEnemy(t, x.val, { src: 'hero', pierce: o.pierce, calc: x });
      if (this.over) break;
      this.trigger('onAttackHit', t);
    }
  }
  hitAll(base, o) { for (const e of this.alive()) this.hit(e, base, o); }
  spell(t, n) { if (t && t.hp > 0) this.dmgEnemy(t, n, { src: 'spell' }); }
  spellAll(n) { for (const e of this.alive()) this.spell(e, n); }

  dmgEnemy(e, amt, o = {}) {
    if (!e || e.hp <= 0) return 0;
    let dmg = Math.max(0, Math.floor(amt));
    let blocked = 0;
    if (!o.pierce) { blocked = Math.min(e.block, dmg); e.block -= blocked; dmg -= blocked; }
    e.hp -= dmg;
    const s = this.run.stats;
    if (o.src === 'hero' || o.src === 'ally' || o.src === 'spell') s.dmg += dmg;
    if (o.src === 'hero' && amt > s.maxHit) s.maxHit = amt;
    UI.hitFx(e, amt, dmg, blocked, o);
    if (e.hp <= 0) this.killEnemy(e);
    return dmg;
  }

  killEnemy(e) {
    e.hp = 0;
    if (this.enemies[e.lane] === e) this.enemies[e.lane] = null;
    this.run.stats.kills++;
    if (ENEMIES[e.id].bond) for (const x of this.alive()) if (ENEMIES[x.id].bond) { this.addSt(x, 'str', 4); UI.float(x, '悲憤 力量+4', 'buff'); }
    if (e.boss) for (const x of this.alive()) if (x.minion) { x.hp = 0; this.enemies[x.lane] = null; UI.float(x, '潰散', 'miss'); }
    this.trigger('onEnemyDeath', e);
    this.checkEnd();
  }

  dmgHero(d, src) {
    const h = this.hero;
    const blocked = Math.min(h.block, d);
    h.block -= blocked;
    const loss = d - blocked;
    UI.heroHit(d, loss, blocked);
    if (loss > 0) this.loseHp(loss);
    if (this.over) return;
    if (src && src.hp > 0) {
      if (h.st.thorns) this.dmgEnemy(src, h.st.thorns, { src: 'thorns' });
      if (h.st.flameBarrier && src.hp > 0) this.apply(src, 'burn', h.st.flameBarrier);
    }
  }

  loseHp(n) {
    if (n <= 0 || this.over) return;
    const h = this.hero;
    h.hp -= n;
    this.trigger('onHpLoss', n);
    if (h.hp <= 0) this.heroDeath();
  }

  heroDeath() {
    const h = this.hero;
    const fe = this.run.charms.find(c => c.id === 'phoenix_feather' && !c.used);
    if (fe) {
      fe.used = true; h.hp = Math.ceil(h.maxHp * 0.3);
      UI.banner('鳳羽重生', 'flame');
      UI.pulseCharm(fe);
      return;
    }
    h.hp = 0;
    this.finish(this.run.candles > 0 ? 'candle' : 'lose');
  }

  heal(n) { const h = this.hero; const v = Math.min(n, h.maxHp - h.hp); if (v > 0) { h.hp += v; UI.float(h, `+${v}`, 'heal'); } }

  block(n, raw) {
    const h = this.hero;
    let v = n;
    if (!raw) { v += h.st.dex || 0; if (h.st.frail) v = Math.floor(v * 0.75); }
    v = Math.max(0, v);
    if (!v) return;
    h.block += v;
    UI.float(h, `+${v} 格擋`, 'block');
    this.trigger('onBlockGain', v);
  }
  blockPreview(n) {
    const h = this.hero;
    let v = n + (h.st.dex || 0);
    if (h.st.frail) v = Math.floor(v * 0.75);
    return Math.max(0, v);
  }

  /* ---------- 狀態 ---------- */
  addSt(t, s, n) {
    t.st[s] = (t.st[s] || 0) + n;
    if (t.st[s] === 0 || (t.st[s] < 0 && s !== 'str' && s !== 'dex')) delete t.st[s];
  }
  decSt(t, s) { if (t.st[s]) { t.st[s]--; if (t.st[s] <= 0) delete t.st[s]; } }

  apply(t, st, n, raw) {
    if (!t || t.hp <= 0 || n <= 0) return;
    if (!raw) n = this.reduce('onApply', n, t, st);
    if (st === 'freeze' && t.boss) { st = 'weak'; n = 2; UI.float(t, '免疫冰凍', 'miss'); }
    this.addSt(t, st, n);
    UI.float(t, `${STATUS[st].name} +${n}`, DEBUFFS.includes(st) ? 'debuff' : 'buff');
    if (!raw) this.trigger('onApplied', t, st, n);
  }
  applyAll(st, n) { for (const e of this.alive()) this.apply(e, st, n); }
  self(st, n) { this.addSt(this.hero, st, n); UI.float(this.hero, `${STATUS[st].name} ${n > 0 ? '+' : ''}${n}`, 'buff'); }
  heroDebuff(st, n) {
    this.addSt(this.hero, st, n);
    if (this.phase !== 'player') this.heroFresh.add(st);
    UI.float(this.hero, `${STATUS[st].name} +${n}`, 'debuff');
  }
  power(id, n, mode) {
    const p = this.hero.powers;
    if (mode === 'min' && p[id]) p[id] = Math.min(p[id], n);
    else p[id] = (p[id] || 0) + n;
    UI.float(this.hero, POWERS[id].name, 'buff');
  }

  /* ---------- 資源 ---------- */
  gainEnergy(n) { this.energy += n; UI.float(this.hero, `+${n} 能量`, 'energy'); }
  gainSteps(n) { this.steps += n; }
  gainBones(n) { this.bones += n; }
  gainGold(n) { this.gold += n; gainGold(this.run, n); UI.float(this.hero, `+${n} 金`, 'gold'); }
  gainConsumable() { const id = rollConsumable(); if (addConsumable(this.run, id)) UI.float(this.hero, CONSUMABLES[id].name, 'buff'); }

  draw(n) {
    let drawn = 0;
    for (let i = 0; i < n; i++) {
      if (this.hand.length >= 10) break;
      if (!this.drawPile.length) {
        if (!this.discardPile.length) break;
        this.drawPile = RNG.shuffle(this.discardPile);
        this.discardPile = [];
      }
      this.hand.push(this.drawPile.pop());
      drawn++;
    }
    return drawn;
  }

  addCard(id, pile, n = 1) {
    for (let i = 0; i < n; i++) {
      const c = newCard(id);
      if (pile === 'draw') this.drawPile.splice(RNG.int(0, this.drawPile.length), 0, c);
      else if (pile === 'hand' && this.hand.length < 10) this.hand.push(c);
      else this.discardPile.push(c);
    }
  }

  /* ---------- 友軍 ---------- */
  summon(L, u) {
    if (L == null || this.allies[L]) return null;
    const a = { uid: uid(), name: u.name, glyph: u.glyph, atk: u.atk, hp: u.hp, maxHp: u.hp, kw: Object.assign({}, u.kw || {}), lane: L };
    this.trigger('modSummon', a);
    this.allies[L] = a;
    UI.float(a, '召喚', 'buff');
    this.trigger('onSummon', a);
    return a;
  }
  allyStrike(a) {
    if (!a || a.hp <= 0) return false;
    const targets = a.kw.sweep ? this.alive() : [this.enemies[a.lane]].filter(e => e && e.hp > 0);
    if (!targets.length) return false;
    const x = { add: 0 };
    this.trigger('modAllyAtk', x);
    for (const t of targets) {
      if (t.hp <= 0) continue;
      let d = Math.max(0, a.atk + x.add);
      if (t.st.vuln) d = Math.floor(d * 1.5);
      d += t.st.shock || 0;
      this.dmgEnemy(t, d, { src: 'ally', pierce: !!a.kw.pierce });
      if (this.over) return true;
      if (t.hp > 0) {
        if (a.kw.burn) this.apply(t, 'burn', a.kw.burn);
        if (a.kw.weak) this.apply(t, 'weak', a.kw.weak);
        if (a.kw.shock) this.apply(t, 'shock', a.kw.shock);
      }
    }
    return true;
  }
  dmgAlly(a, d, src) {
    a.hp -= d;
    UI.float(a, `-${d}`, 'dmg');
    UI.shake(a.uid);
    if (a.kw.thorns && src && src.hp > 0) this.dmgEnemy(src, a.kw.thorns, { src: 'thorns' });
    if (a.hp <= 0) this.killAlly(a);
  }
  killAlly(a) {
    if (this.allies[a.lane] === a) this.allies[a.lane] = null;
    a.hp = 0;
    const b = 1 + (a.kw.bone || 0);
    this.gainBones(b);
    UI.floatLane(a.lane, `+${b} 骨`, 'bone', 'ally');
    this.trigger('onAllyDeath', a);
  }
  sacrifice(a) { if (a && a.hp > 0) this.killAlly(a); }
  buffAlly(a, atk, hp) { if (!a) return; a.atk += atk; a.hp += hp; a.maxHp += hp; UI.float(a, `+${atk}/+${hp}`, 'buff'); }

  /* ---------- 走位 ---------- */
  canMove(dir) {
    const nl = this.hero.lane + dir;
    return this.phase === 'player' && !this.busy && !this.over && this.steps > 0 && nl >= 0 && nl <= 2;
  }
  move(dir) {
    if (!this.canMove(dir)) return false;
    this.steps--;
    this.hero.lane += dir;
    this.movesThisTurn++;
    this.trigger('onMove');
    this.checkEnd();
    UI.renderCombat();
    return true;
  }
  moveTo(L) {
    if (L == null || L === this.hero.lane) return;
    this.hero.lane = L;
    this.movesThisTurn++;
    this.trigger('onMove');
  }
  pullEnemy(t) {
    if (!t || t.hp <= 0) return;
    const L = this.hero.lane;
    if (t.lane === L) return;
    const other = this.enemies[L];
    this.enemies[t.lane] = other || null;
    if (other) other.lane = t.lane;
    this.enemies[L] = t; t.lane = L;
    UI.float(t, '拉近', 'debuff');
  }

  /* ---------- 卡牌 ---------- */
  cardCost(c) {
    const d = cardDef(c);
    if (d.cost === 'X') return 'X';
    if (d.cost < 0) return -1;
    let cost = baseCost(c);
    if (d.costDyn) cost += d.costDyn(this);
    if (hasSig(c, 'light')) cost -= 1;
    if (this.played === 0 && runStat(this.run, 'firstFree')) cost = 0;
    return Math.max(0, cost);
  }
  boneCost(c) {
    const b = baseBoneCost(c);
    return b ? Math.max(0, b - runStat(this.run, 'bcostDisc')) : 0;
  }
  canPlay(c) {
    const d = cardDef(c);
    if (this.phase !== 'player' || this.busy || this.over) return { ok: false, why: '現在無法行動' };
    if (d.t === 'status' || d.t === 'curse') return { ok: false, why: '無法打出' };
    const cost = this.cardCost(c);
    if (cost !== 'X' && cost > this.energy) return { ok: false, why: '能量不足' };
    if (this.boneCost(c) > this.bones) return { ok: false, why: '骨不足' };
    if (d.tg === 'front' && !this.front()) return { ok: false, why: '正前方沒有敵人' };
    if ((d.tg === 'enemy' || d.tg === 'all') && !this.alive().length) return { ok: false, why: '沒有敵人' };
    if (d.tg === 'lane' && this.emptyAllyLane() == null) return { ok: false, why: '沒有空道可召喚' };
    if (d.tg === 'ally' && !this.allyList().length) return { ok: false, why: '沒有友軍' };
    return { ok: true };
  }
  validTarget(c, t) {
    const d = cardDef(c);
    switch (d.tg) {
      case 'enemy': return t && t.hp > 0 && this.enemies.includes(t);
      case 'lane': return typeof t === 'number' && !this.allies[t];
      case 'ally': return t && this.allies.includes(t);
      case 'heroLane': return typeof t === 'number' && t >= 0 && t <= 2;
      default: return true;
    }
  }

  playCard(c, target) {
    if (!this.hand.includes(c)) return false;
    if (!this.canPlay(c).ok) return false;
    const d = cardDef(c);
    if (d.tg === 'front') target = this.front();
    if (!this.validTarget(c, target)) return false;
    const cost = this.cardCost(c);
    let X = 0;
    if (cost === 'X') { X = this.energy; this.energy = 0; } else this.energy -= cost;
    this.bones -= this.boneCost(c);
    this.hand.splice(this.hand.indexOf(c), 1);
    this.cur = c;

    let times = 1;
    if (hasSig(c, 'echo') && !this.echoUsed.has(c.uid)) { this.echoUsed.add(c.uid); times++; }
    const twin = (this.hero.powers.twin || 0) + runStat(this.run, 'twin');
    if (d.t === 'atk' && this.twinUsed < twin) { this.twinUsed++; times++; }

    for (let i = 0; i < times && !this.over; i++) {
      let t = target;
      if (i > 0) {
        if (d.tg === 'enemy' && (!t || t.hp <= 0)) break;
        if (d.tg === 'front') { t = this.front(); if (!t) break; }
        if (d.tg === 'lane') { t = this.emptyAllyLane(); if (t == null) break; }
        if (d.tg === 'ally') { t = this.allyList()[0]; if (!t) break; }
      }
      const v = cardVals(c); v.X = X;
      if (d.dyn) Object.assign(v, d.dyn(this, v, t));
      if (d.play) d.play(this, t, v, c);
    }
    if (!this.over) this.sigilEffects(c);

    this.played++;
    if (d.t === 'atk') this.attacksThisTurn++;
    if (d.t === 'skl') this.skillsThisTurn++;
    this.run.stats.cards++;
    if (!this.over) this.trigger('onCardPlayed', c, d);
    if (!this.over) this.resonate(d.f);

    if (d.t !== 'pow') (d.exhaust ? this.exhaustPile : this.discardPile).push(c);
    this.cur = null;
    this.checkEnd();
    return true;
  }

  sigilEffects(c) {
    for (const s of c.sig || []) {
      switch (s) {
        case 'sturdy': this.block(4, true); break;
        case 'swift': this.gainSteps(1); break;
        case 'brand': { const e = this.randEnemy(); if (e) this.apply(e, 'burn', 3); break; }
        case 'gild': this.gainGold(2); break;
        case 'draw': this.draw(1); break;
        case 'bone': this.gainBones(1); break;
        case 'vamp': this.heal(2); break;
      }
    }
  }

  resonate(f) {
    if (!f || f === 'neutral' || !RESONANCE[f]) return;
    this.res[f] = (this.res[f] || 0) + 1;
    if (this.res[f] >= this.resNeed() && !this.resFired[f]) {
      this.resFired[f] = true;
      const times = 1 + (runStat(this.run, 'resTwice') ? 1 : 0);
      for (let i = 0; i < times && !this.over; i++) RESONANCE[f].fire(this);
      UI.banner(`${FACTIONS[f].name}共鳴`, f);
      this.trigger('onResonance', f);
    }
  }
  resNeed() { return Math.max(2, 3 + runStat(this.run, 'resonance')); }

  /* 棄掉選定的牌，再抽同樣數量 */
  redraw(cards) {
    if (this.redraws <= 0 || !cards.length || this.phase !== 'player' || this.busy) return false;
    this.redraws--;
    for (const c of cards) {
      const i = this.hand.indexOf(c);
      if (i >= 0) { this.hand.splice(i, 1); this.discardPile.push(c); }
    }
    this.draw(cards.length);
    UI.renderCombat();
    return true;
  }

  useConsumable(idx, target) {
    const id = this.run.cons[idx];
    const def = CONSUMABLES[id];
    if (!def || def.when === 'map' || this.phase !== 'player' || this.busy) return false;
    if (def.tg === 'enemy' && !(target && target.hp > 0)) return false;
    if (def.tg === 'lane' && (typeof target !== 'number' || this.allies[target])) return false;
    this.run.cons.splice(idx, 1);
    def.use({ C: this, run: this.run, t: target });
    this.checkEnd();
    UI.renderCombat();
    return true;
  }

  /* ---------- 結束 ---------- */
  checkEnd() {
    if (this.over) return true;
    if (!this.alive().length) {
      if (this.reserve.length) { this.spawnReserve(true); return false; }
      this.finish('win');
      return true;
    }
    return false;
  }
  finish(result) {
    if (this.over) return;
    this.over = true; this.result = result; this.phase = 'over';
    this.run.hp = Math.max(0, Math.min(this.hero.hp, this.run.maxHp));
    if (result === 'win') this.trigger('onCombatEnd', true);
    this._resolve(result);
  }
}
