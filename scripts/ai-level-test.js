// node scripts/ai-level-test.js —— 驗證「對手強度」設定是否真的控制搜索
global.window = global;
const store = {};
global.AppStorage = { getItem: (k) => (k in store ? store[k] : (k === 'ruleMode' ? 'mainland' : null)), setItem: (k, v) => { store[k] = v; } };
global.localStorage = { getItem: () => null, setItem: () => { } };

const GameLogic = require('../src/gameLogic.js');
const { AICharacter } = require('../src/ai/AICharacter.js');
const E = require('../src/ai/ChudadiEngine.js');
global.GameLogic = GameLogic;
global.ChudadiEngine = E;

const rng = E.makeRng(31337);
function deal() {
    const d = []; for (let c = 0; c < 52; c++) d.push(c);
    for (let i = 51; i > 0; i--) { const j = (rng() * (i + 1)) | 0; const t = d[i]; d[i] = d[j]; d[j] = t; }
    const p = [[], [], [], []]; for (let i = 0; i < 52; i++) p[i % 4].push(d[i]);
    for (const h of p) h.sort((a, b) => GameLogic.compareCards(a, b));
    return p;
}

(async () => {
    const ai = new AICharacter(GameLogic, 'Chris');
    const results = {};
    for (const level of ['normal', 'hard']) {
        store.aiLevel = level;
        let searches = 0, iters = 0, ms = 0, gateOpen = 0;
        for (let d = 0; d < 60; d++) {
            const players = deal();
            const played = []; let lastPlay = null, lastPi = -1;
            let turn = players.findIndex(p => p.includes(13));
            for (let s = 0; s < 10; s++) {
                const legal = GameLogic.getLegalMoves(players[turn], lastPlay) || [];
                if (!legal.length) { turn = (turn + 1) % 4; continue; }
                const mv = legal[(rng() * legal.length) | 0].cards;
                for (const c of mv) { players[turn].splice(players[turn].indexOf(c), 1); played.push(c); }
                lastPlay = mv; lastPi = turn; turn = (turn + 1) % 4;
            }
            const ctx = {
                playerIndex: turn, requireStartCard: false, hand: players[turn].slice(),
                lastPlay, lastPlayerIndex: lastPi, players, playedCards: played,
                pressureActive: false, pressureTarget: -1, pressureCount: 0, fatTargets: [],
                iAmSafe: true, allyIndices: [], allianceActive: false, nextIsAlly: false,
                oneCardAlly: -1, mustTopSingle: false, nearWin: false, lastCardMode: false
            };
            window.__searchInfo = null;
            window.__searchDebug = [];
            await ai.decide(ctx);
            if (window.__searchDebug.length > 0) gateOpen++;   // 進入搜索閘門（SEARCH>0 且有候選）
            if (window.__searchInfo) { searches++; iters += window.__searchInfo.iters; ms += window.__searchInfo.ms; }
        }
        results[level] = { searches, iters, ms, gateOpen };
    }
    for (const [lv, r] of Object.entries(results)) {
        console.log(`aiLevel=${lv.padEnd(6)} 60 個決策 → 進入搜索閘門 ${r.gateOpen} 次，實際觸發搜索 ${r.searches} 次，平均迭代 ${r.searches ? (r.iters / r.searches).toFixed(0) : 0}，平均 ${r.searches ? (r.ms / r.searches).toFixed(0) : 0}ms`);
    }
    const ok = results.normal.gateOpen === 0 && results.normal.searches === 0 && results.hard.gateOpen > 0;
    console.log(ok ? 'OK：普通=完全搜索關閉，困難=會搜索' : 'FAIL');
    process.exit(ok ? 0 : 1);
})();
