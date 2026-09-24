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
 * @param {string} paramKey - Parameter key (e.g. 'rdson', 'delta_rdson', 'temp')
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
  rdson: { name: 'On-Resistance (RDS(on))', shortName: 'RDS(on)', unit: 'Ω', defaultRef: [0.513, 0.545, 0.569, 0.612] },
  rdson_ohm: { name: 'On-Resistance (RDS(on))', shortName: 'RDS(on)', unit: 'Ω', defaultRef: [0.513, 0.545, 0.569, 0.612] },
  rds_on: { name: 'On-Resistance (RDS(on))', shortName: 'RDS(on)', unit: 'Ω', defaultRef: [0.513, 0.545, 0.569, 0.612] },
  delta_rdson: { name: 'Early Drift ΔRDS(0→33)', shortName: 'ΔRDS', unit: 'Ω', defaultRef: [0.0, 0.031, 0.055, 0.080] },
  temp: { name: 'Chamber Temperature (T_j)', shortName: 'T_j', unit: '°C', defaultRef: [199.5, 200.0, 199.8, 200.2] },
  vgs: { name: 'Gate Voltage (V_GS)', shortName: 'V_GS', unit: 'V', defaultRef: [10.0, 10.0, 10.0, 10.0] },
  vds: { name: 'Drain-Source Voltage (V_DS)', shortName: 'V_DS', unit: 'V', defaultRef: [5.0, 5.0, 5.0, 5.0] },
  freq: { name: 'Switching Frequency (f_sw)', shortName: 'f_sw', unit: 'Hz', defaultRef: [1000, 1000, 1000, 1000] },
  dutyCycle: { name: 'Duty Cycle', shortName: 'Duty', unit: '%', defaultRef: [40, 40, 40, 40] },
  v_th: { name: 'Threshold Voltage (V_th)', shortName: 'V_th', unit: 'V', defaultRef: [1.20, 1.20, 1.20, 1.20] },
  vth: { name: 'Threshold Voltage (V_th)', shortName: 'V_th', unit: 'V', defaultRef: [1.20, 1.20, 1.20, 1.20] },
};

/**
 * Derives rich display metadata dynamically for any parameter key from backend telemetry & limits.
 *
 * @param {string} key - Machine-readable parameter key (e.g. 'rdson', 'delta_rdson', 'temp')
 * @param {number|Object} limit - Engineering limit value or object
 * @returns {Object} Parameter metadata with id, name, shortName, unit, specLimitMax, healthyRef
 */
export function getParameterMeta(key, limit) {
  if (!key) {
    return { id: '', key: '', name: '', shortName: '', unit: '', specLimitMax: undefined, healthyRef: [0, 0, 0, 0] };
  }

  const cleanKey = String(key).trim();
  const lowerKey = cleanKey.toLowerCase();
  const matched = PARAMETER_DISPLAY_MAP[cleanKey] || PARAMETER_DISPLAY_MAP[lowerKey] || {};

  let limitValue = undefined;
  let limitUnit = '';

  if (typeof limit === 'number' && !isNaN(limit)) {
    limitValue = limit;
  } else if (limit && typeof limit === 'object') {
    if (typeof limit.limitValue === 'number') limitValue = limit.limitValue;
    else if (typeof limit.max === 'number') limitValue = limit.max;
    else if (typeof limit.value === 'number') limitValue = limit.value;

    if (typeof limit.unit === 'string') limitUnit = limit.unit;
  }

  // Derive human-friendly display name if not in static mapping
  let derivedName = matched.name;
  if (!derivedName) {
    if (lowerKey.includes('rdson') || lowerKey.includes('rds')) {
      derivedName = 'On-Resistance (RDS(on))';
    } else if (lowerKey === 'vth' || lowerKey.includes('v_th') || lowerKey.includes('threshold')) {
      derivedName = 'Threshold Voltage (V_th)';
    } else if (lowerKey.includes('leakage')) {
      derivedName = 'Leakage Current (I_leak)';
    } else if (lowerKey.includes('delay')) {
      derivedName = 'Propagation Delay (t_pd)';
    } else if (lowerKey.includes('iddq')) {
      derivedName = 'Standby Current (Iddq)';
    } else {
      derivedName = cleanKey
        .replace(/_/g, ' ')
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (str) => str.toUpperCase())
        .trim();
    }
  }

  // Derive short name
  const derivedShortName = matched.shortName || cleanKey;

  // Derive unit
  let derivedUnit = matched.unit || limitUnit;
  if (!derivedUnit) {
    if (lowerKey.includes('rdson') || lowerKey.includes('rds') || lowerKey.includes('resist')) {
      derivedUnit = 'Ω';
    } else if (lowerKey.includes('volt') || lowerKey.startsWith('v_') || lowerKey.startsWith('vth')) {
      derivedUnit = 'V';
    } else if (lowerKey.includes('curr') || lowerKey.includes('leak') || lowerKey.includes('iddq')) {
      derivedUnit = 'mA';
    } else if (lowerKey.includes('delay') || lowerKey.includes('time')) {
      derivedUnit = 'ns';
    } else if (lowerKey.includes('freq')) {
      derivedUnit = 'Hz';
    }
  }

  return {
    id: cleanKey,
    key: cleanKey,
    name: derivedName,
    shortName: derivedShortName,
    unit: derivedUnit,
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

  const componentId = String(record.componentId || record.id || 'TEST-01').trim();
  const lotId = String(record.lotId || 'NASA-MOSFET-199C').trim();
  const stage = String(record.stage || '100%').trim();

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

  // Extract latest readings for quick table display (prioritizing NASA MOSFET ML outputs)
  const rdsonVal = extractLatestValue(measurements.rdson || measurements.rdson_ohm || measurements.rds_on);
  const deltaRdsonVal = extractLatestValue(measurements.delta_rdson);
  const tempVal = extractLatestValue(measurements.temp);
  const iddqVal = extractLatestValue(measurements.iddq);
  const leakageVal = extractLatestValue(measurements.leakage || measurements.leakageCurrent);
  const propDelayVal = extractLatestValue(measurements.propDelay || measurements.propagationDelay);

  // Risk score extraction (prediction parameter level or top-level)
  const firstParamPred = aiAssessmentObj.prediction?.parameters?.rdson || Object.values(aiAssessmentObj.prediction?.parameters || {})[0];
  let riskScore = 0.08;
  if (typeof firstParamPred?.futureRiskScore === 'number') {
    riskScore = firstParamPred.futureRiskScore;
  } else if (typeof record.riskScore === 'number') {
    riskScore = record.riskScore;
  } else if (typeof record.aiRisk === 'number') {
    riskScore = record.aiRisk > 1 ? record.aiRisk / 100 : record.aiRisk;
  } else if (aiStatus === 'FLAGGED') {
    riskScore = 0.98;
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
    rdson: rdsonVal !== null ? `${rdsonVal.toFixed(3)} Ω` : '-',
    deltaRdson: deltaRdsonVal !== null ? `${deltaRdsonVal.toFixed(3)} Ω` : '-',
    temperature: tempVal !== null ? `${tempVal.toFixed(1)} °C` : '-',
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
