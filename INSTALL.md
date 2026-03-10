# AgentLens — Install Guide

## 3-Step Install (AWS)

```bash
# 1. Clone and deploy
git clone https://github.com/your-org/agentlens.git
cd agentlens
npm run deploy -- agentlens sk-your-openai-key

# 2. Point your agents at AgentLens
export OPENAI_BASE_URL=https://xxx.execute-api.us-east-1.amazonaws.com/prod

# 3. Add one header to each agent
headers["x-agent-id"] = "my-agent-name"
```

Real data in 24 hours. Savings visible immediately.

---

## Local Dev (No AWS Required)

```bash
# 1. Install
npm install

# 2. Run the demo (no keys needed)
npm run demo

# 3. Open dashboard
cd dashboard && npm start
# Point dashboard at http://localhost:3100
```

## Local Dev with DynamoDB

```bash
# 1. Start DynamoDB Local
docker run -p 8000:8000 amazon/dynamodb-local

# 2. Create tables
npm run setup:local

# 3. Seed demo data
npm run demo:seed

# 4. Start proxy
OPENAI_API_KEY=sk-... DYNAMO_ENDPOINT=http://localhost:8000 npm run dev

# 5. Run tests
npm test
```

## AWS Deploy (Full)

### Prerequisites
- AWS CLI configured (`aws configure`)
- SAM CLI installed (`brew install aws-sam-cli`)
- OpenAI API key

### Deploy
```bash
npm run deploy -- [stack-name] [openai-key]
# or
OPENAI_API_KEY=sk-... npm run deploy
```

### What Gets Created
| Resource | Type | Purpose |
|----------|------|---------|
| `{stack}-proxy` | Lambda (Node.js 20.x) | API proxy |
| `{stack}-calls` | DynamoDB | Call audit log |
| `{stack}-budgets` | DynamoDB | Spend tracking |
| `{stack}-cache` | DynamoDB | Response cache |
| `{stack}-controls` | DynamoDB | Kill switches |
| `{stack}-agents` | DynamoDB | Agent registry |
| `{stack}-prompt-versions` | DynamoDB | Prompt versioning |
| `{stack}-dashboard-*` | S3 + CloudFront | Dashboard UI |
| HTTP API | API Gateway | Public endpoint |

### Tear Down
```bash
npm run teardown
# or
aws cloudformation delete-stack --stack-name agentlens
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `OPENAI_API_KEY` | Yes | — | Your OpenAI key |
| `PORT` | No | `3100` | Local server port |
| `DYNAMO_ENDPOINT` | No | AWS default | DynamoDB endpoint (use `http://localhost:8000` for local) |
| `AWS_REGION` | No | `us-east-1` | AWS region |
| `UPSTREAM_BASE` | No | `https://api.openai.com` | LLM provider base URL |
| `DEFAULT_RPM` | No | `60` | Default rate limit per agent |
| `CACHE_TTL_HOURS` | No | `24` | Cache expiry in hours |
| `TABLE_CALLS` | No | `agentlens-calls` | Calls table name |
| `TABLE_BUDGETS` | No | `agentlens-budgets` | Budgets table name |
| `TABLE_CACHE` | No | `agentlens-cache` | Cache table name |
| `TABLE_CONTROLS` | No | `agentlens-controls` | Controls table name |
| `TABLE_AGENTS` | No | `agentlens-agents` | Agents table name |
| `TABLE_VERSIONS` | No | `agentlens-prompt-versions` | Versions table name |

## Headers

| Header | Required | Description |
|--------|----------|-------------|
| `x-agent-id` | Recommended | Identifies the calling agent |
| `x-workflow-id` | Optional | Groups related calls into a workflow |
| `x-prompt-version` | Optional | Tracks system prompt versions |
| `Authorization` | Yes | `Bearer sk-...` (passed through to OpenAI) |

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/chat/completions` | OpenAI-compatible proxy (streaming supported) |
| `GET` | `/health` | Health check |
| `GET` | `/api/stats` | Dashboard data |
| `POST` | `/api/controls` | Set kill switch |
| `POST` | `/api/budgets` | Set budget limit |
| `POST` | `/api/rate-limits` | Set RPM limit |
| `GET` | `/api/rate-limits` | Get rate limit status |
| `GET` | `/api/versions/:agentId` | Get prompt versions |
| `POST` | `/api/versions/rollback` | Rollback prompt version |
