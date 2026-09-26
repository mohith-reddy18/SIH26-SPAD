import React, { useState, useEffect, useMemo } from 'react';

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

function CpuIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" />
      <line x1="9" y1="1" x2="9" y2="4" />
      <line x1="15" y1="1" x2="15" y2="4" />
      <line x1="9" y1="20" x2="9" y2="23" />
      <line x1="15" y1="20" x2="15" y2="23" />
      <line x1="20" y1="9" x2="23" y2="9" />
      <line x1="20" y1="15" x2="23" y2="15" />
      <line x1="1" y1="9" x2="4" y2="9" />
      <line x1="1" y1="15" x2="4" y2="15" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function StatusIcon({ status }) {
  if (status === 'FLAGGED') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
    );
  }
  if (status === 'NOT FLAGGED') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    );
  }
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  );
}

/**
 * Method 2 — Isolation Forest: Lot-Level Anomaly Detection
 * Displays compact lot-level summary and focused component-level anomaly inference cards.
 */
export default function LotAnomalyDetection({ records = [] }) {
  const lotId = records[0]?.lotId || 'NO ACTIVE LOT';

  // Process components with their actual backend lotAnomaly inferences
  const componentsWithAnomaly = useMemo(() => {
    return records.map((rec) => {
      const la = rec.aiAssessment?.lotAnomaly || {};
      const params = la.parameters || {};
      const targetParam = params.rdson || Object.values(params)[0] || {};
      
      let score = null;
      if (typeof targetParam?.lotAnomalyScore === 'number') {
        score = targetParam.lotAnomalyScore;
      } else if (typeof la?.score === 'number') {
        score = la.score;
      } else if (typeof rec.lotAnomalyScore === 'number') {
        score = rec.lotAnomalyScore;
      }

      let zScore = null;
      if (typeof targetParam?.peerComparisonEvidence?.zScore === 'number') {
        zScore = targetParam.peerComparisonEvidence.zScore;
      }

      let peerEvidence = null;
      if (typeof targetParam?.peerComparisonEvidence?.summaryText === 'string') {
        peerEvidence = targetParam.peerComparisonEvidence.summaryText;
      } else if (typeof targetParam?.peerComparisonEvidence === 'string') {
        peerEvidence = targetParam.peerComparisonEvidence;
      } else if (typeof rec.evidence === 'string') {
        peerEvidence = rec.evidence;
      }

      let rawFlag = targetParam?.aiFlag || la?.overallStatus || la?.status;
      let aiFlag = 'NOT_EVALUATED';
      if (rawFlag) {
        const s = String(rawFlag).toUpperCase().trim();
        if (s === 'FLAGGED') {
          aiFlag = 'FLAGGED';
        } else if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED' || s === 'ANALYZED' || s === 'NOMINAL' || s === 'NORMAL' || s === 'PASS') {
          aiFlag = 'NOT FLAGGED';
        } else if (s === 'INSUFFICIENT_COHORT' || s === 'NOT_EVALUATED') {
          aiFlag = 'NOT_EVALUATED';
        }
      } else if (rec.aiStatus) {
        const s = String(rec.aiStatus).toUpperCase().trim();
        if (s === 'FLAGGED') aiFlag = 'FLAGGED';
        else if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED') aiFlag = 'NOT FLAGGED';
      }

      if (records.length < 3 && aiFlag !== 'FLAGGED') {
        aiFlag = 'NOT_EVALUATED';
      }

      return {
        ...rec,
        id: rec.id || rec.componentId,
        componentId: rec.componentId || rec.id,
        lotAnomalyScore: score,
        zScore,
        peerEvidence,
        aiFlag,
      };
    });
  }, [records]);

  // Selected component state for focused inspection within this section only
  const [selectedCompId, setSelectedCompId] = useState(
    () => componentsWithAnomaly[0]?.id || ''
  );

  // Keep selectedCompId valid when records change
  useEffect(() => {
    if (componentsWithAnomaly.length > 0) {
      if (!selectedCompId || !componentsWithAnomaly.some((c) => c.id === selectedCompId)) {
        // Prioritize a FLAGGED component if available, else first component
        const flagged = componentsWithAnomaly.find((c) => c.aiFlag === 'FLAGGED');
        setSelectedCompId(flagged ? flagged.id : componentsWithAnomaly[0].id);
      }
    } else {
      setSelectedCompId('');
    }
  }, [componentsWithAnomaly, selectedCompId]);

  const activeComp = useMemo(() => {
    return componentsWithAnomaly.find((c) => c.id === selectedCompId) || componentsWithAnomaly[0] || null;
  }, [componentsWithAnomaly, selectedCompId]);

  const flaggedCount = useMemo(() => {
    return componentsWithAnomaly.filter((c) => c.aiFlag === 'FLAGGED').length;
  }, [componentsWithAnomaly]);

  const notFlaggedCount = useMemo(() => {
    return componentsWithAnomaly.filter((c) => c.aiFlag === 'NOT FLAGGED').length;
  }, [componentsWithAnomaly]);

  const cohortCount = componentsWithAnomaly.length;
  const eligiblePeersCount = Math.max(0, cohortCount - 1);

  const isFlagged = activeComp?.aiFlag === 'FLAGGED';
  const isNotEvaluated = activeComp?.aiFlag === 'NOT_EVALUATED';
  const hasScore = typeof activeComp?.lotAnomalyScore === 'number';

  const evidenceText = useMemo(() => {
    if (!activeComp) return 'No component records available in active lot.';
    if (activeComp.peerEvidence && typeof activeComp.peerEvidence === 'string' && activeComp.peerEvidence.trim()) {
      return activeComp.peerEvidence;
    }
    if (activeComp.zScore !== null && typeof activeComp.zScore === 'number') {
      return `Intra-lot peer divergence: z = ${activeComp.zScore > 0 ? '+' : ''}${activeComp.zScore.toFixed(2)}σ relative to active cohort baseline.`;
    }
    if (activeComp.aiFlag === 'FLAGGED') {
      return `Outlier trajectory detected across eligible same-lot peers in cohort ${lotId}.`;
    }
    if (activeComp.aiFlag === 'NOT_EVALUATED') {
      return `Cohort size is insufficient (< 3 units) for Isolation Forest peer comparison.`;
    }
    return `Measured telemetry conforms with normal degradation envelope of same-lot cohort ${lotId}.`;
  }, [activeComp, lotId]);

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

      {/* 3. Compact Lot-Level Summary & Metrics */}
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

      {/* 4. Model Architecture & Configuration Specs */}
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

      {/* 5. Selected-Component Isolation Forest Inferences (Compact Metric-Card Grid) */}
      <div
        style={{
          marginTop: '14px',
          background: 'rgba(10, 15, 29, 0.65)',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          borderRadius: '6px',
          padding: '14px',
        }}
      >
        {/* Component Selector Topbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '14px',
            paddingBottom: '12px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          }}
        >
          <span
            style={{
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '0.06em',
              color: '#94a3b8',
              fontFamily: 'var(--font-mono)',
            }}
          >
            SELECTED COMPONENT ANOMALY INFERENCE
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <label
              htmlFor="if-comp-select"
              style={{
                fontSize: '11px',
                fontWeight: '600',
                color: '#94a3b8',
                fontFamily: 'var(--font-mono)',
              }}
            >
              Component:
            </label>
            <select
              id="if-comp-select"
              value={activeComp?.id || ''}
              onChange={(e) => {
                setSelectedCompId(e.target.value);
              }}
              style={{
                background: '#0b1324',
                color: '#f8fafc',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: '4px',
                padding: '4px 10px',
                fontSize: '12px',
                fontWeight: '600',
                fontFamily: 'var(--font-mono)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              {componentsWithAnomaly.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} ({c.aiFlag})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 2x2 Metric Cards Layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '10px',
            marginBottom: '12px',
          }}
        >
          {/* Card 1: Component */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '6px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                COMPONENT
              </span>
              <CpuIcon />
            </div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
              {activeComp?.id || '—'}
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              Physical Device Telemetry
            </span>
          </div>

          {/* Card 2: AI Status */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: `1px solid ${
                isFlagged
                  ? 'rgba(239, 68, 68, 0.35)'
                  : isNotEvaluated
                  ? 'rgba(148, 163, 184, 0.25)'
                  : 'rgba(16, 185, 129, 0.35)'
              }`,
              borderRadius: '6px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                AI STATUS
              </span>
              <StatusIcon status={activeComp?.aiFlag} />
            </div>
            <div>
              <span
                style={{
                  display: 'inline-block',
                  padding: '3px 9px',
                  borderRadius: '3px',
                  fontSize: '12px',
                  fontWeight: '800',
                  letterSpacing: '0.04em',
                  fontFamily: 'var(--font-mono)',
                  background: isFlagged
                    ? 'rgba(239, 68, 68, 0.15)'
                    : isNotEvaluated
                    ? 'rgba(148, 163, 184, 0.15)'
                    : 'rgba(16, 185, 129, 0.15)',
                  color: isFlagged
                    ? '#ef4444'
                    : isNotEvaluated
                    ? '#94a3b8'
                    : '#10b981',
                  border: `1px solid ${
                    isFlagged
                      ? 'rgba(239, 68, 68, 0.4)'
                      : isNotEvaluated
                      ? 'rgba(148, 163, 184, 0.3)'
                      : 'rgba(16, 185, 129, 0.4)'
                  }`,
                }}
              >
                {activeComp?.aiFlag || 'NOT_EVALUATED'}
              </span>
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              Isolation Forest Novelty Status
            </span>
          </div>

          {/* Card 3: Active Lot */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '6px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                ACTIVE LOT
              </span>
              <LayersIcon />
            </div>
            <div style={{ fontSize: '16px', fontWeight: '800', color: '#38bdf8', fontFamily: 'var(--font-mono)' }}>
              {lotId}
            </div>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              {cohortCount} Same-Lot Peer Units
            </span>
          </div>

          {/* Card 4: Anomaly Score */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '6px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                ANOMALY SCORE
              </span>
              <ActivityIcon />
            </div>
            <div style={{ fontSize: '18px', fontWeight: '800', color: hasScore ? (isFlagged ? '#f87171' : '#38bdf8') : '#94a3b8', fontFamily: 'var(--font-mono)' }}>
              {hasScore ? activeComp.lotAnomalyScore.toFixed(4) : '—'}
            </div>
            {hasScore ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
                <div style={{ flex: 1, height: '4px', background: 'rgba(255,255,255,0.08)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.min(100, Math.max(12, Math.abs(activeComp.lotAnomalyScore) * 100))}%`,
                      background: isFlagged ? '#ef4444' : '#10b981',
                      borderRadius: '2px',
                    }}
                  />
                </div>
                <span style={{ fontSize: '9.5px', color: isFlagged ? '#f87171' : '#10b981', fontFamily: 'var(--font-mono)', fontWeight: '600' }}>
                  {isFlagged ? 'Outlier' : 'Nominal'}
                </span>
              </div>
            ) : (
              <span style={{ fontSize: '11px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                Score unavailable for this record
              </span>
            )}
          </div>
        </div>

        {/* Evidence Area */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.5)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '6px',
            padding: '12px 14px',
          }}
        >
          <span style={{ display: 'block', fontSize: '10px', fontWeight: '700', letterSpacing: '0.06em', color: '#64748b', fontFamily: 'var(--font-mono)', marginBottom: '4px' }}>
            PEER COMPARISON EVIDENCE
          </span>
          <p style={{ margin: 0, fontSize: '12px', lineHeight: '1.5', color: '#e2e8f0', fontFamily: 'var(--font-mono)' }}>
            {evidenceText}
          </p>
        </div>
      </div>
    </div>
  );
}
