# Privacy Policy — eToro Connector for Claude (Unofficial)

_Last updated: 13 June 2026_

## Summary

This extension is a local MCP server that runs entirely on your own computer inside Claude Desktop. **It collects nothing, stores nothing, and sends data nowhere except to eToro's official API.**

## What data the extension handles

- **eToro API credentials** (API key and User key): you provide these in the extension settings. Claude Desktop stores them in your operating system's secure keychain (macOS Keychain / Windows Credential Manager) because they are declared `sensitive` in the extension manifest. The extension only ever reads them from its environment at startup and attaches them as the `x-api-key` / `x-user-key` request headers required by [eToro's API documentation](https://api-portal.etoro.com/getting-started/authentication).
- **Your eToro account data** (portfolio, positions, balances, trade history, watchlists, quotes): fetched on demand from `https://public-api.etoro.com` and returned directly to Claude in your conversation. The extension keeps no copy; nothing is written to disk.
- **Trade instructions**: if (and only if) you enable trading tools and approve a tool call, the order details you requested are sent to eToro's trading endpoints.

## What the extension does NOT do

- No analytics, telemetry, or crash reporting.
- No storage of your credentials or account data outside the OS keychain managed by Claude Desktop.
- No network connections to any host other than `public-api.etoro.com`.
- No selling, sharing, or processing of your data by the extension author — the author never receives any of your data.

## Third parties

- **eToro**: your API requests are governed by [eToro's privacy policy](https://www.etoro.com/customer-service/privacy-eula/) and the API terms you accepted when creating your keys.
- **Anthropic / Claude**: data returned into your Claude conversation is handled per [Anthropic's privacy policy](https://www.anthropic.com/legal/privacy).

## Revoking access

Delete the key at etoro.com → Settings → Trading → API Key Management at any time; the connector immediately stops working. Uninstalling the extension removes the stored credentials from your keychain.

## Contact

Questions or concerns: open an issue at <https://github.com/pdhimate/etoro-mcp-connector/issues> or email <pdhimate@gmail.com>.
