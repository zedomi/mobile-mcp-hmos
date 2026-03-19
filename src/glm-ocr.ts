import { ActionableError } from "./robot";
import { trace } from "./logger";

const GLM_OCR_API_URL = "https://open.bigmodel.cn/api/paas/v4/layout_parsing";
const GLM_OCR_MODEL = "glm-ocr";
const REQUEST_TIMEOUT_MS = 30_000;

export interface GlmOcrLayoutDetail {
	index: number;
	label: string;
	bbox_2d: [number, number, number, number];
	content: string | null;
	height: number;
	width: number;
	native_label: string;
}

interface GlmOcrResponse {
	id: string;
	model: string;
	md_results: string;
	layout_details: GlmOcrLayoutDetail[][];
	data_info: {
		num_pages: number;
		pages: Array<{ width: number; height: number }>;
	};
	usage: {
		completion_tokens: number;
		prompt_tokens: number;
		total_tokens: number;
	};
}

export class GlmOcrClient {
	private apiKey: string;

	constructor(apiKey: string) {
		this.apiKey = apiKey;
	}

	public async parseLayout(imageBuffer: Buffer): Promise<GlmOcrLayoutDetail[]> {
		const isJpeg = imageBuffer.length >= 3
			&& imageBuffer[0] === 0xFF
			&& imageBuffer[1] === 0xD8
			&& imageBuffer[2] === 0xFF;

		const mimeType = isJpeg ? "image/jpeg" : "image/png";
		const base64Data = imageBuffer.toString("base64");
		const dataUri = `data:${mimeType};base64,${base64Data}`;

		trace(`GLM-OCR: sending ${mimeType} image (${imageBuffer.length} bytes)`);

		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

		try {
			const response = await fetch(GLM_OCR_API_URL, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Authorization": this.apiKey,
				},
				body: JSON.stringify({
					model: GLM_OCR_MODEL,
					file: dataUri,
				}),
				signal: controller.signal,
			});

			if (response.status === 401 || response.status === 403) {
				throw new ActionableError("GLM-OCR API authentication failed. Please check your --zhipuai-api-key parameter");
			}

			if (response.status === 429) {
				throw new ActionableError("GLM-OCR API rate limit exceeded. Please try again later");
			}

			if (!response.ok) {
				const body = await response.text();
				throw new Error(`GLM-OCR API returned HTTP ${response.status}: ${body}`);
			}

			const json = await response.json() as GlmOcrResponse;

			if (!json.layout_details || json.layout_details.length === 0 || !json.layout_details[0]) {
				trace("GLM-OCR: no layout details returned");
				return [];
			}

			const details = json.layout_details[0];
			trace(`GLM-OCR: recognized ${details.length} layout elements (tokens: ${json.usage?.total_tokens ?? "unknown"})`);
			return details;
		} catch (err: any) {
			if (err.name === "AbortError") {
				throw new Error(`GLM-OCR API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
			}
			throw err;
		} finally {
			clearTimeout(timeout);
		}
	}
}
