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

  return (
    <div>
      <div className="page-header">
        <h1>Controls</h1>
        <p>Kill switches, budget limits, rate limits, and cache controls for every agent</p>
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
    </div>
  );
}
