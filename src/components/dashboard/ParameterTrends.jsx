import React, { useState } from 'react';
import { mockParameterSpecs, mockComponents, mockScreeningContext } from '../../data/mockData';

// Helper for semantic status colors
function getStatusColor(status) {
  if (status === 'NORMAL' || status === 'PASS') return '#10b981';
  if (status === 'SUSPECT' || status === 'HOLD') return '#f59e0b';
  if (status === 'CRITICAL' || status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

// Calculate component status dynamically across all parameters against engineering maximum limits
// Decision Rule:
// 0 distinct parameter breaches -> NORMAL
// 1 distinct parameter breach -> SUSPECT
// 2 or more distinct parameter breaches -> CRITICAL
function calculateComponentStatus(measurements, parameterSpecs) {
  if (!measurements || !parameterSpecs) return 'NORMAL';

  const specs = Array.isArray(parameterSpecs)
    ? parameterSpecs
    : Object.values(parameterSpecs);

  let violatingCount = 0;

  specs.forEach((spec) => {
    const key = spec.key || spec.id;
    const data = Array.isArray(measurements)
      ? measurements
      : (measurements[key] || (spec.key && measurements[spec.key]) || (spec.id && measurements[spec.id]));
    if (Array.isArray(data) && typeof spec.specLimitMax === 'number') {
      const hasBreach = data.some((val) => typeof val === 'number' && val > spec.specLimitMax);
      if (hasBreach) {
        violatingCount += 1;
      }
    }
  });

  if (violatingCount === 0) return 'NORMAL';
  if (violatingCount === 1) return 'SUSPECT';
  return 'CRITICAL';
}

// Helper to extract 0h, 24h observed checkpoints and 168h AI forecast
function extractTrajectory(data) {
  if (!Array.isArray(data)) return [0, 0, 0];
  if (data.length === 4) {
    // 0h observed (idx 0), 24h observed (idx 1), 168h AI forecast (idx 3)
    return [data[0], data[1], data[3]];
  }
  return data;
}

export default function ParameterTrends({
  parameterSpecs = mockParameterSpecs,
  components = mockComponents,
  context = mockScreeningContext,
}) {
  // 1. Dynamic list of available parameters from centralized data / props
  const availableParams = Array.isArray(parameterSpecs)
    ? parameterSpecs
    : Object.entries(parameterSpecs || {}).map(([key, spec]) => ({
        id: spec.id || key,
        ...spec,
      }));

  // 2. Interactive States driven entirely by passed/centralized data
  const [viewMode, setViewMode] = useState('component'); // 'component' | 'lot'
  const [selectedComponentId, setSelectedComponentId] = useState(
    () => components?.[0]?.id || ''
  );

  const [selectedParamKey, setSelectedParamKey] = useState(
    () => availableParams[0]?.id || availableParams[0]?.key || 'standby-current'
  );
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hoveredCompId, setHoveredCompId] = useState(null);

  // 3. Dynamic Parameter Specification lookup from available parameters
  const activeSpec =
    availableParams.find(
      (p) => (p.id && p.id === selectedParamKey) || (p.key && p.key === selectedParamKey)
    ) ||
    availableParams[0] ||
    mockParameterSpecs['standby-current'];

  // 4. Dynamic Component lookup from centralized data
  const currentLotId = context?.lotId || (components[0] && components[0].lotId) || 'LOT-2026-001';
  const lotComponents = components.filter((c) => c.lotId === currentLotId);

  const selectedComponent =
    components.find((c) => c.id === selectedComponentId) ||
    components[0] ||
    {};

  // Dynamic evaluation of component status based on all available parameters vs engineering limits
  const selectedStatus = calculateComponentStatus(
    selectedComponent.measurements,
    parameterSpecs
  );

  // 5. Build Trajectory Series dynamically from component measurements & specs
  let activeSeries = [];
  const healthyTrajectory = extractTrajectory(activeSpec.healthyRef || [0, 0, 0, 0]);

  if (viewMode === 'component') {
    const rawCompData =
      (selectedComponent.measurements &&
        (selectedComponent.measurements[activeSpec.key] ||
          selectedComponent.measurements[activeSpec.id])) ||
      activeSpec.healthyRef ||
      [0, 0, 0, 0];

    const compData = extractTrajectory(rawCompData);

    activeSeries = [
      {
        id: selectedComponent.id,
        label: `${selectedComponent.id} — ${selectedStatus}`,
        componentId: selectedComponent.id,
        data: compData,
        color: getStatusColor(selectedStatus),
        strokeWidth: 2.8,
        opacity: 1.0,
        dashed: false,
        status: selectedStatus,
        isComponent: true,
      },
      {
        id: 'healthy-ref',
        label: 'Healthy Reference',
        componentId: 'Healthy Reference',
        data: healthyTrajectory,
        color: '#64748b',
        strokeWidth: 1.8,
        opacity: 1.0,
        dashed: true,
        status: 'NOMINAL',
        isComponent: false,
      },
    ];
  } else {
    // Lot Overview Mode: Plot all components belonging to the active lot
    const targetLotComponents = lotComponents.length > 0 ? lotComponents : components;

    activeSeries = targetLotComponents.map((comp) => {
      const rawCompData =
        (comp.measurements &&
          (comp.measurements[activeSpec.key] ||
            comp.measurements[activeSpec.id])) ||
        activeSpec.healthyRef ||
        [0, 0, 0, 0];
      const compData = extractTrajectory(rawCompData);
      const cStatus = calculateComponentStatus(comp.measurements, parameterSpecs);
      const isHovered = hoveredCompId === comp.id;

      return {
        id: comp.id,
        label: `${comp.id} — ${cStatus}`,
        componentId: comp.id,
        data: compData,
        color: getStatusColor(cStatus),
        strokeWidth: isHovered ? 3.0 : 1.6,
        opacity: hoveredCompId ? (isHovered ? 1.0 : 0.22) : 0.65,
        dashed: false,
        status: cStatus,
        isComponent: true,
      };
    });

    activeSeries.push({
      id: 'healthy-ref',
      label: 'Healthy Reference',
      componentId: 'Healthy Reference',
      data: healthyTrajectory,
      color: '#64748b',
      strokeWidth: 1.8,
      opacity: hoveredCompId ? 0.35 : 1.0,
      dashed: true,
      status: 'NOMINAL',
      isComponent: false,
    });
  }

  // 6. SVG Chart Dimensions & Scaling (0h Observed, 24h Observed, 168h Forecast)
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

  const checkpoints = ['0h', '24h', '168h'];
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
      {/* 1. Header with View Mode Switcher */}
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
            onClick={() => {
              setViewMode('component');
              setHoveredCompId(null);
            }}
          >
            Component View
          </button>
          <button
            type="button"
            className={`spad-mode-btn ${viewMode === 'lot' ? 'active' : ''}`}
            onClick={() => {
              setViewMode('lot');
              setHoveredCompId(null);
            }}
          >
            Lot Overview
          </button>
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

            <div className="spad-comp-selector-group">
              <label htmlFor="param-select" className="spad-comp-select-label">
                Parameter:
              </label>
              <select
                id="param-select"
                className="spad-comp-select-input"
                value={selectedParamKey}
                onChange={(e) => setSelectedParamKey(e.target.value)}
              >
                {availableParams.map((param) => {
                  const pKey = param.id || param.key;
                  return (
                    <option key={pKey} value={pKey}>
                      {param.name}
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
                Status: {selectedStatus}
              </span>
              <span className="spad-summary-pill-risk">
                AI Status: {selectedComponent.aiAssessment || (selectedComponent.aiRisk > 75 ? 'CRITICAL' : selectedComponent.aiRisk > 40 ? 'SUSPECT' : 'NORMAL')}
              </span>
            </div>
          </div>
        ) : (
          <div className="spad-trends-component-controls">
            <div className="spad-comp-selector-group">
              <label htmlFor="param-select-lot" className="spad-comp-select-label">
                Parameter:
              </label>
              <select
                id="param-select-lot"
                className="spad-comp-select-input"
                value={selectedParamKey}
                onChange={(e) => setSelectedParamKey(e.target.value)}
              >
                {availableParams.map((param) => {
                  const pKey = param.id || param.key;
                  return (
                    <option key={pKey} value={pKey}>
                      {param.name}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className="spad-trends-lot-summary">
              <span className="spad-summary-pill-lot">
                Active Lot: {currentLotId} ({lotComponents.length > 0 ? lotComponents.length : components.length} Components)
              </span>
              <span className="spad-trends-desc">
                Population Trajectories (0h & 24h Observed → 168h AI Forecast) vs. Healthy Reference
              </span>
            </div>
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
                  fill={isForecast ? '#38bdf8' : '#f8fafc'}
                  fontSize="11"
                  fontWeight="700"
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
                  {isForecast ? '[FORECAST]' : '[OBSERVED]'}
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
            const isHoveredComp = hoveredCompId === series.componentId;

            return (
              <g
                key={series.id}
                style={{ cursor: series.isComponent ? 'pointer' : 'default' }}
                onMouseEnter={() => {
                  if (series.isComponent && viewMode === 'lot') {
                    setHoveredCompId(series.componentId);
                  }
                }}
                onMouseLeave={() => {
                  if (viewMode === 'lot') {
                    setHoveredCompId(null);
                  }
                }}
              >
                <polyline
                  fill="none"
                  stroke={series.color}
                  strokeWidth={series.strokeWidth || 2}
                  strokeOpacity={series.opacity !== undefined ? series.opacity : 1}
                  strokeDasharray={series.dashed ? '4 3' : 'none'}
                  points={points}
                />

                {/* Data Points on Nodes */}
                {series.data.map((val, idx) => {
                  const cx = getX(idx);
                  const cy = getY(val);
                  const isForecast = checkpoints[idx] === '168h';
                  const pointKey = `${series.id}-${idx}`;
                  const isPointHovered = hoveredPoint && hoveredPoint.key === pointKey;

                  return (
                    <g key={pointKey}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isPointHovered ? 6 : (series.isComponent ? (isHoveredComp ? 4.5 : 3) : 3)}
                        fill={isForecast && series.isComponent ? '#0b1324' : series.color}
                        fillOpacity={series.opacity !== undefined ? series.opacity : 1}
                        stroke={series.color}
                        strokeOpacity={series.opacity !== undefined ? series.opacity : 1}
                        strokeWidth={isForecast && series.isComponent ? 2.5 : 1.5}
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          if (series.isComponent && viewMode === 'lot') {
                            setHoveredCompId(series.componentId);
                          }
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
                          });
                        }}
                        onMouseLeave={() => {
                          setHoveredPoint(null);
                        }}
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
                {hoveredPoint.isForecast ? 'AI 168h Status: ' : 'Status: '}
                <tspan fill={hoveredPoint.isForecast ? '#38bdf8' : getStatusColor(hoveredPoint.status)} fontWeight="700">
                  {hoveredPoint.status}
                </tspan>
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* 4. Chart Legend distinguishing Component trajectories, Healthy Reference, and Engineering Limit */}
      <div className="spad-chart-legend" aria-label="Chart Series Legend">
        {viewMode === 'lot' ? (
          <>
            <div className="spad-legend-item">
              <span
                className="spad-legend-dot"
                style={{
                  width: '14px',
                  height: '3px',
                  backgroundColor: '#10b981',
                  borderRadius: '1px',
                }}
              />
              <span className="spad-legend-label">NORMAL Population</span>
            </div>
            <div className="spad-legend-item">
              <span
                className="spad-legend-dot"
                style={{
                  width: '14px',
                  height: '3px',
                  backgroundColor: '#f59e0b',
                  borderRadius: '1px',
                }}
              />
              <span className="spad-legend-label">SUSPECT Population</span>
            </div>
            <div className="spad-legend-item">
              <span
                className="spad-legend-dot"
                style={{
                  width: '14px',
                  height: '3px',
                  backgroundColor: '#ef4444',
                  borderRadius: '1px',
                }}
              />
              <span className="spad-legend-label">CRITICAL Population</span>
            </div>
            <div className="spad-legend-item">
              <span
                className="spad-legend-dot"
                style={{
                  width: '14px',
                  height: '0px',
                  borderTop: '2px dashed #64748b',
                  backgroundColor: 'transparent',
                }}
              />
              <span className="spad-legend-label">Healthy Reference</span>
            </div>
            {typeof activeSpec.specLimitMax === 'number' && (
              <div className="spad-legend-item">
                <span
                  className="spad-legend-dot"
                  style={{
                    width: '14px',
                    height: '0px',
                    borderTop: '2px dashed #ef4444',
                    backgroundColor: 'transparent',
                  }}
                />
                <span className="spad-legend-label">
                  Engineering Limit ({activeSpec.specLimitMax.toFixed(2)} {activeSpec.unit})
                </span>
              </div>
            )}
          </>
        ) : (
          <>
            {activeSeries.map((series) => (
              <div key={series.id} className="spad-legend-item">
                <span
                  className="spad-legend-dot"
                  style={
                    series.dashed
                      ? {
                          width: '14px',
                          height: '0px',
                          borderTop: `2px dashed ${series.color}`,
                          backgroundColor: 'transparent',
                        }
                      : {
                          width: '14px',
                          height: '3px',
                          backgroundColor: series.color,
                          borderRadius: '1px',
                        }
                  }
                />
                <span className="spad-legend-label">{series.label}</span>
              </div>
            ))}
            {typeof activeSpec.specLimitMax === 'number' && (
              <div className="spad-legend-item">
                <span
                  className="spad-legend-dot"
                  style={{
                    width: '14px',
                    height: '0px',
                    borderTop: '2px dashed #ef4444',
                    backgroundColor: 'transparent',
                  }}
                />
                <span className="spad-legend-label">
                  Engineering Limit ({activeSpec.specLimitMax.toFixed(2)} {activeSpec.unit})
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
