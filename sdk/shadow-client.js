/**
 * AgentLens Shadow Client — Drop-in OpenAI SDK wrapper.
 *
 * Wraps an existing OpenAI client instance. Every call goes to OpenAI
 * normally AND fires an async non-blocking copy to the AgentLens proxy.
 * The shadow copy is NEVER awaited — zero latency impact on the real call.
 *
 * Usage:
 *   const OpenAI = require("openai");
 *   const AgentLens = require("@agentlens/sdk/shadow-client");
 *
 *   const openai = AgentLens.shadow(new OpenAI({ apiKey: "sk-..." }), {
 *     proxyUrl: "https://your-agentlens-proxy.amazonaws.com",
 *     agentId: "my-agent",
 *     customerId: "lenskart",
 *   });
 *
 *   // Use exactly like the OpenAI SDK — same API, same response
 *   const res = await openai.chat.completions.create({
 *     model: "gpt-4o",
 *     messages: [{ role: "user", content: "Hello" }],
 *   });
 *
 * What happens under the hood:
 *   1. The real call goes to OpenAI as normal (no change)
 *   2. After the response arrives, a fire-and-forget copy is sent to AgentLens
 *   3. The copy includes the request body + response usage + shadow headers
 *   4. If the copy fails, it is silently swallowed — never affects the real call
 *   5. Streaming calls: chunks are passed through immediately; usage is sent after stream ends
 */

const http = require("http");
const https = require("https");

/**
 * @typedef {object} ShadowOptions
 * @property {string} proxyUrl — Full URL of the AgentLens proxy (e.g. "https://proxy.example.com")
 * @property {string} [agentId="shadow-agent"] — Agent identifier for tagging calls
 * @property {string} [customerId] — Customer identifier
 * @property {string} [workflowId] — Optional workflow grouping
 * @property {boolean} [enabled=true] — Kill switch for shadow mode (set false to disable without unwrapping)
 * @property {function} [onError] — Optional error callback for debugging (default: silent swallow)
 */

class AgentLens {
  /**
   * Wrap an OpenAI client instance with shadow mode.
   * Returns a proxy object that looks identical to the OpenAI SDK.
   *
   * @param {object} openaiClient — An instantiated OpenAI client (from the `openai` npm package)
   * @param {ShadowOptions} options
   * @returns {object} — A wrapped client with the same API surface
   */
  static shadow(openaiClient, options = {}) {
    const config = {
      proxyUrl: options.proxyUrl,
      agentId: options.agentId || "shadow-agent",
      customerId: options.customerId || null,
      workflowId: options.workflowId || null,
      enabled: options.enabled !== false,
      onError: options.onError || (() => {}),
    };

    if (!config.proxyUrl) {
      throw new Error("AgentLens.shadow() requires a proxyUrl option");
    }

    // Create a deep proxy that intercepts chat.completions.create()
    return createShadowProxy(openaiClient, config);
  }
}

/**
 * Build a Proxy wrapper around the OpenAI client.
 * Only intercepts chat.completions.create — everything else passes through.
 */
function createShadowProxy(client, config) {
  // We need to intercept: client.chat.completions.create(...)
  // Strategy: proxy `client.chat` to proxy `.completions` to proxy `.create`

  const originalChat = client.chat;
  const originalCompletions = originalChat.completions;
  const originalCreate = originalCompletions.create.bind(originalCompletions);

  // Build the wrapped create function
  const wrappedCreate = function shadowCreate(params, options) {
    if (!config.enabled) {
      return originalCreate(params, options);
    }

    const isStreaming = params.stream === true;

    if (isStreaming) {
      return handleStreamingShadow(originalCreate, params, options, config);
    } else {
      return handleNonStreamingShadow(originalCreate, params, options, config);
    }
  };

  // Create a completions-like object with our wrapped create
  const wrappedCompletions = new Proxy(originalCompletions, {
    get(target, prop) {
      if (prop === "create") return wrappedCreate;
      return target[prop];
    },
  });

  // Create a chat-like object with our wrapped completions
  const wrappedChat = new Proxy(originalChat, {
    get(target, prop) {
      if (prop === "completions") return wrappedCompletions;
      return target[prop];
    },
  });

  // Create the top-level client proxy
  return new Proxy(client, {
    get(target, prop) {
      if (prop === "chat") return wrappedChat;
      return target[prop];
    },
  });
}

/**
 * Handle non-streaming calls.
 * 1. Call OpenAI normally, await the response
 * 2. Fire shadow copy to proxy (fire-and-forget)
 * 3. Return the original response immediately
 */
async function handleNonStreamingShadow(originalCreate, params, options, config) {
  // Real call — untouched
  const response = await originalCreate(params, options);

  // Fire shadow copy — never awaited, never throws
  fireShadowCopy(params, response.usage || null, config).catch(config.onError);

  return response;
}

/**
 * Handle streaming calls.
 * 1. Call OpenAI normally, get the stream
 * 2. Wrap the stream to capture usage from the final chunk
 * 3. After stream ends, fire shadow copy with collected usage
 * 4. Every chunk is yielded immediately — zero latency impact
 */
async function handleStreamingShadow(originalCreate, params, options, config) {
  // Real call — untouched, returns an async iterable stream
  const stream = await originalCreate(params, options);

  // Wrap the stream to intercept chunks for usage extraction
  return wrapStream(stream, params, config);
}

/**
 * Wrap an OpenAI streaming response to capture usage data.
 * The wrapper yields every chunk immediately (zero delay).
 * After the stream ends, fires the shadow copy.
 */
function wrapStream(stream, params, config) {
  let collectedUsage = null;

  // The OpenAI SDK returns an async iterable with additional methods.
  // We need to preserve the full interface while intercepting iteration.

  // If the stream has a Symbol.asyncIterator, wrap it
  if (stream[Symbol.asyncIterator]) {
    const originalIterator = stream[Symbol.asyncIterator].bind(stream);

    const wrappedStream = new Proxy(stream, {
      get(target, prop) {
        if (prop === Symbol.asyncIterator) {
          return function () {
            const iterator = originalIterator();
            return {
              async next() {
                const result = await iterator.next();
                if (!result.done) {
                  const chunk = result.value;
                  // Capture usage from final chunk (OpenAI includes it when stream_options.include_usage is set)
                  if (chunk.usage) {
                    collectedUsage = chunk.usage;
                  }
                  // Also try x_usage pattern
                  if (chunk.x_usage) {
                    collectedUsage = chunk.x_usage;
                  }
                }
                if (result.done) {
                  // Stream ended — fire shadow copy
                  fireShadowCopy(params, collectedUsage, config).catch(config.onError);
                }
                return result;
              },
              async return(value) {
                if (iterator.return) {
                  return iterator.return(value);
                }
                return { done: true, value };
              },
              async throw(error) {
                if (iterator.throw) {
                  return iterator.throw(error);
                }
                throw error;
              },
            };
          };
        }

        // For .controller, .response, and other properties — pass through
        const val = target[prop];
        if (typeof val === "function") {
          return val.bind(target);
        }
        return val;
      },
    });

    return wrappedStream;
  }

  // Fallback: if it's not an async iterable, just fire the copy and return as-is
  fireShadowCopy(params, null, config).catch(config.onError);
  return stream;
}

/**
 * Fire an async, non-blocking copy to the AgentLens proxy.
 * This function is NEVER awaited by the caller. Failures are silently swallowed.
 *
 * @param {object} requestBody — The original request params
 * @param {object|null} usage — Token usage from the response (if available)
 * @param {object} config — Shadow configuration
 */
async function fireShadowCopy(requestBody, usage, config) {
  const url = new URL("/v1/chat/completions", config.proxyUrl);
  const isHttps = url.protocol === "https:";
  const transport = isHttps ? https : http;

  const shadowBody = {
    ...requestBody,
    // Strip stream flag — shadow copy is always non-streaming
    stream: false,
    // Attach the real response usage so the proxy can calculate costs
    _shadow_response: usage ? { usage } : null,
    // Include usage at top level too for simpler parsing
    usage: usage || undefined,
  };

  const postData = JSON.stringify(shadowBody);

  return new Promise((resolve) => {
    const req = transport.request(
      {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
          "x-shadow-mode": "true",
          "x-agent-id": config.agentId,
          ...(config.customerId && { "x-customer-id": config.customerId }),
          ...(config.workflowId && { "x-workflow-id": config.workflowId }),
        },
        // Aggressive timeouts — shadow copy must never slow anything down
        timeout: 5000,
      },
      (res) => {
        // Drain the response to free the socket
        res.resume();
        resolve();
      }
    );

    req.on("error", () => resolve()); // Silently swallow
    req.on("timeout", () => {
      req.destroy();
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

module.exports = AgentLens;
