/**
 * Renderer Process Entry Point
 * Orchestrates event bindings and invokes sub-controllers
 */

// Bind actions to DOM elements
if (window.btnPlay) btnPlay.onclick = () => playCards();
if (window.btnPass) btnPass.onclick = () => passTurn();
if (window.btnShout) btnShout.onclick = () => shoutLa();

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
