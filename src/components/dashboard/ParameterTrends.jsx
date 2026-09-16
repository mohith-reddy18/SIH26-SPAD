import React, { useState } from 'react';
import { mockParameterSpecs, mockComponents, mockScreeningContext } from '../../data/mockData';

// Helper for semantic status colors
function getStatusColor(status) {
  if (status === 'PASS') return '#10b981';
  if (status === 'HOLD') return '#f59e0b';
  if (status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

export default function ParameterTrends({
  parameterSpecs = mockParameterSpecs,
  components = mockComponents,
  context = mockScreeningContext,
}) {
  // 1. Interactive States
  const [viewMode, setViewMode] = useState('component'); // 'component' | 'lot'
  const [selectedComponentId, setSelectedComponentId] = useState('C-0003');
  const [selectedParamKey, setSelectedParamKey] = useState('standby-current');
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // 2. Active Parameter Specification
  const activeSpec = parameterSpecs[selectedParamKey] || parameterSpecs['standby-current'];

  const parameterOptions = [
    { key: 'standby-current', label: 'Standby Current (Iddq)', unit: 'mA' },
    { key: 'leakage-current', label: 'Leakage Current (I_leak)', unit: 'µA' },
    { key: 'propagation-delay', label: 'Propagation Delay (t_pd)', unit: 'ns' },
  ];

  // 3. Selected Component & Lot Components
  const currentLotId = context?.lotId || 'LOT-2026-001';
  const lotComponents = components.filter((c) => c.lotId === currentLotId);
  const selectedComponent =
    components.find((c) => c.id === selectedComponentId) ||
    components[0] ||
    { id: 'C-0001', lotId: currentLotId, decision: 'PASS', riskScore: 0.12, measurements: { iddq: [2.1, 2.12, 2.14, 2.16] } };

  // Representative components for Lot Overview (PASS, HOLD, REJECT)
  const repPass = lotComponents.find((c) => (c.decision || c.status) === 'PASS') || components[0];
  const repHold = lotComponents.find((c) => (c.decision || c.status) === 'HOLD') || components[1];
  const repReject = lotComponents.find((c) => (c.decision || c.status) === 'REJECT') || components[2];
  const representativeList = [repPass, repHold, repReject].filter(Boolean);

  // 4. Build Trajectory Series according to View Mode
  let activeSeries = [];

  if (viewMode === 'component') {
    const compData = selectedComponent.measurements?.[activeSpec.key] || activeSpec.healthyRef;
    const compStatus = selectedComponent.decision || selectedComponent.status || 'PASS';

    activeSeries = [
      {
        id: selectedComponent.id,
        label: `${selectedComponent.id} — ${compStatus}`,
        componentId: selectedComponent.id,
        data: compData,
        color: getStatusColor(compStatus),
        strokeWidth: 2.8,
        dashed: false,
        status: compStatus,
        isComponent: true,
      },
      {
        id: 'healthy-ref',
        label: 'Healthy / Nominal Reference',
        componentId: 'Healthy Reference',
        data: activeSpec.healthyRef,
        color: '#64748b',
        strokeWidth: 1.6,
        dashed: true,
        status: 'NOMINAL',
        isComponent: false,
      },
    ];
  } else {
    // Lot Overview Mode: 3-5 representative components + healthy reference
    activeSeries = representativeList.map((comp) => {
      const compData = comp.measurements?.[activeSpec.key] || activeSpec.healthyRef;
      const compStatus = comp.decision || comp.status || 'PASS';
      return {
        id: comp.id,
        label: `${comp.id} — ${compStatus}`,
        componentId: comp.id,
        data: compData,
        color: getStatusColor(compStatus),
        strokeWidth: 2.2,
        dashed: false,
        status: compStatus,
        isComponent: true,
      };
    });

    activeSeries.push({
      id: 'healthy-ref',
      label: 'Healthy / Nominal Reference',
      componentId: 'Healthy Reference',
      data: activeSpec.healthyRef,
      color: '#64748b',
      strokeWidth: 1.4,
      dashed: true,
      status: 'NOMINAL',
      isComponent: false,
    });
  }

  // 5. SVG Chart Dimensions & Scaling
  const width = 860;
  const height = 300;
  const padding = { top: 30, right: 140, bottom: 45, left: 65 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Calculate dynamic Min and Max for Y-axis
  const allValues = [];
  activeSeries.forEach((s) => {
    if (Array.isArray(s.data)) allValues.push(...s.data);
  });
  allValues.push(activeSpec.specLimitMax);

  const dataMin = Math.min(...allValues);
  const dataMax = Math.max(...allValues);
  const minVal = Math.max(0, dataMin * 0.82);
  const maxVal = dataMax * 1.15;

  const checkpoints = activeSpec.checkpoints || ['0h', '24h', '96h', '168h'];
  const getX = (index) => padding.left + (index / (checkpoints.length - 1)) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal || 1)) * chartH;

  // Spec Limit Line Y
  const specLimitY = getY(activeSpec.specLimitMax);

  // Y-axis Ticks (5 steps)
  const yTicks = [0, 1, 2, 3, 4].map((step) => {
    const val = minVal + ((maxVal - minVal) * step) / 4;
    return { val: val.toFixed(2), y: getY(val) };
  });

  return (
    <div className="spad-card spad-trends-card">
      {/* 1. Header with View Mode Switcher and Parameter Tabs */}
      <div className="spad-card-header spad-trends-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">PARAMETRIC TELEMETRY DYNAMICS</span>
          <h2 className="spad-card-title">Parameter Trends</h2>
        </div>

        {/* View Mode Toggle: [ Component View ] [ Lot Overview ] */}
        <div className="spad-mode-tabs" role="group" aria-label="Viewing Mode">
          <button
            type="button"
            className={`spad-mode-btn ${viewMode === 'component' ? 'active' : ''}`}
            onClick={() => setViewMode('component')}
          >
            Component View
          </button>
          <button
            type="button"
            className={`spad-mode-btn ${viewMode === 'lot' ? 'active' : ''}`}
            onClick={() => setViewMode('lot')}
          >
            Lot Overview
          </button>
        </div>

        {/* Parameter Selector Buttons */}
        <div className="spad-param-tabs" role="tablist" aria-label="Select Parameter">
          {parameterOptions.map((opt) => {
            const isSelected = selectedParamKey === opt.key;
            return (
              <button
                key={opt.key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`spad-param-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedParamKey(opt.key)}
              >
                <span className="spad-tab-radio-indicator">{isSelected ? '☑' : '☐'}</span>
                <span>{opt.label}</span>
                <span className="spad-tab-unit">[{opt.unit}]</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Control and Summary Meta Bar */}
      <div className="spad-trends-meta-bar">
        {viewMode === 'component' ? (
          <div className="spad-trends-component-controls">
            <div className="spad-comp-selector-group">
              <label htmlFor="component-select" className="spad-comp-select-label">
                Component:
              </label>
              <select
                id="component-select"
                className="spad-comp-select-input"
                value={selectedComponent.id}
                onChange={(e) => setSelectedComponentId(e.target.value)}
              >
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} ({c.decision || c.status})
                  </option>
                ))}
              </select>
            </div>

            {/* Compact Component Summary */}
            <div className="spad-comp-compact-summary">
              <span className="spad-summary-pill-id">{selectedComponent.id}</span>
              <span className="spad-summary-pill-lot">Lot: {selectedComponent.lotId}</span>
              <span
                className={`spad-summary-pill-status status-${(selectedComponent.decision || selectedComponent.status || 'PASS').toLowerCase()}`}
              >
                Status: {selectedComponent.decision || selectedComponent.status}
              </span>
              <span className="spad-summary-pill-risk">
                Risk: {typeof selectedComponent.riskScore === 'number' ? selectedComponent.riskScore.toFixed(2) : '0.12'}
              </span>
            </div>
          </div>
        ) : (
          <div className="spad-trends-lot-summary">
            <span className="spad-summary-pill-lot">Active Lot: {currentLotId}</span>
            <span className="spad-trends-desc">
              Representative Cohort Comparison (PASS / HOLD / REJECT Trajectories)
            </span>
          </div>
        )}

        <span className="spad-spec-badge">
          MAX SPEC LIMIT: <strong>{activeSpec.specLimitMax.toFixed(2)} {activeSpec.unit}</strong>
        </span>
      </div>

      {/* 3. Interactive SVG Chart Container */}
      <div className="spad-chart-wrapper">
        <svg
          className="spad-trend-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label={`Chart for ${activeSpec.name}`}
        >
          <defs>
            {/* Spec Limit Glow */}
            <filter id="limitGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="2" floodColor="#ef4444" floodOpacity="0.5" />
            </filter>
          </defs>

          {/* Grid Background Horizontal Lines */}
          {yTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={padding.left}
                y1={tick.y}
                x2={padding.left + chartW}
                y2={tick.y}
                stroke="rgba(255, 255, 255, 0.06)"
                strokeDasharray="3 3"
              />
              <text
                x={padding.left - 10}
                y={tick.y + 4}
                textAnchor="end"
                fill="#64748b"
                fontSize="10"
                fontFamily="var(--font-mono)"
              >
                {tick.val}
              </text>
            </g>
          ))}

          {/* Vertical X-Axis Checkpoint Lines */}
          {checkpoints.map((cp, i) => {
            const x = getX(i);
            return (
              <g key={cp}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + chartH}
                  stroke="rgba(255, 255, 255, 0.06)"
                />
                <text
                  x={x}
                  y={padding.top + chartH + 20}
                  textAnchor="middle"
                  fill="#94a3b8"
                  fontSize="11"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                >
                  {cp}
                </text>
              </g>
            );
          })}

          {/* Y-Axis Label */}
          <text
            x={-height / 2}
            y="20"
            transform="rotate(-90)"
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="11"
            fontFamily="var(--font-mono)"
            letterSpacing="0.08em"
          >
            {activeSpec.name} [{activeSpec.unit}]
          </text>

          {/* Hard Spec Limit Horizontal Marker */}
          {specLimitY >= padding.top && specLimitY <= padding.top + chartH && (
            <g filter="url(#limitGlow)">
              <line
                x1={padding.left}
                y1={specLimitY}
                x2={padding.left + chartW}
                y2={specLimitY}
                stroke="#ef4444"
                strokeWidth="1.8"
                strokeDasharray="5 4"
              />
              <rect
                x={padding.left + chartW + 6}
                y={specLimitY - 10}
                width="112"
                height="18"
                rx="3"
                fill="rgba(239, 68, 68, 0.15)"
                stroke="rgba(239, 68, 68, 0.4)"
              />
              <text
                x={padding.left + chartW + 12}
                y={specLimitY + 2}
                fill="#fca5a5"
                fontSize="9"
                fontWeight="700"
                fontFamily="var(--font-mono)"
              >
                LIMIT: {activeSpec.specLimitMax.toFixed(2)} {activeSpec.unit}
              </text>
            </g>
          )}

          {/* Trajectory Series Lines */}
          {activeSeries.map((series, sIndex) => {
            const points = series.data.map((val, idx) => `${getX(idx)},${getY(val)}`).join(' ');

            return (
              <g key={series.id}>
                <polyline
                  fill="none"
                  stroke={series.color}
                  strokeWidth={series.strokeWidth || 2}
                  strokeDasharray={series.dashed ? '4 3' : 'none'}
                  points={points}
                />

                {/* Data Points on Nodes */}
                {series.data.map((val, idx) => {
                  const cx = getX(idx);
                  const cy = getY(val);
                  const pointKey = `${series.id}-${idx}`;
                  const isHovered = hoveredPoint && hoveredPoint.key === pointKey;

                  return (
                    <g key={pointKey}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : (series.isComponent ? 4 : 3)}
                        fill={series.color}
                        stroke="#070b14"
                        strokeWidth="1.5"
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={() =>
                          setHoveredPoint({
                            key: pointKey,
                            componentId: series.componentId,
                            val: val.toFixed(2),
                            checkpoint: checkpoints[idx],
                            unit: activeSpec.unit,
                            paramName: activeSpec.shortName,
                            status: series.status,
                            cx,
                            cy,
                          })
                        }
                        onMouseLeave={() => setHoveredPoint(null)}
                      />
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Tooltip Overlay */}
          {hoveredPoint && (
            <g
              transform={`translate(${Math.min(hoveredPoint.cx + 12, width - 180)}, ${Math.max(
                hoveredPoint.cy - 52,
                10
              )})`}
              style={{ pointerEvents: 'none' }}
            >
              <rect
                width="170"
                height="50"
                rx="4"
                fill="#0b1324"
                stroke="rgba(56, 189, 248, 0.5)"
                strokeWidth="1"
                filter="drop-shadow(0 4px 12px rgba(0,0,0,0.7))"
              />
              <text x="10" y="16" fill="#38bdf8" fontSize="10.5" fontWeight="700" fontFamily="var(--font-mono)">
                Component: {hoveredPoint.componentId}
              </text>
              <text x="10" y="30" fill="#f8fafc" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">
                Time: {hoveredPoint.checkpoint} | {hoveredPoint.paramName}: {hoveredPoint.val} {hoveredPoint.unit}
              </text>
              <text x="10" y="43" fill="#94a3b8" fontSize="9" fontFamily="var(--font-mono)">
                Status: <tspan fill={getStatusColor(hoveredPoint.status)} fontWeight="700">{hoveredPoint.status}</tspan>
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* 4. Chart Legend with Component IDs */}
      <div className="spad-chart-legend">
        {activeSeries.map((series) => (
          <div key={series.id} className="spad-legend-item">
            <span
              className="spad-legend-dot"
              style={{
                backgroundColor: series.color,
                borderStyle: series.dashed ? 'dashed' : 'solid',
              }}
            />
            <span className="spad-legend-label">{series.label}</span>
          </div>
        ))}
        <div className="spad-legend-item">
          <span className="spad-legend-dot" style={{ backgroundColor: '#ef4444', borderStyle: 'dashed' }} />
          <span className="spad-legend-label">Engineering Limit ({activeSpec.specLimitMax.toFixed(2)} {activeSpec.unit})</span>
        </div>
      </div>
    </div>
  );
}
