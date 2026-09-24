const express = require('express');
const router = express.Router();
const aiService = require('../services/aiService');
const {
  rateOfChangePerHour,
  projectedMargin,
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
        const dir = rawLimit.direction || (rawLimit.upper !== undefined ? 'UPPER' : 'LOWER');
        const src = rawLimit.source || 'DATABASE_CATALOG';

        if (typeof limitVal === 'number') {
          limitOutput = {
            limitValue: limitVal,
            direction: String(dir).toUpperCase(),
            source: src,
          };

          // Backend-derived: projectedMargin (direction-aware)
          if (aiPred.predicted168h !== null && typeof aiPred.predicted168h === 'number') {
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
      parameters: responseParameters,
      aiAssessment: {
        overallStatus: calculatedOverallStatus,
      },
    });
  } catch (error) {
    return createErrorResponse(
      res,
      500,
      'INTERNAL_ERROR',
      error.message || 'An unexpected error occurred during Method 1 prediction'
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
      parameters: responseParameters,
      aiAssessment: {
        overallStatus: calculatedOverallStatus,
      },
    });
  } catch (error) {
    return createErrorResponse(
      res,
      500,
      'INTERNAL_ERROR',
      error.message || 'An unexpected error occurred during Method 2 anomaly detection'
    );
  }
});

module.exports = router;
