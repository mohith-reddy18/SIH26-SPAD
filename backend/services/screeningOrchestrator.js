/**
 * SPAD Backend Screening Orchestration Service (Step 9 & Step 19)
 *
 * Orchestrates the complete end-to-end evaluation flow:
 * 1. Supports both Single Component and Whole Lot evaluation modes
 * 2. Method 1: Future Trajectory Prediction (0h + 24h -> 168h)
 * 3. Method 2: Same-Lot Statistical Anomaly Detection (>= 3 cohort units)
 * 4. Deterministic Engineering Status (from physical measurements + official limits)
 * 5. Aggregate AI Overall Status
 * 6. Persist canonical screening record to MongoDB (upsert / update)
 * 7. Return single record or lot summary
 */

const ScreeningRecord = require('../models/ScreeningRecord');
const aiService = require('./aiService');
const {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
  currentYield,
} = require('../utils/contractCalculations');

/**
 * Normalizes parameter observations from measurements dictionary or history.
 *
 * @param {Object} measurements
 * @param {Object} limits
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

    const lowerParam = paramKey.toLowerCase();
    const unit = limits[paramKey]?.unit || (lowerParam.includes('rds') ? 'Ω' : lowerParam.includes('temp') ? '°C' : lowerParam.startsWith('v') ? 'V' : lowerParam.includes('freq') ? 'Hz' : lowerParam === 'iddq' ? 'mA' : lowerParam.includes('leak') ? 'µA' : '');

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
 * Evaluates a single component against its same-lot cohort and persists the result.
 *
 * @param {Object} params
 * @param {Object} params.targetDoc
 * @param {Array<Object>} params.sameLotDocs
 * @param {Object} [params.customLimits]
 * @param {Object} [params.context]
 * @returns {Promise<Object>} Persisted canonical document
 */
async function evaluateSingleComponent({ targetDoc, sameLotDocs = [], customLimits = null, context = {} }) {
  const cleanCompId = targetDoc.componentId;
  const resolvedLotId = targetDoc.lotId || 'LOT-2026-001';
  const measurements = targetDoc.measurements || {};
  const engineeringLimits = customLimits || targetDoc.engineeringLimits || {};

  // Ensure target is included in the cohort array
  const cohort = sameLotDocs.some((d) => d.componentId === cleanCompId)
    ? sameLotDocs
    : [targetDoc, ...sameLotDocs];

  const componentsAnalyzed = cohort.length;
  const eligiblePeersCount = Math.max(0, componentsAnalyzed - 1);

  // 1. Extract & Validate Telemetry Dictionary
  const telemetryParams = extractTelemetryDictionary(measurements, engineeringLimits);
  const allAiFlags = [];

  // ==========================================================================
  // 2. Method 1: Future Trajectory Prediction
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
  // 3. Method 2: Same-Lot Anomaly Detection
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
  // 4. Deterministic Engineering Status
  // ==========================================================================
  const calculatedEngineeringStatus = engineeringStatus(measurements, engineeringLimits);

  // ==========================================================================
  // 5. Aggregate Overall AI Status
  // ==========================================================================
  const calculatedAiOverallStatus = overallStatus(allAiFlags);

  // ==========================================================================
  // 6. Combine & Structure Canonical Screening Record
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
  // 7. Persist Combined Screening Record to MongoDB (Upsert / Update)
  // ==========================================================================
  const savedDocument = await ScreeningRecord.findOneAndUpdate(
    { componentId: cleanCompId, lotId: resolvedLotId },
    { $set: combinedRecord },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  ).lean();

  return savedDocument;
}

/**
 * Executes full screening orchestration flow for a single component or an entire lot.
 *
 * @param {Object} params
 * @param {string} [params.componentId]
 * @param {string} [params.lotId]
 * @param {Object} [params.customLimits]
 * @param {Object} [params.context]
 * @returns {Promise<Object>} Combined screening evaluation outcome or lot summary
 */
async function runScreeningOrchestration({ componentId, lotId, customLimits = null, context = {} }) {
  // Validation: if componentId is explicitly passed, it must not be empty/whitespace
  if (componentId !== undefined && componentId !== null) {
    if (typeof componentId !== 'string' || !componentId.trim()) {
      throw {
        statusCode: 400,
        code: 'VALIDATION_ERROR',
        message: 'Field "componentId" is required and must be a non-empty string',
        componentId: null,
        lotId,
      };
    }
  }

  const cleanCompId = (typeof componentId === 'string' && componentId.trim()) ? componentId.trim() : null;
  const cleanLotId = (typeof lotId === 'string' && lotId.trim()) ? lotId.trim() : null;

  // Validation: at least componentId or lotId must be present
  if (!cleanCompId && !cleanLotId) {
    throw {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Either "componentId" or "lotId" is required for screening orchestration',
      componentId: null,
      lotId: null,
    };
  }

  // --- MODE 1: Whole Lot Screening Orchestration ---
  if (!cleanCompId && cleanLotId) {
    const lotDocs = await ScreeningRecord.find({ lotId: cleanLotId }).lean();

    if (!lotDocs || lotDocs.length === 0) {
      throw {
        statusCode: 404,
        code: 'NOT_FOUND',
        message: `No screening records found for lot "${cleanLotId}" in database`,
        componentId: null,
        lotId: cleanLotId,
      };
    }

    const evaluatedRecords = [];
    for (const doc of lotDocs) {
      const evaluated = await evaluateSingleComponent({
        targetDoc: doc,
        sameLotDocs: lotDocs,
        customLimits,
        context,
      });
      evaluatedRecords.push(evaluated);
    }

    // Compute Lot Summary Metrics
    let normalCount = 0;
    let suspectCount = 0;
    let criticalCount = 0;
    let aiFlaggedCount = 0;
    let aiNotFlaggedCount = 0;
    let aiNotEvaluatedCount = 0;

    for (const rec of evaluatedRecords) {
      const eng = rec.engineeringStatus;
      if (eng === 'NORMAL') normalCount++;
      else if (eng === 'SUSPECT') suspectCount++;
      else if (eng === 'CRITICAL') criticalCount++;

      const ai = rec.aiAssessment?.overallStatus;
      if (ai === 'FLAGGED') aiFlaggedCount++;
      else if (ai === 'NOT FLAGGED') aiNotFlaggedCount++;
      else aiNotEvaluatedCount++;
    }

    const totalComponents = evaluatedRecords.length;
    const engineeringYield = Number(currentYield(evaluatedRecords).toFixed(2));

    return {
      success: true,
      message: 'Lot screening orchestration completed successfully',
      lotId: cleanLotId,
      summary: {
        totalComponents,
        evaluatedCount: totalComponents,
        normalCount,
        suspectCount,
        criticalCount,
        aiFlaggedCount,
        aiNotFlaggedCount,
        aiNotEvaluatedCount,
        engineeringYield,
      },
      data: evaluatedRecords,
    };
  }

  // --- MODE 2: Single Component Screening Orchestration ---
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
  const sameLotDocs = await ScreeningRecord.find({ lotId: resolvedLotId }).lean();

  const savedDocument = await evaluateSingleComponent({
    targetDoc,
    sameLotDocs,
    customLimits,
    context,
  });

  return {
    success: true,
    message: 'Screening orchestration completed successfully',
    data: savedDocument,
  };
}

module.exports = {
  runScreeningOrchestration,
  evaluateSingleComponent,
};
