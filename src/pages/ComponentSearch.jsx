import React, { useState, useEffect, useMemo, useCallback } from 'react';
import ComponentDetailModal from '../components/dashboard/ComponentDetailModal';
import { mapScreeningRecord, getNormalizedEngineeringStatus, getParameterMeta, extractLatestValue, formatStageLabel } from '../utils/recordMapping';
import { API_BASE_URL } from '../config/api';

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export default function ComponentSearch({ onNavigateToComponent, initialComponentId, selectedLotId, onSelectLot }) {
  const [components, setComponents] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeParamFilter, setActiveParamFilter] = useState('ALL');
  const [selectedModalComponent, setSelectedModalComponent] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch component records from backend API (source of truth)
  const loadComponents = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/screening`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          setComponents(result.data.map(mapScreeningRecord));
        }
      }
    } catch (err) {
      console.warn('[SPAD] Failed to fetch components list from backend:', err.message);
      setFetchError(err.message || 'Unable to connect to SPAD backend');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadComponents();
  }, [loadComponents]);

  // Safely clear selected modal component if user switches active lot to a different lot
  useEffect(() => {
    if (selectedModalComponent && selectedLotId && selectedLotId !== 'ALL') {
      const compLot = selectedModalComponent.lotId;
      if (compLot && compLot !== selectedLotId) {
        setSelectedModalComponent(null);
        setIsModalOpen(false);
      }
    }
  }, [selectedLotId, selectedModalComponent]);

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

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // Filter components dynamically from live backend data and active lot selection
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
      const matchesLot = !selectedLotId || selectedLotId === 'ALL' || comp.lotId === selectedLotId;
      return matchesSearch && matchesFilter && matchesLot;
    });
  }, [components, searchTerm, activeParamFilter, selectedLotId]);

  // Reset pagination to page 1 on filter or lot changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeParamFilter, selectedLotId]);

  const totalPages = Math.max(1, Math.ceil(filteredComponents.length / ITEMS_PER_PAGE));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const paginatedComponents = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * ITEMS_PER_PAGE;
    return filteredComponents.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredComponents, safeCurrentPage]);

  const startItem = filteredComponents.length === 0 ? 0 : (safeCurrentPage - 1) * ITEMS_PER_PAGE + 1;
  const endItem = Math.min(safeCurrentPage * ITEMS_PER_PAGE, filteredComponents.length);

  const handleRowClick = (item) => {
    fetchComponentDetail(item);
  };

  // Dynamically derive parameter columns from records telemetry
  const paramColumns = useMemo(() => {
    const keysSet = new Set();
    components.forEach((r) => {
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
  }, [components]);

  const totalCols = 6 + paramColumns.length;

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

      {/* Backend API Connection Error Banner (Requirement 8A) */}
      {fetchError && (
        <div style={{ padding: '14px 18px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong>Unable to connect to SPAD backend</strong> ({fetchError}).
          </div>
          <button
            type="button"
            onClick={loadComponents}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Responsive Search Controls Bar */}
      <div className="spad-card" style={{ padding: '18px 20px', gap: '14px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="spad-search-box" style={{ flex: '1 1 240px', width: 'auto', minHeight: '38px' }}>
            <SearchIcon />
            <input
              type="text"
              placeholder="Enter Component Serial (e.g. TEST-01, TEST-10, NASA-MOSFET-199C)..."
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

          {selectedLotId && selectedLotId !== 'ALL' && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', padding: '5px 10px', borderRadius: '6px' }}>
              <span style={{ fontSize: '11px', color: '#80a4ff', fontFamily: 'var(--font-ui, Inter, sans-serif)', fontWeight: '600' }}>
                Active Lot: <strong style={{ color: '#F5F6F8' }}>{selectedLotId}</strong>
              </span>
              {typeof onSelectLot === 'function' && (
                <button
                  type="button"
                  onClick={() => onSelectLot(null)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#94a3b8',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: '700',
                    padding: '0 2px',
                    lineHeight: 1,
                  }}
                  title="Clear lot filter to show all components"
                  aria-label="Clear active lot filter"
                >
                  ✕
                </button>
              )}
            </div>
          )}
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
                {paramColumns.map((col) => (
                  <th key={col.key}>{col.shortName.toUpperCase()} {col.unit ? `(${col.unit})` : ''}</th>
                ))}
                <th>ENGINEERING LIMIT STATUS</th>
                <th>AI RISK (168hr FORECAST)</th>
                <th>ENGINEERING STATUS</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={totalCols} className="spad-table-empty">
                    Loading components from database...
                  </td>
                </tr>
              ) : paginatedComponents.length === 0 ? (
                <tr>
                  <td colSpan={totalCols} className="spad-table-empty">
                    {searchTerm ? `No components matching "${searchTerm}".` : 'No component records found in database.'}
                  </td>
                </tr>
              ) : (
                paginatedComponents.map((item) => {
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
                      style={{ cursor: 'pointer' }}
                    >
                      <td className="spad-td-mono font-bold text-cyan">{item.id || item.componentId}</td>
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
                        <span className="spad-evidence-pill">{item.engineeringLimitStatus || 'WITHIN LIMIT'}</span>
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

        {/* Pagination Controls */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            marginTop: '14px',
            paddingTop: '12px',
            borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          }}
        >
          <span style={{ fontSize: '12px', color: '#94a3b8', fontFamily: 'var(--font-mono)' }}>
            Showing <strong>{startItem}–{endItem}</strong> of <strong>{filteredComponents.length}</strong> components
            {components.length !== filteredComponents.length && ` (${components.length} total)`}
          </span>

          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontFamily: 'var(--font-mono)',
              }}
              role="navigation"
              aria-label="Component search pagination"
            >
              <button
                type="button"
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
      />
    </div>
  );
}
