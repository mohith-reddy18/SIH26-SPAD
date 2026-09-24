import React, { useEffect } from 'react';
import { getParameterMeta, getNormalizedEngineeringStatus } from '../../utils/recordMapping';

// Helper for status colors
function getStatusBadgeStyle(status) {
  if (status === 'NORMAL' || status === 'PASS') {
    return { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#34d399' };
  }
  if (status === 'SUSPECT' || status === 'HOLD') {
    return { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24' };
  }
  if (status === 'CRITICAL' || status === 'REJECT') {
    return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#f87171' };
  }
  return { bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', text: '#38bdf8' };
}

// Deterministic Engineering Screening Decision Evaluation
export function evaluateComponentEngineeringDecision(measurements = {}, engineeringLimits = {}, explicitStatus = null) {
  const keys = Object.keys(measurements);
  const paramKeys = keys.length > 0 ? keys : Object.keys(engineeringLimits);

  if (paramKeys.length === 0) {
    return {
      decision: explicitStatus ? getNormalizedEngineeringStatus(explicitStatus) : 'NORMAL',
      violatingParametersCount: 0,
      totalParametersCount: 0,
      reasonText: 'No parameter telemetry available.',
      parameters: [],
    };
  }

  const paramResults = [];
  let violatingCount = 0;

  paramKeys.forEach((key) => {
    const rawLimit = engineeringLimits[key];
    const meta = getParameterMeta(key, rawLimit);
    const data = measurements[key];
    const specLimit = meta.specLimitMax;
    let maxObserved = null;
    let isViolated = false;

    if (Array.isArray(data) && data.length > 0) {
      maxObserved = Math.max(...data.filter((v) => typeof v === 'number'));
      if (typeof specLimit === 'number') {
        isViolated = data.some((val) => typeof val === 'number' && val > specLimit);
      }
    } else if (typeof data === 'number') {
      maxObserved = data;
      if (typeof specLimit === 'number') {
        isViolated = data > specLimit;
      }
    } else if (data && typeof data === 'object') {
      const vals = Object.values(data).filter((v) => typeof v === 'number');
      if (vals.length > 0) {
        maxObserved = Math.max(...vals);
        if (typeof specLimit === 'number') {
          isViolated = vals.some((v) => v > specLimit);
        }
      }
    }

    if (isViolated) {
      violatingCount += 1;
    }

    paramResults.push({
      id: meta.id,
      key: meta.key,
      name: meta.name,
      shortName: meta.shortName,
      unit: meta.unit,
      limit: specLimit,
      currentValue: maxObserved,
      isViolated,
      status: isViolated ? 'EXCEEDS LIMIT' : 'WITHIN LIMIT',
    });
  });

  let decision = explicitStatus ? getNormalizedEngineeringStatus(explicitStatus) : 'NORMAL';
  if (!explicitStatus) {
    if (violatingCount === 1) decision = 'SUSPECT';
    else if (violatingCount >= 2) decision = 'CRITICAL';
  }

  let reasonText = `${violatingCount} of ${paramResults.length} parameters exceed their engineering limits.`;
  if (violatingCount === 0) {
    reasonText = `0 of ${paramResults.length} parameters exceed the engineering limit.`;
  } else if (violatingCount === 1) {
    const violatedParam = paramResults.find((p) => p.isViolated);
    reasonText = `1 of ${paramResults.length} parameters (${violatedParam ? violatedParam.shortName : 'parameter'}) exceeds the engineering limit.`;
  }

  return {
    decision,
    violatingParametersCount: violatingCount,
    totalParametersCount: paramResults.length,
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

  // 1. Deterministic Engineering Screening Decision Logic
  const engineeringResult = evaluateComponentEngineeringDecision(
    component.measurements,
    component.engineeringLimits,
    component.engineeringStatus
  );
  const decisionBadgeStyle = getStatusBadgeStyle(engineeringResult.decision);

  // 2. AI Multi-Method Data Extraction
  const aiAssessment = component.aiAssessment || {};
  const prediction = aiAssessment.prediction || (component.predictions ? { status: 'PREDICTED', parameters: component.predictions } : null);
  const lotAnomaly = aiAssessment.lotAnomaly || null;

  // 3. AI Model Explanation
  const explanation = aiAssessment.explanation || component.modelExplanation || {
    framework: 'Model Explainability Engine',
    targetPrediction: 'Predicted 168h Limit Risk',
    baseValue: 0.15,
    features: [],
    summaryText: 'Model explanation data synchronized with screening telemetry.',
  };

  const aiStatus = component.aiStatus || aiAssessment.overallStatus || 'NOT_EVALUATED';
  const isAiFlagged = aiStatus === 'FLAGGED';
  const riskScore = typeof component.riskScore === 'number' ? component.riskScore : 0.15;

  // Find maximum absolute SHAP value for scaling bars
  const maxAbsShap = explanation.features?.reduce((max, f) => Math.max(max, Math.abs(f.shapValue || 0)), 0.1) || 0.1;

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
      >
        {/* Modal Header */}
        <div className="spad-modal-header">
          <div className="spad-modal-title-group">
            <div className="spad-modal-label-row">
              <span className="spad-card-section-label">SPACE-GRADE TELEMETRY AUDIT</span>
              <span className="spad-modal-lot-tag">LOT: {component.lotId}</span>
              <span className="spad-modal-stage-tag">STAGE: {component.stage || '24h'}</span>
            </div>
            <h2 id="modal-component-title" className="spad-modal-title">
              Detailed Component Analysis: <span className="text-cyan">{component.id}</span>
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
                  value={component.id}
                  onChange={(e) => {
                    const target = components.find((c) => c.id === e.target.value);
                    if (target) onSelectComponent(target);
                  }}
                >
                  {components.map((c) => {
                    const evalRes = evaluateComponentEngineeringDecision(c.measurements, c.engineeringLimits, c.engineeringStatus);
                    return (
                      <option key={c.id} value={c.id}>
                        {c.id} ({evalRes.decision})
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
        <div className="spad-modal-body">
          {/* Quick Summary Meta Grid */}
          <div className="spad-modal-meta-grid">
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">Component Serial:</span>
              <span className="spad-meta-v font-mono text-cyan font-bold">{component.id}</span>
            </div>
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">Active Lot:</span>
              <span className="spad-meta-v font-mono">{component.lotId}</span>
            </div>
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">Engineering Status:</span>
              <span className="spad-meta-v highlight">{engineeringResult.decision}</span>
            </div>
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">AI Assistive Status:</span>
              <span className="spad-meta-v text-slate">{aiStatus}</span>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECTION 1: DETERMINISTIC ENGINEERING SCREENING DECISION       */}
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
                  backgroundColor: decisionBadgeStyle.bg,
                  borderColor: decisionBadgeStyle.border,
                  color: decisionBadgeStyle.text,
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
                Evaluated deterministically across all {engineeringResult.totalParametersCount} parameters against official engineering specifications.
                Rule: 0 limit breaches &rarr; NORMAL, 1 breach &rarr; SUSPECT, 2+ breaches &rarr; CRITICAL.
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
                      ? `${param.currentValue.toFixed(2)} ${param.unit}`
                      : '—';
                    const limitDisplay = param.limit !== undefined
                      ? `${param.limit.toFixed(2)} ${param.unit}`
                      : '—';

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
                          <span className={`spad-limit-pill ${isViolated ? 'pill-breach' : 'pill-within'}`}>
                            {isViolated ? '✕ EXCEEDS LIMIT' : '✓ WITHIN LIMIT'}
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
          {/* SECTION 2: AI DUAL METHOD EVIDENCE                           */}
          {/* ============================================================ */}
          <section className="spad-modal-section spad-ai-evidence-section" aria-labelledby="heading-ai-evidence">
            <div className="spad-section-header">
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">AI MULTI-AXIS DIAGNOSTICS</span>
                <h3 id="heading-ai-evidence" className="spad-section-title">
                  AI Evidence &amp; Analytical Anomaly Signals
                </h3>
              </div>
              <div className="spad-ai-disclaimer-badge">
                AI ASSISTIVE EVIDENCE &bull; NON-DISPOSITIONAL
              </div>
            </div>

            <p className="spad-shap-intro-desc">
              NASA MOSFET V1 dual ML pathways: Module B (drift forecast [RDS0, RDS33] &rarr; RDS100) and Module A (Isolation Forest novelty on [RDS0, ΔRDS(0→33)]) assist screening engineers.
            </p>

            <div className="spad-ai-evidence-grid">
              <div className="spad-ai-evidence-card">
                <div className="spad-ai-evidence-title-row">
                  <span className="spad-ai-evidence-k">Module B: 100% Trajectory Drift</span>
                  <span className={`spad-ai-status-tag ${prediction?.status === 'PREDICTED' ? (isAiFlagged ? 'tag-warning' : 'tag-nominal') : 'tag-nominal'}`}>
                    {isAiFlagged ? 'FLAGGED' : 'NOT FLAGGED'}
                  </span>
                </div>
                <p className="spad-ai-evidence-desc">
                  {isAiFlagged
                    ? 'Predicted 100% RDS(on) vs actual residual breaches the 0.165 Ω normal upper fence (large forecast residual).'
                    : 'Learned Random Forest forecast tracks actual 100% measurement within normal error bounds (MAE ≈ 0.0528 Ω).'}
                </p>
              </div>

              <div className="spad-ai-evidence-card">
                <div className="spad-ai-evidence-title-row">
                  <span className="spad-ai-evidence-k">Module A: Dynamic Anomaly (IF)</span>
                  <span className={`spad-ai-status-tag ${lotAnomaly?.status === 'ANALYZED' ? (lotAnomaly.overallStatus === 'FLAGGED' ? 'tag-warning' : 'tag-nominal') : 'tag-nominal'}`}>
                    {lotAnomaly?.overallStatus === 'FLAGGED' ? 'FLAGGED' : 'NOT FLAGGED'}
                  </span>
                </div>
                <p className="spad-ai-evidence-desc">
                  {lotAnomaly?.overallStatus === 'FLAGGED'
                    ? 'Isolation Forest score indicates significant early isolation/novelty from normal reference population.'
                    : 'Early observations conform to learned normal reference cluster (IF_Score > 0).'}
                </p>
              </div>

              <div className="spad-ai-evidence-card">
                <div className="spad-ai-evidence-title-row">
                  <span className="spad-ai-evidence-k">AI Model Risk Score</span>
                  <span className={`spad-ai-status-tag ${riskScore > 0.6 ? 'tag-warning' : 'tag-nominal'}`}>
                    {riskScore > 0.6 ? 'ELEVATED' : 'NOMINAL'}
                  </span>
                </div>
                <p className="spad-ai-evidence-desc">
                  Model risk score: <strong>{riskScore.toFixed(2)}</strong> index. AI outputs provide assistive telemetry insights without overriding deterministic screening rules.
                </p>
              </div>
            </div>
          </section>

          {/* ============================================================ */}
          {/* SECTION 3: AI EXPLAINABILITY — MODEL ATTRIBUTION             */}
          {/* ============================================================ */}
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

            {/* Model Prediction Header Box */}
            <div className="spad-shap-prediction-banner">
              <div className="spad-shap-pred-item">
                <span className="spad-pred-label">AI ASSISTIVE STATUS:</span>
                <div className="spad-pred-val-wrap">
                  <span className="spad-pred-percent" style={{ color: isAiFlagged ? '#f59e0b' : '#10b981' }}>
                    {aiStatus}
                  </span>
                </div>
              </div>

              <div className="spad-shap-pred-item">
                <span className="spad-pred-label">MODEL RISK SCORE:</span>
                <span className="spad-pred-base font-mono">
                  {riskScore.toFixed(2)}
                </span>
              </div>

              <div className="spad-shap-pred-item spad-shap-pred-span">
                <span className="spad-pred-label">MODEL DIAGNOSTIC SUMMARY:</span>
                <p className="spad-pred-summary-text">
                  {explanation.summaryText || 'Nominal telemetry tracking across 0h and 24h intervals.'}
                </p>
              </div>
            </div>

            {/* Horizontal SHAP Feature Contribution Bars */}
            <div className="spad-shap-contributions-container">
              <div className="spad-shap-bar-header">
                <span className="spad-shap-col-feature">FEATURE NAME &amp; TELEMETRY</span>
                <span className="spad-shap-col-bars">SHAP CONTRIBUTION TO RISK SCORE</span>
                <span className="spad-shap-col-val">IMPACT</span>
              </div>

              <div className="spad-shap-features-list">
                {(!explanation.features || explanation.features.length === 0) ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#64748b', fontSize: '13px' }}>
                    No feature attribution telemetry available for this component.
                  </div>
                ) : (
                  explanation.features.map((feat, idx) => {
                    const val = feat.shapValue || 0;
                    const isPositive = val >= 0;
                    const absVal = Math.abs(val);
                    const barWidthPercent = Math.min(100, (absVal / maxAbsShap) * 88);

                    return (
                      <div key={idx} className="spad-shap-feature-row">
                        {/* Feature Name & Observed Value */}
                        <div className="spad-shap-feature-info">
                          <span className="spad-shap-feat-name">{feat.name}</span>
                          {feat.featureValue && (
                            <span className="spad-shap-feat-val">{feat.featureValue}</span>
                          )}
                        </div>

                        {/* Diverging Bar from Center 0.00 */}
                        <div className="spad-shap-bar-track">
                          {/* Center Zero Reference Line */}
                          <div className="spad-shap-zero-line" aria-hidden="true" />

                          {/* Negative Side (Left) */}
                          <div className="spad-shap-bar-half left">
                            {!isPositive && (
                              <div
                                className="spad-shap-bar-fill neg"
                                style={{ width: `${barWidthPercent}%` }}
                                title={`Negative impact: ${val.toFixed(2)} (reduces risk)`}
                              />
                            )}
                          </div>

                          {/* Positive Side (Right) */}
                          <div className="spad-shap-bar-half right">
                            {isPositive && (
                              <div
                                className="spad-shap-bar-fill pos"
                                style={{ width: `${barWidthPercent}%` }}
                                title={`Positive impact: +${val.toFixed(2)} (increases risk)`}
                              />
                            )}
                          </div>
                        </div>

                        {/* Numeric SHAP Value Badge */}
                        <div className="spad-shap-val-col">
                          <span className={`spad-shap-val-badge ${isPositive ? 'shap-pos' : 'shap-neg'}`}>
                            {isPositive ? `+${val.toFixed(2)}` : val.toFixed(2)}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="spad-shap-scale-legend">
                <span className="text-green">◀ Negative SHAP (Reduces Risk)</span>
                <span className="spad-shap-scale-center font-mono">0.00 Base</span>
                <span className="text-red">Positive SHAP (Increases Risk) ▶</span>
              </div>
            </div>

            {/* Clarification Note */}
            <div className="spad-shap-disclaimer-note">
              <span className="font-bold text-cyan">Technical Boundary:</span> SHAP values explain the Bayesian ML model's multivariate early-risk prediction output. The deterministic screening decision (NORMAL / SUSPECT / CRITICAL) is separately governed by MIL-STD engineering specification limits.
            </div>
          </section>
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
