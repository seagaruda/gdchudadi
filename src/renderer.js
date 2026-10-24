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
