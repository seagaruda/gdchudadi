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

    // ── 博弈評估：把每個選擇換算成「期望得分」，取最大 ─────────────
    // 期望得分 = p(我贏) × 別人輸分總和 − (1 − p) × 我的輸分
    // 再疊加：甩牌價值、牌權價值、對 >=8 張者的加壓、對剩 1 張者的封鎖
    _penalty(count) {
        if (count >= 13) return count * 4;
        if (count >= 10) return count * 3;
        if (count >= 8) return count * 2;
        return Math.max(0, count);
    }

    _winProb(counts, me) {
        let total = 0;
        const w = counts.map(n => {
            const v = 1 / Math.pow(Math.max(1, n), 1.5);
            total += v;
            return v;
        });
        return total > 0 ? w[me] / total : 0.25;
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

    _evaluate(cards, context) {
        const Logic = this.getLogic();
        const me = (typeof context.playerIndex === 'number') ? context.playerIndex : 0;
        const counts = [0, 1, 2, 3].map(i => (context.players[i] ? context.players[i].length : 0));
        const k = cards ? cards.length : 0;
        const myAfter = Math.max(0, counts[me] - k);
        const after = counts.slice();
        after[me] = myAfter;

        const others = [0, 1, 2, 3].filter(i => i !== me);
        const pot = others.reduce((a, i) => a + this._penalty(after[i]), 0);
        const p = myAfter === 0 ? 1 : this._winProb(after, me);

        let u = p * pot - (1 - p) * this._penalty(myAfter);

        // 甩牌價值：越早離手越安全（五張牌型最划算）
        u += 0.34 * k;

        // 牌權價值：這手壓得住 → 下一輪我還能領出繼續甩
        if (k > 0) {
            const strength = this._playStrength(cards);
            u += 0.06 * strength * Math.max(0, myAfter - 1) * (0.5 + this.traits.aggr);

            // 保留大牌：手上還很多牌時，太早丟 K/A/2 會後繼無力
            if (myAfter >= 4) {
                const bigCost = cards.reduce((a, c) => {
                    const r = Logic.getRank(c);
                    return a + (r >= 12 ? 0.30 : r >= 11 ? 0.18 : r === 10 ? 0.08 : 0);
                }, 0);
                u -= bigCost * (1 - this.traits.aggr * 0.5);
            }

            // 加壓：場上有 >=8 張的人時，出小牌等於給他機會甩牌 → 未來彩池縮水
            const fattest = Math.max.apply(null, others.map(i => after[i]));
            if (fattest >= 8) {
                const shrink = this._penalty(fattest) - this._penalty(Math.max(0, fattest - 2));
                u -= (1 - strength) * shrink * 0.30;
            }
        }

        // 封鎖：有人只剩 1 張，讓他拿回牌權就是直接把勝利送出去
        const oneCardLeader = context.lastPlayerIndex >= 0 && after[context.lastPlayerIndex] === 1;
        if (k === 0 && oneCardLeader) u -= 1.5;
        if (k > 0 && after[context.lastPlayerIndex] === 1) u += 0.5;

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

        // 規則（非策略）：首輪必須帶 ♦3 / ♣3
        if (isLead) {
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

        // 規則（非策略）：報單頂大 —— 下家只剩 1 張時只能出最大單張
        if (context.mustTopSingle) {
            const maxCard = sorted[sorted.length - 1];
            if (isLead) { window.__lastAIReason = 'rule-top-single'; return [maxCard]; }
            if (lastPlay.length === 1 && Logic.compareHands([maxCard], lastPlay) > 0) {
                window.__lastAIReason = 'rule-top-single';
                return [maxCard];
            }
        }

        // 其餘：博弈 —— 每個合法選擇都算期望得分
        const candidates = this.buildCandidates(sorted, isLead ? null : lastPlay);
        let bestCards = null;
        let bestScore = -Infinity;
        for (const cs of candidates) {
            const score = this._evaluate(cs, context);
            if (score > bestScore + 1e-9) { bestScore = score; bestCards = cs; }
        }

        if (!isLead) {
            const passScore = this._evaluate(null, context);
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
