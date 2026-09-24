/**
 * SPAD ATE (Automated Test Equipment) Ingestion Validation Utility
 *
 * Validates incoming ATE payloads without altering the canonical AI contract or database schema.
 */

/**
 * Validates whether a value is a valid numeric measurement or null/undefined.
 *
 * @param {*} val
 * @returns {boolean}
 */
function isValidMeasurementValue(val) {
  if (val === null || val === undefined) return true;
  return typeof val === 'number' && !isNaN(val);
}

/**
 * Validates incoming ATE screening payload.
 *
 * @param {Object} payload
 * @returns {{ isValid: boolean, error?: string }}
 */
function validateAtePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { isValid: false, error: 'Request body must be a valid JSON object' };
  }

  const { componentId, lotId, measurements, engineeringLimits } = payload;

  // 1. Validate required identifiers
  if (!componentId || typeof componentId !== 'string' || !componentId.trim()) {
    return { isValid: false, error: 'Field "componentId" is required and must be a non-empty string' };
  }

  if (!lotId || typeof lotId !== 'string' || !lotId.trim()) {
    return { isValid: false, error: 'Field "lotId" is required and must be a non-empty string' };
  }

  // 2. Validate measurements structure if present
  if (measurements !== undefined && measurements !== null) {
    if (typeof measurements !== 'object' || Array.isArray(measurements)) {
      return { isValid: false, error: 'Field "measurements" must be an object keyed by parameter name' };
    }

    for (const [paramKey, series] of Object.entries(measurements)) {
      if (series === null || series === undefined) continue;

      if (typeof series === 'number') {
        if (isNaN(series)) {
          return { isValid: false, error: `Measurement for parameter "${paramKey}" contains NaN` };
        }
      } else if (Array.isArray(series)) {
        for (let i = 0; i < series.length; i++) {
          if (!isValidMeasurementValue(series[i])) {
            return {
              isValid: false,
              error: `Measurement series for parameter "${paramKey}" at index ${i} must be a number or null`,
            };
          }
        }
      } else if (typeof series === 'object') {
        for (const [checkpoint, val] of Object.entries(series)) {
          if (checkpoint === 'unit') continue; // Allow unit string metadata
          if (!isValidMeasurementValue(val)) {
            return {
              isValid: false,
              error: `Measurement for parameter "${paramKey}" at checkpoint "${checkpoint}" must be a number or null`,
            };
          }
        }
      } else {
        return {
          isValid: false,
          error: `Measurement for parameter "${paramKey}" must be a numeric value, array of numbers, or checkpoint map`,
        };
      }
    }
  }

  // 3. Validate engineeringLimits structure if present
  if (engineeringLimits !== undefined && engineeringLimits !== null) {
    if (typeof engineeringLimits !== 'object' || Array.isArray(engineeringLimits)) {
      return { isValid: false, error: 'Field "engineeringLimits" must be an object keyed by parameter name' };
    }

    for (const [paramKey, limitObj] of Object.entries(engineeringLimits)) {
      if (limitObj === null || limitObj === undefined) continue;

      if (typeof limitObj === 'number') {
        if (isNaN(limitObj)) {
          return { isValid: false, error: `Engineering limit for parameter "${paramKey}" contains NaN` };
        }
      } else if (typeof limitObj === 'object') {
        const limVal = limitObj.limitValue ?? limitObj.upper ?? limitObj.lower ?? limitObj.max ?? limitObj.min;
        if (limVal !== undefined && limVal !== null && (typeof limVal !== 'number' || isNaN(limVal))) {
          return {
            isValid: false,
            error: `Engineering limit value for parameter "${paramKey}" must be numeric`,
          };
        }
      } else {
        return {
          isValid: false,
          error: `Engineering limit for parameter "${paramKey}" must be a number or limit object`,
        };
      }
    }
  }

  return { isValid: true };
}

module.exports = {
  validateAtePayload,
  isValidMeasurementValue,
};
