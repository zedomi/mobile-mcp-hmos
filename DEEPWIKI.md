# Mobile MCP - DeepWiki 项目深度分析文档

> 本文档面向二次开发者，深入分析 mobile-mcp 项目的架构、模块、接口和扩展方式，为支持 HarmonyOS 端自动化提供完整的技术参考。

---

## 一、项目概览

### 1.1 项目定位

**mobile-mcp** 是一个基于 [Model Context Protocol (MCP)](https://github.com/modelcontextprotocol) 的移动端自动化服务器，允许 AI Agent / LLM 通过统一的跨平台接口与 iOS / Android 设备进行交互，实现：

- 📲 原生 App 自动化（测试、数据录入）
- 📝 脚本化流程和表单交互
- 🧭 LLM 驱动的多步骤用户旅程自动化
- 👆 通用移动应用交互（Agent 框架）
- 🤖 Agent 间通信的移动自动化

### 1.2 技术栈

| 技术 | 说明 |
|------|------|
| **语言** | TypeScript (ESNext + CommonJS) |
| **运行时** | Node.js >= 18 |
| **MCP SDK** | `@modelcontextprotocol/sdk` 1.25.2 |
| **传输协议** | Stdio（默认）/ SSE（HTTP） |
| **构建工具** | tsc (TypeScript Compiler) |
| **包管理** | npm |
| **代码规范** | ESLint + Husky (pre-commit) |
| **测试框架** | Mocha + nyc (覆盖率) |

### 1.3 目录结构

```
mobile-mcp-hmos/
├── src/                          # 源码目录
│   ├── index.ts                  # 入口文件（启动 Stdio/SSE 服务器）
│   ├── server.ts                 # MCP 服务器核心（工具注册 + 设备路由）
│   ├── robot.ts                  # 🔑 Robot 接口定义（核心抽象层）
│   ├── android.ts                # Android 平台实现（ADB）
│   ├── ios.ts                    # iOS 真机实现（go-ios + WDA）
│   ├── iphone-simulator.ts       # iOS 模拟器实现（simctl + WDA）
│   ├── mobile-device.ts          # mobilecli 通用设备实现
│   ├── mobilecli.ts              # mobilecli CLI 工具封装
│   ├── webdriver-agent.ts        # WebDriverAgent HTTP 客户端
│   ├── image-utils.ts            # 图片处理（缩放、格式转换）
│   ├── png.ts                    # PNG 文件解析
│   └── logger.ts                 # 日志工具
├── test/                         # 测试文件
├── lib/                          # 编译输出目录
├── package.json
├── tsconfig.json
└── server.json                   # MCP 服务器元数据
```

---

## 二、核心架构

### 2.1 整体架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        AI Agent / LLM                           │
│                  (Claude, Copilot, Cline 等)                     │
└──────────────────────────┬──────────────────────────────────────┘
                           │ MCP Protocol (Stdio / SSE)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                     MCP Server (server.ts)                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Tool Registry (20 个工具)                    │    │
│  │  mobile_list_available_devices, mobile_tap, ...          │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                              │                                   │
│  ┌──────────────────────────▼──────────────────────────────┐    │
│  │           getRobotFromDevice(deviceId)                    │    │
│  │              设备路由 / 工厂方法                            │    │
│  └──┬──────────────┬──────────────┬───────────────────────┘    │
│     │              │              │                              │
│     ▼              ▼              ▼                              │
│ ┌────────┐  ┌──────────┐  ┌─────────────┐  ┌──────────────┐   │
│ │Android │  │  iOS     │  │  iPhone     │  │ MobileDevice │   │
│ │ Robot  │  │  Robot   │  │  Simulator  │  │ (mobilecli)  │   │
│ └───┬────┘  └────┬─────┘  └──────┬──────┘  └──────┬───────┘   │
│     │            │               │                 │            │
└─────┼────────────┼───────────────┼─────────────────┼────────────┘
      │            │               │                 │
      ▼            ▼               ▼                 ▼
   ┌─────┐   ┌─────────┐   ┌──────────┐      ┌──────────┐
   │ ADB │   │ go-ios  │   │  simctl  │      │mobilecli │
   │     │   │ + WDA   │   │  + WDA   │      │  binary  │
   └──┬──┘   └────┬────┘   └────┬─────┘      └────┬─────┘
      │           │              │                  │
      ▼           ▼              ▼                  ▼
  ┌────────┐ ┌─────────┐  ┌──────────┐       ┌──────────┐
  │Android │ │ iOS     │  │  iOS     │       │ 通用设备  │
  │ Device │ │ Device  │  │Simulator │       │          │
  └────────┘ └─────────┘  └──────────┘       └──────────┘
```

### 2.2 分层设计

项目采用经典的**三层架构**：

| 层级 | 文件 | 职责 |
|------|------|------|
| **传输层** | `index.ts` | 处理 MCP 协议传输（Stdio / SSE） |
| **服务层** | `server.ts` | MCP 工具注册、设备路由、参数校验 |
| **抽象层** | `robot.ts` | 定义统一的 `Robot` 接口 |
| **实现层** | `android.ts`, `ios.ts`, `iphone-simulator.ts`, `mobile-device.ts` | 各平台具体实现 |
| **驱动层** | `mobilecli.ts`, `webdriver-agent.ts` | 底层工具/协议封装 |
| **工具层** | `image-utils.ts`, `png.ts`, `logger.ts` | 通用工具函数 |

---

## 三、核心接口：Robot

> 📌 **这是二次开发最关键的接口**，新增 HarmonyOS 支持的核心就是实现这个接口。

### 3.1 接口定义 (`src/robot.ts`)

```typescript
export interface Robot {
  // === 设备信息 ===
  getScreenSize(): Promise<ScreenSize>;
  getOrientation(): Promise<Orientation>;
  setOrientation(orientation: Orientation): Promise<void>;

  // === 屏幕交互 ===
  tap(x: number, y: number): Promise<void>;
  doubleTap(x: number, y: number): Promise<void>;
  longPress(x: number, y: number, duration: number): Promise<void>;
  swipe(direction: SwipeDirection): Promise<void>;
  swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void>;

  // === 截图 ===
  getScreenshot(): Promise<Buffer>;

  // === 输入 ===
  sendKeys(text: string): Promise<void>;
  pressButton(button: Button): Promise<void>;

  // === 应用管理 ===
  listApps(): Promise<InstalledApp[]>;
  launchApp(packageName: string): Promise<void>;
  terminateApp(packageName: string): Promise<void>;
  installApp(path: string): Promise<void>;
  uninstallApp(bundleId: string): Promise<void>;

  // === 导航 ===
  openUrl(url: string): Promise<void>;

  // === UI 元素 ===
  getElementsOnScreen(): Promise<ScreenElement[]>;
}
```

### 3.2 关键类型定义

```typescript
// 屏幕尺寸
interface ScreenSize {
  width: number;
  height: number;
  scale: number;       // 设备像素比
}

// 屏幕元素
interface ScreenElement {
  type: string;         // 元素类型（Button, TextField 等）
  label?: string;       // 无障碍标签
  text?: string;        // 显示文本
  name?: string;        // 元素名称
  value?: string;       // 元素值
  identifier?: string;  // 资源 ID
  rect: ScreenElementRect;  // 位置和尺寸
  focused?: boolean;    // 是否聚焦
}

// 元素矩形区域
interface ScreenElementRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 滑动方向
type SwipeDirection = "up" | "down" | "left" | "right";

// 按钮
type Button = "HOME" | "BACK" | "VOLUME_UP" | "VOLUME_DOWN" | "ENTER"
            | "DPAD_CENTER" | "DPAD_UP" | "DPAD_DOWN" | "DPAD_LEFT" | "DPAD_RIGHT";

// 屏幕方向
type Orientation = "portrait" | "landscape";

// 已安装应用
interface InstalledApp {
  packageName: string;
  appName: string;
}

// 可操作错误（会提示用户修复后重试）
class ActionableError extends Error { }
```

---

## 四、各平台实现详解

### 4.1 Android 实现 (`src/android.ts`)

| 类 | 职责 |
|------|------|
| `AndroidRobot` | 实现 `Robot` 接口，通过 ADB 控制 Android 设备 |
| `AndroidDeviceManager` | 设备发现和管理 |

**底层驱动**：ADB (Android Debug Bridge)

**关键实现细节**：

| 能力 | 实现方式 |
|------|----------|
| **截图** | `adb exec-out screencap -p`，多屏设备通过 display ID 指定 |
| **点击** | `adb shell input tap x y` |
| **滑动** | `adb shell input swipe x0 y0 x1 y1 duration` |
| **长按** | 用 swipe 模拟（起止坐标相同 + 长 duration） |
| **输入文本** | ASCII: `adb shell input text`；非 ASCII: 通过 devicekit 剪贴板 |
| **按键** | `adb shell input keyevent KEYCODE_XXX` |
| **UI 元素** | `adb exec-out uiautomator dump /dev/tty` → 解析 XML |
| **应用管理** | `adb shell am`（启动/停止）、`adb install/uninstall` |
| **屏幕尺寸** | `adb shell wm size` |
| **屏幕方向** | `adb shell settings get/put system user_rotation` |

**ADB 路径查找逻辑**：
1. `$ANDROID_HOME/platform-tools/adb`
2. Windows: `$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe`
3. macOS: `$HOME/Library/Android/sdk/platform-tools/adb`
4. 回退到 PATH 中的 `adb`

### 4.2 iOS 真机实现 (`src/ios.ts`)

| 类 | 职责 |
|------|------|
| `IosRobot` | 实现 `Robot` 接口，通过 go-ios + WDA 控制 iOS 真机 |
| `IosManager` | iOS 设备发现和信息获取 |

**底层驱动**：
- **go-ios**：开源 iOS 设备通信工具（设备发现、应用管理、隧道）
- **WebDriverAgent (WDA)**：Facebook 开源的 iOS UI 自动化代理（运行在设备上）

**关键实现细节**：

| 能力 | 实现方式 |
|------|----------|
| **截图** | WDA HTTP API: `GET /screenshot` → base64 PNG |
| **点击/滑动/长按** | WDA W3C Actions API: `POST /session/{id}/actions` |
| **输入文本** | WDA: `POST /session/{id}/wda/keys` |
| **按键** | WDA: `POST /session/{id}/wda/pressButton` |
| **UI 元素** | WDA: `GET /source/?format=json` → 解析 SourceTree |
| **应用管理** | go-ios CLI: `ios launch/kill/install/uninstall` |
| **屏幕尺寸** | WDA: `GET /session/{id}/wda/screen` |
| **屏幕方向** | WDA: `GET/POST /session/{id}/orientation` |

**连接前置条件**：
- iOS 17+ 需要运行 tunnel（端口 60105）
- 需要 WDA 端口转发（端口 8100）
- WDA 必须在设备上运行

### 4.3 iOS 模拟器实现 (`src/iphone-simulator.ts`)

| 类 | 职责 |
|------|------|
| `Simctl` | 实现 `Robot` 接口，通过 simctl + WDA 控制 iOS 模拟器 |

**底层驱动**：
- **xcrun simctl**：Xcode 模拟器命令行工具
- **WebDriverAgent (WDA)**：同 iOS 真机

**与 iOS 真机的区别**：
- 应用管理使用 `simctl` 而非 go-ios
- 不需要 tunnel
- WDA 可以自动启动（检测到已安装但未运行时）
- 支持 `.zip` 文件安装（自动解压提取 `.app`）

### 4.4 MobileDevice 通用实现 (`src/mobile-device.ts`)

| 类 | 职责 |
|------|------|
| `MobileDevice` | 实现 `Robot` 接口，通过 mobilecli 二进制工具控制设备 |

**底层驱动**：`@mobilenext/mobilecli`（可选依赖的原生二进制工具）

**命令映射**：

| Robot 方法 | mobilecli 命令 |
|-----------|---------------|
| `getScreenSize()` | `mobilecli device info --device {id}` |
| `tap(x, y)` | `mobilecli io tap x,y --device {id}` |
| `swipe()` | `mobilecli io swipe x0,y0,x1,y1 --device {id}` |
| `getScreenshot()` | `mobilecli screenshot --format png --output - --device {id}` |
| `sendKeys(text)` | `mobilecli io text {text} --device {id}` |
| `pressButton(btn)` | `mobilecli io button {btn} --device {id}` |
| `listApps()` | `mobilecli apps list --device {id}` |
| `launchApp(pkg)` | `mobilecli apps launch {pkg} --device {id}` |
| `getElementsOnScreen()` | `mobilecli dump ui --device {id}` |
| `setOrientation()` | `mobilecli device orientation set {o} --device {id}` |

---

## 五、MCP 服务器层 (`src/server.ts`)

### 5.1 工具注册

`server.ts` 是整个项目的核心枢纽，负责：

1. **创建 MCP Server 实例**
2. **注册 20 个 MCP 工具**
3. **设备路由**（`getRobotFromDevice`）
4. **遥测上报**（PostHog）

### 5.2 设备路由逻辑 (`getRobotFromDevice`)

```
getRobotFromDevice(deviceId)
    │
    ├── 1. 检查 mobilecli 是否可用
    │
    ├── 2. 在 iOS 设备列表中查找 → 返回 IosRobot
    │
    ├── 3. 在 Android 设备列表中查找 → 返回 AndroidRobot
    │
    ├── 4. 在 mobilecli 模拟器列表中查找 → 返回 MobileDevice
    │
    └── 5. 未找到 → 抛出 ActionableError
```

> 📌 **扩展点**：新增 HarmonyOS 支持时，需要在此路由中增加 HarmonyOS 设备的识别和分发逻辑。

### 5.3 设备发现逻辑 (`mobile_list_available_devices`)

```
mobile_list_available_devices
    │
    ├── 1. AndroidDeviceManager.getConnectedDevicesWithDetails()
    │      → 通过 ADB 获取 Android 设备
    │
    ├── 2. IosManager.listDevicesWithDetails()
    │      → 通过 go-ios 获取 iOS 真机
    │
    └── 3. mobilecli.getDevices({ platform: "ios", type: "simulator" })
           → 通过 mobilecli 获取 iOS 模拟器
```

> 📌 **扩展点**：新增 HarmonyOS 支持时，需要在此处增加 HarmonyOS 设备的发现逻辑。

### 5.4 已注册的 20 个 MCP 工具

| 工具名 | 类别 | 读/写 | 说明 |
|--------|------|-------|------|
| `mobile_list_available_devices` | 设备管理 | 只读 | 列出所有可用设备 |
| `mobile_get_screen_size` | 设备管理 | 只读 | 获取屏幕尺寸 |
| `mobile_get_orientation` | 设备管理 | 只读 | 获取屏幕方向 |
| `mobile_set_orientation` | 设备管理 | 写入 | 设置屏幕方向 |
| `mobile_list_apps` | 应用管理 | 只读 | 列出已安装应用 |
| `mobile_launch_app` | 应用管理 | 写入 | 启动应用 |
| `mobile_terminate_app` | 应用管理 | 写入 | 终止应用 |
| `mobile_install_app` | 应用管理 | 写入 | 安装应用 |
| `mobile_uninstall_app` | 应用管理 | 写入 | 卸载应用 |
| `mobile_take_screenshot` | 屏幕交互 | 只读 | 截图（返回图片） |
| `mobile_save_screenshot` | 屏幕交互 | 写入 | 截图保存到文件 |
| `mobile_list_elements_on_screen` | 屏幕交互 | 只读 | 列出屏幕 UI 元素 |
| `mobile_click_on_screen_at_coordinates` | 屏幕交互 | 写入 | 点击坐标 |
| `mobile_double_tap_on_screen` | 屏幕交互 | 写入 | 双击坐标 |
| `mobile_long_press_on_screen_at_coordinates` | 屏幕交互 | 写入 | 长按坐标 |
| `mobile_swipe_on_screen` | 屏幕交互 | 写入 | 滑动 |
| `mobile_type_keys` | 输入导航 | 写入 | 输入文本 |
| `mobile_press_button` | 输入导航 | 写入 | 按下按钮 |
| `mobile_open_url` | 输入导航 | 写入 | 打开 URL |

---

## 六、传输层 (`src/index.ts`)

支持两种 MCP 传输方式：

### 6.1 Stdio 模式（默认）

```bash
npx @mobilenext/mobile-mcp@latest
# 或
mcp-server-mobile --stdio
```

- 通过标准输入/输出与 MCP 客户端通信
- 适用于 Claude Desktop、VS Code 等本地集成

### 6.2 SSE 模式

```bash
mcp-server-mobile --port 3000
```

- 启动 Express HTTP 服务器
- `GET /mcp` → 建立 SSE 连接
- `POST /mcp` → 发送消息
- 适用于远程/Web 场景

---

## 七、辅助模块

### 7.1 WebDriverAgent 客户端 (`src/webdriver-agent.ts`)

封装了 WDA 的 HTTP API，被 `IosRobot` 和 `Simctl` 共同使用：

| 方法 | WDA API |
|------|---------|
| `isRunning()` | `GET /status` |
| `createSession()` | `POST /session` |
| `deleteSession(id)` | `DELETE /session/{id}` |
| `getScreenSize()` | `GET /session/{id}/wda/screen` |
| `tap(x, y)` | `POST /session/{id}/actions` (W3C Actions) |
| `doubleTap(x, y)` | `POST /session/{id}/actions` |
| `longPress(x, y, d)` | `POST /session/{id}/actions` |
| `swipe(direction)` | `POST /session/{id}/actions` |
| `sendKeys(text)` | `POST /session/{id}/wda/keys` |
| `pressButton(btn)` | `POST /session/{id}/wda/pressButton` |
| `getScreenshot()` | `GET /screenshot` |
| `getPageSource()` | `GET /source/?format=json` |
| `openUrl(url)` | `POST /session/{id}/url` |
| `setOrientation(o)` | `POST /session/{id}/orientation` |
| `getOrientation()` | `GET /session/{id}/orientation` |

**Session 管理**：采用 `withinSession` 模式，每次操作自动创建和销毁 session。

**UI 元素过滤**：只返回以下类型的可见元素：
- `TextField`, `Button`, `Switch`, `Icon`, `SearchField`, `StaticText`, `Image`

### 7.2 mobilecli 封装 (`src/mobilecli.ts`)

封装了 `@mobilenext/mobilecli` 原生二进制工具的调用：

**二进制查找逻辑**：
1. 环境变量 `$MOBILECLI_PATH`
2. `node_modules/@mobilenext/mobilecli/bin/mobilecli-{platform}-{arch}`
3. 上级目录的 `node_modules` 中查找

**平台/架构映射**：
- `darwin` → `mobilecli-darwin-arm64` / `mobilecli-darwin-amd64`
- `win32` → `mobilecli-windows-amd64.exe`
- `linux` → `mobilecli-linux-amd64`

### 7.3 图片处理 (`src/image-utils.ts`)

截图优化链：PNG → 缩放 → JPEG 压缩

**缩放工具优先级**：
1. **Sips**（macOS 内置，优先使用）
2. **ImageMagick**（跨平台回退）

**截图处理流程**：
```
原始 PNG 截图
    ↓
PNG.getDimensions() 验证有效性
    ↓
如果 isScalingAvailable():
    ↓
resize(width / scale) → JPEG(quality=75)
    ↓
返回压缩后的 base64 图片
```

### 7.4 日志 (`src/logger.ts`)

- 输出到 `stderr`（避免干扰 Stdio MCP 通信）
- 可选写入文件（通过 `$LOG_FILE` 环境变量）
- 两个级别：`trace`（调试）和 `error`（错误），实际实现相同

---

## 八、数据流分析

### 8.1 一次典型的工具调用流程

以 `mobile_click_on_screen_at_coordinates` 为例：

```
Agent 发送 MCP 请求
    ↓
index.ts: StdioServerTransport 接收
    ↓
server.ts: tool handler 被调用
    ↓
server.ts: getRobotFromDevice(deviceId) → 返回对应 Robot 实例
    ↓
AndroidRobot.tap(x, y) 或 IosRobot.tap(x, y)
    ↓
Android: execFileSync("adb", ["-s", deviceId, "shell", "input", "tap", x, y])
iOS:     WDA HTTP POST /session/{id}/actions (W3C Actions)
    ↓
返回结果文本 "Clicked on screen at coordinates: x, y"
    ↓
MCP 响应返回给 Agent
```

### 8.2 截图流程（特殊处理）

```
Agent 请求 mobile_take_screenshot
    ↓
robot.getScreenshot() → 原始 PNG Buffer
    ↓
PNG.getDimensions() 验证
    ↓
如果图片处理工具可用:
    Image.resize(width/scale).jpeg({quality:75}).toBuffer()
    ↓
Buffer → base64 字符串
    ↓
返回 MCP 图片内容 { type: "image", data: base64, mimeType }
```

---

## 九、扩展 HarmonyOS 支持的开发指南

### 9.1 需要新增的文件

```
src/
├── harmony.ts              # HarmonyOS Robot 实现（核心）
├── harmony-device-manager.ts  # HarmonyOS 设备发现和管理（可选，也可合并到 harmony.ts）
```

### 9.2 实现步骤

#### Step 1: 创建 HarmonyRobot 类

```typescript
// src/harmony.ts
import { Robot, ScreenSize, SwipeDirection, Button, InstalledApp,
         ScreenElement, Orientation } from "./robot";

export class HarmonyRobot implements Robot {
    constructor(private deviceId: string) {}

    // 实现所有 Robot 接口方法...
    // 需要调研 HarmonyOS 的自动化工具链：
    // - hdc (HarmonyOS Device Connector) 类似 ADB
    // - uitest 框架
    // - 或其他自动化方案
}

export class HarmonyDeviceManager {
    // 设备发现逻辑
    getConnectedDevices(): HarmonyDevice[] { ... }
}
```

#### Step 2: 修改设备路由 (`src/server.ts`)

在 `getRobotFromDevice` 中增加 HarmonyOS 分支：

```typescript
const getRobotFromDevice = (deviceId: string): Robot => {
    // ... 现有逻辑 ...

    // 新增：检查是否是 HarmonyOS 设备
    const harmonyManager = new HarmonyDeviceManager();
    const harmonyDevices = harmonyManager.getConnectedDevices();
    const harmonyDevice = harmonyDevices.find(d => d.deviceId === deviceId);
    if (harmonyDevice) {
        return new HarmonyRobot(deviceId);
    }

    throw new ActionableError(`Device "${deviceId}" not found.`);
};
```

#### Step 3: 修改设备发现 (`src/server.ts`)

在 `mobile_list_available_devices` 工具中增加 HarmonyOS 设备：

```typescript
// 新增：获取 HarmonyOS 设备
const harmonyManager = new HarmonyDeviceManager();
const harmonyDevices = harmonyManager.getConnectedDevices();
for (const device of harmonyDevices) {
    devices.push({
        id: device.deviceId,
        name: device.name,
        platform: "harmony",    // 新增平台类型
        type: device.type,
        version: device.version,
        state: "online",
    });
}
```

#### Step 4: 扩展类型定义

在 `MobilecliDevice` 接口中扩展 platform 类型：

```typescript
interface MobilecliDevice {
    platform: "android" | "ios" | "harmony";  // 新增 harmony
    // ...
}
```

### 9.3 HarmonyOS 自动化工具链参考

| 能力 | HarmonyOS 工具 | 对标 Android |
|------|---------------|-------------|
| **设备连接** | hdc (HarmonyOS Device Connector) | adb |
| **截图** | `hdc shell snapshot_display` | `adb exec-out screencap` |
| **点击** | `hdc shell uitest uiInput click x y` | `adb shell input tap` |
| **滑动** | `hdc shell uitest uiInput swipe x0 y0 x1 y1` | `adb shell input swipe` |
| **输入文本** | `hdc shell uitest uiInput inputText text` | `adb shell input text` |
| **按键** | `hdc shell uitest uiInput keyEvent keyCode` | `adb shell input keyevent` |
| **UI 树** | `hdc shell uitest uiDump` | `adb exec-out uiautomator dump` |
| **应用管理** | `hdc install/uninstall` + `hdc shell aa start/force-stop` | `adb install` + `adb shell am` |
| **设备信息** | `hdc shell param get` | `adb shell getprop` |
| **屏幕尺寸** | `hdc shell hidumper -s RenderService` | `adb shell wm size` |

### 9.4 关键注意事项

1. **hdc 路径查找**：参考 `getAdbPath()` 的实现模式，支持环境变量 `$HDC_HOME` 和默认路径
2. **UI 元素解析**：HarmonyOS 的 `uitest uiDump` 输出格式可能与 Android 的 UIAutomator XML 不同，需要适配解析逻辑
3. **截图格式**：确认 HarmonyOS 截图输出格式（PNG/JPEG），适配 `PNG` 类的验证逻辑
4. **按键映射**：HarmonyOS 的 keyCode 与 Android 不同，需要建立新的 `BUTTON_MAP`
5. **设备类型**：HarmonyOS 可能有手机、平板、智慧屏等多种设备类型
6. **模拟器支持**：如果 HarmonyOS 有模拟器（DevEco Studio Emulator），也需要支持

### 9.5 最小可行改动清单

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/harmony.ts` | **新增** | HarmonyRobot + HarmonyDeviceManager |
| `src/server.ts` | **修改** | getRobotFromDevice 增加 harmony 分支 |
| `src/server.ts` | **修改** | mobile_list_available_devices 增加 harmony 设备发现 |
| `src/server.ts` | **修改** | MobilecliDevice.platform 类型扩展 |
| `src/robot.ts` | **可选修改** | 如果 HarmonyOS 有特有能力，可扩展 Robot 接口 |

---

## 十、构建与运行

### 10.1 开发环境搭建

```bash
# 安装依赖
npm install

# 编译
npm run build

# 监听模式开发
npm run watch

# 运行测试
npm test

# 代码检查
npm run lint
npm run fixlint
```

### 10.2 编译产物

- 源码：`src/` → 编译输出：`lib/`
- 入口：`lib/index.js`（带 shebang，可直接执行）
- 模块格式：CommonJS

### 10.3 环境变量

| 变量 | 说明 |
|------|------|
| `ANDROID_HOME` | Android SDK 路径 |
| `GO_IOS_PATH` | go-ios 二进制路径 |
| `MOBILECLI_PATH` | mobilecli 二进制路径 |
| `LOG_FILE` | 日志文件路径 |

---

## 十一、错误处理模式

项目使用两级错误处理：

1. **`ActionableError`**：用户可修复的错误（如设备未连接、工具未安装）
   - 返回给 Agent 的消息带 "Please fix the issue and try again"
   - 不标记为 `isError`

2. **普通 `Error`**：系统异常
   - 返回给 Agent 的消息带 "Error:" 前缀
   - 标记为 `isError: true`

---

## 十二、遥测系统

通过 PostHog 收集匿名使用数据：

- **事件**：`launch`（启动）、`tool_invoked`（工具调用）、`tool_failed`（工具失败）
- **属性**：平台、版本、Node 版本、Agent 名称、工具名、耗时
- **隐私**：使用 hostname + execPath 的 SHA256 哈希作为匿名 ID

---

> 📝 **文档版本**：基于项目 v0.0.1 源码分析生成
> 📅 **生成时间**：2026-02-13
