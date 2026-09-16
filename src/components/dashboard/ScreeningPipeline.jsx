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
          <span className="spad-card-section-label">PREDICTIVE SCREENING WORKFLOW</span>
          <h2 className="spad-card-title">Screening Pipeline</h2>
        </div>
        <div className="spad-progress-pill">
          <span className="spad-progress-label">WORKFLOW PROGRESS:</span>
          <span className="spad-progress-val">{context.currentProgressPercent}%</span>
        </div>
      </div>

      {/* 2. Description */}
      <p className="spad-card-desc">
        Early predictive screening progression for active lot <strong>{context.lotId}</strong> (0h &amp; 24h measurements complete &rarr; AI 168h forecast available &rarr; 168h physical validation pending).
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

      {/* 4. Horizontal 4-Stage Timeline (Inputs -> AI Prediction -> Physical Validation) */}
      <div className="spad-timeline-container">
        {stages.map((stage) => {
          const isComplete = stage.status === 'complete';
          const isAvailable = stage.status === 'available' || stage.status === 'current';

          let statusClass = 'stage-pending';
          let statusSymbol = '○';
          let statusText = stage.badge || 'Pending';

          if (isComplete) {
            statusClass = 'stage-complete';
            statusSymbol = '✓';
            statusText = stage.badge || 'Complete';
          } else if (isAvailable) {
            statusClass = 'stage-available';
            statusSymbol = '●';
            statusText = stage.badge || 'Available';
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

      {/* 5. Lot Screening Status (Meaningful Lot-Level Predictive Metrics) */}
      <div className="spad-lot-status-box">
        <div className="spad-lot-status-header">
          <span className="spad-lot-status-title">LOT PREDICTIVE SCREENING STATUS</span>
          <span className="spad-lot-status-badge">{context.lotStatus || 'PREDICTIVE SCREENING ACTIVE'}</span>
        </div>
        <div className="spad-lot-status-grid">
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Components in Lot</span>
            <span className="spad-lot-stat-v">{context.totalUnits ? context.totalUnits.toLocaleString() : '1,248'}</span>
          </div>
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Input Units Tested</span>
            <span className="spad-lot-stat-v">{context.screenedUnits ? context.screenedUnits.toLocaleString() : '1,248'} <span className="spad-lot-stat-sub">(0h+24h)</span></span>
          </div>
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Projected 168h Yield</span>
            <span className="spad-lot-stat-v status-yield">{context.currentYield || '96.2%'}</span>
          </div>
          <div className="spad-lot-stat-item">
            <span className="spad-lot-stat-k">Predicted Anomalies</span>
            <span className="spad-lot-stat-v status-anom">{context.anomaliesDetected || '122'} units</span>
          </div>
          <div className="spad-lot-stat-item spad-lot-stat-span">
            <span className="spad-lot-stat-k">Next Physical Gate:</span>
            <span className="spad-lot-stat-v highlight">{context.nextGate || '168h Physical Validation Gate'}</span>
          </div>
        </div>
      </div>

      {/* 6. Bottom Lot & Test-Level Meta Stats */}
      <div className="spad-pipeline-meta">
        <div className="spad-meta-item">
          <span className="spad-meta-k">Active Stage:</span>
          <span className="spad-meta-v highlight">{context.currentStage}</span>
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
