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

/**
 * Standard Display Mapping for common aerospace electronic parameters.
 * Keys that do not exist here will gracefully fall back to their raw key name.
 */
export const PARAMETER_DISPLAY_MAP = {
  iddq: { name: 'Standby Current (Iddq)', shortName: 'Iddq', unit: 'mA', defaultRef: [2.00, 2.05, 2.10, 2.15] },
  leakage: { name: 'Leakage Current (I_leak)', shortName: 'I_leak', unit: 'µA', defaultRef: [0.38, 0.40, 0.41, 0.43] },
  leakageCurrent: { name: 'Leakage Current (I_leak)', shortName: 'I_leak', unit: 'µA', defaultRef: [0.38, 0.40, 0.41, 0.43] },
  propDelay: { name: 'Propagation Delay (t_pd)', shortName: 't_pd', unit: 'ns', defaultRef: [8.10, 8.14, 8.18, 8.22] },
  propagationDelay: { name: 'Propagation Delay (t_pd)', shortName: 't_pd', unit: 'ns', defaultRef: [8.10, 8.14, 8.18, 8.22] },
  v_th: { name: 'Threshold Voltage (V_th)', shortName: 'V_th', unit: 'V', defaultRef: [1.20, 1.20, 1.20, 1.20] },
  rdson: { name: 'On-Resistance (R_dson)', shortName: 'R_dson', unit: 'mΩ', defaultRef: [15.0, 15.2, 15.4, 15.6] },
  freq: { name: 'Frequency (Freq)', shortName: 'Freq', unit: 'MHz', defaultRef: [100.0, 100.0, 100.0, 100.0] },
  gain: { name: 'Open Loop Gain (Gain)', shortName: 'Gain', unit: 'dB', defaultRef: [80.0, 80.0, 79.9, 79.8] },
};

/**
 * Derives rich display metadata for any parameter key from backend telemetry & limits.
 *
 * @param {string} key - Machine-readable parameter key (e.g. 'iddq', 'leakage')
 * @param {number|Object} limit - Engineering limit value or object
 * @returns {Object} Parameter metadata with id, name, shortName, unit, specLimitMax, healthyRef
 */
export function getParameterMeta(key, limit) {
  const matched = PARAMETER_DISPLAY_MAP[key] || {};
  let limitValue = undefined;

  if (typeof limit === 'number') {
    limitValue = limit;
  } else if (limit && typeof limit === 'object' && typeof limit.limitValue === 'number') {
    limitValue = limit.limitValue;
  }

  return {
    id: key,
    key: key,
    name: matched.name || key,
    shortName: matched.shortName || key,
    unit: matched.unit || (limit?.unit || ''),
    specLimitMax: limitValue,
    healthyRef: matched.defaultRef || [0, 0, 0, 0],
  };
}

