import React, { useState, useEffect, useMemo } from 'react';
import './Dashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

function getStatusColor(status) {
  if (status === 'NORMAL' || status === 'PASS') return '#10b981';
  if (status === 'SUSPECT' || status === 'HOLD') return '#f59e0b';
  if (status === 'CRITICAL' || status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

import { mapScreeningRecord, getParameterMeta } from '../utils/recordMapping';

export default function FailureAnalysis() {
  const [screeningRecords, setScreeningRecords] = useState([]);
  const [selectedComponentId, setSelectedComponentId] = useState('C-0001');
  const [dataSource, setDataSource] = useState('loading'); // 'loading' | 'api' | 'empty' | 'offline'
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch screening records from backend API
  useEffect(() => {
    let isMounted = true;

    async function loadFailureAnalysisData() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/screening`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.data) && result.data.length > 0) {
            if (isMounted) {
              setScreeningRecords(result.data);
              setDataSource('api');
              const initialId = result.data[0].componentId || result.data[0].id || 'C-0001';
              setSelectedComponentId((prev) => prev || initialId);
            }
            return;
          }
        }
        if (isMounted) {
          setDataSource('empty');
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[SPAD] Failed to fetch screening records from backend:', err.message);
          setFetchError(err.message);
          setDataSource('offline');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadFailureAnalysisData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Active component resolution
  const activeComponent = useMemo(() => {
    if (screeningRecords.length > 0) {
      const match = screeningRecords.find(
        (r) => (r.componentId || r.id) === selectedComponentId
      );
      if (match) return mapScreeningRecord(match);
      return mapScreeningRecord(screeningRecords[0]);
    }
    return null;
  }, [screeningRecords, selectedComponentId]);

  const componentId = activeComponent?.componentId || activeComponent?.id || '—';
  const lotId = activeComponent?.lotId || '—';
  const stage = activeComponent?.stage || '—';
  const engineeringStatus = activeComponent?.engineeringStatus || 'NORMAL';
  const aiStatus = activeComponent?.aiStatus || 'NOT_EVALUATED';
  const aiRisk = activeComponent?.aiRisk || 0;
  const riskScore = activeComponent?.riskScore || 0;

  const measurements = activeComponent?.measurements || {};
  const predictions = activeComponent?.predictions || {};
  const engineeringLimits = activeComponent?.engineeringLimits || {};
  const modelExplanation = activeComponent?.modelExplanation || null;

  const isAnomalous = engineeringStatus !== 'NORMAL' || aiStatus === 'FLAGGED';

  return (
    <div className="spad-page-container">
      {/* 1. Page Header */}
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">Failure Analysis &amp; Diagnostics</h1>
          <span className="spad-page-tag">DIAGNOSTICS &amp; ROOT CAUSE ANALYSIS</span>
        </div>
        <p className="spad-page-description">
          Parametric anomaly diagnostics, early telemetry drift isolation, and post-stress comparison of predicted degradation signatures against physical inspection logs.
        </p>
      </header>

      {/* Backend API Connection Error Banner */}
      {fetchError && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>
          <strong>Backend Connection Notice:</strong> Unable to load live screening records from API ({fetchError}).
        </div>
      )}

      {/* 2. Component Selector Bar */}
      <div className="spad-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div className="spad-trends-component-controls" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div className="spad-comp-selector-group">
            <label htmlFor="fa-comp-select" className="spad-comp-select-label">
              Component:
            </label>
            <select
              id="fa-comp-select"
              className="spad-comp-select-input"
              value={componentId}
              onChange={(e) => setSelectedComponentId(e.target.value)}
              disabled={screeningRecords.length === 0}
            >
              {screeningRecords.map((c) => {
                const id = c.componentId || c.id;
                const cStat = c.engineeringStatus || c.status || 'NORMAL';
                return (
                  <option key={id} value={id}>
                    {id} ({cStat})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="spad-comp-compact-summary">
            <span className="spad-summary-pill-id">{componentId}</span>
            <span className="spad-summary-pill-lot">Lot: {lotId}</span>
            <span className="spad-summary-pill-lot">Stage: {stage}</span>
            <span
              className={`spad-summary-pill-status status-${engineeringStatus.toLowerCase()}`}
            >
              Engineering: {engineeringStatus}
            </span>
            <span
              className={`spad-summary-pill-status ${aiStatus === 'FLAGGED' ? 'status-suspect' : 'status-normal'}`}
            >
              AI: {aiStatus}
            </span>
            <span className="spad-summary-pill-risk">
              AI Risk: {aiRisk}%
            </span>
            <span className="spad-spec-badge" style={{ marginLeft: 'auto' }}>
              SOURCE: <strong>{dataSource === 'api' ? 'MONGODB ATLAS' : dataSource === 'offline' ? 'OFFLINE' : 'EMPTY'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Three-Tier Diagnostic Evidence Grid */}
      {isLoading ? (
        <div className="spad-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          Loading failure analysis from MongoDB Atlas...
        </div>
      ) : !activeComponent ? (
        <div className="spad-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          {fetchError ? `Backend API connection error: ${fetchError}` : 'No screening records found in database.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Tier 1: Screening Telemetry & Engineering Limits */}
        <div className="spad-card" style={{ padding: '20px' }}>
          <div className="spad-card-header">
            <div className="spad-card-title-group">
              <span className="spad-card-section-label">TIER 1: PHYSICAL SCREENING TELEMETRY</span>
              <h2 className="spad-card-title">Parametric Measurement Integrity</h2>
            </div>
            <span
              className="spad-status-pill"
              style={{
                backgroundColor: getStatusColor(engineeringStatus) + '20',
                color: getStatusColor(engineeringStatus),
                borderColor: getStatusColor(engineeringStatus) + '60',
              }}
            >
              {engineeringStatus === 'NORMAL' ? 'WITHIN SPECIFICATION LIMITS' : 'SPECIFICATION ANOMALY'}
            </span>
          </div>

          <p className="spad-card-desc">
            Observed parametric checkpoints and maximum allowable specification limits from the screening database.
          </p>

          <div className="spad-table-container" style={{ marginTop: '12px' }}>
            <table className="spad-data-table" aria-label="Parametric Telemetry Integrity">
              <thead>
                <tr>
                  <th>PARAMETER</th>
                  <th>OBSERVED VALUES (0h &rarr; 96h)</th>
                  <th>168h FORECAST PREDICTION</th>
                  <th>ENGINEERING LIMIT</th>
                  <th>SAFETY MARGIN</th>
                  <th>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {Object.keys(measurements).map((key) => {
                  const limitRaw = engineeringLimits[key];
                  const meta = getParameterMeta(key, limitRaw);
                  const name = meta.name;
                  const unit = meta.unit;
                  const series = measurements[key] || [];
                  const obsFormatted = Array.isArray(series)
                    ? series.map((v) => `${v} ${unit}`).join(' → ')
                    : (typeof series === 'object' ? Object.entries(series).map(([tp, val]) => `${tp}: ${val} ${unit}`).join(' → ') : `${series} ${unit}`);
                  const predVal = predictions[`${key}_168h`] ?? (Array.isArray(series) ? series[series.length - 1] : series);
                  const limitVal = meta.specLimitMax;
                  const margin = typeof limitVal === 'number' && typeof predVal === 'number' ? (limitVal - predVal).toFixed(2) : '—';
                  const isBreached = typeof limitVal === 'number' && typeof predVal === 'number' && predVal > limitVal;

                  return (
                    <tr key={key} className="spad-table-row">
                      <td className="spad-td-mono font-bold text-cyan">{name}</td>
                      <td className="spad-td-mono">{obsFormatted}</td>
                      <td className="spad-td-mono font-bold" style={{ color: '#38bdf8' }}>{predVal !== undefined && predVal !== null ? `${predVal} ${unit}` : '—'}</td>
                      <td className="spad-td-mono" style={{ color: '#f87171', fontWeight: '700' }}>{limitVal !== undefined && limitVal !== null ? `${limitVal} ${unit}` : '—'}</td>
                      <td className="spad-td-mono" style={{ color: isBreached ? '#ef4444' : '#10b981' }}>{margin !== '—' ? `+${margin} ${unit}` : '—'}</td>
                      <td>
                        <span className={`spad-status-pill ${isBreached ? 'badge-status-critical' : 'badge-status-normal'}`}>
                          {isBreached ? 'EXCEEDS LIMIT' : 'WITHIN LIMIT'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tier 2: AI Anomaly Reasoning & SHAP Explainability */}
        <div className="spad-two-col-grid">
          <div className="spad-card" style={{ padding: '20px' }}>
            <div className="spad-card-header">
              <div className="spad-card-title-group">
                <span className="spad-card-section-label">TIER 2: AI ANOMALY REASONING</span>
                <h3 className="spad-card-title">Pre-Failure Telemetry Signatures</h3>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Population Abnormality:</span>
                <span className="font-mono" style={{ color: anomalies.populationAbnormality ? '#f59e0b' : '#10b981', fontWeight: '700' }}>
                  {anomalies.populationAbnormality ? 'FLAGGED (Outlier)' : 'NOMINAL (Normal Distribution)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>Trajectory Abnormality:</span>
                <span className="font-mono" style={{ color: anomalies.trajectoryAbnormality ? '#f59e0b' : '#10b981', fontWeight: '700' }}>
                  {anomalies.trajectoryAbnormality ? 'FLAGGED (Non-Linear Drift)' : 'NOMINAL (Stable)'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
                <span style={{ fontSize: '13px', color: '#94a3b8' }}>AI Risk Forecast:</span>
                <span className="font-mono" style={{ color: '#38bdf8', fontWeight: '700' }}>
                  {typeof anomalies.futureRiskPrediction === 'string' ? anomalies.futureRiskPrediction : `${aiRisk}% Risk Index`}
                </span>
              </div>
            </div>
          </div>

          <div className="spad-card" style={{ padding: '20px' }}>
            <div className="spad-card-header">
              <div className="spad-card-title-group">
                <span className="spad-card-section-label">MATHEMATICAL EXPLAINABILITY</span>
                <h3 className="spad-card-title">SHAP Feature Attribution</h3>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
              {(modelExplanation.features || []).slice(0, 4).map((f, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px', fontSize: '12px' }}>
                  <span style={{ color: '#f8fafc' }}>{f.name}</span>
                  <span className="font-mono" style={{ color: f.shapValue >= 0 ? '#f87171' : '#34d399', fontWeight: '700' }}>
                    {f.shapValue >= 0 ? `+${f.shapValue.toFixed(2)}` : f.shapValue.toFixed(2)}
                  </span>
                </div>
              ))}
              <div className="spad-shap-disclaimer-note" style={{ marginTop: '8px', fontSize: '11px' }}>
                <span className="font-bold text-cyan">Diagnostic Distinction:</span> SHAP values quantify mathematical feature weighting for predictive early screening. They do not constitute physical failure analysis or root-cause destructive findings.
              </div>
            </div>
          </div>
        </div>

        {/* Tier 3: Physical Failure Analysis (FA) & Lab Dossier */}
        <div className="spad-card" style={{ padding: '20px' }}>
          <div className="spad-card-header">
            <div className="spad-card-title-group">
              <span className="spad-card-section-label">TIER 3: PHYSICAL FAILURE ANALYSIS (FA) LAB LOGS</span>
              <h3 className="spad-card-title">Destructive &amp; Non-Destructive Lab Outcomes</h3>
            </div>
          </div>

          {!isAnomalous ? (
            <div style={{ padding: '16px 20px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.2)', borderRadius: '4px' }}>
              <div style={{ color: '#34d399', fontWeight: '700', fontSize: '14px' }}>
                ✓ Non-Destructive Screening Status: NOMINAL QUALIFICATION
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '6px 0 0 0', lineHeight: '1.5' }}>
                Component <strong>{componentId}</strong> has completed screening checkpoints with all parameters comfortably within MIL-STD engineering specification limits. No physical failure mechanisms, decapsulation, or SEM/TEM destructive failure analyses are indicated.
              </p>
            </div>
          ) : (
            <div style={{ padding: '16px 20px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '4px' }}>
              <div style={{ color: '#fbbf24', fontWeight: '700', fontSize: '14px' }}>
                ⚠ Anomaly Quarantine: Physical Post-Mortem Lab Action Required
              </div>
              <p style={{ fontSize: '13px', color: '#94a3b8', margin: '6px 0 0 0', lineHeight: '1.5' }}>
                Component <strong>{componentId}</strong> exhibited abnormal degradation telemetry. Confirmed physical root-cause investigations (Scanning Electron Microscopy, Acoustic Microscopy, or Decapsulation) are pending laboratory physical testing logs.
              </p>
            </div>
          )}
        </div>
      </div>
      )}
    </div>
  );
}
