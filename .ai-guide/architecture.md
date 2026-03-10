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
