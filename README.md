# 柴记账 Android App

Expo + React Native 独立客户端。第一阶段为基础工程，目标渠道是小米、华为、OPPO、vivo 和应用宝；已生成本地签名预览 APK，尚未完成该 APK 的真机验收、应用商店审核或上架。华为渠道的 Android 设备范围与鸿蒙原生支持需单独确认。

## 本地启动

使用 Node.js 22.18 或满足 React Native 要求的更新版本，以及 pnpm 11.5.3。

```powershell
cd D:\code\chai\chai-app
pnpm install
pnpm start
```

兼容 SDK 57 的 Expo Go 可用于 Android 基础页面预览，运行 `pnpm android:go`。`pnpm android` 改为本地原生调试构建，需要 Android SDK 和已连接的设备；其调试签名不用于微信开放平台注册。原生微信 SDK 接入后不能用 Expo Go 验收微信登录。

`pnpm web` 提供浏览器辅助预览；Web 预览不能代替 Android 真机验收。浏览器端凭证仅保存在内存，Android 使用 SecureStore。

## 当前范围

- 四个主页面：明细、图表、预算、我的，包含未登录状态和底部记账入口。
- 月份切换、收支筛选、记账表单的金额及备注输入、页面返回。
- 请求层按现有 `{ code, msg, data }` 契约解析，包含超时、单次认证重试、并发刷新与会话变更保护。
- SecureStore 凭证恢复、退出登录和查询缓存清理基础层。
- 页面尚未绑定真实账本、流水、预算和统计接口。金额 `--` 表示尚无可展示数据，不代表零余额。
- 登录按钮暂不可用，没有模拟成功、默认账号或生产开发登录。记账表单不会提交或持久化。

## 服务配置

`.env.example` 列出 `EXPO_PUBLIC_API_BASE_URL`。本地 `.env.local` 可设置接口根地址（含后端 API 前缀），不会被 Git 收录；正式构建要求 HTTPS。变量会进入客户端包，不可放入密钥。

Android 模拟器访问本机可使用 `10.0.2.2`；真机需要可达的局域网地址或 HTTPS 测试服务。默认未设置服务地址，也不会自动请求线上服务。

当前 `/auth/wx-login` 仅支持小程序 code。安卓微信登录、账号关联及开放平台配置需要后续确定，不能直接复用小程序 code 或假设两端 openid 相同。

已确认 Android 包名为 `me.sikehuhu.chai`，图标沿用官网“柴”字图标。本地签名密钥库及密码保存在用户目录 `.chai-signing/`，不得放入项目、提交 Git 或输出到日志。商店材料和发布审核尚未完成，未配置 EAS 云构建。

## 本地签名 APK

这是自带 JavaScript 资源的 release 模式测试包，不需要 Expo Go 或运行 Metro；不代表业务已完成或可以上架。微信登录和真实业务接口仍未接入。

环境：本机使用 Android Studio 自带的 JBR 25.0.3（已有 GraalVM 17.0.9 和 21.0.2 均在 `jlink` 转换阶段失败）、Android SDK Platform 36、Build-Tools 36.0.0 和 35.0.0（部分原生依赖需要）、Platform-Tools、NDK 27.1.12297006、CMake 3.30.5，以及独立安装的 Ninja 1.13.2。SDK 默认路径为 `D:\Android\Sdk`。通过 Android Studio SDK Manager 手动安装缺少的组件；脚本不接受许可、不自动安装 SDK，也不修改系统环境变量。

```powershell
cd D:\code\chai\chai-app
# 仅生成原生工程并检查配置，不读取签名密码、不构建 APK。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -PrepareOnly
# 构建适合现代安卓真机的 arm64-v8a APK。
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\build-android.ps1 -JavaHome 'D:\software\Android Studio\jbr' -NinjaPath 'D:\Android\ninja-win\ninja.exe'
```

脚本使用 `expo prebuild --no-clean --no-install`，保留已有 `android/` 文件，不批量删除或升级依赖。`android/` 为已忽略的生成目录，签名配置通过 `plugins/with-local-android-signing.js` 注入，不手改生成文件。缺少签名凭据的 release 构建会失败，不会回退到模板调试密钥。Gradle 首次构建仍需下载依赖。

Windows 下，插件将各模块的 CMake 中间文件集中到 `android/.cxx/<模块名>/`，缩短中间文件路径。pnpm 依赖源码仍可能超过 260 字符，因此还需手动启用 Windows `LongPathsEnabled` 并使用 Ninja 1.12.0 以上版本。脚本检查这些条件，通过进程环境变量 `CHAI_NINJA_PATH` 向各原生模块传入 `CMAKE_MAKE_PROGRAM`；默认读取 `D:\Android\ninja-win\ninja.exe`，可用 `-NinjaPath` 指定其他位置。不覆盖 SDK 自带的 Ninja、不修改注册表、依赖源码或删除原有缓存。

Java 不一定沿用 Windows 的网络代理。下载超时时可向脚本传入 `-HttpProxy http://127.0.0.1:实际端口`，仅在本次构建进程设置 Gradle 代理，退出后恢复；不接受含账号密码的代理 URL，不修改全局代理或关闭 TLS 校验。

Java 25 下，Prefab 子进程加载 JNI 时需要显式原生访问许可。脚本仅在构建进程的 `JAVA_TOOL_OPTIONS` 中追加 `--enable-native-access=ALL-UNNAMED`，结束后恢复原值，不更改系统 Java 配置。

凭据默认读取 `%USERPROFILE%\.chai-signing\credentials.json`。签名密码仅通过非 `EXPO_PUBLIC_` 的进程环境变量传给构建子进程，结束后恢复环境；不启用持久 Gradle daemon 或配置缓存（Gradle 可能使用构建结束即退出的一次性进程）。不要在打包时启用环境变量转储、调试日志或公开构建日志。

构建成功后，脚本验证包名、证书 SHA-256、非调试状态、被禁止的权限、内置 JS 与原生库，再将 APK 和不含密码的验收 JSON 保存到 `.verify/apk/`。它不自动安装到手机，也不上传服务器或应用商店。默认仅编译 ARM64；其他架构需使用 `-Architecture` 显式指定。

手机开启 USB 调试并授权电脑后，可使用 `D:\Android\Sdk\platform-tools\adb.exe install -r <APK绝对路径>` 安装，或把 APK 传到手机手动安装。签名冲突时不要直接卸载已有应用，以免丢失数据；先核对已安装版本与证书。保管并加密备份密钥库和密码，后续同一应用更新必须保持签名一致。

## 验证命令

启动屏通过 `expo-splash-screen` 配置，复用 `assets/icon.png`，居中等比显示，背景与首页一致（`#F9F9FF`）。不设置强制等待；本地登录状态读取完成后进入首页，读取失败时隐藏启动屏并展示原有重试入口。Web 不调用原生启动屏 API。修改启动配置后需要重新构建 APK，Expo Go 不能代替 release 包的启动效果验收。

```powershell
pnpm export:android
pnpm export:web
```

这些命令执行 Metro 打包转译，不执行 TypeScript 类型检查。Android export 只生成 JS/资源产物，不是 APK 或原生编译成功的证明。

遵循工作区约定：不自动格式化、不执行 lint 修复或 TypeScript 类型检查、不自动提交或推送。

## 第一阶段验收（2026-10-08）

- 依赖版本按 Expo SDK 57 对齐，peer dependency 检查通过。
- Android 与 Web 的 Metro 打包已通过；Android 产物是 Hermes JS 字节码及资源。
- 请求与存储层经过 12 个隔离运行时场景验证，包括并发刷新、暂时故障保留会话、失效会话清理和旧账号响应隔离。网络与 SecureStore 使用测试替身，未连接生产后端。
- 浏览器辅助验证通过主导航、月份选择、金额精度、备注输入、返回保留输入和继续浏览；320、375、844、1280 像素宽度检查无横向溢出，交互目标不小于 48 像素。
- `.verify/` 保存本地预览日志与截图。`pnpm-workspace.yaml` 由包管理器生成，当前仅记录安装策略，不包含其他项目。
- 当前机器未发现可用 Android SDK，未做原生编译、真机验证、签名 APK、商店审核或上架。未验收系统大字体、原生键盘、安卓返回键、真实 SecureStore 和微信 SDK；这些需在 Android 环境继续验证。
- 本轮未修改小程序、后端或生产服务。

## 本地 APK 构建验证（2026-10-11）

- 使用 JBR 25.0.3、Ninja 1.13.2 和上述 SDK 组件，`assembleRelease` 成功；未升级依赖、运行 TypeScript 类型检查、自动格式化或提交代码。
- 安装包：`.verify/apk/chai-arm64-v8a-20261011T051740Z.apk`，42,754,857 字节（约 40.77 MiB），版本 0.1.0 / versionCode 1，最低 API 24，目标 API 36，仅 ARM64。
- APK v2 签名验证通过；包名 `me.sikehuhu.chai`，证书 MD5 `dbbac6c7793ea36cfeeee7a937e53f54`，与已填写的微信开放平台签名一致。包名、证书 SHA-256、非调试状态、内置 JS 与原生库检查通过。
- APK SHA-256：`2c0583c909c29fd01c7f1d37d3145749c1cc223c9574472abdf2aae08c8aa6c5`。同目录 JSON 保存元数据；对 APK 中 assets 和 DEX 内容扫描未发现本地签名密码。
- 未包含录音及通讯录权限；仍包含依赖合并的存储（最高 API 32）、悬浮窗、生物识别等权限，商店发布前需另行审查和精简，不能将本次构建验证视为上架合规验收。
- 未自动安装到手机、上传服务器或提交商店。仍需真机验证启动、导航、键盘、返回键及前后台切换；微信登录、真实账本接口和数据持久化尚未接入。

## 启动屏修复验证（2026-10-11）

- 用户已反馈上一版安装后浏览暂无异常；本次修复其截图中默认启动图被拉伸的问题。仅新增 Expo SDK 57 匹配的 `expo-splash-screen` 57.0.9，未升级其他依赖；原有图标文件和业务逻辑未改动。
- 新安装包：`.verify/apk/chai-arm64-v8a-20261011T054459Z.apk`，42,949,963 字节，版本 0.1.0 / versionCode 2。包名与签名不变，用于覆盖安装；SHA-256：`3c1e90ad961d6a46ab970616125b177f355bd32ad1e878d951d5da1f5b9e8254`。
- `assembleRelease` 与打包脚本校验通过；核对 APK 资源表中的启动主题、背景色及五档密度图像，并提取最高密度图确认已替换为品牌 Logo。检查原生入口已注册 SplashScreenManager，模块已自动关联。
- 使用隔离运行时测试验证初始保持、读取成功退出、读取失败显示重试、重试过程和 Web 分支。只转译执行，未运行 TypeScript 类型检查。
- 当前未连接安卓设备，未自动安装；仍需真机冷启动、系统深色模式、横屏与前后台切换验收。无强制停留计时或新增动画；权限清单保持不变，登录、真实业务接入及权限精简待后续单独确认范围。
