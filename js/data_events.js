'use strict';
/* =========================================================
   事件（結果全部明示，不做暗箱）與古神祝福
   每個選項：label、detail（明確寫出代價與收益）、ok(run) 條件、go(run) 回傳結果文字
   go 若回傳 false 代表玩家取消，可重新選擇
   ========================================================= */
const EVENTS = {};
function defEvent(e) { EVENTS[e.id] = e; }

defEvent({ id: 'shrine', name: '遺棄的神龕', glyph: '龕', acts: [1, 2, 3],
  text: '苔蘚覆蓋的石龕前，香灰還是溫的。龕裡供著一枚看不清字跡的符。',
  options: run => [
    { label: '獻血', detail: '失去 8 生命，獲得 1 個隨機護符。', ok: run.hp > 8,
      async go(run) { runLoseHp(run, 8); const id = rollCharm(run); if (!id) return '神龕沒有回應。'; await Flow.gainCharm(run, id); return `你得到了「${CHARMS[id].name}」。`; } },
    { label: '祈禱', detail: '升級 1 張隨機牌。',
      async go(run) { const c = upgradeRandom(run, 1); return c.length ? `「${cardDef(c[0]).name}」升級了。` : '沒有可升級的牌。'; } },
    { label: '離開', detail: '什麼也不做。', async go() { return '你沒有打擾神龕。'; } },
  ] });

defEvent({ id: 'merchant', name: '行腳商人', glyph: '商', acts: [1, 2, 3],
  text: '駝背的商人掀開斗篷，裡面縫滿了符紙。「稀貨，只換現金。」',
  options: run => [
    { label: '買下稀有符', detail: '支付 50 金，從 3 張稀有牌中選 1 張。', ok: run.gold >= 50,
      async go(run) {
        const picks = rollCards(run, 3, { rarity: 'R' });
        const got = await Flow.chooseCard(picks, '選擇一張稀有牌', false);
        if (!got) return false;
        run.gold -= 50; addToDeck(run, got); return `你買下了「${cardDef(got).name}」。`;
      } },
    { label: '賣出一張牌', detail: '從牌組移除一張牌，獲得 35 金。',
      async go(run) { const ok = await Flow.removeCard(run, '賣給商人的牌'); if (!ok) return false; gainGold(run, 35); return '商人把符紙收進了斗篷。+35 金'; } },
    { label: '離開', detail: '什麼也不做。', async go() { return '商人聳聳肩，消失在霧裡。'; } },
  ] });

defEvent({ id: 'ink_pool', name: '墨池', glyph: '墨', acts: [1, 2, 3],
  text: '一池漆黑的墨水，倒映的不是你的臉，而是一張不斷變換的符。',
  options: run => [
    { label: '浸入', detail: '將一張牌轉化為同派系的隨機牌。',
      async go(run) { const r = await Flow.transformCard(run); return r === false ? false : r; } },
    { label: '飲用', detail: '回復 15 生命。', async go(run) { runHeal(run, 15); return '墨水帶著微甜，傷口慢慢合上。+15 生命'; } },
    { label: '離開', detail: '什麼也不做。', async go() { return '你沒有碰那池墨。'; } },
  ] });

defEvent({ id: 'gambler', name: '骰局', glyph: '骰', acts: [1, 2, 3],
  text: '一個沒有影子的賭徒搖著骰盅。「單或雙，一把定輸贏。」',
  options: run => [
    { label: '押 30 金', detail: '50% 機率贏得 75 金；否則失去押金。', ok: run.gold >= 30,
      async go(run) { run.gold -= 30; if (RNG.chance(0.5)) { gainGold(run, 75); return '骰子停在你押的那面。+75 金'; } return '骰子背叛了你。-30 金'; } },
    { label: '押 10 生命', detail: '50% 機率獲得 1 個罕見護符；否則白白失血。', ok: run.hp > 10,
      async go(run) {
        runLoseHp(run, 10);
        if (RNG.chance(0.5)) { const id = rollCharm(run, 'U'); if (id) { await Flow.gainCharm(run, id); return `賭徒推來一枚「${CHARMS[id].name}」。`; } }
        return '賭徒笑著收下了你的血。-10 生命';
      } },
    { label: '離開', detail: '什麼也不做。', async go() { return '你不跟沒有影子的人賭。'; } },
  ] });

defEvent({ id: 'library', name: '古卷樓閣', glyph: '卷', acts: [1, 2, 3],
  text: '塔中層層疊疊的書架，每一卷都封著一張符。',
  options: run => [
    { label: '研讀', detail: '從 5 張牌中選 1 張加入牌組。',
      async go(run) { const picks = rollCards(run, 5, {}); const got = await Flow.chooseCard(picks, '選擇一張牌加入牌組', true); if (!got) return '你把書卷放回了架上。'; addToDeck(run, got); return `你學會了「${cardDef(got).name}」。`; } },
    { label: '小憩', detail: '回復 25% 最大生命。', async go(run) { const n = Math.round(run.maxHp * 0.25); runHeal(run, n); return `你在書堆中睡了一覺。+${n} 生命`; } },
  ] });

defEvent({ id: 'bone_pile', name: '骸骨堆', glyph: '骸', acts: [1, 2],
  text: '一座由骸骨堆成的小山，縫隙間閃著金光，也飄著怨氣。',
  options: run => [
    { label: '翻找', detail: '獲得 45 金，牌組加入 1 張詛咒「怨念」。',
      async go(run) { gainGold(run, 45); addToDeck(run, newCard('regret')); return '你抓出一把金幣，怨念也跟上了你。+45 金'; } },
    { label: '安葬', detail: '失去 6 生命，從牌組移除一張牌。', ok: run.hp > 6,
      async go(run) { const ok = await Flow.removeCard(run, '隨骸骨一同安葬的牌'); if (!ok) return false; runLoseHp(run, 6); return '亡者安息了。'; } },
    { label: '離開', detail: '什麼也不做。', async go() { return '你繞過了骸骨堆。'; } },
  ] });

defEvent({ id: 'pillar', name: '雷擊石柱', glyph: '柱', acts: [2, 3],
  text: '石柱上纏繞著不散的雷光，空氣中滿是焦味。',
  options: run => [
    { label: '觸碰', detail: '失去 8 生命，升級 2 張隨機牌。', ok: run.hp > 8,
      async go(run) { runLoseHp(run, 8); const c = upgradeRandom(run, 2); return c.length ? `雷光灌入了 ${c.map(x => '「' + cardDef(x).name + '」').join('、')}。` : '沒有可升級的牌。'; } },
    { label: '汲取', detail: '獲得 1 個隨機消耗品。',
      async go(run) { const id = rollConsumable(); const ok = await Flow.gainConsumable(run, id); return ok ? `你封存了一縷雷光：「${CONSUMABLES[id].name}」。` : '你的行囊已滿。'; } },
  ] });

defEvent({ id: 'mirror_lake', name: '鏡湖', glyph: '鏡', acts: [1, 2, 3],
  text: '湖面平得像一面鏡子。你把一張符放上去，湖裡也浮起一張。',
  options: run => [
    { label: '凝視', detail: '複製牌組中的一張牌。', async go(run) { const r = await Flow.duplicateCard(run); return r ? '湖面的倒影成了真。' : false; } },
    { label: '離開', detail: '什麼也不做。', async go() { return '你沒有驚動湖面。'; } },
  ] });

defEvent({ id: 'engraver', name: '刻印師', glyph: '刻', acts: [1, 2, 3],
  text: '盲眼的老刻印師摸著你的符紙：「好紙，可惜少了點東西。」',
  options: run => [
    { label: '付錢刻印', detail: '支付 50 金，為一張牌刻上印記（3 選 1）。', ok: run.gold >= 50,
      async go(run) { const ok = await Flow.inscribeChoose(run, 3); if (!ok) return false; run.gold -= 50; return '刻刀落下，符紙微微發光。'; } },
    { label: '請他隨意', detail: '免費為一張牌刻上隨機印記，但牌組加入 1 張詛咒「疑慮」。',
      async go(run) { const ok = await Flow.inscribeRandom(run); if (!ok) return false; addToDeck(run, newCard('doubt')); return '他刻得很快，你卻開始懷疑一切。'; } },
    { label: '離開', detail: '什麼也不做。', async go() { return '你謝過老人，繼續上路。'; } },
  ] });

defEvent({ id: 'candle_keeper', name: '燭影商人', glyph: '燭', acts: [1, 2, 3],
  text: '黑衣人守著一排蠟燭，每一根都是一條命。「借火，還是賣火？」',
  options: run => [
    { label: '借火', detail: `失去 15% 最大生命（${Math.round(run.maxHp * 0.15)}），獲得 1 燭火。`, ok: run.maxHp > 20,
      async go(run) { const n = Math.round(run.maxHp * 0.15); run.maxHp -= n; run.hp = Math.min(run.hp, run.maxHp); run.candles++; return '一根新的蠟燭為你點亮了。'; } },
    { label: '賣火', detail: '失去 1 燭火，獲得 1 個稀有護符。', ok: run.candles > 0,
      async go(run) { const id = rollCharm(run, 'R'); if (!id) return '守燭人搖了搖頭。'; run.candles--; await Flow.gainCharm(run, id); return `你的一根蠟燭熄了，換來「${CHARMS[id].name}」。`; } },
    { label: '離開', detail: '什麼也不做。', async go() { return '燭火在你身後搖曳。'; } },
  ] });

defEvent({ id: 'ambush', name: '迷霧伏擊', glyph: '霧', acts: [1, 2, 3],
  text: '霧中有東西在等你。你可以正面迎戰，也可以付出代價繞路。',
  options: run => [
    { label: '迎戰', detail: '進行一場菁英戰鬥。勝利後照常獲得菁英獎勵。',
      async go(run) { return { combat: true }; } },
    { label: '繞路', detail: '失去 7 生命。', async go(run) { runLoseHp(run, 7); return '你在荊棘中繞了很久。-7 生命'; } },
  ] });

defEvent({ id: 'forge', name: '古鑄爐', glyph: '爐', acts: [1, 2, 3],
  text: '一座仍在燃燒的古老鑄爐，爐火會回應持符者的意志。',
  options: run => [
    { label: '鍛造', detail: '選擇一張牌升級。', async go(run) { const ok = await Flow.upgradeCard(run); return ok ? '爐火把符紙淬得更亮了。' : false; } },
    { label: '熔鑄', detail: '移除一張「打擊」或「防禦」，獲得 1 個隨機消耗品。',
      ok: run.deck.some(c => c.id === 'strike' || c.id === 'defend'),
      async go(run) {
        const ok = await Flow.removeCard(run, '熔掉一張打擊或防禦', c => c.id === 'strike' || c.id === 'defend');
        if (!ok) return false;
        const id = rollConsumable(); await Flow.gainConsumable(run, id);
        return `熔渣裡凝出了「${CONSUMABLES[id].name}」。`;
      } },
  ] });

defEvent({ id: 'well', name: '許願井', glyph: '井', acts: [1, 2, 3],
  text: '井底堆滿了別人的願望。井壁刻著一行字：「誠心者，得其所願。」',
  options: run => [
    { label: '投入 40 金', detail: '獲得 1 個隨機普通護符。', ok: run.gold >= 40,
      async go(run) { const id = rollCharm(run, 'C'); if (!id) return '井水沒有回應。'; run.gold -= 40; await Flow.gainCharm(run, id); return `井底浮上了「${CHARMS[id].name}」。`; } },
    { label: '許願健康', detail: '最大生命 +5。', async go(run) { run.maxHp += 5; run.hp += 5; return '你感到身體更結實了。+5 最大生命'; } },
  ] });

/* =========================================================
   古神：每一幕開始時降臨，三選一的祝福
   ========================================================= */
const BLESSINGS = {
  /* 第一幕 */
  hp10: { name: '溫養', desc: '最大生命 +10。', async go(run) { run.maxHp += 10; run.hp += 10; } },
  rare_card: { name: '天授', desc: '從 3 張稀有牌中選 1 張加入牌組。', async go(run) { const got = await Flow.chooseCard(rollCards(run, 3, { rarity: 'R' }), '選擇一張稀有牌', true); if (got) addToDeck(run, got); } },
  remove2: { name: '去蕪', desc: '從牌組移除 2 張牌。', async go(run) { await Flow.removeCards(run, 2, '移除 2 張牌'); } },
  charm_c: { name: '隨身物', desc: '獲得 1 個隨機普通護符。', async go(run) { const id = rollCharm(run, 'C'); if (id) await Flow.gainCharm(run, id); } },
  up2: { name: '點化', desc: '隨機升級 2 張牌。', async go(run) { upgradeRandom(run, 2); } },
  gold_curse: { name: '貪念', desc: '獲得 150 金，牌組加入 1 張詛咒「怨念」。', async go(run) { gainGold(run, 150); addToDeck(run, newCard('regret')); } },
  hp_for_charm: { name: '以血易寶', desc: '最大生命 -10，獲得 1 個隨機罕見護符。', async go(run) { run.maxHp -= 10; run.hp = Math.min(run.hp, run.maxHp); const id = rollCharm(run, 'U'); if (id) await Flow.gainCharm(run, id); } },
  transform_strikes: { name: '脫胎', desc: '將所有「打擊」轉化為主派系的隨機普通牌。',
    async go(run) { const pool = cardPool(run.primary, 'C'); for (const c of run.deck) if (c.id === 'strike') { c.id = RNG.pick(pool).id; c.up = false; } } },
  cons3: { name: '行囊', desc: '獲得 3 個隨機消耗品。', async go(run) { for (let i = 0; i < 3; i++) await Flow.gainConsumable(run, rollConsumable(), true); } },
  /* 第二幕 */
  energy_curse: { name: '燃命', desc: '永久 +1 能量，牌組加入 2 張詛咒「怨念」。', async go(run) { run.bonus.energy = (run.bonus.energy || 0) + 1; addToDeck(run, newCard('regret')); addToDeck(run, newCard('regret')); } },
  slot: { name: '廣納', desc: '護符欄位 +1。', async go(run) { run.bonus.charmSlots = (run.bonus.charmSlots || 0) + 1; } },
  up_basic: { name: '返璞', desc: '升級所有「打擊」與「防禦」。', async go(run) { for (const c of run.deck) if (c.id === 'strike' || c.id === 'defend') c.up = true; } },
  charm_pick: { name: '擇寶', desc: '從 3 個罕見護符中選 1 個。', async go(run) { await Flow.chooseCharm(run, rollCharms(run, 3, 'U'), '選擇一個護符'); } },
  inscribe2: { name: '銘刻', desc: '為 2 張牌各刻上 1 個隨機印記（可選擇哪 2 張）。', async go(run) { await Flow.inscribeRandom(run); await Flow.inscribeRandom(run); } },
  heal_full: { name: '甘霖', desc: '回滿生命，最大生命 +8。', async go(run) { run.maxHp += 8; run.hp = run.maxHp; } },
  card_pick_r: { name: '傳承', desc: '從 3 張稀有牌中選 1 張，並直接升級。', async go(run) { const got = await Flow.chooseCard(rollCards(run, 3, { rarity: 'R' }), '選擇一張稀有牌', true); if (got) { got.up = true; addToDeck(run, got); } } },
  /* 第三幕 */
  charm_rare: { name: '天命', desc: '從 3 個稀有護符中選 1 個。', async go(run) { await Flow.chooseCharm(run, rollCharms(run, 3, 'R'), '選擇一個稀有護符'); } },
  draw1: { name: '洞見', desc: '永久每回合多抽 1 張牌。', async go(run) { run.bonus.drawN = (run.bonus.drawN || 0) + 1; } },
  candle: { name: '續命', desc: '獲得 1 燭火，並回滿生命。', async go(run) { run.candles++; run.hp = run.maxHp; } },
  remove3: { name: '斷捨', desc: '從牌組移除 3 張牌。', async go(run) { await Flow.removeCards(run, 3, '移除 3 張牌'); } },
  echo: { name: '迴響', desc: '為一張牌刻上「迴響」（每場戰鬥第一次打出時觸發兩次）。', async go(run) { await Flow.inscribeSpecific(run, 'echo'); } },
  steps: { name: '流風', desc: '永久每回合 +1 步，每場戰鬥 +1 次重整。', async go(run) { run.bonus.freeSteps = (run.bonus.freeSteps || 0) + 1; run.bonus.redraws = (run.bonus.redraws || 0) + 1; } },
  gold_big: { name: '金山', desc: '獲得 220 金。', async go(run) { gainGold(run, 220); } },
};
const ANCIENTS = {
  1: { name: '守燭人・燈婆', glyph: '燈', line: '「孩子，路還長。帶一樣東西上路吧。」',
       pool: ['hp10', 'rare_card', 'remove2', 'charm_c', 'up2', 'gold_curse', 'hp_for_charm', 'transform_strikes', 'cons3'] },
  2: { name: '玄冥古龍', glyph: '冥', line: '「霜與燼在我鱗下交替了千年。說吧，你要哪一半？」',
       pool: ['energy_curse', 'slot', 'up_basic', 'charm_pick', 'inscribe2', 'heal_full', 'card_pick_r'] },
  3: { name: '雷淵之眼・太一', glyph: '一', line: '「你已看見塔頂。最後一程，我給你一樣真正的力量。」',
       pool: ['charm_rare', 'draw1', 'candle', 'remove3', 'echo', 'steps', 'gold_big'] },
};
