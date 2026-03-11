require("dotenv").config({ override: true });
const http = require("http");
const { handler } = require("./handler");

const PORT = process.env.PORT || 3100;

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(200, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-agent-id, x-workflow-id, x-prompt-version, x-cache, x-shadow-mode, x-customer-id",
    });
    res.end();
    return;
  }

  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", async () => {
    try {
      const event = {
        httpMethod: req.method,
        path: req.url.split("?")[0],
        headers: req.headers,
        body,
      };

      const result = await handler(event);

      // Streaming response — pipe SSE chunks from upstream to client
      if (result.isStream) {
        const headers = result.headers || {};
        res.writeHead(result.statusCode, headers);

        const chunks = [];
        result.stream.on("data", (chunk) => {
          const text = chunk.toString();
          chunks.push(text);
          res.write(text);
        });

        result.stream.on("end", () => {
          res.end();
          // Async logging — don't block the response
          if (result.onStreamEnd) {
            result.onStreamEnd(chunks).catch((err) => {
              console.error("Stream end logging failed:", err.message);
            });
          }
        });

        result.stream.on("error", (err) => {
          console.error("Upstream stream error:", err.message);
          res.end();
        });

        return;
      }

      // Standard JSON response
      const resHeaders = result.headers || {};
      res.writeHead(result.statusCode, resHeaders);
      res.end(result.body);
    } catch (err) {
      console.error("Server error:", err);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: { message: "Internal server error" } }));
    }
  });
});

server.listen(PORT, () => {
  console.log(`⚡ AgentLens proxy v2.0 running on http://localhost:${PORT}`);
  console.log(`   POST /v1/chat/completions — OpenAI-compatible (streaming supported)`);
  console.log(`   GET  /health              — Health check`);
  console.log(`   GET  /api/stats           — Dashboard stats`);
  console.log(`   POST /api/controls        — Kill switches`);
  console.log(`   POST /api/budgets         — Budget limits`);
  console.log(`   POST /api/rate-limits     — Rate limit config`);
  console.log(`   GET  /api/rate-limits     — Rate limit status`);
  console.log(`   GET  /api/versions/:id    — Prompt versions`);
  console.log(`   POST /api/versions/rollback — Rollback prompt version`);
  console.log("");
  console.log(`   Headers: x-agent-id, x-workflow-id, x-prompt-version`);
  console.log(`   Set OPENAI_API_KEY to forward to OpenAI`);
  console.log(`   Set DYNAMO_ENDPOINT=http://localhost:8000 for local DynamoDB`);
});
