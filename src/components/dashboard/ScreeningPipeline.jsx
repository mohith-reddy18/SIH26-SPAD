import React, { useState } from 'react';
import { mockScreeningContext } from '../../data/mockData';

export default function ScreeningPipeline({
  stages,
  context = mockScreeningContext,
}) {
  const [expandedRf, setExpandedRf] = useState(false);
  const [expandedIf, setExpandedIf] = useState(false);

  const isComplete = context.lotStatus === 'COMPLETED' || (context.totalUnits > 0 && context.lotStatus !== 'NO ACTIVE LOT' && context.lotStatus !== 'BACKEND OFFLINE');
  const futurePredAvailable = context.hasFuturePrediction !== false && (context.screenedUnits > 0 || context.totalUnits > 0);
  const anomalyDetAvailable = context.hasAnomalyDetection !== false && (context.screenedUnits > 0 || context.totalUnits > 0);
  const finalCompletion = context.completionRate || (context.totalUnits > 0 ? '100%' : '—');
  const lotStatusText = context.lotStatus || (context.totalUnits > 0 ? 'COMPLETED' : 'NO ACTIVE LOT');

  return (
    <div className="spad-card spad-pipeline-card">
      {/* 1. Card Header */}
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">SCREENING RESULT SUMMARY</span>
          <h2 className="spad-card-title">Screening Pipeline</h2>
        </div>
        <div
          className="spad-status-pill status-normal"
          style={{
            fontSize: '11px',
            fontWeight: '700',
            padding: '3px 9px',
            color: isComplete ? '#10b981' : '#94a3b8',
            borderColor: isComplete ? 'rgba(16, 185, 129, 0.4)' : 'rgba(148, 163, 184, 0.3)',
            backgroundColor: isComplete ? 'rgba(16, 185, 129, 0.12)' : 'rgba(148, 163, 184, 0.1)',
          }}
        >
          {lotStatusText}
        </div>
      </div>

      {/* 2. Description */}
      <p className="spad-card-desc">
        Completed predictive screening results and dual-model AI evaluations for active lot <strong>{context.lotId || 'NASA-MOSFET-199C'}</strong>.
      </p>

      {/* 3. Compact Screening Result Summary Box */}
      <div className="spad-lot-status-box" style={{ margin: '2px 0 4px 0' }}>
        <div className="spad-lot-status-header">
          <span className="spad-lot-status-title">LOT SCREENING METRICS</span>
          <span
            className="spad-lot-status-badge"
            style={{
              color: isComplete ? '#10b981' : '#38bdf8',
              background: isComplete ? 'rgba(16, 185, 129, 0.12)' : 'rgba(56, 189, 248, 0.12)',
              borderColor: isComplete ? 'rgba(16, 185, 129, 0.3)' : 'rgba(56, 189, 248, 0.3)',
            }}
          >
            {lotStatusText}
          </span>
        </div>

        <div className="spad-lot-status-grid">
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Lot Screening Status</span>
            <span className="spad-lot-stat-v" style={{ color: isComplete ? '#10b981' : '#f8fafc' }}>
              {lotStatusText}
            </span>
          </div>

          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Components Screened</span>
            <span className="spad-lot-stat-v">
              {context.screenedUnits !== undefined && context.screenedUnits !== null
                ? context.screenedUnits.toLocaleString()
                : (context.totalUnits !== undefined && context.totalUnits !== null ? context.totalUnits.toLocaleString() : '—')}
            </span>
          </div>

          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Future Prediction</span>
            <span
              className="spad-lot-stat-v"
              style={{ color: futurePredAvailable ? '#38bdf8' : '#94a3b8' }}
            >
              {futurePredAvailable ? 'Available' : 'Not Available'}
            </span>
          </div>

          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Anomaly Detection</span>
            <span
              className="spad-lot-stat-v"
              style={{ color: anomalyDetAvailable ? '#a78bfa' : '#94a3b8' }}
            >
              {anomalyDetAvailable ? 'Available' : 'Not Available'}
            </span>
          </div>

          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Predicted Anomalies</span>
            <span className="spad-lot-stat-v status-anom">
              {context.anomaliesDetected !== undefined && context.anomaliesDetected !== null
                ? `${context.anomaliesDetected} units`
                : '—'}
            </span>
          </div>

          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Final Screening Completion</span>
            <span className="spad-lot-stat-v highlight">
              {finalCompletion}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Dual AI Screening Pathways (Clickable / Expandable Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', margin: '2px 0' }}>
        {/* Model 1: Random Forest — Future Prediction */}
        <div
          className="spad-pathway-expandable-card"
          onClick={() => setExpandedRf((prev) => !prev)}
          style={{
            background: expandedRf ? 'rgba(15, 23, 42, 0.85)' : 'rgba(15, 23, 42, 0.55)',
            border: `1px solid ${expandedRf ? '#38bdf8' : 'rgba(56, 189, 248, 0.25)'}`,
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpandedRf((prev) => !prev);
            }
          }}
          aria-expanded={expandedRf}
          aria-label="Toggle Random Forest Future Prediction workflow details"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              MODEL 1 &bull; REGRESSION
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '8.5px',
                  fontWeight: '700',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: futurePredAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                  color: futurePredAvailable ? '#10b981' : '#94a3b8',
                  border: `1px solid ${futurePredAvailable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                }}
              >
                {futurePredAvailable ? 'AVAILABLE' : 'OFFLINE'}
              </span>
              <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>
                {expandedRf ? '▲ Collapse' : '▼ Workflow'}
              </span>
            </div>
          </div>

          <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
            Random Forest — Future Prediction
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.35' }}>
            0hr &amp; 24hr early observations &rarr; predicts 168hr parametric degradation &amp; limit breaches.
          </div>

          {/* Expanded Random Forest Workflow Details */}
          {expandedRf && (
            <div
              style={{
                marginTop: '6px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(56, 189, 248, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>
                RANDOM FOREST INFERENCE WORKFLOW:
              </span>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '10.5px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #38bdf8' }}>
                  <strong style={{ color: '#38bdf8' }}>STEP 1 — BASELINE (0hr):</strong> Initial Ingestion
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    0hr baseline physical measurements ingested from initial pulse window.
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #38bdf8' }}>
                  <strong style={{ color: '#38bdf8' }}>STEP 2 — EARLY GATE (24hr):</strong> Early Observation
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Rate of change &amp; parameter drift gradient calculated across first 24hr thermal stress.
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #38bdf8' }}>
                  <strong style={{ color: '#38bdf8' }}>STEP 3 — RANDOM FOREST:</strong> 168hr Future Prediction
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Multi-tree regression predicts 168hr parameter drift (LOOCV MAE: 0.0528 Ω).
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #38bdf8' }}>
                  <strong style={{ color: '#38bdf8' }}>STEP 4 — LIMIT TRIAGE:</strong> Projected Margin
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Compares projected 168hr values against engineering spec upper limits (0.165 Ω fence).
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #10b981' }}>
                  <strong style={{ color: '#10b981' }}>STEP 5 — PREDICTION STATUS:</strong> FLAGGED / NOT FLAGGED
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Devices with projected limit breaches are FLAGGED; nominal units are NOT FLAGGED.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Model 2: Isolation Forest — Lot-Level Anomaly Detection */}
        <div
          className="spad-pathway-expandable-card"
          onClick={() => setExpandedIf((prev) => !prev)}
          style={{
            background: expandedIf ? 'rgba(15, 23, 42, 0.85)' : 'rgba(15, 23, 42, 0.55)',
            border: `1px solid ${expandedIf ? '#a78bfa' : 'rgba(167, 139, 250, 0.25)'}`,
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '5px',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setExpandedIf((prev) => !prev);
            }
          }}
          aria-expanded={expandedIf}
          aria-label="Toggle Isolation Forest Lot-Level Anomaly Detection workflow details"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#a78bfa', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              MODEL 2 &bull; LOT ANOMALY
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  fontSize: '8.5px',
                  fontWeight: '700',
                  fontFamily: 'var(--font-mono)',
                  padding: '1px 5px',
                  borderRadius: '3px',
                  background: anomalyDetAvailable ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                  color: anomalyDetAvailable ? '#10b981' : '#94a3b8',
                  border: `1px solid ${anomalyDetAvailable ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.2)'}`,
                }}
              >
                {anomalyDetAvailable ? 'AVAILABLE' : 'OFFLINE'}
              </span>
              <span style={{ fontSize: '10px', color: '#a78bfa', fontFamily: 'var(--font-mono)', fontWeight: '700' }}>
                {expandedIf ? '▲ Collapse' : '▼ Workflow'}
              </span>
            </div>
          </div>

          <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
            Isolation Forest — Lot-Level Anomaly Detection
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.35' }}>
            Lot-wide multivariate screening &rarr; isolates distribution outliers &amp; latent defective components.
          </div>

          {/* Expanded Isolation Forest Workflow Details */}
          {expandedIf && (
            <div
              style={{
                marginTop: '6px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(167, 139, 250, 0.2)',
                display: 'flex',
                flexDirection: 'column',
                gap: '6px',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: '700', fontFamily: 'var(--font-mono)' }}>
                  LOT-LEVEL ANOMALY WORKFLOW:
                </span>
                <span
                  style={{
                    fontSize: '8.5px',
                    color: '#f59e0b',
                    background: 'rgba(245, 158, 11, 0.12)',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    border: '1px solid rgba(245, 158, 11, 0.3)',
                    fontWeight: '700',
                  }}
                >
                  BATCH LOT EXECUTION
                </span>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '10.5px' }}>
                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #a78bfa' }}>
                  <strong style={{ color: '#a78bfa' }}>1. Complete individual screening:</strong> Components are screened 1-by-1 first
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Raw measurements for all lot units collected before evaluating intra-lot anomaly scores.
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #a78bfa' }}>
                  <strong style={{ color: '#a78bfa' }}>2. Collect eligible same-lot components:</strong> Same-Lot Cohort
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Isolates peer devices exclusively within active lot ({context.lotId || 'NASA-MOSFET-199C'}).
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #a78bfa' }}>
                  <strong style={{ color: '#a78bfa' }}>3. Check minimum cohort requirement:</strong> Statistical Baseline
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Verifies sample quality and sufficient peer count (≥ 3 units for valid isolation trees).
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #a78bfa' }}>
                  <strong style={{ color: '#a78bfa' }}>4. Run Isolation Forest on peers:</strong> Feature Space
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Evaluates [RDS0, ΔRDS(0→24h)] early trajectory vectors across all peers simultaneously.
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #a78bfa' }}>
                  <strong style={{ color: '#a78bfa' }}>5. Calculate anomaly scores &amp; Z-scores:</strong> Outlier Scoring
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Computes continuous anomaly novelty scores and peer comparison Z-scores (|z| &gt; 3.0σ).
                  </div>
                </div>

                <div style={{ background: 'rgba(0, 0, 0, 0.3)', padding: '5px 8px', borderRadius: '4px', borderLeft: '2px solid #10b981' }}>
                  <strong style={{ color: '#10b981' }}>6. Produce FLAGGED / NOT FLAGGED:</strong> Final Lot Outliers
                  <div style={{ color: '#94a3b8', fontSize: '9.5px', marginTop: '1px' }}>
                    Identifies true multivariate lot outliers after the full cohort is available.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 5. Bottom Lot & Test Meta Stats */}
      <div className="spad-pipeline-meta">
        <div className="spad-meta-item">
          <span className="spad-meta-k">Active Lot:</span>
          <span className="spad-meta-v highlight">{context.lotId || 'NASA-MOSFET-199C'}</span>
        </div>
        <div className="spad-meta-item">
          <span className="spad-meta-k">Predicted Yield:</span>
          <span className="spad-meta-v status-yield">{context.currentYield || '—'}</span>
        </div>
        <div className="spad-meta-item">
          <span className="spad-meta-k">Chamber:</span>
          <span className="spad-meta-v">{context.chamberId || 'NASA-CHAMBER'}</span>
        </div>
        <div className="spad-meta-item">
          <span className="spad-meta-k">Stress Temp:</span>
          <span className="spad-meta-v">{context.temperature || '199–200°C'}</span>
        </div>
      </div>
    </div>
  );
}
