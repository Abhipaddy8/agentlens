import React from 'react';

export default function Workflows({ stats }) {
  const workflows = stats?.workflows || [];

  return (
    <div>
      <div className="page-header">
        <h1>Workflows</h1>
        <p>Grouped call chains — see cost per workflow, not just per agent</p>
      </div>

      <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
        <div className="card">
          <div className="card-label">Active Workflows</div>
          <div className="card-value accent">{workflows.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Total Workflow Calls</div>
          <div className="card-value">{workflows.reduce((s, w) => s + w.calls, 0)}</div>
        </div>
        <div className="card">
          <div className="card-label">Total Workflow Cost</div>
          <div className="card-value red">${workflows.reduce((s, w) => s + w.cost, 0).toFixed(2)}</div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">Workflow Breakdown</div>
        <table>
          <thead>
            <tr>
              <th>Workflow ID</th>
              <th>Calls</th>
              <th>Cost</th>
              <th>Agents Involved</th>
              <th>First Seen</th>
              <th>Last Seen</th>
            </tr>
          </thead>
          <tbody>
            {workflows.map(wf => (
              <tr key={wf.workflowId}>
                <td><strong style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13 }}>{wf.workflowId}</strong></td>
                <td>{wf.calls}</td>
                <td>${(wf.cost || 0).toFixed(4)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(wf.agents || []).map(a => (
                      <span key={a} className="badge badge-green" style={{ fontSize: 10 }}>{a}</span>
                    ))}
                  </div>
                </td>
                <td style={{ color: '#8888a0', fontSize: 12 }}>
                  {wf.firstSeen ? new Date(wf.firstSeen).toLocaleDateString() : '-'}
                </td>
                <td style={{ color: '#8888a0', fontSize: 12 }}>
                  {wf.lastSeen ? new Date(wf.lastSeen).toLocaleDateString() : '-'}
                </td>
              </tr>
            ))}
            {workflows.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', color: '#8888a0' }}>
                No workflows yet. Send calls with <code>x-workflow-id</code> header to group them.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div className="section-title">How to use workflows</div>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.7 }}>
          Add <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>x-workflow-id: your-workflow-id</code> header to group related agent calls.
          A procurement workflow might involve the procurement agent, supplier validator, and report generator — all tagged with the same workflow ID.
          See the total cost of the workflow, not just individual agents.
        </p>
      </div>
    </div>
  );
}
