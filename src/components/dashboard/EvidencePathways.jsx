import React from 'react';

function ActivityIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function TrendingUpIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  );
}

function AlertTriangleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" x2="12" y1="9" y2="13" />
      <line x1="12" x2="12.01" y1="17" y2="17" />
    </svg>
  );
}

export default function EvidencePathways({ pathways }) {
  const iconMap = {
    'population-abnormality': ActivityIcon,
    'trajectory-abnormality': TrendingUpIcon,
    'future-risk-prediction': AlertTriangleIcon,
  };

  const severityBadgeClass = {
    moderate: 'badge-amber',
    high: 'badge-orange',
    critical: 'badge-red',
  };

  return (
    <div className="spad-card spad-evidence-card">
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">AI REASONING ENGINES</span>
          <h2 className="spad-card-title">Evidence Pathways</h2>
        </div>
        <div className="spad-card-badge-static">
          <span>TRI-AXIS AUDIT</span>
        </div>
      </div>

      <p className="spad-card-desc">
        Multi-modal diagnostic pathways identifying early parametric anomalies before hard limit failure.
      </p>

      <div className="spad-pathways-list">
        {pathways.map((item) => {
          const Icon = iconMap[item.id] || ActivityIcon;
          const badgeClass = severityBadgeClass[item.severity] || 'badge-amber';

          return (
            <div key={item.id} className="spad-pathway-item">
              <div className="spad-pathway-top">
                <div className="spad-pathway-header">
                  <div className="spad-pathway-icon">
                    <Icon />
                  </div>
                  <div>
                    <h3 className="spad-pathway-title">{item.title}</h3>
                    <span className="spad-pathway-tag">{item.statusTag}</span>
                  </div>
                </div>
                <div className={`spad-pathway-metric-pill ${badgeClass}`}>
                  {item.primaryMetric}
                </div>
              </div>

              <div className="spad-pathway-question">
                <span className="spad-q-prefix">Question:</span> {item.question}
              </div>

              <div className="spad-pathway-diagnostic">
                <span className="spad-diag-label">Diagnostic Logic:</span> {item.diagnostic}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
