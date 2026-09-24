import React, { useState, useMemo } from 'react';

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

export default function LotAnomalyDetection({ records = [], onSelectComponent }) {
  // Extract lot cohort context from records
  const lotId = records[0]?.lotId || 'NASA-MOSFET-199C';

  // Find components with lotAnomaly data
  const componentsWithAnomaly = useMemo(() => {
    return records.map((rec) => {
      const la = rec.aiAssessment?.lotAnomaly || {};
      const params = la.parameters || {};
      // Prioritize rdson, fallback to first parameter
      const targetParam = params.rdson || Object.values(params)[0] || {};
      const score = targetParam.lotAnomalyScore ?? null;
      const zScore = targetParam.peerComparisonEvidence?.zScore ?? null;
      const peerMean = targetParam.peerComparisonEvidence?.peerMean ?? null;
      const peerStd = targetParam.peerComparisonEvidence?.peerStd ?? null;
      const peerCount = targetParam.peerComparisonEvidence?.peerCount ?? la.eligiblePeersCount ?? (records.length - 1);
      const divergenceType = targetParam.divergenceType || 'NOMINAL';
      const aiFlag = targetParam.aiFlag || (la.overallStatus === 'FLAGGED' ? 'FLAGGED' : 'NOT FLAGGED');
      const cohortQuality = la.cohortQuality || (records.length >= 3 ? 'SUFFICIENT' : 'INSUFFICIENT');

      return {
        ...rec,
        lotAnomalyScore: score,
        zScore,
        peerMean,
        peerStd,
        peerCount,
        divergenceType,
        aiFlag: aiFlag.toUpperCase(),
        cohortQuality,
        componentsAnalyzed: la.componentsAnalyzed || records.length,
        eligiblePeersCount: la.eligiblePeersCount || Math.max(0, records.length - 1),
      };
    });
  }, [records]);

  // Default selected component: First FLAGGED component (e.g. TEST-10), or first in lot
  const defaultSelectedId = useMemo(() => {
    const flagged = componentsWithAnomaly.find((c) => c.aiFlag === 'FLAGGED');
    return flagged ? flagged.id : componentsWithAnomaly[0]?.id || '';
  }, [componentsWithAnomaly]);

  const [selectedCompId, setSelectedCompId] = useState(defaultSelectedId);

  // Keep selection updated when records load
  const activeComponent = useMemo(() => {
    return componentsWithAnomaly.find((c) => c.id === selectedCompId) || componentsWithAnomaly[0] || null;
  }, [componentsWithAnomaly, selectedCompId]);

  // Aggregate Lot-Level Statistics
  const flaggedCount = useMemo(() => {
    return componentsWithAnomaly.filter((c) => c.aiFlag === 'FLAGGED').length;
  }, [componentsWithAnomaly]);

  const cohortCount = componentsWithAnomaly.length;
  const eligiblePeersCount = Math.max(0, cohortCount - 1);

  return (
    <div className="spad-card spad-lot-anomaly-card" role="region" aria-label="Lot-Level Anomaly Detection">
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">METHOD 2: INTRA-LOT PEER COMPARISON</span>
          <h2 className="spad-card-title">Lot-Level Anomaly Detection</h2>
        </div>
        <div className="spad-card-badge-static">
          <UsersIcon />
          <span>SAME-LOT PEER ISOLATION</span>
        </div>
      </div>

      <p className="spad-card-desc">
        Evaluates physical devices against eligible peers in the <strong>SAME lot ({lotId})</strong>. Detects population-relative outliers and parametric divergence independent of absolute datasheet boundaries.
      </p>

      {/* 1. Cohort Isolation & Status Metrics */}
      <div className="spad-lot-anomaly-metrics-grid">
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">ACTIVE LOT COHORT</span>
          <span className="spad-lot-metric-val font-bold text-cyan">{lotId}</span>
        </div>
        <div className="spad-lot-metric-pill">
          <span className="spad-lot-metric-label">SAME-LOT ELIGIBLE PEERS</span>
          <span className="spad-lot-metric-val">{eligiblePeersCount} Peers / {cohortCount} Units</span>
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

      {/* 2. Focused Single-Component Peer Comparison Inspection */}
      {activeComponent && (
        <div className="spad-lot-selected-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '600' }}>INSPECT TARGET:</span>
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
                aria-label="Select component to inspect intra-lot peer comparison"
              >
                {componentsWithAnomaly.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} ({c.aiFlag})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>LOT ANOMALY STATUS:</span>
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
              <span className="spad-peer-stat-label">ANOMALY SCORE</span>
              <span className="spad-peer-stat-value text-cyan">
                {activeComponent.lotAnomalyScore !== null ? activeComponent.lotAnomalyScore.toFixed(3) : '—'}
              </span>
            </div>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">Z-SCORE (σ)</span>
              <span className="spad-peer-stat-value" style={{ color: Math.abs(activeComponent.zScore || 0) > 3 ? '#ef4444' : '#38bdf8' }}>
                {activeComponent.zScore !== null ? `${activeComponent.zScore > 0 ? '+' : ''}${activeComponent.zScore.toFixed(2)} σ` : '—'}
              </span>
            </div>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">PEER MEAN (μ)</span>
              <span className="spad-peer-stat-value text-slate">
                {activeComponent.peerMean !== null ? `${activeComponent.peerMean.toFixed(3)} Ω` : '—'}
              </span>
            </div>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">PEER STD (σ)</span>
              <span className="spad-peer-stat-value text-slate">
                {activeComponent.peerStd !== null ? `${activeComponent.peerStd.toFixed(4)} Ω` : '—'}
              </span>
            </div>
            <div className="spad-peer-stat-box">
              <span className="spad-peer-stat-label">DIVERGENCE TYPE</span>
              <span className="spad-peer-stat-value" style={{ color: activeComponent.divergenceType === 'ELEVATED_OUTLIER' ? '#ef4444' : '#10b981', fontSize: '13px' }}>
                {activeComponent.divergenceType}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* 3. Real Cohort Peer Comparison Telemetry Table */}
      <div className="spad-table-container">
        <table className="spad-data-table" aria-label="Intra-Lot Anomaly Telemetry Table">
          <thead>
            <tr>
              <th>COMPONENT ID</th>
              <th>SAME-LOT PEERS</th>
              <th>ANOMALY SCORE</th>
              <th>Z-SCORE (vs PEERS)</th>
              <th>DIVERGENCE TYPE</th>
              <th>AI ANOMALY STATUS</th>
              <th>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {componentsWithAnomaly.map((item) => {
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
                  <td className="spad-td-mono text-muted">{item.peerCount} same-lot units</td>
                  <td className="spad-td-mono font-bold">
                    {item.lotAnomalyScore !== null ? item.lotAnomalyScore.toFixed(3) : '—'}
                  </td>
                  <td className="spad-td-mono" style={{ color: Math.abs(item.zScore || 0) > 3 ? '#ef4444' : '#e2e8f0' }}>
                    {item.zScore !== null ? `${item.zScore > 0 ? '+' : ''}${item.zScore.toFixed(2)} σ` : '—'}
                  </td>
                  <td className="spad-td-mono" style={{ color: item.divergenceType === 'ELEVATED_OUTLIER' ? '#ef4444' : '#94a3b8' }}>
                    {item.divergenceType}
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
