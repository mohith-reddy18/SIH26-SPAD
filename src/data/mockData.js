/**
 * SPAD: Space-Grade Anomaly Detection
 * Static UI and Reference Configuration for Screening Command Center
 *
 * NOTE: All component telemetry, measurements, and AI inferences are loaded dynamically
 * from the database via the backend API (MongoDB Atlas -> Express API -> React Website).
 * No component records or telemetry measurements are hardcoded in frontend mock data.
 *
 * Supported Telemetry Parameters:
 * - rdson: On-Resistance (Ω)
 * - delta_rdson: Early Drift ΔRDS(0→33) (Ω)
 * - temp: Chamber Temperature (°C)
 * - vgs: Gate-Source Voltage (V)
 * - vds: Drain-Source Voltage (V)
 * - freq: Switching Frequency (Hz)
 * - dutyCycle: Duty Cycle (%)
 */

// 1. Static Screening Context Template (Overridden dynamically by active database records)
export const mockScreeningContext = {
  lotId: 'NASA-MOSFET-199C',
  lotStatus: 'PREDICTIVE SCREENING ACTIVE',
  currentStage: '168hr Validation Gate',
  currentProgressPercent: 100,
  startTime: '2026-09-12T08:00:00Z',
  temperature: '199–200°C',
  chamberId: 'NASA-MOSFET-CHAMBER',
  operator: 'NASA-THERMAL-OVERSTRESS-V1',
  totalUnits: 0,
  screenedUnits: 0,
  currentYield: '100%',
  anomaliesDetected: 0,
  nextGate: 'V2 Multidimensional Observability Upgrade',
};

// 2. Telemetry Parameter Specifications & Engineering Reference Limits
export const mockParameterSpecs = {
  'rdson': {
    id: 'rdson',
    key: 'rdson',
    name: 'On-Resistance (RDS(on))',
    shortName: 'RDS(on)',
    unit: 'Ω',
    specLimitMax: 1.00,
    divergenceThreshold: 0.165,
    checkpoints: ['0hr', '24hr', '96hr', '168hr'],
    description: 'Drain-source ON-state resistance extracted from late-pulse ON window (70–90% interval) under 199–200°C thermal overstress.',
  },
  'delta-rdson': {
    id: 'delta-rdson',
    key: 'delta_rdson',
    name: 'Early Drift ΔRDS(0→33)',
    shortName: 'ΔRDS',
    unit: 'Ω',
    specLimitMax: 0.15,
    divergenceThreshold: 0.064,
    checkpoints: ['0hr', '24hr'],
    description: 'Early degradation drift gradient between baseline (0hr) and early observation checkpoint (24hr).',
  },
  'chamber-temp': {
    id: 'chamber-temp',
    key: 'temp',
    name: 'Chamber Temperature (T_j)',
    shortName: 'T_j',
    unit: '°C',
    specLimitMax: 210.0,
    divergenceThreshold: 5.0,
    checkpoints: ['0hr', '24hr', '96hr', '168hr'],
    description: 'Thermal overstress test chamber junction temperature (Nominal condition: ~199–200°C).',
  },
  'gate-voltage': {
    id: 'gate-voltage',
    key: 'vgs',
    name: 'Gate-Source Voltage (V_GS)',
    shortName: 'V_GS',
    unit: 'V',
    specLimitMax: 12.0,
    divergenceThreshold: 0.5,
    checkpoints: ['0hr', '24hr', '96hr', '168hr'],
    description: 'Gate switching voltage pulse (Nominal 10 V, 1000 Hz, 40% duty cycle).',
  },
  'drain-voltage': {
    id: 'drain-voltage',
    key: 'vds',
    name: 'Supply Voltage (V_DS)',
    shortName: 'V_DS',
    unit: 'V',
    specLimitMax: 6.0,
    divergenceThreshold: 0.5,
    checkpoints: ['0hr', '24hr', '96hr', '168hr'],
    description: 'Drain-to-source test supply voltage (Nominal 5 V).',
  },
  'switching-freq': {
    id: 'switching-freq',
    key: 'freq',
    name: 'Switching Frequency (f_sw)',
    shortName: 'f_sw',
    unit: 'Hz',
    specLimitMax: 1200,
    divergenceThreshold: 50,
    checkpoints: ['0hr', '24hr', '96hr', '168hr'],
    description: 'Gate switching frequency (Nominal 1000 Hz).',
  },
  'duty-cycle': {
    id: 'duty-cycle',
    key: 'dutyCycle',
    name: 'Duty Cycle (D)',
    shortName: 'D',
    unit: '%',
    specLimitMax: 50,
    divergenceThreshold: 5,
    checkpoints: ['0hr', '24hr', '96hr', '168hr'],
    description: 'Gate pulse duty cycle (Nominal 40%).',
  },
};

// 3. Component Records (Empty — Single Source of Truth is MongoDB via /api/screening)
export const mockComponents = [];

// 4. Screening Summary Stats Initial State (Derived dynamically from active DB records)
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

// 5. Predictive Screening Pipeline Stages UI Configuration
export const mockPipelineStages = [
  {
    id: 'stage-0pct',
    timeLabel: '0hr',
    name: 'Baseline Measurement (RDS0)',
    category: 'INPUT OBSERVATION',
    status: 'complete',
    badge: 'Complete',
    description: 'Initial pre-stress baseline ON-state resistance extracted from late-pulse ON window.',
  },
  {
    id: 'stage-33pct',
    timeLabel: '24hr',
    name: 'Early Stress Checkpoint (RDS33)',
    category: 'INPUT OBSERVATION',
    status: 'complete',
    badge: 'Complete',
    description: 'Early observation checkpoint providing RDS33 and early drift ΔRDS(0→33) for ML models.',
  },
  {
    id: 'stage-66pct',
    timeLabel: '96hr',
    name: 'Intermediate Stress Checkpoint',
    category: 'PROGRESSION CHECKPOINT',
    status: 'complete',
    badge: 'Complete',
    description: 'Mid-point thermal stress verification confirming normal reference trajectory tracking.',
  },
  {
    id: 'stage-100pct',
    timeLabel: '168hr',
    name: 'Forecast Residual Validation Gate',
    category: 'FORECAST & VERIFICATION',
    status: 'active',
    badge: 'Active Gate',
    description: 'Evaluation of Module B predicted RDS100 vs actual RDS100. Discloses test residuals.',
  },
];

// 6. Evidence Pathways UI Definitions
export const mockEvidencePathways = [
  {
    id: 'population-abnormality',
    title: 'Isolation Forest — Anomaly Detection',
    question: 'Is early behavior [RDS0, ΔRDS(0→33)] anomalous compared with the normal reference population?',
    severity: 'critical',
    diagnostic: 'Isolation Forest (n=500, max_samples=13) continuous novelty IF_Score on [RDS0, ΔRDS(0→33)].',
    primaryMetric: 'DYNAMIC NOVELTY',
    statusTag: 'ACTIVE INFERENCE',
  },
  {
    id: 'trajectory-abnormality',
    title: 'Random Forest — Future Prediction',
    question: 'Given early observations [0h, 24h / RDS0, RDS33], what future 168h value should be predicted?',
    severity: 'critical',
    diagnostic: 'Random Forest Regressor (300 trees, depth 3) trained on 13 normal references (LOOCV MAE 0.0528 Ω).',
    primaryMetric: 'MAE 0.0528 Ω',
    statusTag: 'VERIFIED MODEL',
  },
  {
    id: 'future-risk-prediction',
    title: 'Forecast Residual & Latent Defect Triage',
    question: 'Does the actual 168hr measurement deviate excessively from the learned normal forecast (>0.165 Ω upper fence)?',
    severity: 'critical',
    diagnostic: 'Forecast residuals expose latent failure: deviations beyond 0.165 Ω fence indicate gross anomalous degradation.',
    primaryMetric: 'RESIDUAL FENCE 0.165 Ω',
    statusTag: 'ACTIVE TRIAGE',
  },
];

// 7. System Subsystem Statuses
export const mockSystemSubsystems = [
  {
    id: 'ingestion',
    name: 'Transient Pulse Extraction',
    status: 'Operational',
    ping: '8ms',
    detail: 'Late-pulse ON-window (70–90%) RDS(on) detector active',
  },
  {
    id: 'validation',
    name: 'NASA Spec Boundary Verification',
    status: 'Operational',
    ping: '4ms',
    detail: '199–200°C thermal overstress limit validator online',
  },
  {
    id: 'ai-engine',
    name: 'Module A + Module B Inference',
    status: 'Operational',
    ping: '22ms',
    detail: 'Isolation Forest + Random Forest dual inference active',
  },
  {
    id: 'decision-engine',
    name: 'SHAP Explainability Engine',
    status: 'Operational',
    ping: '15ms',
    detail: 'TreeExplainer attribution & residual triage synchronized',
  },
  {
    id: 'database',
    name: 'Database (MongoDB Atlas)',
    status: 'Operational',
    ping: '2ms',
    detail: 'Single source of truth via Express REST API',
  },
];

// 8. Recent Alerts Initial State (Derived dynamically from active DB records)
export const mockRecentAlerts = [];

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
