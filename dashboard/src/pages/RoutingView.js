import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function fmt(v) {
  if (v === 0 || v == null) return '$0.00';
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(6);
}

const RULE_DESC = {
  'short-prompt-downgrade': "Short prompts don't need premium models",
  'system-only-downgrade': 'Simple classification tasks use cheaper models',
  'max-tokens-cap': 'Low max_tokens = short task = cheaper model',
};

export default function RoutingView({ stats }) {
  const routing = stats?.routing || {};
  const overview = stats?.overview || {};
  const agents = stats?.agents || [];

  const totalRouted = routing.totalRouted || 0;
  const totalSaved = routing.totalSaved || 0;
  const totalCalls = overview.totalCalls || 0;
  const routeRate = totalCalls > 0 ? ((totalRouted / totalCalls) * 100).toFixed(1) : '0.0';
  const rules = (routing.rules || []).sort((a, b) => (b.saved || 0) - (a.saved || 0));
  const activeRules = rules.filter(r => r.count > 0).length;

  // "What you would have paid" — sum original cost vs routed cost
  const withoutRouting = (overview.totalCost || 0) + totalSaved;
  const withRouting = overview.totalCost || 0;

  // Per-agent routing data — only agents with routed calls
  const perAgent = (routing.perAgent || []).filter(a => a.routedCount > 0);
  const agentMap = {};
  agents.forEach(a => { agentMap[a.agentId] = a; });

  // Chart data for per-agent savings
  const chartData = perAgent.slice(0, 8).map(a => ({
    name: a.agentId.length > 14 ? a.agentId.slice(0, 14) + '..' : a.agentId,
    saved: a.saved || 0,
    routed: a.routedCount || 0,
  }));

  // Find the agent with most routing for insight
  const topRouted = perAgent.length > 0
    ? perAgent.reduce((a, b) => (b.routedCount > a.routedCount ? b : a))
    : null;
  const topPct = topRouted && agentMap[topRouted.agentId]
    ? ((topRouted.routedCount / agentMap[topRouted.agentId].calls) * 100).toFixed(0)
    : 0;

  return (
    <div>
      <div className="page-header">
        <h1>Smart Routing</h1>
        <p>How AgentLens downgrades expensive models to cheaper ones when the task is simple enough.</p>
      </div>

      {/* Hero Cards */}
      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Routes Triggered</div>
          <div className="card-value">{totalRouted}</div>
          <div className="card-sub">calls optimized</div>
        </div>
        <div className="card">
          <div className="card-label">Routing Savings</div>
          <div className="card-value green">{fmt(totalSaved)}</div>
          <div className="card-sub">from smart model selection</div>
        </div>
        <div className="card">
          <div className="card-label">Route Rate</div>
          <div className="card-value">{routeRate}%</div>
          <div className="card-sub">of {totalCalls} total calls</div>
        </div>
        <div className="card">
          <div className="card-label">Active Rules</div>
          <div className="card-value">{activeRules}</div>
          <div className="card-sub">{rules.length} rules configured</div>
        </div>
      </div>

      {/* WOW Section */}
      <div className="card" style={{ marginBottom: 32, padding: 28, textAlign: 'center' }}>
        <div className="section-title" style={{ marginBottom: 20 }}>What You Would Have Paid</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 40, flexWrap: 'wrap' }}>
          <div>
            <div style={{ color: '#8888a0', fontSize: 13, marginBottom: 4 }}>Without routing</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#ef4444' }}>{fmt(withoutRouting)}</div>
          </div>
          <div style={{ fontSize: 28, color: '#555' }}>→</div>
          <div>
            <div style={{ color: '#8888a0', fontSize: 13, marginBottom: 4 }}>With routing</div>
            <div style={{ fontSize: 32, fontWeight: 700, color: '#22c55e' }}>{fmt(withRouting)}</div>
          </div>
          <div style={{ fontSize: 28, color: '#555' }}>→</div>
          <div>
            <div style={{ color: '#8888a0', fontSize: 13, marginBottom: 4 }}>You saved</div>
            <div style={{ fontSize: 36, fontWeight: 800, color: '#22c55e' }}>{fmt(totalSaved)}</div>
          </div>
        </div>
      </div>

      {/* Routing Rules Table */}
      {rules.length > 0 && (
        <div className="card" style={{ marginBottom: 32, padding: 24 }}>
          <div className="section-title">Routing Rules Breakdown</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a3a', color: '#8888a0', fontSize: 12, textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Rule</th>
                <th style={{ padding: '8px 12px' }}>Description</th>
                <th style={{ padding: '8px 12px' }}>Triggers</th>
                <th style={{ padding: '8px 12px' }}>From</th>
                <th style={{ padding: '8px 12px' }}>To</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Savings</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #1a1a25' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, color: '#e0e0e8' }}>{r.rule}</td>
                  <td style={{ padding: '10px 12px', color: '#8888a0', fontSize: 13 }}>{RULE_DESC[r.rule] || 'Custom rule'}</td>
                  <td style={{ padding: '10px 12px' }}>{r.count}</td>
                  <td style={{ padding: '10px 12px', color: '#ef4444', fontSize: 13 }}>{r.from}</td>
                  <td style={{ padding: '10px 12px', color: '#22c55e', fontSize: 13 }}>{r.to}</td>
                  <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmt(r.saved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Per-Agent Chart */}
      {chartData.length > 0 && (
        <div className="chart-container">
          <div className="section-title">Routing Savings by Agent</div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#8888a0', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8888a0', fontSize: 12 }} tickFormatter={v => fmt(v)} />
              <Tooltip
                contentStyle={{ background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 8 }}
                formatter={(value, name) => [name === 'saved' ? fmt(value) : value, name === 'saved' ? 'Saved' : 'Routed']}
              />
              <Bar dataKey="saved" name="Saved" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Per-Agent Table */}
      {perAgent.length > 0 && (
        <div className="card" style={{ marginBottom: 32, padding: 24 }}>
          <div className="section-title">Per-Agent Routing</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2a2a3a', color: '#8888a0', fontSize: 12, textAlign: 'left' }}>
                <th style={{ padding: '8px 12px' }}>Agent</th>
                <th style={{ padding: '8px 12px' }}>Total Calls</th>
                <th style={{ padding: '8px 12px' }}>Routed</th>
                <th style={{ padding: '8px 12px' }}>Route Rate</th>
                <th style={{ padding: '8px 12px' }}>Requested</th>
                <th style={{ padding: '8px 12px' }}>Actual</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Saved</th>
              </tr>
            </thead>
            <tbody>
              {perAgent.map((a, i) => {
                const total = agentMap[a.agentId]?.calls || a.routedCount;
                const pct = total > 0 ? ((a.routedCount / total) * 100).toFixed(0) : 0;
                return (
                  <tr key={i} style={{ borderBottom: '1px solid #1a1a25' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#e0e0e8' }}>{a.agentId}</td>
                    <td style={{ padding: '10px 12px' }}>{total}</td>
                    <td style={{ padding: '10px 12px' }}>{a.routedCount}</td>
                    <td style={{ padding: '10px 12px', color: pct > 50 ? '#22c55e' : '#f59e0b' }}>{pct}%</td>
                    <td style={{ padding: '10px 12px', color: '#ef4444', fontSize: 13 }}>{a.requestedModel}</td>
                    <td style={{ padding: '10px 12px', color: '#22c55e', fontSize: 13 }}>{a.actualModel}</td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', color: '#22c55e', fontWeight: 600 }}>{fmt(a.saved)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Smart Routing Insight */}
      <div className="card" style={{ marginBottom: 32, padding: 24 }}>
        <div className="section-title">Smart Routing Insight</div>
        <div style={{ fontSize: 15, lineHeight: 1.8, color: '#e0e0e8' }}>
          <p style={{ marginBottom: 10 }}>
            AgentLens automatically downgraded <strong style={{ color: '#22c55e' }}>{totalRouted} calls</strong> from
            expensive to cheaper models — saving <strong style={{ color: '#22c55e' }}>{fmt(totalSaved)}</strong> that
            your agents would have wasted on overqualified models.
          </p>
          {topRouted && (
            <p style={{ marginBottom: 10 }}>
              Your <strong>{topRouted.agentId}</strong> agent requested <strong style={{ color: '#ef4444' }}>{topRouted.requestedModel}</strong> but{' '}
              <strong style={{ color: '#22c55e' }}>{topPct}%</strong> of its calls were simple enough for{' '}
              <strong style={{ color: '#22c55e' }}>{topRouted.actualModel}</strong>.
            </p>
          )}
          {totalRouted === 0 && (
            <p style={{ color: '#8888a0' }}>
              No routing has triggered yet. Once your agents start making calls, AgentLens will automatically
              downgrade simple tasks to cheaper models.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
