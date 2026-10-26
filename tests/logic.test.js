global.AppStorage = {
    _data: {},
    getItem(key) { return this._data[key] || null; },
    setItem(key, val) { this._data[key] = val; }
};

const GameLogic = require('../src/gameLogic');

const colors = {
    reset: "\x1b[0m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m"
};

function assert(condition, message) {
    if (!condition) {
        console.log(`${colors.red}  [FAIL] ${message}${colors.reset}`);
        return false;
    }
    console.log(`${colors.green}  [PASS] ${message}${colors.reset}`);
    return true;
}

console.log(`${colors.cyan}=== Big Two Logic Test Suite ===${colors.reset}\n`);

let passedCount = 0;
let totalCount = 0;

function runTest(name, fn) {
    totalCount++;
    console.log(`${colors.yellow}Test #${totalCount}: ${name}${colors.reset}`);
    const result = fn();
    if (result) passedCount++;
}

// --- Test Cases ---

runTest("Card Ranks (3 is lowest, 2 is highest)", () => {
    const threeOfClubs = 0;
    const twoOfSpades = 51; // 12 + 3*13
    return assert(GameLogic.getRank(threeOfClubs) === 0, "3 should be Rank 0") &&
           assert(GameLogic.getRank(twoOfSpades) === 12, "2 should be Rank 12");
});

runTest("Card Comparison (Spade beats Club)", () => {
    const clubA = 11;  // Rank 11, Suit 0
    const spadeA = 50; // Rank 11, Suit 3
    return assert(GameLogic.compareCards(spadeA, clubA) > 0, "Spade A should beat Club A");
});

runTest("Hand Identification (Pairs)", () => {
    const pairOf3s = [0, 13]; // Club 3, Diamond 3
    const info = GameLogic.getHandInfo(pairOf3s);
    // 大陆花色：♠ > ♥ > ♣ > ♦，所以这对 3 取梅花 3（cardId 0）
    return assert(info && info.type === 'PAIR', "Should detect PAIR") &&
           assert(info.value === 0, "Value should be determined by Club (higher suit than Diamond in Mainland)");
});

runTest("Hand Identification (Straight)", () => {
    // 3 of Clubs, 4 of Diamonds, 5 of Hearts, 6 of Spades, 7 of Clubs
    const straight = [0, 14, 28, 42, 4]; 
    const info = GameLogic.getHandInfo(straight);
    return assert(info && info.type === 'STRAIGHT', "Should detect STRAIGHT");
});

runTest("Hand Identification (Flush - legal in Mainland)", () => {
    // 3C, 4C, 5C, 6C, 8C (Flush, not a straight)
    const flush = [0, 1, 2, 3, 5];
    const info = GameLogic.getHandInfo(flush);
    return assert(info && info.type === 'FLUSH', "Flush should be legal (Mainland rules)");
});

runTest("Hand Comparison (Full House vs Straight)", () => {
    // 3C, 3D, 3H, 4C, 4D (Full House)
    const fullHouse = [0, 13, 26, 1, 14]; 
    // 3C, 4D, 5H, 6S, 7C (Straight)
    const straight = [0, 14, 28, 42, 4]; 
    return assert(GameLogic.compareHands(fullHouse, straight) > 0, "Full House should beat Straight");
});

runTest("Hand Comparison (4-of-a-Kind vs Full House)", () => {
    const quads = [0, 13, 26, 39, 1]; // 3,3,3,3, 4
    const fullHouse = [0, 13, 26, 1, 14]; // 3,3,3, 4,4
    return assert(GameLogic.compareHands(quads, fullHouse) > 0, "4-of-a-kind should beat Full House");
});

runTest("Hand Comparison (Straight Flush vs 4-of-a-kind)", () => {
    const sf = [0, 1, 2, 3, 4]; // 3,4,5,6,7 of Clubs
    const quads = [0, 13, 26, 39, 1]; // 3,3,3,3, 4
    return assert(GameLogic.compareHands(sf, quads) > 0, "Straight Flush should beat 4-of-a-kind");
});

runTest("Hand Comparison (Full House vs Full House - Rank Priority)", () => {
    // Q, Q, Q, 10, 10
    const lowerFH = [48, 35, 22, 46, 33];
    // K, K, K, 6, 6
    const higherFH = [10, 23, 36, 3, 16];
    return assert(GameLogic.compareHands(higherFH, lowerFH) > 0, "K-high Full House should beat Q-high Full House regardless of card IDs");
});

runTest("Hand Identification (Dragon)", () => {
    // 13 cards with distinct ranks (Rank 0 to 12)
    const dragonCards = [0, 14, 28, 42, 4, 18, 32, 46, 8, 22, 36, 50, 12]; 
    const info = GameLogic.getHandInfo(dragonCards);
    return assert(info && info.type === 'DRAGON', "Should detect DRAGON");
});

runTest("Special Straight Comparison (2-3-4-5-6 counts as 6, loses to 3-4-5-6-7)", () => {
    // 2-3-4-5-6 → 大陆规则以 6 计
    const s23456 = [12, 13, 27, 41, 3];
    // 3-4-5-6-7 → 以 7 计
    const normalS = [0, 14, 28, 42, 4];
    return assert(GameLogic.compareHands(s23456, normalS) < 0, "2-3-4-5-6 (top 6) should lose to 3-4-5-6-7 (top 7)");
});

runTest("Special Straight Comparison (A-2-3-4-5 is smallest)", () => {
    // A-2-3-4-5
    const sA2345 = [11, 25, 0, 14, 28]; 
    // 3-4-5-6-7
    const normalS = [0, 14, 28, 42, 4]; 
    return assert(GameLogic.compareHands(sA2345, normalS) < 0, "A-2-3-4-5 should lose to normal Straight");
});

runTest("Multiple Pairs Generation (Three Js should yield three pairs)", () => {
    // 3 Js: Club J (8), Diamond J (21), Spade J (47)
    // plus some non-pairs: 3 of Clubs (0)
    const hand = [8, 21, 47, 0];
    const pairs = GameLogic.findPairs(hand);
    
    // 3 对：{8,21} {8,47} {21,47}（顺序不固定，按排序后的 key 比对）
    const keys = pairs.map(p => p.slice().sort((a, b) => a - b).join(','));
    const want = ['21,8', '47,8', '47,21'].map(k => k.split(',').map(Number).sort((a, b) => a - b).join(','));
    const ok = want.every(w => keys.includes(w));

    return assert(pairs.length === 3, "Should return exactly 3 pairs") &&
           assert(ok, "Should contain all combinations: [Club J, Diamond J], [Club J, Spade J], [Diamond J, Spade J]");
});


runTest("Mainland - Triple Hand Identification", () => {
    const triple = [0, 13, 26]; // 3C, 3D, 3H
    const info = GameLogic.getHandInfo(triple);
    return assert(info && info.type === 'TRIPLE', "Should detect TRIPLE");
});

runTest("Mainland - Flush Hand Identification", () => {
    const flush = [0, 1, 2, 3, 5]; // Clubs: 3, 4, 5, 6, 8
    const info = GameLogic.getHandInfo(flush);
    return assert(info && info.type === 'FLUSH', "Should detect FLUSH");
});

runTest("Mainland - Bombs cannot beat singles/pairs", () => {
    const single = [12]; // 2 of Clubs (Rank 12)
    const quad = [0, 13, 26, 39, 1]; // 3-of-a-kind + kicker
    const compareResult = GameLogic.compareHands(quad, single);
    return assert(compareResult === 0, "5 张牌型不能压单张（大陆规则）");
});

runTest("Mainland - hasValidMoves for triples", () => {
    const handWithBetterTriple = [12, 25, 38]; // 2C, 2D, 2H (Triple 2s)
    const handWithWorseTriple = [0, 13, 26]; // 3C, 3D, 3H (Triple 3s)
    const lastPlayTriple = [1, 14, 27]; // 4C, 4D, 4H (Triple 4s)
    
    // 三条 2 压三条 4（2 为 rank 12）
    const canMoveBetter = GameLogic.hasValidMoves(handWithBetterTriple, lastPlayTriple);
    // Triple 3s cannot beat Triple 4s
    const canMoveWorse = GameLogic.hasValidMoves(handWithWorseTriple, lastPlayTriple);
    return assert(canMoveBetter === true, "Better triple should be a valid move") &&
           assert(canMoveWorse === false, "Worse triple should NOT be a valid move");
});

// --- 大陆规则回归测试（1.5.36 新增）---

runTest("Mainland: A2345 是顺子（A 作最小）", () => {
    // 梅花 3,4,5 + 梅花 A,2 → 同花顺，value 应为 5（rank 2）
    const info = GameLogic.getHandInfo([0, 1, 2, 11, 12]);
    const ok = info && (info.type === 'STRAIGHT' || info.type === 'STRAIGHT_FLUSH') && info.value % 13 === 2;
    return assert(ok, `A2345 判定为顺子且以 5 计（实际 ${JSON.stringify(info)}）`);
});

runTest("Mainland: 23456 是顺子（2 作最小端）", () => {
    const info = GameLogic.getHandInfo([0, 1, 2, 3, 12]);
    const ok = info && (info.type === 'STRAIGHT' || info.type === 'STRAIGHT_FLUSH') && info.value % 13 === 3;
    return assert(ok, `23456 判定为顺子且以 6 计（实际 ${JSON.stringify(info)}）`);
});

runTest("Mainland: 纯四张同点不是合法牌型", () => {
    const info = GameLogic.getHandInfo([0, 13, 26, 39]);
    return assert(info === null, `四张同点应为 null（实际 ${JSON.stringify(info)}）`);
});

runTest("Mainland: 四带一（5 张）合法", () => {
    const info = GameLogic.getHandInfo([0, 13, 26, 39, 1]);
    return assert(info && info.type === 'FOUR_OF_A_KIND', `四带一应为 FOUR_OF_A_KIND（实际 ${JSON.stringify(info)}）`);
});

runTest("Mainland: 五张牌型不能压单张", () => {
    const cmp = GameLogic.compareHands([0, 13, 26, 39, 1], [51]);
    return assert(cmp === 0, `四带一 vs 单张 应为 0（实际 ${cmp}）`);
});

runTest("Mainland: J-Q-K-A-2 不是顺子（2 不得在顺子中段或最高位）", () => {
    const info = GameLogic.getHandInfo([8, 22, 36, 50, 12]);   // J♣ Q♦ K♥ A♠ 2♣
    return assert(info === null, `J-Q-K-A-2 应为 null（实际 ${JSON.stringify(info)}）`);
});

runTest("Mainland: A-2-3-4-5 与 2-3-4-5-6 仍是合法顺子", () => {
    const a2345 = GameLogic.getHandInfo([11, 12, 0, 14, 28]);
    const s23456 = GameLogic.getHandInfo([12, 0, 14, 28, 3]);
    return assert(a2345 && a2345.type === 'STRAIGHT' && s23456 && s23456.type === 'STRAIGHT',
        `A2345=${JSON.stringify(a2345)} 23456=${JSON.stringify(s23456)}`);
});

runTest("Mainland: 出牌实例总数 = 19,898（论文 §2.2）", () => {
    const counts = { SINGLE: 0, PAIR: 0, TRIPLE: 0, STRAIGHT: 0, FLUSH: 0, FULL_HOUSE: 0, FOUR: 0, STRAIGHT_FLUSH: 0 };
    const bump = (info) => {
        if (!info) return;
        if (info.type === 'FOUR_OF_A_KIND') counts.FOUR++;
        else counts[info.type] = (counts[info.type] || 0) + 1;
    };
    for (let c = 0; c < 52; c++) bump(GameLogic.getHandInfo([c]));
    const byRank = [];
    for (let r = 0; r < 13; r++) byRank.push([r, 13 + r, 26 + r, 39 + r]);
    for (const cs of byRank) {
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) bump(GameLogic.getHandInfo([cs[i], cs[j]]));
        for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (let k = j + 1; k < 4; k++) {
            bump(GameLogic.getHandInfo([cs[i], cs[j], cs[k]]));
        }
    }
    for (let a = 0; a < 48; a++) {
        for (let b = a + 1; b < 49; b++) {
            for (let c = b + 1; c < 50; c++) {
                for (let d = c + 1; d < 51; d++) {
                    for (let e = d + 1; e < 52; e++) bump(GameLogic.getHandInfo([a, b, c, d, e]));
                }
            }
        }
    }
    const total = counts.SINGLE + counts.PAIR + counts.TRIPLE + counts.STRAIGHT + counts.FLUSH + counts.FULL_HOUSE + counts.FOUR + counts.STRAIGHT_FLUSH;
    const detail = `单${counts.SINGLE} 对${counts.PAIR} 三${counts.TRIPLE} 顺${counts.STRAIGHT} 花${counts.FLUSH} 葫${counts.FULL_HOUSE} 四带一${counts.FOUR} 同花顺${counts.STRAIGHT_FLUSH}`;
    return assert(total === 19898, `总数应为 19898（实际 ${total}：${detail}）`);
});

console.log(`\n${colors.cyan}Summary: ${passedCount}/${totalCount} tests passed.${colors.reset}`);

if (passedCount < totalCount) {
    process.exit(1);
} else {
    process.exit(0);
}
