#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EtoroClient } from "./etoroClient.js";
import { registerTools } from "./tools.js";

const SERVER_VERSION = "0.1.0";

function envFlag(name: string): boolean {
  const value = (process.env[name] ?? "").trim().toLowerCase();
  return value === "true" || value === "1" || value === "yes" || value === "on";
}

const apiKey = (process.env.ETORO_API_KEY ?? "").trim();
const userKey = (process.env.ETORO_USER_KEY ?? "").trim();
const demo = envFlag("ETORO_DEMO_MODE");
const tradingEnabled = envFlag("ETORO_ENABLE_TRADING");

if (!apiKey || !userKey) {
  console.error(
    "eToro connector: missing credentials. Set both the API key (public key) and User key (private key) " +
      "in the extension settings. Keys are created on etoro.com under Settings > Trading > API Key Management.",
  );
  process.exit(1);
}

const server = new McpServer({ name: "etoro-connector", version: SERVER_VERSION });

registerTools(server, new EtoroClient({ apiKey, userKey, demo }), tradingEnabled);

const transport = new StdioServerTransport();
await server.connect(transport);

// stdout carries the MCP protocol; all logging goes to stderr.
console.error(
  `eToro MCP connector ${SERVER_VERSION} started — environment: ${demo ? "demo" : "real"}, trading tools: ${
    tradingEnabled ? "enabled" : "disabled"
  }.`,
);
