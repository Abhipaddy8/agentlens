import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const COLORS = ['#6366f1', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];

// Smart dollar formatter — shows enough precision to be meaningful
function fmt(v) {
  if (v === 0 || v == null) return '$0.00';
  if (v >= 1) return '$' + v.toFixed(2);
  if (v >= 0.01) return '$' + v.toFixed(4);
  return '$' + v.toFixed(6);
}

export default function Overview({ stats }) {
  const o = stats?.overview || {};
  const agents = stats?.agents || [];

  const chartData = agents.slice(0, 10).map(a => ({
    name: a.agentId.length > 15 ? a.agentId.slice(0, 15) + '...' : a.agentId,
    cost: a.cost,
    saved: a.saved,
    calls: a.calls,
  }));

  return (
    <div>
      <div className="page-header">
        <h1>Overview</h1>
        <p>Real-time spend and savings across all agents</p>
      </div>

      <div className="cards-grid">
        <div className="card">
          <div className="card-label">Total Spend</div>
          <div className="card-value red">{fmt(o.totalCost)}</div>
          <div className="card-sub">{o.totalCalls || 0} total calls</div>
        </div>
        <div className="card">
          <div className="card-label">Cache Savings</div>
          <div className="card-value green">{fmt(o.totalSaved)}</div>
          <div className="card-sub">{o.cacheHitRate || 0}% cache hit rate</div>
        </div>
        <div className="card">
          <div className="card-label">Calls Blocked</div>
          <div className="card-value orange">{(o.killedCalls || 0) + (o.budgetBlocked || 0) + (o.rateLimited || 0)}</div>
          <div className="card-sub">{o.killedCalls || 0} killed, {o.budgetBlocked || 0} budget, {o.rateLimited || 0} rate limited</div>
        </div>
        <div className="card">
          <div className="card-label">Active Agents</div>
          <div className="card-value accent">{agents.length}</div>
          <div className="card-sub">{o.routedCalls || 0} routed, {o.streamedCalls || 0} streamed</div>
        </div>
      </div>

      {stats?.shadow && (
        <div className="shadow-mode-section">
          <div className="shadow-header">
            <div className="shadow-title-row">
              <span className="section-title">Shadow Mode</span>
              <span className="badge badge-accent">Active</span>
            </div>
            <p className="shadow-description">
              Shadow mode captures a copy of every LLM call without affecting performance.
              After 14 days, AgentLens generates a waste report showing exactly how much you can save.
            </p>
          </div>
          <div className="shadow-stats">
            <div className="shadow-stat">
              <div className="card-label">Shadow Calls Captured</div>
              <div className="card-value accent">{(stats.shadow.totalCalls || 0).toLocaleString()}</div>
            </div>
            <div className="shadow-stat">
              <div className="card-label">Projected Monthly Savings</div>
              <div className="card-value green">{fmt(stats.shadow.projectedMonthlySavings || 0)}</div>
            </div>
            <div className="shadow-stat">
              <div className="card-label">Days Until Full Report</div>
              <div className="card-value blue">{stats.shadow.daysRemaining != null ? stats.shadow.daysRemaining : 14}</div>
              <div className="shadow-progress-bar">
                <div
                  className="shadow-progress-fill"
                  style={{ width: `${((14 - (stats.shadow.daysRemaining != null ? stats.shadow.daysRemaining : 14)) / 14) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {chartData.length > 0 && (
        <div className="chart-container">
          <div className="section-title">Spend by Agent</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <XAxis dataKey="name" tick={{ fill: '#8888a0', fontSize: 12 }} />
              <YAxis tick={{ fill: '#8888a0', fontSize: 12 }} tickFormatter={v => fmt(v)} />
              <Tooltip
                contentStyle={{ background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 8 }}
                labelStyle={{ color: '#e0e0e8' }}
                formatter={(value, name) => [fmt(value), name === 'cost' ? 'Spend' : 'Saved']}
              />
              <Bar dataKey="cost" name="Spend" radius={[4, 4, 0, 0]}>
                {chartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
              <Bar dataKey="saved" name="Saved" fill="#22c55e" radius={[4, 4, 0, 0]} opacity={0.6} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="table-container">
        <div className="table-header">Agent Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Calls</th>
              <th>Spend</th>
              <th>Saved</th>
              <th>Cache Hits</th>
              <th>Routed</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.agentId}>
                <td><strong>{a.agentId}</strong></td>
                <td>{a.calls}</td>
                <td>{fmt(a.cost)}</td>
                <td style={{ color: a.saved > 0 ? '#22c55e' : undefined }}>{fmt(a.saved)}</td>
                <td>{a.cacheHits}</td>
                <td>{a.routed}</td>
                <td>
                  {a.killed > 0 ? <span className="badge badge-red">Killed</span> :
                   a.rateLimited > 0 ? <span className="badge badge-orange">Rate Ltd</span> :
                   a.budgetBlocked > 0 ? <span className="badge badge-orange">Over Budget</span> :
                   <span className="badge badge-green">Active</span>}
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan={7} style={{textAlign: 'center', color: '#8888a0'}}>No agent data yet. Send calls through the proxy to see data here.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
