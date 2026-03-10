import React, { useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

const COLORS = ['#ef4444', '#f59e0b', '#6366f1', '#3b82f6', '#22c55e', '#8b5cf6', '#ec4899', '#14b8a6'];

export default function AgentDrilldown({ stats }) {
  const agents = stats?.agents || [];
  const [selected, setSelected] = useState(null);

  const totalCost = agents.reduce((s, a) => s + a.cost, 0);
  const pieData = agents.map(a => ({
    name: a.agentId,
    value: a.cost,
    pct: totalCost > 0 ? (a.cost / totalCost * 100).toFixed(1) : 0,
  }));

  const agent = selected ? agents.find(a => a.agentId === selected) : agents[0];

  // Waste detection: agent > 40% of total spend
  const wasteAgents = agents.filter(a => totalCost > 0 && (a.cost / totalCost) > 0.4);

  return (
    <div>
      <div className="page-header">
        <h1>Agent Drill-Down</h1>
        <p>Deep dive into individual agent spend, waste flags, and the number that hurts</p>
      </div>

      {wasteAgents.length > 0 && (
        <div className="card" style={{ borderColor: '#ef4444', marginBottom: 24 }}>
          <div className="card-label" style={{ color: '#ef4444' }}>WASTE ALERT</div>
          {wasteAgents.map(a => (
            <div key={a.agentId} style={{ marginBottom: 8 }}>
              <strong>{a.agentId}</strong> is consuming{' '}
              <span style={{ color: '#ef4444', fontWeight: 700 }}>
                {(a.cost / totalCost * 100).toFixed(1)}%
              </span>{' '}
              of total spend (${a.cost.toFixed(4)}).
              {a.cacheHits === 0 && ' Zero cache hits — likely sending unique queries every time.'}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginBottom: 32 }}>
        <div className="chart-container">
          <div className="section-title">Spend Distribution</div>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={pieData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                outerRadius={90}
                onClick={(data) => setSelected(data.name)}
                style={{ cursor: 'pointer' }}
              >
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#1a1a25', border: '1px solid #2a2a3a', borderRadius: 8 }}
                formatter={(value, name) => [`$${value.toFixed(4)} (${pieData.find(p => p.name === name)?.pct}%)`, name]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {agent && (
          <div className="card">
            <div className="card-label">AGENT DETAIL</div>
            <h2 style={{ fontSize: 20, marginBottom: 16 }}>{agent.agentId}</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div className="card-label">Total Spend</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#ef4444' }}>${agent.cost.toFixed(4)}</div>
              </div>
              <div>
                <div className="card-label">Cache Savings</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#22c55e' }}>${agent.saved.toFixed(4)}</div>
              </div>
              <div>
                <div className="card-label">Total Calls</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{agent.calls}</div>
              </div>
              <div>
                <div className="card-label">Cache Hit Rate</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: '#3b82f6' }}>
                  {agent.calls > 0 ? (agent.cacheHits / agent.calls * 100).toFixed(1) : 0}%
                </div>
              </div>
              <div>
                <div className="card-label">Routed Calls</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{agent.routed}</div>
              </div>
              <div>
                <div className="card-label">% of Total Spend</div>
                <div style={{
                  fontSize: 22,
                  fontWeight: 700,
                  color: totalCost > 0 && (agent.cost / totalCost) > 0.4 ? '#ef4444' : '#e0e0e8'
                }}>
                  {totalCost > 0 ? (agent.cost / totalCost * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="table-container">
        <div className="table-header">All Agents — Ranked by Spend</div>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              <th>Agent</th>
              <th>Spend</th>
              <th>% of Total</th>
              <th>Calls</th>
              <th>Savings</th>
              <th>Flag</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a, i) => {
              const pct = totalCost > 0 ? (a.cost / totalCost * 100) : 0;
              return (
                <tr key={a.agentId} onClick={() => setSelected(a.agentId)} style={{ cursor: 'pointer' }}>
                  <td>#{i + 1}</td>
                  <td><strong>{a.agentId}</strong></td>
                  <td>${a.cost.toFixed(4)}</td>
                  <td style={{ color: pct > 40 ? '#ef4444' : pct > 25 ? '#f59e0b' : '#e0e0e8' }}>
                    {pct.toFixed(1)}%
                  </td>
                  <td>{a.calls}</td>
                  <td style={{ color: '#22c55e' }}>${a.saved.toFixed(4)}</td>
                  <td>
                    {pct > 40 ? <span className="badge badge-red">HIGH SPEND</span> :
                     a.cacheHits === 0 && a.calls > 5 ? <span className="badge badge-orange">NO CACHE</span> :
                     null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
