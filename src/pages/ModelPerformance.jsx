import React, { useState, useEffect, useMemo } from 'react';
import { mockComponents } from '../data/mockData';
import './Dashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

function getStatusColor(status) {
  if (status === 'NORMAL' || status === 'PASS') return '#10b981';
  if (status === 'SUSPECT' || status === 'HOLD') return '#f59e0b';
  if (status === 'CRITICAL' || status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

export default function ModelPerformance() {
  const [screeningRecords, setScreeningRecords] = useState([]);
  const [selectedComponentId, setSelectedComponentId] = useState('C-0001');
  const [dataSource, setDataSource] = useState('fallback'); // 'api' | 'fallback'
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch screening records from backend API
  useEffect(() => {
    let isMounted = true;

    async function loadModelData() {
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
          console.warn('[SPAD] API returned empty/invalid records; using mock fallback.');
          setDataSource('fallback');
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[SPAD] Failed to fetch screening records from backend:', err.message);
          setFetchError(err.message);
          setDataSource('fallback');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadModelData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Active component resolution
  const activeRecord = useMemo(() => {
    if (dataSource === 'api' && screeningRecords.length > 0) {
      const match = screeningRecords.find(
        (r) => (r.componentId || r.id) === selectedComponentId
      );
      if (match) return match;
    }
    return mockComponents.find((c) => c.id === selectedComponentId) || mockComponents[0];
  }, [screeningRecords, selectedComponentId, dataSource]);

  const componentId = activeRecord.componentId || activeRecord.id || 'C-0001';
  const lotId = activeRecord.lotId || 'LOT-2026-001';
  const aiAssessment = activeRecord.aiAssessment || activeRecord.status || 'NORMAL';
  const aiRisk = typeof activeRecord.aiRisk === 'number' ? activeRecord.aiRisk : 12;
  const riskScore = typeof activeRecord.riskScore === 'number' ? activeRecord.riskScore : 0.12;

  const anomalies = activeRecord.anomalies || {
    populationAbnormality: false,
    trajectoryAbnormality: false,
    futureRiskPrediction: 'Low (<5%)',
  };

  const predictions = activeRecord.predictions || {};

  const explanation = activeRecord.modelExplanation || {
    framework: 'SHAP (TreeExplainer)',
    targetPrediction: 'Predicted 168h Limit Risk',
    predictedRiskPercent: aiRisk,
    baseValue: 0.15,
    features: [],
    summaryText: 'Parametric measurements track nominal degradation curve.',
  };

  const riskCategory = aiAssessment;
  const riskColor = getStatusColor(riskCategory);
  const maxAbsShap = (explanation.features || []).reduce(
    (max, f) => Math.max(max, Math.abs(f.shapValue || 0)),
    0.1
  );

  return (
    <div className="spad-page-container">
      {/* 1. Page Header */}
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">Model Performance</h1>
          <span className="spad-page-tag">AI / ML EARLY FORECAST VALIDATION</span>
        </div>
        <p className="spad-page-description">
          Multivariate early-risk anomaly detection telemetry, dynamic 168h parameter drift forecasts, and SHAP feature attribution explainability.
        </p>
      </header>

      {/* 2. Component Selection Control Bar */}
      <div className="spad-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div className="spad-trends-component-controls" style={{ flexWrap: 'wrap', gap: '16px' }}>
          <div className="spad-comp-selector-group">
            <label htmlFor="model-comp-select" className="spad-comp-select-label">
              Component:
            </label>
            <select
              id="model-comp-select"
              className="spad-comp-select-input"
              value={componentId}
              onChange={(e) => setSelectedComponentId(e.target.value)}
            >
              {(dataSource === 'api' && screeningRecords.length > 0 ? screeningRecords : mockComponents).map(
                (c) => {
                  const id = c.componentId || c.id;
                  const status = c.aiAssessment || c.status || 'NORMAL';
                  return (
                    <option key={id} value={id}>
                      {id} ({status})
                    </option>
                  );
                }
              )}
            </select>
          </div>

          <div className="spad-comp-compact-summary">
            <span className="spad-summary-pill-id">{componentId}</span>
            <span className="spad-summary-pill-lot">Lot: {lotId}</span>
            <span
              className={`spad-summary-pill-status status-${riskCategory.toLowerCase()}`}
            >
              AI Assessment: {riskCategory}
            </span>
            <span className="spad-summary-pill-risk">
              Risk Score: {riskScore} ({aiRisk}%)
            </span>
            <span className="spad-spec-badge" style={{ marginLeft: 'auto' }}>
              SOURCE: <strong>{dataSource === 'api' ? 'MONGODB ATLAS' : 'LOCAL FALLBACK'}</strong>
            </span>
          </div>
        </div>
      </div>

      {/* 3. AI Inference & Anomaly Diagnostic Cards */}
      <div className="spad-two-col-grid" style={{ marginBottom: '20px' }}>
        {/* Anomaly Evaluation Card */}
        <div className="spad-card" style={{ padding: '20px' }}>
          <div className="spad-card-header">
            <div className="spad-card-title-group">
              <span className="spad-card-section-label">AI DIAGNOSTIC TRACE</span>
              <h2 className="spad-card-title">Early Anomaly Detection</h2>
            </div>
            <span className="spad-status-pill" style={{ backgroundColor: riskColor + '20', color: riskColor, borderColor: riskColor + '60' }}>
              {aiAssessment}
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginTop: '14px' }}>
            <div className="spad-ai-evidence-card">
              <div className="spad-ai-evidence-title-row">
                <span className="spad-ai-evidence-k">Population Abnormality</span>
                <span className={`spad-ai-status-tag ${anomalies.populationAbnormality ? 'tag-warning' : 'tag-nominal'}`}>
                  {anomalies.populationAbnormality ? 'FLAGGED' : 'NOMINAL'}
                </span>
              </div>
              <p className="spad-ai-evidence-desc">
                {anomalies.populationAbnormality
                  ? 'Multivariate Mahalanobis distance exceeds Gaussian lot threshold.'
                  : 'Statistical distribution aligns tightly with active lot population baseline.'}
              </p>
            </div>

            <div className="spad-ai-evidence-card">
              <div className="spad-ai-evidence-title-row">
                <span className="spad-ai-evidence-k">Trajectory Abnormality</span>
                <span className={`spad-ai-status-tag ${anomalies.trajectoryAbnormality ? 'tag-warning' : 'tag-nominal'}`}>
                  {anomalies.trajectoryAbnormality ? 'FLAGGED' : 'NOMINAL'}
                </span>
              </div>
              <p className="spad-ai-evidence-desc">
                {anomalies.trajectoryAbnormality
                  ? 'Non-linear rate of change observed across early burn-in intervals.'
                  : 'Steady degradation gradient conforming to standard physics-of-failure curve.'}
              </p>
            </div>

            <div className="spad-ai-evidence-card">
              <div className="spad-ai-evidence-title-row">
                <span className="spad-ai-evidence-k">Future-Risk Prediction</span>
                <span className={`spad-ai-status-tag ${aiRisk > 75 ? 'tag-critical' : aiRisk > 40 ? 'tag-warning' : 'tag-nominal'}`}>
                  {typeof anomalies.futureRiskPrediction === 'string' ? anomalies.futureRiskPrediction : `${aiRisk}% Risk`}
                </span>
              </div>
              <p className="spad-ai-evidence-desc">
                {aiRisk > 75
                  ? `High probability (${aiRisk}%) of exceeding engineering limit at 168h.`
                  : aiRisk > 40
                  ? `Moderate probability (${aiRisk}%) of parameter drift toward specification boundary.`
                  : `Nominal 168h forecast prediction (${aiRisk}%) well within safe engineering margins.`}
              </p>
            </div>
          </div>
        </div>

        {/* Dynamic 168h Predictions Card */}
        <div className="spad-card" style={{ padding: '20px' }}>
          <div className="spad-card-header">
            <div className="spad-card-title-group">
              <span className="spad-card-section-label">EARLY PARAMETER FORECASTS</span>
              <h2 className="spad-card-title">168h Projected Values</h2>
            </div>
            <span className="spad-status-pill badge-status-normal">
              AI INFERENCE READY
            </span>
          </div>

          <p className="spad-card-desc">
            Parameter trajectories projected at the 168h validation gate from 0h &amp; 24h physical burn-in measurements.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
            {Object.keys(predictions).length === 0 ? (
              <span className="text-muted font-mono" style={{ fontSize: '12px' }}>
                No parameter predictions available for this record.
              </span>
            ) : (
              Object.entries(predictions).map(([predKey, predVal]) => {
                const cleanName =
                  predKey === 'iddq_168h'
                    ? 'Standby Current (Iddq @ 168h)'
                    : predKey === 'leakage_168h'
                    ? 'Leakage Current (I_leak @ 168h)'
                    : predKey === 'propDelay_168h'
                    ? 'Propagation Delay (t_pd @ 168h)'
                    : predKey;

                const unit =
                  predKey.includes('iddq')
                    ? 'mA'
                    : predKey.includes('leakage')
                    ? 'µA'
                    : predKey.includes('propDelay') || predKey.includes('Delay')
                    ? 'ns'
                    : '';

                return (
                  <div
                    key={predKey}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 14px',
                      background: 'rgba(56, 189, 248, 0.04)',
                      border: '1px solid rgba(56, 189, 248, 0.1)',
                      borderRadius: '4px',
                    }}
                  >
                    <span style={{ fontSize: '13px', color: '#f8fafc', fontWeight: '500' }}>
                      {cleanName}
                    </span>
                    <span className="font-mono" style={{ color: '#38bdf8', fontWeight: '700', fontSize: '14px' }}>
                      {typeof predVal === 'number' ? predVal.toFixed(2) : predVal} {unit}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* 4. Machine Learning Explainability — SHAP (TreeExplainer) */}
      <section className="spad-card spad-shap-section" style={{ padding: '24px', marginBottom: '20px' }}>
        <div className="spad-section-header">
          <div className="spad-section-title-wrap">
            <span className="spad-section-pill ai-pill">MACHINE LEARNING EXPLAINABILITY</span>
            <h2 className="spad-section-title">
              SHAP Feature Attribution (SHapley Additive exPlanations)
            </h2>
          </div>
          <div className="spad-shap-framework-badge">
            FRAMEWORK: <strong>{explanation.framework || 'SHAP (TreeExplainer)'}</strong>
          </div>
        </div>

        <p className="spad-shap-intro-desc">
          SHAP attribution identifies how individual measurement features mathematically contributed to the AI model's predicted 168h failure risk.
          <strong> Positive values (+)</strong> increased predicted risk, while <strong>negative values (-)</strong> reduced risk toward the baseline.
        </p>

        {/* Prediction Banner */}
        <div className="spad-shap-prediction-banner">
          <div className="spad-shap-pred-item">
            <span className="spad-pred-label">AI PREDICTED 168h RISK:</span>
            <div className="spad-pred-val-wrap">
              <span className="spad-pred-percent" style={{ color: riskColor }}>
                {aiRisk}%
              </span>
              <span className="spad-pred-category" style={{ color: riskColor, borderColor: riskColor }}>
                {riskCategory}
              </span>
            </div>
          </div>

          <div className="spad-shap-pred-item">
            <span className="spad-pred-label">LOT BASELINE EXPECTED RISK (E[f(x)]):</span>
            <span className="spad-pred-base font-mono">
              {((explanation.baseValue || 0.15) * 100).toFixed(1)}%
            </span>
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
            <span className="spad-shap-col-bars">SHAP CONTRIBUTION TO RISK SCORE</span>
            <span className="spad-shap-col-val">IMPACT</span>
          </div>

          <div className="spad-shap-features-list">
            {(explanation.features || []).map((feat, idx) => {
              const val = feat.shapValue || 0;
              const isPositive = val >= 0;
              const absVal = Math.abs(val);
              const barWidthPercent = Math.min(100, (absVal / maxAbsShap) * 88);

              return (
                <div key={idx} className="spad-shap-feature-row">
                  {/* Feature Name & Observed Value */}
                  <div className="spad-shap-feature-info">
                    <span className="spad-shap-feat-name">{feat.name}</span>
                    {feat.featureValue && (
                      <span className="spad-shap-feat-val">{feat.featureValue}</span>
                    )}
                  </div>

                  {/* Diverging Bar from Center 0.00 */}
                  <div className="spad-shap-bar-track">
                    <div className="spad-shap-zero-line" aria-hidden="true" />

                    {/* Negative Side (Left) */}
                    <div className="spad-shap-bar-half left">
                      {!isPositive && (
                        <div
                          className="spad-shap-bar-fill neg"
                          style={{ width: `${barWidthPercent}%` }}
                          title={`Negative impact: ${val.toFixed(2)} (reduces risk)`}
                        />
                      )}
                    </div>

                    {/* Positive Side (Right) */}
                    <div className="spad-shap-bar-half right">
                      {isPositive && (
                        <div
                          className="spad-shap-bar-fill pos"
                          style={{ width: `${barWidthPercent}%` }}
                          title={`Positive impact: +${val.toFixed(2)} (increases risk)`}
                        />
                      )}
                    </div>
                  </div>

                  {/* Numeric SHAP Value Badge */}
                  <div className="spad-shap-val-col">
                    <span className={`spad-shap-val-badge ${isPositive ? 'shap-pos' : 'shap-neg'}`}>
                      {isPositive ? `+${val.toFixed(2)}` : val.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="spad-shap-scale-legend">
            <span className="text-green">◀ Negative SHAP (Reduces Risk)</span>
            <span className="spad-shap-scale-center font-mono">0.00 Base</span>
            <span className="text-red">Positive SHAP (Increases Risk) ▶</span>
          </div>
        </div>

        {/* Technical Boundary Clarification */}
        <div className="spad-shap-disclaimer-note">
          <span className="font-bold text-cyan">Technical Boundary:</span> SHAP attributions describe the mathematical feature contributions to the Bayesian ML model's early-risk forecast. The deterministic screening disposition (NORMAL / SUSPECT / CRITICAL) is independently evaluated against MIL-STD engineering specification limits.
        </div>
      </section>

      {/* 5. Cohort Validation Notice */}
      <div className="spad-card" style={{ padding: '18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className="spad-pulse-indicator" aria-hidden="true" />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
              Cohort Validation Metrics (Precision / Recall / F1 / ROC-AUC)
            </div>
            <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
              Aggregate classification statistics across full lot batches require physical 168h ground-truth completion. Individual unit early inference and SHAP attributions are live from MongoDB Atlas.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
