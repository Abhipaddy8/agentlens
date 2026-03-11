# AgentLens Build Guardrails

**Injected into every NPC Guide build session. These rules are non-negotiable.**

---

## 1. Valid Output Schema

Every agent you build MUST produce a valid `agentlens-agent.json` file at the project root. The file MUST conform to the JSON Schema defined in `guardrails/schema.json`. If the schema validation fails, the build fails. No exceptions.

Run schema validation as the final build step:

```javascript
const Ajv = require("ajv");
const schema = require("../guardrails/schema.json");
const agentConfig = require("./agentlens-agent.json");
const ajv = new Ajv();
const valid = ajv.validate(schema, agentConfig);
if (!valid) throw new Error(`Invalid agentlens-agent.json: ${JSON.stringify(ajv.errors)}`);
```

---

## 2. No Hardcoded Secrets

NEVER hardcode API keys, tokens, passwords, or credentials anywhere in the agent code. Use environment variables exclusively. Every secret MUST be referenced via `process.env.VARIABLE_NAME`.

Forbidden patterns:
- `apiKey: "sk-..."`
- `token: "xoxb-..."`
- `password: "..."`
- Any string that looks like a credential assigned to a variable

If the agent needs a secret, declare it in `agentlens-agent.json` under `integrations[].config.envVar` and document it in the agent's README.

---

## 3. Mandatory Budget Cap

Every agent MUST have a `budget` object in `agentlens-agent.json` with:
- `monthlyLimit` (number, required) — maximum monthly LLM spend in USD
- `primaryModel` (string, required) — the default model for LLM calls
- `fallbackModel` (string, required) — cheaper model used when primary fails or budget is low

If `budget` is missing or incomplete, the build fails.

The agent runtime MUST check remaining budget before every LLM call. If the budget is exhausted, switch to `fallbackModel`. If fallback budget is also exhausted, halt the run gracefully and log the reason.

---

## 4. Mandatory Fallback Model

Every agent MUST define a `fallbackModel` in the budget config. The fallback model MUST be cheaper than the primary model.

Acceptable fallback chains:
- `gpt-4o` -> `gpt-4o-mini`
- `gpt-4-turbo` -> `gpt-4o-mini`
- `claude-3-opus` -> `claude-3-haiku`
- `claude-3.5-sonnet` -> `claude-3-haiku`

The agent handler MUST implement automatic fallback: if the primary model returns a 429, 500, 502, 503, or timeout, retry with the fallback model before failing.

---

## 5. Error Handling on Every Tool Call

Every external call (LLM, API, database, webhook) MUST be wrapped in try/catch. No unhandled promise rejections. No uncaught exceptions that crash the Lambda.

Required pattern for every tool call:

```javascript
try {
  const result = await externalCall();
  // process result
} catch (err) {
  console.error(`[agent:${agentId}] Tool call failed: ${err.message}`, { step, error: err });
  // Checkpoint the failure
  await saveCheckpoint(stepName, { status: "failed", error: err.message });
  // Decide: retry, fallback, or halt
}
```

NEVER use `.catch(() => {})` to silently swallow errors on critical paths. Silent swallowing is ONLY acceptable for fire-and-forget logging calls.

---

## 6. Minimum 5 Integration Tests

Every built agent MUST include at least 5 integration tests that cover:

1. **Happy path** — full agent run with mocked external services, verifying output
2. **Budget exhaustion** — agent handles budget limit gracefully, switches to fallback
3. **Crash recovery** — agent resumes from checkpoint after simulated crash
4. **External service failure** — agent handles API/LLM errors without crashing
5. **Human-in-the-loop** — if HITL is enabled, test the approval pause/resume flow

Tests MUST be runnable with `npm test`. Tests MUST NOT require real API keys or production services. Use mocks/stubs for all external dependencies.

---

## 7. No Email Sends Without Human Confirmation

If the agent sends emails (via Gmail, SendGrid, SES, or any email service), every send MUST go through the human-in-the-loop approval flow.

The agent MUST:
1. Compose the email (to, subject, body)
2. Send an approval request via the configured channel (Slack/WhatsApp/email)
3. WAIT for human approval before sending
4. Log the approval decision (approved/rejected, by whom, timestamp)

Bulk email sends are NEVER autonomous. Each batch MUST be approved.

---

## 8. No Direct Production Database Writes

Agents MUST NOT write directly to production databases. All database operations MUST go through an abstraction layer that:

1. Validates the write operation against a schema
2. Logs every write (table, operation, payload hash, timestamp)
3. Supports dry-run mode (log what would be written without writing)
4. Respects rate limits on write operations

Use the `agent-runtime/` abstraction modules. Never import a database client directly in agent business logic.

---

## 9. Crash Recovery — Mandatory

Every agent MUST implement crash recovery using the checkpoint system from `agent-runtime/checkpoint.js`.

Requirements:
- **Checkpoint at each step**: After every successful step, call `saveCheckpoint(stepName, state)`.
- **Retry with exponential backoff**: On failure, retry with delays of 1s, 2s, 4s, 8s. Maximum 3 retries per step.
- **Reconciliation on restart**: When an agent starts, it MUST call `loadCheckpoint()` to find the last successful step and resume from there. Never restart from scratch if a checkpoint exists.
- **Idempotency**: Every step MUST be idempotent. Re-running a step that already succeeded MUST produce the same result without side effects (duplicate sends, duplicate writes, etc.).

Use the `withCheckpoint(stepName, fn)` wrapper for every step in the agent pipeline:

```javascript
const result = await withCheckpoint("fetch-deals", async () => {
  const deals = await crm.getDeals();
  return { dealCount: deals.length, deals };
});
```

---

## 10. All LLM Calls Through AgentLens Proxy

Every LLM call in every built agent MUST route through the AgentLens proxy. No direct calls to OpenAI, Anthropic, or any LLM provider.

Set up the OpenAI client to use the proxy:

```javascript
const OpenAI = require("openai");
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.AGENTLENS_PROXY_URL + "/v1",
  defaultHeaders: {
    "x-agent-id": agentConfig.proxy.agentId,
  },
});
```

The proxy provides: cost tracking, caching, model routing, kill switch, budget enforcement, rate limiting, and anomaly detection. An agent deployed without proxy wiring has ZERO observability and WILL NOT be deployed.

The `proxy.enabled` field in `agentlens-agent.json` MUST be `true`. The `proxy.agentId` field MUST be set.

---

## Build Validation Checklist

Before marking a build as complete, verify ALL of the following:

- [ ] `agentlens-agent.json` exists and passes schema validation
- [ ] Zero hardcoded secrets (grep for patterns: `sk-`, `xoxb-`, `Bearer `, `password`)
- [ ] `budget.monthlyLimit` is set and reasonable (not $0, not $999999)
- [ ] `budget.fallbackModel` is set and cheaper than `budget.primaryModel`
- [ ] Every external call wrapped in try/catch
- [ ] At least 5 integration tests pass with `npm test`
- [ ] Email sends require human approval (if applicable)
- [ ] No direct DB imports in business logic files
- [ ] `checkpoint.enabled` is `true` in agent config
- [ ] `proxy.enabled` is `true` in agent config
- [ ] Agent resumes from checkpoint on restart (tested)
- [ ] All LLM calls use `AGENTLENS_PROXY_URL` as base URL

If ANY check fails, the build fails. Fix the issue and re-validate.
