#!/usr/bin/env node
/**
 * QA Knowledge Base Agent — AgentLens demo
 * Asks repeated questions to demonstrate cache hits naturally.
 * Usage: node qa-agent.js [--rounds=N]
 */
const http = require('http');

const AGENT_ID = 'qa-agent';
const PROXY = { hostname: 'localhost', port: 3100, path: '/v1/chat/completions' };
const MODEL = 'deepseek/deepseek-chat';

const QUESTIONS = [
  'What is the difference between horizontal and vertical scaling?',
  'Explain the CAP theorem in simple terms',
  'What are the best practices for API rate limiting?',
  'How does a circuit breaker pattern work in microservices?',
  'What is eventual consistency and when should you use it?',
  'Explain the difference between SQL and NoSQL databases',
];

function parseArgs() {
  const flag = process.argv.find(a => a.startsWith('--rounds='));
  return { rounds: flag ? parseInt(flag.split('=')[1], 10) : 3 };
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function truncate(s, n) { return s.length > n ? s.slice(0, n) + '...' : s; }

function ask(question) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: 'You are a concise technical knowledge base. Answer in 2-3 sentences.' },
        { role: 'user', content: question },
      ],
      max_tokens: 200,
    });

    const start = Date.now();
    const req = http.request({
      ...PROXY,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-agent-id': AGENT_ID,
        'Content-Length': Buffer.byteLength(body),
      },
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        const ms = Date.now() - start;
        try {
          const json = JSON.parse(data);
          const cached = res.headers['x-cache'] === 'HIT';
          const cost = json.usage
            ? (json.usage.prompt_tokens * 0.00000014 + json.usage.completion_tokens * 0.00000028)
            : 0;
          resolve({ ms, cached, cost: cached ? 0 : cost });
        } catch (e) {
          reject(new Error(`Bad response: ${data.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  const { rounds } = parseArgs();
  console.log(`\n[${AGENT_ID}] Starting — ${rounds} round(s), ${QUESTIONS.length} questions each\n`);

  const roundStats = [];

  for (let r = 1; r <= rounds; r++) {
    if (r > 1) {
      console.log(`\n  ⏳ Pausing 3s before next round...\n`);
      await sleep(3000);
    }
    console.log(`--- Round ${r} ---`);
    let calls = 0, hits = 0, totalCost = 0;

    for (let i = 0; i < QUESTIONS.length; i++) {
      const q = QUESTIONS[i];
      try {
        const res = await ask(q);
        calls++;
        if (res.cached) hits++;
        totalCost += res.cost;
        const tag = res.cached ? ' CACHE HIT' : '';
        const costStr = res.cost === 0 ? '$0.00' : `$${res.cost.toFixed(6)}`;
        console.log(`  [${AGENT_ID}] Q${i + 1}: ${truncate(q, 45)} ✓${tag} (${res.ms}ms, ${costStr})`);
      } catch (e) {
        console.error(`  [${AGENT_ID}] Q${i + 1}: ${truncate(q, 45)} ✗ ${e.message}`);
      }
      if (i < QUESTIONS.length - 1) await sleep(rand(500, 2000));
    }

    roundStats.push({ round: r, calls, hits, cost: totalCost });
  }

  // Summary
  console.log('\n=== Summary ===');
  for (const s of roundStats) {
    const hitLabel = s.hits > 0 ? `${s.hits} cache hits` : `${s.calls} calls`;
    console.log(`  Round ${s.round}: ${hitLabel}, $${s.cost.toFixed(4)}`);
  }

  const totalSaved = roundStats.slice(1).reduce((sum, s) => sum + s.hits, 0);
  const totalCost = roundStats.reduce((sum, s) => sum + s.cost, 0);
  console.log(`\n  Total cost: $${totalCost.toFixed(4)} | Cache hits saved: ${totalSaved} calls\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
