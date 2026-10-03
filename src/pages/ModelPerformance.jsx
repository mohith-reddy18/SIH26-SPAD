import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './Dashboard.css';
import { API_BASE_URL } from '../config/api';
import { mapScreeningRecord, getParameterMeta } from '../utils/recordMapping';

export default function ModelPerformance({ selectedLotId }) {
  const [screeningRecords, setScreeningRecords] = useState([]);
  const [selectedComponentId, setSelectedComponentId] = useState('');
  const [dataSource, setDataSource] = useState('loading'); // 'loading' | 'api' | 'empty' | 'offline'
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch screening records from backend API
  const loadModelData = useCallback(async () => {
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
    loadModelData();
  }, [loadModelData]);

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
  const engineeringStatus = activeRecord?.engineeringStatus || 'NORMAL';
  const aiStatus = activeRecord?.aiStatus || 'NOT_EVALUATED';
  const riskScore = activeRecord?.riskScore || 0;
  const aiRisk = activeRecord?.aiRisk || 0;

  const prediction = activeRecord?.aiAssessment?.prediction || null;
  const predParam = prediction?.parameters?.rdson || Object.values(prediction?.parameters || {})[0] || {};
  const lotAnomaly = activeRecord?.aiAssessment?.lotAnomaly || null;
  const anomParam = lotAnomaly?.parameters?.rdson || Object.values(lotAnomaly?.parameters || {})[0] || {};

  const explanation = activeRecord?.modelExplanation || activeRecord?.aiAssessment?.explanation || {
    framework: 'SHAP (TreeExplainer)',
    targetPrediction: 'Predicted 100% Limit Risk',
    baseValue: null,
    features: [],
    summaryText: 'No model explanation available for this record.',
  };

  const anomalies = activeRecord?.anomalies || {
    populationAbnormality: null,
    trajectoryAbnormality: null,
    futureRiskPrediction: null,
  };

  const riskColor = aiStatus === 'FLAGGED' ? '#ef4444' : aiStatus === 'NOT_EVALUATED' ? '#94a3b8' : '#22C55E';
  const riskCategory = aiStatus === 'FLAGGED' ? 'FLAGGED RISK' : (aiRisk > 75 ? 'HIGH RISK' : aiRisk > 40 ? 'MODERATE RISK' : 'LOW RISK');
  
  const hasRealShap = Boolean(explanation && Array.isArray(explanation.features) && explanation.features.length > 0);
  const maxAbsShap = hasRealShap
    ? explanation.features.reduce((max, f) => Math.max(max, Math.abs(f.shapValue || 0)), 0.1)
    : 0.1;

  // Observed physical telemetry
  const obs0h = activeRecord?.measurements?.rdson?.['0h'] ?? predParam.observed?.['0h'] ?? null;
  const obs24h = activeRecord?.measurements?.rdson?.['24h'] ?? predParam.observed?.['24h'] ?? null;
  const predicted168h = typeof predParam.predicted168h === 'number'
    ? predParam.predicted168h
    : (typeof activeRecord?.predictions?.rdson === 'number' ? activeRecord.predictions.rdson : null);

  const rocPerHour = typeof predParam.rateOfChangePerHour === 'number' ? predParam.rateOfChangePerHour : null;
  const projMargin = typeof predParam.projectedMargin === 'number' ? predParam.projectedMargin : null;
  const ifRawScore = typeof anomParam.lotAnomalyScore === 'number' ? anomParam.lotAnomalyScore : (typeof anomParam.peerComparisonEvidence?.rawScore === 'number' ? anomParam.peerComparisonEvidence.rawScore : null);
  const noveltyPercentile = typeof anomParam.peerComparisonEvidence?.noveltyPercentile === 'number' ? anomParam.peerComparisonEvidence.noveltyPercentile : null;

  const rawModA = anomParam.aiFlag ?? lotAnomaly?.aiFlag;
  const robustZ = typeof anomParam.peerComparisonEvidence?.robustZScore === 'number'
    ? anomParam.peerComparisonEvidence.robustZScore
    : (typeof anomParam.peerComparisonEvidence?.zScore === 'number' ? anomParam.peerComparisonEvidence.zScore : null);

  let modAFlag = 'NOT_EVALUATED';
  if (rawModA === 'FLAGGED' || rawModA === '1' || rawModA === 'TRUE') {
    modAFlag = 'FLAGGED';
  } else if (rawModA === 'NOT FLAGGED' || rawModA === 'NOT_FLAGGED' || rawModA === '0' || rawModA === 'FALSE' || rawModA === 'NOMINAL' || rawModA === 'NORMAL' || rawModA === 'PASS') {
    modAFlag = 'NOT FLAGGED';
  } else if (typeof noveltyPercentile === 'number' && !isNaN(noveltyPercentile)) {
    modAFlag = noveltyPercentile >= 90.0 ? 'FLAGGED' : 'NOT FLAGGED';
  } else if (typeof robustZ === 'number' && !isNaN(robustZ)) {
    modAFlag = Math.abs(robustZ) > 3.0 ? 'FLAGGED' : 'NOT FLAGGED';
  }
  const modAColor = modAFlag === 'FLAGGED' ? '#ef4444' : modAFlag === 'NOT FLAGGED' ? '#22C55E' : '#94a3b8';

  const moduleCObj = activeRecord?.aiAssessment?.moduleC || activeRecord?.moduleC || null;
  const m3Param = moduleCObj?.parameters?.rdson || Object.values(moduleCObj?.parameters || {})[0] || {};
  const maxRDSInst = typeof m3Param.maxRDSInstantaneousOhm === 'number' ? m3Param.maxRDSInstantaneousOhm : null;
  const exceedanceCount = typeof m3Param.limitExceedanceCount === 'number' ? m3Param.limitExceedanceCount : null;
  const evidenceTransId = m3Param.evidenceTransientId || null;
  const evidenceTimeUs = typeof m3Param.evidenceTimeUs === 'number' ? m3Param.evidenceTimeUs : null;

  const rdLimit = typeof activeRecord?.engineeringLimits?.rdson?.limitValue === 'number'
    ? activeRecord.engineeringLimits.rdson.limitValue
    : (typeof activeRecord?.engineeringLimits?.rdson === 'number' ? activeRecord.engineeringLimits.rdson : null);

  const rawModC = m3Param.aiFlag ?? moduleCObj?.aiFlag;
  let m3Flag = 'NOT_EVALUATED';
  if (rawModC === 'FLAGGED' || rawModC === '1' || rawModC === 'TRUE') {
    m3Flag = 'FLAGGED';
  } else if (rawModC === 'NOT FLAGGED' || rawModC === 'NOT_FLAGGED' || rawModC === '0' || rawModC === 'FALSE' || rawModC === 'NOMINAL' || rawModC === 'NORMAL' || rawModC === 'PASS') {
    m3Flag = 'NOT FLAGGED';
  } else if (maxRDSInst !== null || exceedanceCount !== null || evidenceTransId !== null) {
    if ((exceedanceCount !== null && exceedanceCount > 0) || (maxRDSInst !== null && rdLimit !== null && maxRDSInst > rdLimit)) {
      m3Flag = 'FLAGGED';
    } else {
      m3Flag = 'NOT FLAGGED';
    }
  }
  const modCColor = m3Flag === 'FLAGGED' ? '#ef4444' : m3Flag === 'NOT FLAGGED' ? '#22C55E' : '#94a3b8';

  return (
    <div className="spad-page-container">
      {/* 1. Page Header */}
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">Model Performance &amp; Evaluation</h1>
          <span className="spad-page-tag">NASA V1 VALIDATED BENCHMARKS</span>
        </div>
        <p className="spad-page-description">
          Verified model validation error benchmarks, dynamic 100% drift regression, multi-method anomaly evidence, and SHAP explainability attribution.
        </p>
      </header>

      {/* Backend API Connection Error Banner */}
      {fetchError && (
        <div style={{ padding: '14px 18px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong>Unable to connect to SPAD backend</strong> ({fetchError}).
          </div>
          <button
            type="button"
            onClick={loadModelData}
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

      {/* 2. Component Selection Control Bar */}
      <div className="spad-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div className="spad-trends-component-controls" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div className="spad-comp-selector-group">
            <label htmlFor="model-comp-select" className="spad-comp-select-label">
              Active Screening Unit:
            </label>
            <select
              id="model-comp-select"
              name="modelComponentSelect"
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
                  const status = c.engineeringStatus || c.status || 'NORMAL';
                  return (
                    <option key={id} value={id}>
                      {id} ({status})
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <div className="spad-comp-compact-summary">
            <span className="spad-summary-pill-id">{componentId}</span>
            <span className="spad-summary-pill-lot">Lot: {lotId}</span>
            <span className={`spad-summary-pill-status status-${engineeringStatus.toLowerCase()}`}>
              Eng Status: {engineeringStatus}
            </span>
            <span className="spad-summary-pill-risk">
              AI Status: {aiStatus} (Risk Index: {riskScore.toFixed(2)})
            </span>
            <span className="spad-spec-badge" style={{ marginLeft: 'auto' }}>
              SOURCE: <strong>{dataSource === 'api' ? 'MONGODB ATLAS' : dataSource === 'offline' ? 'OFFLINE' : 'EMPTY'}</strong>
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="spad-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          Loading model performance telemetry from MongoDB Atlas...
        </div>
      ) : !activeRecord ? (
        <div className="spad-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          {fetchError ? `Backend API connection error: ${fetchError}` : 'No screening records found in database for selected lot.'}
        </div>
      ) : (
        <>
          {/* ============================================================ */}
          {/* SECTION 1: ANOMALY DETECTION (ISOLATION FOREST & PEER COHORT) */}
          {/* ============================================================ */}
          <section className="spad-card" style={{ padding: '24px', marginBottom: '20px' }}>
            <div className="spad-section-header" style={{ marginBottom: '14px' }}>
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">SECTION 1 • ANOMALY DETECTION</span>
                <h2 className="spad-section-title">
                  Isolation Forest &amp; Intra-Lot Statistical Peer Analysis
                </h2>
              </div>
              <span className="spad-status-pill" style={{ backgroundColor: modAColor + '20', color: modAColor, borderColor: modAColor + '60' }}>
                STATUS: {modAFlag}
              </span>
            </div>

            <p className="spad-card-desc" style={{ marginBottom: '16px' }}>
              Dynamic outlier detection compares early component trajectories against the intra-lot reference cohort. Isolation Forest scores provide continuous evidence of population departure before engineering limit breach.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginBottom: '16px' }}>
              <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                <span className="spad-lot-metric-label">ISOLATION FOREST SCORE</span>
                <span className="spad-lot-metric-val font-mono text-cyan" style={{ fontSize: '15px' }}>
                  {ifRawScore !== null ? ifRawScore.toFixed(4) : '—'}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Continuous decision score</span>
              </div>

              <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                <span className="spad-lot-metric-label">NOVELTY PERCENTILE</span>
                <span className="spad-lot-metric-val font-mono text-cyan" style={{ fontSize: noveltyPercentile !== null ? '15px' : '12px' }}>
                  {noveltyPercentile !== null ? `${noveltyPercentile.toFixed(1)}%` : 'Unavailable for this record'}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Relative to peer lot baseline</span>
              </div>

              <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                <span className="spad-lot-metric-label">COHORT SAMPLE QUALITY</span>
                <span className="spad-lot-metric-val font-mono" style={{ fontSize: '14px', color: lotAnomaly?.cohortQuality === 'SUFFICIENT' ? '#22C55E' : '#f59e0b' }}>
                  {lotAnomaly?.cohortQuality || (screeningRecords.length >= 3 ? 'SUFFICIENT' : 'INSUFFICIENT')}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>{screeningRecords.length} peers evaluated</span>
              </div>

              <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                <span className="spad-lot-metric-label">POPULATION ABNORMALITY</span>
                <span className={`spad-ai-status-tag ${modAFlag === 'FLAGGED' ? 'tag-warning' : modAFlag === 'NOT FLAGGED' ? 'tag-nominal' : ''}`} style={{ marginTop: '4px' }}>
                  {modAFlag}
                </span>
              </div>
            </div>

            <div className="spad-shap-disclaimer-note" style={{ borderLeftColor: '#38bdf8' }}>
              <span className="font-bold text-cyan">Methodology Boundary:</span> Intra-lot statistical evaluation produces continuous abnormality evidence. In accordance with SPAD requirements, synthetic classification accuracy or artificial false-negative rates are not fabricated for lot anomaly detection.
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION 2: TIME-SERIES DRIFT PREDICTION (RANDOM FOREST)      */}
          {/* ============================================================ */}
          <section className="spad-card" style={{ padding: '24px', marginBottom: '20px' }}>
            <div className="spad-section-header" style={{ marginBottom: '14px' }}>
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">SECTION 2 • DRIFT PREDICTION</span>
                <h2 className="spad-section-title">
                  Random Forest 100% Degradation Forecast &amp; Validation Benchmarks
                </h2>
              </div>
              <span className="spad-status-pill badge-status-normal">
                MODEL V1 FROZEN
              </span>
            </div>

            {/* Authoritative Model Validation Benchmarks Banner */}
            <div style={{ background: 'rgba(15, 23, 42, 0.65)', border: '1px solid rgba(56, 189, 248, 0.25)', borderRadius: '8px', padding: '16px 18px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.06em', color: '#38bdf8', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  ★ MODEL VALIDATION — NASA V1 (Leave-One-Device-Out CV • N = 13 normal physical MOSFETs)
                </span>
                <span style={{ fontSize: '10.5px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
                  Dataset: NASA MOSFET Thermal Overstress (199–200°C)
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
                <div style={{ background: 'rgba(7, 11, 20, 0.7)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>LOOCV MAE</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#22C55E', fontFamily: 'var(--font-mono)', marginTop: '2px', display: 'block' }}>
                    0.052832 Ω
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>Mean Absolute Error</span>
                </div>

                <div style={{ background: 'rgba(7, 11, 20, 0.7)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>LOOCV RMSE</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: '2px', display: 'block' }}>
                    0.067271 Ω
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>Root Mean Squared Error</span>
                </div>

                <div style={{ background: 'rgba(7, 11, 20, 0.7)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>MEDIAN ABSOLUTE ERROR</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc', fontFamily: 'var(--font-mono)', marginTop: '2px', display: 'block' }}>
                    0.044947 Ω
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>MedAE on normal references</span>
                </div>

                <div style={{ background: 'rgba(7, 11, 20, 0.7)', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '6px', padding: '10px 14px' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>MEDIAN RELATIVE ERROR</span>
                  <span style={{ fontSize: '18px', fontWeight: '800', color: '#a78bfa', fontFamily: 'var(--font-mono)', marginTop: '2px', display: 'block' }}>
                    7.065%
                  </span>
                  <span style={{ fontSize: '10px', color: '#64748b' }}>Relative percentage error</span>
                </div>
              </div>

              <div style={{ marginTop: '12px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.5, fontFamily: 'var(--font-ui, Outfit, sans-serif)' }}>
                <strong>Validation Context:</strong> Leave-One-Device-Out Cross-Validation on N = 13 normal physical MOSFETs.<br />
                <strong>Model Architecture:</strong> <code>RandomForestRegressor (300 trees, max_depth 3, min_samples_leaf 2, random_state 42)</code>.<br />
                <strong>Inputs:</strong> <code>RDS0 + RDS33</code> (0% and 33.3% observed checkpoints) &rarr; <strong>Target:</strong> <code>RDS100</code> (100% equivalent forecast endpoint).
              </div>
            </div>

            {/* Current Component Specific Inferred Endpoint */}
            <div style={{ background: 'var(--spad-inset, #101119)', border: '1px solid var(--spad-border, #1F212B)', borderRadius: '6px', padding: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Current Component Inference: <span className="text-cyan">{componentId}</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
                <div style={{ padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>0% Physical Observed</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    {obs0h !== null ? `${obs0h.toFixed(3)} Ω` : '—'}
                  </span>
                </div>

                <div style={{ padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>33.3% Physical Observed</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
                    {obs24h !== null ? `${obs24h.toFixed(3)} Ω` : '—'}
                  </span>
                </div>

                <div style={{ padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '4px', border: '1px solid rgba(56, 189, 248, 0.2)' }}>
                  <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', textTransform: 'uppercase', display: 'block' }}>Predicted 100% Endpoint</span>
                  <span style={{ fontSize: '14px', fontWeight: '800', color: '#22C55E', fontFamily: 'var(--font-mono)' }}>
                    {predicted168h !== null ? `${predicted168h.toFixed(3)} Ω` : '—'}
                  </span>
                </div>

                <div style={{ padding: '10px 12px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '4px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>Projected Spec Margin</span>
                  <span style={{ fontSize: '14px', fontWeight: '700', color: projMargin !== null && projMargin < 0 ? '#ef4444' : '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                    {projMargin !== null ? `${projMargin.toFixed(3)} Ω` : '—'}
                  </span>
                </div>
              </div>

              <div style={{ marginTop: '10px', fontSize: '10.5px', color: '#94a3b8', fontStyle: 'italic' }}>
                Note: Above metrics represent the model's forward projection for unit {componentId}. Prediction error is not calculated for individual in-flight units where physical 100% completion is still pending.
              </div>
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION 3: MACHINE LEARNING EXPLAINABILITY (SHAP ATTRIBUTION) */}
          {/* ============================================================ */}
          <section className="spad-card spad-shap-section" style={{ padding: '24px', marginBottom: '20px' }}>
            <div className="spad-section-header">
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">SECTION 3 • EXPLAINABILITY</span>
                <h2 className="spad-section-title">
                  SHAP Feature Attribution (SHapley Additive exPlanations)
                </h2>
              </div>
              <div className="spad-shap-framework-badge">
                FRAMEWORK: <strong>{explanation.framework || 'SHAP (TreeExplainer)'}</strong>
              </div>
            </div>

            <p className="spad-shap-intro-desc">
              SHAP feature attribution identifies how individual measurement features mathematically contributed to the Random Forest 100% degradation risk index projection.
              <strong> Positive values (+)</strong> increased projected risk, while <strong>negative values (-)</strong> reduced projected risk toward baseline.
            </p>

            {/* Risk Assessment Banner */}
            <div className="spad-shap-prediction-banner">
              <div className="spad-shap-pred-item">
                <span className="spad-pred-label">AI PREDICTED 100% RISK INDEX:</span>
                <div className="spad-pred-val-wrap">
                  <span className="spad-pred-percent" style={{ color: riskColor }}>
                    {aiRisk}%
                  </span>
                  <span className="spad-pred-category" style={{ color: riskColor, borderColor: riskColor }}>
                    {riskCategory}
                  </span>
                </div>
                <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Derived from Random Forest drift projection</span>
              </div>

              <div className="spad-shap-pred-item">
                <span className="spad-pred-label">LOT BASELINE EXPECTED RISK INDEX (E[f(x)]):</span>
                <span className="spad-pred-base font-mono">
                  {hasRealShap && explanation.baseValue !== null && typeof explanation.baseValue === 'number' ? `${(explanation.baseValue * 100).toFixed(1)}%` : '—'}
                </span>
                <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Intra-lot reference prior</span>
              </div>

              <div className="spad-shap-pred-item spad-shap-pred-span">
                <span className="spad-pred-label">MODEL DIAGNOSTIC SUMMARY:</span>
                <p className="spad-pred-summary-text">
                  {explanation.summaryText}
                </p>
              </div>
            </div>

            {/* Feature Contribution Rows */}
            <div className="spad-shap-contributions-container">
              <div className="spad-shap-bar-header">
                <span className="spad-shap-col-feature">FEATURE NAME &amp; TELEMETRY</span>
                <span className="spad-shap-col-bars">SHAP CONTRIBUTION TO RISK INDEX</span>
                <span className="spad-shap-col-val">IMPACT</span>
              </div>

              <div className="spad-shap-features-list">
                {!hasRealShap ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px' }}>
                    <p style={{ margin: '0 0 6px 0', fontWeight: '700', color: '#f8fafc', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                      SHAP FEATURE ATTRIBUTION UNAVAILABLE
                    </p>
                    <p style={{ margin: '0 0 4px 0', color: '#cbd5e1' }}>
                      TreeExplainer feature-attribution values were not returned for this screening record.
                    </p>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>
                      No attribution values or feature contributions are fabricated.
                    </span>
                  </div>
                ) : (
                  explanation.features.map((feat, idx) => {
                    const val = feat.shapValue || 0;
                    const isPositive = val >= 0;
                    const absVal = Math.abs(val);
                    const barWidthPercent = Math.min(100, (absVal / maxAbsShap) * 88);

                    return (
                      <div key={idx} className="spad-shap-feature-row">
                        <div className="spad-shap-feature-info">
                          <span className="spad-shap-feat-name">{feat.name}</span>
                          {feat.featureValue && (
                            <span className="spad-shap-feat-val">{feat.featureValue}</span>
                          )}
                        </div>

                        <div className="spad-shap-bar-track">
                          <div className="spad-shap-zero-line" aria-hidden="true" />
                          <div className="spad-shap-bar-half left">
                            {!isPositive && (
                              <div
                                className="spad-shap-bar-fill neg"
                                style={{ width: `${barWidthPercent}%` }}
                                title={`Negative impact: ${val.toFixed(2)} (reduces risk index)`}
                              />
                            )}
                          </div>
                          <div className="spad-shap-bar-half right">
                            {isPositive && (
                              <div
                                className="spad-shap-bar-fill pos"
                                style={{ width: `${barWidthPercent}%` }}
                                title={`Positive impact: +${val.toFixed(2)} (increases risk index)`}
                              />
                            )}
                          </div>
                        </div>

                        <div className="spad-shap-val-col">
                          <span className={`spad-shap-val-badge ${isPositive ? 'shap-pos' : 'shap-neg'}`}>
                            {isPositive ? `+${val.toFixed(2)}` : val.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {hasRealShap && (
                <div className="spad-shap-scale-legend">
                  <span className="text-green">◀ Negative SHAP (Reduces Risk Index)</span>
                  <span className="spad-shap-scale-center font-mono">0.00 Base</span>
                  <span className="text-red">Positive SHAP (Increases Risk Index) ▶</span>
                </div>
              )}
            </div>

            <div className="spad-shap-disclaimer-note">
              <span className="font-bold text-cyan">Technical Boundary:</span> SHAP attributions describe the mathematical feature contributions to the Random Forest model's 100% drift risk index projection. The deterministic screening disposition (NORMAL / SUSPECT / CRITICAL) is independently evaluated against MIL-STD engineering specification limits.
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION 4: TRANSIENT PULSE EXTRACTION (MODULE C)             */}
          {/* ============================================================ */}
          <section className="spad-card" style={{ padding: '24px', marginBottom: '20px' }}>
            <div className="spad-section-header" style={{ marginBottom: '14px' }}>
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">SECTION 4 • TRANSIENT MONITORING</span>
                <h2 className="spad-section-title">
                  MODULE C • TRANSIENT PULSE EXTRACTION &amp; OVERSTRESS TELEMETRY
                </h2>
              </div>
              <span className="spad-status-pill" style={{ backgroundColor: modCColor + '20', color: modCColor, borderColor: modCColor + '60' }}>
                STATUS: {m3Flag}
              </span>
            </div>

            <p className="spad-card-desc" style={{ marginBottom: '16px' }}>
              Sub-microsecond transient waveform analysis monitors instantaneous peak resistance (RDS) during pulse switching transitions to capture latent oxide rupture or bond-wire degradation before steady-state shift.
            </p>

            {maxRDSInst === null && evidenceTransId === null && exceedanceCount === null ? (
              <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '6px', marginBottom: '16px' }}>
                <p style={{ margin: '0 0 6px 0', fontWeight: '700', color: '#f8fafc', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  TRANSIENT EVIDENCE NOT AVAILABLE FOR THIS RECORD
                </p>
                <p style={{ margin: '0 0 4px 0', color: '#cbd5e1' }}>
                  Module C transient telemetry was not persisted for this screening record. No transient result is inferred.
                </p>
                <span style={{ fontSize: '12px', color: '#64748b' }}>
                  Sub-microsecond pulse sampling requires high-speed oscilloscope capture. In accordance with SPAD integrity rules, no synthetic pulse telemetry is fabricated.
                </span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                  <span className="spad-lot-metric-label">MAX INSTANTANEOUS RDS(ON)</span>
                  <span className="spad-lot-metric-val font-mono text-cyan" style={{ fontSize: '15px' }}>
                    {maxRDSInst !== null ? `${maxRDSInst.toFixed(4)} Ω` : '—'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Peak switching resistance</span>
                </div>

                <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                  <span className="spad-lot-metric-label">LIMIT EXCEEDANCE COUNT</span>
                  <span className="spad-lot-metric-val font-mono" style={{ fontSize: '15px', color: exceedanceCount && exceedanceCount > 0 ? '#ef4444' : '#22C55E' }}>
                    {exceedanceCount !== null ? `${exceedanceCount} pulses` : '—'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Threshold breach instances</span>
                </div>

                <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                  <span className="spad-lot-metric-label">PEAK TRANSIENT ID</span>
                  <span className="spad-lot-metric-val font-mono text-slate" style={{ fontSize: '14px' }}>
                    {evidenceTransId || '—'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Waveform capture reference</span>
                </div>

                <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                  <span className="spad-lot-metric-label">PEAK TIMESTAMP (TIME_US)</span>
                  <span className="spad-lot-metric-val font-mono text-slate" style={{ fontSize: '14px' }}>
                    {evidenceTimeUs !== null ? `${evidenceTimeUs.toFixed(2)} µs` : '—'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Transient pulse window offset</span>
                </div>

                <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                  <span className="spad-lot-metric-label">CONFIGURED RDS(ON) LIMIT</span>
                  <span className="spad-lot-metric-val font-mono text-slate" style={{ fontSize: '14px' }}>
                    {rdLimit !== null ? `${rdLimit.toFixed(3)} Ω` : '—'}
                  </span>
                  <span style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>Specification upper fence</span>
                </div>

                <div className="spad-lot-metric-pill" style={{ background: 'var(--spad-inset, #101119)', padding: '12px 14px' }}>
                  <span className="spad-lot-metric-label">MODULE C AI EVALUATION</span>
                  <span className={`spad-ai-status-tag ${m3Flag === 'FLAGGED' ? 'tag-warning' : m3Flag === 'NOT FLAGGED' ? 'tag-nominal' : ''}`} style={{ marginTop: '4px' }}>
                    {m3Flag}
                  </span>
                </div>
              </div>
            )}

            <div className="spad-shap-disclaimer-note" style={{ borderLeftColor: '#38bdf8' }}>
              <span className="font-bold text-cyan">Engineering Boundary:</span> Transient pulse monitoring detects localized thermal hot-spotting and gate dielectric micro-defects during pulse transitions that evade low-frequency static DC screening.
            </div>
          </section>
        </>
      )}
    </div>
  );
}

