import React, { useState, useEffect, useMemo } from 'react';
import { getNormalizedEngineeringStatus, getParameterMeta, extractLatestValue, formatStageLabel } from '../../utils/recordMapping';

const ITEMS_PER_PAGE = 10;

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function ComponentTable({ records = [], onSelectComponent }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [currentPage, setCurrentPage] = useState(1);

  // Dynamically derive parameter columns from records telemetry
  const paramColumns = useMemo(() => {
    const keysSet = new Set();
    records.forEach((r) => {
      if (r.measurements && typeof r.measurements === 'object') {
        Object.keys(r.measurements).forEach((k) => keysSet.add(k));
      }
    });
    if (keysSet.size === 0) {
      return [
        getParameterMeta('rdson'),
        getParameterMeta('delta_rdson'),
        getParameterMeta('temp'),
      ];
    }
    return Array.from(keysSet).map((k) => getParameterMeta(k));
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const matchesSearch =
        rec.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        rec.lotId.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (rec.evidence && rec.evidence.toLowerCase().includes(searchTerm.toLowerCase()));
      const engStatus = getNormalizedEngineeringStatus(rec);
      const matchesStatus = statusFilter === 'ALL' || engStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [records, searchTerm, statusFilter]);

  // Reset pagination to page 1 whenever filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  // Dynamic pagination calculation
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedRecords = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredRecords.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredRecords, safeCurrentPage]);

  const startItem = filteredRecords.length === 0 ? 0 : (safeCurrentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(safeCurrentPage * ITEMS_PER_PAGE, filteredRecords.length);

  const counts = useMemo(() => {
    return {
      ALL: records.length,
      NORMAL: records.filter((r) => getNormalizedEngineeringStatus(r) === 'NORMAL').length,
      SUSPECT: records.filter((r) => getNormalizedEngineeringStatus(r) === 'SUSPECT').length,
      CRITICAL: records.filter((r) => getNormalizedEngineeringStatus(r) === 'CRITICAL').length,
    };
  }, [records]);

  const totalCols = 6 + paramColumns.length;

  return (
    <div className="spad-card spad-table-card">
      <div className="spad-card-header spad-table-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">PARAMETRIC INSPECTION LOG</span>
          <h2 className="spad-card-title">Detailed Component View</h2>
        </div>

        {/* Filter Controls & Search */}
        <div className="spad-table-controls">
          {/* Status Tabs */}
          <div className="spad-filter-tabs" role="group" aria-label="Filter components by status">
            {['ALL', 'NORMAL', 'SUSPECT', 'CRITICAL'].map((status) => (
              <button
                key={status}
                type="button"
                className={`spad-filter-tab-btn ${statusFilter === status ? 'active' : ''} status-${status.toLowerCase()}`}
                onClick={() => setStatusFilter(status)}
              >
                <span>{status}</span>
                <span className="spad-filter-count">{counts[status] || 0}</span>
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="spad-search-box">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search ID, Lot, Evidence..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="spad-search-input"
              aria-label="Search components"
            />
          </div>
        </div>
      </div>

      {/* Dense Engineering Table Container */}
      <div className="spad-table-container">
        <table className="spad-data-table" aria-label="Component Screening Records">
          <thead>
            <tr>
              <th>COMPONENT ID</th>
              <th>LOT ID</th>
              <th>PHYSICAL STAGE</th>
              {paramColumns.map((col) => (
                <th key={col.key}>{col.shortName.toUpperCase()} {col.unit ? `(${col.unit})` : ''}</th>
              ))}
              <th>RF — 168h PREDICTION</th>
              <th>IF — LOT ANOMALY</th>
              <th>ENGINEERING STATUS</th>
            </tr>
          </thead>
          <tbody>
            {paginatedRecords.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="spad-table-empty">
                  No component records matching criteria.
                </td>
              </tr>
            ) : (
              paginatedRecords.map((item) => {
                const engStatus = getNormalizedEngineeringStatus(item);
                const isSuspect = engStatus === 'SUSPECT';
                const isCritical = engStatus === 'CRITICAL';

                let statusBadgeClass = 'badge-status-normal';
                if (isSuspect) statusBadgeClass = 'badge-status-suspect';
                if (isCritical) statusBadgeClass = 'badge-status-critical';

                // Method 1 (Random Forest Prediction) Extraction
                const m1Params = item.aiAssessment?.prediction?.parameters || {};
                const m1Param = m1Params.rdson || Object.values(m1Params)[0] || {};
                const pred168h = typeof m1Param.predicted168h === 'number'
                  ? m1Param.predicted168h
                  : (typeof item.predictions?.rdson === 'number'
                  ? item.predictions.rdson
                  : (typeof item.predictions?.rdson?.predicted168h === 'number'
                  ? item.predictions.rdson.predicted168h
                  : null));

                const rawM1Flag = m1Param.aiFlag || (item.aiAssessment?.prediction?.status === 'FLAGGED' ? 'FLAGGED' : null);
                let m1Flag = 'NOT_EVALUATED';
                if (rawM1Flag) {
                  const s = String(rawM1Flag).toUpperCase().trim();
                  if (s === 'FLAGGED') m1Flag = 'FLAGGED';
                  else if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED' || s === 'PASS' || s === 'NORMAL' || s === 'NOMINAL') m1Flag = 'NOT FLAGGED';
                } else if (typeof item.aiRisk === 'number') {
                  m1Flag = item.aiRisk > 40 ? 'FLAGGED' : 'NOT FLAGGED';
                }

                const riskPercent = typeof m1Param.futureRiskPercent === 'number'
                  ? m1Param.futureRiskPercent
                  : (typeof m1Param.futureRiskScore === 'number'
                  ? Math.round(m1Param.futureRiskScore * 100)
                  : (typeof item.aiRisk === 'number' ? item.aiRisk : null));

                // Method 2 (Isolation Forest Anomaly) Extraction
                const m2Params = item.aiAssessment?.lotAnomaly?.parameters || {};
                const m2Param = m2Params.rdson || Object.values(m2Params)[0] || {};

                let rawIfScore = null;
                if (typeof m2Param.lotAnomalyScore === 'number') {
                  rawIfScore = m2Param.lotAnomalyScore;
                } else if (typeof m2Param.peerComparisonEvidence?.rawScore === 'number') {
                  rawIfScore = m2Param.peerComparisonEvidence.rawScore;
                } else if (typeof item.aiAssessment?.lotAnomaly?.score === 'number') {
                  rawIfScore = item.aiAssessment.lotAnomaly.score;
                } else if (typeof item.anomalies?.ifScore === 'number') {
                  rawIfScore = item.anomalies.ifScore;
                } else if (typeof item.lotAnomalyScore === 'number') {
                  rawIfScore = item.lotAnomalyScore;
                }

                let m2Flag = 'NOT_EVALUATED';
                const rawM2Flag = m2Param.aiFlag ||
                                  item.aiAssessment?.lotAnomaly?.overallStatus ||
                                  (item.anomalies?.populationAbnormality !== undefined
                                    ? (item.anomalies.populationAbnormality ? 'FLAGGED' : 'NOT FLAGGED')
                                    : null);
                if (rawM2Flag) {
                  const s = String(rawM2Flag).toUpperCase().trim();
                  if (s === 'FLAGGED') m2Flag = 'FLAGGED';
                  else if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED' || s === 'ANALYZED' || s === 'NOMINAL' || s === 'NORMAL' || s === 'PASS') m2Flag = 'NOT FLAGGED';
                }

                return (
                  <tr 
                    key={item.id} 
                    className="spad-table-row"
                    onClick={() => onSelectComponent && onSelectComponent(item)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className="spad-td-mono font-bold text-cyan">{item.id}</td>
                    <td className="spad-td-mono text-muted">{item.lotId}</td>
                    <td className="spad-td-mono text-slate">{formatStageLabel(item.stage)}</td>
                    {paramColumns.map((col) => {
                      const val = extractLatestValue(item.measurements?.[col.key]);
                      return (
                        <td key={col.key} className="spad-td-mono">
                          {val !== null ? `${val.toFixed(col.unit === 'Ω' ? 3 : 2)} ${col.unit}` : '—'}
                        </td>
                      );
                    })}
                    {/* Method 1: RF — 168h Prediction */}
                    <td>
                      <div className="spad-rf-cell" style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: m1Flag === 'FLAGGED' ? 'rgba(239, 68, 68, 0.15)' : m1Flag === 'NOT FLAGGED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                              color: m1Flag === 'FLAGGED' ? '#f87171' : m1Flag === 'NOT FLAGGED' ? '#34d399' : '#94a3b8',
                              border: `1px solid ${m1Flag === 'FLAGGED' ? 'rgba(239, 68, 68, 0.3)' : m1Flag === 'NOT FLAGGED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                            }}
                          >
                            {m1Flag}
                          </span>
                          {riskPercent !== null && (
                            <span style={{ fontSize: '11px', fontWeight: '600', color: m1Flag === 'FLAGGED' ? '#f87171' : '#cbd5e1' }}>
                              {riskPercent}%
                            </span>
                          )}
                        </div>
                        {pred168h !== null && (
                          <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                            168h: <span className="text-cyan font-bold">{pred168h.toFixed(3)} Ω</span>
                          </span>
                        )}
                      </div>
                    </td>
                    {/* Method 2: IF — Lot Anomaly */}
                    <td>
                      <div className="spad-if-cell" style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontFamily: 'var(--font-mono)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span
                            style={{
                              fontSize: '10px',
                              fontWeight: '700',
                              padding: '1px 5px',
                              borderRadius: '3px',
                              background: m2Flag === 'FLAGGED' ? 'rgba(239, 68, 68, 0.15)' : m2Flag === 'NOT FLAGGED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                              color: m2Flag === 'FLAGGED' ? '#f87171' : m2Flag === 'NOT FLAGGED' ? '#34d399' : '#94a3b8',
                              border: `1px solid ${m2Flag === 'FLAGGED' ? 'rgba(239, 68, 68, 0.3)' : m2Flag === 'NOT FLAGGED' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(148, 163, 184, 0.25)'}`,
                            }}
                          >
                            {m2Flag}
                          </span>
                        </div>
                        <span style={{ fontSize: '10px', color: '#94a3b8' }}>
                          Score: <span className="font-bold text-slate">{rawIfScore !== null ? Number(rawIfScore).toFixed(4) : '—'}</span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span className={`spad-status-pill ${statusBadgeClass}`}>
                        {engStatus}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer with Pagination Controls */}
      <div
        className="spad-table-footer"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          padding: '12px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <span className="spad-table-footer-stat" style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            Showing <strong>{startItem}–{endItem}</strong> of <strong>{filteredRecords.length}</strong> components
            {records.length !== filteredRecords.length && ` (filtered from ${records.length} total)`}
          </span>
        </div>

        {totalPages > 1 && (
          <div
            className="spad-pagination-controls"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontFamily: 'var(--font-mono)',
            }}
            role="navigation"
            aria-label="Component table pagination"
          >
            <button
              type="button"
              className="spad-pagination-btn"
              disabled={safeCurrentPage <= 1}
              onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
              style={{
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: '600',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: safeCurrentPage <= 1 ? 'rgba(15, 23, 42, 0.5)' : 'rgba(30, 41, 59, 0.8)',
                color: safeCurrentPage <= 1 ? '#475569' : '#e2e8f0',
                cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              aria-label="Previous Page"
            >
              &larr; Prev
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const isActive = pageNum === safeCurrentPage;
              return (
                <button
                  key={pageNum}
                  type="button"
                  className={`spad-pagination-btn ${isActive ? 'active' : ''}`}
                  onClick={() => setCurrentPage(pageNum)}
                  style={{
                    minWidth: '28px',
                    height: '28px',
                    padding: '0 6px',
                    fontSize: '11.5px',
                    fontWeight: '700',
                    borderRadius: '4px',
                    border: `1px solid ${isActive ? '#38bdf8' : 'rgba(255, 255, 255, 0.08)'}`,
                    background: isActive ? 'rgba(56, 189, 248, 0.2)' : 'rgba(15, 23, 42, 0.6)',
                    color: isActive ? '#38bdf8' : '#94a3b8',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  aria-label={`Page ${pageNum}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  {pageNum}
                </button>
              );
            })}

            <button
              type="button"
              className="spad-pagination-btn"
              disabled={safeCurrentPage >= totalPages}
              onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
              style={{
                padding: '4px 10px',
                fontSize: '11.5px',
                fontWeight: '600',
                borderRadius: '4px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: safeCurrentPage >= totalPages ? 'rgba(15, 23, 42, 0.5)' : 'rgba(30, 41, 59, 0.8)',
                color: safeCurrentPage >= totalPages ? '#475569' : '#e2e8f0',
                cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s ease',
              }}
              aria-label="Next Page"
            >
              Next &rarr;
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
