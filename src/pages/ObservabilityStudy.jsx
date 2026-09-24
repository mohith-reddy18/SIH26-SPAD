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

export default function ObservabilityStudy() {
  const [screeningRecords, setScreeningRecords] = useState([]);
  const [selectedComponentId, setSelectedComponentId] = useState('C-0001');
  const [selectedParamKey, setSelectedParamKey] = useState('ALL');
  const [dataSource, setDataSource] = useState('loading'); // 'loading' | 'api' | 'empty' | 'offline'
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch screening records from backend API
  useEffect(() => {
    let isMounted = true;

    async function loadObservabilityData() {
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

    loadObservabilityData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Active component resolution
  const activeRecord = useMemo(() => {
    if (screeningRecords.length > 0) {
      const match = screeningRecords.find(
        (r) => (r.componentId || r.id) === selectedComponentId
      );
      if (match) return mapScreeningRecord(match);
      return mapScreeningRecord(screeningRecords[0]);
    }
    return null;
  }, [screeningRecords, selectedComponentId]);

  const componentId = activeRecord?.componentId || activeRecord?.id || '—';
  const lotId = activeRecord?.lotId || '—';
  const stage = activeRecord?.stage || '—';
  const engineeringStatus = activeRecord?.engineeringStatus || 'NORMAL';
  const measurements = activeRecord?.measurements || {};
  const predictions = activeRecord?.predictions || {};
  const engineeringLimits = activeRecord?.engineeringLimits || {};
  const lotAnomaly = activeRecord?.aiAssessment?.lotAnomaly || null;

  // 3. Dynamic parameter keys extraction from backend measurements
  const availableParamKeys = useMemo(() => {
    const keys = Object.keys(measurements);
    return keys.length > 0 ? keys : ['iddq', 'leakage', 'propDelay'];
  }, [measurements]);

  // Map parameter keys to display information
  const parameterRows = useMemo(() => {
    return availableParamKeys.map((key) => {
      const rawLimit = engineeringLimits[key];
      const meta = getParameterMeta(key, rawLimit);
      const name = meta.name;
      const unit = meta.unit;

      const series = measurements[key] || [];
      const obs0h = Array.isArray(series) && series.length > 0 ? series[0] : (series['0h'] ?? null);
      const obs24h = Array.isArray(series) && series.length > 1 ? series[1] : (series['24h'] ?? null);
      const obs96h = Array.isArray(series) && series.length > 2 ? series[2] : (series['96h'] ?? null);
      const obsFinal = Array.isArray(series) && series.length > 0 ? series[series.length - 1] : obs24h;

      // Canonical prediction resolution
      const canonicalPred = activeRecord.aiAssessment?.prediction?.parameters?.[key]?.predicted168h;
      const predKey = `${key}_168h`;
      const pred168h = typeof canonicalPred === 'number'
        ? canonicalPred
        : (typeof predictions[predKey] === 'number' ? predictions[predKey] : (typeof predictions[key] === 'number' ? predictions[key] : obsFinal));

      const limit = meta.specLimitMax;

      const margin =
        typeof limit === 'number' && typeof pred168h === 'number'
          ? (limit - pred168h).toFixed(2)
          : null;

      const isBreached = typeof limit === 'number' && typeof pred168h === 'number' && pred168h > limit;

      return {
        key,
        name,
        unit,
        series,
        obs0h,
        obs24h,
        obs96h,
        pred168h,
        limit,
        margin,
        isBreached,
      };
    });
  }, [availableParamKeys, measurements, predictions, engineeringLimits]);

  const filteredParameterRows = useMemo(() => {
    if (selectedParamKey === 'ALL') return parameterRows;
    return parameterRows.filter((r) => r.key === selectedParamKey);
  }, [parameterRows, selectedParamKey]);

  return (
    <div className="spad-page-container">
      {/* 1. Page Header */}
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">Observability Study</h1>
          <span className="spad-page-tag">POPULATION &amp; TRAJECTORY DYNAMICS</span>
        </div>
        <p className="spad-page-description">
          Observed burn-in degradation trajectories, parameter checkpoints (0h &rarr; 24h &rarr; 96h), AI 168h forecast projections, and engineering specification boundary margin analysis.
        </p>
      </header>

      {/* Backend API Connection Error Banner */}
      {fetchError && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>
          <strong>Backend Connection Notice:</strong> Unable to load live screening records from API ({fetchError}).
        </div>
      )}

      {/* 2. Control and Selection Bar */}
      <div className="spad-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div className="spad-trends-component-controls" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div className="spad-comp-selector-group">
            <label htmlFor="obs-comp-select" className="spad-comp-select-label">
              Component:
            </label>
            <select
              id="obs-comp-select"
              className="spad-comp-select-input"
              value={componentId}
              onChange={(e) => setSelectedComponentId(e.target.value)}
              disabled={screeningRecords.length === 0}
            >
              {screeningRecords.map((c) => {
                const id = c.componentId || c.id;
                const cStatus = c.engineeringStatus || c.status || 'NORMAL';
                return (
                  <option key={id} value={id}>
                    {id} ({cStatus})
                  </option>
                );
              })}
            </select>
          </div>

          <div className="spad-comp-selector-group">
            <label htmlFor="obs-param-select" className="spad-comp-select-label">
              Filter Parameter:
            </label>
            <select
              id="obs-param-select"
              className="spad-comp-select-input"
              value={selectedParamKey}
              onChange={(e) => setSelectedParamKey(e.target.value)}
              disabled={screeningRecords.length === 0}
            >
              <option value="ALL">All Parameters ({availableParamKeys.length})</option>
              {availableParamKeys.map((pKey) => (
                <option key={pKey} value={pKey}>
                  {pKey}
                </option>
              ))}
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
            <span className="spad-spec-badge" style={{ marginLeft: 'auto' }}>
              SOURCE: <strong>{dataSource === 'api' ? 'MONGODB ATLAS' : dataSource === 'offline' ? 'OFFLINE' : 'EMPTY'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. Parametric Checkpoint Telemetry Table */}
      {isLoading ? (
        <div className="spad-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          Loading observability data from MongoDB Atlas...
        </div>
      ) : !activeRecord ? (
        <div className="spad-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          {fetchError ? `Backend API connection error: ${fetchError}` : 'No screening records found in database.'}
        </div>
      ) : (
        <div className="spad-card" style={{ padding: '20px', marginBottom: '20px' }}>
          <div className="spad-card-header">
            <div className="spad-card-title-group">
              <span className="spad-card-section-label">OBSERVED CHECKPOINTS &amp; FORECASTS</span>
              <h2 className="spad-card-title">Parametric Drift vs. Engineering Limits</h2>
            </div>
            <span className="spad-status-pill badge-status-normal">
              DATA LOADED ({dataSource === 'api' ? 'MONGODB ATLAS' : 'API'})
            </span>
          </div>

        <div className="spad-table-container" style={{ marginTop: '14px' }}>
          <table className="spad-data-table" aria-label="Parametric Checkpoint Table">
            <thead>
              <tr>
                <th>PARAMETER</th>
                <th>0h (BASELINE)</th>
                <th>24h (OBSERVED)</th>
                <th>96h (CURRENT)</th>
                <th>168h (AI FORECAST)</th>
                <th>ENGINEERING LIMIT</th>
                <th>SAFETY MARGIN</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredParameterRows.length === 0 ? (
                <tr>
                  <td colSpan="8" className="spad-table-empty">
                    No parameter measurements available for this component.
                  </td>
                </tr>
              ) : (
                filteredParameterRows.map((row) => {
                  return (
                    <tr key={row.key} className="spad-table-row">
                      <td className="spad-td-mono font-bold text-cyan">
                        {row.name}
                      </td>
                      <td className="spad-td-mono">
                        {row.obs0h !== null ? `${typeof row.obs0h === 'number' ? row.obs0h.toFixed(2) : row.obs0h} ${row.unit}` : '—'}
                      </td>
                      <td className="spad-td-mono">
                        {row.obs24h !== null ? `${typeof row.obs24h === 'number' ? row.obs24h.toFixed(2) : row.obs24h} ${row.unit}` : '—'}
                      </td>
                      <td className="spad-td-mono">
                        {row.obs96h !== null ? `${typeof row.obs96h === 'number' ? row.obs96h.toFixed(2) : row.obs96h} ${row.unit}` : '—'}
                      </td>
                      <td className="spad-td-mono font-bold" style={{ color: '#38bdf8' }}>
                        {row.pred168h !== null ? `${typeof row.pred168h === 'number' ? row.pred168h.toFixed(2) : row.pred168h} ${row.unit}` : '—'}
                      </td>
                      <td className="spad-td-mono" style={{ color: '#f87171', fontWeight: '700' }}>
                        {typeof row.limit === 'number' ? `${row.limit.toFixed(2)} ${row.unit}` : '—'}
                      </td>
                      <td className="spad-td-mono">
                        {row.margin !== null ? (
                          <span style={{ color: row.isBreached ? '#ef4444' : '#10b981' }}>
                            +{row.margin} {row.unit}
                          </span>
                        ) : '—'}
                      </td>
                      <td>
                        <span
                          className={`spad-status-pill ${row.isBreached ? 'badge-status-critical' : 'badge-status-normal'}`}
                        >
                          {row.isBreached ? 'EXCEEDS LIMIT' : 'WITHIN LIMIT'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* 4. Telemetry Distribution & Population Observability Notes */}
      <div className="spad-two-col-grid" style={{ marginBottom: '20px' }}>
        <div className="spad-card" style={{ padding: '20px' }}>
          <div className="spad-card-header">
            <div className="spad-card-title-group">
              <span className="spad-card-section-label">OBSERVED TRAJECTORY SUMMARY</span>
              <h2 className="spad-card-title">Measurement Integrity</h2>
            </div>
          </div>
          <p className="spad-card-desc">
            All parametric checkpoints for component <strong>{componentId}</strong> ({availableParamKeys.join(', ')}) are retrieved directly from the MongoDB screening database.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Observed Checkpoints Count:</span>
              <span className="font-mono" style={{ color: '#f8fafc', fontWeight: '700' }}>
                {measurements[availableParamKeys[0]]?.length || 4} intervals (0h &rarr; 168h)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Active Screening Lot:</span>
              <span className="font-mono" style={{ color: '#f8fafc', fontWeight: '700' }}>{lotId}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Physical Burn-In Stage:</span>
              <span className="font-mono" style={{ color: '#f8fafc', fontWeight: '700' }}>{stage}</span>
            </div>
          </div>
        </div>

        <div className="spad-card" style={{ padding: '20px' }}>
          <div className="spad-card-header">
            <div className="spad-card-title-group">
              <span className="spad-card-section-label">POPULATION DISPERSION (COHORT)</span>
              <h2 className="spad-card-title">Multi-Unit Statistics</h2>
            </div>
          </div>
          <p className="spad-card-desc">
            Population distribution dispersion curves (mean, standard deviation, 3&sigma; bounds, and Mahalanobis cluster centroids) will be evaluated dynamically as full multi-unit lot datasets are ingested into MongoDB Atlas.
          </p>
          <div style={{ padding: '12px', background: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.2)', borderRadius: '4px', marginTop: '12px' }}>
            <span style={{ fontSize: '12px', color: '#fbbf24', fontWeight: '600' }}>
              Active Database Scope: Single seeded test unit ({componentId} / {lotId}) loaded live. Full population statistical envelopes await multi-component batch ingestion.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
