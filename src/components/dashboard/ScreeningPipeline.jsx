import React from 'react';
import { mockScreeningContext } from '../../data/mockData';

export default function ScreeningPipeline({
  stages,
  context = mockScreeningContext,
}) {
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

      {/* 4. Dual AI Screening Pathways */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px', margin: '2px 0' }}>
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(56, 189, 248, 0.22)',
            borderRadius: '6px',
            padding: '9px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              MODEL 1
            </span>
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
          </div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
            Random Forest — Future Prediction
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.35' }}>
            0hr &amp; 24hr early observations &rarr; predicts 168hr parametric degradation &amp; limit breaches.
          </div>
        </div>

        <div
          style={{
            background: 'rgba(15, 23, 42, 0.55)',
            border: '1px solid rgba(167, 139, 250, 0.22)',
            borderRadius: '6px',
            padding: '9px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '9.5px', fontWeight: '700', color: '#a78bfa', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              MODEL 2
            </span>
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
          </div>
          <div style={{ fontSize: '12px', fontWeight: '700', color: '#f8fafc' }}>
            Isolation Forest — Lot-Level Anomaly Detection
          </div>
          <div style={{ fontSize: '10px', color: '#94a3b8', lineHeight: '1.35' }}>
            Lot-wide multivariate screening &rarr; isolates distribution outliers &amp; latent defective components.
          </div>
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
