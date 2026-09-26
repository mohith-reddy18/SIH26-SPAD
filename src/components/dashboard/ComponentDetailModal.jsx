import React, { useEffect } from 'react';
import { getParameterMeta, getNormalizedEngineeringStatus, getNormalizedAiStatus, formatStageLabel } from '../../utils/recordMapping';

// Helper for Engineering Status badge styles
function getEngineeringBadgeStyle(status) {
  const s = String(status || '').toUpperCase().trim();
  if (s === 'NORMAL' || s === 'PASS') {
    return { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#34d399' };
  }
  if (s === 'SUSPECT' || s === 'HOLD') {
    return { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24' };
  }
  if (s === 'CRITICAL' || s === 'REJECT') {
    return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#f87171' };
  }
  return { bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)', text: '#94a3b8' };
}

// Helper for AI Status badge styles
function getAiBadgeStyle(status) {
  const s = String(status || '').toUpperCase().trim();
  if (s === 'FLAGGED') {
    return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#f87171' };
  }
  if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED') {
    return { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#34d399' };
  }
  return { bg: 'rgba(148, 163, 184, 0.15)', border: 'rgba(148, 163, 184, 0.3)', text: '#94a3b8' };
}

// Deterministic Engineering Screening Decision Evaluation
export function evaluateComponentEngineeringDecision(measurements = {}, engineeringLimits = {}, explicitStatus = null) {
  const keys = Object.keys(measurements || {});
  const paramKeys = keys.length > 0 ? keys : Object.keys(engineeringLimits || {});

  if (paramKeys.length === 0) {
    return {
      decision: explicitStatus ? getNormalizedEngineeringStatus(explicitStatus) : 'NOT_EVALUATED',
      violatingParametersCount: 0,
      totalParametersCount: 0,
      evaluatedLimitCount: 0,
      reasonText: 'No parameter telemetry available.',
      parameters: [],
    };
  }

  const paramResults = [];
  let violatingCount = 0;
  let evaluatedLimitCount = 0;

  paramKeys.forEach((key) => {
    const rawLimit = engineeringLimits ? engineeringLimits[key] : null;
    const meta = getParameterMeta(key, rawLimit);
    const data = measurements ? measurements[key] : null;

    let specLimit = undefined;
    if (rawLimit !== undefined && rawLimit !== null) {
      if (typeof rawLimit === 'number') specLimit = rawLimit;
      else if (typeof rawLimit.limitValue === 'number') specLimit = rawLimit.limitValue;
      else if (typeof rawLimit.upper === 'number') specLimit = rawLimit.upper;
      else if (typeof rawLimit.max === 'number') specLimit = rawLimit.max;
    }

    const hasOfficialLimit = typeof specLimit === 'number' && !isNaN(specLimit);
    if (hasOfficialLimit) {
      evaluatedLimitCount += 1;
    }

    let maxObserved = null;
    let isViolated = false;

    if (Array.isArray(data) && data.length > 0) {
      const valid = data.filter((v) => typeof v === 'number' && !isNaN(v));
      if (valid.length > 0) maxObserved = Math.max(...valid);
      if (hasOfficialLimit) {
        isViolated = valid.some((val) => val > specLimit);
      }
    } else if (typeof data === 'number' && !isNaN(data)) {
      maxObserved = data;
      if (hasOfficialLimit) {
        isViolated = data > specLimit;
      }
    } else if (data && typeof data === 'object') {
      const vals = Object.values(data).filter((v) => typeof v === 'number' && !isNaN(v));
      if (vals.length > 0) {
        maxObserved = Math.max(...vals);
        if (hasOfficialLimit) {
          isViolated = vals.some((v) => v > specLimit);
        }
      }
    }

    if (isViolated) {
      violatingCount += 1;
    }

    paramResults.push({
      id: meta.id || key,
      key: meta.key || key,
      name: meta.name || key,
      shortName: meta.shortName || key,
      unit: meta.unit || '',
      limit: hasOfficialLimit ? specLimit : undefined,
      currentValue: maxObserved,
      isViolated,
      status: !hasOfficialLimit ? 'NOT EVALUATED' : isViolated ? 'EXCEEDS LIMIT' : 'WITHIN LIMIT',
    });
  });

  let decision = 'NOT_EVALUATED';
  if (explicitStatus) {
    decision = getNormalizedEngineeringStatus(explicitStatus);
  } else if (evaluatedLimitCount > 0) {
    if (violatingCount === 0) decision = 'NORMAL';
    else if (violatingCount === 1) decision = 'SUSPECT';
    else if (violatingCount >= 2) decision = 'CRITICAL';
  }

  let reasonText = '';
  if (evaluatedLimitCount === 0) {
    reasonText = 'No authoritative engineering specification limits configured for these parameters.';
  } else if (violatingCount === 0) {
    reasonText = `0 of ${paramResults.length} parameters exceed the engineering limit.`;
  } else if (violatingCount === 1) {
    const violatedParam = paramResults.find((p) => p.isViolated);
    reasonText = `1 of ${paramResults.length} parameters (${violatedParam ? violatedParam.shortName : 'parameter'}) exceeds the engineering limit.`;
  } else {
    reasonText = `${violatingCount} of ${paramResults.length} parameters exceed their engineering limits.`;
  }

  return {
    decision,
    violatingParametersCount: violatingCount,
    totalParametersCount: paramResults.length,
    evaluatedLimitCount,
    reasonText,
    parameters: paramResults,
  };
}

export default function ComponentDetailModal({
  component,
  isOpen,
  onClose,
  components = [],
  onSelectComponent,
}) {
  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !component) return null;

  const compId = component.id || component.componentId || 'UNKNOWN';
  const lotId = component.lotId || 'NASA-MOSFET-199C';
  const stage = component.stage || '24h';

  // 1. Engineering Screening Evaluation
  const engineeringResult = evaluateComponentEngineeringDecision(
    component.measurements,
    component.engineeringLimits,
    component.engineeringStatus || component.status
  );
  const engBadgeStyle = getEngineeringBadgeStyle(engineeringResult.decision);

  // 2. AI Assessment & Methods Extraction
  const aiAssessment = component.aiAssessment || {};
  const predictionObj = aiAssessment.prediction || (component.predictions ? { status: 'PREDICTED', parameters: component.predictions } : null);
  const lotAnomalyObj = aiAssessment.lotAnomaly || (component.anomalies ? { status: 'ANALYZED', parameters: component.anomalies } : null);

  // --------------------------------------------------------------------------
  // METHOD 1: Random Forest — Future Prediction Evidence
  // --------------------------------------------------------------------------
  const m1Params = predictionObj?.parameters || {};
  const m1Param = m1Params.rdson || Object.values(m1Params)[0] || {};

  const obs0h = component.measurements?.rdson?.['0h'] ??
                component.measurements?.rdson?.[0] ??
                (Array.isArray(component.measurements?.rdson) ? component.measurements?.rdson[0] : null) ??
                m1Param.observed?.['0h'] ??
                null;

  const obs24h = component.measurements?.rdson?.['24h'] ??
                 component.measurements?.rdson?.[1] ??
                 (Array.isArray(component.measurements?.rdson) ? component.measurements?.rdson[1] : null) ??
                 m1Param.observed?.['24h'] ??
                 null;

  const pred96h = (typeof m1Param.predicted96h === 'number') ? m1Param.predicted96h : null;
  const pred168h = (typeof m1Param.predicted168h === 'number')
    ? m1Param.predicted168h
    : (typeof m1Param === 'number')
    ? m1Param
    : (typeof component.predictions?.rdson === 'number')
    ? component.predictions.rdson
    : (typeof component.predictions?.rdson?.predicted168h === 'number')
    ? component.predictions.rdson.predicted168h
    : null;

  const m1Status = m1Param.status || predictionObj?.status || 'PREDICTED';
  const m1Flag = m1Param.aiFlag || (m1Param.status === 'FLAGGED' ? 'FLAGGED' : 'NOT FLAGGED');
  const m1BadgeStyle = getAiBadgeStyle(m1Flag);

  const roc = (typeof m1Param.rateOfChangePerHour === 'number')
    ? m1Param.rateOfChangePerHour
    : (obs0h !== null && obs24h !== null)
    ? Number(((obs24h - obs0h) / 24).toFixed(6))
    : null;

  const projMargin = (typeof m1Param.projectedMargin === 'number') ? m1Param.projectedMargin : null;
  const modelEvidence = m1Param.modelEvidence || {};
  const forecastResidual = (typeof modelEvidence.forecastResidual === 'number')
    ? modelEvidence.forecastResidual
    : (typeof component.forecastResidual === 'number')
    ? component.forecastResidual
    : null;
  const absForecastError = (typeof modelEvidence.absoluteForecastError === 'number')
    ? modelEvidence.absoluteForecastError
    : (typeof component.absoluteForecastError === 'number')
    ? component.absoluteForecastError
    : null;
  const forecastErrorRatio = (typeof modelEvidence.forecastErrorRatio === 'number')
    ? modelEvidence.forecastErrorRatio
    : (typeof component.forecastErrorRatio === 'number')
    ? component.forecastErrorRatio
    : null;
  const futureRiskScore = (typeof m1Param.futureRiskScore === 'number') ? m1Param.futureRiskScore : null;

  // --------------------------------------------------------------------------
  // METHOD 2: Isolation Forest — Lot-Level Anomaly Detection Evidence
  // --------------------------------------------------------------------------
  const m2Params = lotAnomalyObj?.parameters || {};
  const m2Param = m2Params.rdson || Object.values(m2Params)[0] || {};

  let rawIfScore = null;
  if (typeof m2Param.lotAnomalyScore === 'number') {
    rawIfScore = m2Param.lotAnomalyScore;
  } else if (typeof m2Param.peerComparisonEvidence?.rawScore === 'number') {
    rawIfScore = m2Param.peerComparisonEvidence.rawScore;
  } else if (typeof lotAnomalyObj?.score === 'number') {
    rawIfScore = lotAnomalyObj.score;
  } else if (typeof component.lotAnomalyScore === 'number') {
    rawIfScore = component.lotAnomalyScore;
  }

  const noveltyPercentile = (typeof m2Param.peerComparisonEvidence?.noveltyPercentile === 'number')
    ? m2Param.peerComparisonEvidence.noveltyPercentile
    : (typeof component.noveltyPercentile === 'number')
    ? component.noveltyPercentile
    : null;

  const peerZScore = (typeof m2Param.peerComparisonEvidence?.zScore === 'number')
    ? m2Param.peerComparisonEvidence.zScore
    : (typeof component.zScore === 'number')
    ? component.zScore
    : null;

  const peerReason = m2Param.peerComparisonEvidence?.reason ||
                     m2Param.peerComparisonEvidence?.summaryText ||
                     component.evidence ||
                     null;

  const divergenceType = m2Param.divergenceType || component.divergenceType || 'NOMINAL';

  const sameLotPeersCount = lotAnomalyObj?.eligiblePeersCount ??
                            Math.max(0, components.filter((c) => (c.lotId || lotId) === lotId).length - 1);

  const cohortQuality = lotAnomalyObj?.cohortQuality ||
                        (sameLotPeersCount >= 2 ? 'SUFFICIENT' : 'INSUFFICIENT');

  let m2Flag = 'NOT_EVALUATED';
  const rawM2Flag = m2Param.aiFlag || lotAnomalyObj?.overallStatus || component.anomalies?.aiFlag;
  if (rawM2Flag) {
    const s = String(rawM2Flag).toUpperCase().trim();
    if (s === 'FLAGGED') m2Flag = 'FLAGGED';
    else if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED' || s === 'ANALYZED' || s === 'NOMINAL' || s === 'NORMAL' || s === 'PASS') m2Flag = 'NOT FLAGGED';
  } else if (component.aiStatus) {
    const s = String(component.aiStatus).toUpperCase().trim();
    if (s === 'FLAGGED') m2Flag = 'FLAGGED';
    else if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED') m2Flag = 'NOT FLAGGED';
  }
  const m2BadgeStyle = getAiBadgeStyle(m2Flag);

  // --------------------------------------------------------------------------
  // SECTION 5: Combined Overall AI Status
  // --------------------------------------------------------------------------
  const overallAiStatus = getNormalizedAiStatus(component);
  const overallAiBadgeStyle = getAiBadgeStyle(overallAiStatus);

  // --------------------------------------------------------------------------
  // SECTION 6: Model Explanation (SHAP) — Render only if real features exist
  // --------------------------------------------------------------------------
  const explanation = aiAssessment.explanation || component.modelExplanation || null;
  const hasRealShap = Boolean(explanation && Array.isArray(explanation.features) && explanation.features.length > 0);
  const maxAbsShap = hasRealShap
    ? explanation.features.reduce((max, f) => Math.max(max, Math.abs(f.shapValue || 0)), 0.1)
    : 0.1;

  return (
    <div
      className="spad-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-component-title"
    >
      <div
        className="spad-modal-container"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '900px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div className="spad-modal-header">
          <div className="spad-modal-title-group">
            <div className="spad-modal-label-row">
              <span className="spad-card-section-label">SPACE-GRADE TELEMETRY AUDIT</span>
              <span className="spad-modal-lot-tag">LOT: {lotId}</span>
              <span className="spad-modal-stage-tag">STAGE: {formatStageLabel(stage)}</span>
            </div>
            <h2 id="modal-component-title" className="spad-modal-title">
              Detailed Component Analysis: <span className="text-cyan">{compId}</span>
            </h2>
          </div>

          <div className="spad-modal-header-actions">
            {/* Quick Component Switcher Dropdown */}
            {components && components.length > 0 && onSelectComponent && (
              <div className="spad-modal-switcher">
                <label htmlFor="modal-comp-select" className="spad-modal-switcher-label">
                  Switch:
                </label>
                <select
                  id="modal-comp-select"
                  className="spad-comp-select-input"
                  value={compId}
                  onChange={(e) => {
                    const target = components.find((c) => (c.id || c.componentId) === e.target.value);
                    if (target) onSelectComponent(target);
                  }}
                >
                  {components.map((c) => {
                    const cId = c.id || c.componentId;
                    const evalRes = evaluateComponentEngineeringDecision(c.measurements, c.engineeringLimits, c.engineeringStatus || c.status);
                    return (
                      <option key={cId} value={cId}>
                        {cId} ({evalRes.decision})
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            <button
              type="button"
              className="spad-modal-close-btn"
              onClick={onClose}
              aria-label="Close component analysis dialog"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body Scroll Area */}
        <div className="spad-modal-body" style={{ overflowY: 'auto', flex: 1, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* ============================================================ */}
          {/* SECTION 1: COMPONENT SUMMARY                                 */}
          {/* ============================================================ */}
          <div className="spad-modal-meta-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">Component Serial:</span>
              <span className="spad-meta-v font-mono text-cyan font-bold">{compId}</span>
            </div>
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">Active Lot:</span>
              <span className="spad-meta-v font-mono">{lotId}</span>
            </div>
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">Engineering Status:</span>
              <span
                className="spad-meta-v font-mono font-bold"
                style={{
                  color: engBadgeStyle.text,
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: engBadgeStyle.bg,
                  border: `1px solid ${engBadgeStyle.border}`,
                  fontSize: '11px',
                }}
              >
                {engineeringResult.decision}
              </span>
            </div>
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">AI Status:</span>
              <span
                className="spad-meta-v font-mono font-bold"
                style={{
                  color: overallAiBadgeStyle.text,
                  display: 'inline-block',
                  padding: '1px 6px',
                  borderRadius: '3px',
                  background: overallAiBadgeStyle.bg,
                  border: `1px solid ${overallAiBadgeStyle.border}`,
                  fontSize: '11px',
                }}
              >
                {overallAiStatus}
              </span>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECTION 2: ENGINEERING SCREENING DECISION & SPEC LIMITS       */}
          {/* ============================================================ */}
          <section className="spad-modal-section spad-decision-section" aria-labelledby="heading-eng-decision">
            <div className="spad-section-header">
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill eng-pill">ENGINEERING SPECIFICATION RULE</span>
                <h3 id="heading-eng-decision" className="spad-section-title">
                  Engineering Screening Decision &amp; Specification Limits
                </h3>
              </div>
              <div
                className="spad-decision-badge"
                style={{
                  backgroundColor: engBadgeStyle.bg,
                  borderColor: engBadgeStyle.border,
                  color: engBadgeStyle.text,
                }}
              >
                STATUS: {engineeringResult.decision}
              </div>
            </div>

            <div className="spad-decision-explanation-box">
              <div className="spad-decision-rule-text">
                <strong>Decision Reason:</strong> {engineeringResult.reasonText}
              </div>
              <p className="spad-decision-rule-sub">
                Evaluated deterministically across all {engineeringResult.totalParametersCount} parameters against official database limits.
                Rule: 0 breaches &rarr; NORMAL, 1 breach &rarr; SUSPECT, 2+ breaches &rarr; CRITICAL.
              </p>
            </div>

            {/* Compact Parameter Evidence Table */}
            <div className="spad-param-evidence-table-wrap">
              <table className="spad-param-evidence-table" aria-label="Parameter Engineering Limits Table">
                <thead>
                  <tr>
                    <th>PARAMETER</th>
                    <th>CURRENT OBSERVED</th>
                    <th>ENGINEERING SPEC LIMIT</th>
                    <th>LIMIT EVALUATION</th>
                  </tr>
                </thead>
                <tbody>
                  {engineeringResult.parameters.map((param) => {
                    const isViolated = param.isViolated;
                    const valueDisplay = param.currentValue !== null
                      ? `${param.currentValue.toFixed(param.unit === 'Ω' ? 3 : 2)} ${param.unit}`
                      : '—';
                    const limitDisplay = param.limit !== undefined
                      ? `${param.limit.toFixed(param.unit === 'Ω' ? 3 : 2)} ${param.unit}`
                      : '— (None Available)';

                    return (
                      <tr key={param.id} className={isViolated ? 'row-breach' : 'row-within'}>
                        <td className="font-bold text-slate font-mono">
                          {param.name}
                        </td>
                        <td className="font-mono text-cyan">
                          {valueDisplay}
                        </td>
                        <td className="font-mono text-slate">
                          {limitDisplay}
                        </td>
                        <td>
                          <span className={`spad-limit-pill ${param.limit === undefined ? 'pill-within' : isViolated ? 'pill-breach' : 'pill-within'}`}>
                            {param.limit === undefined ? 'NOT EVALUATED' : isViolated ? '✕ EXCEEDS LIMIT' : '✓ WITHIN LIMIT'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION 3: METHOD 1 • RANDOM FOREST — FUTURE PREDICTION      */}
          {/* ============================================================ */}
          <section className="spad-modal-section" aria-labelledby="heading-m1-prediction" style={{ background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: '8px', padding: '14px 16px' }}>
            <div className="spad-section-header" style={{ marginBottom: '12px' }}>
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">METHOD 1</span>
                <h3 id="heading-m1-prediction" className="spad-section-title">
                  METHOD 1 • RANDOM FOREST — FUTURE PREDICTION
                </h3>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: m1BadgeStyle.bg,
                  border: `1px solid ${m1BadgeStyle.border}`,
                  color: m1BadgeStyle.text,
                }}
              >
                AI FLAG: {m1Flag}
              </div>
            </div>

            {/* Timeline Progress Bar / Nodes */}
            <div style={{ display: 'grid', gridTemplateColumns: pred96h !== null ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '8px', marginBottom: '14px' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.12)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>0hr [OBSERVED]</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {obs0h !== null ? `${obs0h.toFixed(3)} Ω` : '—'}
                </div>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.12)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>24hr [OBSERVED]</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#38bdf8', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {obs24h !== null ? `${obs24h.toFixed(3)} Ω` : '—'}
                </div>
              </div>
              {pred96h !== null && (
                <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.12)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>96hr [PREDICTED]</div>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#f59e0b', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                    {`${pred96h.toFixed(3)} Ω`}
                  </div>
                </div>
              )}
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', border: '1px solid rgba(56, 189, 248, 0.12)', borderRadius: '6px', padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: '9.5px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>168hr [PREDICTED]</div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#a855f7', fontFamily: 'var(--font-mono)', marginTop: '2px' }}>
                  {pred168h !== null ? `${pred168h.toFixed(3)} Ω` : '—'}
                </div>
              </div>
            </div>

            {/* Method 1 Evidence Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Prediction Status</span>
                <span className="spad-peer-stat-value text-slate">{m1Status}</span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Rate of Change (0h &rarr; 24h)</span>
                <span className="spad-peer-stat-value text-cyan">
                  {roc !== null ? `${roc > 0 ? '+' : ''}${roc.toFixed(6)} Ω/hr` : '—'}
                </span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Forecast Residual</span>
                <span className="spad-peer-stat-value font-mono text-slate">
                  {forecastResidual !== null ? `${forecastResidual > 0 ? '+' : ''}${forecastResidual.toFixed(4)} Ω` : '—'}
                </span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Absolute Forecast Error</span>
                <span className="spad-peer-stat-value font-mono text-slate">
                  {absForecastError !== null ? `${absForecastError.toFixed(4)} Ω` : '—'}
                </span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Forecast Error Ratio</span>
                <span className="spad-peer-stat-value font-mono text-slate">
                  {forecastErrorRatio !== null ? `${(forecastErrorRatio * 100).toFixed(2)}%` : '—'}
                </span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Projected Limit Margin</span>
                <span className="spad-peer-stat-value font-mono text-slate">
                  {projMargin !== null ? `${projMargin > 0 ? '+' : ''}${projMargin.toFixed(4)} Ω` : '— (No Official Limit)'}
                </span>
              </div>
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION 4: METHOD 2 • ISOLATION FOREST — LOT-LEVEL ANOMALY   */}
          {/* ============================================================ */}
          <section className="spad-modal-section" aria-labelledby="heading-m2-anomaly" style={{ background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: '8px', padding: '14px 16px' }}>
            <div className="spad-section-header" style={{ marginBottom: '12px' }}>
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">METHOD 2</span>
                <h3 id="heading-m2-anomaly" className="spad-section-title">
                  METHOD 2 • ISOLATION FOREST — LOT-LEVEL ANOMALY DETECTION
                </h3>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: m2BadgeStyle.bg,
                  border: `1px solid ${m2BadgeStyle.border}`,
                  color: m2BadgeStyle.text,
                }}
              >
                AI FLAG: {m2Flag}
              </div>
            </div>

            {/* Method 2 Evidence Metrics Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px' }}>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Active Lot</span>
                <span className="spad-peer-stat-value text-slate">{lotId}</span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Same-Lot Peers Count</span>
                <span className="spad-peer-stat-value text-cyan">{sameLotPeersCount} peers</span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Cohort Quality</span>
                <span className="spad-peer-stat-value" style={{ color: cohortQuality === 'SUFFICIENT' ? '#34d399' : '#fbbf24' }}>
                  {cohortQuality}
                </span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Raw Isolation Forest Score</span>
                <span className="spad-peer-stat-value font-mono text-slate">
                  {rawIfScore !== null ? Number(rawIfScore).toFixed(4) : '— (NOT_EVALUATED)'}
                </span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Novelty Percentile</span>
                <span className="spad-peer-stat-value font-mono text-slate">
                  {noveltyPercentile !== null ? `${noveltyPercentile.toFixed(1)}%` : '—'}
                </span>
              </div>
              <div className="spad-peer-stat-box">
                <span className="spad-peer-stat-label">Trajectory Divergence</span>
                <span className="spad-peer-stat-value font-mono text-slate">{divergenceType}</span>
              </div>
            </div>

            {peerReason && (
              <div style={{ marginTop: '10px', padding: '8px 10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '4px', fontSize: '11px', color: '#94a3b8', borderLeft: '3px solid #38bdf8' }}>
                <strong style={{ color: '#e2e8f0' }}>Peer Comparison Context:</strong> {peerReason}
              </div>
            )}
          </section>

          {/* ============================================================ */}
          {/* SECTION 5: COMBINED AI DIAGNOSTIC EVIDENCE                   */}
          {/* ============================================================ */}
          <section className="spad-modal-section" aria-labelledby="heading-combined-ai" style={{ background: 'rgba(15, 23, 42, 0.45)', border: '1px solid rgba(56, 189, 248, 0.15)', borderRadius: '8px', padding: '14px 16px' }}>
            <div className="spad-section-header" style={{ marginBottom: '10px' }}>
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">SYNTHESIS</span>
                <h3 id="heading-combined-ai" className="spad-section-title">
                  Combined AI Multi-Axis Evidence
                </h3>
              </div>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  fontFamily: 'var(--font-mono)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  background: overallAiBadgeStyle.bg,
                  border: `1px solid ${overallAiBadgeStyle.border}`,
                  color: overallAiBadgeStyle.text,
                }}
              >
                OVERALL AI: {overallAiStatus}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
              <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>Method 1: Random Forest Prediction</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>168h Trajectory Forecast</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: m1BadgeStyle.text, fontFamily: 'var(--font-mono)' }}>{m1Flag}</span>
                </div>
              </div>

              <div style={{ padding: '10px', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '6px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
                <div style={{ fontSize: '10px', color: '#94a3b8', fontWeight: '600', textTransform: 'uppercase' }}>Method 2: Isolation Forest Anomaly</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
                  <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Early Drift Outlier Detection</span>
                  <span style={{ fontSize: '11px', fontWeight: '700', color: m2BadgeStyle.text, fontFamily: 'var(--font-mono)' }}>{m2Flag}</span>
                </div>
              </div>
            </div>

            <div style={{ fontSize: '10.5px', color: '#64748b', fontStyle: 'italic', lineHeight: '1.4' }}>
              AI outputs provide multivariate assistive telemetry insights and are non-dispositional; physical screening disposition is governed strictly by engineering specification limits.
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION 6: SHAP / EXPLAINABILITY (Only if real data exists)  */}
          {/* ============================================================ */}
          {hasRealShap && (
            <section className="spad-modal-section spad-shap-section" aria-labelledby="heading-ai-shap">
              <div className="spad-section-header">
                <div className="spad-section-title-wrap">
                  <span className="spad-section-pill ai-pill">MACHINE LEARNING EXPLAINABILITY</span>
                  <h3 id="heading-ai-shap" className="spad-section-title">
                    AI Explainability &amp; Feature Attribution
                  </h3>
                </div>
                <div className="spad-shap-framework-badge">
                  FRAMEWORK: <strong>{explanation.framework || 'Feature Attribution'}</strong>
                </div>
              </div>

              <p className="spad-shap-intro-desc">
                Feature attribution identifies how individual parameter telemetry points contributed to the model evaluation.
              </p>

              {/* Horizontal SHAP Feature Contribution Bars */}
              <div className="spad-shap-contributions-container">
                <div className="spad-shap-bar-header">
                  <span className="spad-shap-col-feature">FEATURE NAME &amp; TELEMETRY</span>
                  <span className="spad-shap-col-bars">SHAP CONTRIBUTION</span>
                  <span className="spad-shap-col-val">IMPACT</span>
                </div>

                <div className="spad-shap-features-list">
                  {explanation.features.map((feat, idx) => {
                    const val = feat.shapValue || 0;
                    const isPositive = val >= 0;
                    const absVal = Math.abs(val);
                    const barWidthPercent = Math.min(100, (absVal / maxAbsShap) * 88);

                    return (
                      <div key={idx} className="spad-shap-feature-row">
                        <div className="spad-shap-feature-info">
                          <span className="spad-shap-feat-name">{feat.name}</span>
                          {feat.featureValue && (
                            <span className="spad-shap-feat-val">{feat.featureValue}</span>
                          )}
                        </div>

                        <div className="spad-shap-bar-track">
                          <div className="spad-shap-zero-line" aria-hidden="true" />
                          <div className="spad-shap-bar-half left">
                            {!isPositive && (
                              <div
                                className="spad-shap-bar-fill neg"
                                style={{ width: `${barWidthPercent}%` }}
                                title={`Negative impact: ${val.toFixed(2)}`}
                              />
                            )}
                          </div>
                          <div className="spad-shap-bar-half right">
                            {isPositive && (
                              <div
                                className="spad-shap-bar-fill pos"
                                style={{ width: `${barWidthPercent}%` }}
                                title={`Positive impact: +${val.toFixed(2)}`}
                              />
                            )}
                          </div>
                        </div>

                        <div className="spad-shap-val-col">
                          <span className={`spad-shap-val-badge ${isPositive ? 'shap-pos' : 'shap-neg'}`}>
                            {isPositive ? `+${val.toFixed(2)}` : val.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="spad-shap-scale-legend">
                  <span className="text-green">◀ Negative Impact (Reduces Risk)</span>
                  <span className="spad-shap-scale-center font-mono">0.00 Base</span>
                  <span className="text-red">Positive Impact (Increases Risk) ▶</span>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Modal Footer */}
        <div className="spad-modal-footer">
          <span className="spad-modal-footer-hint font-mono">
            MIL-STD-883 Class-S Screening &bull; SPAD AI Diagnostic Suite
          </span>
          <button
            type="button"
            className="spad-modal-btn-primary"
            onClick={onClose}
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
}
