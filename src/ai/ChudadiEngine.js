/**
 * ChudadiEngine.js —— 論文《锄大地(广东规则)的不完全信息博弈建模与最优策略求解》
 * 第 6 節 SO-ISMCTS 的 JS 移植版（對照材料：chudadi-ai 的 Java 參考實作）。
 *
 * 與舊 ISMC.js 的差別：
 *   1) 真的建「資訊集樹」（UCB 選擇 + max^n 回傳），不是每個候選各自跑一堆獨立 playout；
 *   2) 確定化(determinization)嚴格排除「已出的牌」，舊版 pool 會把打過的牌重新發給對手；
 *   3) 滾動策略用 HeuristicPolicy（論文 §6.2 的 rollout），帶 ε 噪聲；
 *   4) 計分沿用本 App 的聯眾兩兩比較結算（含「贏家最後一手含 2 → 三家 ×2」）；
 *   5) 報單推斷：下家剩 1 張時，上家若過牌單張 ⇒ 他沒有更大的單張（寫進 forbidden）。
 *
 * 牌編碼：內部用 value = rank * 4 + 花色強度（0..51），與本 App 的 cardId 互轉見 encode/decode。
 */
(function (global) {
    'use strict';

    // ---------------------------------------------------------------- 基礎編碼
    const SUIT_STRENGTH = [1, 0, 2, 3];      // CLUB<DIAMOND<HEART<SPADE → 方塊<梅花<紅桃<黑桃
    const SUIT_OF_STRENGTH = [1, 0, 2, 3];   // 反向：花色強度 → 本 App 花色編號

    const PASS = 0, SINGLE = 1, PAIR = 2, TRIPLE = 3, STRAIGHT = 4,
        FLUSH = 5, FULL_HOUSE = 6, FOUR_KIND = 7, STRAIGHT_FLUSH = 8;

    function encode(cardId) {
        const r = cardId % 13;
        const s = (cardId - r) / 13;
        return r * 4 + SUIT_STRENGTH[s];
    }
    function decode(v) {
        return SUIT_OF_STRENGTH[v & 3] * 13 + (v >> 2);
    }
    const rankOf = (v) => v >> 2;

    const ALL_VALUES = [];
    for (let v = 0; v < 52; v++) ALL_VALUES.push(v);

    // 順子窗口（rank 索引：0=3 … 11=A、12=2），共 10 個；A 只能在兩端，2 作小牌
    const WINDOWS = [
        { ranks: [11, 12, 0, 1, 2], top: 2 },   // A2345 → 取 5
        { ranks: [12, 0, 1, 2, 3], top: 3 },    // 23456 → 取 6
        { ranks: [0, 1, 2, 3, 4], top: 4 },
        { ranks: [1, 2, 3, 4, 5], top: 5 },
        { ranks: [2, 3, 4, 5, 6], top: 6 },
        { ranks: [3, 4, 5, 6, 7], top: 7 },
        { ranks: [4, 5, 6, 7, 8], top: 8 },
        { ranks: [5, 6, 7, 8, 9], top: 9 },
        { ranks: [6, 7, 8, 9, 10], top: 10 },
        { ranks: [7, 8, 9, 10, 11], top: 11 }   // 10JQKA → 取 A
    ];
    const WINDOW_BITS = WINDOWS.map(w => w.ranks.reduce((a, r) => a | (1 << r), 0));

    // ---------------------------------------------------------------- 牌型
    function mkMove(t, cards, strength) {
        return { t, c: cards, s: strength, n: cards.length };
    }
    function moveKey(m) {
        if (m.t === PASS) return 'p';
        return m.c.join(',');
    }

    /** 5 張牌型判斷（不含順子/同花順的窗口匹配以外的容錯） */
    function classify5(cards) {
        let rankBits = 0, flushSuit = -1, flush = true;
        for (const v of cards) {
            rankBits |= 1 << (v >> 2);
            const s = v & 3;
            if (flushSuit < 0) flushSuit = s;
            else if (s !== flushSuit) flush = false;
        }
        let distinct = 0;
        for (let r = 0; r < 13; r++) if (rankBits & (1 << r)) distinct++;

        if (distinct === 5) {
            for (const w of WINDOWS) {
                if (rankBits !== WINDOW_BITS[WINDOWS.indexOf(w)]) continue;
                let top = -1;
                for (const v of cards) if ((v >> 2) === w.top && v > top) top = v;
                return flush ? mkMove(STRAIGHT_FLUSH, cards, 4 * 64 + top)
                    : mkMove(STRAIGHT, cards, top);
            }
            if (!flush) return null;
            let hi = -1;
            for (const v of cards) if (v > hi) hi = v;
            return mkMove(FLUSH, cards, 64 + hi);
        }
        if (distinct === 2) {
            const cnt = new Map();
            for (const v of cards) cnt.set(v >> 2, (cnt.get(v >> 2) || 0) + 1);
            for (const [r, c] of cnt) {
                if (c === 3) {
                    let hi = -1;
                    for (const v of cards) if ((v >> 2) === r && v > hi) hi = v;
                    return mkMove(FULL_HOUSE, cards, 2 * 64 + hi);
                }
                if (c === 4) {
                    let hi = -1;
                    for (const v of cards) if ((v >> 2) === r && v > hi) hi = v;
                    return mkMove(FOUR_KIND, cards, 3 * 64 + hi);
                }
            }
        }
        return null;
    }

    /** 任意張數的牌型識別（不是合法牌型回 null） */
    function classify(cards) {
        if (!cards || !cards.length) return null;
        const n = cards.length;
        if (n === 1) return mkMove(SINGLE, cards.slice(), cards[0]);
        if (n === 2 || n === 3) {
            const r = rankOf(cards[0]);
            for (const v of cards) if (rankOf(v) !== r) return null;
            let hi = cards[0];
            for (const v of cards) if (v > hi) hi = v;
            return mkMove(n === 2 ? PAIR : TRIPLE, cards.slice(), hi);
        }
        if (n === 5) return classify5(cards.slice());
        return null;
    }

    // ---------------------------------------------------------------- 出牌枚舉
    const _out = [];   // 內部暫存，避免熱路徑反覆配置

    function genSingles(hand, prev, out) {
        for (let i = 0; i < hand.length; i++) {
            const v = hand[i];
            if (prev && v <= prev.s) continue;
            out.push(mkMove(SINGLE, [v], v));
        }
    }

    function byRank(hand) {
        const g = new Map();
        for (const v of hand) {
            const r = v >> 2;
            let a = g.get(r);
            if (!a) { a = []; g.set(r, a); }
            a.push(v);
        }
        return g;
    }

    function genGroups(hand, k, prev, out) {
        const g = byRank(hand);
        const type = k === 2 ? PAIR : TRIPLE;
        for (const [, cs] of g) {
            if (cs.length < k) continue;
            if (k === 2) {
                for (let i = 0; i < cs.length; i++)
                    for (let j = i + 1; j < cs.length; j++) {
                        const c = [cs[i], cs[j]];
                        const st = Math.max(cs[i], cs[j]);
                        if (prev && st <= prev.s) continue;
                        out.push(mkMove(type, c, st));
                    }
            } else {
                for (let i = 0; i < cs.length; i++)
                    for (let j = i + 1; j < cs.length; j++)
                        for (let l = j + 1; l < cs.length; l++) {
                            const c = [cs[i], cs[j], cs[l]];
                            const st = Math.max(cs[l], cs[j]);
                            if (prev && st <= prev.s) continue;
                            out.push(mkMove(type, c, st));
                        }
            }
        }
    }

    function genFive(hand, prev, out) {
        const minCat = prev ? (prev.s >> 6) : 0;
        const g = byRank(hand);

        // (a) 同花（非順）
        if (minCat <= 1) {
            for (let su = 0; su < 4; su++) {
                const sm = hand.filter(v => (v & 3) === su);
                if (sm.length < 5) continue;
                const n = sm.length;
                for (let a = 0; a < n; a++)
                    for (let b = a + 1; b < n; b++)
                        for (let c = b + 1; c < n; c++)
                            for (let d = c + 1; d < n; d++)
                                for (let e = d + 1; e < n; e++) {
                                    const cs = [sm[a], sm[b], sm[c], sm[d], sm[e]];
                                    const m = classify5(cs);
                                    if (m && m.t === FLUSH && (!prev || m.s > prev.s)) out.push(m);
                                }
            }
        }

        // (b) 順子 / 同花順
        for (const w of WINDOWS) {
            const opts = [];
            let ok = true;
            for (const r of w.ranks) {
                const cs = g.get(r);
                if (!cs) { ok = false; break; }
                opts.push(cs);
            }
            if (!ok) continue;
            const idx = [0, 0, 0, 0, 0];
            for (;;) {
                const cs = [opts[0][idx[0]], opts[1][idx[1]], opts[2][idx[2]], opts[3][idx[3]], opts[4][idx[4]]];
                const s0 = cs[0] & 3;
                const flush = cs.every(v => (v & 3) === s0);
                const top = cs[4];
                const st = flush ? 4 * 64 + top : top;
                if (!prev || st > prev.s) out.push(mkMove(flush ? STRAIGHT_FLUSH : STRAIGHT, cs, st));
                let k = 4;
                while (k >= 0) {
                    if (++idx[k] < opts[k].length) break;
                    idx[k] = 0;
                    k--;
                }
                if (k < 0) break;
            }
        }

        // (c) 葫蘆
        if (minCat <= 2) {
            const ranks = [...g.keys()].sort((a, b) => a - b);
            for (const rt of ranks) {
                const tb = g.get(rt);
                if (!tb || tb.length < 3) continue;
                for (let i = 0; i < tb.length; i++)
                    for (let j = i + 1; j < tb.length; j++)
                        for (let l = j + 1; l < tb.length; l++) {
                            const st = 2 * 64 + Math.max(tb[i], tb[j], tb[l]);
                            if (prev && st <= prev.s) continue;
                            for (const rp of ranks) {
                                if (rp === rt) continue;
                                const pb = g.get(rp);
                                if (!pb || pb.length < 2) continue;
                                for (let x = 0; x < pb.length; x++)
                                    for (let y = x + 1; y < pb.length; y++)
                                        out.push(mkMove(FULL_HOUSE, [tb[i], tb[j], tb[l], pb[x], pb[y]], st));
                            }
                        }
            }
        }

        // (d) 四帶一
        if (minCat <= 3) {
            for (const [r, q] of g) {
                if (q.length !== 4) continue;
                const st = 3 * 64 + Math.max(q[0], q[1], q[2], q[3]);
                if (prev && st <= prev.s) continue;
                for (const v of hand) {
                    if ((v >> 2) === r) continue;
                    out.push(mkMove(FOUR_KIND, [q[0], q[1], q[2], q[3], v], st));
                }
            }
        }
    }

    /** hand: 已排序的 value 陣列；prev: null=領出。回傳所有合法出牌（不含過牌） */
    function generate(hand, prev, rules) {
        const out = [];
        const want = prev ? prev.n : 0;
        const allowTriple = !rules || rules.allowTriple !== false;
        if (want === 0 || want === 1) genSingles(hand, prev, out);
        if (want === 0 || want === 2) genGroups(hand, 2, prev, out);
        if ((want === 0 || want === 3) && allowTriple) genGroups(hand, 3, prev, out);
        if (want === 0 || want === 5) genFive(hand, prev, out);
        return out;
    }

    // ---------------------------------------------------------------- 計分（本 App 規則）
    const START_CARD_ID = 13;   // ♦3

    function cardPoint(n, hasSpade2) {
        if (n <= 0) return 0;
        let m = 1;
        if (n === 13) m = 4; else if (n >= 10) m = 3; else if (n >= 8) m = 2;
        let p = n * m;
        if (n >= 8 && hasSpade2) p *= 2;
        return p;
    }

    /**
     * counts: 四家剩餘張數；spade2: 四家是否持 ♠2；winner: 贏家座位；winnerHadTwo: 贏家最後一手是否含 2
     * 回傳四家得分（Σ=0）
     */
    function scores(counts, spade2, winner, winnerHadTwo) {
        const mult = winnerHadTwo ? 2 : 1;
        const pen = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            if (i === winner) continue;
            pen[i] = cardPoint(counts[i], spade2[i]) * mult;
        }
        const u = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) {
            let sum = 0;
            for (let j = 0; j < 4; j++) if (j !== i) sum += pen[j] - pen[i];
            u[i] = sum;
        }
        return u;
    }

    // ---------------------------------------------------------------- 局面
    function Game(hands, current, lastMove, lastMover, passes, firstPlay, played, rules) {
        this.hands = hands;              // 4 × sorted value array
        this.current = current;
        this.lastMove = lastMove;        // null = 領出
        this.lastMover = lastMover;
        this.passes = passes;
        this.firstPlay = firstPlay;
        this.played = played;            // Set<value>
        this.rules = rules || {};
        this.winner = -1;
        this.winnerHadTwo = false;
    }

    Game.prototype.copy = function () {
        const g = new Game(this.hands.map(h => h.slice()), this.current, this.lastMove,
            this.lastMover, this.passes, this.firstPlay, this.played, this.rules);
        g.winner = this.winner;
        g.winnerHadTwo = this.winnerHadTwo;
        return g;
    };

    Game.prototype.legalMoves = function () {
        if (this.winner >= 0) return [];
        const hand = this.hands[this.current];
        const lead = this.lastMove === null;
        let out = generate(hand, this.lastMove, this.rules);

        if (lead && this.firstPlay && this.rules.firstLeadMustContainD3 !== false) {
            const d3 = encode(START_CARD_ID);
            out = out.filter(m => m.c.indexOf(d3) >= 0);
        }

        const nextHasOne = this.hands[(this.current + 1) & 3].length === 1;
        if (nextHasOne && this.rules.nextOneMustPlayMaxSingle !== false) {
            const maxV = hand[hand.length - 1];
            out = out.filter(m => m.t !== SINGLE || m.c[0] === maxV);
        }

        let canPass = !lead;
        if (canPass && nextHasOne && this.rules.noPassIfCanBeatSingle !== false
            && this.lastMove.t === SINGLE && hand[hand.length - 1] > this.lastMove.s) {
            canPass = false;
        }
        if (canPass) out.push({ t: PASS, c: [], s: 0, n: 0 });
        return out;
    };

    Game.prototype.apply = function (m) {
        const me = this.current;
        if (m.t === PASS) {
            this.passes++;
            if (this.passes >= 3) {
                this.current = this.lastMover;
                this.lastMove = null;
                this.lastMover = -1;
                this.passes = 0;
            } else {
                this.current = (me + 1) & 3;
            }
            return;
        }
        const hand = this.hands[me];
        for (const v of m.c) {
            const i = hand.indexOf(v);
            if (i >= 0) hand.splice(i, 1);
            this.played[v] = 1;
        }
        this.lastMove = m;
        this.lastMover = me;
        this.passes = 0;
        this.firstPlay = false;
        if (hand.length === 0) {
            this.winner = me;
            this.winnerHadTwo = m.c.some(v => rankOf(v) === 12);
            return;
        }
        this.current = (me + 1) & 3;
    };

    Game.prototype.isOver = function () { return this.winner >= 0; };

    Game.prototype.scoresNow = function () {
        const counts = [0, 0, 0, 0], sp2 = [false, false, false, false];
        for (let i = 0; i < 4; i++) {
            counts[i] = this.hands[i].length;
            sp2[i] = this.hands[i].indexOf(51) >= 0;
        }
        return scores(counts, sp2, this.winner, this.winnerHadTwo);
    };

    // ---------------------------------------------------------------- 確定化
    /**
     * obs: { seat, hand:[value], counts:[4], played:{v:1}, current, lastMove, lastMover, passes, firstPlay }
     * forbidden: 4 × Set(value) 由報單過牌推斷出的「該家不可能持有」
     */
    function determinize(obs, rng, forbidden) {
        const mine = new Set(obs.hand);
        const pool = [];
        for (const v of ALL_VALUES) {
            if (mine.has(v)) continue;
            if (obs.played && obs.played[v]) continue;
            pool.push(v);
        }
        // 補齊（資料異常時容錯）
        const need = obs.counts.reduce((a, b, i) => a + (i === obs.seat ? 0 : b), 0);
        if (pool.length !== need) {
            const uniq = new Set(pool);
            for (const v of ALL_VALUES) {
                if (pool.length >= need) break;
                if (mine.has(v) || uniq.has(v) || (obs.played && obs.played[v])) continue;
                pool.push(v); uniq.add(v);
            }
        }
        // Fisher-Yates
        for (let i = pool.length - 1; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
        }
        // 先發受約束的牌
        const hands = [[], [], [], []];
        hands[obs.seat] = obs.hand.slice();
        const rem = obs.counts.slice();
        if (forbidden) {
            const con = [], free = [];
            for (const v of pool) {
                let bad = false;
                for (let p = 0; p < 4; p++) if (p !== obs.seat && forbidden[p].has(v)) { bad = true; break; }
                (bad ? con : free).push(v);
            }
            pool.length = 0;
            pool.push(...con, ...free);
        }
        for (const v of pool) {
            const opts = [];
            let total = 0;
            for (let p = 0; p < 4; p++) {
                if (p === obs.seat || rem[p] <= 0) continue;
                if (forbidden && forbidden[p].has(v)) continue;
                opts.push(p); total += rem[p];
            }
            if (!total) {
                for (let p = 0; p < 4; p++) {
                    if (p === obs.seat || rem[p] <= 0) continue;
                    opts.push(p); total += rem[p];
                }
            }
            let r = (rng() * total) | 0;
            for (const p of opts) {
                if (r < rem[p]) { hands[p].push(v); rem[p]--; break; }
                r -= rem[p];
            }
        }
        for (let p = 0; p < 4; p++) hands[p].sort((a, b) => a - b);
        // 注意：Game.apply 會寫 this.played，必須用副本，否則會污染呼叫端的觀察（舊 ISMC 的坑）
        const playedCopy = {};
        if (obs.played) for (const k in obs.played) playedCopy[k] = obs.played[k];
        return new Game(hands, obs.current, obs.lastMove, obs.lastMover, obs.passes, obs.firstPlay, playedCopy, obs.rules);
    }

    // ---------------------------------------------------------------- 滾動策略
    function pickRollout(g, moves, rng, eps) {
        const n = moves.length;
        if (n === 1) return moves[0];
        const me = g.current;
        const hand = g.hands[me];
        for (let i = 0; i < n; i++) if (moves[i].n === hand.length) return moves[i];
        if (eps > 0 && rng() < eps) return moves[(rng() * n) | 0];

        const own = hand.length;
        let minOpp = 99;
        for (let p = 0; p < 4; p++) if (p !== me) minOpp = Math.min(minOpp, g.hands[p].length);
        const danger = own >= 8 && minOpp <= 5;

        if (danger && hand.indexOf(51) >= 0) {
            let best = null;
            for (const m of moves) {
                if (m.t === PASS || m.c.indexOf(51) < 0) continue;
                if (!best || m.n > best.n || (m.n === best.n && m.s < best.s)) best = m;
            }
            if (best) return best;
        }

        if (g.lastMove === null) {   // 領出：張數多的優先，同張數取小的
            let best = null, bs = -1e9;
            for (const m of moves) {
                const sc = m.n * 100 - m.s + rng() * 6;
                if (sc > bs) { bs = sc; best = m; }
            }
            return best;
        }
        // 跟牌
        let cheapest = null, canPass = false;
        for (const m of moves) {
            if (m.t === PASS) { canPass = true; continue; }
            if (!cheapest || m.s < cheapest.s) cheapest = m;
        }
        if (!cheapest) return moves.find(m => m.t === PASS) || moves[0];
        if (!canPass) return cheapest;
        const lm = g.lastMover;
        if (danger || minOpp <= 3 || (lm >= 0 && g.hands[lm].length <= 4)) return cheapest;
        const expensive = (cheapest.n <= 3 && rankOf(cheapest.s) >= 11)
            || (cheapest.n === 5 && (cheapest.s >> 6) >= 3);
        if (expensive && rng() < 0.6) {
            const pm = moves.find(m => m.t === PASS);
            if (pm) return pm;
        }
        return cheapest;
    }

    /** 一路滾動到終局 */
    function rollout(g, rng, eps) {
        let plies = 0;
        while (!g.isOver() && plies++ < 400) {
            const ms = g.legalMoves();
            if (!ms.length) break;
            g.apply(pickRollout(g, ms, rng, eps));
        }
        return plies;
    }

    // ---------------------------------------------------------------- ISMCTS
    function Node(parent, move, mover) {
        this.parent = parent;
        this.move = move;
        this.mover = mover;
        this.visits = 0;
        this.avail = 0;
        this.reward = 0;      // 對 mover 的累計獎勵
        this.children = null; // Map<key, Node>
    }

    function makeRng(seed) {
        let s = (seed | 0) || 1;
        return function () {
            s ^= s << 13; s >>= 0;
            s ^= s >> 17;
            s ^= s << 5; s >>= 0;
            return ((s >>> 0) % 1000000) / 1000000;
        };
    }

    /**
     * 對 obs 做 ISMCTS。
     * opts: { iters, timeMs, seed, rootMoves (只搜這幾個動作，用於候選重排), exploration, rewardScale, eps }
     * 回傳 { best, stats:[{move, visits, avgU, avgR}], iterations }
     */
    function search(obs, opts) {
        const o = opts || {};
        const iters = o.iters || 300;
        const timeMs = o.timeMs || 0;
        const rng = makeRng(o.seed || ((Date.now() & 0x7fffffff) ^ (obs.hand.length * 7919)));
        const exploration = o.exploration == null ? 0.7 : o.exploration;
        const rewardScale = o.rewardScale == null ? 40 : o.rewardScale;
        const eps = o.eps == null ? 0.08 : o.eps;

        const probe = determinize(obs, rng);
        let rootMoves = probe.legalMoves();
        if (o.rootMoves) rootMoves = rootMoves.filter(m => o.rootMoves.some(k => k === moveKey(m)));
        if (!rootMoves.length) return { best: null, stats: [], iterations: 0 };
        if (rootMoves.length === 1) return { best: rootMoves[0], stats: [{ move: rootMoves[0], visits: 0, avgU: 0, avgR: 0 }], iterations: 0 };

        const root = new Node(null, null, -1);
        root.children = new Map();
        const rawSum = new Map();   // key -> 累計原始得分（對 seat）
        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        let it = 0;
        for (; it < iters; it++) {
            if (it > 0 && timeMs > 0) {
                const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                if (now - t0 >= timeMs) break;
            }
            // 每次迭代都重新確定化（SO-ISMCTS）
            const g = determinize(obs, rng);
            let node = root;
            // 選擇 + 擴展
            while (!g.isOver()) {
                let ms = g.legalMoves();
                if (node === root && o.rootMoves) ms = ms.filter(m => o.rootMoves.some(k => k === moveKey(m)));
                if (!ms.length) break;
                let untried = 0;
                for (const m of ms) {
                    const ch = node.children.get(moveKey(m));
                    if (ch) ch.avail++; else untried++;
                }
                if (untried > 0) {
                    let k = (rng() * untried) | 0;
                    let pick = null;
                    for (const m of ms) {
                        if (!node.children.has(moveKey(m))) { if (k-- === 0) { pick = m; break; } }
                    }
                    const child = new Node(node, pick, g.current);
                    child.avail = 1;
                    child.children = new Map();
                    node.children.set(moveKey(pick), child);
                    g.apply(pick);
                    node = child;
                    break;
                }
                let best = null, bestV = -Infinity;
                for (const m of ms) {
                    const ch = node.children.get(moveKey(m));
                    if (!ch || ch.visits === 0) continue;
                    const v = ch.reward / ch.visits + exploration * Math.sqrt(Math.log(Math.max(2, ch.avail)) / ch.visits);
                    if (v > bestV) { bestV = v; best = ch; }
                }
                if (!best) break;
                g.apply(best.move);
                node = best;
            }
            // 滾動到終局
            if (!g.isOver()) rollout(g, rng, eps);
            const u = g.isOver() ? g.scoresNow() : [0, 0, 0, 0];
            const uMe = u[obs.seat];
            if (o.debug) {
                o.debug.push({ it, over: g.isOver(), winner: g.winner, sizes: g.hands.map(h => h.length), u: u.slice() });
                if (o.debug.length > 30) o.debug.shift();
            }
            // 回傳（max^n）
            for (let n = node; n; n = n.parent) {
                n.visits++;
                if (n.parent) n.reward += 0.5 + 0.5 * Math.tanh(u[n.mover] / rewardScale);
            }
            // 根節點分動作統計（回到 root 的直接子節點）
            let cur = node;
            while (cur && cur.parent !== root) cur = cur.parent;
            if (cur) {
                const k = moveKey(cur.move);
                rawSum.set(k, (rawSum.get(k) || 0) + uMe);
                cur.uSum = (cur.uSum || 0) + uMe;
            }
        }

        const stats = [];
        let best = null;
        for (const m of rootMoves) {
            const ch = root.children.get(moveKey(m));
            if (!ch || !ch.visits) { stats.push({ move: m, visits: 0, avgU: 0, avgR: 0 }); continue; }
            const st = { move: m, visits: ch.visits, avgU: (ch.uSum || 0) / ch.visits, avgR: ch.reward / ch.visits };
            stats.push(st);
            if (!best || st.visits > best.visits || (st.visits === best.visits && st.avgR > best.avgR)) best = st;
        }
        return { best: best ? best.move : null, stats, iterations: it };
    }

    // ---------------------------------------------------------------- 對外 API
    const api = {
        PASS, SINGLE, PAIR, TRIPLE, STRAIGHT, FLUSH, FULL_HOUSE, FOUR_KIND, STRAIGHT_FLUSH,
        encode, decode, rankOf, classify, generate, scores, cardPoint, determinize, Game,
        search, rollout, pickRollout, moveKey, makeRng,
        /** 給 AICharacter 用：把 context 轉成 Observation（value 空間） */
        observationFromContext(ctx, extra) {
            const seat = ctx.playerIndex;
            const hand = (ctx.hand || []).map(encode).sort((a, b) => a - b);
            const counts = [0, 0, 0, 0];
            const players = ctx.players || [];
            for (let i = 0; i < 4; i++) counts[i] = i === seat ? hand.length : (players[i] ? players[i].length : 0);
            const played = {};
            if (Array.isArray(ctx.playedCards)) for (const c of ctx.playedCards) played[encode(c)] = 1;
            let lastMove = null;
            if (ctx.lastPlay && ctx.lastPlay.length) {
                const vals = ctx.lastPlay.map(encode).sort((a, b) => a - b);
                lastMove = classify(vals) || null;
            }
            return {
                seat, hand, counts, played,
                current: seat,
                lastMove,
                lastMover: (ctx.lastPlayerIndex == null) ? -1 : ctx.lastPlayerIndex,
                passes: extra && extra.passes ? extra.passes : 0,
                firstPlay: !!(extra && extra.firstPlay),
                rules: {
                    allowTriple: true,
                    firstLeadMustContainD3: ctx.requireStartCard !== false,
                    nextOneMustPlayMaxSingle: true,
                    noPassIfCanBeatSingle: true
                }
            };
        }
    };

    global.ChudadiEngine = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
