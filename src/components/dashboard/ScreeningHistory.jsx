import React from 'react';

function formatDateTime(dtStr) {
  if (!dtStr) return 'Active Batch';
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
    <div className="spad-card spad-history-card" style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
      {/* 1. Header */}
      <div className="spad-card-header" style={{ marginBottom: '8px' }}>
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">SCREENING RUN AUDIT</span>
          <h2 className="spad-card-title">Screening History</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="spad-lot-status-badge"
            style={{
              color: '#38bdf8',
              background: 'rgba(56, 189, 248, 0.12)',
              borderColor: 'rgba(56, 189, 248, 0.25)',
              fontSize: '9.5px',
              padding: '2px 7px',
            }}
          >
            {history.length} {history.length === 1 ? 'LOT RUN' : 'LOT RUNS'}
          </span>
          {typeof onNavigate === 'function' && (
            <button
              type="button"
              onClick={handleViewAll}
              className="spad-view-all-btn"
              style={{
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(56, 189, 248, 0.25)',
                color: '#38bdf8',
                borderRadius: '4px',
                padding: '3px 9px',
                fontSize: '10.5px',
                fontFamily: 'var(--font-mono)',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title="View comprehensive screening reports"
            >
              View All &rarr;
            </button>
          )}
        </div>
      </div>

      {/* 2. Vertically Scrollable History List */}
      <div
        className="spad-history-scroll-container"
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          paddingRight: '4px',
        }}
      >
        {isLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
            Loading screening history from MongoDB Atlas...
          </div>
        ) : history.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '12px' }}>
            No completed screening runs found in database.
          </div>
        ) : (
          history.map((item) => {
            const isSuccess = item.status === 'COMPLETED';
            const hasAnomalies = item.anomalyCount > 0;
            const isSelected = selectedLotId && selectedLotId === item.lotId;

            return (
              <div
                key={item.lotId}
                className="spad-history-item"
                onClick={() => typeof onSelectLot === 'function' && onSelectLot(item.lotId)}
                style={{
                  background: isSelected ? 'rgba(56, 189, 248, 0.12)' : 'rgba(15, 23, 42, 0.6)',
                  border: isSelected ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '6px',
                  padding: '10px 12px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px',
                  cursor: typeof onSelectLot === 'function' ? 'pointer' : 'default',
                  transition: 'border-color 0.15s ease, background 0.15s ease',
                }}
                title={typeof onSelectLot === 'function' ? `Click to view Lot ${item.lotId}` : undefined}
              >
                {/* Lot Header Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '12.5px', fontWeight: '700', color: isSelected ? '#38bdf8' : '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                      {item.lotId}
                    </span>
                    <span
                      style={{
                        fontSize: '9px',
                        fontWeight: '700',
                        fontFamily: 'var(--font-mono)',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        color: isSuccess ? '#10b981' : '#f59e0b',
                        background: isSuccess ? 'rgba(16, 185, 129, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                        border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)'}`,
                      }}
                    >
                      {item.status || 'COMPLETED'}
                    </span>
                  </div>

                  <span style={{ fontSize: '10px', color: '#64748b', fontFamily: 'var(--font-mono)' }}>
                    {formatDateTime(item.completedAt)}
                  </span>
                </div>

                {/* Metrics Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
                    gap: '6px 10px',
                    padding: '6px 8px',
                    background: 'rgba(0, 0, 0, 0.25)',
                    borderRadius: '4px',
                    border: '1px solid rgba(255, 255, 255, 0.03)',
                  }}
                >
                  <div>
                    <span style={{ fontSize: '9.5px', color: '#94a3b8', display: 'block' }}>Components</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#f8fafc', fontFamily: 'var(--font-mono)' }}>
                      {item.totalUnits} Units
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', color: '#94a3b8', display: 'block' }}>Predicted Yield</span>
                    <span style={{ fontSize: '11px', fontWeight: '700', color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      {item.yield || '100%'}
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', color: '#94a3b8', display: 'block' }}>Future Prediction</span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        fontFamily: 'var(--font-mono)',
                        color: item.hasPredictions !== false ? '#38bdf8' : '#94a3b8',
                      }}
                    >
                      {item.hasPredictions !== false ? 'Available' : 'Pending'}
                    </span>
                  </div>

                  <div>
                    <span style={{ fontSize: '9.5px', color: '#94a3b8', display: 'block' }}>Anomaly Detection</span>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: '700',
                        fontFamily: 'var(--font-mono)',
                        color: hasAnomalies ? '#fbbf24' : '#10b981',
                      }}
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
