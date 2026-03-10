/**
 * AgentLens — Integration Test Suite
 * Runs against the demo server (no OpenAI key or DynamoDB required).
 *
 * Usage: npm run demo & sleep 1 && npm test
 */

const http = require("http");

const PROXY_URL = process.env.PROXY_URL || "http://localhost:3100";
let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.log(`  ✗ ${msg}`);
  }
}

async function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PROXY_URL);
    const postData = body ? JSON.stringify(body) : "";

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method,
        headers: {
          "Content-Type": "application/json",
          ...headers,
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data), raw: data });
          } catch {
            resolve({ status: res.statusCode, body: null, raw: data });
          }
        });
      }
    );
    req.on("error", reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function requestStream(path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, PROXY_URL);
    const postData = JSON.stringify(body);

    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk.toString()));
        res.on("end", () => resolve({ status: res.statusCode, raw: data, headers: res.headers }));
      }
    );
    req.on("error", reject);
    req.write(postData);
    req.end();
  });
}

async function runTests() {
  console.log("\n⚡ AgentLens Integration Tests");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // ---- 1. Health Check ----
  console.log("1. Health Check");
  const health = await request("GET", "/health");
  assert(health.status === 200, "GET /health returns 200");
  assert(health.body?.status === "ok", "status is 'ok'");
  assert(health.body?.version === "2.0.0", "version is 2.0.0");

  // ---- 2. Stats Endpoint ----
  console.log("\n2. Stats Endpoint");
  const stats = await request("GET", "/api/stats");
  assert(stats.status === 200, "GET /api/stats returns 200");
  assert(stats.body?.overview?.totalCalls > 0, "has totalCalls > 0");
  assert(Array.isArray(stats.body?.agents), "has agents array");
  assert(stats.body?.agents?.length === 6, "6 agents in OperaERP");
  assert(Array.isArray(stats.body?.workflows), "has workflows array");
  assert(stats.body?.workflows?.length >= 1, "has at least 1 workflow");

  // ---- 3. Chat Completion (non-streaming) ----
  console.log("\n3. Chat Completion (non-streaming)");
  const chat = await request("POST", "/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "What is the meaning of life?" }],
    max_tokens: 100,
  }, { "x-agent-id": "test-agent" });
  assert(chat.status === 200, "POST /v1/chat/completions returns 200");
  assert(chat.body?.choices?.length === 1, "has 1 choice");
  assert(chat.body?.choices?.[0]?.message?.role === "assistant", "role is assistant");
  assert(chat.body?.usage?.total_tokens > 0, "has token usage");

  // ---- 4. Chat Completion with workflow + version headers ----
  console.log("\n4. Workflow + Version Headers");
  const wfChat = await request("POST", "/v1/chat/completions", {
    model: "gpt-4o",
    messages: [{ role: "user", content: "Test workflow" }],
  }, {
    "x-agent-id": "procurement-agent",
    "x-workflow-id": "wf-integration-test",
    "x-prompt-version": "v3.0",
  });
  assert(wfChat.status === 200, "returns 200 with workflow headers");
  assert(wfChat.body?._agentlens?.workflowId === "wf-integration-test", "workflowId echoed in response");
  assert(wfChat.body?._agentlens?.promptVersion === "v3.0", "promptVersion echoed in response");

  // ---- 5. Kill Switch ----
  console.log("\n5. Kill Switch");
  const killAgent = "procurement-agent"; // use a seeded agent
  const killOn = await request("POST", "/api/controls", {
    agentId: killAgent, killed: true,
  });
  assert(killOn.status === 200, "kill switch SET returns 200");

  const killedChat = await request("POST", "/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "should be blocked" }],
  }, { "x-agent-id": killAgent });
  assert(killedChat.status === 403, "killed agent returns 403");
  assert(killedChat.body?.error?.type === "agent_killed", "error type is agent_killed");

  // Re-enable
  await request("POST", "/api/controls", { agentId: killAgent, killed: false });
  const unkilled = await request("POST", "/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "should work now" }],
  }, { "x-agent-id": killAgent });
  assert(unkilled.status === 200, "re-enabled agent returns 200");

  // ---- 6. Budget Endpoint ----
  console.log("\n6. Budget Endpoint");
  const budget = await request("POST", "/api/budgets", {
    agentId: "test-agent", monthlyLimit: 50,
  });
  assert(budget.status === 200, "budget SET returns 200");
  assert(budget.body?.ok === true, "budget response ok");

  // ---- 7. Rate Limit Endpoint ----
  console.log("\n7. Rate Limit Endpoints");
  const setRL = await request("POST", "/api/rate-limits", {
    agentId: "test-agent", rpm: 10,
  });
  assert(setRL.status === 200, "rate limit SET returns 200");
  assert(setRL.body?.rpm === 10, "rpm set to 10");

  const getRL = await request("GET", "/api/rate-limits");
  assert(getRL.status === 200, "rate limit GET returns 200");
  assert(Array.isArray(getRL.body?.rateLimits), "has rateLimits array");

  // ---- 8. Prompt Versions ----
  console.log("\n8. Prompt Versions");
  const versions = await request("GET", "/api/versions/procurement-agent");
  assert(versions.status === 200, "versions GET returns 200");
  assert(Array.isArray(versions.body?.versions), "has versions array");
  assert(versions.body?.versions?.length >= 1, "has at least 1 version");

  const rollback = await request("POST", "/api/versions/rollback", {
    agentId: "procurement-agent", version: "v1.0",
  });
  assert(rollback.status === 200, "rollback returns 200");
  assert(rollback.body?.ok === true, "rollback ok");

  // ---- 9. Streaming ----
  console.log("\n9. Streaming (SSE)");
  const stream = await requestStream("/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Stream test" }],
    stream: true,
  }, { "x-agent-id": "simulator-agent" });
  assert(stream.status === 200, "streaming returns 200");
  assert(stream.headers["content-type"]?.includes("text/event-stream"), "content-type is text/event-stream");
  assert(stream.raw.includes("data: "), "response contains SSE data lines");
  assert(stream.raw.includes("[DONE]"), "response ends with [DONE]");

  const chunks = stream.raw.split("\n").filter(l => l.startsWith("data: ") && l !== "data: [DONE]");
  assert(chunks.length >= 2, `received ${chunks.length} SSE chunks`);

  // ---- 10. 404 on Unknown Path ----
  console.log("\n10. Unknown Path");
  const notFound = await request("GET", "/v1/unknown");
  assert(notFound.status === 404, "unknown path returns 404");

  // ---- 11. Cache Hit Simulation ----
  console.log("\n11. Cache Hit (demo simulation)");
  // Demo server alternates cache hits on even call numbers
  // Send two calls — one should be cached (depends on global counter)
  const c1 = await request("POST", "/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "cache test query" }],
  }, { "x-agent-id": "email-drafter" });
  const c2 = await request("POST", "/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "cache test query" }],
  }, { "x-agent-id": "email-drafter" });
  const eitherCached = c1.body?._agentlens?.cached === true || c2.body?._agentlens?.cached === true;
  assert(eitherCached, "at least one of two calls is cached");

  // ---- Summary ----
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  ${passed} passed, ${failed} failed`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error("Test error:", err.message);
  process.exit(1);
});
