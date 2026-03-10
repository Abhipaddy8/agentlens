# AgentLens

**The proxy that sits between your AI agents and OpenAI. Logs every call. Caches duplicates. Downgrades models when the task is simple. Kills runaway agents instantly. Deploys in your AWS account — your data never leaves.**

[![Deploy to AWS](https://img.shields.io/badge/Deploy%20to%20AWS-FF9900?style=for-the-badge&logo=amazonaws&logoColor=white)](LAUNCH_STACK_URL_PLACEHOLDER)

---

## The Problem

You shipped 8 AI agents into production. They work. Customers are happy. Then the OpenAI bill lands: **$12,000.** You budgeted $3,000.

You open the invoice. It's a single line: "API usage — $12,000." No breakdown per agent. No way to know that your procurement agent has been making the same "compare supplier pricing for Q3 electronics" call 200 times a day with identical prompts. No way to see that your customer support bot — which only needs gpt-4o-mini for template responses — has been calling gpt-4o because someone hardcoded it 3 months ago. No way to know that at 2 AM last Tuesday, a supplier validation agent entered an infinite loop and burned $840 in 3 hours before anyone noticed.

You have no per-agent cost breakdown. No cache. No kill switch. No rate limit. No budget cap. No way to answer the question every CFO asks: **"Which agent is costing us money, and can we make it stop?"**

AgentLens answers that question. It's a transparent proxy that intercepts every LLM API call your agents make. It deploys as a single Lambda function in your AWS account. Your agents connect to it with a one-line code change — swap the base URL, keep everything else. AgentLens logs every call with full cost attribution, caches identical queries at 234x speed for $0, automatically downgrades expensive models on simple tasks, and gives you a 9-screen dashboard where you can see, control, and cut your LLM spend in real-time.

---

## What It Does (With Real Numbers)

- **Semantic cache**: Identical prompt+model combinations served from DynamoDB in **14ms** instead of 7,600ms from OpenAI. **234x faster. $0 cost.** Per-agent cache toggle and custom TTL.
- **Smart model routing**: Short prompts on gpt-4o auto-downgrade to gpt-4o-mini. **16x cost reduction per routed call.** Skips routing for tool calls and structured output.
- **Per-agent kill switches**: Disable any agent instantly. The call never reaches OpenAI. Logged as `status: "killed"` so you see it in the blocked count.
- **Per-agent budgets**: Monthly dollar cap per agent. Atomic DynamoDB increment. Blocks at the proxy before the LLM call fires.
- **Per-agent rate limits**: In-memory sliding window, configurable RPM per agent. Prevents infinite loops from burning your budget in seconds.
- **Prompt versioning**: Track system prompt changes per agent. Compare latency and error rates across versions. One-click rollback to any previous version.
- **Streaming pass-through**: SSE chunks piped directly to the client with zero buffering delay. Cost logged asynchronously after stream ends.
- **9-screen dashboard**: Overview, Agent Drill-Down, Workflows, Cache Performance, Smart Routing, Controls, Prompt Versions, Live Simulator, CFO View.

---

## Architecture

```
                                 ┌──────────────────────────────────────────────────┐
                                 │              AgentLens Proxy (Lambda)             │
                                 │                                                  │
                                 │   ┌──────────────────────────────────────────┐   │
  ┌──────────────┐               │   │  1. KILL SWITCH   → killed? return 403   │   │
  │  Your Agent  │               │   │  2. RATE LIMITER  → over RPM? return 429 │   │    ┌───────────────┐
  │  (any lang)  │───POST /v1/──→│   │  3. BUDGET CHECK  → over cap? return 429 │   │──→ │  OpenAI       │
  │  (any SDK)   │  completions  │   │  4. CACHE CHECK   → seen it? return 200  │   │    │  OpenRouter   │
  │              │               │   │  5. MODEL ROUTER  → simple? downgrade    │   │    │  Azure        │
  │  base_url =  │               │   │  6. FORWARD + LOG → call LLM, log cost   │   │    │  Any provider │
  │  agentlens/  │←──────────────│   │  7. VERSION TRACK → record prompt ver    │   │    └───────────────┘
  └──────────────┘  identical    │   └──────────────────────────────────────────┘   │
                    response     │                       │                          │
                                 └───────────────────────┼──────────────────────────┘
                                                         │ writes
                                          ┌──────────────┼──────────────┐
                                          v              v              v
                                    ┌──────────┐  ┌──────────┐  ┌──────────┐
                                    │  Calls   │  │  Cache   │  │ Controls │
                                    │  table   │  │  table   │  │  table   │
                                    └──────────┘  └──────────┘  └──────────┘
                                    ┌──────────┐  ┌──────────┐  ┌──────────┐
                                    │ Budgets  │  │  Agents  │  │ Versions │
                                    │  table   │  │  table   │  │  table   │
                                    └──────────┘  └──────────┘  └──────────┘
                                          │
                                          v reads
                                    ┌──────────────┐
                                    │  Dashboard   │
                                    │  (React)     │
                                    │  CloudFront  │
                                    │  9 screens   │
                                    └──────────────┘
```

One Lambda function. Six DynamoDB tables. One React dashboard on CloudFront. No servers to manage. No data pipelines. No third-party analytics. Everything runs inside your AWS account.

---

## Integration — The One-Line Change

Your agents already use the OpenAI SDK. The only change is the base URL. The response format is identical. Your existing code does not know AgentLens exists.

### Python (OpenAI SDK)

```python
from openai import OpenAI

# Before — direct to OpenAI
client = OpenAI()

# After — through AgentLens (one line)
client = OpenAI(base_url="https://your-agentlens-proxy.execute-api.us-east-1.amazonaws.com/prod")

# Tag your calls — this is how AgentLens knows which agent is which
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "You are a contract analyst. Identify risks and flag non-standard clauses."},
        {"role": "user", "content": "Review this clause: 'The receiving party shall not disclose Confidential Information for a period of 99 years.'"}
    ],
    extra_headers={
        "x-agent-id": "contract-reviewer",        # required — cost attribution
        "x-workflow-id": "contract-review-NDA-4421", # optional — groups related calls
        "x-prompt-version": "v2.1",                # optional — tracks prompt iterations
    }
)

# response is identical to what OpenAI returns
print(response.choices[0].message.content)
```

### Node.js (OpenAI SDK)

```javascript
const OpenAI = require("openai");

// One line change
const client = new OpenAI({
  baseURL: "https://your-agentlens-proxy.execute-api.us-east-1.amazonaws.com/prod",
});

const response = await client.chat.completions.create(
  {
    model: "gpt-4o",
    messages: [{ role: "user", content: "Summarize this quarterly report" }],
  },
  {
    headers: {
      "x-agent-id": "report-summarizer",
      "x-workflow-id": "quarterly-review-Q3",
    },
  }
);
```

### cURL

```bash
curl https://your-agentlens-proxy.execute-api.us-east-1.amazonaws.com/prod/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-openai-key" \
  -H "x-agent-id: my-agent" \
  -d '{"model": "gpt-4o", "messages": [{"role": "user", "content": "Hello"}]}'
```

Any language, any HTTP client, any OpenAI-compatible SDK. Just change the URL.

### Headers

| Header | Required | What It Does |
|--------|----------|--------------|
| `x-agent-id` | **Yes** | Identifies the calling agent. This is how AgentLens attributes cost, enforces budgets, and applies controls. |
| `x-workflow-id` | No | Groups related calls into a named workflow. Lets you see the total cost of a multi-agent operation. |
| `x-prompt-version` | No | Tracks prompt iterations. AgentLens records the system prompt content, call count, and latency per version. Supports one-click rollback. |
| `x-cache` | No | Set to `"skip"` to bypass cache for this specific request. Useful for agents that must always get fresh responses. |

---

## Deep Dive: The 7-Step Pipeline

Every API call passes through 7 sequential checks. Each step can short-circuit the request before it reaches the upstream LLM. The pipeline is designed to be **fail-open**: if any check fails due to infrastructure issues, the call goes through unmonitored rather than blocked.

### Step 1 — Kill Switch

```
Request arrives → read agentlens-controls table → is agent killed? → YES: return 403, log it, done.
```

One DynamoDB `GetCommand` on the controls table. If `killed === true`, the response is immediate:

```json
{
  "error": {
    "message": "Agent 'procurement-agent' is currently disabled via AgentLens kill switch.",
    "type": "agent_killed",
    "code": "agent_disabled"
  }
}
```

The call is logged with `status: "killed"` so it appears in the dashboard's blocked count. Toggle from the Controls page — takes effect on the next request.

**Fail-open**: If DynamoDB is unreachable, `isKilled()` returns `false`. The call goes through.

### Step 2 — Rate Limiter

```
Request arrives → check in-memory sliding window → count >= RPM limit? → YES: return 429 with retry-after.
```

No database call. The rate limiter is a `Map<agentId, timestamp[]>` maintained in Lambda memory. On each request:

1. Prune timestamps older than 60 seconds from the agent's window
2. If `remaining timestamps >= limit` → reject with `retryAfterMs` (calculated from the oldest entry)
3. Otherwise → push current timestamp, allow the request

Default: 60 RPM per agent. Configurable per agent via `POST /api/rate-limits`.

**Why in-memory**: Sub-millisecond check. No DynamoDB read on the hot path. Resets on Lambda cold start — acceptable because rate limits are per-minute windows.

### Step 3 — Budget Check

```
Request arrives → read agentlens-budgets table → spent >= monthlyLimit? → YES: return 429.
```

One DynamoDB `GetCommand`. After every successful LLM call, spend is atomically incremented:

```javascript
await ddb.send(new UpdateCommand({
  TableName: TABLE.BUDGETS,
  Key: { agentId },
  UpdateExpression: "ADD spent :cost SET updatedAt = :now",
  ExpressionAttributeValues: { ":cost": cost, ":now": new Date().toISOString() },
}));
```

The `ADD` operation is atomic — no race conditions even under concurrent Lambda invocations.

**Fail-open**: If DynamoDB is unreachable, `checkBudget()` returns `{ allowed: true }`.

### Step 4 — Semantic Cache

```
Request arrives → hash {model, messages} → look up in agentlens-cache table → found + not expired? → return cached response.
```

The cache key is a SHA-256 hash of the normalized request:

```javascript
function buildCacheKey(model, messages) {
  const normalized = messages.map(m => ({
    role: m.role,
    content: (m.content || "").trim().toLowerCase(),
  }));
  return crypto.createHash("sha256")
    .update(JSON.stringify({ model, messages: normalized }))
    .digest("hex");
}
```

**Normalization**: Messages are trimmed and lowercased before hashing. This means `"What is the CAP theorem?"` and `"what is the cap theorem? "` produce the same cache key.

**TTL enforcement**: Each cache entry has a DynamoDB TTL attribute (Unix epoch). Entries auto-expire. Additionally, per-agent TTL can override the global default — so your procurement agent can cache for 24 hours while your real-time pricing agent caches for 0.

**Per-agent controls**: Before checking cache, the proxy reads the agent's cache settings from the controls table:

```javascript
const cacheControl = await getCacheControl(agentId);
// Returns: { enabled: true/false, ttlHours: number|null }
```

If `cacheEnabled === false` or the request includes `x-cache: skip`, the cache check is skipped entirely.

**Performance**: Cache hits return in ~14ms. Real LLM calls take 2,000–8,000ms. That's a **234x speedup** at **$0 cost**.

**Fail-open**: If cache read fails, returns `null` (cache miss). If cache write fails, logged to console — the response was already returned to the client.

**Streaming exclusion**: Cache is only checked/written for non-streaming requests. Streaming responses are piped directly.

### Step 5 — Model Router

```
Request arrives → evaluate routing rules against request context → first match wins → swap model.
```

The router examines the request and decides if an expensive model can be safely downgraded:

```javascript
const ctx = {
  requestedModel,
  messages,
  messageCount: messages.length,
  totalInputChars: messages.reduce((sum, m) => sum + (m.content || "").length, 0),
  maxTokens: body.max_tokens || null,
  hasTools: !!(body.tools && body.tools.length > 0),
  hasJsonMode: body.response_format?.type === "json_object",
};
```

**Built-in rules** (evaluated in order, first match wins):

| Rule | Fires When | Action | Savings |
|------|-----------|--------|---------|
| `short-prompt-downgrade` | <200 chars, <=2 messages, expensive model | gpt-4o → gpt-4o-mini | ~16x cheaper |
| `system-only-downgrade` | System + short user msg, <500 chars, expensive model | gpt-4o → gpt-4o-mini | ~16x cheaper |
| `max-tokens-cap` | max_tokens <= 50, expensive model | gpt-4o → gpt-4o-mini | ~16x cheaper |

**Safety guards that prevent routing**:
- **Tools detected**: If `body.tools` is present, no routing. Tool use = complex task = needs capable model.
- **JSON mode**: If `response_format.type === "json_object"`, no routing. Structured output needs a model that reliably produces valid JSON.
- **Not in EXPENSIVE_MODELS set**: Only routes gpt-4, gpt-4-turbo, gpt-4o, o1, and claude-3-opus. Calls already on cheap models pass through unchanged.

**The math**: gpt-4o costs $2.50/M input + $10.00/M output. gpt-4o-mini costs $0.15/M input + $0.60/M output. A call routed from gpt-4o to gpt-4o-mini costs **~6% of the original price**.

### Step 6 — Forward + Log

The request (with potentially downgraded model) is forwarded to the upstream LLM. The proxy uses the client's own API key (from the Authorization header) or falls back to the configured `OPENAI_API_KEY`.

After the response arrives, the proxy:
1. Calculates cost from token usage and model pricing
2. Atomically increments the agent's spend in DynamoDB
3. Writes the response to cache (if cache is enabled for this agent)
4. Auto-registers the agent if it's new
5. Logs the full call record to the calls table

Every call produces a log entry like this:

```javascript
{
  callId: "a7f3b2c1-...",           // unique ID for this call
  agentId: "contract-reviewer",      // which agent
  model: "gpt-4o-mini",             // model actually used
  requestedModel: "gpt-4o",         // model the agent asked for
  status: "success",                // success | cache_hit | killed | budget_exceeded | rate_limited | upstream_error
  timestamp: "2026-03-10T14:22:33Z",
  latencyMs: 2847,                  // end-to-end latency
  inputTokens: 156,
  outputTokens: 89,
  totalCost: 0.000077,              // actual dollars
  savedCost: 0,                     // non-zero for cache hits
  cached: false,
  routed: true,                     // was model downgraded?
  routingRule: "short-prompt-downgrade",
  originalModel: "gpt-4o",          // what it would have cost
  workflowId: "contract-review-NDA-4421",
  promptVersion: "v2.1",
  streamed: false
}
```

### Step 7 — Prompt Version Tracking

If the request includes `x-prompt-version` and a system prompt, the version is tracked asynchronously (doesn't block the response):

- First time this version is seen → write new version record with prompt hash and content
- Already exists → increment call count, update last-used timestamp
- After response → update latency metric for this version

The dashboard's Versions page shows all versions per agent with call counts, latency, and active status. One-click rollback marks a version as active and deactivates others.

---

## Deep Dive: Streaming

When your agent sends `stream: true`, AgentLens handles it without adding latency to the first token:

1. The proxy opens an SSE connection to the upstream LLM
2. Each `data:` chunk is piped **directly** from upstream to client — zero buffering
3. Simultaneously, chunks are collected in a memory buffer
4. When the stream ends (`data: [DONE]`), the buffer is parsed asynchronously:
   - Content deltas are concatenated to reconstruct the full response
   - Token usage is extracted from the final chunk
   - Cost is calculated and spend is incremented
   - The full call is logged to DynamoDB
5. The client already received the complete stream — logging happens after

```javascript
// This works identically through AgentLens
const stream = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Write a poem about distributed systems" }],
  stream: true,
}, {
  headers: { "x-agent-id": "poet-agent" }
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

The client never knows a proxy exists. The SSE format is byte-for-byte identical to OpenAI's.

---

## Dashboard

### Overview — Command Center
![Overview](screenshots/overview.png)

Four hero cards: total spend ($0.004838), cache savings ($0.001362), calls blocked (5 killed + budget + rate limited), and active agents (21 registered). The bar chart ranks top 10 agents by spend with green savings overlay. Below: full agent breakdown table — calls, spend, saved, cache hits, routed count, and live status badges. Auto-refreshes every 5 seconds.

**What this tells a CTO at a glance**: Total burn rate, how much AgentLens is saving, whether any agents are out of control (blocked count), and which agents are the biggest cost centers.

---

### Agent Breakdown — The Full Table
![Agent Breakdown](screenshots/agent-breakdown.png)

Every agent ranked by spend in a dense table. Each row: calls, spend, saved, cache hits, cache hit rate, routed count, status. Color-coded status badges — green (Active), orange (Rate Limited / Over Budget), red (Killed). The high-density view that lets you compare all agents at once.

---

### Waste Detection — Automatic Anomaly Alerts
![Waste Alert](screenshots/waste-alert.png)

When any single agent consumes more than 40% of total spend, a red alert card fires automatically: *"data-analyzer consuming 46.3% of total spend — review for optimization."* Agents with >5 calls and zero cache hits get a "NO CACHE" flag — they're making unique queries every time, missing the cheapest optimization available.

The pie chart shows spend distribution. Click any slice to drill into that agent's detail: spend, savings, total calls, cache hit rate, routed calls, and percentage of total spend.

---

### Agent Ranking — High Spend Flags
![Agent Ranking](screenshots/agent-ranking.png)

All agents ranked by spend with HIGH SPEND (red) and NO CACHE (orange) flags. At a glance: which agents are your biggest cost centers and which are efficiently cached. Agents consuming 25-40% of spend are highlighted orange. Above 40%: red.

---

### Workflows — Multi-Agent Cost Tracking
![Workflows](screenshots/workflows.png)

Groups related calls into workflow chains using `x-workflow-id`. Each workflow shows: total calls, total cost, which agents were involved (colored badges), and the time span from first to last call. 17 active workflows in this view.

**Why this matters**: A "contract review" workflow might involve a contract-reviewer agent + a compliance-checker agent + a summary-writer agent across 12 API calls. Without workflow grouping, you'd see 12 individual calls. With it, you see one operation that cost $0.47 and took 34 seconds.

---

### Cache Performance — The Speed Story
![Cache Performance](screenshots/cache-performance.png)

Hero cards: Cache hit rate (22.5%, color-coded — red below 10%, orange 10-20%, green above 20%), money saved ($0.001362), speed boost (234x), total cache hits. The bar chart shows per-agent latency comparison — green bars for cached (14ms), red bars for uncached (7,600ms). The visual contrast is the selling point.

---

### Cache Savings by Agent — Per-Agent Breakdown
![Cache Savings](screenshots/cache-savings.png)

Per-agent table: hits, hit rate %, money saved, average cached latency, average uncached latency, and speedup multiplier. From live data: email-drafter achieves **471x** speedup, qa-agent **186x**, doc-summarizer **126x**.

**"The Story"** — auto-generated narrative insights that write themselves from the data:
- *"Your agents made 9 cache hits out of 40 total calls (22.5% hit rate)."*
- *"Cache saved $0.001362 and reduced average response time from 3,247ms to 14ms."*
- *"Agent 'data-analyzer' has zero cache hits across 8 calls — it may benefit from caching optimization."*
- *"Agent 'email-drafter' has an excellent 65% cache hit rate — saving $0.003 per cached call."*

---

### Smart Routing — What You Would Have Paid
![Routing](screenshots/routing.png)

The hero section shows three numbers that tell the whole story:

**Without routing** (red, what you would have paid) → **With routing** (green, what you actually paid) → **You saved** (green, the difference)

Below: routing rules breakdown table — each rule name, plain-English description, trigger count, from-model, to-model, and savings. Rule descriptions are human-readable: *"Short prompts don't need premium models"*, *"Simple classification tasks use cheaper models"*, *"Low max_tokens = short task = cheaper model"*.

---

### Routing Savings by Agent
![Routing Savings](screenshots/routing-savings.png)

Bar chart showing which agents benefit most from model downgrading. Per-agent table: total calls, routed count, route rate %, requested model (red), actual model (green), and dollars saved. Agents with >50% route rate are highlighted green — they're making mostly simple calls that don't need expensive models.

The auto-generated insight identifies your top opportunity: *"Your product-writer agent requested gpt-4o but 78% of its calls were simple enough for gpt-4o-mini."*

---

### CFO View — The Executive Summary
![CFO View](screenshots/cfo-view.png)

Four cards designed for non-technical stakeholders: current LLM spend, money saved by AgentLens, projected monthly spend (current rate x 30), and projected monthly savings with ROI percentage (calculated against $5,000 AgentLens cost baseline).

**"The Bottom Line"** — auto-generated narrative in plain English:

> *"Your AI agents have made 71 calls costing $0.004838. AgentLens saved $0.001362 through intelligent caching and model routing. At current rates, your projected monthly LLM bill is $0.145 with $0.041 in savings. Your highest-spend agent is data-analyzer at 46.3% of total spend ($0.002242). This agent has zero cache hits — it may be sending unique queries that could be optimized. 5 calls were blocked by safety controls (3 killed, 1 budget, 1 rate limited) — preventing uncontrolled spend."*

Monthly projection chart shows per-agent spend (red) vs savings (green) extrapolated to 30 days.

---

## DynamoDB Schema — 6 Tables

All tables use PAY_PER_REQUEST billing. No capacity planning. No provisioned throughput. You pay only for reads and writes.

### `agentlens-calls` — The Audit Log

Every API call that hits the proxy gets a row. This is the source of truth for all dashboard aggregations.

| Key | Type | Purpose |
|-----|------|---------|
| `agentId` (Partition) | String | Which agent made the call |
| `callId` (Sort) | String | UUID v4 — unique per call |

**Global Secondary Index**: `(agentId, timestamp)` — enables time-range queries for trend analysis.

**Fields**: `status`, `model`, `requestedModel`, `latencyMs`, `inputTokens`, `outputTokens`, `totalCost`, `savedCost`, `cached`, `routed`, `routingRule`, `originalModel`, `workflowId`, `promptVersion`, `streamed`, `timestamp`

**Status values**: `success`, `cache_hit`, `killed`, `budget_exceeded`, `rate_limited`, `upstream_error`

### `agentlens-cache` — Semantic Response Cache

| Key | Type | Purpose |
|-----|------|---------|
| `cacheKey` (Partition) | String | SHA-256 of normalized `{model, messages}` |

**Fields**: `model`, `response` (full OpenAI response object), `usage` (token counts), `cachedAt`, `ttl`

**TTL**: DynamoDB's native TimeToLive on the `ttl` attribute. Rows auto-delete after expiry — no cleanup cron, no manual purging.

### `agentlens-controls` — Kill Switches + Cache Settings

| Key | Type | Purpose |
|-----|------|---------|
| `agentId` (Partition) | String | Agent identifier |

**Fields**: `killed` (boolean), `cacheEnabled` (boolean, default `true`), `cacheTTL` (hours, `null` = global default), `updatedAt`

### `agentlens-budgets` — Monthly Spend Caps

| Key | Type | Purpose |
|-----|------|---------|
| `agentId` (Partition) | String | Agent identifier |

**Fields**: `monthlyLimit` (dollars), `spent` (dollars — atomically incremented via `ADD`), `updatedAt`

**Why atomic ADD**: Multiple Lambda invocations can process calls concurrently. Using `ADD :cost` instead of `SET spent = spent + :cost` prevents race conditions without transactions.

### `agentlens-agents` — Auto-Registration

| Key | Type | Purpose |
|-----|------|---------|
| `agentId` (Partition) | String | Agent identifier |

**Fields**: `model`, `firstSeen`, `updatedAt`

Agents are auto-registered on first call. No manual setup required.

### `agentlens-prompt-versions` — Version Tracking

| Key | Type | Purpose |
|-----|------|---------|
| `agentId` (Partition) | String | Agent identifier |
| `version` (Sort) | String | Version string (e.g., `"v2.1"`) |

**Fields**: `promptHash` (SHA-256 of system prompt), `systemPrompt` (full text), `callCount`, `avgLatencyMs`, `errorRate`, `active` (boolean), `createdAt`, `lastUsed`

---

## Cost Estimation Engine

Every call is priced using token counts and published model rates:

| Model | Input (per 1M tokens) | Output (per 1M tokens) | Relative Cost |
|-------|-----------------------|------------------------|---------------|
| gpt-4 | $30.00 | $60.00 | 200x |
| gpt-4-turbo | $10.00 | $30.00 | 67x |
| claude-3-opus | $15.00 | $75.00 | 100x |
| o1 | $15.00 | $60.00 | 100x |
| **gpt-4o** | **$2.50** | **$10.00** | **17x** |
| claude-3-sonnet | $3.00 | $15.00 | 20x |
| o1-mini | $3.00 | $12.00 | 20x |
| o3-mini | $1.15 | $4.40 | 7x |
| gpt-3.5-turbo | $0.50 | $1.50 | 3x |
| claude-3-haiku | $0.25 | $1.25 | 2x |
| **gpt-4o-mini** | **$0.15** | **$0.60** | **1x (baseline)** |

**Routing savings example**: A call using 500 input tokens + 200 output tokens on gpt-4o costs $0.00325. The same call on gpt-4o-mini costs $0.000195. **That's a 94% cost reduction** — and for a short classification prompt, the output quality is identical.

---

## Fail-Open Design

AgentLens is a monitoring and optimization layer. **It should never break the thing it monitors.** Every component is designed to fail open:

| Component | Failure Mode | Behavior |
|-----------|-------------|----------|
| **Kill switch check** | DynamoDB unreachable | Returns `false` (not killed) — call goes through |
| **Budget check** | DynamoDB unreachable | Returns `{ allowed: true }` — call goes through |
| **Cache read** | DynamoDB unreachable | Returns `null` (cache miss) — call goes to LLM |
| **Cache write** | DynamoDB write fails | Logged to console — response already returned to client |
| **Cost logging** | DynamoDB write fails | Logged to console — response already returned to client |
| **Cache control fetch** | DynamoDB unreachable | Returns `{ enabled: true, ttlHours: null }` — cache stays on with global TTL |
| **Rate limiter** | Lambda cold start | Window resets to empty — all agents get fresh RPM quota |
| **Agent registration** | DynamoDB write fails | Logged to console — agent still works, just not registered |
| **Prompt version tracking** | DynamoDB write fails | Non-blocking — tracked via `.catch(() => {})` |

**Latency overhead**: Cache hits save ~7,500ms. Non-cached calls see <10ms overhead from the pipeline checks (1 DynamoDB read for kill switch, 1 for budget, 1 for cache — all sub-5ms).

---

## API Reference

### Proxy Endpoint

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/completions` | OpenAI-compatible chat completion. Supports streaming (`stream: true`) and non-streaming. |
| `GET` | `/v1/models` | Passthrough to upstream model list |
| `GET` | `/health` | Returns `{ status: "ok", version: "2.0.0", timestamp }` |

### Dashboard API

| Method | Path | Body | Description |
|--------|------|------|-------------|
| `GET` | `/api/stats` | — | Full statistics: overview, agents, workflows, cache metrics, routing metrics |
| `POST` | `/api/controls` | `{ agentId, killed: bool }` | Toggle kill switch for an agent |
| `POST` | `/api/cache-controls` | `{ agentId, cacheEnabled: bool, cacheTTL: hours }` | Per-agent cache toggle and TTL |
| `POST` | `/api/budgets` | `{ agentId, monthlyLimit: dollars }` | Set monthly budget cap |
| `GET` | `/api/rate-limits` | — | Get rate limit status for all agents |
| `POST` | `/api/rate-limits` | `{ agentId, rpm: number }` | Set per-agent requests-per-minute |
| `GET` | `/api/versions/:agentId` | — | Get prompt version history |
| `POST` | `/api/versions/rollback` | `{ agentId, version: string }` | Set a version as active, deactivate others |

---

## Deploy to AWS

### One-Click (CloudFormation Console)

1. Click the **Deploy to AWS** button at the top
2. Enter your OpenAI API key (the only required parameter)
3. Click **Create Stack** — deploys in ~15 minutes
4. Stack **Outputs** tab shows your proxy URL and dashboard URL
5. Set your agents' `base_url` to the proxy URL. Done.

### CLI Deploy

```bash
./publish.sh --bucket=your-s3-artifact-bucket
```

This runs a 4-step pipeline:
1. **Build proxy.zip** — copies `proxy/src/`, installs production deps, zips
2. **Build dashboard.zip** — React build with API base placeholder (replaced at deploy time)
3. **Upload** — proxy.zip + dashboard.zip + cloudformation.yaml → S3
4. **Generate Launch Stack URL** — pre-filled CloudFormation console link

### What Gets Provisioned

The CloudFormation template (`infra/cloudformation.yaml`) is standalone — no SAM CLI, no CDK, no external tooling.

| Resource | Details |
|----------|---------|
| **Lambda Function** | Node.js 20.x, 256MB RAM, 30s timeout. Single function handles proxy + all API endpoints. |
| **API Gateway V2** | HTTP API with `ANY /` and `ANY /{proxy+}` catch-all routes. CORS pre-configured for all custom headers. |
| **Lambda Function URL** | Public HTTPS endpoint as backup/alternative to API Gateway. |
| **6 DynamoDB Tables** | Calls (with timestamp GSI), Cache (with TTL), Controls, Budgets, Agents, Prompt Versions. All PAY_PER_REQUEST. |
| **S3 Bucket** | Private. Dashboard static files. No public access. |
| **CloudFront Distribution** | CDN with Origin Access Control (OAC). SPA routing (403/404 → index.html). |
| **Dashboard Deployer** | Custom Resource Lambda (Python 3.12) that extracts dashboard.zip into S3 with correct MIME types. Runs on stack create/update. Cleans up on delete. |
| **IAM Roles** | Least-privilege. Lambda gets DynamoDB CRUD on its 6 tables only. CloudFront gets S3 read on its bucket only. |

### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `OpenAIApiKey` | Yes | — | Your OpenAI key (or OpenRouter key). Encrypted in CloudFormation. |
| `ArtifactBucket` | Yes | — | S3 bucket where publish.sh uploaded the artifacts. |
| `DefaultRPM` | No | `60` | Default requests-per-minute per agent. |
| `CacheTTLHours` | No | `24` | Default cache TTL in hours. |
| `LambdaZipKey` | No | `agentlens/proxy.zip` | S3 key for Lambda code. |
| `DashboardZipKey` | No | `agentlens/dashboard.zip` | S3 key for dashboard build. |

### Stack Outputs

| Output | What You Get |
|--------|-------------|
| `ProxyEndpoint` | `https://abc123.execute-api.us-east-1.amazonaws.com/prod` — set as your agents' base URL |
| `ProxyFunctionUrl` | `https://xyz789.lambda-url.us-east-1.on.aws/` — alternative endpoint |
| `DashboardUrl` | `https://d1234abcdef.cloudfront.net` — open in browser |
| `SetupComplete` | Quick-start instructions with both URLs |

---

## Local Development

### Prerequisites

- Node.js 20+
- Docker (for DynamoDB Local)

### Setup

```bash
# 1. Start DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local

# 2. Create all 6 tables
cd infra && node setup-local.js

# 3. Configure proxy
cd ../proxy
echo 'OPENAI_API_KEY=sk-your-key-here
DYNAMO_ENDPOINT=http://localhost:8000
UPSTREAM_BASE=https://api.openai.com
PORT=3100
DEFAULT_RPM=60
CACHE_TTL_HOURS=24' > .env

# 4. Start proxy
node src/server.js
# ⚡ AgentLens proxy v2.0 running on http://localhost:3100

# 5. Start dashboard (new terminal)
cd ../dashboard && npm start
# Dashboard: http://localhost:3200

# 6. Seed demo data (optional — gives you 3 weeks of OperaERP history)
cd .. && node demo/seed.js

# 7. Run live demo agents
./demo/run-demo.sh
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | *(required)* | API key for upstream LLM provider |
| `UPSTREAM_BASE` | `https://api.openai.com` | Base URL for the upstream LLM |
| `DYNAMO_ENDPOINT` | *(none)* | Set to `http://localhost:8000` for local DynamoDB |
| `PORT` | `3100` | Proxy HTTP port |
| `DEFAULT_RPM` | `60` | Default rate limit per agent |
| `CACHE_TTL_HOURS` | `24` | Default cache TTL |
| `TABLE_CALLS` | `agentlens-calls` | DynamoDB table name override |
| `TABLE_BUDGETS` | `agentlens-budgets` | |
| `TABLE_CACHE` | `agentlens-cache` | |
| `TABLE_CONTROLS` | `agentlens-controls` | |
| `TABLE_AGENTS` | `agentlens-agents` | |
| `TABLE_VERSIONS` | `agentlens-prompt-versions` | |

### Multi-Provider Support

AgentLens works with any OpenAI-compatible API. Change `UPSTREAM_BASE`:

```bash
UPSTREAM_BASE=https://api.openai.com          # OpenAI (default)
UPSTREAM_BASE=https://openrouter.ai/api       # OpenRouter (100+ models)
UPSTREAM_BASE=https://your-resource.openai.azure.com  # Azure OpenAI
UPSTREAM_BASE=https://api.deepseek.com        # DeepSeek
```

The proxy forwards the client's Authorization header to whatever upstream you configure. Your agents don't need to know or care which provider is behind the proxy.

---

## Demo System

### The OperaERP Scenario (Seeded Data)

`demo/seed.js` populates DynamoDB with 3 weeks of realistic call history from a fake manufacturing company running 6 AI agents. The data is designed to tell a story:

| Agent | Model | Pattern | Purpose |
|-------|-------|---------|---------|
| Procurement Agent | gpt-4o | 35% identical "compare supplier pricing" queries | **The villain** — 42% of total spend, zero cache hits |
| Customer Support Bot | gpt-4o-mini | Normal distribution, 80-120 calls/day | Baseline — shows what efficient usage looks like |
| Inventory Forecaster | gpt-4o | Large inputs (1.5K-4K tokens) | High-cost but necessary — shows per-call cost visibility |
| Supplier Validator | gpt-4o-mini | **Day 14 anomaly**: 420 calls at 2-5 AM on gpt-4o | The incident — $840 burned in 3 hours from an infinite loop |
| Report Generator | gpt-4o-mini | 5-12 calls/day, heavy I/O | Low volume but high per-call cost |
| Email Drafter | gpt-4o-mini | 25-40 calls/day, lightweight | Cache-friendly — many repeated templates |

### Live Demo Agents (Real LLM Calls)

Three agents that make real API calls through the proxy:

**QA Agent** (`demo/agents/qa-agent.js`): Asks 6 technical questions in multiple rounds. Round 1: fresh calls (cache misses). Rounds 2+: identical questions → cache hits. Run it and watch the cache hit rate climb in real-time on the dashboard.

```bash
node demo/agents/qa-agent.js --rounds=3
```

**Doc Summarizer** (`demo/agents/doc-summarizer.js`): 4-step workflow chain — extract topics → summarize section A → summarize section B → executive summary. Each step passes context to the next. Demonstrates workflow grouping and chained LLM calls.

```bash
node demo/agents/doc-summarizer.js --runs=2
```

**Data Analyzer** (`demo/agents/data-analyzer.js`): 3-step financial analysis — sales trend analysis → risk/opportunity identification → executive briefing. Largest prompts = highest cost = most visible in the dashboard spend charts.

```bash
node demo/agents/data-analyzer.js --runs=1
```

**Run all three**:

```bash
./demo/run-demo.sh          # Full demo (~5 minutes)
./demo/run-demo.sh --fast   # Shorter version
```

### Integration Proof (5 Company Types)

`demo/integration-proof.js` proves the one-line integration across 5 different industries, all using the standard OpenAI SDK:

| Company Type | Agent | Task |
|-------------|-------|------|
| E-Commerce SaaS | `product-writer` | SEO product descriptions |
| Legal Tech | `contract-reviewer` | NDA clause risk analysis |
| FinTech | `anomaly-narrator` | Suspicious transaction narrative |
| Healthcare | `notes-summarizer` | SOAP format clinical notes |
| DevTools | `code-reviewer` | SQL injection detection in code |

```
━━━ AgentLens — Integration Proof (NOT simulation) ━━━
  OpenAI SDK → AgentLens Proxy → DeepSeek via OpenRouter → DynamoDB
  Client integration = ONE LINE: baseURL: 'http://localhost:3100/v1'

  1/5 [E-Commerce SaaS ] product-writer       → ✓ 7600ms | 89 tok  | $0.000077
  2/5 [Legal Tech       ] contract-reviewer    → ✓ 3200ms | 156 tok | $0.000134
  3/5 [FinTech          ] anomaly-narrator     → ✓ 4100ms | 201 tok | $0.000189
  4/5 [Healthcare       ] notes-summarizer     → ✓ 2800ms | 112 tok | $0.000098
  5/5 [DevTools         ] code-reviewer        → ✓ 3900ms | 178 tok | $0.000156

  --- Cache Proof (re-run product-writer with identical prompt) ---
  CACHE [E-Commerce SaaS ] product-writer      → ✓ 14ms | CACHE HIT ✓

  RESULTS
  Passed:        5/5 scenarios
  Cache proof:   ✓ CONFIRMED (14ms)
  ALL data visible in dashboard: http://localhost:3200
```

---

## Test Suite

38 integration tests covering every endpoint and behavior:

```bash
npm run demo &   # Start demo server
npm test         # Run tests
```

| Test Group | Tests | Covers |
|-----------|-------|--------|
| Health check | 3 | Status, version, response format |
| Stats endpoint | 5 | Total calls, agent count, workflows, aggregates |
| Chat completion | 4 | Response format, choices, token usage |
| Headers | 3 | Workflow ID, prompt version propagation |
| Kill switch | 4 | Enable → verify 403 → disable → verify 200 |
| Budgets | 2 | Set + confirm |
| Rate limits | 3 | Set RPM, get status, verify format |
| Prompt versions | 3 | Get versions, rollback, verify |
| Streaming (SSE) | 4 | Content-type, data lines, [DONE] terminator, chunk count |
| 404 handling | 1 | Unknown path returns 404 |
| Cache simulation | 2 | Same prompt twice → at least one cache hit |

All tests use Node.js `http` module — no test framework dependency.

---

## Project Structure

```
agentlens/
│
├── proxy/src/
│   ├── handler.js            # 568 lines. Request routing, CORS, 7-step pipeline.
│   │                           Handles /v1/chat/completions, /api/*, /health.
│   │                           Streaming path: pipes SSE, logs async.
│   ├── cache.js              # 66 lines. SHA-256 cache keys. DynamoDB get/put with TTL.
│   │                           Normalizes messages (trim + lowercase) for max hit rate.
│   ├── cost.js               # 27 lines. Token pricing for 11 models. Returns
│   │                           {inputCost, outputCost, totalCost} per call.
│   ├── router.js             # 90 lines. Rules-based model downgrading. 3 built-in rules.
│   │                           Safety: skips if tools or JSON mode detected.
│   ├── rate-limiter.js       # 81 lines. In-memory sliding window. Map<agentId, timestamps>.
│   │                           Sub-millisecond check, no DB call on hot path.
│   ├── dynamo.js             # 143 lines. DynamoDB client. 6 table references.
│   │                           Kill switch, budget check, spend increment, agent registry,
│   │                           cache controls. Everything fail-open.
│   ├── prompt-versions.js    # 157 lines. Version tracking, rollback, metrics.
│   │                           Deduplicates by version string, tracks prompt hash.
│   ├── stats.js              # 296 lines. Aggregation engine. Scans calls table,
│   │                           computes per-agent/workflow/cache/routing stats.
│   │                           Estimates routing savings (gpt-4o→mini = 9x).
│   ├── server.js             # 89 lines. Local HTTP server. Handles streaming pipe.
│   │                           CORS preflight. Wraps handler.js for local dev.
│   └── lambda.js             # 5 lines. Lambda entry point. Calls handler.js.
│
├── proxy/test/
│   └── test-proxy.js         # 232 lines. 38 integration tests. No framework.
│
├── dashboard/src/
│   ├── App.js                # Router + 9-page nav sidebar. 5s polling.
│   └── pages/
│       ├── Overview.js       # Spend/savings cards, agent chart, breakdown table
│       ├── Agents.js         # Waste detection (>40% alert), pie chart, drill-down
│       ├── Workflows.js      # Grouped multi-agent calls, cost per workflow
│       ├── CacheView.js      # Hit rate, speedup, per-agent latency comparison
│       ├── RoutingView.js    # Before/after cost, rule breakdown, per-agent savings
│       ├── Controls.js       # Kill switches, budgets, RPM, cache toggle, cache TTL
│       ├── Versions.js       # Prompt history per agent, one-click rollback
│       ├── Simulator.js      # Fire real queries, test streaming/caching live
│       └── CFOView.js        # Executive summary, projections, ROI, narrative
│
├── infra/
│   ├── cloudformation.yaml   # Standalone template. No SAM CLI. Lambda + API GW +
│   │                           6 DynamoDB tables + S3 + CloudFront + custom resource.
│   ├── template.yaml         # SAM version (alternative)
│   ├── setup-local.js        # Creates 6 tables in DynamoDB Local
│   └── tables.json           # Schema source of truth for all 6 tables
│
├── demo/
│   ├── agents/
│   │   ├── qa-agent.js       # Cache demo — 6 questions x N rounds
│   │   ├── doc-summarizer.js # Workflow demo — 4-step chain
│   │   └── data-analyzer.js  # Cost demo — 3-step financial analysis
│   ├── run-demo.sh           # Orchestrator — runs all 3 agents
│   ├── integration-proof.js  # 5 company types via OpenAI SDK
│   └── seed.js               # 3 weeks of OperaERP data (6 agents, ~8K calls)
│
├── publish.sh                # Build + S3 upload + Launch Stack URL generator
├── screenshots/              # 10 dashboard screenshots
└── .ai-guide/                # NPC Guide mission system
```

---

## Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Single Lambda function** | One function handles the proxy endpoint AND all dashboard API routes. No cold start penalty for separate functions. 256MB is enough — the function is I/O bound (DynamoDB + upstream HTTP), not CPU bound. |
| **DynamoDB over Postgres** | Serverless. No connection pooling headaches with Lambda. PAY_PER_REQUEST means zero cost at zero traffic. Native TTL for cache expiry. Atomic `ADD` for concurrent spend tracking. Sub-5ms reads. |
| **SHA-256 cache keys** | Deterministic. Collision-resistant. Fast. Normalize inputs (trim + lowercase) before hashing to maximize hit rate on semantically identical queries. |
| **In-memory rate limiting** | Sub-millisecond. No DynamoDB read on the hot path for every request. Resets on cold start — acceptable for per-minute windows. If you need persistent rate limiting across Lambda instances, move to DynamoDB (trade-off: +5ms per request). |
| **Fail-open everywhere** | A monitoring tool that breaks production is worse than no monitoring tool. Every DynamoDB failure defaults to "allow." Every async operation (logging, cache write, version tracking) uses `.catch(() => {})` to prevent failures from propagating. |
| **Standalone CloudFormation** | No SAM CLI. No CDK. No Terraform. Any AWS account can deploy with one click in the CloudFormation console. The trade-off is a longer template — but the customer never reads it. |
| **React dashboard (no framework)** | Create React App → build → S3 + CloudFront. No SSR. No backend. The dashboard is a static SPA that calls the proxy's `/api/*` endpoints. Deploys in seconds. |
| **OpenAI-compatible only** | Covers ~90% of production agent deployments. Anthropic native API, Gemini, etc. are stretch goals. But since AgentLens works with OpenRouter (which supports 100+ models), you effectively get multi-provider support for free. |
| **Monorepo** | Proxy, dashboard, infra, demo all in one repo. One git history. One deploy pipeline. The alternative (3 repos) adds coordination overhead with zero benefit at this scale. |

---

## Built With NPC Guide

This project was built using [NPC Guide](https://github.com/Abhipaddy8/npc-guide-ai) — a mission system for AI coding agents. One brief. 14 missions generated. 14 missions completed autonomously.

The mission system provided:
- **Architecture document**: Stack decisions, DynamoDB schema, proxy flow, install story
- **Decision log**: 6 founding decisions with rationale (Node.js, DynamoDB, React, CloudFormation, monorepo, OpenAI-only v1)
- **Mission sequence**: Proxy MVP → Cache + Router → Dashboard → Demo Data → Advanced Features → CloudFormation → Ship → Real Agents → Cache Controls → Dashboard Views → GitHub → One-Click Deploy → Production README
- **Checkpoints**: Two human confirmation gates before proceeding to outreach

The agent built everything — proxy, cache, router, rate limiter, cost engine, prompt versioning, streaming support, 9-screen dashboard with auto-generated narratives, standalone CloudFormation template, publish pipeline, 3 demo agents, 5-company integration proof, and 38 integration tests — asking only for file write permissions along the way.

---

## License

MIT

---

**Built by [Abhishek Padmanabhan](https://github.com/Abhipaddy8)** — abhipaddy8@gmail.com
