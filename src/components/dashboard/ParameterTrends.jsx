import React, { useState } from 'react';

export default function ParameterTrends({ trendData }) {
  const [selectedParamKey, setSelectedParamKey] = useState('standby-current');
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const activeDataset = trendData[selectedParamKey] || trendData['standby-current'];

  const parameterOptions = [
    { key: 'standby-current', label: 'Standby Current (Iddq)', unit: 'mA' },
    { key: 'leakage-current', label: 'Leakage Current (I_leak)', unit: 'µA' },
    { key: 'propagation-delay', label: 'Propagation Delay (t_pd)', unit: 'ns' },
  ];

  // SVG Chart Dimensions & Scaling
  const width = 860;
  const height = 300;
  const padding = { top: 30, right: 140, bottom: 45, left: 65 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Compute Y Min and Max
  const allValues = [];
  activeDataset.series.forEach((s) => allValues.push(...s.data));
  allValues.push(activeDataset.specLimitMax);
  const minVal = Math.min(...allValues) * 0.8;
  const maxVal = Math.max(...allValues) * 1.15;

  const getX = (index) => padding.left + (index / (activeDataset.checkpoints.length - 1)) * chartW;
  const getY = (val) => padding.top + chartH - ((val - minVal) / (maxVal - minVal)) * chartH;

  // Spec Limit Line Y
  const specLimitY = getY(activeDataset.specLimitMax);

  // Y-axis Ticks (5 steps)
  const yTicks = [0, 1, 2, 3, 4].map((step) => {
    const val = minVal + ((maxVal - minVal) * step) / 4;
    return { val: val.toFixed(2), y: getY(val) };
  });

  return (
    <div className="spad-card spad-trends-card">
      <div className="spad-card-header spad-trends-header">
        <div className="spad-card-title-group">
          <span className="spad-card-section-label">PARAMETRIC TELEMETRY DYNAMICS</span>
          <h2 className="spad-card-title">Parameter Trends</h2>
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

      <div className="spad-trends-meta-bar">
        <span className="spad-trends-desc">{activeDataset.description}</span>
        <span className="spad-spec-badge">
          MAX SPEC LIMIT: <strong>{activeDataset.specLimitMax} {activeDataset.unit}</strong>
        </span>
      </div>

      {/* Interactive SVG Chart Container */}
      <div className="spad-chart-wrapper">
        <svg 
          className="spad-trend-svg" 
          viewBox={`0 0 ${width} ${height}`} 
          preserveAspectRatio="xMidYMid meet"
          aria-label={`Chart for ${activeDataset.name}`}
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
          {activeDataset.checkpoints.map((cp, i) => {
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
            {activeDataset.name} [{activeDataset.unit}]
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
                width="96"
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
                LIMIT: {activeDataset.specLimitMax} {activeDataset.unit}
              </text>
            </g>
          )}

          {/* Trajectory Series Lines */}
          {activeDataset.series.map((series, sIndex) => {
            const points = series.data.map((val, idx) => `${getX(idx)},${getY(val)}`).join(' ');
            const isAnomaly = series.type === 'anomaly';
            const isNominal = series.type === 'nominal';

            return (
              <g key={series.name}>
                <polyline
                  fill="none"
                  stroke={series.color}
                  strokeWidth={isAnomaly || isNominal ? '2.4' : '1.4'}
                  strokeDasharray={series.type === 'nominal-upper' ? '4 3' : 'none'}
                  points={points}
                />

                {/* Data Points on Nodes */}
                {series.data.map((val, idx) => {
                  const cx = getX(idx);
                  const cy = getY(val);
                  const pointKey = `${sIndex}-${idx}`;
                  const isHovered = hoveredPoint && hoveredPoint.key === pointKey;

                  return (
                    <g key={pointKey}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHovered ? 5.5 : 3.5}
                        fill={series.color}
                        stroke="#070b14"
                        strokeWidth="1.5"
                        style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                        onMouseEnter={() => setHoveredPoint({ key: pointKey, seriesName: series.name, val, checkpoint: activeDataset.checkpoints[idx], unit: activeDataset.unit, cx, cy })}
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
            <g transform={`translate(${Math.min(hoveredPoint.cx + 10, width - 160)}, ${Math.max(hoveredPoint.cy - 45, 10)})`}>
              <rect
                width="150"
                height="42"
                rx="4"
                fill="#0b1324"
                stroke="rgba(56, 189, 248, 0.4)"
                strokeWidth="1"
                filter="drop-shadow(0 4px 12px rgba(0,0,0,0.6))"
              />
              <text x="8" y="16" fill="#f8fafc" fontSize="10" fontWeight="700" fontFamily="var(--font-mono)">
                {hoveredPoint.checkpoint}: {hoveredPoint.val} {hoveredPoint.unit}
              </text>
              <text x="8" y="30" fill="#94a3b8" fontSize="8.5" fontFamily="var(--font-sans)">
                {hoveredPoint.seriesName.slice(0, 24)}...
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* Chart Legend */}
      <div className="spad-chart-legend">
        {activeDataset.series.map((series) => (
          <div key={series.name} className="spad-legend-item">
            <span
              className="spad-legend-dot"
              style={{
                backgroundColor: series.color,
                borderStyle: series.type === 'nominal-upper' ? 'dashed' : 'solid',
              }}
            />
            <span className="spad-legend-label">{series.name}</span>
          </div>
        ))}
        <div className="spad-legend-item">
          <span className="spad-legend-dot" style={{ backgroundColor: '#ef4444', borderStyle: 'dashed' }} />
          <span className="spad-legend-label">Max Engineering Limit</span>
        </div>
      </div>
    </div>
  );
}
