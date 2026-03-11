# Mission Map

**Project**: AgentLens
**Intent**: build → ship → client-ready → live demo → outreach → platform
**Total Missions**: 28
**Architecture Bible**: TechStack Tetris Mission Reference (30 missions, 6 worlds, 165 code steps) — pipeline blocks pattern, progressive complexity, crash recovery, safe rollout, query routing all absorbed into Phase 5.
**Current**: Mission 24 — Integration Prompts

---

## Completed

- ✅ **1 — Proxy MVP** — Node.js Lambda. One OpenAI-compatible endpoint (`/v1/chat/completions`). DynamoDB writes (calls table). Kill switch check, budget check, passthrough to OpenAI. `x-agent-id` header parsing. Returns identical response format.
- ✅ **2 — Cache + Router** — DynamoDB reads for semantic cache (cache table). Rules-based model router. Budget tracking (budgets table). Real savings visible in call logs.
- ✅ **3 — Dashboard** — React app, 7 screens. Overview, Agents, Workflows, Controls, Versions, Simulator, CFO View.
- ✅ **4 — OperaERP Demo** — Seed DynamoDB with 3 weeks of realistic data. 6 agents. Procurement Agent villain (42% spend, $1,840/month on one pattern). Day 14 anomaly (Supplier Validator loop, $840 in 3 hours). Live simulator firing real queries through real proxy.
- ✅ **5 — Advanced Features** — Workflow grouping (`x-workflow-id`). Per-agent rate limiting (RPM ceiling). Prompt versioning (version, track quality, one-click rollback). Streaming pass-through (log async, first token no delay).
- ✅ **6 — CloudFormation** — SAM template: Lambda + 6 DynamoDB tables + HTTP API Gateway + S3 + CloudFront (OAC). 3 parameters (OpenAI key, RPM, cache TTL). Deploy script with 4-step pipeline. `npm run deploy` one-command.
- ✅ **7 — Ship** — 38/38 integration tests passing. INSTALL.md with 3-step install story. Full env var docs. All endpoints documented. Demo server runs standalone.

---

## Phase 1 — Prove It Works (build + confirm)

- ✅ **8 — Real Agents Demo** — 3 real Node.js agent scripts + orchestrator + integration proof (5 company types via OpenAI SDK). All end-to-end confirmed: agent → proxy → LLM → DynamoDB → dashboard. Cache hits at 14ms. Model routing confirmed (gpt-4o → gpt-4o-mini).

- ✅ **9 — Per-Agent Cache Controls** — Cache on/off toggle + per-agent TTL in Controls page. `x-cache: skip` header. Backend + frontend + API endpoint. Default: cache ON. Fail-open.

- ✅ **10 — Dashboard: Cache & Routing Views** — Two new pages. Cache View: 234x speedup visualization, per-agent hit rates, latency comparison chart, auto-generated insights. Routing View: "what you would have paid" comparison, per-rule breakdown, per-agent routing stats. Stats API enriched with cache/routing detail. Dashboard now 9 screens.

> **🛑 CHECKPOINT 1**: Abhishek confirms dashboard views show compelling data story.

---

## Phase 2 — Ship It (package + confirm)

- ✅ **11 — GitHub + Self-Contained Template** — Pushed to https://github.com/Abhipaddy8/agentlens. Standalone CloudFormation (no SAM). Lambda code via S3 zip. Dashboard deployed via CF custom resource. `publish.sh` generates Launch Stack URL. 61 files, 26,397 lines.

- ✅ **12 — One-Click Deploy** — README with Deploy to AWS badge, ASCII architecture diagram, before/after integration code, full API reference. CloudFormation outputs include SetupComplete with proxy URL + dashboard URL + next steps.

> **🛑 CHECKPOINT 2**: Abhishek confirms one-click deploy works before outreach.

---

## Phase 2.5 — The README Is The Product

- ✅ **13 — Production README** — The README is the first thing a CTO sees. It must sell AND educate. Not a docs page — a technical sales document that proves architectural depth.

  **Structure** (in this order):
  1. **Hero** — One-liner, tagline, Deploy badge. No fluff.
  2. **The Problem** — 3-paragraph story. Your agents are burning money. You have no visibility. Your bill is 5x what you expected. Make it visceral.
  3. **The Solution (30-second version)** — What AgentLens does in 5 bullet points. Cache, route, kill, budget, dashboard. Each bullet = one sentence with a real number.
  4. **Architecture Diagram** — Full ASCII diagram showing the 7-step pipeline. Not a simple box diagram — show the decision tree. Every step labeled: kill switch → rate limit → budget → cache → router → forward → log.
  5. **Integration (The One-Line Change)** — Python, Node.js, cURL examples. Show before/after. Show header tagging. Show that the response format is identical. This is the "holy shit it's that easy" moment.
  6. **Deep Dive: The 7-Step Pipeline** — One section per step. For EACH step: what it does, how it decides, what happens on failure (fail-open), the actual code pattern (not full code — the key 5-10 lines that show the logic). Include the cache key generation, the routing rules table, the sliding window algorithm, the atomic spend increment.
  7. **Deep Dive: Streaming** — How SSE pass-through works. Zero buffering delay. Async logging. The fact that the client never knows a proxy exists.
  8. **Dashboard — 9 Screens** — Each screenshot with 2-3 sentence explanation. Not "this is the overview page." Instead: "The Overview shows your total spend ($4,838), cache savings ($1,362), and 5 blocked calls. The bar chart ranks your top 10 agents by spend. The procurement-agent is consuming 42% — the red flag that led to a $20K/year saving."
  9. **DynamoDB Schema** — All 6 tables. Key schema, fields, design rationale. Why TTL on cache. Why atomic ADD on budgets. Why fail-open on controls.
  10. **Cost Engine** — Full model pricing table. How routing savings are calculated. The math: gpt-4o→mini = 16x cost reduction.
  11. **Fail-Open Philosophy** — Dedicated section. Every failure mode documented. "AgentLens never blocks a legitimate call due to its own issues." This is what enterprise buyers need to see.
  12. **API Reference** — Every endpoint, method, body, header. Clean tables.
  13. **Deploy to AWS** — One-click flow. What gets provisioned (every resource). Parameters. Outputs. The publish.sh pipeline.
  14. **Local Development** — Full setup guide. Env vars. Multi-provider support (OpenRouter, Azure).
  15. **Demo System** — All 3 agents explained. The 5-company integration proof with sample terminal output.
  16. **Test Suite** — 38 tests, what they cover.
  17. **Project Structure** — Tree with one-line descriptions per file.
  18. **Architecture Decisions** — Table format: decision + rationale. Node.js, DynamoDB, SHA-256, in-memory rate limiting, fail-open, standalone CF.
  19. **Built with NPC Guide** — The story. 14 missions, autonomous execution.
  20. **GTM Context** — Brief section: "AgentLens is targeting companies spending $15K+/month on LLM API calls. The proxy pays for itself in the first week." Links to live demo if available.

  **Tone**: Technical but confident. Like a senior architect explaining their system to another senior architect who's evaluating whether to buy it. No marketing fluff. Every claim backed by a real number or real code. The README should make someone think "these people actually built something serious."

  **Quality bar**: Read every sentence. If it says something generic like "real-time dashboard with 9 screens" — replace it with specifics: "9-screen dashboard: per-agent cost breakdown, cache hit rate visualization (234x speedup), waste detection alerts, model routing before/after comparison, and a CFO view that projects monthly savings in plain English."

  **Anti-patterns to avoid**:
  - "What It Does" lists that just name features without numbers
  - Architecture diagrams that look like every other SaaS readme
  - Screenshots without context ("Overview page" → instead: what the numbers mean and why they matter)
  - Generic deploy instructions without showing what actually gets created
  - Missing the fail-open story (this is the #1 enterprise objection: "will your proxy break my agents?")

  **Deliverable**: Single `README.md` file. No separate docs folder. Everything in one scroll. Target: 800-1200 lines. A CTO should be able to read this in 15 minutes and know exactly what they're deploying, how it works, and why it won't break their system.

---

## Agent Assignments

Three parallel agents per mission. Each runs in an isolated worktree. No file overlap.

| Agent | Role | Scope |
|-------|------|-------|
| **F** | Frontend | React, UI, CSS, chat, games, cards |
| **B** | Backend | API, logic, NPC Guide, DynamoDB, memory |
| **I** | Infra | CloudFormation, Lambda, deploy, CI/CD |

| # | Mission | Agent F | Agent B | Agent I |
|---|---------|---------|---------|---------|
| 14 | Deploy Button + Live Demo | Seed demo data, deploy dashboard to Vercel | — | Run `publish.sh`, generate CF launch URL, swap placeholder |
| 15 | Shadow Mode SDK | Dashboard shadow mode section (calls captured, projected savings) | `shadow.js` + `shadow-client.js`, `shadow_mode` flag in logging | — |
| 16 | Anomaly Detection Worker | Controls page anomaly log (last 10 alerts) | `anomaly-worker.js`, 5 detection rules, freeze + alert logic | CF: CloudWatch Events rule, 7th DynamoDB table (`agentlens-anomalies`) |
| 17 | Demo + Outreach | — | Loom script bullet points | Pitch deck (HTML → PDF via weasyprint) |
| 18 | Stretch Goals | — | Python SDK snippet, CSV export endpoint | Multi-provider routing config |
| 19 | Fork & Strip | Gut Chatbot UI → clean shell (keep streaming, rendering, dark theme, sidebar) | Wire `/api/chat` endpoint stub | Deploy shell to Vercel |
| 20 | Conversation Controller | Loading states, thinking indicator, phase labels, brief completion % bar | Stateful controller: field tracking, flow decisions, LLM response generation | — |
| 21 | Brief Compilation + NPC Guide | Pipeline blocks card, mission map inline UI, confirmation prompt | Wire `parseBriefWithLLM()` → `buildMissionMap()` → `enrichMissionMap()`, brief compiler | — |
| 22 | Build Progress + Games | Game selector (Tetris/Snake/Pac-Man), pause/resume, score, progress cards, live log expand | SSE/websocket build runner, progress event emitter | — |
| 23 | Guardrails + Schema + Crash Recovery | — | Guardrails file, `agentlens-agent.json` schema, checkpoint writer, retry handler, reconciliation validator, proxy auto-wire | CF: update template for proxy auto-wiring on agent deploy |
| 24 | Integration Prompts | Inline OAuth button + API key input components in chat flow | OAuth flows (HubSpot, Slack, Google, Salesforce), credential storage, MCP URL handler | — |
| 25 | Deploy + Safe Rollout | "Agent is live" card, rollback notification UI | Deploy pipeline (provision Lambda, wire triggers, connect integrations, register dashboard), shadow tester, quality evaluator, rollback switch | CF: agent Lambda template, webhook wiring, per-agent resources |
| 26 | Activity Feed + Memory + Query Routing | Activity feed component (plain English), memory "it remembered" UI | 4 DynamoDB memory tables, memory inject/consolidate, query classifier → tool selector → data source router | CF: 4 new DynamoDB tables in template |
| 27 | Human-in-the-Loop | Approval request card, autonomy config UI | Pause/resume engine, Slack webhook sender, WhatsApp integration, response listener | — |
| 28 | Agency Multi-Tenant | Agency dashboard (all clients/agents), client switcher | Tenant isolation (separate memory, budgets), billing rollup logic | CF: per-tenant resource isolation |

---

## Phase 3 — Ship Ready

- ✅ **14 — Fix Deploy Button + Live Demo** — Two deliverables:

  **A) Deploy Button**: Replace `LAUNCH_STACK_URL_PLACEHOLDER` in README.md with a real CloudFormation launch URL. Run `publish.sh` to generate the URL, swap the placeholder. The Deploy to AWS badge must open a working CloudFormation console link with template URL and ArtifactBucket parameter pre-filled.

  **B) Live Demo on Vercel**: Deploy the dashboard to Vercel as a public demo link. Seed it with the OperaERP demo data so visitors see a populated dashboard immediately — not an empty screen. The demo should use the demo server (mock backend, no real OpenAI key needed). Add the live demo URL to the README hero section as a "Try Live Demo" badge next to the Deploy to AWS badge. URL format: `https://agentlens-demo.vercel.app` or similar.

- ✅ **15 — Shadow Mode SDK** — Create `proxy/src/shadow.js` and `sdk/shadow-client.js`. Shadow mode wraps an existing OpenAI client. Every call goes to OpenAI normally AND fires an async non-blocking copy to the AgentLens proxy. The copy is never awaited. Zero latency impact.

  ```javascript
  const openai = AgentLens.shadow(new OpenAI({ apiKey }), {
    proxyUrl: "https://their-agentlens-proxy.amazonaws.com",
    customerId: "lenskart",
    mode: "shadow"
  });
  ```

  - Add `shadow_mode: true` flag to every call logged from shadow installs
  - Dashboard Overview shows Shadow Mode section: calls captured, projected savings, days until full report
  - After 14 days of shadow data → auto-generate Shadow Mode Report with real waste numbers from actual production traffic

- ✅ **16 — Anomaly Detection Worker** — Create `proxy/src/anomaly-worker.js`. Lambda scheduled event on 5-minute interval (add CloudWatch Events rule to `infra/cloudformation.yaml`). Five detection rules:

  | Rule | Trigger | Action |
  |------|---------|--------|
  | `spend_spike` | Agent hourly spend > 3x rolling average | Auto-freeze agent + alert |
  | `loop_detected` | Same agent + query hash > 10x in 5 min | Auto-freeze agent + alert immediately |
  | `budget_warning` | Monthly spend > 90% of ceiling | Auto-downgrade model + alert |
  | `error_spike` | Error rate > 10% in 10 min window | Alert only |
  | `concentration` | Single agent > 45% of total spend | Alert only, flag in dashboard |

  - Freeze = write `killed: true` to controls table → next proxy call hits kill switch
  - Alert = POST to `SLACK_WEBHOOK_URL` env var (optional)
  - Add `agentlens-anomalies` as 7th DynamoDB table in CloudFormation
  - Dashboard Controls page gets Anomaly Log section (last 10 alerts: timestamp, rule, agent, action)
  - Add `SLACK_WEBHOOK_URL` to CloudFormation parameters (optional, no default)

---

## Phase 4 — Sell It

- ⏭ **17 — Demo + Outreach** (skipped — revisit later) — Loom recording walking through real agent demo (not seeded data). Pitch deck (PDF). Outreach to KB/docs SaaS CTOs with AgentLens as the product.
  - **Agent A**: Build pitch deck (HTML → PDF via weasyprint). Slides: problem, solution, architecture, live dashboard screenshots, pricing, CTA.
  - **Agent B**: Prepare Loom script — bullet points for 3-min walkthrough of real agents → dashboard → CFO view
  - **Sequential**: Record Loom, send outreach via /outreach skill

- ⏭ **18 — Stretch Goals** (skipped — revisit later) — Python SDK snippet, multi-provider routing (Anthropic/Gemini), usage export CSV.

---

## Phase 5 — Agent Studio

> AgentLens evolves from a tool to a platform. The proxy is the wedge. Agent Studio is the product.
> Chat-first no-code agent builder. User describes what they want → NPC Guide builds it autonomously → one-click deploy.
> Fork: Chatbot UI (mckaywrigley/chatbot-ui). Next.js + TypeScript + Tailwind.

- ✅ **19 — Fork & Strip** — Fork Chatbot UI. Gut: Supabase auth, OpenAI direct proxy, model picker, any features that assume "chat with an LLM." Keep: message rendering, token-by-token streaming (sub-30ms per token), sidebar, input bar, dark theme. Result: clean chat shell that sends messages to `/api/chat`, not OpenAI. Verify streaming renders token-by-token under 30ms. Deploy shell to Vercel to confirm it works standalone.

- ✅ **20 — Conversation Controller** — Stateful backend behind `/api/chat`. Not a dumb LLM proxy — tracks what's been collected (project type? integrations? constraints?), decides what to ask next, knows when the brief is complete. Uses LLM to generate conversational responses, but the controller decides the flow. Returns streaming responses + metadata (brief completion %, current phase). Interactive loading states throughout — animated thinking indicator, phase labels, never a blank screen. User always knows what's happening.

- ✅ **21 — Brief Compilation + NPC Guide Integration** — When controller says "brief complete" → compile conversation into raw brief string → `parseBriefWithLLM()` → `buildMissionMap()` → `enrichMissionMap()`. Show mission map card inline in chat with **pipeline blocks** visible — not just "Mission 2: Core Loop" but `[Input Handler] → [Query Router] → [CRM Connector] → [Slack Sender] → [Error Handler]`. User sees WHAT is being built, not just that something is being built. User confirms → NPC Guide starts executing. Loading state during compilation with phase indicator.

- ✅ **22 — Build Progress UI + Games** — When NPC Guide is executing, user sees phase cards with live progress inline in chat: "Mission 2/6 — Core Loop — building CRM check logic..." via SSE/websockets from build runner. For background tasks longer than ~3 seconds, a game selector slides in: Tetris, Snake, or Pac-Man (open source React/Canvas components). Game pauses when system has something to say → message slides in → user responds → game resumes if system goes back to work. Score persists across pauses. Build completes → blocks clear → "Your agent is ready." Power users can expand a live log stream instead.

- ✅ **23 — Guardrails + Agent Schema + Crash Recovery** — Guardrails file injected into every NPC Guide build session. Enforces: valid output schema, no hardcoded secrets, mandatory budget cap, mandatory fallback model, error handling on every tool call, minimum 5 integration tests, no email sends without human confirmation, no direct production DB writes. **Crash recovery mandatory**: every built agent gets checkpoint writing at each step, retry with exponential backoff on failure, reconciliation check on restart (inspired by TechStack Tetris 3-5: Stripe crash recovery pattern — checkpoint writer, state store, failure detector, retry handler, reconciliation validator). Agent crashes mid-run → restarts from last checkpoint, not from scratch. Define `agentlens-agent.json` v1 schema — the standard output format every built agent must produce (entry point, triggers, integrations, schedule, memory config, human-in-the-loop rules, checkpoint config). Build fails if schema is invalid. **Every built agent is auto-wired through the AgentLens proxy** — all LLM calls go through the observability layer. No agent deploys without full World 4 coverage: request timing, LLM logging, cost profiling, alerts (TechStack Tetris 4-2 pattern).

- ▶ **24 — Integration Prompts** — Brief parser detects integration keywords ("Slack", "HubSpot", "Google Sheets") → conversation controller surfaces OAuth button or API key input inline in the chat. Not a settings page — right in the conversation flow. OAuth for HubSpot, Slack, Google, Salesforce. API key input for others. MCP URL support for power users. Credentials stored securely, wired into agent build.

- 🔒 **25 — One-Click Deploy + Safe Rollout** — User says "deploy." AgentLens provisions Lambda, wires webhook/cron trigger, connects integrations, auto-wires through proxy, registers agent in observability dashboard (existing 9-screen dashboard from M3/M10). Agent goes live. Chat shows: "Your agent is live. Here's the activity feed." Under 2 minutes from deploy command to live agent. **For agent updates**: user says "update my agent to also check Salesforce" → NPC Guide rebuilds → new version shadow-tested against old version (TechStack Tetris 4-5 pattern: feature flag, shadow tester, quality evaluator, rollback switch). If quality holds → cut over. If regression detected → auto-rollback, notify user. Never a blind swap on a running agent.

- 🔒 **26 — Activity Feed + Memory + Query Routing** — Plain English run summaries inline in chat. "Ran at 9am, checked 47 deals, found 3 stale, sent Slack summary. Cost: $0.03." No logs, no JSON. Memory system: 4 DynamoDB tables — `agent_memory_long` (persists forever, importance scored), `agent_memory_short` (current run, cleared on completion), `agent_memory_shared` (account-level, readable by all agents), `agent_sessions` (run archive, plain English). Session start injects top 10 memories. Session end consolidates. User sees "it remembered" — never sees the infra. **Query routing layer** (TechStack Tetris 3-2 pattern): built agents get intelligent routing — query classifier decides whether to search the web, query a DB, pull from documents, or call an API. Not hardcoded tool chains. Agent decides the right data source per query. Pipeline blocks: Query Classifier → Tool Selector → Data Source Router → Confidence Gate.

- 🔒 **27 — Human-in-the-Loop** — Agent pauses at decision points. Sends question to Slack or WhatsApp. Human responds. Agent continues. Configurable per action: which actions need approval vs run autonomously. Trust widens over time as user grants more autonomy. Non-technical clients stay in control without watching every run.

- 🔒 **28 — Agency Multi-Tenant** — One account, multiple client environments. Agency owner sees all agents across all clients in a single dashboard. Each client's agents are isolated (separate memory, separate budgets). Billing rolls up to the agency. Agency plan: up to 10 agents at $299/month.
