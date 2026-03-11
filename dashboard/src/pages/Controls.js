import React, { useState, useEffect } from 'react';

export default function Controls({ stats, apiBase, onRefresh }) {
  const agents = stats?.agents || [];
  const [killStates, setKillStates] = useState({});
  const [budgets, setBudgets] = useState({});
  const [rpms, setRpms] = useState({});
  const [cacheStates, setCacheStates] = useState({});
  const [cacheTTLs, setCacheTTLs] = useState({});

  useEffect(() => {
    const states = {};
    const budg = {};
    const rpm = {};
    const cache = {};
    const cacheTTL = {};
    agents.forEach(a => {
      states[a.agentId] = a.killed > 0;
      budg[a.agentId] = '';
      rpm[a.agentId] = '';
      cache[a.agentId] = true;
      cacheTTL[a.agentId] = '';
    });
    setKillStates(states);
    setBudgets(budg);
    setRpms(rpm);
    setCacheStates(cache);
    setCacheTTLs(cacheTTL);
  }, [agents]);

  const toggleKill = async (agentId) => {
    const newState = !killStates[agentId];
    setKillStates(prev => ({ ...prev, [agentId]: newState }));
    try {
      await fetch(`${apiBase}/api/controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, killed: newState }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to toggle kill switch:', err);
      setKillStates(prev => ({ ...prev, [agentId]: !newState }));
    }
  };

  const setBudget = async (agentId) => {
    const limit = parseFloat(budgets[agentId]);
    if (isNaN(limit) || limit <= 0) return;
    try {
      await fetch(`${apiBase}/api/budgets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, monthlyLimit: limit }),
      });
      setBudgets(prev => ({ ...prev, [agentId]: '' }));
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to set budget:', err);
    }
  };

  const setRateLimit = async (agentId) => {
    const rpm = parseInt(rpms[agentId]);
    if (isNaN(rpm) || rpm <= 0) return;
    try {
      await fetch(`${apiBase}/api/rate-limits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, rpm }),
      });
      setRpms(prev => ({ ...prev, [agentId]: '' }));
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to set rate limit:', err);
    }
  };

  const toggleCache = async (agentId) => {
    const newState = !cacheStates[agentId];
    setCacheStates(prev => ({ ...prev, [agentId]: newState }));
    try {
      await fetch(`${apiBase}/api/cache-controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, cacheEnabled: newState }),
      });
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to toggle cache:', err);
      setCacheStates(prev => ({ ...prev, [agentId]: !newState }));
    }
  };

  const setCacheTTL = async (agentId) => {
    const ttl = parseInt(cacheTTLs[agentId]);
    if (isNaN(ttl) || ttl <= 0) return;
    try {
      await fetch(`${apiBase}/api/cache-controls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, cacheTTL: ttl }),
      });
      setCacheTTLs(prev => ({ ...prev, [agentId]: '' }));
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Failed to set cache TTL:', err);
    }
  };

  const killAll = async () => {
    const newStates = {};
    agents.forEach(a => { newStates[a.agentId] = true; });
    setKillStates(newStates);
    try {
      await Promise.all(agents.map(a =>
        fetch(`${apiBase}/api/controls`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: a.agentId, killed: true }),
        })
      ));
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Kill all failed:', err);
    }
  };

  const inputStyle = {
    background: '#1a1a25',
    border: '1px solid #2a2a3a',
    color: '#e0e0e8',
    padding: '6px 10px',
    borderRadius: 6,
    width: 80,
    fontSize: 13,
  };

  const anomalies = stats?.anomalies || [];

  const ruleConfig = {
    spend_spike:    { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)', icon: '▲', label: 'Spend Spike' },
    loop_detected:  { color: '#ef4444', bg: 'rgba(239, 68, 68, 0.25)', icon: '⟳', label: 'Loop Detected' },
    budget_warning: { color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: '⚠', label: 'Budget Warning' },
    error_spike:    { color: '#eab308', bg: 'rgba(234, 179, 8, 0.15)',  icon: '✕', label: 'Error Spike' },
    concentration:  { color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: 'ℹ', label: 'Concentration' },
  };

  const actionBadge = (action) => {
    if (action === 'frozen') return <span className="badge badge-red">FROZEN</span>;
    if (action === 'downgraded') return <span className="badge badge-orange">DOWNGRADED</span>;
    return <span className="badge badge-accent">ALERT ONLY</span>;
  };

  const statusBadge = (status) => {
    if (status === 'active') return <span className="badge badge-red">ACTIVE</span>;
    return <span className="badge badge-green">RESOLVED</span>;
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  return (
    <div>
      <div className="page-header">
        <h1>Controls</h1>
        <p>Kill switches, budget limits, rate limits, cache controls, and anomaly alerts</p>
      </div>

      <div style={{ marginBottom: 24 }}>
        <button className="btn btn-danger" onClick={killAll}>
          Kill All Agents
        </button>
      </div>

      <div className="table-container">
        <div className="table-header">Agent Controls</div>
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Kill Switch</th>
              <th>Spend</th>
              <th>Budget Limit</th>
              <th>Rate Limit (RPM)</th>
              <th>Cache</th>
              <th>Cache TTL</th>
            </tr>
          </thead>
          <tbody>
            {agents.map(a => (
              <tr key={a.agentId}>
                <td><strong>{a.agentId}</strong></td>
                <td>
                  {killStates[a.agentId] ?
                    <span className="badge badge-red">KILLED</span> :
                    <span className="badge badge-green">ACTIVE</span>
                  }
                </td>
                <td>
                  <div className="kill-switch">
                    <button
                      className={`switch ${killStates[a.agentId] ? 'killed' : ''}`}
                      onClick={() => toggleKill(a.agentId)}
                      aria-label={`Toggle kill switch for ${a.agentId}`}
                    />
                    <span style={{ fontSize: 12, color: '#8888a0' }}>
                      {killStates[a.agentId] ? 'Blocked' : 'Running'}
                    </span>
                  </div>
                </td>
                <td>${a.cost.toFixed(4)}</td>
                <td>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="$ limit"
                      value={budgets[a.agentId] || ''}
                      onChange={e => setBudgets(prev => ({ ...prev, [a.agentId]: e.target.value }))}
                      style={inputStyle}
                    />
                    <button className="btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setBudget(a.agentId)}>
                      Set
                    </button>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="RPM"
                      value={rpms[a.agentId] || ''}
                      onChange={e => setRpms(prev => ({ ...prev, [a.agentId]: e.target.value }))}
                      style={inputStyle}
                    />
                    <button className="btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setRateLimit(a.agentId)}>
                      Set
                    </button>
                    {a.rateLimit && (
                      <span style={{ fontSize: 11, color: '#8888a0' }}>
                        {a.rateLimit.current}/{a.rateLimit.limit}
                      </span>
                    )}
                  </div>
                </td>
                <td>
                  <div className="kill-switch">
                    <button
                      className={`switch ${!cacheStates[a.agentId] ? 'killed' : ''}`}
                      onClick={() => toggleCache(a.agentId)}
                      aria-label={`Toggle cache for ${a.agentId}`}
                    />
                    <span style={{ fontSize: 12, color: '#8888a0' }}>
                      {cacheStates[a.agentId] ? 'On' : 'Off'}
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="number"
                      placeholder="hours"
                      value={cacheTTLs[a.agentId] || ''}
                      onChange={e => setCacheTTLs(prev => ({ ...prev, [a.agentId]: e.target.value }))}
                      style={inputStyle}
                    />
                    <button className="btn" style={{ padding: '6px 12px', fontSize: 12 }} onClick={() => setCacheTTL(a.agentId)}>
                      Set
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {agents.length === 0 && (
              <tr><td colSpan={8} style={{textAlign: 'center', color: '#8888a0'}}>No agents registered yet</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Anomaly Log */}
      <div className="table-container">
        <div className="table-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          Anomaly Log
          {anomalies.length > 0 && (
            <span className="badge badge-red" style={{ marginLeft: 8 }}>{anomalies.length}</span>
          )}
        </div>
        {anomalies.length > 0 ? (
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Rule</th>
                <th>Agent</th>
                <th>Details</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.slice(0, 10).map((a, i) => {
                const rc = ruleConfig[a.rule] || ruleConfig.concentration;
                return (
                  <tr key={i}>
                    <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: '#8888a0' }}>
                      {formatTime(a.timestamp)}
                    </td>
                    <td>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '3px 10px', borderRadius: 4, fontSize: 12, fontWeight: 600,
                        background: rc.bg, color: rc.color,
                      }}>
                        <span style={{ fontSize: 14 }}>{rc.icon}</span>
                        {rc.label}
                      </span>
                    </td>
                    <td><strong>{a.agentId}</strong></td>
                    <td style={{ fontSize: 13, color: '#c0c0d0', maxWidth: 280 }}>{a.details || '—'}</td>
                    <td>{actionBadge(a.action)}</td>
                    <td>{statusBadge(a.status)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: '#22c55e' }}>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 8 }}>✓</span>
            <span style={{ fontSize: 15, fontWeight: 600 }}>No anomalies detected</span>
            <p style={{ color: '#8888a0', fontSize: 13, marginTop: 4 }}>All agents operating within normal parameters</p>
          </div>
        )}
      </div>
    </div>
  );
}
