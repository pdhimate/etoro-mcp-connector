# eToro Connector for Claude (Unofficial)

A [Claude Desktop extension](https://claude.com/docs/connectors/building/mcpb) (MCP server) that connects Claude to your [eToro](https://www.etoro.com) account through eToro's official [public API](https://api-portal.etoro.com/). Ask Claude about your portfolio, P&L, balances, watchlists, live prices, and price history — and, if you explicitly enable it, place and close trades.

> **Disclaimer:** This is an unofficial, community-built connector. It is not affiliated with, endorsed by, or supported by eToro. Nothing it produces is financial advice. Trading involves risk of loss — review every trade before approving it.

## Features

**Read-only tools** (work with a Read-permission key):

| Tool | What it does |
|---|---|
| `get_account_info` | Account identity, API key scopes, connector configuration |
| `get_portfolio_summary` | Equity, available cash, used margin, current P&L, per-instrument exposure |
| `get_positions` | Open positions (entry rate, amount, units, leverage, SL/TP) with instrument names |
| `get_pnl` | Unrealized P&L per position with current close rates |
| `get_balances` | Cash balances across eToro account types |
| `get_trade_history` | Closed trades: profit, fees, open/close rates and times |
| `search_instruments` | Find stocks, ETFs, crypto, currencies, indices, commodities |
| `get_quotes` | Live bid/ask for up to 100 instruments |
| `get_price_history` | OHLCV candles, 1-minute to 1-week intervals |
| `get_watchlists` | Your watchlists and their instruments |
| `check_trade_eligibility` | Allowed leverage, minimum amounts, SL/TP limits per instrument |
| `get_order_status` | Execution status of a submitted order |

**Trading tools** (only appear when *Enable trading tools* is switched on in the extension settings, and require a Write-permission key):

| Tool | What it does |
|---|---|
| `place_order` | Open a long (`buy`) or short (`sellShort`) position by cash amount or units, market or market-if-touched, with optional leverage / stop loss / take profit |
| `close_position` | Close an open position fully or partially at market |
| `cancel_order` | Cancel a pending, not-yet-executed order |

Both real and **demo (virtual)** eToro accounts are supported — flip *Demo mode* in the settings and use a Demo-environment key.

## Getting your eToro API keys

1. Log in to [etoro.com](https://www.etoro.com) (your account must be verified).
2. Go to **Settings → Trading → API Key Management** and click **Create New Key**.
3. Choose:
   - **Environment**: *Real* or *Demo* — a key works for exactly one environment.
   - **Permissions**: *Read* (portfolio + market data) or *Write* (also allows trading).
   - Optionally an IP whitelist and an expiration date.
4. Confirm via SMS, then copy both values from the Generated Keys list:
   - **API key** (public key, sent as `x-api-key`)
   - **User key** (private key, sent as `x-user-key`)

**Recommendation:** start with a *Read* key. Only create a *Write* key if you want Claude to execute trades, and consider trying *Demo* mode first.

## Installation (Claude Desktop)

1. Download `etoro-mcp-connector.mcpb` from the [releases page](https://github.com/pdhimate/etoro-mcp-connector/releases) (or build it yourself, below).
2. Double-click the file, or in Claude Desktop go to **Settings → Extensions → Install Extension…** and pick it.
3. Enter your API key and User key, and toggle *Demo mode* / *Enable trading tools* as desired. Keys are stored in your operating system's keychain.
4. Ask Claude something like *"What's in my eToro portfolio right now?"*

## Building from source

Requires Node.js ≥ 18.

```bash
npm install
npm run build      # compiles TypeScript to dist/
npm run smoke      # boots the server over stdio and verifies the tool list
npm install --omit=dev          # slim node_modules for packaging
npx @anthropic-ai/mcpb pack . etoro-mcp-connector.mcpb
```

## Security notes

- Your keys are sent **only** to eToro's official API endpoint, `https://public-api.etoro.com`, as the `x-api-key` / `x-user-key` headers eToro's documentation specifies. There is no other network traffic, no telemetry, and no local persistence of any account data.
- Trading tools are opt-in twice over: they only exist when you enable them in settings **and** eToro only accepts the calls if your key was created with Write permission.
- Claude Desktop additionally asks for your approval before any tool call that places, closes, or cancels an order (these tools are marked `destructiveHint`).
- eToro rate-limits keys to roughly 60 read / 20 write requests per minute; the connector retries politely on 429 responses.

## Privacy Policy

This extension runs entirely on your machine. It does not collect, store, or transmit any personal data to anyone other than eToro itself (your API requests) — see [PRIVACY.md](./PRIVACY.md) for the full policy.

## License

[MIT](./LICENSE)
