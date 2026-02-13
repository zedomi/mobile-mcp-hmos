# Mobile MCP HarmonyOS — MCP Server for iOS, Android & HarmonyOS Automation

基于 [@mobilenext/mobile-mcp](https://github.com/mobile-next/mobile-mcp) 二次开发，**新增 HarmonyOS (鸿蒙) 设备自动化支持**。

本项目是一个 [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) 服务器，提供跨平台的移动端自动化能力，让 Agent / LLM 能够通过统一接口与 iOS、Android 和 **HarmonyOS** 设备进行交互 —— 包括模拟器、仿真器和真机。

<a href="https://github.com/zedomi/mobile-mcp-hmos/blob/main/LICENSE">
  <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" />
</a>

---

## ✨ 与上游的主要差异

| 特性 | [@mobilenext/mobile-mcp](https://github.com/mobile-next/mobile-mcp) | 本项目 |
|------|:---:|:---:|
| iOS 真机 / 模拟器 | ✅ | ✅ |
| Android 真机 / 模拟器 | ✅ | ✅ |
| **HarmonyOS 真机** | ❌ | ✅ |

HarmonyOS 自动化通过 **HDC (HarmonyOS Device Connector)** 直接驱动设备，**无需 mobilecli 依赖**，开箱即用。

---

## 🎯 平台支持

| 平台 | 支持 |
|------|:---:|
| iOS Real Device | ✅ |
| iOS Simulator | ✅ |
| Android Real Device | ✅ |
| Android Emulator | ✅ |
| **HarmonyOS Real Device** | ✅ |

---

## 🚀 主要能力

- 📲 **三端原生应用自动化** — iOS、Android、HarmonyOS 统一 MCP 工具集
- 🤖 **LLM 友好** — 基于无障碍树 (Accessibility Tree) 的结构化数据交互，无需视觉模型
- 🧿 **视觉兜底** — 当无障碍数据不可用时，自动回退到截图坐标分析
- 📊 **确定性操作** — 优先使用结构化数据，减少纯截图方案的歧义
- 📺 **结构化数据提取** — 从屏幕可见内容中提取结构化信息

---

## 🔧 MCP 工具列表

<details>
<summary>📱 <strong>点击展开完整工具列表</strong></summary>

> 详细实现见 [`src/server.ts`](src/server.ts)

### 设备管理
- **`mobile_list_available_devices`** — 列出所有可用设备（模拟器、仿真器、真机，含 HarmonyOS）
- **`mobile_get_screen_size`** — 获取设备屏幕尺寸（像素）
- **`mobile_get_orientation`** — 获取当前屏幕方向
- **`mobile_set_orientation`** — 设置屏幕方向（横屏 / 竖屏）

### 应用管理
- **`mobile_list_apps`** — 列出设备上已安装的应用
- **`mobile_launch_app`** — 通过包名启动应用
- **`mobile_terminate_app`** — 停止并终止应用
- **`mobile_install_app`** — 安装应用（.apk / .ipa / .app / .zip / .hap）
- **`mobile_uninstall_app`** — 卸载应用

### 屏幕交互
- **`mobile_take_screenshot`** — 截取屏幕截图
- **`mobile_save_screenshot`** — 保存截图到文件
- **`mobile_list_elements_on_screen`** — 列出屏幕上的 UI 元素及其坐标
- **`mobile_click_on_screen_at_coordinates`** — 点击指定坐标
- **`mobile_double_tap_on_screen`** — 双击指定坐标
- **`mobile_long_press_on_screen_at_coordinates`** — 长按指定坐标
- **`mobile_swipe_on_screen`** — 滑动（上 / 下 / 左 / 右）

### 输入与导航
- **`mobile_type_keys`** — 向焦点元素输入文本
- **`mobile_press_button`** — 按下设备按钮（HOME、BACK、VOLUME_UP/DOWN、ENTER 等）
- **`mobile_open_url`** — 在设备浏览器中打开 URL

### 各平台底层实现
- **iOS** — 通过 WebDriverAgent + 原生无障碍接口
- **Android** — 通过 ADB + UI Automator
- **HarmonyOS** — 通过 HDC + uitest + hidumper（无需 mobilecli）

</details>

---

## 📦 安装与配置

### 前置依赖

| 平台 | 依赖 |
|------|------|
| iOS / Android | [mobilecli](https://github.com/nicklockwood/mobilecli)（`@mobilenext/mobilecli`） |
| **HarmonyOS** | [HDC](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-command-line-hdc) — HarmonyOS SDK 自带，确保 `hdc` 在 PATH 中，或设置 `HDC_SDK_PATH` 环境变量 |
| 通用 | Node.js >= 18 |

### MCP 配置

**标准配置**（适用于大多数 MCP 客户端）：

```json
{
  "mcpServers": {
    "mobile-mcp": {
      "command": "npx",
      "args": ["-y", "@ali/mobile-mcp-harmony@latest"]
    }
  }
}
```

<details>
<summary>Claude Code</summary>

```bash
claude mcp add mobile-mcp -- npx -y @ali/mobile-mcp-harmony@latest
```

</details>

<details>
<summary>Claude Desktop</summary>

按照 [MCP 安装指南](https://modelcontextprotocol.io/quickstart/user)，使用上方的 JSON 配置。

</details>

<details>
<summary>VS Code / Copilot</summary>

编辑 `~/.copilot/mcp-config.json`：

```json
{
  "mcpServers": {
    "mobile-mcp": {
      "type": "local",
      "command": "npx",
      "tools": ["*"],
      "args": ["@ali/mobile-mcp-harmony@latest"]
    }
  }
}
```

</details>

<details>
<summary>从源码构建</summary>

```bash
git clone https://github.com/zedomi/mobile-mcp-hmos.git
cd mobile-mcp-hmos
npm install
npm run build
```

构建产物在 `lib/` 目录，可通过以下方式启动：

```bash
# stdio 模式（默认）
node lib/index.js

# SSE 模式
node lib/index.js --port 3000
```

</details>

---

## 🏗️ HarmonyOS 自动化原理

HarmonyOS 自动化通过 `HarmonyRobot` 类实现（见 [`src/harmony.ts`](src/harmony.ts)），核心依赖：

| 工具 | 用途 |
|------|------|
| `hdc` | 设备连接、文件传输、Shell 命令执行 |
| `uitest` | UI 操作（点击、滑动、输入、布局 dump） |
| `hidumper` | 获取屏幕尺寸、旋转方向等显示信息 |
| `snapshot_display` | 截取屏幕截图 |
| `bm` | 应用包管理（安装、卸载、查询） |
| `aa` | Ability 启动与终止 |

设备发现流程：`mobile_list_available_devices` 会自动通过 `hdc list targets` 探测 HarmonyOS 设备，与 iOS / Android 设备一起返回统一的设备列表。

---

## 🙏 致谢

本项目基于 [@mobilenext/mobile-mcp](https://github.com/mobile-next/mobile-mcp) 进行二次开发，感谢 Mobile Next 团队的优秀工作。

## 📄 License

[Apache-2.0](LICENSE)