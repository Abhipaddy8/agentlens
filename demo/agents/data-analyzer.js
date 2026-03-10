/**
 * Data Analyzer Agent — AgentLens Demo
 * Sends larger prompts through the proxy to demonstrate cost visibility.
 * Usage: node demo/agents/data-analyzer.js [--runs=N]
 */

const http = require("http");

const PROXY = { hostname: "localhost", port: 3100 };
const MODEL = "deepseek/deepseek-chat";
const AGENT_ID = "data-analyzer";

// Realistic monthly sales data — Q4 spike, summer dip, ProductD declining
const SALES_DATA = `
Month,ProductA,ProductB,ProductC,ProductD,ProductE
Jan-2025,142000,98000,67000,54000,31000
Feb-2025,138000,101000,71000,51000,33000
Mar-2025,155000,112000,74000,49000,36000
Apr-2025,161000,108000,78000,46000,39000
May-2025,149000,104000,72000,43000,41000
Jun-2025,134000,96000,65000,41000,38000
Jul-2025,128000,91000,61000,38000,36000
Aug-2025,131000,94000,64000,36000,37000
Sep-2025,158000,115000,79000,34000,43000
Oct-2025,172000,126000,88000,32000,48000
Nov-2025,198000,148000,102000,30000,55000
Dec-2025,221000,162000,118000,28000,61000`.trim();

const PRODUCT_CONTEXT = `Product lines:
- ProductA: Enterprise SaaS platform (flagship, 40% of revenue)
- ProductB: Mid-market analytics suite (growing steadily)
- ProductC: SMB self-serve tool (seasonal patterns)
- ProductD: Legacy on-prem solution (being sunset, declining YoY)
- ProductE: New AI add-on module (launched Q3 2024, rapid growth)

Total headcount: 340 employees. Engineering: 45%. Sales: 25%. G&A: 30%.
Gross margin target: 72%. Current burn rate: $1.8M/month.
Board meeting scheduled for July 15, 2025.`;

function makePrompts(prevResults) {
  return [
    {
      label: "Analyzing sales data",
      messages: [
        { role: "system", content: "You are a senior data analyst at a B2B SaaS company. Provide detailed quantitative analysis with specific numbers and percentages." },
        { role: "user", content: `Analyze this monthly sales data and identify trends, seasonality patterns, and anomalies across all product lines.\n\n${SALES_DATA}\n\n${PRODUCT_CONTEXT}\n\nProvide: (1) YoY growth rates per product, (2) seasonal decomposition, (3) correlation between product lines, (4) anomaly flags, (5) 90-day forecast for each product.` }
      ]
    },
    {
      label: "Identifying risks and opportunities",
      messages: [
        { role: "system", content: "You are a strategic advisor to the CFO. Be specific about dollar impacts and timelines." },
        { role: "user", content: `Based on this sales trend analysis:\n\n${prevResults[0] || "[analysis pending]"}\n\nOriginal data:\n${SALES_DATA}\n\nIdentify the top 3 risks and top 3 opportunities for Q3 2025. For each, quantify the potential dollar impact, assign a probability (%), and recommend a specific action with owner and deadline. Also flag any budget implications the CFO should raise at the July board meeting.` }
      ]
    },
    {
      label: "Writing executive briefing",
      messages: [
        { role: "system", content: "You are an executive communications specialist. Write concise, data-driven briefings suitable for C-suite and board audiences." },
        { role: "user", content: `Write an executive briefing for the CFO summarizing our sales performance and strategic outlook.\n\nTrend Analysis:\n${prevResults[0] || "[analysis]"}\n\nRisks & Opportunities:\n${prevResults[1] || "[risks/opps]"}\n\nFormat: (1) One-paragraph executive summary, (2) Key metrics table, (3) Risk matrix, (4) Recommended actions with budget asks, (5) Board talking points. Keep it under 500 words but data-rich.` }
      ]
    }
  ];
}

function callProxy(messages, workflowId) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ model: MODEL, messages, max_tokens: 1024 });
    const start = Date.now();
    const req = http.request({
      hostname: PROXY.hostname,
      port: PROXY.port,
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-agent-id": AGENT_ID,
        "x-workflow-id": workflowId,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        const latency = Date.now() - start;
        try {
          const json = JSON.parse(data);
          if (json.error) return reject(new Error(json.error.message || JSON.stringify(json.error)));
          const content = json.choices?.[0]?.message?.content || "";
          const usage = json.usage || {};
          const cost = parseCost(json);
          resolve({ content, latency, usage, cost });
        } catch (e) { reject(new Error(`Parse error: ${e.message} — raw: ${data.slice(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

function parseCost(json) {
  // AgentLens proxy may include cost in x-agentlens-cost or in usage metadata
  if (json._agentlens?.totalCost) return json._agentlens.totalCost;
  if (json.usage) {
    const i = (json.usage.prompt_tokens || 0) / 1_000_000 * 0.14;
    const o = (json.usage.completion_tokens || 0) / 1_000_000 * 0.28;
    return i + o;
  }
  return 0;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function runPipeline(runIndex, totalRuns) {
  const ts = Date.now();
  const workflowId = `analysis-${ts}`;
  const prefix = totalRuns > 1 ? `[run ${runIndex}/${totalRuns}]` : "";
  console.log(`\n[${AGENT_ID}] ${prefix} Workflow: ${workflowId}`);
  console.log("─".repeat(52));

  const prompts = makePrompts([]);
  const results = [];
  let totalCost = 0;

  for (let i = 0; i < prompts.length; i++) {
    const step = prompts[i];
    // Rebuild prompts with real results for steps 2 and 3
    const livePrompts = makePrompts(results);
    const msgs = livePrompts[i].messages;

    process.stdout.write(`  Step ${i + 1}/3: ${step.label}...`);
    try {
      const res = await callProxy(msgs, workflowId);
      totalCost += res.cost;
      results.push(res.content);
      const tokens = (res.usage.prompt_tokens || 0) + (res.usage.completion_tokens || 0);
      console.log(` done (${res.latency}ms, ${tokens} tok, $${res.cost.toFixed(6)})`);
    } catch (err) {
      console.log(` FAILED: ${err.message}`);
      results.push("[error]");
    }

    if (i < prompts.length - 1) {
      const delay = 2000 + Math.random() * 2000;
      await sleep(delay);
    }
  }

  console.log("─".repeat(52));
  console.log(`  Total cost: $${totalCost.toFixed(6)} | Workflow: ${workflowId}`);
  return totalCost;
}

async function main() {
  const runsArg = process.argv.find(a => a.startsWith("--runs="));
  const runs = runsArg ? parseInt(runsArg.split("=")[1], 10) : 1;

  console.log(`[${AGENT_ID}] Starting ${runs} run(s) against ${PROXY.hostname}:${PROXY.port}`);
  console.log(`[${AGENT_ID}] Model: ${MODEL}`);

  let grandTotal = 0;
  for (let r = 1; r <= runs; r++) {
    grandTotal += await runPipeline(r, runs);
    if (r < runs) await sleep(3000);
  }

  if (runs > 1) {
    console.log(`\n[${AGENT_ID}] All runs complete. Grand total: $${grandTotal.toFixed(6)}`);
  }
}

main().catch((err) => { console.error("Fatal:", err.message); process.exit(1); });
