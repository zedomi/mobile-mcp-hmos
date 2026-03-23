import { ActionableError } from "./robot";
import { trace } from "./logger";
import * as https from "node:https";

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

		const requestBody = JSON.stringify({
			model: GLM_OCR_MODEL,
			file: dataUri,
		});

		const responseBody = await this.httpPost(GLM_OCR_API_URL, requestBody);

		const json = JSON.parse(responseBody) as GlmOcrResponse;

		if (!json.layout_details || json.layout_details.length === 0 || !json.layout_details[0]) {
			trace("GLM-OCR: no layout details returned");
			return [];
		}

		const details = json.layout_details[0];
		trace(`GLM-OCR: recognized ${details.length} layout elements (tokens: ${json.usage?.total_tokens ?? "unknown"})`);
		return details;
	}

	private httpPost(url: string, body: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const parsedUrl = new URL(url);

			const req = https.request(
				{
					hostname: parsedUrl.hostname,
					port: parsedUrl.port || 443,
					path: parsedUrl.pathname,
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						"Authorization": this.apiKey,
						"Content-Length": Buffer.byteLength(body),
					},
					timeout: REQUEST_TIMEOUT_MS,
				},
				res => {
					const chunks: Buffer[] = [];
					res.on("data", (chunk: Buffer) => chunks.push(chunk));
					res.on("end", () => {
						const responseBody = Buffer.concat(chunks).toString("utf-8");
						const statusCode = res.statusCode ?? 0;

						if (statusCode === 401 || statusCode === 403) {
							reject(new ActionableError("GLM-OCR API authentication failed. Please check your --zhipuai-api-key parameter"));
							return;
						}

						if (statusCode === 429) {
							reject(new ActionableError("GLM-OCR API rate limit exceeded. Please try again later"));
							return;
						}

						if (statusCode < 200 || statusCode >= 300) {
							reject(new Error(`GLM-OCR API returned HTTP ${statusCode}: ${responseBody}`));
							return;
						}

						resolve(responseBody);
					});
				}
			);

			req.on("error", err => reject(new Error(`GLM-OCR API request failed: ${err.message}`)));
			req.on("timeout", () => {
				req.destroy();
				reject(new Error(`GLM-OCR API request timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
			});

			req.write(body);
			req.end();
		});
	}
}
