# Decibel Intel MCP

An MCP server that gives AI assistants (Claude, Windsurf, Cursor) research-grade access to [Decibel](https://decibel.trade) -- the perps DEX on Aptos.

Look up any trader's positions, P&L, and trade history. Browse the leaderboard. Analyze vaults. Check market activity across all 33+ pairs.

## What you can ask

Once connected, just ask in natural language:

- **"Who are the top traders on Decibel?"** -- leaderboard ranked by P&L, ROI, or volume
- **"Show me what wallet 0xABC is trading"** -- open positions with leverage, entry price, liquidation price
- **"How good is this trader?"** -- Sharpe ratio, win rate, max drawdown, total returns
- **"What did this wallet trade recently?"** -- full trade history with P&L per trade
- **"What vaults are available?"** -- all vaults with TVL, APR, performance metrics
- **"What markets have the most activity?"** -- open interest, volume, price changes

## Why this exists

Decibel's official MCP only shows your own account. This server queries **any wallet** -- the leaderboard, trade history, positions, vaults -- using Decibel's public REST API. It's the research and intelligence layer.

## Setup (2 minutes)

### Option A: One-click install (Claude Desktop)

Download `decibel-intel.mcpb` from the [latest release](https://github.com/vibe2hard/decibel-intel-mcp/releases) and double-click it. Claude Desktop will prompt you for your Geomi API key -- no config files, no terminal.

> **Need a Geomi key?** Create a free account at [geomi.dev](https://geomi.dev), make a project, and create a Server key for Aptos Mainnet. The key starts with `aptoslabs_...`. Free tier gives $10/month in credits.

### Option B: Manual config (all platforms)

You don't need an API key to install. Add the config, and Claude will walk you through getting a key when you first use it.

#### Claude Desktop

Open **Settings > Developer > Edit Config** and add:

```json
{
  "mcpServers": {
    "decibel-intel": {
      "command": "npx",
      "args": ["-y", "decibel-intel-mcp"],
      "env": {
        "DECIBEL_NODE_API_KEY": ""
      }
    }
  }
}
```

Restart Claude Desktop. Ask "Who are the top traders on Decibel?" and Claude will guide you through the free API key setup.

> **Already have a Geomi key?** Paste it into `DECIBEL_NODE_API_KEY` above and you're done.

#### Claude Code

```bash
claude mcp add decibel-intel -- npx -y decibel-intel-mcp
```

Then set the env var `DECIBEL_NODE_API_KEY` in your shell.

#### Windsurf

Add to your MCP config (`~/.codeium/windsurf/mcp_config.json`):

```json
{
  "mcpServers": {
    "decibel-intel": {
      "command": "npx",
      "args": ["-y", "decibel-intel-mcp"],
      "env": {
        "DECIBEL_NODE_API_KEY": "aptoslabs_YOUR_KEY_HERE"
      }
    }
  }
}
```

#### Cursor

Add to Cursor's MCP settings (Settings > MCP Servers):

```json
{
  "mcpServers": {
    "decibel-intel": {
      "command": "npx",
      "args": ["-y", "decibel-intel-mcp"],
      "env": {
        "DECIBEL_NODE_API_KEY": "aptoslabs_YOUR_KEY_HERE"
      }
    }
  }
}
```

### 3. Start asking questions

That's it. Open a new conversation and ask about Decibel traders, positions, or markets.

## Tools

| Tool | What it does |
|------|-------------|
| `get_leaderboard` | Top traders by P&L, ROI, or volume (up to 1,000) |
| `get_wallet_positions` | Any wallet's open positions -- market, side, size, leverage, entry, liq price |
| `get_wallet_overview` | Trading performance -- equity, P&L, Sharpe, drawdown, win rate |
| `get_wallet_trades` | Trade history filterable by market and side |
| `get_subaccounts` | List subaccounts under an owner wallet |
| `get_vaults` | All public vaults -- TVL, APR, Sharpe, drawdown, manager |
| `get_funding_rates` | All markets -- prices, open interest, 24h volume, price changes |

All tools automatically resolve market addresses to human-readable names (e.g. `BTC/USD` not `0x5e0e...`) and handle Decibel's subaccount model transparently.

## Pair with Decibel's official MCP for trading

This server is read-only (research and intelligence). To also **trade** through your AI assistant, add Decibel's official MCP alongside:

```json
{
  "mcpServers": {
    "decibel-intel": {
      "command": "npx",
      "args": ["-y", "decibel-intel-mcp"],
      "env": {
        "DECIBEL_NODE_API_KEY": "aptoslabs_YOUR_KEY_HERE"
      }
    },
    "decibel": {
      "command": "npx",
      "args": ["-y", "-p", "@decibeltrade/cli", "decibel-mcp"],
      "env": {
        "DECIBEL_NETWORK": "mainnet",
        "DECIBEL_PRIVATE_KEY": "ed25519-priv-0x...",
        "DECIBEL_SUBACCOUNT_ADDRESS": "0x...",
        "DECIBEL_NODE_API_KEY": "aptoslabs_YOUR_KEY_HERE"
      }
    }
  }
}
```

Now you can research any wallet AND execute trades -- all through natural language.

## Requirements

- Node.js 18+
- Geomi API key ([geomi.dev](https://geomi.dev), free tier)

## License

MIT
