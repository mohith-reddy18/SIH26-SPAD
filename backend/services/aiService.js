/**
 * SPAD AI Inference Service & Adapter (Step 11)
 *
 * Production-ready Model-Agnostic AI Integration Layer connecting SPAD backend
 * endpoints and the screening orchestrator to the AI Inference Engine.
 *
 * Architecture Separation:
 * - AI Model / Inference Service Responsibilities:
 *     - Method 1: predicted168h, predictionInterval, futureRiskScore,
 *                 futureRiskPercent, limitBreachProbability, aiFlag, modelExplanation
 *     - Method 2: lotAnomalyScore, peerComparisonEvidence, divergenceType,
 *                 aiFlag, modelExplanation
 *     - Model Traceability: modelName, modelVersion, timestamp
 *
 * - Backend Responsibilities (Computed strictly outside the model):
 *     - rateOfChangePerHour
 *     - projectedMargin (calculated against official limits)
 *     - engineeringStatus (NORMAL, SUSPECT, CRITICAL)
 *     - overallStatus (FLAGGED, NOT FLAGGED, NOT_EVALUATED)
 *     - currentYield
 *
 * Execution Modes:
 * 1. Remote Inference Engine: When `AI_SERVICE_URL` is set in the environment,
 *    delegates inference requests to the external model endpoint with timeout safety.
 * 2. Local Development Interface: When `AI_SERVICE_URL` is not set, uses the
 *    isolated deterministic evaluation engine for local testing.
 */

const ALLOWED_AI_FLAGS = Object.freeze(['FLAGGED', 'NOT FLAGGED', 'NOT_EVALUATED']);

/**
 * Returns dynamic model traceability metadata from environment or defaults.
 */
function getModelMetadata() {
  const isRemote = Boolean(process.env.AI_SERVICE_URL && process.env.AI_SERVICE_URL.trim());
  return {
    modelName: process.env.AI_MODEL_NAME || (isRemote ? 'SPAD-Remote-Model' : 'SPAD-Interface-Dev'),
    modelVersion: process.env.AI_MODEL_VERSION || '1.0.0-dev',
    status: isRemote ? 'REMOTE_INFERENCE' : 'LOCAL_DEV_INTERFACE',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validates the raw model output for Method 1 (168h Prediction).
 * Throws a standardized error if the output is malformed.
 *
 * @param {Object} rawOutput
 * @returns {Object} Validated predictions dictionary
 */
function validateMethod1Output(rawOutput) {
  if (!rawOutput || typeof rawOutput !== 'object') {
    throw {
      statusCode: 502,
      code: 'MODEL_OUTPUT_INVALID',
      message: 'Method 1 inference returned an invalid or empty response object',
    };
  }

  const predictions = rawOutput.predictions || rawOutput;
  if (typeof predictions !== 'object' || Array.isArray(predictions)) {
    throw {
      statusCode: 502,
      code: 'MODEL_OUTPUT_INVALID',
      message: 'Method 1 predictions payload must be an object keyed by parameter name',
    };
  }

  const normalized = {};

  for (const [paramKey, item] of Object.entries(predictions)) {
    if (!item || typeof item !== 'object') {
      throw {
        statusCode: 502,
        code: 'MODEL_OUTPUT_INVALID',
        message: `Prediction for parameter "${paramKey}" must be an object`,
      };
    }

    const status = item.status === 'PREDICTED' ? 'PREDICTED' : 'UNSUPPORTED_PARAMETER';

    // predicted168h must be numeric when status is PREDICTED
    let predicted168h = null;
    if (status === 'PREDICTED') {
      if (typeof item.predicted168h !== 'number' || isNaN(item.predicted168h)) {
        throw {
          statusCode: 502,
          code: 'MODEL_OUTPUT_INVALID',
          message: `Parameter "${paramKey}" with status PREDICTED must have a numeric "predicted168h"`,
        };
      }
      predicted168h = item.predicted168h;
    }

    // aiFlag must be one of the allowed contract values
    const aiFlag = item.aiFlag || 'NOT_EVALUATED';
    if (!ALLOWED_AI_FLAGS.includes(aiFlag)) {
      throw {
        statusCode: 502,
        code: 'MODEL_OUTPUT_INVALID',
        message: `Parameter "${paramKey}" has invalid aiFlag "${aiFlag}". Must be FLAGGED, NOT FLAGGED, or NOT_EVALUATED`,
      };
    }

    // futureRiskScore must be numeric
    let futureRiskScore = 0.0;
    if (typeof item.futureRiskScore === 'number' && !isNaN(item.futureRiskScore)) {
      futureRiskScore = Math.max(0.0, Math.min(1.0, item.futureRiskScore));
    }

    const hasValidInterval = Array.isArray(item.predictionInterval) &&
      item.predictionInterval.length === 2 &&
      typeof item.predictionInterval[0] === 'number' && !isNaN(item.predictionInterval[0]) &&
      typeof item.predictionInterval[1] === 'number' && !isNaN(item.predictionInterval[1]);

    normalized[paramKey] = {
      status,
      predicted168h,
      predictionInterval: hasValidInterval ? item.predictionInterval : null,
      futureRiskScore,
      futureRiskPercent: typeof item.futureRiskPercent === 'number' && !isNaN(item.futureRiskPercent) ? item.futureRiskPercent : null,
      limitBreachProbability: typeof item.limitBreachProbability === 'number' && !isNaN(item.limitBreachProbability) ? item.limitBreachProbability : null,
      aiFlag,
      modelExplanation: item.modelExplanation && typeof item.modelExplanation === 'object' ? item.modelExplanation : null,
    };
  }

  return normalized;
}

/**
 * Validates the raw model output for Method 2 (Lot Anomaly Detection).
 * Throws a standardized error if the output is malformed.
 *
 * @param {Object} rawOutput
 * @returns {Object} Validated anomalyResults dictionary
 */
function validateMethod2Output(rawOutput) {
  if (!rawOutput || typeof rawOutput !== 'object') {
    throw {
      statusCode: 502,
      code: 'MODEL_OUTPUT_INVALID',
      message: 'Method 2 inference returned an invalid or empty response object',
    };
  }

  const anomalyResults = rawOutput.anomalyResults || rawOutput;
  if (typeof anomalyResults !== 'object' || Array.isArray(anomalyResults)) {
    throw {
      statusCode: 502,
      code: 'MODEL_OUTPUT_INVALID',
      message: 'Method 2 anomalyResults payload must be an object keyed by parameter name',
    };
  }

  const normalized = {};

  for (const [paramKey, item] of Object.entries(anomalyResults)) {
    if (!item || typeof item !== 'object') {
      throw {
        statusCode: 502,
        code: 'MODEL_OUTPUT_INVALID',
        message: `Anomaly evaluation for parameter "${paramKey}" must be an object`,
      };
    }

    const status = item.status === 'ANALYZED' ? 'ANALYZED' : 'UNSUPPORTED_PARAMETER';

    // aiFlag must be one of the allowed contract values
    const aiFlag = item.aiFlag || 'NOT_EVALUATED';
    if (!ALLOWED_AI_FLAGS.includes(aiFlag)) {
      throw {
        statusCode: 502,
        code: 'MODEL_OUTPUT_INVALID',
        message: `Parameter "${paramKey}" has invalid aiFlag "${aiFlag}". Must be FLAGGED, NOT FLAGGED, or NOT_EVALUATED`,
      };
    }

    // lotAnomalyScore must be numeric or null
    let lotAnomalyScore = null;
    if (typeof item.lotAnomalyScore === 'number' && !isNaN(item.lotAnomalyScore)) {
      lotAnomalyScore = Math.max(0.0, Math.min(1.0, item.lotAnomalyScore));
    }

    const peerEvidence = item.peerComparisonEvidence && typeof item.peerComparisonEvidence === 'object' && !Array.isArray(item.peerComparisonEvidence)
      ? item.peerComparisonEvidence
      : {};

    normalized[paramKey] = {
      status,
      lotAnomalyScore,
      peerComparisonEvidence: peerEvidence,
      divergenceType: typeof item.divergenceType === 'string' ? item.divergenceType : null,
      aiFlag,
      modelExplanation: item.modelExplanation && typeof item.modelExplanation === 'object' ? item.modelExplanation : null,
    };
  }

  return normalized;
}

/**
 * Executes local development Method 1 inference (isolated deterministic logic).
 */
function localDevPredict168h({ parameters = {}, engineeringLimits = {} }) {
  const predictions = {};

  for (const [paramName, paramData] of Object.entries(parameters)) {
    const obs = paramData.observed || paramData.history || paramData.observations || paramData;
    const val0h = obs?.['0h'] ?? obs?.['0H'] ?? obs?.[0];
    const val24h = obs?.['24h'] ?? obs?.['24H'] ?? obs?.[24];

    if (typeof val0h !== 'number' || typeof val24h !== 'number' || isNaN(val0h) || isNaN(val24h)) {
      predictions[paramName] = {
        status: 'UNSUPPORTED_PARAMETER',
        predicted168h: null,
        predictionInterval: null,
        futureRiskScore: 0.0,
        futureRiskPercent: null,
        limitBreachProbability: null,
        aiFlag: 'NOT_EVALUATED',
        modelExplanation: null,
      };
      continue;
    }

    const deltaPerHour = (val24h - val0h) / 24;
    const predicted168h = Number((val24h + deltaPerHour * 144).toFixed(4));

    const limitObj = engineeringLimits[paramName] || paramData.engineeringLimit || null;
    let limitValue = null;
    let direction = 'UPPER';

    if (limitObj && typeof limitObj === 'object') {
      limitValue = typeof limitObj.limitValue === 'number' ? limitObj.limitValue : (limitObj.upper ?? limitObj.lower);
      direction = String(limitObj.direction || (limitObj.lower !== undefined ? 'LOWER' : 'UPPER')).toUpperCase();
    }

    let aiFlag = 'NOT FLAGGED';
    let futureRiskScore = 0.15;

    if (typeof limitValue === 'number') {
      const isBreaching = direction === 'UPPER' ? predicted168h > limitValue : predicted168h < limitValue;
      if (isBreaching) {
        aiFlag = 'FLAGGED';
        futureRiskScore = 0.85;
      }
    } else if (Math.abs(deltaPerHour) > 0.05) {
      aiFlag = 'FLAGGED';
      futureRiskScore = 0.70;
    }

    predictions[paramName] = {
      status: 'PREDICTED',
      predicted168h,
      predictionInterval: null,
      futureRiskScore,
      futureRiskPercent: null,
      limitBreachProbability: null,
      aiFlag,
      modelExplanation: null,
    };
  }

  return { predictions };
}

/**
 * Executes local development Method 2 inference (isolated statistical logic).
 */
function localDevDetectLotAnomalies({ targetComponentId, cohort = [] }) {
  const anomalyResults = {};
  const targetComp = cohort.find((c) => (c.componentId || c.id) === targetComponentId) || cohort[0];
  const targetParams = targetComp?.parameters || targetComp?.measurements || {};
  const peers = cohort.filter((c) => (c.componentId || c.id) !== targetComponentId);

  for (const [paramName, paramData] of Object.entries(targetParams)) {
    const obs = paramData.observed || paramData.history || paramData.observations || paramData;
    const val24h = obs?.['24h'] ?? obs?.['24H'] ?? obs?.[24];

    if (typeof val24h !== 'number' || isNaN(val24h)) {
      anomalyResults[paramName] = {
        status: 'UNSUPPORTED_PARAMETER',
        lotAnomalyScore: null,
        peerComparisonEvidence: { reason: 'Target component missing 24h telemetry' },
        divergenceType: null,
        aiFlag: 'NOT_EVALUATED',
        modelExplanation: null,
      };
      continue;
    }

    const peerValues = [];
    for (const peer of peers) {
      const pParam = peer.parameters?.[paramName] || peer.measurements?.[paramName];
      if (pParam) {
        const pObs = pParam.observed || pParam.history || pParam.observations || pParam;
        const pVal24h = pObs?.['24h'] ?? pObs?.['24H'] ?? pObs?.[24];
        if (typeof pVal24h === 'number' && !isNaN(pVal24h)) {
          peerValues.push(pVal24h);
        }
      }
    }

    if (peerValues.length < 2) {
      anomalyResults[paramName] = {
        status: 'UNSUPPORTED_PARAMETER',
        lotAnomalyScore: null,
        peerComparisonEvidence: { reason: 'Insufficient peer observations for parameter' },
        divergenceType: null,
        aiFlag: 'NOT_EVALUATED',
        modelExplanation: null,
      };
      continue;
    }

    const sum = peerValues.reduce((a, b) => a + b, 0);
    const mean = sum / peerValues.length;
    const variance = peerValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / peerValues.length;
    const std = Math.sqrt(variance);

    const diff = val24h - mean;
    const zScore = std > 0.0001 ? diff / std : (diff !== 0 ? diff * 5 : 0);
    const isOutlier = Math.abs(zScore) > 2.0;

    const aiFlag = isOutlier ? 'FLAGGED' : 'NOT FLAGGED';
    const divergenceType = isOutlier ? (diff > 0 ? 'ELEVATED_OUTLIER' : 'DEPRESSED_OUTLIER') : 'NOMINAL';
    const lotAnomalyScore = Number(Math.min(1.0, Math.max(0.0, Math.abs(zScore) / 4.0)).toFixed(3));

    anomalyResults[paramName] = {
      status: 'ANALYZED',
      lotAnomalyScore,
      peerComparisonEvidence: {
        peerMean: Number(mean.toFixed(3)),
        peerStd: Number(std.toFixed(3)),
        peerCount: peerValues.length,
        zScore: Number(zScore.toFixed(3)),
      },
      divergenceType,
      aiFlag,
      modelExplanation: null,
    };
  }

  return { anomalyResults };
}

/**
 * Dispatches inference request to remote AI service URL with timeout protection.
 *
 * @param {string} endpointPath
 * @param {Object} payload
 * @returns {Promise<Object>}
 */
async function callRemoteInference(endpointPath, payload) {
  const serviceUrl = process.env.AI_SERVICE_URL.replace(/\/+$/, '');
  const targetUrl = `${serviceUrl}${endpointPath}`;
  const timeoutMs = parseInt(process.env.AI_SERVICE_TIMEOUT_MS, 10) || 5000;

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.AI_SERVICE_KEY ? { Authorization: `Bearer ${process.env.AI_SERVICE_KEY}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw {
        statusCode: 503,
        code: 'MODEL_UNAVAILABLE',
        message: 'The predictive screening model service is currently unavailable or returned an error status',
      };
    }

    const data = await response.json();
    return data;
  } catch (err) {
    if (err.code === 'MODEL_UNAVAILABLE' || err.statusCode === 503) {
      throw err;
    }
    throw {
      statusCode: 503,
      code: 'MODEL_UNAVAILABLE',
      message: 'The predictive screening model service is currently unavailable or timed out',
    };
  }
}

/**
 * Method 1: Component-Level 168h Future Trajectory Prediction Model Adapter
 *
 * Input Contract:
 * {
 *   componentId: string,
 *   lotId: string,
 *   parameters: {
 *     [paramKey]: {
 *       unit: string,
 *       observed: { "0h": number, "24h": number }
 *     }
 *   },
 *   engineeringLimits?: { [paramKey]: { limitValue, direction, source } },
 *   context?: Object
 * }
 *
 * @param {Object} input
 * @returns {Promise<Object>} Model inference outcome
 */
async function predict168h(input) {
  const { componentId, lotId, parameters = {}, engineeringLimits = {}, context = {} } = input || {};

  let rawModelOutput;
  if (process.env.AI_SERVICE_URL && process.env.AI_SERVICE_URL.trim()) {
    // Production Remote Inference Path
    rawModelOutput = await callRemoteInference('/predict-168h', {
      componentId,
      lotId,
      parameters,
      engineeringLimits,
      context,
    });
  } else {
    throw {
      statusCode: 503,
      code: 'MODEL_UNAVAILABLE',
      message: 'The predictive screening model service is currently unavailable. Production inference requires a configured AI_SERVICE_URL.',
    };
  }

  // Validate and normalize model output
  const validatedPredictions = validateMethod1Output(rawModelOutput);

  return {
    componentId,
    lotId,
    modelMetadata: rawModelOutput?.modelMetadata || getModelMetadata(),
    predictions: validatedPredictions,
  };
}

/**
 * Method 2: Intra-Lot Statistical Peer Comparison Anomaly Detection Model Adapter
 *
 * Input Contract:
 * {
 *   targetComponentId: string,
 *   lotId: string,
 *   cohort: Array<{ componentId, lotId, parameters }>,
 *   context?: Object
 * }
 *
 * @param {Object} input
 * @returns {Promise<Object>} Model inference outcome
 */
async function detectLotAnomalies(input) {
  const { targetComponentId, lotId, cohort = [], context = {} } = input || {};

  let rawModelOutput;
  if (process.env.AI_SERVICE_URL && process.env.AI_SERVICE_URL.trim()) {
    // Production Remote Inference Path
    rawModelOutput = await callRemoteInference('/detect-lot-anomalies', {
      targetComponentId,
      lotId,
      cohort,
      context,
    });
  } else {
    throw {
      statusCode: 503,
      code: 'MODEL_UNAVAILABLE',
      message: 'The lot anomaly detection model service is currently unavailable. Production inference requires a configured AI_SERVICE_URL.',
    };
  }

  // Validate and normalize model output
  const validatedAnomalyResults = validateMethod2Output(rawModelOutput);

  return {
    targetComponentId,
    lotId,
    modelMetadata: rawModelOutput?.modelMetadata || getModelMetadata(),
    anomalyResults: validatedAnomalyResults,
  };
}

module.exports = {
  getModelMetadata,
  validateMethod1Output,
  validateMethod2Output,
  predict168h,
  detectLotAnomalies,
};
