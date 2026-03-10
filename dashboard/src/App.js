import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import Overview from './pages/Overview';
import AgentDrilldown from './pages/AgentDrilldown';
import Controls from './pages/Controls';
import Simulator from './pages/Simulator';
import CFOView from './pages/CFOView';
import Workflows from './pages/Workflows';
import PromptVersions from './pages/PromptVersions';
import CacheView from './pages/CacheView';
import RoutingView from './pages/RoutingView';
import './App.css';

const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:3100';

function App() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <nav className="sidebar">
          <div className="logo">
            <span className="logo-icon">◉</span>
            <span className="logo-text">AgentLens</span>
          </div>
          <div className="nav-links">
            <NavLink to="/" end className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">▣</span> Overview
            </NavLink>
            <NavLink to="/agents" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">◈</span> Agents
            </NavLink>
            <NavLink to="/workflows" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">⟟</span> Workflows
            </NavLink>
            <NavLink to="/cache" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">⚡</span> Cache
            </NavLink>
            <NavLink to="/routing" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">⇄</span> Routing
            </NavLink>
            <NavLink to="/controls" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">⊘</span> Controls
            </NavLink>
            <NavLink to="/versions" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">⟳</span> Versions
            </NavLink>
            <NavLink to="/simulator" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">▷</span> Simulator
            </NavLink>
            <NavLink to="/cfo" className={({isActive}) => isActive ? 'nav-item active' : 'nav-item'}>
              <span className="nav-icon">$</span> CFO View
            </NavLink>
          </div>
        </nav>
        <main className="content">
          {loading ? (
            <div className="loading">Loading...</div>
          ) : (
            <Routes>
              <Route path="/" element={<Overview stats={stats} />} />
              <Route path="/agents" element={<AgentDrilldown stats={stats} />} />
              <Route path="/workflows" element={<Workflows stats={stats} />} />
              <Route path="/cache" element={<CacheView stats={stats} />} />
              <Route path="/routing" element={<RoutingView stats={stats} />} />
              <Route path="/controls" element={<Controls stats={stats} apiBase={API_BASE} onRefresh={fetchStats} />} />
              <Route path="/versions" element={<PromptVersions stats={stats} apiBase={API_BASE} />} />
              <Route path="/simulator" element={<Simulator apiBase={API_BASE} onRefresh={fetchStats} />} />
              <Route path="/cfo" element={<CFOView stats={stats} />} />
            </Routes>
          )}
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
