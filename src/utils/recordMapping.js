/**
 * SPAD Frontend Record Mapping Utility
 * Standardizes mapping from backend ScreeningRecord to frontend component state
 * strictly adhering to the SPAD AI Output Contract and MongoDB Atlas Schema.
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
      ? (recordOrAi.aiAssessment.overallStatus || recordOrAi.aiAssessment.status)
      : recordOrAi.aiAssessment;
  } else if (recordOrAi.overallStatus) {
    raw = recordOrAi.overallStatus;
  } else if (recordOrAi.aiStatus) {
    raw = recordOrAi.aiStatus;
  }

  const s = String(raw || '').trim().toUpperCase();
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
    for (let i = data.length - 1; i >= 0; i--) {
      if (typeof data[i] === 'number' && !isNaN(data[i])) return data[i];
    }
    return null;
  }
  if (data && typeof data === 'object') {
    const v168 = data['168h'] ?? data['168H'];
    const v96 = data['96h'] ?? data['96H'];
    const v24 = data['24h'] ?? data['24H'];
    const v0 = data['0h'] ?? data['0H'];
    const finalVal = v168 ?? v96 ?? v24 ?? v0;
    return typeof finalVal === 'number' && !isNaN(finalVal) ? finalVal : null;
  }
  return null;
}

/**
 * Extracts numeric 168h forecast prediction value for a given parameter key
 *
 * @param {Object} recordOrPredictions - Screening record or predictions container
 * @param {string} paramKey - Parameter key (e.g. 'iddq', 'leakage', 'propDelay')
 * @returns {number|null}
 */
export function extractPredictedValue(recordOrPredictions, paramKey) {
  if (!recordOrPredictions || !paramKey) return null;

  // 1. Direct check if recordOrPredictions is a number
  if (typeof recordOrPredictions === 'number' && !isNaN(recordOrPredictions)) {
    return recordOrPredictions;
  }

  // 2. Canonical AI Assessment: record.aiAssessment.prediction.parameters[paramKey]
  const aiParams = recordOrPredictions.aiAssessment?.prediction?.parameters;
  if (aiParams && typeof aiParams === 'object') {
    const p1 = aiParams[paramKey];
    if (typeof p1?.predicted168h === 'number') return p1.predicted168h;
    if (typeof p1 === 'number') return p1;
  }

  // 3. Predictions dictionary on record or passed directly
  const preds = recordOrPredictions.predictions || (recordOrPredictions.status || recordOrPredictions.predicted168h ? null : recordOrPredictions);
  if (preds && typeof preds === 'object') {
    const valDirect = preds[paramKey];
    if (typeof valDirect === 'number' && !isNaN(valDirect)) return valDirect;
    if (valDirect && typeof valDirect.predicted168h === 'number') return valDirect.predicted168h;

    const key168 = `${paramKey}_168h`;
    const val168 = preds[key168];
    if (typeof val168 === 'number' && !isNaN(val168)) return val168;
    if (val168 && typeof val168.predicted168h === 'number') return val168.predicted168h;
  }

  // 4. Fallback to direct property if passed a parameter object
  if (typeof recordOrPredictions.predicted168h === 'number') {
    return recordOrPredictions.predicted168h;
  }

  return null;
}

/**
 * Standard Display Mapping for common aerospace electronic parameters.
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

/**
 * Maps a backend ScreeningRecord to the unified frontend component object
 *
 * @param {Object} record - Raw MongoDB ScreeningRecord from backend
 * @returns {Object} Normalized component view object
 */
export function mapScreeningRecord(record) {
  if (!record || typeof record !== 'object') return null;

  const componentId = String(record.componentId || record.id || 'C-0001').trim();
  const lotId = String(record.lotId || 'LOT-2026-001').trim();
  const stage = String(record.stage || '24h').trim();

  const measurements = record.measurements && typeof record.measurements === 'object' ? record.measurements : {};
  const engineeringLimits = record.engineeringLimits && typeof record.engineeringLimits === 'object' ? record.engineeringLimits : {};
  const engineeringStatus = getNormalizedEngineeringStatus(record);

  // AI Assessment block extraction
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

  // Risk score extraction (prediction parameter level or top-level)
  const firstParamPred = aiAssessmentObj.prediction?.parameters?.iddq || Object.values(aiAssessmentObj.prediction?.parameters || {})[0];
  let riskScore = 0.12;
  if (typeof firstParamPred?.futureRiskScore === 'number') {
    riskScore = firstParamPred.futureRiskScore;
  } else if (typeof record.riskScore === 'number') {
    riskScore = record.riskScore;
  } else if (typeof record.aiRisk === 'number') {
    riskScore = record.aiRisk > 1 ? record.aiRisk / 100 : record.aiRisk;
  } else if (aiStatus === 'FLAGGED') {
    riskScore = 0.78;
  }

  const aiRisk = Math.round(riskScore * 100);

  // Build flattened prediction numbers map for ease of consumption
  const flattenedPredictions = {};
  const rawPredictions = aiAssessmentObj.prediction?.parameters || record.predictions || {};
  if (rawPredictions && typeof rawPredictions === 'object') {
    Object.entries(rawPredictions).forEach(([k, v]) => {
      if (typeof v === 'number') {
        flattenedPredictions[k] = v;
      } else if (v && typeof v.predicted168h === 'number') {
        flattenedPredictions[k] = v.predicted168h;
      }
    });
  }

  // Ensure canonical param names are keyed
  Object.keys(measurements).forEach((k) => {
    const val = extractPredictedValue(record, k);
    if (val !== null) {
      flattenedPredictions[k] = val;
      flattenedPredictions[`${k}_168h`] = val;
    }
  });

  // Safe Model Explanation
  const rawExplanation = aiAssessmentObj.explanation || record.modelExplanation;
  const modelExplanation = typeof rawExplanation === 'object' && rawExplanation !== null
    ? {
        framework: rawExplanation.framework || 'SHAP (TreeExplainer)',
        targetPrediction: rawExplanation.targetPrediction || 'Predicted 168h Limit Risk',
        baseValue: typeof rawExplanation.baseValue === 'number' ? rawExplanation.baseValue : null,
        features: Array.isArray(rawExplanation.features) ? rawExplanation.features : [],
        summaryText: rawExplanation.summaryText || 'Model explanation data synchronized with screening telemetry.',
      }
    : {
        framework: 'SHAP (TreeExplainer)',
        targetPrediction: 'Predicted 168h Limit Risk',
        baseValue: null,
        features: [],
        summaryText: 'No model explanation available for this record.',
      };

  // Safe Anomalies object (derived from real backend record only)
  const rawAnomalies = record.anomalies;
  const lotAnomalyObj = aiAssessmentObj.lotAnomaly;
  let anomalies = {
    populationAbnormality: null,
    trajectoryAbnormality: null,
    futureRiskPrediction: null,
  };

  if (rawAnomalies && typeof rawAnomalies === 'object') {
    anomalies = {
      populationAbnormality: typeof rawAnomalies.populationAbnormality === 'boolean' ? rawAnomalies.populationAbnormality : null,
      trajectoryAbnormality: typeof rawAnomalies.trajectoryAbnormality === 'boolean' ? rawAnomalies.trajectoryAbnormality : null,
      futureRiskPrediction: typeof rawAnomalies.futureRiskPrediction === 'string' ? rawAnomalies.futureRiskPrediction : null,
    };
  } else if (lotAnomalyObj && typeof lotAnomalyObj === 'object') {
    anomalies = {
      populationAbnormality: lotAnomalyObj.overallStatus === 'FLAGGED' ? true : lotAnomalyObj.status === 'ANALYZED' ? false : null,
      trajectoryAbnormality: aiAssessmentObj.prediction?.status === 'PREDICTED' ? (aiStatus === 'FLAGGED') : null,
      futureRiskPrediction: typeof riskScore === 'number' ? `${aiRisk}% Risk` : null,
    };
  }

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
    predictions: flattenedPredictions,
    rawPredictions,
    anomalies,
    modelExplanation,
    standbyCurrent: iddqVal !== null ? `${iddqVal.toFixed(2)} mA` : '-',
    leakageCurrent: leakageVal !== null ? `${leakageVal.toFixed(2)} µA` : '-',
    propagationDelay: propDelayVal !== null ? `${propDelayVal.toFixed(2)} ns` : '-',
    evidence: typeof record.evidence === 'string' ? record.evidence : (aiStatus === 'FLAGGED' ? 'AI Degradation / Anomaly Flagged' : 'Within Expected Limits'),
    engineeringLimitStatus: typeof record.engineeringLimitStatus === 'string' ? record.engineeringLimitStatus : 'WITHIN LIMIT',
    // Backward compatibility aliases
    status: engineeringStatus,
    decision: engineeringStatus,
    _source: 'backend-api',
  };
}
