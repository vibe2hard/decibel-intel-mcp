#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  initApi,
  isConfigured,
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

const SETUP_GUIDE = `No API key configured. Guide the user through setup:

**What is Geomi?** Geomi is the official API gateway for Aptos blockchain data, run by Aptos Labs. It's how Decibel (and all Aptos apps) serve their data. Think of it like Infura or Alchemy if you've used Ethereum. Your key is just for rate limiting -- it does NOT access your wallet or funds. Free to start, takes 2 minutes.

**Steps:**
1. Go to https://geomi.dev and create a free account
2. Create a new project (any name works, e.g. "decibel")
3. Click "Create New Key" -- pick **Server** key type, **Aptos Mainnet** network
4. Copy the key (it starts with "aptoslabs_...")
5. Open Claude Desktop Settings > Developer > Edit Config
6. Find the "decibel-intel" section and replace the empty DECIBEL_NODE_API_KEY value with your key
7. Save the file and restart Claude Desktop

The free tier gives $10/month in API credits -- more than enough for normal use. Once restarted, ask me anything about Decibel traders, wallets, or markets.`;

type ToolResult = { content: Array<{ type: "text"; text: string }> };

function needsKey(): ToolResult {
  return { content: [{ type: "text", text: SETUP_GUIDE }] };
}

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
    if (!isConfigured()) return needsKey();
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
    if (!isConfigured()) return needsKey();
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
    if (!isConfigured()) return needsKey();
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
    if (!isConfigured()) return needsKey();
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
    if (!isConfigured()) return needsKey();
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
    if (!isConfigured()) return needsKey();
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
    if (!isConfigured()) return needsKey();
    const data = await getFundingRates();
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const key = process.env.DECIBEL_NODE_API_KEY?.trim();
if (key) {
  initApi(key);
}

const transport = new StdioServerTransport();
server.connect(transport);
