import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { EtoroClient } from "./etoroClient.js";

function jsonResult(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: message }], isError: true };
}

type Handler<A> = (args: A) => Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }>;

function wrap<A>(handler: Handler<A>): Handler<A> {
  return async (args: A) => {
    try {
      return await handler(args);
    } catch (err) {
      return errorResult(err);
    }
  };
}

const READ_ONLY = { readOnlyHint: true, openWorldHint: true };

export function registerTools(server: McpServer, client: EtoroClient): void {
  // This is the read-only connector: it registers portfolio and market-data
  // tools only. There are no trade-execution tools.

  server.registerTool(
    "get_account_info",
    {
      title: "Get eToro account info",
      description:
        "Returns the authenticated eToro account identity (username, account IDs, API key scopes) plus this connector's configuration: environment (demo or real). This is a read-only connector with no trading tools.",
      annotations: READ_ONLY,
    },
    wrap(async () => {
      const me = await client.me();
      return jsonResult({
        environment: client.environment,
        readOnly: true,
        account: me,
      });
    }),
  );

  server.registerTool(
    "get_portfolio_summary",
    {
      title: "Get portfolio summary",
      description:
        "Returns aggregated account totals for the configured environment (demo/real): equity (accountTotalValue), available cash, frozen cash, used margin, current P&L, plus per-instrument aggregate exposure with instrument names.",
      annotations: READ_ONLY,
    },
    wrap(async () => {
      const aggregate = await client.aggregatePortfolio();
      const ids = (aggregate?.instrumentAggregates ?? [])
        .map((row: any) => Number(row.instrumentId ?? row.instrumentID))
        .filter((id: number) => Number.isFinite(id));
      const names = await client.instrumentNames(ids);
      const instrumentAggregates = (aggregate?.instrumentAggregates ?? []).map((row: any) => ({
        ...row,
        instrument: names.get(Number(row.instrumentId ?? row.instrumentID)) ?? undefined,
      }));
      return jsonResult({ environment: client.environment, ...aggregate, instrumentAggregates });
    }),
  );

  server.registerTool(
    "get_positions",
    {
      title: "Get open positions",
      description:
        "Returns all open positions in the configured environment (demo/real) with entry rate, invested amount, units, leverage, stop loss / take profit, and fees — enriched with instrument symbol and name. Also returns available cash (credit) and any pending orders.",
      annotations: READ_ONLY,
    },
    wrap(async () => {
      const portfolio = await client.portfolio();
      const clientPortfolio = portfolio?.clientPortfolio ?? portfolio ?? {};
      const positions: any[] = clientPortfolio.positions ?? [];
      const ids = positions
        .map((p) => Number(p.instrumentID ?? p.instrumentId))
        .filter((id) => Number.isFinite(id));
      const names = await client.instrumentNames(ids);
      const enriched = positions.map((p) => ({
        ...p,
        instrument: names.get(Number(p.instrumentID ?? p.instrumentId)) ?? undefined,
      }));
      return jsonResult({
        environment: client.environment,
        availableCash: clientPortfolio.credit,
        bonusCredit: clientPortfolio.bonusCredit,
        positionCount: enriched.length,
        positions: enriched,
        orders: clientPortfolio.orders ?? [],
        entryOrders: clientPortfolio.entryOrders ?? [],
        exitOrders: clientPortfolio.exitOrders ?? [],
        ordersForOpen: clientPortfolio.ordersForOpen ?? [],
        ordersForClose: clientPortfolio.ordersForClose ?? [],
        copiedTraders: clientPortfolio.mirrors ?? [],
      });
    }),
  );

  server.registerTool(
    "get_pnl",
    {
      title: "Get profit and loss",
      description:
        "Returns the current profit-and-loss view for the configured environment (demo/real): unrealized P&L and per-position P&L with current close rates.",
      annotations: READ_ONLY,
    },
    wrap(async () => {
      const pnl = await client.pnl();
      return jsonResult({ environment: client.environment, ...((pnl && typeof pnl === "object") ? pnl : { pnl }) });
    }),
  );

  server.registerTool(
    "get_balances",
    {
      title: "Get account balances",
      description:
        "Returns cash balances across eToro account types (Trading, Cash, ...) for the real account, including equity details (available cash, frozen cash, current P&L, used margin) per account.",
      inputSchema: {
        account_types: z
          .string()
          .optional()
          .describe('Optional comma-separated account types to include, e.g. "Trading,Cash".'),
        display_currency: z
          .string()
          .optional()
          .describe('Optional ISO currency code to convert balances into, e.g. "USD".'),
        include_zero_balances: z.boolean().optional().describe("Include accounts with a zero balance."),
      },
      annotations: READ_ONLY,
    },
    wrap(async (args) => {
      const balances = await client.balances({
        accountTypes: args.account_types,
        displayCurrency: args.display_currency,
        includeZeroBalances: args.include_zero_balances,
        expand: "equityDetails",
      });
      return jsonResult(balances);
    }),
  );

  server.registerTool(
    "get_trade_history",
    {
      title: "Get closed trade history",
      description:
        "Returns closed trades for the configured environment (demo/real) since min_date: open/close rates and timestamps, net profit, invested amount, fees, units, and leverage per trade. Defaults to the last 90 days.",
      inputSchema: {
        min_date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format")
          .optional()
          .describe("Earliest close date to include (YYYY-MM-DD). Defaults to 90 days ago."),
        page: z.number().int().min(1).optional().describe("Page number, starting at 1."),
        page_size: z.number().int().min(1).max(500).optional().describe("Results per page (default 50)."),
      },
      annotations: READ_ONLY,
    },
    wrap(async (args) => {
      const minDate =
        args.min_date ?? new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const history = await client.tradeHistory({
        minDate,
        page: args.page,
        pageSize: args.page_size ?? 50,
      });
      return jsonResult({ environment: client.environment, minDate, trades: history });
    }),
  );

  server.registerTool(
    "search_instruments",
    {
      title: "Search instruments",
      description:
        "Searches eToro instruments (stocks, ETFs, crypto, currencies, indices, commodities) by name or ticker text. Returns instrument IDs, symbols, display names, current rates, and tradability flags. Use this to find the instrument_id or exact symbol for other tools.",
      inputSchema: {
        query: z.string().min(1).describe("Free-text search, e.g. a company name or ticker."),
        page_size: z.number().int().min(1).max(100).optional().describe("Max results to return (default 10)."),
        page: z.number().int().min(1).optional().describe("Page number, starting at 1."),
      },
      annotations: READ_ONLY,
    },
    wrap(async (args) => {
      const result = await client.searchInstruments({
        searchText: args.query,
        pageSize: args.page_size ?? 10,
        pageNumber: args.page,
      });
      return jsonResult(result);
    }),
  );

  server.registerTool(
    "get_quotes",
    {
      title: "Get live quotes",
      description:
        "Returns current bid/ask prices for up to 100 instruments, identified by ticker symbols (e.g. AAPL, BTC) and/or eToro instrument IDs.",
      inputSchema: {
        symbols: z.array(z.string()).max(100).optional().describe('Ticker symbols, e.g. ["AAPL", "BTC"].'),
        instrument_ids: z.array(z.number().int()).max(100).optional().describe("eToro instrument IDs."),
      },
      annotations: READ_ONLY,
    },
    wrap(async (args) => {
      const symbols = args.symbols ?? [];
      const directIds = args.instrument_ids ?? [];
      if (symbols.length === 0 && directIds.length === 0) {
        throw new Error("Provide at least one of symbols or instrument_ids.");
      }
      if (symbols.length + directIds.length > 100) {
        throw new Error("At most 100 instruments per quotes request.");
      }
      const labels = new Map<number, { symbol: string; name?: string }>();
      const ids: number[] = [...directIds];
      for (const symbol of symbols) {
        const resolved = await client.resolveInstrument(symbol);
        ids.push(resolved.instrumentId);
        labels.set(resolved.instrumentId, { symbol: resolved.symbol, name: resolved.displayname });
      }
      const unique = [...new Set(ids)];
      if (unique.length > 100) throw new Error("At most 100 instruments per quotes request.");
      if (directIds.length > 0) {
        const names = await client.instrumentNames(directIds);
        for (const [id, meta] of names) {
          if (!labels.has(id)) labels.set(id, { symbol: meta.symbol, name: meta.name });
        }
      }
      const res = await client.rates(unique);
      const quotes = (res?.rates ?? []).map((rate: any) => ({
        ...(labels.get(Number(rate.instrumentID)) ?? {}),
        ...rate,
      }));
      return jsonResult({ quotes });
    }),
  );

  server.registerTool(
    "get_price_history",
    {
      title: "Get price history (candles)",
      description:
        "Returns historical OHLCV candles for one instrument identified by ticker symbol or eToro instrument ID. Supports intervals from one minute to one week, up to 1000 candles.",
      inputSchema: {
        symbol: z.string().optional().describe("Ticker symbol, e.g. AAPL. Provide this or instrument_id."),
        instrument_id: z.number().int().optional().describe("eToro instrument ID. Provide this or symbol."),
        interval: z
          .enum([
            "OneMinute",
            "FiveMinutes",
            "TenMinutes",
            "FifteenMinutes",
            "ThirtyMinutes",
            "OneHour",
            "FourHours",
            "OneDay",
            "OneWeek",
          ])
          .default("OneDay")
          .describe("Candle interval."),
        count: z.number().int().min(1).max(1000).default(30).describe("Number of candles (max 1000)."),
        direction: z
          .enum(["asc", "desc"])
          .default("desc")
          .describe("desc = most recent candles first (default)."),
      },
      annotations: READ_ONLY,
    },
    wrap(async (args) => {
      let instrumentId = args.instrument_id;
      let label: Record<string, unknown> = {};
      if (instrumentId === undefined) {
        if (!args.symbol) throw new Error("Provide symbol or instrument_id.");
        const resolved = await client.resolveInstrument(args.symbol);
        instrumentId = resolved.instrumentId;
        label = { symbol: resolved.symbol, name: resolved.displayname };
      }
      const candles = await client.candles(instrumentId, args.direction, args.interval, args.count);
      return jsonResult({ instrumentId, ...label, ...candles });
    }),
  );

  server.registerTool(
    "get_watchlists",
    {
      title: "Get watchlists",
      description:
        "Returns the user's eToro watchlists. Each item is an instrument ID (occasionally a copied-trader ID), enriched with instrument symbol and name where available.",
      annotations: READ_ONLY,
    },
    wrap(async () => {
      const res = await client.watchlists();
      const watchlists: any[] = res?.watchlists ?? [];
      const ids = watchlists
        .flatMap((w: any) => w?.items ?? [])
        .filter((it: any) => it?.itemType === "Instrument")
        .map((it: any) => Number(it.itemId))
        .filter((id: number) => Number.isFinite(id));
      const names = await client.instrumentNames(ids);
      return jsonResult({
        ...res,
        watchlists: watchlists.map((w: any) => ({
          ...w,
          items: (w?.items ?? []).map((it: any) =>
            it?.itemType === "Instrument"
              ? { ...it, instrument: names.get(Number(it.itemId)) ?? undefined }
              : it,
          ),
        })),
      });
    }),
  );

  server.registerTool(
    "check_trade_eligibility",
    {
      title: "Check trade eligibility",
      description:
        "Checks whether instruments can currently be traded in the configured environment and returns trading constraints: allowed leverage values, minimum position amount, stop-loss/take-profit percentage limits, and max units per order. Read-only pre-trade check; does not place any order.",
      inputSchema: {
        symbols: z.array(z.string()).max(100).optional().describe('Ticker symbols to check, e.g. ["AAPL"].'),
        instrument_ids: z.array(z.number().int()).max(100).optional().describe("eToro instrument IDs to check."),
      },
      annotations: READ_ONLY,
    },
    wrap(async (args) => {
      const symbols = args.symbols ?? [];
      const instrumentIds = args.instrument_ids ?? [];
      if (symbols.length === 0 && instrumentIds.length === 0) {
        throw new Error("Provide at least one of symbols or instrument_ids.");
      }
      const body: { instrumentIds?: number[]; symbols?: string[]; currency: string } = { currency: "USD" };
      if (instrumentIds.length > 0) body.instrumentIds = instrumentIds;
      if (symbols.length > 0) body.symbols = symbols;
      const result = await client.eligibility(body);
      return jsonResult({ environment: client.environment, ...((result && typeof result === "object") ? result : { result }) });
    }),
  );

  server.registerTool(
    "get_order_status",
    {
      title: "Get order status",
      description:
        "Looks up the status of an order you previously submitted via the eToro app or website, by order_id or reference_id, including execution state, executed positions, and any error message. Read-only; this connector cannot itself place orders.",
      inputSchema: {
        order_id: z.union([z.number().int(), z.string()]).optional().describe("Numeric order ID."),
        reference_id: z.string().optional().describe("Reference ID (UUID) associated with the order."),
      },
      annotations: READ_ONLY,
    },
    wrap(async (args) => {
      const hasOrderId = args.order_id !== undefined;
      const hasReferenceId = args.reference_id !== undefined;
      if (hasOrderId === hasReferenceId) {
        throw new Error("Provide exactly one of order_id or reference_id.");
      }
      const result = await client.orderLookup(
        hasOrderId ? { orderId: String(args.order_id) } : { referenceId: args.reference_id },
      );
      return jsonResult({ environment: client.environment, ...((result && typeof result === "object") ? result : { result }) });
    }),
  );
}

