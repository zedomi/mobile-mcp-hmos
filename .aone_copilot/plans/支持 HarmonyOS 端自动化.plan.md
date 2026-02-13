### 支持 HarmonyOS 端自动化 ###
在 mobile-mcp 项目中新增 HarmonyOS 平台支持，通过 hdc 工具实现 Robot 接口，并在 MCP 服务器层集成设备发现和路由逻辑。


## 实施计划

### Step 1: 新增 `src/harmony.ts`

新建文件，包含 `HarmonyRobot`（实现 `Robot` 接口）和 `HarmonyDeviceManager`（设备发现）两个类。

**HarmonyDeviceManager**：
- `getHdcPath()`: 拼接 `$HDC_SDK_PATH/hdc`，环境变量不存在则回退到 PATH 中的 `hdc`
- `hdc(...args)`: 封装 `execFileSync` 调用 hdc，参考 `AndroidRobot.adb()` 的模式
- `getConnectedDevices()`: 执行 `hdc list targets`，按行分割返回设备 ID 列表（过滤空行和 `[Empty]`）
- `getConnectedDevicesWithDetails()`: 对每个设备执行 `hdc -t {id} shell param get const.product.name` 和 `hdc -t {id} shell param get const.product.software.version`

**HarmonyRobot implements Robot**：

所有 hdc 命令通过 `-t {deviceId}` 指定设备。各方法实现：

| Robot 方法 | hdc 命令 |
|-----------|---------|
| `getScreenSize()` | `hdc -t {id} shell hidumper -s DisplayManagerService -a -a`，正则提取 `VirtualWidth` 和 `VirtualHeight`，scale=1 |
| `tap(x, y)` | `hdc -t {id} shell uitest uiInput click {x} {y}` |
| `doubleTap(x, y)` | `hdc -t {id} shell uitest uiInput doubleClick {x} {y}` |
| `longPress(x, y, duration)` | `hdc -t {id} shell uitest uiInput longClick {x} {y}`（hdc 不支持自定义 duration，忽略该参数） |
| `swipe(direction)` | 根据方向和屏幕尺寸计算起止坐标，`hdc -t {id} shell uitest uiInput swipe {x0} {y0} {x1} {y1} {speed}` |
| `swipeFromCoordinate(x, y, dir, dist)` | 同上，以传入坐标为起点 |
| `getScreenshot()` | 1) `hdc -t {id} shell snapshot_display -f /data/local/tmp/screenshot.jpeg` 2) `hdc -t {id} file recv /data/local/tmp/screenshot.jpeg {本地临时文件}` 3) 读取为 Buffer 4) 清理本地和设备端临时文件 |
| `sendKeys(text)` | 先通过 `getElementsOnScreen()` 查找 focused 元素获取坐标（未找到则用屏幕中心），然后 `hdc -t {id} shell uitest uiInput inputText {x} {y} {text}` |
| `pressButton(button)` | `hdc -t {id} shell uitest uiInput keyEvent {name}`，映射：HOME->Home, BACK->Back, ENTER->Enter 等 |
| `listApps()` | `hdc -t {id} shell bm dump -a`，解析输出提取 bundleName 列表 |
| `launchApp(packageName)` | 1) `hdc -t {id} shell aa dump -l` 获取 main abilityName 2) `hdc -t {id} shell aa start -a {ability} -b {packageName}` |
| `terminateApp(packageName)` | `hdc -t {id} shell aa force-stop {packageName}` |
| `installApp(path)` | `hdc -t {id} install -r {path}` |
| `uninstallApp(bundleId)` | `hdc -t {id} uninstall {bundleId}` |
| `openUrl(url)` | `hdc -t {id} shell aa start -U {url}` |
| `getElementsOnScreen()` | 见 Step 2 |
| `getOrientation()` | `hdc -t {id} shell hidumper -s DisplayManagerService -a -a`，正则提取 `ScreenRotation`，0/180->portrait，90/270->landscape |
| `setOrientation()` | 抛出 `ActionableError("HarmonyOS does not support programmatic orientation changes")` |

### Step 2: 实现 dumpLayout JSON 解析

在 `HarmonyRobot` 中实现 `getElementsOnScreen()`：

1. 执行 `hdc -t {id} shell uitest dumpLayout -p /data/local/tmp`
2. 从命令输出中提取生成的 JSON 文件名（如 `layout_407568854.json`）
3. `hdc -t {id} file recv /data/local/tmp/{filename} {本地临时文件}`
4. 读取并解析 JSON

**JSON 结构**（用户已确认）：
```json
{
  "attributes": {
    "bounds": "[left,top][right,bottom]",
    "text": "",
    "type": "",
    "description": "",
    "focused": "",
    "clickable": "",
    "id": "",
    "key": ""
  },
  "children": [...]
}
```

**解析逻辑**：
- 递归遍历 `children` 树
- 解析 `bounds` 字段 `"[left,top][right,bottom]"` -> `ScreenElementRect { x, y, width, height }`
- 映射字段：`text` -> `text`，`description` -> `label`，`type` -> `type`，`id` -> `identifier`
- 过滤条件：只保留有 `text` 或 `description` 的元素，且尺寸 > 0
- `focused` 字段为 `"true"` 时设置 `focused: true`
- 清理临时文件

### Step 3: 修改 `src/server.ts` — 集成设备路由和发现

**3.1 新增 import**：
```typescript
import { HarmonyRobot, HarmonyDeviceManager } from "./harmony";
```

**3.2 扩展 `MobilecliDevice.platform` 类型**：
```
"android" | "ios" -> "android" | "ios" | "harmony"
```

**3.3 修改 `getRobotFromDevice`**：
在 Android 检查之后、mobilecli 模拟器检查之前，新增 HarmonyOS 设备检查（try-catch 包裹，hdc 不可用时静默跳过）

**3.4 修改 `mobile_list_available_devices`**：
在 iOS 模拟器发现之后新增 HarmonyOS 设备发现（try-catch 包裹，hdc 不可用时静默跳过），`platform: "harmony"`, `type: "real"`

### Step 4: 修改 `src/server.ts` — 截图格式兼容

在 `mobile_take_screenshot` 工具中：
- 检测截图 Buffer 文件头：JPEG (`FF D8 FF`) vs PNG (`89 50 4E 47`)
- JPEG：跳过 PNG 验证，直接使用，mimeType 设为 `image/jpeg`
- PNG：保持现有逻辑不变
- JPEG 截图仍可通过 ImageMagick/Sips 进行缩放

### Step 5: 编译验证

```bash
# 编译
npm run build

# 代码规范检查
npm run lint

# 启动测试
npx ts-node src/index.ts --port 3000
```


updateAtTime: 2026/2/13 14:48:16

planId: 7b3430a1-d28f-4aeb-85c2-aca64ad161f7