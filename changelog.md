# Changelog

## [android-portrait] - 2026-10-23

### Fixed（計分改成聯衆的「兩兩互比」公式）
- 舊版：輸家各扣自己的牌分，贏家拿走三家牌分總和 → 輸家永遠是負分，跟聯衆官網算例不符。
- 新版（論文 §2.3 / 聯衆官網）：先算每家的**牌分** p（贏家 0），再 **每兩家互相比一次**：
  ```
  score_i = Σ_{j≠i} (p_j − p_i)
  ```
  四家合計必為 0；**輸家也可能得正分**（例如自己剩 5 張、別人剩 12 張）。
- 牌分 p 仍含三條加倍：剩 8~9 張 ×2、10~12 張 ×3、13 張 ×4；8 張以上含黑桃2 再 ×2；贏家結尾含 2 時三家牌分再 ×2。
- 計分表每格小字改為「N張 ×M · 黑2 ×2 · 結尾2 ×2 · 牌分 P」，贏家那行顯示「三家總和」；說明頁新增一條「結算：每兩家互相都要比一次…」。

### Verified
- 官網算例：剩 5、8、0、12 張 → 牌分 5、16、0、36 → 得分 **37、-7、57、-87**（與聯衆官網完全一致）
- 極端加倍：剩 9、13(含♠2)、0、10 張、贏家結尾帶 2 → 牌分 36、208、0、60 → 得分 **160、-528、304、64**，合計 0
- 3 局實跑：計分表與戰績表逐格一致、累計逐列相加相符；6 局實跑：每局四家手牌+已出牌=52、無重複、無 JS 錯誤
- 393×852 截圖：四行小字完整顯示、無重疊無裁切


### Fixed（先出規則：第一局 ♦3 先出，第二局起由上局贏家先出）
- 之前 `initGame()` **每一局**都重新找 ♦3 持有者先出，跟 Information 裡寫的規則說明（「之後每局由上一局贏家先出」）不一致。
- 現在：
  - 第一局（本次開 App 後的第一次發牌）＝ ♦3 持有者先出，`gameState.requireStartCard = true`，首手必須帶 ♦3；
  - 第二局起 ＝ `window.lastRoundWinner` 先出，`requireStartCard = false`，不限制帶 ♦3；
  - `finalizeRound()` 寫入 `window.lastRoundWinner`，`initGame()` 讀它決定先出者；
  - 「新遊戲」按鈕重置 `lastRoundWinner / roundsPlayed / sessionScores / sessionWins / roundHistory / roundDetails`，回到「♦3 先出」。
- 人類出牌驗證與 AI 首手規則都改看 `requireStartCard`，避免贏家先出時被卡「必須帶 ♦3」。

### Verified
- `probe35`：deal1 `turn=♦3持有者, requireStartCard=true`；deal2 `turn=上局贏家, requireStartCard=false`（AI 領出五張牌型且不含 ♦3）；deal3 同上局贏家；按「新遊戲」後 `requireStartCard=true` 且先出者回到 ♦3 持有者。
- `probe22` 6 局實跑：每局四家手牌 + 已出牌 = 52、無重複、只有一家 0 張、無 JS 錯誤。
- `probe17` 3 局：計分表與戰績表逐局一致、累計逐列相加相符。


### Changed（按論文《锄大地(广东规则)的不完全信息博弈建模与最优策略求解》重寫 AI 引擎）
論文全文見 `Documents/chudadi_paper.md`。落地了其中可實作的 4 個部分：

1. **§7 手牌拆牌 DP**：`_buildShedTable()` 用位元遮罩 DP 算出 `f(H)`＝打完這手牌最少幾輪（13 張＝2¹³ 個子集，實測 4.3ms），並能直接查「打掉這手之後 f 變多少」→ 用「拆牌進度」取代原本的「甩幾張牌」。
2. **手牌價值** `V(H) = −1.0·f(H) + 0.55·κ(H) − 0.28·ω(H)`（κ＝控制力：2／A／大牌型；ω＝孤張小單），並用 softmax 把四家的 V 換成勝率（對手只知道張數，`f≈n/1.9`）。
3. **§2.3 聯衆收益** `u_i = Σ_{j≠i} p_j − 3·p_i` 直接進目標函數（p 為牌分：8~9 張 ×2、10~12 張 ×3、13 張 ×4），不再用自己編的加權項。
4. **§8 殘局結論**：
   - 命題2：**下家報單時優先領多張牌型**（他只剩一張接不上），單張才受「頂大」限制 → 移除了原本 `mustTopSingle` 的提前返回，改由 GameController 強制單張頂大；
   - 黑桃2 止損：剩 **8~10 張**且手握 ♠2 時把翻倍算進牌分，鼓勵早點打掉；11 張以上不著急（避免開局亂丟 ♠2）。

### Measured（同一副牌輪換四座位的復式對局，node 無頭引擎對打）
| 對手 | 新引擎勝率 | 新引擎平均分 | 對手平均分 |
|---|---|---|---|
| v1.5.49 舊引擎（480 局/方） | **62.9%** | **+6.38** | −7.45（勝率 3.7%） |
| 隨機合法策略（160 局/方） | **71.3%** | **+17.06** | −5.69 |

- 全 AI 自我對戰勝率 26.3% / 22.5% / 27.5% / 23.7%（四家接近 25%，無座位偏差）；四家分數合計 0
- 單次決策耗時（13 張滿手）：**平均 10.3ms**，拆牌 DP 4.3ms
- App 內 6 局實跑：四家手牌 + 已出牌 = 52、無重複牌、只有一家 0 張、無 JS 錯誤


### Changed（AI 改成「期望得分最大化」的博弈決策，不再靠死規則分支）
- 新增 `AICharacter._evaluate()`：把**每一個合法選擇**（所有單張 / 對子 / 五張牌型 / PASS）換算成期望得分，取最高者
  ```
  期望得分 = p(我贏) × Σ別人輸分 − (1 − p) × 我的輸分
           + 0.34 × 甩牌張數                      // 越早離手越安全
           + 0.06 × 牌力 × 剩餘張數              // 拿到牌權的價值
           − 大牌保留成本（手上還 ≥4 張時，K/A/2 有額外成本）
           − 出小牌讓 ≥8 張的人跟上造成的彩池縮水
           − 有人剩 1 張時還 PASS（−1.5）
  ```
- `p(我贏)` 用 `1 / 剩餘張數^1.5` 正規化估計；輸分用聯眾公式（8~9 ×2、10~12 ×3、13 ×4）
- 規則仍硬性保留（不是策略）：首輪帶 ♦3、報單時下家必須頂大
- 角色性格改為只調「攻擊性」權重 `traits.aggr`（Alex 0.78 / Bella 0.30 / Chris 0.55 / 橘貓 0.62 / 柴犬 0.50 / 河狸 0.44），策略本體一致
- 刪掉 `choosePressureLead` / `chooseFeedLead` 與「有盟友就讓牌」的硬分支：讓牌與否改由期望分決定

### 實測期望分（同一局面並列比較）
| 局面 | 最佳選擇 | 期望分 | 次佳 | PASS |
|---|---|---|---|---|
| 上家剩 2 張出 7、我 6 張 | 出 Q（最小可壓） | −2.94 | 出 J −2.95 | −4.71 |
| 場上有 10 張肥家、我 6 張 | 五張牌型 | **35.57** | 小單張 −0.01 | — |
| 場上無肥家、我 6 張 | 五張牌型 | **9.70** | 小單張 −2.00 | — |

- 6 局完整對局壓力測試：每局「四家手牌 + 已出牌 = 52」、無重複牌、只有一家 0 張、四家分數合計 0，零 JS 錯誤


### Changed（只剩 1 張的人也可以當盟友）
- 安全區（自己 < 8 張）內，**剩 1 張的人也算盟友**，前提是**我不是他的上家**（他不在我的下家位置）
  - 我不是他的上家 → 我領出時改出**最小單張**，讓他用最後一張接過去直接走完（`feed-onecard-ally`）
  - 我正好是他的上家 → 規則要求我頂大，維持打出最大單張，不放水
- 倒霉蛋（≥8 張）依然永遠不是盟友；有倒霉蛋時「頂大」優先於送牌

### Verified（7 個局面）
| 局面 | 結果 |
|---|---|
| 我 6 張、1 號位剩 1 張（不是我下家）、下家 7 張非盟友 | 出最小單張，`feed-onecard-ally` ✅ |
| 你剩 1 張、我不是你的上家 | 出最小單張助你跑 ✅ |
| 我下家剩 1 張（我是他的上家） | 不餵小牌，改出五張牌型／最大單張 ✅ |
| 我下家剩 1 張時只能出單張 | 規則強制最大單張 ✅ |
| 有 9 張倒霉蛋 + 有人剩 1 張 | 頂大優先 ✅ |
| 我 9 張（危險區）+ 有人剩 1 張 | 不幫，自己甩牌 ✅ |


### Changed（盟友門檻放寬到 2 張）
- 安全區（自己 < 8 張）內，**剩 2 張的人也算盟友**：送他一張小單張、他手上牌權時不壓，助他先跑，一起去壓另外 1~2 個 ≥8 張的倒霉蛋
- 只剩 **1 張（已報單）仍不算盟友**：他下輪就走完，讓牌等於直接送贏，而且報單本身有「下家必須頂大」的規則
- 其餘不變：倒霉蛋（≥8 張）永遠不是盟友；有倒霉蛋時「頂大壓制」優先於送牌；自己 ≥8 張時完全不參與聯盟

### Verified（6 個局面）
| 局面 | 結果 |
|---|---|
| 我 4 張、下家剩 2 張、全場無 ≥8 | 送最小單張 ✅ |
| 我 4 張、盟友剩 2 張拿牌權出單張 | PASS 讓牌 ✅ |
| 盟友只剩 1 張（報單） | 不算盟友，出最大單張壓 ✅ |
| 我 6 張安全、有人 9 張 | 頂大優先 ✅ |
| 我 9 張（危險區）、下家剩 2 張 | 不配合，自己甩五張牌型 ✅ |
| 你剩 2 張出 7、我只剩 3 張（安全） | PASS 讓你跑 ✅ |


### Changed（AI 決策樹按「先保命、再抓倒霉蛋」重寫）
- **安全區：手牌 < 8 張**（8 張起輸分 ×2/×3/×4，就是倒霉蛋）
- **倒霉蛋**：其他 ≥ 8 張的人，牌越多優先級越高，最多同時鎖定 **2 家**（`fatTargets`）
- **盟友只在安全後才找**：`iAmSafe` 為真才建立盟友，條件為
  1. 對方也在安全區（3~7 張）
  2. 對方牌數 ≤ 我（誰少誰先跑，比我多的不讓）
  3. 剩 ≤2 張不當盟友（再一輪就走完，讓牌等於送贏）
- 決策優先級：**有倒霉蛋 → 頂大壓制** > 下家是盟友 → 送牌 > 平常打法
- 自己 ≥8 張（還在危險區）時：不找盟友、不對任何人讓牌，專心甩牌（角色原本就會優先出 5 張牌型，一次甩最多張）
- 拿掉舊的 `selfIsBiggest` / `myCount >= 5` 兩道門檻，改由「是否進入安全區」統管

### Verified（直接呼叫 `aiTurn()`，7 個局面）
| 局面 | 結果 |
|---|---|
| 我 9 張、別人 12/3/2 | 頂大（五張牌型）壓 12 張那家 ✅ |
| 我 6 張（安全）、有人 9 張 | 頂大優先於送牌 ✅ |
| 我 6 張、全場無 ≥8、下家 4 張 | 送最小單張給盟友 ✅ |
| 我 6 張、下家 7 張（比我多） | 不當盟友，正常出牌 ✅ |
| 你剩 3 張出 7、我 6 張 | PASS 讓你跑（你在盟友名單）✅ |
| 你剩 2 張出 7 | 出 8 壓（不再放水）✅ |
| 我 9 張、全場無 ≥8 | 正常甩五張牌型 ✅ |


### Changed（盟友規則：玩家 0 號位也參與，但 AI 先顧自己）
- 盟友名單**重新包含玩家 0 號位**：誰剩 3 張就可能是盟友，不再分人類／電腦
- 盟友門檻從「2~3 張」收緊為**剛好 3 張**：剩 2 張的人再一輪就能走完，讓牌等於直接送他贏（這正是「出 7 報單、三家全 pass」的根因——當時玩家剩 2 張被算成盟友）
- AI 先顧自己（三個條件全成立才配合）：
  1. **自己不是最大戶**（自己牌最多時，自己就是倒霉蛋，不配合任何人）
  2. **自己手牌 ≥ 5 張**（≤4 張還有機會自己贏，先跑自己的牌）
  3. **盟友的牌比我少**（我都比盟友多，讓牌沒意義）
- 倒霉蛋（≥8 張）永遠不在盟友名單內；頂大抓倒霉蛋優先於送牌／讓牌

### Verified（直接呼叫 aiTurn 驗證）
| 場景 | 結果 |
|---|---|
| 我 6 張、下家 3 張、其他 7/5 | 送最小單張給盟友 ✅ |
| 我 10 張（我是最大戶） | 正常出五張牌型，不配合 ✅ |
| 我剩對 5（有機會贏）、盟友出對 4 | 壓過去，不讓牌 ✅ |
| **你剩 2 張出 7♣** | 電腦出 8 壓你，不再放水 ✅ |
| 你剩 3 張出 7♣ | 電腦 pass 讓你跑（你也在盟友名單）✅ |
| 你剩 1 張（報單） | 電腦一定壓 ✅ |


### Fixed（局末畫面可能出現「贏了但手裡還有牌」）
- `playCards()` / `passTurn()` 增加 `if (gameState.gameEnded) return;`：本局已結算後，任何殘留操作（鍵盤 Enter/Space、程式呼叫）都不再改動牌局
- 手牌點擊（`createHumanCardElement` 的 onclick）在 `gameEnded` 時直接忽略，避免選牌高亮殘留
- 贏家文字改由 `gameState.winnerIndex`（`finalizeRound` 寫入、`initGame` 清為 -1）驅動，不再「掃手牌找不到 0 張就保留舊文字」→ 不會再出現畫面已回到牌桌、狀態卻還寫著「你贏了」
- `finalizeRound()` 增加一致性自檢：贏家手牌不是 0、或「四家手牌 + 已出牌 ≠ 52」時 `console.warn('[round] 結算狀態異常', {...})`
- 局末 600ms 後再補一次 `renderAll()`，覆蓋任何殘留 DOM

### Verified
- 造局：我剩 1 張、壓過上家 → 贏；`winnerIndex=0`、`players[0].length=0`、狀態「你 贏了！」、計分表彈出、四家分數 `[8,-3,-2,-3]` 合計 0
- 局末再呼叫 `playCards()` / `passTurn()` / 點手牌 → 手牌、已出牌、局數、累計分**全部不變**；選牌被擋
- `initGame()` → `winnerIndex=-1`、手牌 13 張、累計分保留


### Fixed（報單被放水）
- 症狀：玩家只剩 7、10，先出 7 報單，三家電腦全部「沒人要」，玩家再出 10 直接贏
- 原因：上一版「小戶聯盟」把**任何剩 ≤3 張的人**都算成盟友（**包含玩家**），玩家一領出，三家 AI 判定 `yield-to-ally` 直接 pass；而且只剩 1 張（已報單）的人也被算成盟友，等於把勝利送出去
- 修正：
  - 盟友名單**只含電腦（1~3 號位），排除玩家 0 號位**
  - 盟友門檻改為 **剩 2~3 張**；只剩 1 張（報單）的人不算盟友
  - 因此報單者領出時，AI 會走 `isLastCard` 防守分支 → **丟自己能壓的最大單張**
- 驗證：報單玩家出 7♣ 後，3 號位 AI 打出 2♣（最大）而非 pass


### Added（小戶聯盟：互相配合跑牌）
- `aiTurn()` 額外算出盟友：其他剩 **≤3 張** 的小戶（不含倒霉蛋）→ `aiContext.allyIndices / allianceActive / nextIsAlly`
- **送牌**：我領出且**下家是盟友**時，`chooseFeedLead()` 出一張「最小且不拆牌型」的單張，讓盟友接過去繼續跑（手牌 ≤2 張時不送，自己先跑）
- **讓牌**：盟友拿著牌權在跑牌時，`chooseFollow()` 直接 pass，不壓自己人；唯一例外是**自己剩 ≤2 張且剛好能一把走完**（`canFinishNow()`）
- 優先級：抓倒霉蛋頂大 > 送牌給盟友 > 平常策略；倒霉蛋（≥8 張）永遠不在盟友名單裡
- 每個決策會寫 `window.__lastAIReason`（`pressure-lead` / `feed-ally-lead` / `yield-to-ally` / `finish-over-ally`），方便驗證


### Added（AI 抓倒霉蛋）
- `aiTurn()` 每回合算出「倒霉蛋」：剩下牌最多的對手，且剩 **≥8 張**（輸分翻倍區）、並且比自己多 **≥2 張** 才成立 → `aiContext.pressureTarget / pressureCount / pressureActive`
- `AICharacter.choosePressureLead()`：自由出牌時改為**頂大** —— 最強五張牌型 → 最大對子 → 最大單張，讓倒霉蛋接不上、繼續憋牌
- `chooseFollow()`：若牌權正在倒霉蛋手上（`lastPlayerIndex === pressureTarget`），解除「大牌保留」（原本 rank≥11 遇到 ≤7 會 pass、或對方出 K/A/2 直接 pass），積極壓過去
- 未觸發時行為完全不變；AI 自己就是最多牌那家時也不會進入此模式


### Fixed（頭像下方分數）
- 原本四個座位下方顯示 `Score: 0`（讀 `gameState.scores`，這是**單局**分，每局開始歸零，所以幾乎永遠是 0）
- 改為顯示**本次開 App 的累計總分**：`累計 +15` / `累計 -6`，正分綠色、負分紅色（`formatTotalScore()` 讀 `window.sessionScores`）
- 開 App 未開局時顯示 `累計 0`；每局結束結算後立即更新為新累計，下一局進行中維持顯示累計值


### Changed（戰績表與每局計分表對齊）
- 兩個表現在**共用同一份資料**：`finalizeRound()` 只做一次 `gameState.scores.slice()` 快照 → push 進 `window.roundHistory`，計分表與戰績表都從這份快照渲染（不再各自算）
- 戰績表「累計」改為**把上面每一列相加**得出（而非另一個累加器），並與 `sessionScores` 對帳：若有落差會 `console.warn('[stats] 累計與本局紀錄不一致', {...})`
- 姓名來源統一為 `PLAYER_NAMES`（當前座位角色），計分表與戰績表永遠同一組名字，不會因中途換角色而對不上

### Verified
- 實測 4 局：每局在戰績表的那一列 `[-2,-1,-1,4] / [-3,-2,-3,8] / [-1,-3,8,-4] / [5,-2,-1,-2]` **與該局計分表逐格相同**（`allRoundsMatch: true`）
- 累計列 `[-1,-8,3,6]` = 各列相加 = `sessionScores` = 最後一局計分表的「累計」欄（三項比對全 true）


### Added（加倍規則看得見）
- 計分表「本局」欄每格新增灰色小字明細：`13張 ×4 · 黑2 ×2 · 結尾2 ×2`，贏家顯示「三家總和」
- `calculateScores()` 產生 `gameState.roundDetail`（每位輸家的張數、張數倍數、是否黑桃2、赢家倍數），`finalizeRound()` 存入 `window.roundDetails`
- 三條加倍規則同時生效且可驗算：張數倍數（8-9×2、10-12×3、13×4）、黑桃2（剩 ≥8 張時再 ×2）、赢家結尾含 2（三家輸分 ×2）


### Changed（戰績表改成矩陣）
- 戰績表改為：**橫排是四位玩家**（名字下方標勝局數），**豎排每一局一行**，**最下面一列是累計總分**
- 新增 `window.roundHistory`：`finalizeRound()` 每局 push 一份四家分數，戰績表由此渲染
- 表格放在 `.stats-scroll`（`max-height: 54vh`）內，局數多時可滾動，打開時自動滾到底
- 一局都還沒打時顯示「尚無對局 / No rounds yet」
- 英文：`Session Record` / 表頭 `Round` / 末列 `Total` / 勝局 `{n}W`


### Fixed（全代碼檢查）
- **一條龍結算漏統計**：`handleDragonWin()` 直接改 `gameState.scores` 後只彈 `alert`，沒有累加 `sessionScores`／`sessionWins`／`roundsPlayed`，也沒有計分表 → 一條龍那局在戰績裡「消失」。改成一般贏局與一條龍都走新的 `finalizeRound(winnerIndex, winnerText)`。
- 中文缺 `statsRoundsLineOne`（英文有、中文 fallback 到 key 名）→ 補上。
- `triggerShoutEffect()` 預設台詞仍是「拉」→ 改「報單」。

### Removed（死代碼）
- `SettingsController`：`#license-sponsor-text-element`／`#rules-*-link`／`#license-store-status` 兩段已刪除元件的殘留邏輯（86 行）
- `GameView`：`window.lastPlayContainer = getElementById('last-play')`（元素不存在且無人使用）、`ai-settings-modal` 引用
- `styles.css`：`.license-sponsor-section`、`.license-text`、`#rules-modal .rule-mode-selector-container` 等死選擇器
- `tests/repro_shout_bug.js`（喊拉功能的舊重現腳本）

### Added（可重複執行）
- `scripts/audit.js`（`npm run audit:code`）：JS 語法、`getElementById` 對 HTML id、i18n key 雙向齊全、語音檔齊全、舊功能殘留、`www` 與 `src` 同步，一次檢查
- `tests/logic.test.js` 新增 5 個大陸規則回歸：A2345／23456 順子、純四張非法、四帶一合法、五張不能壓單張（共 22 個測試）


### Fixed（計分錯誤）
- **`initGame()` 沒有清空 `gameState.scores`**：導致計分表的「本局」欄其實是跨局累加值，而 `sessionScores` 又把這個累加值再加一次 → 累計被重複計算、數字虛高（曾出現第 1 局就 +215 的情況）。現在每局開始歸零，四家「本局」相加必為 0，累計 = 各局本局之和。
- **黑桃 2 加倍條件**：依大陸規則改為「手上剩 8 張或以上 **且** 含黑桃 2」才 ×2（原本 3 張帶黑桃 2 也會加倍）。

### Added（戰績按鈕）
- 「i」按鈕左側新增 **🏆 戰績按鈕**（`#stats-btn`）→ 開啟 `#stats-modal`：本次開 App 已玩 N 局、每人勝局數、每人累計分（`window.sessionWins` / `window.sessionScores`）

### Changed（彈窗操作）
- 計分表、戰績、說明三個彈窗**點外圍遮罩即可關閉**（`renderer.js` 中對 `#score-modal`／`#stats-modal`／`#rules-modal` 綁 `click`，`ev.target === el` 時隱藏）


### Added（每局計分表）
- **局末計分表**：新增 `#score-modal`，每局結束自動彈出（延遲 350ms 讓最後一手動畫先跑完）
  - 標題「本局計分 · 第 N 局」，下方贏家句，三列表格：玩家／本局／累計（本次開 App）
  - 正分綠色、負分紅色、0 分灰色；自己一行名字藍色；贏家整行金色底
  - 按鈕「下一局」直接開新局並關閉表格
- **累計分**：`window.sessionScores` + `window.roundsPlayed`，每局結束累加，只有重新開啟 App（頁面重載）才歸零；`initGame()` 不清空
- 英文介面同步：`Round Score · Round N` / `Player` / `This round` / `Session total` / `Next round`


### Changed（英文語音 / 喇叭鈕）
- **英文界面用英文語音**：新增 `src/assets/mp3/voice_en/` 共 53 檔（`en-US-GuyNeural` 播報，角色報單用 Aria／Guy／Steffan／Jenny），`AudioPlayer.voiceDir()` 依 `window.currentLang` 切換 `voice/` ↔ `voice_en/`；切語言即時生效。
  - 牌名：`Three/Four/…/Ace/Two`、`Pair of twos`、`Three twos`、`Straight`、`Flush`、`Full house`、`Four with one`、`Straight flush`、`Dragon`
  - 報單 `One card`、過牌 `Pass`
- **喇叭鈕不再念「對二」**：`playDeclareSample()` 刪除，改為 `playToggleBeep()`（僅一聲 880Hz 短提示音，WebAudio 產生、不需音檔），按鈕純切換報牌配音開／關。


### Changed（報牌配音）
- **本機出牌也會報牌名**：`executePlay()` 拿掉 `playerIndex !== 0` 限制，任何人出牌都念牌型（實測本機出黑桃 2 → `single_12.mp3`，接著剩 1 張自動 `declare_you.mp3`）。
- **Pass 改成 TTS「過」**：新增 `voice/pass_cat|dog|beaver|you.mp3`（四種音色），`playPass()` 改讀 `src/assets/mp3/voice/pass_*.mp3`，非四隻角色（Alex/Bella…）回退 `pass_you.mp3`。
- **刪除原本的動物配音**：`src/assets/mp3/pass_*.mp3`（9 個）全部移除，`src/assets/mp3` 根目錄現在只剩 `voice/`（220KB）。


### Changed（說明頁）
- **刪除「按鍵操作」「版權與贊助」兩個分頁**（中英文共用同一份 DOM）：`index.html` 移除兩顆 tab 按鈕與 `#tab-keyboard`、`#tab-license` 兩個面板，說明頁只剩「遊戲規則」。

### Changed（報牌配音）
- **AI 報出牌名**：`AudioPlayer.playHandName()` 在 AI 出牌時念牌型——單張／對子／三條帶點數（「一張三」「對二」「三條十」），五張牌型念類型（「順子」「同花」「葫蘆」「四帶一」「同花順」「一條龍」）。連續出牌會自動截斷上一聲，避免疊音。
- **右上角喇叭鈕**：兩態「報牌配音 開／關」，開啟時試聽「對二」。
- **語音改用 TTS 產檔**：`edge-tts`（`zh-CN-YunjianNeural` 播報腔）生成 49 個檔案放 `src/assets/mp3/voice/`（共 200KB）；報單語音 `declare_cat/dog/beaver/you.mp3`（三個角色不同音色）取代原本唸「拉」的 `la_*.mp3`（已刪除）。

### Changed（規則改為純大陸鋤大地）
- **移除「喊拉」**：刪掉 `shoutLa()`、`updateShoutButton()`、底部「喊拉！」按鈕、鍵盤 Enter 喊拉、`shouted/canFinish` 狀態與 AI 端的喊拉限制。剩最後一手牌不再能「宣告後一次出完」。
- **新增「報單頂大」**：任一家手牌只剩 1 張時自動公告（氣泡「報單」+ 姓名高亮 + 配音），其**上家出單張必須先出自己最大的牌**；玩家與 AI 都受此限制。
- **牌型比對改嚴格同張數**：`playCards()` 與 AI 拿掉「五張怪物可壓單張/對子」的例外（`compareHands` 本來就不允許，控制器端原本有漏洞）。
- **順子支援 A2345 / 23456**：A 可作最大或最小、2 只作最小端；比較時 A2345 以 5、23456 以 6 為準（聯眾規則）。
- **規則只剩大陸一種**：移除說明頁的「遊戲規則模式」下拉選單，`ruleMode` 固定 `mainland`。
- **說明頁文案重寫（中／英）**：牌型改稱「四帶一」、加入報單頂大與順子 A/2 說明、計分寫成現行算法；只有大陸規則，不再有台灣／香港字樣。

### Changed（音效）
- **移除全部背景音樂**：刪掉 `Cards_On_The_Line`、`Iron_in_the_Gale`、`Sovereign_Ascent` 三首 BGM 與 `playBGM/switchBGM` 邏輯（`src/assets/mp3` 由 2.4MB 降到 324KB）。
- **改成報牌配音**：右上角喇叭鈕由「全開／僅特效／全關」三段改為「報牌配音 開／關」兩段，開啟時即時試聽；有人報單時播放該角色語音（`la_*.mp3`，人類用 `la_you.mp3`）。

### Added
- **每局開 App 隨機座位**：`BigTwoAI` 建構時以 Fisher–Yates 洗牌三個電腦玩家（河狸／柴犬／橘貓）在左（`#player-2`）／上（`#player-3`）／右（`#player-4`）的位置；名字、頭像、出牌槽都跟著角色走，每次啟動 App 重新抽一次。

### Changed
- **英文說明標題**：`i18n.js` 的 `rulesTitle`（en）由 `Game Rules (Guangdong Chu Da Di)` 改為 `Guangdong Chudadi`。

### Fixed
- **左右兩家出牌離桌沿不一致**：`#played-2/#played-4` 的 `.slot-card:last-child` 仍帶 `-12px` 負邊距，右家的牌多凸出 12px（實測左 82px／右 70px）→ 補 `margin-right: 0`，現在左右皆 82px。
- **牌桌沒有置中**：`width: 100%` 加上左右 4px margin 讓桌面向右溢出 8px（左邊距 12px／右 4px）→ 改 `width: calc(100% - 8px)` + `align-self: center`，桌面對稱、左右座位與桌沿距離一致。
- **說明視窗排版**：`i` 彈窗正文 14px→13px、行高 1.5→1.45、字距 -0.2px；標題 16px→14px；分頁標籤 16px（會被擠成兩行）→ 13px + `nowrap`，規則內容高度 606→505px，852 高螢幕不用滾動；版本號 11px。

### Changed
- **出牌順序改為逆時針**：你（下）→ 橘貓（右）→ 柴犬（上）→ 河狸（左）→ 你（`GameController.nextTurn()` 改為索引 −1）。
- **上/下家的出牌往桌心收**：`#played-3`（柴犬）`top: 2px → 16px`、`#played-1`（自己）`bottom: 2px → 16px`，離桌沿由 10px 增為 24px；桌面狀態提示同步上移（`bottom: 54px → 68px`）避免與自己的出牌重疊。
- **上家座位下移**：豎屏 `#player-3`（柴犬）`top: 56px → 86px`（分兩次 10px + 20px 調整），矮屏分支 `44px → 60px`。

## [android-portrait] - 2026-10-22

### Changed
- **改名**：遊戲更名為「廣東鋤大地 / Guangdong Chu Da Di」（UI、說明頁、Android 應用名稱、套件顯示名稱）。
- **預設規則改為大陸鋤大地**：花色 ♠ > ♥ > ♣ > ♦（梅花大於方塊）、♦3 先手、開放同花與三條；舊存檔自動遷移。
- **計分改寫**：剩 8-9 張 ×2、10-12 張 ×3、13 張 ×4；只有剩「黑桃 2」加倍；贏家結尾含 2 加倍。
- **手牌分排**：牌型模式自動聚組五張牌型並壓成兩排（13 張 = 7+6），另有「5張」「單排」兩態。
- **豎屏牌桌**：深色地毯 + 木框 + 絨面；柴犬在上、河狸在左、橘貓在右、自己在下方；各家出牌落在桌面。
- **緊湊版面**：矮屏再壓縮座位、手牌與按鈕，整體高度約降 22%。

### Removed
- **所有大模型功能**：`BaseLLMAI`、`LLMCharacters`（Diana/Ares）、`AiServiceFactory`、WebLLM／LM Studio 服務與快取、賽後 AI 復盤、AI 設定與模型管理分頁、CORS 指引、`.llm-glow` 樣式、Diana/Ares 頭像資源。
- 依賴 LLM 的 UI 測試（Playwright/Electron）；`npm test` 改為只跑規則引擎測試。

### Fixed
- **選牌遮住鄰牌**：手牌疊排時選中的牌不再提升 z-index，只抬起 + 描邊，鄰牌點數保持可讀；觸控裝置關閉 `:hover` 抬起。
- **座位被桌面遮住**：座位 z-index 提高至牌桌之上。
- **規則說明與實際計分不符**：規則窗文字同步為現行計分（含「鐵支/同花順不再額外加倍」）。

### Build
- `android/app/build.gradle` 支援 `android/keystore.properties` 的 release 簽名（v1+v2+v3），密鑰檔不入庫。

All notable changes to this project will be documented in this file.

## [1.5.52] - 2026-06-17

### Added
- **Microsoft Store Links**: Integrated Microsoft Store links ("or Microsoft Store" / "或微軟商店") in the copyright/sponsorship section of both the "About" page and "Rules" modal tab.

### Fixed
- **Modal Viewport Responsiveness**: Fixed the layout issue where the Game Rules modal height exceeded the screen height on mobile/small viewports by setting `max-height: 90vh` and enabling inner vertical scrolling for active tab contents. Reduced modal padding on mobile layout.
- **Post-Game Review Avatars**: Fixed the bug where animal players' dynamic avatars (Panda, Orange Cat, Shiba Dog, Beaver) were wrongly displayed as static human avatars on the post-game review panel. Prioritized exporting the active dynamic avatar canvas frame with a fallback to crop sprite sheet grids.
- **Removed High-Tension Shaking & Glowing Visuals**: Removed the high-tension avatar shaking and red-glow effects to maintain UI clean and distraction-free when player tension is high.

## [1.5.51] - 2026-06-11

### Added
- **Dynamic Telemetry Avatars**: Integrated dynamic emotional avatars for Player 1 (Human: Panda), Player 2 (Beaver), Player 3 (Shiba Dog), and Player 4 (Orange Cat). Avatars adapt in real-time to the player's psychological state ($X$ representing situation status and $Y$ representing tension level).
- **High-Tension Shaking Animation**: Implemented avatar-focused CSS shake keyframe animations when tension exceeds 0.8. The outer card borders remain steady to avoid distracting players.
- **Interactive Avatar Test Panel**: Upgraded `avatar_demo.html` with interactive sliders, 2D quadrant clicking/dragging, a preset dropdown menu (supporting Orange Cat, Shiba, Panda, and Beaver), and a local file upload picker allowing users to test custom sprite sheets with automatic grid cell recalculation.

### Fixed
- **Shiba Inu Head Resolution Grid Cut**: Fixed the 4-head cropping issue with Shiba Dog sprite sheets by enforcing dynamic `onload` cell dimension calculations (`cellWidth = width/cols`, `cellHeight = height/rows`).
- **Dynamic Avatar Swapping Bug**: Fixed character avatar swap logic inside settings where switching dynamic characters failed to update the sprite sheet due to caching.

## [1.5.50] - 2026-06-08

### Fixed
- **Triples under Hong Kong Rules**: Fixed a bug where players (human and AI) could not play standalone triples (three of a kind) under Hong Kong rules due to a missing length check case in `GameLogic.hasValidMoves`.

## [1.5.49] - 2026-06-07

### Added
- **Dynamic Rules Mode Selection**: Integrated dynamic switching between Taiwanese and Hong Kong game rules within Settings. Configures starting card rules, scoring structures, and hand combinations (supporting stand-alone Triples and Flushes under Hong Kong rules).

### Fixed
- **Score Calculation Reference Error**: Fixed a runtime `ReferenceError: ruleMode is not defined` in `GameController.js` when calculating game-over scores.

## [1.5.48] - 2026-06-06

### Added
- **AI Engine Modularization**: Refactored the massive single-file `ai.js` into five single-responsibility class scripts under a new `src/ai/` directory (`AICharacter.js`, `HeuristicAI.js`, `BaseLLMAI.js`, `LLMCharacters.js`, and `BigTwoAI.js`) to follow clean layered architecture design.
- **Post-Game Tactical Review Decoupling**: Decoupled the obsolete `aiSummary.js` and migrated its initialization logic into `renderer.js`. Separated DOM/view elements into `AISummaryView.js` and business logic into `AISummaryController.js`.
- **Worker Relocation**: Moved the background worker script `aiWorker.js` to `src/services/aiWorker.js` for cleaner encapsulation and updated all dependent worker path resolutions.

### Fixed
- **Robust UI Test Pipeline**: Solved flakiness in the Playwright E2E UI test suite related to persisted local storage mute configurations by programmatically resetting `AudioPlayer.soundMode = 0` during audio transition test phases.

## [1.5.47] - 2026-06-05

### Added
- **LLM Progress Localization**: Implemented dynamic text localization for WebLLM initialization and file-fetching progress reports. Raw English parameters and Cache API writing statuses are parsed via regular expressions and instantly translated to Traditional Chinese based on the active game locale.
- **Top Player Speech Bubble Relocation**: Relocated player 3's (P3/top player) dialog bubble to the right side of the panel. Ensuring both expanded and shrunken dialog bubbles never vertically overlap with played cards.
- **Topmost Dialog Bubble Rendering**: Applied `z-index: 500` to `.speech-bubble` and integrated a CSS `:has()` selector to raise the parent `.player` panel's z-index to `150` when a bubble is visible. This guarantees speaking overlays sit above cards and the table center.
- **Avatar-Aligned Progress Bar**: Refactored the thinking progress bar to render within a newly introduced `.avatar-container` block directly below each player's avatar, enforcing a strict width of 60px matching the avatar width.

### Fixed
- **Bypassed WebLLM JSON Schema Generation Loop**: Completely removed schema-guided JSON options from WebLLM parameters to stop generation loops and fff/uFFFF character repetition bugs.
- **Resolved WebLLM WASM BindingError**: Removed the `response_format` configuration to prevent WebAssembly Emscripten `std::string` type crashes, and added a robust brace-matching parser (`{` to `}`) to extract valid JSON blocks from raw LLM responses.

## [1.5.46] - 2026-06-05

### Added
- **WebLLM Thinking Time Rolling Average (EMA)**: Re-engineered the LLM thinking progress bar time estimation to use an Exponential Moving Average (EMA) with $\alpha = 0.25$. The progress bar now dynamically adapts and matches the actual recent inference speed of the AI model.

### Fixed
- **WebGPU Model Selection Fallback**: Resolved a bug where having an empty or `local-model` model ID with WebGPU active would cause a silent fallback to LM Studio and trigger a 400 Bad Request error. The system now automatically scans and resolves the ID to the first fully cached WebGPU model.
- **WebGPU f16/f32 Cache Completion Detection**: Fixed compatibility checks where devices without `shader-f16` support would fail the cache check and fall back to LM Studio. The completion check now correctly intercepts and checks the `q4f32_1` fallback variant matching the actually cached f32 files.

## [1.5.45] - 2026-06-04

### Added
- **WebGPU shader-f16 Electron Support**: Added Chromium startup command line switches `enable-unsafe-webgpu` and `enable-webgpu-developer-features` to Electron's main process initialization.
- **Automatic shader-f16 Device Request Interceptor**: Implemented a prototype patch on `GPUAdapter.prototype.requestDevice` in both the window environment module (`env.js`) and background worker context (`aiWorker.js`). If the hardware GPU adapter reports support for the `shader-f16` feature, the interceptor automatically appends `'shader-f16'` to the logical device's `requiredFeatures` list to enable FP16 execution in WGSL shaders.

### Fixed
- **Local Storage Management Localization Sync**: Implemented a robust `updateLanguage()` method in `AISummarySystem` to refresh dynamic model list labels when toggling between English and Chinese. Added dynamic triggers on tab button click and info modal open to ensure language variables are consistently checked, fixing the bug where WebLLM fallback messages and download buttons mistakenly displayed in Chinese when the app language was set to English.

## [1.5.44] - 2026-06-04

### Fixed
- **Speech Bubble Viewport Bounds**: Adjusted CSS positioning of speech bubbles for all players (P1–P4) and restricted their maximum width to prevent bubbles from overflowing screen/desktop boundaries.
- **WebLLM Cache Isolation**: Swapped out fuzzy matching for exact Model ID matching in `WebLlmCacheManager` to ensure separate, accurate cache size rendering and safe deletion for models with similar prefixes (like Gemma f16 and f32).

## [1.5.43] - 2026-06-03

### Added
- **Model-Specific Local Storage & Cache Resolution**: Re-architected `WebLlmCacheManager` to scan the shared `webllm/model` Cache Storage index and associate weight files dynamically with their matching Model IDs. Enabling precise model name rendering, accurate size calculations, and individual model deletion without affecting other cached models.
- **Unified Settings Manage Tab**: Created a new `Manage` (管理) tab inside the Rules Info modal. Consolidated all WebLLM local storage lists and preloading progress bars into this tab for a clean and unified dashboard experience.
- **Download Mutex Lock (下載互斥安全鎖)**: Integrated mutual exclusion checks when starting WebLLM preloading. Launching a new download (from NPC Settings or Review Panel Settings) while another download is already active will trigger a warning alert and block the new download, protecting memory and network bandwidth.

### Fixed
- **Enter Key Icon Height Alignment**: Adjusted SVG and container dimensions for the Enter key shortcut icon in the Keyboard tab to align perfectly in height (25px) and spacing with adjacent keys like the Space bar.

## [1.5.42] - 2026-06-02

### Added
- **Enter Key Shortcut for Shouting La**: Added a keyboard shortcut mapping the `Enter` key. When the human player has selected cards that allow them to shout "La" (leave exactly 1 remaining card/combination), pressing `Enter` will play the selected hand and declare "La".
- **Keyboard Guide Update**: Added the new `Enter` key shortcut representation to the Keyboard Controls (按鍵操作) tab in the Game Rules modal. Used a custom-designed, thin inline SVG Carriage Return symbol (`↵`) with dedicated styling to ensure proper spacing and width.

### Fixed
- **Match Review WebGPU Connection Indicator**: Resolved a UI status message bug where the post-game review panel would display "LM Studio 連線正常" instead of showing local WebGPU status when `reviewUseWebGPU` was active. The indicator now correctly displays "WebLLM (WebGPU) 已啟用" (or "WebLLM (WebGPU) Active" in English).

## [1.5.41] - 2026-06-02

### Added
- **Local WebGPU AI Service (WebLLM)**: Integrated `@mlc-ai/web-llm` via background Web Workers to support fully local, high-performance WebGPU-accelerated inference.
- **AiServiceFactory & Singleton Caching**: Implemented a global service factory and caching layer (`AiServiceFactory.js`) to reuse the WebLLM engine singleton. This prevents reloading models across gameplay decisions, review summaries, and reflections.
- **Offline Post-Game Reflection**: Refactored `BaseLLMAI.reflect()` to utilize the cached WebLLM instance for post-game reflections when local WebGPU is enabled.
- **System Prompt KV Cache Optimization**: Restructured the system prompt in `ai.js` to place static rules, game mechanics, and schemas first, and dynamic/persona variables last, maximizing prefix cache hits and minimizing response latency.

### Fixed
- **Local Engine Verification and Abort Prevention**: Resolved TypeErrors (reading `chat` of null) during offline reflection by adding robust checks on `service.engine` existence, enabling safe runtime verification.
- **Graceful Fallback Pipeline**: Established automatic fallback to remote API endpoints when the local WebGPU engine fails to initialize or load, ensuring game continuity.

## [1.5.30] - 2026-06-01

### Added
- **Match Replay Score Display**: Displayed individual round scores (e.g., +30 in green, -12 in red) on player stats cards inside the AI Tactical Review panel.

### Fixed
- **Replay Remaining Card Duplication**: Removed the duplicate/redundant remaining card count from the footer of player card in the review screen, resolving the issue where both English and Chinese card count versions displayed simultaneously.
- **Immediate Review Panel Language Syncing**: Added immediate rendering and localization logic for the entire review panel (including match review title, player stats, connection status indicator, input placeholders, and API connecting/loading labels) to translate seamlessly as soon as language is toggled.
- **Loading Slideshow Closure Bug**: Fixed a closure caching bug where the loading text slideshow during AI analysis would revert to the previous language after the first message on language toggle.

## [1.5.29] - 2026-05-31

### Added
- **PWA Home Screen Support**: Generated standard PWA app icon `apple-touch-icon.png` (180x180 resolution) in the web root (`www/` and root directories) generated from `logo.png`. Added the corresponding `<link rel="apple-touch-icon">` tag in the `<head>` of both `index.html` and `www/index.html`.

## [1.5.28] - 2026-05-31

### Fixed
- **Responsive Toggle Handle Arrow Directions**: Synchronized the toggle handle arrow directions with viewport layout modes. Added dynamic detection of the mobile-layout classes on window resize to ensure correct arrow orientations (◀/▶ for desktop, ▲/▼ for mobile) when minimizing or expanding the post-game review panel.
- **Mobile Card Selection Lift**: Fixed a CSS bug on mobile touch devices where selecting a card would highlight it with a blue border but fail to lift it upward (`translateY`). Modified the mobile hover media overrides to use `:not(.selected):hover` so persistent mobile touch hover states do not override the selected transformation.

## [1.5.27] - 2026-05-31

### Fixed
- **Collapsible Review Panel Behavior**: Refined the collapsible behavior of the review panel. Minimizing the panel (via the edge toggle handle) now slides it off-screen but keeps the LLM generation active in the background. Dismissing the panel (via the "X" button) completely hides both the panel and the handle and aborts the LLM generation.
- **Played Cards Stacking & Overlaps**: Resolved visual overlaps where pass slots and empty slots covered other players' played cards. Empty slots are now styled as transparent, and the active played cards slot's z-index is dynamically boosted to render on top of adjacent overlapping slots.

## [1.5.26] - 2026-05-31

### Fixed
- **Card Selection Stacking & Transitions**: Fixed an issue where deselecting a card would cover the card to its right. Removed z-index from hovered cards to preserve natural DOM stacking order, and updated the selection click handler to toggle the `.selected` class directly instead of rebuilding the hand DOM to enable smooth sliding transitions.

## [1.5.25] - 2026-05-30

### Added
- **Fair Tactical AI Heuristics**: Rewrote computer-player cheats into fair, table-wide tactical AI heuristics that apply to all players (human and CPU) equally.
  - When any opponent has exactly 1 card left, follow-singles logic throws the biggest valid single card to defend.
  - When no opponent is near winning (<= 3 cards left), follow-singles logic avoids breaking pairs and 5-card combinations.
  - The single-card holding control logic (passing on rank > 9 table plays) now checks all opponents.
  - Updated AlexAI's lead logic to avoid playing pairs if any opponent has exactly 2 cards remaining.
- **Special Beating Rules (Bombs/Monsters)**: Implemented traditional Taiwanese Big Two rule where a Four of a Kind (鐵支) or Straight Flush (同花順) can beat any single card or pair at any time.
- **AI Character Documentation**: Created `Documents/ai_characters.md` documenting profiles and strategies of traditional AIs (Alex, Bella, Chris) and LLM-powered AIs (Diana, Ares).

## [1.5.20] - 2026-05-25

### Added
- **Interactive Post-Game AI Q&A**: Replaced the "Re-analyze" (重新分析) button in the AI review panel with an interactive Q&A input and submit button, enabling players to ask follow-up questions about the match analysis.
- **Context-Rich LLM Analysis**: Reconstructed starting hands of all four players from play history (`gameLog`) and passed complete chronological play logs for the LLM to analyze, providing much more accurate and deep tactical commentary.
- **Default Persona Strategy Adjustment**: Configured default `extraPrompt` (客製化提示詞) for Diana (`DianaAI`) and Ares (`AresAI`) containing their respective match-improvement recommendations from the reviews.

### Changed
- **Response Length Optimization**: Configured `max_tokens: 4096` in LLM API calls to prevent responses from being cut off.
- **Fallback Safety**: Improved fallback/reset logic for settings so that clearing customized prompts reverts to character-specific built-in defaults.

## [1.5.19] - 2026-05-24

### Added
- **Secure Cloud LLM Authentication**: Integrated secure API Key configuration input fields (with hidden password masks) into both AI Player settings and Post-Game Review settings. Injected dynamic `Authorization: Bearer <ApiKey>` header to outgoing REST API calls, enabling seamless authentication with cloud-based provider endpoints while keeping local servers compatible.
- **Auto-Detection Placeholders**: Improved Model ID settings by dynamically querying the connection URL for available models and displaying the first detected model ID as a placeholder suggestion if the selection is left blank.

### Changed
- **Traditional Select Dropdowns**: Refactored Model ID and Review Model fields from custom HTML5 text inputs + datalists to native `<select>` dropdowns. This resolves visual overlaps with browser auto-fill history and filters.
- **Custom Model Compatibility**: Configured standard select menus to automatically append and highlight the user's previously saved custom model ID if it is absent from the API-returned models list.
- **Race Condition Prevention**: Integrated `AbortController` cancellation to abort and discard in-flight model list queries whenever a new API URL is inputted, preventing concurrent requests from appending duplicate options.
- **Styling Unification**: Tailored drop-down styles to fit the dark slate game theme.

## [1.5.18] - 2026-05-24

### Added
- **AI Tactical Review Customization**: Added dynamic wait screen titles displaying the configured model name (`reviewLlmModel` from `AppStorage`) instead of hardcoded strings.
- **Constructive AI Feedback**: Configured the AI prompt to evaluate tactical plays using positive and educational feedback tags (`[檢討]` / `[Review]` and `[分析]` / `[Analysis]`) instead of sarcastic roasting comments.

### Changed
- **Optimized UI Flow**: Suppressed the standard victory alert pop-up (`showAlert`) when the AI review panel is initialized, directly sliding the review panel into view to avoid double prompts. The popup still functions as a fallback if the AI module is not loaded.
- **Improved Wait Screen UX**: Tightened wait screen padding and removed the static progress bar to prevent screen overflow and scrollbars.
- **Non-Streaming JSON Responses**: Swapped the typewriter SSE stream logic with a non-blocking asynchronous JSON response pipeline for faster rendering.
- **Paragraph Fade-In Rendering**: Applied staggered CSS-based animations to fade in paragraphs sequentially within a 1-second total window.

## [1.5.17] - 2026-05-20

### Changed
- **Pair Combination Logic**: Updated `findPairs` logic to generate all valid pair combinations of the same rank (e.g., three J's now yield all three possible pair combinations instead of just the single strongest pair).

### Fixed
- **Keyboard Card Selection**: Enabled selecting and cycling through alternative pair combinations of the same rank using Arrow keys, preventing the selection from being locked to only the strongest pair.
- **AI Card Preservation**: Improved AI decision-making by allowing it to select the weakest valid pair to beat the table play, preserving higher-suit cards (like the Spade) for subsequent single card plays.

## [1.5.16] - 2026-05-19

### Added
- **Interactive Trial Status in Rules Modal**: Enabled clicking on the "Days left in trial" status inside the Rules Modal's "License & Sponsor" tab to redirect users directly to the Microsoft Store to purchase the full version.
- **Clickable UI Styling**: Applied pointer cursor, underline styling, and hover title hints to the trial status text inside the Rules Modal for better discoverability.
- **Android App Icon Generation**: Created a source `assets` directory and generated 86 Android launcher icons and splash screens using `@capacitor/assets`. Updated the adaptive icon background color to `#1e293b` to match the dark slate game theme.

### Fixed
- **License Status Sync Bug**: Fixed a bug where the license status text in the Rules Modal remained stuck on "Verifying Windows Store license..." on startup. The renderer now calls `updateLanguage()` to refresh the license display when it receives the asynchronously fetched license status from the main process.

## [1.5.13] - 2026-05-19

### Added
- **Build Target Differentiation**: Added build scripts (`dist:store`, `dist:github`) and dynamic runtime target detection to differentiate between Microsoft Store (`STORE`) and GitHub sideloaded (`GITHUB`) builds.
- **Security Compliance (Context Bridge)**: Refactored the About dialog window to use secure preload configuration (`aboutPreload.js`) with `contextIsolation: true` and `nodeIntegration: false`.
- **UI Integration**: Added dynamic license status displays (such as trial expiration countdowns, activation status, and sideload warning messages) in both the About window and the Rules/License modal tab.
- **Persistent Configuration**: Enabled storing `buildTarget` inside `package.json` during the build phase so packaged executables correctly read their target environment at runtime.
- **Localization**: Added corresponding bilingual translations (Traditional Chinese and English) in `src/i18n.js` and `www/src/i18n.js`.

### Fixed
- **About Page Translation Crash**: Fixed a Javascript error where translations could not be read from `window.I18N` because `I18N` was declared as a block-scoped `const`.

## [1.5.8] - 2026-05-19

### Added
- **Tauri Support**: Added support for building the application via Tauri as a lightweight desktop alternative to Electron.
- **Documentation**: Created `Documents/BuildnRun.md` to organize and document run, test, and build commands across all supported platforms (Electron, Tauri, Capacitor, StoreBridge).
- **Documentation**: Created `Documents/architecture.md` detailing the project's code structure and cross-platform architecture.

### Changed
- **Tauri Configuration**: 
  - Increased the initial window size to `1024x768` to ensure the desktop layout is triggered by default.
  - Updated the bundle identifier to match the new package identity (`com.mesmerli.taiwanbig2ai`).
  - Synced Tauri build version with the Electron `package.json` version (`1.5.8`).
  - Isolated web assets by pointing the Tauri `frontendDist` directly to the `www` directory, preventing backend files from being bundled with the frontend.
  - **Single Instance Support**: Integrated `tauri-plugin-single-instance` to prevent multiple instances from opening from the taskbar, automatically focusing the existing window instead.
- **Electron Build Optimization**: Heavily optimized `electron-builder` configuration in `package.json` to exclude heavy unused assets (`src-tauri`, `android`, C++ `.pdb` debug symbols, etc.), drastically reducing the final installer size from ~1.5GB to ~119MB.
- **MSIX & Store Identity**: Updated Windows Store Product ID, MSIX `IdentityName` (`TaiwanBig2AI`), and `AppUserModelId` to ensure correct Microsoft Store deployment and taskbar jump list behavior.
- **README Updates**: Updated the version badges and download links to `1.5.8`, added Tauri to the platform badge, and included links to the new architectural and build documentation.

## [1.5.0]

- Base release with full support for Electron, Capacitor (Android), and LLM-powered AI (Diana & Ares).
- Added Microsoft Store Trial mechanism (`StoreBridge` C++ Addon).
- Support for AFK self-play and AI memory evolution.
