import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

function fmt(v) {
  if (v === 0 || v == null) return '$0.00';
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(6);
}

export default function CacheView({ stats }) {
  const o = stats?.overview || {};
  const cache = stats?.cache || {};
  const agents = stats?.agents || [];
  const perAgent = (cache.perAgent || []).slice().sort((a, b) => (b.saved || 0) - (a.saved || 0));

  const hitRate = o.cacheHitRate || 0;
  const totalHits = cache.totalHits || 0;
  const totalCalls = o.totalCalls || 0;
  const speedup = cache.speedup || 0;
  const totalSaved = cache.totalSaved || 0;
  const avgCached = cache.avgCachedLatencyMs || 0;
  const avgUncached = cache.avgUncachedLatencyMs || 0;

  // Latency chart: only agents with both cached AND uncached calls
  const latencyData = perAgent
    .filter(a => a.avgCachedMs > 0 && a.avgUncachedMs > 0)
    .slice(0, 8)
    .map(a => ({
      name: a.agentId.length > 14 ? a.agentId.slice(0, 14) + '...' : a.agentId,
      cached: Math.round(a.avgCachedMs),
      uncached: Math.round(a.avgUncachedMs),
    }));

  // Story generation
  const storyLines = [];
  storyLines.push(
    `Your agents made ${totalHits.toLocaleString()} cache hits out of ${totalCalls.toLocaleString()} total calls (${hitRate.toFixed(1)}% hit rate).`
  );
  if (totalSaved > 0) {
    storyLines.push(
      `Cache saved ${fmt(totalSaved)} and reduced average response time from ${Math.round(avgUncached).toLocaleString()}ms to ${Math.round(avgCached).toLocaleString()}ms \u2014 a ${Math.round(speedup)}x speedup.`
    );
  }
  // Agents with 0 hits but >5 calls
  const agentMap = {};
  agents.forEach(a => { agentMap[a.agentId] = a; });
  perAgent.forEach(a => {
    if (a.hits === 0 && (agentMap[a.agentId]?.calls || 0) > 5) {
      storyLines.push(
        `Agent "${a.agentId}" has zero cache hits across ${agentMap[a.agentId].calls} calls \u2014 it may benefit from caching optimization.`
      );
    }
    if (a.hitRate > 50) {
      const perHit = a.hits > 0 ? a.saved / a.hits : 0;
      storyLines.push(
        `Agent "${a.agentId}" has an excellent ${a.hitRate.toFixed(0)}% cache hit rate \u2014 saving ${fmt(perHit)} per cached call.`
      );
    }
  });

  const rateColor = hitRate > 20 ? '#22c55e' : hitRate > 10 ? '#f59e0b' : '#ef4444';
  const hitRateColorFn = (r) => r > 30 ? '#22c55e' : r > 10 ? '#f59e0b' : '#ef4444';

  return (
    <div>
      <div className="page-header">
        <h1>Cache Performance</h1>
        <p>How much your cache is saving in dollars, time, and API calls.</p>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Cache Hit Rate</div>
          <div className="card-value" style={{ color: rateColor, fontSize: 42 }}>{hitRate.toFixed(1)}%</div>
          <div className="card-sub">{totalHits} hits / {totalCalls} calls</div>
        </div>
        <div className="card">
          <div className="card-label">Money Saved by Cache</div>
          <div className="card-value green">{fmt(totalSaved)}</div>
          <div className="card-sub">Zero-cost cached responses</div>
        </div>
        <div className="card">
          <div className="card-label">Speed Boost</div>
          <div className="card-value" style={{ color: '#22c55e', fontSize: 42 }}>{Math.round(speedup)}x</div>
          <div className="card-sub">Cached vs uncached latency</div>
        </div>
        <div className="card">
          <div className="card-label">Total Cache Hits</div>
          <div className="card-value">{totalHits.toLocaleString()}</div>
          <div className="card-sub">out of {totalCalls.toLocaleString()} total calls</div>
        </div>
      </div>

      {latencyData.length > 0 && (
        <div className="chart-container">
          <div className="section-title">Latency: Cached vs Uncached (ms per agent)</div>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={latencyData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }} barGap={2}>
              <XAxis dataKey="name" tick={{ fill: '#8888a0', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8888a0', fontSize: 12 }} tickFormatter={v => v.toLocaleString() + 'ms'} />
              <Tooltip
                contentStyle={{ background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 8 }}
                formatter={(value, name) => [value.toLocaleString() + 'ms', name]}
              />
              <Legend />
              <Bar dataKey="cached" name="Cached" fill="#22c55e" radius={[4, 4, 0, 0]} />
              <Bar dataKey="uncached" name="Uncached" fill="#ef4444" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {perAgent.length > 0 && (
        <div className="card" style={{ marginBottom: 32, overflowX: 'auto' }}>
          <div className="section-title">Cache Savings by Agent</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a3a', color: '#8888a0', textAlign: 'left' }}>
                <th style={{ padding: '10px 12px' }}>Agent</th>
                <th style={{ padding: '10px 8px' }}>Calls</th>
                <th style={{ padding: '10px 8px' }}>Cache Hits</th>
                <th style={{ padding: '10px 8px' }}>Hit Rate</th>
                <th style={{ padding: '10px 8px' }}>Saved</th>
                <th style={{ padding: '10px 8px' }}>Avg Cached</th>
                <th style={{ padding: '10px 8px' }}>Avg Uncached</th>
                <th style={{ padding: '10px 8px' }}>Speedup</th>
              </tr>
            </thead>
            <tbody>
              {perAgent.map((a, i) => {
                const calls = agentMap[a.agentId]?.calls || a.hits || 0;
                const sp = Math.round(a.avgUncachedMs / Math.max(a.avgCachedMs, 1));
                return (
                  <tr key={a.agentId} style={{ borderBottom: '1px solid #1e1e2a' }}>
                    <td style={{ padding: '10px 12px', color: '#e0e0e8', fontWeight: 500 }}>{a.agentId}</td>
                    <td style={{ padding: '10px 8px', color: '#c0c0d0' }}>{calls}</td>
                    <td style={{ padding: '10px 8px', color: '#c0c0d0' }}>{a.hits}</td>
                    <td style={{ padding: '10px 8px' }}>
                      <span style={{ color: hitRateColorFn(a.hitRate), fontWeight: 600 }}>
                        {a.hitRate.toFixed(1)}%
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', color: '#22c55e', fontWeight: 600 }}>{fmt(a.saved)}</td>
                    <td style={{ padding: '10px 8px', color: '#22c55e' }}>{Math.round(a.avgCachedMs)}ms</td>
                    <td style={{ padding: '10px 8px', color: '#ef4444' }}>{Math.round(a.avgUncachedMs).toLocaleString()}ms</td>
                    <td style={{ padding: '10px 8px', color: sp > 100 ? '#22c55e' : '#c0c0d0', fontWeight: 600 }}>
                      {sp}x
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginBottom: 32, padding: 24 }}>
        <div className="section-title">The Story</div>
        <div style={{ fontSize: 16, lineHeight: 1.8, color: '#e0e0e8' }}>
          {storyLines.map((line, i) => (
            <p key={i} style={{ marginBottom: 12 }}>{line}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
