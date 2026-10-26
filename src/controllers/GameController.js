// Global Game States

window.soundMode = parseInt(AppStorage.getItem('soundMode')) || 0; // 0: All, 1: SFX Only, 2: None
window.trialDaysRemaining = null;
window.currentLang = 'zh';

window.PLAYER_NAMES_EN = ["You", "Alex (NPC)", "Bella (NPC)", "Chris (NPC)"];
window.PLAYER_NAMES_ZH = ["你", "艾力克斯 (NPC)", "贝拉 (NPC)", "克里斯 (NPC)"];
window.PLAYER_NAMES = window.PLAYER_NAMES_ZH;

window.gameState = {
    players: [[], [], [], []], // 0 is human, 1-3 are AI
    turn: 0,
    lastPlay: null,
    lastPlayerIndex: -1,
    selectedCards: new Set(),
    declared: [false, false, false, false], // 已「报单」公告（手牌剩 1 张）
    gameEnded: false,
    scores: [0, 0, 0, 0],
    playerLastActions: [null, null, null, null], // null, "PASS", or Array of cards
    playedCards: [], // Persistent tracking of all cards played this game
    gameLog: [], // Chronological log of all actions for reflection
    pendingStart: 'first'   // null | 'first' | 'next'：等玩家点牌桌正中才发牌
};

window.aiTurnTimeout = null;
window.aiProcessing = false;

// 本次开启 App 的累计分（每局结束累加，「开 App」才会归零）
window.sessionScores = [0, 0, 0, 0];
window.sessionWins = [0, 0, 0, 0];
window.roundsPlayed = 0;
// 上一局赢家（-1 = 还没有）；第二局起由他先出
window.lastRoundWinner = -1;
window.roundHistory = [];   // 每局四家分数，战绩表用（第 1 局、第 2 局…）

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
    gameState.pendingStart = null;
    gameState.gameEnded = false;
    gameState.declared = [false, false, false, false];
    gameState.selectedCards.clear();
    gameState.lastPlay = null;
    gameState.lastPlayerIndex = -1;
    gameState.playerLastActions = [null, null, null, null];
    gameState.playedCards = [];
    gameState.gameLog = [];
    // 每局重新开始：清空本局分数（sessionScores 才是跨局累计）
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

    // 先出者：第一局由持有 ♦3（cardId 13）的人先出，且首手必须带该张；
    // 第二局起由上局赢家先出，不再要求带 ♦3（论文 §2.1 写法）
    const startCard = 13;   // ♦3
    const prevWinner = (typeof window.lastRoundWinner === 'number') ? window.lastRoundWinner : -1;
    const winnerLeads = (window.roundsPlayed || 0) > 0 && prevWinner >= 0 && prevWinner < 4;

    if (winnerLeads) {
        gameState.turn = prevWinner;
        gameState.requireStartCard = false;
    } else {
        gameState.requireStartCard = true;
        gameState.turn = 0;
        for (let i = 0; i < 4; i++) {
            if (gameState.players[i].includes(startCard)) {
                gameState.turn = i;
                break;
            }
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

    const delay = aiTurnDelay();
    if (delay !== null) setTimeout(aiTurn, delay);
}
window.initGame = initGame;

// 出牌顺序为逆时针 0 → 3 → 2 → 1，所以「下家」（接着出牌的人）是 (i + 3) % 4
function nextPlayerIndex(playerIndex) {
    return (playerIndex + 3) % 4;
}
window.nextPlayerIndex = nextPlayerIndex;

// 报单顶大：下家只剩 1 张时，该家（上家）出单张必须先出自己最大的牌
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
    if (gameState.gameEnded) return;   // 本局已结束，不能再出牌（否则会把已结算的牌局打乱）
    if (gameState.turn !== 0) return;

    const selected = Array.from(gameState.selectedCards);
    if (selected.length === 0) return;

    // Validate play
    const info = GameLogic.getHandInfo(selected);
    if (!info) {
        showAlert(t('invalidHand'));
        return;
    }

    // 大陆规则：只有张数相同的牌可以比大小
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

    // 首轮必须带方块 3（仅第一局；第二局起由赢家先出，不限制）
    if (gameState.requireStartCard !== false && gameState.lastPlayerIndex === -1 && !selected.includes(GameLogic.getStartCard())) {
        showAlert(t('mustInclude3D'));
        return;
    }

    // 报单顶大
    if (selected.length === 1 && mustTopSingle(0) && selected[0] !== largestSingle(0)) {
        showAlert(t('mustTopSingle'));
        return;
    }

    executePlay(0, selected);
}
window.playCards = playCards;

function passTurn() {
    if (gameState.gameEnded) return;   // 本局已结束，不能再过牌
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

    // 报牌名：不分玩家，任何人出牌都念出牌型（单张/对子/三条带点数，五张牌型念类型）
    {
        const playedInfo = GameLogic.getHandInfo(cards);
        if (playedInfo) AudioPlayer.playHandName(playedInfo, cards);
    }

    // 报单：任何一家手牌只剩 1 张时公告一次（公告后其上家出单张必须顶大）
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
 * 每局结束的统一结算：记录本局分、累计分、胜局数，弹出计分表，必要时排自动重开。
 * 一般赢局与一条龙都走这里，避免只更新部分统计。
 */
function finalizeRound(winnerIndex, winnerText) {
    // 本局分数只取这一次快照，计分表与战绩表都从这里来，保证两边一致
    const roundScores = gameState.scores.slice();
    for (let i = 0; i < 4; i++) window.sessionScores[i] += roundScores[i];
    window.sessionWins[winnerIndex] += 1;
    window.roundsPlayed += 1;
    gameState.winnerIndex = winnerIndex;
    window.lastRoundWinner = winnerIndex;   // 下一局由他先出
    window.roundHistory.push(roundScores);
    window.roundDetails = window.roundDetails || [];
    window.roundDetails.push(gameState.roundDetail || null);


    // 一致性自检：赢家手牌必须为 0，且「四家手牌 + 已出的牌」必须刚好 52 张
    const winnerHand = gameState.players[winnerIndex] ? gameState.players[winnerIndex].length : -1;
    const totalCards = gameState.players.reduce((a, p) => a + p.length, 0) + gameState.playedCards.length;
    if (winnerHand !== 0 || totalCards !== 52) {
        console.warn('[round] 结算状态异常', {
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
    // 再补一次重绘，确保局末画面（含手牌区）不会残留上一帧的 DOM
    setTimeout(renderAll, 600);
    scheduleAutoRestartIfAI();
}
window.finalizeRound = finalizeRound;

/**
 * 收起本局计分表。showHint=true 时在桌面中央提示「点一下开始下一局」——
 * 玩家把计分框点掉之后，桌面正中就是下一局的入口（绑定在 renderer.js 的 #table-center）。
 */
function hideScoreTable(showHint) {
    const modal = window.scoreModalEl || document.getElementById('score-modal');
    if (modal) modal.classList.add('hidden');
    if (!showHint || !gameState.gameEnded) return;
    gameState.pendingStart = 'next';
    const el = document.getElementById('status-message');
    if (el) el.textContent = t('tapCenterNext');
}
window.hideScoreTable = hideScoreTable;

function scheduleAutoRestartIfAI() {
    const p0Char = window.AI ? window.AI.getCharacter(0) : null;
    if (!p0Char) return;   // 只有本机交 AI（自动对局／测试）才自动重开
    setTimeout(() => {
        if (!gameState.gameEnded) return;
        if (window.alertModal) window.alertModal.classList.add('hidden');
        if (window.scoreModalEl) window.scoreModalEl.classList.add('hidden');
        initGame();
    }, 10000);
}

/**
 * 每局结束的计分表：显示每位玩家「本局」与「本次开 App 累计」分数。
 * 累计存在 window.sessionScores，只会在重新启动 App（页面重载）时归零。
 */
function showScoreTable(winnerIndex, roundScores, winnerText) {
    const modal = window.scoreModalEl || document.getElementById('score-modal');
    const body = document.getElementById('score-table-body');
    if (!modal || !body) return;
    window.scoreModalEl = modal;
    gameState.pendingStart = null;

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

        // 加倍说明（几张 × 几倍、黑桃2、赢家结尾2）
        const det = (gameState.roundDetail && gameState.roundDetail.players || []).find((d) => d.playerIndex === i);
        const hint = document.createElement('div');
        hint.className = 'score-detail';
        if (i === winnerIndex) {
            hint.textContent = t('detailSum');     // 赢家：三家牌分总和
        } else if (det) {
            const parts = [t('detailCards', { n: det.count, m: det.countMult })];
            if (det.spadeTwo) parts.push(t('detailSpade2'));
            if (gameState.roundDetail && gameState.roundDetail.winnerMult > 1) parts.push(t('detailWinner2'));
            parts.push(t('detailPen', { p: det.pen }));
            hint.textContent = parts.join(' · ');
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
 * 本次开启 App 的战绩：局数、每人的胜局数与累计分。
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

    // 姓名来源与计分表相同（PLAYER_NAMES，即当前座位角色），两边永远同一组名字
    const shortName = (i) => (PLAYER_NAMES[i] || ('P' + (i + 1))).replace(/\s*[\(（].*?[\)）]\s*$/, '');

    // 表头：局 / 四位玩家（各带胜局数）
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

    // 内容：每一局一行，最后一列为累计
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

    // 最后一列：累计总分 = 上面每一列相加（与 sessionScores 对帐，若有落差以列为准并记录）
    const columnSums = (history.length ? history : []).reduce(
        (acc, row) => acc.map((v, i) => v + (row[i] || 0)),
        [0, 0, 0, 0]
    );
    const drift = columnSums.map((v, i) => v - (window.sessionScores[i] || 0));
    if (drift.some((d) => d !== 0) && typeof console !== 'undefined') {
        console.warn('[stats] 累计与本局纪录不一致', { columnSums, sessionScores: window.sessionScores.slice(), drift });
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

/**
 * 现在该不该让 AI 动作？人类（0 号位没挂 AI 角色）→ null，
 * 否则回传延迟毫秒（有 AI 角色 100ms，纯人类代打 1000ms）。
 */
function aiTurnDelay() {
    const aiChar = window.AI ? window.AI.getCharacter(0) : null;
    if (gameState.turn === 0 && !aiChar) return null;
    return aiChar ? 100 : 1000;
}
window.aiTurnDelay = aiTurnDelay;

function nextTurn() {
    if (gameState.gameEnded) return;

    // Clear any pending AI timeouts
    if (aiTurnTimeout) {
        clearTimeout(aiTurnTimeout);
        aiTurnTimeout = null;
    }

    // 出牌顺序：逆时针。座位索引 0=你(下) 1=河狸(左) 2=柴犬(上) 3=橘猫(右)，
    // 顺时针是 0→1→2→3，逆时针就是索引 -1，即 你→橘猫→柴犬→河狸→你。
    gameState.turn = (gameState.turn + 3) % 4;
    resetCycleState();
    renderAll();
    updateStatus();

    const delay = aiTurnDelay();
    if (delay !== null) {
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

        // ── AI 策略前置判断 ───────────────────────────────────────────
        // 安全区：手牌 < 8 张（8 张起输分翻倍，就是「倒霉蛋」）
        const myCount = hand.length;
        const iAmSafe = myCount > 0 && myCount < 8;

        // 倒霉蛋：其他 >= 8 张的人，牌越多越是目标（最多锁定 2 家）
        const fatOthers = [];
        for (let i = 0; i < 4; i++) {
            if (i === gameState.turn) continue;
            const c = gameState.players[i] ? gameState.players[i].length : 0;
            if (c >= 8) fatOthers.push(i);
        }
        fatOthers.sort((a, b) => (gameState.players[b].length - gameState.players[a].length));
        const fatTargets = fatOthers.slice(0, 2);
        const pressureTarget = fatTargets.length > 0 ? fatTargets[0] : -1;
        const pressureCount = pressureTarget >= 0 ? gameState.players[pressureTarget].length : 0;
        const pressureActive = pressureTarget !== -1;

        // 盟友：只在自己已进入安全区（< 8 张）时才找盟友
        //   1) 盟友也是安全区的人（2~7 张）
        //   2) 盟友的牌不能比我多（谁牌少先让谁跑；比我先进安全区的人才是盟友）
        //   3) 剩 2 张也算盟友（送张小单张助他先跑，一起抓倒霉蛋）；只剩 1 张（已报单）不当盟友
        const nextIdx = nextPlayerIndex(gameState.turn);
        const allyIndices = [];
        let oneCardAlly = -1;       // 只剩 1 张的盟友（他不是我的下家时才帮）
        if (iAmSafe) {
            for (let i = 0; i < 4; i++) {
                if (i === gameState.turn) continue;
                const c = gameState.players[i] ? gameState.players[i].length : 0;
                if (i === pressureTarget) continue;
                if (c >= 2 && c <= 7 && c <= myCount) {
                    allyIndices.push(i);
                } else if (c === 1 && i !== nextIdx) {
                    // 剩 1 张也能当盟友：出单张让他接过去直接走完
                    // 但如果他是我的下家（我就是他的上家），规则要求我顶大，不能放水
                    allyIndices.push(i);
                    oneCardAlly = i;
                }
            }
        }
        const allianceActive = iAmSafe && allyIndices.length > 0;

        // AI Brain Call
        const aiContext = {
            playerIndex: gameState.turn,
            requireStartCard: gameState.requireStartCard !== false,
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
            pressureTarget,                    // 最肥的倒霉蛋座位（-1 = 没有）
            pressureCount,                     // 倒霉蛋剩几张
            pressureActive,                    // 有倒霉蛋 → 顶大压制
            fatTargets,                        // 最多锁定 2 家倒霉蛋
            iAmSafe,                           // 自己是否已在安全区（< 8 张）
            allyIndices: allianceActive ? allyIndices : [],
            allianceActive,
            nextIsAlly: allianceActive && allyIndices.includes(nextIdx),
            oneCardAlly                        // >= 0 → 有盟友只剩 1 张，出小单张助他跑
        };

        let play = null;
        try {
            play = await AI.findPlay(gameState.turn, aiContext);
        } catch (e) {
            console.error("AI Error:", e);
        }

        if (play && play.length > 0) {
            // 报单顶大：下家只剩 1 张时，AI 出单张只能出自己最大的牌，出不了就过
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
    const winnerHand = gameState.lastPlay || [];
    const info = GameLogic.getHandInfo(winnerHand);
    let winnerMult = 1;

    // 赢家最后一手含「黑桃 2」→ 三家牌分再 ×2（只认黑桃 2，梅／方／红心的 2 不算）
    if (info && winnerHand.some(c => GameLogic.getRank(c) === 12 && GameLogic.getSuit(c) === 3)) {
        winnerMult = 2;
    }

    // ① 先算每家的「牌分」p（联众：剩几张 × 张数倍率，8 张以上含黑桃2 再 ×2，赢家结尾含黑桃2 再 ×2；赢家 0 分）
    const pen = [0, 0, 0, 0];
    const detail = { winnerMult, players: [] };
    for (let i = 0; i < 4; i++) {
        if (i === winnerIndex) {
            detail.players.push({ playerIndex: i, count: 0, countMult: 1, spadeTwo: false, base: 0, pen: 0 });
            continue;
        }
        const hand = gameState.players[i] || [];
        const count = hand.length;
        let countMult = 1;
        if (count === 13) countMult = 4;          // 一张未出
        else if (count >= 10) countMult = 3;
        else if (count >= 8) countMult = 2;

        const spadeTwo = count >= 8 &&
            hand.some(c => GameLogic.getRank(c) === 12 && GameLogic.getSuit(c) === 3);

        let p = count * countMult * winnerMult;
        if (spadeTwo) p *= 2;

        pen[i] = p;
        detail.players.push({ playerIndex: i, count, countMult, spadeTwo, base: count * countMult, pen: p });
    }

    // ② 联众计分：每两家互相都要比一次，得分 = Σ_{j≠i} (p_j − p_i)
    //    官网算例：剩 5、8、0、12 张 → 牌分 5、16、0、36 → 得分 37、-7、57、-87
    for (let i = 0; i < 4; i++) {
        let gained = 0;
        for (let j = 0; j < 4; j++) {
            if (j === i) continue;
            gained += pen[j] - pen[i];
        }
        gameState.scores[i] = gained;
    }

    gameState.roundDetail = detail;
    gameState.roundPens = pen.slice();
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

