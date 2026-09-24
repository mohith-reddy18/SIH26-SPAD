/**
 * SPAD AI Model Interface Service (Step 8 Finalization)
 *
 * Model-Agnostic Interface connecting SPAD backend endpoints to the AI inference engine.
 *
 * Architecture Separation:
 * - AI Model Responsibilities (Model-Owned Outputs):
 *     - predicted168h
 *     - predictionInterval (when calibrated)
 *     - futureRiskScore
 *     - futureRiskPercent (when calibrated)
 *     - limitBreachProbability (when calibrated/meaningful)
 *     - lotAnomalyScore
 *     - peerComparisonEvidence
 *     - divergenceType
 *     - aiFlag ("FLAGGED" | "NOT FLAGGED" | "NOT_EVALUATED")
 *     - modelExplanation
 *     - modelMetadata (modelName, modelVersion, timestamp)
 *
 * - Backend Responsibilities (Computed strictly outside the model):
 *     - rateOfChangePerHour
 *     - projectedMargin
 *     - engineeringStatus
 *     - overallStatus
 *     - currentYield
 */

// Model Identification Metadata
const MODEL_METADATA = {
  modelName: 'SPAD-Predictive-Drift-V1',
  modelVersion: '1.0.0-interface',
  status: 'INTERFACE_READY',
};

/**
 * Method 1: Component-Level 168h Future Trajectory Prediction Model Interface
 *
 * Input Contract:
 * {
 *   componentId: string,
 *   lotId: string,
 *   parameters: {
 *     [paramKey]: {
 *       unit: string,
 *       observed: {
 *         "0h": number,
 *         "24h": number
 *       }
 *     }
 *   },
 *   engineeringLimits?: {
 *     [paramKey]: {
 *       limitValue: number,
 *       direction?: "UPPER" | "LOWER",
 *       source?: "DATABASE_CATALOG" | "SUPPLIED" | "AI_ESTIMATED_BOUNDARY" | "NONE_AVAILABLE"
 *     }
 *   },
 *   context?: { ... }
 * }
 *
 * Output Contract:
 * {
 *   componentId: string,
 *   lotId: string,
 *   modelMetadata: { modelName, modelVersion, timestamp },
 *   predictions: {
 *     [paramKey]: {
 *       status: "PREDICTED" | "UNSUPPORTED_PARAMETER",
 *       predicted168h: number | null,
 *       predictionInterval: [number, number] | null,
 *       futureRiskScore: number,
 *       futureRiskPercent: number | null,
 *       limitBreachProbability: number | null,
 *       aiFlag: "FLAGGED" | "NOT FLAGGED" | "NOT_EVALUATED",
 *       modelExplanation: Object | null
 *     }
 *   }
 * }
 *
 * @param {Object} input
 * @returns {Promise<Object>|Object} Model output
 */
async function predict168h(input) {
  const { componentId, lotId, parameters = {}, engineeringLimits = {}, context = {} } = input || {};

  const predictions = {};

  for (const [paramName, paramData] of Object.entries(parameters)) {
    const obs = paramData.observed || paramData.history || paramData.observations || paramData;
    const val0h = obs['0h'] ?? obs['0H'] ?? obs[0];
    const val24h = obs['24h'] ?? obs['24H'] ?? obs[24];

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

    // ========================================================================
    // REAL AI MODEL INTEGRATION POINT (Method 1)
    // ------------------------------------------------------------------------
    // When the real trained model (Python service, ONNX, ML inference worker)
    // is deployed, replace the isolated deterministic logic below with the
    // inference call. The surrounding API contract will remain unchanged.
    // ========================================================================

    const deltaPerHour = (val24h - val0h) / 24;
    const predicted168h = Number((val24h + deltaPerHour * 144).toFixed(4));

    // Limit check if available for risk scoring
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
      predictionInterval: null, // Only return when calibrated interval is generated
      futureRiskScore,
      futureRiskPercent: null, // Only return when calibrated probability % is generated
      limitBreachProbability: null, // Only return when meaningful basis exists
      aiFlag,
      modelExplanation: null, // Model explainability payload (SHAP, feature importance, etc.)
    };
  }

  return {
    componentId,
    lotId,
    modelMetadata: {
      ...MODEL_METADATA,
      timestamp: new Date().toISOString(),
    },
    predictions,
  };
}

/**
 * Method 2: Intra-Lot Statistical Peer Comparison Anomaly Detection Model Interface
 *
 * Input Contract:
 * {
 *   targetComponentId: string, // or componentId
 *   lotId: string,
 *   cohort: [ // STRICTLY SAME-LOT components
 *     {
 *       componentId: string,
 *       parameters: {
 *         [paramKey]: {
 *           unit: string,
 *           observed: {
 *             "0h": number,
 *             "24h": number
 *           }
 *         }
 *       }
 *     }
 *   ],
 *   context?: { ... }
 * }
 *
 * Output Contract:
 * {
 *   targetComponentId: string,
 *   lotId: string,
 *   modelMetadata: { modelName, modelVersion, timestamp },
 *   anomalyResults: {
 *     [paramKey]: {
 *       status: "ANALYZED" | "UNSUPPORTED_PARAMETER",
 *       lotAnomalyScore: number | null,
 *       peerComparisonEvidence: Object,
 *       divergenceType: string | null,
 *       aiFlag: "FLAGGED" | "NOT FLAGGED" | "NOT_EVALUATED",
 *       modelExplanation: Object | null
 *     }
 *   }
 * }
 *
 * @param {Object} input
 * @returns {Promise<Object>|Object} Model output
 */
async function detectLotAnomalies(input) {
  const { targetComponentId, lotId, cohort = [], context = {} } = input || {};

  const anomalyResults = {};

  const targetComp = cohort.find((c) => (c.componentId || c.id) === targetComponentId) || cohort[0];
  const targetParams = targetComp?.parameters || targetComp?.measurements || {};
  const peers = cohort.filter((c) => (c.componentId || c.id) !== targetComponentId);

  for (const [paramName, paramData] of Object.entries(targetParams)) {
    const obs = paramData.observed || paramData.history || paramData.observations || paramData;
    const val24h = obs['24h'] ?? obs['24H'] ?? obs[24];

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

    // Collect 24h peer values from same-lot components
    const peerValues = [];
    for (const peer of peers) {
      const pParam = peer.parameters?.[paramName] || peer.measurements?.[paramName];
      if (pParam) {
        const pObs = pParam.observed || pParam.history || pParam.observations || pParam;
        const pVal24h = pObs['24h'] ?? pObs['24H'] ?? pObs[24];
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

    // ========================================================================
    // REAL AI MODEL INTEGRATION POINT (Method 2)
    // ------------------------------------------------------------------------
    // When the real trained anomaly model (Isolation Forest, Mahalanobis,
    // Autoencoder, etc.) is deployed, replace the isolated statistical logic
    // below with the inference call.
    // ========================================================================

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

  return {
    targetComponentId,
    lotId,
    modelMetadata: {
      ...MODEL_METADATA,
      timestamp: new Date().toISOString(),
    },
    anomalyResults,
  };
}

module.exports = {
  MODEL_METADATA,
  predict168h,
  detectLotAnomalies,
};
