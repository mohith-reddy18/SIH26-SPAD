import React from 'react';

export default function SystemStatus({ subsystems = [] }) {
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
    </div>
  );
}
