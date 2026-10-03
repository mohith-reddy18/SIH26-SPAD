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
  lotStatus: 'COMPLETED',
  currentStage: '100% Validation Gate',
  currentProgressPercent: 100,
  hasFuturePrediction: true,
  hasAnomalyDetection: true,
  completionRate: '100%',
  startTime: '2026-09-12T08:00:00Z',
  temperature: '199–200°C',
  chamberId: 'NASA-MOSFET-CHAMBER',
  operator: 'NASA-THERMAL-OVERSTRESS-V1',
  totalUnits: 0,
  screenedUnits: 0,
  currentYield: '100%',
  anomaliesDetected: 0,
  nextGate: '100% Physical Validation Gate',
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
    checkpoints: ['0%', '33.3%', '66.7%', '100%'],
    description: 'Drain-source ON-state resistance extracted from late-pulse ON window (70–90% interval) under 199–200°C thermal overstress.',
  },
  'delta-rdson': {
    id: 'delta-rdson',
    key: 'delta_rdson',
    name: 'Early Drift ΔRDS(0%→33.3%)',
    shortName: 'ΔRDS',
    unit: 'Ω',
    specLimitMax: 0.15,
    divergenceThreshold: 0.064,
    checkpoints: ['0%', '33.3%'],
    description: 'Early degradation drift gradient between baseline (0%) and early observation checkpoint (33.3%).',
  },
  'chamber-temp': {
    id: 'chamber-temp',
    key: 'temp',
    name: 'Chamber Temperature (T_j)',
    shortName: 'T_j',
    unit: '°C',
    specLimitMax: 210.0,
    divergenceThreshold: 5.0,
    checkpoints: ['0%', '33.3%', '66.7%', '100%'],
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
    checkpoints: ['0%', '33.3%', '66.7%', '100%'],
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
    checkpoints: ['0%', '33.3%', '66.7%', '100%'],
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
    checkpoints: ['0%', '33.3%', '66.7%', '100%'],
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
    checkpoints: ['0%', '33.3%', '66.7%', '100%'],
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
  lotsProcessed: 0,
};

// 5. Predictive Screening Pipeline Stages UI Configuration
export const mockPipelineStages = [
  {
    id: 'stage-0h',
    timeLabel: '0%',
    name: 'Baseline Measurement (RDS 0%)',
    category: 'INPUT OBSERVATION (0%)',
    status: 'complete',
    badge: 'Complete',
    description: 'Initial pre-stress baseline ON-state resistance extracted from late-pulse ON window.',
  },
  {
    id: 'stage-24h',
    timeLabel: '33.3%',
    name: 'Early Stress Checkpoint (RDS 33.3%)',
    category: 'INPUT OBSERVATION (33.3%)',
    status: 'complete',
    badge: 'Complete',
    description: 'Early observation checkpoint providing RDS 33.3% and early drift ΔRDS(0%→33.3%) for ML models.',
  },
  {
    id: 'stage-96h',
    timeLabel: '66.7%',
    name: 'Intermediate Stress Checkpoint',
    category: 'PROGRESSION CHECKPOINT (66.7%)',
    status: 'complete',
    badge: 'Complete',
    description: 'Mid-point thermal stress verification confirming normal reference trajectory tracking.',
  },
  {
    id: 'stage-168h',
    timeLabel: '100%',
    name: 'Forecast Residual Validation Gate',
    category: 'FORECAST & VERIFICATION (100%)',
    status: 'active',
    badge: 'Active Gate',
    description: 'Evaluation of Module B predicted RDS 100% vs actual RDS 100%. Discloses test residuals.',
  },
];

// 6. Evidence Pathways UI Definitions
export const mockEvidencePathways = [
  {
    id: 'population-abnormality',
    title: 'Isolation Forest — Anomaly Detection',
    question: 'Is early behavior [RDS(0%), ΔRDS(0%→33.3%)] anomalous compared with the normal reference population?',
    severity: 'critical',
    diagnostic: 'Isolation Forest (n=500, max_samples=13) continuous novelty IF_Score on [RDS(0%), ΔRDS(0%→33.3%)].',
    primaryMetric: 'DYNAMIC NOVELTY',
    statusTag: 'ACTIVE INFERENCE',
  },
  {
    id: 'trajectory-abnormality',
    title: 'Random Forest — Future Prediction',
    question: 'Given early observations [0%, 33.3% / RDS(0%), RDS(33.3%)], what future 100% value should be predicted?',
    severity: 'critical',
    diagnostic: 'Random Forest Regressor (300 trees, depth 3) trained on 13 normal references (LOOCV MAE 0.0528 Ω).',
    primaryMetric: 'MAE 0.0528 Ω',
    statusTag: 'VERIFIED MODEL',
  },
  {
    id: 'future-risk-prediction',
    title: 'Forecast Residual & Latent Defect Triage',
    question: 'Does the actual 100% measurement deviate excessively from the learned normal forecast (>0.165 Ω upper fence)?',
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
