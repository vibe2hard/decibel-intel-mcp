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

const SETUP_GUIDE = `Looks like this is your first time using Decibel Intel! To pull live data from Decibel, you need a Geomi API key. Let me walk you through it -- takes about 2 minutes.

**What is Geomi?** Geomi is the official API gateway for Aptos (the blockchain Decibel runs on). It's made by Aptos Labs. Think of it as the data pipe that connects us to Decibel's live trading data. Your key is free and just controls rate limits -- it does NOT touch your wallet or funds. Totally safe.

**Let's get your key:**

1. Open https://geomi.dev in your browser
2. Create a free account (email + password)
3. Once you're in, click **"Create New Project"** -- name it anything you want (e.g. "decibel")
4. Inside your project, click **"Create New Key"**
5. For key type, pick **Server**. For network, pick **Aptos Mainnet**
6. Your key will appear -- it starts with \`aptoslabs_\`. Copy it

**Now add it to Claude Desktop:**

1. Go to **Claude Desktop > Settings > Developer > Edit Config**
2. You'll see a JSON file. Find the \`"decibel-intel"\` section
3. Paste your key where it says \`DECIBEL_NODE_API_KEY\`
4. Save the file and **restart Claude Desktop**

That's it! After restarting, come back and ask me anything -- top traders, any wallet's positions, vaults, market data. I've got it all.`;

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
if (key && key.startsWith("aptoslabs_")) {
  initApi(key);
}

const transport = new StdioServerTransport();
server.connect(transport);
