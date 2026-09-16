import React from 'react';

function ShieldCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

export default function SystemStatus({ subsystems }) {
  return (
    <div className="spad-card spad-sys-card">
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">INFRASTRUCTURE HEALTH</span>
          <h2 className="spad-card-title">System Status</h2>
        </div>
        <div className="spad-overall-status-badge">
          <span className="spad-pulse-green-dot" aria-hidden="true"></span>
          <span>OPERATIONAL</span>
        </div>
      </div>

      <p className="spad-card-desc">
        Real-time telemetry and validation heartbeat for SPAD mission-control backend pipeline.
      </p>

      <div className="spad-subsystem-list">
        {subsystems.map((sub) => (
          <div key={sub.id} className="spad-subsystem-row">
            <div className="spad-sub-left">
              <span className="spad-sub-dot" aria-hidden="true"></span>
              <div>
                <div className="spad-sub-name">{sub.name}</div>
                <div className="spad-sub-detail">{sub.detail}</div>
              </div>
            </div>
            <div className="spad-sub-right">
              <span className="spad-sub-ping">{sub.ping}</span>
              <span className="spad-sub-status-text">{sub.status}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="spad-sys-footer">
        <ShieldCheckIcon />
        <span>MIL-STD-883 Class-S Validation Engine Running</span>
      </div>
    </div>
  );
}
