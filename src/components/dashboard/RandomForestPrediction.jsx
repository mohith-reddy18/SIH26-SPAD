import React, { useState, useMemo } from 'react';
import { extractPredictedValue, extractLatestValue } from '../../utils/recordMapping';

function TrendingUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

/**
 * Random Forest — Future Prediction Component
 * Displays Method 1 ML model outputs:
 * - 0h + 24h early measurements → predicted future / 168h value
 * - Prediction evidence / results
 * - FLAGGED / NOT FLAGGED / NOT_EVALUATED status
 */
export default function RandomForestPrediction({ records = [], onSelectComponent }) {
  const lotId = records[0]?.lotId || 'NASA-MOSFET-199C';

  // Extract component prediction items
  const componentsWithPrediction = useMemo(() => {
    return records.map((rec) => {
      const predObj = rec.aiAssessment?.prediction || {};
      const params = predObj.parameters || {};
      const targetParam = params.rdson || Object.values(params)[0] || {};

      // 0h and 24h observed values
      const rawMeas = rec.measurements?.rdson || Object.values(rec.measurements || {})[0];
      let val0h = targetParam.observed?.['0h'] ?? targetParam.observed?.['0H'] ?? null;
      let val24h = targetParam.observed?.['24h'] ?? targetParam.observed?.['24H'] ?? null;

      if (val0h === null && Array.isArray(rawMeas) && rawMeas.length > 0) {
        val0h = rawMeas[0];
      }
      if (val24h === null && Array.isArray(rawMeas) && rawMeas.length > 1) {
        val24h = rawMeas[1];
      }

      // Predicted 168h value
      let predicted168h = targetParam.predicted168h ?? extractPredictedValue(rec, 'rdson');
      if (predicted168h === null && typeof rec.predictions?.rdson === 'number') {
        predicted168h = rec.predictions.rdson;
      }

      // Rate of change per hour & projected margin
      const roc = targetParam.rateOfChangePerHour ?? (val0h !== null && val24h !== null ? (val24h - val0h) / 24 : null);
      const projectedMargin = targetParam.projectedMargin ?? null;
      const futureRiskScore = targetParam.futureRiskScore ?? rec.riskScore ?? (rec.aiRisk ? rec.aiRisk / 100 : 0.08);

      // Model Flag
      let aiFlag = targetParam.aiFlag || (predObj.status === 'PREDICTED' ? rec.aiStatus : 'NOT_EVALUATED') || 'NOT_EVALUATED';
      aiFlag = aiFlag.toUpperCase();
      if (aiFlag === 'NOT_FLAGGED' || aiFlag === 'NOMINAL' || aiFlag === 'PASS') aiFlag = 'NOT FLAGGED';

      const predictionStatus = targetParam.status || predObj.status || (predicted168h !== null ? 'PREDICTED' : 'NOT_EVALUATED');

      return {
        ...rec,
        val0h,
        val24h,
        predicted168h,
        rateOfChangePerHour: roc,
        projectedMargin,
        futureRiskScore,
        aiFlag,
        predictionStatus,
        evidence: rec.evidence || (aiFlag === 'FLAGGED' ? 'Projected Limit Breach / Elevated Drift' : 'Within Learned Normal Bounds'),
      };
    });
  }, [records]);

  // Default selected component: First FLAGGED component or first component
  const defaultSelectedId = useMemo(() => {
    const flagged = componentsWithPrediction.find((c) => c.aiFlag === 'FLAGGED');
    return flagged ? flagged.id : componentsWithPrediction[0]?.id || '';
  }, [componentsWithPrediction]);

  const [selectedCompId, setSelectedCompId] = useState(defaultSelectedId);

  const activeComponent = useMemo(() => {
    return componentsWithPrediction.find((c) => c.id === selectedCompId) || componentsWithPrediction[0] || null;
  }, [componentsWithPrediction, selectedCompId]);

  const flaggedCount = useMemo(() => {
    return componentsWithPrediction.filter((c) => c.aiFlag === 'FLAGGED').length;
  }, [componentsWithPrediction]);

  const predictedCount = useMemo(() => {
    return componentsWithPrediction.filter((c) => c.predicted168h !== null).length;
  }, [componentsWithPrediction]);

  return (
    <div className="spad-card spad-lot-anomaly-card" role="region" aria-label="Random Forest — Future Prediction">
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">METHOD 1: FUTURE TRAJECTORY PREDICTION</span>
          <h2 className="spad-card-title">Random Forest — Future Prediction</h2>
        </div>
        <div className="spad-card-badge-static">
          <TrendingUpIcon />
          <span>0hr + 24hr EARLY MEASUREMENTS → 168hr FORECAST</span>
        </div>
      </div>

      <p className="spad-card-desc">
        <strong>Component-Level Prediction Workflow:</strong> Evaluates physical devices individually using <strong>0hr baseline + 24hr early measurements</strong> to predict future 168hr parameter values and trajectory degradation. Identifies projected limit breaches and abnormal drift before physical test completion.
      </p>

      {/* Component-Level Workflow Steps */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
        gap: '8px',
        margin: '12px 0 16px 0',
        padding: '12px',
        background: 'rgba(15, 23, 42, 0.5)',
        border: '1px solid rgba(56, 189, 248, 0.2)',
        borderRadius: '6px'
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 1 • BASELINE (0hr)</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>Initial Ingestion</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Baseline RDS(on) / param value</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 2 • EARLY GATE (24hr)</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>Early Observation</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Rate of change &amp; early drift</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 3 • RANDOM FOREST</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>168hr Forecast Regressor</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>LOOCV MAE 0.0528 Ω</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 4 • LIMIT TRIAGE</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>Projected Margin</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Residual vs spec upper fence</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 5 • PREDICTION STATUS</span>
          <span style={{ fontSize: '12px', color: flaggedCount > 0 ? '#ef4444' : '#10b981', fontWeight: '700' }}>
            {flaggedCount > 0 ? `${flaggedCount} FLAGGED` : 'ALL NOT FLAGGED'}
          </span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>FLAGGED / NOT FLAGGED / NOT_EVALUATED</span>
        </div>
      </div>

      {/* 1. Summary Metrics Grid */}
      <div className="spad-lot-anomaly-metrics-grid">
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">ACTIVE LOT</span>
          <span className="spad-lot-metric-val font-bold text-cyan">{lotId}</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">PREDICTIONS GENERATED</span>
          <span className="spad-lot-metric-val">{predictedCount} / {componentsWithPrediction.length} Units</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">PREDICTION HORIZON</span>
          <span className="spad-lot-metric-val font-mono text-cyan">168hr (168hr Gate)</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">RANDOM FOREST FLAGGED</span>
          <span className="spad-lot-metric-val" style={{ color: flaggedCount > 0 ? '#ef4444' : '#10b981' }}>
            {flaggedCount > 0 ? `${flaggedCount} FLAGGED` : '0 FLAGGED (NOMINAL)'}
          </span>
        </div>
      </div>

      {/* 2. Target Component Detailed Inspection */}
      {activeComponent && (
        <div className="spad-lot-selected-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>INSPECT COMPONENT:</span>
              <select
                value={activeComponent.id}
                onChange={(e) => setSelectedCompId(e.target.value)}
                style={{
                  background: '#0f172a',
                  color: '#38bdf8',
                  border: '1px solid rgba(56, 189, 248, 0.4)',
                  borderRadius: '4px',
                  padding: '5px 10px',
                  fontWeight: '700',
                  fontFamily: 'monospace',
                  cursor: 'pointer',
                }}
                aria-label="Select component to inspect future prediction"
              >
                {componentsWithPrediction.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} ({c.aiFlag})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>PREDICTION STATUS:</span>
              <span
                className={`spad-status-pill ${
                  activeComponent.aiFlag === 'FLAGGED'
                    ? 'badge-status-critical'
                    : activeComponent.aiFlag === 'NOT FLAGGED'
                    ? 'badge-status-normal'
                    : 'badge-status-suspect'
                }`}
                style={{ fontWeight: '700', letterSpacing: '0.05em' }}
              >
                {activeComponent.aiFlag}
              </span>
            </div>
          </div>

          <div className="spad-peer-evidence-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px' }}>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">0hr BASELINE</span>
              <span className="spad-peer-stat-value text-slate">
                {activeComponent.val0h !== null ? `${activeComponent.val0h.toFixed(3)} Ω` : '—'}
              </span>
            </div>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">24hr OBSERVATION</span>
              <span className="spad-peer-stat-value text-slate">
                {activeComponent.val24h !== null ? `${activeComponent.val24h.toFixed(3)} Ω` : '—'}
              </span>
            </div>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">PREDICTED 168hr VALUE</span>
              <span className="spad-peer-stat-value text-cyan">
                {activeComponent.predicted168h !== null ? `${activeComponent.predicted168h.toFixed(3)} Ω` : '—'}
              </span>
            </div>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">RATE OF CHANGE / hr</span>
              <span className="spad-peer-stat-value text-slate">
                {activeComponent.rateOfChangePerHour !== null ? `${activeComponent.rateOfChangePerHour > 0 ? '+' : ''}${activeComponent.rateOfChangePerHour.toFixed(5)} Ω/h` : '—'}
              </span>
            </div>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">FUTURE RISK SCORE</span>
              <span className="spad-peer-stat-value" style={{ color: activeComponent.futureRiskScore > 0.6 ? '#ef4444' : '#10b981' }}>
                {Math.round(activeComponent.futureRiskScore * 100)}% Risk
              </span>
            </div>
          </div>

          <div style={{ marginTop: '10px', fontSize: '12.5px', color: '#94a3b8', background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '4px', borderLeft: '3px solid #38bdf8' }}>
            <strong style={{ color: '#e2e8f0' }}>Prediction Evidence:</strong> {activeComponent.evidence}
          </div>
        </div>
      )}

      {/* 3. Real Predictions Telemetry Table */}
      <div className="spad-table-container">
        <table className="spad-data-table" aria-label="Random Forest Predictions Table">
          <thead>
            <tr>
              <th>COMPONENT ID</th>
              <th>0hr OBSERVED</th>
              <th>24hr OBSERVED</th>
              <th>PREDICTED 168hr VALUE</th>
              <th>RATE OF CHANGE</th>
              <th>FUTURE RISK</th>
              <th>PREDICTION EVIDENCE</th>
              <th>MODEL STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {componentsWithPrediction.map((item) => {
              const isSelected = activeComponent && activeComponent.id === item.id;
              const isFlagged = item.aiFlag === 'FLAGGED';
              const isNotEvaluated = item.aiFlag === 'NOT_EVALUATED';

              return (
                <tr
                  key={item.id}
                  className={`spad-table-row ${isSelected ? 'spad-table-row-selected' : ''}`}
                  onClick={() => setSelectedCompId(item.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td className="spad-td-mono font-bold text-cyan">{item.id}</td>
                  <td className="spad-td-mono text-slate">
                    {item.val0h !== null ? `${item.val0h.toFixed(3)} Ω` : '—'}
                  </td>
                  <td className="spad-td-mono text-slate">
                    {item.val24h !== null ? `${item.val24h.toFixed(3)} Ω` : '—'}
                  </td>
                  <td className="spad-td-mono font-bold text-cyan">
                    {item.predicted168h !== null ? `${item.predicted168h.toFixed(3)} Ω` : '—'}
                  </td>
                  <td className="spad-td-mono text-muted">
                    {item.rateOfChangePerHour !== null ? `${item.rateOfChangePerHour > 0 ? '+' : ''}${item.rateOfChangePerHour.toFixed(5)}` : '—'}
                  </td>
                  <td className="spad-td-mono" style={{ color: item.futureRiskScore > 0.6 ? '#ef4444' : '#10b981' }}>
                    {Math.round(item.futureRiskScore * 100)}%
                  </td>
                  <td className="spad-td-evidence">
                    <span className="spad-evidence-pill" style={{ fontSize: '11px' }}>{item.evidence}</span>
                  </td>
                  <td>
                    <span
                      className={`spad-status-pill ${
                        isFlagged
                          ? 'badge-status-critical'
                          : isNotEvaluated
                          ? 'badge-status-suspect'
                          : 'badge-status-normal'
                      }`}
                    >
                      {item.aiFlag}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="spad-btn-icon-subtle"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onSelectComponent) onSelectComponent(item);
                      }}
                      title="View component detail modal"
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(56, 189, 248, 0.3)',
                        borderRadius: '4px',
                        color: '#38bdf8',
                        padding: '3px 8px',
                        fontSize: '11px',
                        cursor: 'pointer',
                      }}
                    >
                      Trace
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
