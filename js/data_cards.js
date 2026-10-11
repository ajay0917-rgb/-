'use strict';
/* =========================================================
   卡牌資料
   t: atk 攻擊 / skl 技能 / pow 能力 / unit 友軍 / status 狀態 / curse 詛咒
   r: B 基礎 / C 普通 / U 罕見 / R 稀有 / X 特殊
   tg: enemy 任選敵人 / front 正前方 / all 全體 / none 無 / lane 空道 / ally 友軍 / heroLane 任一道
   文字中的佔位：d* 為攻擊傷害（套用修正）、b* 為格擋（套用敏捷）、其他為原值
   ========================================================= */
const CARDS = {};
function defCard(c) {
  CARDS[c.id] = Object.assign({ f: 'neutral', r: 'C', cost: 1, tg: 'none', v: {}, up: {} }, c);
}
const cardDef = c => CARDS[typeof c === 'string' ? c : c.id];
const hasSig = (c, s) => !!(c && c.sig && c.sig.includes(s));

function cardVals(c) {
  const d = cardDef(c);
  const v = Object.assign({}, d.v);
  if (d.unit) v.unit = Object.assign({}, d.unit, { kw: Object.assign({}, d.unit.kw || {}) });
  if (c.up && d.up) {
    for (const k in d.up) {
      if (k === 'cost' || k === 'bcost') continue;
      if (k === 'unit') v.unit = Object.assign({}, d.up.unit, { kw: Object.assign({}, d.up.unit.kw || {}) });
      else v[k] = d.up[k];
    }
  }
  return v;
}
function baseCost(c) {
  const d = cardDef(c);
  if (c.up && d.up && d.up.cost != null) return d.up.cost;
  return d.cost;
}
function baseBoneCost(c) {
  const d = cardDef(c);
  if (c.up && d.up && d.up.bcost != null) return d.up.bcost;
  return d.bcost || 0;
}
function newCard(id, up = false, sig = []) { return { uid: uid(), id, up, sig: sig.slice() }; }
function canUpgrade(c) { const d = cardDef(c); return !c.up && d.t !== 'status' && d.t !== 'curse'; }

const UNIT_KW = {
  burn: n => `攻擊時施加 ${n} 灼燒`,
  weak: n => `攻擊時施加 ${n} 虛弱`,
  shock: n => `攻擊時施加 ${n} 感電`,
  pierce: () => '攻擊無視格擋',
  sweep: () => '攻擊所有敵人',
  bone: n => `死亡時額外獲得 ${n} 骨`,
  thorns: n => `被攻擊時反擊 ${n}`,
};
const unitText = u => [`召喚「${u.name}」（${u.atk}/${u.hp}）。`, ...Object.entries(u.kw || {}).map(([k, n]) => UNIT_KW[k](n) + '。')].join('');

/* ---------------- 無屬 ---------------- */
defCard({ id: 'strike', name: '打擊', glyph: '擊', t: 'atk', r: 'B', cost: 1, tg: 'enemy', v: { d: 6 }, up: { d: 9 },
  text: '造成 {d} 傷害。', play(C, t, v) { C.hit(t, v.d); } });
defCard({ id: 'defend', name: '防禦', glyph: '禦', t: 'skl', r: 'B', cost: 1, v: { b: 5 }, up: { b: 8 },
  text: '獲得 {b} 格擋。', play(C, t, v) { C.block(v.b); } });
defCard({ id: 'dash_slash', name: '疾步斬', glyph: '斬', t: 'atk', cost: 1, tg: 'enemy', v: { d: 7 }, up: { d: 10 },
  text: '造成 {d} 傷害。獲得 1 步。', play(C, t, v) { C.hit(t, v.d); C.gainSteps(1); } });
defCard({ id: 'stance', name: '架勢', glyph: '架', t: 'skl', cost: 1, v: { b: 7 }, up: { b: 10 },
  text: '獲得 {b} 格擋。下回合多抽 1 張牌。', play(C, t, v) { C.block(v.b); C.self('drawNext', 1); } });
defCard({ id: 'focus', name: '凝神', glyph: '凝', t: 'skl', r: 'U', cost: 0, exhaust: true, v: { n: 2 }, up: { n: 3 },
  text: '抽 {n} 張牌。消耗。', play(C, t, v) { C.draw(v.n); } });
defCard({ id: 'whirl', name: '萬象斬', glyph: '萬', t: 'atk', r: 'U', cost: 2, tg: 'all', v: { d: 8 }, up: { d: 11 },
  text: '對所有敵人造成 {d} 傷害。', play(C, t, v) { C.hitAll(v.d); } });
defCard({ id: 'twin_soul', name: '雙符共鳴', glyph: '雙', t: 'pow', r: 'R', cost: 3, up: { cost: 2 },
  text: '每回合打出的第一張攻擊牌觸發兩次。', play(C) { C.power('twin', 1); } });
defCard({ id: 'alchemy', name: '煉丹', glyph: '丹', t: 'skl', r: 'U', cost: 1, up: { cost: 0 }, exhaust: true,
  text: '獲得 1 個隨機消耗品。消耗。', play(C) { C.gainConsumable(); } });
defCard({ id: 'opening', name: '破綻', glyph: '破', t: 'skl', cost: 1, tg: 'enemy', v: { n: 2 }, up: { n: 3 },
  text: '施加 {n} 易傷。抽 1 張牌。', play(C, t, v) { C.apply(t, 'vuln', v.n); C.draw(1); } });
defCard({ id: 'coin_strike', name: '金錢攻勢', glyph: '錢', t: 'atk', r: 'U', cost: 1, tg: 'enemy', v: { d: 8 }, up: { d: 12 },
  text: '造成 {d} 傷害。若擊殺目標，獲得 12 金幣。', play(C, t, v) { C.hit(t, v.d); if (t.hp <= 0) C.gainGold(12); } });
defCard({ id: 'retreat', name: '戰術轉進', glyph: '轉', t: 'skl', cost: 0, v: { s: 2, b: 0 }, up: { s: 2, b: 4 },
  text: '獲得 {s} 步。', tu: '獲得 {s} 步與 {b} 格擋。', play(C, t, v) { C.gainSteps(v.s); if (v.b) C.block(v.b); } });
defCard({ id: 'golem', name: '石魔像', glyph: '石', t: 'unit', r: 'U', cost: 2, tg: 'lane',
  unit: { name: '石魔像', glyph: '石', atk: 4, hp: 10 }, up: { unit: { name: '石魔像', glyph: '石', atk: 5, hp: 15 } },
  play(C, t, v) { C.summon(t, v.unit); } });

/* ---------------- 赤焰 ---------------- */
defCard({ id: 'flame_start', f: 'flame', name: '燎原', glyph: '燎', t: 'atk', r: 'B', cost: 1, tg: 'enemy', v: { d: 5, n: 3 }, up: { d: 7, n: 4 },
  text: '造成 {d} 傷害，施加 {n} 灼燒。', play(C, t, v) { C.hit(t, v.d); C.apply(t, 'burn', v.n); } });
defCard({ id: 'flame_lash', f: 'flame', name: '火舌', glyph: '舌', t: 'atk', cost: 1, tg: 'enemy', v: { d: 4 }, up: { d: 6 },
  text: '造成 {d} 傷害 2 次。', hits: () => 2, play(C, t, v) { C.hit(t, v.d, { hits: 2 }); } });
defCard({ id: 'ignite', f: 'flame', name: '焚身', glyph: '焚', t: 'skl', cost: 1, tg: 'enemy', v: { n: 6 }, up: { n: 9 },
  text: '施加 {n} 灼燒。', play(C, t, v) { C.apply(t, 'burn', v.n); } });
defCard({ id: 'firebomb', f: 'flame', name: '炎爆', glyph: '爆', t: 'atk', cost: 2, tg: 'all', v: { d: 6, n: 2 }, up: { d: 8, n: 3 },
  text: '對所有敵人造成 {d} 傷害並施加 {n} 灼燒。', play(C, t, v) { C.hitAll(v.d); C.applyAll('burn', v.n); } });
defCard({ id: 'blaze_blade', f: 'flame', name: '熾劍', glyph: '熾', t: 'atk', cost: 2, tg: 'front', v: { d: 16 }, up: { d: 22 },
  text: '對正前方敵人造成 {d} 傷害。', play(C, t, v) { C.hit(t, v.d); } });
defCard({ id: 'inflame', f: 'flame', name: '鼓焰', glyph: '鼓', t: 'pow', r: 'U', cost: 1, v: { n: 2 }, up: { n: 3 },
  text: '獲得 {n} 力量。', play(C, t, v) { C.self('str', v.n); } });
defCard({ id: 'bloodburn', f: 'flame', name: '燃血', glyph: '燃', t: 'skl', r: 'U', cost: 0, v: { n: 3 }, up: { n: 1 },
  text: '失去 {n} 生命，獲得 2 能量。', play(C, t, v) { C.loseHp(v.n); C.gainEnergy(2); } });
defCard({ id: 'wildfire', f: 'flame', name: '野火', glyph: '野', t: 'pow', r: 'U', cost: 2, v: { n: 2 }, up: { n: 3 },
  text: '回合結束時，對所有敵人施加 {n} 灼燒。', play(C, t, v) { C.power('wildfire', v.n); } });
defCard({ id: 'detonate', f: 'flame', name: '引爆', glyph: '引', t: 'atk', r: 'U', cost: 1, tg: 'enemy', v: { x: 2 }, up: { x: 3 },
  text: '造成「目標灼燒層數 ×{x}」的傷害。', dyn(C, v, t) { return { d: t ? (t.st.burn || 0) * v.x : 0 }; }, play(C, t, v) { C.hit(t, v.d); } });
defCard({ id: 'flurry', f: 'flame', name: '連環斬', glyph: '環', t: 'atk', cost: 0, tg: 'enemy', v: { d: 3 }, up: { d: 5 },
  text: '造成 {d} 傷害。若本回合已打出 2 張以上的牌，再打擊一次。', hits: C => C.played >= 2 ? 2 : 1, play(C, t, v) { C.hit(t, v.d, { hits: C.played >= 2 ? 2 : 1 }); } });
defCard({ id: 'blade_storm', f: 'flame', name: '劍焰風暴', glyph: '嵐', t: 'atk', r: 'R', cost: 'X', tg: 'all', v: { d: 6 }, up: { d: 8 },
  text: '對所有敵人造成 {d} 傷害 X 次。', hits: C => C.energy, play(C, t, v) { for (let i = 0; i < v.X; i++) C.hitAll(v.d); } });
defCard({ id: 'phoenix', f: 'flame', name: '鳳翼', glyph: '鳳', t: 'pow', r: 'R', cost: 2, v: { n: 5 }, up: { n: 8 },
  text: '每當有敵人死亡，對所有敵人施加 {n} 灼燒並抽 1 張牌。', play(C, t, v) { C.power('phoenix', v.n); } });
defCard({ id: 'annihilate', f: 'flame', name: '燼滅', glyph: '滅', t: 'atk', r: 'R', cost: 2, tg: 'enemy', v: { d: 14 }, up: { d: 18 },
  text: '造成 {d} 傷害。力量對此牌的效果 ×3。', strMult: 3, play(C, t, v) { C.hit(t, v.d, { strMult: 3 }); } });
defCard({ id: 'flame_barrier', f: 'flame', name: '炎障', glyph: '障', t: 'skl', r: 'U', cost: 2, v: { b: 12, n: 4 }, up: { b: 16, n: 6 },
  text: '獲得 {b} 格擋。本回合每當你被攻擊，對攻擊者施加 {n} 灼燒。', play(C, t, v) { C.block(v.b); C.self('flameBarrier', v.n); } });
defCard({ id: 'fury', f: 'flame', name: '怒焰', glyph: '怒', t: 'skl', cost: 0, v: { n: 2 }, up: { n: 4 },
  text: '本回合獲得 {n} 力量。', play(C, t, v) { C.self('str', v.n); C.self('strDown', v.n); } });
defCard({ id: 'magma_cleave', f: 'flame', name: '熔火重劈', glyph: '熔', t: 'atk', cost: 2, tg: 'enemy', v: { d: 12, n: 2 }, up: { d: 15, n: 3 },
  text: '造成 {d} 傷害，施加 {n} 易傷。', play(C, t, v) { C.hit(t, v.d); C.apply(t, 'vuln', v.n); } });
defCard({ id: 'ember_dance', f: 'flame', name: '燼舞', glyph: '舞', t: 'atk', r: 'U', cost: 1, tg: 'enemy', v: { d: 7 }, up: { d: 10 },
  text: '造成 {d} 傷害。若目標有灼燒，獲得 1 能量。', play(C, t, v) { const had = (t.st.burn || 0) > 0; C.hit(t, v.d); if (had) C.gainEnergy(1); } });
defCard({ id: 'scorched', f: 'flame', name: '焦土', glyph: '焦', t: 'skl', r: 'R', cost: 1, up: { cost: 0 }, exhaust: true,
  text: '所有敵人的灼燒翻倍。消耗。', play(C) { for (const e of C.alive()) if (e.st.burn) C.apply(e, 'burn', e.st.burn, true); } });
defCard({ id: 'flame_spirit', f: 'flame', name: '喚火靈', glyph: '靈', t: 'unit', r: 'U', cost: 1, tg: 'lane',
  unit: { name: '火靈', glyph: '火', atk: 2, hp: 5, kw: { burn: 2 } }, up: { unit: { name: '火靈', glyph: '火', atk: 3, hp: 7, kw: { burn: 3 } } },
  play(C, t, v) { C.summon(t, v.unit); } });

/* ---------------- 玄霜 ---------------- */
defCard({ id: 'frost_start', f: 'frost', name: '冰壁', glyph: '壁', t: 'skl', r: 'B', cost: 1, retain: true, v: { b: 8 }, up: { b: 11 },
  text: '獲得 {b} 格擋。恆存。', play(C, t, v) { C.block(v.b); } });
defCard({ id: 'frost_edge', f: 'frost', name: '寒刃', glyph: '寒', t: 'atk', cost: 1, tg: 'enemy', v: { d: 6, n: 1 }, up: { d: 8, n: 2 },
  text: '造成 {d} 傷害，施加 {n} 虛弱。', play(C, t, v) { C.hit(t, v.d); C.apply(t, 'weak', v.n); } });
defCard({ id: 'frost_armor', f: 'frost', name: '霜甲', glyph: '甲', t: 'skl', cost: 1, v: { b: 7 }, up: { b: 10 },
  text: '獲得 {b} 格擋。抽 1 張牌。', play(C, t, v) { C.block(v.b); C.draw(1); } });
defCard({ id: 'deep_freeze', f: 'frost', name: '冰封', glyph: '封', t: 'skl', r: 'U', cost: 2, up: { cost: 1 }, tg: 'enemy', exhaust: true,
  text: '冰凍目標。消耗。', play(C, t) { C.apply(t, 'freeze', 1); } });
defCard({ id: 'permafrost', f: 'frost', name: '永凍', glyph: '永', t: 'pow', r: 'R', cost: 2, up: { cost: 1 },
  text: '你的格擋不再於回合開始時消失。', play(C) { C.power('barricade', 1); } });
defCard({ id: 'shield_bash', f: 'frost', name: '盾擊', glyph: '盾', t: 'atk', cost: 1, up: { cost: 0 }, tg: 'enemy',
  text: '造成等同你目前格擋值的傷害。', dyn(C) { return { d: C ? C.hero.block : 0 }; }, play(C, t, v) { C.hit(t, v.d); } });
defCard({ id: 'cold_wave', f: 'frost', name: '寒潮', glyph: '潮', t: 'skl', cost: 1, v: { n: 1, b: 4 }, up: { n: 2, b: 6 },
  text: '對所有敵人施加 {n} 虛弱。獲得 {b} 格擋。', play(C, t, v) { C.applyAll('weak', v.n); C.block(v.b); } });
defCard({ id: 'frost_spikes', f: 'frost', name: '冰棘', glyph: '棘', t: 'pow', r: 'U', cost: 1, v: { n: 3 }, up: { n: 5 },
  text: '獲得 {n} 荊棘。', play(C, t, v) { C.self('thorns', v.n); } });
defCard({ id: 'frost_step', f: 'frost', name: '霜行', glyph: '行', t: 'skl', cost: 0, v: { b: 3 }, up: { b: 5 },
  text: '獲得 1 步與 {b} 格擋。', play(C, t, v) { C.gainSteps(1); C.block(v.b); } });
defCard({ id: 'avalanche', f: 'frost', name: '雪崩', glyph: '崩', t: 'atk', r: 'R', cost: 3, tg: 'all', exhaust: true, v: { d: 10 }, up: { d: 14 },
  text: '對所有敵人造成 {d} 傷害並冰凍。消耗。', play(C, t, v) { C.hitAll(v.d); C.applyAll('freeze', 1); } });
defCard({ id: 'ice_guard', f: 'frost', name: '冰晶守衛', glyph: '晶', t: 'unit', cost: 1, tg: 'lane',
  unit: { name: '冰晶守衛', glyph: '晶', atk: 1, hp: 9, kw: { weak: 1 } }, up: { unit: { name: '冰晶守衛', glyph: '晶', atk: 2, hp: 13, kw: { weak: 1 } } },
  play(C, t, v) { C.summon(t, v.unit); } });
defCard({ id: 'snowbound', f: 'frost', name: '雪藏', glyph: '藏', t: 'skl', r: 'U', cost: 1, v: { b: 7 }, up: { b: 10 },
  text: '獲得 {b} 格擋。下回合多獲得 1 能量。', play(C, t, v) { C.block(v.b); C.self('energyNext', 1); } });
defCard({ id: 'frost_heart', f: 'frost', name: '寒霜之心', glyph: '心', t: 'pow', r: 'U', cost: 1, v: { n: 4 }, up: { n: 6 },
  text: '回合結束時，獲得 {n} 格擋。', play(C, t, v) { C.power('frostHeart', v.n); } });
defCard({ id: 'abs_zero', f: 'frost', name: '絕對零度', glyph: '零', t: 'skl', r: 'R', cost: 2, exhaust: true, v: { n: 2 }, up: { n: 3 },
  text: '對所有敵人施加 {n} 虛弱與 {n} 易傷。消耗。', play(C, t, v) { C.applyAll('weak', v.n); C.applyAll('vuln', v.n); } });
defCard({ id: 'ice_lance', f: 'frost', name: '冰槍', glyph: '槍', t: 'atk', cost: 2, tg: 'front', v: { d: 14, n: 2 }, up: { d: 19, n: 2 },
  text: '對正前方敵人造成 {d} 傷害，施加 {n} 虛弱。', play(C, t, v) { C.hit(t, v.d); C.apply(t, 'weak', v.n); } });
defCard({ id: 'riposte', f: 'frost', name: '堅冰反擊', glyph: '反', t: 'atk', r: 'U', cost: 1, tg: 'enemy', v: { d: 6 }, up: { d: 9 },
  text: '造成 {d} 傷害。若你有格擋，再打擊一次。', hits: C => C.hero.block > 0 ? 2 : 1, play(C, t, v) { C.hit(t, v.d, { hits: C.hero.block > 0 ? 2 : 1 }); } });
defCard({ id: 'frost_throne', f: 'frost', name: '冰封王座', glyph: '座', t: 'pow', r: 'R', cost: 2, v: { n: 3 }, up: { n: 4 },
  text: '每當你獲得格擋，對隨機敵人造成 {n} 傷害。', play(C, t, v) { C.power('juggernaut', v.n); } });

/* ---------------- 骸契 ---------------- */
const SKEL = (a, hp) => ({ name: '骸兵', glyph: '骸', atk: a, hp });
defCard({ id: 'bone_start', f: 'bone', name: '召喚骸兵', glyph: '召', t: 'unit', r: 'B', cost: 1, tg: 'lane',
  unit: SKEL(3, 6), up: { unit: SKEL(4, 9) }, play(C, t, v) { C.summon(t, v.unit); } });
defCard({ id: 'bone_hound', f: 'bone', name: '骨犬', glyph: '犬', t: 'unit', cost: 0, tg: 'lane',
  unit: { name: '骨犬', glyph: '犬', atk: 2, hp: 3, kw: { bone: 1 } }, up: { unit: { name: '骨犬', glyph: '犬', atk: 3, hp: 5, kw: { bone: 1 } } },
  play(C, t, v) { C.summon(t, v.unit); } });
defCard({ id: 'colossus', f: 'bone', name: '骸骨巨像', glyph: '巨', t: 'unit', r: 'R', cost: 0, bcost: 5, up: { bcost: 4 }, tg: 'lane',
  unit: { name: '骸骨巨像', glyph: '巨', atk: 8, hp: 18 }, play(C, t, v) { C.summon(t, v.unit); } });
defCard({ id: 'wraith_unit', f: 'bone', name: '怨靈', glyph: '怨', t: 'unit', r: 'U', cost: 1, tg: 'lane',
  unit: { name: '怨靈', glyph: '魅', atk: 5, hp: 2, kw: { pierce: 1 } }, up: { unit: { name: '怨靈', glyph: '魅', atk: 7, hp: 3, kw: { pierce: 1 } } },
  play(C, t, v) { C.summon(t, v.unit); } });
defCard({ id: 'sacrifice', f: 'bone', name: '獻祭', glyph: '祭', t: 'skl', cost: 0, tg: 'ally', v: { n: 1 }, up: { n: 2 },
  text: '犧牲一名友軍，獲得 2 能量並抽 {n} 張牌。', play(C, t, v) { C.sacrifice(t); C.gainEnergy(2); C.draw(v.n); } });
defCard({ id: 'bone_wall', f: 'bone', name: '骨牆', glyph: '牆', t: 'skl', cost: 1, v: { b: 5 }, up: { b: 7 },
  text: '獲得 {b} 格擋。每有 1 名友軍，再 +3。', dyn(C, v) { return { b: v.b + (C ? C.allyList().length * 3 : 0) }; }, play(C, t, v) { C.block(v.b); } });
defCard({ id: 'corpse_blast', f: 'bone', name: '屍爆', glyph: '屍', t: 'skl', r: 'U', cost: 1, tg: 'ally', v: { p: 10 }, up: { p: 15 },
  text: '犧牲一名友軍，對所有敵人造成 {p} 傷害。', play(C, t, v) { C.sacrifice(t); C.spellAll(v.p); } });
defCard({ id: 'bone_spear', f: 'bone', name: '骨矛', glyph: '矛', t: 'atk', cost: 1, tg: 'enemy', v: { d: 5 }, up: { d: 7 },
  text: '造成 {d} 傷害。每持有 1 骨，傷害 +2。', dyn(C, v) { return { d: v.d + (C ? C.bones * 2 : 0) }; }, play(C, t, v) { C.hit(t, v.d); } });
defCard({ id: 'bone_scythe', f: 'bone', name: '骨鐮', glyph: '鐮', t: 'atk', r: 'U', cost: 0, bcost: 2, tg: 'all', v: { d: 9 }, up: { d: 13 },
  text: '對所有敵人造成 {d} 傷害。', play(C, t, v) { C.hitAll(v.d); } });
defCard({ id: 'legion', f: 'bone', name: '亡者軍團', glyph: '軍', t: 'pow', r: 'R', cost: 2, up: { cost: 1 },
  text: '回合開始時，在一條空道召喚 1 名骸兵（2/3）。', play(C) { C.power('legion', 1); } });
defCard({ id: 'command', f: 'bone', name: '驅屍', glyph: '驅', t: 'skl', r: 'U', cost: 1, up: { cost: 0 },
  text: '所有友軍立即攻擊一次。', play(C) { for (const a of C.allyList()) C.allyStrike(a); } });
defCard({ id: 'bone_armor', f: 'bone', name: '骨甲', glyph: '骨', t: 'skl', cost: 1, tg: 'ally', v: { a: 2, h: 4 }, up: { a: 3, h: 6 },
  text: '一名友軍 +{a} 攻擊、+{h} 生命。抽 1 張牌。', play(C, t, v) { C.buffAlly(t, v.a, v.h); C.draw(1); } });
defCard({ id: 'soul_fire', f: 'bone', name: '魂火', glyph: '魂', t: 'pow', r: 'U', cost: 1, v: { p: 6 }, up: { p: 9 },
  text: '每當友軍死亡，對隨機敵人造成 {p} 傷害。', play(C, t, v) { C.power('soulFire', v.p); } });
defCard({ id: 'reap', f: 'bone', name: '收割', glyph: '割', t: 'atk', cost: 1, tg: 'enemy', v: { d: 8 }, up: { d: 11 },
  text: '造成 {d} 傷害。若擊殺目標，獲得 2 骨並抽 1 張牌。', play(C, t, v) { C.hit(t, v.d); if (t.hp <= 0) { C.gainBones(2); C.draw(1); } } });
defCard({ id: 'ossuary', f: 'bone', name: '白骨祭壇', glyph: '壇', t: 'skl', r: 'R', cost: 0, bcost: 3, up: { bcost: 2 },
  text: '獲得 2 能量並抽 2 張牌。', play(C) { C.gainEnergy(2); C.draw(2); } });
defCard({ id: 'rot_touch', f: 'bone', name: '腐朽之觸', glyph: '腐', t: 'skl', cost: 1, tg: 'enemy', v: { n: 2 }, up: { n: 3 },
  text: '施加 {n} 易傷。獲得 1 骨。', play(C, t, v) { C.apply(t, 'vuln', v.n); C.gainBones(1); } });
defCard({ id: 'bone_dragon', f: 'bone', name: '骨龍', glyph: '龍', t: 'unit', r: 'R', cost: 0, bcost: 8, up: { bcost: 6 }, tg: 'lane',
  unit: { name: '骨龍', glyph: '龍', atk: 7, hp: 20, kw: { sweep: 1 } }, play(C, t, v) { C.summon(t, v.unit); } });

/* ---------------- 雷樞 ---------------- */
defCard({ id: 'storm_start', f: 'storm', name: '電弧步', glyph: '弧', t: 'atk', r: 'B', cost: 1, tg: 'enemy', v: { d: 5, n: 2 }, up: { d: 7, n: 3 },
  text: '造成 {d} 傷害並施加 {n} 感電。獲得 1 步。', play(C, t, v) { C.hit(t, v.d); C.apply(t, 'shock', v.n); C.gainSteps(1); } });
defCard({ id: 'chain_lightning', f: 'storm', name: '連鎖閃電', glyph: '鏈', t: 'atk', cost: 1, tg: 'enemy', v: { d: 6 }, up: { d: 8 },
  text: '造成 {d} 傷害，再對另一名隨機敵人造成相同傷害。', play(C, t, v) { C.hit(t, v.d); const o = C.alive().filter(e => e !== t); if (o.length) C.hit(RNG.pick(o), v.d); } });
defCard({ id: 'dash', f: 'storm', name: '疾走', glyph: '走', t: 'skl', cost: 0, v: { s: 2 }, up: { s: 3 },
  text: '獲得 {s} 步。抽 1 張牌。', play(C, t, v) { C.gainSteps(v.s); C.draw(1); } });
defCard({ id: 'slide', f: 'storm', name: '滑行', glyph: '滑', t: 'skl', cost: 1, v: { b: 6 }, up: { b: 9 },
  text: '獲得 {b} 格擋與 1 步。', play(C, t, v) { C.block(v.b); C.gainSteps(1); } });
defCard({ id: 'overclock', f: 'storm', name: '超頻', glyph: '頻', t: 'skl', r: 'U', cost: 0, v: { n: 2 }, up: { n: 3 },
  text: '獲得 {n} 能量。將 1 張眩暈放入棄牌堆。', play(C, t, v) { C.gainEnergy(v.n); C.addCard('dazed', 'discard', 1); } });
defCard({ id: 'turret', f: 'storm', name: '浮游砲', glyph: '砲', t: 'unit', cost: 1, tg: 'lane',
  unit: { name: '浮游砲', glyph: '砲', atk: 3, hp: 4, kw: { shock: 1 } }, up: { unit: { name: '浮游砲', glyph: '砲', atk: 4, hp: 5, kw: { shock: 2 } } },
  play(C, t, v) { C.summon(t, v.unit); } });
defCard({ id: 'emp', f: 'storm', name: '電磁脈衝', glyph: '脈', t: 'skl', r: 'U', cost: 1, v: { n: 3 }, up: { n: 5 },
  text: '對所有敵人施加 {n} 感電。抽 1 張牌。', play(C, t, v) { C.applyAll('shock', v.n); C.draw(1); } });
defCard({ id: 'lightning_rod', f: 'storm', name: '引雷針', glyph: '針', t: 'pow', r: 'U', cost: 1, v: { p: 4 }, up: { p: 6 },
  text: '每當你移動，對正前方敵人造成 {p} 傷害。', play(C, t, v) { C.power('rod', v.p); } });
defCard({ id: 'kinetic', f: 'storm', name: '動能裝甲', glyph: '動', t: 'pow', r: 'U', cost: 1, v: { n: 3 }, up: { n: 4 },
  text: '每當你移動，獲得 {n} 格擋。', play(C, t, v) { C.power('kinetic', v.n); } });
defCard({ id: 'rapid', f: 'storm', name: '疾風連打', glyph: '迅', t: 'atk', cost: 1, tg: 'enemy', v: { d: 3 }, up: { d: 4 },
  text: '造成 {d} 傷害。本回合每已打出 1 張牌，額外打擊 1 次（最多 4 次）。', hits: C => 1 + Math.min(4, C.played), play(C, t, v) { C.hit(t, v.d, { hits: 1 + Math.min(4, C.played) }); } });
defCard({ id: 'thunderclap', f: 'storm', name: '雷霆萬鈞', glyph: '霆', t: 'atk', r: 'R', cost: 3, tg: 'front', v: { d: 26 }, up: { d: 34 },
  text: '對正前方敵人造成 {d} 傷害。本回合每移動 1 次，費用 -1。', costDyn(C) { return C ? -C.movesThisTurn : 0; }, play(C, t, v) { C.hit(t, v.d); } });
defCard({ id: 'railgun', f: 'storm', name: '磁軌砲', glyph: '軌', t: 'atk', r: 'U', cost: 2, tg: 'enemy', v: { d: 14 }, up: { d: 19 },
  text: '造成 {d} 傷害。無視格擋。', play(C, t, v) { C.hit(t, v.d, { pierce: true }); } });
defCard({ id: 'storm_core', f: 'storm', name: '雷樞核心', glyph: '核', t: 'pow', r: 'R', cost: 3, up: { cost: 2 },
  text: '回合開始時，獲得 1 能量。', play(C) { C.power('core', 1); } });
defCard({ id: 'resonance_loop', f: 'storm', name: '共振迴路', glyph: '振', t: 'pow', r: 'U', cost: 1, v: { n: 4 }, up: { n: 3 },
  text: '每回合打出第 {n} 張牌時，抽 2 張牌並獲得 1 步。', play(C, t, v) { C.power('loop', v.n, 'min'); } });
defCard({ id: 'grapple', f: 'storm', name: '電磁鉤', glyph: '鉤', t: 'skl', cost: 1, tg: 'enemy', v: { n: 2 }, up: { n: 3 },
  text: '把目標拉到你所在的道（與原處敵人互換），施加 {n} 易傷。', play(C, t, v) { C.pullEnemy(t); C.apply(t, 'vuln', v.n); } });
defCard({ id: 'thrusters', f: 'storm', name: '推進器', glyph: '推', t: 'skl', r: 'U', cost: 1, tg: 'heroLane', v: { b: 5 }, up: { b: 8 },
  text: '移動到任意一道（不消耗步）。獲得 {b} 格擋，抽 1 張牌。', play(C, t, v) { C.moveTo(t); C.block(v.b); C.draw(1); } });
defCard({ id: 'discharge', f: 'storm', name: '放電', glyph: '放', t: 'atk', r: 'U', cost: 1, tg: 'all', v: { d: 5, n: 2 }, up: { d: 7, n: 3 },
  text: '對所有敵人造成 {d} 傷害並施加 {n} 感電。', play(C, t, v) { C.hitAll(v.d); C.applyAll('shock', v.n); } });

/* ---------------- 狀態與詛咒 ---------------- */
defCard({ id: 'dazed', name: '眩暈', glyph: '暈', t: 'status', r: 'X', cost: -1, ethereal: true, text: '無法打出。虛無。' });
defCard({ id: 'cinder', name: '餘燼', glyph: '燼', t: 'status', r: 'X', cost: -1, text: '無法打出。回合結束時若在手牌中，受到 3 傷害。' });
defCard({ id: 'wound', name: '傷口', glyph: '創', t: 'status', r: 'X', cost: -1, text: '無法打出。' });
defCard({ id: 'regret', name: '怨念', glyph: '怨', t: 'curse', r: 'X', cost: -1, text: '無法打出。回合結束時若在手牌中，失去 1 生命。' });
defCard({ id: 'doubt', name: '疑慮', glyph: '疑', t: 'curse', r: 'X', cost: -1, text: '無法打出。回合結束時若在手牌中，獲得 1 虛弱。' });

/* ---------- 卡池 ---------- */
function cardPool(f, r) {
  return Object.values(CARDS).filter(c => c.f === f && c.r === r);
}
const TYPE_NAME = { atk: '攻擊', skl: '技能', pow: '能力', unit: '友軍', status: '狀態', curse: '詛咒' };
const RARITY_NAME = { B: '基礎', C: '普通', U: '罕見', R: '稀有', X: '特殊' };
