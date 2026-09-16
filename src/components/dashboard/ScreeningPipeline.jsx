import React from 'react';
import { mockPipelineStages, mockScreeningContext } from '../../data/mockData';

export default function ScreeningPipeline({
  stages = mockPipelineStages,
  context = mockScreeningContext,
}) {
  return (
    <div className="spad-card spad-pipeline-card">
      <div className="spad-card-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">BURN-IN ESS WORKFLOW</span>
          <h2 className="spad-card-title">Screening Pipeline</h2>
        </div>
        <div className="spad-progress-pill">
          <span className="spad-progress-label">LOT PROGRESS:</span>
          <span className="spad-progress-val">{context.currentProgressPercent}%</span>
        </div>
      </div>

      <p className="spad-card-desc">
        Environmental stress screening checkpoints &amp; test milestones for active lot <strong>{context.lotId}</strong>.
      </p>

      {/* Progress Bar Gauge */}
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

      {/* Horizontal Stage Timeline */}
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

      {/* Bottom Lot & Test-Level Meta Stats */}
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
