/**
 * Quality Evaluator — Analyzes shadow test results and recommends action.
 *
 * Takes aggregated shadow test metrics and produces a quality report
 * with a deploy/rollback/manual-review recommendation.
 */

import { ShadowTestResult, QualityReport } from "./types";

/** Configurable thresholds for quality evaluation. */
export interface QualityThresholds {
  /** Minimum overall quality score to auto-deploy (default: 80) */
  deployThreshold: number;
  /** Below this score, auto-rollback (default: 50) */
  rollbackThreshold: number;
  /** Maximum acceptable latency increase percentage (default: 30) */
  maxLatencyIncreasePct: number;
  /** Maximum acceptable error rate for new version (default: 5) */
  maxErrorRate: number;
  /** Maximum acceptable cost increase percentage (default: 25) */
  maxCostIncreasePct: number;
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
  deployThreshold: 80,
  rollbackThreshold: 50,
  maxLatencyIncreasePct: 30,
  maxErrorRate: 5,
  maxCostIncreasePct: 25,
};

/**
 * Evaluate shadow test results and produce a quality report.
 *
 * Scoring weights:
 *   50% — Response quality (semantic similarity between old and new outputs)
 *   20% — Latency (penalize if new version is slower)
 *   20% — Error rate (penalize high error rate)
 *   10% — Cost (penalize if significantly more expensive)
 */
export function evaluateQuality(
  shadowResults: ShadowTestResult,
  thresholds: Partial<QualityThresholds> = {}
): QualityReport {
  const t = { ...DEFAULT_THRESHOLDS, ...thresholds };
  const m = shadowResults.metrics;

  // Calculate individual component scores
  const responseQualityScore = m.responseQuality; // 0-100 directly

  // Latency delta: negative = improvement, positive = regression
  const latencyDelta = m.latencyOld > 0
    ? ((m.latencyNew - m.latencyOld) / m.latencyOld) * 100
    : 0;
  const latencyScore = Math.min(100, Math.max(0, 100 - Math.max(0, latencyDelta) * 2));

  // Error rate score: 0% errors = 100, 100% errors = 0
  const errorRateScore = 100 - m.errorRateNew;

  // Cost delta: negative = savings, positive = more expensive
  const costDelta = m.costOld > 0
    ? ((m.costNew - m.costOld) / m.costOld) * 100
    : 0;
  const costScore = Math.min(100, Math.max(0, 100 - Math.max(0, costDelta) * 2));

  // Weighted overall score
  const qualityScore = Number(
    (
      responseQualityScore * 0.5 +
      latencyScore * 0.2 +
      errorRateScore * 0.2 +
      costScore * 0.1
    ).toFixed(1)
  );

  // Determine recommendation based on score and hard limits
  let recommendation: "deploy" | "rollback" | "manual-review";

  // Hard limits that force manual review or rollback regardless of score
  const hardLimitViolations: string[] = [];

  if (latencyDelta > t.maxLatencyIncreasePct) {
    hardLimitViolations.push(`Latency increased ${latencyDelta.toFixed(1)}% (max: ${t.maxLatencyIncreasePct}%)`);
  }
  if (m.errorRateNew > t.maxErrorRate) {
    hardLimitViolations.push(`Error rate ${m.errorRateNew}% exceeds max ${t.maxErrorRate}%`);
  }
  if (costDelta > t.maxCostIncreasePct) {
    hardLimitViolations.push(`Cost increased ${costDelta.toFixed(1)}% (max: ${t.maxCostIncreasePct}%)`);
  }

  if (hardLimitViolations.length > 0) {
    // Hard limit violated — manual review if score is ok, rollback if score is bad
    recommendation = qualityScore >= t.rollbackThreshold ? "manual-review" : "rollback";
  } else if (qualityScore >= t.deployThreshold) {
    recommendation = "deploy";
  } else if (qualityScore >= t.rollbackThreshold) {
    recommendation = "manual-review";
  } else {
    recommendation = "rollback";
  }

  return {
    passed: recommendation === "deploy",
    qualityScore,
    recommendation,
    details: {
      responseQualityScore,
      latencyScore,
      latencyDeltaPct: Number(latencyDelta.toFixed(1)),
      errorRateScore,
      errorRateNew: m.errorRateNew,
      costScore,
      costDeltaPct: Number(costDelta.toFixed(1)),
    },
  };
}

/**
 * Format a quality report as human-readable text for the chat stream.
 */
export function formatQualityReport(report: QualityReport): string {
  const lines: string[] = [];
  const icon = report.passed ? "PASS" : report.recommendation === "rollback" ? "FAIL" : "REVIEW";

  lines.push(`\n**Quality Evaluation: ${icon}** — Score: ${report.qualityScore}/100\n\n`);
  lines.push(`| Metric | Score | Detail |\n`);
  lines.push(`|--------|-------|--------|\n`);
  lines.push(`| Response Quality | ${report.details.responseQualityScore} | Semantic similarity |\n`);
  lines.push(`| Latency | ${report.details.latencyScore} | ${report.details.latencyDeltaPct > 0 ? "+" : ""}${report.details.latencyDeltaPct}% change |\n`);
  lines.push(`| Error Rate | ${report.details.errorRateScore} | ${report.details.errorRateNew}% errors |\n`);
  lines.push(`| Cost | ${report.details.costScore} | ${report.details.costDeltaPct > 0 ? "+" : ""}${report.details.costDeltaPct}% change |\n`);
  lines.push(`\n**Recommendation:** ${report.recommendation.toUpperCase()}\n`);

  return lines.join("");
}
