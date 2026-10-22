# 程式碼架構說明 (Architecture)

本分支「廣東鋤大地」是 [Taiwan Big2 AI](https://github.com/mesmerli/taiwan-big-two-ai) 的安卓豎屏改版：
核心仍是純 Web 前端（HTML/CSS/JS），透過 **Capacitor** 封裝成原生 Android App。
**本分支已移除所有大模型（LLM）相關模組**（`BaseLLMAI`、`LLMCharacters`、`AISummary`、`WebLlmCache` 等），
AI 只保留本機啟發式規則。

## 專案目錄結構

```text
taiwan-big-two-ai/
├── index.html               # 遊戲前端主要畫面（單頁，含規則彈窗）
├── about.html               # 「關於」頁
├── main.js / src-tauri/     # Electron / Tauri 桌面外殼（本分支未驗證，保留但非目標）
├── src/                     # ★ 唯一前端來源
│   ├── renderer.js          # 進入點：初始化控制器與視圖、綁定 DOM
│   ├── gameLogic.js         # 規則引擎（見下）
│   ├── ai/
│   │   ├── AICharacter.js   # 角色基底：名稱、頭像、決策接口
│   │   ├── HeuristicAI.js   # 本機規則 AI（Alex/Bella/Chris + 河狸/柴犬/橘貓）
│   │   └── BigTwoAI.js      # 四座位管理器，註冊為 window.AI
│   ├── controllers/
│   │   ├── GameController.js    # 發牌、回合流程、合法性檢查、結算計分
│   │   ├── SettingsController.js# 語系、音效、規則模式、頭像換人
│   │   └── KeyboardController.js# 桌面鍵盤快捷鍵（手機無效）
│   ├── views/
│   │   ├── GameView.js      # 手牌分排、桌面出牌、座位、RWD 切換
│   │   └── DynamicAvatar.js # 動物角色動態頭像
│   ├── audio.js             # 音效與 BGM
│   ├── env.js               # 環境判斷（Android / Electron / Web）與儲存封裝
│   ├── i18n.js              # 繁中／英文字串
│   ├── services/            # licenseService / systemService
│   └── styles.css           # 桌面格狀版面 + 豎屏手機版面（本分支重點）
├── android/                 # Capacitor 安卓專案（AndroidManifest 鎖定 portrait）
├── www/                     # 由 src/ 同步產生的副本（npm run sync-www，勿手改）
├── tests/logic.test.js      # 規則引擎測試（17 項）
└── Documents/               # 本文件、建置指南、分支說明
```

> `src/` 是唯一來源：改完務必 `npm run sync-www` → `npx cap sync android` 再打包，否則 APK 不會更新。

## 規則引擎 (`src/gameLogic.js`)

採 **Strategy Pattern**，`GameLogic` 依 `AppStorage.ruleMode` 選用策略：

| 策略 | 起手牌 | 花色強度 | 特點 |
|---|---|---|---|
| `MainlandRules`（預設） | ♦3 | ♠ > ♥ > ♣ > ♦ | 大陸鋤大地：允許同花與三條，梅花大於方塊 |
| `TaiwanRules` | ♣3 | ♠ > ♥ > ♦ > ♣ | 不允許單出同花／三條 |
| `HongKongRules` | ♦3 | ♠ > ♥ > ♣ > ♦ | 同大陸花色，另允許單出三條 |

`MainlandRules` 繼承 `HongKongRules`，只覆寫花色強度，避免重複實作牌型判定。

主要 API：

- `getHandInfo(cards)` → `{ type, value, strength, special }`（SINGLE / PAIR / TRIPLE / STRAIGHT / FLUSH / FULL_HOUSE / FOUR_OF_A_KIND / STRAIGHT_FLUSH）
- `compareHands(a, b)` / `compareCards(a, b)`：點數優先、同點數比花色
- `sortCards(cards)`：依當前規則排序
- `getStartCard()`、`getSuitStrength(cardId)`

牌張編碼：`cardId = suit * 13 + rank`，`rank 12 = 2`，`suit 3 = 黑桃`。所有牌型與比較都建立在這套編碼上。

## 遊戲流程 (`GameController`)

1. `initGame()` 洗牌、發 13 張、找 ♦3（或 ♣3）持有人先出
2. `executePlay()` 驗證牌型與是否能壓過 `lastPlay`，更新 `gameState` 與桌面
3. `passTurn()` / `nextTurn()`：三家連續過牌則清空桌面、由最後出牌者重新領出
4. 玩家剩一張時必須喊「拉」，最後一張必須是最大牌
5. 有人出完 → `calculateScores(winner)` 結算（見下）

### 結算倍數

```
輸家分 = 剩餘張數 × 張數倍數 × 黑2倍數
張數倍數：8-9 → 2、10-12 → 3、13 → 4
黑2：手上剩黑桃 2 → ×2（其他花色的 2 不算）
贏家倍數：結尾牌組含 2 → ×2
鐵支／同花順：不額外加倍（本分支已取消）
```

贏家得分 = 三家輸分總和。

## 視圖與版面 (`GameView` + `styles.css`)

- `updateResponsiveLayout()`：Android 或視窗寬 < 900px 時切到 `.mobile-layout`，桌面維持原本格狀版面
- `buildHandRows()`：手牌分排
  - `smart`（牌型）：先放五張牌型組（整組不拆），其餘散牌補後，>6 張時壓成兩排（13 → 7+6）
  - `five`：嚴格每排 5 張
  - `single`：單排
- `setupTablePlays()`：豎屏時把四個 `.played-cards-slot` 搬進 `#table-plays`，按座位方位（上／左／右／下）絕對定位；切回桌面寬度時放回原位
- 座位：`#player-3`（柴犬）在上、`#player-2`（河狸）左、`#player-4`（橘貓）右、`#human-area` 在下；座位 `z-index` 高於牌桌，避免被桌面背景蓋住

## 本機 AI (`src/ai/`)

- `AICharacter`：角色基底（`name`、`avatar`、`decide()`）
- `HeuristicAI`：以「能否壓過、剩餘牌結構、是否需要保牌」為主的規則決策，並提供 `findPlay()` 給管理器
- `BigTwoAI`：`window.AI`，管理四個座位的角色，支援 `swapCharacter(index)` 換人、`findPlay(index, ctx)` 決策、`getNames()`

沒有網路請求、沒有模型推理、沒有記憶檔案寫入。

## 跨平台封裝

| 平台 | 封裝 | 本分支狀態 |
|---|---|---|
| Android | Capacitor（`android/`） | **唯一目標**，鎖定 portrait |
| Electron | `main.js` | 保留，未驗證 |
| Tauri | `src-tauri/` | 保留，未驗證 |
| 瀏覽器 | 直接開 `index.html` | 可用（開發預覽） |

## 測試

`node tests/logic.test.js`（`npm test`）涵蓋牌張比較、牌型判定、首手必含 ♦3、怪物合法性與大陸花色順序，共 17 項。
UI 相關測試（Playwright/Electron）已隨 LLM 功能一併移除。
