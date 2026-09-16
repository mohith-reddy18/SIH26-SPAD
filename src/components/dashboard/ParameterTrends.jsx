import React, { useState } from 'react';
import { mockParameterSpecs, mockComponents, mockScreeningContext } from '../../data/mockData';

// Helper for semantic status colors
function getStatusColor(status) {
  if (status === 'PASS') return '#10b981';
  if (status === 'HOLD') return '#f59e0b';
  if (status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

// Calculate component status dynamically across all parameters against engineering maximum limits
// Decision Rule:
// 0 distinct parameter breaches -> PASS
// 1 distinct parameter breach -> HOLD
// 2 or more distinct parameter breaches -> REJECT
function calculateComponentStatus(measurements, parameterSpecs) {
  if (!measurements || !parameterSpecs) return 'PASS';

  let violatingCount = 0;

  Object.values(parameterSpecs).forEach((spec) => {
    const data = Array.isArray(measurements) ? measurements : measurements[spec.key];
    if (Array.isArray(data) && typeof spec.specLimitMax === 'number') {
      const hasBreach = data.some((val) => typeof val === 'number' && val > spec.specLimitMax);
      if (hasBreach) {
        violatingCount += 1;
      }
    }
  });

  if (violatingCount === 0) return 'PASS';
  if (violatingCount === 1) return 'HOLD';
  return 'REJECT';
}

export default function ParameterTrends({
  parameterSpecs = mockParameterSpecs,
  components = mockComponents,
  context = mockScreeningContext,
}) {
  // 1. Interactive States driven entirely by passed/centralized data
  const [viewMode, setViewMode] = useState('component'); // 'component' | 'lot'
  const [selectedComponentId, setSelectedComponentId] = useState(
    () => components?.[0]?.id || ''
  );

  const parameterKeys = Object.keys(parameterSpecs);
  const [selectedParamKey, setSelectedParamKey] = useState(
    () => parameterKeys[0] || 'standby-current'
  );
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // 2. Dynamic Parameter Specification lookup from centralized data
  const activeSpec =
    parameterSpecs[selectedParamKey] ||
    parameterSpecs[parameterKeys[0]] ||
    mockParameterSpecs['standby-current'];

  // 3. Dynamic Component lookup from centralized data
  const currentLotId = context?.lotId || (components[0] && components[0].lotId) || 'LOT-2026-001';
  const lotComponents = components.filter((c) => c.lotId === currentLotId);

  const selectedComponent =
    components.find((c) => c.id === selectedComponentId) ||
    components[0] ||
    {};

  // Dynamic evaluation of component status based on ALL 3 parameters vs engineering limits
  const selectedStatus = calculateComponentStatus(
    selectedComponent.measurements,
    parameterSpecs
  );

  // 4. Build Trajectory Series dynamically from component measurements & specs
  let activeSeries = [];

  if (viewMode === 'component') {
    const compData =
      selectedComponent.measurements?.[activeSpec.key] ||
      activeSpec.healthyRef ||
      [0, 0, 0, 0];

    activeSeries = [
      {
        id: selectedComponent.id,
        label: `${selectedComponent.id} (Decision: ${selectedStatus})`,
        componentId: selectedComponent.id,
        data: compData,
        color: getStatusColor(selectedStatus),
        strokeWidth: 2.8,
        dashed: false,
        status: selectedStatus,
        isComponent: true,
      },
      {
        id: 'healthy-ref',
        label: 'Healthy Reference',
        componentId: 'Healthy Reference',
        data: activeSpec.healthyRef || [0, 0, 0, 0],
        color: '#64748b',
        strokeWidth: 1.8,
        dashed: true,
        status: 'NOMINAL',
        isComponent: false,
      },
    ];
  } else {
    // Lot Overview Mode: representative components evaluated dynamically across lot
    const candidateList = lotComponents.length > 0 ? lotComponents : components;
    const repList = [];
    const seenStatuses = new Set();

    for (const c of candidateList) {
      const st = calculateComponentStatus(c.measurements, parameterSpecs);
      if (!seenStatuses.has(st) && repList.length < 3) {
        seenStatuses.add(st);
        repList.push(c);
      }
    }

    if (repList.length === 0) {
      repList.push(...candidateList.slice(0, 3));
    }

    activeSeries = repList.map((comp) => {
      const cData = comp.measurements?.[activeSpec.key] || activeSpec.healthyRef || [0, 0, 0, 0];
      const cStatus = calculateComponentStatus(comp.measurements, parameterSpecs);
      return {
        id: comp.id,
        label: `${comp.id} (Decision: ${cStatus})`,
        componentId: comp.id,
        data: cData,
        color: getStatusColor(cStatus),
        strokeWidth: 2.2,
        dashed: false,
        status: cStatus,
        isComponent: true,
      };
    });

    activeSeries.push({
      id: 'healthy-ref',
      label: 'Healthy Reference',
      componentId: 'Healthy Reference',
      data: activeSpec.healthyRef || [0, 0, 0, 0],
      color: '#64748b',
      strokeWidth: 1.6,
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

  // Dynamic Y-axis Min and Max derived from active dataset and spec limit
  const allValues = [];
  activeSeries.forEach((s) => {
    if (Array.isArray(s.data)) allValues.push(...s.data);
  });
  if (typeof activeSpec.specLimitMax === 'number') {
    allValues.push(activeSpec.specLimitMax);
  }

  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 10;
  const minVal = Math.max(0, dataMin * 0.82);
  const maxVal = dataMax * 1.15;

  const checkpoints = activeSpec.checkpoints || ['0h', '24h', '96h', '168h'];
  const getX = (index) => padding.left + (index / (checkpoints.length - 1 || 1)) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal || 1)) * chartH;

  // Spec Limit Line Y coordinate
  const specLimitY = typeof activeSpec.specLimitMax === 'number' ? getY(activeSpec.specLimitMax) : -100;

  // Y-axis Ticks (5 evenly distributed steps)
  const yTicks = [0, 1, 2, 3, 4].map((step) => {
    const val = minVal + ((maxVal - minVal) * step) / 4;
    return { val: val.toFixed(2), y: getY(val) };
  });

  return (
    <div className="spad-card spad-trends-card">
      {/* 1. Header with View Mode Switcher and Dynamic Parameter Tabs */}
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

        {/* Dynamic Parameter Selector Buttons derived from parameterSpecs */}
        <div className="spad-param-tabs" role="tablist" aria-label="Select Parameter">
          {Object.entries(parameterSpecs).map(([key, spec]) => {
            const isSelected = selectedParamKey === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={`spad-param-tab-btn ${isSelected ? 'active' : ''}`}
                onClick={() => setSelectedParamKey(key)}
              >
                <span className="spad-tab-radio-indicator">{isSelected ? '☑' : '☐'}</span>
                <span>{spec.name}</span>
                <span className="spad-tab-unit">[{spec.unit}]</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. Dynamic Control and Summary Meta Bar */}
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
                value={selectedComponent.id || ''}
                onChange={(e) => setSelectedComponentId(e.target.value)}
              >
                {components.map((c) => {
                  const cStatus = calculateComponentStatus(c.measurements, parameterSpecs);
                  return (
                    <option key={c.id} value={c.id}>
                      {c.id} ({cStatus})
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Compact Component Summary derived from selectedComponent data */}
            <div className="spad-comp-compact-summary">
              <span className="spad-summary-pill-id">{selectedComponent.id}</span>
              <span className="spad-summary-pill-lot">Lot: {selectedComponent.lotId}</span>
              <span
                className={`spad-summary-pill-status status-${selectedStatus.toLowerCase()}`}
              >
                Screening Decision: {selectedStatus}
              </span>
              <span className="spad-summary-pill-risk">
                AI Assessment: {selectedComponent.aiAssessment || (selectedComponent.aiRisk > 75 ? 'Predicted Limit Breach' : selectedComponent.aiRisk > 40 ? 'Elevated Future Risk' : 'Within Expected Range')}
              </span>
            </div>
          </div>
        ) : (
          <div className="spad-trends-lot-summary">
            <span className="spad-summary-pill-lot">Active Lot: {currentLotId}</span>
            <span className="spad-trends-desc">
              Representative Cohort Comparison vs. Healthy Baseline Reference
            </span>
          </div>
        )}

        <span className="spad-spec-badge">
          MAX SPEC LIMIT:{' '}
          <strong>
            {activeSpec.specLimitMax !== undefined ? activeSpec.specLimitMax.toFixed(2) : '—'}{' '}
            {activeSpec.unit}
          </strong>
        </span>
      </div>

      {/* 3. Interactive SVG Chart Container */}
      <div className="spad-chart-wrapper">
        <svg
          className="spad-trend-svg"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="xMidYMid meet"
          aria-label={`Chart for ${activeSpec.name || 'Parameter Trends'}`}
        >
          {/* Horizontal Grid Lines */}
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

          {/* Vertical Checkpoint Lines & Stage Markers */}
          {checkpoints.map((cp, i) => {
            const x = getX(i);
            const isForecast = cp === '168h';
            const isCurrent = cp === '96h';

            return (
              <g key={cp}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + chartH}
                  stroke={isForecast ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.06)'}
                  strokeDasharray={isForecast ? '3 3' : 'none'}
                />
                <text
                  x={x}
                  y={padding.top + chartH + 16}
                  textAnchor="middle"
                  fill={isForecast ? '#38bdf8' : (isCurrent ? '#f8fafc' : '#94a3b8')}
                  fontSize="11"
                  fontWeight={isForecast || isCurrent ? '700' : '600'}
                  fontFamily="var(--font-mono)"
                >
                  {cp}
                </text>
                <text
                  x={x}
                  y={padding.top + chartH + 28}
                  textAnchor="middle"
                  fill={isForecast ? 'rgba(56, 189, 248, 0.75)' : '#64748b'}
                  fontSize="8"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                  letterSpacing="0.04em"
                >
                  {isForecast ? '[FORECAST]' : (isCurrent ? '[CURRENT]' : '[OBSERVED]')}
                </text>
              </g>
            );
          })}

          {/* Y-Axis Title & Unit */}
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

          {/* Engineering Limit Line & Label (Flat, Crisp, No Glow) */}
          {specLimitY >= padding.top && specLimitY <= padding.top + chartH && (
            <g>
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
                height="19"
                rx="3"
                fill="#0f172a"
                stroke="#ef4444"
                strokeWidth="1"
              />
              <text
                x={padding.left + chartW + 12}
                y={specLimitY + 3}
                fill="#f87171"
                fontSize="9.5"
                fontWeight="700"
                fontFamily="var(--font-mono)"
              >
                LIMIT: {activeSpec.specLimitMax?.toFixed(2)} {activeSpec.unit}
              </text>
            </g>
          )}

          {/* Trajectory Series Polylines */}
          {activeSeries.map((series) => {
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
                  const isForecast = checkpoints[idx] === '168h';
                  const pointKey = `${series.id}-${idx}`;
                  const isHovered = hoveredPoint && hoveredPoint.key === pointKey;

                  return (
                    <g key={pointKey}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 6 : (series.isComponent ? 4 : 3)}
                        fill={isForecast && series.isComponent ? '#0b1324' : series.color}
                        stroke={series.color}
                        strokeWidth={isForecast && series.isComponent ? 2.5 : 1.5}
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={() =>
                          setHoveredPoint({
                            key: pointKey,
                            componentId: series.componentId,
                            val: typeof val === 'number' ? val.toFixed(2) : val,
                            checkpoint: checkpoints[idx],
                            isForecast,
                            unit: activeSpec.unit,
                            paramName: activeSpec.shortName || activeSpec.name,
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
              transform={`translate(${Math.min(hoveredPoint.cx + 12, width - 200)}, ${Math.max(
                hoveredPoint.cy - 56,
                10
              )})`}
              style={{ pointerEvents: 'none' }}
            >
              <rect
                width="190"
                height="54"
                rx="4"
                fill="#0b1324"
                stroke={hoveredPoint.isForecast ? 'rgba(56, 189, 248, 0.7)' : 'rgba(56, 189, 248, 0.35)'}
                strokeWidth="1"
                filter="drop-shadow(0 4px 12px rgba(0,0,0,0.7))"
              />
              <text x="10" y="15" fill="#38bdf8" fontSize="10.5" fontWeight="700" fontFamily="var(--font-mono)">
                {hoveredPoint.componentId === 'Healthy Reference'
                  ? 'Baseline Reference'
                  : `Component: ${hoveredPoint.componentId} ${hoveredPoint.isForecast ? '(168h Forecast)' : ''}`}
              </text>
              <text x="10" y="29" fill="#f8fafc" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">
                {hoveredPoint.checkpoint} {hoveredPoint.isForecast ? '[AI Prediction]' : '[Observed]'} | {hoveredPoint.paramName}: {hoveredPoint.val} {hoveredPoint.unit}
              </text>
              <text x="10" y="44" fill="#94a3b8" fontSize="9" fontFamily="var(--font-mono)">
                {hoveredPoint.isForecast ? 'AI 168h Assessment: ' : 'Screening Decision: '}
                <tspan fill={hoveredPoint.isForecast ? '#38bdf8' : getStatusColor(hoveredPoint.status)} fontWeight="700">
                  {hoveredPoint.isForecast
                    ? (hoveredPoint.status === 'REJECT' ? 'Predicted Limit Breach' : hoveredPoint.status === 'HOLD' ? 'Elevated Future Risk' : 'Within Expected Range')
                    : hoveredPoint.status}
                </tspan>
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* 4. Chart Legend distinguishing Component, Healthy Reference, and Engineering Limit */}
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
            <span className="spad-legend-label">
              {series.isComponent
                ? `${series.label} (0h–96h Observed + 168h Forecast)`
                : series.label}
            </span>
          </div>
        ))}
        {typeof activeSpec.specLimitMax === 'number' && (
          <div className="spad-legend-item">
            <span className="spad-legend-dot" style={{ backgroundColor: '#ef4444', borderStyle: 'dashed' }} />
            <span className="spad-legend-label">
              Engineering Limit ({activeSpec.specLimitMax.toFixed(2)} {activeSpec.unit})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
