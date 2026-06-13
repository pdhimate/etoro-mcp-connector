# Publishing this connector to the Claude marketplace

There are two official distribution paths (both reviewed by Anthropic, both listed in the Claude connectors directory). This project is built for **Path 1**, which is the right fit because users supply their own eToro API keys.

Official docs hub: <https://claude.com/docs/connectors/building>

## Path 1 — Claude Desktop Extension (.mcpb) — recommended

What ships: the `etoro-mcp-connector.mcpb` bundle produced by `mcpb pack` (a zip with `manifest.json`, `dist/`, and production `node_modules/`). Users single-click install it in Claude Desktop; no hosting needed; keys are stored in the OS keychain.

### Pre-submission checklist (Anthropic's review criteria)

- [x] Every tool has a `title` and a `readOnlyHint: true` **or** `destructiveHint: true` annotation matching its real behavior
- [x] Tool names ≤ 64 characters; descriptions match actual behavior
- [x] No tool mixes safe (GET) and unsafe (POST/DELETE) operations
- [x] Privacy policy: section in `README.md` **and** `privacy_policies` HTTPS URL in `manifest.json` ("missing or incomplete privacy policies result in immediate rejection")
- [x] `manifest.json` passes `npx @anthropic-ai/mcpb validate manifest.json`
- [ ] **Test the packed extension on both Windows and macOS** (required) — install the `.mcpb` in Claude Desktop on each OS and exercise the tools with a real key
- [ ] Test all tools with [MCP Inspector](https://github.com/modelcontextprotocol/inspector): `npx @modelcontextprotocol/inspector node dist/index.js` (set the four `ETORO_*` env vars)
- [ ] Push this repo to GitHub so the `privacy_policies` / `repository` / `support` URLs in `manifest.json` resolve (update the URLs if your repo name differs)

### Steps

1. **Create the GitHub repo** (e.g. `pdhimate/etoro-mcp-connector`), push, and confirm
   `https://github.com/pdhimate/etoro-mcp-connector/blob/main/PRIVACY.md` loads. Create a GitHub Release and attach `etoro-mcp-connector.mcpb` so users (and reviewers) can download it.
2. **Rebuild the bundle** if you changed anything:
   ```bash
   npm run pack:mcpb   # build + smoke test + prune dev deps + pack
   ```
3. **Test the bundle yourself** on Windows and macOS: double-click the `.mcpb` (or Claude Desktop → Settings → Extensions → Install Extension…), enter a **demo** eToro key first, and try: portfolio summary, a quote, a search, and (with trading enabled on a demo Write key) a small order.
4. **Submit** via Anthropic's desktop-extension submission form:
   **<https://clau.de/desktop-extention-submission>** (yes, "extention" — that's the official short link; it redirects to a Google Form).
   You'll be asked for the extension details, download link, and privacy policy. Mention explicitly that trading tools are opt-in (off by default), annotated `destructiveHint`, and require the user's own Write-permission eToro key.
5. **Wait for review.** Reviewers functionally test every tool; consider including instructions for creating a **demo-environment** eToro key so they can test without real money. Review time varies with queue volume; escalations: <mcp-review@anthropic.com>.

### Heads-up for review

- Anthropic's criteria list "money transfers" as an unsupported category. Brokerage **trading on the user's own account with the user's own keys** is a different thing from money transfer, and the read-only default + opt-in trading flag is designed to make that boundary clear — but be prepared for extra scrutiny of `place_order`/`close_position`/`cancel_order`. If the trading tools block approval, submit a read-only build first (set `enable_trading` aside) and add trading in a later version.
- The connector calls eToro's API rather than "your own first-party API". This is the standard pattern for user-supplied-credential desktop extensions (the directory contains many such community connectors), but state it plainly in the submission form.

## Path 2 — Remote MCP server in the connectors directory (optional, later)

For a listing that works on claude.ai (web) and mobile too, you'd host this server yourself with Streamable HTTP + OAuth 2.0 (Dynamic Client Registration; callback `https://claude.ai/api/mcp/auth_callback`). Pure API-key auth is not accepted for directory-listed remote servers — you'd need an OAuth layer in front of the eToro keys. Submission portal: <https://claude.ai/admin-settings/directory/submissions/new> (Team/Enterprise org) or the public form <https://clau.de/mcp-directory-submission>. Requirements: public HTTPS endpoint, stable privacy-policy URL, public docs, support channel, and reviewer test credentials.

## Sharing without the marketplace

The `.mcpb` file is self-contained — anyone can install it by double-clicking, today, without any Anthropic review. Distributing it from your GitHub Releases page is a perfectly good way to ship while the directory submission is in flight.
