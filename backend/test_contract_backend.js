/**
 * Comprehensive verification of SPAD AI Output Contract Backend Helpers & Endpoints
 */
const {
  calculateRateOfChangePerHour,
  calculateProjectedMargin,
  calculateEngineeringStatus,
  calculateOverallStatus,
  calculateCurrentYield,
} = require('./utils/contractCalculations');

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`[PASS] ${message}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${message}`);
    process.exitCode = 1;
  }
}

console.log('--- TESTING DERIVED CALCULATIONS ---');

// 1. rateOfChangePerHour = (val24h - val0h) / 24
const roc1 = calculateRateOfChangePerHour(2.0, 2.48);
assert(Math.abs(roc1 - 0.02) < 1e-6, `rateOfChangePerHour (2.0 -> 2.48) = 0.02 mA/h (got ${roc1})`);

const rocNull = calculateRateOfChangePerHour(null, 2.48);
assert(rocNull === null, 'rateOfChangePerHour with null input returns null');

// 2. projectedMargin
// Upper limit: engineeringLimit - predicted168h
const marginUpper = calculateProjectedMargin(2.8, { upper: 3.0, lower: 0.5 });
assert(Math.abs(marginUpper - 0.2) < 1e-6, `projectedMargin upper (predicted=2.8, upper=3.0, lower=0.5) = 0.2 (got ${marginUpper})`);

// Lower limit: predicted168h - engineeringLimit
const marginLower = calculateProjectedMargin(0.6, { upper: 3.0, lower: 0.5 });
assert(Math.abs(marginLower - 0.1) < 1e-6, `projectedMargin lower (predicted=0.6, upper=3.0, lower=0.5) = 0.1 (got ${marginLower})`);

// Scalar upper limit
const marginScalarUpper = calculateProjectedMargin(2.7, 3.0, 'upper');
assert(Math.abs(marginScalarUpper - 0.3) < 1e-6, `projectedMargin scalar upper (predicted=2.7, limit=3.0) = 0.3 (got ${marginScalarUpper})`);

// Unavailable limit or prediction -> null
assert(calculateProjectedMargin(null, 3.0) === null, 'projectedMargin returns null when predicted168h is null');
assert(calculateProjectedMargin(2.7, null) === null, 'projectedMargin returns null when engineeringLimit is null');

// 3. engineeringStatus (Deterministic limit breaches)
// 0 distinct breached params -> NORMAL
const statusNormal = calculateEngineeringStatus({
  iddq: { history: { '0h': 2.0, '24h': 2.1 }, engineeringLimit: { upper: 3.0 } },
  leakage: { history: { '0h': 0.38, '24h': 0.40 }, engineeringLimit: { upper: 0.8 } },
});
assert(statusNormal === 'NORMAL', `0 breached distinct params -> NORMAL (got ${statusNormal})`);

// 1 distinct breached param -> SUSPECT (even if breached at multiple timepoints)
const statusSuspect = calculateEngineeringStatus({
  iddq: { history: { '0h': 3.1, '24h': 3.5 }, engineeringLimit: { upper: 3.0 } }, // breached at 0h and 24h -> 1 distinct param
  leakage: { history: { '0h': 0.38, '24h': 0.40 }, engineeringLimit: { upper: 0.8 } },
});
assert(statusSuspect === 'SUSPECT', `1 breached distinct param -> SUSPECT (got ${statusSuspect})`);

// 2 distinct breached params -> CRITICAL
const statusCritical = calculateEngineeringStatus({
  iddq: { history: { '0h': 2.0, '24h': 3.5 }, engineeringLimit: { upper: 3.0 } }, // breached
  leakage: { history: { '0h': 0.38, '24h': 0.85 }, engineeringLimit: { upper: 0.8 } }, // breached
});
assert(statusCritical === 'CRITICAL', `2 breached distinct params -> CRITICAL (got ${statusCritical})`);

// 4. overallStatus
assert(calculateOverallStatus('CRITICAL', 'NOT FLAGGED') === 'CRITICAL', 'overallStatus CRITICAL when engineeringStatus is CRITICAL');
assert(calculateOverallStatus('SUSPECT', 'NOT FLAGGED') === 'SUSPECT', 'overallStatus SUSPECT when engineeringStatus is SUSPECT');
assert(calculateOverallStatus('NORMAL', 'FLAGGED') === 'FLAGGED_FOR_REVIEW', 'overallStatus FLAGGED_FOR_REVIEW when NORMAL + FLAGGED');
assert(calculateOverallStatus('NORMAL', 'NOT FLAGGED') === 'NORMAL', 'overallStatus NORMAL when NORMAL + NOT FLAGGED');

// 5. currentYield
const yieldTest = calculateCurrentYield([
  { engineeringStatus: 'NORMAL' },
  { engineeringStatus: 'NORMAL' },
  { engineeringStatus: 'SUSPECT' },
  { engineeringStatus: 'CRITICAL' },
]);
assert(yieldTest === 50.0, `currentYield (2 NORMAL out of 4) = 50.0% (got ${yieldTest})`);

console.log(`\nResults: ${passedTests}/${totalTests} unit tests passed!`);
