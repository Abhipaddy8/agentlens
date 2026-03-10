#!/usr/bin/env node
/**
 * doc-summarizer.js — AgentLens demo agent
 * Simulates a document summarization pipeline with 3-5 LLM calls per workflow.
 * Usage: node doc-summarizer.js [--runs=N]
 */

const http = require("http");

const PROXY_URL = "http://localhost:3100/v1/chat/completions";
const MODEL = "deepseek/deepseek-chat";
const AGENT_ID = "doc-summarizer";

const SAMPLE_DOCUMENT = `Cloud computing in 2026 is defined by four converging trends. First, cost optimization has become the top priority for enterprises, with FinOps teams now embedded in every major organization. Companies are leveraging committed-use discounts, spot instances, and intelligent workload scheduling to cut cloud spend by 30-40%. Second, multi-cloud strategies have matured beyond buzzword status. Organizations routinely distribute workloads across AWS, Azure, and GCP based on price-performance ratios, using abstraction layers like Terraform and Pulumi to maintain portability. Third, AI workload management has emerged as a distinct discipline. Training runs for large language models require specialized GPU clusters, while inference workloads demand low-latency edge deployments. Cloud providers now offer dedicated AI compute tiers with reserved capacity and burstable inference endpoints. Fourth, serverless adoption has reached an inflection point. Event-driven architectures powered by AWS Lambda, Azure Functions, and Google Cloud Run handle over 60% of new application deployments. The combination of zero idle cost, automatic scaling, and simplified operations makes serverless the default choice for microservices. Together, these trends are reshaping how enterprises architect, deploy, and pay for cloud infrastructure in an increasingly AI-driven world.`;

function parseArgs() {
  const runsArg = process.argv.find((a) => a.startsWith("--runs="));
  return { runs: runsArg ? parseInt(runsArg.split("=")[1], 10) : 2 };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randomDelay() {
  return sleep(1000 + Math.random() * 2000);
}

function callProxy(messages, workflowId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, messages, temperature: 0.3 });
    const url = new URL(PROXY_URL);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-id": AGENT_ID,
        "x-workflow-id": workflowId,
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = http.request(opts, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 200)}`));
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`Invalid JSON: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function getContent(response) {
  return response?.choices?.[0]?.message?.content || "(no content)";
}

function getCost(response) {
  const usage = response?.usage;
  if (!usage) return null;
  const prompt = (usage.prompt_tokens || 0) * 0.00000014;
  const completion = (usage.completion_tokens || 0) * 0.00000028;
  return prompt + completion;
}

function getCacheStatus(response) {
  return response?._agentlens?.cache_hit ? " [CACHE HIT]" : "";
}

async function runWorkflow(runIndex, totalRuns) {
  const workflowId = `doc-summary-${Date.now()}`;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`[${AGENT_ID}] Run ${runIndex}/${totalRuns} | workflow: ${workflowId}`);
  console.log("=".repeat(60));

  let totalCost = 0;

  // Step 1: Extract key topics
  const t1 = Date.now();
  process.stdout.write(`[${AGENT_ID}] Step 1/4: Extracting topics...`);
  const r1 = await callProxy(
    [
      { role: "system", content: "You are a document analyst. Return a short numbered list of key topics only." },
      { role: "user", content: `Extract key topics from this document:\n\n${SAMPLE_DOCUMENT}` },
    ],
    workflowId
  );
  const topics = getContent(r1);
  const c1 = getCost(r1);
  totalCost += c1 || 0;
  console.log(` done (${Date.now() - t1}ms)${c1 ? ` $${c1.toFixed(6)}` : ""}${getCacheStatus(r1)}`);

  await randomDelay();

  // Step 2: Summarize topic — cost optimization
  const t2 = Date.now();
  process.stdout.write(`[${AGENT_ID}] Step 2/4: Summarizing cost optimization...`);
  const r2 = await callProxy(
    [
      { role: "system", content: "You are a concise technical writer. Write a 2-3 sentence summary." },
      { role: "user", content: `Summarize the following section about cloud cost optimization and FinOps from this document:\n\n${SAMPLE_DOCUMENT}` },
    ],
    workflowId
  );
  const summary1 = getContent(r2);
  const c2 = getCost(r2);
  totalCost += c2 || 0;
  console.log(` done (${Date.now() - t2}ms)${c2 ? ` $${c2.toFixed(6)}` : ""}${getCacheStatus(r2)}`);

  await randomDelay();

  // Step 3: Summarize topic — AI workload management
  const t3 = Date.now();
  process.stdout.write(`[${AGENT_ID}] Step 3/4: Summarizing AI workload management...`);
  const r3 = await callProxy(
    [
      { role: "system", content: "You are a concise technical writer. Write a 2-3 sentence summary." },
      { role: "user", content: `Summarize the following section about AI workload management and GPU compute from this document:\n\n${SAMPLE_DOCUMENT}` },
    ],
    workflowId
  );
  const summary2 = getContent(r3);
  const c3 = getCost(r3);
  totalCost += c3 || 0;
  console.log(` done (${Date.now() - t3}ms)${c3 ? ` $${c3.toFixed(6)}` : ""}${getCacheStatus(r3)}`);

  await randomDelay();

  // Step 4: Combine into executive summary
  const t4 = Date.now();
  process.stdout.write(`[${AGENT_ID}] Step 4/4: Generating executive summary...`);
  const r4 = await callProxy(
    [
      { role: "system", content: "You are an executive briefing writer. Combine the inputs into a polished 4-5 sentence executive summary." },
      { role: "user", content: `Combine these summaries into a final executive summary:\n\n1. Cost Optimization:\n${summary1}\n\n2. AI Workload Management:\n${summary2}\n\nTopics identified:\n${topics}` },
    ],
    workflowId
  );
  const c4 = getCost(r4);
  totalCost += c4 || 0;
  console.log(` done (${Date.now() - t4}ms)${c4 ? ` $${c4.toFixed(6)}` : ""}${getCacheStatus(r4)}`);

  console.log(`\n[${AGENT_ID}] Executive Summary:\n${getContent(r4).slice(0, 300)}...`);

  return { workflowId, calls: 4, cost: totalCost };
}

async function main() {
  const { runs } = parseArgs();
  console.log(`\nAgentLens Demo: doc-summarizer`);
  console.log(`Proxy: ${PROXY_URL} | Model: ${MODEL} | Runs: ${runs}`);

  const results = [];

  for (let i = 1; i <= runs; i++) {
    try {
      const result = await runWorkflow(i, runs);
      results.push(result);
    } catch (err) {
      console.error(`\n[${AGENT_ID}] Run ${i} failed: ${err.message}`);
    }
    if (i < runs) await sleep(2000);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("SUMMARY");
  console.log("=".repeat(60));
  console.log(`Total runs:      ${results.length}`);
  console.log(`Total calls:     ${results.reduce((s, r) => s + r.calls, 0)}`);
  console.log(`Total cost:      $${results.reduce((s, r) => s + r.cost, 0).toFixed(6)}`);
  console.log(`Workflow IDs:    ${results.map((r) => r.workflowId).join(", ")}`);
  console.log(`\nRun 2+ should show cache hits in the AgentLens dashboard.`);
}

main().catch((err) => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
