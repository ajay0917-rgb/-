'use strict';
/* =========================================================
   護符（有序、限欄位、可出售）、能力、英雄晉升、消耗品
   掛鉤：onCombatStart onTurnStart onTurnEnd onCardPlayed onMove onEnemyDeath
         onAllyDeath onHpLoss onBlockGain onAttackHit modAtk modAllyAtk modSummon
         onSummon onApply(回傳新層數) onApplied onMiss onResonance onCombatEnd
   跑圖層級：onPickup(run) onShopEnter(run)；被動數值放在 stat
   ========================================================= */
const CHARMS = {};
function defCharm(c) { CHARMS[c.id] = Object.assign({ r: 'C' }, c); }

/* ---------- 起始 ---------- */
defCharm({ id: 'ember_stone', r: 'S', name: '赤燼石', glyph: '燼', desc: '每場戰鬥你的第一次攻擊額外施加 4 灼燒。',
  onCombatStart(C, s) { s.used = false; },
  onAttackHit(C, s, t) { if (!s.used && t.hp > 0) { s.used = true; C.apply(t, 'burn', 4); } },
  noCopy: ['onCombatStart', 'onAttackHit'] });
defCharm({ id: 'frost_pendant', r: 'S', name: '凝霜佩', glyph: '佩', desc: '回合開始時，保留至多 6 點格擋。', stat: { retainBlock: 6 } });
defCharm({ id: 'bone_box', r: 'S', name: '骸骨匣', glyph: '匣', desc: '戰鬥開始時獲得 1 骨，並在你所在的道召喚一名骸兵（2/4）。',
  onCombatStart(C) { C.gainBones(1); C.summon(C.hero.lane, { name: '骸兵', glyph: '骸', atk: 2, hp: 4 }); } });
defCharm({ id: 'storm_coil', r: 'S', name: '超導線圈', glyph: '圈', desc: '每當你移動，對新所在道的敵人造成 3 傷害。',
  onMove(C) { const e = C.front(); if (e) C.spell(e, 3); } });

/* ---------- 普通 ---------- */
defCharm({ id: 'whetstone', name: '磨刀石', glyph: '磨', desc: '攻擊的每段傷害 +2。',
  modAtk(C, s, x) { x.add += 2; x.parts.push('磨刀石 +2'); } });
defCharm({ id: 'iron_skin', name: '鐵膚符', glyph: '膚', desc: '戰鬥開始時獲得 10 格擋。', onCombatStart(C) { C.block(10, true); } });
defCharm({ id: 'lantern', name: '引魂燈', glyph: '燈', desc: '每場戰鬥第一回合額外獲得 1 能量。', onTurnStart(C) { if (C.turn === 1) C.gainEnergy(1); } });
defCharm({ id: 'coin_purse', name: '聚寶袋', glyph: '袋', desc: '利息上限 +3（每持有 10 金，戰後 +1 金）。', stat: { interestCap: 3 } });
defCharm({ id: 'blood_vial', name: '血玉瓶', glyph: '玉', desc: '戰鬥開始時回復 3 生命。', onCombatStart(C) { C.heal(3); } });
defCharm({ id: 'boots', name: '輕羽靴', glyph: '靴', desc: '每回合額外獲得 1 步。', stat: { freeSteps: 1 } });
defCharm({ id: 'anchor', name: '錨石', glyph: '錨', desc: '回合結束時若本回合沒有移動，獲得 6 格擋。', onTurnEnd(C) { if (C.movesThisTurn === 0) C.block(6, true); } });
defCharm({ id: 'pen', name: '硃砂筆', glyph: '筆', desc: '每打出 8 張攻擊牌，下一張攻擊牌倍率 ×2。',
  onCombatStart(C, s) { s.n = s.n || 0; },
  onCardPlayed(C, s, c, d) {
    if (d.t !== 'atk') return;
    if (s.armed) { s.armed = false; return; }
    s.n = (s.n || 0) + 1;
    if (s.n >= 8) { s.n = 0; s.armed = true; }
  },
  modAtk(C, s, x) { if (s.armed && x.card) { x.mult *= 2; x.parts.push('硃砂筆 ×2'); } },
  noCopy: ['onCardPlayed', 'onCombatStart'], counter: s => s.armed ? '就緒' : `${s.n || 0}/8` });
defCharm({ id: 'lucky_cat', name: '招財貓', glyph: '貓', desc: '擊殺敵人時獲得 4 金幣。', onEnemyDeath(C) { C.gainGold(4); } });
defCharm({ id: 'meal', name: '飯票', glyph: '飯', desc: '進入商店時回復 15 生命。', onShopEnter(run) { runHeal(run, 15); } });
defCharm({ id: 'memo', name: '備忘錄', glyph: '錄', desc: '每場戰鬥 +1 次重整。', stat: { redraws: 1 } });
defCharm({ id: 'war_drum', name: '戰鼓', glyph: '鼓', desc: '本回合每已打出 1 張牌，攻擊的每段傷害 +1。',
  modAtk(C, s, x) { if (C.played > 0) { x.add += C.played; x.parts.push(`戰鼓 +${C.played}`); } } });
defCharm({ id: 'ice_cream', name: '冰糖葫蘆', glyph: '糖', desc: '每場戰鬥第 1 回合攻擊每段 +6，之後每回合遞減 1。',
  modAtk(C, s, x) { const n = Math.max(0, 7 - C.turn); if (n) { x.add += n; x.parts.push(`糖葫蘆 +${n}`); } } });
defCharm({ id: 'bell', name: '雷鈴', glyph: '鈴', desc: '每回合第一次移動時，抽 1 張牌。', onMove(C) { if (C.movesThisTurn === 1) C.draw(1); } });
defCharm({ id: 'bone_flute', name: '骨笛', glyph: '笛', desc: '友軍攻擊 +2。', modAllyAtk(C, s, x) { x.add += 2; } });
defCharm({ id: 'banner', name: '戰旗', glyph: '旗', desc: '召喚的友軍 +3 生命。', modSummon(C, s, u) { u.hp += 3; u.maxHp += 3; } });
defCharm({ id: 'necklace', name: '翡翠項鍊', glyph: '翠', desc: '拾取時最大生命 +12。', onPickup(run) { run.maxHp += 12; run.hp += 12; } });
defCharm({ id: 'storm_stone', name: '雷擊石', glyph: '礫', desc: '你施加感電時，額外 +1 層。', onApply(C, s, t, st, n) { return st === 'shock' ? n + 1 : n; } });
defCharm({ id: 'reroll_cup', name: '骰盅', glyph: '盅', desc: '商店重抽費用 -2；每次卡牌獎勵可免費重抽 1 次。', stat: { rerollDiscount: 2, freeCardReroll: 1 } });
defCharm({ id: 'chain_mail', name: '鎖子甲', glyph: '鎖', desc: '回合結束時若沒有格擋，獲得 5 格擋。', onTurnEnd(C) { if (C.hero.block === 0) C.block(5, true); } });
defCharm({ id: 'torch', name: '火把', glyph: '把', desc: '戰鬥開始時對所有敵人施加 3 灼燒。', onCombatStart(C) { C.applyAll('burn', 3); } });
defCharm({ id: 'kite', name: '紙鳶', glyph: '鳶', desc: '敵人的單道攻擊落空時，獲得 3 格擋。', onMiss(C) { C.block(3, true); } });
defCharm({ id: 'gold_tooth', name: '金牙', glyph: '牙', desc: '每場戰鬥勝利額外獲得 8 金幣。', stat: { bonusGold: 8 } });

/* ---------- 罕見 ---------- */
defCharm({ id: 'mask', r: 'U', name: '狂熱面具', glyph: '面', desc: '攻擊倍率 +0.3。', modAtk(C, s, x) { x.mult += 0.3; x.parts.push('面具 +0.3'); } });
defCharm({ id: 'all_in', r: 'U', name: '孤注', glyph: '孤', desc: '打出手中最後一張牌時，該攻擊倍率 ×2。',
  modAtk(C, s, x) { if (x.card && x.handLeft === 0) { x.mult *= 2; x.parts.push('孤注 ×2'); } } });
defCharm({ id: 'rage_seal', r: 'U', name: '怒之印', glyph: '怒', desc: '本場戰鬥中每失去一次生命，攻擊的每段傷害 +1。',
  onCombatStart(C, s) { s.n = 0; }, onHpLoss(C, s) { s.n = (s.n || 0) + 1; },
  modAtk(C, s, x) { if (s.n) { x.add += s.n; x.parts.push(`怒之印 +${s.n}`); } },
  noCopy: ['onCombatStart', 'onHpLoss'], counter: s => s.n || 0 });
defCharm({ id: 'dice', r: 'U', name: '賭徒骰', glyph: '骰', desc: '每段攻擊有 1/4 機率倍率 ×2。',
  modAtk(C, s, x) { if (!x.preview && RNG.chance(0.25)) { x.mult *= 2; x.parts.push('賭徒骰 ×2'); x.crit = true; } } });
defCharm({ id: 'collector', r: 'U', name: '收藏癖', glyph: '藏', desc: '每持有 1 個護符，攻擊倍率 +0.1。',
  modAtk(C, s, x) { const n = C.run.charms.length; x.mult += 0.1 * n; x.parts.push(`收藏癖 +${(0.1 * n).toFixed(1)}`); } });
defCharm({ id: 'bull', r: 'U', name: '金牛', glyph: '牛', desc: '每持有 25 金幣，攻擊的每段傷害 +1。',
  modAtk(C, s, x) { const n = Math.floor(C.run.gold / 25); if (n) { x.add += n; x.parts.push(`金牛 +${n}`); } } });
defCharm({ id: 'skull_cup', r: 'U', name: '顱杯', glyph: '顱', desc: '敵人死亡時，獲得 1 能量。', onEnemyDeath(C) { C.gainEnergy(1); } });
defCharm({ id: 'fan', r: 'U', name: '旋風扇', glyph: '扇', desc: '每回合打出第 3 張攻擊牌時，對所有敵人造成 6 傷害。',
  onCardPlayed(C, s, c, d) { if (d.t === 'atk' && C.attacksThisTurn === 3) C.spellAll(6); } });
defCharm({ id: 'twin_tali', r: 'U', name: '雙生符', glyph: '雙', desc: '共鳴效果觸發兩次。', stat: { resTwice: 1 } });
defCharm({ id: 'candelabra', r: 'U', name: '燭台', glyph: '燭', desc: '拾取時獲得 1 燭火（額外一條命）。', onPickup(run) { run.candles++; } });
defCharm({ id: 'burning_eye', r: 'U', name: '灼眼', glyph: '眼', desc: '你施加灼燒時，額外 +2 層。', onApply(C, s, t, st, n) { return st === 'burn' ? n + 2 : n; } });
defCharm({ id: 'frost_crystal', r: 'U', name: '霜晶', glyph: '霜', desc: '你施加虛弱時，額外施加 1 易傷。', onApplied(C, s, t, st) { if (st === 'weak') C.apply(t, 'vuln', 1, true); } });
defCharm({ id: 'vip', r: 'U', name: '貴賓帖', glyph: '帖', desc: '商店所有商品 8 折。', stat: { shopDiscount: 0.2 } });
defCharm({ id: 'hourglass', r: 'U', name: '沙漏', glyph: '漏', desc: '每第 3 回合開始時，獲得 1 能量並抽 2 張牌。', onTurnStart(C) { if (C.turn % 3 === 0) { C.gainEnergy(1); C.draw(2); } } });
defCharm({ id: 'mirror_shard', r: 'U', name: '鏡片', glyph: '片', desc: '敵人的單道攻擊落空時，對該敵人造成 5 傷害。', onMiss(C, s, e) { if (e && e.hp > 0) C.spell(e, 5); } });
defCharm({ id: 'grave_lamp', r: 'U', name: '冥火燈', glyph: '冥', desc: '友軍死亡時，你獲得 4 格擋。', onAllyDeath(C) { C.block(4, true); } });

/* ---------- 稀有 ---------- */
defCharm({ id: 'res_stone', r: 'R', name: '共鳴石', glyph: '鳴', desc: '共鳴只需 2 張同派系的牌即可觸發。', stat: { resonance: -1 } });
defCharm({ id: 'blueprint', r: 'R', name: '鏡像符', glyph: '鏡', desc: '複製右側相鄰護符的能力（排列順序很重要）。' });
defCharm({ id: 'phoenix_feather', r: 'R', name: '鳳羽', glyph: '羽', desc: '每場戰鬥第一次受到致命傷害時，改為回復至 30% 生命。',
  onCombatStart(C, s) { s.used = false; }, noCopy: ['onCombatStart'] });
defCharm({ id: 'dragon_pearl', r: 'R', name: '龍珠', glyph: '珠', desc: '攻擊倍率 ×1.5，但每回合少抽 1 張牌。',
  modAtk(C, s, x) { x.mult *= 1.5; x.parts.push('龍珠 ×1.5'); }, stat: { drawN: -1 } });
defCharm({ id: 'pinwheel', r: 'R', name: '風車', glyph: '車', desc: '每回合打出的第一張牌費用為 0。', stat: { firstFree: 1 } });
defCharm({ id: 'crown_ember', r: 'R', name: '燼冠', glyph: '冠', desc: '敵人死亡時，將其身上的灼燒轉移給隨機敵人。',
  onEnemyDeath(C, s, e) { const n = e.st.burn || 0; const t = C.randEnemy(); if (n && t) C.apply(t, 'burn', n, true); } });

/* ---------- 首領（強力但有代價）---------- */
defCharm({ id: 'energy_crystal', r: 'B', name: '聚能水晶', glyph: '能', desc: '+1 能量。戰鬥開始時將 2 張眩暈洗入抽牌堆。',
  stat: { energy: 1 }, onCombatStart(C) { C.addCard('dazed', 'draw', 2); } });
defCharm({ id: 'dark_lamp', r: 'B', name: '幽燈', glyph: '幽', desc: '+1 能量。營火無法休息回復。', stat: { energy: 1, noRest: 1 } });
defCharm({ id: 'black_pact', r: 'B', name: '黑契', glyph: '契', desc: '+1 能量。卡牌獎勵只剩 2 選 1。', stat: { energy: 1, rewardChoices: -1 } });
defCharm({ id: 'blood_moon', r: 'B', name: '血月', glyph: '月', desc: '+1 能量。拾取時最大生命 -12。',
  stat: { energy: 1 }, onPickup(run) { run.maxHp = Math.max(1, run.maxHp - 12); run.hp = Math.min(run.hp, run.maxHp); } });
defCharm({ id: 'tali_box', r: 'B', name: '百寶符匣', glyph: '箱', desc: '護符欄位 +1，消耗品欄位 +1。', stat: { charmSlots: 1, consSlots: 1 } });
defCharm({ id: 'sky_scale', r: 'B', name: '天衡', glyph: '衡', desc: '每回合多抽 1 張牌，每場戰鬥 +1 次重整。', stat: { drawN: 1, redraws: 1 } });

const CHARM_PRICE = { C: 110, U: 160, R: 220, B: 300, S: 100 };

/* =========================================================
   能力（由能力牌產生，戰鬥內有效）
   ========================================================= */
const POWERS = {
  twin: { name: '雙符共鳴', glyph: '雙', desc: n => `每回合前 ${n} 張攻擊牌觸發兩次。` },
  wildfire: { name: '野火', glyph: '野', desc: n => `回合結束時，對所有敵人施加 ${n} 灼燒。`, onTurnEnd(C, s) { C.applyAll('burn', s.n); } },
  phoenix: { name: '鳳翼', glyph: '鳳', desc: n => `敵人死亡時，對所有敵人施加 ${n} 灼燒並抽 1 張牌。`, onEnemyDeath(C, s) { C.applyAll('burn', s.n); C.draw(1); } },
  barricade: { name: '永凍', glyph: '永', desc: () => '格擋不會在回合開始時消失。' },
  frostHeart: { name: '寒霜之心', glyph: '心', desc: n => `回合結束時，獲得 ${n} 格擋。`, onTurnEnd(C, s) { C.block(s.n); } },
  juggernaut: { name: '冰封王座', glyph: '座', desc: n => `獲得格擋時，對隨機敵人造成 ${n} 傷害。`, onBlockGain(C, s) { const e = C.randEnemy(); if (e) C.spell(e, s.n); } },
  legion: { name: '亡者軍團', glyph: '軍', desc: n => `回合開始時，在空道召喚 ${n} 名骸兵（2/3）。`,
    onTurnStart(C, s) { for (let i = 0; i < s.n; i++) { const l = C.emptyAllyLane(); if (l != null) C.summon(l, { name: '骸兵', glyph: '骸', atk: 2, hp: 3 }); } } },
  soulFire: { name: '魂火', glyph: '魂', desc: n => `友軍死亡時，對隨機敵人造成 ${n} 傷害。`, onAllyDeath(C, s) { const e = C.randEnemy(); if (e) C.spell(e, s.n); } },
  rod: { name: '引雷針', glyph: '針', desc: n => `移動時，對正前方敵人造成 ${n} 傷害。`, onMove(C, s) { const e = C.front(); if (e) C.spell(e, s.n); } },
  kinetic: { name: '動能裝甲', glyph: '動', desc: n => `移動時，獲得 ${n} 格擋。`, onMove(C, s) { C.block(s.n); } },
  core: { name: '雷樞核心', glyph: '核', desc: n => `回合開始時，獲得 ${n} 能量。`, onTurnStart(C, s) { C.gainEnergy(s.n); } },
  loop: { name: '共振迴路', glyph: '振', desc: n => `每回合打出第 ${n} 張牌時，抽 2 張牌並獲得 1 步。`, onCardPlayed(C, s) { if (C.played === s.n) { C.draw(2); C.gainSteps(1); } } },
};

/* =========================================================
   英雄晉升路線（每個首領後選擇／進階）
   ========================================================= */
const PERK_PATHS = {
  flame: [
    { id: 'f_saint', name: '劍聖', tiers: ['f_saint1', 'f_saint2'] },
    { id: 'f_sky', name: '焚天', tiers: ['f_sky1', 'f_sky2'] },
  ],
  frost: [
    { id: 'i_wall', name: '冰壁', tiers: ['i_wall1', 'i_wall2'] },
    { id: 'i_soul', name: '冰魄', tiers: ['i_soul1', 'i_soul2'] },
  ],
  bone: [
    { id: 'b_lich', name: '屍王', tiers: ['b_lich1', 'b_lich2'] },
    { id: 'b_reap', name: '冥使', tiers: ['b_reap1', 'b_reap2'] },
  ],
  storm: [
    { id: 's_blitz', name: '疾雷', tiers: ['s_blitz1', 's_blitz2'] },
    { id: 's_eng', name: '機樞', tiers: ['s_eng1', 's_eng2'] },
  ],
};
const PERKS = {
  f_saint1: { name: '劍聖・一', desc: '攻擊的每段傷害 +2。', modAtk(C, s, x) { x.add += 2; x.parts.push('劍聖 +2'); } },
  f_saint2: { name: '劍聖・二', desc: '每回合第一張攻擊牌觸發兩次。', stat: { twin: 1 } },
  f_sky1: { name: '焚天・一', desc: '你施加灼燒時，額外 +1 層。', onApply(C, s, t, st, n) { return st === 'burn' ? n + 1 : n; } },
  f_sky2: { name: '焚天・二', desc: '回合結束時，對所有敵人施加 3 灼燒。', onTurnEnd(C) { C.applyAll('burn', 3); } },
  i_wall1: { name: '冰壁・一', desc: '戰鬥開始時獲得 12 格擋。', onCombatStart(C) { C.block(12, true); } },
  i_wall2: { name: '冰壁・二', desc: '回合開始時額外保留至多 15 點格擋。', stat: { retainBlock: 15 } },
  i_soul1: { name: '冰魄・一', desc: '每回合第一張技能牌，對所有敵人施加 1 虛弱。', onCardPlayed(C, s, c, d) { if (d.t === 'skl' && C.skillsThisTurn === 1) C.applyAll('weak', 1); } },
  i_soul2: { name: '冰魄・二', desc: '戰鬥開始時冰凍所有非首領敵人。', onCombatStart(C) { for (const e of C.alive()) if (!e.boss) C.apply(e, 'freeze', 1); } },
  b_lich1: { name: '屍王・一', desc: '友軍攻擊 +2。', modAllyAtk(C, s, x) { x.add += 2; } },
  b_lich2: { name: '屍王・二', desc: '召喚的友軍 +4 生命；每次召喚獲得 1 骨。', modSummon(C, s, u) { u.hp += 4; u.maxHp += 4; }, onSummon(C) { C.gainBones(1); } },
  b_reap1: { name: '冥使・一', desc: '友軍死亡時，抽 1 張牌。', onAllyDeath(C) { C.draw(1); } },
  b_reap2: { name: '冥使・二', desc: '回合開始時獲得 1 骨；骨費卡牌少付 1 骨。', onTurnStart(C) { C.gainBones(1); }, stat: { bcostDisc: 1 } },
  s_blitz1: { name: '疾雷・一', desc: '每回合額外獲得 1 步。', stat: { freeSteps: 1 } },
  s_blitz2: { name: '疾雷・二', desc: '每回合第一次移動時，獲得 1 能量。', onMove(C) { if (C.movesThisTurn === 1) C.gainEnergy(1); } },
  s_eng1: { name: '機樞・一', desc: '召喚的友軍 +2 攻擊、+2 生命。', modSummon(C, s, u) { u.atk += 2; u.hp += 2; u.maxHp += 2; } },
  s_eng2: { name: '機樞・二', desc: '每回合多抽 1 張牌。', stat: { drawN: 1 } },
};

/* =========================================================
   消耗品（戰鬥藥水 + 跑圖用的符）
   when: combat 戰鬥中 / map 戰鬥外 / any 皆可
   ========================================================= */
const CONSUMABLES = {
  heal_pot:   { name: '回春丹', glyph: '春', when: 'any', price: 45, desc: '回復 20 生命。',
    use(ctx) { if (ctx.C) ctx.C.heal(20); else runHeal(ctx.run, 20); } },
  fire_pot:   { name: '火焰瓶', glyph: '炎', when: 'combat', price: 45, desc: '對所有敵人造成 12 傷害。', use(ctx) { ctx.C.spellAll(12); } },
  iron_pot:   { name: '鐵皮藥', glyph: '鐵', when: 'combat', price: 40, desc: '獲得 14 格擋。', use(ctx) { ctx.C.block(14, true); } },
  str_pot:    { name: '力量藥', glyph: '力', when: 'combat', price: 50, desc: '獲得 2 力量。', use(ctx) { ctx.C.self('str', 2); } },
  energy_pot: { name: '精力藥', glyph: '精', when: 'combat', price: 50, desc: '獲得 2 能量。', use(ctx) { ctx.C.gainEnergy(2); } },
  swift_pot:  { name: '迅捷藥', glyph: '迅', when: 'combat', price: 45, desc: '抽 3 張牌，獲得 1 步。', use(ctx) { ctx.C.draw(3); ctx.C.gainSteps(1); } },
  frost_pot:  { name: '冰封瓶', glyph: '冰', when: 'combat', tg: 'enemy', price: 50, desc: '冰凍一名敵人，並施加 2 易傷。',
    use(ctx) { ctx.C.apply(ctx.t, 'freeze', 1); ctx.C.apply(ctx.t, 'vuln', 2); } },
  golem_pot:  { name: '泥偶符', glyph: '泥', when: 'combat', tg: 'lane', price: 45, desc: '在一條空道召喚泥偶（4/8）。',
    use(ctx) { ctx.C.summon(ctx.t, { name: '泥偶', glyph: '泥', atk: 4, hp: 8 }); } },
  inscribe:   { name: '刻印符', glyph: '刻', when: 'map', price: 60, desc: '為牌組中一張牌刻上一個隨機印記。', async use(ctx) { return await Flow.inscribeRandom(ctx.run); } },
  temper:     { name: '淬煉符', glyph: '淬', when: 'map', price: 50, desc: '隨機升級牌組中 2 張牌。', use(ctx) { upgradeRandom(ctx.run, 2); } },
  purge:      { name: '淨化符', glyph: '淨', when: 'map', price: 60, desc: '從牌組移除一張牌。', async use(ctx) { return await Flow.removeCard(ctx.run, '淨化符：移除一張牌'); } },
  midas:      { name: '點金符', glyph: '點', when: 'any', price: 30, desc: '金幣翻倍（最多 +40）。', use(ctx) { gainGold(ctx.run, Math.min(40, ctx.run.gold)); } },
  copy:       { name: '複寫符', glyph: '複', when: 'map', price: 60, desc: '複製牌組中的一張牌。', async use(ctx) { return await Flow.duplicateCard(ctx.run); } },
};
