import React from 'react';

function CpuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="16" height="16" x="4" y="4" rx="2" />
      <rect width="6" height="6" x="9" y="9" rx="1" />
      <path d="M15 2v2" /><path d="M15 20v2" /><path d="M2 15h2" /><path d="M2 9h2" />
      <path d="M20 15h2" /><path d="M20 9h2" /><path d="M9 2v2" /><path d="M9 20v2" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function PauseCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="10" x2="10" y1="15" y2="9" />
      <line x1="14" x2="14" y1="15" y2="9" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="m15 9-6 6" />
      <path d="m9 9 6 6" />
    </svg>
  );
}

function LayersIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
      <path d="m22 12.5-8.58 3.91a2 2 0 0 1-1.66 0L2 12.5" />
      <path d="m22 17.5-8.58 3.91a2 2 0 0 1-1.66 0L2 17.5" />
    </svg>
  );
}

export default function StatCards({ summaryStats }) {
  const { totalComponents, normal, suspect, critical, passed, hold, rejected, lotsProcessed } = summaryStats;

  const normalCount = normal !== undefined ? normal : (passed || 0);
  const suspectCount = suspect !== undefined ? suspect : (hold || 0);
  const criticalCount = critical !== undefined ? critical : (rejected || 0);

  // Calculate exact percentage progress values from component metrics
  const normalPct = ((normalCount / totalComponents) * 100).toFixed(1);
  const suspectPct = ((suspectCount / totalComponents) * 100).toFixed(1);
  const criticalPct = ((criticalCount / totalComponents) * 100).toFixed(1);

  const cards = [
    {
      id: 'total',
      label: 'TOTAL COMPONENTS',
      value: totalComponents.toLocaleString(),
      subtext: 'All units under active/past screening',
      icon: CpuIcon,
      accentClass: 'stat-accent-cyan',
      hasProgress: false,
    },
    {
      id: 'normal',
      label: 'NORMAL',
      value: normalCount.toLocaleString(),
      subtext: `${normalPct}% yield qualified`,
      icon: CheckCircleIcon,
      accentClass: 'stat-accent-green',
      hasProgress: true,
      percentage: normalPct,
      barClass: 'bar-green',
    },
    {
      id: 'suspect',
      label: 'SUSPECT',
      value: suspectCount.toLocaleString(),
      subtext: `${suspectPct}% units suspect`,
      icon: PauseCircleIcon,
      accentClass: 'stat-accent-amber',
      hasProgress: true,
      percentage: suspectPct,
      barClass: 'bar-amber',
    },
    {
      id: 'critical',
      label: 'CRITICAL',
      value: criticalCount.toLocaleString(),
      subtext: `${criticalPct}% limit defect`,
      icon: XCircleIcon,
      accentClass: 'stat-accent-red',
      hasProgress: true,
      percentage: criticalPct,
      barClass: 'bar-red',
    },
    {
      id: 'lots',
      label: 'LOTS PROCESSED',
      value: lotsProcessed.toLocaleString(),
      subtext: 'Verified burn-in lot runs',
      icon: LayersIcon,
      accentClass: 'stat-accent-blue',
      hasProgress: false,
    },
  ];

  return (
    <div className="spad-stat-grid" aria-label="Screening Summary Metrics">
      {cards.map((card) => {
        const IconComponent = card.icon;
        return (
          <div key={card.id} className={`spad-stat-card ${card.accentClass}`}>
            <div className="spad-stat-card-header">
              <span className="spad-stat-label">{card.label}</span>
              <div className="spad-stat-icon-wrap">
                <IconComponent />
              </div>
            </div>

            <div className="spad-stat-value">{card.value}</div>

            {/* Percentage Indicator & Progress Bar for PASSED, HOLD, and REJECTED */}
            {card.hasProgress ? (
              <div className="spad-stat-progress-wrap">
                <span className="spad-stat-pct-label">{card.percentage}%</span>
                <div className="spad-stat-progress-track">
                  <div
                    className={`spad-stat-progress-fill ${card.barClass}`}
                    style={{ width: `${card.percentage}%` }}
                    role="progressbar"
                    aria-valuenow={card.percentage}
                    aria-valuemin="0"
                    aria-valuemax="100"
                  />
                </div>
              </div>
            ) : (
              <div className="spad-stat-progress-placeholder" aria-hidden="true" />
            )}

            <div className="spad-stat-footer">
              <span className="spad-stat-subtext">{card.subtext}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
