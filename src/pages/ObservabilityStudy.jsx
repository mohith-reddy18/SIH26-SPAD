import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './Dashboard.css';
import { API_BASE_URL } from '../config/api';

function getStatusColor(status) {
  if (status === 'NORMAL' || status === 'PASS') return '#22C55E';
  if (status === 'SUSPECT' || status === 'HOLD') return '#f59e0b';
  if (status === 'CRITICAL' || status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

import { mapScreeningRecord, getParameterMeta, extractPredictedValue, formatStageLabel } from '../utils/recordMapping';

export default function ObservabilityStudy({ selectedLotId, onSelectLot }) {
  const [screeningRecords, setScreeningRecords] = useState([]);
  const [selectedComponentId, setSelectedComponentId] = useState('');
  const [selectedParamKey, setSelectedParamKey] = useState('ALL');
  const [dataSource, setDataSource] = useState('loading'); // 'loading' | 'api' | 'empty' | 'offline'
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch screening records from backend API
  const loadObservabilityData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);

    try {
      const query = selectedLotId ? `?lotId=${encodeURIComponent(selectedLotId)}` : '';
      const response = await fetch(`${API_BASE_URL}/api/screening${query}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && Array.isArray(result.data) && result.data.length > 0) {
          setScreeningRecords(result.data);
          setDataSource('api');
          const initialId = result.data[0].componentId || result.data[0].id || '';
          setSelectedComponentId((prev) => (prev && result.data.some((r) => (r.componentId || r.id) === prev) ? prev : initialId));
          return;
        }
      }
      setScreeningRecords([]);
      setDataSource('empty');
    } catch (err) {
      console.warn('[SPAD] Failed to fetch screening records from backend:', err.message);
      setFetchError(err.message || 'Unable to connect to SPAD backend');
      setDataSource('offline');
    } finally {
      setIsLoading(false);
    }
  }, [selectedLotId]);

  useEffect(() => {
    loadObservabilityData();
  }, [loadObservabilityData]);

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

  // Set of keys to ignore from parameter tables (internal timepoints, suffixed keys, and early drift ΔRDS)
  const IGNORED_OBS_KEYS = useMemo(() => new Set([
    '0h', '24h', '96h', '168h', '0hr', '24hr', '96hr', '168hr',
    '0H', '24H', '96H', '168H', '0%', '33%', '33.3%', '33.33%', '66%', '66.7%', '66.67%', '100%',
    'RDS0', 'RDS33', 'RDS96', 'RDS168', 'rds0', 'rds33', 'rds96', 'rds168',
    'rdson_0h', 'rdson_24h', 'rdson_96h', 'rdson_168h', 'rdson_168h_forecast', 'rdson_forecast',
    'delta_rdson', 'delta-rdson', 'deltardson', 'delta_rds', 'Delta_RDS_0_33',
    'Forecast_Residual', 'Absolute_Forecast_Error', 'Relative_Error_Percent',
  ]), []);

  // 3. Dynamic canonical parameter keys extraction from backend measurements
  const availableParamKeys = useMemo(() => {
    const rawKeys = [
      ...Object.keys(measurements || {}),
      ...Object.keys(engineeringLimits || {}),
    ];
    const filtered = rawKeys.filter((k) => !IGNORED_OBS_KEYS.has(k) && !k.toLowerCase().includes('delta_rds') && !k.toLowerCase().includes('deltardson'));
    const uniqueCanonical = Array.from(new Set(filtered));
    return uniqueCanonical.length > 0 ? uniqueCanonical : ['rdson', 'temp'];
  }, [measurements, engineeringLimits, IGNORED_OBS_KEYS]);

  // Map parameter keys to display information
  const parameterRows = useMemo(() => {
    const rows = [];
    const seenNames = new Set();

    availableParamKeys.forEach((key) => {
      const rawLimit = engineeringLimits[key];
      const meta = getParameterMeta(key, rawLimit);
      const name = meta.name;
      const unit = meta.unit;

      if (seenNames.has(name.toLowerCase())) return;
      seenNames.add(name.toLowerCase());

      const series = measurements[key];

      let obs0h = null;
      let obs24h = null;
      let obs96h = null;

      if (Array.isArray(series)) {
        if (series.length > 0 && typeof series[0] === 'number') obs0h = series[0];
        if (series.length > 1 && typeof series[1] === 'number') obs24h = series[1];
        if (series.length > 2 && typeof series[2] === 'number') obs96h = series[2];
      } else if (typeof series === 'object' && series !== null) {
        obs0h = series['0h'] ?? series['0hr'] ?? series['0%'] ?? series['RDS0'] ?? series['0H'] ?? null;
        obs24h = series['24h'] ?? series['24hr'] ?? series['33.3%'] ?? series['33%'] ?? series['RDS33'] ?? series['24H'] ?? null;
        obs96h = series['96h'] ?? series['96hr'] ?? series['66.7%'] ?? series['66%'] ?? series['RDS96'] ?? series['96H'] ?? null;
      } else if (typeof series === 'number') {
        obs0h = series;
      }

      // Checkpoint resolution fallbacks from canonical measurements if still null for primary parameter (rdson)
      if (key === 'rdson' || key === 'rdson_ohm' || key === 'rds_on') {
        if (obs0h === null) obs0h = measurements.rdson_0h ?? measurements['0h'] ?? measurements['0hr'] ?? measurements['0%'] ?? measurements['RDS0'] ?? activeRecord?.aiAssessment?.prediction?.parameters?.rdson?.observed?.['0h'] ?? activeRecord?.aiAssessment?.prediction?.parameters?.rdson?.observed?.['0hr'] ?? null;
        if (obs24h === null) obs24h = measurements.rdson_24h ?? measurements['24h'] ?? measurements['24hr'] ?? measurements['33.3%'] ?? measurements['RDS33'] ?? activeRecord?.aiAssessment?.prediction?.parameters?.rdson?.observed?.['24h'] ?? activeRecord?.aiAssessment?.prediction?.parameters?.rdson?.observed?.['24hr'] ?? null;
        if (obs96h === null) obs96h = measurements.rdson_96h ?? measurements['96h'] ?? measurements['96hr'] ?? measurements['66.7%'] ?? measurements['RDS96'] ?? null;
      }

      // Canonical prediction resolution
      let pred168h = extractPredictedValue(activeRecord, key);
      if (pred168h === null && Array.isArray(series) && series.length > 3) {
        pred168h = series[3];
      }

      const limit = meta.specLimitMax;

      const margin =
        typeof limit === 'number' && typeof pred168h === 'number'
          ? (limit - pred168h).toFixed(2)
          : null;

      const isBreached = typeof limit === 'number' && typeof pred168h === 'number' && pred168h > limit;

      // Only push row if at least one actual checkpoint or limit exists
      if (obs0h !== null || obs24h !== null || obs96h !== null || pred168h !== null || limit !== undefined) {
        rows.push({
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
        });
      }
    });

    return rows;
  }, [availableParamKeys, measurements, predictions, engineeringLimits, activeRecord]);

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
          Observed burn-in degradation trajectories, parameter checkpoints (0% &rarr; 33.3% &rarr; 66.7% &rarr; 100%), AI 100% forecast projections, and engineering specification boundary margin analysis.
        </p>
      </header>

      {/* Backend API Connection Error Banner (Requirement 8A) */}
      {fetchError && (
        <div style={{ padding: '14px 18px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong>Unable to connect to SPAD backend</strong> ({fetchError}).
          </div>
          <button
            type="button"
            onClick={loadObservabilityData}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Retry Connection
          </button>
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
              name="obsComponentSelect"
              className="spad-comp-select-input"
              value={componentId}
              onChange={(e) => setSelectedComponentId(e.target.value)}
              disabled={screeningRecords.length === 0}
            >
              {screeningRecords.length === 0 ? (
                <option value="">No components available</option>
              ) : (
                screeningRecords.map((c) => {
                  const id = c.componentId || c.id;
                  const cStatus = c.engineeringStatus || c.status || 'NORMAL';
                  return (
                    <option key={id} value={id}>
                      {id} ({cStatus})
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <div className="spad-comp-selector-group">
            <label htmlFor="obs-param-select" className="spad-comp-select-label">
              Filter Parameter:
            </label>
            <select
              id="obs-param-select"
              name="obsParamSelect"
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
            <span className="spad-summary-pill-lot">Stage: {formatStageLabel(stage)}</span>
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
                <th>0% (BASELINE)</th>
                <th>33.3% (EARLY)</th>
                <th>100% (AI FORECAST)</th>
                <th>ENGINEERING LIMIT</th>
                <th>SAFETY MARGIN</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredParameterRows.length === 0 ? (
                <tr>
                  <td colSpan="7" className="spad-table-empty">
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
                      <td className="spad-td-mono font-bold" style={{ color: '#38bdf8' }}>
                        {row.pred168h !== null ? `${typeof row.pred168h === 'number' ? row.pred168h.toFixed(2) : row.pred168h} ${row.unit}` : '—'}
                      </td>
                      <td className="spad-td-mono" style={{ color: '#f87171', fontWeight: '700' }}>
                        {typeof row.limit === 'number' ? `${row.limit.toFixed(2)} ${row.unit}` : '—'}
                      </td>
                      <td className="spad-td-mono">
                        {row.margin !== null ? (
                          <span style={{ color: row.isBreached ? '#ef4444' : 'var(--spad-green, #22C55E)' }}>
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
      <div className="spad-equal-two-col-grid" style={{ marginBottom: '20px' }}>
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
                {measurements[availableParamKeys[0]]?.length || 4} intervals (0% &rarr; 100%)
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Active Screening Lot:</span>
              <span className="font-mono" style={{ color: '#f8fafc', fontWeight: '700' }}>{lotId}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Physical Burn-In Stage:</span>
              <span className="font-mono" style={{ color: '#f8fafc', fontWeight: '700' }}>{formatStageLabel(stage)}</span>
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
