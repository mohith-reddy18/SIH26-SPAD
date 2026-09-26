import React, { useMemo } from 'react';

function UsersIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

/**
 * Method 2 — Isolation Forest: Lot-Level Anomaly Detection
 * Displays model summary, metrics, and configuration only.
 */
export default function LotAnomalyDetection({ records = [] }) {
  const lotId = records[0]?.lotId || 'NASA-MOSFET-199C';

  // Find components with lotAnomaly data
  const componentsWithAnomaly = useMemo(() => {
    return records.map((rec) => {
      const la = rec.aiAssessment?.lotAnomaly || {};
      const params = la.parameters || {};
      const targetParam = params.rdson || Object.values(params)[0] || {};
      const score = targetParam.lotAnomalyScore ?? null;
      const zScore = targetParam.peerComparisonEvidence?.zScore ?? null;
      const aiFlag = targetParam.aiFlag || (la.overallStatus === 'FLAGGED' ? 'FLAGGED' : 'NOT FLAGGED');

      return {
        ...rec,
        lotAnomalyScore: score,
        zScore,
        aiFlag: aiFlag.toUpperCase(),
      };
    });
  }, [records]);

  const flaggedCount = useMemo(() => {
    return componentsWithAnomaly.filter((c) => c.aiFlag === 'FLAGGED').length;
  }, [componentsWithAnomaly]);

  const notFlaggedCount = useMemo(() => {
    return componentsWithAnomaly.filter((c) => c.aiFlag === 'NOT FLAGGED' || c.aiFlag === 'NORMAL' || c.aiFlag === 'PASS').length;
  }, [componentsWithAnomaly]);

  const cohortCount = componentsWithAnomaly.length;
  const eligiblePeersCount = Math.max(0, cohortCount - 1);

  return (
    <div className="spad-card spad-lot-anomaly-card" role="region" aria-label="Isolation Forest — Anomaly Detection">
      {/* 1. Header */}
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">METHOD 2 &bull; LOT-WIDE NOVELTY DETECTION</span>
          <h2 className="spad-card-title">Isolation Forest — Anomaly Detection</h2>
        </div>
        <div className="spad-card-badge-static">
          <UsersIcon />
          <span>EARLY TRAJECTORY NOVELTY (ISOLATION FOREST)</span>
        </div>
      </div>

      {/* 2. Model Description */}
      <p className="spad-card-desc">
        <strong>Batch Lot-Level Workflow:</strong> Components are screened one-by-one first. After <em>all</em> units in the active lot are screened, Isolation Forest collects eligible peers from the <strong>SAME lot ({lotId})</strong>, evaluates the lot-level trajectory feature set, calculates individual anomaly scores, and identifies outlier components.
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
          border: '1px solid rgba(167, 139, 250, 0.2)',
          borderRadius: '6px',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 1 • SCREENED UNITS</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>1-by-1 Ingestion</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>{cohortCount} of {cohortCount} units screened</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 2 • SAME-LOT COHORT</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>Collect Same Lot</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>{eligiblePeersCount} eligible peer baselines</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 3 • FEATURE SET</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>Early Trajectory Features</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>[RDS0, ΔRDS(0→24h)] vector</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 4 • ISOLATION FOREST</span>
          <span style={{ fontSize: '12px', color: '#f8fafc', fontWeight: '600' }}>Batch Anomaly Scoring</span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>Novelty &amp; peer Z-score</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          <span style={{ fontSize: '10px', color: '#a78bfa', fontWeight: '700', letterSpacing: '0.05em' }}>STEP 5 • OUTLIER STATUS</span>
          <span style={{ fontSize: '12px', color: flaggedCount > 0 ? '#ef4444' : '#10b981', fontWeight: '700' }}>
            {flaggedCount > 0 ? `${flaggedCount} FLAGGED` : 'ALL NOT FLAGGED'}
          </span>
          <span style={{ fontSize: '10.5px', color: '#94a3b8' }}>FLAGGED / NOT FLAGGED</span>
        </div>
      </div>

      {/* 4. Model Summary & Metrics Grid */}
      <div className="spad-lot-anomaly-metrics-grid" style={{ marginBottom: '10px' }}>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">ACTIVE LOT COHORT</span>
          <span className="spad-lot-metric-val font-bold text-cyan">{lotId}</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">SAME-LOT PEERS</span>
          <span className="spad-lot-metric-val font-mono">{eligiblePeersCount} Peers / {cohortCount} Units</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">COHORT SAMPLE QUALITY</span>
          <span className="spad-lot-metric-val" style={{ color: cohortCount >= 3 ? '#10b981' : '#f59e0b' }}>
            {cohortCount >= 3 ? 'SUFFICIENT (≥ 3 Units)' : 'INSUFFICIENT (< 3 Units)'}
          </span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">INTRA-LOT OUTLIERS</span>
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
          <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>ALGORITHM TYPE</span>
          <span style={{ color: '#f8fafc', fontWeight: '600' }}>IsolationForest (n_trees=100)</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>TRAJECTORY FEATURE SET</span>
          <span style={{ color: '#a78bfa', fontWeight: '600' }}>[RDS0, ΔRDS(0→24h), rate_of_change]</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>ANOMALY THRESHOLD</span>
          <span style={{ color: '#10b981', fontWeight: '600' }}>Z-Score: |z| &gt; 3.0σ (Contamination: 0.10)</span>
        </div>
        <div>
          <span style={{ color: '#64748b', display: 'block', fontSize: '10px' }}>LOT EVALUATION RESULT</span>
          <span style={{ color: '#f8fafc', fontWeight: '600' }}>{notFlaggedCount} Nominal &bull; {flaggedCount} Outlier</span>
        </div>
      </div>
    </div>
  );
}
