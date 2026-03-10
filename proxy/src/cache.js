const crypto = require("crypto");
const { ddb, TABLE } = require("./dynamo");
const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");

const CACHE_TTL_HOURS = parseInt(process.env.CACHE_TTL_HOURS || "24", 10);

function buildCacheKey(model, messages) {
  // Normalize: sort message keys, strip whitespace variations
  const normalized = messages.map((m) => ({
    role: m.role,
    content: (m.content || "").trim().toLowerCase(),
  }));
  const payload = JSON.stringify({ model, messages: normalized });
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function getCached(model, messages, ttlHours) {
  const cacheKey = buildCacheKey(model, messages);
  try {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE.CACHE,
      Key: { cacheKey },
    }));
    if (!res.Item) return null;

    // Check TTL — use per-agent ttlHours if provided, otherwise use stored ttl
    if (ttlHours != null) {
      const cachedAt = res.Item.cachedAt ? new Date(res.Item.cachedAt).getTime() : 0;
      const maxAge = ttlHours * 3600 * 1000;
      if (Date.now() - cachedAt > maxAge) return null;
    } else if (res.Item.ttl && res.Item.ttl < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      cacheKey,
      response: res.Item.response,
      usage: res.Item.usage,
      cachedAt: res.Item.cachedAt,
    };
  } catch {
    return null;
  }
}

async function putCache(model, messages, response, usage, ttlHours) {
  const cacheKey = buildCacheKey(model, messages);
  const effectiveTTL = ttlHours != null ? ttlHours : CACHE_TTL_HOURS;
  try {
    await ddb.send(new PutCommand({
      TableName: TABLE.CACHE,
      Item: {
        cacheKey,
        model,
        response,
        usage,
        cachedAt: new Date().toISOString(),
        ttl: Math.floor(Date.now() / 1000) + effectiveTTL * 3600,
      },
    }));
  } catch (err) {
    console.error("Cache write failed:", err.message);
  }
}

module.exports = { buildCacheKey, getCached, putCache };
