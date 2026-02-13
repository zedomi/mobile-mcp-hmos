import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { execFileSync } from "node:child_process";

import { ActionableError, Button, InstalledApp, Orientation, Robot, ScreenElement, ScreenElementRect, ScreenSize, SwipeDirection } from "./robot";
import { trace } from "./logger";

const TIMEOUT = 30000;
const MAX_BUFFER_SIZE = 1024 * 1024 * 4;

const getHdcPath = (): string => {
	if (process.env.HDC_SDK_PATH) {
		return path.join(process.env.HDC_SDK_PATH, "hdc");
	}

	return "hdc";
};

const BUTTON_MAP: Record<string, string> = {
	"HOME": "Home",
	"BACK": "Back",
	"ENTER": "Enter",
	"VOLUME_UP": "VolumeUp",
	"VOLUME_DOWN": "VolumeDown",
};

interface HarmonyLayoutNode {
	attributes: {
		bounds?: string;
		text?: string;
		type?: string;
		description?: string;
		hint?: string;
		focused?: string;
		clickable?: string;
		id?: string;
		key?: string;
	};
	children?: HarmonyLayoutNode[];
}

export class HarmonyRobot implements Robot {

	public constructor(private deviceId: string) {
	}

	public hdc(...args: string[]): Buffer {
		return execFileSync(getHdcPath(), ["-t", this.deviceId, ...args], {
			maxBuffer: MAX_BUFFER_SIZE,
			timeout: TIMEOUT,
		});
	}

	public async getScreenSize(): Promise<ScreenSize> {
		const output = this.hdc("shell", "hidumper", "-s", "DisplayManagerService", "-a", "-a").toString();
		const widthMatch = output.match(/VirtualWidth\s*[:=]\s*(\d+)/i);
		const heightMatch = output.match(/VirtualHeight\s*[:=]\s*(\d+)/i);

		if (!widthMatch || !heightMatch) {
			throw new Error("Failed to get screen size from HarmonyOS device");
		}

		return {
			width: parseInt(widthMatch[1], 10),
			height: parseInt(heightMatch[1], 10),
			scale: 1,
		};
	}

	public async tap(x: number, y: number): Promise<void> {
		this.hdc("shell", "uitest", "uiInput", "click", `${x}`, `${y}`);
	}

	public async doubleTap(x: number, y: number): Promise<void> {
		this.hdc("shell", "uitest", "uiInput", "doubleClick", `${x}`, `${y}`);
	}

	public async longPress(x: number, y: number, _duration: number): Promise<void> {
		this.hdc("shell", "uitest", "uiInput", "longClick", `${x}`, `${y}`);
	}

	public async swipe(direction: SwipeDirection): Promise<void> {
		const screenSize = await this.getScreenSize();
		const centerX = screenSize.width >> 1;
		const centerY = screenSize.height >> 1;

		let x0: number, y0: number, x1: number, y1: number;

		switch (direction) {
			case "up":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.70);
				y1 = Math.floor(screenSize.height * 0.30);
				break;
			case "down":
				x0 = x1 = centerX;
				y0 = Math.floor(screenSize.height * 0.30);
				y1 = Math.floor(screenSize.height * 0.70);
				break;
			case "left":
				x0 = Math.floor(screenSize.width * 0.70);
				x1 = Math.floor(screenSize.width * 0.30);
				y0 = y1 = centerY;
				break;
			case "right":
				x0 = Math.floor(screenSize.width * 0.30);
				x1 = Math.floor(screenSize.width * 0.70);
				y0 = y1 = centerY;
				break;
			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		trace(`[HarmonyRobot.swipe] direction=${direction}, screenSize=${screenSize.width}x${screenSize.height}, from=(${x0},${y0}) to=(${x1},${y1})`);
		this.hdc("shell", "uitest", "uiInput", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "60");
	}

	public async swipeFromCoordinate(x: number, y: number, direction: SwipeDirection, distance?: number): Promise<void> {
		// return this.swipe(direction);
		const screenSize = await this.getScreenSize();

		const defaultDistanceY = Math.floor(screenSize.height * 0.3);
		const defaultDistanceX = Math.floor(screenSize.width * 0.3);
		const swipeDistanceY = distance || defaultDistanceY;
		const swipeDistanceX = distance || defaultDistanceX;

		let x0: number, y0: number, x1: number, y1: number;

		switch (direction) {
			case "up":
				x0 = x1 = x;
				y0 = y;
				y1 = Math.max(0, y - swipeDistanceY);
				break;
			case "down":
				x0 = x1 = x;
				y0 = y;
				y1 = Math.min(screenSize.height, y + swipeDistanceY);
				break;
			case "left":
				x0 = x;
				x1 = Math.max(0, x - swipeDistanceX);
				y0 = y1 = y;
				break;
			case "right":
				x0 = x;
				x1 = Math.min(screenSize.width, x + swipeDistanceX);
				y0 = y1 = y;
				break;
			default:
				throw new ActionableError(`Swipe direction "${direction}" is not supported`);
		}

		trace(`[HarmonyRobot.swipeFromCoordinate] direction=${direction}, distance=${distance}, screenSize=${screenSize.width}x${screenSize.height}, from=(${x0},${y0}) to=(${x1},${y1})`);
		this.hdc("shell", "uitest", "uiInput", "swipe", `${x0}`, `${y0}`, `${x1}`, `${y1}`, "600");
	}

	public async getScreenshot(): Promise<Buffer> {
		const remotePath = "/data/local/tmp/screenshot.jpeg";
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harmony-screenshot-"));
		const localPath = path.join(tempDir, "screenshot.jpeg");

		try {
			this.hdc("shell", "snapshot_display", "-f", remotePath);
			this.hdc("file", "recv", remotePath, localPath);

			const buffer = fs.readFileSync(localPath);
			return buffer;
		} finally {
			try {
				this.hdc("shell", "rm", "-f", remotePath);
			} catch {
				// ignore cleanup errors on device
			}
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// ignore local cleanup errors
			}
		}
	}

	public async sendKeys(text: string): Promise<void> {
		if (text === "") {
			return;
		}

		let targetX: number;
		let targetY: number;

		try {
			const elements = await this.getElementsOnScreen();
			const focusedElement = elements.find(element => element.focused);
			if (focusedElement) {
				targetX = focusedElement.rect.x + Math.floor(focusedElement.rect.width / 2);
				targetY = focusedElement.rect.y + Math.floor(focusedElement.rect.height / 2);
			} else {
				const screenSize = await this.getScreenSize();
				targetX = screenSize.width >> 1;
				targetY = screenSize.height >> 1;
			}
		} catch {
			const screenSize = await this.getScreenSize();
			targetX = screenSize.width >> 1;
			targetY = screenSize.height >> 1;
		}

		this.hdc("shell", "uitest", "uiInput", "inputText", `${targetX}`, `${targetY}`, text);
	}

	public async pressButton(button: Button): Promise<void> {
		const mapped = BUTTON_MAP[button];
		if (!mapped) {
			throw new ActionableError(`Button "${button}" is not supported on HarmonyOS`);
		}

		this.hdc("shell", "uitest", "uiInput", "keyEvent", mapped);
	}

	public async listApps(): Promise<InstalledApp[]> {
		const output = this.hdc("shell", "bm", "dump", "-a").toString();
		const bundleNames = output
			.split("\n")
			.map(line => line.trim())
			.filter(line => line.length > 0 && !line.startsWith("[") && !line.startsWith("ID"));

		return bundleNames.map(bundleName => ({
			packageName: bundleName,
			appName: bundleName,
		}));
	}

	public async launchApp(packageName: string): Promise<void> {
		try {
			const dumpOutput = this.hdc("shell", "bm", "dump", "-n", packageName).toString();
			const dumpJson = JSON.parse(dumpOutput.substring(dumpOutput.indexOf("{")));

			let abilityName = "";
			const bundleName = dumpJson.applicationInfo?.bundleName || packageName;

			if (dumpJson.hapModuleInfos) {
				for (const moduleInfo of dumpJson.hapModuleInfos) {
					if (moduleInfo.mainAbility && moduleInfo.mainAbility.length > 0) {
						abilityName = moduleInfo.mainAbility;
						break;
					}
				}
			}

			if (!abilityName) {
				throw new ActionableError(`Could not find mainAbility for package "${packageName}"`);
			}

			this.hdc("shell", "aa", "start", "-a", abilityName, "-b", bundleName);
		} catch (error: any) {
			if (error instanceof ActionableError) {
				throw error;
			}
			throw new ActionableError(`Failed launching app with package name "${packageName}": ${error.message}`);
		}
	}

	public async terminateApp(packageName: string): Promise<void> {
		this.hdc("shell", "aa", "force-stop", packageName);
	}

	public async installApp(appPath: string): Promise<void> {
		try {
			this.hdc("install", "-r", appPath);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async uninstallApp(bundleId: string): Promise<void> {
		try {
			this.hdc("uninstall", bundleId);
		} catch (error: any) {
			const stdout = error.stdout ? error.stdout.toString() : "";
			const stderr = error.stderr ? error.stderr.toString() : "";
			const output = (stdout + stderr).trim();
			throw new ActionableError(output || error.message);
		}
	}

	public async openUrl(url: string): Promise<void> {
		this.hdc("shell", "aa", "start", "-U", url);
	}

	public async getElementsOnScreen(): Promise<ScreenElement[]> {
		const remoteFilePath = `/data/local/tmp/layout_${Date.now()}.json`;
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "harmony-layout-"));

		try {
			const dumpOutput = this.hdc("shell", "uitest", "dumpLayout", "-p", remoteFilePath).toString();

			if (dumpOutput.includes("failed") || dumpOutput.includes("Error")) {
				const savedMatch = dumpOutput.match(/saved to:\s*(\S+)/i);
				if (!savedMatch) {
					throw new Error("dumpLayout failed: " + dumpOutput.trim());
				}
			}

			const localFilename = path.basename(remoteFilePath);
			const localFilePath = path.join(tempDir, localFilename);

			this.hdc("file", "recv", remoteFilePath, localFilePath);

			const jsonContent = fs.readFileSync(localFilePath, "utf-8");
			const layoutTree: HarmonyLayoutNode = JSON.parse(jsonContent);

			const elements = this.collectElements(layoutTree);

			try {
				this.hdc("shell", "rm", "-f", remoteFilePath);
			} catch {
				// ignore cleanup errors
			}

			return elements;
		} finally {
			try {
				fs.rmSync(tempDir, { recursive: true, force: true });
			} catch {
				// ignore local cleanup errors
			}
		}
	}

	private collectElements(node: HarmonyLayoutNode): ScreenElement[] {
		const elements: ScreenElement[] = [];

		if (node.children) {
			for (const child of node.children) {
				elements.push(...this.collectElements(child));
			}
		}

		const attrs = node.attributes;
		if (!attrs) {
			return elements;
		}

		const hasText = attrs.text && attrs.text.length > 0;
		const hasDescription = attrs.description && attrs.description.length > 0;
		const hasHint = attrs.hint && attrs.hint.length > 0;

		if (!hasText && !hasDescription && !hasHint) {
			return elements;
		}

		const rect = this.parseBounds(attrs.bounds);
		if (!rect || rect.width <= 0 || rect.height <= 0) {
			return elements;
		}

		const element: ScreenElement = {
			type: attrs.type || "unknown",
			text: attrs.text || undefined,
			label: attrs.description || undefined,
			hint: attrs.hint || undefined,
			identifier: attrs.id || undefined,
			rect,
		};

		if (attrs.focused === "true") {
			element.focused = true;
		}

		elements.push(element);
		return elements;
	}

	private parseBounds(bounds?: string): ScreenElementRect | null {
		if (!bounds) {
			return null;
		}

		const match = bounds.match(/^\[(\d+),(\d+)\]\[(\d+),(\d+)\]$/);
		if (!match) {
			return null;
		}

		const left = parseInt(match[1], 10);
		const top = parseInt(match[2], 10);
		const right = parseInt(match[3], 10);
		const bottom = parseInt(match[4], 10);

		return {
			x: left,
			y: top,
			width: right - left,
			height: bottom - top,
		};
	}

	public async getOrientation(): Promise<Orientation> {
		const output = this.hdc("shell", "hidumper", "-s", "DisplayManagerService", "-a", "-a").toString();
		const rotationMatch = output.match(/ScreenRotation\s*[:=]\s*(\d+)/i);

		if (!rotationMatch) {
			return "portrait";
		}

		const rotation = parseInt(rotationMatch[1], 10);
		return (rotation === 90 || rotation === 270) ? "landscape" : "portrait";
	}

	public async setOrientation(_orientation: Orientation): Promise<void> {
		throw new ActionableError("HarmonyOS does not support programmatic orientation changes");
	}
}

export class HarmonyDeviceManager {

	public getConnectedDevices(): string[] {
		try {
			const output = execFileSync(getHdcPath(), ["list", "targets"], {
				timeout: TIMEOUT,
			}).toString();

			return output
				.split("\n")
				.map(line => line.trim())
				.filter(line => line.length > 0 && line !== "[Empty]");
		} catch {
			return [];
		}
	}

	public getConnectedDevicesWithDetails(): Array<{ deviceId: string; name: string; version: string }> {
		const deviceIds = this.getConnectedDevices();

		return deviceIds.map(deviceId => {
			let name = deviceId;
			let version = "unknown";

			try {
				name = execFileSync(getHdcPath(), ["-t", deviceId, "shell", "param", "get", "const.product.name"], {
					timeout: 5000,
				}).toString().trim();
			} catch {
				// fallback to deviceId
			}

			try {
				version = execFileSync(getHdcPath(), ["-t", deviceId, "shell", "param", "get", "const.product.software.version"], {
					timeout: 5000,
				}).toString().trim();
			} catch {
				// fallback to unknown
			}

			return { deviceId, name, version };
		});
	}
}
