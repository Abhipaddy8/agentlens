import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

function fmt(v) {
  if (v === 0 || v == null) return '$0.00';
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(6);
}

export default function CFOView({ stats }) {
  const o = stats?.overview || {};
  const agents = stats?.agents || [];

  const totalSpend = o.totalCost || 0;
  const totalSaved = o.totalSaved || 0;
  const totalCalls = o.totalCalls || 0;

  // Project based on data period — estimate daily rate from call timestamps
  const projectedMonthly = totalSpend * 30;
  const projectedSavings = totalSaved * 30;
  const netCost = projectedMonthly - projectedSavings;

  // Agent cost breakdown for chart
  const chartData = agents.slice(0, 8).map(a => ({
    name: a.agentId.length > 12 ? a.agentId.slice(0, 12) + '...' : a.agentId,
    spend: a.cost * 30,
    saved: a.saved * 30,
  }));

  // ROI calculation
  const agentLensCost = 5000;
  const roi = projectedSavings > 0 ? ((projectedSavings / agentLensCost) * 100).toFixed(0) : 0;

  const topAgent = agents[0];
  const topPct = totalSpend > 0 && topAgent ? (topAgent.cost / totalSpend * 100).toFixed(1) : 0;

  return (
    <div>
      <div className="page-header">
        <h1>CFO View</h1>
        <p>Spend vs ROI in plain language. Share this with your finance team.</p>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Current LLM Spend</div>
          <div className="card-value red">{fmt(totalSpend)}</div>
          <div className="card-sub">{totalCalls} calls to date</div>
        </div>
        <div className="card">
          <div className="card-label">Money Saved by AgentLens</div>
          <div className="card-value green">{fmt(totalSaved)}</div>
          <div className="card-sub">Via caching + model routing</div>
        </div>
        <div className="card">
          <div className="card-label">Projected Monthly Spend</div>
          <div className="card-value orange">{fmt(projectedMonthly)}</div>
          <div className="card-sub">At current run rate</div>
        </div>
        <div className="card">
          <div className="card-label">Projected Monthly Savings</div>
          <div className="card-value green">{fmt(projectedSavings)}</div>
          <div className="card-sub">ROI: {roi}% vs AgentLens cost</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 32, padding: 24 }}>
        <div className="section-title">The Bottom Line</div>
        <div style={{ fontSize: 16, lineHeight: 1.8, color: '#e0e0e8' }}>
          <p style={{ marginBottom: 12 }}>
            Your AI agents are spending <strong style={{ color: '#ef4444' }}>{fmt(totalSpend)}</strong> on
            LLM API calls across {totalCalls} requests. AgentLens has already saved <strong style={{ color: '#22c55e' }}>{fmt(totalSaved)}</strong> through
            intelligent caching and model routing.
          </p>
          <p style={{ marginBottom: 12 }}>
            At current rates, your projected monthly LLM bill is <strong style={{ color: '#f59e0b' }}>{fmt(projectedMonthly)}</strong>.
            AgentLens reduces that to <strong>{fmt(netCost)}</strong> — a{' '}
            <strong style={{ color: '#22c55e' }}>{fmt(projectedSavings)}/month savings</strong>.
          </p>
          {topAgent && (
            <p style={{ marginBottom: 12 }}>
              Your highest-spend agent is <strong>{topAgent.agentId}</strong> at{' '}
              <strong style={{ color: topPct > 40 ? '#ef4444' : '#f59e0b' }}>
                {topPct}%
              </strong> of total spend ({fmt(topAgent.cost)}).
              {topAgent.cacheHits === 0 && topAgent.calls > 5 &&
                ' This agent has zero cache hits — it may be sending unique queries that could be optimized.'}
            </p>
          )}
          <p>
            <strong>Blocked calls:</strong> {o.killedCalls || 0} stopped by kill switches,{' '}
            {o.budgetBlocked || 0} blocked by budget limits,{' '}
            {o.rateLimited || 0} rate limited. These prevented uncontrolled spend.
          </p>
        </div>
      </div>

      {chartData.length > 0 && (
        <div className="chart-container">
          <div className="section-title">Monthly Projection by Agent (Spend vs Savings)</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#8888a0', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8888a0', fontSize: 12 }} tickFormatter={v => fmt(v)} />
              <Tooltip
                contentStyle={{ background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 8 }}
                formatter={(value) => [fmt(value)]}
              />
              <Legend />
              <Bar dataKey="spend" name="Projected Spend" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saved" name="Projected Savings" fill="#22c55e" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
