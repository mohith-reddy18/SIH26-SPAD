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
  // Database engineering limits are strictly authoritative
  const engineeringLimits = (targetDoc.engineeringLimits && typeof targetDoc.engineeringLimits === 'object')
    ? { ...targetDoc.engineeringLimits }
    : {};

  // Merge custom / operator-supplied limits for parameters that do not have database catalog limits
  if (customLimits && typeof customLimits === 'object') {
    for (const [paramKey, limitVal] of Object.entries(customLimits)) {
      const isCustomDbCatalog = typeof limitVal === 'object' && String(limitVal.source || '').toUpperCase() === 'DATABASE_CATALOG';
      if (
        !engineeringLimits[paramKey] ||
        engineeringLimits[paramKey].source === 'SUPPLIED' ||
        engineeringLimits[paramKey].source === 'USER_ENGINEERING_INPUT' ||
        engineeringLimits[paramKey].source === 'AI_ESTIMATED_BOUNDARY' ||
        engineeringLimits[paramKey].source === 'NONE_AVAILABLE' ||
        isCustomDbCatalog
      ) {
        engineeringLimits[paramKey] = typeof limitVal === 'object'
          ? limitVal
          : { limitValue: limitVal, direction: 'UPPER', source: 'SUPPLIED' };
      }
    }
  }

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
 * Normalizes and persists results returned from external Python SPAD V4 screening pipeline.
 */
async function processRemoteScreeningRun({ lotId, componentId, customLimits = null, context = {}, file = null, rawDataset, fileName, fileType, fileSize, signal = null }) {
  const cleanLotId = lotId.trim();

  if (signal && signal.aborted) {
    throw {
      statusCode: 499,
      code: 'SCREENING_ABORTED',
      message: 'Screening analysis was forcefully stopped by operator',
    };
  }

  // 1. Dispatch single request to external Python service: POST ${AI_SERVICE_URL}/run-screening
  const payload = {
    lotId: cleanLotId,
    ...(componentId ? { componentId } : {}),
    file: file || rawDataset,
    dataset: rawDataset,
    fileName: fileName || file?.originalname || context?.fileName || null,
    fileType: fileType || file?.mimetype || context?.fileType || null,
    fileSize: fileSize !== undefined ? fileSize : (file?.size ?? (context?.fileSize !== undefined ? context.fileSize : null)),
    engineeringLimits: customLimits || {},
    context: {
      ...(context && typeof context === 'object' ? context : {}),
      ...(fileName ? { fileName } : {}),
      ...(fileType ? { fileType } : {}),
      ...(fileSize !== undefined ? { fileSize } : {}),
    },
    signal,
  };

  const rawOutput = await aiService.runScreening(payload, signal);

  const rawResults = rawOutput?.results || rawOutput?.data || (Array.isArray(rawOutput) ? rawOutput : []);
  const rawResultsLen = Array.isArray(rawResults) ? rawResults.length : 0;
  const firstItem = rawResultsLen > 0 ? rawResults[0] : null;
  const firstKeys = firstItem ? Object.keys(firstItem).join(', ') : 'none';
  const firstTestId = firstItem ? (firstItem.Test_ID ?? firstItem.componentId ?? firstItem.Component_ID ?? firstItem.id ?? firstItem.Sample_ID ?? 'undefined') : 'none';

  console.log(`[SCREENING TRACE] rawOutput.results.length = ${rawResultsLen}`);
  console.log(`[SCREENING TRACE] first result keys = [${firstKeys}]`);
  console.log(`[SCREENING TRACE] first result Test_ID = ${firstTestId}`);

  if (signal && signal.aborted) {
    throw {
      statusCode: 499,
      code: 'SCREENING_ABORTED',
      message: 'Screening analysis was forcefully stopped by operator',
    };
  }

  if (!rawOutput || typeof rawOutput !== 'object') {
    throw {
      statusCode: 502,
      code: 'MODEL_OUTPUT_INVALID',
      message: 'External Python screening service returned an invalid or empty response',
    };
  }

  const results = rawOutput.results || rawOutput.data || (Array.isArray(rawOutput) ? rawOutput : [rawOutput]);
  if (!Array.isArray(results) || results.length === 0) {
    throw {
      statusCode: 502,
      code: 'MODEL_OUTPUT_INVALID',
      message: 'External Python screening service response is missing "results" array',
    };
  }

  const evaluatedRecords = [];
  let skippedItemsCount = 0;

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (!item || typeof item !== 'object') {
      skippedItemsCount++;
      continue;
    }

    const rawTestId = item.Test_ID ?? item.componentId ?? item.Component_ID ?? item.id ?? item.Sample_ID;
    if (!rawTestId) {
      skippedItemsCount++;
      continue;
    }
    const compId = String(rawTestId).trim();

    // 2. Fetch existing document from MongoDB to check for authoritative DB limits
    const existingDoc = await ScreeningRecord.findOne({ componentId: compId, lotId: cleanLotId }).lean();
    const authoritativeLimits = (existingDoc?.engineeringLimits && typeof existingDoc.engineeringLimits === 'object')
      ? { ...existingDoc.engineeringLimits }
      : {};

    // Merge request-level limits for parameters without DATABASE_CATALOG limit (preserving DB authority)
    if (customLimits && typeof customLimits === 'object') {
      for (const [paramKey, limitVal] of Object.entries(customLimits)) {
        const isCustomDb = typeof limitVal === 'object' && String(limitVal.source || '').toUpperCase() === 'DATABASE_CATALOG';
        if (
          !authoritativeLimits[paramKey] ||
          authoritativeLimits[paramKey].source === 'SUPPLIED' ||
          authoritativeLimits[paramKey].source === 'USER_ENGINEERING_INPUT' ||
          authoritativeLimits[paramKey].source === 'AI_ESTIMATED_BOUNDARY' ||
          authoritativeLimits[paramKey].source === 'NONE_AVAILABLE' ||
          isCustomDb
        ) {
          authoritativeLimits[paramKey] = typeof limitVal === 'object'
            ? limitVal
            : { limitValue: limitVal, direction: 'UPPER', source: 'SUPPLIED' };
        }
      }
    }

    // 3. Telemetry extraction (0h, 24h)
    const val0h = item.RDS0 ?? item.val0h ?? item['0h'] ?? item.measurements?.rdson?.['0h'];
    const val24h = item.RDS33 ?? item.val24h ?? item['24h'] ?? item.measurements?.rdson?.['24h'];
    const measurements = {
      ...(existingDoc?.measurements || {}),
      ...(item.measurements || {}),
    };
    if (typeof val0h === 'number' || typeof val24h === 'number') {
      measurements.rdson = {
        unit: authoritativeLimits.rdson?.unit || 'Ω',
        '0h': typeof val0h === 'number' ? val0h : null,
        '24h': typeof val24h === 'number' ? val24h : null,
      };
    }

    // 4. Random Forest Method 1 Prediction
    const predicted168h = item.Predicted_RDS100 ?? item.predicted168h ?? (item.aiAssessment?.prediction?.parameters?.rdson?.predicted168h ?? null);
    const roc = rateOfChangePerHour(val0h, val24h);
    let calculatedMargin = null;
    const rdsonLim = authoritativeLimits.rdson;
    if (rdsonLim && typeof rdsonLim.limitValue === 'number' && typeof predicted168h === 'number') {
      calculatedMargin = projectedMargin(predicted168h, rdsonLim.limitValue, rdsonLim.direction || 'UPPER');
    }

    let rfFlag = 'NOT_EVALUATED';
    const rawRfFlag = item.Module_B_Anomaly ?? item.Module_B_Flag ?? item.aiFlag ?? item.aiAssessment?.prediction?.parameters?.rdson?.aiFlag;
    if (rawRfFlag === 1 || rawRfFlag === true || (typeof rawRfFlag === 'string' && rawRfFlag.trim().toUpperCase() === 'FLAGGED')) {
      rfFlag = 'FLAGGED';
    } else if (rawRfFlag === 0 || rawRfFlag === false || (typeof rawRfFlag === 'string' && rawRfFlag.trim().toUpperCase().includes('NOT'))) {
      rfFlag = 'NOT FLAGGED';
    }

    // 5. Isolation Forest Method 2 Lot Anomaly
    const lotAnomalyScore = item.Module_A_IF_Score ?? item.lotAnomalyScore ?? (item.aiAssessment?.lotAnomaly?.parameters?.rdson?.lotAnomalyScore ?? null);
    let ifFlag = 'NOT_EVALUATED';
    const rawIfFlag = item.Module_A_Anomaly ?? item.Module_A_Flag ?? item.aiAssessment?.lotAnomaly?.parameters?.rdson?.aiFlag;
    if (rawIfFlag === 1 || rawIfFlag === true || (typeof rawIfFlag === 'string' && rawIfFlag.trim().toUpperCase() === 'FLAGGED')) {
      ifFlag = 'FLAGGED';
    } else if (rawIfFlag === 0 || rawIfFlag === false || (typeof rawIfFlag === 'string' && rawIfFlag.trim().toUpperCase().includes('NOT'))) {
      ifFlag = 'NOT FLAGGED';
    }

    // 6. Deterministic engineering & overall status
    const calculatedEngineeringStatus = engineeringStatus(measurements, authoritativeLimits);
    const calculatedOverallStatus = overallStatus([rfFlag, ifFlag]);

    // 7. Canonical ScreeningRecord
    const canonicalRecord = {
      componentId: compId,
      lotId: cleanLotId,
      stage: item.stage || '24h',
      measurements,
      engineeringLimits: authoritativeLimits,
      engineeringStatus: calculatedEngineeringStatus,
      aiAssessment: {
        overallStatus: calculatedOverallStatus,
        prediction: {
          status: typeof predicted168h === 'number' ? 'PREDICTED' : 'UNSUPPORTED_PARAMETER',
          method: 'FUTURE_PREDICTION',
          modelMetadata: rawOutput.modelMetadata || aiService.getModelMetadata(),
          parameters: {
            rdson: {
              status: typeof predicted168h === 'number' ? 'PREDICTED' : 'UNSUPPORTED_PARAMETER',
              unit: authoritativeLimits.rdson?.unit || 'Ω',
              observed: { '0h': val0h, '24h': val24h },
              predicted168h,
              rateOfChangePerHour: roc,
              engineeringLimit: rdsonLim || null,
              projectedMargin: calculatedMargin,
              limitBreachProbability: item.limitBreachProbability ?? null,
              futureRiskScore: item.futureRiskScore ?? (rfFlag === 'FLAGGED' ? 0.85 : 0.15),
              futureRiskPercent: item.futureRiskPercent ?? null,
              aiFlag: rfFlag,
              modelEvidence: {
                forecastResidual: (item.Forecast_Residual !== undefined && item.Forecast_Residual !== null) ? item.Forecast_Residual : null,
                absoluteForecastError: (item.Absolute_Forecast_Error !== undefined && item.Absolute_Forecast_Error !== null) ? item.Absolute_Forecast_Error : null,
                relativeErrorPercent: (item.Relative_Error_Percent !== undefined && item.Relative_Error_Percent !== null) ? item.Relative_Error_Percent : null,
                pythonDelta: (item.Delta_RDS_0_33 !== undefined && item.Delta_RDS_0_33 !== null) ? item.Delta_RDS_0_33 : null,
              },
            },
          },
        },
        lotAnomaly: {
          status: lotAnomalyScore !== null ? 'ANALYZED' : 'NOT_EVALUATED',
          method: 'LOT_ANOMALY_DETECTION',
          cohortQuality: results.length >= 3 ? 'SUFFICIENT' : 'INSUFFICIENT',
          componentsAnalyzed: results.length,
          eligiblePeersCount: Math.max(0, results.length - 1),
          parameters: {
            rdson: {
              status: lotAnomalyScore !== null ? 'ANALYZED' : 'NOT_EVALUATED',
              observed: { '0h': val0h, '24h': val24h },
              lotAnomalyScore,
              peerComparisonEvidence: {
                rawScore: lotAnomalyScore,
                noveltyPercentile: (item.Module_A_Novelty_Percentile !== undefined && item.Module_A_Novelty_Percentile !== null) ? item.Module_A_Novelty_Percentile : null,
                ...(item.Module_A_IF_Scores ? { stageScores: item.Module_A_IF_Scores } : {}),
                ...(item.Module_A_Novelty_Percentiles ? { stagePercentiles: item.Module_A_Novelty_Percentiles } : {}),
              },
              divergenceType: item.divergenceType ?? (ifFlag === 'FLAGGED' ? 'ELEVATED_OUTLIER' : 'NOMINAL'),
              aiFlag: ifFlag,
            },
          },
        },
        explanation: item.explanation || item.modelExplanation || null,
      },
      status: calculatedEngineeringStatus,
      aiRisk: calculatedOverallStatus === 'FLAGGED' ? 85 : 15,
      riskScore: calculatedOverallStatus === 'FLAGGED' ? 0.85 : 0.15,
    };

    evaluatedRecords.push(canonicalRecord);
  }

  // 8. Persist all records to MongoDB (skip if aborted)
  if (signal && signal.aborted) {
    throw {
      statusCode: 499,
      code: 'SCREENING_ABORTED',
      message: 'Screening analysis was forcefully stopped by operator',
    };
  }

  if (evaluatedRecords.length > 0) {
    const bulkOps = evaluatedRecords.map((rec) => ({
      updateOne: {
        filter: { componentId: rec.componentId, lotId: rec.lotId },
        update: { $set: rec },
        upsert: true,
      },
    }));
    await ScreeningRecord.bulkWrite(bulkOps);
  }

  // 9. Derive summary metrics
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

  const singleDoc = componentId ? evaluatedRecords.find((r) => r.componentId === componentId) : null;

  console.log(`[SCREENING TRACE] evaluatedRecords.length = ${evaluatedRecords.length}`);
  console.log(`[SCREENING TRACE] FINAL evaluatedRecords.length = ${evaluatedRecords.length}`);

  return {
    success: true,
    message: 'Screening orchestration completed successfully',
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
    data: singleDoc || evaluatedRecords,
  };
}

/**
 * Executes full screening orchestration flow for a single component or an entire lot.
 *
 * @param {Object} params
 * @param {string} [params.componentId]
 * @param {string} [params.lotId]
 * @param {Object} [params.customLimits]
 * @param {Object} [params.context]
 * @param {string|Array|Object} [params.datasetContent]
 * @param {string|Array|Object} [params.dataset]
 * @param {string|Array|Object} [params.records]
 * @param {string} [params.fileName]
 * @param {string} [params.fileType]
 * @param {number} [params.fileSize]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<Object>} Combined screening evaluation outcome or lot summary
 */
async function runScreeningOrchestration({
  componentId,
  lotId,
  customLimits = null,
  context = {},
  file = null,
  datasetContent,
  dataset,
  records,
  fileName,
  fileType,
  fileSize,
  signal = null,
}) {
  if (signal && signal.aborted) {
    throw {
      statusCode: 499,
      code: 'SCREENING_ABORTED',
      message: 'Screening analysis was forcefully stopped by operator',
      componentId,
      lotId,
    };
  }

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

  // --- Remote Production Path via POST ${AI_SERVICE_URL}/run-screening ---
  if (process.env.AI_SERVICE_URL && process.env.AI_SERVICE_URL.trim()) {
    const rawDataset = datasetContent || dataset || records || context?.dataset || null;
    return await processRemoteScreeningRun({
      lotId: cleanLotId,
      componentId: cleanCompId,
      customLimits,
      context,
      file,
      rawDataset,
      fileName,
      fileType,
      fileSize,
      signal,
    });
  }

  // --- Local / Test Mode Fallback ---
  // MODE 1: Whole Lot Screening Orchestration
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

  // MODE 2: Single Component Screening Orchestration
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
  processRemoteScreeningRun,
};
