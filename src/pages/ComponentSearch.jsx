import React, { useState, useEffect, useMemo } from 'react';
import ComponentDetailModal from '../components/dashboard/ComponentDetailModal';
import { mockParameterSpecs } from '../data/mockData';
import { mapScreeningRecord, getNormalizedEngineeringStatus } from '../utils/recordMapping';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

export default function ComponentSearch({ onNavigateToComponent, initialComponentId }) {
  const [components, setComponents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeParamFilter, setActiveParamFilter] = useState('ALL');
  const [selectedModalComponent, setSelectedModalComponent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch component records from backend API (source of truth)
  useEffect(() => {
    let isMounted = true;

    async function loadComponents() {
      setIsLoading(true);
      try {
        const response = await fetch(`${API_BASE_URL}/api/screening`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.data) && isMounted) {
            setComponents(result.data.map(mapScreeningRecord));
          }
        }
      } catch (err) {
        console.warn('[SPAD] Failed to fetch components list from backend:', err.message);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadComponents();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Fetch individual component detail on click or deep link
  const fetchComponentDetail = async (compItem) => {
    if (!compItem) return;
    const targetId = typeof compItem === 'string' ? compItem : compItem.id || compItem.componentId;
    if (!targetId) return;

    // Check currently loaded records first
    const existing = components.find(
      (c) => (c.id || c.componentId) === targetId
    );

    if (existing) {
      setSelectedModalComponent(existing);
      setIsModalOpen(true);
    }

    setIsLoadingDetail(true);
    setFetchError(null);

    try {
      const endpoint = `${API_BASE_URL}/api/screening/${encodeURIComponent(targetId)}`;
      const response = await fetch(endpoint);

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          const merged = mapScreeningRecord(result.data);
          setSelectedModalComponent(merged);
          setIsModalOpen(true);
        }
      } else if (response.status === 404) {
        if (!existing) {
          setFetchError(`Component "${targetId}" not found in database.`);
        }
      } else {
        setFetchError(`Backend returned status ${response.status}`);
      }
    } catch (err) {
      console.warn(`[SPAD] Backend API request failed for "${targetId}":`, err.message);
      setFetchError(err.message);
    } finally {
      setIsLoadingDetail(false);
    }
  };

  useEffect(() => {
    if (initialComponentId) {
      fetchComponentDetail(initialComponentId);
    }
  }, [initialComponentId]);

  // Filter components dynamically from live backend data
  const filteredComponents = useMemo(() => {
    return components.filter((comp) => {
      const idStr = comp.id || comp.componentId || '';
      const lotIdStr = comp.lotId || '';
      const evidenceStr = comp.evidence || '';
      const matchesSearch =
        idStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        lotIdStr.toLowerCase().includes(searchTerm.toLowerCase()) ||
        evidenceStr.toLowerCase().includes(searchTerm.toLowerCase());
      const engStatus = getNormalizedEngineeringStatus(comp);
      const matchesFilter = activeParamFilter === 'ALL' || engStatus === activeParamFilter;
      return matchesSearch && matchesFilter;
    });
  }, [components, searchTerm, activeParamFilter]);

  const handleRowClick = (item) => {
    fetchComponentDetail(item);
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
                <th>ENGINEERING STATUS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="9" className="spad-table-empty">
                    Loading components from database...
                  </td>
                </tr>
              ) : filteredComponents.length === 0 ? (
                <tr>
                  <td colSpan="9" className="spad-table-empty">
                    {searchTerm ? `No components matching "${searchTerm}".` : 'No component records found in database.'}
                  </td>
                </tr>
              ) : (
                filteredComponents.map((item) => {
                  const normalizedStatus = getNormalizedEngineeringStatus(item);
                  let statusBadgeClass = 'badge-status-normal';
                  if (normalizedStatus === 'SUSPECT') statusBadgeClass = 'badge-status-suspect';
                  if (normalizedStatus === 'CRITICAL') statusBadgeClass = 'badge-status-critical';

                  let riskClass = 'risk-low';
                  if (item.aiRisk > 40) riskClass = 'risk-med';
                  if (item.aiRisk > 75) riskClass = 'risk-high';

                  return (
                    <tr 
                      key={item.id || item.componentId} 
                      className="spad-table-row"
                      onClick={() => handleRowClick(item)}
                    >
                      <td className="spad-td-mono font-bold text-cyan">{item.id || item.componentId}</td>
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
        isOpen={Boolean(selectedModalComponent && isModalOpen)}
        onClose={() => {
          setSelectedModalComponent(null);
          setIsModalOpen(false);
        }}
        components={components}
        onSelectComponent={(comp) => fetchComponentDetail(comp)}
        parameterSpecs={mockParameterSpecs}
      />
    </div>
  );
}
