import React, { useState, useEffect } from 'react';
import { mockScreeningContext } from '../../data/mockData';

export default function ScreeningPipeline({
  stages,
  context = mockScreeningContext,
  isLoading = false,
}) {
  const [activeModal, setActiveModal] = useState(null); // 'rf' | 'if' | null

  // Close modal on Escape key press and manage body scroll lock
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
      }
    };

    if (activeModal) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [activeModal]);

  const isComplete = context.lotStatus === 'COMPLETED' || (context.totalUnits > 0 && context.lotStatus !== 'NO ACTIVE LOT' && context.lotStatus !== 'BACKEND OFFLINE');
  const futurePredAvailable = context.hasFuturePrediction !== false && (context.screenedUnits > 0 || context.totalUnits > 0);
  const anomalyDetAvailable = context.hasAnomalyDetection !== false && (context.screenedUnits > 0 || context.totalUnits > 0);
  const finalCompletion = context.completionRate || (context.totalUnits > 0 ? '100%' : '—');
  const lotStatusText = context.lotStatus || (context.totalUnits > 0 ? 'COMPLETED' : (isLoading ? 'LOADING...' : 'NO ACTIVE LOT'));

  const unitCount = context.screenedUnits !== undefined && context.screenedUnits !== null
    ? context.screenedUnits
    : (context.totalUnits || 0);

  const flaggedCount = context.anomaliesDetected || 0;

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

      {/* 2. Compact Screening Result Summary Box */}
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

        {isLoading && !unitCount ? (
          <div style={{ padding: '16px', textAlign: 'center', color: '#38bdf8', fontSize: '11.5px', fontFamily: 'var(--font-mono)' }}>
            Loading lot screening telemetry from MongoDB Atlas...
          </div>
        ) : (
          <div className="spad-lot-status-grid">
            <div className="spad-lot-stat-item">
              <span className="spad-lot-stat-k">Lot Name</span>
              <span className="spad-lot-stat-v highlight">
                {context.lotId || 'NASA-MOSFET-199C'}
              </span>
            </div>

            <div className="spad-lot-stat-item">
              <span className="spad-lot-stat-k">Lot Screening Status</span>
              <span className="spad-lot-stat-v" style={{ color: isComplete ? '#10b981' : '#f8fafc' }}>
                {lotStatusText}
              </span>
            </div>

            <div className="spad-lot-stat-item">
              <span className="spad-lot-stat-k">Components Screened</span>
              <span className="spad-lot-stat-v">
                {unitCount > 0 ? unitCount.toLocaleString() : '—'}
              </span>
            </div>

            <div className="spad-lot-stat-item">
              <span className="spad-lot-stat-k">Predicted Yield</span>
              <span className="spad-lot-stat-v status-yield">
                {context.currentYield || '—'}
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

            <div className="spad-lot-stat-item">
              <span className="spad-lot-stat-k">Chamber</span>
              <span className="spad-lot-stat-v">
                {context.chamberId || 'NASA-CHAMBER'}
              </span>
            </div>

            <div className="spad-lot-stat-item">
              <span className="spad-lot-stat-k">Stress Temperature</span>
              <span className="spad-lot-stat-v">
                {context.temperature || '199–200°C'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Dual AI Screening Pathways (Compact Clickable Cards) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', margin: '2px 0' }}>
        {/* Model 1: Random Forest — Future Prediction */}
        <div
          className="spad-pathway-expandable-card"
          onClick={() => setActiveModal('rf')}
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveModal('rf');
            }
          }}
          aria-label="Open Random Forest Future Prediction workflow modal"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              MODEL 1 &bull; REGRESSION
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
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
                ↗
              </span>
            </div>
          </div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
            Random Forest — Future Prediction
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.35' }}>
            0hr &amp; 24hr early observations &rarr; predicts 168hr parametric degradation &amp; limit breaches.
          </div>
          <div style={{ fontSize: '9.5px', color: '#38bdf8', fontWeight: '600', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Click to view 5-step workflow</span> &rarr;
          </div>
        </div>

        {/* Model 2: Isolation Forest — Lot-Level Anomaly Detection */}
        <div
          className="spad-pathway-expandable-card"
          onClick={() => setActiveModal('if')}
          style={{
            background: 'rgba(15, 23, 42, 0.65)',
            border: '1px solid rgba(167, 139, 250, 0.25)',
            borderRadius: '6px',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setActiveModal('if');
            }
          }}
          aria-label="Open Isolation Forest Lot-Level Anomaly Detection workflow modal"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#a78bfa', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              MODEL 2 &bull; LOT ANOMALY
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
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
                ↗
              </span>
            </div>
          </div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
            Isolation Forest — Lot-Level Anomaly Detection
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.35' }}>
            Lot-wide multivariate screening &rarr; isolates distribution outliers &amp; latent defective components.
          </div>
          <div style={{ fontSize: '9.5px', color: '#a78bfa', fontWeight: '600', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>Click to view 6-step workflow</span> &rarr;
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 6. FULL-SCREEN WORKFLOW MODALS / OVERLAYS (EXPLANATORY ONLY)             */}
      {/* ========================================================================= */}

      {/* MODAL 1: RANDOM FOREST FUTURE PREDICTION WORKFLOW */}
      {activeModal === 'rf' && (
        <div
          className="spad-modal-overlay"
          onClick={() => setActiveModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-rf-title"
        >
          <div
            className="spad-modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '840px', width: '92%' }}
          >
            {/* Modal Header */}
            <div className="spad-modal-header">
              <div className="spad-modal-title-group">
                <div className="spad-modal-label-row">
                  <span className="spad-modal-lot-tag">METHOD 1 &bull; REGRESSION MODEL</span>
                  <span className="spad-modal-stage-tag">EXPLANATORY WORKFLOW</span>
                </div>
                <h2 id="modal-rf-title" className="spad-modal-title">
                  Random Forest — Future Prediction Workflow
                </h2>
              </div>
              <button
                type="button"
                className="spad-modal-close-btn"
                onClick={() => setActiveModal(null)}
                aria-label="Close Random Forest workflow dialog"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="spad-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Overview Notice */}
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.08)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  fontSize: '12.5px',
                  color: '#e2e8f0',
                  lineHeight: '1.5',
                }}
              >
                <strong style={{ color: '#38bdf8' }}>Predictive Methodology:</strong> The Random Forest workflow evaluates components individually by leveraging <strong>early stress observations</strong> to forecast long-term parameter degradation and detect projected limit breaches before extended burn-in completion.
              </div>

              {/* 7-Step Explanatory Workflow */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                  METHODOLOGY PIPELINE (7 STEPS):
                </span>

                {/* Step 1 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #38bdf8',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    1
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        1. BASELINE (0hr)
                      </span>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--font-mono)', background: 'rgba(56, 189, 248, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        OBSERVED INPUT
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      The initial 0hr physical measurements establish the baseline parameters of each component under nominal conditions prior to accelerated stress.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #38bdf8',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    2
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        2. EARLY GATE (24hr)
                      </span>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--font-mono)', background: 'rgba(56, 189, 248, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        OBSERVED INPUT
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      The 24hr measurements capture early behavior, initial drift rates, and parameter degradation trends under accelerated thermal and electrical stress.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #38bdf8',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    3
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        3. RANDOM FOREST REGRESSION
                      </span>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--font-mono)', background: 'rgba(56, 189, 248, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        PREDICTIVE MODEL
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      Random Forest uses the observed 0hr + 24hr information to model non-linear degradation paths and predict future parameter behavior.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #38bdf8',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    4
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        4. 96hr PREDICTION
                      </span>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--font-mono)', background: 'rgba(56, 189, 248, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        PREDICTED STAGE
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      The 66.7% normalized stage is represented as the 96hr predicted stage when the actual model/data output provides it. It is never an artificial linear interpolation.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #38bdf8',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    5
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        5. 168hr PREDICTION
                      </span>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--font-mono)', background: 'rgba(56, 189, 248, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        PREDICTED HORIZON
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      The 100% normalized stage is the 168hr predicted stage representing forecasted burn-in milestone values.
                    </p>
                  </div>
                </div>

                {/* Step 6 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #38bdf8',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    6
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        6. LIMIT TRIAGE
                      </span>
                      <span style={{ fontSize: '10px', color: '#38bdf8', fontFamily: 'var(--font-mono)', background: 'rgba(56, 189, 248, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        DATABASE LIMIT CHECK
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      Compares model-derived future behavior against the authoritative engineering limit from the database when applicable to assess risk of non-compliance.
                    </p>
                  </div>
                </div>

                {/* Step 7 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #10b981',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    7
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        7. PREDICTION STATUS
                      </span>
                      <span style={{ fontSize: '10px', color: '#10b981', fontFamily: 'var(--font-mono)', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 6px', borderRadius: '3px' }}>
                        AI ADVISORY
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      The prediction workflow produces the applicable AI prediction status: <strong>FLAGGED</strong> (predicted out-of-spec or limit breach) or <strong>NOT FLAGGED</strong> (predicted nominal behavior).
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary Architecture Panel */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>ALGORITHM</span>
                  <span style={{ color: '#f8fafc', fontWeight: '600' }}>Random Forest Regressor</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>INPUT FEATURES</span>
                  <span style={{ color: '#38bdf8', fontWeight: '600' }}>0hr Baseline + 24hr Early Gate [Observed]</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>TARGET HORIZON</span>
                  <span style={{ color: '#f8fafc', fontWeight: '600' }}>96hr &amp; 168hr Stages [Predicted]</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>AI DISPOSITIONS</span>
                  <span style={{ color: '#10b981', fontWeight: '600' }}>FLAGGED / NOT FLAGGED</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="spad-modal-footer">
              <span className="spad-modal-footer-hint">
                Screening methodology reference &bull; SPAD Predictive AI Engine
              </span>
              <button
                type="button"
                className="spad-modal-btn-primary"
                onClick={() => setActiveModal(null)}
              >
                Close Workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ISOLATION FOREST LOT-LEVEL ANOMALY WORKFLOW */}
      {activeModal === 'if' && (
        <div
          className="spad-modal-overlay"
          onClick={() => setActiveModal(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-if-title"
        >
          <div
            className="spad-modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '840px', width: '92%' }}
          >
            {/* Modal Header */}
            <div className="spad-modal-header">
              <div className="spad-modal-title-group">
                <div className="spad-modal-label-row">
                  <span className="spad-modal-lot-tag" style={{ color: '#a78bfa', borderColor: 'rgba(167, 139, 250, 0.4)' }}>
                    METHOD 2 &bull; LOT-WIDE NOVELTY
                  </span>
                  <span className="spad-modal-stage-tag">EXPLANATORY WORKFLOW</span>
                </div>
                <h2 id="modal-if-title" className="spad-modal-title">
                  Isolation Forest — Lot-Level Anomaly Detection Workflow
                </h2>
              </div>
              <button
                type="button"
                className="spad-modal-close-btn"
                onClick={() => setActiveModal(null)}
                aria-label="Close Isolation Forest workflow dialog"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="spad-modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Batch Lot Execution Highlight Banner */}
              <div
                style={{
                  background: 'rgba(167, 139, 250, 0.08)',
                  border: '1px solid rgba(167, 139, 250, 0.25)',
                  borderRadius: '6px',
                  padding: '12px 16px',
                  fontSize: '12.5px',
                  color: '#e2e8f0',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '9px', fontWeight: '800', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '2px 6px', borderRadius: '3px', border: '1px solid rgba(245, 158, 11, 0.4)', fontFamily: 'var(--font-mono)' }}>
                    BATCH LOT EXECUTION
                  </span>
                  <strong style={{ color: '#a78bfa' }}>Cohort-Level Novelty Methodology:</strong>
                </div>
                Isolation Forest operates at the <strong>lot level</strong>. Components are screened one-by-one first. Once the eligible same-lot screening set is available, Isolation Forest executes across the peer cohort to detect statistical and multivariate anomalies.
              </div>

              {/* 7-Step Explanatory Workflow */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: '#a78bfa', fontFamily: 'var(--font-mono)', letterSpacing: '0.05em' }}>
                  METHODOLOGY PIPELINE (7 STEPS):
                </span>

                {/* Step 1 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #a78bfa',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    1
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        1. COMPLETE INDIVIDUAL COMPONENT SCREENING
                      </span>
                      <span style={{ fontSize: '10px', color: '#a78bfa', fontFamily: 'var(--font-mono)', background: 'rgba(167, 139, 250, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        INDIVIDUAL GATES
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      Components are screened individually first through their sequential physical measurements before initiating lot-level peer analysis.
                    </p>
                  </div>
                </div>

                {/* Step 2 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #a78bfa',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    2
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        2. COLLECT ELIGIBLE SAME-LOT COMPONENTS
                      </span>
                      <span style={{ fontSize: '10px', color: '#a78bfa', fontFamily: 'var(--font-mono)', background: 'rgba(167, 139, 250, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        SAME-LOT PEERS
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      Collect eligible components belonging strictly to the same manufacturing lot to prevent cross-lot distribution contamination.
                    </p>
                  </div>
                </div>

                {/* Step 3 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #a78bfa',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    3
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        3. CHECK MINIMUM COHORT REQUIREMENT
                      </span>
                      <span style={{ fontSize: '10px', color: '#a78bfa', fontFamily: 'var(--font-mono)', background: 'rgba(167, 139, 250, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        COHORT CRITERIA
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      At least 3 comparable eligible components are required for the prototype lot-level peer comparison.
                    </p>
                  </div>
                </div>

                {/* Step 4 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #a78bfa',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    4
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        4. INSUFFICIENT COHORT DISPOSITION
                      </span>
                      <span style={{ fontSize: '10px', color: '#a78bfa', fontFamily: 'var(--font-mono)', background: 'rgba(167, 139, 250, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        SAMPLE GUARD
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      If the minimum cohort is not available (&lt; 3 components), the model produces <strong>NOT_EVALUATED</strong> to prevent spurious anomaly detections on inadequate sample sizes.
                    </p>
                  </div>
                </div>

                {/* Step 5 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #a78bfa',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    5
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        5. RUN ISOLATION FOREST ACROSS SAME-LOT PEERS
                      </span>
                      <span style={{ fontSize: '10px', color: '#a78bfa', fontFamily: 'var(--font-mono)', background: 'rgba(167, 139, 250, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        TREE PARTITIONING
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      Isolation Forest analyzes the eligible peer cohort to identify unusual trajectory and signature patterns using multidimensional tree partitioning.
                    </p>
                  </div>
                </div>

                {/* Step 6 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #a78bfa',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(167, 139, 250, 0.15)', color: '#a78bfa', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    6
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        6. CALCULATE ANOMALY SCORE &amp; EVIDENCE
                      </span>
                      <span style={{ fontSize: '10px', color: '#a78bfa', fontFamily: 'var(--font-mono)', background: 'rgba(167, 139, 250, 0.1)', padding: '1px 6px', borderRadius: '3px' }}>
                        PEER EVIDENCE
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      Calculates the continuous anomaly score and peer-comparison evidence reflecting isolation path lengths and cohort variance.
                    </p>
                  </div>
                </div>

                {/* Step 7 */}
                <div
                  style={{
                    display: 'flex',
                    gap: '12px',
                    padding: '12px 14px',
                    background: 'rgba(15, 23, 42, 0.65)',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '6px',
                    borderLeft: '4px solid #10b981',
                  }}
                >
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: '800', fontFamily: 'var(--font-mono)', fontSize: '13px', flexShrink: 0 }}>
                    7
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: '700', color: '#f8fafc' }}>
                        7. PRODUCE FINAL AI STATUS
                      </span>
                      <span style={{ fontSize: '10px', color: '#10b981', fontFamily: 'var(--font-mono)', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 6px', borderRadius: '3px' }}>
                        AI ADVISORY
                      </span>
                    </div>
                    <p style={{ fontSize: '12px', color: '#cbd5e1', margin: 0, lineHeight: '1.45' }}>
                      Produces the final AI status: <strong>FLAGGED</strong> (isolated trajectory anomaly), <strong>NOT FLAGGED</strong> (conforms with peer baseline), or <strong>NOT_EVALUATED</strong> (insufficient cohort size).
                    </p>
                  </div>
                </div>
              </div>

              {/* Summary Architecture Panel */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '8px',
                  padding: '10px 14px',
                  background: 'rgba(0, 0, 0, 0.3)',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.05)',
                  fontSize: '11px',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>ALGORITHM</span>
                  <span style={{ color: '#f8fafc', fontWeight: '600' }}>Isolation Forest</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>EVALUATION SCOPE</span>
                  <span style={{ color: '#a78bfa', fontWeight: '600' }}>Same-Lot Peer Cohort</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>MINIMUM REQUIREMENT</span>
                  <span style={{ color: '#f8fafc', fontWeight: '600' }}>Cohort Size &ge; 3 Units</span>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>AI DISPOSITIONS</span>
                  <span style={{ color: '#10b981', fontWeight: '600' }}>FLAGGED / NOT FLAGGED / NOT_EVALUATED</span>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="spad-modal-footer">
              <span className="spad-modal-footer-hint">
                Screening methodology reference &bull; SPAD Predictive AI Engine
              </span>
              <button
                type="button"
                className="spad-modal-btn-primary"
                onClick={() => setActiveModal(null)}
              >
                Close Workflow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
