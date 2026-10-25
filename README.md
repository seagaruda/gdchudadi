# 廣東鋤大地 · Guangdong Chu Da Di (Android Portrait)

[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Platform](https://img.shields.io/badge/Platform-Android%20(portrait)-brightgreen.svg)](https://capacitorjs.com/)
[![Version](https://img.shields.io/badge/Version-1.5.24-orange.svg)](./Documents/changelog.md)
[![AI](https://img.shields.io/badge/AI-100%25%20local%20rules-lightgrey.svg)](#-local-ai-no-network)

A **portrait-only Android build of Guangdong Chu Da Di (广东锄大地)** — the mainland Chinese variant of Big Two — built with [Capacitor](https://capacitorjs.com/).

Based on the open-source project **Taiwan Big2 AI** by [mesmerli](https://github.com/mesmerli/taiwan-big-two-ai) (AGPL-3.0). This branch strips every Large-Language-Model (LLM) feature and turns the game into a small, offline, rule-based card game optimised for one-handed play on a phone.

<p align="center">
  <img src="./screenshots/android-portrait-game.png" width="31%" alt="Portrait game table" />
  <img src="./screenshots/android-portrait-rules.png" width="31%" alt="Rules and scoring" />
</p>

> Table centre = cards played by each seat (top = 柴犬, left = 河狸, right = 橘貓, bottom = you). Bottom panel = your hand, grouped into rows.

---

## ✨ What this branch changes

| | Upstream (Taiwan Big2 AI) | This branch |
|---|---|---|
| Name | 台灣大老二 AI | **廣東鋤大地** |
| Orientation | desktop / landscape | **portrait-locked Android** |
| Rules | Taiwanese + Hong Kong | **Mainland (大陆锄大地) by default** |
| Opponents | heuristic + LLM (WebGPU / OpenAI-compatible) | **heuristic AI only** |
| LLM features | AI settings, model cache, post-game review | **all removed** (no network, no API key) |
| Scoring | bombs multiply | **bombs no longer multiply**; card-count ladder |
| Hand layout | single row | **auto 2–3 rows, grouped by 5-card combos** |
| Played cards | small slot next to each seat | **laid out on the table by seat position** |

---

## 🎴 Rules (mainland 锄大地)

- **Rank order**: 2 > A > K > Q > J > 10 > 9 > 8 > 7 > 6 > 5 > 4 > 3
- **Suit order**: ♠ Spade > ♥ Heart > ♣ Club > ♦ Diamond — i.e. **club beats diamond** (梅花大于方块)
- **Starting card**: the holder of **♦3** must lead the first round, and that play must contain ♦3
- **Hand types**: single, pair, triple, five-card hands (straight, flush, full house, four-of-a-kind, straight flush), plus **Dragon** (13-card run → instant win)
- **Five-card ranking**: Straight Flush > Four-of-a-Kind > Full House > Flush > Straight
- **Bombs**: four-of-a-kind / straight flush may only beat five-card hands (not singles, pairs or triples) — this affects legality only, **not scoring**
- **Shout "La" (拉)**: if a play leaves you with one card, you must shout; the last card must then be your highest card

### Scoring

| Situation | Multiplier |
|---|---|
| Base | 1 point per remaining card |
| Loser left with 8–9 cards | ×2 |
| Loser left with 10–12 cards | ×3 |
| Loser left with 13 cards (played nothing) | ×4 |
| Loser holds the **2 of Spades (黑桃 2)** | ×2 (only that card — ♣2/♦2/♥2 do not count) |
| Winner's final play contains a **2** | ×2 |
| Four-of-a-Kind / Straight Flush | **no extra multiplier** (removed in this branch) |

The winner collects the sum of all three losers' losses.

---

## 📱 UI highlights

- **Portrait locked** (`android:screenOrientation="portrait"`) — no rotation, no letterboxing
- **Real table feel**: dark carpet → wooden rim → green felt; three opponents sit along the table edge (top / left / right), you at the bottom
- **Played cards land on the table**, positioned by seat, with the current best hand outlined in green; empties are hidden and passes show as a small chip
- **Hand grouping**: your cards are auto-arranged into rows of five-card combos (straight flush > four-of-a-kind > full house > flush > straight), so a five-card hand is obvious at a glance
  - Layout button cycles **牌型 (smart 2-row) → 5張 (strict rows of 5) → 單排 (single row)**
  - 13 cards → 7+6, 10 cards → 5+5, 7 cards → 4+3
- **Selection never hides a neighbour**: cards overlap, but a selected card is only lifted + outlined, so the neighbouring rank stays readable
- **Compact layout** for short screens (≤760 px viewport height): smaller cards, thinner seats, tighter paddings — nothing gets clipped
- Language switch (Traditional Chinese / English), sound effects, keyboard shortcuts on desktop

---

## 🤖 Local AI, no network

All three opponents (柴犬 / 河狸 / 橘貓, plus Alex / Bella / Chris) run on **local heuristics** in `src/ai/HeuristicAI.js`:

- **Alex** — balanced / positional
- **Bella** — defensive, keeps bombs for later
- **Chris** — aggressive, dumps high cards early
- Animal personas (Beaver / Shiba / Orange Cat) — mixed strategies with distinct voices

There is **no HTTP request, no API key, no model download, no telemetry**. `window.AISummary`, WebLLM and the LM Studio bridge are gone from this branch.

### On top of the heuristic: ISMCTS re-ranking (`src/ai/ChudadiEngine.js`)

The base score of every legal move comes from the hand-splitting DP `f(H)` + hand value `V(H)` + exact zero-sum utility (paper §7, §2.3). For the handful of moves that are *within 4 points* of the best one, a lightweight Information-Set MCTS (paper §6, ported from the paper's reference Java implementation) re-ranks them:

| item | value |
|---|---|
| combos enumerated (self-test) | **19,898** — single 52 / pair 78 / triple 52 / straight 10,200 / flush 5,108 / full house 3,744 / four+one 624 / straight flush 40 |
| settlement self-test | 5/8/0/12 cards left → **37 / −7 / 57 / −87** |
| search trigger rate | **8 %** of decisions (only close calls) |
| cost per search | **~39 ms**, 200 iterations (time-capped at 400 ms on device) |
| paired A/B, 160 games | **+2.16 pts/deal** (se 0.98), better 13 / worse 9 / tie 138 |
| in-game switch | **i → 對手強度 tab** (next to the 規則 tab): *Normal · fast* (default, no search) / *Hard · thinks ahead* (200 iters) |
| stored as | `AppStorage('aiLevel')` = `normal` / `hard` — read on every decision, so the switch applies instantly |

Determinization only sees the AI's own hand + public info (played cards, per-seat card counts, table) — it cannot peek. Rollouts use the heuristic policy with ε = 0.08 and the real pairwise settlement for the `max^n` backup. Two safety rails: the search is skipped for the Taiwan / Hong Kong rule sets (bombs + different straight windows) and it never overrides a clear heuristic winner.

Verify it yourself:

```bash
node scripts/engine-test.js        # rules: 19,898 combos, settlement, 500 random games, Θ5
node scripts/ai-search-test.js     # integration: legality + latency per decision
node scripts/app-ai-game-test.js 40 200   # paired strength A/B (40 deals × 4 seats)
```

Tap any avatar to swap that seat's personality — the whole roster is local.

---

## 🛠️ Build

### Requirements

| Tool | Version |
|---|---|
| Node.js | ≥ 18 |
| JDK | **21** (Gradle 8.14 needs it) |
| Android SDK | platform 36 + build-tools 35/36 |
| Gradle | 8.14.x (or the project wrapper) |

### 1. Web assets

```bash
npm install
npm run sync-www          # src/ + index.html → www/  (single source of truth)
```

### 2. Debug APK

```bash
npx cap sync android
cd android
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
./gradlew assembleDebug          # or: gradle assembleDebug
```

Output: `android/app/build/outputs/apk/debug/app-debug.apk`

### 3. Release APK (signed)

Create `android/keystore.properties` (already git-ignored):

```properties
storeFile=/absolute/path/to/release.jks
storePassword=******
keyAlias=******
keyPassword=******
```

```bash
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk` (v2 + v3 signed)

> The release signature differs from the debug one — uninstall a debug build before installing a release build of the same `applicationId`.

### 4. Install

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

---

## 🧪 Tests

```bash
npm test                  # node tests/logic.test.js — rules engine (17 cases)
```

Tests cover card comparison, hand types, first-play ♦3 enforcement, bomb legality and the mainland suit order (♣ > ♦).

---

## 📁 Project structure

```text
index.html                 # game view (single page)
src/
├── renderer.js            # bootstrap: controllers + views wiring
├── gameLogic.js           # rules: BaseRules / TaiwanRules / HongKongRules / MainlandRules
├── ai/
│   ├── AICharacter.js     # persona base (name, avatar, decision hook)
│   ├── HeuristicAI.js     # local rule-based brains (Alex/Bella/Chris + animal seats)
│   └── BigTwoAI.js        # 4-seat manager, exposed as window.AI
├── controllers/
│   ├── GameController.js  # dealing, turn flow, legality checks, scoring
│   ├── SettingsController.js
│   └── KeyboardController.js
├── views/GameView.js      # hand rows, table plays, seats, responsive switching
├── services/              # license / system helpers
├── styles.css             # desktop grid + portrait mobile layout
└── i18n.js                # zh / en strings
android/                   # Capacitor Android project (portrait-locked)
www/                       # generated copy of the web app (do not edit)
Documents/                 # architecture, build guide, branch notes
```

---

## 🧭 Scope of this branch

- Android portrait is the **only** supported target. The Electron / Tauri desktop shells are still in the repo but are **not tested on this branch**.
- Upstream's Microsoft Store build, MSIX, trial licensing and StoreBridge are unused here.
- Chinese UI is Traditional; strings for Simplified can be added in `src/i18n.js`.

---

## 📜 License & credits

- Original project: [Taiwan Big2 AI](https://github.com/mesmerli/taiwan-big-two-ai) by **mesmerli**, licensed **AGPL-3.0**.
- This fork keeps the same license: **GNU AGPL-3.0** — derivative works must stay open source.
- Rule adaptations, portrait layout and LLM removal: this branch (`android-portrait`, maintained by seagaruda).

See [changelog](./Documents/changelog.md) and [architecture notes](./Documents/architecture.md).
