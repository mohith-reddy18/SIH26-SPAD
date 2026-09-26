import React, { useMemo } from 'react';
import { extractPredictedValue } from '../../utils/recordMapping';

function TrendingUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

/**
 * Method 1 — Random Forest: Future Prediction
 * Displays model summary, metrics, and configuration only.
 */
export default function RandomForestPrediction({ records = [] }) {
  const lotId = records[0]?.lotId || 'NO ACTIVE LOT';

  // Extract component prediction items
  const componentsWithPrediction = useMemo(() => {
    return records.map((rec) => {
      const predObj = rec.aiAssessment?.prediction || {};
      const params = predObj.parameters || {};
      const targetParam = params.rdson || Object.values(params)[0] || {};

      let predicted168h = targetParam.predicted168h ?? extractPredictedValue(rec, 'rdson');
      if (predicted168h === null && typeof rec.predictions?.rdson === 'number') {
        predicted168h = rec.predictions.rdson;
      }

      let aiFlag = targetParam.aiFlag || (predObj.status === 'PREDICTED' ? rec.aiStatus : 'NOT_EVALUATED') || 'NOT_EVALUATED';
      aiFlag = aiFlag.toUpperCase();
      if (aiFlag === 'NOT_FLAGGED' || aiFlag === 'NOMINAL' || aiFlag === 'PASS') aiFlag = 'NOT FLAGGED';

      return {
        ...rec,
        predicted168h,
        aiFlag,
      };
    });
  }, [records]);

  const flaggedCount = useMemo(() => {
    return componentsWithPrediction.filter((c) => c.aiFlag === 'FLAGGED').length;
  }, [componentsWithPrediction]);

  const notFlaggedCount = useMemo(() => {
    return componentsWithPrediction.filter((c) => c.aiFlag === 'NOT FLAGGED' || c.aiFlag === 'NORMAL').length;
  }, [componentsWithPrediction]);

  const predictedCount = useMemo(() => {
    return componentsWithPrediction.filter((c) => c.predicted168h !== null).length;
  }, [componentsWithPrediction]);

  return (
    <div className="spad-card spad-lot-anomaly-card" role="region" aria-label="Random Forest — Future Prediction">
      {/* 1. Header */}
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">METHOD 1 &bull; REGRESSION FORECAST</span>
          <h2 className="spad-card-title">Random Forest — Future Prediction</h2>
        </div>
        <div className="spad-card-badge-static">
          <TrendingUpIcon />
          <span>0hr + 24hr EARLY MEASUREMENTS → 168hr FORECAST</span>
        </div>
      </div>

      {/* 2. Model Description */}
      <p className="spad-card-desc">
        <strong>Component-Level Prediction Workflow:</strong> Evaluates physical devices individually using <strong>0hr baseline + 24hr early measurements</strong> to predict future 168hr parameter values and trajectory degradation. Identifies projected limit breaches and abnormal drift before physical test completion.
      </p>

      {/* 3. Workflow Steps Ribbon */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '8px',
          margin: '10px 0 14px 0',
          padding: '12px',
          background: 'rgba(15, 23, 42, 0.5)',
          border: '1px solid rgba(56, 189, 248, 0.2)',
          borderRadius: '6px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 1 • BASELINE (0hr)</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>Initial Ingestion</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Baseline RDS(on) value</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 2 • EARLY GATE (24hr)</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>Early Observation</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Rate of change &amp; early drift</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#38bdf8', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 3 • RANDOM FOREST</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>168hr Regressor</span>
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
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>FLAGGED / NOT FLAGGED</span>
        </div>
      </div>

      {/* 4. Model Summary & Metrics Grid */}
      <div className="spad-lot-anomaly-metrics-grid" style={{ marginBottom: '10px' }}>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">ACTIVE LOT</span>
          <span className="spad-lot-metric-val font-bold text-cyan">{lotId}</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">PREDICTIONS GENERATED</span>
          <span className="spad-lot-metric-val font-mono">{predictedCount} / {componentsWithPrediction.length} Units</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">PREDICTION HORIZON</span>
          <span className="spad-lot-metric-val font-mono text-cyan">168hr Validation Gate</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">RANDOM FOREST FLAGGED</span>
          <span className="spad-lot-metric-val" style={{ color: flaggedCount > 0 ? '#ef4444' : '#10b981' }}>
            {flaggedCount > 0 ? `${flaggedCount} FLAGGED` : '0 FLAGGED (NOMINAL)'}
          </span>
        </div>
      </div>

      {/* 5. Model Architecture & Configuration Specs */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '8px',
          padding: '10px 14px',
          background: 'rgba(0, 0, 0, 0.25)',
          borderRadius: '4px',
          border: '1px solid rgba(255, 255, 255, 0.04)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>ESTIMATOR TYPE</span>
          <span style={{ color: '#f8fafc', fontWeight: '600' }}>RandomForestRegressor (100 Trees)</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>INPUT FEATURE SPACE</span>
          <span style={{ color: '#38bdf8', fontWeight: '600' }}>[RDS(0hr), RDS(24hr), ΔRDS/Δt]</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>VALIDATION ERROR</span>
          <span style={{ color: '#10b981', fontWeight: '600' }}>LOOCV MAE: 0.0528 Ω (R²: 0.941)</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>CLASSIFICATION SUMMARY</span>
          <span style={{ color: '#f8fafc', fontWeight: '600' }}>{notFlaggedCount} Nominal &bull; {flaggedCount} Flagged</span>
        </div>
      </div>
    </div>
  );
}
