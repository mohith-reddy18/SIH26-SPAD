import React, { useState, useEffect, useMemo } from 'react';
import { mockParameterSpecs } from '../data/mockData';
import './Dashboard.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

function getStatusColor(status) {
  if (status === 'NORMAL' || status === 'PASS') return '#10b981';
  if (status === 'SUSPECT' || status === 'HOLD') return '#f59e0b';
  if (status === 'CRITICAL' || status === 'REJECT') return '#ef4444';
  return '#38bdf8';
}

import { mapScreeningRecord, getNormalizedEngineeringStatus } from '../utils/recordMapping';

export default function Reports() {
  const [screeningRecords, setScreeningRecords] = useState([]);
  const [reportType, setReportType] = useState('component'); // 'component' | 'lot'
  const [selectedComponentId, setSelectedComponentId] = useState('C-0001');
  const [selectedLotId, setSelectedLotId] = useState('LOT-2026-001');
  const [dataSource, setDataSource] = useState('fallback'); // 'api' | 'fallback'
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch screening records from backend API
  useEffect(() => {
    let isMounted = true;

    async function loadReportsData() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/screening`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.data) && result.data.length > 0) {
            if (isMounted) {
              setScreeningRecords(result.data);
              setDataSource('api');
              const firstId = result.data[0].componentId || result.data[0].id || 'C-0001';
              const firstLot = result.data[0].lotId || 'LOT-2026-001';
              setSelectedComponentId((prev) => prev || firstId);
              setSelectedLotId((prev) => prev || firstLot);
            }
            return;
          }
        }
        if (isMounted) {
          setDataSource('empty');
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[SPAD] Failed to fetch screening records from backend:', err.message);
          setFetchError(err.message);
          setDataSource('offline');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadReportsData();

    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Lot grouping
  const lotsMap = useMemo(() => {
    const map = {};
    screeningRecords.forEach((rec) => {
      const lot = rec.lotId || 'LOT-UNKNOWN';
      if (!map[lot]) map[lot] = [];
      map[lot].push(mapScreeningRecord(rec));
    });
    return map;
  }, [screeningRecords]);

  const availableLots = useMemo(() => Object.keys(lotsMap), [lotsMap]);

  // 3. Active component resolution
  const activeComponent = useMemo(() => {
    if (screeningRecords.length > 0) {
      const match = screeningRecords.find(
        (r) => (r.componentId || r.id) === selectedComponentId
      );
      if (match) return mapScreeningRecord(match);
      return mapScreeningRecord(screeningRecords[0]);
    }
    return null;
  }, [screeningRecords, selectedComponentId]);

  const componentId = activeComponent?.componentId || activeComponent?.id || '—';
  const lotId = activeComponent?.lotId || '—';
  const stage = activeComponent?.stage || '—';
  const engineeringStatus = activeComponent?.engineeringStatus || 'NORMAL';
  const aiStatus = activeComponent?.aiStatus || 'NOT_EVALUATED';
  const aiRisk = activeComponent?.aiRisk || 0;
  const riskScore = activeComponent?.riskScore || 0;

  const measurements = activeComponent?.measurements || {};
  const predictions = activeComponent?.predictions || {};
  const engineeringLimits = activeComponent?.engineeringLimits || {};
  const aiAssessment = activeComponent?.aiAssessment || {};
  const modelExplanation = activeComponent?.modelExplanation || null;

  // 4. Lot report metrics
  const activeLotRecords = lotsMap[selectedLotId] || (lotsMap[availableLots[0]] || []);
  const lotTotalUnits = activeLotRecords.length;
  const lotNormalUnits = activeLotRecords.filter((r) => r.engineeringStatus === 'NORMAL').length;
  const lotSuspectUnits = activeLotRecords.filter((r) => r.engineeringStatus === 'SUSPECT').length;
  const lotCriticalUnits = activeLotRecords.filter((r) => r.engineeringStatus === 'CRITICAL').length;
  const lotYield = lotTotalUnits > 0 ? ((lotNormalUnits / lotTotalUnits) * 100).toFixed(1) : '100.0';

  // Export JSON handler
  const handleExportJSON = () => {
    const exportData = reportType === 'component' ? activeComponent : { lotId: selectedLotId, summary: { total: lotTotalUnits, normal: lotNormalUnits, suspect: lotSuspectUnits, critical: lotCriticalUnits, yield: lotYield }, records: activeLotRecords };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SPAD_Report_${reportType}_${reportType === 'component' ? componentId : selectedLotId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="spad-page-container">
      {/* 1. Page Header */}
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">Reports &amp; Compliance</h1>
          <span className="spad-page-tag">AUDIT &amp; MIL-STD CERTIFICATION</span>
        </div>
        <p className="spad-page-description">
          Formal space-grade screening compliance reports, physical burn-in telemetry audit records, and early AI 168h predictive qualification certificates.
        </p>
      </header>

      {/* 2. Control Bar & Report Mode Selector */}
      <div className="spad-card" style={{ padding: '16px 20px', marginBottom: '20px' }}>
        <div className="spad-trends-component-controls" style={{ flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
          {/* Mode Switcher */}
          <div className="spad-mode-tabs" role="group" aria-label="Report Type">
            <button
              type="button"
              className={`spad-mode-btn ${reportType === 'component' ? 'active' : ''}`}
              onClick={() => setReportType('component')}
            >
              Component Audit Certificate
            </button>
            <button
              type="button"
              className={`spad-mode-btn ${reportType === 'lot' ? 'active' : ''}`}
              onClick={() => setReportType('lot')}
            >
              Lot Compliance Summary
            </button>
          </div>

          {/* Dynamic Dropdowns */}
          {reportType === 'component' ? (
            <div className="spad-comp-selector-group">
              <label htmlFor="report-comp-select" className="spad-comp-select-label">
                Component:
              </label>
              <select
                id="report-comp-select"
                className="spad-comp-select-input"
                value={componentId}
                onChange={(e) => setSelectedComponentId(e.target.value)}
              >
                {screeningRecords.map(
                  (c) => {
                    const id = c.componentId || c.id;
                    const cStat = c.engineeringStatus || c.status || 'NORMAL';
                    return (
                      <option key={id} value={id}>
                        {id} ({cStat})
                      </option>
                    );
                  }
                )}
              </select>
            </div>
          ) : (
            <div className="spad-comp-selector-group">
              <label htmlFor="report-lot-select" className="spad-comp-select-label">
                Lot:
              </label>
              <select
                id="report-lot-select"
                className="spad-comp-select-input"
                value={selectedLotId}
                onChange={(e) => setSelectedLotId(e.target.value)}
              >
                {availableLots.map((l) => (
                  <option key={l} value={l}>
                    {l} ({lotsMap[l]?.length || 0} Units)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
            <button
              type="button"
              className="spad-mode-btn"
              onClick={handleExportJSON}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Export JSON
            </button>
            <button
              type="button"
              className="spad-mode-btn active"
              onClick={handlePrint}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Print / PDF
            </button>
          </div>

          <span className="spad-spec-badge">
            DATA SOURCE: <strong>{dataSource === 'api' ? 'MONGODB ATLAS' : dataSource === 'offline' ? 'OFFLINE' : 'EMPTY'}</strong>
          </span>
        </div>
      </div>

      {/* 3. REPORT CONTENT CONTAINER */}
      {isLoading ? (
        <div className="spad-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          Loading screening report from MongoDB Atlas...
        </div>
      ) : !activeComponent && reportType === 'component' ? (
        <div className="spad-card" style={{ padding: '30px', textAlign: 'center', color: '#94a3b8' }}>
          {fetchError ? `Backend API connection error: ${fetchError}` : 'No screening component records found in database.'}
        </div>
      ) : reportType === 'component' ? (
        /* COMPONENT AUDIT REPORT */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Certificate Header Banner */}
          <div className="spad-card" style={{ padding: '24px', borderLeft: '4px solid #38bdf8' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <span className="spad-card-section-label font-mono">MIL-STD-883 CLASS-S CERTIFICATE</span>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f8fafc', margin: '4px 0 8px 0' }}>
                  Component Screening Audit: <span className="text-cyan">{componentId}</span>
                </h2>
                <div style={{ display: 'flex', gap: '14px', fontSize: '13px', color: '#94a3b8' }}>
                  <span>Active Lot: <strong style={{ color: '#f8fafc' }}>{lotId}</strong></span>
                  <span>Physical Stage: <strong style={{ color: '#f8fafc' }}>{stage}</strong></span>
                  <span>Standard: <strong style={{ color: '#f8fafc' }}>MIL-STD-883 / MIL-PRF-38535</strong></span>
                </div>
              </div>

              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-end' }}>
                <span className="spad-status-pill" style={{ fontSize: '13px', padding: '6px 14px', backgroundColor: getStatusColor(engineeringStatus) + '20', color: getStatusColor(engineeringStatus), borderColor: getStatusColor(engineeringStatus) + '60' }}>
                  ENGINEERING: {engineeringStatus}
                </span>
                <span className="spad-status-pill" style={{ fontSize: '12px', padding: '4px 12px', backgroundColor: (aiStatus === 'FLAGGED' ? '#f59e0b20' : '#10b98120'), color: (aiStatus === 'FLAGGED' ? '#fbbf24' : '#34d399'), borderColor: (aiStatus === 'FLAGGED' ? '#f59e0b60' : '#10b98160') }}>
                  AI STATUS: {aiStatus}
                </span>
                <div className="font-mono" style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  AI RISK SCORE: {riskScore} ({aiRisk}%)
                </div>
              </div>
            </div>
          </div>

          {/* Parametric Measurements & Limits Table */}
          <div className="spad-card" style={{ padding: '20px' }}>
            <div className="spad-card-header">
              <div className="spad-card-title-group">
                <span className="spad-card-section-label">TELEMETRY AUDIT</span>
                <h3 className="spad-card-title">Parametric Test Checkpoints vs. MIL-STD Limits</h3>
              </div>
            </div>

            <div className="spad-table-container" style={{ marginTop: '12px' }}>
              <table className="spad-data-table" aria-label="Component Parameters">
                <thead>
                  <tr>
                    <th>PARAMETER NAME</th>
                    <th>0h (ROOM/HOT)</th>
                    <th>24h (EARLY)</th>
                    <th>96h (CURRENT)</th>
                    <th>168h (AI PREDICTED)</th>
                    <th>SPEC LIMIT (MAX)</th>
                    <th>SAFETY MARGIN</th>
                    <th>STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(measurements).map((key) => {
                    const matched = mockParameterSpecs[key] || {};
                    const name = matched.name || (key === 'iddq' ? 'Standby Current (Iddq)' : key === 'leakage' ? 'Leakage Current (I_leak)' : key === 'propDelay' ? 'Propagation Delay (t_pd)' : key);
                    const unit = matched.unit || (key === 'iddq' ? 'mA' : key === 'leakage' ? 'µA' : key === 'propDelay' ? 'ns' : '');
                    const series = measurements[key] || [];
                    const obs0h = series[0];
                    const obs24h = series[1];
                    const obs96h = series[2];
                    const predVal = predictions[`${key}_168h`] ?? series[series.length - 1];
                    const limitVal = engineeringLimits[key] ?? matched.specLimitMax;
                    const margin = typeof limitVal === 'number' && typeof predVal === 'number' ? (limitVal - predVal).toFixed(2) : '—';
                    const isBreached = typeof limitVal === 'number' && typeof predVal === 'number' && predVal > limitVal;

                    return (
                      <tr key={key} className="spad-table-row">
                        <td className="spad-td-mono font-bold text-cyan">{name}</td>
                        <td className="spad-td-mono">{obs0h !== undefined ? `${obs0h} ${unit}` : '—'}</td>
                        <td className="spad-td-mono">{obs24h !== undefined ? `${obs24h} ${unit}` : '—'}</td>
                        <td className="spad-td-mono">{obs96h !== undefined ? `${obs96h} ${unit}` : '—'}</td>
                        <td className="spad-td-mono font-bold" style={{ color: '#38bdf8' }}>{predVal !== undefined ? `${predVal} ${unit}` : '—'}</td>
                        <td className="spad-td-mono" style={{ color: '#f87171', fontWeight: '700' }}>{limitVal !== undefined ? `${limitVal} ${unit}` : '—'}</td>
                        <td className="spad-td-mono" style={{ color: isBreached ? '#ef4444' : '#10b981' }}>{margin !== '—' ? `+${margin} ${unit}` : '—'}</td>
                        <td>
                          <span className={`spad-status-pill ${isBreached ? 'badge-status-critical' : 'badge-status-normal'}`}>
                            {isBreached ? 'EXCEEDS LIMIT' : 'WITHIN LIMIT'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* AI Explainability & Anomaly Evidence Audit Box */}
          <div className="spad-two-col-grid">
            <div className="spad-card" style={{ padding: '20px' }}>
              <div className="spad-card-header">
                <div className="spad-card-title-group">
                  <span className="spad-card-section-label">AI REASONING AUDIT</span>
                  <h3 className="spad-card-title">Early Anomaly Flagging</h3>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Population Abnormality:</span>
                  <span className="font-mono" style={{ color: anomalies.populationAbnormality ? '#f59e0b' : '#10b981', fontWeight: '700' }}>
                    {anomalies.populationAbnormality ? 'FLAGGED (Outlier)' : 'NOMINAL (Within Bounds)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Trajectory Abnormality:</span>
                  <span className="font-mono" style={{ color: anomalies.trajectoryAbnormality ? '#f59e0b' : '#10b981', fontWeight: '700' }}>
                    {anomalies.trajectoryAbnormality ? 'FLAGGED (Drift)' : 'NOMINAL (Linear)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(56, 189, 248, 0.04)', borderRadius: '4px' }}>
                  <span style={{ fontSize: '13px', color: '#94a3b8' }}>Future-Risk Projection:</span>
                  <span className="font-mono" style={{ color: '#38bdf8', fontWeight: '700' }}>
                    {typeof anomalies.futureRiskPrediction === 'string' ? anomalies.futureRiskPrediction : `${aiRisk}% Risk`}
                  </span>
                </div>
              </div>
            </div>

            <div className="spad-card" style={{ padding: '20px' }}>
              <div className="spad-card-header">
                <div className="spad-card-title-group">
                  <span className="spad-card-section-label">SHAP ATTRIBUTION LOG</span>
                  <h3 className="spad-card-title">Top Risk Feature Contributions</h3>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px' }}>
                {(modelExplanation.features || []).slice(0, 4).map((f, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '4px', fontSize: '12px' }}>
                    <span style={{ color: '#f8fafc' }}>{f.name}</span>
                    <span className="font-mono" style={{ color: f.shapValue >= 0 ? '#f87171' : '#34d399', fontWeight: '700' }}>
                      {f.shapValue >= 0 ? `+${f.shapValue.toFixed(2)}` : f.shapValue.toFixed(2)}
                    </span>
                  </div>
                ))}
                <p style={{ fontSize: '11px', color: '#64748b', margin: '4px 0 0 0', lineHeight: '1.4' }}>
                  {modelExplanation.summaryText}
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* LOT COMPLIANCE SUMMARY REPORT */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Lot Header Banner */}
          <div className="spad-card" style={{ padding: '24px', borderLeft: '4px solid #10b981' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
              <div>
                <span className="spad-card-section-label font-mono">LOT QUALIFICATION SUMMARY</span>
                <h2 style={{ fontSize: '20px', fontWeight: '800', color: '#f8fafc', margin: '4px 0 8px 0' }}>
                  Screening Lot Report: <span className="text-cyan">{selectedLotId}</span>
                </h2>
                <div style={{ display: 'flex', gap: '14px', fontSize: '13px', color: '#94a3b8' }}>
                  <span>Total Screened Units: <strong style={{ color: '#f8fafc' }}>{lotTotalUnits}</strong></span>
                  <span>Predicted Yield: <strong style={{ color: '#10b981' }}>{lotYield}%</strong></span>
                  <span>Chamber: <strong style={{ color: '#f8fafc' }}>CHAMBER-B4-RAD (125°C)</strong></span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <div style={{ padding: '8px 14px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#34d399', fontWeight: '700' }}>NORMAL</div>
                  <div className="font-mono" style={{ fontSize: '16px', color: '#f8fafc', fontWeight: '800' }}>{lotNormalUnits}</div>
                </div>
                <div style={{ padding: '8px 14px', background: 'rgba(245, 158, 11, 0.1)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#fbbf24', fontWeight: '700' }}>SUSPECT</div>
                  <div className="font-mono" style={{ fontSize: '16px', color: '#f8fafc', fontWeight: '800' }}>{lotSuspectUnits}</div>
                </div>
                <div style={{ padding: '8px 14px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '4px', textAlign: 'center' }}>
                  <div style={{ fontSize: '10px', color: '#f87171', fontWeight: '700' }}>CRITICAL</div>
                  <div className="font-mono" style={{ fontSize: '16px', color: '#f8fafc', fontWeight: '800' }}>{lotCriticalUnits}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Lot Component Roster Table */}
          <div className="spad-card" style={{ padding: '20px' }}>
            <div className="spad-card-header">
              <div className="spad-card-title-group">
                <span className="spad-card-section-label">UNIT ROSTER</span>
                <h3 className="spad-card-title">Components in Lot {selectedLotId}</h3>
              </div>
            </div>

            <div className="spad-table-container" style={{ marginTop: '12px' }}>
              <table className="spad-data-table" aria-label="Lot Component Roster">
                <thead>
                  <tr>
                    <th>COMPONENT ID</th>
                    <th>STAGE</th>
                    <th>STANDBY (Iddq)</th>
                    <th>LEAKAGE (I_leak)</th>
                    <th>PROP DELAY (t_pd)</th>
                    <th>AI RISK</th>
                    <th>EVIDENCE</th>
                    <th>ENGINEERING STATUS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeLotRecords.map((item) => {
                    const cId = item.componentId || item.id;
                    const cStage = item.stage || '96h';
                    const cRisk = typeof item.aiRisk === 'number' ? item.aiRisk : 0;
                    const cStatus = item.engineeringStatus || item.status || 'NORMAL';
                    const cEvidence = item.evidence || 'Within Expected Range';
                    const iddqVal = item.measurements?.iddq ? item.measurements.iddq[item.measurements.iddq.length - 1] + ' mA' : item.standbyCurrent || '—';
                    const leakVal = item.measurements?.leakage ? item.measurements.leakage[item.measurements.leakage.length - 1] + ' µA' : item.leakageCurrent || '—';
                    const propVal = item.measurements?.propDelay ? item.measurements.propDelay[item.measurements.propDelay.length - 1] + ' ns' : item.propagationDelay || '—';

                    return (
                      <tr key={cId} className="spad-table-row" onClick={() => { setSelectedComponentId(cId); setReportType('component'); }}>
                        <td className="spad-td-mono font-bold text-cyan">{cId}</td>
                        <td className="spad-td-mono">{cStage}</td>
                        <td className="spad-td-mono">{iddqVal}</td>
                        <td className="spad-td-mono">{leakVal}</td>
                        <td className="spad-td-mono">{propVal}</td>
                        <td className="spad-td-mono font-bold" style={{ color: cRisk > 75 ? '#ef4444' : cRisk > 40 ? '#f59e0b' : '#10b981' }}>{cRisk}%</td>
                        <td className="spad-td-evidence"><span className="spad-evidence-pill">{cEvidence}</span></td>
                        <td>
                          <span className={`spad-status-pill ${cStatus === 'CRITICAL' ? 'badge-status-critical' : cStatus === 'SUSPECT' ? 'badge-status-suspect' : 'badge-status-normal'}`}>
                            {cStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 4. Military/Space-Grade Compliance Footer Note */}
      <div className="spad-card" style={{ padding: '16px 20px', marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <span className="font-mono" style={{ fontSize: '11px', color: '#64748b' }}>
            AUDIT COMPLIANCE: MIL-STD-883 Method 1015 / MIL-PRF-38535 Space Level Verification
          </span>
          <span className="font-mono" style={{ fontSize: '11px', color: '#38bdf8' }}>
            SPAD AI Screening Engine v1.0 &bull; Database Synced
          </span>
        </div>
      </div>
    </div>
  );
}
