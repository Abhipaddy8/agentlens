/**
 * Shadow Tester — Safe rollout comparison engine.
 *
 * Runs the same test cases against old and new agent versions,
 * comparing quality, latency, error rate, and cost.
 * Currently simulates with realistic mock data; in production
 * this would invoke actual Lambda versions.
 */

import { ShadowTestEvent, ShadowTestMetrics, ShadowTestResult } from "./types";
import { AgentConfig } from "./deploy-pipeline";

export interface TestCase {
  id: number;
  input: Record<string, unknown>;
  expectedOutput?: string;
  description: string;
}

/**
 * Run shadow tests comparing old and new agent configurations.
 *
 * Yields progress events per test case and a final summary.
 * The caller (deploy pipeline or chat route) streams these to the frontend.
 */
export async function* shadowTest(
  oldConfig: AgentConfig,
  newConfig: AgentConfig,
  testCases: TestCase[],
  qualityThreshold = 80
): AsyncGenerator<ShadowTestEvent> {
  const results: Array<{
    oldLatency: number;
    newLatency: number;
    oldError: boolean;
    newError: boolean;
    oldCost: number;
    newCost: number;
    similarity: number;
  }> = [];

  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];

    // Simulate running test against OLD version
    const oldResult = await simulateInvocation(oldConfig, tc, "old");

    // Simulate running test against NEW version
    const newResult = await simulateInvocation(newConfig, tc, "new");

    // Simulate LLM-scored response similarity (0-100)
    const similarity = simulateSimilarityScore(oldResult.response, newResult.response);

    results.push({
      oldLatency: oldResult.latency,
      newLatency: newResult.latency,
      oldError: oldResult.error,
      newError: newResult.error,
      oldCost: oldResult.cost,
      newCost: newResult.cost,
      similarity,
    });

    yield {
      type: "shadow-test-progress",
      testCase: i + 1,
      total: testCases.length,
      oldResult: {
        latency: oldResult.latency,
        error: oldResult.error,
        cost: oldResult.cost,
        response: oldResult.response,
      },
      newResult: {
        latency: newResult.latency,
        error: newResult.error,
        cost: newResult.cost,
        response: newResult.response,
      },
    };

    // Realistic delay between test cases
    await delay(randomBetween(300, 700));
  }

  // Compute aggregate metrics
  const metrics = computeMetrics(results);
  const qualityScore = computeQualityScore(metrics);
  const passed = qualityScore >= qualityThreshold;

  yield {
    type: "shadow-test-complete",
    qualityScore,
    passed,
    metrics,
  };
}

/**
 * Generate default test cases when none are provided.
 * Creates realistic test scenarios based on the agent's trigger type.
 */
export function generateDefaultTestCases(config: AgentConfig): TestCase[] {
  const cases: TestCase[] = [
    {
      id: 1,
      input: { type: "health-check", payload: {} },
      description: "Basic health check — agent responds without error",
    },
    {
      id: 2,
      input: { type: "standard", payload: { message: "Process this input" } },
      description: "Standard input processing — normal workload",
    },
    {
      id: 3,
      input: { type: "edge-case", payload: { message: "" } },
      description: "Empty input — graceful error handling",
    },
    {
      id: 4,
      input: { type: "large", payload: { message: "x".repeat(5000) } },
      description: "Large payload — performance under load",
    },
    {
      id: 5,
      input: { type: "malformed", payload: null },
      description: "Malformed input — error boundary validation",
    },
  ];

  // Add trigger-specific test cases
  if (config.trigger.type === "webhook") {
    cases.push({
      id: 6,
      input: { type: "webhook", headers: { "x-signature": "test-sig" }, body: { event: "test" } },
      description: "Webhook with signature — auth verification",
    });
  }

  if (config.trigger.type === "cron") {
    cases.push({
      id: 6,
      input: { type: "scheduled", scheduledTime: new Date().toISOString() },
      description: "Scheduled invocation — cron trigger simulation",
    });
  }

  return cases;
}

// --- Simulation Helpers ---

interface SimulatedResult {
  latency: number;
  error: boolean;
  cost: number;
  response: string;
}

async function simulateInvocation(
  config: AgentConfig,
  testCase: TestCase,
  version: "old" | "new"
): Promise<SimulatedResult> {
  // Simulate realistic latency (new version slightly faster on average)
  const baseLatency = randomBetween(150, 800);
  const latency = version === "new" ? Math.max(100, baseLatency - randomBetween(0, 100)) : baseLatency;

  await delay(randomBetween(200, 500));

  // Simulate error rate (5% for old, 3% for new — improvement expected)
  const errorRate = version === "new" ? 0.03 : 0.05;
  const error = Math.random() < errorRate;

  // Simulate cost based on model
  const modelCosts: Record<string, number> = {
    "gpt-4o": 0.015,
    "gpt-4o-mini": 0.003,
    "claude-3.5-sonnet": 0.018,
    "claude-3-haiku": 0.002,
  };
  const baseCost = modelCosts[config.budget.primaryModel] || 0.01;
  const cost = baseCost * (1 + Math.random() * 0.3); // ±30% variance

  // Simulate response text
  const response = error
    ? `Error: ${testCase.description} — invocation failed`
    : `Processed: ${testCase.description} — result OK (${latency}ms)`;

  return { latency, error, cost: Number(cost.toFixed(4)), response };
}

function simulateSimilarityScore(oldResponse: string, newResponse: string): number {
  // Simulate LLM-scored similarity. In production this calls OpenAI to compare.
  // Both succeed → high similarity (80-100)
  // One fails → low similarity (20-50)
  // Both fail → medium (50-70)
  const oldError = oldResponse.startsWith("Error:");
  const newError = newResponse.startsWith("Error:");

  if (!oldError && !newError) return randomBetween(82, 98);
  if (oldError && newError) return randomBetween(55, 70);
  return randomBetween(25, 50);
}

function computeMetrics(
  results: Array<{
    oldLatency: number;
    newLatency: number;
    oldError: boolean;
    newError: boolean;
    oldCost: number;
    newCost: number;
    similarity: number;
  }>
): ShadowTestMetrics {
  const n = results.length;
  const avgSimilarity = results.reduce((s, r) => s + r.similarity, 0) / n;
  const avgOldLatency = results.reduce((s, r) => s + r.oldLatency, 0) / n;
  const avgNewLatency = results.reduce((s, r) => s + r.newLatency, 0) / n;
  const oldErrorRate = (results.filter((r) => r.oldError).length / n) * 100;
  const newErrorRate = (results.filter((r) => r.newError).length / n) * 100;
  const avgOldCost = results.reduce((s, r) => s + r.oldCost, 0) / n;
  const avgNewCost = results.reduce((s, r) => s + r.newCost, 0) / n;

  return {
    responseQuality: Number(avgSimilarity.toFixed(1)),
    latencyOld: Math.round(avgOldLatency),
    latencyNew: Math.round(avgNewLatency),
    errorRateOld: Number(oldErrorRate.toFixed(1)),
    errorRateNew: Number(newErrorRate.toFixed(1)),
    costOld: Number(avgOldCost.toFixed(4)),
    costNew: Number(avgNewCost.toFixed(4)),
  };
}

/**
 * Compute weighted quality score from metrics.
 * Weights: 50% response quality, 20% latency improvement, 20% error rate, 10% cost.
 */
function computeQualityScore(metrics: ShadowTestMetrics): number {
  // Response quality: direct score (0-100)
  const qualityComponent = metrics.responseQuality;

  // Latency: score based on improvement (100 if faster, penalize if slower)
  const latencyRatio = metrics.latencyOld > 0 ? metrics.latencyNew / metrics.latencyOld : 1;
  const latencyComponent = Math.min(100, Math.max(0, (2 - latencyRatio) * 50));

  // Error rate: score based on new error rate (0% = 100, 100% = 0)
  const errorComponent = 100 - metrics.errorRateNew;

  // Cost: score based on not being significantly more expensive
  const costRatio = metrics.costOld > 0 ? metrics.costNew / metrics.costOld : 1;
  const costComponent = Math.min(100, Math.max(0, (2 - costRatio) * 50));

  const score =
    qualityComponent * 0.5 +
    latencyComponent * 0.2 +
    errorComponent * 0.2 +
    costComponent * 0.1;

  return Number(Math.min(100, Math.max(0, score)).toFixed(1));
}

// --- Helpers ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
