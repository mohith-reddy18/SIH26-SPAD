/**
 * SPAD: Space-Grade Anomaly Detection
 * Centralized Single Source of Truth for Mock Screening Data
 * 
 * STEP 6: Cleaned to retain ONLY genuinely unavailable backend information:
 * 1. Environmental chamber telemetry (CHAMBER-B4-RAD, temp, operator)
 * 2. Multi-unit statistical reference/envelope data (healthyRef nominal curves)
 * 3. Pipeline conceptual structure (0h -> 24h -> AI -> 168h Physical)
 * 4. Multi-modal evidence pathway diagnostic architecture
 * 5. System subsystem telemetry & event stream (Recent Alerts)
 * 
 * Obsolete duplicate mock component records have been removed in favor of MongoDB + Express API.
 */

// 1. Active Screening Lot Context (Retained for environmental chamber telemetry)
export const mockScreeningContext = {
  lotId: 'LOT-2026-001',
  lotStatus: 'PREDICTIVE SCREENING ACTIVE',
  currentStage: 'AI 168h Prediction',
  currentProgressPercent: 75,
  startTime: '2026-09-12T08:00:00Z',
  temperature: '125°C',
  chamberId: 'CHAMBER-B4-RAD',
  operator: 'ENG-MIL-SPEC-883',
  totalUnits: 0,
  screenedUnits: 0,
  currentYield: '100.0%',
  anomaliesDetected: 0,
  nextGate: '168h Physical Validation Gate',
};

// 2. Parameter Specifications & Nominal Engineering References
export const mockParameterSpecs = {
  'standby-current': {
    id: 'standby-current',
    key: 'iddq',
    name: 'Standby Current (Iddq)',
    shortName: 'Iddq',
    unit: 'mA',
    specLimitMax: 4.00,
    healthyRef: [2.00, 2.05, 2.10, 2.15],
    divergenceThreshold: 0.50,
    checkpoints: ['0h', '24h', '96h', '168h'],
    description: 'Quiescent drain current in CMOS logic under high-temperature burn-in stress.',
  },
  'leakage-current': {
    id: 'leakage-current',
    key: 'leakage',
    name: 'Leakage Current (I_leak)',
    shortName: 'I_leak',
    unit: 'µA',
    specLimitMax: 1.50,
    healthyRef: [0.38, 0.40, 0.41, 0.43],
    divergenceThreshold: 0.30,
    checkpoints: ['0h', '24h', '96h', '168h'],
    description: 'Subthreshold and gate oxide parasitic leakage across thermal burn-in stress.',
  },
  'propagation-delay': {
    id: 'propagation-delay',
    key: 'propDelay',
    name: 'Propagation Delay (t_pd)',
    shortName: 't_pd',
    unit: 'ns',
    specLimitMax: 11.00,
    healthyRef: [8.10, 8.14, 8.18, 8.22],
    divergenceThreshold: 0.80,
    checkpoints: ['0h', '24h', '96h', '168h'],
    description: 'Critical path switching speed degradation indicating potential gate aging.',
  },
};

// 3. High-Reliability Component Records (Obsolete mock records removed; backend is source of truth)
export const mockComponents = [];

// 4. Screening Summary Stats Baseline
export const mockSummaryStats = {
  totalComponents: 0,
  normal: 0,
  suspect: 0,
  critical: 0,
  passed: 0,
  hold: 0,
  rejected: 0,
  lotsProcessed: 0,
};

// 5. Predictive Screening Pipeline Stages (0h + 24h Inputs -> AI 168h Prediction -> 168h Physical Validation)
export const mockPipelineStages = [
  {
    id: 'stage-0h',
    timeLabel: '0h',
    name: 'Baseline Measurement',
    category: 'INPUT MEASUREMENT',
    status: 'complete',
    badge: 'Complete',
    description: 'Initial room & high-temp physical baseline screening completed.',
    completedAt: '2026-09-12 10:30',
    sampleYield: '100%',
  },
  {
    id: 'stage-24h',
    timeLabel: '24h',
    name: 'Early Burn-In Check',
    category: 'INPUT MEASUREMENT',
    status: 'complete',
    badge: 'Complete',
    description: 'Early thermal stress physical checkpoint verified; quick-drift input data acquired.',
    completedAt: '2026-09-13 10:30',
    sampleYield: '98.4%',
  },
  {
    id: 'stage-ai',
    timeLabel: 'AI',
    name: '168h Risk Prediction',
    category: 'AI PREDICTION',
    status: 'available',
    badge: 'Available',
    description: 'Early AI Bayesian drift model forecasts 168h trajectory and limit breaches from 0h+24h inputs.',
    completedAt: '2026-09-13 11:00',
    sampleYield: 'Projected',
  },
  {
    id: 'stage-168h',
    timeLabel: '168h',
    name: 'Physical Validation',
    category: 'PHYSICAL VALIDATION',
    status: 'pending',
    badge: 'Pending',
    description: 'Actual MIL-STD-883 physical qualification test executed later to validate predictions.',
    completedAt: null,
    sampleYield: 'Pending (Physical)',
  },
];

// 6. Evidence Pathways (Multi-Modal Diagnostic & Early Forecasting Engines)
export const mockEvidencePathways = [
  {
    id: 'population-abnormality',
    title: 'Population Abnormality',
    question: 'Is the component statistically unusual compared with peer units in this lot at the current stage?',
    flaggedCount: 0,
    severity: 'moderate',
    diagnostic: 'High multivariate Mahalanobis distance from Gaussian lot cluster evaluated on observed data.',
    primaryMetric: 'SUSPECT UNITS',
    statusTag: 'SUSPECT',
  },
  {
    id: 'trajectory-abnormality',
    title: 'Trajectory Abnormality',
    question: 'Is the component degrading differently from the expected/healthy degradation trajectory?',
    flaggedCount: 0,
    severity: 'high',
    diagnostic: 'Non-linear rate of change in Iddq & leakage current across observed 0h→24h checkpoints exceeding nominal decay gradient.',
    primaryMetric: 'SUSPECT UNITS',
    statusTag: 'SUSPECT',
  },
  {
    id: 'future-risk-prediction',
    title: 'Future-Risk Prediction',
    question: 'Based on early observed data (0h & 24h), is the component predicted to violate an engineering limit at 168h?',
    flaggedCount: 0,
    severity: 'critical',
    diagnostic: 'Early AI Bayesian drift model projects 168h trajectory from 0h and 24h inputs before the physical 168h test.',
    primaryMetric: 'CRITICAL FORECAST',
    statusTag: 'CRITICAL',
  },
];

// 7. System Subsystem Statuses
export const mockSystemSubsystems = [
  {
    id: 'ingestion',
    name: 'Data Ingestion Pipeline',
    status: 'Operational',
    ping: '12ms',
    detail: 'Chamber telemetry live stream active',
  },
  {
    id: 'validation',
    name: 'Measurement Validation',
    status: 'Operational',
    ping: '4ms',
    detail: 'MIL-STD-883 check rule engine active',
  },
  {
    id: 'ai-engine',
    name: 'AI Analysis Engine',
    status: 'Operational',
    ping: '28ms',
    detail: 'Multi-head Bayesian inference running',
  },
  {
    id: 'decision-engine',
    name: 'Decision Engine',
    status: 'Operational',
    ping: '6ms',
    detail: 'Threshold & suspect triage sync nominal',
  },
  {
    id: 'database',
    name: 'Database (MongoDB)',
    status: 'Operational',
    ping: '2ms',
    detail: 'Time-series telemetry storage healthy',
  },
];

// 8. Recent Screening Alerts (Retained for event stream UI)
export const mockRecentAlerts = [
  {
    id: 'alert-001',
    targetId: 'C-0004',
    type: 'component',
    severity: 'danger',
    message: 'Abnormal Iddq trajectory detected (>3.8mA at 24h)',
    timeAgo: '2 min ago',
    timestamp: '15:46:12',
  },
  {
    id: 'alert-002',
    targetId: 'C-0003',
    type: 'component',
    severity: 'warning',
    message: 'Elevated future-risk prediction (Risk index: 78%)',
    timeAgo: '8 min ago',
    timestamp: '15:40:05',
  },
  {
    id: 'alert-003',
    targetId: 'C-0012',
    type: 'component',
    severity: 'danger',
    message: 'Engineering limit violation: Leakage > 1.50µA',
    timeAgo: '14 min ago',
    timestamp: '15:34:22',
  },
  {
    id: 'alert-004',
    targetId: 'LOT-2026-001',
    type: 'lot',
    severity: 'info',
    message: '24h screening checkpoint verification complete (12 units)',
    timeAgo: '21 min ago',
    timestamp: '15:27:00',
  },
  {
    id: 'alert-005',
    targetId: 'C-0002',
    type: 'component',
    severity: 'warning',
    message: 'Propagation delay variance +1.8ns above lot baseline',
    timeAgo: '35 min ago',
    timestamp: '15:13:41',
  },
];

// 9. Composite Dashboard Data Object
export const mockDashboardData = {
  screeningContext: mockScreeningContext,
  summaryStats: mockSummaryStats,
  pipelineStages: mockPipelineStages,
  evidencePathways: mockEvidencePathways,
  parameterSpecs: mockParameterSpecs,
  componentRecords: mockComponents,
  systemSubsystems: mockSystemSubsystems,
  recentAlerts: mockRecentAlerts,
};
