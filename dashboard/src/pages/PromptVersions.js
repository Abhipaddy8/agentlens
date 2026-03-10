import React, { useState, useEffect } from 'react';

export default function PromptVersions({ stats, apiBase }) {
  const agents = stats?.agents || [];
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rollbackMsg, setRollbackMsg] = useState('');

  useEffect(() => {
    if (agents.length > 0 && !selectedAgent) {
      setSelectedAgent(agents[0].agentId);
    }
  }, [agents, selectedAgent]);

  useEffect(() => {
    if (!selectedAgent) return;
    setLoading(true);
    fetch(`${apiBase}/api/versions/${selectedAgent}`)
      .then(r => r.json())
      .then(data => {
        setVersions(data.versions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [selectedAgent, apiBase]);

  const handleRollback = async (version) => {
    try {
      const res = await fetch(`${apiBase}/api/versions/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selectedAgent, version }),
      });
      const data = await res.json();
      if (data.ok) {
        setRollbackMsg(`Rolled back ${selectedAgent} to ${version}`);
        // Refresh versions
        const r = await fetch(`${apiBase}/api/versions/${selectedAgent}`);
        const d = await r.json();
        setVersions(d.versions || []);
      }
      setTimeout(() => setRollbackMsg(''), 3000);
    } catch (err) {
      setRollbackMsg('Rollback failed: ' + err.message);
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Prompt Versions</h1>
        <p>Track system prompt changes, compare quality, one-click rollback</p>
      </div>

      {rollbackMsg && (
        <div style={{
          background: 'rgba(34, 197, 94, 0.15)',
          border: '1px solid var(--green)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 24,
          color: 'var(--green)',
          fontSize: 14,
        }}>
          {rollbackMsg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {agents.map(a => (
          <button
            key={a.agentId}
            className="btn"
            style={{
              background: selectedAgent === a.agentId ? 'var(--accent)' : 'var(--surface-2)',
              border: '1px solid var(--border)',
              padding: '8px 16px',
              fontSize: 13,
            }}
            onClick={() => setSelectedAgent(a.agentId)}
          >
            {a.agentId}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-dim)', padding: 24 }}>Loading versions...</div>
      ) : (
        <div className="table-container">
          <div className="table-header">
            Versions for {selectedAgent || '...'}
          </div>
          <table>
            <thead>
              <tr>
                <th>Version</th>
                <th>Status</th>
                <th>Calls</th>
                <th>Last Latency</th>
                <th>Created</th>
                <th>Last Used</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {versions.map(v => (
                <tr key={v.version}>
                  <td>
                    <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>
                      {v.version}
                    </strong>
                  </td>
                  <td>
                    {v.active ?
                      <span className="badge badge-green">ACTIVE</span> :
                      <span className="badge" style={{ background: 'rgba(136, 136, 160, 0.15)', color: '#8888a0' }}>INACTIVE</span>
                    }
                  </td>
                  <td>{v.callCount || 0}</td>
                  <td>{v.lastLatencyMs ? `${v.lastLatencyMs}ms` : '-'}</td>
                  <td style={{ color: '#8888a0', fontSize: 12 }}>
                    {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ color: '#8888a0', fontSize: 12 }}>
                    {v.lastUsed ? new Date(v.lastUsed).toLocaleDateString() : '-'}
                  </td>
                  <td>
                    {!v.active && (
                      <button
                        className="btn"
                        style={{ padding: '4px 12px', fontSize: 12, background: 'var(--orange)' }}
                        onClick={() => handleRollback(v.version)}
                      >
                        Rollback
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {versions.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: 'center', color: '#8888a0' }}>
                  No versions tracked yet. Send calls with <code>x-prompt-version</code> header.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ padding: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
        <div className="section-title">How prompt versioning works</div>
        <p style={{ color: 'var(--text-dim)', fontSize: 14, lineHeight: 1.7 }}>
          Add <code style={{ background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 4 }}>x-prompt-version: v2.1</code> header to each request.
          AgentLens tracks the system prompt content for each version, counts calls, measures latency, and lets you roll back if a new version degrades quality.
        </p>
      </div>
    </div>
  );
}
