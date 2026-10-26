// node scripts/ai-search-test.js —— 验证 AICharacter + ChudadiEngine 搜索层的整合（不进浏览器）
global.window = global;
global.AppStorage = { getItem: () => 'mainland' };

const GameLogic = require('../src/gameLogic.js');
const { AICharacter } = require('../src/ai/AICharacter.js');
const E = require('../src/ai/ChudadiEngine.js');
global.GameLogic = GameLogic;
global.ChudadiEngine = E;   // 浏览器里由 index.html 的 script 标签挂到 window

function deal(rng) {
    const deck = [];
    for (let c = 0; c < 52; c++) deck.push(c);
    for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const players = [[], [], [], []];
    for (let i = 0; i < 52; i++) players[i % 4].push(deck[i]);
    for (const p of players) p.sort((a, b) => GameLogic.compareCards(a, b));
    return players;
}

/** 用引擎的合法动作随机推进到某一步，产生「轮到 seat 决策」的局面 */
function randomPosition(rng, steps) {
    const players = deal(rng);
    const played = [];
    let lastPlay = null, lastPlayerIndex = -1, turn = players.findIndex(p => p.includes(13));
    let requireStartCard = true;
    for (let s = 0; s < steps; s++) {
        let legal = GameLogic.getLegalMoves(players[turn], lastPlay) || [];
        if (!legal.length) {
            // 过牌
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
    if (move === null) return ctx.lastPlay !== null;   // 过牌：领出时不合法
    const legal = GameLogic.getLegalMoves(ctx.hand, ctx.lastPlay) || [];
    return legal.some(m => m.cards.length === move.length && m.cards.every(c => move.includes(c)));
}

(async () => {
    const rng = E.makeRng(424242);
    const ai = new AICharacter(GameLogic, 'Chris');
    let n = 0, illegalOff = 0, illegalOn = 0, differ = 0;
    let msOff = 0, msOn = 0, iters = 0, flips = 0, timeouts = 0;
    const gaps = []; let obsNull = 0, searched = 0; const samples = [];

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
        global.__searchDebug = [];
        t0 = Date.now();
        const on = await ai.decide(JSON.parse(JSON.stringify(ctx)));
        msOn += Date.now() - t0;
        if (!legalCheck(ctx, on)) illegalOn++;
        const dbg = (global.__searchDebug || []).slice(-1)[0];
        if (dbg) { gaps.push(dbg.gap); if (dbg.obs === false) obsNull++; if (dbg.obs === true) searched++; if (samples.length < 8) samples.push(dbg.scores); }
        if (window.__searchInfo) { iters += window.__searchInfo.iters; if (window.__searchInfo.ms > 450) timeouts++; }
        if (window.__searchFlip) flips++;
        window.__searchFlip = null; window.__searchInfo = null;

        const same = (off === null && on === null) || (off && on && off.length === on.length && off.every(c => on.includes(c)));
        if (!same) differ++;
        n++;
    }
    console.log(`决策样本 ${n}`);
    console.log(`  关闭搜索：不合法 ${illegalOff}，平均 ${(msOff / n).toFixed(1)}ms`);
    console.log(`  开启搜索：不合法 ${illegalOn}，平均 ${(msOn / n).toFixed(1)}ms，平均迭代 ${(iters / n).toFixed(0)}，翻盘 ${flips}，超时 ${timeouts}`);
    console.log(`  两种设定选出不同动作的比例 ${(differ / n * 100).toFixed(0)}%`);
    console.log('  前 4 名分数样本：');
    for (const s of samples) console.log('   ', JSON.stringify(s));
    if (gaps.length) {
        gaps.sort((a, b) => a - b);
        console.log(`  启发式前 4 名分差：中位数 ${gaps[(gaps.length / 2) | 0]}，<=6 的比例 ${(gaps.filter(g => g <= 6).length / gaps.length * 100).toFixed(0)}%，进入搜索 ${searched}，obs 为 null ${obsNull}`);
    }
    console.log(illegalOff === 0 && illegalOn === 0 ? 'ALL OK' : 'FAILED');
})();
