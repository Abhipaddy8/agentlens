# Architecture — AgentLens

## What It Is
Proxy layer + dashboard between AI agents and LLM providers. Deployed in customer's AWS account. Managed infrastructure as a service.

## Stack
- **Proxy**: Node.js on AWS Lambda behind API Gateway
- **Database**: DynamoDB (5 tables: calls, budgets, cache, controls, agents)
- **Dashboard**: React on CloudFront (S3 static hosting)
- **Infra**: CloudFormation for one-click deploy
- **Runtime**: Node.js 20.x

## Project Structure
```
agentlens/
├── proxy/              # Lambda function — the core product
│   ├── handler.js      # Main Lambda handler
│   ├── middleware/      # kill-switch, budget, cache, router, logger
│   └── lib/            # DynamoDB client, OpenAI forwarder
├── dashboard/          # React app — 5 screens
│   ├── src/
│   └── public/
├── infra/              # CloudFormation templates
│   └── template.yaml
├── demo/               # OperaERP seed data + simulator
│   ├── seed.js
│   └── simulator.js
├── .ai-guide/          # NPC Guide mission system
└── package.json
```

## DynamoDB Tables

### calls (audit log)
- PK: agentId, SK: timestamp
- Fields: model, tokens_in, tokens_out, cost, latency_ms, cached, workflow_id, prompt_hash

### budgets (spend counter)
- PK: agentId, SK: period (daily/monthly)
- Fields: spent, limit, alert_threshold

### cache (zero-cost repeated queries)
- PK: prompt_hash
- Fields: response, model, created_at, hit_count, ttl

### controls (kill switch)
- PK: agentId
- Fields: enabled (boolean), rate_limit_rpm, budget_limit, updated_by, updated_at

### agents (registry)
- PK: agentId
- Fields: name, description, owner, created_at, tags

## Proxy Flow (per call)
1. Receive request at `/v1/chat/completions`
2. Extract `x-agent-id` header (required)
3. Check kill switch (controls table) → reject if disabled
4. Check budget (budgets table) → reject if exceeded
5. Check cache (cache table) → return cached if hit
6. Route model (rules engine) → swap model if rules match
7. Forward to OpenAI
8. Log call (calls table) → async, don't block response
9. Return identical OpenAI response format

## Key Headers
- `x-agent-id` — required, identifies the calling agent
- `x-workflow-id` — optional, groups calls into workflows
- `Authorization` — Bearer token, passed through to OpenAI

## Install Story (Customer)
1. Click CloudFormation link → deploys in 18 min
2. Set `OPENAI_BASE_URL` to proxy endpoint
3. Add `x-agent-id` header to each agent
4. Real data in 24 hours

## Demo: OperaERP
Fake mid-size manufacturing company. 6 agents:
1. Procurement Agent (villain — 42% spend)
2. Supplier Validator (Day 14 anomaly — looped, $840 in 3hrs)
3. Invoice Processor
4. Inventory Forecaster
5. Quality Inspector
6. Customer Support Bot

3 weeks of pre-seeded data. Live simulator fires real queries through real proxy.

---

## Agent Studio (Phase 5 — Platform Evolution)

### What It Is
Chat-first no-code agent builder. User describes what they want → NPC Guide builds it autonomously → one-click deploy → agent runs 24/7, fully monitored through the existing proxy.

### New Stack Additions
- **Chat UI**: Forked from Chatbot UI (mckaywrigley). Next.js + TypeScript + Tailwind.
- **Conversation Controller**: Stateful backend behind `/api/chat`. Tracks brief collection, decides flow, knows when brief is complete.
- **NPC Guide Core**: `parseBriefWithLLM()` → `buildMissionMap()` → `enrichMissionMap()` → `generateInstruction()` → Claude Code execution.
- **Agent Runtime**: Lambda per agent, auto-wired through AgentLens proxy.
- **Memory**: 4 new DynamoDB tables for agent memory.
- **Games**: Inline Tetris/Snake/Pac-Man during background builds (open source React/Canvas).

### Extended Project Structure
```
agentlens/
├── proxy/              # Lambda function — the core product
├── dashboard/          # React app — 9 screens (observability)
├── studio/             # Agent Studio — chat UI + conversation controller
│   ├── app/            # Next.js app router
│   │   ├── api/chat/   # Conversation controller endpoint
│   │   └── page.tsx    # Chat interface
│   ├── components/
│   │   ├── chat/       # Message rendering, streaming, input bar
│   │   ├── cards/      # Pipeline blocks, mission map, progress, deploy status
│   │   ├── games/      # Tetris, Snake, Pac-Man (pause/resume signals)
│   │   └── integrations/ # Inline OAuth buttons, API key inputs
│   ├── lib/
│   │   ├── controller.ts    # Stateful conversation flow logic
│   │   ├── brief-compiler.ts # Chat → raw brief string
│   │   ├── npc-bridge.ts    # NPC Guide integration
│   │   └── deploy.ts        # One-click deploy pipeline
│   └── public/
├── agent-runtime/      # Template for deployed agents
│   ├── handler.js      # Lambda entry point
│   ├── checkpoint.js   # Crash recovery: checkpoint + retry + reconciliation
│   ├── memory.js       # Memory inject/consolidate
│   ├── router.js       # Query routing: classifier → tool selector → data source
│   └── hitl.js         # Human-in-the-loop: pause → notify → resume
├── guardrails/         # Injected into every NPC Guide build session
│   ├── guardrails.md   # Rules file (budget cap, no secrets, error handling, etc.)
│   └── schema.json     # agentlens-agent.json v1 schema
├── infra/              # CloudFormation templates
│   └── template.yaml   # Now includes agent memory tables + agent Lambda template
├── demo/               # OperaERP seed data + simulator
├── .ai-guide/          # NPC Guide mission system
└── package.json
```

### New DynamoDB Tables (Agent Memory)

#### agent_memory_long (persists forever)
- PK: agentId, SK: memoryId
- Fields: content, importance_score, created_at, last_accessed, access_count
- Top 10 by importance injected at session start

#### agent_memory_short (current run only)
- PK: agentId, SK: runId#stepIndex
- Fields: content, step_name, created_at
- TTL: cleared on run completion

#### agent_memory_shared (account-level)
- PK: accountId, SK: memoryId
- Fields: content, source_agent, importance_score, created_at
- Readable by all agents in the account

#### agent_sessions (run archive)
- PK: agentId, SK: timestamp
- Fields: summary_plain_english, steps_completed, total_cost, duration_ms, status, error_if_any

### Agent Studio Flow
```
1. User opens chat → types what they want
2. Conversation Controller collects requirements (project type, integrations, constraints)
3. Controller says "brief complete" → compiles to raw brief string
4. Brief → parseBriefWithLLM() → buildMissionMap() → enrichMissionMap()
5. Chat shows pipeline blocks: [Input Handler] → [Query Router] → [CRM Connector] → ...
6. User confirms → NPC Guide starts executing (games appear for wait states)
7. Build progress shown inline: "Mission 2/6 — Core Loop — building CRM check logic..."
8. Build complete → one-click deploy → Lambda + proxy wiring + dashboard registration
9. Agent live → activity feed shows runs in plain English
10. Agent remembers across runs (memory system)
11. Decision points → Slack/WhatsApp notification → human responds → agent continues
```

### Guardrails (Injected Every Build)
- Valid output schema (`agentlens-agent.json`)
- No hardcoded secrets
- Mandatory budget cap
- Mandatory fallback model
- Error handling on every tool call
- Minimum 5 integration tests
- No email sends without human confirmation
- No direct production DB writes
- Crash recovery: checkpoint at each step, retry with backoff, reconciliation on restart
- Auto-wired through AgentLens proxy (full observability)

### Safe Rollout (Agent Updates)
User says "update my agent" → NPC Guide rebuilds → shadow test new vs old → quality evaluator checks → pass: cut over / fail: auto-rollback + notify user. Never a blind swap.

### Query Routing (Per Agent)
Every built agent gets intelligent routing:
```
Query Classifier → Tool Selector → Data Source Router → Confidence Gate
```
Agent decides per query: search web, query DB, pull from docs, or call API. Not hardcoded.

---

## Build Agents (Parallel Execution)

Three agent types execute missions in parallel:

| Agent | Scope | Files Touched |
|-------|-------|---------------|
| **Agent F** (Frontend) | React, UI components, CSS, chat rendering, games | `studio/components/`, `studio/app/page.tsx`, `dashboard/src/` |
| **Agent B** (Backend) | API endpoints, business logic, NPC Guide integration, DynamoDB, memory | `studio/lib/`, `studio/app/api/`, `agent-runtime/`, `proxy/src/`, `guardrails/` |
| **Agent I** (Infra) | CloudFormation, Lambda, deploy pipelines, Vercel, CI/CD | `infra/`, `publish.sh`, deploy scripts |

Each agent runs in an isolated worktree. No file overlap. No merge conflicts.
