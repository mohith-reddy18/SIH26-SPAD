/**
 * SPAD Frontend Record Mapping Utility
 * Standardizes mapping from backend ScreeningRecord to frontend component state
 * strictly adhering to the SPAD AI Output Contract.
 */

/**
 * Normalizes engineering status to 'NORMAL' | 'SUSPECT' | 'CRITICAL'
 *
 * @param {Object|string} recordOrStatus - Screening record or raw status string
 * @returns {'NORMAL' | 'SUSPECT' | 'CRITICAL'}
 */
export function getNormalizedEngineeringStatus(recordOrStatus) {
  if (!recordOrStatus) return 'NORMAL';
  const raw = typeof recordOrStatus === 'string'
    ? recordOrStatus
    : recordOrStatus.engineeringStatus || recordOrStatus.decision || recordOrStatus.status || 'NORMAL';

  const s = String(raw).trim().toUpperCase();
  if (s === 'NORMAL' || s === 'PASS') return 'NORMAL';
  if (s === 'SUSPECT' || s === 'HOLD') return 'SUSPECT';
  if (s === 'CRITICAL' || s === 'REJECT') return 'CRITICAL';
  return 'NORMAL';
}

/**
 * Normalizes AI status to 'FLAGGED' | 'NOT FLAGGED' | 'NOT_EVALUATED'
 *
 * @param {Object|string} recordOrAi - Screening record or raw AI assessment
 * @returns {'FLAGGED' | 'NOT FLAGGED' | 'NOT_EVALUATED'}
 */
export function getNormalizedAiStatus(recordOrAi) {
  if (!recordOrAi) return 'NOT_EVALUATED';

  let raw = '';
  if (typeof recordOrAi === 'string') {
    raw = recordOrAi;
  } else if (recordOrAi.aiAssessment) {
    raw = typeof recordOrAi.aiAssessment === 'object'
      ? recordOrAi.aiAssessment.overallStatus
      : recordOrAi.aiAssessment;
  } else if (recordOrAi.overallStatus) {
    raw = recordOrAi.overallStatus;
  }

  const s = String(raw).trim().toUpperCase();
  if (s === 'FLAGGED') return 'FLAGGED';
  if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED' || s === 'NOMINAL' || s === 'NORMAL' || s === 'PASS') return 'NOT FLAGGED';
  return 'NOT_EVALUATED';
}

/**
 * Extracts latest scalar measurement value from flexible measurement representations
 *
 * @param {Array|Object|number} data
 * @returns {number|null}
 */
export function extractLatestValue(data) {
  if (typeof data === 'number' && !isNaN(data)) return data;
  if (Array.isArray(data) && data.length > 0) {
    const val = data[data.length - 1];
    return typeof val === 'number' && !isNaN(val) ? val : null;
  }
  if (data && typeof data === 'object') {
    const v24 = data['24h'] ?? data['24H'];
    const v168 = data['168h'] ?? data['168H'];
    const v0 = data['0h'] ?? data['0H'];
    const finalVal = v168 ?? v24 ?? v0;
    return typeof finalVal === 'number' && !isNaN(finalVal) ? finalVal : null;
  }
  return null;
}

/**
 * Maps a backend ScreeningRecord to the unified frontend component object
 *
 * @param {Object} record - Raw MongoDB ScreeningRecord from backend
 * @returns {Object} Normalized component view object
 */
export function mapScreeningRecord(record) {
  if (!record || typeof record !== 'object') return null;

  const componentId = record.componentId || record.id || 'C-0001';
  const lotId = record.lotId || 'LOT-2026-001';
  const stage = record.stage || '24h';

  const measurements = record.measurements || {};
  const engineeringLimits = record.engineeringLimits || {};
  const engineeringStatus = getNormalizedEngineeringStatus(record);

  // AI Assessment block
  const rawAiAssessment = record.aiAssessment;
  const aiAssessmentObj = typeof rawAiAssessment === 'object' && rawAiAssessment !== null
    ? rawAiAssessment
    : {
        overallStatus: getNormalizedAiStatus(rawAiAssessment),
        prediction: record.predictions ? { status: 'PREDICTED', parameters: record.predictions } : null,
        lotAnomaly: null,
        explanation: record.modelExplanation || null,
      };

  const aiStatus = getNormalizedAiStatus(aiAssessmentObj);

  // Extract latest readings for quick table display
  const iddqVal = extractLatestValue(measurements.iddq);
  const leakageVal = extractLatestValue(measurements.leakage || measurements.leakageCurrent);
  const propDelayVal = extractLatestValue(measurements.propDelay || measurements.propagationDelay);

  // Risk score extraction (legacy or prediction)
  const firstParamPred = aiAssessmentObj.prediction?.parameters?.iddq || Object.values(aiAssessmentObj.prediction?.parameters || {})[0];
  const riskScore = typeof firstParamPred?.futureRiskScore === 'number'
    ? firstParamPred.futureRiskScore
    : (typeof record.riskScore === 'number' ? record.riskScore : (typeof record.aiRisk === 'number' ? record.aiRisk / 100 : 0.12));

  const aiRisk = Math.round(riskScore * 100);

  return {
    id: componentId,
    componentId,
    lotId,
    stage,
    measurements,
    engineeringLimits,
    engineeringStatus,
    aiAssessment: aiAssessmentObj,
    aiStatus,
    aiRisk,
    riskScore,
    predictions: aiAssessmentObj.prediction?.parameters || record.predictions || {},
    modelExplanation: aiAssessmentObj.explanation || record.modelExplanation || null,
    standbyCurrent: iddqVal !== null ? `${iddqVal.toFixed(2)} mA` : '-',
    leakageCurrent: leakageVal !== null ? `${leakageVal.toFixed(2)} µA` : '-',
    propagationDelay: propDelayVal !== null ? `${propDelayVal.toFixed(2)} ns` : '-',
    evidence: record.evidence || (aiStatus === 'FLAGGED' ? 'AI Degradation / Anomaly Flagged' : 'Within Expected Limits'),
    // Backward compatibility aliases
    status: engineeringStatus,
    decision: engineeringStatus,
    _source: 'backend-api',
  };
}
