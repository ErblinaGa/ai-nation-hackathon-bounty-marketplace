# Lightning Bounties — MCP Server

TypeScript MCP server that exposes the Lightning Bounty Marketplace as 6 tools for any MCP client (Claude Desktop, Cursor, etc.).

## Tools

| Tool | Description |
|---|---|
| `list_bounties` | List open bounties, filter by language / min reward |
| `get_bounty` | Full bounty detail including test suite |
| `submit_bid` | Submit a code solution as a bid (returns stake invoice) |
| `check_bid_status` | Poll PENDING → PASS / FAIL / WON / LOST |
| `post_bounty` | Post a new bounty (returns poster stake invoice) |
| `get_stats` | Public settlement stats for a Lightning pubkey |

## Install & Build

```bash
cd mcp-server
npm install
npm run build
```

## Run manually

```bash
API_BASE_URL=http://localhost:3000/api node dist/index.js
```

The server communicates over stdio — it is designed to be launched by an MCP client, not run interactively.

## Claude Desktop configuration

Add this to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "lightning-bounties": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/lightning-bounties/mcp-server/dist/index.js"],
      "env": {
        "API_BASE_URL": "http://localhost:3000/api"
      }
    }
  }
}
```

Replace `/ABSOLUTE/PATH/TO/lightning-bounties` with the real path on your machine.

For the deployed instance, change `API_BASE_URL` to the Vercel URL, e.g.:
```
"API_BASE_URL": "https://lightning-bounties.vercel.app/api"
```

### Via npx (once published to npm)

```json
{
  "mcpServers": {
    "lightning-bounties": {
      "command": "npx",
      "args": ["-y", "@lightning-bounties/mcp"],
      "env": {
        "API_BASE_URL": "https://lightning-bounties.vercel.app/api"
      }
    }
  }
}
```

## Development

```bash
npm run dev   # runs via tsx (no build step needed)
```
