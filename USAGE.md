# Mobile MCP Harmony 使用指南

本文档帮助你从零开始配置 `mobile-mcp-next`，让 AI Agent 能够控制你的 **Android / iOS / HarmonyOS** 真机执行自动化操作。

**你只需要完成两件事：① 准备好设备环境 → ② 在 AI 客户端中添加 MCP 配置。**

---

## 📋 第一步：准备设备环境

### 1. 安装 Node.js（必需）

所有平台都需要 **Node.js >= 18**。

```bash
# 检查是否已安装
node -v

# macOS 推荐使用 Homebrew 安装
brew install node

# 或使用 nvm 管理多版本
nvm install 18
nvm use 18
```

### 2. 安装设备驱动 & 连接设备

根据你要控制的设备平台，完成对应的准备工作：

---

#### 🤖 Android 真机 / 模拟器

**安装 ADB：**

```bash
# macOS
brew install android-platform-tools

# 验证安装
adb version
```

**连接设备：**

1. 在手机上开启 **设置 → 开发者选项 → USB 调试**
2. 用 USB 数据线连接电脑
3. 在手机上点击"允许 USB 调试"弹窗
4. 验证连接：

```bash
adb devices
# 应显示类似：
# List of devices attached
# XXXXXXXX    device
```

> ⚠️ 如果显示 `unauthorized`，请检查手机上是否已授权 USB 调试。

---

#### 🍎 iOS 真机

iOS 自动化底层依赖 **WebDriverAgent (WDA)**，需要提前安装并保持 WDA 运行。

**① 安装 Python 环境（建议 3.11）：**

```bash
# 检查 Python 版本
python3 --version

# 推荐使用 pyenv 管理版本
pyenv install 3.11
pyenv local 3.11
```

**② 安装 yuda 和 wda_taobao：**

```bash
pip install yuda wda_taobao -U \
  --extra-index-url http://artlab.alibaba-inc.com/1/pypi/tmq-pypi \
  --trusted-host artlab.alibaba-inc.com
```

**③ 连接设备并初始化：**

1. 用 USB 数据线连接 iPhone/iPad 到 Mac
2. 在设备上点击 **"信任此电脑"**
3. 执行初始化，往设备上安装 WDA 和 TMQ：
   ```bash
   yuda init_ios
   ```

**④ 启动 Tunnel（保持运行，不要关闭）：**

```bash
sudo ios tunnel start
```

> ⚠️ Tunnel 启动后**不能关闭**，需要保持终端窗口运行。建议单独开一个终端窗口执行。

**⑤ 启动 WDA（保持运行，不要关闭）：**

另开一个终端窗口：

```bash
python -m wda_taobao wda_run
```

> ⚠️ WDA 也需要**保持运行**。确认 WDA 启动成功后，再使用 MCP 进行 iOS 设备操作。

---

#### 🔷 HarmonyOS 真机

**安装 HDC：**

HDC (HarmonyOS Device Connector) 随 HarmonyOS SDK 一起提供：

1. 下载并安装 [DevEco Studio](https://developer.huawei.com/consumer/cn/deveco-studio/)
2. 在 DevEco Studio 中安装 HarmonyOS SDK
3. 确保 `hdc` 命令可用：

```bash
# 验证安装
hdc version
```

如果提示找不到命令，需要配置环境变量：

```bash
# 方法一：设置 HDC_SDK_PATH（推荐）
export HDC_SDK_PATH=/path/to/your/hmos-sdk/toolchains

# 方法二：将 hdc 所在目录加入 PATH
export PATH=$PATH:/path/to/your/hmos-sdk/toolchains
```

**连接设备：**

1. 在鸿蒙手机上开启 **设置 → 开发者选项 → USB 调试**
2. 用 USB 数据线连接电脑
3. 验证连接：

```bash
hdc list targets
# 应显示设备序列号
```

---

## 🔌 第二步：添加 MCP 配置

在你使用的 AI 客户端中添加以下配置，**无需手动安装任何包**，首次运行时会自动下载。

> 💡 配置中的 `<zhipu-api-key>` 需替换为你的智谱 AI API Key，可在 [智谱 AI 开放平台](https://open.bigmodel.cn/) 申请。该 Key 用于 OCR 视觉识别兜底（当无障碍树无法获取页面元素时自动启用）。

### Aone Copilot（IDE 插件）

编辑 `~/.aone_copilot/mcp_servers.json`，添加：

```json
{
  "mcpServers": {
    "mobile-mcp-next": {
      "command": "npx",
      "args": [
        "@ali/mobile-mcp-next@latest",
        "--zhipuai-api-key",
        "<zhipu-api-key>"
      ]
    }
  }
}
```

### Qoder

```json
{
  "mobile-mcp-next": {
    "command": "npx",
    "args": [
      "@ali/mobile-mcp-next@latest",
      "--zhipuai-api-key",
      "<zhipu-api-key>"
    ]
  }
}
```

---

## 🎯 第三步：验证是否就绪

配置完成后，在 AI 对话中依次尝试：

1. **检查设备连接** — 输入：`列出所有可用的移动设备`
   - 如果你的设备出现在返回的列表中，说明连接成功 ✅
2. **截图测试** — 输入：`帮我截一张手机屏幕的截图`
3. **交互测试** — 输入：`打开手机上的设置应用`

---

## ❓ 常见问题

### 设备列表为空，找不到设备？

- **Android**：运行 `adb devices` 确认状态为 `device`（非 `unauthorized`）。可尝试 `adb kill-server && adb start-server` 重启服务
- **HarmonyOS**：运行 `hdc list targets` 确认设备可见。检查 `hdc` 是否在 PATH 中
- **iOS**：确认 `ios tunnel start` 和 `wda_run` 均在运行中。真机需在设备上点击"信任此电脑"

### 点击/滑动操作没有反应？

- 确认设备屏幕处于 **解锁状态**
- HarmonyOS 设备首次连接时 `uitest` 服务会自动启动，请稍等片刻
- 尝试先让 Agent 执行 `mobile_list_elements_on_screen` 确认元素坐标是否正确

### 截图返回失败？

- **Android**：尝试 `adb shell screencap -p /sdcard/test.png` 手动验证
- **HarmonyOS**：尝试 `hdc shell snapshot_display` 手动验证
- **iOS**：确认 Tunnel 和 WDA 均在运行中，尝试 `python -m wda_taobao wda_run` 重新启动 WDA

### npx 下载超时或失败？

在 MCP 配置中指定阿里内部 npm 源：

```json
{
  "mcpServers": {
    "mobile-mcp-next": {
      "command": "npx",
      "args": ["-y", "--registry=https://registry.anpm.alibaba-inc.com", "@ali/mobile-mcp-next@latest"]
    }
  }
}
```
