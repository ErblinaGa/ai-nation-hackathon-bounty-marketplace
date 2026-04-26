import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const API_BASE_URL = (
  process.env.API_BASE_URL ?? "http://localhost:3000/api"
).replace(/\/$/, "");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function apiGet(path: string, params?: Record<string, string>): Promise<unknown> {
  const url = new URL(`${API_BASE_URL}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text().catch(() => "(no body)");
    throw new Error(`[mcp-server] GET ${path} failed ${res.status}: ${body}`);
  }
  return res.json();
}

async function apiPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(`[mcp-server] POST ${path} failed ${res.status}: ${text}`);
  }
  return res.json();
}

function ok(data: unknown): { content: Array<{ type: "text"; text: string }> } {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

function err(message: string): { content: Array<{ type: "text"; text: string }>; isError: true } {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }, null, 2) }],
    isError: true,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions (mirrors spec section 9)
// ---------------------------------------------------------------------------

const TOOLS = [
  {
    name: "list_bounties",
    description:
      "List active bounties on the marketplace, filterable by language and minimum reward",
    inputSchema: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["typescript", "python"],
          description: "Filter by programming language",
        },
        min_bounty_sats: {
          type: "number",
          description: "Minimum bounty in satoshis",
        },
        status: {
          type: "string",
          default: "OPEN",
          description: "Bounty status filter (default: OPEN)",
        },
      },
    },
  },
  {
    name: "get_bounty",
    description:
      "Get full details of a specific bounty including the test suite",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "The bounty ID" },
      },
      required: ["bounty_id"],
    },
  },
  {
    name: "submit_bid",
    description:
      "Submit a code solution as a bid. Returns a hold-invoice for the stake. Code is hash-committed and only revealed if you win.",
    inputSchema: {
      type: "object",
      properties: {
        bounty_id: { type: "string", description: "The bounty ID to bid on" },
        code: { type: "string", description: "The complete solution code" },
        asked_price_sats: {
          type: "number",
          description: "Your asking price in satoshis (must be ≤ max_bounty_sats)",
        },
        bidder_pubkey: {
          type: "string",
          description: "Your Lightning public key (64-char hex, compressed)",
        },
      },
      required: ["bounty_id", "code", "asked_price_sats", "bidder_pubkey"],
    },
  },
  {
    name: "check_bid_status",
    description:
      "Poll the status of a submitted bid (PENDING / PASS / FAIL / WON / LOST / REFUNDED)",
    inputSchema: {
      type: "object",
      properties: {
        bid_id: { type: "string", description: "The bid ID returned by submit_bid" },
      },
      required: ["bid_id"],
    },
  },
  {
    name: "post_bounty",
    description:
      "Post a new coding bounty. Returns a hold-invoice for the poster stake. The bounty goes OPEN once the invoice is paid.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Short bounty title" },
        description: {
          type: "string",
          description: "Full description of what the function should do",
        },
        language: {
          type: "string",
          enum: ["typescript", "python"],
          description: "Programming language for solutions",
        },
        test_suite: {
          type: "string",
          description: "Complete test suite code (Jest for TS, pytest for Python)",
        },
        max_bounty_sats: {
          type: "number",
          description: "Maximum payout in satoshis",
        },
        deadline_minutes: {
          type: "number",
          default: 5,
          description: "Deadline in minutes from now (default: 5)",
        },
        poster_pubkey: {
          type: "string",
          description: "Your Lightning public key (64-char hex, compressed)",
        },
        starter_code: {
          type: "string",
          description: "Optional starter template for bidders",
        },
      },
      required: [
        "title",
        "description",
        "language",
        "test_suite",
        "max_bounty_sats",
        "poster_pubkey",
      ],
    },
  },
  {
    name: "get_stats",
    description:
      "Get public settlement statistics for a pubkey (win rate, pass rate, avg won price). Pure market transparency — not a reputation score.",
    inputSchema: {
      type: "object",
      properties: {
        pubkey: {
          type: "string",
          description: "The Lightning public key to look up",
        },
      },
      required: ["pubkey"],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  { name: "lightning-bounties", version: "0.1.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS.map((t) => ({ ...t })),
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;
  const a = (args ?? {}) as Record<string, unknown>;

  try {
    switch (name) {
      case "list_bounties": {
        const params: Record<string, string> = {
          status: String(a.status ?? "OPEN"),
        };
        if (a.language) params.language = String(a.language);
        if (a.min_bounty_sats != null)
          params.min_bounty = String(a.min_bounty_sats);
        const data = await apiGet("/bounties", params);
        return ok(data);
      }

      case "get_bounty": {
        if (!a.bounty_id) return err("bounty_id is required");
        const data = await apiGet(`/bounty/${a.bounty_id}`);
        return ok(data);
      }

      case "submit_bid": {
        if (!a.bounty_id) return err("bounty_id is required");
        if (!a.code) return err("code is required");
        if (a.asked_price_sats == null) return err("asked_price_sats is required");
        if (!a.bidder_pubkey) return err("bidder_pubkey is required");

        const data = await apiPost(`/bounty/${a.bounty_id}/bid`, {
          bidder_pubkey: a.bidder_pubkey,
          code: a.code,
          asked_price_sats: Number(a.asked_price_sats),
        });
        return ok(data);
      }

      case "check_bid_status": {
        if (!a.bid_id) return err("bid_id is required");
        const data = await apiGet(`/bid/${a.bid_id}`);
        return ok(data);
      }

      case "post_bounty": {
        if (!a.title) return err("title is required");
        if (!a.description) return err("description is required");
        if (!a.language) return err("language is required");
        if (!a.test_suite) return err("test_suite is required");
        if (a.max_bounty_sats == null) return err("max_bounty_sats is required");
        if (!a.poster_pubkey) return err("poster_pubkey is required");

        const data = await apiPost("/bounty", {
          poster_pubkey: a.poster_pubkey,
          title: a.title,
          description: a.description,
          language: a.language,
          starter_code: a.starter_code ?? null,
          test_suite: a.test_suite,
          max_bounty_sats: Number(a.max_bounty_sats),
          deadline_minutes: a.deadline_minutes != null ? Number(a.deadline_minutes) : 5,
        });
        return ok(data);
      }

      case "get_stats": {
        if (!a.pubkey) return err("pubkey is required");
        const data = await apiGet(`/stats/${a.pubkey}`);
        return ok(data);
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(message);
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const transport = new StdioServerTransport();
await server.connect(transport);
// Server runs until stdin closes — no process.exit needed.
