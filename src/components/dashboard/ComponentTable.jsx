import React, { useState, useMemo } from 'react';
import { getNormalizedEngineeringStatus, getNormalizedAiStatus, getParameterMeta, extractLatestValue } from '../../utils/recordMapping';

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
              <th>AI RISK (168h FORECAST)</th>
              <th>AI EVIDENCE</th>
              <th>ENGINEERING STATUS</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan={totalCols} className="spad-table-empty">
                  No component records matching criteria.
                </td>
              </tr>
            ) : (
              filteredRecords.map((item) => {
                const engStatus = getNormalizedEngineeringStatus(item);
                const isNormal = engStatus === 'NORMAL';
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
                  >
                    <td className="spad-td-mono font-bold text-cyan">{item.id}</td>
                    <td className="spad-td-mono text-muted">{item.lotId}</td>
                    <td className="spad-td-mono text-slate">{item.stage}</td>
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

      <div className="spad-table-footer">
        <span className="spad-table-footer-stat">
          Showing <strong>{filteredRecords.length}</strong> of {records.length} components in active screening lot
        </span>
        <span className="spad-table-footer-hint">Click row for full component telemetry trace</span>
      </div>
    </div>
  );
}
