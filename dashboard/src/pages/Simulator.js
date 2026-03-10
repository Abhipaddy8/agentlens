import React, { useState, useRef } from 'react';

export default function Simulator({ apiBase, onRefresh }) {
  const [prompt, setPrompt] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [agentId, setAgentId] = useState('simulator-agent');
  const [workflowId, setWorkflowId] = useState('');
  const [promptVersion, setPromptVersion] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [sending, setSending] = useState(false);
  const [logs, setLogs] = useState([]);
  const logRef = useRef(null);

  const addLog = (entry) => {
    setLogs(prev => [entry, ...prev].slice(0, 50));
  };

  const sendQuery = async () => {
    if (!prompt.trim()) return;
    setSending(true);

    const startTime = Date.now();
    addLog({
      time: new Date().toLocaleTimeString(),
      status: 'sending',
      message: `→ ${prompt.slice(0, 60)}${prompt.length > 60 ? '...' : ''}`,
      model,
      agentId,
    });

    const headers = {
      'Content-Type': 'application/json',
      'x-agent-id': agentId,
      'Authorization': `Bearer ${process.env.REACT_APP_OPENAI_KEY || 'demo'}`,
    };
    if (workflowId) headers['x-workflow-id'] = workflowId;
    if (promptVersion) headers['x-prompt-version'] = promptVersion;

    try {
      const res = await fetch(`${apiBase}/v1/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 100,
          stream: streaming,
        }),
      });

      if (streaming) {
        // Read SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let tokens = 0;

        addLog({
          time: new Date().toLocaleTimeString(),
          status: 'streaming',
          message: '← streaming...',
          latency: Date.now() - startTime,
        });

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n').filter(l => l.startsWith('data: ') && l !== 'data: [DONE]');
          for (const line of lines) {
            try {
              const json = JSON.parse(line.replace('data: ', ''));
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) fullContent += delta;
              if (json.usage) tokens = json.usage.total_tokens || 0;
            } catch {
              // not all lines are valid JSON
            }
          }
        }

        const latency = Date.now() - startTime;
        addLog({
          time: new Date().toLocaleTimeString(),
          status: 'streamed',
          message: `← ${fullContent.slice(0, 80)}${fullContent.length > 80 ? '...' : ''}`,
          latency,
          tokens,
          model,
        });
      } else {
        // Non-streaming
        const data = await res.json();
        const latency = Date.now() - startTime;

        if (data.error) {
          addLog({
            time: new Date().toLocaleTimeString(),
            status: data.error.type === 'agent_killed' ? 'killed' : data.error.type === 'rate_limited' ? 'rate_limited' : 'error',
            message: data.error.message,
            latency,
          });
        } else {
          const isCached = latency < 50;
          const reply = data.choices?.[0]?.message?.content || 'No response';
          addLog({
            time: new Date().toLocaleTimeString(),
            status: isCached ? 'hit' : 'miss',
            message: `← ${reply.slice(0, 80)}${reply.length > 80 ? '...' : ''}`,
            latency,
            tokens: data.usage?.total_tokens || 0,
            model: data.model,
          });
        }
      }
    } catch (err) {
      addLog({
        time: new Date().toLocaleTimeString(),
        status: 'error',
        message: err.message,
        latency: Date.now() - startTime,
      });
    } finally {
      setSending(false);
      if (onRefresh) onRefresh();
    }
  };

  const sendBurst = async (count) => {
    for (let i = 0; i < count; i++) {
      await sendQuery();
    }
  };

  const statusLabel = (status) => {
    switch (status) {
      case 'hit': return 'CACHE HIT';
      case 'miss': return 'CACHE MISS';
      case 'sending': return 'SENDING';
      case 'streaming': return 'STREAM';
      case 'streamed': return 'STREAMED';
      case 'killed': return 'KILLED';
      case 'rate_limited': return 'RATE LTD';
      default: return 'ERROR';
    }
  };

  return (
    <div>
      <div className="page-header">
        <h1>Live Simulator</h1>
        <p>Fire real queries through the proxy — streaming, workflows, and prompt versions</p>
      </div>

      <div className="sim-input">
        <input
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Enter a prompt..."
          onKeyDown={e => e.key === 'Enter' && sendQuery()}
        />
        <select value={model} onChange={e => setModel(e.target.value)}>
          <option value="gpt-4o-mini">gpt-4o-mini</option>
          <option value="gpt-4o">gpt-4o</option>
          <option value="gpt-4-turbo">gpt-4-turbo</option>
          <option value="gpt-3.5-turbo">gpt-3.5-turbo</option>
        </select>
        <input
          value={agentId}
          onChange={e => setAgentId(e.target.value)}
          placeholder="Agent ID"
          style={{ width: 140 }}
        />
      </div>

      <div className="sim-input" style={{ marginTop: -12 }}>
        <input
          value={workflowId}
          onChange={e => setWorkflowId(e.target.value)}
          placeholder="Workflow ID (optional)"
          style={{ width: 200 }}
        />
        <input
          value={promptVersion}
          onChange={e => setPromptVersion(e.target.value)}
          placeholder="Version (e.g. v2.1)"
          style={{ width: 160 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8888a0' }}>
          <input
            type="checkbox"
            checked={streaming}
            onChange={e => setStreaming(e.target.checked)}
          />
          Stream
        </label>
        <button className="btn" onClick={sendQuery} disabled={sending || !prompt.trim()}>
          {sending ? 'Sending...' : 'Send'}
        </button>
        <button className="btn" onClick={() => sendBurst(3)} disabled={sending || !prompt.trim()}
          style={{ background: '#3b82f6' }}>
          Send x3
        </button>
      </div>

      <div className="cards-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', marginBottom: 24 }}>
        <div className="card">
          <div className="card-label">Total Queries</div>
          <div className="card-value">{logs.length}</div>
        </div>
        <div className="card">
          <div className="card-label">Cache Hits</div>
          <div className="card-value green">{logs.filter(l => l.status === 'hit').length}</div>
        </div>
        <div className="card">
          <div className="card-label">Cache Misses</div>
          <div className="card-value orange">{logs.filter(l => l.status === 'miss').length}</div>
        </div>
        <div className="card">
          <div className="card-label">Streamed</div>
          <div className="card-value blue">{logs.filter(l => l.status === 'streamed').length}</div>
        </div>
      </div>

      <div className="table-container" ref={logRef}>
        <div className="table-header">Live Log</div>
        {logs.length === 0 ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#8888a0' }}>
            Enter a prompt and click Send. Toggle "Stream" for SSE streaming. Add workflow ID and version to test grouping.
          </div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="log-entry">
              <span className="log-time">{log.time}</span>
              <span className={`log-status ${log.status}`}>
                {statusLabel(log.status)}
              </span>
              <span style={{ flex: 1 }}>{log.message}</span>
              {log.latency && <span style={{ color: '#8888a0' }}>{log.latency}ms</span>}
              {log.tokens > 0 && <span style={{ color: '#8888a0' }}>{log.tokens} tok</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
