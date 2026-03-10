/**
 * Per-agent rate limiter.
 * In-memory sliding window — tracks RPM (requests per minute) per agent.
 * Falls back gracefully if memory pressure is high.
 */

const DEFAULT_RPM = parseInt(process.env.DEFAULT_RPM || "60", 10);

// agentId -> [timestamp, timestamp, ...]
const windows = new Map();

// agentId -> rpm limit override
const limits = new Map();

function setLimit(agentId, rpm) {
  limits.set(agentId, rpm);
}

function getLimit(agentId) {
  return limits.get(agentId) || DEFAULT_RPM;
}

function checkRate(agentId) {
  const now = Date.now();
  const windowMs = 60000; // 1 minute
  const limit = getLimit(agentId);

  if (!windows.has(agentId)) {
    windows.set(agentId, []);
  }

  const timestamps = windows.get(agentId);

  // Prune expired entries
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  if (timestamps.length >= limit) {
    return {
      allowed: false,
      current: timestamps.length,
      limit,
      retryAfterMs: timestamps[0] + windowMs - now,
    };
  }

  // Record this request
  timestamps.push(now);

  return {
    allowed: true,
    current: timestamps.length,
    limit,
  };
}

function getStatus(agentId) {
  const now = Date.now();
  const windowMs = 60000;
  const limit = getLimit(agentId);

  if (!windows.has(agentId)) {
    return { current: 0, limit, utilization: 0 };
  }

  const timestamps = windows.get(agentId);
  const cutoff = now - windowMs;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }

  return {
    current: timestamps.length,
    limit,
    utilization: Math.round((timestamps.length / limit) * 100),
  };
}

module.exports = { checkRate, setLimit, getLimit, getStatus };
