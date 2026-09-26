import React, { useState, useEffect } from 'react';
import './Dashboard.css';
import { API_BASE_URL } from '../config/api';

export default function SystemSettings() {
  // Live Backend Health State
  const [healthStatus, setHealthStatus] = useState({
    status: 'checking',
    backend: 'checking...',
    database: 'checking...',
    aiService: 'checking...',
    timestamp: null,
    latency: null,
  });
  const [isRefreshingHealth, setIsRefreshingHealth] = useState(false);

  // Frontend-only UI preferences with localStorage persistence
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(() => {
    try {
      const saved = localStorage.getItem('spad_telemetry_refresh_interval');
      if (saved === '30s' || saved === '60s' || saved === 'off') {
        return saved;
      }
    } catch (err) {
      console.warn('[SPAD] Failed to read refresh interval from storage:', err);
    }
    return 'off';
  });

  const [chartSmoothing, setChartSmoothing] = useState(() => {
    try {
      const saved = localStorage.getItem('spad_chart_smoothing');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch (err) {
      console.warn('[SPAD] Failed to read chart smoothing from storage:', err);
    }
    return true;
  });

  const [highContrastPills, setHighContrastPills] = useState(() => {
    try {
      const saved = localStorage.getItem('spad_high_contrast_pills');
      if (saved !== null) {
        return saved === 'true';
      }
    } catch (err) {
      console.warn('[SPAD] Failed to read high contrast preference from storage:', err);
    }
    return false;
  });

  const handleRefreshIntervalChange = (val) => {
    setAutoRefreshInterval(val);
    try {
      localStorage.setItem('spad_telemetry_refresh_interval', val);
    } catch (err) {
      console.warn('[SPAD] Failed to save refresh interval to storage:', err);
    }
  };

  const handleToggleChartSmoothing = () => {
    setChartSmoothing((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('spad_chart_smoothing', String(next));
      } catch (err) {
        console.warn('[SPAD] Failed to save chart smoothing to storage:', err);
      }
      return next;
    });
  };

  const handleToggleHighContrast = () => {
    setHighContrastPills((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('spad_high_contrast_pills', String(next));
      } catch (err) {
        console.warn('[SPAD] Failed to save high contrast preference to storage:', err);
      }
      return next;
    });
  };

  // Live health check against GET /api/health
  const checkBackendHealth = async () => {
    setIsRefreshingHealth(true);
    const startTime = performance.now();
    try {
      const response = await fetch(`${API_BASE_URL}/api/health`);
      const latency = Math.round(performance.now() - startTime);
      if (response.ok) {
        const data = await response.json();
        setHealthStatus({
          status: 'ok',
          backend: data.status === 'ok' ? 'Connected (Running)' : 'Unknown',
          database: data.database === 'connected' ? 'Connected (Atlas)' : data.database || 'Disconnected',
          aiService: data.aiService === 'configured' ? 'Remote Service Configured' : 'Local Dev Interface',
          timestamp: data.timestamp || new Date().toISOString(),
          latency: `${latency}ms`,
        });
      } else {
        setHealthStatus({
          status: 'error',
          backend: `HTTP ${response.status}`,
          database: 'Unknown',
          aiService: 'Unknown',
          timestamp: new Date().toISOString(),
          latency: `${latency}ms`,
        });
      }
    } catch (err) {
      setHealthStatus({
        status: 'error',
        backend: 'Unreachable / Offline',
        database: 'Disconnected',
        aiService: 'Offline',
        timestamp: new Date().toISOString(),
        latency: '—',
      });
    } finally {
      setIsRefreshingHealth(false);
    }
  };

  useEffect(() => {
    checkBackendHealth();
  }, []);

  return (
    <div className="spad-page-container">
      {/* 1. Page Header */}
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">System Settings &amp; Configuration</h1>
          <span className="spad-page-tag">SYSTEM ENVIRONMENT &amp; PREFERENCES</span>
        </div>
        <p className="spad-page-description">
          Real-time backend API &amp; MongoDB Atlas connectivity diagnostics, engineering specification limits, and frontend telemetry preferences.
        </p>
      </header>

      {/* 2. CATEGORY A: Live Backend & Database Connection Diagnostics */}
      <div className="spad-card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div className="spad-card-header">
          <div className="spad-card-title-group">
            <span className="spad-card-section-label">LIVE SYSTEM CONNECTIVITY</span>
            <h2 className="spad-card-title">Backend API &amp; MongoDB Atlas Status</h2>
          </div>
          <button
            type="button"
            className="spad-mode-btn active"
            onClick={checkBackendHealth}
            disabled={isRefreshingHealth}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            {isRefreshingHealth ? 'Checking...' : 'Ping /api/health'}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginTop: '14px' }}>
          <div style={{ padding: '12px 16px', background: 'rgba(56, 189, 248, 0.04)', border: '1px solid rgba(56, 189, 248, 0.12)', borderRadius: '4px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Express REST API</span>
            <div style={{ fontSize: '15px', fontWeight: '700', color: healthStatus.backend.includes('Connected') ? '#34d399' : '#f87171', marginTop: '4px' }}>
              {healthStatus.backend}
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              {API_BASE_URL}
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: 'rgba(56, 189, 248, 0.04)', border: '1px solid rgba(56, 189, 248, 0.12)', borderRadius: '4px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>MongoDB Atlas Cluster</span>
            <div style={{ fontSize: '15px', fontWeight: '700', color: healthStatus.database.includes('Connected') ? '#34d399' : '#f87171', marginTop: '4px' }}>
              {healthStatus.database}
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Time-series Telemetry Storage
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: 'rgba(56, 189, 248, 0.04)', border: '1px solid rgba(56, 189, 248, 0.12)', borderRadius: '4px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>AI Inference Service</span>
            <div style={{ fontSize: '15px', fontWeight: '700', color: healthStatus.aiService.includes('Configured') || healthStatus.aiService.includes('Local') ? '#38bdf8' : '#f87171', marginTop: '4px' }}>
              {healthStatus.aiService}
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Method 1 (168h) &amp; Method 2 (Anomaly)
            </div>
          </div>

          <div style={{ padding: '12px 16px', background: 'rgba(56, 189, 248, 0.04)', border: '1px solid rgba(56, 189, 248, 0.12)', borderRadius: '4px' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Health Ping Latency</span>
            <div className="font-mono" style={{ fontSize: '15px', fontWeight: '700', color: '#38bdf8', marginTop: '4px' }}>
              {healthStatus.latency || '—'}
            </div>
            <div className="font-mono" style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
              Last Check: {healthStatus.timestamp ? new Date(healthStatus.timestamp).toLocaleTimeString() : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* 3. CATEGORY B: SPAD Engineering Specifications & Tolerances */}
      <div className="spad-card" style={{ padding: '20px', marginBottom: '20px' }}>
        <div className="spad-card-header">
          <div className="spad-card-title-group">
            <span className="spad-card-section-label">ENGINEERING SPECIFICATIONS (FUTURE PERSISTENCE)</span>
            <h2 className="spad-card-title">MIL-STD-883 Parameter Limits &amp; Tolerances</h2>
          </div>
          <span className="spad-spec-badge">
            STATUS: <strong>RECORD-LEVEL REPRODUCIBILITY</strong>
          </span>
        </div>

        <p className="spad-card-desc">
          Engineering specification limits dictate the deterministic screening boundaries. In future phases, these limits can be persisted per component-type or lot-specification schema.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '14px', marginTop: '14px' }}>
          <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>On-Resistance (RDS(on)) Limit</span>
              <span className="font-mono text-cyan font-bold" style={{ fontSize: '14px' }}>1.00 Ω</span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0' }}>
              Upper specification limit for ON-state resistance under 199–200°C thermal overstress. (Normal Q3 upper fence: 0.679 Ω).
            </p>
          </div>

          <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>Module B Residual Error Fence</span>
              <span className="font-mono text-cyan font-bold" style={{ fontSize: '14px' }}>0.165 Ω</span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0' }}>
              Normal population forecast error upper fence (IQR = 0.0579 Ω, Upper fence = 0.165046 Ω).
            </p>
          </div>

          <div style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>Thermal Stress Chamber Point</span>
              <span className="font-mono text-cyan font-bold" style={{ fontSize: '14px' }}>199–200°C</span>
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0' }}>
              NASA accelerated stress condition: V_GS = 10 V, V_DD = 5 V, f_sw = 1000 Hz, Duty = 40%.
            </p>
          </div>
        </div>
      </div>

      {/* 4. CATEGORY C: Frontend-Only UI Display Preferences */}
      <div className="spad-card" style={{ padding: '20px' }}>
        <div className="spad-card-header">
          <div className="spad-card-title-group">
            <span className="spad-card-section-label">CLIENT-SIDE DISPLAY PREFERENCES</span>
            <h2 className="spad-card-title">Frontend Telemetry View Settings</h2>
          </div>
          <span className="spad-status-pill badge-status-normal">
            LOCAL BROWSER SCOPE
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.02)', border: '1px solid rgba(56, 189, 248, 0.08)', borderRadius: '4px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>Telemetry Polling / Refresh</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Automatic periodic polling interval for screening endpoints.</div>
            </div>
            <select
              className="spad-comp-select-input"
              value={autoRefreshInterval}
              onChange={(e) => handleRefreshIntervalChange(e.target.value)}
              style={{ minWidth: '120px' }}
            >
              <option value="off">Manual Only</option>
              <option value="30s">Every 30s</option>
              <option value="60s">Every 60s</option>
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.02)', border: '1px solid rgba(56, 189, 248, 0.08)', borderRadius: '4px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>Chart Interpolation Smoothing</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Render smooth curves between burn-in checkpoints.</div>
            </div>
            <button
              type="button"
              className={`spad-mode-btn ${chartSmoothing ? 'active' : ''}`}
              onClick={handleToggleChartSmoothing}
              style={{ fontSize: '12px', padding: '4px 12px' }}
            >
              {chartSmoothing ? 'Enabled' : 'Disabled'}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.02)', border: '1px solid rgba(56, 189, 248, 0.08)', borderRadius: '4px' }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#f8fafc' }}>High-Contrast Status Badges</div>
              <div style={{ fontSize: '11px', color: '#64748b' }}>Enhance brightness of NORMAL / SUSPECT / CRITICAL indicators.</div>
            </div>
            <button
              type="button"
              className={`spad-mode-btn ${highContrastPills ? 'active' : ''}`}
              onClick={handleToggleHighContrast}
              style={{ fontSize: '12px', padding: '4px 12px' }}
            >
              {highContrastPills ? 'Enabled' : 'Standard'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
