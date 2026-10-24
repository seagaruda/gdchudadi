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

// 本次開啟 App 的累計分（每局結束累加，「開 App」才會歸零）
window.sessionScores = [0, 0, 0, 0];
window.sessionWins = [0, 0, 0, 0];
window.roundsPlayed = 0;
window.roundHistory = [];   // 每局四家分數，戰績表用（第 1 局、第 2 局…）

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
    if (window.scoreModalEl) window.scoreModalEl.classList.add('hidden');
    gameState.gameEnded = false;
    gameState.declared = [false, false, false, false];
    gameState.selectedCards.clear();
    gameState.lastPlay = null;
    gameState.lastPlayerIndex = -1;
    gameState.playerLastActions = [null, null, null, null];
    gameState.playedCards = [];
    gameState.gameLog = [];
    // 每局重新開始：清空本局分數（sessionScores 才是跨局累計）
    gameState.scores = [0, 0, 0, 0];
    gameState.winnerIndex = -1;

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
    if (gameState.gameEnded) return;   // 本局已結束，不能再出牌（否則會把已結算的牌局打亂）
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
    if (gameState.gameEnded) return;   // 本局已結束，不能再過牌
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

    // 報牌名：不分玩家，任何人出牌都念出牌型（單張/對子/三條帶點數，五張牌型念類型）
    {
        const playedInfo = GameLogic.getHandInfo(cards);
        if (playedInfo) AudioPlayer.playHandName(playedInfo, cards);
    }

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
        finalizeRound(playerIndex);
        return;
    }

    nextTurn();
}
window.executePlay = executePlay;

/**
 * 每局結束的統一結算：記錄本局分、累計分、勝局數，彈出計分表，必要時排自動重開。
 * 一般贏局與一條龍都走這裡，避免只更新部分統計。
 */
function finalizeRound(winnerIndex, winnerText) {
    // 本局分數只取這一次快照，計分表與戰績表都從這裡來，保證兩邊一致
    const roundScores = gameState.scores.slice();
    for (let i = 0; i < 4; i++) window.sessionScores[i] += roundScores[i];
    window.sessionWins[winnerIndex] += 1;
    window.roundsPlayed += 1;
    gameState.winnerIndex = winnerIndex;
    window.roundHistory.push(roundScores);
    window.roundDetails = window.roundDetails || [];
    window.roundDetails.push(gameState.roundDetail || null);


    // 一致性自檢：贏家手牌必須為 0，且「四家手牌 + 已出的牌」必須剛好 52 張
    const winnerHand = gameState.players[winnerIndex] ? gameState.players[winnerIndex].length : -1;
    const totalCards = gameState.players.reduce((a, p) => a + p.length, 0) + gameState.playedCards.length;
    if (winnerHand !== 0 || totalCards !== 52) {
        console.warn('[round] 結算狀態異常', {
            winnerIndex,
            winnerHand,
            hands: gameState.players.map(p => p.length),
            played: gameState.playedCards.length,
            totalCards
        });
    }

    renderAll();
    AudioPlayer.playWin();
    setTimeout(() => showScoreTable(winnerIndex, roundScores, winnerText), 350);
    // 再補一次重繪，確保局末畫面（含手牌區）不會殘留上一幀的 DOM
    setTimeout(renderAll, 600);
    scheduleAutoRestartIfAI();
}
window.finalizeRound = finalizeRound;

function scheduleAutoRestartIfAI() {
    const p0Char = window.AI ? window.AI.getCharacter(0) : null;
    if (!p0Char) return;   // 只有本機交 AI（自動對局／測試）才自動重開
    setTimeout(() => {
        if (!gameState.gameEnded) return;
        if (window.alertModal) window.alertModal.classList.add('hidden');
        if (window.scoreModalEl) window.scoreModalEl.classList.add('hidden');
        initGame();
    }, 10000);
}

/**
 * 每局結束的計分表：顯示每位玩家「本局」與「本次開 App 累計」分數。
 * 累計存在 window.sessionScores，只會在重新啟動 App（頁面重載）時歸零。
 */
function showScoreTable(winnerIndex, roundScores, winnerText) {
    const modal = window.scoreModalEl || document.getElementById('score-modal');
    const body = document.getElementById('score-table-body');
    if (!modal || !body) return;
    window.scoreModalEl = modal;

    const titleEl = modal.querySelector('h2');
    if (titleEl) titleEl.textContent = t('roundScoreTitle') + ' · ' + t('roundNo', { n: window.roundsPlayed });

    const winnerEl = document.getElementById('score-modal-winner');
    if (winnerEl) winnerEl.textContent = winnerText || t('winner', { name: PLAYER_NAMES[winnerIndex] });

    body.innerHTML = '';
    for (let i = 0; i < 4; i++) {
        const tr = document.createElement('tr');
        if (i === 0) tr.classList.add('is-you');
        if (i === winnerIndex) tr.classList.add('is-winner');

        const rawName = PLAYER_NAMES[i] || ('P' + (i + 1));
        const nameTd = document.createElement('td');
        nameTd.textContent = rawName.replace(/\s*[\(（].*?[\)）]\s*$/, '');

        const roundScore = (roundScores && roundScores[i]) || 0;
        const totalScore = window.sessionScores[i] || 0;

        const roundTd = document.createElement('td');
        roundTd.textContent = (roundScore > 0 ? '+' : '') + roundScore;
        roundTd.className = 'score-cell ' + (roundScore > 0 ? 'pos' : roundScore < 0 ? 'neg' : 'zero');

        // 加倍說明（幾張 × 幾倍、黑桃2、赢家結尾2）
        const det = (gameState.roundDetail && gameState.roundDetail.losers || []).find((d) => d.playerIndex === i);
        const hint = document.createElement('div');
        hint.className = 'score-detail';
        if (det) {
            const parts = [t('detailCards', { n: det.count, m: det.countMult })];
            if (det.spadeTwo) parts.push(t('detailSpade2'));
            if (det.winnerMult > 1) parts.push(t('detailWinner2'));
            hint.textContent = parts.join(' · ');
        } else if (i === winnerIndex) {
            hint.textContent = t('detailSum');
        }
        if (hint.textContent) roundTd.appendChild(hint);

        const totalTd = document.createElement('td');
        totalTd.textContent = (totalScore > 0 ? '+' : '') + totalScore;
        totalTd.className = 'score-cell ' + (totalScore > 0 ? 'pos' : totalScore < 0 ? 'neg' : 'zero');

        tr.appendChild(nameTd);
        tr.appendChild(roundTd);
        tr.appendChild(totalTd);
        body.appendChild(tr);
    }

    modal.classList.remove('hidden');
}
window.showScoreTable = showScoreTable;

/**
 * 本次開啟 App 的戰績：局數、每人的勝局數與累計分。
 */
function showSessionStats() {
    const modal = document.getElementById('stats-modal');
    const head = document.getElementById('stats-table-head');
    const body = document.getElementById('stats-table-body');
    if (!modal || !body) return;

    const titleEl = document.getElementById('stats-title');
    if (titleEl) titleEl.textContent = t('statsTitle');

    const roundsEl = document.getElementById('stats-rounds');
    if (roundsEl) {
        const n = window.roundsPlayed;
        const oneLine = (window.currentLang === 'en' && n === 1) ? t('statsRoundsLineOne') : null;
        roundsEl.textContent = oneLine || t('statsRoundsLine', { n });
    }

    // 姓名來源與計分表相同（PLAYER_NAMES，即當前座位角色），兩邊永遠同一組名字
    const shortName = (i) => (PLAYER_NAMES[i] || ('P' + (i + 1))).replace(/\s*[\(（].*?[\)）]\s*$/, '');

    // 表頭：局 / 四位玩家（各帶勝局數）
    if (head) {
        head.innerHTML = '';
        const tr = document.createElement('tr');
        const corner = document.createElement('th');
        corner.textContent = t('thRoundNo');
        corner.className = 'round-col';
        tr.appendChild(corner);
        for (let i = 0; i < 4; i++) {
            const th = document.createElement('th');
            th.className = 'name-col' + (i === 0 ? ' is-you' : '');
            const nameSpan = document.createElement('span');
            nameSpan.className = 'stats-pname';
            nameSpan.textContent = shortName(i);
            const winSpan = document.createElement('span');
            winSpan.className = 'stats-pwins';
            winSpan.textContent = t('statsWinsShort', { n: window.sessionWins[i] || 0 });
            th.appendChild(nameSpan);
            th.appendChild(winSpan);
            tr.appendChild(th);
        }
        head.appendChild(tr);
    }

    // 內容：每一局一行，最後一列為累計
    body.innerHTML = '';
    const history = window.roundHistory || [];
    if (!history.length) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        td.className = 'stats-empty';
        td.textContent = t('statsEmpty');
        tr.appendChild(td);
        body.appendChild(tr);
    } else {
        history.forEach((scores, idx) => {
            const tr = document.createElement('tr');
            const label = document.createElement('td');
            label.className = 'round-col';
            label.textContent = String(idx + 1);
            tr.appendChild(label);
            for (let i = 0; i < 4; i++) {
                const v = scores[i] || 0;
                const td = document.createElement('td');
                td.textContent = (v > 0 ? '+' : '') + v;
                td.className = 'score-cell ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
                tr.appendChild(td);
            }
            body.appendChild(tr);
        });
    }

    // 最後一列：累計總分 = 上面每一列相加（與 sessionScores 對帳，若有落差以列為準並記錄）
    const columnSums = (history.length ? history : []).reduce(
        (acc, row) => acc.map((v, i) => v + (row[i] || 0)),
        [0, 0, 0, 0]
    );
    const drift = columnSums.map((v, i) => v - (window.sessionScores[i] || 0));
    if (drift.some((d) => d !== 0) && typeof console !== 'undefined') {
        console.warn('[stats] 累計與本局紀錄不一致', { columnSums, sessionScores: window.sessionScores.slice(), drift });
    }

    const totalTr = document.createElement('tr');
    totalTr.className = 'stats-total-row';
    const totalLabel = document.createElement('td');
    totalLabel.className = 'round-col';
    totalLabel.textContent = t('statsTotalRow');
    totalTr.appendChild(totalLabel);
    for (let i = 0; i < 4; i++) {
        const v = columnSums[i] || 0;
        const td = document.createElement('td');
        td.textContent = (v > 0 ? '+' : '') + v;
        td.className = 'score-cell ' + (v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero');
        totalTr.appendChild(td);
    }
    body.appendChild(totalTr);

    modal.classList.remove('hidden');
    const scroller = modal.querySelector('.stats-scroll');
    if (scroller) scroller.scrollTop = scroller.scrollHeight;
}
window.showSessionStats = showSessionStats;

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

        // 抓倒霉蛋：找出「剩牌最多」的對手，剩 >= 8 張（輸分翻倍區）且比自己多 2 張以上才成立
        let pressureTarget = -1;
        let pressureCount = 0;
        for (let i = 0; i < 4; i++) {
            if (i === gameState.turn) continue;
            const c = gameState.players[i] ? gameState.players[i].length : 0;
            if (c > pressureCount) { pressureCount = c; pressureTarget = i; }
        }
        const pressureActive = pressureTarget !== -1 && pressureCount >= 8 && pressureCount >= hand.length + 2;

        // 聯盟：其他剛好剩 3 張的小戶（含玩家 0 號位，不含倒霉蛋）→ 互相配合跑牌
        // 1) 只剩 1 張（已報單）的人不算盟友：讓牌等於直接把勝利送出去
        // 2) 自己要先顧自己：自己就是最多牌那家（我就是倒霉蛋）→ 不配合任何人
        // 3) 自己手牌 <= 4 張（還有機會自己贏）→ 不配合，先跑自己的牌
        const myCount = hand.length;
        const otherCounts = [];
        for (let i = 0; i < 4; i++) {
            if (i === gameState.turn) continue;
            otherCounts.push(gameState.players[i] ? gameState.players[i].length : 0);
        }
        const selfIsBiggest = otherCounts.length > 0 && myCount > Math.max.apply(null, otherCounts);

        // 盟友必須「還剩 3 張」：剩 2 張的人只要再一輪就能走完，讓牌等於直接送他贏（就是之前 7 報單被放水的原因）
        const allyIndices = [];
        for (let i = 0; i < 4; i++) {
            if (i === gameState.turn) continue;
            const c = gameState.players[i] ? gameState.players[i].length : 0;
            if (c === 3 && i !== pressureTarget) allyIndices.push(i);
        }
        // 只有「自己不是最大戶、自己手牌還 >=5 張（這局基本贏不了）、且盟友比我少」時才配合
        const behindAlly = allyIndices.some(i => (gameState.players[i] ? gameState.players[i].length : 0) < myCount);
        const allianceActive = allyIndices.length > 0 && !selfIsBiggest && myCount >= 5 && behindAlly;
        const nextIdx = nextPlayerIndex(gameState.turn);

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
            playerNames: PLAYER_NAMES,
            pressureTarget: pressureActive ? pressureTarget : -1,   // 倒霉蛋座位
            pressureCount: pressureActive ? pressureCount : 0,      // 倒霉蛋剩幾張
            pressureActive,
            allyIndices: allianceActive ? allyIndices : [],         // 手牌剛好 3 張的盟友座位
            allianceActive,
            nextIsAlly: allianceActive && allyIndices.includes(nextIdx), // 下家是盟友 → 送牌給他跑
            selfIsBiggest
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
    const detail = { winnerMult, losers: [] };
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
        // 大陸規則：手上「還有 8 張或以上」且含黑桃 2 才加倍
        const hasSpadeTwo = baseLost >= 8 &&
            hand.some(c => GameLogic.getRank(c) === 12 && GameLogic.getSuit(c) === 3);
        if (hasSpadeTwo) loserMult *= 2;

        const finalLost = baseLost * winnerMult * loserMult;
        gameState.scores[i] -= finalLost;
        totalGained += finalLost;

        // 記錄明細，讓計分表能顯示「幾張 × 幾倍」
        detail.losers.push({
            playerIndex: i,
            count: baseLost,
            countMult: baseLost === 13 ? 4 : baseLost >= 10 ? 3 : baseLost >= 8 ? 2 : 1,
            spadeTwo: hasSpadeTwo,
            winnerMult,
            total: finalLost
        });
    }
    gameState.scores[winnerIndex] += totalGained;
    gameState.roundDetail = detail;
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
    finalizeRound(playerIndex, t('dragonWin', { name: PLAYER_NAMES[playerIndex] }));
}
window.handleDragonWin = handleDragonWin;

