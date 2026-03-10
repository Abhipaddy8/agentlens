# Mission Map

**Project**: AgentLens
**Intent**: build → ship → client-ready → live demo → outreach
**Total Missions**: 14
**Current**: Checkpoint 2

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

## Phase 3 — Sell It

- 🔒 **13 — Demo + Outreach** — Loom recording walking through real agent demo (not seeded data). Pitch deck (PDF). Outreach to KB/docs SaaS CTOs with AgentLens as the product.
  - **Agent A**: Build pitch deck (HTML → PDF via weasyprint). Slides: problem, solution, architecture, live dashboard screenshots, pricing, CTA.
  - **Agent B**: Prepare Loom script — bullet points for 3-min walkthrough of real agents → dashboard → CFO view
  - **Sequential**: Record Loom, send outreach via /outreach skill

- 🔒 **14 — Stretch Goals** — Python SDK snippet, multi-provider routing (Anthropic/Gemini), alerting webhooks (Slack/email on budget breach), usage export CSV.
