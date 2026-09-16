import React, { useState } from 'react';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function ComponentSearch() {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeParamFilter, setActiveParamFilter] = useState('ALL');

  return (
    <div className="spad-page-container" role="main" aria-label="Component Search">
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">Component Search</h1>
          <span className="spad-page-tag">INSPECTION &bull; TRACEABILITY</span>
        </div>
        <p className="spad-page-description">
          Search and query individual components, serial numbers, and screening test history across lot runs.
        </p>
      </header>

      {/* Responsive Search Controls Bar */}
      <div className="spad-card" style={{ padding: '18px 20px', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="spad-search-box" style={{ flex: '1 1 240px', width: 'auto', minHeight: '38px' }}>
            <SearchIcon />
            <input
              type="text"
              placeholder="Enter Component Serial (e.g. C-0001, LOT-2026)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="spad-search-input"
              aria-label="Search Component Serial"
            />
          </div>

          <div className="spad-filter-tabs" style={{ flexWrap: 'wrap' }}>
            {['ALL', 'PASS', 'HOLD', 'REJECT'].map((status) => (
              <button
                key={status}
                type="button"
                className={`spad-filter-tab-btn ${activeParamFilter === status ? 'active' : ''}`}
                onClick={() => setActiveParamFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="spad-page-placeholder" style={{ marginTop: '20px' }}>
        <div className="spad-placeholder-badge">MODULE: COMPONENT SEARCH (02)</div>
        <p className="spad-placeholder-text">
          Interactive parametric query filters (Iddq, Leakage Current, Propagation Delay) and historical degradation traces will be mounted here.
        </p>
      </div>
    </div>
  );
}
