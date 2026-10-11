'use strict';
/* =========================================================
   敵人與遭遇
   攻擊目標 t：
     aim   瞄準 —— 鎖定宣告意圖時你所在的道（移動即可閃避）
     front 正面 —— 攻擊敵人自己所在的道
     all   橫掃 —— 三道全部命中
     home  追蹤 —— 結算時你在哪一道就打哪一道（無法閃避）
   友軍站在被攻擊的道上時，會替你承受該道的攻擊。
   ========================================================= */
const ENEMIES = {};
function defEnemy(e) { ENEMIES[e.id] = e; }
/* 各幕整體強度（生命、攻擊倍率）；意圖上顯示的數字已包含這些倍率 */
const ENEMY_SCALE = {
  hp: { 1: 1.15, 2: 1.1, 3: 1.15 },
  dmg: { 1: 1.3, 2: 1.2, 3: 1.3 },
  elite: 1.1,
};

const A = (d, n = 1, t = 'aim') => ({ a: 'atk', d, n, t });
const BLK = v => ({ a: 'blk', v });
const BLKALL = v => ({ a: 'blkAll', v });
const BUFF = (s, v) => ({ a: 'buff', s, v });
const BUFFALL = (s, v) => ({ a: 'buffAll', s, v });
const DEB = (s, v) => ({ a: 'debuff', s, v });
const SUM = (id, n = 1) => ({ a: 'summon', id, n });
const CARDIN = (id, v, pile = 'discard') => ({ a: 'card', id, v, pile });
const PULL = { a: 'pull' };
const SHIFT = { a: 'shift' };
const minionsOf = (e, C) => C.alive().filter(x => x !== e).length;

/* ---------------- 第一幕：荒骨原 ---------------- */
defEnemy({ id: 'crow', name: '腐鴉', glyph: '鴉', hp: [16, 20],
  moves: { peck: { name: '啄擊', acts: [A(3, 2, 'home')] }, screech: { name: '尖嘯', acts: [A(3, 1, 'aim'), DEB('weak', 1)] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'screech' : 'peck'; } });
defEnemy({ id: 'beetle', name: '骨甲蟲', glyph: '甲', hp: [26, 30],
  moves: { bite: { name: '咬合', acts: [A(7, 1, 'front')] }, harden: { name: '硬化', acts: [BLK(9), A(3, 1, 'front')] } },
  ai(e) { return e.turn % 3 === 1 ? 'harden' : 'bite'; } });
defEnemy({ id: 'wolf', name: '荒原狼', glyph: '狼', hp: [30, 34],
  moves: { lunge: { name: '撲擊', acts: [A(9, 1, 'aim')] }, rend: { name: '撕裂', acts: [A(5, 1, 'home'), DEB('vuln', 1)] }, howl: { name: '嚎叫', acts: [BUFF('str', 2)] } },
  pattern: ['lunge', 'rend', 'howl'] });
defEnemy({ id: 'shroom', name: '菌菇人', glyph: '菇', hp: [36, 40],
  moves: { spores: { name: '孢子', acts: [A(3, 1, 'all'), DEB('vuln', 1)] }, slam: { name: '重壓', acts: [A(11, 1, 'front')] } },
  pattern: ['spores', 'slam', 'slam'] });
defEnemy({ id: 'scorp', name: '沙蠍', glyph: '蠍', hp: [22, 26],
  moves: { sting: { name: '螫刺', acts: [A(4, 1, 'home'), DEB('burn', 2)] }, pinch: { name: '雙鉗', acts: [A(3, 2, 'front')] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'pinch' : 'sting'; } });
defEnemy({ id: 'cultist', name: '骸教徒', glyph: '教', hp: [44, 48],
  moves: { ritual: { name: '血祭', acts: [BUFF('ritual', 3)] }, strike: { name: '獻身一擊', acts: [A(6, 1, 'home')] } },
  ai(e) { return e.turn === 0 ? 'ritual' : 'strike'; } });
defEnemy({ id: 'skel', name: '骸兵', glyph: '骸', hp: [11, 13], minion: true,
  moves: { slash: { name: '劈砍', acts: [A(5, 1, 'front')] } }, pattern: ['slash'] });

defEnemy({ id: 'general', name: '骸骨將軍', glyph: '將', hp: [80, 84], elite: true,
  moves: {
    rally: { name: '點兵', acts: [SUM('skel', 2), BLK(8)] },
    cleave: { name: '斷頭斬', acts: [A(14, 1, 'front')] },
    sweep: { name: '橫掃千軍', acts: [A(7, 1, 'all')] },
    warcry: { name: '戰吼', acts: [BUFFALL('str', 2), A(5, 1, 'home')] },
  },
  ai(e, C) {
    if (e.turn === 0) return 'rally';
    if (minionsOf(e, C) === 0 && e.turn % 4 === 0) return 'rally';
    return ['cleave', 'sweep', 'warcry'][(e.turn - 1) % 3];
  } });
defEnemy({ id: 'vulture', name: '雙頭鷲', glyph: '鷲', hp: [66, 70], elite: true,
  moves: { rake: { name: '爪擊', acts: [A(4, 3, 'home')] }, preen: { name: '理羽', acts: [BLK(10), BUFF('str', 2)] }, dive: { name: '俯衝', acts: [A(18, 1, 'aim')] } },
  pattern: ['rake', 'preen', 'dive'] });
defEnemy({ id: 'frog', name: '沼澤巨蛙', glyph: '蛙', hp: [82, 86], elite: true,
  moves: { tongue: { name: '長舌', acts: [A(8, 1, 'home'), PULL] }, swallow: { name: '吞噬', acts: [A(18, 1, 'front')] }, croak: { name: '鳴囊', acts: [A(6, 1, 'all'), DEB('weak', 1)] } },
  pattern: ['tongue', 'swallow', 'croak'] });
defEnemy({ id: 'bone_king', name: '腐骨之王', glyph: '王', hp: [190, 190], boss: true,
  moves: {
    summon: { name: '起屍', acts: [SUM('skel', 2)] },
    storm: { name: '骨暴', acts: [A(6, 2, 'all')] },
    crush: { name: '王之碾壓', acts: [A(22, 1, 'front')] },
    decay: { name: '腐朽', acts: [CARDIN('wound', 2), BLK(10), A(8, 1, 'home')] },
  },
  ai(e, C) {
    if (e.turn === 0) return 'summon';
    const cyc = ['storm', 'crush', minionsOf(e, C) < 2 ? 'summon' : 'decay'];
    return cyc[(e.turn - 1) % 3];
  } });

/* ---------------- 第二幕：霜燼城 ---------------- */
defEnemy({ id: 'wraith', name: '冰魄', glyph: '魄', hp: [38, 42],
  moves: { chill: { name: '寒觸', acts: [A(7, 1, 'home'), DEB('weak', 1)] }, nova: { name: '霜環', acts: [A(5, 1, 'all')] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'nova' : 'chill'; } });
defEnemy({ id: 'eguard', name: '燼衛', glyph: '衛', hp: [46, 50],
  moves: { bash: { name: '盾擊', acts: [A(11, 1, 'front'), BLK(6)] }, wall: { name: '列陣', acts: [BLKALL(10)] } },
  pattern: ['bash', 'wall', 'bash'] });
defEnemy({ id: 'hound', name: '熔岩犬', glyph: '犬', hp: [38, 42],
  moves: { bite: { name: '熔牙', acts: [A(8, 1, 'aim'), DEB('burn', 3)] }, frenzy: { name: '狂咬', acts: [A(4, 3, 'home')] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'frenzy' : 'bite'; } });
defEnemy({ id: 'mage', name: '冰晶術士', glyph: '術', hp: [32, 36],
  moves: { hex: { name: '凍咒', acts: [DEB('frail', 2), DEB('weak', 1)] }, bolt: { name: '追魂冰矢', acts: [A(14, 1, 'home')] } },
  pattern: ['hex', 'bolt', 'bolt'] });
defEnemy({ id: 'assassin', name: '刺客', glyph: '刺', hp: [32, 36],
  moves: { vanish: { name: '隱匿', acts: [BLK(12), SHIFT] }, flurry: { name: '亂刃', acts: [A(5, 3, 'front')] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'vanish' : 'flurry'; } });
defEnemy({ id: 'imp', name: '燼靈', glyph: '燼', hp: [18, 22], minion: true,
  moves: { flare: { name: '爆燃', acts: [A(4, 1, 'all'), DEB('burn', 2)] } }, pattern: ['flare'] });
defEnemy({ id: 'icestatue', name: '冰像', glyph: '像', hp: [26, 26], minion: true,
  moves: { icy: { name: '冰拳', acts: [A(6, 1, 'front')] }, ward: { name: '冰護', acts: [BLKALL(6)] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'ward' : 'icy'; } });

defEnemy({ id: 'giant', name: '霜巨人', glyph: '巨', hp: [132, 136], elite: true,
  moves: { stomp: { name: '踐踏', acts: [A(8, 1, 'all'), DEB('frail', 1)] }, club: { name: '冰棍重擊', acts: [A(25, 1, 'front')] }, roar: { name: '怒吼', acts: [BUFF('str', 3)] } },
  pattern: ['stomp', 'club', 'roar', 'club'] });
defEnemy({ id: 'twinA', name: '燼焰雙子・陽', glyph: '陽', hp: [64, 68], elite: true, bond: true,
  moves: { flare: { name: '陽炎', acts: [A(6, 2, 'home')] }, kindle: { name: '同燃', acts: [BUFFALL('str', 2), BLK(8)] } },
  pattern: ['flare', 'kindle'] });
defEnemy({ id: 'twinB', name: '燼焰雙子・陰', glyph: '陰', hp: [64, 68], elite: true, bond: true,
  moves: { flare: { name: '陰火', acts: [A(10, 1, 'front')] }, kindle: { name: '同燃', acts: [BUFFALL('str', 2), BLK(8)] } },
  pattern: ['kindle', 'flare'] });
defEnemy({ id: 'golem', name: '鍊金傀儡', glyph: '傀', hp: [120, 126], elite: true,
  moves: { charge: { name: '充能', acts: [BLK(20), A(7, 1, 'home')] }, focus: { name: '聚焦', acts: [BUFF('str', 4)] }, beam: { name: '湮滅光束', acts: [A(30, 1, 'aim')] } },
  pattern: ['charge', 'focus', 'beam'] });
defEnemy({ id: 'empress', name: '霜燼女皇', glyph: '皇', hp: [270, 270], boss: true,
  moves: {
    ward: { name: '冰之近衛', acts: [SUM('icestatue', 2), BLK(15)] },
    blizzard: { name: '暴雪', acts: [A(6, 1, 'all'), DEB('weak', 1)] },
    lance: { name: '冰槍', acts: [A(12, 2, 'aim')] },
    emberstorm: { name: '燼焰風暴', acts: [A(4, 3, 'all'), DEB('burn', 4)] },
    judgement: { name: '女皇裁決', acts: [A(26, 1, 'home')] },
  },
  ai(e, C) {
    if (e.turn === 0) return 'ward';
    if (!e.phase && e.hp <= e.maxHp / 2) { e.phase = 1; e.k = 0; return 'emberstorm'; }
    if (e.phase) { const cyc = ['lance', 'judgement', minionsOf(e, C) < 1 ? 'ward' : 'blizzard', 'emberstorm']; return cyc[(e.k++) % cyc.length]; }
    const cyc = ['blizzard', 'lance', minionsOf(e, C) < 2 ? 'ward' : 'lance'];
    return cyc[(e.turn - 1) % cyc.length];
  } });

/* ---------------- 第三幕：雷淵頂 ---------------- */
defEnemy({ id: 'tbird', name: '雷鳥', glyph: '鳥', hp: [48, 52],
  moves: { storm: { name: '雷羽', acts: [A(5, 3, 'home')] }, static: { name: '靜電', acts: [A(6, 1, 'aim'), DEB('vuln', 2)] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'static' : 'storm'; } });
defEnemy({ id: 'sentinel', name: '機械哨兵', glyph: '哨', hp: [58, 62],
  moves: { lock: { name: '鎖定', acts: [BLK(12)] }, laser: { name: '雷射', acts: [A(19, 1, 'aim')] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'laser' : 'lock'; } });
defEnemy({ id: 'tentacle', name: '深淵觸手', glyph: '觸', hp: [44, 48],
  moves: { grab: { name: '纏捲', acts: [A(10, 1, 'home'), PULL] }, lash: { name: '橫抽', acts: [A(7, 1, 'all')] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'lash' : 'grab'; } });
defEnemy({ id: 'zealot', name: '狂信者', glyph: '信', hp: [52, 56],
  moves: { chant: { name: '狂熱祝禱', acts: [BUFFALL('str', 2)] }, smite: { name: '神罰', acts: [A(10, 1, 'home')] } },
  pattern: ['chant', 'smite', 'smite'] });
defEnemy({ id: 'spider', name: '虛空蛛', glyph: '蛛', hp: [48, 52],
  moves: { web: { name: '虛空網', acts: [CARDIN('dazed', 2, 'draw'), DEB('weak', 1)] }, bite: { name: '毒顎', acts: [A(13, 1, 'front')] } },
  pattern: ['web', 'bite', 'bite'] });
defEnemy({ id: 'warden', name: '符衛', glyph: '衛', hp: [34, 34], minion: true,
  moves: { protect: { name: '護主', acts: [BLKALL(10)] }, strike: { name: '符刃', acts: [A(8, 1, 'front')] } },
  ai(e) { return (e.turn + e.seed) % 2 ? 'protect' : 'strike'; } });

defEnemy({ id: 'drake', name: '雷霆龍蜥', glyph: '龍', hp: [190, 196], elite: true,
  moves: { roar: { name: '龍吼', acts: [BUFF('str', 3), BLK(15)] }, breath: { name: '雷火吐息', acts: [A(9, 1, 'all'), DEB('burn', 3)] }, tail: { name: '甩尾', acts: [A(26, 1, 'front')] } },
  ai(e) { if (e.turn === 0) return 'roar'; return ['breath', 'tail', 'breath', 'tail', 'roar'][(e.turn - 1) % 5]; } });
defEnemy({ id: 'gate', name: '三相守門人', glyph: '門', hp: [176, 180], elite: true,
  moves: { shiftstrike: { name: '相位突襲', acts: [SHIFT, A(14, 1, 'home')] }, judgment: { name: '三相審判', acts: [A(6, 3, 'all')] }, seal: { name: '封印', acts: [CARDIN('doubt', 1), BLK(14)] } },
  pattern: ['shiftstrike', 'judgment', 'seal'] });
defEnemy({ id: 'lord', name: '燼符之主', glyph: '主', hp: [380, 380], boss: true,
  moves: {
    guards: { name: '召喚符衛', acts: [SUM('warden', 2)] },
    brand: { name: '烙符', acts: [CARDIN('cinder', 3), BLK(20)] },
    gather: { name: '蓄雷', acts: [BUFF('str', 3)] },
    thunder: { name: '天雷', acts: [A(30, 1, 'aim')] },
    rain: { name: '燼雨', acts: [A(5, 3, 'all')] },
    cataclysm: { name: '天傾', acts: [A(12, 1, 'all'), DEB('vuln', 2)] },
  },
  ai(e, C) {
    if (e.turn === 0) return 'guards';
    if (!e.phase && e.hp <= e.maxHp / 2) { e.phase = 1; e.k = 0; return 'cataclysm'; }
    const m = minionsOf(e, C);
    const cyc = e.phase
      ? ['rain', 'gather', 'thunder', m < 1 ? 'guards' : 'brand', 'cataclysm']
      : ['brand', 'gather', 'thunder', 'rain', m < 1 ? 'guards' : 'rain'];
    if (e.phase) return cyc[(e.k++) % cyc.length];
    return cyc[(e.turn - 1) % cyc.length];
  } });

/* ---------------- 遭遇表 ---------------- */
const ENCOUNTERS = {
  1: {
    easy: [{ e: ['crow', 'crow'] }, { e: ['beetle'] }, { e: ['wolf'] }, { e: ['scorp', 'crow'] }],
    normal: [
      { e: ['wolf', 'crow'] }, { e: ['beetle', 'scorp'] }, { e: ['shroom', 'crow'] }, { e: ['cultist'] },
      { e: ['crow', 'cultist'] }, { e: ['scorp', 'wolf'] }, { e: ['crow', 'beetle', 'crow'] }, { e: ['shroom'], reserve: ['crow', 'beetle'] }, { e: ['beetle', 'beetle'] },
    ],
    elite: [{ e: ['general'] }, { e: ['crow', 'vulture'], lanes: [0, 1] }, { e: ['frog'] }],
    boss: [{ e: ['bone_king'] }],
  },
  2: {
    easy: [{ e: ['wraith', 'wraith'] }, { e: ['hound'] }, { e: ['eguard', 'mage'] }],
    normal: [
      { e: ['hound', 'wraith'] }, { e: ['eguard', 'hound'] }, { e: ['mage', 'assassin'] }, { e: ['wraith', 'eguard', 'wraith'] },
      { e: ['assassin', 'assassin'] }, { e: ['imp', 'mage', 'imp'] }, { e: ['eguard'], reserve: ['hound', 'wraith'] },
    ],
    elite: [{ e: ['giant'] }, { e: ['twinA', 'twinB'] }, { e: ['golem'] }],
    boss: [{ e: ['empress'] }],
  },
  3: {
    easy: [{ e: ['tbird'] }, { e: ['sentinel', 'tentacle'] }, { e: ['spider'] }],
    normal: [
      { e: ['tbird', 'zealot'] }, { e: ['sentinel', 'spider'] }, { e: ['tentacle', 'tbird', 'tentacle'] }, { e: ['zealot', 'sentinel', 'zealot'] },
      { e: ['spider', 'tbird'] }, { e: ['tentacle'], reserve: ['tbird', 'sentinel'] },
    ],
    elite: [{ e: ['drake'] }, { e: ['warden', 'gate'], lanes: [0, 1] }],
    boss: [{ e: ['lord'] }],
  },
};
const ACT_NAMES = { 1: '荒骨原', 2: '霜燼城', 3: '雷淵頂' };
