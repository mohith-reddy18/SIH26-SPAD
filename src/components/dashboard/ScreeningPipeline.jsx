import React from 'react';
import { mockPipelineStages, mockScreeningContext } from '../../data/mockData';

export default function ScreeningPipeline({
  stages = mockPipelineStages,
  context = mockScreeningContext,
}) {
  return (
    <div className="spad-card spad-pipeline-card">
      {/* 1. Card Header */}
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">PHYSICAL ESS WORKFLOW</span>
          <h2 className="spad-card-title">Screening Pipeline</h2>
        </div>
        <div className="spad-progress-pill">
          <span className="spad-progress-label">LOT PROGRESS:</span>
          <span className="spad-progress-val">{context.currentProgressPercent}%</span>
        </div>
      </div>

      {/* 2. Description */}
      <p className="spad-card-desc">
        Environmental stress screening checkpoints &amp; test milestones for active lot <strong>{context.lotId}</strong>.
      </p>

      {/* 3. Progress Bar Gauge */}
      <div className="spad-pipeline-track">
        <div 
          className="spad-pipeline-fill" 
          style={{ width: `${context.currentProgressPercent}%` }}
          role="progressbar"
          aria-valuenow={context.currentProgressPercent}
          aria-valuemin="0"
          aria-valuemax="100"
          aria-label={`Lot ${context.lotId} screening progress`}
        />
      </div>

      {/* 4. Horizontal 4-Stage Timeline */}
      <div className="spad-timeline-container">
        {stages.map((stage) => {
          const isComplete = stage.status === 'complete';
          const isCurrent = stage.status === 'current';

          let statusClass = 'stage-pending';
          let statusSymbol = '○';
          let statusText = 'Pending';

          if (isComplete) {
            statusClass = 'stage-complete';
            statusSymbol = '✓';
            statusText = 'Complete';
          } else if (isCurrent) {
            statusClass = 'stage-current';
            statusSymbol = '●';
            statusText = 'Current';
          }

          return (
            <div key={stage.id} className={`spad-timeline-node ${statusClass}`}>
              <div className="spad-node-marker">
                <span className="spad-marker-dot">{statusSymbol}</span>
              </div>
              <div className="spad-node-content">
                <div className="spad-node-time">{stage.timeLabel}</div>
                <div className="spad-node-name">{stage.name}</div>
                <div className={`spad-node-badge ${statusClass}`}>{statusText}</div>
                <div className="spad-node-sub">Yield: {stage.sampleYield}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Lot Screening Status (Meaningful Lot-Level Metrics) */}
      <div className="spad-lot-status-box">
        <div className="spad-lot-status-header">
          <span className="spad-lot-status-title">LOT SCREENING STATUS</span>
          <span className="spad-lot-status-badge">{context.lotStatus || 'SCREENING ACTIVE'}</span>
        </div>
        <div className="spad-lot-status-grid">
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Components in Lot</span>
            <span className="spad-lot-stat-v">{context.totalUnits ? context.totalUnits.toLocaleString() : '1,248'}</span>
          </div>
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Screened Units</span>
            <span className="spad-lot-stat-v">{context.screenedUnits ? context.screenedUnits.toLocaleString() : '1,248'} <span className="spad-lot-stat-sub">(100%)</span></span>
          </div>
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Current Yield</span>
            <span className="spad-lot-stat-v status-yield">{context.currentYield || '96.2%'}</span>
          </div>
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Anomalies Flagged</span>
            <span className="spad-lot-stat-v status-anom">{context.anomaliesDetected || '122'} units</span>
          </div>
          <div className="spad-lot-stat-item spad-lot-stat-span">
            <span className="spad-lot-stat-k">Next Physical Gate:</span>
            <span className="spad-lot-stat-v highlight">{context.nextGate || '168h Qualification Gate'}</span>
          </div>
        </div>
      </div>

      {/* 6. Bottom Lot & Test-Level Meta Stats */}
      <div className="spad-pipeline-meta">
        <div className="spad-meta-item">
          <span className="spad-meta-k">Active Stage:</span>
          <span className="spad-meta-v highlight">{context.currentStage} Checkpoint</span>
        </div>
        <div className="spad-meta-item">
          <span className="spad-meta-k">Active Lot:</span>
          <span className="spad-meta-v highlight">{context.lotId}</span>
        </div>
        <div className="spad-meta-item">
          <span className="spad-meta-k">Chamber:</span>
          <span className="spad-meta-v">{context.chamberId}</span>
        </div>
        <div className="spad-meta-item">
          <span className="spad-meta-k">Stress Temp:</span>
          <span className="spad-meta-v">{context.temperature}</span>
        </div>
      </div>
    </div>
  );
}
