'use strict';
/* =========================================================
   啟動
   ========================================================= */
function start(data) {
  UI.init();
  // 頁面熱更新後若原本在旅程中，直接接續存檔
  if (data && data.resume && Game.hasSave() && Game.load()) { UI.render(); return; }
  UI.render();
}

if (window.claude && window.claude.hot && window.claude.hot.snapshot) {
  window.claude.hot.snapshot(() => ({ resume: !!(Game.run && !Game.run.ended) }));
}
if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
