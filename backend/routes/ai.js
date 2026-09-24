const express = require('express');
const router = express.Router();
const {
  rateOfChangePerHour,
  projectedMargin,
  overallStatus,
} = require('../utils/contractCalculations');

/**
 * Extracts 0h and 24h observations from a parameter object.
 * Supports:
 * - { observed: { "0h": 2.0, "24h": 2.8 } }
 * - { history: { "0h": 2.0, "24h": 2.8 } }
 * - { "0h": 2.0, "24h": 2.8 }
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

/**
 * Temporary Isolated AI Prediction Engine (Method 1)
 * Projects 168h trajectory deterministically: val24h + (roc * 144)
 * Will be replaced by real AI microservice without modifying the API contract.
 */
function computeTemporaryPrediction(val0h, val24h, limitObj) {
  const roc = rateOfChangePerHour(val0h, val24h);
  if (roc === null) {
    return {
      predicted168h: null,
      rateOfChange: null,
      margin: null,
      riskScore: 0.0,
      aiFlag: 'NOT_EVALUATED',
    };
  }

  // Linear projection from 24h to 168h (144h delta)
  const predicted168h = Number((val24h + roc * 144).toFixed(4));

  let margin = null;
  let limitValue = null;
  let direction = null;

  if (limitObj && typeof limitObj === 'object') {
    limitValue = typeof limitObj.limitValue === 'number' ? limitObj.limitValue : (limitObj.upper ?? limitObj.lower);
    direction = limitObj.direction || (limitObj.upper !== undefined ? 'UPPER' : 'LOWER');

    if (typeof limitValue === 'number' && direction) {
      margin = projectedMargin(predicted168h, limitValue, direction);
      if (margin !== null) {
        margin = Number(margin.toFixed(4));
      }
    }
  }

  // Temporary flag determination: breach predicted or excessive degradation
  let aiFlag = 'NOT FLAGGED';
  let riskScore = 0.15;

  if (margin !== null && margin < 0) {
    aiFlag = 'FLAGGED';
    riskScore = 0.85;
  } else if (Math.abs(roc) > 0.05) {
    aiFlag = 'FLAGGED';
    riskScore = 0.70;
  }

  return {
    predicted168h,
    rateOfChange: roc,
    margin,
    riskScore,
    aiFlag,
  };
}

// ============================================================================
// METHOD 1: Component-Level 168h Future Trajectory Prediction
// POST /api/ai/predict-168h
// ============================================================================
router.post('/predict-168h', (req, res) => {
  try {
    const { componentId, lotId, parameters, engineeringLimits } = req.body || {};

    // 1. Validate componentId & lotId
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

    // 2. Validate parameters object
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

    const responseParameters = {};
    const paramFlags = [];

    // 3. Process each dynamic parameter
    for (const [paramName, paramData] of Object.entries(parameters)) {
      const { val0h, val24h, unit } = extractObservations(paramData);

      // Check required observations (0h and 24h)
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

      // Extract engineering limit if supplied in root engineeringLimits or parameter object
      const rawLimit = (engineeringLimits && engineeringLimits[paramName]) || paramData.engineeringLimit || null;
      let limitOutput = null;

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
        }
      }

      // Compute temporary deterministic prediction
      const { predicted168h, rateOfChange, margin, riskScore, aiFlag } = computeTemporaryPrediction(
        val0h,
        val24h,
        limitOutput
      );

      paramFlags.push(aiFlag);

      responseParameters[paramName] = {
        status: 'PREDICTED',
        unit: unit || paramData.unit || '',
        observed: {
          '0h': val0h,
          '24h': val24h,
        },
        predicted168h,
        rateOfChangePerHour: rateOfChange,
        engineeringLimit: limitOutput,
        limitBreachProbability: null, // Omitted/null as per contract until calibrated
        projectedMargin: margin,
        futureRiskScore: riskScore,
        futureRiskPercent: null, // Omitted/null as per contract until calibrated
        aiFlag,
      };
    }

    // Aggregate overall status using Step 1 deterministic utility
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
router.post('/detect-lot-anomalies', (req, res) => {
  try {
    const { componentId, lotId, components } = req.body || {};

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

    // 2. Validate components array
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

    // Determine target component ID
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

    // 3. Filter strictly for SAME LOT components
    const sameLotComponents = components.filter(
      (c) => c && typeof c === 'object' && (c.lotId === cleanLotId || !c.lotId)
    );

    const componentsAnalyzed = sameLotComponents.length;
    const eligiblePeersCount = Math.max(0, componentsAnalyzed - 1);

    // Locate target component data in the cohort
    const targetCompData = sameLotComponents.find((c) => c.componentId === targetId) || components[0];
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

    // 5. Sufficient Cohort (>= 3): Run temporary isolated peer comparison
    const responseParameters = {};
    const paramFlags = [];
    const peers = sameLotComponents.filter((c) => c.componentId !== targetId);

    for (const [paramName, paramData] of Object.entries(targetParams)) {
      const { val0h, val24h } = extractObservations(paramData);

      if (val24h === null) {
        responseParameters[paramName] = {
          status: 'UNSUPPORTED_PARAMETER',
          observed: { '0h': val0h, '24h': val24h },
          lotAnomalyScore: null,
          peerComparisonEvidence: { reason: 'Missing 24h observation on target component' },
          divergenceType: null,
          aiFlag: 'NOT_EVALUATED',
        };
        paramFlags.push('NOT_EVALUATED');
        continue;
      }

      // Collect 24h values across peers
      const peerValues = [];
      for (const peer of peers) {
        const peerParam = peer.parameters?.[paramName] || peer.measurements?.[paramName];
        if (peerParam) {
          const obs = extractObservations(peerParam);
          if (obs.val24h !== null) {
            peerValues.push(obs.val24h);
          }
        }
      }

      if (peerValues.length < 2) {
        responseParameters[paramName] = {
          status: 'UNSUPPORTED_PARAMETER',
          observed: { '0h': val0h, '24h': val24h },
          lotAnomalyScore: null,
          peerComparisonEvidence: { reason: 'Insufficient peer observations for this parameter' },
          divergenceType: null,
          aiFlag: 'NOT_EVALUATED',
        };
        paramFlags.push('NOT_EVALUATED');
        continue;
      }

      // Calculate peer cohort statistics
      const sum = peerValues.reduce((a, b) => a + b, 0);
      const mean = sum / peerValues.length;
      const variance = peerValues.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / peerValues.length;
      const std = Math.sqrt(variance);

      const diff = val24h - mean;
      const zScore = std > 0.0001 ? diff / std : (diff !== 0 ? diff * 5 : 0);
      const isOutlier = Math.abs(zScore) > 2.0;

      const aiFlag = isOutlier ? 'FLAGGED' : 'NOT FLAGGED';
      paramFlags.push(aiFlag);

      responseParameters[paramName] = {
        status: 'ANALYZED',
        observed: {
          '0h': val0h,
          '24h': val24h,
        },
        lotAnomalyScore: Number(Math.min(1.0, Math.max(0.0, Math.abs(zScore) / 4.0)).toFixed(3)),
        peerComparisonEvidence: {
          peerMean: Number(mean.toFixed(3)),
          peerStd: Number(std.toFixed(3)),
          peerCount: peerValues.length,
          zScore: Number(zScore.toFixed(3)),
        },
        divergenceType: isOutlier ? (diff > 0 ? 'ELEVATED_OUTLIER' : 'DEPRESSED_OUTLIER') : 'NOMINAL',
        aiFlag,
      };
    }

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
