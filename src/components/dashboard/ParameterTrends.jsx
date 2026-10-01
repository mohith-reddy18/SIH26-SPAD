import React, { useState, useEffect, useMemo } from 'react';
import { mockScreeningContext } from '../../data/mockData';
import { getParameterMeta, extractPredictedValue } from '../../utils/recordMapping';
import { API_BASE_URL } from '../../config/api';

// Helper for semantic status colors
function getStatusColor(status) {
  if (status === 'NORMAL' || status === 'PASS') return '#22C55E';
  if (status === 'SUSPECT' || status === 'HOLD') return '#f59e0b';
  if (status === 'CRITICAL' || status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

// Helper to extract observed checkpoints and optional AI predicted trajectory mapped explicitly by time key
function extractTrajectory(data, predictionVal) {
  let v0 = null;
  let v24 = null;
  let v96 = null;
  let v168 = (typeof predictionVal === 'number' && !isNaN(predictionVal)) ? predictionVal : null;

  if (typeof data === 'number' && !isNaN(data)) {
    v0 = data;
  } else if (Array.isArray(data)) {
    if (typeof data[0] === 'number' && !isNaN(data[0])) v0 = data[0];
    if (typeof data[1] === 'number' && !isNaN(data[1])) v24 = data[1];
    if (data.length >= 4) {
      if (typeof data[2] === 'number' && !isNaN(data[2])) v96 = data[2];
      if (typeof data[3] === 'number' && !isNaN(data[3])) v168 = data[3];
    } else if (data.length === 3) {
      if (typeof data[2] === 'number' && !isNaN(data[2])) v168 = data[2];
    }
  } else if (data && typeof data === 'object') {
    const raw0 = data['0h'] ?? data['0hr'] ?? data['0H'] ?? data['0%'] ?? data['RDS0'] ?? data['rds0'];
    const raw24 = data['24h'] ?? data['24hr'] ?? data['24H'] ?? data['33%'] ?? data['33.3%'] ?? data['33.33%'] ?? data['RDS33'] ?? data['rds33'];
    const raw96 = data['96h'] ?? data['96hr'] ?? data['96H'] ?? data['66%'] ?? data['66.7%'] ?? data['66.67%'] ?? data['RDS96'] ?? data['rds96'];
    const raw168 = data['168h'] ?? data['168hr'] ?? data['168H'] ?? data['100%'] ?? data['RDS168'] ?? data['rds168'];

    if (typeof raw0 === 'number' && !isNaN(raw0)) v0 = raw0;
    if (typeof raw24 === 'number' && !isNaN(raw24)) v24 = raw24;
    if (typeof raw96 === 'number' && !isNaN(raw96)) v96 = raw96;
    if (typeof raw168 === 'number' && !isNaN(raw168)) v168 = raw168;
  }

  // Explicit 4-slot checkpoint array mapped 1-to-1 to:
  // index 0 -> 0hr (0% [OBSERVED])
  // index 1 -> 24hr (33.3% [OBSERVED])
  // index 2 -> 96hr (66.7% [PREDICTED]) -- only if explicitly present
  // index 3 -> 168hr (100% [PREDICTED]) -- 168h regression forecast
  return [v0, v24, v96, v168];
}

export default function ParameterTrends({
  components = [],
  context = mockScreeningContext,
}) {
  // 1. Interactive State Management (Component-specific only)
  const [selectedComponentId, setSelectedComponentId] = useState(
    () => components?.[0]?.id || components?.[0]?.componentId || ''
  );
  const [selectedParamKey, setSelectedParamKey] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hoveredLegendId, setHoveredLegendId] = useState(null);

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

    const matchedComp = components.find((c) => (c.id || c.componentId) === targetId);
    const targetLotId = matchedComp?.lotId || context?.lotId || '';

    async function fetchComponentScreening() {
      setIsLoadingComp(true);
      setCompFetchError(null);
      try {
        const query = targetLotId ? `?lotId=${encodeURIComponent(targetLotId)}` : '';
        const response = await fetch(`${API_BASE_URL}/api/screening/${encodeURIComponent(targetId)}${query}`);
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
  }, [selectedComponentId, components, context?.lotId]);

  // Active Component resolution: Live API record primary, prop fallback secondary
  const activeComponent = useMemo(() => {
    const fallback = components.find((c) => (c.id || c.componentId) === selectedComponentId) || components[0] || {};
    if (liveComponentData) {
      return {
        ...fallback,
        ...liveComponentData,
        id: liveComponentData.componentId || liveComponentData.id || fallback.id || selectedComponentId,
        lotId: liveComponentData.lotId || fallback.lotId || 'NASA-MOSFET-199C',
        stage: liveComponentData.stage || fallback.stage || '168hr',
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
    const rawKeys = [
      ...Object.keys(activeComponent.measurements || {}),
      ...Object.keys(activeComponent.engineeringLimits || {}),
      ...Object.keys(activeComponent.predictions || {}).map((k) => k.replace(/_168h$/, '')),
    ].filter(Boolean);

    // Ignore timepoint subfields and raw internal stage names that belong to rdson/other parameters
    const IGNORED_TIMEPOINT_KEYS = new Set([
      '0h', '24h', '96h', '168h', '0hr', '24hr', '96hr', '168hr',
      '0H', '24H', '96H', '168H', '0%', '33%', '33.3%', '33.33%', '66%', '66.7%', '66.67%', '100%',
      'RDS0', 'RDS33', 'RDS96', 'RDS168', 'rds0', 'rds33', 'rds96', 'rds168',
      'Forecast_Residual', 'Absolute_Forecast_Error', 'Relative_Error_Percent', 'Delta_RDS_0_33',
    ]);

    const validKeys = rawKeys.filter((k) => !IGNORED_TIMEPOINT_KEYS.has(k));
    const uniqueKeys = Array.from(new Set(validKeys));

    if (uniqueKeys.length > 0) {
      const seenKeys = new Set();
      const seenNames = new Set();
      const result = [];

      for (const key of uniqueKeys) {
        const limit = activeComponent.engineeringLimits?.[key];
        const meta = getParameterMeta(key, limit);
        if (!seenKeys.has(meta.key) && !seenNames.has(meta.name)) {
          seenKeys.add(meta.key);
          seenNames.add(meta.name);
          result.push(meta);
        }
      }

      return result.length > 0 ? result : [getParameterMeta('rdson', activeComponent.engineeringLimits?.rdson)];
    }

    return [getParameterMeta('rdson', activeComponent.engineeringLimits?.rdson)];
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

  // 6. Selected Component Status & Trajectory Data Points
  const selectedStatus = activeComponent.status || 'NORMAL';
  const currentLotId = context?.lotId || activeComponent.lotId || 'NASA-MOSFET-199C';

  const rawCompData =
    activeComponent.measurements?.[activeSpec.key] ||
    activeComponent.measurements?.[activeSpec.id] ||
    [];

  const compData = useMemo(() => {
    return extractTrajectory(rawCompData, dynamicPrediction);
  }, [rawCompData, dynamicPrediction]);

  // 7. Trajectory Series Construction (Component + Healthy Reference Baseline)
  const healthyTrajectory = activeSpec.healthyRef && activeSpec.healthyRef.length > 0
    ? extractTrajectory(activeSpec.healthyRef)
    : [];

  const activeSeries = useMemo(() => {
    return [
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
  }, [activeComponent.id, selectedStatus, compData, healthyTrajectory]);

  // 8. SVG Chart Dimensions & Scaling
  const width = 860;
  const height = 300;
  const padding = { top: 30, right: 140, bottom: 45, left: 65 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Dynamic Y-axis Min and Max derived from active dataset and engineering limit
  const allValues = [];
  activeSeries.forEach((s) => {
    if (Array.isArray(s.data)) {
      s.data.forEach((v) => {
        if (typeof v === 'number' && !isNaN(v)) allValues.push(v);
      });
    }
  });

  const hasLimit = typeof dynamicLimit === 'number' && !isNaN(dynamicLimit);
  const dataMin = allValues.length > 0 ? Math.min(...allValues) : (hasLimit ? dynamicLimit : 0);
  const dataMax = allValues.length > 0 ? Math.max(...allValues) : (hasLimit ? dynamicLimit : 1);

  // Parameter-specific combined bounds (enclosing both real trajectory & engineering limit)
  let rawMin = hasLimit ? Math.min(dataMin, dynamicLimit) : dataMin;
  let rawMax = hasLimit ? Math.max(dataMax, dynamicLimit) : dataMax;
  const initialSpan = rawMax - rawMin;
  const centerVal = (rawMin + rawMax) / 2;

  // Sensible minimum span to prevent trajectory and limit from visually collapsing when values are tight
  const minSpanByMagnitude = Math.abs(centerVal || 1) * 0.025;
  const minAbsoluteSpan = 0.05;
  const targetSpan = Math.max(initialSpan, minSpanByMagnitude, minAbsoluteSpan);

  // If initial span is tighter than target span, center the expanded window
  if (initialSpan < targetSpan) {
    const diff = (targetSpan - initialSpan) / 2;
    rawMin -= diff;
    rawMax += diff;
  }

  // Dynamic padding above and below the combined range (10% of target span)
  const paddingSpan = targetSpan * 0.10;
  let minVal = rawMin - paddingSpan;
  let maxVal = rawMax + paddingSpan;

  // Prevent strictly non-negative parameters from showing negative lower axis if data/limit are non-negative
  if (dataMin >= 0 && (!hasLimit || dynamicLimit >= 0) && minVal < 0) {
    minVal = 0;
  }

  // Dynamic checkpoints: 0% [OBSERVED], 33.3% [OBSERVED], 66.7% [PREDICTED], 100% [PREDICTED]
  // Authoritative NASA V1 mapping: 0% -> 0hr, 33.3% -> 24hr, 66.7% -> 96hr, 100% -> 168hr
  const checkpoints = useMemo(
    () => [
      { key: '0hr', label: '0%', isPredicted: false, annotation: '[OBSERVED]' },
      { key: '24hr', label: '33.3%', isPredicted: false, annotation: '[OBSERVED]' },
      { key: '96hr', label: '66.7%', isPredicted: true, annotation: '[PREDICTED]' },
      { key: '168hr', label: '100%', isPredicted: true, annotation: '[PREDICTED]' },
    ],
    []
  );

  const getX = (index) => padding.left + (index / (Math.max(1, checkpoints.length - 1))) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal || 1)) * chartH;

  // Spec Limit Line Y coordinate
  const specLimitY = hasLimit ? getY(dynamicLimit) : -100;

  // Y-axis Ticks (5 evenly distributed steps) with parameter-adaptive precision
  const rangeSpan = maxVal - minVal;
  const tickDecimals = rangeSpan < 0.01 ? 4 : rangeSpan < 0.5 ? 3 : rangeSpan < 10 ? 2 : 1;
  const yTicks = [0, 1, 2, 3, 4].map((step) => {
    const val = minVal + (rangeSpan * step) / 4;
    return { val: val.toFixed(tickDecimals), y: getY(val) };
  });

  return (
    <div className="spad-card spad-trends-card">
      {/* 1. Header */}
      <div className="spad-card-header spad-trends-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">RANDOM FOREST — FUTURE PREDICTION</span>
          <h2 className="spad-card-title">Random Forest — Future Prediction</h2>
        </div>
      </div>

      {/* 2. Dynamic Control and Summary Meta Bar */}
      <div className="spad-trends-meta-bar">
        <div className="spad-trends-component-controls">
          <div className="spad-comp-selector-group">
            <label htmlFor="component-select" className="spad-comp-select-label">
              Component:
            </label>
            <select
              id="component-select"
              name="componentSelect"
              className="spad-comp-select-input"
              value={activeComponent.id || ''}
              onChange={(e) => setSelectedComponentId(e.target.value)}
            >
              {components.map((c) => {
                const cId = c.id || c.componentId;
                return (
                  <option key={cId} value={cId}>
                    {cId} ({c.status || 'NORMAL'})
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
              name="paramSelect"
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
            <span className="spad-summary-pill-lot">Lot: {activeComponent.lotId || currentLotId}</span>
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
            const isPredicted = cp.isPredicted;
            const stageAnnotation = cp.annotation;

            return (
              <g key={cp.key || cp.label || i}>
                <line
                  x1={x}
                  y1={padding.top}
                  x2={x}
                  y2={padding.top + chartH}
                  stroke={isPredicted ? 'rgba(56, 189, 248, 0.18)' : 'rgba(255, 255, 255, 0.06)'}
                  strokeDasharray={isPredicted ? '3 3' : 'none'}
                />
                <text
                  x={x}
                  y={padding.top + chartH + 16}
                  textAnchor="middle"
                  fill={isPredicted ? '#38bdf8' : '#f8fafc'}
                  fontSize="11"
                  fontWeight="700"
                  fontFamily="var(--font-mono)"
                >
                  {cp.label}
                </text>
                <text
                  x={x}
                  y={padding.top + chartH + 28}
                  textAnchor="middle"
                  fill={isPredicted ? 'rgba(56, 189, 248, 0.75)' : '#64748b'}
                  fontSize="8"
                  fontWeight="600"
                  fontFamily="var(--font-mono)"
                  letterSpacing="0.04em"
                >
                  {stageAnnotation}
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

          {/* 1. Reference Series Polylines (e.g. Healthy Reference) */}
          {activeSeries.filter((s) => !s.isComponent).map((series) => {
            const isHighlighted = hoveredLegendId === series.id;
            const isSubdued = hoveredLegendId && !isHighlighted;
            const validPoints = series.data
              .map((val, idx) => (typeof val === 'number' && !isNaN(val) ? { val, idx, x: getX(idx), y: getY(val) } : null))
              .filter(Boolean);

            const pointsString = validPoints.map((p) => `${p.x},${p.y}`).join(' ');

            return (
              <g key={series.id} style={{ transition: 'opacity 0.2s ease' }}>
                {pointsString && (
                  <polyline
                    fill="none"
                    stroke={series.color}
                    strokeWidth={isHighlighted ? 3.2 : (series.strokeWidth || 1.8)}
                    strokeOpacity={isSubdued ? 0.25 : (series.opacity !== undefined ? series.opacity : 1)}
                    strokeDasharray={series.dashed ? '4 3' : 'none'}
                    points={pointsString}
                  />
                )}

                {/* Reference Nodes */}
                {validPoints.map((pt) => {
                  const { val, idx, x: cx, y: cy } = pt;
                  const cpObj = checkpoints[idx] || {};
                  const isPredicted = Boolean(cpObj.isPredicted);
                  const cpLabel = cpObj.label || (isPredicted ? '100%' : '0%');
                  const pointKey = `${series.id}-${idx}`;
                  const isPointHovered = hoveredPoint && hoveredPoint.key === pointKey;

                  return (
                    <g key={pointKey}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isPointHovered ? 6 : (isHighlighted ? 4.5 : 3.5)}
                        fill={series.color}
                        fillOpacity={isSubdued ? 0.25 : 1}
                        stroke={series.color}
                        strokeOpacity={isSubdued ? 0.25 : 1}
                        strokeWidth={1.5}
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          setHoveredPoint({
                            key: pointKey,
                            componentId: series.componentId,
                            val: typeof val === 'number' ? val.toFixed(3) : val,
                            checkpoint: cpLabel,
                            isPredicted,
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

          {/* 2. Engineering Limit Line & Label (Rendered underneath component trajectory) */}
          {specLimitY >= padding.top && specLimitY <= padding.top + chartH && (
            <g style={{ transition: 'opacity 0.2s ease' }}>
              <line
                x1={padding.left}
                y1={specLimitY}
                x2={padding.left + chartW}
                y2={specLimitY}
                stroke="#ef4444"
                strokeWidth={hoveredLegendId === 'limit' ? 2.8 : 1.8}
                strokeDasharray="5 4"
                strokeOpacity={hoveredLegendId && hoveredLegendId !== 'limit' ? 0.35 : 0.85}
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
                fillOpacity={hoveredLegendId && hoveredLegendId !== 'limit' ? 0.45 : 1}
                strokeOpacity={hoveredLegendId && hoveredLegendId !== 'limit' ? 0.45 : 1}
              />
              <text
                x={padding.left + chartW + 12}
                y={specLimitY + 3}
                fill="#f87171"
                fillOpacity={hoveredLegendId && hoveredLegendId !== 'limit' ? 0.45 : 1}
                fontSize="9.5"
                fontWeight="700"
                fontFamily="var(--font-mono)"
              >
                LIMIT: {typeof dynamicLimit === 'number' ? dynamicLimit.toFixed(2) : '—'} {activeSpec.unit}
              </text>
            </g>
          )}

          {/* 3. Component Trajectory Polylines (Rendered ABOVE engineering limit for guaranteed z-index visibility) */}
          {activeSeries.filter((s) => s.isComponent).map((series) => {
            const isHighlighted = hoveredLegendId === series.id || hoveredLegendId === 'component';
            const isSubdued = hoveredLegendId && !isHighlighted;
            const validPoints = series.data
              .map((val, idx) => (typeof val === 'number' && !isNaN(val) ? { val, idx, x: getX(idx), y: getY(val) } : null))
              .filter(Boolean);

            const pointsString = validPoints.map((p) => `${p.x},${p.y}`).join(' ');

            return (
              <g key={series.id} style={{ transition: 'opacity 0.2s ease' }}>
                {pointsString && (
                  <polyline
                    fill="none"
                    stroke={series.color}
                    strokeWidth={isHighlighted ? 4.2 : 3.0}
                    strokeOpacity={isSubdued ? 0.25 : 1}
                    strokeDasharray={series.dashed ? '4 3' : 'none'}
                    points={pointsString}
                  />
                )}

                {/* Data Points on Nodes */}
                {validPoints.map((pt) => {
                  const { val, idx, x: cx, y: cy } = pt;
                  const cpObj = checkpoints[idx] || {};
                  const isPredicted = Boolean(cpObj.isPredicted);
                  const cpLabel = cpObj.label || (isPredicted ? '100%' : '0%');
                  const pointKey = `${series.id}-${idx}`;
                  const isPointHovered = hoveredPoint && hoveredPoint.key === pointKey;

                  return (
                    <g key={pointKey}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isPointHovered ? 6.5 : (isHighlighted ? 5.5 : 4.5)}
                        fill={isPredicted ? '#0b1324' : series.color}
                        fillOpacity={isSubdued ? 0.25 : 1}
                        stroke={series.color}
                        strokeOpacity={isSubdued ? 0.25 : 1}
                        strokeWidth={isHighlighted ? 3 : (isPredicted ? 2.5 : 1.8)}
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={(e) => {
                          e.stopPropagation();
                          setHoveredPoint({
                            key: pointKey,
                            componentId: series.componentId,
                            val: typeof val === 'number' ? val.toFixed(3) : val,
                            checkpoint: cpLabel,
                            isPredicted,
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

          {/* 4. Tooltip Overlay */}
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
                stroke={hoveredPoint.isPredicted ? 'rgba(56, 189, 248, 0.7)' : 'rgba(56, 189, 248, 0.35)'}
                strokeWidth="1"
                filter="drop-shadow(0 4px 12px rgba(0,0,0,0.7))"
              />
              <text x="10" y="15" fill="#38bdf8" fontSize="10.5" fontWeight="700" fontFamily="var(--font-mono)">
                {hoveredPoint.componentId === 'Healthy Reference'
                  ? 'Baseline Reference'
                  : `Component: ${hoveredPoint.componentId} ${hoveredPoint.isPredicted ? `(${hoveredPoint.checkpoint} Predicted)` : ''}`}
              </text>
              <text x="10" y="29" fill="#f8fafc" fontSize="10" fontWeight="600" fontFamily="var(--font-mono)">
                {hoveredPoint.checkpoint} {hoveredPoint.isPredicted ? '[AI Prediction]' : '[Observed]'} | {hoveredPoint.paramName}: {hoveredPoint.val} {hoveredPoint.unit}
              </text>
              <text x="10" y="44" fill="#94a3b8" fontSize="9" fontFamily="var(--font-mono)">
                {hoveredPoint.isPredicted ? `AI ${hoveredPoint.checkpoint} Status: ` : 'Status: '}
                <tspan fill={hoveredPoint.isPredicted ? '#38bdf8' : getStatusColor(hoveredPoint.status)} fontWeight="700">
                  {hoveredPoint.status}
                </tspan>
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* 5. Chart Legend with Interactive Hover Highlighting */}
      <div className="spad-chart-legend" aria-label="Chart Series Legend">
        {activeSeries.map((series) => (
          <div
            key={series.id}
            className={`spad-legend-item ${hoveredLegendId === series.id ? 'active-hover' : ''}`}
            onMouseEnter={() => setHoveredLegendId(series.id)}
            onMouseLeave={() => setHoveredLegendId(null)}
            style={{
              cursor: 'pointer',
              opacity: hoveredLegendId && hoveredLegendId !== series.id ? 0.45 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
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
            <span className="spad-legend-label" style={{ fontWeight: hoveredLegendId === series.id ? '700' : '500' }}>
              {series.label}
            </span>
          </div>
        ))}
        {typeof dynamicLimit === 'number' && (
          <div
            className={`spad-legend-item ${hoveredLegendId === 'limit' ? 'active-hover' : ''}`}
            onMouseEnter={() => setHoveredLegendId('limit')}
            onMouseLeave={() => setHoveredLegendId(null)}
            style={{
              cursor: 'pointer',
              opacity: hoveredLegendId && hoveredLegendId !== 'limit' ? 0.45 : 1,
              transition: 'opacity 0.2s ease',
            }}
          >
            <span
              className="spad-legend-dot"
              style={{
                width: '14px',
                height: '0px',
                borderTop: '2px dashed #ef4444',
                backgroundColor: 'transparent',
              }}
            />
            <span className="spad-legend-label" style={{ fontWeight: hoveredLegendId === 'limit' ? '700' : '500' }}>
              Engineering Limit ({dynamicLimit.toFixed(2)} {activeSpec.unit})
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
