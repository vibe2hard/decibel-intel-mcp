#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  initApi,
  getLeaderboard,
  getSubaccounts,
  getWalletPositions,
  getWalletOverview,
  getWalletTrades,
  getVaults,
  getFundingRates,
} from "./api.js";

const server = new McpServer({
  name: "decibel-intel",
  version: "0.1.0",
});

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

server.tool(
  "get_leaderboard",
  "Get top Decibel traders ranked by P&L, ROI, or volume. Returns up to 1000 entries.",
  {
    sort_by: z.enum(["pnl", "roi", "volume", "value"]).default("pnl").describe("Sort metric"),
    limit: z.number().min(1).max(1000).default(10).describe("Number of results"),
  },
  async ({ sort_by, limit }) => {
    const data = await getLeaderboard(sort_by, limit);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_wallet_positions",
  "Get any wallet's open positions on Decibel. Shows market, side, size, leverage, entry price, liquidation price, and P&L. Automatically resolves subaccounts.",
  {
    address: z.string().describe("Wallet address (owner or subaccount)"),
  },
  async ({ address }) => {
    const data = await getWalletPositions(address);
    if (data.length === 0) {
      return { content: [{ type: "text", text: "No open positions found for this address." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_wallet_overview",
  "Get any wallet's trading performance on Decibel: equity, P&L, Sharpe ratio, max drawdown, win rate, margin, deposits.",
  {
    address: z.string().describe("Wallet address (owner or subaccount)"),
    lookback_days: z.number().default(90).describe("Performance lookback period in days"),
  },
  async ({ address, lookback_days }) => {
    const data = await getWalletOverview(address, lookback_days);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_wallet_trades",
  "Get any wallet's trade history on Decibel. Filterable by market and side.",
  {
    address: z.string().describe("Wallet address (owner or subaccount)"),
    market: z.string().optional().describe("Filter by market name, e.g. 'BTC/USD' or 'ETH'"),
    side: z.enum(["BUY", "SELL"]).optional().describe("Filter by trade side"),
    limit: z.number().min(1).max(200).default(50).describe("Number of trades to return"),
  },
  async ({ address, market, side, limit }) => {
    const data = await getWalletTrades(address, market, side, limit);
    if (data.length === 0) {
      return { content: [{ type: "text", text: "No trades found for this address." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_subaccounts",
  "List all trading subaccounts under an owner wallet. Useful for resolving which subaccount to query for positions/trades.",
  {
    owner: z.string().describe("Owner wallet address"),
  },
  async ({ owner }) => {
    const data = await getSubaccounts(owner);
    if (data.length === 0) {
      return { content: [{ type: "text", text: "No subaccounts found. This address may itself be a subaccount, not an owner." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_vaults",
  "Get all public Decibel vaults with TVL, APR, Sharpe ratio, drawdown, win rate, and manager info.",
  {
    sort_by: z.enum(["tvl", "apr", "sharpe", "drawdown", "pnl", "age", "win_rate"]).default("tvl").describe("Sort metric"),
    limit: z.number().min(1).max(100).default(20).describe("Number of vaults"),
  },
  async ({ sort_by, limit }) => {
    const data = await getVaults(sort_by, limit);
    if (data.length === 0) {
      return { content: [{ type: "text", text: "No active vaults found." }] };
    }
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_funding_rates",
  "Get current prices, open interest, 24h volume, and price changes for all Decibel markets.",
  {},
  async () => {
    const data = await getFundingRates();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const key = process.env.DECIBEL_NODE_API_KEY;
if (!key) {
  console.error("Error: DECIBEL_NODE_API_KEY environment variable is required.");
  console.error("Get your key at https://geomi.dev");
  process.exit(1);
}

initApi(key);

const transport = new StdioServerTransport();
server.connect(transport);
