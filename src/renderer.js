/**
 * Renderer Process Entry Point
 * Orchestrates event bindings and invokes sub-controllers
 */

// 一次性遷移：舊存檔若是台灣規則，切換為大陸鋤大地（梅花 > 方塊）
try {
    if (typeof AppStorage !== 'undefined' && AppStorage.getItem('ruleModeMigratedMainland') !== '1') {
        AppStorage.setItem('ruleMode', 'mainland');
        AppStorage.setItem('ruleModeMigratedMainland', '1');
    }
} catch (e) { /* ignore */ }

// Bind actions to DOM elements
if (window.btnPlay) btnPlay.onclick = () => playCards();

// 局末計分表的「下一局」
const scoreNextBtn = document.getElementById('score-next-btn');
if (scoreNextBtn) scoreNextBtn.onclick = () => initGame();

// 戰績按鈕（Information 左側）
const statsBtn = document.getElementById('stats-btn');
if (statsBtn) statsBtn.onclick = () => showSessionStats();
const statsCloseBtn = document.getElementById('stats-close-btn');
if (statsCloseBtn) statsCloseBtn.onclick = () => document.getElementById('stats-modal').classList.add('hidden');

// 遮罩點擊關閉統一在 GameView 的 window.onclick 處理（含計分表／戰績／說明）
if (window.btnPass) btnPass.onclick = () => passTurn();

if (window.btnNew) {
    btnNew.onclick = () => {
        // 「新遊戲」＝重新開一輪會話：先出規則回到「♦3 先出」
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
initGame();
