# Mission Map

**Project**: AgentLens
**Intent**: build → ship → client-ready → live demo → outreach
**Total Missions**: 15
**Current**: Checkpoint 2.5 (README complete)

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

## Phase 3 — Sell It

- 🔒 **14 — Demo + Outreach** — Loom recording walking through real agent demo (not seeded data). Pitch deck (PDF). Outreach to KB/docs SaaS CTOs with AgentLens as the product.
  - **Agent A**: Build pitch deck (HTML → PDF via weasyprint). Slides: problem, solution, architecture, live dashboard screenshots, pricing, CTA.
  - **Agent B**: Prepare Loom script — bullet points for 3-min walkthrough of real agents → dashboard → CFO view
  - **Sequential**: Record Loom, send outreach via /outreach skill

- 🔒 **15 — Stretch Goals** — Python SDK snippet, multi-provider routing (Anthropic/Gemini), alerting webhooks (Slack/email on budget breach), usage export CSV.
