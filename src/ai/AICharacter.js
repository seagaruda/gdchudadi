/**
 * Base class for AI characters
 */
class AICharacter {
    constructor(gameLogic, name) {
        this.GameLogic = gameLogic;
        this.name = name;
        this.type = "NPC";
        // 性格只调整「攻击性」权重，不改变策略本体（策略本体是期望得分最大化）
        const STYLE = { Alex: 0.78, Bella: 0.3, Chris: 0.55, "橘猫": 0.62, "柴犬": 0.5, "河狸": 0.44 };
        // 论文 §6 的 ISMCTS 再排序 —— v1.5.59 起**固定开启（= 旧「困难 · 会算」档位）**。
        // 使用者要求取消「对手强度」分页，一律用会算的 AI；要回退成纯启发式就把 searchIters 设 0。
        // 实测（scripts/app-ai-game-test.js，40 副 × 4 座位 = 160 局配对）：
        //   +2.16 分／副（se 0.98），更好 13 局 / 更差 9 局 / 持平 138；
        //   搜索只在 8% 的手触发，每次约 39ms。
        this.searchIters = 200;
        this.searchTimeMs = 400;   // 真机保险：迭代数与时间先到者为准
        this.searchClose = 4;      // 只搜「启发式分数在最佳值 4 分内」的候选
        this.searchMargin = 5;     // 搜索要领先 5 分以上才翻盘
        this.traits = { aggr: STYLE[name] !== undefined ? STYLE[name] : 0.5 };
    }

    getLogic() {
        return this.GameLogic || window.GameLogic || (typeof GameLogic !== 'undefined' ? GameLogic : null);
    }

    // ── 依论文《锄大地(广东规则)的不完全信息博弈建模与最优策略求解》重写 ──
    //  §7 手牌拆牌 DP：f(H) = 打完这手牌最少需要几轮
    //  V(H) = −α·f(H) + β·κ(H) − γ·ω(H)（κ 控制力、ω 孤张小单）
    //  §2.3 收益 u_i = Σ_{j≠i} p_j − 3·p_i（p 为联众牌分，含黑桃2 翻倍）
    //  §8 命题2：下家报单时，领多张牌型（他接不上），不要领单张
    //  §8 黑桃2 止损：预期终局剩 ≥8 张时，早点把黑桃2 打掉，避免牌分翻倍

    /** 用「手牌内索引」做位元遮罩（n ≤ 13，避免 1<<51 这种 32 位溢位） */
    _maskOf(cards, table) {
        let m = 0;
        for (const c of cards) {
            const i = table.ids.indexOf(c);
            if (i >= 0) m |= (1 << i);
        }
        return m;
    }

    /** 建一次拆牌表，之后查 f[mask] 就是「打完这个子集最少几轮」 */
    _buildShedTable(hand) {
        const Logic = this.getLogic();
        const ids = hand.slice();
        const n = ids.length;
        const full = (1 << n) - 1;

        const toMask = (cards) => {
            let m = 0;
            const used = new Array(n).fill(false);
            for (const c of cards) {
                for (let i = 0; i < n; i++) {
                    if (!used[i] && ids[i] === c) { used[i] = true; m |= (1 << i); break; }
                }
            }
            return m;
        };

        const plays = [];
        for (let i = 0; i < n; i++) plays.push({ mask: 1 << i, cards: [ids[i]], size: 1 });
        for (const p of Logic.findPairs(ids)) {
            const m = toMask(p);
            if (m) plays.push({ mask: m, cards: p, size: p.length });
        }
        for (const f of Logic.findFiveCardHands(ids)) {
            const m = toMask(f);
            if (m) plays.push({ mask: m, cards: f, size: f.length });
        }

        const INF = 99;
        const f = new Uint8Array(1 << n);
        f.fill(INF);
        f[0] = 0;
        for (let mask = 1; mask <= full; mask++) {
            let best = INF;
            for (let pi = 0; pi < plays.length; pi++) {
                const pm = plays[pi].mask;
                if ((pm & mask) !== pm) continue;
                const v = f[mask ^ pm] + 1;
                if (v < best) best = v;
            }
            f[mask] = best;
        }
        return { f, full, ids, plays, n };
    }

    /** 从拆牌表取某个子集的手牌特征 */
    _handFeatures(table, mask) {
        const Logic = this.getLogic();
        const f = table.f[mask];
        let kappa = 0;
        let omega = 0;
        let count = 0;
        let hasSpade2 = false;
        const comboMasks = [];

        for (let i = 0; i < table.n; i++) {
            if (!(mask & (1 << i))) continue;
            const c = table.ids[i];
            count += 1;
            if (c === 51) hasSpade2 = true;            // 3*13+12 = 黑桃2
            const r = Logic.getRank(c);
            if (r === 12) kappa += 1.0;                // 2
            else if (r === 11) kappa += 0.55;          // A
        }
        // 大牌型（四带一 / 同花顺 / 葫芦 / 同花）也算控制力
        let hasBigFive = false;
        for (const p of table.plays) {
            if (p.size !== 5) continue;
            if ((p.mask & mask) !== p.mask) continue;
            comboMasks.push(p.mask);
            if (!hasBigFive) {
                const info = Logic.getHandInfo(p.cards);
                if (info && info.strength >= 3) { kappa += 0.5; hasBigFive = true; }
            }
        }
        // 孤张小单：点数 ≤ 5 又不属于任何多张牌型
        for (let i = 0; i < table.n; i++) {
            if (!(mask & (1 << i))) continue;
            if (Logic.getRank(table.ids[i]) > 5) continue;
            const inCombo = table.plays.some(p => p.size > 1 && (p.mask & mask) === p.mask && (p.mask & (1 << i)));
            if (!inCombo) omega += 1;
        }
        return { f, kappa, omega, count, hasSpade2 };
    }

    /** V(H) = −α·f(H) + β·κ(H) − γ·ω(H) */
    _handValue(feat) {
        return -1.0 * feat.f + 0.55 * feat.kappa - 0.28 * feat.omega;
    }

    /** 联众牌分：n 张的牌分（8 张以上含黑桃2 再 ×2） */
    _penalty(count, hasSpade2) {
        if (count <= 0) return 0;
        const m = count >= 13 ? 4 : count >= 10 ? 3 : count >= 8 ? 2 : 1;
        let p = count * m;
        // 黑桃2 止损（论文 §8）：只有在「剩 8~10 张、真的可能带着 ≥8 张结束」时才把翻倍算进来。
        // 11 张以上时间还够，先专心甩牌，不要为了怕翻倍把黑桃2 早早丢掉。
        if (count >= 8 && count <= 10 && hasSpade2) p *= 2;
        return p;
    }

    /** 用 V(H) 的 softmax 估计四家胜率（对手只知道张数，用 f≈n/1.9 估） */
    _winProbs(feat, counts, me) {
        const T = 1.2;
        const vals = [0, 0, 0, 0].map((_, i) => {
            if (i === me) return this._handValue(feat);
            const n = counts[i] || 0;
            return -1.0 * (n / 1.9) - 0.28 * 0.25 * n;
        });
        const mx = Math.max.apply(null, vals);
        const ex = vals.map(v => Math.exp((v - mx) / T));
        const sum = ex.reduce((a, b) => a + b, 0) || 1;
        return ex.map(v => v / sum);
    }

    _playStrength(cards) {
        const Logic = this.getLogic();
        const info = Logic.getHandInfo(cards);
        if (!info) return 0;
        switch (info.type) {
            case 'STRAIGHT_FLUSH': return 0.97;
            case 'FOUR_OF_A_KIND': return 0.92;
            case 'FULL_HOUSE': return 0.86;
            case 'FLUSH': return 0.88;
            case 'STRAIGHT': return 0.8;
            case 'PAIR': return 0.5 + (Logic.getRank(cards[0]) / 12) * 0.35;
            case 'SINGLE': return 0.28 + (Logic.getRank(cards[0]) / 12) * 0.62;
            default: return 0.5;
        }
    }

    /** 所有合法候选（单张 / 对子 / 五张牌型），跟牌时只留能压过的 */
    buildCandidates(sorted, lastPlay) {
        const Logic = this.getLogic();
        const out = [];
        sorted.forEach(c => out.push([c]));
        Logic.findPairs(sorted).forEach(p => out.push(p));
        Logic.findFiveCardHands(sorted).forEach(f => out.push(f));
        if (!lastPlay || lastPlay.length === 0) return out;
        return out.filter(cs => cs.length === lastPlay.length && Logic.compareHands(cs, lastPlay) > 0);
    }

    /** 期望收益：Σ_{j≠i}(1−p_j)·p_j牌分 − 3·(1−p_i)·p_i牌分 + 拆牌进度 + 命题2 修正 + 动态盟友/打击 */
    _evaluate(cards, context, table) {
        const me = (typeof context.playerIndex === 'number') ? context.playerIndex : 0;
        const counts = [0, 1, 2, 3].map(i => (context.players[i] ? context.players[i].length : 0));
        const k = cards ? cards.length : 0;

        const maskAfter = cards ? (table.full ^ this._maskOf(cards, table)) : table.full;
        const feat = this._handFeatures(table, maskAfter);
        const after = counts.slice();
        after[me] = feat.count;

        const pen = [0, 1, 2, 3].map(i => this._penalty(after[i], i === me ? feat.hasSpade2 : false));
        const probs = this._winProbs(feat, after, me);

        let u = 0;
        for (let j = 0; j < 4; j++) {
            if (j === me) continue;
            u += (1 - probs[j]) * pen[j];
        }
        u -= 3 * (1 - probs[me]) * pen[me];

        // 拆牌进度：这一手有没有真的推进最优拆牌
        const fNow = table.f[table.full];
        u += 0.35 * (fNow - feat.f);

        // 命题2：下家只剩 1 张 → 领多张牌型（他接不上），别领单张
        const nextIdx = (me + 3) % 4;
        if (after[nextIdx] === 1) {
            if (k === 0) u -= 1.2;
            else if (k === 1) u -= 0.9;
            else u += 0.7;
        }

        // 有人剩 1 张还拿牌权：直接过牌等于送他赢
        if (context.lastPlayerIndex >= 0 && after[context.lastPlayerIndex] === 1 && k === 0) u -= 1.5;

        // ── 动态盟友／动态打击对象 ──────────────────────────────
        // 两两互比计分下：若 j 赢，我的分数 = Σ_{k≠i,j} p_k − 3·p_i（j 的牌分归零不算）。
        // 所以「谁赢对我最有利」是随牌局变化的：
        //   · 牌少的赢 → 他只是把一个很小的 p 抹掉，肥的两家全都留着计入我的分 → 对我最有利
        //   · 肥的赢 → 他那笔大 p 被抹掉 → 对我最不利
        // 于是「帮小弟先跑、死掐肥仔」不是我写死的规则，而是这个公式的直接推论。
        const winValueOf = (j) => {
            let v = -3 * pen[me];
            for (let q = 0; q < 4; q++) {
                if (q === me || q === j) continue;
                v += pen[q];
            }
            return v;
        };
        const otherSeats = [0, 1, 2, 3].filter(x => x !== me);
        const meanWinValue = otherSeats.reduce((a, j) => a + winValueOf(j), 0) / otherSeats.length;
        const leaderSeat = (typeof context.lastPlayerIndex === 'number') ? context.lastPlayerIndex : -1;
        if (leaderSeat >= 0 && leaderSeat !== me) {
            const swing = winValueOf(leaderSeat) - meanWinValue;   // >0：让他继续掌权比平均好
            // 只有自己「几乎没戏」（胜率 < 20%）时才靠这条动态选边；
            // 而且影响力上限 ±1.2 分 —— 它只能改变「几乎同分」的选择，
            // 不可能盖掉「甩牌跨加倍坎」「压住快赢的人」这种明确赚分的打法。
            const allyW = 0.55 * Math.max(0, 0.20 - probs[me]) / 0.20;
            const st = k > 0 ? this._playStrength(cards) : 1;
            const raw = k === 0 ? allyW * swing : -allyW * swing * st;
            u += Math.max(-1.2, Math.min(1.2, raw));
        }

        // 保留控制力：手上还很多牌时，丢大牌要付出一点代价（κ 已经在 V 里，这里再加一点）
        if (k > 0 && feat.count >= 4) {
            const Logic = this.getLogic();
            const bigCost = cards.reduce((a, c) => {
                const r = Logic.getRank(c);
                return a + (r >= 12 ? 0.22 : r === 11 ? 0.12 : 0);
            }, 0);
            u -= bigCost * (1 - this.traits.aggr * 0.5);
        }

        return u;
    }

    /**
     * 决策：先套规则（首轮带 ♦3、报单顶大），其余一律用期望得分挑最优解
     */
    async decide(context) {
        const Logic = this.getLogic();
        if (!Logic) return null;

        const { hand, lastPlay, lastPlayerIndex } = context;
        if (!hand || hand.length === 0) return null;

        const sorted = Logic.sortCards(hand);
        const isLead = !lastPlay || lastPlay.length === 0;

        // 规则（非策略）：只有第一局的首手必须带 ♦3；第二局起赢家先出，不受此限
        if (isLead && context.requireStartCard !== false) {
            const startCard = 13;   // ♦3
            if (hand.includes(startCard) && (lastPlayerIndex === -1 || lastPlayerIndex === undefined)) {
                const five = Logic.findFiveCardHands(hand).filter(h => h.includes(startCard));
                if (five.length > 0) return five[0];
                const pairs = Logic.findPairs(hand).filter(p => p.includes(startCard));
                if (pairs.length > 0) return pairs[0];
                return [startCard];
            }
        }

        // 规则（非策略）：报单顶大由 GameController 强制（出单张时必须打最大单张）。
        // 这里不提前返回，否则「下家报单」时就永远只能领单张——论文 §8 命题2 明确说
        // 这种局面应该优先领多张牌型（他只剩一张，接不上），单张才受顶大限制。

        // 其余：博弈 —— 每个合法选择都算期望得分
        const table = this._buildShedTable(sorted);
        const candidates = this.buildCandidates(sorted, isLead ? null : lastPlay);

        const scored = candidates.map(cs => ({ cards: cs, score: this._evaluate(cs, context, table) }));
        if (!isLead) scored.push({ cards: null, score: this._evaluate(null, context, table) });

        let pick = scored.reduce((a, b) => (b.score > a.score ? b : a), scored[0]);

        // 论文 §6 / §9.1：资讯集蒙特卡洛树搜索（SO-ISMCTS）对「接近的候选」做再排序。
        // 引擎实作见 src/ai/ChudadiEngine.js（移植自论文配套 Java 版，含 19898 种牌型枚举自检）。
        // 判决规则（可量化、可回滚）：
        //   1) 只取启发式分数在最佳值 CLOSE 分以内的候选（最多 4 个）；
        //   2) 搜索给出每个候选的「期望得分」平均 u（联众两两计分，单位＝分）；
        //   3) 只有当搜索认为某候选比启发式首选高出 SWITCH_MARGIN 分以上，才翻盘。
        const SEARCH = this._effectiveSearchIters(context);
        const ENGINE = (typeof ChudadiEngine !== 'undefined') ? ChudadiEngine
            : (typeof window !== 'undefined' ? window.ChudadiEngine : null);
        const CLOSE = (this.searchClose == null ? 4 : this.searchClose);
        const MARGIN = (this.searchMargin == null ? 5 : this.searchMargin);
        if (SEARCH > 0 && ENGINE && scored.length > 1) {
            const sortedByScore = scored.slice().sort((a, b) => b.score - a.score);
            const top = sortedByScore.filter(t => t.score >= sortedByScore[0].score - CLOSE).slice(0, 4);
            if (window.__searchDebug) {
                window.__searchDebug.push({
                    gap: +(sortedByScore[0].score - sortedByScore[1].score).toFixed(2),
                    n: top.length,
                    scores: top.map(t => +t.score.toFixed(2))
                });
            }
            if (top.length > 1) {
                let res = null;
                try {
                    const obs = this._buildObservation(ENGINE, context, isLead);
                    if (window.__searchDebug) window.__searchDebug[window.__searchDebug.length - 1].obs = !!obs;
                    if (obs) {
                        const keyOf = (t) => t.cards
                            ? t.cards.map(c => ENGINE.encode(c)).sort((a, b) => a - b).join(',')
                            : 'p';
                        const rootKeys = top.map(keyOf);
                        const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
                        const s = ENGINE.search(obs, {
                            iters: SEARCH,
                            timeMs: (context.searchTimeMs || this.searchTimeMs || 400),
                            rootMoves: rootKeys,
                            seed: (sorted.length * 7919 + (context.playerIndex || 0) * 131 + (sorted[0] | 0)) | 0
                        });
                        if (s && s.stats && s.stats.some(x => x.visits > 0)) {
                            const used = ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0;
                            window.__searchInfo = { iters: s.iterations, ms: Math.round(used) };
                            const byKey = {};
                            for (const st of s.stats) byKey[ENGINE.moveKey(st.move)] = st;
                            res = top.map(t => {
                                const st = byKey[keyOf(t)];
                                return { cand: t, avg: st && st.visits ? st.avgU : -1e9, visits: st ? st.visits : 0 };
                            });
                        }
                    }
                } catch (e) { res = null; if (window.__searchDebug) window.__searchDebug[window.__searchDebug.length - 1].err = String(e && e.message || e); }
                if (res) {
                    const bestS = res.reduce((a, b) => (b.avg > a.avg ? b : a), res[0]);
                    const orig = top[0];
                    const gain = bestS.avg - (res.find(r => r.cand === orig) || { avg: -1e9 }).avg;
                    window.__searchGain = { gain: +gain.toFixed(1), best: +bestS.avg.toFixed(1), visits: bestS.visits };
                    if (bestS.cand !== orig && gain >= MARGIN) {
                        window.__searchFlip = { from: orig.score, to: +bestS.avg.toFixed(1), gain: +gain.toFixed(1) };
                        pick = { cards: bestS.cand.cards, score: bestS.cand.score + gain };
                    }
                }
            }
        }

        if (pick.cards === null) { window.__lastAIReason = 'utility-pass'; return null; }
        if (!pick.cards) { window.__lastAIReason = 'utility-nomove'; return isLead ? [sorted[0]] : null; }
        window.__lastAIReason = isLead ? 'utility-lead' : 'utility-beat';
        return pick.cards;
    }



    /**
     * 这次决策要不要搜索、搜多少次。
     * v1.5.59 起没有「对手强度」设定，一律走会算的档位（this.searchIters 预设 200）。
     * 优先序：context.searchIters（测试/工具注入）> this.searchIters
     */
    _effectiveSearchIters(context) {
        if (context && typeof context.searchIters === 'number') return context.searchIters;
        return this.searchIters || 0;
    }

    /**
     * 把 App 的 context 转成引擎的 Observation（只用自己手牌 + 公开资讯，不偷看对手）
     */
    _buildObservation(ENGINE, context, isLead) {
        // 引擎只实作「大陆锄大地」规则（同张数才可压、三条可单出、含 5 张同花），与 App 一致。
        const obs = ENGINE.observationFromContext(context, {
            firstPlay: isLead && context.requireStartCard !== false,
            passes: 0
        });
        if (!obs) return null;
        // 桌面上有牌但引擎认不出牌型 → 不搜寻（避免用错规则）
        if (context.lastPlay && context.lastPlay.length && !obs.lastMove) return null;
        // 规则对齐 App：下家报单时出单张必须顶大（GameController 已强制）；
        // 但 App 没有「能压过就不准过牌」这条，所以搜寻里也不要假设。
        obs.rules = {
            allowTriple: true,
            firstLeadMustContainD3: !!(isLead && context.requireStartCard !== false),
            nextOneMustPlayMaxSingle: true,
            noPassIfCanBeatSingle: false
        };
        obs.current = obs.seat;
        return obs;
    }

    /**
     * 这回合能不能把手上剩下的牌一次出完（用来判断「要不要抢盟友的牌权」）
     */
    canFinishNow(sorted, lastPlay) {
        const Logic = this.getLogic();
        if (!sorted || sorted.length === 0) return true;
        const info = Logic.getHandInfo(sorted);
        if (!info) return false;
        if (!lastPlay || lastPlay.length === 0) return true;
        if (sorted.length !== lastPlay.length) return false;
        return Logic.compareHands(sorted, lastPlay) > 0;
    }

    /**
     * Default following logic (can be overridden)
     */
    async chooseFollow(sorted, context) {
        const Logic = this.getLogic();
        const { lastPlay } = context;
        const targetLen = lastPlay.length;
        // 抓倒霉蛋：如果他正拿着牌权（刚出完牌），一定要压过去，让他继续憋
        const huntingTarget = !!context.pressureActive &&
            context.lastPlayerIndex === context.pressureTarget;

        // 配合小户：盟友拿着牌权在跑牌 → 让他跑，不压
        const allyLeads = !!context.allianceActive &&
            Array.isArray(context.allyIndices) &&
            context.allyIndices.includes(context.lastPlayerIndex);

        if (allyLeads && !huntingTarget) {
            // 例外：自己也能一把走完（手牌 <= 2 张且刚好压得住），才抢这个牌权
            const finishNow = sorted.length <= 2 && this.canFinishNow(sorted, lastPlay);
            if (!finishNow) {
                window.__lastAIReason = 'yield-to-ally';
                return null;
            }
            window.__lastAIReason = 'finish-over-ally';
        }

        if (targetLen === 1) {
            // Check if any opponent has only 1 card left (lastcard phase)
            const isLastCard = context.players && context.players.some((p, idx) => idx !== context.playerIndex && p && p.length === 1);
            
            // If it's not the lastcard phase and the played card has rank > 9 (King, Ace, 2), pass
            if (!isLastCard && !huntingTarget && Logic.getRank(lastPlay[0]) > 9) {
                return null;
            }

            if (isLastCard) {
                // Defensive play: Throw the BIGGEST card that can beat the table play
                for (let i = sorted.length - 1; i >= 0; i--) {
                    const c = sorted[i];
                    if (Logic.compareCards(c, lastPlay[0]) > 0) return [c];
                }
            } else {
                // Check if any opponent has 3 or fewer cards left (near win phase)
                const isOpponentNearWin = context.players && context.players.some((p, idx) => idx !== context.playerIndex && p && p.length <= 3);

                let candidates = [...sorted];
                if (!isOpponentNearWin) {
                    // Strip cards that belong to pairs or 5-card combinations to preserve good hands
                    const pairs = Logic.findPairs(sorted).flat();
                    const fiveCardHands = Logic.findFiveCardHands(sorted).flat();
                    candidates = sorted.filter(c => !pairs.includes(c) && !fiveCardHands.includes(c));
                    if (candidates.length === 0) {
                        candidates = sorted;
                    }
                }

                // Play the smallest card that beats the table
                for (let c of candidates) {
                    if (Logic.compareCards(c, lastPlay[0]) > 0) {
                        // Big-card preservation: Don't waste Ace (11) or 2 (12) on cards 10 or below (<= 7)
                        if (!huntingTarget && Logic.getRank(c) >= 11 && Logic.getRank(lastPlay[0]) <= 7) {
                            return null;
                        }
                        return [c];
                    }
                }

                // Fallback: If stripping prevented us from following, try the full sorted hand
                if (!isOpponentNearWin && candidates !== sorted) {
                    for (let c of sorted) {
                        if (Logic.compareCards(c, lastPlay[0]) > 0) {
                            if (!huntingTarget && Logic.getRank(c) >= 11 && Logic.getRank(lastPlay[0]) <= 7) {
                                return null;
                            }
                            return [c];
                        }
                    }
                }
            }
        } else if (targetLen === 2) {
            const pairs = Logic.findPairs(sorted);
            for (let pair of pairs) {
                if (Logic.compareHands(pair, lastPlay) > 0) return pair;
            }
        } else if (targetLen === 5) {
            const hands = Logic.findFiveCardHands(sorted);
            for (let h of hands) {
                if (Logic.compareHands(h, lastPlay) > 0) return h;
            }
        }
        return null;
    }

    // To be implemented by subclasses
    async chooseLead(sorted, context) {
        const { players } = context;
        const anyOpponentHasOne = players && players.some((p, idx) => idx !== context.playerIndex && p && p.length === 1);
        return anyOpponentHasOne ? [sorted[sorted.length - 1]] : [sorted[0]];
    }

    generatePrompt(context) {
        const { hand, lastPlay, players } = context;

        let prompt = `Current State:
- My Hand: [${hand.map(c => this.cardToVerboseString(c)).join(', ')}]
- Table Play to Beat: ${lastPlay && lastPlay.length > 0 ? `[${lastPlay.map(c => this.cardToVerboseString(c)).join(', ')}]` : 'None (You lead)'}
- Opponent Card Counts: ${players.map((p, i) => {
            if (i === context.playerIndex) return '';
            const name = (context.playerNames && context.playerNames[i]) ? context.playerNames[i] : `P${i + 1}`;
            return `${name}:${p.length}`;
        }).filter(s => s).join(', ')}

Instruction: ${lastPlay && lastPlay.length > 0 ? 'You must beat the table play or PASS.' : 'You are the leader of this round. Output your move in JSON.'}`;

        return prompt;
    }

    cardToVerboseString(cardId) {
        const suits = ['Club', 'Diamond', 'Heart', 'Spade'];
        const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
        const Logic = this.getLogic();
        return `${suits[Logic.getSuit(cardId)]} ${ranks[Logic.getRank(cardId)]}`;
    }

    cardToString(cardId) {
        const suits = ['C', 'D', 'H', 'S'];
        const ranks = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
        const Logic = this.getLogic();
        return `${ranks[Logic.getRank(cardId)]}${suits[Logic.getSuit(cardId)]}`;
    }

    async localDecide(context) {
        const Logic = this.getLogic();
        const { hand, lastPlay, playerIndex } = context;
        const sorted = Logic.sortCards(hand);

        if (!lastPlay || lastPlay.length === 0) {
            const five = Logic.findFiveCardHands(sorted);
            if (five.length > 0) return five[0];
            const { players } = context;
            const anyOpponentHasOne = players && players.some((p, idx) => idx !== playerIndex && p && p.length === 1);
            return anyOpponentHasOne ? [sorted[sorted.length - 1]] : [sorted[0]];
        } else {
            return await this.chooseFollow(sorted, context);
        }
    }
}

// Browser/Electron export
if (typeof module !== 'undefined') {
    module.exports = { AICharacter };
}
