import React from 'react';

function formatDateTime(dtStr) {
  if (!dtStr) return '';
  try {
    const d = new Date(dtStr);
    if (isNaN(d.getTime())) return String(dtStr);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(dtStr);
  }
}

export default function ScreeningHistory({
  history = [],
  isLoading = false,
  onNavigate,
  selectedLotId,
  onSelectLot,
}) {
  const handleViewAll = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('/reports');
    }
  };

  return (
    <div className="spad-card spad-history-card">
      {/* 1. Header (Compact Aerospace Style: [indicator] SCREENING HISTORY [LOT RUNS] [View All]) */}
      <div className="spad-history-panel-header">
        <div className="spad-history-title-group">
          <span className="spad-history-indicator" aria-hidden="true" />
          <h2 className="spad-history-title">SCREENING HISTORY</h2>
        </div>
        <div className="spad-history-actions">
          <span className="spad-history-count-badge">
            {history.length} {history.length === 1 ? 'LOT RUN' : 'LOT RUNS'}
          </span>
          {typeof onNavigate === 'function' && (
            <button
              type="button"
              onClick={handleViewAll}
              className="spad-view-all-btn"
              title="View comprehensive screening reports"
            >
              View All &rarr;
            </button>
          )}
        </div>
      </div>

      {/* 2. Vertically Scrollable History List */}
      <div className="spad-history-scroll-container">
        {/* All Lots Global Option */}
        <button
          type="button"
          className={`spad-history-all-lots-btn ${!selectedLotId || selectedLotId === 'ALL' ? 'is-active' : ''}`}
          onClick={() => typeof onSelectLot === 'function' && onSelectLot(null)}
          title="Show all components and data across all screening lots"
          aria-label="Select All Lots"
        >
          <div className="spad-all-lots-left">
            <div className="spad-all-lots-title-row">
              <span className="spad-all-lots-bullet">❖</span>
              <span className="spad-all-lots-title">ALL LOTS</span>
            </div>
            <span className="spad-all-lots-subtitle">Show all units across lots</span>
          </div>
          {(!selectedLotId || selectedLotId === 'ALL') ? (
            <span className="spad-history-active-tag">ACTIVE</span>
          ) : (
            <span className="spad-history-all-tag">SHOW ALL</span>
          )}
        </button>

        {isLoading ? (
          <div className="spad-history-empty">
            Loading screening history from MongoDB Atlas...
          </div>
        ) : history.length === 0 ? (
          <div className="spad-history-empty">
            No completed screening runs found in database.
          </div>
        ) : (
          history.map((item) => {
            const isSuccess = item.status === 'COMPLETED';
            const hasAnomalies = item.anomalyCount > 0;
            const isSelected = selectedLotId && selectedLotId === item.lotId;
            const formattedTime = formatDateTime(item.completedAt);

            return (
              <div
                key={item.lotId}
                className={`spad-history-item ${isSelected ? 'is-selected' : ''}`}
                onClick={() => typeof onSelectLot === 'function' && onSelectLot(item.lotId)}
                title={typeof onSelectLot === 'function' ? `Click to activate Lot ${item.lotId}` : undefined}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if ((e.key === 'Enter' || e.key === ' ') && typeof onSelectLot === 'function') {
                    e.preventDefault();
                    onSelectLot(item.lotId);
                  }
                }}
              >
                {/* Lot Header Row: ID + Active Badge on left, Status badge on right */}
                <div className="spad-history-item-header">
                  <div className="spad-history-lot-id-row">
                    <span className="spad-history-bullet">◆</span>
                    <span className="spad-history-lot-id">{item.lotId}</span>
                    {isSelected && (
                      <span className="spad-history-active-tag">ACTIVE</span>
                    )}
                  </div>
                  <span className={`spad-history-status-tag ${isSuccess ? 'tag-success' : 'tag-warning'}`}>
                    {item.status || 'COMPLETED'}
                  </span>
                </div>

                {/* Optional Timestamp */}
                {formattedTime && (
                  <div className="spad-history-timestamp">
                    {formattedTime}
                  </div>
                )}

                {/* 2-Column Compact Metric Grid */}
                <div className="spad-history-metrics-grid">
                  <div className="spad-history-metric-cell">
                    <span className="spad-history-metric-label">COMPONENTS</span>
                    <span className="spad-history-metric-value">
                      {item.totalUnits} Units
                    </span>
                  </div>

                  <div className="spad-history-metric-cell">
                    <span className="spad-history-metric-label">PREDICTED YIELD</span>
                    <span className="spad-history-metric-value val-yield">
                      {item.yield || '100%'}
                    </span>
                  </div>

                  <div className="spad-history-metric-cell">
                    <span className="spad-history-metric-label">FUTURE PREDICTION</span>
                    <span
                      className={`spad-history-metric-value ${
                        item.hasPredictions !== false ? 'val-cyan' : 'val-muted'
                      }`}
                    >
                      {item.hasPredictions !== false ? 'Available' : 'Pending'}
                    </span>
                  </div>

                  <div className="spad-history-metric-cell">
                    <span className="spad-history-metric-label">ANOMALY DETECTION</span>
                    <span
                      className={`spad-history-metric-value ${
                        hasAnomalies ? 'val-warning' : 'val-success'
                      }`}
                    >
                      {item.anomalyStatus}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
