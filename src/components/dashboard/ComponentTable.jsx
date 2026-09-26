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
              <th>AI RISK (168h PREDICTED)</th>
              <th>AI EVIDENCE</th>
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

                let riskClass = 'risk-low';
                if (item.aiRisk > 40) riskClass = 'risk-med';
                if (item.aiRisk > 75) riskClass = 'risk-high';

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
                          {val !== null ? `${val.toFixed(2)} ${col.unit}` : '—'}
                        </td>
                      );
                    })}
                    <td>
                      <div className="spad-risk-cell">
                        <span className={`spad-risk-val ${riskClass}`}>{item.aiRisk}%</span>
                        <div className="spad-risk-mini-bar">
                          <div
                            className={`spad-risk-mini-fill ${riskClass}`}
                            style={{ width: `${item.aiRisk}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="spad-td-evidence">
                      <span className="spad-evidence-pill">{item.evidence}</span>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span className="spad-table-footer-stat" style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            Showing <strong>{startItem}–{endItem}</strong> of <strong>{filteredRecords.length}</strong> components
            {records.length !== filteredRecords.length && ` (filtered from ${records.length} total)`}
          </span>
          <span className="spad-table-footer-hint" style={{ fontSize: '11px', color: '#64748b' }}>
            Click row for full component telemetry trace
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
