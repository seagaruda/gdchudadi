// node scripts/ai-search-test.js —— 驗證 AICharacter + ChudadiEngine 搜索層的整合（不進瀏覽器）
global.window = global;
global.AppStorage = { getItem: () => 'mainland' };

const GameLogic = require('../src/gameLogic.js');
const { AICharacter } = require('../src/ai/AICharacter.js');
const E = require('../src/ai/ChudadiEngine.js');
global.GameLogic = GameLogic;
global.ChudadiEngine = E;   // 瀏覽器裡由 index.html 的 script 標籤掛到 window

function deal(rng) {
    const deck = [];
    for (let c = 0; c < 52; c++) deck.push(c);
    for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const players = [[], [], [], []];
    for (let i = 0; i < 52; i++) players[i % 4].push(deck[i]);
    for (const p of players) p.sort((a, b) => GameLogic.compareCards(a, b));
    return players;
}

/** 用引擎的合法動作隨機推進到某一步，產生「輪到 seat 決策」的局面 */
function randomPosition(rng, steps) {
    const players = deal(rng);
    const played = [];
    let lastPlay = null, lastPlayerIndex = -1, turn = players.findIndex(p => p.includes(13));
    let requireStartCard = true;
    for (let s = 0; s < steps; s++) {
        let legal = GameLogic.getLegalMoves(players[turn], lastPlay) || [];
        if (!legal.length) {
            // 過牌
            if (lastPlay === null) break;
            turn = (turn + 1) % 4;
            continue;
        }
        if (requireStartCard && lastPlay === null) {
            const withD3 = legal.filter(mv => mv.cards.includes(13));
            if (withD3.length) { legal = withD3; }
        }
        const mv = legal[(rng() * legal.length) | 0].cards;
        for (const c of mv) {
            players[turn].splice(players[turn].indexOf(c), 1);
            played.push(c);
        }
        lastPlay = mv; lastPlayerIndex = turn;
        requireStartCard = false;
        if (players[turn].length === 0) break;
        turn = (turn + 1) % 4;
    }
    return { players, played, lastPlay, lastPlayerIndex, turn, requireStartCard };
}

function ctxOf(pos) {
    return {
        playerIndex: pos.turn,
        requireStartCard: pos.requireStartCard,
        hand: pos.players[pos.turn].slice(),
        lastPlay: pos.lastPlay,
        lastPlayerIndex: pos.lastPlayerIndex,
        players: pos.players,
        playedCards: pos.played,
        pressureActive: false, pressureTarget: -1, pressureCount: 0, fatTargets: [],
        iAmSafe: pos.players[pos.turn].length < 8,
        allyIndices: [], allianceActive: false, nextIsAlly: false, oneCardAlly: -1,
        mustTopSingle: false, nearWin: false, lastCardMode: false
    };
}

function legalCheck(ctx, move) {
    if (move === null) return ctx.lastPlay !== null;   // 過牌：領出時不合法
    const legal = GameLogic.getLegalMoves(ctx.hand, ctx.lastPlay) || [];
    return legal.some(m => m.cards.length === move.length && m.cards.every(c => move.includes(c)));
}

(async () => {
    const rng = E.makeRng(424242);
    const ai = new AICharacter(GameLogic, 'Chris');
    let n = 0, illegalOff = 0, illegalOn = 0, differ = 0;
    let msOff = 0, msOn = 0, iters = 0, flips = 0, timeouts = 0;

    for (let d = 0; d < 60; d++) {
        const steps = 4 + ((rng() * 24) | 0);
        const pos = randomPosition(rng, steps);
        if (pos.players[pos.turn].length < 2 || pos.players[pos.turn].length > 12) continue;
        const ctx = ctxOf(pos);

        ai.searchIters = 0;
        let t0 = Date.now();
        const off = await ai.decide(JSON.parse(JSON.stringify(ctx)));
        msOff += Date.now() - t0;
        if (!legalCheck(ctx, off)) illegalOff++;

        ai.searchIters = 200;
        ai.searchTimeMs = 400;
        t0 = Date.now();
        const on = await ai.decide(JSON.parse(JSON.stringify(ctx)));
        msOn += Date.now() - t0;
        if (!legalCheck(ctx, on)) illegalOn++;
        if (window.__searchInfo) { iters += window.__searchInfo.iters; if (window.__searchInfo.ms > 450) timeouts++; }
        if (window.__searchFlip) flips++;
        window.__searchFlip = null; window.__searchInfo = null;

        const same = (off === null && on === null) || (off && on && off.length === on.length && off.every(c => on.includes(c)));
        if (!same) differ++;
        n++;
    }
    console.log(`決策樣本 ${n}`);
    console.log(`  關閉搜索：不合法 ${illegalOff}，平均 ${(msOff / n).toFixed(1)}ms`);
    console.log(`  開啟搜索：不合法 ${illegalOn}，平均 ${(msOn / n).toFixed(1)}ms，平均迭代 ${(iters / n).toFixed(0)}，翻盤 ${flips}，超時 ${timeouts}`);
    console.log(`  兩種設定選出不同動作的比例 ${(differ / n * 100).toFixed(0)}%`);
    console.log(illegalOff === 0 && illegalOn === 0 ? 'ALL OK' : 'FAILED');
})();
