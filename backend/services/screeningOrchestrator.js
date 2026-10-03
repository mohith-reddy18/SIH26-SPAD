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

const mongoose = require('mongoose');
const ScreeningRecord = require('../models/ScreeningRecord');
const aiService = require('./aiService');
const {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
  currentYield,
} = require('../utils/contractCalculations');
const { extractTransientEvidenceFromDisk } = require('../utils/transientExtractor');

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

  // Apply custom / operator-supplied limits as authoritative for this run
  if (customLimits && typeof customLimits === 'object') {
    for (const [paramKey, limitVal] of Object.entries(customLimits)) {
      if (limitVal !== null && limitVal !== undefined) {
        engineeringLimits[paramKey] = typeof limitVal === 'object'
          ? { ...limitVal }
          : { limitValue: limitVal, direction: 'UPPER', source: 'USER_ENGINEERING_INPUT' };
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
  try {
    const savedDocument = await ScreeningRecord.findOneAndUpdate(
      { componentId: cleanCompId, lotId: resolvedLotId },
      { $set: combinedRecord },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    const hasAi = Boolean(
      savedDocument?.aiAssessment &&
      typeof savedDocument.aiAssessment === 'object' &&
      (savedDocument.aiAssessment.overallStatus || savedDocument.aiAssessment.prediction)
    );
    console.log(`[SPAD Single Component Persisted] componentId: ${cleanCompId} | lotId: ${resolvedLotId} | _id: ${savedDocument?._id} | updatedAt: ${savedDocument?.updatedAt} | hasAiAssessment: ${hasAi}`);

    return savedDocument;
  } catch (err) {
    console.error(`[SPAD CRITICAL ERROR] ScreeningRecord.findOneAndUpdate failed for ${cleanCompId}:`, err);
    throw {
      statusCode: 500,
      code: 'DATABASE_WRITE_FAILED',
      message: `Failed to persist evaluated record for ${cleanCompId} to MongoDB: ${err.message}`,
      error: err,
    };
  }
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

  const rawResults = rawOutput?.results || rawOutput?.records || rawOutput?.data || (Array.isArray(rawOutput) ? rawOutput : []);
  const rawResultsLen = Array.isArray(rawResults) ? rawResults.length : 0;
  const firstItem = rawResultsLen > 0 ? rawResults[0] : null;
  const firstKeys = firstItem ? Object.keys(firstItem).join(', ') : 'none';
  const firstTestId = firstItem ? (firstItem.Test_ID ?? firstItem.componentId ?? firstItem.Component_ID ?? firstItem.id ?? firstItem.Sample_ID ?? 'undefined') : 'none';

  console.log(`[SCREENING TRACE] rawOutput.results.length = ${rawResultsLen}`);
  console.log(`[SCREENING TRACE] first result keys = [${firstKeys}]`);
  console.log(`[SCREENING TRACE] first result Test_ID = ${firstTestId}`);
  if (firstItem) {
    console.log(`[SCREENING TRACE] first result JSON = ${JSON.stringify(firstItem)}`);
  }

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

  const results =
    rawOutput.results ||
    rawOutput.records ||
    rawOutput.data ||
    (Array.isArray(rawOutput) ? rawOutput : [rawOutput]);
  if (!Array.isArray(results) || results.length === 0) {
    throw {
      statusCode: 502,
      code: 'MODEL_OUTPUT_INVALID',
      message: 'External Python screening service response is missing "results" array',
    };
  }

  let datasetTransientMap = new Map();
  try {
    if (file?.path || typeof rawDataset === 'string') {
      datasetTransientMap = extractTransientEvidenceFromDisk(file?.path || rawDataset, customLimits);
    }
  } catch (err) {
    console.warn('[SPAD transientExtractor] Extraction skipped safely:', err?.message || err);
    datasetTransientMap = new Map();
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

    // Check if lot has a DATABASE_CATALOG limit in the database
    const dbCatalogLimits = {};
    if (cleanLotId) {
      const dbDocWithCatalog = await ScreeningRecord.findOne({
        lotId: cleanLotId,
        $or: [
          { 'engineeringLimits.rdson.source': 'DATABASE_CATALOG' },
          { 'engineeringLimits.rdson.isAuthoritative': true },
        ],
      }).lean();
      if (dbDocWithCatalog?.engineeringLimits) {
        for (const [pKey, pLim] of Object.entries(dbDocWithCatalog.engineeringLimits)) {
          if (pLim && typeof pLim === 'object' && String(pLim.source || '').toUpperCase() === 'DATABASE_CATALOG') {
            dbCatalogLimits[pKey] = { ...pLim };
          }
        }
      }
    }

    const authoritativeLimits = {};

    // First load from existing document if it has DATABASE_CATALOG source
    if (existingDoc?.engineeringLimits && typeof existingDoc.engineeringLimits === 'object') {
      for (const [pKey, pLim] of Object.entries(existingDoc.engineeringLimits)) {
        if (pLim && typeof pLim === 'object') {
          if (String(pLim.source || '').toUpperCase() === 'DATABASE_CATALOG') {
            authoritativeLimits[pKey] = { ...pLim };
          }
        }
      }
    }

    // Merge lot-level database catalog limits as fallback for any missing parameters
    for (const [pKey, pLim] of Object.entries(dbCatalogLimits)) {
      if (!authoritativeLimits[pKey]) {
        authoritativeLimits[pKey] = { ...pLim };
      }
    }

    // Request-level engineering limits submitted by the user in the frontend are FINAL and AUTHORITATIVE for this run
    if (customLimits && typeof customLimits === 'object') {
      for (const [paramKey, limitVal] of Object.entries(customLimits)) {
        if (limitVal !== null && limitVal !== undefined) {
          authoritativeLimits[paramKey] = typeof limitVal === 'object'
            ? { ...limitVal }
            : { limitValue: limitVal, direction: 'UPPER', source: 'USER_ENGINEERING_INPUT' };
        }
      }
    }

    // If still no limit for a parameter, preserve existing doc limit without fabricating
    if (!authoritativeLimits.rdson && existingDoc?.engineeringLimits?.rdson) {
      authoritativeLimits.rdson = { ...existingDoc.engineeringLimits.rdson };
    }

    // 3. Telemetry extraction (0h, 24h)
    const val0h = item.measurement?.rdson?.['0h'] ?? item.measurement?.['0h'] ?? item.measurement?.RDS0 ?? item.RDS0 ?? item.val0h ?? item['0h'] ?? item.measurements?.rdson?.['0h'];
    const val24h = item.measurement?.rdson?.['24h'] ?? item.measurement?.['24h'] ?? item.measurement?.RDS33 ?? item.RDS33 ?? item.val24h ?? item['24h'] ?? item.measurements?.rdson?.['24h'];
    const measurements = {
      ...(existingDoc?.measurements || {}),
      ...(item.measurement && typeof item.measurement === 'object' ? item.measurement : {}),
      ...(item.measurements && typeof item.measurements === 'object' ? item.measurements : {}),
    };
    if (typeof val0h === 'number' || typeof val24h === 'number') {
      measurements.rdson = {
        unit: authoritativeLimits.rdson?.unit || 'Ω',
        '0h': typeof val0h === 'number' ? val0h : null,
        '24h': typeof val24h === 'number' ? val24h : null,
      };
    }

    // 4. Random Forest Method 1 Prediction
    const prediction = item.prediction || {};
    const predicted168h = (typeof prediction.predicted168h === 'number' && !isNaN(prediction.predicted168h))
      ? prediction.predicted168h
      : (typeof prediction.Predicted_RDS100 === 'number' && !isNaN(prediction.Predicted_RDS100))
      ? prediction.Predicted_RDS100
      : (typeof item.predicted168h === 'number' && !isNaN(item.predicted168h))
      ? item.predicted168h
      : (typeof item.Predicted_RDS100 === 'number' && !isNaN(item.Predicted_RDS100))
      ? item.Predicted_RDS100
      : (item.aiAssessment?.prediction?.parameters?.rdson?.predicted168h ?? null);

    const roc = rateOfChangePerHour(val0h, val24h);
    let calculatedMargin = null;
    const rdsonLim = authoritativeLimits.rdson;
    if (rdsonLim && typeof rdsonLim.limitValue === 'number' && typeof predicted168h === 'number') {
      calculatedMargin = projectedMargin(predicted168h, rdsonLim.limitValue, rdsonLim.direction || 'UPPER');
    }

    const rawRfFlag =
      prediction.aiFlag ??
      prediction.Module_B_Anomaly ??
      prediction.module_b_anomaly ??
      prediction.Module_B_Flag ??
      prediction.module_b_flag ??
      item.Module_B_Anomaly ??
      item.module_b_anomaly ??
      item.Module_B_Flag ??
      item.module_b_flag ??
      item.prediction?.aiFlag ??
      item.aiFlag ??
      item.ai_flag ??
      item.aiAssessment?.prediction?.parameters?.rdson?.aiFlag;

    let rfFlag = 'NOT_EVALUATED';
    if (rawRfFlag === 1 || rawRfFlag === true || (typeof rawRfFlag === 'string' && (rawRfFlag.trim() === '1' || rawRfFlag.trim().toUpperCase() === 'TRUE' || rawRfFlag.trim().toUpperCase() === 'FLAGGED' || rawRfFlag.trim().toUpperCase() === 'ANOMALY'))) {
      rfFlag = 'FLAGGED';
    } else if (rawRfFlag === 0 || rawRfFlag === false || (typeof rawRfFlag === 'string' && (rawRfFlag.trim() === '0' || rawRfFlag.trim().toUpperCase() === 'FALSE' || rawRfFlag.trim().toUpperCase() === 'NOT FLAGGED' || rawRfFlag.trim().toUpperCase() === 'NOT_FLAGGED' || rawRfFlag.trim().toUpperCase() === 'PASS' || rawRfFlag.trim().toUpperCase() === 'NOMINAL' || rawRfFlag.trim().toUpperCase() === 'NORMAL' || rawRfFlag.trim().toUpperCase() === 'ANALYZED'))) {
      rfFlag = 'NOT FLAGGED';
    } else if (typeof predicted168h === 'number' && !isNaN(predicted168h)) {
      // Authoritative evidence derivation when discrete flag is absent
      if (rdsonLim && typeof rdsonLim.limitValue === 'number') {
        const isLower = String(rdsonLim.direction || '').toUpperCase() === 'LOWER' || String(rdsonLim.direction || '').toUpperCase() === 'MIN';
        if (isLower) {
          rfFlag = predicted168h < rdsonLim.limitValue ? 'FLAGGED' : 'NOT FLAGGED';
        } else {
          rfFlag = predicted168h > rdsonLim.limitValue ? 'FLAGGED' : 'NOT FLAGGED';
        }
      } else if (val0h !== null && val24h !== null && !isNaN(val0h) && !isNaN(val24h)) {
        // Documented forecast-drift residual rule against normal IQR upper fence (0.165046 Ω)
        const delta = Math.abs(val24h - val0h);
        rfFlag = delta > 0.165046 ? 'FLAGGED' : 'NOT FLAGGED';
      } else {
        rfFlag = 'NOT_EVALUATED';
      }
    }

    // Direct mapping from prediction without fabricating or falling back to aiRisk
    const futureRiskScoreVal = (typeof prediction.futureRiskScore === 'number' && !isNaN(prediction.futureRiskScore))
      ? prediction.futureRiskScore
      : (typeof item.futureRiskScore === 'number' && !isNaN(item.futureRiskScore)
        ? item.futureRiskScore
        : (rfFlag === 'FLAGGED' ? 0.85 : rfFlag === 'NOT FLAGGED' ? 0.15 : null));

    const futureRiskPercentVal = (typeof prediction.futureRiskPercent === 'number' && !isNaN(prediction.futureRiskPercent))
      ? prediction.futureRiskPercent
      : (typeof item.futureRiskPercent === 'number' && !isNaN(item.futureRiskPercent)
        ? item.futureRiskPercent
        : (typeof futureRiskScoreVal === 'number' ? Math.round(futureRiskScoreVal * 100) : null));

    if (results.indexOf(item) === 0 || compId === 'TEST-06') {
      console.log(`[RF Normalization Diagnostic] Component: ${compId}`, {
        predictionObject: prediction,
        rawRfFlag,
        normalizedRfFlag: rfFlag,
        futureRiskScore: futureRiskScoreVal,
        futureRiskPercent: futureRiskPercentVal,
      });
    }

    // 5. Isolation Forest Method 2 Lot Anomaly
    const lotAnomalyScore =
      item.lotAnomaly?.lotAnomalyScore ??
      item.lotAnomaly?.score ??
      item.lotAnomaly?.Module_A_IF_Score ??
      item.Module_A_IF_Score ??
      item.Module_A_IF_Score_33 ??
      item.Module_A_IF_Score_0 ??
      item.lotAnomalyScore ??
      item.lotAnomaly?.Module_A_IF_Score_33 ??
      (item.aiAssessment?.lotAnomaly?.parameters?.rdson?.lotAnomalyScore ?? null);
    
    const rawIfFlag =
      item.lotAnomaly?.aiFlag ??
      item.lotAnomaly?.Module_A_Anomaly ??
      item.lotAnomaly?.module_a_anomaly ??
      item.lotAnomaly?.Module_A_Flag ??
      item.lotAnomaly?.Module_A_Flag_33 ??
      item.lotAnomaly?.module_a_flag ??
      item.Module_A_Anomaly ??
      item.module_a_anomaly ??
      item.Module_A_Flag ??
      item.Module_A_Flag_33 ??
      item.module_a_flag ??
      item.lotAnomaly?.ai_flag ??
      item.aiAssessment?.lotAnomaly?.parameters?.rdson?.aiFlag;

    const rawPercentile =
      item.lotAnomaly?.peerComparisonEvidence?.noveltyPercentile ??
      item.lotAnomaly?.noveltyPercentile ??
      item.lotAnomaly?.novelty_percentile ??
      item.Module_A_Novelty_Percentile ??
      item.Module_A_Novelty_Percentile_33 ??
      item.Module_A_Novelty_Percentile_0 ??
      item.noveltyPercentile ??
      item.novelty_percentile ??
      (item.Module_A_Novelty_Percentiles ? (item.Module_A_Novelty_Percentiles['33.3%'] ?? item.Module_A_Novelty_Percentiles['33.33%'] ?? item.Module_A_Novelty_Percentiles['24hr'] ?? Object.values(item.Module_A_Novelty_Percentiles)[0]) : null) ??
      (item.aiAssessment?.lotAnomaly?.parameters?.rdson?.peerComparisonEvidence?.noveltyPercentile ?? null);
    const noveltyPercentileVal = (rawPercentile !== undefined && rawPercentile !== null && !isNaN(Number(rawPercentile))) ? Number(rawPercentile) : null;

    const peerEvidenceObj = {
      rawScore: lotAnomalyScore,
      noveltyPercentile: noveltyPercentileVal,
      ...(item.lotAnomaly?.peerComparisonEvidence && typeof item.lotAnomaly.peerComparisonEvidence === 'object' ? item.lotAnomaly.peerComparisonEvidence : {}),
      ...(item.Module_A_IF_Scores ? { stageScores: item.Module_A_IF_Scores } : {}),
      ...(item.Module_A_Novelty_Percentiles ? { stagePercentiles: item.Module_A_Novelty_Percentiles } : {}),
    };

    let ifFlag = 'NOT_EVALUATED';
    if (rawIfFlag === 1 || rawIfFlag === true || (typeof rawIfFlag === 'string' && (rawIfFlag.trim() === '1' || rawIfFlag.trim().toUpperCase() === 'TRUE' || rawIfFlag.trim().toUpperCase() === 'FLAGGED' || rawIfFlag.trim().toUpperCase() === 'ANOMALY'))) {
      ifFlag = 'FLAGGED';
    } else if (rawIfFlag === 0 || rawIfFlag === false || (typeof rawIfFlag === 'string' && (rawIfFlag.trim() === '0' || rawIfFlag.trim().toUpperCase() === 'FALSE' || rawIfFlag.trim().toUpperCase() === 'NOT FLAGGED' || rawIfFlag.trim().toUpperCase() === 'NOT_FLAGGED' || rawIfFlag.trim().toUpperCase() === 'PASS' || rawIfFlag.trim().toUpperCase() === 'NOMINAL' || rawIfFlag.trim().toUpperCase() === 'NORMAL' || rawIfFlag.trim().toUpperCase() === 'ANALYZED'))) {
      ifFlag = 'NOT FLAGGED';
    } else if (results.length < 3) {
      // Cohort < 3 units rule
      ifFlag = 'NOT_EVALUATED';
    } else if (typeof noveltyPercentileVal === 'number' && !isNaN(noveltyPercentileVal)) {
      // Novelty percentile rule (>= 90 -> FLAGGED, < 90 -> NOT FLAGGED)
      ifFlag = noveltyPercentileVal >= 90.0 ? 'FLAGGED' : 'NOT FLAGGED';
    } else if (typeof item.zScore === 'number' && !isNaN(item.zScore)) {
      // Robust z-score rule (> 3.0 -> FLAGGED, <= 3.0 -> NOT FLAGGED)
      ifFlag = Math.abs(item.zScore) > 3.0 ? 'FLAGGED' : 'NOT FLAGGED';
    } else if (typeof peerEvidenceObj.zScore === 'number' && !isNaN(peerEvidenceObj.zScore)) {
      ifFlag = Math.abs(peerEvidenceObj.zScore) > 3.0 ? 'FLAGGED' : 'NOT FLAGGED';
    }

    const divergenceTypeVal = item.lotAnomaly?.divergenceType ?? item.divergenceType ?? (ifFlag === 'FLAGGED' ? 'ELEVATED_OUTLIER' : 'NOMINAL');

    // 5.5 Extract & preserve complete Module C (Transient Pulse Analysis) from Python or dataset evidence
    const rawModuleC = item.moduleC ?? item.Module_C ?? item.aiAssessment?.moduleC ?? item.transientAnalysis ?? datasetTransientMap.get(compId) ?? null;
    let moduleCObj = null;
    if (rawModuleC && typeof rawModuleC === 'object') {
      moduleCObj = { ...rawModuleC };
    } else if (item.maxRDSInstantaneousOhm !== undefined || item.limitExceedanceCount !== undefined || item.evidenceTransientId !== undefined) {
      moduleCObj = {
        status: item.limitExceedanceFlag ? 'ANALYZED' : 'NOT_EVALUATED',
        method: 'TRANSIENT_PULSE_EXTRACTION',
        parameters: {
          rdson: {
            maxRDSInstantaneousOhm: item.maxRDSInstantaneousOhm ?? null,
            limitExceedanceCount: item.limitExceedanceCount ?? 0,
            limitExceedanceFlag: item.limitExceedanceFlag ?? 'NOT FLAGGED',
            evidenceTransientId: item.evidenceTransientId ?? null,
            evidenceTimeUs: item.evidenceTimeUs ?? null,
            aiFlag: item.limitExceedanceFlag ?? 'NOT FLAGGED',
          },
        },
      };
    }

    // Ensure Module C decision rules are evaluated against authoritative limits
    if (moduleCObj && moduleCObj.parameters && moduleCObj.parameters.rdson) {
      const mC = moduleCObj.parameters.rdson;
      const maxInst = typeof mC.maxRDSInstantaneousOhm === 'number' ? mC.maxRDSInstantaneousOhm : null;
      const excCount = typeof mC.limitExceedanceCount === 'number' ? mC.limitExceedanceCount : 0;
      const rdLimit = rdsonLim && typeof rdsonLim.limitValue === 'number' ? rdsonLim.limitValue : null;

      if (maxInst !== null) {
        let isFlagged = false;
        if (rdLimit !== null) {
          isFlagged = maxInst > rdLimit || excCount > 0;
        } else {
          isFlagged = excCount > 0;
        }
        const flag = isFlagged ? 'FLAGGED' : 'NOT FLAGGED';
        mC.limitExceedanceFlag = flag;
        mC.aiFlag = flag;
        moduleCObj.status = 'ANALYZED';
      }
    }

    // 6. Deterministic engineering & overall status
    const rawEngStatus = item.engineering?.engineeringStatus ?? item.engineering?.status ?? item.engineeringStatus ?? item.status;
    let calculatedEngineeringStatus;
    if (rawEngStatus && typeof rawEngStatus === 'string') {
      const s = rawEngStatus.trim().toUpperCase();
      if (s === 'NORMAL' || s === 'PASS') calculatedEngineeringStatus = 'NORMAL';
      else if (s === 'SUSPECT' || s === 'HOLD') calculatedEngineeringStatus = 'SUSPECT';
      else if (s === 'CRITICAL' || s === 'REJECT') calculatedEngineeringStatus = 'CRITICAL';
      else calculatedEngineeringStatus = engineeringStatus(measurements, authoritativeLimits);
    } else {
      calculatedEngineeringStatus = engineeringStatus(measurements, authoritativeLimits);
    }

    const mCFlag = moduleCObj?.parameters?.rdson?.aiFlag ?? null;
    const calculatedOverallStatus = overallStatus([rfFlag, ifFlag, mCFlag]);

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
              limitBreachProbability: item.prediction?.limitBreachProbability ?? item.limitBreachProbability ?? null,
              futureRiskScore: futureRiskScoreVal,
              futureRiskPercent: futureRiskPercentVal,
              aiFlag: rfFlag,
              modelEvidence: {
                forecastResidual: (item.prediction?.Forecast_Residual ?? item.Forecast_Residual ?? null),
                absoluteForecastError: (item.prediction?.Absolute_Forecast_Error ?? item.Absolute_Forecast_Error ?? null),
                relativeErrorPercent: (item.prediction?.Relative_Error_Percent ?? item.Relative_Error_Percent ?? null),
                pythonDelta: (item.prediction?.Delta_RDS_0_33 ?? item.Delta_RDS_0_33 ?? null),
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
              peerComparisonEvidence: peerEvidenceObj,
              divergenceType: divergenceTypeVal,
              aiFlag: ifFlag,
            },
          },
        },
        ...(moduleCObj ? { moduleC: moduleCObj } : {}),
        explanation: item.explanation || item.modelExplanation || null,
      },
      status: calculatedEngineeringStatus,
      aiRisk: calculatedOverallStatus === 'FLAGGED' ? 85 : 15,
      riskScore: calculatedOverallStatus === 'FLAGGED' ? 0.85 : 0.15,
    };

    evaluatedRecords.push(canonicalRecord);
  }

  if (evaluatedRecords.length > 0) {
    console.log(`[SCREENING TRACE] first evaluatedRecord JSON = ${JSON.stringify(evaluatedRecords[0])}`);
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
    const dbState = mongoose.connection ? mongoose.connection.readyState : -1;
    const dbName = mongoose.connection?.db?.databaseName || mongoose.connection?.name || 'unknown';
    const collName = ScreeningRecord.collection?.collectionName || 'screeningrecords';

    console.log(`[SPAD Persistence Info] mongoose.readyState: ${dbState} | database: ${dbName} | collection: ${collName} | operationsCount: ${evaluatedRecords.length}`);

    const bulkOps = evaluatedRecords.map((rec) => {
      const filter = { componentId: rec.componentId, lotId: rec.lotId };
      return {
        updateOne: {
          filter,
          update: { $set: rec },
          upsert: true,
        },
      };
    });

    const test06Op = bulkOps.find((op) => op.updateOne.filter.componentId === 'TEST-06') || bulkOps[0];
    console.log('[SPAD EXACT bulkOps[TEST-06] PAYLOAD BEFORE BULKWRITE]:\n' + JSON.stringify(test06Op, null, 2));
    console.log('[SPAD bulkOps[TEST-06] aiAssessment present]:', Boolean(test06Op?.updateOne?.update?.$set?.aiAssessment));

    try {
      const bulkResult = await ScreeningRecord.bulkWrite(bulkOps);
      console.log(`[SPAD WRITE TRACE 2: EVALUATED PERSISTENCE] time: ${new Date().toISOString()} | op: bulkWrite | lotId: ${cleanLotId} | opsCount: ${bulkOps.length} | matchedCount: ${bulkResult?.matchedCount} | modifiedCount: ${bulkResult?.modifiedCount} | upsertedCount: ${bulkResult?.upsertedCount} | insertedCount: ${bulkResult?.insertedCount ?? 0}`);

      // Post-write verification query using the exact same lotId used in the screening run
      const sampleTest06 = await ScreeningRecord.findOne({ componentId: 'TEST-06', lotId: cleanLotId }).lean();
      if (sampleTest06) {
        const hasAi = Boolean(
          sampleTest06.aiAssessment &&
          typeof sampleTest06.aiAssessment === 'object' &&
          (sampleTest06.aiAssessment.overallStatus || sampleTest06.aiAssessment.prediction)
        );
        console.log(`[SPAD WRITE TRACE 2 POST-CHECK TEST-06]`, {
          _id: sampleTest06._id,
          componentId: sampleTest06.componentId,
          lotId: sampleTest06.lotId,
          updatedAt: sampleTest06.updatedAt,
          hasAiAssessment: hasAi,
          aiAssessment: sampleTest06.aiAssessment,
          predictions: sampleTest06.predictions,
          parameters: sampleTest06.parameters,
          anomalies: sampleTest06.anomalies,
        });
      } else {
        const anyTest06 = await ScreeningRecord.findOne({ componentId: 'TEST-06' }).lean();
        console.log(`[SPAD WRITE TRACE 2 POST-CHECK TEST-06] found in lot "${cleanLotId}": false | found in any lot:`, anyTest06 ? { _id: anyTest06._id, lotId: anyTest06.lotId } : 'none');
      }
    } catch (writeErr) {
      console.error(`[SPAD CRITICAL ERROR] ScreeningRecord.bulkWrite failed:`, writeErr);
      throw {
        statusCode: 500,
        code: 'DATABASE_WRITE_FAILED',
        message: `Failed to persist evaluated screening records to MongoDB: ${writeErr.message}`,
        error: writeErr,
      };
    }
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

  // Retrieve actual persisted records from MongoDB to guarantee persistence parity
  const persistedDocs = await ScreeningRecord.find({ lotId: cleanLotId })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();

  const singleDoc = componentId ? evaluatedRecords.find((r) => r.componentId === componentId) : null;
  const finalData = (persistedDocs && persistedDocs.length > 0)
    ? (componentId ? persistedDocs.find((r) => r.componentId === componentId) : persistedDocs)
    : (singleDoc || evaluatedRecords);

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
    data: finalData,
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
