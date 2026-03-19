#!/usr/bin/env node
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer, getAgentVersion, McpServerConfig } from "./server";
import { error } from "./logger";
import express from "express";
import { program } from "commander";

const startSseServer = async (port: number, config?: McpServerConfig) => {
	const app = express();
	const server = createMcpServer(config);

	let transport: SSEServerTransport | null = null;

	app.post("/mcp", (req, res) => {
		if (transport) {
			transport.handlePostMessage(req, res);
		}
	});

	app.get("/mcp", (req, res) => {
		if (transport) {
			transport.close();
		}

		transport = new SSEServerTransport("/mcp", res);
		server.connect(transport);
	});

	app.listen(port, () => {
		error(`mobile-mcp ${getAgentVersion()} sse server listening on http://localhost:${port}/mcp`);
	});
};

const startStdioServer = async (config?: McpServerConfig) => {
	try {
		const transport = new StdioServerTransport();

		const server = createMcpServer(config);
		await server.connect(transport);

		error("mobile-mcp server running on stdio");
	} catch (err: any) {
		console.error("Fatal error in main():", err);
		error("Fatal error in main(): " + JSON.stringify(err.stack));
		process.exit(1);
	}
};

const main = async () => {
	program
		.version(getAgentVersion())
		.option("--port <port>", "Start SSE server on this port")
		.option("--stdio", "Start stdio server (default)")
		.option("--zhipuai-api-key <key>", "ZhipuAI API key for GLM-OCR screen element recognition")
		.parse(process.argv);

	const options = program.opts();
	const config: McpServerConfig = {
		zhipuaiApiKey: options.zhipuaiApiKey,
	};

	if (options.port) {
		await startSseServer(+options.port, config);
	} else {
		await startStdioServer(config);
	}
};

main().then();
