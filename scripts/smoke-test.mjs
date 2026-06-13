// Smoke test: boots the built server over stdio, performs the MCP handshake,
// and verifies the tool list for both trading-disabled and trading-enabled
// configurations. No real eToro credentials are needed (no API calls made).
import { spawn } from "node:child_process";
import { deepStrictEqual, strictEqual } from "node:assert";

const READ_TOOLS = [
  "check_trade_eligibility",
  "get_account_info",
  "get_balances",
  "get_order_status",
  "get_pnl",
  "get_portfolio_summary",
  "get_positions",
  "get_price_history",
  "get_quotes",
  "get_trade_history",
  "get_watchlists",
  "search_instruments",
];
const WRITE_TOOLS = ["cancel_order", "close_position", "place_order"];

function runServer(extraEnv) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/index.js"], {
      env: { ...process.env, ETORO_API_KEY: "smoke-api-key", ETORO_USER_KEY: "smoke-user-key", ...extraEnv },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let buffer = "";
    let nextId = 1;
    const pending = new Map();
    const stderr = [];
    child.stderr.on("data", (d) => stderr.push(d));

    const fail = (err) => {
      clearTimeout(timer);
      child.kill();
      reject(new Error(`${err.message}\nstderr: ${stderr.join("")}`));
    };
    const timer = setTimeout(() => fail(new Error("smoke test timed out after 15s")), 15_000);

    const send = (method, params, expectReply = true) => {
      const id = expectReply ? nextId++ : undefined;
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...(id !== undefined && { id }), method, ...(params && { params }) }) + "\n");
      if (!expectReply) return Promise.resolve();
      return new Promise((res, rej) => pending.set(id, { res, rej }));
    };

    child.stdout.on("data", (data) => {
      buffer += data.toString();
      let newline;
      while ((newline = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        const message = JSON.parse(line);
        if (message.id !== undefined && pending.has(message.id)) {
          const { res, rej } = pending.get(message.id);
          pending.delete(message.id);
          message.error ? rej(new Error(JSON.stringify(message.error))) : res(message.result);
        }
      }
    });
    child.on("error", fail);

    (async () => {
      const init = await send("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      });
      await send("notifications/initialized", undefined, false);
      const list = await send("tools/list", {});
      clearTimeout(timer);
      child.kill();
      resolve({
        serverInfo: init.serverInfo,
        tools: list.tools.map((t) => t.name).sort(),
        annotations: Object.fromEntries(list.tools.map((t) => [t.name, t.annotations])),
      });
    })().catch(fail);
  });
}

function expectStartupFailure(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("server did not exit despite missing credentials"));
    }, 10_000);
    child.on("exit", (code) => {
      clearTimeout(timer);
      code === 1 ? resolve() : reject(new Error(`expected exit code 1, got ${code}`));
    });
  });
}

// 1. Trading disabled (default): only read tools, all marked read-only.
const readOnlyRun = await runServer({ ETORO_ENABLE_TRADING: "false" });
strictEqual(readOnlyRun.serverInfo.name, "etoro-connector");
deepStrictEqual(readOnlyRun.tools, READ_TOOLS);
for (const [name, annotations] of Object.entries(readOnlyRun.annotations)) {
  strictEqual(annotations?.readOnlyHint, true, `${name} must be readOnlyHint: true`);
}
console.log(`PASS read-only mode: ${readOnlyRun.tools.length} tools, all readOnlyHint`);

// 2. Trading enabled: read + write tools, write tools marked destructive.
const tradingRun = await runServer({ ETORO_ENABLE_TRADING: "true", ETORO_DEMO_MODE: "true" });
deepStrictEqual(tradingRun.tools, [...READ_TOOLS, ...WRITE_TOOLS].sort());
for (const name of WRITE_TOOLS) {
  strictEqual(tradingRun.annotations[name]?.destructiveHint, true, `${name} must be destructiveHint: true`);
  strictEqual(tradingRun.annotations[name]?.readOnlyHint, false, `${name} must be readOnlyHint: false`);
}
console.log(`PASS trading mode: ${tradingRun.tools.length} tools, write tools destructive`);

// 3. Missing credentials: server must refuse to start.
await expectStartupFailure({ ETORO_API_KEY: "", ETORO_USER_KEY: "" });
console.log("PASS missing credentials: server exits with code 1");

console.log("Smoke test passed.");
