// Smoke test: boots the built server over stdio, performs the MCP handshake,
// and verifies the read-only tool set. No real eToro credentials are needed
// (the assertions fail before any network call).
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
        let message;
        try {
          message = JSON.parse(line);
        } catch {
          fail(new Error(`server wrote non-JSON to stdout (breaks the stdio protocol): ${line}`));
          return;
        }
        if (message.id !== undefined && pending.has(message.id)) {
          const { res, rej } = pending.get(message.id);
          pending.delete(message.id);
          message.error ? rej(new Error(JSON.stringify(message.error))) : res(message.result);
        }
      }
    });
    child.on("error", fail);

    const callTool = (name, args) => send("tools/call", args === undefined ? { name } : { name, arguments: args });

    (async () => {
      const init = await send("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      });
      await send("notifications/initialized", undefined, false);
      const list = await send("tools/list", {});
      // Exercise the tool-execution path (offline-safe — these fail before any network call).
      const quotesEmpty = await callTool("get_quotes", {});
      const tradeHistoryBad = await callTool("get_trade_history", { page: "not-a-number" });
      const accountNoArgs = await callTool("get_account_info"); // 'arguments' field omitted entirely
      clearTimeout(timer);
      child.kill();
      resolve({
        serverInfo: init.serverInfo,
        tools: list.tools.map((t) => t.name).sort(),
        annotations: Object.fromEntries(list.tools.map((t) => [t.name, t.annotations])),
        quotesEmpty,
        tradeHistoryBad,
        accountNoArgs,
      });
    })().catch(fail);
  });
}

function expectStartupFailure(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/index.js"], { env: { ...process.env, ...env }, stdio: ["pipe", "pipe", "pipe"] });
    const stderr = [];
    child.stderr.on("data", (d) => stderr.push(d));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("server did not exit despite missing credentials"));
    }, 10_000);
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code !== 1) return reject(new Error(`expected exit code 1, got ${code}`));
      const text = stderr.join("");
      if (!text.includes("missing credentials")) {
        return reject(new Error(`expected a 'missing credentials' message on stderr, got: ${text}`));
      }
      resolve();
    });
  });
}

// 1. Read-only connector: exactly the read tools, all marked read-only, no write tools.
const readOnlyRun = await runServer({});
strictEqual(readOnlyRun.serverInfo.name, "etoro-connector");
deepStrictEqual(readOnlyRun.tools, READ_TOOLS);
for (const name of WRITE_TOOLS) {
  if (readOnlyRun.tools.includes(name)) {
    throw new Error(`read-only connector must not expose the trading tool "${name}"`);
  }
}
for (const [name, annotations] of Object.entries(readOnlyRun.annotations)) {
  strictEqual(annotations?.readOnlyHint, true, `${name} must be readOnlyHint: true`);
}
console.log(`PASS read-only mode: ${readOnlyRun.tools.length} tools, all readOnlyHint, no trading tools`);

// 1a. Tool-execution path (offline-safe): handler error + zod validation + arguments-omitted.
strictEqual(readOnlyRun.quotesEmpty.isError, true, "get_quotes with {} must return isError");
strictEqual(readOnlyRun.quotesEmpty.content[0].type, "text", "error result must be a text block");
strictEqual(
  readOnlyRun.quotesEmpty.content[0].text,
  "Provide at least one of symbols or instrument_ids.",
  "get_quotes with {} must return the guard message",
);
strictEqual(readOnlyRun.tradeHistoryBad.isError, true, "get_trade_history with bad page must error");
if (!readOnlyRun.tradeHistoryBad.content[0].text.includes("Input validation error")) {
  throw new Error(`expected a validation error, got: ${readOnlyRun.tradeHistoryBad.content[0].text}`);
}
// A tool with no inputSchema must accept a call that omits the 'arguments' field
// (it then fails on the fake API key, not on input validation).
if (readOnlyRun.accountNoArgs.content[0].text.includes("Input validation error")) {
  throw new Error("get_account_info rejected a call with 'arguments' omitted — should accept it");
}
console.log("PASS tool execution: handler errors, zod validation, and arguments-omitted all behave");

// 2. Missing credentials: server must refuse to start.
await expectStartupFailure({ ETORO_API_KEY: "", ETORO_USER_KEY: "" });
console.log("PASS missing credentials: server exits with code 1");

console.log("Smoke test passed.");
