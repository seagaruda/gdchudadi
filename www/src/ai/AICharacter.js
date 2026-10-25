/**
 * Base class for AI characters
 */
class AICharacter {
    constructor(gameLogic, name) {
        this.GameLogic = gameLogic;
        this.name = name;
        this.type = "NPC";
        // 性格只調整「攻擊性」權重，不改變策略本體（策略本體是期望得分最大化）
        const STYLE = { Alex: 0.78, Bella: 0.3, Chris: 0.55, "橘貓": 0.62, "柴犬": 0.5, "河狸": 0.44 };
        this.traits = { aggr: STYLE[name] !== undefined ? STYLE[name] : 0.5 };
    }

    getLogic() {
        return this.GameLogic || window.GameLogic || (typeof GameLogic !== 'undefined' ? GameLogic : null);
    }

    // ── 依論文《锄大地(广东规则)的不完全信息博弈建模与最优策略求解》重寫 ──
    //  §7 手牌拆牌 DP：f(H) = 打完這手牌最少需要幾輪
    //  V(H) = −α·f(H) + β·κ(H) − γ·ω(H)（κ 控制力、ω 孤張小單）
    //  §2.3 收益 u_i = Σ_{j≠i} p_j − 3·p_i（p 為聯衆牌分，含黑桃2 翻倍）
    //  §8 命題2：下家報單時，領多張牌型（他接不上），不要領單張
    //  §8 黑桃2 止損：預期終局剩 ≥8 張時，早點把黑桃2 打掉，避免牌分翻倍

    /** 用「手牌內索引」做位元遮罩（n ≤ 13，避免 1<<51 這種 32 位溢位） */
    _maskOf(cards, table) {
        let m = 0;
        for (const c of cards) {
            const i = table.ids.indexOf(c);
            if (i >= 0) m |= (1 << i);
        }
        return m;
    }

    /** 建一次拆牌表，之後查 f[mask] 就是「打完這個子集最少幾輪」 */
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

    /** 從拆牌表取某個子集的手牌特徵 */
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
        // 大牌型（四帶一 / 同花順 / 葫蘆 / 同花）也算控制力
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
        // 孤張小單：點數 ≤ 5 又不屬於任何多張牌型
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

    /** 聯衆牌分：n 張的牌分（8 張以上含黑桃2 再 ×2） */
    _penalty(count, hasSpade2) {
        if (count <= 0) return 0;
        const m = count >= 13 ? 4 : count >= 10 ? 3 : count >= 8 ? 2 : 1;
        let p = count * m;
        // 黑桃2 止損（論文 §8）：只有在「剩 8~10 張、真的可能帶著 ≥8 張結束」時才把翻倍算進來。
        // 11 張以上時間还够，先专心甩牌，不要为了怕翻倍把黑桃2 早早丢掉。
        if (count >= 8 && count <= 10 && hasSpade2) p *= 2;
        return p;
    }

    /** 用 V(H) 的 softmax 估計四家勝率（對手只知道張數，用 f≈n/1.9 估） */
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

    /** 所有合法候選（單張 / 對子 / 五張牌型），跟牌時只留能壓過的 */
    buildCandidates(sorted, lastPlay) {
        const Logic = this.getLogic();
        const out = [];
        sorted.forEach(c => out.push([c]));
        Logic.findPairs(sorted).forEach(p => out.push(p));
        Logic.findFiveCardHands(sorted).forEach(f => out.push(f));
        if (!lastPlay || lastPlay.length === 0) return out;
        return out.filter(cs => cs.length === lastPlay.length && Logic.compareHands(cs, lastPlay) > 0);
    }

    /** 期望收益：Σ_{j≠i}(1−p_j)·p_j牌分 − 3·(1−p_i)·p_i牌分 + 拆牌進度 + 命題2 修正 + 動態盟友/打擊 */
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

        // 拆牌進度：這一手有沒有真的推進最優拆牌
        const fNow = table.f[table.full];
        u += 0.35 * (fNow - feat.f);

        // 命題2：下家只剩 1 張 → 領多張牌型（他接不上），別領單張
        const nextIdx = (me + 3) % 4;
        if (after[nextIdx] === 1) {
            if (k === 0) u -= 1.2;
            else if (k === 1) u -= 0.9;
            else u += 0.7;
        }

        // 有人剩 1 張還拿牌權：直接過牌等於送他贏
        if (context.lastPlayerIndex >= 0 && after[context.lastPlayerIndex] === 1 && k === 0) u -= 1.5;

        // ── 動態盟友／動態打擊對象 ──────────────────────────────
        // 兩兩互比計分下：若 j 贏，我的分數 = Σ_{k≠i,j} p_k − 3·p_i（j 的牌分歸零不算）。
        // 所以「誰贏對我最有利」是隨牌局變化的：
        //   · 牌少的贏 → 他只是把一個很小的 p 抹掉，肥的兩家全都留著計入我的分 → 對我最有利
        //   · 肥的贏 → 他那筆大 p 被抹掉 → 對我最不利
        // 於是「幫小弟先跑、死掐肥仔」不是我寫死的規則，而是這個公式的直接推論。
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
            const swing = winValueOf(leaderSeat) - meanWinValue;   // >0：讓他繼續掌權比平均好
            // 只有自己「幾乎沒戲」（勝率 < 20%）時才靠這條動態選邊；
            // 而且影響力上限 ±1.2 分 —— 它只能改變「幾乎同分」的選擇，
            // 不可能蓋掉「甩牌跨加倍坎」「壓住快贏的人」這種明確賺分的打法。
            const allyW = 0.55 * Math.max(0, 0.20 - probs[me]) / 0.20;
            const st = k > 0 ? this._playStrength(cards) : 1;
            const raw = k === 0 ? allyW * swing : -allyW * swing * st;
            u += Math.max(-1.2, Math.min(1.2, raw));
        }

        // 保留控制力：手上還很多牌時，丟大牌要付出一點代價（κ 已經在 V 裡，這裡再加一點）
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
     * 決策：先套規則（首輪帶 ♦3、報單頂大），其餘一律用期望得分挑最優解
     */
    async decide(context) {
        const Logic = this.getLogic();
        if (!Logic) return null;

        const { hand, lastPlay, lastPlayerIndex } = context;
        if (!hand || hand.length === 0) return null;

        const sorted = Logic.sortCards(hand);
        const isLead = !lastPlay || lastPlay.length === 0;

        // 規則（非策略）：只有第一局的首手必須帶 ♦3 / ♣3；第二局起贏家先出，不受此限
        if (isLead && context.requireStartCard !== false) {
            const ruleMode = typeof AppStorage !== 'undefined' ? (AppStorage.getItem('ruleMode') || 'mainland') : 'taiwan';
            const startCard = ruleMode === 'taiwan' ? 0 : 13;
            if (hand.includes(startCard) && (lastPlayerIndex === -1 || lastPlayerIndex === undefined)) {
                const five = Logic.findFiveCardHands(hand).filter(h => h.includes(startCard));
                if (five.length > 0) return five[0];
                const pairs = Logic.findPairs(hand).filter(p => p.includes(startCard));
                if (pairs.length > 0) return pairs[0];
                return [startCard];
            }
        }

        // 規則（非策略）：報單頂大由 GameController 強制（出單張時必須打最大單張）。
        // 這裡不提前返回，否則「下家報單」時就永遠只能領單張——論文 §8 命題2 明確說
        // 這種局面應該優先領多張牌型（他只剩一張，接不上），單張才受頂大限制。

        // 其餘：博弈 —— 每個合法選擇都算期望得分
        const table = this._buildShedTable(sorted);
        const candidates = this.buildCandidates(sorted, isLead ? null : lastPlay);
        let bestCards = null;
        let bestScore = -Infinity;
        for (const cs of candidates) {
            const score = this._evaluate(cs, context, table);
            if (score > bestScore + 1e-9) { bestScore = score; bestCards = cs; }
        }

        if (!isLead) {
            const passScore = this._evaluate(null, context, table);
            if (passScore > bestScore + 1e-9) {
                window.__lastAIReason = 'utility-pass';
                return null;
            }
        }

        if (!bestCards) {
            window.__lastAIReason = 'utility-nomove';
            return isLead ? [sorted[0]] : null;
        }
        window.__lastAIReason = isLead ? 'utility-lead' : 'utility-beat';
        return bestCards;
    }



    /**
     * 這回合能不能把手上剩下的牌一次出完（用來判斷「要不要搶盟友的牌權」）
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
        // 抓倒霉蛋：如果他正拿著牌權（剛出完牌），一定要壓過去，讓他繼續憋
        const huntingTarget = !!context.pressureActive &&
            context.lastPlayerIndex === context.pressureTarget;

        // 配合小戶：盟友拿著牌權在跑牌 → 讓他跑，不壓
        const allyLeads = !!context.allianceActive &&
            Array.isArray(context.allyIndices) &&
            context.allyIndices.includes(context.lastPlayerIndex);

        if (allyLeads && !huntingTarget) {
            // 例外：自己也能一把走完（手牌 <= 2 張且剛好壓得住），才搶這個牌權
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
