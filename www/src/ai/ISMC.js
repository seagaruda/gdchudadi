// ISMC.js —— 論文第 6 節 / 9.1 的「確定化採樣 + 蒙特卡洛」輕量實現（用於 AI 決策的再排序）
// 做法：把未知牌隨機發給三家（determinization），用「快速拆牌計畫」滾動到終局，
//       按聯眾兩兩計分算出自己的得分（max^n：每家都按自己的得分選動作），
//       對每個候選動作取平均，選最高的。
(function (global) {
    'use strict';

    const rank = (c) => c % 13;
    const suit = (c) => Math.floor(c / 13);

    // 快速拆牌計畫：把一手牌拆成若干「一次打出」的塊（不做完整 DP，O(n) 級）
    function quickPlan(hand) {
        const cards = hand.slice().sort((a, b) => a - b);
        const left = cards.slice();
        const chunks = [];

        const takeRanks = (r, n) => {
            const picked = [];
            for (let i = 0; i < left.length && picked.length < n; i++) {
                if (rank(left[i]) === r) picked.push(left[i]);
            }
            return picked;
        };
        const removeCards = (arr) => {
            for (const c of arr) {
                const i = left.indexOf(c);
                if (i >= 0) left.splice(i, 1);
            }
        };

        // 1) 同花（同花色 ≥5 張）
        for (let s = 0; s < 4; s++) {
            const same = left.filter(c => suit(c) === s);
            if (same.length >= 5) {
                const five = same.slice(0, 5);
                chunks.push(five);
                removeCards(five);
            }
        }
        // 2) 順子（不連續點數，2 不入中間；A2345 允許）
        let guard = 0;
        while (guard++ < 4) {
            const ranks = Array.from(new Set(left.map(rank))).sort((a, b) => a - b);
            // 找 5 連
            let found = null;
            for (let i = 0; i + 4 < ranks.length; i++) {
                if (ranks[i + 4] - ranks[i] === 4) { found = ranks.slice(i, i + 5); break; }
            }
            if (!found) {
                if (ranks.includes(0) && [1, 2, 3, 12].every(r => ranks.includes(r))) found = [12, 0, 1, 2, 3];
            }
            if (!found) break;
            const five = [];
            for (const r of found) {
                const c = takeRanks(r, 1)[0];
                if (c !== undefined) five.push(c);
            }
            if (five.length < 5) break;
            chunks.push(five);
            removeCards(five);
        }
        // 3) 對子（同點數 2 張）
        const byRank = new Map();
        for (const c of left) {
            const r = rank(c);
            if (!byRank.has(r)) byRank.set(r, []);
            byRank.get(r).push(c);
        }
        for (const [, cs] of byRank) {
            while (cs.length >= 2) {
                const pair = cs.splice(0, 2);
                chunks.push(pair);
                removeCards(pair);
            }
        }
        // 4) 剩下單張
        for (const c of left.slice()) chunks.push([c]);

        // 大牌先出（先甩五張、對子，單張最後）
        chunks.sort((a, b) => b.length - a.length);
        return chunks;
    }

    function beats(Logic, move, lastPlay) {
        if (!lastPlay) return true;
        if (move.length !== lastPlay.length) return false;
        return Logic.compareHands(move, lastPlay) > 0;
    }

    // 從計畫裡挑一手可打的牌；打不出就 null（過牌）
    function pickFromPlan(Logic, plan, lastPlay) {
        if (!lastPlay) return plan.length ? plan[0] : null;
        let best = null;
        for (const chunk of plan) {
            if (chunk.length !== lastPlay.length) continue;
            if (!beats(Logic, chunk, lastPlay)) continue;
            if (!best || Logic.compareHands(chunk, best) < 0) best = chunk;
        }
        return best;
    }

    function penaltyOf(count, cards, winnerMult) {
        if (count <= 0) return 0;
        const m = count >= 13 ? 4 : count >= 10 ? 3 : count >= 8 ? 2 : 1;
        let p = count * m * winnerMult;
        const hasSpade2 = count >= 8 && cards.some(c => rank(c) === 12 && suit(c) === 3);
        if (hasSpade2) p *= 2;
        return p;
    }

    // 一次的確定化對局：回傳「我」的聯眾得分
    function playout(Logic, me, myHand, otherCounts, turn, lastPlay, lastIdx, rng) {
        const hands = [[], [], [], []];
        hands[me] = myHand.slice();

        // 把未知牌洗牌後按張數分給三家
        const known = new Set(myHand);
        if (lastPlay) for (const c of lastPlay) known.add(c);
        const pool = [];
        for (let c = 0; c < 52; c++) if (!known.has(c)) pool.push(c);
        // 已出的牌不需要排除（pool 只用張數湊，會多出一些牌，但不影響相對強度）
        for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(rng() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
        }
        let pi = 0;
        for (let s = 0; s < 4; s++) {
            if (s === me) continue;
            const n = otherCounts[s] || 0;
            hands[s] = pool.slice(pi, pi + n);
            pi += n;
        }

        let plans = [null, null, null, null];
        const planOf = (s) => (plans[s] = plans[s] || quickPlan(hands[s]));

        let passes = 0;
        let winner = -1;
        let finalPlay = null;
        let cur = turn;
        let lp = lastPlay;
        let li = lastIdx;

        for (let step = 0; step < 400; step++) {
            if (hands[cur].length === 0) { winner = cur; break; }
            const plan = planOf(cur);
            const move = pickFromPlan(Logic, plan, lp);
            if (move) {
                for (const c of move) {
                    const idx = hands[cur].indexOf(c);
                    if (idx >= 0) hands[cur].splice(idx, 1);
                    const ci = plan.findIndex(ch => ch.includes(c));
                    if (ci >= 0) plan[ci] = plan[ci].filter(x => x !== c);
                }
                plans[cur] = plan.filter(ch => ch.length > 0);
                lp = move;
                li = cur;
                finalPlay = move;
                passes = 0;
                if (hands[cur].length === 0) { winner = cur; break; }
            } else {
                passes++;
                if (passes >= 3) { lp = null; li = -1; passes = 0; }
            }
            cur = (cur + 3) % 4;
        }
        if (winner < 0) return 0;   // 沒打完（理論上不會）

        // 贏家加倍只認黑桃 2（花色強度 3 = ♠），其他花色的 2 不加倍
        const winnerMult = (finalPlay && finalPlay.some(c => rank(c) === 12 && suit(c) === 3)) ? 2 : 1;
        const pen = [0, 0, 0, 0];
        for (let s = 0; s < 4; s++) {
            if (s === winner) continue;
            pen[s] = penaltyOf(hands[s].length, hands[s], winnerMult);
        }
        let u = 0;
        for (let s = 0; s < 4; s++) {
            if (s === me) continue;
            u += pen[s];
        }
        u -= 3 * pen[me];
        return u;
    }

    // 對「我在 me 位、手牌 myHand、上家打出 lastPlay」的局面，比較幾個候選動作
    // candidates: [{cards:[..]|null, key:'pass'|...}]
    function evaluate(Logic, ctx, candidates, opts) {
        const o = opts || {};
        const iters = o.iters || 40;
        const me = ctx.playerIndex;
        const counts = [0, 1, 2, 3].map(i => (ctx.players[i] ? ctx.players[i].length : 0));
        let seed = 12345 + (ctx.hand.length * 977) + counts.join('').length;
        const rng = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };

        const result = [];
        for (const cand of candidates) {
            let sum = 0;
            for (let t = 0; t < iters; t++) {
                const myHand = cand.cards
                    ? ctx.hand.filter(c => !cand.cards.includes(c))
                    : ctx.hand.slice();
                const turn = (me + 3) % 4;
                const lp = cand.cards || ctx.lastPlay;
                const li = cand.cards ? me : ctx.lastPlayerIndex;
                const otherCounts = counts.slice();
                otherCounts[me] = myHand.length;
                sum += playout(Logic, me, myHand, otherCounts, turn, lp, li, rng);
            }
            result.push({ cand, avg: sum / iters });
        }
        result.sort((a, b) => b.avg - a.avg);
        return result;
    }

    global.ISMC = { evaluate, quickPlan, playout };
    if (typeof module !== 'undefined' && module.exports) module.exports = global.ISMC;
})(typeof window !== 'undefined' ? window : globalThis);
