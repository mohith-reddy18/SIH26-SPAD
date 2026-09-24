import React, { useState, useEffect, useMemo } from 'react';
import { mockScreeningContext } from '../../data/mockData';
import { getParameterMeta, extractPredictedValue } from '../../utils/recordMapping';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

// Helper for semantic status colors
function getStatusColor(status) {
  if (status === 'NORMAL' || status === 'PASS') return '#10b981';
  if (status === 'SUSPECT' || status === 'HOLD') return '#f59e0b';
  if (status === 'CRITICAL' || status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

// Helper to extract observed checkpoints and optional AI forecast
function extractTrajectory(data, predictionVal) {
  if (data === null || data === undefined) {
    return typeof predictionVal === 'number' && !isNaN(predictionVal) ? [predictionVal] : [];
  }
  if (typeof data === 'number' && !isNaN(data)) {
    return typeof predictionVal === 'number' && !isNaN(predictionVal) ? [data, predictionVal] : [data];
  }
  if (Array.isArray(data)) {
    const numData = data.filter((v) => typeof v === 'number' && !isNaN(v));
    if (numData.length === 0) {
      return typeof predictionVal === 'number' && !isNaN(predictionVal) ? [predictionVal] : [];
    }
    if (typeof predictionVal === 'number' && !isNaN(predictionVal)) {
      // If data already has full trajectory including prediction point
      if (numData.length > 2 && Math.abs(numData[numData.length - 1] - predictionVal) < 0.0001) {
        return numData;
      }
      return [...numData, predictionVal];
    }
    return numData;
  }
  if (typeof data === 'object') {
    const vals = Object.values(data).filter((v) => typeof v === 'number' && !isNaN(v));
    if (typeof predictionVal === 'number' && !isNaN(predictionVal)) {
      return [...vals, predictionVal];
    }
    return vals;
  }
  return [];
}

export default function ParameterTrends({
  components = [],
  context = mockScreeningContext,
}) {
  // 1. Interactive State Management
  const [viewMode, setViewMode] = useState('component'); // 'component' | 'lot'
  const [selectedComponentId, setSelectedComponentId] = useState(
    () => components?.[0]?.id || components?.[0]?.componentId || ''
  );
  const [selectedParamKey, setSelectedParamKey] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hoveredCompId, setHoveredCompId] = useState(null);

  // Keep selectedComponentId in sync when components load
  useEffect(() => {
    if (components.length > 0 && (!selectedComponentId || !components.some((c) => (c.id || c.componentId) === selectedComponentId))) {
      setSelectedComponentId(components[0].id || components[0].componentId);
    }
  }, [components, selectedComponentId]);

  // 2. Fetch selected component from backend API with fallback
  const [liveComponentData, setLiveComponentData] = useState(null);
  const [isLoadingComp, setIsLoadingComp] = useState(false);
  const [compFetchError, setCompFetchError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const targetId = selectedComponentId || components[0]?.id || components[0]?.componentId;
    if (!targetId || targetId === 'Healthy Reference') return;

    async function fetchComponentScreening() {
      setIsLoadingComp(true);
      setCompFetchError(null);
      try {
        const response = await fetch(`${API_BASE_URL}/api/screening/${encodeURIComponent(targetId)}`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data && isMounted) {
            setLiveComponentData(result.data);
            return;
          }
        }
        if (isMounted) {
          setLiveComponentData(null);
        }
      } catch (err) {
        if (isMounted) {
          setCompFetchError(err.message);
          setLiveComponentData(null);
        }
      } finally {
        if (isMounted) {
          setIsLoadingComp(false);
        }
      }
    }

    fetchComponentScreening();

    return () => {
      isMounted = false;
    };
  }, [selectedComponentId, components]);

  // Active Component resolution: Live API record primary, prop fallback secondary
  const activeComponent = useMemo(() => {
    const fallback = components.find((c) => c.id === selectedComponentId) || components[0] || {};
    if (liveComponentData) {
      return {
        ...fallback,
        ...liveComponentData,
        id: liveComponentData.componentId || liveComponentData.id || fallback.id || selectedComponentId,
        lotId: liveComponentData.lotId || fallback.lotId || 'NASA-MOSFET-199C',
        stage: liveComponentData.stage || fallback.stage || '100%',
        measurements: liveComponentData.measurements || fallback.measurements || {},
        predictions: liveComponentData.predictions || fallback.predictions || {},
        engineeringLimits: liveComponentData.engineeringLimits || fallback.engineeringLimits || {},
        status: liveComponentData.status || fallback.status || 'NORMAL',
        _source: 'backend-api',
      };
    }
    return fallback;
  }, [liveComponentData, selectedComponentId, components]);

  // 3. Dynamic available parameters constructed exclusively from the component's actual telemetry
  const availableParams = useMemo(() => {
    const measurementKeys = Object.keys(activeComponent.measurements || {});
    const engineeringLimitKeys = Object.keys(activeComponent.engineeringLimits || {});
    const predictionKeys = Object.keys(activeComponent.predictions || {}).map((k) => k.replace(/_168h$/, ''));
    
    // Extract unique parameter keys present in this specific component's record
    const allKeys = Array.from(new Set([...measurementKeys, ...engineeringLimitKeys, ...predictionKeys])).filter(Boolean);

    if (allKeys.length > 0) {
      return allKeys.map((key) => {
        const limit = activeComponent.engineeringLimits?.[key];
        return getParameterMeta(key, limit);
      });
    }

    return [];
  }, [activeComponent.measurements, activeComponent.engineeringLimits, activeComponent.predictions]);

  // Automatically keep selected parameter in sync when available parameters change
  useEffect(() => {
    if (availableParams.length > 0) {
      if (!availableParams.some((p) => p.key === selectedParamKey || p.id === selectedParamKey)) {
        setSelectedParamKey(availableParams[0].key || availableParams[0].id);
      }
    }
  }, [availableParams, selectedParamKey]);

  // 4. Active parameter specification lookup
  const activeSpec = useMemo(() => {
    if (availableParams.length === 0) {
      return { id: '', key: '', name: 'No Parameter', shortName: '', unit: '', specLimitMax: undefined, healthyRef: [] };
    }
    return (
      availableParams.find(
        (p) => (p.id && p.id === selectedParamKey) || (p.key && p.key === selectedParamKey)
      ) || availableParams[0]
    );
  }, [availableParams, selectedParamKey]);

  // 5. Dynamic Limit and Prediction retrieval for the active parameter
  const dynamicLimit = useMemo(() => {
    if (!activeSpec.key) return undefined;
    const rawLimit = activeComponent.engineeringLimits?.[activeSpec.key] ?? activeComponent.engineeringLimits?.[activeSpec.id];
    if (rawLimit && typeof rawLimit === 'object') {
      if (typeof rawLimit.limitValue === 'number') return rawLimit.limitValue;
      if (typeof rawLimit.max === 'number') return rawLimit.max;
      if (typeof rawLimit.value === 'number') return rawLimit.value;
    }
    if (typeof rawLimit === 'number') {
      return rawLimit;
    }
    return activeSpec.specLimitMax;
  }, [activeComponent.engineeringLimits, activeSpec]);

  const dynamicPrediction = useMemo(() => {
    if (!activeSpec.key) return undefined;
    const val = extractPredictedValue(activeComponent, activeSpec.key || activeSpec.id);
    return val !== null ? val : undefined;
  }, [activeComponent, activeSpec]);

  // 6. Selected Component Status
  const selectedStatus = activeComponent.status || 'NORMAL';
  const currentLotId = context?.lotId || activeComponent.lotId || 'NASA-MOSFET-199C';
  const lotComponents = components.filter((c) => c.lotId === currentLotId);

  // 7. Trajectory Series Construction
  const healthyTrajectory = activeSpec.healthyRef && activeSpec.healthyRef.length > 0
    ? extractTrajectory(activeSpec.healthyRef)
    : [];

  let activeSeries = [];
  if (viewMode === 'component') {
    const rawCompData =
      activeComponent.measurements?.[activeSpec.key] ||
      activeComponent.measurements?.[activeSpec.id] ||
      [];

    const compData = extractTrajectory(rawCompData, dynamicPrediction);

    activeSeries = [
      ...(activeComponent.id && compData.length > 0
        ? [
            {
              id: activeComponent.id,
              label: `${activeComponent.id} — ${selectedStatus}`,
              componentId: activeComponent.id,
              data: compData,
              color: getStatusColor(selectedStatus),
              strokeWidth: 2.8,
              opacity: 1.0,
              dashed: false,
              status: selectedStatus,
              isComponent: true,
            },
          ]
        : []),
      ...(healthyTrajectory.length > 0
        ? [
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
          ]
        : []),
    ];
  } else {
    // Lot Overview Mode: Plot all components belonging to the active lot
    const targetLotComponents = lotComponents.length > 0 ? lotComponents : components;

    activeSeries = targetLotComponents.map((comp) => {
      const isSelected = comp.id === activeComponent.id;
      const measurementsObj = isSelected ? activeComponent.measurements : comp.measurements;
      const predictionsObj = isSelected ? activeComponent.predictions : comp.predictions;
      const rawCompData =
        measurementsObj?.[activeSpec.key] ||
        measurementsObj?.[activeSpec.id] ||
        [];

      const pred = predictionsObj?.[`${activeSpec.key}_168h`] ?? predictionsObj?.[`${activeSpec.id}_168h`];
      const compData = extractTrajectory(rawCompData, pred);
      const cStatus = isSelected ? selectedStatus : (comp.status || 'NORMAL');
      const isHovered = hoveredCompId === comp.id;

      return {
        id: comp.id,
        label: `${comp.id} — ${cStatus}`,
        componentId: comp.id,
        data: compData,
        color: getStatusColor(cStatus),
        strokeWidth: isHovered ? 3.0 : isSelected ? 2.6 : 1.6,
        opacity: hoveredCompId ? (isHovered ? 1.0 : 0.22) : isSelected ? 1.0 : 0.65,
        dashed: false,
        status: cStatus,
        isComponent: true,
      };
    });

    if (healthyTrajectory.length > 0) {
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
  }

  // 8. SVG Chart Dimensions & Scaling
  const width = 860;
  const height = 300;
  const padding = { top: 30, right: 140, bottom: 45, left: 65 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Dynamic Y-axis Min and Max derived from active dataset and engineering limit
  const allValues = [];
  activeSeries.forEach((s) => {
    if (Array.isArray(s.data)) allValues.push(...s.data);
  });
  if (typeof dynamicLimit === 'number') {
    allValues.push(dynamicLimit);
  }

  const dataMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : 10;
  const minVal = Math.max(0, dataMin * 0.82);
  const maxVal = dataMax * 1.15;

  // Derive dynamic checkpoints from actual measurements
  const rawDataForCheckpoints =
    activeComponent.measurements?.[activeSpec.key] ||
    activeComponent.measurements?.[activeSpec.id];

  const checkpoints = useMemo(() => {
    if (rawDataForCheckpoints && typeof rawDataForCheckpoints === 'object' && !Array.isArray(rawDataForCheckpoints)) {
      const keys = Object.keys(rawDataForCheckpoints);
      if (typeof dynamicPrediction === 'number') {
        return [...keys, 'Predicted (100%)'];
      }
      return keys.length > 0 ? keys : ['0%', '33.33%', '66.67%', '100%'];
    }
    if (Array.isArray(rawDataForCheckpoints)) {
      const len = rawDataForCheckpoints.length + (typeof dynamicPrediction === 'number' && rawDataForCheckpoints.length <= 2 ? 1 : 0);
      if (len === 4) return ['0%', '33.33%', '66.67%', '100%'];
      if (len === 3) return ['0%', '33.33%', '100% [Forecast]'];
      if (len === 2) return ['0%', '33.33%'];
      if (len === 1) return ['Baseline (0%)'];
    }
    return ['0%', '33.33%', '66.67%', '100%'];
  }, [rawDataForCheckpoints, dynamicPrediction]);

  const getX = (index) => padding.left + (index / (Math.max(1, checkpoints.length - 1))) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal || 1)) * chartH;

  // Spec Limit Line Y coordinate
  const specLimitY = typeof dynamicLimit === 'number' ? getY(dynamicLimit) : -100;

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
                value={activeComponent.id || ''}
                onChange={(e) => setSelectedComponentId(e.target.value)}
              >
                {components.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} ({c.status || 'NORMAL'})
                  </option>
                ))}
              </select>
            </div>

            <div className="spad-comp-selector-group">
              <label htmlFor="param-select" className="spad-comp-select-label">
                Parameter:
              </label>
              <select
                id="param-select"
                className="spad-comp-select-input"
                value={activeSpec.key || activeSpec.id}
                onChange={(e) => setSelectedParamKey(e.target.value)}
              >
                {availableParams.map((param) => {
                  const pKey = param.key || param.id;
                  return (
                    <option key={pKey} value={pKey}>
                      {param.name}
                    </option>
                  );
                })}
              </select>
            </div>

            {/* Compact Component Summary derived from activeComponent data */}
            <div className="spad-comp-compact-summary">
              <span className="spad-summary-pill-id">{activeComponent.id}</span>
              <span className="spad-summary-pill-lot">Lot: {activeComponent.lotId}</span>
              <span
                className={`spad-summary-pill-status status-${selectedStatus.toLowerCase()}`}
              >
                Status: {selectedStatus}
              </span>
              <span className="spad-summary-pill-risk">
                AI Status: {activeComponent.aiStatus || (typeof activeComponent.aiAssessment === 'string' ? activeComponent.aiAssessment : activeComponent.aiAssessment?.overallStatus) || 'NOT_EVALUATED'}
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
                value={activeSpec.key || activeSpec.id}
                onChange={(e) => setSelectedParamKey(e.target.value)}
              >
                {availableParams.map((param) => {
                  const pKey = param.key || param.id;
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
            {typeof dynamicLimit === 'number' ? dynamicLimit.toFixed(2) : '—'}{' '}
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

          {/* Engineering Limit Line & Label */}
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
                LIMIT: {typeof dynamicLimit === 'number' ? dynamicLimit.toFixed(2) : '—'} {activeSpec.unit}
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

      {/* 4. Chart Legend */}
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
            {typeof dynamicLimit === 'number' && (
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
                  Engineering Limit ({dynamicLimit.toFixed(2)} {activeSpec.unit})
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
            {typeof dynamicLimit === 'number' && (
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
                  Engineering Limit ({dynamicLimit.toFixed(2)} {activeSpec.unit})
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
