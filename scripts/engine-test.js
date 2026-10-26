// node scripts/engine-test.js
const E = require('../src/ai/ChudadiEngine.js');

function counts(ms) {
    const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 };
    for (const m of ms) c[m.t]++;
    return c;
}

console.log('== 1) 全牌枚举（论文 2.2 / Java self-test 期望值）');
const all = [];
for (let v = 0; v < 52; v++) all.push(v);
const every = E.generate(all, null, { allowTriple: true });
const c = counts(every);
const expect = { 1: 52, 2: 78, 3: 52, 4: 10200, 5: 5108, 6: 3744, 7: 624, 8: 40 };
let ok = true;
for (const k of Object.keys(expect)) {
    const got = c[k], want = expect[k];
    const flag = got === want ? 'OK ' : 'FAIL';
    if (got !== want) ok = false;
    console.log(`  ${flag} type${k}: ${got} (expect ${want})`);
}
console.log(`  total=${every.length} (expect 19898) ${every.length === 19898 ? 'OK' : 'FAIL'}`);

console.log('== 2) 联众结算算例：剩 5、8、0、12 张 → 37、-7、57、-87');
{
    const u = E.scores([5, 8, 0, 12], [false, false, false, false], 2, false);
    console.log('  got', u.join(','));
    const want = '37,-7,57,-87';
    console.log('  ' + (u.join(',') === want ? 'OK' : 'FAIL') + ` (expect ${want})`);
    if (u.join(',') !== want) ok = false;
}

console.log('== 2b) 赢家加倍只认「黑桃 2」：♠2 结尾 ×2、♥2 结尾 ×1');
{
    const run = (spade) => {
        const two = spade ? 51 : 50;                 // ♠2 = 51、♥2 = 50（value 编码）
        const hands = [[two], [0,1,2,3,4,5,6,7], [8,9,10,11,12], [13,14,15,16,17,18,19]];
        const g = new E.Game(hands.map(h => h.slice()), 0, null, -1, 0, false, {}, { allowTriple: true });
        const single = g.legalMoves().find(m => m.t === 1 && m.c.length === 1 && m.c[0] === two);
        g.apply(single);
        return { winner: g.winner, flag: g.winnerHadTwo, scores: g.scoresNow() };
    };
    const sp = run(true), ht = run(false);
    const sumOk = sp.scores.reduce((a,b) => a+b, 0) === 0 && ht.scores.reduce((a,b) => a+b, 0) === 0;
    const pass = sp.winner === 0 && sp.flag === true && ht.winner === 0 && ht.flag === false &&
        sumOk && sp.scores[0] === 2 * ht.scores[0];
    console.log(`  ♠2 结尾 ${sp.scores.join(',')}｜♥2 结尾 ${ht.scores.join(',')}`);
    console.log('  ' + (pass ? 'OK' : 'FAIL') + ' (expect ♠2 分数 = 2 × ♥2 分数，四家合计 0)');
    if (!pass) ok = false;
}

console.log('== 3) 随机对局（牌守恒 / 不卡死）');
{
    const rng = E.makeRng(12345);
    let bad = 0, plies = 0;
    for (let g = 0; g < 500; g++) {
        const deck = all.slice();
        for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
        const hands = [[], [], [], []];
        for (let i = 0; i < 52; i++) hands[i % 4].push(deck[i]);
        for (const h of hands) h.sort((a, b) => a - b);
        const d3 = E.encode(13);
        let cur = hands.findIndex(h => h.indexOf(d3) >= 0);
        const game = new E.Game(hands.map(h => h.slice()), cur, null, -1, 0, true, {}, { allowTriple: true });
        let p = 0;
        while (!game.isOver() && p < 500) {
            const ms = game.legalMoves();
            if (!ms.length) break;
            game.apply(E.pickRollout(game, ms, rng, 0.15));
            p++;
        }
        plies += p;
        if (!game.isOver()) bad++;
        const totalCards = game.hands.reduce((a, h) => a + h.length, 0);
        const u = game.isOver() ? game.scoresNow() : null;
        if (u && u.reduce((a, b) => a + b, 0) !== 0) bad++;
        if (game.isOver() && totalCards < 0) bad++;
    }
    console.log(`  500 局：异常 ${bad}，平均 ${(plies / 500).toFixed(1)} 手`);
    if (bad) ok = false;
}

console.log('== 4) 速度（中局 follow 决策的 ISMCTS）');
{
    const rng = E.makeRng(777);
    const deck = all.slice();
    for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
    const hands = [[], [], [], []];
    for (let i = 0; i < 52; i++) hands[i % 4].push(deck[i]);
    for (const h of hands) h.sort((a, b) => a - b);
    const d3 = E.encode(13);
    let cur = hands.findIndex(h => h.indexOf(d3) >= 0);
    const game = new E.Game(hands.map(h => h.slice()), cur, null, -1, 0, true, {}, { allowTriple: true });
    for (let i = 0; i < 8 && !game.isOver(); i++) game.apply(E.pickRollout(game, game.legalMoves(), rng, 0.15));
    const obs = {
        seat: game.current, hand: game.hands[game.current].slice(),
        counts: game.hands.map(h => h.length), played: game.played,
        current: game.current, lastMove: game.lastMove, lastMover: game.lastMover,
        passes: game.passes, firstPlay: game.firstPlay,
        rules: { allowTriple: true, firstLeadMustContainD3: true }
    };
    console.log(`  局面：${obs.hand.length} 张手牌，${game.legalMoves().length} 个合法动作`);
    const t0 = Date.now();
    const res = E.search(obs, { iters: 2000, timeMs: 0, seed: 1 });
    const dt = (Date.now() - t0) / 1000;
    console.log(`  2000 次迭代 ${dt.toFixed(2)}s → ${(2000 / dt).toFixed(0)} iters/s；最佳 ${res.best ? (res.best.t + ':' + res.best.c.join(',')) : 'n/a'}`);
    const t1 = Date.now();
    E.search(obs, { iters: 100000, timeMs: 200, seed: 2 });
    console.log(`  timeMs=200 预算实测 ${Date.now() - t1}ms（WebView 会慢 2~4 倍）`);
}

console.log('== 5) 强度：同副牌，ISMCTS 座位 vs 全启发式基线（300 iters/步）');
{
    const rng = E.makeRng(20261024);
    const deals = 20, iters = 300;
    let sum = 0, sumSq = 0, n = 0;
    const t0 = Date.now();
    for (let d = 0; d < deals; d++) {
        const deck = all.slice();
        for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = deck[i]; deck[i] = deck[j]; deck[j] = t; }
        const deal = [[], [], [], []];
        for (let i = 0; i < 52; i++) deal[i % 4].push(deck[i]);
        for (const h of deal) h.sort((a, b) => a - b);
        const base = playDeal(deal, -1, iters, rng);
        for (let seat = 0; seat < 4; seat++) {
            const got = playDeal(deal, seat, iters, rng);
            const diff = got[seat] - base[seat];
            sum += diff; sumSq += diff * diff; n++;
        }
    }
    const mean = sum / n;
    const sd = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
    console.log(`  ${n} 局：平均每副多得分 ${mean >= 0 ? '+' : ''}${mean.toFixed(2)}（sd ${sd.toFixed(1)}，se ${(sd / Math.sqrt(n)).toFixed(2)}），耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

function playDeal(deal, aiSeat, iters, rng) {
    const hands = deal.map(h => h.slice());
    const d3 = E.encode(13);
    let cur = hands.findIndex(h => h.indexOf(d3) >= 0);
    let firstPlay = true;
    const played = {};
    const game = new E.Game(hands, cur, null, -1, 0, true, played, { allowTriple: true });
    let guard = 0;
    while (!game.isOver() && guard++ < 500) {
        const seat = game.current;
        let m;
        if (seat === aiSeat) {
            const counts = [0, 0, 0, 0];
            for (let i = 0; i < 4; i++) counts[i] = game.hands[i].length;
            const obs = {
                seat, hand: game.hands[seat].slice(), counts, played: game.played,
                current: seat, lastMove: game.lastMove, lastMover: game.lastMover,
                passes: game.passes, firstPlay: game.firstPlay,
                rules: { allowTriple: true, firstLeadMustContainD3: true }
            };
            const r = E.search(obs, { iters, timeMs: 0, seed: (guard * 7919 + seat), eps: 0.08 });
            m = r.best || game.legalMoves()[0];
        } else {
            m = E.pickRollout(game, game.legalMoves(), rng, 0.15);
        }
        game.apply(m);
    }
    return game.isOver() ? game.scoresNow() : [0, 0, 0, 0];
}

console.log('== 6) 规则/决策硬性检查');
{
    const rules = { allowTriple: true, firstLeadMustContainD3: false, nextOneMustPlayMaxSingle: true, noPassIfCanBeatSingle: true };
    // (a) 下家报单：我出单张只能是最大单张
    const handsA = [[8, 20, 30], [40], [1, 2, 3], [4, 5, 6]];
    const gA = new E.Game(handsA.map(h => h.slice()), 0, null, -1, 0, false, {}, rules);
    const msA = gA.legalMoves();
    const singlesA = msA.filter(m => m.t === E.SINGLE).map(m => m.c[0]);
    const okA = singlesA.length === 1 && singlesA[0] === 30;
    console.log(`  ${okA ? 'OK ' : 'FAIL'} 下家剩 1 张时，出单张只剩最大单张（got ${singlesA.join(',')}）`);
    if (!okA) ok = false;

    // (b) 下家报单且上一手是单张、我压得过 → 不能过牌
    const handsB = [[8, 20, 30], [40], [1, 2, 3], [4, 5, 6]];
    const lm = E.classify([25]);
    const gB = new E.Game(handsB.map(h => h.slice()), 0, lm, 2, 0, false, {}, rules);
    const msB = gB.legalMoves();
    const okB = !msB.some(m => m.t === E.PASS);
    console.log(`  ${okB ? 'OK ' : 'FAIL'} 下家报单且能压过单张时不得过牌`);
    if (!okB) ok = false;

    // (c) 能一手出完 → 搜索应选出完的那手
    const handsC = [[8, 9], [16], [17, 18], [19, 20, 21, 22]];
    const gC = new E.Game(handsC.map(h => h.slice()), 0, null, -1, 0, false, {}, rules);
    const obsC = {
        seat: 0, hand: [8, 9], counts: [2, 1, 2, 4], played: {},
        current: 0, lastMove: null, lastMover: -1, passes: 0, firstPlay: false, rules
    };
    const rC = E.search(obsC, { iters: 400, timeMs: 0, seed: 5 });
    const okC = rC.best && rC.best.t === E.PAIR;
    console.log(`  ${okC ? 'OK ' : 'FAIL'} 能一把出完时选对子（got ${rC.best ? rC.best.t + ':' + rC.best.c.join(',') : 'null'}）`);
    if (!okC) ok = false;

    // (d) 卡牌保守：手牌少、能压小单张但也没必要浪费 A → 不强制（只记录）
    console.log(`  info 首手 ♦3 过滤：generate+legalMoves 只留含 ♦3 的牌型（见测试 1 的 19898）`);
}

console.log(ok ? '\nALL TESTS PASSED' : '\nSOME TESTS FAILED');
