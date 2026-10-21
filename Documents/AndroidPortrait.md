# Android 豎屏版分支說明 (`android-portrait`)

本分支以 `main` 為基礎，只針對 **Android 手機豎屏** 的使用情境做調整，桌面版（Electron / Tauri）邏輯與版面完全不變。

## 1. 這個分支改了什麼

### 1.1 手牌自動分排（每排最多 5 張）

原本自家 13 張手牌橫向擠成一排，在手機上牌與牌重疊嚴重，很難一眼看出
「順子 / 葫蘆 / 同花」這類 5 張牌型。

現在進入 `mobile-layout`（Android 或視窗寬度 < 900px）時，手牌會**自動拆成多排，每排最多 5 張**，
讓任何一個 5 張組合都完整落在同一排裡：

| 手牌張數 | 排數 | 每排張數 |
| --- | --- | --- |
| 13 | 3 | 5 + 5 + 3 |
| 12 | 3 | 5 + 5 + 2 |
| 11 | 3 | 5 + 5 + 1 |
| 10 | 2 | 5 + 5 |
| 9 | 2 | 5 + 4 |
| 8 | 2 | 5 + 3 |
| 7 | 2 | 5 + 2 |
| 6 以下 | 1 | 全部 |

* 出牌後手牌變少會自動重新分排（不需要手動整理）。
* 選牌上浮、點擊選取、喊拉等行為與原本完全相同。
* 桌面寬螢幕（≥ 900px、非 Android）維持原本「單排重疊」的樣子。

實作位置：

* `src/views/GameView.js` → `renderHumanHand()` / `chunkHandIntoRows()`
* `src/styles.css` → `🃏 MULTI-ROW OWN HAND (portrait)` 區塊（含 `max-height: 760px` 的矮螢幕壓縮規則）

### 1.2 鎖定豎屏

`android/app/src/main/AndroidManifest.xml` 的 `MainActivity` 加上：

```xml
android:screenOrientation="portrait"
```

App 不會再隨手機旋轉成橫向。

### 1.3 新增 Android 建置指令

`package.json` 新增：

```bash
npm run android:sync   # 同步 src → www，再 npx cap sync android
npm run android:apk    # 上一行 + gradlew assembleDebug
```

## 2. 建置 APK

```bash
npm install            # 第一次需要
npm run android:apk
```

產出位置：`android/app/build/outputs/apk/debug/app-debug.apk`

若 `JAVA_HOME` 未設定，請先指向 JDK 17/21，例如：

```bash
export JAVA_HOME=/path/to/jdk-21
```

發佈版（未簽名）：

```bash
npm run android:sync
cd android && ./gradlew assembleRelease
# android/app/build/outputs/apk/release/app-release-unsigned.apk
```

## 3. 驗證方式（不需手機）

`www/` 是可直接用瀏覽器開啟的靜態資源，用 Chromium 以手機尺寸截圖即可驗證排版：

```bash
cd www && python3 -m http.server 8765
chromium --headless=new --window-size=390,844 \
  --force-device-scale-factor=2 --virtual-time-budget=8000 \
  --screenshot=/tmp/portrait.png http://127.0.0.1:8765/index.html
```

已驗證的尺寸：

* 390×844（一般豎屏）：13 張 → 三排 5/5/3，按鈕與狀態列完整可見
* 360×640（小屏豎屏）：13 張 → 三排 5/5/3，全部在畫面內、無裁切
* 1280×800（桌面）：手牌仍為單排，版面與 `main` 相同
