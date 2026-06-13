# eToro Portfolio Connector for Claude (Unofficial, read-only)

A [Claude Desktop extension](https://claude.com/docs/connectors/building/mcpb) (MCP server) that connects Claude to your [eToro](https://www.etoro.com) account through eToro's official [public API](https://api-portal.etoro.com/). Ask Claude about your portfolio, P&L, balances, watchlists, live prices, and price history.

This is a **read-only** connector: it can view your account and market data but **cannot place, close, or cancel any trades** — there are no trade-execution tools at all. (A trading-capable version is kept on the `with-trading` git branch.)

> **Disclaimer:** This is an unofficial, community-built connector. It is not affiliated with, endorsed by, or supported by eToro. Nothing it produces is financial advice.

## Features

All tools are read-only and work with a **Read-permission** eToro key:

| Tool | What it does |
|---|---|
| `get_account_info` | Account identity, API key scopes, connector configuration |
| `get_portfolio_summary` | Equity, available cash, used margin, current P&L, per-instrument exposure |
| `get_positions` | Open positions (entry rate, amount, units, leverage, SL/TP) with instrument names |
| `get_pnl` | Unrealized P&L per position with current close rates |
| `get_balances` | Cash balances across eToro account types (real account only; not available in demo mode) |
| `get_trade_history` | Closed trades: profit, fees, open/close rates and times |
| `search_instruments` | Find stocks, ETFs, crypto, currencies, indices, commodities |
| `get_quotes` | Live bid/ask for up to 100 instruments |
| `get_price_history` | OHLCV candles, 1-minute to 1-week intervals |
| `get_watchlists` | Your watchlists and the instruments they contain |
| `check_trade_eligibility` | Allowed leverage, minimum amounts, SL/TP limits per instrument (informational) |
| `get_order_status` | Status of an order you previously submitted via the eToro app or website |

Both real and **demo (virtual)** eToro accounts are supported — flip *Demo mode* in the settings and use a Demo-environment key.

## Getting your eToro API keys

1. Log in to [etoro.com](https://www.etoro.com) (your account must be verified).
2. Go to **Settings → Trading → API Key Management** and click **Create New Key**.
3. Choose:
   - **Environment**: *Real* or *Demo* — a key works for exactly one environment.
   - **Permissions**: **Read** is all this connector needs.
   - Optionally an IP whitelist and an expiration date.
4. Confirm via SMS, then copy both values from the Generated Keys list:
   - **API key** (public key, sent as `x-api-key`)
   - **User key** (private key, sent as `x-user-key`)

**Recommendation:** a *Read* key is sufficient — this connector never trades, so there is no reason to give it a Write key.

## Installation (Claude Desktop)

1. Download `etoro-mcp-connector.mcpb` from the [releases page](https://github.com/pdhimate/etoro-mcp-connector/releases) (or build it yourself, below).
2. Double-click the file, or in Claude Desktop go to **Settings → Extensions → Install Extension…** and pick it.
3. Enter your API key and User key, and toggle *Demo mode* if your key is for the Demo environment. Keys are stored in your operating system's keychain.
4. Ask Claude something like *"What's in my eToro portfolio right now?"*

## Building from source

Requires Node.js ≥ 18.

```bash
npm install
npm run build      # compiles TypeScript to dist/
npm run smoke      # boots the server over stdio and verifies the tools

# Build the installable bundle (build + smoke + prune dev deps + pack):
npm run pack:mcpb  # produces etoro-mcp-connector.mcpb
```

## Security notes

- Your keys are sent **only** to eToro's official API endpoint, `https://public-api.etoro.com`, as the `x-api-key` / `x-user-key` headers eToro's documentation specifies. There is no other network traffic, no telemetry, and no local persistence of any account data.
- This connector is **read-only**: every tool is annotated `readOnlyHint` and the server contains no order placement, closing, or cancellation code. Even a Write-permission key cannot trade through it. For extra safety, use a Read-only key.
- eToro rate-limits keys to roughly 60 requests per minute; the connector retries politely on 429 responses.

## Privacy Policy

This extension runs entirely on your machine. It does not collect, store, or transmit any personal data to anyone other than eToro itself (your API requests) — see [PRIVACY.md](./PRIVACY.md) for the full policy.

## License

[MIT](./LICENSE)
