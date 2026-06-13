import { randomUUID } from "node:crypto";

const BASE_URL = "https://public-api.etoro.com";

/**
 * Instrument fields requested from the search / by-symbol endpoints.
 * Field names follow the eToro `Instrument` schema exactly (mixed casing is theirs).
 */
export const INSTRUMENT_FIELDS = [
  "instrumentId",
  "displayname",
  "symbol",
  "internalSymbolFull",
  "instrumentType",
  "exchangeID",
  "isCurrentlyTradable",
  "isExchangeOpen",
  "isDelisted",
  "currentRate",
  "dailyPriceChange",
].join(",");

export interface EtoroClientOptions {
  apiKey: string;
  userKey: string;
  demo: boolean;
}

export class EtoroApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly requestId: string,
    public readonly body: string,
  ) {
    super(
      `eToro API error HTTP ${status} (x-request-id ${requestId}): ${body || "<empty response body>"}` +
        (status === 401 || status === 403
          ? " — check that your API key and User key are correct, not expired, match the selected environment (demo/real), and have the required permission (a Write key is needed for trading)."
          : status === 429
            ? " — eToro rate limit reached (60 read / 20 write requests per minute per key). Wait a minute and retry."
            : ""),
    );
    this.name = "EtoroApiError";
  }
}

type Query = Record<string, string | number | boolean | undefined>;

export interface OrderRequest {
  action: "open" | "close";
  transaction: "buy" | "sell" | "sellShort" | "buyToCover";
  symbol?: string;
  instrumentId?: number;
  orderType?: "mkt" | "mit";
  triggerRate?: number;
  leverage?: number;
  amount?: number;
  orderCurrency?: string;
  units?: number;
  stopLossRate?: number;
  takeProfitRate?: number;
  stopLossType?: "fixed" | "trailing";
  positionIds?: number[];
}

export interface ResolvedInstrument {
  instrumentId: number;
  symbol: string;
  displayname?: string;
}

export class EtoroClient {
  private readonly symbolCache = new Map<string, ResolvedInstrument>();

  constructor(private readonly opts: EtoroClientOptions) {}

  get demo(): boolean {
    return this.opts.demo;
  }

  get environment(): "demo" | "real" {
    return this.opts.demo ? "demo" : "real";
  }

  private async request(method: string, path: string, query?: Query, body?: unknown): Promise<any> {
    const url = new URL(path, BASE_URL);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const maxAttempts = 3;
    let lastError: EtoroApiError | undefined;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const requestId = randomUUID();
      const headers: Record<string, string> = {
        "x-request-id": requestId,
        "x-api-key": this.opts.apiKey,
        "x-user-key": this.opts.userKey,
        accept: "application/json",
      };
      if (body !== undefined) headers["content-type"] = "application/json";

      const res = await fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(30_000),
      });

      // Retry transient failures; everything else surfaces immediately.
      if (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) {
        const text = await res.text().catch(() => "");
        lastError = new EtoroApiError(res.status, requestId, text);
        if (attempt < maxAttempts) {
          const retryAfter = Number(res.headers.get("retry-after"));
          const delayMs =
            Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) * 1000 : attempt * 2_000;
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        break;
      }

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new EtoroApiError(res.status, requestId, text);
      }

      const text = await res.text();
      if (!text) return null;
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
    throw lastError ?? new Error("eToro API request failed");
  }

  private get(path: string, query?: Query): Promise<any> {
    return this.request("GET", path, query);
  }

  private post(path: string, body?: unknown, query?: Query): Promise<any> {
    return this.request("POST", path, query, body);
  }

  private delete(path: string): Promise<any> {
    return this.request("DELETE", path);
  }

  // ---- identity ----

  me(): Promise<any> {
    return this.get("/api/v1/me");
  }

  // ---- account / portfolio (environment-specific paths) ----

  portfolio(): Promise<any> {
    return this.get(this.demo ? "/api/v1/trading/info/demo/portfolio" : "/api/v1/trading/info/portfolio");
  }

  aggregatePortfolio(): Promise<any> {
    return this.get(
      this.demo ? "/api/v1/trading/info/demo/aggregate-portfolio" : "/api/v1/trading/info/aggregate-portfolio",
    );
  }

  pnl(): Promise<any> {
    return this.get(this.demo ? "/api/v1/trading/info/demo/pnl" : "/api/v1/trading/info/real/pnl");
  }

  tradeHistory(query: Query): Promise<any> {
    return this.get(
      this.demo ? "/api/v1/trading/info/trade/demo/history" : "/api/v1/trading/info/trade/history",
      query,
    );
  }

  balances(query: Query): Promise<any> {
    return this.get("/api/v1/balances", query);
  }

  watchlists(): Promise<any> {
    return this.get("/api/v1/watchlists");
  }

  // ---- market data (environment-independent) ----

  searchInstruments(query: Query): Promise<any> {
    return this.get("/api/v1/market-data/search", { ...query, fields: INSTRUMENT_FIELDS });
  }

  instrumentBySymbol(symbol: string): Promise<any> {
    return this.get(`/api/v1/instruments/${encodeURIComponent(symbol)}`, { fields: INSTRUMENT_FIELDS });
  }

  instrumentDisplayData(instrumentIds: number[]): Promise<any> {
    return this.get("/api/v1/market-data/instruments", { instrumentIds: instrumentIds.join(",") });
  }

  rates(instrumentIds: number[]): Promise<any> {
    return this.get("/api/v1/market-data/instruments/rates", { instrumentIds: instrumentIds.join(",") });
  }

  candles(instrumentId: number, direction: string, interval: string, count: number): Promise<any> {
    return this.get(
      `/api/v1/market-data/instruments/${instrumentId}/history/candles/${direction}/${interval}/${count}`,
    );
  }

  // ---- trading info ----

  orderLookup(query: Query): Promise<any> {
    return this.get(this.demo ? "/api/v2/trading/info/demo/orders:lookup" : "/api/v2/trading/info/orders:lookup", query);
  }

  eligibility(body: { instrumentIds?: number[]; symbols?: string[]; currency?: string }): Promise<any> {
    return this.post(this.demo ? "/api/v2/trading/info/demo/eligibility" : "/api/v2/trading/info/eligibility", body);
  }

  // ---- trading execution ----

  placeOrder(body: OrderRequest): Promise<any> {
    return this.post(this.demo ? "/api/v2/trading/execution/demo/orders" : "/api/v2/trading/execution/orders", body);
  }

  closePosition(positionId: number, body: { InstrumentId: number; UnitsToDeduct: number | null }): Promise<any> {
    return this.post(
      this.demo
        ? `/api/v1/trading/execution/demo/market-close-orders/positions/${positionId}`
        : `/api/v1/trading/execution/market-close-orders/positions/${positionId}`,
      body,
    );
  }

  cancelOrder(orderId: number | string): Promise<any> {
    return this.delete(
      this.demo
        ? `/api/v2/trading/execution/demo/orders/${encodeURIComponent(String(orderId))}`
        : `/api/v2/trading/execution/orders/${encodeURIComponent(String(orderId))}`,
    );
  }

  // ---- helpers ----

  /**
   * Resolve a ticker symbol to an eToro instrument. Tries the exact by-symbol
   * endpoint first, then falls back to text search with an exact-ticker match.
   * Instrument IDs are immutable, so results are cached for the process lifetime.
   */
  async resolveInstrument(symbol: string): Promise<ResolvedInstrument> {
    const key = symbol.trim().toUpperCase();
    const cached = this.symbolCache.get(key);
    if (cached) return cached;

    try {
      const instrument = await this.instrumentBySymbol(key);
      if (instrument && typeof instrument.instrumentId === "number") {
        const resolved: ResolvedInstrument = {
          instrumentId: instrument.instrumentId,
          symbol: instrument.symbol ?? key,
          displayname: instrument.displayname,
        };
        this.symbolCache.set(key, resolved);
        return resolved;
      }
    } catch (err) {
      if (!(err instanceof EtoroApiError && err.status === 404)) throw err;
    }

    const search = await this.searchInstruments({ searchText: key, pageSize: 20 });
    const items: any[] = search?.items ?? [];
    const exact = items.find(
      (item) =>
        String(item.symbol ?? "").toUpperCase() === key ||
        String(item.internalSymbolFull ?? "").toUpperCase() === key,
    );
    if (exact && typeof exact.instrumentId === "number") {
      const resolved: ResolvedInstrument = {
        instrumentId: exact.instrumentId,
        symbol: exact.symbol ?? key,
        displayname: exact.displayname,
      };
      this.symbolCache.set(key, resolved);
      return resolved;
    }

    const suggestions = items
      .slice(0, 5)
      .map((item) => `${item.symbol} (${item.displayname})`)
      .join(", ");
    throw new Error(
      `Could not resolve "${symbol}" to an eToro instrument.` +
        (suggestions ? ` Close matches: ${suggestions}.` : "") +
        " Use the search_instruments tool to find the exact ticker.",
    );
  }

  /**
   * Fetch display metadata (symbol, name) for a set of instrument IDs,
   * keyed by instrument ID. Failures return an empty map so callers can
   * degrade gracefully to un-enriched data.
   */
  async instrumentNames(instrumentIds: number[]): Promise<Map<number, any>> {
    const byId = new Map<number, any>();
    const unique = [...new Set(instrumentIds)].filter((id) => Number.isFinite(id));
    try {
      for (let i = 0; i < unique.length; i += 100) {
        const chunk = unique.slice(i, i + 100);
        const res = await this.instrumentDisplayData(chunk);
        for (const item of res?.instrumentDisplayDatas ?? []) {
          byId.set(Number(item.instrumentID), {
            symbol: item.symbolFull,
            name: item.instrumentDisplayName,
            instrumentTypeID: item.instrumentTypeID,
            exchangeID: item.exchangeID,
          });
        }
      }
    } catch {
      // Enrichment is best-effort; return whatever we have.
    }
    return byId;
  }
}
