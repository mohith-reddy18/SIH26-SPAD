import React from 'react';

function BellAlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

export default function RecentAlerts({ alerts = [], onAlertClick }) {
  return (
    <div className="spad-card spad-alerts-card">
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">CHRONOLOGICAL EVENT LOG</span>
          <h2 className="spad-card-title">Recent Alerts</h2>
        </div>
        <div className="spad-card-badge-static">
          <BellAlertIcon />
          <span>{alerts.length} ALERTS</span>
        </div>
      </div>

      <div className="spad-alerts-list">
        {alerts.map((alert) => {
          let severityClass = 'alert-info';
          let sevTag = 'INFO';
          if (alert.severity === 'danger') {
            severityClass = 'alert-danger';
            sevTag = 'CRITICAL';
          } else if (alert.severity === 'warning') {
            severityClass = 'alert-warning';
            sevTag = 'WARNING';
          }

          return (
            <div 
              key={alert.id} 
              className={`spad-alert-item ${severityClass}`}
              onClick={() => onAlertClick && onAlertClick(alert)}
            >
              <div className="spad-alert-top">
                <div className="spad-alert-target">
                  <span className="spad-alert-id">{alert.targetId}</span>
                  <span className={`spad-alert-sev-tag ${severityClass}`}>{sevTag}</span>
                </div>
                <span className="spad-alert-time">{alert.timeAgo}</span>
              </div>
              <p className="spad-alert-message">{alert.message}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
