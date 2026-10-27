# Google Play 上架包（com.gdchudadi.app）

本目录是 Google Play 与 `gplay` CLI 共用的素材/文案源，全部可直接推送到 Play。

## 结论速览

| 项目 | 状态 | 位置 / 命令 |
|---|---|---|
| 服务账号凭据 | ✅ 已注册 `gplay auth status` | `~/.gplay/service-account.json`（keyring 存储） |
| Play 应用 | ✅ 已建（`com.gdchudadi.app`） | developer id `7154833699363011170` |
| AAB | ✅ 已构建 v1.5.68 / versionCode 51 | `android/app/build/outputs/bundle/release/app-release.aab` |
| 内部测试轨道 | 见下方命令 | `gplay tracks list --package com.gdchudadi.app` |
| 商店文案 3 语言 | ✅ zh-CN（默认）/ zh-TW / en-US | `store/metadata/` |
| 图标 512 + 特征图 1024x500 | ✅ | `store/play/` |
| 手机截图 4 张 1080x1920 | ✅ | `store/play/phone-*.png` |
| 隐私政策公开 URL | ✅ | https://seagaruda.github.io/gdchudadi/privacy.html |

## 命令

```bash
# 打包（Play 只收 AAB）
export JAVA_HOME=/home/zhp/android-tools/jdk-21
export ANDROID_HOME=/home/zhp/android-tools/android-sdk
cd android && /home/zhp/android-tools/gradle-8.14.3/bin/gradle bundleRelease --offline

# 上传到内部测试（改 versionCode 后递增再传）
gplay releases upload app-release.aab --package com.gdchudadi.app \
  --track internal --release-name 1.5.68 \
  --release-notes "本次更新说明" --retry 5 --timeout 20m

# 商店文案：先看差异，再提交
gplay metadata apply --package com.gdchudadi.app --dir store/metadata --dry-run
gplay metadata apply --package com.gdchudadi.app --dir store/metadata --confirm

# 图片（图标/特征图/截图）— 用自建脚本，gplay 原生命令有 bug，见下
python3 scripts/gplay-upload-images.py store/metadata zh-CN zh-TW en-US
python3 scripts/gplay-upload-images.py store/metadata --verify zh-CN zh-TW en-US

# 截图重新生成（需先起本地服务：cd www && python3 -m http.server 8802）
node scripts/shots-play.js && node scripts/shots-play-about.js
python3 scripts/generate-feature-graphic.py
```

## Play Console 里必须人工完成的表单（无 API）

1. **设置 → API 访问权限**：服务账号 `seagaruda@gen-lang-client-0696204169.iam.gserviceaccount.com` 已授访问权限。
2. **应用内容**：
   - 隐私政策：填 `https://seagaruda.github.io/gdchudadi/privacy.html`
   - 广告：**不含广告**
   - 应用访问权限：所有功能无需登录/无需特殊访问
   - 内容分级问卷：类别「游戏」→ 卡牌；无暴力/性/粗俗/赌博（非真钱）/毒品/恐怖；无用户生成内容；无位置共享 → 预期分级 3+ / PEGI 3
   - 目标受众：**18 岁以上**（只勾成人，避免 Families 政策额外要求）
   - 数据安全：**不收集、不共享任何数据**（本应用无网络权限）
   - 政府应用 / 新闻应用 / 金融功能 / 健康：全部「否」
3. **商店设置**：应用类别「游戏 → 卡牌」；标签：卡牌、单机、策略；联系方式邮箱
4. **定价**：免费，国家/地区全选（或按需）
5. **发布 → 内部测试**：上传 AAB 后，把测试人员邮箱加进「测试人员」列表，拿到 opt-in 链接
6. **正式版前**：个人开发者新账号需 **封闭测试 12 名测试者连续 14 天**，通过后才能申请正式发布

## 坑

- `gplay releases upload` 的文件是**位置参数**，没有 `--file`。
- **gplay 2.3.2 bug ①**：上传到 internal/beta/alpha 时 payload 带 `userFraction=1.0`，Google 拒 `COMPLETED release must not have fraction`。绕过：`scripts/gplay-upload-internal.py`（resumable 分块上传，payload 不带 fraction）。
- **gplay 2.3.2 bug ②**：`metadata images apply/list` 会用 `promoGraphic` 去查 `image_type`，Google 报 `Invalid value ... "promoGraphic"`，整条图片通道挂掉。绕过：`scripts/gplay-upload-images.py`（直调 `edits.images.upload`，只用合法枚举）。
- 图片目录约定：`<dir>/<locale>/images/{icon,featureGraphic}.png` + `<dir>/<locale>/images/phoneScreenshots/{1..N}.png`；某语系没有 images 目录时脚本会复用树里第一个有素材的语系。
- 大陆网络下 10MB AAB 用 gplay 单发容易 `This edit has expired`，用自建脚本的 4MB 分块 resumable 约 50 秒传完。
- 上传/推送前先 `--dry-run`，能提前发现包名或格式问题。
- 本仓库启用了 sparse-checkout，新增顶层目录要 `git sparse-checkout add <dir>`，否则 `git add` 会被拒。
- 推 GitHub 大文件易 408：已设 `http.postBuffer=524288000`、`http.lowSpeedLimit=0`。
