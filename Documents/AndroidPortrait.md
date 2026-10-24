# 安卓豎屏分支說明（android-portrait）

本分支把上游「台灣大老二 AI」改造成**只發佈安卓豎屏版**的「廣東鋤大地」。
這份文件記錄「做了什麼、為什麼這樣做、怎麼驗證」，方便日後回改或 port 回上游。

- 分支：`android-portrait`
- 套件：`com.twbig2.app`，版本 1.5.24（versionCode 7）
- 目標：Android 豎屏 APK（debug 可直接側載，release 需自備 keystore）

---

## 1. 功能改動

### 1.1 豎屏鎖定

`android/app/src/main/AndroidManifest.xml` 的 `MainActivity` 加上
`android:screenOrientation="portrait"`，整個 App 不再旋轉。

### 1.2 手牌分排（豎屏核心）

`src/views/GameView.js` 的 `buildHandRows()`：

| 模式 | 行為 |
|---|---|
| `smart`（按鈕顯示「牌型」） | 先用 `GameLogic.getHandInfo()` 找出五張牌型（同花順 > 鐵支 > 葫蘆 > 同花 > 順子），整組不拆地放在該排最前，散牌補在後面；總張數 > 6 時壓成兩排（13 張 = 7+6） |
| `five`（「5張」） | 嚴格每排 5 張（13 張 = 5+5+3） |
| `single`（「單排」） | 單排平鋪 |

模式會存進 `localStorage`，下次開啟沿用。

### 1.3 牌桌與座位

- 版面層次：深色地毯（`#game-container`）→ 木質桌沿 → 綠色絨面（`#table-center`）
- 座位：柴犬在上、河狸在左、橘貓在右、自己在下方
- **每局開 App 隨機座位**：`BigTwoAI` 建構子用 Fisher–Yates 把河狸／柴犬／橘貓洗到 1（左）／2（上）／3（右）三格，
  名字（`updateLanguage()` 從 `AI.getNames()` 取名）、頭像（動態 sprite canvas）、出牌槽都跟著角色走；
  每次啟動 App 抽一次，局中「新遊戲」不重抽
- 出牌順序：**逆時針**（自己 → 右家 → 上家 → 左家 → 自己，按座位不按角色；`nextTurn()` 以索引 −1 遞進）
- `setupTablePlays()` 在豎屏時把四個出牌槽搬進 `#table-plays`，按方位絕對定位：
  上＝`#played-3`（`top: 16px`）、左＝`#played-2`、右＝`#played-4`、下＝`#played-1`（`bottom: 16px`），
  上下兩家離桌沿各留 24px；左右兩家各 82px（最後一張牌不帶負邊距，否則右家會多凸 12px）
- 牌桌 `width: calc(100% - 8px)` + `align-self: center`，左右留白對稱（避免 `width:100%` + 4px margin 向右溢出）
- 桌面狀態提示 `bottom: 68px` 疊在下方出牌之上
- 說明視窗（`i` 按鈕）：正文 13px／行高 1.45／字距 −0.2px，標題 14px，分頁標籤 13px 不換行
- 空牌槽自動隱藏；「過牌」以小膠囊呈現；當前最大一手加綠色描邊
- 座位 `z-index` 高於牌桌，否則會被桌子背景蓋掉一半

### 1.4 緊湊化

矮屏（`max-height: 760px`）另有一組尺寸：牌面、座位頭像、按鈕、間距同步縮小；
整體高度由 297px（三排面板）降到約 230px，省下的高度用來放大牌面。

### 1.5 選牌不遮鄰牌

手牌是疊排（右邊一張壓住左邊一張的右半）。原本 `.card.selected { z-index: 10 }`
會反過來蓋住右邊那張的點數／花色，改為**不提升 z-index**，只用抬起 + 綠色描邊 + 陰影；
觸控裝置再關閉 `:hover` 抬起（避免點過的牌卡在半空）。

---

## 2. 規則改動（大陸鋤大地）

`src/gameLogic.js` 新增 `MainlandRules`（繼承 `HongKongRules`，只覆寫花色強度），並設為預設模式：

| 項目 | 內容 |
|---|---|
| 花色 | ♠ 黑桃 > ♥ 紅心 > ♣ 梅花 > ♦ 方塊（**梅花大於方塊**） |
| 起手 | 持 ♦3 者先出，第一手必須含 ♦3 |
| 牌型 | 單張／對子／三條／五張（順子、同花、葫蘆、**四帶一**、同花順）／一條龍 |
| 順子 | A 可作最大（10JQKA）或最小（A2345，以 5 計）；2 只作最小端（23456，以 6 計），不入順子中間 |
| 比大小 | **只有張數相同才能比**：五張牌型不能壓單張／對子／三條（`checkBombBeating` 在大陸模式下為 no-op） |
| 報單頂大 | 任一家剩 1 張時自動報單；其**上家出單張必須先出自己最大的牌**（玩家與 AI 都受限） |
| 喊拉 | **已移除**（那是台灣部分地區習俗），剩最後一手牌不能再宣告後一次出完 |

舊存檔會透過 `ruleModeMigratedMainland` 標記一次性切換到 `mainland`
（`src/renderer.js`），避免使用者仍停留在台灣規則。說明頁的「規則模式」下拉已移除，
`ruleMode` 固定為 `mainland`，中英文規則文案只描述大陸規則。

---

## 2.5 音效（BGM 已移除，改成報牌配音）

- 背景音樂三首（`Cards_On_The_Line`／`Iron_in_the_Gale`／`Sovereign_Ascent`）與 `playBGM/switchBGM` 全部刪除
- 右上角喇叭鈕為「報牌配音 開／關」兩態（`soundMode` 只有 0／2），開啟時試聽「對二」
- **AI 報牌名**：`AudioPlayer.playHandName(info, cards)` 在**任何人**出牌時念牌型（含本機）
  - 單張／對子／三條帶點數：`single_0..12.mp3`（一張三…一張二）、`pair_*.mp3`（對三…對二）、`triple_*.mp3`（三條三…三條二）
  - 五張牌型只念類型：`straight.mp3`、`flush.mp3`、`fullhouse.mp3`、`fourwithone.mp3`、`straightflush.mp3`、`dragon.mp3`
  - 連續出牌會先 `pause()` 上一聲，避免疊音
- **報單語音**：`declare_cat/dog/beaver/you.mp3`（橘貓／柴犬／河狸／你 四種音色），失敗回退 `declare_you.mp3`；角色若不是這四隻（Alex／Bella…）也回退人類音
- **Pass 語音**：`voice/pass_cat|dog|beaver|you.mp3` 念「過」，舊動物配音 `src/assets/mp3/pass_*.mp3` 已全部刪除
- **英文語音**：`voice_en/` 共 53 檔（`en-US-GuyNeural` 播報；角色報單 Aria／Guy／Steffan／Jenny），`voiceDir()` 依 `window.currentLang` 切 `voice/` ↔ `voice_en/`
  - `Three…Ace, Two`、`Pair of twos`、`Three twos`、`Straight`、`Flush`、`Full house`、`Four with one`、`Straight flush`、`Dragon`、`One card`、`Pass`
- **喇叭鈕**：按下只切換開關並發一聲 880Hz 提示音（`playToggleBeep()`），不再念「對二」
- 語音檔由 `edge-tts` 產生（`zh-CN-YunjianNeural` 播報腔、`+6%` 語速），中文 53 檔 **216KB**、英文 53 檔 **228KB**，`src/assets/mp3` 全目錄 444KB
- 說明頁只剩「遊戲規則」一個分頁：`#tab-keyboard`、`#tab-license` 與兩顆 tab 按鈕已刪除

---

## 3. 計分改動

### 3.1 局末計分表（每局結束彈出）

- `#score-modal`（`index.html`）+ `.score-table`（`styles.css`），由 `GameController.showScoreTable(winnerIndex, roundScores)` 填充
- 三欄：玩家／本局／累計（本次開 App）；正分綠、負分紅、0 灰；自己名字藍、贏家行金色底
- 「下一局」按鈕（`#score-next-btn` → `initGame()`）；**點彈窗外圍遮罩也會關閉**
- 累計：`window.sessionScores` / `window.sessionWins` / `window.roundsPlayed`，每局結束累加，**只有重開 App 才歸零**
- ⚠️ **`initGame()` 必須清空 `gameState.scores`**（1.5.34 漏了，導致「本局」其實是累計、`sessionScores` 又重複累加）
- 實測：第 1 局 `你 -1 / 橘貓 +35 / 河狸 -30 / 柴犬 -4`（合計 0），第 2 局 `+7 / -2 / -1 / -4`，累計 `+6 / +33 / -31 / -8` 正確

### 3.1.1 戰績按鈕

- 「i」左側 🏆 `#stats-btn` → `#stats-modal`（`showSessionStats()`）：本次開 App 局數、每人勝局、每人累計分
- 同樣支援點外圍關閉；英文版 `Session Record` / `{n} rounds played since app launch`（1 局時用單數句）

### 3.2 計分公式

`src/controllers/GameController.js` → `calculateScores()`：

```text
輸家分 = 剩餘張數 × 張數倍數 × 黑2倍數
張數倍數：8-9 → 2、10-12 → 3、13 → 4
黑2：手上剩「黑桃 2」→ ×2（只認黑桃，其他花色不算；52 張唯一故最多乘一次）
贏家倍數：結尾牌組含 2 → ×2
鐵支／同花順：已取消額外翻倍（贏家、輸家兩邊都取消）
```

實測（8 張基準、無 2）：−16；含黑桃 2：−32；含紅心 2：−16；10 張：−30；13 張：−52。

---

## 4. 移除大模型（LLM）

| 刪除項目 | 檔案 |
|---|---|
| LLM 決策核心 | `src/ai/BaseLLMAI.js`、`src/ai/LLMCharacters.js` |
| LLM 服務層 | `src/services/AiServiceFactory.js`、`aiWorker.js`、`LmStudioAiService.js`、`WebLlmAiService.js`、`sharedPrompt.js`、`example.js` |
| 內建模型快取 | `src/services/WebLlmCacheManager.js`、`src/views/WebLlmCacheView.js` |
| 賽後復盤 | `src/controllers/AISummaryController.js`、`src/views/AISummaryView.js` |
| UI | 規則窗的「AI 設定／模型管理」分頁、角色 AI 設定彈窗、`⚙️` 入口、復盤面板、CORS 指引、`.llm-glow` 樣式 |
| 資源 | `avatar_diana.png`、`avatar_ares.png`（約 1.7MB）及相關儲存鍵 |

保留的本機 AI：`AICharacter`、`HeuristicAI`（Alex／Bella／Chris／河狸／柴犬／橘貓）、`BigTwoAI`。

---

## 5. 改名

「台灣大老二 AI」→「廣東鋤大地」／英文「Guangdong Chu Da Di」，
涵蓋 `index.html`、`about.html`、`src/i18n.js`、`capacitor.config.json`、`android/.../strings.xml`、`package.json`。
`applicationId` 保持 `com.twbig2.app`，可覆蓋升級。

---

## 6. 驗證方式（可重現）

```bash
# 規則引擎
npm test                                   # 17/17

# 版面（固定 393px 寬的 iframe，避開 headless Chromium 最小 500 寬）
# - scrollWidth 應等於 393
# - 四家牌槽座標：上(176,212)、左(24,384)、右(339,397)、下(176,556) @393x852

# 選牌遮擋（hit-test）
# 對每張牌檢查左上角點數區是否命中自己 → 期望 0 張被遮

# 整局自動對局（0 號位交給 AI，虛擬時間快進）
# 期望：gameEnded=true、無 JS 錯誤、桌面同時可見多家出牌
```

---

## 7. 已知限制

- 桌面（Electron／Tauri）版面保留但未在本分支驗證
- 介面字串只有繁中／英文；`cards`、`Score` 等仍為英文
- 手牌分排的「牌型」標籤標在整排上，若該排含散牌，標籤仍代表排首的牌型組
- release 包需自備 keystore（`android/keystore.properties`，已 gitignore）
