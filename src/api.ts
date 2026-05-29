/**
 * Decibel REST API client.
 * Wraps mainnet endpoints with auth and market name resolution.
 */

const BASE_URL = "https://api.mainnet.aptoslabs.com/decibel/api/v1";

let apiKey: string;

export function initApi(key: string) {
  apiKey = key;
}

async function get<T>(path: string, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
  if (!apiKey) throw new Error("DECIBEL_NODE_API_KEY not set");

  const url = new URL(`${BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Decibel API ${res.status}: ${body}`);
  }

  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Market name cache
// ---------------------------------------------------------------------------

interface MarketInfo {
  market_addr: string;
  market_name: string;
  max_leverage: number;
}

let marketCache: Map<string, MarketInfo> | null = null;

async function ensureMarkets(): Promise<Map<string, MarketInfo>> {
  if (marketCache) return marketCache;
  const markets = await get<MarketInfo[]>("/markets");
  marketCache = new Map(markets.map((m) => [m.market_addr, m]));
  return marketCache;
}

export function resolveMarketName(addr: string, cache: Map<string, MarketInfo>): string {
  return cache.get(addr)?.market_name ?? addr;
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

interface LeaderboardEntry {
  rank: number;
  account: string;
  account_value: number;
  realized_pnl: number;
  roi: number;
  volume: number;
}

interface LeaderboardResponse {
  items: LeaderboardEntry[];
  total_count: number;
}

const SORT_KEY_MAP: Record<string, string> = {
  pnl: "realized_pnl",
  roi: "roi",
  volume: "volume",
  value: "account_value",
};

export async function getLeaderboard(sortBy: string = "pnl", limit: number = 10) {
  const sortKey = SORT_KEY_MAP[sortBy] ?? sortBy;
  const data = await get<LeaderboardResponse>("/leaderboard", {
    limit,
    sort_key: sortKey,
    sort_dir: "DESC",
  });
  return {
    total_traders: data.total_count,
    traders: data.items.map((t) => ({
      rank: t.rank,
      address: t.account,
      account_value_usd: round(t.account_value),
      realized_pnl_usd: round(t.realized_pnl),
      roi_pct: round(t.roi),
      volume_usd: round(t.volume),
    })),
  };
}

// ---------------------------------------------------------------------------
// Subaccounts
// ---------------------------------------------------------------------------

interface Subaccount {
  subaccount_address: string;
  label: string;
  is_active: boolean;
}

export async function getSubaccounts(owner: string) {
  const data = await get<Subaccount[]>("/subaccounts", { owner });
  return data;
}

// ---------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------

interface RawPosition {
  market: string;
  user: string;
  size: number;
  user_leverage: number;
  entry_price: number;
  is_isolated: boolean;
  unrealized_funding: number;
  estimated_liquidation_price: number;
  tp_trigger_price: number | null;
  sl_trigger_price: number | null;
}

export async function getWalletPositions(address: string) {
  const markets = await ensureMarkets();

  // Try direct query first (works if address is a subaccount)
  let positions = await get<RawPosition[]>("/account_positions", { account: address });

  // If empty, try resolving as owner -> subaccounts
  if (positions.length === 0) {
    const subs = await getSubaccounts(address);
    if (subs.length > 0) {
      const allPositions: RawPosition[] = [];
      for (const sub of subs) {
        const subPositions = await get<RawPosition[]>("/account_positions", { account: sub.subaccount_address });
        allPositions.push(...subPositions);
      }
      positions = allPositions;
    }
  }

  return positions.map((p) => ({
    market: resolveMarketName(p.market, markets),
    side: p.size > 0 ? "LONG" : "SHORT",
    size: Math.abs(p.size),
    leverage: p.user_leverage,
    entry_price: p.entry_price,
    liquidation_price: p.estimated_liquidation_price || null,
    unrealized_funding: round(p.unrealized_funding),
    mode: p.is_isolated ? "isolated" : "cross",
    tp: p.tp_trigger_price,
    sl: p.sl_trigger_price,
  }));
}

// ---------------------------------------------------------------------------
// Account overview
// ---------------------------------------------------------------------------

interface RawOverview {
  perp_equity_balance: number;
  unrealized_pnl: number;
  realized_pnl: number;
  net_deposits: number;
  all_time_return: number;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  weekly_win_rate_12w: number | null;
  cross_margin_ratio: number;
  cross_account_leverage_ratio: number;
  cross_account_position: number;
  total_margin: number;
  usdc_cross_withdrawable_balance: number;
  pnl_90d: number | null;
}

export async function getWalletOverview(address: string, lookbackDays: number = 90) {
  let data = await get<RawOverview>("/account_overviews", {
    account: address,
    include_performance: true,
    performance_lookback_days: lookbackDays,
  });

  // If equity is 0, try subaccount resolution
  if (data.perp_equity_balance === 0) {
    const subs = await getSubaccounts(address);
    if (subs.length > 0) {
      data = await get<RawOverview>("/account_overviews", {
        account: subs[0].subaccount_address,
        include_performance: true,
        performance_lookback_days: lookbackDays,
      });
    }
  }

  return {
    equity_usd: round(data.perp_equity_balance),
    unrealized_pnl_usd: round(data.unrealized_pnl),
    realized_pnl_usd: round(data.realized_pnl),
    net_deposits_usd: round(data.net_deposits),
    all_time_return_pct: round(data.all_time_return),
    sharpe_ratio: data.sharpe_ratio ? round(data.sharpe_ratio) : null,
    max_drawdown_pct: data.max_drawdown ? round(data.max_drawdown * 100) : null,
    win_rate_12w_pct: data.weekly_win_rate_12w ? round(data.weekly_win_rate_12w * 100) : null,
    margin_ratio: round(data.cross_margin_ratio * 100),
    total_position_usd: round(data.cross_account_position),
    withdrawable_usd: round(data.usdc_cross_withdrawable_balance),
  };
}

// ---------------------------------------------------------------------------
// Trade history
// ---------------------------------------------------------------------------

interface RawTrade {
  market: string;
  side: string;
  size: number;
  price: number;
  realized_pnl: number;
  fee: number;
  timestamp: number;
  order_id: string;
}

export async function getWalletTrades(
  address: string,
  market?: string,
  side?: string,
  limit: number = 50
) {
  const markets = await ensureMarkets();

  // Resolve market name to address if provided
  let marketAddr: string | undefined;
  if (market) {
    const normalized = market.toUpperCase().replace("-", "/");
    for (const [addr, info] of markets.entries()) {
      if (info.market_name.toUpperCase() === normalized || info.market_name.toUpperCase().startsWith(normalized)) {
        marketAddr = addr;
        break;
      }
    }
  }

  let trades = await get<RawTrade[]>("/trade_history", {
    account: address,
    market: marketAddr,
    side: side?.toUpperCase(),
    limit,
    sort_dir: "DESC",
  });

  // Subaccount fallback
  if (trades.length === 0 && !marketAddr) {
    const subs = await getSubaccounts(address);
    if (subs.length > 0) {
      const allTrades: RawTrade[] = [];
      for (const sub of subs) {
        const subTrades = await get<RawTrade[]>("/trade_history", {
          account: sub.subaccount_address,
          market: marketAddr,
          side: side?.toUpperCase(),
          limit,
          sort_dir: "DESC",
        });
        allTrades.push(...subTrades);
      }
      trades = allTrades;
    }
  }

  return trades.map((t) => ({
    market: resolveMarketName(t.market, markets),
    side: t.side,
    size: t.size,
    price: t.price,
    realized_pnl: round(t.realized_pnl),
    fee: round(t.fee),
    time: new Date(t.timestamp * 1000).toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// Vaults
// ---------------------------------------------------------------------------

interface RawVault {
  address: string;
  name: string;
  manager: string;
  tvl: number;
  apr: number | null;
  sharpe_ratio: number | null;
  max_drawdown: number | null;
  weekly_win_rate_12w: number | null;
  depositors: number;
  all_time_pnl: number;
  all_time_return: number;
  past_month_return: number | null;
  average_leverage: number | null;
  vault_type: string;
}

const VAULT_SORT_MAP: Record<string, string> = {
  tvl: "tvl",
  apr: "apr",
  sharpe: "sharpe_ratio",
  drawdown: "max_drawdown",
  pnl: "pnl",
  age: "age",
  win_rate: "weekly_win_rate",
};

export async function getVaults(sortBy: string = "tvl", limit: number = 20) {
  const sortKey = VAULT_SORT_MAP[sortBy] ?? sortBy;
  const data = await get<{ items: RawVault[]; total_count: number }>("/vaults", {
    limit,
    sort_key: sortKey,
    sort_dir: "DESC",
    status: "active",
  });

  const items = data.items ?? [];

  return items.map((v) => ({
    name: v.name,
    address: v.address,
    manager: v.manager,
    type: v.vault_type,
    tvl_usd: round(v.tvl),
    apr_pct: v.apr ? round(v.apr) : null,
    sharpe: v.sharpe_ratio ? round(v.sharpe_ratio) : null,
    max_drawdown_pct: v.max_drawdown ? round(v.max_drawdown) : null,
    win_rate_12w_pct: v.weekly_win_rate_12w ? round(v.weekly_win_rate_12w * 100) : null,
    depositors: v.depositors,
    all_time_pnl_usd: round(v.all_time_pnl),
    all_time_return_pct: round(v.all_time_return),
    past_month_return_pct: v.past_month_return ? round(v.past_month_return) : null,
    avg_leverage: v.average_leverage ? round(v.average_leverage) : null,
  }));
}

// ---------------------------------------------------------------------------
// Market data (asset contexts)
// ---------------------------------------------------------------------------

interface RawAssetContext {
  market: string;
  mark_price: number;
  mid_price: number;
  oracle_price: number;
  open_interest: number;
  volume_24h: number;
  previous_day_price: number;
  price_change_pct_24h: number;
}

export async function getFundingRates() {
  const data = await get<RawAssetContext[]>("/asset_contexts");

  return data.map((a) => ({
    market: a.market,
    mark_price: a.mark_price,
    oracle_price: a.oracle_price,
    open_interest_usd: round(a.open_interest),
    volume_24h_usd: round(a.volume_24h),
    price_change_24h_pct: round(a.price_change_pct_24h),
  }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function round(n: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}
