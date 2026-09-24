const {
  rateOfChangePerHour,
  projectedMargin,
  engineeringStatus,
  overallStatus,
  currentYield,
} = require('./utils/contractCalculations');

let passed = 0;
let total = 0;

function test(name, actual, expected, compareFn) {
  total++;
  const isMatch = compareFn ? compareFn(actual, expected) : actual === expected;
  if (isMatch) {
    console.log(`[PASS] ${name} -> ${JSON.stringify(actual)}`);
    passed++;
  } else {
    console.error(`[FAIL] ${name} -> Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    process.exitCode = 1;
  }
}

function floatEqual(a, b, epsilon = 1e-6) {
  if (a === null && b === null) return true;
  if (typeof a !== 'number' || typeof b !== 'number') return false;
  return Math.abs(a - b) < epsilon;
}

console.log('=== VERIFYING STEP 1 BACKEND-DERIVED CALCULATIONS ===\n');

// 1. rateOfChangePerHour
test('rateOfChangePerHour: 0h=2.0, 24h=2.8', rateOfChangePerHour(2.0, 2.8), 0.03333333333333333, floatEqual);
test('rateOfChangePerHour: null 0h', rateOfChangePerHour(null, 2.8), null);
test('rateOfChangePerHour: non-numeric 24h', rateOfChangePerHour(2.0, 'abc'), null);

// 2. projectedMargin
test('projectedMargin: UPPER, limit=4.0, prediction=4.5', projectedMargin(4.5, 4.0, 'UPPER'), -0.5, floatEqual);
test('projectedMargin: LOWER, limit=2.0, prediction=1.5', projectedMargin(1.5, 2.0, 'LOWER'), -0.5, floatEqual);
test('projectedMargin: UPPER, limit=4.0, prediction=3.2', projectedMargin(3.2, 4.0, 'UPPER'), 0.8, floatEqual);
test('projectedMargin: LOWER, limit=2.0, prediction=2.4', projectedMargin(2.4, 2.0, 'LOWER'), 0.4, floatEqual);
test('projectedMargin: invalid direction', projectedMargin(3.2, 4.0, 'UNKNOWN'), null);
test('projectedMargin: missing prediction', projectedMargin(null, 4.0, 'UPPER'), null);

// 3. engineeringStatus
const normalComp = {
  iddq: { history: { '0h': 2.0, '24h': 2.2 }, engineeringLimit: { upper: 3.0 } },
  leakage: { history: { '0h': 0.35, '24h': 0.40 }, engineeringLimit: { upper: 0.8 } },
};
test('engineeringStatus: 0 violating parameters -> NORMAL', engineeringStatus(normalComp), 'NORMAL');

const suspectComp = {
  iddq: { history: { '0h': 3.1, '24h': 3.5 }, engineeringLimit: { upper: 3.0 } }, // breached at 0h & 24h -> 1 violation
  leakage: { history: { '0h': 0.35, '24h': 0.40 }, engineeringLimit: { upper: 0.8 } },
};
test('engineeringStatus: 1 violating parameter (multiple timepoints) -> SUSPECT', engineeringStatus(suspectComp), 'SUSPECT');

const criticalComp = {
  iddq: { history: { '0h': 2.0, '24h': 3.5 }, engineeringLimit: { upper: 3.0 } }, // breached
  leakage: { history: { '0h': 0.35, '24h': 0.85 }, engineeringLimit: { upper: 0.8 } }, // breached
};
test('engineeringStatus: 2 violating parameters -> CRITICAL', engineeringStatus(criticalComp), 'CRITICAL');

// 4. overallStatus
test('overallStatus: FLAGGED + NOT_EVALUATED -> FLAGGED', overallStatus('FLAGGED', 'NOT_EVALUATED'), 'FLAGGED');
test('overallStatus: NOT FLAGGED + NOT_EVALUATED -> NOT FLAGGED', overallStatus('NOT FLAGGED', 'NOT_EVALUATED'), 'NOT FLAGGED');
test('overallStatus: NOT_EVALUATED + NOT_EVALUATED -> NOT_EVALUATED', overallStatus('NOT_EVALUATED', 'NOT_EVALUATED'), 'NOT_EVALUATED');
test('overallStatus: FLAGGED + NOT FLAGGED -> FLAGGED', overallStatus('FLAGGED', 'NOT FLAGGED'), 'FLAGGED');
test('overallStatus: NOT FLAGGED + NOT FLAGGED -> NOT FLAGGED', overallStatus('NOT FLAGGED', 'NOT FLAGGED'), 'NOT FLAGGED');

// 5. currentYield
const lotComponents = [
  { engineeringStatus: 'NORMAL' },
  { engineeringStatus: 'NORMAL' },
  { engineeringStatus: 'NORMAL' },
  { engineeringStatus: 'NORMAL' },
  { engineeringStatus: 'NORMAL' },
  { engineeringStatus: 'SUSPECT' },
  { engineeringStatus: 'SUSPECT' },
  { engineeringStatus: 'CRITICAL' },
  { engineeringStatus: 'CRITICAL' },
  { engineeringStatus: 'CRITICAL' },
  { engineeringStatus: 'CRITICAL' },
  { engineeringStatus: 'CRITICAL' },
];
test('currentYield: 5 NORMAL out of 12 eligible components -> 41.666...%', currentYield(lotComponents), 41.66666666666667, floatEqual);
test('currentYield: empty lot -> 0.0', currentYield([]), 0.0, floatEqual);

console.log(`\nResults: ${passed}/${total} verification tests passed!`);
