/**
 * SPAD Backend Screening Orchestration Service (Step 9)
 *
 * Orchestrates the complete end-to-end evaluation flow:
 * 1. Load target component from MongoDB (by componentId + lotId)
 * 2. Load same-lot cohort from MongoDB
 * 3. Validate parametric observations (0h, 24h)
 * 4. Resolve official engineering limits
 * 5. Method 1: Future Trajectory Prediction (0h + 24h -> 168h)
 * 6. Method 2: Same-Lot Statistical Anomaly Detection (>= 3 cohort units)
 * 7. Deterministic Engineering Status (from measurements + official limits)
 * 8. Aggregate AI Overall Status
 * 9. Persist combined screening record to MongoDB (upsert / update)
 * 10. Return combined screening record
 */

const ScreeningRecord = require('../models/ScreeningRecord');
const aiService = require('./aiService');
const {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
} = require('../utils/contractCalculations');

/**
 * Normalizes parameter observations from measurements dictionary or history.
 *
 * @param {Object} measurements
 * @returns {Object} { [param]: { observed: { "0h": number, "24h": number }, unit: string } }
 */
function extractTelemetryDictionary(measurements = {}, limits = {}) {
  const params = {};

  for (const [paramKey, series] of Object.entries(measurements)) {
    if (series == null) continue;

    let val0h = null;
    let val24h = null;

    if (Array.isArray(series)) {
      val0h = typeof series[0] === 'number' && !isNaN(series[0]) ? series[0] : null;
      val24h = typeof series[1] === 'number' && !isNaN(series[1]) ? series[1] : null;
    } else if (typeof series === 'object') {
      const raw0h = series['0h'] ?? series['0H'] ?? series[0];
      const raw24h = series['24h'] ?? series['24H'] ?? series[24];
      val0h = typeof raw0h === 'number' && !isNaN(raw0h) ? raw0h : null;
      val24h = typeof raw24h === 'number' && !isNaN(raw24h) ? raw24h : null;
    }

    const unit = limits[paramKey]?.unit || (paramKey === 'iddq' ? 'mA' : paramKey === 'leakage' ? 'µA' : paramKey === 'propDelay' ? 'ns' : '');

    params[paramKey] = {
      unit,
      observed: {
        '0h': val0h,
        '24h': val24h,
      },
    };
  }

  return params;
}

/**
 * Executes full screening orchestration flow.
 *
 * @param {Object} params
 * @param {string} params.componentId
 * @param {string} params.lotId
 * @param {Object} [params.customLimits]
 * @param {Object} [params.context]
 * @returns {Promise<Object>} Combined screening evaluation outcome
 */
async function runScreeningOrchestration({ componentId, lotId, customLimits = null, context = {} }) {
  if (!componentId || typeof componentId !== 'string' || !componentId.trim()) {
    throw {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Field "componentId" is required and must be a non-empty string',
      componentId: null,
      lotId,
    };
  }

  const cleanCompId = componentId.trim();
  const cleanLotId = (typeof lotId === 'string' && lotId.trim()) ? lotId.trim() : null;

  // 1. Load target component from MongoDB (enforcing lotId if provided)
  const query = { componentId: cleanCompId };
  if (cleanLotId) query.lotId = cleanLotId;

  const targetDoc = await ScreeningRecord.findOne(query).lean();

  if (!targetDoc) {
    throw {
      statusCode: 404,
      code: 'NOT_FOUND',
      message: `Screening record for component "${cleanCompId}"${cleanLotId ? ` in lot "${cleanLotId}"` : ''} not found in database`,
      componentId: cleanCompId,
      lotId: cleanLotId,
    };
  }

  const resolvedLotId = targetDoc.lotId || cleanLotId || 'LOT-2026-001';
  const measurements = targetDoc.measurements || {};
  const engineeringLimits = customLimits || targetDoc.engineeringLimits || {};

  // 2. Load SAME-LOT cohort from MongoDB
  const sameLotDocs = await ScreeningRecord.find({ lotId: resolvedLotId }).lean();
  
  // Ensure target is included in the cohort array
  const cohort = sameLotDocs.some((d) => d.componentId === cleanCompId)
    ? sameLotDocs
    : [targetDoc, ...sameLotDocs];

  const componentsAnalyzed = cohort.length;
  const eligiblePeersCount = Math.max(0, componentsAnalyzed - 1);

  // 3. Extract & Validate Telemetry Dictionary
  const telemetryParams = extractTelemetryDictionary(measurements, engineeringLimits);

  const allAiFlags = [];

  // ==========================================================================
  // 4. Method 1: Future Trajectory Prediction
  // ==========================================================================
  let m1Result;
  try {
    m1Result = await aiService.predict168h({
      componentId: cleanCompId,
      lotId: resolvedLotId,
      parameters: telemetryParams,
      engineeringLimits,
      context,
    });
  } catch (err) {
    throw {
      statusCode: 503,
      code: 'MODEL_UNAVAILABLE',
      message: 'Method 1 AI prediction inference failed or service is unavailable',
      componentId: cleanCompId,
      lotId: resolvedLotId,
    };
  }

  const responseM1Params = {};

  for (const [paramName, paramData] of Object.entries(telemetryParams)) {
    const val0h = paramData.observed?.['0h'];
    const val24h = paramData.observed?.['24h'];
    const aiPred = m1Result.predictions[paramName] || {};

    // Backend-derived: rateOfChangePerHour
    const roc = rateOfChangePerHour(val0h, val24h);

    // Official Limit Resolution
    const rawLimit = engineeringLimits[paramName] || null;
    let limitOutput = null;
    let calculatedMargin = null;

    if (rawLimit && typeof rawLimit === 'object') {
      const limitVal = typeof rawLimit.limitValue === 'number' ? rawLimit.limitValue : (rawLimit.upper ?? rawLimit.lower);
      const dir = rawLimit.direction || (rawLimit.lower !== undefined ? 'LOWER' : 'UPPER');
      const src = rawLimit.source ? String(rawLimit.source).toUpperCase() : 'DATABASE_CATALOG';
      const isOfficialLimit = src === 'DATABASE_CATALOG' || src === 'SUPPLIED';

      if (typeof limitVal === 'number') {
        limitOutput = {
          limitValue: limitVal,
          direction: String(dir).toUpperCase(),
          source: src,
        };

        // Projected margin computed against official limits only
        if (isOfficialLimit && typeof aiPred.predicted168h === 'number') {
          calculatedMargin = projectedMargin(aiPred.predicted168h, limitVal, dir);
        }
      }
    }

    const flag = aiPred.aiFlag || 'NOT_EVALUATED';
    allAiFlags.push(flag);

    responseM1Params[paramName] = {
      status: aiPred.status || 'PREDICTED',
      unit: paramData.unit || '',
      observed: {
        '0h': val0h,
        '24h': val24h,
      },
      predicted168h: aiPred.predicted168h,
      rateOfChangePerHour: roc,
      engineeringLimit: limitOutput,
      limitBreachProbability: aiPred.limitBreachProbability ?? null,
      projectedMargin: calculatedMargin,
      futureRiskScore: aiPred.futureRiskScore ?? 0.0,
      futureRiskPercent: aiPred.futureRiskPercent ?? null,
      aiFlag: flag,
    };
  }

  // ==========================================================================
  // 5. Method 2: Same-Lot Anomaly Detection
  // ==========================================================================
  let responseM2Params = {};
  let m2CohortQuality = 'SUFFICIENT';
  let m2AiStatus = 'NOT_EVALUATED';

  if (componentsAnalyzed < 3) {
    // Insufficient cohort (<3 same-lot units): Partial evaluation without erroring
    m2CohortQuality = 'INSUFFICIENT';
    m2AiStatus = 'NOT_EVALUATED';

    for (const [paramName, paramData] of Object.entries(telemetryParams)) {
      responseM2Params[paramName] = {
        status: 'INSUFFICIENT_COHORT',
        observed: paramData.observed,
        lotAnomalyScore: null,
        peerComparisonEvidence: {
          reason: 'At least 3 same-lot components required for statistical peer comparison.',
        },
        divergenceType: null,
        aiFlag: 'NOT_EVALUATED',
      };
      allAiFlags.push('NOT_EVALUATED');
    }
  } else {
    // Evaluate via Method 2 Interface
    try {
      const m2CohortInput = cohort.map((c) => ({
        componentId: c.componentId,
        lotId: c.lotId,
        parameters: extractTelemetryDictionary(c.measurements || {}, engineeringLimits),
      }));

      const m2Result = await aiService.detectLotAnomalies({
        targetComponentId: cleanCompId,
        lotId: resolvedLotId,
        cohort: m2CohortInput,
        context,
      });

      for (const [paramName, paramData] of Object.entries(telemetryParams)) {
        const aiEval = m2Result.anomalyResults[paramName] || {};
        const flag = aiEval.aiFlag || 'NOT_EVALUATED';
        allAiFlags.push(flag);

        responseM2Params[paramName] = {
          status: aiEval.status || 'ANALYZED',
          observed: paramData.observed,
          lotAnomalyScore: aiEval.lotAnomalyScore ?? null,
          peerComparisonEvidence: aiEval.peerComparisonEvidence || {},
          divergenceType: aiEval.divergenceType ?? null,
          aiFlag: flag,
        };
      }
      m2AiStatus = overallStatus(Object.values(responseM2Params).map((p) => p.aiFlag));
    } catch (err) {
      // Model error during Method 2 falls back to NOT_EVALUATED
      m2CohortQuality = 'INSUFFICIENT';
      m2AiStatus = 'NOT_EVALUATED';
      for (const [paramName, paramData] of Object.entries(telemetryParams)) {
        responseM2Params[paramName] = {
          status: 'UNSUPPORTED_PARAMETER',
          observed: paramData.observed,
          lotAnomalyScore: null,
          peerComparisonEvidence: { reason: 'Anomaly detection model unavailable' },
          divergenceType: null,
          aiFlag: 'NOT_EVALUATED',
        };
        allAiFlags.push('NOT_EVALUATED');
      }
    }
  }

  // ==========================================================================
  // 6. Deterministic Engineering Status
  // ==========================================================================
  const calculatedEngineeringStatus = engineeringStatus(measurements, engineeringLimits);

  // ==========================================================================
  // 7. Aggregate Overall AI Status
  // ==========================================================================
  const calculatedAiOverallStatus = overallStatus(allAiFlags);

  // ==========================================================================
  // 8. Combine & Structure Canonical Screening Record
  // ==========================================================================
  const combinedRecord = {
    componentId: cleanCompId,
    lotId: resolvedLotId,
    stage: targetDoc.stage || '24h',
    measurements,
    engineeringLimits,
    engineeringStatus: calculatedEngineeringStatus,
    aiAssessment: {
      overallStatus: calculatedAiOverallStatus,
      prediction: {
        status: 'PREDICTED',
        method: 'FUTURE_PREDICTION',
        modelMetadata: m1Result.modelMetadata || undefined,
        parameters: responseM1Params,
      },
      lotAnomaly: {
        status: m2AiStatus === 'NOT_EVALUATED' && m2CohortQuality === 'INSUFFICIENT' ? 'INSUFFICIENT_COHORT' : 'ANALYZED',
        method: 'LOT_ANOMALY_DETECTION',
        cohortQuality: m2CohortQuality,
        componentsAnalyzed,
        eligiblePeersCount,
        parameters: responseM2Params,
      },
      explanation: targetDoc.aiAssessment?.explanation || targetDoc.modelExplanation || null,
    },
    // Backward compatibility legacy fields
    status: calculatedEngineeringStatus,
    aiRisk: calculatedAiOverallStatus === 'FLAGGED' ? 85 : 15,
    riskScore: calculatedAiOverallStatus === 'FLAGGED' ? 0.85 : 0.15,
  };

  // ==========================================================================
  // 9. Persist Combined Screening Record to MongoDB (Upsert / Update)
  // ==========================================================================
  const savedDocument = await ScreeningRecord.findOneAndUpdate(
    { componentId: cleanCompId, lotId: resolvedLotId },
    { $set: combinedRecord },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    success: true,
    message: 'Screening orchestration completed successfully',
    data: savedDocument,
  };
}

module.exports = {
  runScreeningOrchestration,
};
