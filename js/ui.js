'use strict';
/* =========================================================
   介面：所有畫面、戰鬥渲染、彈窗、提示、特效
   ========================================================= */
const LANE_NAME = ['左道', '中道', '右道'];
const NODE_INFO = {
  combat: { g: '戰', name: '戰鬥', desc: '一般敵人。勝利後可選一張牌。' },
  elite: { g: '菁', name: '菁英', desc: '強敵。必定掉落護符。' },
  event: { g: '奇', name: '奇遇', desc: '事件，所有選項的代價都會先寫清楚。' },
  shop: { g: '商', name: '商店', desc: '買牌、護符、消耗品；移除卡牌、刻印。' },
  rest: { g: '憩', name: '營火', desc: '休息回復，或鍛造升級一張牌。' },
  treasure: { g: '寶', name: '寶箱', desc: '一個護符與一些金幣。' },
  altar: { g: '祭', name: '祭壇', desc: '刻印、轉印印記，或獻祭卡牌。' },
  boss: { g: '王', name: '首領', desc: '本幕的終點。' },
};
const ACT_CN = ['', '一', '二', '三'];
const SVG_L = '<svg viewBox="0 0 10 16" aria-hidden="true"><path d="M8 2 L2 8 L8 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const SVG_R = '<svg viewBox="0 0 10 16" aria-hidden="true"><path d="M2 2 L8 8 L2 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/* ---------- 美術圖（js/art_manifest.js 列出已有的圖，沒有圖就退回單字印章）---------- */
const artOf = key => (window.ART && window.ART[key]) || null;
/* 依焦點與放大倍數取景，回傳填滿容器的背景樣式 */
function artStyle(key, zoom) {
  const a = artOf(key);
  if (!a) return '';
  const z = zoom || a.z || 1;
  const pos = f => (z === 1 ? 50 : clamp((0.5 - f * z) / (1 - z), 0, 1) * 100).toFixed(1);
  return `background-image:url('${a.src}');background-size:${(z * 100).toFixed(0)}%;background-position:${pos(a.fx ?? 0.5)}% ${pos(a.fy ?? 0.5)}%`;
}
/* 有圖就回傳圖層，沒有就回傳文字（字串 HTML 版） */
const artOrGlyph = (key, glyph, zoom) => artOf(key) ? `<span class="art-fill" style="${artStyle(key, zoom)}"></span>` : esc(glyph);
/* DOM 版 */
function artOrGlyphEl(key, glyph, zoom) {
  if (!artOf(key)) return glyph;
  const s = document.createElement('span');
  s.className = 'art-fill';
  s.setAttribute('style', artStyle(key, zoom));
  return s;
}

const UI = {
  fxCount: 0,
  sel: null,
  hover: null,
  redrawMode: false,
  marked: new Set(),
  unitEls: new Map(),
  cEls: null,

  init() {
    this.hud = $('#hud'); this.screen = $('#screen'); this.fx = $('#fx');
    this.modalEl = $('#modal'); this.tipEl = $('#tip'); this.toastEl = $('#toast');
    this.initTips();
    this.initKeys();
  },

  /* =================== 主渲染 =================== */
  /* 全畫面背景：標題用主視覺，旅程中用當前這一幕的背景。dim 是遮暗程度（0–1）*/
  backdrop(key, dim) {
    const el = $('#bgart');
    if (!el) return;
    const a = key && artOf(key);
    if (!a) { el.classList.remove('on'); return; }
    const url = `url('${a.src}')`;
    if (el.style.backgroundImage !== url) el.style.backgroundImage = url;
    el.style.setProperty('--dim', dim);
    el.classList.add('on');
  },

  render() {
    this.closeTip();
    const run = Game.run;
    this.cEls = null;
    if (!run) this.backdrop('keyart/title', 0.35);
    else if (run.screen === 'gameover') this.backdrop('keyart/title', 0.55);
    else this.backdrop(`bg/act${run.act}`, run.screen === 'combat' ? 0.5 : run.screen === 'map' ? 0.72 : 0.8);
    if (!run || run.screen === 'gameover') {
      this.hud.hidden = true;
      this.screen.className = 'screen';
      this.screen.innerHTML = '';
      return run ? this.renderGameOver() : this.renderTitle();
    }
    this.hud.hidden = false;
    this.renderHud();
    const s = run.screen;
    this.screen.className = 'screen s-' + s;
    this.screen.innerHTML = '';
    this.screen.scrollTop = 0;
    switch (s) {
      case 'ancient': return this.renderAncient();
      case 'map': return this.renderMap();
      case 'combat': return Game.runCombat();
      case 'reward': return this.renderReward();
      case 'perk': return this.renderPerk();
      case 'event': return this.renderEvent();
      case 'shop': return this.renderShop();
      case 'rest': return this.renderRest();
      case 'treasure': return this.renderTreasure();
      case 'altar': return this.renderAltar();
    }
  },

  /* =================== 頂部資訊列 =================== */
  renderHud() {
    const run = Game.run;
    if (!run) return;
    const C = Game.combat;
    const hp = C ? Math.max(0, C.hero.hp) : run.hp;
    const pf = FACTIONS[run.primary];
    const hud = this.hud;
    hud.innerHTML = '';
    const hpPct = clamp(hp / run.maxHp * 100, 0, 100);
    const left = h('div', { class: 'hud-l' },
      h('div', { class: `hero-chip f-${run.primary}`, 'data-tip': `${pf.hero}\n主派系：${pf.full}\n副派系：${FACTIONS[run.secondary].full}\n第${ACT_CN[run.act]}幕・${ACT_NAMES[run.act]}・${run.floor} 層${run.heat ? '・燼階 ' + run.heat : ''}` }, artOrGlyphEl(`heroes/${run.primary}`, pf.glyph)),
      h('div', { class: 'stat hp', 'data-tip': '生命值' },
        h('span', { class: 'lbl' }, '命'),
        h('span', { class: 'bar' }, h('i', { style: { width: hpPct + '%' } })),
        h('span', { class: 'val' }, `${hp}/${run.maxHp}`)),
      h('div', { class: 'stat gold', 'data-tip': `金幣。戰後利息：每持有 10 金 +1（上限 ${5 + runStat(run, 'interestCap')}）` },
        h('span', { class: 'lbl' }, '金'), h('span', { class: 'val' }, run.gold)),
      h('div', { class: 'stat candle' + (run.candles ? '' : ' out'), 'data-tip': '燭火：戰敗時熄滅一根，以 50% 生命重新挑戰該戰。' },
        h('span', { class: 'lbl' }, '燭'), h('span', { class: 'val' }, run.candles)),
      h('div', { class: 'stat where' },
        h('span', { class: 'val' }, `第${ACT_CN[run.act]}幕・${ACT_NAMES[run.act]}`),
        h('span', { class: 'sub' }, `${run.floor} 層${run.heat ? '・燼階 ' + run.heat : ''}`)),
    );
    const slots = charmSlots(run);
    const charms = h('div', { class: 'hud-charms', 'aria-label': '護符' });
    for (let i = 0; i < slots; i++) {
      const c = run.charms[i];
      if (!c) { charms.append(h('div', { class: 'charm empty', 'data-tip': '空的護符欄位' })); continue; }
      const d = CHARMS[c.id];
      const cnt = d.counter ? d.counter(c) : null;
      const el = h('button', { class: `charm r-${d.r}`, type: 'button' },
        h('span', { class: 'g' }, d.glyph), cnt != null ? h('span', { class: 'cnt' }, cnt) : null);
      el._charm = c;
      el._tip = () => `<b>${d.name}</b><span class="tip-r">${{ S: '起始', C: '普通', U: '罕見', R: '稀有', B: '首領' }[d.r]}</span><br>${d.desc}` +
        (c.id === 'blueprint' ? `<br><i>目前複製：${run.charms[i + 1] ? CHARMS[run.charms[i + 1].id].name : '無'}</i>` : '') +
        (C ? '' : `<br><i class="dim">點擊可出售或調整順序（出售得 ${sellValue(c.id)} 金）</i>`);
      el.classList.add('has-tip');
      el.addEventListener('click', () => this.charmMenu(i));
      charms.append(el);
    }
    const cs = consSlots(run);
    const cons = h('div', { class: 'hud-cons' });
    for (let i = 0; i < cs; i++) {
      const id = run.cons[i];
      if (!id) { cons.append(h('div', { class: 'cons empty', 'data-tip': '空的消耗品欄位' })); continue; }
      const d = CONSUMABLES[id];
      const el = h('button', { class: 'cons' + (this.sel && this.sel.kind === 'cons' && this.sel.idx === i ? ' selected' : ''), type: 'button' }, d.glyph);
      el._tip = `<b>${d.name}</b><span class="tip-r">${{ combat: '戰鬥中', map: '戰鬥外', any: '隨時' }[d.when]}</span><br>${d.desc}`;
      el.classList.add('has-tip');
      el.addEventListener('click', () => this.useCons(i));
      cons.append(el);
    }
    const right = h('div', { class: 'hud-r' },
      cons,
      h('button', { class: 'btn ghost deck-btn', type: 'button', onclick: () => this.showDeck() }, '牌組 ', h('b', null, run.deck.length)),
      h('button', { class: 'btn ghost', type: 'button', 'aria-label': '選單', onclick: () => this.menu() }, '選單'),
    );
    hud.append(left, charms, right);
  },

  charmMenu(i) {
    const run = Game.run;
    if (Game.combat) return;
    const c = run.charms[i]; if (!c) return;
    const d = CHARMS[c.id];
    let close;
    const body = h('div', { class: 'charm-menu' },
      h('div', { class: 'big-seal' }, d.glyph),
      h('h3', null, d.name),
      h('p', null, d.desc),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn', type: 'button', disabled: i === 0, onclick: () => { [run.charms[i - 1], run.charms[i]] = [run.charms[i], run.charms[i - 1]]; Game.save(); this.renderHud(); close(); } }, '往左移'),
        h('button', { class: 'btn', type: 'button', disabled: i === run.charms.length - 1, onclick: () => { [run.charms[i + 1], run.charms[i]] = [run.charms[i], run.charms[i + 1]]; Game.save(); this.renderHud(); close(); } }, '往右移'),
        h('button', { class: 'btn danger', type: 'button', onclick: async () => {
          close();
          if (await this.confirm(`出售「${d.name}」，獲得 ${sellValue(c.id)} 金？`, '出售')) {
            run.charms.splice(i, 1); gainGold(run, sellValue(c.id)); Game.save(); this.renderHud();
            if (run.screen === 'shop') this.render();
          }
        } }, `出售 +${sellValue(c.id)} 金`),
      ),
      h('p', { class: 'dim small' }, '護符由左到右依序結算。「鏡像符」複製右側相鄰的護符。'),
      h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, '關閉'),
    );
    close = this.modal(body, { dismiss: true, cls: 'narrow' });
  },

  async useCons(i) {
    const run = Game.run;
    const id = run.cons[i]; if (!id) return;
    const d = CONSUMABLES[id];
    const C = Game.combat;
    if (C) {
      if (d.when === 'map') return this.toast('這個消耗品只能在戰鬥外使用');
      if (C.phase !== 'player' || C.busy) return;
      if (d.tg) {
        if (this.sel && this.sel.kind === 'cons' && this.sel.idx === i) { this.sel = null; }
        else { this.sel = { kind: 'cons', idx: i, tg: d.tg }; this.toast(d.tg === 'enemy' ? '選擇一名敵人' : '選擇一條空道（友軍列）'); }
        this.renderCombat(); return;
      }
      C.useConsumable(i);
      return;
    }
    if (d.when === 'combat') return this.toast('這個消耗品只能在戰鬥中使用');
    const ok = await this.confirm(`使用「${d.name}」？\n${d.desc}`, '使用');
    if (!ok) return;
    run.cons.splice(i, 1);
    const r = await d.use({ run });
    if (r === false) { run.cons.splice(i, 0, id); }
    Game.save();
    this.renderHud();
    if (['shop', 'map'].includes(run.screen)) this.render();
  },

  menu() {
    let close;
    const run = Game.run;
    const body = h('div', { class: 'menu' },
      h('h3', null, '選單'),
      h('div', { class: 'setting' }, h('span', null, '動畫速度'),
        h('div', { class: 'seg' },
          ...[[1, '正常'], [0.55, '快速'], [0.25, '極速']].map(([v, l]) =>
            h('button', { class: 'btn small' + (Settings.speed === v ? ' on' : ''), type: 'button', onclick: () => { Settings.speed = v; saveSettings(); close(); this.menu(); } }, l)))),
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); this.rules(); } }, '玩法說明'),
      h('button', { class: 'btn', type: 'button', onclick: () => { close(); this.sources(); } }, '設計源流'),
      run && run.screen !== 'combat' ? h('button', { class: 'btn', type: 'button', onclick: () => { close(); Game.save(); Game.run = null; this.render(); } }, '存檔並回到標題') : null,
      run ? h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        close();
        if (await this.confirm('放棄這趟旅程？進度不會保留。', '放棄旅程')) {
          if (Game.combat) { Game.combat.over = true; Game.combat = null; }
          Game.endRun(false);
        }
      } }, '放棄旅程') : null,
      h('button', { class: 'btn ghost', type: 'button', onclick: () => close() }, '返回'),
    );
    close = this.modal(body, { dismiss: true, cls: 'narrow' });
  },

  /* =================== 標題與開局 =================== */
  renderTitle() {
    const m = Game.meta;
    const has = Game.hasSave();
    const box = h('div', { class: 'title-screen' },
      h('div', { class: 'logo' },
        h('div', { class: 'logo-seal' }, '燼'),
        h('h1', null, '燼符行'),
        h('p', { class: 'en' }, 'EMBERWRIT')),
      h('p', { class: 'tagline' }, '三道戰場・符籙構築・肉鴿遠征'),
      h('div', { class: 'title-btns' },
        has ? h('button', { class: 'btn primary big', type: 'button', onclick: () => { if (Game.load()) this.render(); } }, '繼續旅程') : null,
        h('button', { class: 'btn big' + (has ? '' : ' primary'), type: 'button', onclick: async () => {
          if (has && !(await this.confirm('開始新旅程會覆蓋目前的存檔。', '開始新旅程'))) return;
          this.renderSetup();
        } }, '新的旅程'),
        h('div', { class: 'row-btns' },
          h('button', { class: 'btn', type: 'button', onclick: () => this.rules() }, '玩法說明'),
          h('button', { class: 'btn', type: 'button', onclick: () => this.sources() }, '設計源流'),
          h('button', { class: 'btn', type: 'button', onclick: () => this.menu() }, '設定'))),
      h('dl', { class: 'meta-stats' },
        h('div', null, h('dt', null, '旅程'), h('dd', null, m.runs)),
        h('div', null, h('dt', null, '登頂'), h('dd', null, m.wins)),
        h('div', null, h('dt', null, '已解鎖燼階'), h('dd', null, m.heat))),
      m.history.length ? h('div', { class: 'history' },
        h('h4', null, '近期旅程'),
        h('ul', null, m.history.slice(0, 5).map(r => h('li', { class: r.win ? 'win' : '' },
          h('span', { class: `dot f-${r.primary}` }, FACTIONS[r.primary].glyph),
          `${FACTIONS[r.primary].name}＋${FACTIONS[r.secondary].name}`,
          h('span', { class: 'dim' }, r.win ? `　登頂${r.heat ? '（燼階 ' + r.heat + '）' : ''}` : `　止步第${ACT_CN[r.act]}幕 ${r.floor} 層`))))) : null,
    );
    this.screen.innerHTML = '';
    this.screen.className = 'screen s-title';
    this.screen.append(box);
  },

  renderSetup() {
    let primary = null, secondary = null, heat = Game.meta.heat;
    const screen = this.screen;
    screen.className = 'screen s-setup';
    const draw = () => {
      screen.innerHTML = '';
      const step = !primary ? 1 : 2;
      const head = h('div', { class: 'setup-head' },
        h('h2', null, step === 1 ? '選擇主派系' : '選擇副派系'),
        h('p', null, step === 1 ? '主派系決定你的英雄、生命值、起始護符與晉升路線。' : '副派系的卡牌會混入你的卡池與起始牌組。兩派系各有共鳴效果。'));
      const grid = h('div', { class: 'faction-grid' });
      for (const f of MAIN_FACTIONS) {
        const F = FACTIONS[f];
        const disabled = step === 2 && f === primary;
        const chosen = f === primary || f === secondary;
        const starter = newCard(F.starter);
        const card = h('button', { class: `faction-card f-${f}${chosen ? ' chosen' : ''}`, type: 'button', disabled,
          onclick: () => { if (step === 1) primary = f; else secondary = f; draw(); } },
          h('div', { class: 'fc-seal' + (artOf(`heroes/${f}`) ? ' has-art' : '') }, artOrGlyphEl(`heroes/${f}`, F.glyph, 1.7)),
          h('div', { class: 'fc-body' },
            h('h3', null, F.full),
            h('p', { class: 'fc-tag' }, F.tag),
            h('p', { class: 'fc-desc' }, F.desc),
            step === 1 ? h('p', { class: 'fc-hero' }, `英雄：${F.hero}・生命 ${F.hp}`) : null,
            step === 1 ? h('p', { class: 'fc-charm' }, `起始護符「${CHARMS[F.charm].name}」：${CHARMS[F.charm].desc}`) : null,
            h('p', { class: 'fc-res' }, `共鳴：${RESONANCE[f].desc}`)),
          h('div', { class: 'fc-card' }, this.cardEl(starter, { mini: true })));
        grid.append(card);
      }
      const foot = h('div', { class: 'setup-foot' });
      if (primary) {
        foot.append(h('div', { class: 'heat-pick' },
          h('span', null, '燼階'),
          ...HEAT.map((hh, i) => h('button', { class: 'btn small' + (heat === i ? ' on' : ''), type: 'button', disabled: i > Game.meta.heat, 'data-tip': hh.desc + (i ? '\n（包含所有較低燼階的效果）' : ''), onclick: () => { heat = i; draw(); } }, i))));
      }
      foot.append(
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { if (secondary) secondary = null; else if (primary) primary = null; else return this.renderTitle(); draw(); } }, '返回'),
        h('button', { class: 'btn primary big', type: 'button', disabled: !(primary && secondary), onclick: () => Game.newRun(primary, secondary, heat) },
          primary && secondary ? `以 ${FACTIONS[primary].name}＋${FACTIONS[secondary].name} 出發` : '出發'));
      screen.append(head, grid, foot);
    };
    draw();
  },

  /* =================== 古神 =================== */
  renderAncient() {
    const run = Game.run, p = run.pending;
    const A = ANCIENTS[p.act];
    const box = h('div', { class: 'ancient' },
      h('div', { class: 'anc-seal' + (artOf(`ancients/${p.act}`) ? ' has-art' : '') }, artOrGlyphEl(`ancients/${p.act}`, A.glyph)),
      h('p', { class: 'eyebrow' }, `第${ACT_CN[p.act]}幕・${ACT_NAMES[p.act]}`),
      h('h2', null, A.name),
      h('p', { class: 'anc-line' }, A.line),
      h('div', { class: 'blessings' }, p.options.map(id => {
        const b = BLESSINGS[id];
        return h('button', { class: 'blessing', type: 'button', onclick: async (ev) => {
          if (this._busy) return; this._busy = true;
          try {
            await b.go(run);
            Game.goto('map');
          } finally { this._busy = false; }
        } }, h('b', null, b.name), h('span', null, b.desc));
      })),
    );
    this.screen.append(box);
  },

  /* =================== 地圖 =================== */
  renderMap() {
    const run = Game.run, m = run.map;
    const avail = new Set(availableNodes(run));
    const rowH = 66, pad = 46;
    const height = (ROWS + 1) * rowH + pad * 2 - rowH + 30;
    const posOf = n => {
      if (n.type === 'boss') return { x: 50, y: pad - 6 };
      return { x: (n.c + 0.5 + n.jx) / COLS * 100, y: height - pad - n.r * rowH - n.jy * 18 };
    };
    const visited = new Set(run.visited);
    const lines = [];
    const all = Object.values(m.nodes);
    for (const n of all) {
      const a = posOf(n);
      const nexts = n.r === ROWS - 1 ? [m.boss] : n.next.map(id => m.nodes[id]);
      for (const nb of nexts) {
        const b = posOf(nb);
        const walked = visited.has(n.id) && visited.has(nb.id);
        const live = run.node === n.id && avail.has(nb.id);
        lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="${walked ? 'walked' : live ? 'live' : ''}" vector-effect="non-scaling-stroke"/>`);
      }
    }
    const board = h('div', { class: 'map-board', style: { height: height + 'px' } });
    board.innerHTML = `<svg class="map-lines" viewBox="0 0 100 ${height}" preserveAspectRatio="none" aria-hidden="true">${lines.join('')}</svg>`;
    const mkNode = n => {
      const p = posOf(n);
      const info = NODE_INFO[n.type];
      const state = run.node === n.id ? 'current' : visited.has(n.id) ? 'visited' : avail.has(n.id) ? 'avail' : 'locked';
      const el = h('button', { class: `node t-${n.type} ${state}`, type: 'button', style: { left: p.x + '%', top: p.y + 'px' },
        disabled: state !== 'avail', 'data-tip': `${info.name}\n${info.desc}`, 'aria-label': info.name,
        onclick: () => Game.enterNode(n.id) }, info.g);
      return el;
    };
    for (const n of all) board.append(mkNode(n));
    const bossEnc = ENCOUNTERS[run.act].boss[0];
    const bossEl = mkNode(m.boss);
    bossEl.classList.add('boss-node');
    bossEl.setAttribute('data-tip', `首領：${ENEMIES[bossEnc.e[0]].name}`);
    bossEl.textContent = ENEMIES[bossEnc.e[0]].glyph;
    board.append(bossEl);

    const legend = h('div', { class: 'legend' }, Object.entries(NODE_INFO).filter(([k]) => k !== 'boss').map(([k, v]) =>
      h('div', { class: `lg t-${k}`, 'data-tip': v.desc }, h('i', null, v.g), v.name)));
    const scroller = h('div', { class: 'map-scroll' }, board);
    const wrap = h('div', { class: 'map-wrap' },
      h('div', { class: 'map-head' },
        h('div', null,
          h('p', { class: 'eyebrow' }, `第${ACT_CN[run.act]}幕`),
          h('h2', null, ACT_NAMES[run.act])),
        h('p', { class: 'dim' }, avail.size ? '選擇下一個目的地' : '')),
      h('div', { class: 'map-body' }, scroller, legend));
    this.screen.append(wrap);
    const cur = run.node && run.node !== 'boss' ? m.nodes[run.node] : null;
    const targetY = cur ? posOf(cur).y : height;
    requestAnimationFrame(() => { scroller.scrollTop = Math.max(0, targetY - scroller.clientHeight * 0.65); });
  },

  /* =================== 戰鬥 =================== */
  mountCombat(C) {
    this.sel = null; this.hover = null; this.redrawMode = false; this.marked.clear(); this.unitEls.clear();
    this.screen.innerHTML = '';
    this.screen.className = 'screen s-combat';
    const lanes = [0, 1, 2].map(L => h('div', { class: 'lane', dataset: { lane: L } },
      h('div', { class: 'row r-enemy', dataset: { lane: L } }),
      h('div', { class: 'row r-threat', dataset: { lane: L } }),
      h('div', { class: 'row r-ally', dataset: { lane: L } }),
      h('div', { class: 'row r-hero', dataset: { lane: L } }),
      h('span', { class: 'lane-label' }, LANE_NAME[L])));
    const top = h('div', { class: 'field-top' });
    const field = h('div', { class: 'field' }, top, h('div', { class: 'lanes' }, lanes), h('div', { class: 'hint' }));
    const trayL = h('div', { class: 'tray-l' });
    const hand = h('div', { class: 'hand' });
    const trayR = h('div', { class: 'tray-r' });
    const root = h('div', { class: 'combat' }, field, h('div', { class: 'tray' }, trayL, hand, trayR));
    this.screen.append(root);
    this.cEls = { root, top, lanes, trayL, hand, trayR, hint: field.querySelector('.hint') };
    root.addEventListener('click', e => this.onCombatClick(e));
    root.addEventListener('contextmenu', e => { if (this.sel || this.redrawMode) { e.preventDefault(); this.cancelSel(); } });
    hand.addEventListener('pointerover', e => {
      const el = e.target.closest('.card');
      const c = el ? Game.combat.hand.find(x => x.uid === el.dataset.uid) : null;
      if (c !== this.hover) { this.hover = c; this.renderField(); }
    });
    hand.addEventListener('pointerleave', () => { if (this.hover) { this.hover = null; this.renderField(); } });
  },

  renderCombat() {
    if (!this.cEls || !Game.combat) return;
    this.renderField();
    this.renderTray();
    this.renderHud();
  },

  previewCard() {
    if (this.sel && this.sel.kind === 'card') return this.sel.c;
    return this.hover;
  },

  renderField() {
    const C = Game.combat, E = this.cEls;
    if (!C || !E) return;
    const kindName = { normal: '戰鬥', elite: '菁英戰', boss: '首領戰' }[C.kind];
    const topHtml = `<span class="ft-kind k-${C.kind}">${kindName}</span><span>第${ACT_CN[C.run.act]}幕・${C.run.floor} 層</span><span>回合 ${C.turn}</span>` +
      (C.reserve.length ? `<span class="ft-reserve" data-tip="${esc(`還有 ${C.reserve.length} 名敵人等待增援，空出的道會在回合結束時補上：\n${C.reserve.map(id => ENEMIES[id].name).join('、')}`)}">增援 ×${C.reserve.length}</span>` : '') +
      `<span class="ft-phase">${C.phase === 'player' ? '你的回合' : C.phase === 'over' ? '' : '敵方行動中…'}</span>`;
    this.setHtml(E.top, topHtml);
    const threat = C.laneThreat();
    const sel = this.sel;
    const pc = this.previewCard();
    const pd = pc ? cardDef(pc) : null;
    const selTg = sel ? (sel.kind === 'card' ? cardDef(sel.c).tg : sel.tg) : null;
    const seen = new Set();
    for (let L = 0; L < 3; L++) {
      const lane = E.lanes[L];
      const [rE, rT, rA, rH] = lane.children;
      lane.classList.toggle('hero-here', C.hero.lane === L);
      // 敵人
      const e = C.enemies[L];
      if (e && e.hp > 0) {
        const el = this.unitEl(e.uid, 'unit enemy');
        seen.add(e.uid);
        el.className = `unit enemy${e.elite ? ' elite' : ''}${e.boss ? ' boss' : ''}${e.minion ? ' minion' : ''}` + (this.targetable('enemy', e) ? ' targetable' : '');
        this.setHtml(this.part(el, 'u-body'), this.enemyInner(e, C));
        this.setHtml(this.part(el, 'u-pv'), this.previewHtml(e, C, pc, pd));
        this.place(rE, el);
      } else this.place(rE, this.emptyEl(rE, 'empty-slot', C.reserve.length ? '增援將至' : ''));
      // 威脅
      const t = threat[L];
      let cls = 'row r-threat', th = '';
      if (t.hits) {
        const toHero = t.hero > 0 && C.hero.lane === L;
        cls += t.ally ? ' to-ally' : toHero ? ' to-hero' : ' to-empty';
        const tip = `本道來襲：${t.sources.join('、')}` + (t.ally ? `\n由友軍承受 ${t.ally}` : '') + (t.hero ? (C.hero.lane === L ? `\n你將承受 ${t.hero}（扣除格擋前）` : `\n你不在此道：落空`) : '');
        th = `<span class="th" data-tip="${esc(tip)}">${t.ally ? `友軍承受 ${t.ally}` : C.hero.lane === L ? `來襲 ${t.hero}` : `落空 ${t.hero}`}</span>`;
      }
      if (rT.className !== cls) rT.className = cls;
      this.setHtml(rT, th);
      // 友軍
      const a = C.allies[L];
      rA.classList.toggle('targetable', this.targetable('lane', L) || this.targetable('ally', a));
      if (a) {
        const el = this.unitEl(a.uid, 'unit ally');
        seen.add(a.uid);
        this.setHtml(el, this.allyInner(a));
        this.place(rA, el);
      } else this.place(rA, this.emptyEl(rA, 'empty-slot ally-empty', selTg === 'lane' ? '召喚於此' : ''));
      // 英雄
      rH.classList.toggle('targetable', this.targetable('heroLane', L) || (!sel && C.phase === 'player' && Math.abs(L - C.hero.lane) === 1 && C.steps > 0));
      if (C.hero.lane === L) {
        const el = this.unitEl('hero', 'unit hero');
        seen.add('hero');
        this.setHtml(el, this.heroInner(C));
        this.place(rH, el);
      } else this.place(rH, this.emptyEl(rH, 'empty-slot hero-empty', selTg === 'heroLane' ? '移到此道' : Math.abs(L - C.hero.lane) === 1 && C.steps > 0 && C.phase === 'player' ? '移動' : ''));
    }
    // 移除消失的單位（保留片刻讓特效播完）
    for (const [k, el] of this.unitEls) {
      if (seen.has(k)) continue;
      this.unitEls.delete(k);
      el.classList.add('dying');
      setTimeout(() => el.remove(), 520);
    }
    // 提示
    let hint = '';
    if (this.redrawMode) hint = `重整：點選要換掉的牌（已選 ${this.marked.size}），再按「確認重整」`;
    else if (sel && sel.kind === 'card') {
      const tg = cardDef(sel.c).tg;
      hint = { enemy: '選擇一名敵人（或按 1／2／3 選道）', lane: '選擇一條空的友軍道', ally: '選擇一名友軍', heroLane: '選擇要移動到的道' }[tg] || '';
      if (hint) hint += '　右鍵或 Esc 取消';
    } else if (sel && sel.kind === 'cons') hint = sel.tg === 'enemy' ? '選擇一名敵人' : '選擇一條空的友軍道';
    E.hint.textContent = hint;
    E.hint.hidden = !hint;
  },

  place(slot, el) {
    for (const ch of Array.from(slot.children)) if (ch !== el && !ch.classList.contains('dying')) ch.remove();
    if (el.parentNode !== slot) slot.append(el);
  },
  /* 只在內容改變時才替換，避免點擊途中元素被換掉 */
  setHtml(el, html) { if (el._html !== html) { el.innerHTML = html; el._html = html; } },
  part(el, cls) {
    if (!el._parts) el._parts = {};
    if (!el._parts[cls]) { const p = h('div', { class: cls }); el.append(p); el._parts[cls] = p; }
    return el._parts[cls];
  },
  emptyEl(slot, cls, text) {
    const e = slot._empty || (slot._empty = h('div'));
    if (e.className !== cls) e.className = cls;
    if (e.textContent !== text) e.textContent = text;
    return e;
  },
  unitEl(key, cls) {
    let el = this.unitEls.get(key);
    if (!el) { el = h('div', { class: cls, dataset: { uid: key } }); this.unitEls.set(key, el); }
    return el;
  },
  targetable(kind, x) {
    const s = this.sel; const C = Game.combat;
    if (!s || !C) return false;
    const tg = s.kind === 'card' ? cardDef(s.c).tg : s.tg;
    if (tg !== kind) return false;
    if (kind === 'enemy') return x && x.hp > 0;
    if (kind === 'lane') return typeof x === 'number' && !C.allies[x];
    if (kind === 'ally') return !!x;
    if (kind === 'heroLane') return true;
    return false;
  },

  statusHtml(st, powers) {
    let out = '';
    for (const k in st) {
      const S = STATUS[k]; if (!S) continue;
      const n = st[k];
      out += `<span class="st ${S.good ? 'good' : 'bad'} s-${k}" data-tip="${esc(S.name + '：' + S.desc(n))}">${S.name[0]}<b>${n}</b></span>`;
    }
    if (powers) for (const k in powers) {
      const P = POWERS[k];
      out += `<span class="st pow" data-tip="${esc(P.name + '：' + P.desc(powers[k]))}">${P.glyph}<b>${k === 'barricade' ? '' : powers[k]}</b></span>`;
    }
    return out;
  },
  bar(hp, max, block) {
    const pct = clamp(hp / max * 100, 0, 100);
    return `<div class="hpbar${block ? ' has-block' : ''}"><i style="width:${pct}%"></i><span>${Math.max(0, hp)}/${max}</span>${block ? `<em class="blk" data-tip="格擋：先抵擋傷害">${block}</em>` : ''}</div>`;
  },

  intentHtml(e, C) {
    const it = e.intent;
    if (!it) return `<div class="intent idle" data-tip="剛登場，下回合才會行動">…</div>`;
    if (e.st.freeze) return `<div class="intent frozen" data-tip="冰凍：跳過這次行動">凍・${esc(it.name)}</div>`;
    const parts = [];
    const tips = [`<b>${esc(it.name)}</b>`];
    for (const a of it.acts) {
      if (a.a === 'atk') {
        const lanes = C.actLanes(e, a);
        const dmg = C.enemyDmg(e, a, lanes.includes(C.hero.lane) && !C.allies[C.hero.lane]);
        const tname = { aim: '瞄準', front: '正面', all: '橫掃', home: '追蹤' }[a.t];
        const where = a.t === 'all' ? '三道' : a.t === 'home' ? '你' : LANE_NAME[lanes[0]];
        parts.push(`<span class="ia atk t-${a.t}">攻<b>${dmg}${a.n > 1 ? '×' + a.n : ''}</b><small>${tname}・${where}</small></span>`);
        tips.push({
          aim: `瞄準：攻擊${LANE_NAME[lanes[0]]}（宣告時你所在的道）。移開就會落空。`,
          front: `正面：攻擊它自己所在的${LANE_NAME[e.lane]}。`,
          all: '橫掃：三道全部命中。',
          home: '追蹤：結算時你在哪一道就打哪一道，只能用格擋或友軍擋。',
        }[a.t] + `${dmg}${a.n > 1 ? ' × ' + a.n + ' 段' : ''} 傷害。`);
      } else if (a.a === 'blk' || a.a === 'blkAll') { parts.push(`<span class="ia blk">守<b>${a.v}</b></span>`); tips.push(a.a === 'blk' ? `獲得 ${a.v} 格擋。` : `所有敵人獲得 ${a.v} 格擋。`); }
      else if (a.a === 'buff' || a.a === 'buffAll') { parts.push(`<span class="ia buff">強</span>`); tips.push(`${a.a === 'buffAll' ? '所有敵人' : '自身'}獲得 ${a.v} ${STATUS[a.s].name}。`); }
      else if (a.a === 'debuff') { parts.push(`<span class="ia deb">咒</span>`); tips.push(`使你獲得 ${a.v} ${STATUS[a.s].name}。`); }
      else if (a.a === 'summon') { parts.push(`<span class="ia sum">召</span>`); tips.push(`召喚 ${a.n || 1} 名${ENEMIES[a.id].name}到空道。`); }
      else if (a.a === 'card') { parts.push(`<span class="ia card">符</span>`); tips.push(`把 ${a.v} 張「${CARDS[a.id].name}」放入你的${a.pile === 'draw' ? '抽牌堆' : '棄牌堆'}。`); }
      else if (a.a === 'pull') { parts.push(`<span class="ia pull">拉</span>`); tips.push('把你拉到它所在的道。'); }
      else if (a.a === 'shift') { parts.push(`<span class="ia shift">移</span>`); tips.push('移動到你所在的道（若有空位）。'); }
    }
    return `<div class="intent" data-tip="${esc(tips.join('\n'))}">${parts.join('')}</div>`;
  },

  previewHtml(e, C, pc, pd) {
    if (!(pc && pd && pd.t === 'atk' && C.phase === 'player')) return '';
    const hitsThis = pd.tg === 'all' || (pd.tg === 'front' ? C.front() === e : pd.tg === 'enemy');
    if (!hitsThis) return '';
    const v = cardVals(pc);
    if (pd.dyn) Object.assign(v, pd.dyn(C, v, e));
    if (v.d == null) return '';
    const x = C.calcAtk(v.d, e, { card: pc, preview: true, inHand: C.hand.includes(pc), strMult: pd.strMult });
    const hits = pd.hits ? pd.hits(C, v) : 1;
    const lethal = x.val * hits >= e.hp + e.block;
    return `<div class="dmg-preview${lethal ? ' lethal' : ''}">-${x.val}${hits > 1 ? '×' + hits : ''}${x.parts.length ? `<small>${esc(x.parts.join(' · '))}</small>` : ''}</div>`;
  },

  enemyInner(e, C) {
    const tag = e.boss ? '首領' : e.elite ? '菁英' : e.minion ? '爪牙' : '';
    const facing = C.hero.lane === e.lane;
    return `${this.intentHtml(e, C)}
      <div class="portrait${facing ? ' facing' : ''}" data-tip="${esc(e.name + (tag ? '（' + tag + '）' : '') + (facing ? '\n與你同道：你對它的攻擊倍率 +0.5' : ''))}"><span>${esc(e.glyph)}</span></div>
      <div class="uname">${esc(e.name)}${tag ? `<small>${tag}</small>` : ''}</div>
      ${this.bar(e.hp, e.maxHp, e.block)}
      <div class="sts">${this.statusHtml(e.st)}</div>`;
  },

  allyInner(a) {
    const kws = Object.entries(a.kw).map(([k, n]) => UNIT_KW[k](n)).join('；');
    return `<div class="a-glyph" data-tip="${esc(a.name + '\n回合結束時攻擊同道敵人，並替該道承受攻擊。' + (kws ? '\n' + kws : ''))}">${esc(a.glyph)}</div>
      <div class="a-info"><div class="uname">${esc(a.name)}</div>
      <div class="a-stats"><span class="atk" data-tip="攻擊">${a.atk}</span><span class="hp" data-tip="生命">${Math.max(0, a.hp)}/${a.maxHp}</span></div></div>`;
  },

  heroInner(C) {
    const run = C.run, h0 = C.hero, pf = FACTIONS[run.primary];
    const canL = C.canMove(-1), canR = C.canMove(1);
    return `<button class="mv mv-l" data-move="-1" type="button" ${canL ? '' : 'disabled'} aria-label="向左移動">${SVG_L}</button>
      <div class="h-core">
        <div class="h-glyph f-${run.primary}" data-tip="${esc(pf.hero + `
生命 ${h0.hp}/${h0.maxHp}` + (h0.block ? `・格擋 ${h0.block}` : ''))}">${artOrGlyph(`heroes/${run.primary}`, pf.glyph)}${h0.block ? `<em class="hblk">${h0.block}</em>` : ''}</div>
        <div class="h-info">${this.bar(h0.hp, h0.maxHp, h0.block)}<div class="sts">${this.statusHtml(h0.st, h0.powers)}</div></div>
      </div>
      <button class="mv mv-r" data-move="1" type="button" ${canR ? '' : 'disabled'} aria-label="向右移動">${SVG_R}</button>`;
  },

  renderTray() {
    const C = Game.combat, E = this.cEls, run = C.run;
    // 左側資源
    E.trayL.innerHTML = '';
    E.trayL.append(
      h('div', { class: 'energy', 'data-tip': '能量：打出卡牌的費用。每回合回滿。' }, h('b', null, C.energy), h('span', null, `/${C.maxEnergy()}`)),
      h('div', { class: 'res-row' },
        h('span', { class: 'chip steps', 'data-tip': '步：移動到相鄰一道（點英雄兩側箭頭、相鄰的道，或按 A／D）。' }, '步 ', h('b', null, C.steps)),
        h('span', { class: 'chip bones' + (C.bones ? '' : ' zero'), 'data-tip': '骨：友軍死亡或被犧牲時獲得。用來支付骨費卡牌。' }, '骨 ', h('b', null, C.bones))),
      h('div', { class: 'res-row' },
        h('button', { class: 'chip pile', type: 'button', 'data-tip': '抽牌堆（點擊查看，順序已隨機）', onclick: () => this.showPile('抽牌堆', C.drawPile, true) }, '抽 ', h('b', null, C.drawPile.length)),
        h('button', { class: 'chip pile', type: 'button', 'data-tip': '棄牌堆', onclick: () => this.showPile('棄牌堆', C.discardPile) }, '棄 ', h('b', null, C.discardPile.length)),
        C.exhaustPile.length ? h('button', { class: 'chip pile', type: 'button', 'data-tip': '消耗堆', onclick: () => this.showPile('消耗堆', C.exhaustPile) }, '耗 ', h('b', null, C.exhaustPile.length)) : null),
    );
    // 手牌
    E.hand.innerHTML = '';
    const n = C.hand.length;
    E.hand.style.setProperty('--n', n);
    C.hand.forEach((c, i) => {
      const chk = C.canPlay(c);
      const el = this.cardEl(c, { C });
      el.classList.add('in-hand');
      if (!chk.ok && !this.redrawMode) el.classList.add('unplayable');
      if (this.sel && this.sel.kind === 'card' && this.sel.c === c) el.classList.add('selected');
      if (this.marked.has(c.uid)) el.classList.add('marked');
      el.style.setProperty('--i', i);
      el.append(h('span', { class: 'hotkey' }, i < 9 ? i + 1 : i === 9 ? 0 : ''));
      E.hand.append(el);
    });
    // 右側
    E.trayR.innerHTML = '';
    const resF = [run.primary, run.secondary];
    const need = C.resNeed();
    const res = h('div', { class: 'resonance' }, resF.map(f => {
      const cnt = Math.min(need, C.res[f] || 0);
      const fired = C.resFired[f];
      return h('div', { class: `res f-${f}${fired ? ' fired' : ''}`, 'data-tip': `${FACTIONS[f].name}共鳴：本回合打出 ${need} 張${FACTIONS[f].name}牌時，${RESONANCE[f].desc}。每回合一次。` },
        h('span', { class: 'rg' }, FACTIONS[f].glyph),
        h('span', { class: 'dots' }, Array.from({ length: need }, (_, k) => h('i', { class: k < cnt ? 'on' : '' }))));
    }));
    const playerTurn = C.phase === 'player' && !C.busy;
    const redrawBtn = this.redrawMode
      ? h('div', { class: 'redraw-ctl' },
          h('button', { class: 'btn small primary', type: 'button', disabled: !this.marked.size, onclick: () => this.confirmRedraw() }, `確認重整（${this.marked.size}）`),
          h('button', { class: 'btn small ghost', type: 'button', onclick: () => this.cancelSel() }, '取消'))
      : h('button', { class: 'btn small redraw', type: 'button', disabled: !playerTurn || C.redraws <= 0 || !C.hand.length,
          'data-tip': `重整：棄掉任意張手牌，再抽同樣數量。每場戰鬥 ${2 + runStat(run, 'redraws')} 次。\n戰後每剩 1 次 +1 金。（快捷鍵 R）`,
          onclick: () => { this.redrawMode = true; this.sel = null; this.marked.clear(); this.renderCombat(); } }, `重整 ×${C.redraws}`);
    E.trayR.append(
      res,
      h('div', { class: 'chain', 'data-tip': '本回合已打出的牌數（連擊）' }, '連擊 ', h('b', null, C.played)),
      redrawBtn,
      h('button', { class: 'btn end-turn', type: 'button', disabled: !playerTurn, onclick: () => this.endTurn() }, playerTurn ? '結束回合' : '敵方回合'),
    );
  },

  onCombatClick(e) {
    const C = Game.combat;
    if (!C || C.over) return;
    const mv = e.target.closest('[data-move]');
    if (mv) { e.stopPropagation(); this.cancelSel(true); C.move(+mv.dataset.move); return; }
    const cardEl = e.target.closest('.hand .card');
    if (cardEl) { const c = C.hand.find(x => x.uid === cardEl.dataset.uid); if (c) this.onCardClick(c, cardEl); return; }
    const row = e.target.closest('.row');
    if (row) {
      const L = +row.dataset.lane;
      if (row.classList.contains('r-enemy')) { const en = C.enemies[L]; if (en) return this.onTarget('enemy', en); }
      if (row.classList.contains('r-ally')) {
        if (this.sel) { const tg = this.sel.kind === 'card' ? cardDef(this.sel.c).tg : this.sel.tg; if (tg === 'ally') return this.onTarget('ally', C.allies[L]); return this.onTarget('lane', L); }
      }
      if (row.classList.contains('r-hero')) {
        if (this.sel) return this.onTarget('heroLane', L);
        if (Math.abs(L - C.hero.lane) === 1) { C.move(L - C.hero.lane); return; }
      }
    }
    if (!e.target.closest('button') && this.sel) this.cancelSel();
  },

  onCardClick(c, el) {
    const C = Game.combat;
    if (C.phase !== 'player' || C.busy) return;
    if (this.redrawMode) {
      if (this.marked.has(c.uid)) this.marked.delete(c.uid); else this.marked.add(c.uid);
      return this.renderCombat();
    }
    if (this.sel && this.sel.kind === 'card' && this.sel.c === c) return this.cancelSel();
    const chk = C.canPlay(c);
    if (!chk.ok) { this.toast(chk.why); if (el) { el.classList.remove('nope'); void el.offsetWidth; el.classList.add('nope'); } return; }
    const tg = cardDef(c).tg;
    if (tg === 'enemy' && C.alive().length === 1) return this.play(c, C.alive()[0]);
    if (tg === 'ally' && C.allyList().length === 1) return this.play(c, C.allyList()[0]);
    if (tg === 'lane') { const free = [0, 1, 2].filter(l => !C.allies[l]); if (free.length === 1) return this.play(c, free[0]); }
    if (['enemy', 'lane', 'ally', 'heroLane'].includes(tg)) { this.sel = { kind: 'card', c }; return this.renderCombat(); }
    this.play(c, null);
  },

  onTarget(kind, t) {
    const C = Game.combat;
    const s = this.sel;
    if (!s) return;
    if (!this.targetable(kind, t)) return;
    if (s.kind === 'card') this.play(s.c, t);
    else if (s.kind === 'cons') { this.sel = null; C.useConsumable(s.idx, t); this.renderCombat(); }
  },

  play(c, t) {
    const C = Game.combat;
    const el = this.cEls && this.cEls.hand.querySelector(`.card[data-uid="${c.uid}"]`);
    const ok = C.playCard(c, t);
    this.sel = null;
    if (ok && el) this.ghost(el);
    this.hover = null;
    this.renderCombat();
  },

  cancelSel(quiet) {
    this.sel = null; this.redrawMode = false; this.marked.clear();
    if (!quiet) this.renderCombat();
  },
  clearSelection() { this.sel = null; this.redrawMode = false; this.marked.clear(); this.hover = null; },

  confirmRedraw() {
    const C = Game.combat;
    const cards = C.hand.filter(c => this.marked.has(c.uid));
    this.redrawMode = false; this.marked.clear();
    if (!C.redraw(cards)) this.renderCombat();
  },

  async endTurn() {
    const C = Game.combat;
    if (!C || C.phase !== 'player' || C.busy) return;
    await C.endTurn();
  },

  /* =================== 卡牌 =================== */
  cardText(c, v, C, diffBase) {
    const d = cardDef(c);
    let t = (c.up && d.tu) ? d.tu : d.text;
    if (d.t === 'unit') t = (t ? t : '') + unitText(v.unit);
    if (!t) return '';
    let html = esc(t).replace(/\{(\w+)\}/g, (m, k) => {
      let val = v[k];
      if (val == null) return m;
      const raw = val;
      if (C && k[0] === 'd' && d.t === 'atk') val = C.calcAtk(val, null, { card: c, preview: true, inHand: C.hand.includes(c), strMult: d.strMult }).val;
      else if (C && k[0] === 'b') val = C.blockPreview(val);
      let cls = 'num';
      if (val > raw) cls += ' up'; else if (val < raw) cls += ' down';
      if (diffBase && diffBase[k] != null && diffBase[k] !== raw) cls += ' up';
      return `<b class="${cls}">${val}</b>`;
    });
    for (const kw of Object.keys(KEYWORDS)) {
      if (kw.length < 2) continue;
      html = html.split(kw).join(`<u>${kw}</u>`);
    }
    return html;
  },

  cardTip(c) {
    const d = cardDef(c);
    const text = ((c.up && d.tu) ? d.tu : d.text || '') + (d.unit ? unitText(cardVals(c).unit) : '');
    const lines = [];
    for (const [kw, desc] of Object.entries(KEYWORDS)) if (text.includes(kw)) lines.push(`<b>${kw}</b>：${desc}`);
    if (d.t === 'unit') lines.push(`<b>友軍</b>：${KEYWORDS['友軍']}`);
    if (d.bcost) lines.push(`<b>骨費</b>：${KEYWORDS['骨']}`);
    if (d.t === 'pow') lines.push('<b>能力</b>：打出後持續到戰鬥結束。');
    if (d.cost === 'X') lines.push('<b>X 費</b>：消耗所有能量，X 等於消耗的能量。');
    if (d.tg === 'front') lines.push(`<b>正前方</b>：${KEYWORDS['正前方']}`);
    if (d.t === 'atk' && d.tg !== 'front') lines.push('<b>正對</b>：與目標同道時攻擊倍率 +0.5。');
    for (const k of c.sig || []) lines.push(`<b>印記・${SIGILS[k].name}</b>：${SIGILS[k].desc}`);
    if (!lines.length) return '';
    return lines.join('<br>');
  },

  cardEl(c, o = {}) {
    const d = cardDef(c);
    const C = o.C || null;
    const v = cardVals(c);
    if (d.dyn) Object.assign(v, d.dyn(C, v, null));
    let cost;
    if (C) cost = C.cardCost(c);
    else cost = d.cost === 'X' ? 'X' : d.cost < 0 ? -1 : Math.max(0, baseCost(c) - (hasSig(c, 'light') ? 1 : 0));
    const bcost = C ? C.boneCost(c) : baseBoneCost(c);
    const diffBase = o.diff ? cardVals({ id: c.id, up: false }) : null;
    const costChanged = C && cost !== 'X' && cost >= 0 && cost < baseCost(c);
    const textHtml = this.cardText(c, v, C, diffBase);
    const len = textHtml.replace(/<[^>]+>/g, '').length;
    const lenCls = len > 40 ? ' tx-xlong' : len > 28 ? ' tx-long' : '';
    const el = h('div', { class: `card t-${d.t} f-${d.f} r-${d.r}${c.up ? ' up' : ''}${o.mini ? ' mini' : ''}${lenCls}`, dataset: { uid: c.uid } },
      cost === 'X' || cost >= 0 ? h('div', { class: 'c-cost' + (costChanged ? ' cheap' : '') }, cost) : null,
      bcost ? h('div', { class: 'c-bcost', 'data-tip': `需要支付 ${bcost} 骨` }, `骨${bcost}`) : null,
      h('div', { class: 'c-name' }, d.name + (c.up ? '+' : '')),
      h('div', { class: 'c-art' }, h('span', { class: 'c-seal' }, d.glyph || d.name[0])),
      h('div', { class: 'c-type' }, TYPE_NAME[d.t] + (d.f !== 'neutral' ? '・' + FACTIONS[d.f].name : '') + (d.r === 'U' || d.r === 'R' ? '・' + RARITY_NAME[d.r] : '')),
      h('div', { class: 'c-text', html: textHtml }),
      c.sig && c.sig.length ? h('div', { class: 'c-sigils' }, c.sig.map(k => h('span', { class: 'sig' }, SIGILS[k].glyph))) : null,
      d.t === 'unit' ? h('div', { class: 'c-stats' }, h('span', { class: 'atk' }, v.unit.atk), h('span', { class: 'hp' }, v.unit.hp)) : null,
    );
    el._tip = () => this.cardTip(c);
    el.classList.add('has-tip');
    return el;
  },

  /* =================== 獎勵 =================== */
  renderReward() {
    const run = Game.run, p = run.pending;
    const list = h('div', { class: 'reward-list' });
    let total = 0;
    for (const it of p.items) {
      if (it.type === 'gold') {
        if (!it.taken) { it.taken = true; gainGold(run, it.n); }
        total += it.n;
        list.append(h('div', { class: 'rw gold' }, h('span', { class: 'rw-i' }, '金'), h('span', null, it.label), h('b', null, `+${it.n}`)));
      } else if (it.type === 'note') {
        list.append(h('div', { class: 'rw gold dim' }, h('span', { class: 'rw-i' }, '金'), h('span', null, it.label), h('b', null, `+${it.n}`)));
      }
    }
    Game.save();
    this.renderHud();
    const cardItem = p.items.find(x => x.type === 'card');
    const section = [];
    if (cardItem && !cardItem.taken) {
      const row = h('div', { class: 'card-choice' }, cardItem.choices.map(c => {
        const el = this.cardEl(c);
        el.classList.add('pickable');
        el.addEventListener('click', () => { addToDeck(run, c); cardItem.taken = true; Game.save(); this.render(); });
        return el;
      }));
      const canFree = cardItem.free > 0;
      const rerollCost = canFree ? 0 : cardItem.rerollCost;
      section.push(h('div', { class: 'rw-block' },
        h('h3', null, '選擇一張牌加入牌組'),
        row,
        h('div', { class: 'row-btns' },
          h('button', { class: 'btn', type: 'button', disabled: run.gold < rerollCost, onclick: () => {
            if (canFree) cardItem.free--; else { run.gold -= rerollCost; cardItem.rerollCost += 5; }
            cardItem.choices = rollCards(run, cardItem.choices.length, { kind: p.kind });
            Game.save(); this.render();
          } }, canFree ? '重抽（免費）' : `重抽（${rerollCost} 金）`),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { cardItem.taken = true; gainGold(run, 5); Game.save(); this.render(); } }, '略過（+5 金）'))));
    }
    for (const it of p.items) {
      if (it.taken) continue;
      if (it.type === 'charm') {
        const d = CHARMS[it.id];
        section.push(h('button', { class: 'rw take', type: 'button', onclick: async () => { if (await Flow.gainCharm(run, it.id)) { it.taken = true; Game.save(); this.render(); } } },
          h('span', { class: `rw-i charm-i r-${d.r}` }, d.glyph), h('span', null, h('b', null, d.name), h('br'), h('small', null, d.desc)), h('em', null, '拿取')));
      } else if (it.type === 'cons') {
        const d = CONSUMABLES[it.id];
        section.push(h('button', { class: 'rw take', type: 'button', onclick: async () => { if (await Flow.gainConsumable(run, it.id)) { it.taken = true; Game.save(); this.render(); } } },
          h('span', { class: 'rw-i' }, d.glyph), h('span', null, h('b', null, d.name), h('br'), h('small', null, d.desc)), h('em', null, '拿取')));
      } else if (it.type === 'bossCharm') {
        section.push(h('div', { class: 'rw-block' }, h('h3', null, '首領遺寶：三選一（強大但各有代價）'),
          h('div', { class: 'charm-choice' }, it.choices.map(id => {
            const d = CHARMS[id];
            return h('button', { class: 'charm-opt', type: 'button', onclick: async () => { if (await Flow.gainCharm(run, id)) { it.taken = true; Game.save(); this.render(); } } },
              h('span', { class: `big-seal r-${d.r}` }, d.glyph), h('b', null, d.name), h('small', null, d.desc));
          })),
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { it.taken = true; Game.save(); this.render(); } }, '都不要')));
      }
    }
    const box = h('div', { class: 'reward' },
      h('p', { class: 'eyebrow' }, { normal: '戰鬥勝利', elite: '擊敗菁英', boss: '首領倒下' }[p.kind]),
      h('h2', null, '戰利品'),
      list,
      h('p', { class: 'total' }, `本場共獲得 ${total} 金・目前 ${run.gold} 金`),
      ...section,
      h('button', { class: 'btn primary big', type: 'button', onclick: () => Game.afterReward() }, p.kind === 'boss' ? (run.act >= 3 ? '登頂' : '前往晉升') : '繼續前進'));
    this.screen.append(box);
  },

  renderPerk() {
    const run = Game.run, p = run.pending;
    const paths = PERK_PATHS[run.primary].filter(x => p.paths.includes(x.id));
    const box = h('div', { class: 'perk' },
      h('p', { class: 'eyebrow' }, '英雄晉升'),
      h('h2', null, p.tier === 0 ? '選擇你的道路' : '道路的下一步'),
      h('p', { class: 'dim' }, p.tier === 0 ? '路線一經選擇便不可更改。第二幕首領之後，同一路線會再晉升一次。' : '你的路線帶來更強的力量。'),
      h('div', { class: 'perk-grid' }, paths.map(path => {
        const t1 = PERKS[path.tiers[0]], t2 = PERKS[path.tiers[1]];
        return h('button', { class: `perk-card f-${run.primary}`, type: 'button', onclick: () => { choosePerk(run, path.id); Game.nextAct(); } },
          h('div', { class: 'big-seal' }, path.name[0]),
          h('h3', null, path.name),
          h('p', { class: p.tier === 0 ? 'now' : 'had' }, h('b', null, t1.name), '　', t1.desc),
          h('p', { class: p.tier === 1 ? 'now' : 'later' }, h('b', null, t2.name), '　', t2.desc));
      })));
    this.screen.append(box);
  },

  /* =================== 事件 =================== */
  renderEvent() {
    const run = Game.run, p = run.pending;
    const ev = EVENTS[p.id];
    const box = h('div', { class: 'event' },
      h('div', { class: 'ev-seal' }, ev.glyph),
      h('h2', null, ev.name),
      h('p', { class: 'ev-text' }, ev.text));
    if (p.result) {
      box.append(h('p', { class: 'ev-result' }, p.result),
        h('button', { class: 'btn primary', type: 'button', onclick: () => Game.goto('map') }, '繼續前進'));
    } else {
      const opts = ev.options(run);
      box.append(h('div', { class: 'ev-opts' }, opts.map(o => {
        const ok = o.ok === undefined ? true : !!o.ok;
        return h('button', { class: 'ev-opt', type: 'button', disabled: !ok, onclick: async () => {
          if (this._busy) return; this._busy = true;
          try {
            const r = await o.go(run);
            if (r === false) return;
            if (r && r.combat) {
              const enc = Game.rollEncounter('elite');
              return Game.startCombat(enc, 'elite');
            }
            p.result = r || '…';
            Game.save(); this.render();
          } finally { this._busy = false; }
        } }, h('b', null, o.label), h('span', null, o.detail + (ok ? '' : '（條件不足）')));
      })));
    }
    this.screen.append(box);
  },

  /* =================== 商店 =================== */
  renderShop() {
    const run = Game.run, s = run.pending;
    const buy = (price) => { if (run.gold < price) { this.toast('金幣不足'); return false; } run.gold -= price; return true; };
    const priceTag = (n, sold, extra) => h('span', { class: 'price' + (run.gold < n && !sold ? ' poor' : '') + (extra ? ' ' + extra : '') }, sold ? '已售出' : `${n} 金`);
    const cards = h('div', { class: 'shop-cards' }, s.cards.map(it => {
      const el = this.cardEl(it.card);
      const wrap = h('div', { class: 'shop-item' + (it.sold ? ' sold' : '') }, el, priceTag(it.price, it.sold, it.sale ? 'sale' : ''));
      if (!it.sold) el.addEventListener('click', () => { if (buy(it.price)) { addToDeck(run, it.card); it.sold = true; Game.save(); this.render(); } });
      el.classList.add('pickable');
      return wrap;
    }));
    const charms = h('div', { class: 'shop-charms' }, s.charms.map(it => {
      const d = CHARMS[it.id];
      return h('button', { class: 'shop-charm' + (it.sold ? ' sold' : ''), type: 'button', disabled: it.sold, onclick: async () => {
        if (run.gold < it.price) return this.toast('金幣不足');
        run.gold -= it.price;
        if (await Flow.gainCharm(run, it.id)) { it.sold = true; } else run.gold += it.price;
        Game.save(); this.render();
      } }, h('span', { class: `big-seal r-${d.r}` }, d.glyph), h('b', null, d.name), h('small', null, d.desc), priceTag(it.price, it.sold));
    }));
    const cons = h('div', { class: 'shop-cons' }, s.cons.map(it => {
      const d = CONSUMABLES[it.id];
      return h('button', { class: 'shop-con' + (it.sold ? ' sold' : ''), type: 'button', disabled: it.sold, onclick: () => {
        if (run.cons.length >= consSlots(run)) return this.toast('消耗品欄位已滿');
        if (!buy(it.price)) return;
        addConsumable(run, it.id); it.sold = true; Game.save(); this.render();
      } }, h('span', { class: 'rw-i' }, d.glyph), h('span', null, h('b', null, d.name), h('br'), h('small', null, d.desc)), priceTag(it.price, it.sold));
    }));
    const rc = shopRerollCost(run, s);
    const services = h('div', { class: 'shop-services' },
      h('button', { class: 'service', type: 'button', disabled: s.removed, onclick: async () => {
        if (run.gold < s.removeCost) return this.toast('金幣不足');
        if (await Flow.removeCard(run, `移除一張牌（${s.removeCost} 金）`)) { run.gold -= s.removeCost; s.removed = true; run.removeCost += 25; Game.save(); this.render(); }
      } }, h('b', null, '移除卡牌'), h('small', null, s.removed ? '本店已使用' : '從牌組中刪去一張牌'), priceTag(s.removeCost, s.removed)),
      h('button', { class: 'service', type: 'button', disabled: s.inscribed, onclick: async () => {
        if (run.gold < s.inscribeCost) return this.toast('金幣不足');
        if (await Flow.inscribeChoose(run, 3)) { run.gold -= s.inscribeCost; s.inscribed = true; Game.save(); this.render(); }
      } }, h('b', null, '刻印'), h('small', null, s.inscribed ? '本店已使用' : '三選一的印記，刻在一張牌上'), priceTag(s.inscribeCost, s.inscribed)),
      h('button', { class: 'service', type: 'button', onclick: () => {
        if (!buy(rc)) return;
        rerollShop(run, s); Game.save(); this.render();
      } }, h('b', null, '重抽貨架'), h('small', null, '刷新卡牌與護符（每次漲價）'), priceTag(rc, false)));
    const box = h('div', { class: 'shop' },
      h('div', { class: 'shop-head' },
        h('div', null, h('p', { class: 'eyebrow' }, '商店'), h('h2', null, '符紙鋪')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => Game.goto('map') }, '離開商店')),
      h('h3', null, '卡牌'), cards,
      h('div', { class: 'shop-split' },
        h('div', null, h('h3', null, '護符'), charms),
        h('div', null, h('h3', null, '消耗品'), cons, h('h3', null, '服務'), services)),
      h('p', { class: 'dim small' }, '提示：持有的護符可以在頂部列點擊出售，換取一半價格。'));
    this.screen.append(box);
  },

  /* =================== 營火 / 寶箱 / 祭壇 =================== */
  renderRest() {
    const run = Game.run, p = run.pending;
    const healPct = run.heat >= 2 ? 0.25 : 0.3;
    const heal = Math.round(run.maxHp * healPct);
    const noRest = runStat(run, 'noRest') > 0;
    const done = msg => { p.done = msg; Game.save(); this.render(); };
    const box = h('div', { class: 'rest' },
      h('div', { class: 'ev-seal fire' }, '火'),
      h('h2', null, '營火'),
      p.done ? h('p', { class: 'ev-result' }, p.done) : h('p', { class: 'ev-text' }, '火光照亮一小片安全的地方。選一件事做。'),
      p.done ? h('button', { class: 'btn primary', type: 'button', onclick: () => Game.goto('map') }, '繼續前進') :
      h('div', { class: 'ev-opts' },
        h('button', { class: 'ev-opt', type: 'button', disabled: noRest, onclick: () => { runHeal(run, heal); done(`你睡了一覺。+${heal} 生命`); } },
          h('b', null, '休息'), h('span', null, noRest ? '「幽燈」使你無法在此休息' : `回復 ${Math.round(healPct * 100)}% 最大生命（${heal}）。`)),
        h('button', { class: 'ev-opt', type: 'button', onclick: async () => { if (await Flow.upgradeCard(run)) done('符紙在火中淬得更亮了。'); } },
          h('b', null, '鍛造'), h('span', null, '選擇一張牌升級。')),
        h('button', { class: 'ev-opt', type: 'button', onclick: async () => { const id = rollConsumable(); if (await Flow.gainConsumable(run, id)) done(`你整理行囊，找出了「${CONSUMABLES[id].name}」。`); } },
          h('b', null, '整備'), h('span', null, '獲得 1 個隨機消耗品。'))));
    this.screen.append(box);
  },

  renderTreasure() {
    const run = Game.run, p = run.pending;
    const box = h('div', { class: 'treasure' },
      h('div', { class: 'ev-seal' }, '寶'),
      h('h2', null, '寶箱'));
    if (!p.opened) {
      box.append(h('p', { class: 'ev-text' }, '一只貼滿封條的木箱。'),
        h('button', { class: 'btn primary big', type: 'button', onclick: async () => {
          gainGold(run, p.gold);
          if (p.charm) await Flow.gainCharm(run, p.charm);
          p.opened = true; Game.save(); this.render();
        } }, '撕開封條'));
    } else {
      const d = p.charm ? CHARMS[p.charm] : null;
      box.append(h('p', { class: 'ev-result' }, `+${p.gold} 金` + (d ? `，以及「${d.name}」：${d.desc}` : '')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => Game.goto('map') }, '繼續前進'));
    }
    this.screen.append(box);
  },

  renderAltar() {
    const run = Game.run, p = run.pending;
    const done = msg => { p.done = msg; Game.save(); this.render(); };
    const hasSigCard = run.deck.some(c => (c.sig || []).length);
    const box = h('div', { class: 'altar' },
      h('div', { class: 'ev-seal' }, '祭'),
      h('h2', null, '印記祭壇'),
      p.done ? h('p', { class: 'ev-result' }, p.done) : h('p', { class: 'ev-text' }, '石台上刻滿了印記的拓痕。祭壇只回應一次請求。'),
      p.done ? h('button', { class: 'btn primary', type: 'button', onclick: () => Game.goto('map') }, '繼續前進') :
      h('div', { class: 'ev-opts' },
        h('button', { class: 'ev-opt', type: 'button', onclick: async () => { if (await Flow.inscribeChoose(run, 3)) done('印記烙進了符紙。'); } },
          h('b', null, '刻印'), h('span', null, '從 3 個印記中選 1 個，刻在一張牌上。')),
        h('button', { class: 'ev-opt', type: 'button', disabled: !hasSigCard, onclick: async () => { if (await Flow.transferSigil(run)) done('舊符化為灰燼，印記留了下來。'); } },
          h('b', null, '轉印'), h('span', null, hasSigCard ? '犧牲一張帶印記的牌，把它的印記轉到另一張牌上。' : '犧牲一張帶印記的牌，把印記轉到另一張牌上。（牌組中沒有帶印記的牌）')),
        h('button', { class: 'ev-opt', type: 'button', onclick: async () => { if (await Flow.removeCard(run, '獻祭一張牌')) { gainGold(run, 25); done('祭壇收下了供品，還給你 25 金。'); } } },
          h('b', null, '獻祭'), h('span', null, '移除一張牌，獲得 25 金。'))));
    this.screen.append(box);
  },

  renderGameOver() {
    const run = Game.run, win = run.pending && run.pending.win;
    const s = run.stats;
    const mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
    const box = h('div', { class: 'gameover' + (win ? ' win' : '') },
      h('div', { class: 'logo-seal' }, win ? '登' : '燼'),
      h('h2', null, win ? '登頂' : '旅途終結'),
      h('p', { class: 'dim' }, win ? `你以${FACTIONS[run.primary].name}＋${FACTIONS[run.secondary].name}擊敗了燼符之主。` : `止步於第${ACT_CN[run.act]}幕・${ACT_NAMES[run.act]}，第 ${run.floor} 層。`),
      win && Game.meta.heat > run.heat ? h('p', { class: 'unlock' }, `已解鎖燼階 ${Game.meta.heat}：${HEAT[Game.meta.heat].desc}`) : null,
      h('dl', { class: 'meta-stats' },
        h('div', null, h('dt', null, '擊敗敵人'), h('dd', null, s.kills)),
        h('div', null, h('dt', null, '總傷害'), h('dd', null, s.dmg)),
        h('div', null, h('dt', null, '最高單擊'), h('dd', null, s.maxHit)),
        h('div', null, h('dt', null, '打出卡牌'), h('dd', null, s.cards)),
        h('div', null, h('dt', null, '賺得金幣'), h('dd', null, s.gold)),
        h('div', null, h('dt', null, '用時'), h('dd', null, `${mins} 分`))),
      h('div', { class: 'final-deck' }, h('h4', null, `最終牌組（${run.deck.length}）`),
        h('div', { class: 'deck-grid small' }, run.deck.map(c => this.cardEl(c, { mini: true })))),
      h('div', { class: 'row-btns' },
        h('button', { class: 'btn primary big', type: 'button', onclick: () => { Game.run = null; this.renderSetup(); } }, '再走一趟'),
        h('button', { class: 'btn big', type: 'button', onclick: () => { Game.run = null; this.render(); } }, '回到標題')));
    this.screen.append(box);
  },

  /* =================== 彈窗 =================== */
  modal(content, o = {}) {
    const box = h('div', { class: 'modal ' + (o.cls || ''), role: 'dialog', 'aria-modal': 'true' }, content);
    const wrap = h('div', { class: 'modal-wrap' }, box);
    this.modalEl.append(wrap);
    this.modalEl.hidden = false;
    this.closeTip();
    const close = () => {
      wrap.remove();
      if (!this.modalEl.children.length) this.modalEl.hidden = true;
      this.closeTip();
    };
    if (o.dismiss) wrap.addEventListener('click', e => { if (e.target === wrap) { close(); if (o.onDismiss) o.onDismiss(); } });
    wrap._close = () => { close(); if (o.onDismiss) o.onDismiss(); };
    return close;
  },
  confirm(text, okText = '確定') {
    return new Promise(res => {
      let close;
      const body = h('div', { class: 'confirm' },
        h('p', null, ...text.split('\n').flatMap((l, i) => i ? [h('br'), l] : [l])),
        h('div', { class: 'row-btns' },
          h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); res(false); } }, '取消'),
          h('button', { class: 'btn primary', type: 'button', onclick: () => { close(); res(true); } }, okText)));
      close = this.modal(body, { dismiss: true, cls: 'narrow', onDismiss: () => res(false) });
    });
  },
  pickCards(cards, o) {
    return new Promise(res => {
      const chosen = new Set();
      let close;
      const grid = h('div', { class: 'deck-grid' });
      const preview = h('div', { class: 'up-preview' });
      const btn = h('button', { class: 'btn ' + (o.danger ? 'danger' : 'primary'), type: 'button', disabled: true, onclick: () => { close(); res(cards.filter(c => chosen.has(c))); } }, o.confirm || '確定');
      const count = h('span', { class: 'dim' });
      const update = () => {
        btn.disabled = chosen.size < o.min || chosen.size > o.max || chosen.size === 0 && o.min > 0;
        if (o.min === 0 && chosen.size === 0) btn.disabled = true;
        count.textContent = o.max > 1 ? `已選 ${chosen.size}/${o.max}` : '';
        $$('.card', grid).forEach(el => el.classList.toggle('chosen', chosen.has(el._card)));
        preview.innerHTML = '';
        if (o.showUpgrade && chosen.size === 1) {
          const c = [...chosen][0];
          preview.append(this.cardEl(c), h('span', { class: 'arrow' }, '→'), this.cardEl(Object.assign({}, c, { up: true }), { diff: true }));
        }
      };
      for (const c of sortDeck(cards)) {
        const el = this.cardEl(c);
        el._card = c;
        el.classList.add('pickable');
        el.addEventListener('click', () => {
          if (chosen.has(c)) chosen.delete(c);
          else { if (o.max === 1) chosen.clear(); if (chosen.size < o.max) chosen.add(c); }
          update();
        });
        grid.append(el);
      }
      const body = h('div', { class: 'picker' },
        h('h3', null, o.title),
        grid,
        preview,
        h('div', { class: 'picker-foot' }, count,
          o.cancel ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); res(null); } }, '取消') : null,
          o.skipText ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); res([]); } }, o.skipText) : null,
          btn));
      close = this.modal(body, { cls: 'wide', dismiss: !!o.cancel, onDismiss: () => res(null) });
      update();
    });
  },
  chooseSigil(keys, title) {
    return new Promise(res => {
      let close;
      const body = h('div', { class: 'picker narrow-picker' }, h('h3', null, title),
        h('div', { class: 'sigil-choice' }, keys.map(k => h('button', { class: 'sigil-opt', type: 'button', onclick: () => { close(); res(k); } },
          h('span', { class: 'big-seal' }, SIGILS[k].glyph), h('b', null, SIGILS[k].name), h('small', null, SIGILS[k].desc)))),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); res(null); } }, '取消'));
      close = this.modal(body, { dismiss: true, onDismiss: () => res(null) });
    });
  },
  chooseCharm(ids, title) {
    return new Promise(res => {
      let close;
      const body = h('div', { class: 'picker narrow-picker' }, h('h3', null, title),
        h('div', { class: 'charm-choice' }, ids.map(id => {
          const d = CHARMS[id];
          return h('button', { class: 'charm-opt', type: 'button', onclick: () => { close(); res(id); } },
            h('span', { class: `big-seal r-${d.r}` }, d.glyph), h('b', null, d.name), h('small', null, d.desc));
        })),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); res(null); } }, '都不要'));
      close = this.modal(body, {});
    });
  },
  replaceCharm(run, newId) {
    return new Promise(res => {
      let close;
      const nd = CHARMS[newId];
      const body = h('div', { class: 'picker narrow-picker' },
        h('h3', null, '護符欄位已滿'),
        h('p', null, `想拿「${nd.name}」（${nd.desc}），就得賣掉一個現有的護符：`),
        h('div', { class: 'charm-choice' }, run.charms.map((c, i) => {
          const d = CHARMS[c.id];
          return h('button', { class: 'charm-opt', type: 'button', onclick: () => { close(); res(i); } },
            h('span', { class: `big-seal r-${d.r}` }, d.glyph), h('b', null, d.name), h('small', null, d.desc), h('em', null, `出售 +${sellValue(c.id)} 金`));
        })),
        h('button', { class: 'btn ghost', type: 'button', onclick: () => { close(); res(null); } }, `放棄「${nd.name}」`));
      close = this.modal(body, {});
    });
  },
  showDeck() {
    const run = Game.run;
    const body = h('div', { class: 'picker' },
      h('h3', null, `牌組（${run.deck.length}）`),
      h('div', { class: 'deck-grid' }, sortDeck(run.deck).map(c => this.cardEl(c))),
      h('div', { class: 'picker-foot' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, '關閉')));
    const close = this.modal(body, { dismiss: true, cls: 'wide' });
  },
  showPile(title, cards, shuffled) {
    const list = shuffled ? sortDeck(cards) : cards.slice().reverse();
    const body = h('div', { class: 'picker' },
      h('h3', null, `${title}（${cards.length}）`),
      cards.length ? h('div', { class: 'deck-grid' }, list.map(c => this.cardEl(c, { C: Game.combat }))) : h('p', { class: 'dim' }, '空的。'),
      h('div', { class: 'picker-foot' }, h('button', { class: 'btn', type: 'button', onclick: () => close() }, '關閉')));
    const close = this.modal(body, { dismiss: true, cls: 'wide' });
  },

  rules() {
    const sec = (t, ...ps) => h('section', null, h('h4', null, t), ...ps.map(p => h('p', null, p)));
    const body = h('div', { class: 'doc' },
      h('h3', null, '玩法說明'),
      sec('目標', '穿越三幕、每幕約十層的地圖，擊敗第三幕首領「燼符之主」。路線自己選：戰鬥、菁英、奇遇、商店、營火、寶箱與祭壇。'),
      sec('三道戰場', '戰場分為左、中、右三道。每道最上方是敵人，中間是友軍，最下方是你可以站立的位置。你同一時間只站在一道上。',
        '與敵人同道（正對）時，你對它的攻擊倍率 +0.5。但同道也最容易挨打。'),
      sec('敵人意圖', '敵人頭上會顯示下一步要做什麼，攻擊還會標明目標：',
        '瞄準：鎖定宣告時你站的道，移開就落空。正面：打它自己那一道。橫掃：三道全中。追蹤：你在哪就打哪。',
        '每條道中間會顯示「來襲」數字。站在有友軍的道上，友軍會替你挨打。'),
      sec('步', '每回合有 1 步免費移動（點英雄兩側箭頭、點相鄰的道，或按 A／D）。部分卡牌與護符給你更多步。'),
      sec('出牌', '每回合 3 能量、抽 5 張。點牌即可打出；需要目標的牌會先選中，再點目標。滑鼠移到攻擊牌上，敵人身上會預覽實際傷害與計算過程。',
        '重整：每場戰鬥 2 次，棄掉任意張手牌再抽回同樣數量。沒用完的重整，戰後每次換 1 金。'),
      sec('傷害公式', '（基礎傷害 + 加值）× 倍率。力量、磨刀石等是加值；正對、面具等是倍率。護符由左到右結算，順序會影響結果。易傷 ×1.5、虛弱 ×0.75 最後結算。'),
      sec('友軍與骨', '友軍牌把單位召喚到一條空道。你的回合結束時，友軍攻擊同道敵人。友軍死亡或被犧牲時，你獲得骨，用來支付骨費卡牌。'),
      sec('共鳴', '同一回合打出 3 張同派系的牌，觸發該派系的共鳴效果（每回合一次）。主副派系的牌混得越好，共鳴越常觸發。'),
      sec('印記', '印記是刻在卡牌上的額外能力，每張牌最多 2 個。祭壇可以刻印，也能把一張牌的印記轉印到另一張牌上。'),
      sec('經濟', '戰後依持有金幣獲得利息（每 10 金 +1，上限 5）。護符欄位有限，可以隨時出售換錢、調整順序。'),
      sec('燭火', '你有 1 根燭火。戰敗時燭火熄滅，以 50% 生命重新挑戰同一場戰鬥。燭火用完才會真正結束旅程。'),
      sec('快捷鍵', '1–0：選牌　1／2／3：選牌後指定左中右目標　A／D 或 ←／→：移動　E 或空白鍵：結束回合　R：重整　Esc：取消'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, '明白了'));
    const close = this.modal(body, { dismiss: true, cls: 'doc-modal' });
  },

  sources() {
    const rows = [
      ['殺戮尖塔', '分支地圖、能量與抽牌、敵人意圖、升級、遺物式被動、菁英與首領', '去除：傷害計算不透明。每張攻擊牌、每名敵人都即時預覽實際數字與計算過程。'],
      ['殺戮尖塔 2', '每幕開始的古神祝福（三選一、常有代價）、卡牌附魔', '附魔與印記合併為同一套系統，避免兩種相似機制。'],
      ['小丑牌', '加值 × 倍率的傷害公式、有序且限欄位的護符（可出售、可調順序、鏡像符複製右側）、利息經濟、商店重抽、未用重整換錢', '去除：一把定生死的純隨機。倍率只放大你的決策，不靠運氣決定勝負。'],
      ['邪惡冥刻', '把單位擺上道路替你擋刀、骨頭資源與犧牲、可轉印的印記、燭火（額外的命）', '去除：死一次就重來的挫折。燭火讓你以 50% 生命重打同一場戰鬥。'],
      ['怪物火車 2', '主副雙派系混搭卡池、英雄晉升路線、多道防守、敵人增援波次', '去除：資訊過載。每條道直接標出本回合會吃多少傷害、由誰承受。'],
      ['Cobalt Core', '站位與閃避、敵人攻擊鎖定特定的道、移動本身就是資源與攻擊手段、短局', '去除：位置不對就完全打不到人。所有攻擊都能打任何敵人，站位只決定倍率與閃避。'],
      ['整體', '每幕 10 層、三幕約 40～60 分鐘', '去除：一局過長。重整、略過獎勵也有金幣，減少空手的回合與後悔。'],
    ];
    const body = h('div', { class: 'doc' },
      h('h3', null, '設計源流'),
      h('p', { class: 'dim' }, '每款遊戲取其最好的部分，同時針對它最常被抱怨的缺點做出修正。'),
      h('div', { class: 'src-table' }, rows.map(([g, take, fix]) => h('div', { class: 'src-row' },
        h('b', null, g), h('p', null, take), h('p', { class: 'fix' }, fix)))),
      h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, '關閉'));
    const close = this.modal(body, { dismiss: true, cls: 'doc-modal' });
  },

  /* =================== 特效 =================== */
  fxTarget(key) { return document.querySelector(`.unit[data-uid="${key}"]`); },
  spawnFloat(el, text, cls, k) {
    const r = el.getBoundingClientRect();
    if (!r.width) return;
    const d = h('div', { class: 'float ' + (cls || '') }, text);
    d.style.left = (r.left + r.width / 2) + 'px';
    d.style.top = (r.top + Math.min(r.height * 0.4, 60)) + 'px';
    d.style.animationDelay = (k * 110) + 'ms';
    this.fx.append(d);
    setTimeout(() => d.remove(), 1500 + k * 110);
  },
  float(ent, text, cls) {
    this.fxCount++;
    const key = ent && ent.uid ? ent.uid : 'hero';
    const k = this._stack(key);
    const el = this.fxTarget(key);
    if (el) this.spawnFloat(el, text, cls, k);
    else requestAnimationFrame(() => { const e2 = this.fxTarget(key); if (e2) this.spawnFloat(e2, text, cls, k); });
  },
  _stack(key) {
    const now = performance.now();
    this._stk = this._stk || {};
    const s = this._stk[key];
    if (s && now - s.t < 350) { s.n++; s.t = now; return s.n; }
    this._stk[key] = { n: 0, t: now };
    return 0;
  },
  floatLane(L, text, cls, row) {
    this.fxCount++;
    const el = this.cEls && this.cEls.lanes[L] && this.cEls.lanes[L].querySelector(row === 'ally' ? '.r-ally' : '.r-threat');
    if (el) this.spawnFloat(el, text, cls, this._stack('lane' + L));
  },
  hitFx(e, amt, dmg, blocked, o) {
    this.fxCount++;
    const el = this.fxTarget(e.uid);
    const k = this._stack(e.uid);
    if (el) {
      let label = dmg > 0 ? `-${dmg}` : blocked ? '格擋' : '0';
      const cls = 'dmg' + (o.src === 'hero' ? ' big' : '') + (o.calc && o.calc.crit ? ' crit' : '') + (o.src === 'burn' ? ' burn' : '');
      this.spawnFloat(el, label, cls, k);
      if (o.calc && o.calc.parts.length) {
        const x = o.calc;
        const m = Math.round(x.mult * 100) / 100;
        this.spawnFloat(el, `(${x.base}${x.add ? (x.add > 0 ? '+' : '') + x.add : ''})${m !== 1 ? '×' + m : ''}${e.st.shock ? '+' + e.st.shock : ''}`, 'calc', k);
      }
      this.shake(e.uid);
    }
  },
  heroHit(d, loss, blocked) {
    this.fxCount++;
    const el = this.fxTarget('hero');
    if (el) this.spawnFloat(el, loss > 0 ? `-${loss}` : '格擋', loss > 0 ? 'dmg hero-dmg' : 'block', this._stack('hero'));
    this.shake('hero');
    if (loss > 0 && this.cEls) { const r = this.cEls.root; r.classList.remove('hurt'); void r.offsetWidth; r.classList.add('hurt'); }
  },
  shake(key) {
    const el = this.unitEls.get(key);
    if (!el) return;
    el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake');
  },
  lunge(key, dir) {
    const el = this.unitEls.get(key);
    if (!el) return;
    const c = dir > 0 ? 'lunge-down' : 'lunge-up';
    el.classList.remove(c); void el.offsetWidth; el.classList.add(c);
    setTimeout(() => el.classList.remove(c), 450);
  },
  banner(text, f) {
    this.fxCount++;
    const b = h('div', { class: `banner f-${f || 'neutral'}` }, text);
    this.fx.append(b);
    setTimeout(() => b.remove(), 1400);
  },
  pulseCharm(inst) {
    const el = $$('.hud-charms .charm').find(x => x._charm === inst);
    if (!el) return;
    const r = el.getBoundingClientRect();
    const ring = h('div', { class: 'pulse' });
    Object.assign(ring.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    this.fx.append(ring);
    setTimeout(() => ring.remove(), 700);
  },
  ghost(cardEl) {
    const r = cardEl.getBoundingClientRect();
    const g = cardEl.cloneNode(true);
    g.classList.add('ghost');
    Object.assign(g.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' });
    this.fx.append(g);
    setTimeout(() => g.remove(), 520);
  },
  candleOut() {
    return new Promise(res => {
      const ov = h('div', { class: 'candle-out' }, h('div', { class: 'logo-seal' }, '燭'), h('h2', null, '燭火熄滅'), h('p', null, '你以 50% 生命重新挑戰這場戰鬥。'));
      this.fx.append(ov);
      setTimeout(() => { ov.remove(); res(); }, 2200 * (Settings.speed || 1));
    });
  },
  toast(text) {
    const t = h('div', { class: 'toast-msg' }, text);
    this.toastEl.append(t);
    setTimeout(() => t.classList.add('out'), 1800);
    setTimeout(() => t.remove(), 2300);
  },

  /* =================== 提示框 =================== */
  initTips() {
    let cur = null, pressT = null;
    const show = el => {
      let tip = el._tip !== undefined ? el._tip : el.getAttribute('data-tip');
      if (typeof tip === 'function') tip = tip();
      if (!tip) return this.closeTip();
      this.tipEl.innerHTML = el._tip !== undefined ? tip : esc(tip).replace(/\n/g, '<br>');
      this.tipEl.hidden = false;
      const r = el.getBoundingClientRect();
      const tw = this.tipEl.offsetWidth, th = this.tipEl.offsetHeight;
      const vw = window.innerWidth, vh = window.innerHeight;
      let x, y;
      if (el.classList.contains('card') && el.closest('.hand')) {
        x = r.right + 8; y = r.top;
        if (x + tw > vw - 8) x = r.left - tw - 8;
      } else {
        x = r.left + r.width / 2 - tw / 2;
        y = r.top - th - 8;
        if (y < 8) y = r.bottom + 8;
      }
      x = clamp(x, 8, vw - tw - 8); y = clamp(y, 8, vh - th - 8);
      this.tipEl.style.left = x + 'px'; this.tipEl.style.top = y + 'px';
    };
    document.addEventListener('pointerover', e => {
      if (e.pointerType === 'touch') return;
      const el = e.target.closest('[data-tip], .has-tip');
      if (el === cur) return;
      cur = el;
      if (!el) return this.closeTip();
      show(el);
    });
    document.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') { this.closeTip(); cur = null; return; }
      const el = e.target.closest('[data-tip], .has-tip');
      clearTimeout(pressT);
      this.closeTip();
      if (el) pressT = setTimeout(() => show(el), 380);
    });
    document.addEventListener('pointerup', () => clearTimeout(pressT));
    document.addEventListener('scroll', () => this.closeTip(), true);
  },
  closeTip() { if (this.tipEl) this.tipEl.hidden = true; },

  /* =================== 鍵盤 =================== */
  initKeys() {
    document.addEventListener('keydown', e => {
      if (e.target.closest && e.target.closest('input, textarea')) return;
      const openModal = this.modalEl && !this.modalEl.hidden ? this.modalEl.lastElementChild : null;
      if (e.key === 'Escape') {
        if (openModal && openModal._close) { openModal._close(); return; }
        if (Game.combat) this.cancelSel();
        return;
      }
      if (openModal) return;
      const C = Game.combat;
      if (!C || C.over) return;
      const k = e.key.toLowerCase();
      if (this.sel && this.sel.kind === 'card' && ['1', '2', '3'].includes(k)) {
        const L = +k - 1;
        const tg = cardDef(this.sel.c).tg;
        if (tg === 'enemy' && C.enemies[L]) return this.onTarget('enemy', C.enemies[L]);
        if (tg === 'lane') return this.onTarget('lane', L);
        if (tg === 'ally' && C.allies[L]) return this.onTarget('ally', C.allies[L]);
        if (tg === 'heroLane') return this.onTarget('heroLane', L);
        return;
      }
      if (this.sel && this.sel.kind === 'cons' && ['1', '2', '3'].includes(k)) {
        const L = +k - 1;
        if (this.sel.tg === 'enemy' && C.enemies[L]) return this.onTarget('enemy', C.enemies[L]);
        if (this.sel.tg === 'lane') return this.onTarget('lane', L);
        return;
      }
      if (/^[0-9]$/.test(k)) {
        const i = k === '0' ? 9 : +k - 1;
        const c = C.hand[i];
        if (c) this.onCardClick(c, this.cEls.hand.children[i]);
        return;
      }
      if (k === 'a' || e.key === 'ArrowLeft') { C.move(-1); return; }
      if (k === 'd' || e.key === 'ArrowRight') { C.move(1); return; }
      if (k === 'e' || k === ' ') { e.preventDefault(); this.endTurn(); return; }
      if (k === 'r') {
        if (this.redrawMode) { if (this.marked.size) this.confirmRedraw(); else this.cancelSel(); }
        else if (C.redraws > 0 && C.phase === 'player') { this.redrawMode = true; this.sel = null; this.renderCombat(); }
      }
    });
  },
};

function sortDeck(cards) {
  const order = { atk: 0, skl: 1, unit: 2, pow: 3, status: 4, curse: 5 };
  const rar = { B: 0, C: 1, U: 2, R: 3, X: 4 };
  return cards.slice().sort((a, b) => {
    const A = cardDef(a), B = cardDef(b);
    return (order[A.t] - order[B.t]) || (rar[A.r] - rar[B.r]) || A.name.localeCompare(B.name, 'zh-Hant') || (b.up - a.up);
  });
}
