// DOM Elements definitions on window/global scope for shared access
window.humanCardsContainer = document.getElementById('human-cards');
window.statusMessage = document.getElementById('status-message');
window.btnPlay = document.getElementById('btn-play');
window.btnPass = document.getElementById('btn-pass');
window.btnNew = document.getElementById('btn-new');
window.infoIcon = document.getElementById('info-icon');
window.rulesModal = document.getElementById('rules-modal');
window.alertModal = document.getElementById('alert-modal');
window.alertMessage = document.getElementById('alert-message');

window.confirmModal = document.getElementById('confirm-modal');
window.confirmMessage = document.getElementById('confirm-message');
window.confirmYes = document.getElementById('confirm-yes');
window.confirmNo = document.getElementById('confirm-no');
window.closeBtn = document.querySelector('.close-btn');
window.langToggle = document.getElementById('lang-toggle');
window.muteToggle = document.getElementById('mute-toggle');
window.trialStatus = document.getElementById('trial-status');

const SUIT_SYMBOLS = ['♣', '♦', '♥', '♠'];
const RANK_LABELS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];

// Multi-row hand layout constants (declared before updateResponsiveLayout() runs,
// because that function may re-render the hand on the very first call).
const HAND_ROW_SIZE = 5;          // 每排最多 5 張，讓 5 張牌型能被完整看見
const HAND_ROW_MIN_CARDS = 7;     // 6 張以下單排還放得下，不需要拆排

// 排列模式：smart = 依鋤大地 5 張牌型自動聚組；five = 每 5 張一排；single = 原本單排
const HAND_LAYOUT_MODES = ['smart', 'five', 'single'];
const HAND_LAYOUT_STORAGE_KEY = 'handLayoutMode';

// 5 張牌型的辨識優先度（數值越大越先聚組）
const FIVE_CARD_PRIORITY = {
    STRAIGHT_FLUSH: 5,
    FOUR_OF_A_KIND: 4,
    FULL_HOUSE: 3,
    FLUSH: 2,
    STRAIGHT: 1
};

const COMBO_LABELS = {
    zh: { STRAIGHT_FLUSH: '同花順', FOUR_OF_A_KIND: '鐵支', FULL_HOUSE: '葫蘆', FLUSH: '同花', STRAIGHT: '順子' },
    en: { STRAIGHT_FLUSH: 'StraightFlush', FOUR_OF_A_KIND: 'FourKind', FULL_HOUSE: 'FullHouse', FLUSH: 'Flush', STRAIGHT: 'Straight' }
};

const LAYOUT_MODE_LABELS = {
    zh: { smart: '牌型', five: '5張', single: '單排' },
    en: { smart: 'Combos', five: '5/row', single: 'Row' }
};

function currentLangKey() {
    return (typeof window.currentLang === 'string' && window.currentLang.startsWith('en')) ? 'en' : 'zh';
}

// 手機豎屏：把四家的出牌槽搬進桌面中央（左/上/右/下按座位方位擺放）
// 桌面版維持原本「出牌槽貼在座位旁」的排版。
function setupTablePlays() {
    const wrap = document.getElementById('table-plays');
    if (!wrap) return;
    const mobile = document.body.classList.contains('mobile-layout');

    ['played-1', 'played-2', 'played-3', 'played-4'].forEach(id => {
        const slot = document.getElementById(id);
        if (!slot) return;

        if (mobile) {
            if (slot.parentElement !== wrap) {
                slot._originParent = slot.parentElement;
                slot._originNext = slot.nextSibling;
                wrap.appendChild(slot);
            }
        } else if (slot.parentElement === wrap) {
            const parent = slot._originParent;
            if (parent) {
                parent.insertBefore(slot, slot._originNext && slot._originNext.parentElement === parent ? slot._originNext : null);
            }
        }
    });
}

// Dynamically handle mobile-layout based on environment and window width
function updateResponsiveLayout() {
    const isAndroid = (typeof AppEnv !== 'undefined' && AppEnv.isAndroid);
    const isNarrow = window.innerWidth < 900; // Trigger mobile layout below 900px
    const useMobile = isAndroid || isNarrow;
    const wasMobile = document.body.classList.contains('mobile-layout');
    if (useMobile) {
        document.body.classList.add('mobile-layout');
        document.documentElement.classList.add('mobile-layout');
    } else {
        document.body.classList.remove('mobile-layout');
        document.documentElement.classList.remove('mobile-layout');
    }
    // 出牌槽跟著版面切換位置（桌面中央 / 座位旁）
    setupTablePlays();
    // Re-render the hand so the multi-row split follows the active layout
    if (wasMobile !== useMobile && window.gameState && Array.isArray(window.gameState.players) &&
        Array.isArray(window.gameState.players[0]) && typeof renderHumanHand === 'function') {
        renderHumanHand();
    }
}
updateResponsiveLayout();
window.addEventListener('resize', updateResponsiveLayout);

// Tab Switching Logic
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
        const tabId = btn.getAttribute('data-tab');
        const modal = btn.closest('.modal-content');
        
        // Update buttons
        modal.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        // Update content
        modal.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        modal.querySelector(`#tab-${tabId}`).classList.add('active');
        if (tabId === 'manage' && typeof window.loadNpcCacheList === 'function') {
            window.loadNpcCacheList();
        }
    };
});

function updateDynamicAvatars() {
    if (!window.activeDynamicAvatars) return;
    for (const [i, avatarInstance] of Object.entries(window.activeDynamicAvatars)) {
        const playerIndex = parseInt(i);
        const hand = gameState.players[playerIndex];
        if (!hand) continue;

        // X: 局勢順逆
        const progress = 1.0 - (hand.length / 13);
        let x = (progress * 2.0) - 1.0;
        if (gameState.lastPlayerIndex === -1 || gameState.lastPlayerIndex === playerIndex) {
            x += 0.2;
        }
        x = Math.max(-1.0, Math.min(1.0, x));

        // Y: 情緒張力
        let y = 0.15;
        if (gameState.turn === playerIndex) y += 0.15;
        
        const othersCloseToWin = gameState.players.some((p, idx) => idx !== playerIndex && p.length <= 2);
        const othersDeclared = gameState.declared.some((v, idx) => idx !== playerIndex && v);
        if (othersCloseToWin || othersDeclared) {
            y += 0.5;
        }
        if (gameState.lastPlay && gameState.lastPlayerIndex !== playerIndex) {
            y += 0.2;
        }
        y = Math.max(0.0, Math.min(1.0, y));

        avatarInstance.updatePsychologicalState(x, y);
    }
}

function renderAll() {
    renderHumanHand();
    renderAIPlayers();
    renderPlayerActions();
    updateStatus();
    updatePlayButtonVisibility();
    updateDynamicAvatars();
}

// --- Portrait / mobile hand layout ---------------------------------------
// 起手時把自家手牌自動分成多排（每排最多 5 張），讓 順子 / 葫蘆 / 同花 等
// 5 張牌型可以一眼看出來。13 張 = 5+5+3（三排）、10 張 = 5+5（兩排）。
function isMobileLayout() {
    return document.body.classList.contains('mobile-layout');
}

function getHandLayoutMode() {
    const saved = (typeof AppStorage !== 'undefined' && AppStorage.getItem(HAND_LAYOUT_STORAGE_KEY)) || 'smart';
    return HAND_LAYOUT_MODES.includes(saved) ? saved : 'smart';
}

function cycleHandLayoutMode() {
    const current = getHandLayoutMode();
    const next = HAND_LAYOUT_MODES[(HAND_LAYOUT_MODES.indexOf(current) + 1) % HAND_LAYOUT_MODES.length];
    if (typeof AppStorage !== 'undefined') AppStorage.setItem(HAND_LAYOUT_STORAGE_KEY, next);
    renderHumanHand();
    return next;
}

function updateHandLayoutButton() {
    const btn = document.getElementById('btn-hand-layout');
    if (!btn) return;
    const mode = getHandLayoutMode();
    const labels = LAYOUT_MODE_LABELS[currentLangKey()] || LAYOUT_MODE_LABELS.zh;
    btn.textContent = `🃏 ${labels[mode] || labels.smart}`;
    btn.dataset.mode = mode;
}

// 在整手牌裡找出可以打出的 5 張牌型（鐵支 / 同花順 / 葫蘆 / 同花 / 順子），
// 以「牌型強度優先」貪婪地挑出不重疊的組合（最多 3 組）。
// 判定完全交給 GameLogic.getHandInfo()，所以台港規則差異（例如台版不能單打同花）自動生效。
let fiveCardComboCache = new Map();

function findFiveCardCombos(cards) {
    if (!cards || cards.length < 5) return [];
    const ruleMode = (typeof AppStorage !== 'undefined' && AppStorage.getItem('ruleMode')) || 'mainland';
    const cacheKey = `${ruleMode}|${GameLogic.sortCards(cards).join(',')}`;
    if (fiveCardComboCache.has(cacheKey)) return fiveCardComboCache.get(cacheKey);

    const pool = [...cards];
    const combos = [];
    for (let round = 0; round < 3; round++) {
        const best = findBestFiveCardCombo(pool);
        if (!best) break;
        combos.push(best);
        const used = new Set(best.cards);
        for (let i = pool.length - 1; i >= 0; i--) {
            if (used.has(pool[i])) pool.splice(i, 1);
        }
    }

    if (fiveCardComboCache.size > 60) fiveCardComboCache.clear();
    fiveCardComboCache.set(cacheKey, combos);
    return combos;
}

function findBestFiveCardCombo(cards) {
    const n = cards.length;
    if (n < 5) return null;
    let best = null;
    for (let a = 0; a < n - 4; a++) {
        for (let b = a + 1; b < n - 3; b++) {
            for (let c = b + 1; c < n - 2; c++) {
                for (let d = c + 1; d < n - 1; d++) {
                    for (let e = d + 1; e < n; e++) {
                        const combo = [cards[a], cards[b], cards[c], cards[d], cards[e]];
                        const info = GameLogic.getHandInfo(combo);
                        if (!info) continue;
                        const priority = FIVE_CARD_PRIORITY[info.type];
                        if (!priority) continue;
                        if (!best || priority > best.priority ||
                            (priority === best.priority && info.value > best.value)) {
                            best = {
                                cards: GameLogic.sortCards(combo),
                                type: info.type,
                                priority,
                                value: info.value
                            };
                        }
                    }
                }
            }
        }
    }
    return best;
}

function chunkHandIntoRows(cards) {
    const rows = [];
    for (let i = 0; i < cards.length; i += HAND_ROW_SIZE) {
        rows.push(cards.slice(i, i + HAND_ROW_SIZE));
    }
    return rows;
}

// 依模式組出「列」：每列 = { cards, combo }
// smart：先放 5 張牌型組（整組不拆、置於該排最前），其餘散牌補在後面，
//        總張數 >6 時盡量壓成兩排（13 張 = 7+6），比三排更省高度。
// five ：嚴格每排 5 張。
function buildHandRows(cards, mode) {
    if (mode === 'smart') {
        const combos = findFiveCardCombos(cards);
        const total = cards.length;
        const rowCount = total <= 6 ? 1 : Math.max(2, Math.ceil(total / 7));
        const capacity = Math.ceil(total / rowCount);

        const rows = [];
        combos.forEach(combo => {
            if (rows.length < rowCount) rows.push({ cards: [...combo.cards], combo });
        });

        const used = new Set();
        combos.forEach(combo => combo.cards.forEach(id => used.add(id)));
        const rest = cards.filter(id => !used.has(id));

        rest.forEach(id => {
            let target = rows.find(row => row.cards.length < capacity);
            if (!target) {
                target = { cards: [], combo: null };
                rows.push(target);
            }
            target.cards.push(id);
        });

        if (rows.length) return rows;
    }
    return chunkHandIntoRows(cards).map(chunk => ({ cards: chunk, combo: null }));
}

function createHumanCardElement(cardId) {
    const cardEl = createCardElement(cardId);
    if (gameState.selectedCards.has(cardId)) {
        cardEl.classList.add('selected');
    }
    cardEl.onclick = () => {
        AudioPlayer.playCardSelect();
        if (gameState.selectedCards.has(cardId)) {
            gameState.selectedCards.delete(cardId);
            cardEl.classList.remove('selected');
        } else {
            gameState.selectedCards.add(cardId);
            cardEl.classList.add('selected');
        }
        updatePlayButtonVisibility();
    };
    return cardEl;
}

function renderHumanHand() {
    if (!humanCardsContainer) return;
    humanCardsContainer.innerHTML = '';
    updateHandLayoutButton();

    const cards = gameState.players[0] || [];
    const mode = isMobileLayout() ? getHandLayoutMode() : 'single';
    const useRows = isMobileLayout() && mode !== 'single' && cards.length >= HAND_ROW_MIN_CARDS;
    humanCardsContainer.classList.toggle('multi-row', useRows);
    humanCardsContainer.classList.toggle('combo-mode', useRows && mode === 'smart');

    if (!useRows) {
        cards.forEach(cardId => humanCardsContainer.appendChild(createHumanCardElement(cardId)));
        return;
    }

    const lang = currentLangKey();
    buildHandRows(cards, mode).forEach((row, rowIndex) => {
        const rowEl = document.createElement('div');
        rowEl.className = 'hand-row';
        rowEl.dataset.row = String(rowIndex + 1);
        if (row.combo) {
            rowEl.classList.add('combo-row');
            rowEl.dataset.combo = (COMBO_LABELS[lang] || COMBO_LABELS.zh)[row.combo.type] || '';
        }
        row.cards.forEach(cardId => rowEl.appendChild(createHumanCardElement(cardId)));
        humanCardsContainer.appendChild(rowEl);
    });
}

function createCardElement(cardId) {
    const rank = GameLogic.getRank(cardId);
    const suit = GameLogic.getSuit(cardId);
    const cardEl = document.createElement('div');
    cardEl.className = `card ${suit === 1 || suit === 2 ? 'red' : 'black'}`;
    cardEl.innerHTML = `
        <span class="rank">${RANK_LABELS[rank]}</span>
        <span class="suit">${SUIT_SYMBOLS[suit]}</span>
    `;
    return cardEl;
}

function renderAIPlayers() {
    for (let i = 1; i < 4; i++) {
        const el = document.getElementById(`player-${i + 1}`);
        if (!el) continue;
        const countEl = el.querySelector('.cards-count');
        const nameEl = el.querySelector('.name');
        const scoreEl = el.querySelector('.score') || createScoreElement(el);

        scoreEl.textContent = `Score: ${gameState.scores[i]}`;

        // Show cards if game ended, otherwise show count
        if (gameState.gameEnded) {
            countEl.innerHTML = '';
            const sortedHand = GameLogic.sortCards(gameState.players[i]);
            sortedHand.forEach(cardId => {
                const cardEl = createCardElement(cardId);
                cardEl.classList.add('revealed-card');
                countEl.appendChild(cardEl);
            });
            countEl.style.display = 'flex';
        } else {
            countEl.textContent = `${gameState.players[i].length} cards`;
            countEl.style.display = 'block';
        }

        nameEl.textContent = PLAYER_NAMES[i];

        if (gameState.players[i] && gameState.players[i].length === 1) {
            nameEl.classList.add('shouted-name');
        } else {
            nameEl.classList.remove('shouted-name');
        }

        const hasLead = (gameState.lastPlayerIndex === -1 && i === gameState.turn) || (gameState.lastPlayerIndex === i);
        if (hasLead) {
            el.classList.add('has-lead');
        } else {
            el.classList.remove('has-lead');
        }

        if (gameState.turn === i) {
            el.classList.add('active');
        } else {
            el.classList.remove('active');
        }
    }

    const humanEl = document.getElementById('human-area');
    if (humanEl) {
        const humanNameEl = humanEl.querySelector('.name');
        const humanScoreEl = humanEl.querySelector('.score') || createScoreElement(humanEl);

        if (humanNameEl) {
            humanNameEl.textContent = PLAYER_NAMES[0];
            humanScoreEl.textContent = `Score: ${gameState.scores[0]}`;
            if (gameState.players[0] && gameState.players[0].length === 1) {
                humanNameEl.classList.add('shouted-name');
            } else {
                humanNameEl.classList.remove('shouted-name');
            }
        }

        const hasLeadHuman = (gameState.lastPlayerIndex === -1 && gameState.turn === 0) || (gameState.lastPlayerIndex === 0);
        if (hasLeadHuman) {
            humanEl.classList.add('has-lead');
        } else {
            humanEl.classList.remove('has-lead');
        }

        if (gameState.turn === 0) {
            humanEl.classList.add('active');
        } else {
            humanEl.classList.remove('active');
        }
    }
}

function renderPlayerActions() {
    for (let i = 0; i < 4; i++) {
        const slot = document.getElementById(`played-${i + 1}`);
        if (!slot) continue;
        slot.innerHTML = '';
        slot.classList.remove('active-play');

        const action = gameState.playerLastActions[i];
        if (!action) continue;

        if (i === gameState.lastPlayerIndex) {
            slot.classList.add('active-play');
        }

        if (action === "PASS") {
            const passEl = document.createElement('div');
            passEl.className = 'slot-pass';
            passEl.textContent = t('passMsg');
            slot.appendChild(passEl);
        } else {
            action.forEach(cardId => {
                const cardEl = createCardElement(cardId);
                cardEl.classList.add('slot-card');
                slot.appendChild(cardEl);
            });
        }
    }
}

function updateStatus() {
    if (!statusMessage) return;
    if (gameState.players[0].length === 0 && !gameState.gameEnded) {
        statusMessage.textContent = t('waiting');
        return;
    }

    if (gameState.gameEnded) {
        // Find winner if any
        for (let i = 0; i < 4; i++) {
            if (gameState.players[i].length === 0) {
                statusMessage.textContent = t('winner', { name: PLAYER_NAMES[i] });
                return;
            }
        }
        return;
    }

    const isHumanTurn = (gameState.turn === 0 && (!window.AI || !window.AI.getCharacter(0)));
    if (isHumanTurn) {
        statusMessage.textContent = t('yourTurn');
    } else {
        statusMessage.textContent = t('npcTurn', { name: PLAYER_NAMES[gameState.turn] });
    }
}

function updatePlayButtonVisibility() {
    const hand = gameState.players[0];
    const hasLead = (gameState.lastPlayerIndex === -1 || gameState.lastPlayerIndex === 0);

    if (gameState.gameEnded) {
        btnPlay.classList.add('hidden');
        btnPass.classList.add('hidden');
        return;
    }

    // Hide buttons if not human turn
    const isHumanTurn = (gameState.turn === 0 && (!window.AI || !window.AI.getCharacter(0)));
    if (!isHumanTurn) {
        btnPlay.classList.add('hidden');
        btnPass.classList.add('hidden');
        return;
    }

    const canMove = hasLead ? true : GameLogic.hasValidMoves(hand, gameState.lastPlay);

    if (hasLead || canMove) btnPlay.classList.remove('hidden');
    else btnPlay.classList.add('hidden');

    // Hide Pass if player has the lead (new round or start)
    if (hasLead) btnPass.classList.add('hidden');
    else btnPass.classList.remove('hidden');
}

function createScoreElement(parent) {
    const info = parent.querySelector('.info');
    const scoreEl = document.createElement('span');
    scoreEl.className = 'score';
    if (info) info.appendChild(scoreEl);
    else parent.appendChild(scoreEl);
    return scoreEl;
}

function showConfirm(msg, onYes) {
    confirmMessage.textContent = msg;
    confirmModal.classList.remove('hidden');
    confirmYes.onclick = () => {
        confirmModal.classList.add('hidden');
        onYes();
    };
    confirmNo.onclick = () => confirmModal.classList.add('hidden');
}

function showPassIndicator(playerIndex) {
    triggerShoutEffect(playerIndex, t('passMsg'), false);
}

function triggerShoutEffect(playerIndex, message = "報單", shake = true) {
    const container = document.getElementById('game-container');
    const playerEl = playerIndex === 0 ? document.getElementById('human-area') : document.getElementById(`player-${playerIndex + 1}`);
    if (!playerEl) return;

    const bubble = playerEl.querySelector('.speech-bubble');
    if (bubble) {
        bubble.classList.remove('shrunk-bubble', 'hover-expanded');
        bubble.textContent = message;
        
        const isShort = message.length <= 4;
        if (isShort) {
            bubble.classList.add('short-bubble');
            delete bubble.dataset.originalText;
        } else {
            bubble.classList.remove('short-bubble');
            bubble.dataset.originalText = message;
        }

        bubble.classList.remove('hidden');
        
        if (bubble._hideTimeout) {
            clearTimeout(bubble._hideTimeout);
        }
        bubble._hideTimeout = setTimeout(() => {
            if (isShort) {
                bubble.classList.add('hidden');
                bubble.classList.remove('short-bubble');
            } else {
                bubble.classList.add('shrunk-bubble');
                bubble.textContent = "💬";
            }
        }, isShort ? 2000 : 4500);
    }

    // Screen Shake
    if (shake && container) {
        container.classList.remove('shake');
        void container.offsetWidth; // Trigger reflow
        container.classList.add('shake');
        setTimeout(() => container.classList.remove('shake'), 500);
    }
}

function showAlert(msg) {
    alertMessage.textContent = msg;
    alertModal.classList.remove('hidden');
}

// Close Modal Logic for all Close Buttons (supports instant mobile touch)
document.querySelectorAll('.close-btn').forEach(btn => {
    const handleClose = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        const modal = btn.closest('.modal');
        if (modal) modal.classList.add('hidden');
    };
    btn.onclick = handleClose;
    btn.addEventListener('touchstart', handleClose, { passive: false });
});

window.onclick = (event) => {
    // 點遮罩關閉（計分表／戰績在 renderer.js 另有綁定）
    const backdrops = [rulesModal, alertModal, confirmModal, document.getElementById('score-modal'), document.getElementById('stats-modal')];
    if (backdrops.includes(event.target)) {
        rulesModal.classList.add('hidden');
        alertModal.classList.add('hidden');
        confirmModal.classList.add('hidden');
        if (event.target !== rulesModal && event.target !== alertModal && event.target !== confirmModal) {
            event.target.classList.add('hidden');
        }
    }
};

// Initialize speech bubble hover interactions
(function setupSpeechBubbleHovers() {
    const initHovers = () => {
        document.querySelectorAll('.speech-bubble').forEach(bubble => {
            bubble.addEventListener('mouseenter', () => {
                if (bubble.classList.contains('shrunk-bubble')) {
                    bubble.classList.remove('shrunk-bubble');
                    bubble.classList.add('hover-expanded');
                    if (bubble.dataset.originalText) {
                        bubble.textContent = bubble.dataset.originalText;
                    }
                }
            });
            bubble.addEventListener('mouseleave', () => {
                if (bubble.classList.contains('hover-expanded')) {
                    bubble.classList.remove('hover-expanded');
                    bubble.classList.add('shrunk-bubble');
                    bubble.textContent = "💬";
                }
            });
        });
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initHovers);
    } else {
        initHovers();
    }
})();

// Hide Electron custom window controls in non-Electron environments (Android/Capacitor/Browser)
(function() {
    if (typeof AppEnv !== 'undefined' && !AppEnv.isElectron) {
        const hideControls = () => {
            const controls = document.querySelectorAll('.window-controls');
            controls.forEach(el => {
                el.style.display = 'none';
            });
            console.log(`[Renderer] Non-Electron environment detected. Hidden ${controls.length} .window-controls elements.`);
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', hideControls);
        } else {
            hideControls();
        }
    }
})();

// Export view functions globally
window.updateResponsiveLayout = updateResponsiveLayout;
window.renderAll = renderAll;
window.renderHumanHand = renderHumanHand;
window.createCardElement = createCardElement;
window.renderAIPlayers = renderAIPlayers;
window.renderPlayerActions = renderPlayerActions;
window.updateStatus = updateStatus;
window.updatePlayButtonVisibility = updatePlayButtonVisibility;
window.createScoreElement = createScoreElement;
window.showConfirm = showConfirm;
window.showPassIndicator = showPassIndicator;
window.triggerShoutEffect = triggerShoutEffect;
window.showAlert = showAlert;

// 手牌排列切換按鈕（牌型 → 5張 → 單排 → 牌型 …）
(function setupHandLayoutToggle() {
    const btn = document.getElementById('btn-hand-layout');
    if (!btn) return;
    const activate = (e) => {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }
        cycleHandLayoutMode();
    };
    btn.addEventListener('click', activate);
    btn.addEventListener('touchstart', activate, { passive: false });
    updateHandLayoutButton();
})();

window.updateHandLayoutButton = updateHandLayoutButton;
window.cycleHandLayoutMode = cycleHandLayoutMode;
window.getHandLayoutMode = getHandLayoutMode;
window.findFiveCardCombos = findFiveCardCombos;
