/**
 * SPAD AI Output Contract — Step 1: Derived Calculations & Deterministic Rules
 * Pure helper functions for backend-derived metrics strictly adhering to the finalized contract.
 */

/**
 * 1. rateOfChangePerHour
 * Formula: (value at 24h - value at 0h) / 24
 *
 * @param {number} val0h - Observed parameter value at 0h
 * @param {number} val24h - Observed parameter value at 24h
 * @returns {number|null} Rate of change per hour, or null if inputs are missing/non-numeric
 */
function rateOfChangePerHour(val0h, val24h) {
  if (
    typeof val0h !== 'number' ||
    typeof val24h !== 'number' ||
    isNaN(val0h) ||
    isNaN(val24h)
  ) {
    return null;
  }
  return Number(((val24h - val0h) / 24).toFixed(6));
}

/**
 * 2. projectedMargin
 * Direction-aware calculation against official engineering limits.
 * - If direction === "UPPER": limitValue - predicted168h
 * - If direction === "LOWER": predicted168h - limitValue
 *
 * @param {number} predicted168h - Predicted 168h value from AI model
 * @param {number} limitValue - Official engineering specification limit value
 * @param {string} direction - "UPPER" or "LOWER" (case-insensitive)
 * @returns {number|null} Direction-aware margin or null if invalid/unsupported
 */
function projectedMargin(predicted168h, limitValue, direction) {
  if (
    typeof predicted168h !== 'number' ||
    typeof limitValue !== 'number' ||
    isNaN(predicted168h) ||
    isNaN(limitValue) ||
    typeof direction !== 'string'
  ) {
    return null;
  }

  const dir = direction.trim().toUpperCase();
  if (dir === 'UPPER') {
    return Number((limitValue - predicted168h).toFixed(4));
  }
  if (dir === 'LOWER') {
    return Number((predicted168h - limitValue).toFixed(4));
  }

  return null;
}

/**
 * 3. engineeringStatus
 * Deterministic screening rule based strictly on official engineering limits.
 *
 * Rules:
 * - 0 violating parameters -> NORMAL
 * - 1 violating parameter -> SUSPECT
 * - 2 or more violating parameters -> CRITICAL
 *
 * Important:
 * - Counts distinct violating parameters, NOT repeated timepoints.
 * - AI-estimated boundaries are NEVER used for engineeringStatus.
 * - Supports dynamic parameter dictionaries and (measurements, limits) signatures.
 *
 * @param {Object|Array} param1 - Parameter map, measurements map, or parameters array
 * @param {Object} [param2] - Optional engineering limits map
 * @returns {string} "NORMAL" | "SUSPECT" | "CRITICAL"
 */
function engineeringStatus(param1, param2) {
  if (!param1 || typeof param1 !== 'object') {
    return 'NORMAL';
  }

  const violatingParams = new Set();

  // Signature: engineeringStatus(measurements, limits)
  if (param2 && typeof param2 === 'object') {
    const measurementsMap = param1;
    const limitsMap = param2;

    for (const [paramKey, series] of Object.entries(measurementsMap)) {
      const limitObj = limitsMap[paramKey];
      if (limitObj == null) continue;

      let upper = null;
      let lower = null;
      if (typeof limitObj === 'number' && !isNaN(limitObj)) {
        upper = limitObj;
      } else if (typeof limitObj === 'object') {
        const src = limitObj.source ? String(limitObj.source).toUpperCase() : 'DATABASE_CATALOG';
        if (src === 'AI_ESTIMATED_BOUNDARY' || src === 'NONE_AVAILABLE') {
          continue; // AI estimated boundaries and none available never participate in engineeringStatus
        }

        const limVal = typeof limitObj.limitValue === 'number' ? limitObj.limitValue : (limitObj.upper ?? limitObj.lower ?? limitObj.max);
        const dir = String(limitObj.direction || (limitObj.lower !== undefined || limitObj.min !== undefined ? 'LOWER' : 'UPPER')).toUpperCase();
        if (dir === 'UPPER') upper = limVal;
        else if (dir === 'LOWER') lower = limVal;
        else upper = limVal;
      }

      if (upper === null && lower === null) continue;

      const values = Array.isArray(series)
        ? series
        : typeof series === 'object'
        ? Object.values(series)
        : [series];

      for (const val of values) {
        if (typeof val !== 'number' || isNaN(val)) continue;
        if ((upper !== null && val > upper) || (lower !== null && val < lower)) {
          violatingParams.add(paramKey);
          break;
        }
      }
    }

    const violationCount = violatingParams.size;
    if (violationCount === 0) return 'NORMAL';
    if (violationCount === 1) return 'SUSPECT';
    return 'CRITICAL';
  }

  // Signature: engineeringStatus(parameterMap)
  const entries = Array.isArray(param1)
    ? param1.map((item, idx) => [item.parameterId || item.name || String(idx), item])
    : Object.entries(param1);

  for (const [paramKey, paramData] of entries) {
    if (!paramData || typeof paramData !== 'object') continue;

    const limitObj = paramData.engineeringLimit || paramData.specLimit || paramData.officialLimit || paramData.limit;
    if (limitObj == null) continue;

    let upper = null;
    let lower = null;

    if (typeof limitObj === 'number' && !isNaN(limitObj)) {
      upper = limitObj;
    } else if (typeof limitObj === 'object') {
      const src = limitObj.source ? String(limitObj.source).toUpperCase() : 'DATABASE_CATALOG';
      if (src === 'AI_ESTIMATED_BOUNDARY' || src === 'NONE_AVAILABLE') {
        continue;
      }

      if (typeof limitObj.upper === 'number' && !isNaN(limitObj.upper)) upper = limitObj.upper;
      else if (typeof limitObj.upperLimit === 'number' && !isNaN(limitObj.upperLimit)) upper = limitObj.upperLimit;
      else if (typeof limitObj.limitValue === 'number' && limitObj.direction !== 'LOWER') upper = limitObj.limitValue;

      if (typeof limitObj.lower === 'number' && !isNaN(limitObj.lower)) lower = limitObj.lower;
      else if (typeof limitObj.lowerLimit === 'number' && !isNaN(limitObj.lowerLimit)) lower = limitObj.lowerLimit;
      else if (typeof limitObj.limitValue === 'number' && limitObj.direction === 'LOWER') lower = limitObj.limitValue;
    }

    if (upper === null && lower === null) continue;

    let measurements = [];
    if (paramData.history && typeof paramData.history === 'object') {
      measurements = Object.values(paramData.history);
    } else if (paramData.observations && typeof paramData.observations === 'object') {
      measurements = Object.values(paramData.observations);
    } else if (Array.isArray(paramData.values)) {
      measurements = paramData.values;
    } else if (Array.isArray(paramData.measurements)) {
      measurements = paramData.measurements;
    } else if (typeof paramData.value === 'number') {
      measurements = [paramData.value];
    } else {
      if (typeof paramData['0h'] === 'number') measurements.push(paramData['0h']);
      if (typeof paramData['24h'] === 'number') measurements.push(paramData['24h']);
    }

    for (const val of measurements) {
      if (typeof val !== 'number' || isNaN(val)) continue;

      if ((upper !== null && val > upper) || (lower !== null && val < lower)) {
        violatingParams.add(paramKey);
        break;
      }
    }
  }

  const violationCount = violatingParams.size;
  if (violationCount === 0) return 'NORMAL';
  if (violationCount === 1) return 'SUSPECT';
  return 'CRITICAL';
}

/**
 * 4. overallStatus
 * Aggregate AI parameter/method flags using the finalized contract:
 * - If ANY evaluated parameter/method is FLAGGED -> FLAGGED
 * - Else if all evaluated parameters are NOT FLAGGED and at least one was evaluated -> NOT FLAGGED
 * - If neither produced an evaluated result -> NOT_EVALUATED
 *
 * @param {...(string|Array<string>|Object)} args - Flags as multiple arguments, an array, or an object
 * @returns {string} "FLAGGED" | "NOT FLAGGED" | "NOT_EVALUATED"
 */
function overallStatus(...args) {
  const flags = [];

  for (const arg of args) {
    if (!arg) continue;
    if (Array.isArray(arg)) {
      flags.push(...arg);
    } else if (typeof arg === 'object') {
      flags.push(...Object.values(arg));
    } else if (typeof arg === 'string') {
      flags.push(arg);
    }
  }

  if (flags.length === 0) {
    return 'NOT_EVALUATED';
  }

  let hasEvaluated = false;
  let hasFlagged = false;

  for (const rawFlag of flags) {
    if (typeof rawFlag !== 'string') continue;
    const normalized = rawFlag.trim().toUpperCase();

    if (normalized === 'FLAGGED') {
      hasEvaluated = true;
      hasFlagged = true;
    } else if (normalized === 'NOT FLAGGED' || normalized === 'NOT_FLAGGED') {
      hasEvaluated = true;
    }
    // NOT_EVALUATED is skipped from setting hasEvaluated
  }

  if (hasFlagged) {
    return 'FLAGGED';
  }

  if (hasEvaluated) {
    return 'NOT FLAGGED';
  }

  return 'NOT_EVALUATED';
}

/**
 * 5. currentYield
 * Formula:
 * (number of eligible lot components with engineeringStatus === "NORMAL" / total eligible lot components) * 100
 *
 * @param {Array<Object|string>} components - Array of lot component objects or engineeringStatus strings
 * @returns {number} Yield percentage (numeric)
 */
function currentYield(components) {
  if (!Array.isArray(components) || components.length === 0) {
    return 0.0;
  }

  let normalCount = 0;
  for (const item of components) {
    let status = '';
    if (typeof item === 'string') {
      status = item.trim().toUpperCase();
    } else if (item && typeof item === 'object') {
      status = (item.engineeringStatus || item.status || '').trim().toUpperCase();
    }

    if (status === 'NORMAL') {
      normalCount++;
    }
  }

  return (normalCount / components.length) * 100;
}

module.exports = {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
  currentYield,
};
