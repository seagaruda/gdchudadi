/**
 * Base class for AI characters
 */
class AICharacter {
    constructor(gameLogic, name) {
        this.GameLogic = gameLogic;
        this.name = name;
        this.type = "NPC";
    }

    getLogic() {
        return this.GameLogic || window.GameLogic || (typeof GameLogic !== 'undefined' ? GameLogic : null);
    }

    /**
     * Common decision logic shared by all characters
     */
    async decide(context) {
        const Logic = this.getLogic();
        if (!Logic) return null;

        const { hand, lastPlay, lastPlayerIndex } = context;
        if (!hand || hand.length === 0) return null;

        const sorted = Logic.sortCards(hand);

        // --- Handle Lead (No active play to beat) ---
        if (!lastPlay || lastPlay.length === 0) {
            // First turn rule: Must include the starting card (Club 3 = 0 for Taiwan, Diamond 3 = 13 for HK)
            const ruleMode = typeof AppStorage !== 'undefined' ? (AppStorage.getItem('ruleMode') || 'mainland') : 'taiwan';
            const startCard = ruleMode === 'taiwan' ? 0 : 13;
            const hasStartCard = hand.includes(startCard);
            if (hasStartCard && (lastPlayerIndex === -1 || lastPlayerIndex === undefined)) {
                if (ruleMode === 'hongkong') {
                    const triples = Logic.findTriples(hand).filter(t => t.includes(startCard));
                    if (triples.length > 0) return triples[0];
                }
                const five = Logic.findFiveCardHands(hand).filter(h => h.includes(startCard));
                if (five.length > 0) return five[0];
                const pairs = Logic.findPairs(hand).filter(p => p.includes(startCard));
                if (pairs.length > 0) return pairs[0];
                return [startCard];
            }
            // 抓倒霉蛋：主動頂大，讓剩牌最多的那家接不上、繼續憋牌
            if (context.pressureActive) {
                return this.choosePressureLead(sorted, context);
            }
            return await this.chooseLead(sorted, context);
        }

        // --- Handle Following (Beat previous hand) ---
        return await this.chooseFollow(sorted, context);
    }

    /**
     * 抓倒霉蛋的「頂大」出牌：
     *  - 有五張牌型先出最強的五張（對手很難接，尤其是憋著 8 張以上那家）
     *  - 否則出最大對子
     *  - 再不然出最大單張
     * 目的：自己持續拿到牌權，倒霉蛋一張都出不了，結算時他剩越多、輸越多
     */
    choosePressureLead(sorted, context) {
        const Logic = this.getLogic();
        if (!sorted || sorted.length === 0) return null;

        const fiveCardHands = Logic.findFiveCardHands(sorted);
        if (fiveCardHands.length > 0) {
            return fiveCardHands.reduce((best, h) => (Logic.compareHands(h, best) > 0 ? h : best), fiveCardHands[0]);
        }

        const pairs = Logic.findPairs(sorted);
        if (pairs.length > 0) {
            return pairs.reduce((best, p) => (Logic.compareHands(p, best) > 0 ? p : best), pairs[0]);
        }

        // 最大單張（sorted 由小到大，最後一張就是最大）
        return [sorted[sorted.length - 1]];
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
