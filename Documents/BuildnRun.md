# 執行與建置指南 (Build & Run Guide)

> **本分支（`android-portrait`）以「安卓豎屏 APK」為唯一交付目標。**
> Electron／Tauri 桌面外殼仍留在 repo，但未在本分支驗證；不會用到的段落已標註。

---

## 0. 快速上手（Android）

```bash
# 1) 安裝前端依賴
npm install

# 2) 前端 → www/（src/ 是唯一來源，改完必做）
npm run sync-www

# 3) www/ → android 原生專案
npx cap sync android

# 4) 編譯 debug APK
cd android
export JAVA_HOME=/path/to/jdk-21
export ANDROID_HOME=/path/to/android-sdk
export ANDROID_SDK_ROOT=$ANDROID_HOME
./gradlew assembleDebug
```

產物：`android/app/build/outputs/apk/debug/app-debug.apk`

環境需求：

| 工具 | 版本 | 備註 |
|---|---|---|
| Node.js | ≥ 18 | |
| JDK | **21** | Gradle 8.14 需要；JDK 17 會報「無效的源發行版：21」 |
| Android SDK | platform 36、build-tools 35/36 | `compileSdk 36` |
| Gradle | 8.14.x | 專案無 wrapper 時直接呼叫 `gradle` |

> 在中國大陸網路環境下，Google Maven / Gradle 官方站點常超時，可改用阿里雲 Maven 鏡像與騰訊 Gradle 鏡像；SDK 授權檔放在 `$ANDROID_HOME/licenses`。

---

## 1. Release 簽名包

### 1.1 產生 keystore（只需一次）

```bash
mkdir -p ~/.android-keys
keytool -genkeypair -v \
  -keystore ~/.android-keys/release.jks \
  -alias <alias> -keyalg RSA -keysize 2048 -validity 36500 \
  -dname "CN=Guangdong Chu Da Di, O=<you>, C=CN"
```

### 1.2 建立 `android/keystore.properties`（已 gitignore）

```properties
storeFile=/absolute/path/to/release.jks
storePassword=******
keyAlias=******
keyPassword=******
```

`android/app/build.gradle` 會讀取此檔配置 `signingConfigs.release`（v1/v2/v3）。
檔案不存在時會退回「unsigned release」，不會報錯。

### 1.3 編譯

```bash
cd android && ./gradlew assembleRelease
```

產物：`android/app/build/outputs/apk/release/app-release.apk`

驗證：

```bash
$ANDROID_HOME/build-tools/36.0.0/apksigner verify --verbose --print-certs app-release.apk
$ANDROID_HOME/build-tools/36.0.0/aapt2 dump badging app-release.apk | head -3
```

期望：`Verifies`、v2 與 v3 為 true、憑證 CN 為自己的、`application-label` 為「廣東鋤大地」。

> minSdk 24 時 Gradle 會自動跳過 v1（JAR signing），顯示 `false` 屬正常。
> release 與 debug 簽名不同，換簽名安裝前必須先卸載舊版。

---

## 2. 開發預覽（瀏覽器）

```bash
npm run sync-www
cd www && python3 -m http.server 8080
# 瀏覽器開 http://127.0.0.1:8080/index.html
```

除錯小技巧：

- `window.gameState` 可直接改（手牌、`playerLastActions`）後呼叫 `renderAll()`
- 想讓四個座位都由 AI 打：`window.AI.swapCharacter(0)`，再 `aiTurn()`
- 豎屏版面要固定 393px 寬驗證，否則瀏覽器視窗一寬就切回桌面版面

---

## 3. 測試

```bash
npm test          # node tests/logic.test.js（規則引擎 17 項）
```

---

## 4. Android Studio（可選）

1. Android Studio → **Open an Existing Project** → 選擇 `android/`
2. 等 Gradle sync 完成
3. 上方綠色 ▶ 執行到模擬器或實機

> Android Studio 內建 JBR 通常已 ≥ 21，可直接使用；若版本過舊請在 `Settings → Build → Gradle → Gradle JDK` 指定 JDK 21。

---

## 5. Electron（上游功能，本分支未驗證）

```bash
npm start                 # 開發模式
npm run package           # electron-packager 打包
```

## 6. Tauri（上游功能，本分支未驗證）

```bash
npm run tauri dev
npm run tauri build
```

## 7. Microsoft Store / MSIX（本分支不使用）

上游的 MSIX 打包、試用授權與 `StoreBridge` 原生外掛在本分支已無對應功能（大模型與商店授權相關模組均已移除），可忽略 `Documents/installmsix.md`、`Documents/tauri_integration_guide.md`。
