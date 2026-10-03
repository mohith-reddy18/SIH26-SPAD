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

  // 1. If explicit string provided
  if (typeof recordOrAi === 'string') {
    const s = recordOrAi.trim().toUpperCase();
    if (s === 'FLAGGED') return 'FLAGGED';
    if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED' || s === 'NOMINAL' || s === 'NORMAL' || s === 'PASS') return 'NOT FLAGGED';
    return 'NOT_EVALUATED';
  }

  const aiAssessment = recordOrAi.aiAssessment || recordOrAi;

  // 2. Check submodule flags if aiAssessment is an object
  if (typeof aiAssessment === 'object' && aiAssessment !== null) {
    const m1Flag = aiAssessment.prediction?.parameters?.rdson?.aiFlag ?? aiAssessment.prediction?.aiFlag;
    const m2Flag = aiAssessment.lotAnomaly?.parameters?.rdson?.aiFlag ?? aiAssessment.lotAnomaly?.aiFlag;
    const m3Flag = aiAssessment.moduleC?.parameters?.rdson?.aiFlag ?? aiAssessment.moduleC?.aiFlag;

    const evalFlags = [];
    [m1Flag, m2Flag, m3Flag].forEach((f) => {
      if (f) {
        const s = String(f).trim().toUpperCase();
        if (s === 'FLAGGED' || s === '1' || s === 'TRUE' || s === 'ANOMALY') evalFlags.push('FLAGGED');
        else if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED' || s === '0' || s === 'FALSE' || s === 'PASS' || s === 'NOMINAL' || s === 'NORMAL') evalFlags.push('NOT FLAGGED');
      }
    });

    if (evalFlags.includes('FLAGGED')) return 'FLAGGED';
    if (evalFlags.length > 0 && evalFlags.every((f) => f === 'NOT FLAGGED')) return 'NOT FLAGGED';

    const raw = aiAssessment.overallStatus || aiAssessment.status || recordOrAi.overallStatus || recordOrAi.aiStatus;
    if (raw) {
      const s = String(raw).trim().toUpperCase();
      if (s === 'FLAGGED') return 'FLAGGED';
      if (s === 'NOT FLAGGED' || s === 'NOT_FLAGGED' || s === 'NOMINAL' || s === 'NORMAL' || s === 'PASS') return 'NOT FLAGGED';
    }
  }

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
  rdson_0h: { name: 'RDS(on) — 0% OBSERVED', shortName: 'RDS(0%)', unit: 'Ω', defaultRef: [0.513, 0.513, 0.513, 0.513] },
  rdson_24h: { name: 'RDS(on) — 33.3% OBSERVED', shortName: 'RDS(33.3%)', unit: 'Ω', defaultRef: [0.519, 0.519, 0.519, 0.519] },
  rdson_168h: { name: 'RDS(on) — 100% FORECAST', shortName: 'RDS(100%)', unit: 'Ω', defaultRef: [0.648, 0.648, 0.648, 0.648] },
  rdson_168h_forecast: { name: 'RDS(on) — 100% FORECAST', shortName: 'RDS(100%)', unit: 'Ω', defaultRef: [0.648, 0.648, 0.648, 0.648] },
  delta_rdson: { name: 'ΔRDS — Early Drift', shortName: 'ΔRDS', unit: 'Ω', defaultRef: [0.0, 0.031, 0.055, 0.080] },
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
    if (lowerKey === 'delta_rdson' || lowerKey === 'deltardson' || lowerKey.includes('delta_rds') || lowerKey.includes('drift')) {
      derivedName = 'Early Drift (ΔRDS)';
    } else if (lowerKey === 'rdson' || lowerKey === 'rds_on' || lowerKey === 'rds(on)' || lowerKey.includes('rdson') || lowerKey.includes('rds')) {
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
 * Normalizes stage labels to percentage display format:
 * 0% (0hr), 33.3% (24hr), 66.7% (96hr), 100% (168hr)
 *
 * @param {string} stage
 * @returns {string}
 */
export function formatStageLabel(stage) {
  if (!stage) return '100%';
  const s = String(stage).trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (s === '0%' || s === '0h' || s === '0hr' || s === '0hrs' || s === '0hour' || s === '0hours' || s === 'stage0h' || s === 'stage0hr' || s === '0') return '0%';
  if (s === '33.33%' || s === '33%' || s === '33.3%' || s === '24h' || s === '24hr' || s === '24hrs' || s === '24hour' || s === '24hours' || s === 'stage24h' || s === 'stage24hr' || s === '24') return '33.3%';
  if (s === '66.67%' || s === '66%' || s === '66.7%' || s === '67%' || s === '96h' || s === '96hr' || s === '96hrs' || s === '96hour' || s === '96hours' || s === 'stage96h' || s === 'stage96hr' || s === '96') return '66.7%';
  if (s === '100%' || s === '168h' || s === '168hr' || s === '168hrs' || s === '168hour' || s === '168hours' || s === 'stage168h' || s === 'stage168hr' || s === '168') return '100%';
  return String(stage).trim();
}

/**
 * Maps a backend ScreeningRecord to the unified frontend component object
 *
 * @param {Object} record - Raw MongoDB ScreeningRecord from backend
 * @returns {Object} Normalized component view object
 */
export function mapScreeningRecord(record) {
  if (!record || typeof record !== 'object') return null;

  const componentId = String(record.componentId || record.id || 'UNKNOWN').trim();
  const lotId = String(record.lotId || 'LOT-UNKNOWN').trim();
  const stage = formatStageLabel(record.stage || '100%');

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
        targetPrediction: rawExplanation.targetPrediction || 'Predicted 100% Limit Risk',
        baseValue: typeof rawExplanation.baseValue === 'number' ? rawExplanation.baseValue : null,
        features: Array.isArray(rawExplanation.features) ? rawExplanation.features : [],
        summaryText: rawExplanation.summaryText || 'Model explanation data synchronized with screening telemetry.',
      }
    : {
        framework: 'SHAP (TreeExplainer)',
        targetPrediction: 'Predicted 100% Limit Risk',
        baseValue: null,
        features: [],
        summaryText: 'No model explanation available for this record.',
      };

  // Safe Anomalies object (derived from real canonical aiAssessment record only)
  const lotAnomalyObj = aiAssessmentObj.lotAnomaly;
  const lotParam = lotAnomalyObj?.parameters?.rdson || Object.values(lotAnomalyObj?.parameters || {})[0] || {};
  const predParam = aiAssessmentObj.prediction?.parameters?.rdson || Object.values(aiAssessmentObj.prediction?.parameters || {})[0] || {};

  const rawLotAiFlag = lotParam.aiFlag ?? lotAnomalyObj?.aiFlag;
  const noveltyVal = lotParam.peerComparisonEvidence?.noveltyPercentile;
  const robustZVal = lotParam.peerComparisonEvidence?.robustZScore ?? lotParam.peerComparisonEvidence?.zScore;

  let populationAbnormality = null;
  if (rawLotAiFlag === 'FLAGGED' || rawLotAiFlag === '1' || rawLotAiFlag === 'TRUE') {
    populationAbnormality = true;
  } else if (rawLotAiFlag === 'NOT FLAGGED' || rawLotAiFlag === 'NOT_FLAGGED' || rawLotAiFlag === '0' || rawLotAiFlag === 'FALSE' || rawLotAiFlag === 'NOMINAL' || rawLotAiFlag === 'NORMAL' || rawLotAiFlag === 'PASS') {
    populationAbnormality = false;
  } else if (typeof noveltyVal === 'number' && !isNaN(noveltyVal)) {
    populationAbnormality = noveltyVal >= 90.0;
  } else if (typeof robustZVal === 'number' && !isNaN(robustZVal)) {
    populationAbnormality = Math.abs(robustZVal) > 3.0;
  }

  const rawPredAiFlag = predParam.aiFlag ?? aiAssessmentObj.prediction?.aiFlag;
  let trajectoryAbnormality = null;
  if (rawPredAiFlag === 'FLAGGED' || rawPredAiFlag === '1' || rawPredAiFlag === 'TRUE') {
    trajectoryAbnormality = true;
  } else if (rawPredAiFlag === 'NOT FLAGGED' || rawPredAiFlag === 'NOT_FLAGGED' || rawPredAiFlag === '0' || rawPredAiFlag === 'FALSE' || rawPredAiFlag === 'NOMINAL' || rawPredAiFlag === 'NORMAL' || rawPredAiFlag === 'PASS') {
    trajectoryAbnormality = false;
  }

  const anomalies = {
    populationAbnormality,
    trajectoryAbnormality,
    futureRiskPrediction: typeof riskScore === 'number' ? `${aiRisk}% Risk` : null,
  };

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
