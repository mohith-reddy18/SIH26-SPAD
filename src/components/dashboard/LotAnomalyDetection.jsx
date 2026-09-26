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
 * Displays compact lot-level summary and focused component-level anomaly inferences.
 */
export default function LotAnomalyDetection({ records = [], onSelectComponent }) {
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

  const flaggedCount = useMemo(() => {
    return componentsWithAnomaly.filter((c) => c.aiFlag === 'FLAGGED').length;
  }, [componentsWithAnomaly]);

  const notFlaggedCount = useMemo(() => {
    return componentsWithAnomaly.filter((c) => c.aiFlag === 'NOT FLAGGED').length;
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

      {/* 5. Component-Level Anomaly Results (Focused Method 2 Inferences) */}
      <div className="spad-lot-anomaly-components-wrap" style={{ marginTop: '14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '0.06em', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            COMPONENT-LEVEL ANOMALY INFERENCES ({cohortCount} {cohortCount === 1 ? 'UNIT' : 'UNITS'} IN {lotId})
          </span>
          <span style={{ fontSize: '10.5px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
            Method 2 &bull; Isolation Forest Peer Evaluation
          </span>
        </div>

        {componentsWithAnomaly.length === 0 ? (
          <div style={{ padding: '16px', textAlign: 'center', background: 'rgba(0, 0, 0, 0.2)', borderRadius: '4px', color: '#64748b', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
            No component records found for active lot {lotId}.
          </div>
        ) : (
          <div style={{ overflowX: 'auto', border: '1px solid rgba(255, 255, 255, 0.06)', borderRadius: '4px', background: 'rgba(10, 15, 29, 0.6)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', fontFamily: 'var(--font-mono)', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: 'rgba(15, 23, 42, 0.8)', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#64748b', fontSize: '10px', letterSpacing: '0.05em' }}>
                  <th style={{ padding: '8px 12px' }}>COMPONENT ID</th>
                  <th style={{ padding: '8px 12px' }}>AI STATUS</th>
                  <th style={{ padding: '8px 12px' }}>ANOMALY SCORE</th>
                  <th style={{ padding: '8px 12px' }}>PEER-COMPARISON EVIDENCE</th>
                </tr>
              </thead>
              <tbody>
                {componentsWithAnomaly.map((comp) => {
                  const isFlagged = comp.aiFlag === 'FLAGGED';
                  const isNotEvaluated = comp.aiFlag === 'NOT_EVALUATED';
                  
                  return (
                    <tr
                      key={comp.id || comp.componentId}
                      style={{
                        borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                        cursor: onSelectComponent ? 'pointer' : 'default',
                        transition: 'background 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(56, 189, 248, 0.04)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => onSelectComponent && onSelectComponent(comp)}
                    >
                      <td style={{ padding: '8px 12px', color: '#f8fafc', fontWeight: '600' }}>
                        {comp.id || comp.componentId}
                      </td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 7px',
                            borderRadius: '3px',
                            fontSize: '10px',
                            fontWeight: '700',
                            letterSpacing: '0.04em',
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
                          {comp.aiFlag}
                        </span>
                      </td>
                      <td style={{ padding: '8px 12px', color: comp.lotAnomalyScore !== null ? (isFlagged ? '#f87171' : '#38bdf8') : '#64748b' }}>
                        {typeof comp.lotAnomalyScore === 'number' ? comp.lotAnomalyScore.toFixed(4) : '—'}
                      </td>
                      <td style={{ padding: '8px 12px', color: '#cbd5e1', fontSize: '11px' }}>
                        {comp.peerEvidence || (comp.zScore !== null ? `Peer Divergence: z = ${comp.zScore > 0 ? '+' : ''}${comp.zScore.toFixed(2)}σ` : (isNotEvaluated ? 'Cohort size < 3 (Not Evaluated)' : (isFlagged ? 'Outlier trajectory detected vs. same-lot cohort' : 'Nominal degradation tracking peer median')))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
