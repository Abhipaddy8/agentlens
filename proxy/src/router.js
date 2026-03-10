/**
 * Rules-based model router.
 * Routes requests to cheaper models when the task doesn't need a premium model.
 *
 * Rules are evaluated in order. First match wins.
 * If no rule matches, the requested model is used as-is.
 */

const DEFAULT_RULES = [
  {
    name: "short-prompt-downgrade",
    description: "Simple short prompts don't need GPT-4 — route to mini",
    condition: (ctx) =>
      ctx.totalInputChars < 200 &&
      ctx.messageCount <= 2 &&
      isExpensiveModel(ctx.requestedModel),
    targetModel: "gpt-4o-mini",
  },
  {
    name: "system-only-downgrade",
    description: "System prompt + short user message = classification task",
    condition: (ctx) =>
      ctx.messageCount === 2 &&
      ctx.messages[0]?.role === "system" &&
      ctx.totalInputChars < 500 &&
      isExpensiveModel(ctx.requestedModel),
    targetModel: "gpt-4o-mini",
  },
  {
    name: "max-tokens-cap",
    description: "If max_tokens is very low, it's a short task — use mini",
    condition: (ctx) =>
      ctx.maxTokens && ctx.maxTokens <= 50 && isExpensiveModel(ctx.requestedModel),
    targetModel: "gpt-4o-mini",
  },
];

const EXPENSIVE_MODELS = new Set([
  "gpt-4",
  "gpt-4-turbo",
  "gpt-4o",
  "o1",
  "claude-3-opus",
]);

function isExpensiveModel(model) {
  return EXPENSIVE_MODELS.has(model);
}

function routeModel(body) {
  const messages = body.messages || [];
  const requestedModel = body.model || "gpt-4o-mini";

  const ctx = {
    requestedModel,
    messages,
    messageCount: messages.length,
    totalInputChars: messages.reduce((sum, m) => sum + (m.content || "").length, 0),
    maxTokens: body.max_tokens || body.max_completion_tokens || null,
    temperature: body.temperature,
    hasTools: !!(body.tools && body.tools.length > 0),
    hasJsonMode: body.response_format?.type === "json_object",
  };

  // Don't route if tools are used (complex task)
  if (ctx.hasTools) {
    return { model: requestedModel, routed: false, rule: null };
  }

  // Don't route if JSON mode (structured output = needs capable model)
  if (ctx.hasJsonMode) {
    return { model: requestedModel, routed: false, rule: null };
  }

  for (const rule of DEFAULT_RULES) {
    if (rule.condition(ctx)) {
      return {
        model: rule.targetModel,
        routed: true,
        rule: rule.name,
        originalModel: requestedModel,
        savings: `Routed ${requestedModel} → ${rule.targetModel} (${rule.name})`,
      };
    }
  }

  return { model: requestedModel, routed: false, rule: null };
}

module.exports = { routeModel, DEFAULT_RULES };
