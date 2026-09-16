import React, { useEffect } from 'react';
import { mockParameterSpecs, mockComponents } from '../../data/mockData';

// Helper for status colors
function getStatusBadgeStyle(status) {
  if (status === 'PASS') {
    return { bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.4)', text: '#34d399' };
  }
  if (status === 'HOLD') {
    return { bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.4)', text: '#fbbf24' };
  }
  if (status === 'REJECT') {
    return { bg: 'rgba(239, 68, 68, 0.15)', border: 'rgba(239, 68, 68, 0.4)', text: '#f87171' };
  }
  return { bg: 'rgba(56, 189, 248, 0.15)', border: 'rgba(56, 189, 248, 0.4)', text: '#38bdf8' };
}

// Deterministic Engineering Screening Decision Evaluation
// Rule:
// 0 distinct violating parameters -> PASS
// 1 distinct violating parameter -> HOLD
// 2 or more distinct violating parameters -> REJECT
export function evaluateComponentEngineeringDecision(measurements, parameterSpecs) {
  if (!measurements || !parameterSpecs) {
    return {
      decision: 'PASS',
      violatingParametersCount: 0,
      totalParametersCount: 3,
      reasonText: '0 of 3 parameters exceed the engineering limit.',
      parameters: [],
    };
  }

  const paramResults = [];
  let violatingCount = 0;

  Object.values(parameterSpecs).forEach((spec) => {
    const data = Array.isArray(measurements) ? measurements : measurements[spec.key];
    const specLimit = spec.specLimitMax;
    let maxObserved = null;
    let isViolated = false;

    if (Array.isArray(data) && data.length > 0) {
      maxObserved = Math.max(...data);
      if (typeof specLimit === 'number') {
        isViolated = data.some((val) => typeof val === 'number' && val > specLimit);
      }
    }

    if (isViolated) {
      violatingCount += 1;
    }

    paramResults.push({
      id: spec.id,
      key: spec.key,
      name: spec.name,
      shortName: spec.shortName || spec.name,
      unit: spec.unit,
      limit: specLimit,
      currentValue: maxObserved,
      isViolated,
      status: isViolated ? 'EXCEEDS LIMIT' : 'WITHIN LIMIT',
    });
  });

  let decision = 'PASS';
  let reasonText = '0 of 3 parameters exceed the engineering limit.';

  if (violatingCount === 1) {
    decision = 'HOLD';
    const violatedParam = paramResults.find((p) => p.isViolated);
    reasonText = `1 of ${paramResults.length} parameters (${violatedParam ? violatedParam.shortName : 'parameter'}) exceeds the engineering limit.`;
  } else if (violatingCount >= 2) {
    decision = 'REJECT';
    reasonText = `${violatingCount} of ${paramResults.length} parameters exceed their engineering limits.`;
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
  components = mockComponents,
  onSelectComponent,
  parameterSpecs = mockParameterSpecs,
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
    parameterSpecs
  );
  const decisionBadgeStyle = getStatusBadgeStyle(engineeringResult.decision);

  // 2. AI Model SHAP Explanation Retrieval from centralized data
  const explanation = component.modelExplanation || {
    framework: 'SHAP (TreeExplainer)',
    targetPrediction: 'Predicted 168h Limit Risk',
    predictedRiskPercent: component.aiRisk || 15,
    baseValue: 0.15,
    features: [],
    summaryText: 'Model explanation data synchronized with centralized inference store.',
  };

  const predictedRisk = typeof explanation.predictedRiskPercent === 'number'
    ? explanation.predictedRiskPercent
    : component.aiRisk || 15;

  let riskCategory = 'LOW RISK';
  let riskColor = '#10b981';
  if (predictedRisk > 40) {
    riskCategory = 'MODERATE RISK';
    riskColor = '#f59e0b';
  }
  if (predictedRisk > 75) {
    riskCategory = 'HIGH RISK';
    riskColor = '#ef4444';
  }

  // Find maximum absolute SHAP value for scaling bars
  const maxAbsShap = explanation.features.reduce((max, f) => Math.max(max, Math.abs(f.shapValue || 0)), 0.1);

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
              <span className="spad-modal-stage-tag">PHYSICAL STAGE: {component.stage || '96h'}</span>
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
                    const evalRes = evaluateComponentEngineeringDecision(c.measurements, parameterSpecs);
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
              <span className="spad-meta-k">Observed Physical Stage:</span>
              <span className="spad-meta-v highlight">{component.stage || '96h'} Checkpoint</span>
            </div>
            <div className="spad-modal-meta-item">
              <span className="spad-meta-k">168h Physical Gate:</span>
              <span className="spad-meta-v text-slate">PENDING (Physical ESS)</span>
            </div>
          </div>

          {/* ============================================================ */}
          {/* SECTION 1: DETERMINISTIC ENGINEERING DECISION & EVIDENCE     */}
          {/* ============================================================ */}
          <section className="spad-modal-section spad-decision-section" aria-labelledby="heading-eng-decision">
            <div className="spad-section-header">
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill eng-pill">MIL-STD DETERMINISTIC RULE</span>
                <h3 id="heading-eng-decision" className="spad-section-title">
                  Screening Decision &amp; Engineering Evidence
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
                DECISION: {engineeringResult.decision}
              </div>
            </div>

            <div className="spad-decision-explanation-box">
              <div className="spad-decision-rule-text">
                <strong>Decision Reason:</strong> {engineeringResult.reasonText}
              </div>
              <p className="spad-decision-rule-sub">
                Evaluated deterministically across all {engineeringResult.totalParametersCount} parameters against engineering maximum specifications.
                Rule: 0 limit breaches → PASS, 1 breach → HOLD, 2+ breaches → REJECT.
              </p>
            </div>

            {/* Compact Parameter Evidence Table */}
            <div className="spad-param-evidence-table-wrap">
              <table className="spad-param-evidence-table" aria-label="Parameter Engineering Limits Table">
                <thead>
                  <tr>
                    <th>PARAMETER</th>
                    <th>CURRENT OBSERVED (0h–96h)</th>
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
          {/* SECTION 2: AI EXPLAINABILITY — SHAP (MACHINE LEARNING MODEL) */}
          {/* ============================================================ */}
          <section className="spad-modal-section spad-shap-section" aria-labelledby="heading-ai-shap">
            <div className="spad-section-header">
              <div className="spad-section-title-wrap">
                <span className="spad-section-pill ai-pill">MACHINE LEARNING EXPLAINABILITY</span>
                <h3 id="heading-ai-shap" className="spad-section-title">
                  AI Explainability — SHAP (SHapley Additive exPlanations)
                </h3>
              </div>
              <div className="spad-shap-framework-badge">
                FRAMEWORK: <strong>{explanation.framework || 'SHAP TreeExplainer'}</strong>
              </div>
            </div>

            <p className="spad-shap-intro-desc">
              SHAP attribution identifies how individual measurement features mathematically contributed to the AI model's predicted 168h failure risk.
              <strong> Positive values (+)</strong> increased predicted risk, while <strong>negative values (-)</strong> reduced risk toward the baseline.
            </p>

            {/* Model Prediction Header Box */}
            <div className="spad-shap-prediction-banner">
              <div className="spad-shap-pred-item">
                <span className="spad-pred-label">AI PREDICTED 168h RISK:</span>
                <div className="spad-pred-val-wrap">
                  <span className="spad-pred-percent" style={{ color: riskColor }}>
                    {predictedRisk}%
                  </span>
                  <span className="spad-pred-category" style={{ color: riskColor, borderColor: riskColor }}>
                    {riskCategory}
                  </span>
                </div>
              </div>

              <div className="spad-shap-pred-item">
                <span className="spad-pred-label">LOT BASELINE EXPECTED RISK (E[f(x)]):</span>
                <span className="spad-pred-base font-mono">
                  {((explanation.baseValue || 0.15) * 100).toFixed(1)}%
                </span>
              </div>

              <div className="spad-shap-pred-item spad-shap-pred-span">
                <span className="spad-pred-label">MODEL DIAGNOSTIC SUMMARY:</span>
                <p className="spad-pred-summary-text">
                  {explanation.summaryText}
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
                {explanation.features.map((feat, idx) => {
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
                })}
              </div>

              <div className="spad-shap-scale-legend">
                <span className="text-green">◀ Negative SHAP (Reduces Risk)</span>
                <span className="spad-shap-scale-center font-mono">0.00 Base</span>
                <span className="text-red">Positive SHAP (Increases Risk) ▶</span>
              </div>
            </div>

            {/* Clarification Note */}
            <div className="spad-shap-disclaimer-note">
              <span className="font-bold text-cyan">Technical Boundary:</span> SHAP values explain the Bayesian ML model's multivariate early-risk prediction output. The deterministic screening decision (PASS / HOLD / REJECT) is separately governed by MIL-STD engineering specification limits.
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
