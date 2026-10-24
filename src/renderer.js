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

// 點彈窗外圍（遮罩）即關閉：計分表、戰績、說明
['score-modal', 'stats-modal', 'rules-modal'].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', (ev) => {
        if (ev.target === el) el.classList.add('hidden');
    });
});
if (window.btnPass) btnPass.onclick = () => passTurn();

if (window.btnNew) {
    btnNew.onclick = () => {
        if (!gameState.gameEnded && gameState.players[0].length > 0) {
            showConfirm(t('confirmNewGame'), () => {
                initGame();
            });
        } else {
            initGame();
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
