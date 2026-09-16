import React, { useState, useMemo } from 'react';
import { mockComponents, mockParameterSpecs } from '../data/mockData';
import ComponentDetailModal from '../components/dashboard/ComponentDetailModal';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function ComponentSearch({ onNavigateToComponent, initialComponentId }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeParamFilter, setActiveParamFilter] = useState('ALL');
  const [selectedModalComponent, setSelectedModalComponent] = useState(() => {
    if (initialComponentId) {
      return mockComponents.find((c) => c.id === initialComponentId) || null;
    }
    return null;
  });

  React.useEffect(() => {
    if (initialComponentId) {
      const found = mockComponents.find((c) => c.id === initialComponentId);
      if (found) setSelectedModalComponent(found);
    }
  }, [initialComponentId]);

  const filteredComponents = useMemo(() => {
    return mockComponents.filter((comp) => {
      const matchesSearch = comp.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            comp.lotId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            comp.evidence.toLowerCase().includes(searchTerm.toLowerCase());
      const normalizedStatus = comp.status === 'PASS' ? 'NORMAL' : comp.status === 'HOLD' ? 'SUSPECT' : comp.status === 'REJECT' ? 'CRITICAL' : comp.status;
      const matchesFilter = activeParamFilter === 'ALL' || normalizedStatus === activeParamFilter || comp.status === activeParamFilter;
      return matchesSearch && matchesFilter;
    });
  }, [searchTerm, activeParamFilter]);

  const handleRowClick = (item) => {
    setSelectedModalComponent(item);
  };

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
            {['ALL', 'NORMAL', 'SUSPECT', 'CRITICAL'].map((status) => (
              <button
                key={status}
                type="button"
                className={`spad-filter-tab-btn ${activeParamFilter === status ? 'active' : ''} status-${status.toLowerCase()}`}
                onClick={() => setActiveParamFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Component Results Table */}
      <div className="spad-card" style={{ padding: '20px', marginTop: '16px' }}>
        <div className="spad-table-container">
          <table className="spad-data-table" aria-label="Component Search Results">
            <thead>
              <tr>
                <th>COMPONENT ID</th>
                <th>LOT ID</th>
                <th>PHYSICAL STAGE</th>
                <th>STANDBY (Iddq)</th>
                <th>LEAKAGE (I_leak)</th>
                <th>PROP DELAY (t_pd)</th>
                <th>ENGINEERING LIMIT STATUS</th>
                <th>AI RISK (168h FORECAST)</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredComponents.length === 0 ? (
                <tr>
                  <td colSpan="9" className="spad-table-empty">
                    No components matching "{searchTerm}".
                  </td>
                </tr>
              ) : (
                filteredComponents.map((item) => {
                  const normalizedStatus = item.status === 'PASS' ? 'NORMAL' : item.status === 'HOLD' ? 'SUSPECT' : item.status === 'REJECT' ? 'CRITICAL' : item.status;
                  let statusBadgeClass = 'badge-status-normal';
                  if (normalizedStatus === 'SUSPECT') statusBadgeClass = 'badge-status-suspect';
                  if (normalizedStatus === 'CRITICAL') statusBadgeClass = 'badge-status-critical';

                  let riskClass = 'risk-low';
                  if (item.aiRisk > 40) riskClass = 'risk-med';
                  if (item.aiRisk > 75) riskClass = 'risk-high';

                  return (
                    <tr 
                      key={item.id} 
                      className="spad-table-row"
                      onClick={() => handleRowClick(item)}
                    >
                      <td className="spad-td-mono font-bold text-cyan">{item.id}</td>
                      <td className="spad-td-mono text-muted">{item.lotId}</td>
                      <td className="spad-td-mono text-slate">{item.stage}</td>
                      <td className="spad-td-mono">{item.standbyCurrent}</td>
                      <td className="spad-td-mono">{item.leakageCurrent}</td>
                      <td className="spad-td-mono">{item.propagationDelay}</td>
                      <td>
                        <span className="spad-evidence-pill">{item.engineeringLimitStatus}</span>
                      </td>
                      <td>
                        <span className={`spad-risk-val ${riskClass}`}>{item.aiRisk}%</span>
                      </td>
                      <td>
                        <span className={`spad-status-pill ${statusBadgeClass}`}>
                          {normalizedStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detailed Component Analysis & SHAP Explainability Dialog */}
      <ComponentDetailModal
        component={selectedModalComponent}
        isOpen={Boolean(selectedModalComponent)}
        onClose={() => setSelectedModalComponent(null)}
        components={mockComponents}
        onSelectComponent={(comp) => setSelectedModalComponent(comp)}
        parameterSpecs={mockParameterSpecs}
      />
    </div>
  );
}
