// node scripts/app-ai-game-test.js —— 用 App 自己的 AICharacter 打完整牌局，A/B 比较「启发式」vs「启发式+ISMCTS 搜索」
global.window = global;
global.AppStorage = { getItem: () => 'mainland' };

const GameLogic = require('../src/gameLogic.js');
const E = require('../src/ai/ChudadiEngine.js');
global.GameLogic = GameLogic;
global.ChudadiEngine = E;
const { AICharacter } = require('../src/ai/AICharacter.js');

const NAMES = ['Alex', 'Bella', 'Chris', '橘猫'];

function dealValues(rng) {
    const deck = [];
    for (let v = 0; v < 52; v++) deck.push(v);
    for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const hands = [[], [], [], []];
    for (let i = 0; i < 52; i++) hands[i % 4].push(deck[i]);
    for (const h of hands) h.sort((a, b) => a - b);
    return hands;
}

/** 一句牌：四家都用 AICharacter 决策；回传四家得分 + 统计 */
async function playDeal(hands, cfg, seed) {
    // cfg 可以是单一配置（四家共用）或 4 个配置的阵列（混合牌桌）
    const played = {};
    // 规则对齐 App：下家报单时单张要顶大（GameController 强制），但 App 没有「能压过不准过牌」
    const RULES = { allowTriple: true, firstLeadMustContainD3: true, nextOneMustPlayMaxSingle: true, noPassIfCanBeatSingle: false };
    const g = new E.Game(hands.map(h => h.slice()), 0, null, -1, 0, true, played, RULES);
    // 首副牌：持 ♦3 者先出
    const d3 = E.encode(13);
    g.current = g.hands.findIndex(h => h.indexOf(d3) >= 0);
    const cfgs = Array.isArray(cfg) ? cfg : [cfg, cfg, cfg, cfg];
    const ais = NAMES.map((n, i) => {
        const c = cfgs[i];
        const ai = new AICharacter(GameLogic, n);
        ai.searchIters = c.iters;
        ai.searchTimeMs = c.timeMs || 400;
        ai.searchClose = c.close == null ? 4 : c.close;
        ai.searchMargin = c.margin == null ? 5 : c.margin;
        return ai;
    });
    let plies = 0, searches = 0, searchMs = 0, iterSum = 0, flips = 0;
    while (!g.isOver() && plies < 400) {
        const seat = g.current;
        const handIds = g.hands[seat].map(E.decode).sort((a, b) => GameLogic.compareCards(a, b));
        const playedIds = Object.keys(g.played).map(Number).map(E.decode);
        const ctx = {
            playerIndex: seat,
            requireStartCard: g.firstPlay && g.lastMove === null,
            hand: handIds,
            lastPlay: g.lastMove ? g.lastMove.c.map(E.decode) : null,
            lastPlayerIndex: g.lastMover,
            players: g.hands.map(h => h.map(E.decode)),
            playedCards: playedIds,
            pressureActive: false, pressureTarget: -1, pressureCount: 0, fatTargets: [],
            iAmSafe: g.hands[seat].length < 8,
            allyIndices: [], allianceActive: false, nextIsAlly: false, oneCardAlly: -1,
            mustTopSingle: false, nearWin: false, lastCardMode: false
        };
        window.__searchInfo = null; window.__searchFlip = null;
        const move = await ais[seat].decide(ctx);
        if (window.__searchInfo) { searches++; searchMs += window.__searchInfo.ms; iterSum += window.__searchInfo.iters; }
        if (window.__searchFlip) flips++;
        if (move === null || move === undefined) {
            const pass = g.legalMoves().find(m => m.t === E.PASS);
            if (!pass) {
                console.log('DEBUG 领出却回 null', JSON.stringify({
                    seat, reason: window.__lastAIReason,
                    hand: handIds, n: g.hands[seat].length,
                    lastPlay: g.lastMove && g.lastMove.c, lastMover: g.lastMover,
                    legal: g.legalMoves().map(x => x.t + ':' + x.c.join(',')).slice(0, 6)
                }));
                throw new Error('AI 在领出时回传 null（seat ' + seat + '）');
            }
            g.apply(pass);
        } else {
            const vals = move.map(E.encode).sort((a, b) => a - b);
            const m = E.classify(vals);
            if (!m) throw new Error('AI 出的牌不是合法牌型: ' + move.join(','));
            const legal = g.legalMoves();
            const hit = legal.find(x => x.t === m.t && x.c.length === m.c.length && x.c.every(v => m.c.includes(v)));
            if (!hit) {
                if (legalityMiss < 6) console.log('  MISMATCH', JSON.stringify({
                    seat, move, type: m.t, size: m.n, strength: m.s,
                    last: g.lastMove && { t: g.lastMove.t, c: g.lastMove.c, s: g.lastMove.s },
                    legalCount: legal.length,
                    legalSame: legal.filter(x => x.c.length === m.c.length).map(x => x.t + ':' + x.c.join(',')).slice(0, 4)
                }));
                // 规则边界：App 规则与引擎不同步时记录，不要让整局崩掉
                const fallback = legal.find(x => x.t !== E.PASS);
                if (!fallback) { g.apply(legal.find(x => x.t === E.PASS)); }
                else { g.apply(fallback); }
                legalityMiss++;
            } else {
                g.apply(hit);
            }
        }
        plies++;
    }
    const u = g.isOver() ? g.scoresNow() : null;
    return { u, plies, searches, searchMs, iterSum, flips };
}

let legalityMiss = 0;

(async () => {
    const deals = parseInt(process.argv[2] || '30', 10);
    const iters = parseInt(process.argv[3] || '200', 10);
    const rng = E.makeRng(20261024);
    const plan = [];
    for (let d = 0; d < deals; d++) plan.push(dealValues(rng));

    // 混合牌桌配对法（跟 Java 参考实作的 bench 同一套）：
    //   同一副牌 → 先跑全启发式基线，再把某一个座位换成「启发式+ISMCTS」，比较该座位得分差。
    const H = { iters: 0 };
    const S = { iters, timeMs: 400, close: 4, margin: 5 };
    let sum = 0, sumSq = 0, n = 0, wins = 0, losses = 0, ties = 0;
    let searches = 0, searchMs = 0, iterSum = 0, flips = 0, plies = 0;
    const t0 = Date.now();
    for (let d = 0; d < deals; d++) {
        const base = await playDeal(plan[d], H, d);
        if (!base.u) { console.log('  基线未完成一副，跳过'); continue; }
        for (let seat = 0; seat < 4; seat++) {
            const cfg = [H, H, H, H];
            cfg[seat] = S;
            const got = await playDeal(plan[d], cfg, d);
            if (!got.u) { console.log('  测试局未完成，跳过'); continue; }
            const diff = got.u[seat] - base.u[seat];
            sum += diff; sumSq += diff * diff; n++;
            if (diff > 0) wins++; else if (diff < 0) losses++; else ties++;
            searches += got.searches; searchMs += got.searchMs;
            iterSum += got.iterSum; flips += got.flips; plies += got.plies;
        }
        if ((d + 1) % 5 === 0) console.log(`  已跑 ${d + 1}/${deals} 副，累计 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    console.log(`\n== 结果（${n} 局配对样本，${deals} 副牌 × 4 座位轮换）==`);
    console.log(`ISMCTS 座位 − 全启发式座位：平均 ${mean >= 0 ? '+' : ''}${mean.toFixed(2)} 分／副（sd ${sd.toFixed(1)}，se ${(sd / Math.sqrt(n)).toFixed(2)}）`);
    console.log(`  更差 ${losses} / 持平 ${ties} / 更好 ${wins}`);
    console.log(`  搜索触发 ${searches} 次／${plies} 手（${(searches / plies * 100).toFixed(0)}%），平均 ${(searchMs / Math.max(1, searches)).toFixed(0)}ms／次，迭代 ${(iterSum / Math.max(1, searches)).toFixed(0)}，翻盘 ${flips}`);
    console.log(`规则不同步（AI 出的牌引擎不认）${legalityMiss} 次`);
    console.log('总耗时', ((Date.now() - t0) / 1000).toFixed(0) + 's');
})();
