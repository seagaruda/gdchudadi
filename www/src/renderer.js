/**
 * Renderer Process Entry Point
 * Orchestrates event bindings and invokes sub-controllers
 */

// Bind actions to DOM elements
if (window.btnPlay) btnPlay.onclick = () => playCards();

// 局末计分表的「下一局」
const scoreNextBtn = document.getElementById('score-next-btn');
if (scoreNextBtn) scoreNextBtn.onclick = () => initGame();

// 局末：计分框被点掉后，点牌桌正中也能开下一局
const tableCenterEl = document.getElementById('table-center');
if (tableCenterEl) {
    tableCenterEl.onclick = () => {
        const g = window.gameState;
        if (!g) return;
        // 首次开启：点桌面正中开始第一局
        if (g.pendingStart) { initGame(); return; }
        if (!g.gameEnded) return;
        const modal = window.scoreModalEl || document.getElementById('score-modal');
        if (modal && !modal.classList.contains('hidden')) return;   // 框还开着就让框自己处理
        initGame();
    };
}

// 战绩按钮（Information 左侧）
const statsBtn = document.getElementById('stats-btn');
if (statsBtn) statsBtn.onclick = () => showSessionStats();
const statsCloseBtn = document.getElementById('stats-close-btn');
if (statsCloseBtn) statsCloseBtn.onclick = () => document.getElementById('stats-modal').classList.add('hidden');

// 遮罩点击关闭统一在 GameView 的 window.onclick 处理（含计分表／战绩／说明）
if (window.btnPass) btnPass.onclick = () => passTurn();

if (window.btnNew) {
    btnNew.onclick = () => {
        // 「新游戏」＝重新开一轮会话：先出规则回到「♦3 先出」
        const startFresh = () => {
            window.lastRoundWinner = -1;
            window.roundsPlayed = 0;
            window.sessionScores = [0, 0, 0, 0];
            window.sessionWins = [0, 0, 0, 0];
            window.roundHistory = [];
            window.roundDetails = [];
            initGame();
        };
        if (!gameState.gameEnded && gameState.players[0].length > 0) {
            showConfirm(t('confirmNewGame'), startFresh);
        } else {
            startFresh();
        }
    };
}

if (window.langToggle) {
    langToggle.onclick = () => {
        window.currentLang = currentLang === 'en' ? 'zh' : 'en';
        updateLanguage();
    };
}

if (window.infoIcon) {
    infoIcon.onclick = () => {
        if (rulesModal) rulesModal.classList.remove('hidden');
    };
}



// Initial orchestration run
setupAvatarClickListeners();
updateLanguage();
// 首次开启不自动发牌：画面中间提示「点击桌面中间开始第一局」，点桌面正中才 initGame()
updateStatus();
