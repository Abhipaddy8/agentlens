#!/bin/bash
# AgentLens Live Demo — Runs 3 real agents through the proxy
# Dashboard fills with real data in ~5 minutes
#
# Prerequisites:
#   - DynamoDB Local: docker run -p 8000:8000 amazon/dynamodb-local
#   - Proxy: cd proxy && node src/server.js  (port 3100)
#   - Dashboard: cd dashboard && npm start    (port 3200)
#
# Usage: ./demo/run-demo.sh [--fast]

set -e
cd "$(dirname "$0")/.."

FAST=false
[[ "$1" == "--fast" ]] && FAST=true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  AgentLens — Live Agent Demo"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "  Agents:  doc-summarizer, qa-agent, data-analyzer"
echo "  Proxy:   http://localhost:3100"
echo "  Model:   deepseek/deepseek-chat (via OpenRouter)"
echo ""

# Check proxy is running
if ! curl -s http://localhost:3100/health > /dev/null 2>&1; then
  echo "  ❌ Proxy not running on port 3100. Start it first:"
  echo "     cd proxy && node src/server.js"
  exit 1
fi
echo "  ✅ Proxy is running"
echo ""

# Phase 1: QA Agent (generates cache-hittable data first)
echo "━━━━ Phase 1: QA Agent (cache demo — 3 rounds) ━━━━"
echo ""
if $FAST; then
  node demo/agents/qa-agent.js --rounds=2
else
  node demo/agents/qa-agent.js --rounds=3
fi

echo ""
sleep 2

# Phase 2: Doc Summarizer (workflow demo)
echo "━━━━ Phase 2: Doc Summarizer (workflow demo — 2 runs) ━━━━"
echo ""
node demo/agents/doc-summarizer.js --runs=2

echo ""
sleep 2

# Phase 3: Data Analyzer (high-cost analysis)
echo "━━━━ Phase 3: Data Analyzer (cost visibility demo) ━━━━"
echo ""
node demo/agents/data-analyzer.js --runs=1

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Demo Complete"
echo ""
echo "  Open the dashboard: http://localhost:3200"
echo ""
echo "  What to look for:"
echo "    Overview  → 3 agents, real costs, cache savings"
echo "    Agents    → doc-summarizer, qa-agent, data-analyzer"
echo "    Workflows → doc-summary-* and analysis-* workflows"
echo "    Controls  → Cache toggle, kill switches, rate limits"
echo "    CFO View  → Real spend breakdown with projections"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
