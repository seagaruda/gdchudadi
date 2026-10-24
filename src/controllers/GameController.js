// Global Game States
window.ipcRenderer = null;
if (typeof require !== 'undefined') {
    try {
        const electron = require('electron');
        window.ipcRenderer = electron.ipcRenderer;
    } catch (e) {
        console.warn('[Renderer] Running in non-Electron environment. ipcRenderer disabled.');
    }
}

window.soundMode = parseInt(AppStorage.getItem('soundMode')) || 0; // 0: All, 1: SFX Only, 2: None
window.trialDaysRemaining = null;
window.currentLang = 'zh';

window.PLAYER_NAMES_EN = ["You", "Alex (NPC)", "Bella (NPC)", "Chris (NPC)"];
window.PLAYER_NAMES_ZH = ["你", "艾力克斯 (NPC)", "貝拉 (NPC)", "克里斯 (NPC)"];
window.PLAYER_NAMES = window.PLAYER_NAMES_ZH;

window.gameState = {
    players: [[], [], [], []], // 0 is human, 1-3 are AI
    turn: 0,
    lastPlay: null,
    lastPlayerIndex: -1,
    selectedCards: new Set(),
    declared: [false, false, false, false], // 已「報單」公告（手牌剩 1 張）
    gameEnded: false,
    scores: [0, 0, 0, 0],
    playerLastActions: [null, null, null, null], // null, "PASS", or Array of cards
    playedCards: [], // Persistent tracking of all cards played this game
    gameLog: [] // Chronological log of all actions for reflection
};

window.aiTurnTimeout = null;
window.aiProcessing = false;

// Keyboard interaction cycle index
window.cycleIndex = -1;
window.downKeyCount = 0;
window.lastDownKeyTime = 0;

function resetCycleState() {
    window.cycleIndex = -1;
    window.downKeyCount = 0;
}
window.resetCycleState = resetCycleState;

function initGame() {
    if (window.alertModal) window.alertModal.classList.add('hidden');
    gameState.gameEnded = false;
    gameState.declared = [false, false, false, false];
    gameState.selectedCards.clear();
    gameState.lastPlay = null;
    gameState.lastPlayerIndex = -1;
    gameState.playerLastActions = [null, null, null, null];
    gameState.playedCards = [];
    gameState.gameLog = [];

    // Generate deck
    let deck = Array.from({ length: 52 }, (_, i) => i);
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    // Deal
    gameState.players = [
        deck.slice(0, 13),
        deck.slice(13, 26),
        deck.slice(26, 39),
        deck.slice(39, 52)
    ];

    // Sort human hand
    gameState.players[0] = GameLogic.sortCards(gameState.players[0]);

    // Find who has the starting card (Club 3 = 0 for Taiwan, Diamond 3 = 13 for HK)
    const ruleMode = AppStorage.getItem('ruleMode') || 'mainland';
    const startCard = ruleMode === 'taiwan' ? 0 : 13;
    for (let i = 0; i < 4; i++) {
        if (gameState.players[i].includes(startCard)) {
            gameState.turn = i;
            break;
        }
    }

    // Check for Dragon Win at start
    for (let i = 0; i < 4; i++) {
        const info = GameLogic.getHandInfo(gameState.players[i]);
        if (info && info.type === 'DRAGON') {
            handleDragonWin(i);
            return;
        }
    }

    gameState.lastPlay = null;
    gameState.selectedCards.clear();
    gameState.declared = [false, false, false, false];
    gameState.gameEnded = false;

    renderAll();
    updateStatus();

    const isHumanTurn = (gameState.turn === 0 && (!window.AI || !window.AI.getCharacter(0)));
    if (!isHumanTurn) {
        const delay = (window.AI && window.AI.getCharacter(0)) ? 100 : 1000;
        setTimeout(aiTurn, delay);
    }
}
window.initGame = initGame;

// 出牌順序為逆時針 0 → 3 → 2 → 1，所以「下家」（接著出牌的人）是 (i + 3) % 4
function nextPlayerIndex(playerIndex) {
    return (playerIndex + 3) % 4;
}
window.nextPlayerIndex = nextPlayerIndex;

// 報單頂大：下家只剩 1 張時，該家（上家）出單張必須先出自己最大的牌
function mustTopSingle(playerIndex) {
    const nextHand = gameState.players[nextPlayerIndex(playerIndex)];
    return !!nextHand && nextHand.length === 1;
}
window.mustTopSingle = mustTopSingle;

function largestSingle(playerIndex) {
    const hand = gameState.players[playerIndex] || [];
    if (hand.length === 0) return null;
    return hand.reduce((best, c) => (GameLogic.compareCards(c, best) > 0 ? c : best), hand[0]);
}
window.largestSingle = largestSingle;

function playCards() {
    if (gameState.turn !== 0) return;

    const selected = Array.from(gameState.selectedCards);
    if (selected.length === 0) return;

    // Validate play
    const info = GameLogic.getHandInfo(selected);
    if (!info) {
        showAlert(t('invalidHand'));
        return;
    }

    // 大陸規則：只有張數相同的牌可以比大小
    if (gameState.lastPlay && gameState.lastPlayerIndex !== 0) {
        if (selected.length !== gameState.lastPlay.length) {
            showAlert(t('mustPlayCount', { count: gameState.lastPlay.length }));
            return;
        }
        if (GameLogic.compareHands(selected, gameState.lastPlay) <= 0) {
            showAlert(t('mustBeHigher'));
            return;
        }
    }

    // 首輪必須帶方塊 3
    if (gameState.lastPlayerIndex === -1 && !selected.includes(GameLogic.getStartCard())) {
        showAlert(t('mustInclude3D'));
        return;
    }

    // 報單頂大
    if (selected.length === 1 && mustTopSingle(0) && selected[0] !== largestSingle(0)) {
        showAlert(t('mustTopSingle'));
        return;
    }

    executePlay(0, selected);
}
window.playCards = playCards;

function passTurn() {
    if (gameState.turn !== 0) return;
    if (gameState.lastPlayerIndex === -1 || gameState.lastPlayerIndex === 0) {
        showAlert(t('cannotPass'));
        return;
    }

    const char0 = window.AI ? window.AI.getCharacter(0) : null;
    AudioPlayer.playPass(char0 ? char0.name : 'you');
    gameState.playerLastActions[0] = "PASS";
    gameState.gameLog.push({ turn: gameState.gameLog.length, player: 0, action: "PASS" });
    showPassIndicator(0);
    nextTurn();
}
window.passTurn = passTurn;

function executePlay(playerIndex, cards) {
    AudioPlayer.playCardPlay();
    gameState.players[playerIndex] = gameState.players[playerIndex].filter(c => !cards.includes(c));

    // Clear all slots if this is a new round (taking the lead)
    if (gameState.lastPlayerIndex === -1 || gameState.lastPlayerIndex === playerIndex) {
        gameState.playerLastActions = [null, null, null, null];
    }

    gameState.playerLastActions[playerIndex] = cards;
    gameState.lastPlay = cards;
    gameState.lastPlayerIndex = playerIndex;
    gameState.selectedCards.clear();

    // Track played cards and log action
    gameState.playedCards.push(...cards);
    gameState.gameLog.push({ turn: gameState.gameLog.length, player: playerIndex, action: cards });

    // 報單：任何一家手牌只剩 1 張時公告一次（公告後其上家出單張必須頂大）
    for (let i = 0; i < 4; i++) {
        if (gameState.players[i].length === 1 && !gameState.declared[i]) {
            gameState.declared[i] = true;
            const char = window.AI ? window.AI.getCharacter(i) : null;
            AudioPlayer.playDeclare(char ? char.name : 'you');
            triggerShoutEffect(i, t('declareOneCard'));
        }
    }

    if (gameState.players[playerIndex].length === 0) {
        gameState.gameEnded = true;
        calculateScores(playerIndex);
        renderAll();
        AudioPlayer.playWin();
        setTimeout(() => showAlert(t('winner', { name: PLAYER_NAMES[playerIndex] })), 100);

        // Auto-Restart logic if Slot 0 is AI-controlled
        const p0Char = window.AI ? window.AI.getCharacter(0) : null;
        if (p0Char) {
            console.log("%c[System] AI in Slot 0 detected. Auto-restarting in 10s...", "color: #f39c12; font-weight: bold;");
            setTimeout(() => {
                if (gameState.gameEnded) {
                    if (window.alertModal) window.alertModal.classList.add('hidden'); // Close winner alert
                    initGame();
                }
            }, 10000);
        }
        return;
    }

    nextTurn();
}
window.executePlay = executePlay;

function nextTurn() {
    if (gameState.gameEnded) return;

    // Clear any pending AI timeouts
    if (aiTurnTimeout) {
        clearTimeout(aiTurnTimeout);
        aiTurnTimeout = null;
    }

    // 出牌順序：逆時針。座位索引 0=你(下) 1=河狸(左) 2=柴犬(上) 3=橘貓(右)，
    // 順時針是 0→1→2→3，逆時針就是索引 -1，即 你→橘貓→柴犬→河狸→你。
    gameState.turn = (gameState.turn + 3) % 4;
    resetCycleState();
    renderAll();
    updateStatus();

    const isHumanTurn = (gameState.turn === 0 && (!window.AI || !window.AI.getCharacter(0)));
    if (!isHumanTurn) {
        const delay = (window.AI && window.AI.getCharacter(0)) ? 100 : 1000;
        window.aiTurnTimeout = setTimeout(async () => {
            await aiTurn();
        }, delay);
    }
}
window.nextTurn = nextTurn;

async function aiTurn() {
    if (gameState.gameEnded || aiProcessing) return;

    window.aiProcessing = true;
    try {
        const isHumanTurn = (gameState.turn === 0 && (!window.AI || !window.AI.getCharacter(0)));
        if (isHumanTurn) return;

        const hand = gameState.players[gameState.turn];
        const lastPlay = (gameState.lastPlayerIndex === gameState.turn) ? null : gameState.lastPlay;

        // Assess strategic pressure: detect if any player is close to winning
        let nearWin = false; // "Near Win" state: any player has fewer than 3 cards
        let lastCardMode = false; // "Last Card" threat: any player has exactly 1 card remaining
        for (let i = 0; i < 4; i++) {
            if (gameState.players[i].length < 3) nearWin = true;
            if (gameState.players[i].length === 1) lastCardMode = true;
        }

        // AI Brain Call
        const aiContext = {
            hand: hand,
            lastPlay: lastPlay,
            lastPlayerIndex: gameState.lastPlayerIndex,
            players: gameState.players,
            mustTopSingle: mustTopSingle(gameState.turn),
            nearWin: nearWin,
            lastCardMode: lastCardMode,
            playedCards: gameState.playedCards,
            playerLastActions: gameState.playerLastActions,
            playerNames: PLAYER_NAMES
        };

        let play = null;
        try {
            play = await AI.findPlay(gameState.turn, aiContext);
        } catch (e) {
            console.error("AI Error:", e);
        }

        if (play && play.length > 0) {
            // 報單頂大：下家只剩 1 張時，AI 出單張只能出自己最大的牌，出不了就過
            if (play.length === 1 && mustTopSingle(gameState.turn)) {
                const maxCard = largestSingle(gameState.turn);
                if (play[0] !== maxCard) {
                    const canBeat = !lastPlay || GameLogic.compareCards(maxCard, lastPlay[0]) > 0;
                    play = canBeat ? [maxCard] : null;
                }
            }
        }

        if (play && play.length > 0) {
            executePlay(gameState.turn, play);
        } else {
            // Pass
            const char = window.AI ? window.AI.getCharacter(gameState.turn) : null;
            AudioPlayer.playPass(char ? char.name : 'npc');
            gameState.playerLastActions[gameState.turn] = "PASS";
            gameState.gameLog.push({ turn: gameState.gameLog.length, player: gameState.turn, action: "PASS" });
            showPassIndicator(gameState.turn);
            if (window.statusMessage) window.statusMessage.textContent = t('passMsg');
            nextTurn();
        }
    } finally {
        window.aiProcessing = false;
    }
}
window.aiTurn = aiTurn;

function calculateScores(winnerIndex) {
    const winnerHand = gameState.lastPlay;
    const info = GameLogic.getHandInfo(winnerHand);
    let winnerMult = 1;

    // 鐵支 / 同花順的額外翻倍已取消：只有打出含 2 的牌仍算 ×2
    if (info && winnerHand.some(c => GameLogic.getRank(c) === 12)) {
        winnerMult = 2;
    }

    let totalGained = 0;
    for (let i = 0; i < 4; i++) {
        if (i === winnerIndex) continue;

        let hand = gameState.players[i];
        let baseLost = hand.length;
        let loserMult = 1;

        // 依剩餘張數加倍：8-9 張 ×2、10-12 張 ×3、13 張（一張未出）×4
        if (baseLost === 13) loserMult *= 4;
        else if (baseLost >= 10) loserMult *= 3;
        else if (baseLost >= 8) loserMult *= 2;

        // 黑 2 規則：只有手上剩「黑桃 2」才觸發加倍（其他花色的 2 不算）
        // 52 張牌裡黑桃 2 唯一，所以最多只乘一次 2
        const hasSpadeTwo = hand.some(c => GameLogic.getRank(c) === 12 && GameLogic.getSuit(c) === 3);
        if (hasSpadeTwo) loserMult *= 2;

        const finalLost = baseLost * winnerMult * loserMult;
        gameState.scores[i] -= finalLost;
        totalGained += finalLost;
    }
    gameState.scores[winnerIndex] += totalGained;
}
window.calculateScores = calculateScores;

function handleDragonWin(playerIndex) {
    gameState.gameEnded = true;
    let totalGained = 0;
    for (let i = 0; i < 4; i++) {
        if (i === playerIndex) continue;
        const lost = 13 * 2;
        gameState.scores[i] -= lost;
        totalGained += lost;
    }
    gameState.scores[playerIndex] += totalGained;
    renderAll();
    AudioPlayer.playWin();

    setTimeout(() => showAlert(t('dragonWin', { name: PLAYER_NAMES[playerIndex] })), 100);

    const p0Char = window.AI ? window.AI.getCharacter(0) : null;
    if (p0Char) {
        console.log("%c[System] AI in Slot 0 detected. Auto-restarting in 10s...", "color: #f39c12; font-weight: bold;");
        setTimeout(() => {
            if (gameState.gameEnded) {
                if (window.alertModal) window.alertModal.classList.add('hidden'); // Close winner alert
                initGame();
            }
        }, 10000);
    }
}
window.handleDragonWin = handleDragonWin;

