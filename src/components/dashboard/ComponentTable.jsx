import React, { useState, useMemo } from 'react';

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function ComponentTable({ records, onSelectComponent }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredRecords = useMemo(() => {
    return records.filter((rec) => {
      const matchesSearch = rec.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            rec.lotId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            rec.evidence.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || rec.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [records, searchTerm, statusFilter]);

  const counts = useMemo(() => {
    return {
      ALL: records.length,
      PASS: records.filter((r) => r.status === 'PASS').length,
      HOLD: records.filter((r) => r.status === 'HOLD').length,
      REJECT: records.filter((r) => r.status === 'REJECT').length,
    };
  }, [records]);

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
            {['ALL', 'PASS', 'HOLD', 'REJECT'].map((status) => (
              <button
                key={status}
                type="button"
                className={`spad-filter-tab-btn ${statusFilter === status ? 'active' : ''} status-${status.toLowerCase()}`}
                onClick={() => setStatusFilter(status)}
              >
                <span>{status}</span>
                <span className="spad-filter-count">{counts[status]}</span>
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
              <th>STAGE</th>
              <th>STANDBY (Iddq)</th>
              <th>LEAKAGE (I_leak)</th>
              <th>PROP DELAY (t_pd)</th>
              <th>AI RISK</th>
              <th>EVIDENCE DIAGNOSTIC</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecords.length === 0 ? (
              <tr>
                <td colSpan="9" className="spad-table-empty">
                  No component records matching criteria.
                </td>
              </tr>
            ) : (
              filteredRecords.map((item) => {
                const isPass = item.status === 'PASS';
                const isHold = item.status === 'HOLD';
                const isReject = item.status === 'REJECT';

                let statusBadgeClass = 'badge-status-pass';
                if (isHold) statusBadgeClass = 'badge-status-hold';
                if (isReject) statusBadgeClass = 'badge-status-reject';

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
                    <td className="spad-td-mono">{item.standbyCurrent}</td>
                    <td className="spad-td-mono">{item.leakageCurrent}</td>
                    <td className="spad-td-mono">{item.propagationDelay}</td>
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
                        {item.status}
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
