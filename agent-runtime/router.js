/**
 * AgentLens Agent Runtime — Query Routing Module
 *
 * Intelligent routing layer for built agents. Every query is classified
 * by an LLM to determine the best data source. Not hardcoded tool chains —
 * the agent decides the right source per query.
 *
 * Pipeline: Query Classifier -> Tool Selector -> Data Source Router -> Confidence Gate
 *
 * Inspired by TechStack Tetris 3-2 pattern.
 *
 * @module agent-runtime/router
 */

const OpenAI = require("openai");

/**
 * Available data source types.
 * @enum {string}
 */
const SOURCE_TYPE = {
  WEB_SEARCH: "web_search",
  DATABASE: "database",
  DOCUMENT: "document",
  API_CALL: "api_call",
};

/**
 * System prompt for the query classifier LLM.
 * Instructs the model to classify queries and select the optimal data source.
 */
const CLASSIFIER_SYSTEM_PROMPT = `You are a query routing classifier for an AI agent. Your job is to analyze an incoming query and determine the best data source to answer it.

Available data sources will be provided. For each query, you must:
1. Classify the query type (factual, analytical, real-time, historical, action)
2. Select the best data source from the available options
3. Provide a confidence score (0.0 to 1.0)
4. If confidence is below 0.5, suggest a fallback source

Respond in JSON format only:
{
  "queryType": "factual|analytical|real-time|historical|action",
  "selectedSource": "<source name>",
  "sourceType": "web_search|database|document|api_call",
  "confidence": 0.85,
  "reasoning": "<one sentence explaining why this source>",
  "fallbackSource": "<source name or null>",
  "fallbackSourceType": "<type or null>"
}`;

/**
 * Route a query to the best available data source.
 * Uses gpt-4o-mini for classification (fast, cheap, accurate enough for routing).
 *
 * @param {string} query - The user/agent query to route
 * @param {Array<{name: string, type: string, description: string}>} availableSources - List of available data sources
 * @param {object} [options] - Routing options
 * @param {string} [options.proxyUrl] - AgentLens proxy URL (uses env var if not provided)
 * @param {string} [options.agentId] - Agent ID for proxy header
 * @param {number} [options.confidenceThreshold=0.5] - Minimum confidence to accept routing
 * @returns {Promise<{source: string, sourceType: string, confidence: number, reasoning: string, fallback: string|null}>}
 */
async function routeQuery(query, availableSources, options = {}) {
  const {
    proxyUrl = process.env.AGENTLENS_PROXY_URL,
    agentId = process.env.AGENT_ID || "query-router",
    confidenceThreshold = 0.5,
  } = options;

  if (!query || typeof query !== "string") {
    throw new Error("Query must be a non-empty string");
  }

  if (!availableSources || availableSources.length === 0) {
    throw new Error("At least one data source must be available");
  }

  // If only one source is available, skip LLM classification
  if (availableSources.length === 1) {
    return {
      source: availableSources[0].name,
      sourceType: availableSources[0].type,
      confidence: 1.0,
      reasoning: "Only one data source available",
      fallback: null,
    };
  }

  // Build the source description for the classifier
  const sourceList = availableSources
    .map((s) => `- ${s.name} (${s.type}): ${s.description || "No description"}`)
    .join("\n");

  // Initialize OpenAI client (through proxy if available)
  const clientConfig = {
    apiKey: process.env.OPENAI_API_KEY,
  };

  if (proxyUrl) {
    clientConfig.baseURL = `${proxyUrl.replace(/\/$/, "")}/v1`;
    clientConfig.defaultHeaders = {
      "x-agent-id": agentId,
      "x-workflow-id": "query-routing",
    };
  }

  const client = new OpenAI(clientConfig);

  let classification;
  try {
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CLASSIFIER_SYSTEM_PROMPT },
        {
          role: "user",
          content: `Query: "${query}"\n\nAvailable data sources:\n${sourceList}`,
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1, // Low temperature for consistent routing
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from classifier");
    }

    classification = JSON.parse(content);
  } catch (err) {
    console.error(`[router] Classification failed: ${err.message}`);
    // Fail open: use the first available source
    return {
      source: availableSources[0].name,
      sourceType: availableSources[0].type,
      confidence: 0.0,
      reasoning: `Classification failed (${err.message}), using default source`,
      fallback: availableSources.length > 1 ? availableSources[1].name : null,
    };
  }

  // Validate the selected source exists in available sources
  const selectedSource = availableSources.find(
    (s) => s.name === classification.selectedSource
  );

  if (!selectedSource) {
    console.warn(
      `[router] Classifier selected unknown source "${classification.selectedSource}", using first available`
    );
    return {
      source: availableSources[0].name,
      sourceType: availableSources[0].type,
      confidence: 0.3,
      reasoning: `Classifier selected unknown source, falling back to default`,
      fallback: availableSources.length > 1 ? availableSources[1].name : null,
    };
  }

  // Apply confidence gate
  const confidence = classification.confidence || 0;
  if (confidence < confidenceThreshold && classification.fallbackSource) {
    const fallbackSource = availableSources.find(
      (s) => s.name === classification.fallbackSource
    );

    if (fallbackSource) {
      console.log(
        `[router] Low confidence (${confidence}) for "${classification.selectedSource}", ` +
        `using fallback "${classification.fallbackSource}"`
      );
      return {
        source: fallbackSource.name,
        sourceType: fallbackSource.type,
        confidence,
        reasoning: `Low confidence routing. Original: ${classification.selectedSource}. ${classification.reasoning}`,
        fallback: classification.selectedSource,
      };
    }
  }

  return {
    source: selectedSource.name,
    sourceType: selectedSource.type,
    confidence,
    reasoning: classification.reasoning || "No reasoning provided",
    fallback: classification.fallbackSource || null,
  };
}

/**
 * Create a pre-configured router for a specific agent.
 * Useful when an agent has a fixed set of data sources and wants
 * to call routeQuery without passing sources every time.
 *
 * @param {Array<{name: string, type: string, description: string}>} sources - Fixed data sources
 * @param {object} options - Router options (proxyUrl, agentId, confidenceThreshold)
 * @returns {{route: (query: string) => Promise<object>}} Router instance
 */
function createRouter(sources, options = {}) {
  return {
    /**
     * Route a query using the pre-configured sources.
     * @param {string} query
     * @returns {Promise<{source: string, sourceType: string, confidence: number, reasoning: string, fallback: string|null}>}
     */
    route: (query) => routeQuery(query, sources, options),
  };
}

module.exports = {
  routeQuery,
  createRouter,
  SOURCE_TYPE,
};
