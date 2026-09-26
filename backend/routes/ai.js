const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
} = require('../utils/contractCalculations');

/**
 * Extracts 0h and 24h observations and unit from a parameter object.
 *
 * @param {Object} paramObj
 * @returns {{ val0h: number|null, val24h: number|null, unit: string }}
 */
function extractObservations(paramObj) {
  if (!paramObj || typeof paramObj !== 'object') {
    return { val0h: null, val24h: null, unit: '' };
  }

  const unit = typeof paramObj.unit === 'string' ? paramObj.unit : '';
  const obs = paramObj.observed || paramObj.history || paramObj.observations || paramObj;

  const raw0h = obs['0h'] ?? obs['0H'] ?? obs[0];
  const raw24h = obs['24h'] ?? obs['24H'] ?? obs[24];

  const val0h = typeof raw0h === 'number' && !isNaN(raw0h) ? raw0h : null;
  const val24h = typeof raw24h === 'number' && !isNaN(raw24h) ? raw24h : null;

  return { val0h, val24h, unit };
}

/**
 * Standardized AI Contract Error Generator
 */
function createErrorResponse(res, statusCode, code, message, componentId = null, lotId = null) {
  return res.status(statusCode).json({
    success: false,
    error: {
      code,
      message,
      componentId: componentId || null,
      lotId: lotId || null,
      timestamp: new Date().toISOString(),
    },
  });
}

// ============================================================================
// METHOD 1: Component-Level 168h Future Trajectory Prediction
// POST /api/ai/predict-168h
// ============================================================================
router.post('/predict-168h', async (req, res) => {
  try {
    const { componentId, lotId, parameters, engineeringLimits, context } = req.body || {};

    // 1. Validate required componentId & lotId
    if (!componentId || typeof componentId !== 'string' || !componentId.trim()) {
      return createErrorResponse(
        res,
        400,
        'INVALID_TELEMETRY_PAYLOAD',
        'Field "componentId" is required and must be a non-empty string',
        null,
        lotId
      );
    }

    if (!lotId || typeof lotId !== 'string' || !lotId.trim()) {
      return createErrorResponse(
        res,
        400,
        'INVALID_TELEMETRY_PAYLOAD',
        'Field "lotId" is required and must be a non-empty string',
        componentId,
        null
      );
    }

    // 2. Validate parameters dictionary
    if (!parameters || typeof parameters !== 'object' || Array.isArray(parameters) || Object.keys(parameters).length === 0) {
      return createErrorResponse(
        res,
        400,
        'INVALID_TELEMETRY_PAYLOAD',
        'Field "parameters" must be a non-empty object containing parameter telemetry',
        componentId,
        lotId
      );
    }

    // Validate 0h and 24h observations
    for (const [paramName, paramData] of Object.entries(parameters)) {
      const { val0h, val24h } = extractObservations(paramData);
      if (val0h === null || val24h === null) {
        return createErrorResponse(
          res,
          400,
          'INSUFFICIENT_DATA',
          `Parameter "${paramName}" is missing required numeric 0h or 24h observations`,
          componentId,
          lotId
        );
      }
    }

    // 3. Delegate model prediction to AI Service Interface
    const aiResult = await aiService.predict168h({
      componentId: componentId.trim(),
      lotId: lotId.trim(),
      parameters,
      engineeringLimits,
      context,
    });

    const responseParameters = {};
    const paramFlags = [];

    // 4. Combine AI model outputs with deterministic Backend-Derived Calculations
    for (const [paramName, paramData] of Object.entries(parameters)) {
      const { val0h, val24h, unit } = extractObservations(paramData);
      const aiPred = aiResult.predictions[paramName] || {};

      // Backend-derived: rateOfChangePerHour
      const roc = rateOfChangePerHour(val0h, val24h);

      // Extract official engineering limit if supplied
      const rawLimit = (engineeringLimits && engineeringLimits[paramName]) || paramData.engineeringLimit || null;
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

          // Backend-derived: projectedMargin computed against official limits only
          if (isOfficialLimit && aiPred.predicted168h !== null && typeof aiPred.predicted168h === 'number') {
            calculatedMargin = projectedMargin(aiPred.predicted168h, limitVal, dir);
            if (calculatedMargin !== null) {
              calculatedMargin = Number(calculatedMargin.toFixed(4));
            }
          }
        }
      }

      const flag = aiPred.aiFlag || 'NOT_EVALUATED';
      paramFlags.push(flag);

      responseParameters[paramName] = {
        status: aiPred.status || 'PREDICTED',
        unit: unit || paramData.unit || '',
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

    // Backend-derived: overallStatus aggregation
    const calculatedOverallStatus = overallStatus(paramFlags);

    return res.status(200).json({
      success: true,
      method: 'FUTURE_PREDICTION',
      componentId: componentId.trim(),
      lotId: lotId.trim(),
      status: 'PREDICTED',
      modelMetadata: aiResult.modelMetadata || undefined,
      parameters: responseParameters,
      aiAssessment: {
        overallStatus: calculatedOverallStatus,
      },
    });
  } catch (error) {
    return createErrorResponse(
      res,
      503,
      'MODEL_UNAVAILABLE',
      'The predictive screening model service is currently unavailable or encountered an error',
      req.body?.componentId,
      req.body?.lotId
    );
  }
});

// ============================================================================
// METHOD 2: Intra-Lot Statistical Peer Comparison
// POST /api/ai/detect-lot-anomalies
// ============================================================================
router.post('/detect-lot-anomalies', async (req, res) => {
  try {
    const { componentId, lotId, components, context } = req.body || {};

    // 1. Validate lotId
    if (!lotId || typeof lotId !== 'string' || !lotId.trim()) {
      return createErrorResponse(
        res,
        400,
        'INVALID_TELEMETRY_PAYLOAD',
        'Field "lotId" is required and must be a non-empty string',
        componentId,
        null
      );
    }

    const cleanLotId = lotId.trim();

    // 2. Validate components cohort
    if (!Array.isArray(components) || components.length === 0) {
      return createErrorResponse(
        res,
        400,
        'INVALID_TELEMETRY_PAYLOAD',
        'Field "components" must be a non-empty array of lot components',
        componentId,
        cleanLotId
      );
    }

    const targetId = (typeof componentId === 'string' && componentId.trim())
      ? componentId.trim()
      : (components[0]?.componentId || '');

    if (!targetId) {
      return createErrorResponse(
        res,
        400,
        'INVALID_TELEMETRY_PAYLOAD',
        'Field "componentId" is required to designate the target component for anomaly detection',
        null,
        cleanLotId
      );
    }

    // 3. Enforce SAME-LOT peer isolation
    const sameLotComponents = components.filter(
      (c) => c && typeof c === 'object' && (c.lotId === cleanLotId || !c.lotId)
    );

    const componentsAnalyzed = sameLotComponents.length;
    const eligiblePeersCount = Math.max(0, componentsAnalyzed - 1);

    const targetCompData = sameLotComponents.find((c) => (c.componentId || c.id) === targetId) || components[0];
    const targetParams = targetCompData?.parameters || targetCompData?.measurements || {};

    // 4. Minimum Cohort Rule (< 3 comparable components)
    if (componentsAnalyzed < 3) {
      const insufficientParams = {};
      for (const [paramName, paramData] of Object.entries(targetParams)) {
        const { val0h, val24h } = extractObservations(paramData);
        insufficientParams[paramName] = {
          status: 'INSUFFICIENT_COHORT',
          observed: {
            '0h': val0h ?? 0,
            '24h': val24h ?? 0,
          },
          lotAnomalyScore: null,
          peerComparisonEvidence: {
            reason: 'At least 3 same-lot components required for statistical peer comparison.',
          },
          divergenceType: null,
          aiFlag: 'NOT_EVALUATED',
        };
      }

      return res.status(200).json({
        success: true,
        method: 'LOT_ANOMALY_DETECTION',
        componentId: targetId,
        lotId: cleanLotId,
        cohortQuality: 'INSUFFICIENT',
        aiStatus: 'NOT_EVALUATED',
        componentsAnalyzed,
        eligiblePeersCount,
        parameters: insufficientParams,
        aiAssessment: {
          overallStatus: 'NOT_EVALUATED',
        },
      });
    }

    // 5. Delegate anomaly detection to AI Service Interface
    const aiResult = await aiService.detectLotAnomalies({
      targetComponentId: targetId,
      lotId: cleanLotId,
      cohort: sameLotComponents,
      context,
    });

    const responseParameters = {};
    const paramFlags = [];

    for (const [paramName, paramData] of Object.entries(targetParams)) {
      const { val0h, val24h } = extractObservations(paramData);
      const aiEval = aiResult.anomalyResults[paramName] || {};

      const flag = aiEval.aiFlag || 'NOT_EVALUATED';
      paramFlags.push(flag);

      responseParameters[paramName] = {
        status: aiEval.status || 'ANALYZED',
        observed: {
          '0h': val0h,
          '24h': val24h,
        },
        lotAnomalyScore: aiEval.lotAnomalyScore ?? null,
        peerComparisonEvidence: aiEval.peerComparisonEvidence || {},
        divergenceType: aiEval.divergenceType ?? null,
        aiFlag: flag,
      };
    }

    // Backend-derived: overallStatus aggregation
    const calculatedOverallStatus = overallStatus(paramFlags);

    return res.status(200).json({
      success: true,
      method: 'LOT_ANOMALY_DETECTION',
      componentId: targetId,
      lotId: cleanLotId,
      cohortQuality: 'SUFFICIENT',
      componentsAnalyzed,
      eligiblePeersCount,
      modelMetadata: aiResult.modelMetadata || undefined,
      parameters: responseParameters,
      aiAssessment: {
        overallStatus: calculatedOverallStatus,
      },
    });
  } catch (error) {
    return createErrorResponse(
      res,
      503,
      'MODEL_UNAVAILABLE',
      'The lot anomaly detection model service is currently unavailable or encountered an error',
      req.body?.componentId,
      req.body?.lotId
    );
  }
});

// ============================================================================
// METHOD 3: External Python ML Results Ingestion (Validation & Mapping Layer)
// POST /api/ai/results
// ============================================================================
router.post('/results', async (req, res) => {
  try {
    const { lotId, results } = req.body || {};

    // 1. Validate top-level lotId
    if (!lotId || typeof lotId !== 'string' || !lotId.trim()) {
      return createErrorResponse(
        res,
        400,
        'INVALID_PAYLOAD',
        'Field "lotId" is required and must be a non-empty string',
        null,
        null
      );
    }

    const cleanLotId = lotId.trim();

    // 2. Validate results array
    if (!Array.isArray(results) || results.length === 0) {
      return createErrorResponse(
        res,
        400,
        'INVALID_PAYLOAD',
        'Field "results" is required and must be a non-empty array of inference records',
        null,
        cleanLotId
      );
    }

    // 3. Validate each ML record
    const normalizedRecords = [];

    for (let i = 0; i < results.length; i++) {
      const item = results[i];

      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return createErrorResponse(
          res,
          400,
          'INVALID_PAYLOAD',
          `Result item at index ${i} must be a valid object`,
          null,
          cleanLotId
        );
      }

      // Required: Test_ID
      const rawTestId = item.Test_ID ?? item.componentId;
      if (rawTestId === undefined || rawTestId === null || (typeof rawTestId === 'string' && !rawTestId.trim())) {
        return createErrorResponse(
          res,
          400,
          'INVALID_PAYLOAD',
          `Result item at index ${i} is missing required field "Test_ID"`,
          null,
          cleanLotId
        );
      }
      const componentId = String(rawTestId).trim();

      // Required numeric fields (must be finite numbers)
      const requiredNumericFields = ['RDS0', 'RDS33', 'Predicted_RDS100', 'Module_A_IF_Score'];
      for (const field of requiredNumericFields) {
        const val = item[field];
        if (typeof val !== 'number' || !Number.isFinite(val)) {
          return createErrorResponse(
            res,
            400,
            'INVALID_PAYLOAD',
            `Result item "${componentId}" (index ${i}) field "${field}" must be a valid finite number`,
            componentId,
            cleanLotId
          );
        }
      }

      // Optional numeric fields validation
      const optionalNumericFields = [
        'Delta_RDS_0_33',
        'Module_A_Novelty_Percentile',
        'Forecast_Residual',
        'Absolute_Forecast_Error',
        'Forecast_Error_Ratio',
      ];
      for (const field of optionalNumericFields) {
        if (item[field] !== undefined && item[field] !== null) {
          if (typeof item[field] !== 'number' || !Number.isFinite(item[field])) {
            return createErrorResponse(
              res,
              400,
              'INVALID_PAYLOAD',
              `Result item "${componentId}" (index ${i}) optional field "${field}" must be a valid finite number if provided`,
              componentId,
              cleanLotId
            );
          }
        }
      }

      // 4. Map to Canonical ScreeningRecord Structure
      const itemLotId = (typeof item.lotId === 'string' && item.lotId.trim())
        ? item.lotId.trim()
        : cleanLotId;

      // Deterministic rate of change per hour
      const roc = rateOfChangePerHour(item.RDS0, item.RDS33);

      // Module B (Random Forest Prediction Flag)
      let m2Flag = 'NOT_EVALUATED';
      if (
        item.Module_B_Anomaly === 1 ||
        item.Module_B_Anomaly === true ||
        (typeof item.Module_B_Anomaly === 'string' && item.Module_B_Anomaly.trim().toUpperCase() === 'FLAGGED')
      ) {
        m2Flag = 'FLAGGED';
      } else if (
        item.Module_B_Anomaly === 0 ||
        item.Module_B_Anomaly === false ||
        (typeof item.Module_B_Anomaly === 'string' &&
          (item.Module_B_Anomaly.trim().toUpperCase() === 'NOT FLAGGED' ||
            item.Module_B_Anomaly.trim().toUpperCase() === 'NOT_FLAGGED'))
      ) {
        m2Flag = 'NOT FLAGGED';
      }

      // Module A (Isolation Forest Anomaly Flag)
      // Do NOT invent a threshold (e.g. Module_A_IF_Score > 0.5)
      let m1Flag = 'NOT_EVALUATED';
      const rawModuleAFlag = item.Module_A_Anomaly ?? item.Module_A_Flag;
      if (
        rawModuleAFlag === 1 ||
        rawModuleAFlag === true ||
        (typeof rawModuleAFlag === 'string' && rawModuleAFlag.trim().toUpperCase() === 'FLAGGED')
      ) {
        m1Flag = 'FLAGGED';
      } else if (
        rawModuleAFlag === 0 ||
        rawModuleAFlag === false ||
        (typeof rawModuleAFlag === 'string' &&
          (rawModuleAFlag.trim().toUpperCase() === 'NOT FLAGGED' ||
            rawModuleAFlag.trim().toUpperCase() === 'NOT_FLAGGED'))
      ) {
        m1Flag = 'NOT FLAGGED';
      }

      // Aggregate AI Overall Status
      const calculatedOverallStatus = overallStatus([m2Flag, m1Flag]);

      // Canonical measurements structure (observed 0h and 24h only)
      const measurements = {
        rdson: {
          unit: 'Ω',
          '0h': item.RDS0,
          '24h': item.RDS33,
        },
      };

      // Authoritative Engineering Status:
      // Only evaluate if valid authoritative engineering limits exist.
      // If no valid database engineering limit exists, do NOT invent one and do NOT treat as NORMAL;
      // explicitly preserve the absence of evaluation as 'NOT_EVALUATED'.
      let calculatedEngineeringStatus = 'NOT_EVALUATED';
      const authoritativeLimits = {}; // No authoritative limit invented for dry-run

      const hasOfficialLimits = Object.values(authoritativeLimits).some((lim) => {
        if (!lim || typeof lim !== 'object') return typeof lim === 'number' && Number.isFinite(lim);
        const src = lim.source ? String(lim.source).toUpperCase() : 'DATABASE_CATALOG';
        return (
          src !== 'AI_ESTIMATED_BOUNDARY' &&
          src !== 'NONE_AVAILABLE' &&
          (typeof lim.limitValue === 'number' || typeof lim.upper === 'number' || typeof lim.lower === 'number')
        );
      });

      if (hasOfficialLimits) {
        calculatedEngineeringStatus = engineeringStatus(measurements, authoritativeLimits);
      }

      const canonicalRecord = {
        componentId,
        lotId: itemLotId,
        stage: '24h',
        measurements,
        engineeringLimits: authoritativeLimits,
        engineeringStatus: calculatedEngineeringStatus,
        aiAssessment: {
          overallStatus: calculatedOverallStatus,
          prediction: {
            status: 'PREDICTED',
            method: 'FUTURE_PREDICTION',
            parameters: {
              rdson: {
                status: 'PREDICTED',
                unit: 'Ω',
                observed: {
                  '0h': item.RDS0,
                  '24h': item.RDS33,
                },
                predicted168h: item.Predicted_RDS100,
                rateOfChangePerHour: roc,
                aiFlag: m2Flag,
                engineeringLimit: null,
                projectedMargin: null,
                modelEvidence: {
                  forecastResidual: (item.Forecast_Residual !== undefined && item.Forecast_Residual !== null) ? item.Forecast_Residual : null,
                  absoluteForecastError: (item.Absolute_Forecast_Error !== undefined && item.Absolute_Forecast_Error !== null) ? item.Absolute_Forecast_Error : null,
                  forecastErrorRatio: (item.Forecast_Error_Ratio !== undefined && item.Forecast_Error_Ratio !== null) ? item.Forecast_Error_Ratio : null,
                  pythonDelta: (item.Delta_RDS_0_33 !== undefined && item.Delta_RDS_0_33 !== null) ? item.Delta_RDS_0_33 : null,
                },
              },
            },
          },
          lotAnomaly: {
            status: 'ANALYZED',
            method: 'LOT_ANOMALY_DETECTION',
            parameters: {
              rdson: {
                status: 'ANALYZED',
                observed: {
                  '0h': item.RDS0,
                  '24h': item.RDS33,
                },
                lotAnomalyScore: item.Module_A_IF_Score,
                aiFlag: m1Flag,
                peerComparisonEvidence: {
                  rawScore: item.Module_A_IF_Score,
                  noveltyPercentile: (item.Module_A_Novelty_Percentile !== undefined && item.Module_A_Novelty_Percentile !== null) ? item.Module_A_Novelty_Percentile : null,
                },
              },
            },
          },
          explanation: null,
        },
        // Backward compatibility legacy fields
        status: calculatedEngineeringStatus,
        aiRisk: calculatedOverallStatus === 'FLAGGED' ? 85 : 15,
        riskScore: calculatedOverallStatus === 'FLAGGED' ? 0.85 : 0.15,
      };

      normalizedRecords.push({
        componentId,
        lotId: itemLotId,
        normalizedRecord: canonicalRecord,
      });
    }

    // Step 1: Dry-run response only. No MongoDB writes performed.
    return res.status(200).json({
      success: true,
      message: 'AI results payload validated and normalized successfully (dry-run)',
      lotId: cleanLotId,
      recordsCount: normalizedRecords.length,
      records: normalizedRecords,
    });
  } catch (error) {
    return createErrorResponse(
      res,
      500,
      'INTERNAL_SERVER_ERROR',
      error.message || 'An unexpected error occurred during AI results processing',
      null,
      req.body?.lotId
    );
  }
});

module.exports = router;

