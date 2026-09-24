/**
 * Seeder for SPAD Mock Components (C-0002 through C-0012)
 * Seeds existing mock components into MongoDB Atlas for end-to-end testing.
 * Strictly avoids modifying or duplicating existing records (e.g. C-0001).
 */
const https = require('https');

const mockComponents = [
  {
    componentId: 'C-0001',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.00, 2.10, 2.10, 2.20],
      leakage: [0.38, 0.40, 0.41, 0.43],
      propDelay: [8.10, 8.14, 8.18, 8.22],
    },
    predictions: {
      iddq_168h: 2.20,
      leakage_168h: 0.43,
      propDelay_168h: 8.22,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'WITHIN LIMIT',
    aiRisk: 12,
    riskScore: 0.12,
    anomalies: {
      populationAbnormality: false,
      trajectoryAbnormality: false,
      futureRiskPrediction: 'Low (<5%)',
    },
    aiAssessment: 'NORMAL',
    evidence: 'Within Expected Range',
    decision: 'NORMAL',
    status: 'NORMAL',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 12,
      baseValue: 0.15,
      features: [
        { name: 'Pre-Burn-In Baseline Iddq', featureValue: '2.00 mA (Healthy)', shapValue: -0.14 },
        { name: 'Leakage Current Rate (0h→96h)', featureValue: '+0.05 µA/100h', shapValue: -0.12 },
        { name: 'Propagation Delay Stability', featureValue: '8.18 ns (Nominal)', shapValue: -0.10 },
        { name: 'Iddq Drift Gradient', featureValue: '2.20 mA proj.', shapValue: -0.08 },
        { name: '24h Intermediate Trace', featureValue: '0.40 µA (Stable)', shapValue: 0.02 },
      ],
      summaryText: 'Parametric measurements tightly track the healthy baseline curve, with negative SHAP contributions lowering predicted failure risk below lot baseline.',
    },
  },
  {
    componentId: 'C-0002',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.00, 2.20, 2.80, 3.50],
      leakage: [0.40, 0.65, 0.95, 1.25],
      propDelay: [8.20, 8.70, 9.40, 10.20],
    },
    predictions: {
      iddq_168h: 3.50,
      leakage_168h: 1.25,
      propDelay_168h: 10.20,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'NEAR LIMIT (DRIFT)',
    aiRisk: 74,
    riskScore: 0.74,
    anomalies: {
      populationAbnormality: true,
      trajectoryAbnormality: true,
      futureRiskPrediction: 'Elevated Future Risk (78%)',
    },
    aiAssessment: 'SUSPECT',
    evidence: 'Trajectory Anomaly (Early Drift)',
    decision: 'SUSPECT',
    status: 'SUSPECT',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 74,
      baseValue: 0.15,
      features: [
        { name: 'Leakage Current Rate (0h→96h)', featureValue: '+0.85 µA/100h (Steep)', shapValue: 0.36 },
        { name: 'Iddq Degradation Slope', featureValue: '3.50 mA proj. (High Drift)', shapValue: 0.24 },
        { name: '24h Intermediate Leakage', featureValue: '0.65 µA (Accelerating)', shapValue: 0.12 },
        { name: 'Propagation Delay Stability', featureValue: '9.40 ns (Nominal)', shapValue: -0.04 },
        { name: 'Pre-Burn-In Baseline Iddq', featureValue: '2.00 mA (Healthy)', shapValue: -0.06 },
      ],
      summaryText: 'Strong positive SHAP contributions from leakage current acceleration and Iddq trajectory slope drive elevated 168h risk prediction despite current measurements remaining within hard limits.',
    },
  },
  {
    componentId: 'C-0003',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.10, 2.70, 3.80, 4.60],
      leakage: [0.45, 0.85, 1.35, 1.85],
      propDelay: [8.40, 9.50, 10.80, 12.40],
    },
    predictions: {
      iddq_168h: 4.60,
      leakage_168h: 1.85,
      propDelay_168h: 12.40,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'PROJECTED LIMIT BREACH',
    aiRisk: 97,
    riskScore: 0.97,
    anomalies: {
      populationAbnormality: true,
      trajectoryAbnormality: true,
      futureRiskPrediction: 'Predicted Limit Breach (>99%)',
    },
    aiAssessment: 'CRITICAL',
    evidence: 'Predicted Limit Breach',
    decision: 'CRITICAL',
    status: 'CRITICAL',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 97,
      baseValue: 0.15,
      features: [
        { name: 'Iddq Limit Breach Projection', featureValue: '4.60 mA (>4.00 mA limit)', shapValue: 0.44 },
        { name: 'Leakage Current Breakdown', featureValue: '1.85 µA (>1.50 µA limit)', shapValue: 0.32 },
        { name: 'Propagation Delay Degradation', featureValue: '12.40 ns (>11.00 ns limit)', shapValue: 0.18 },
        { name: '24h Severe Slope Divergence', featureValue: 'Accelerated Drift', shapValue: 0.12 },
        { name: 'Pre-Burn-In Initial Offset', featureValue: '2.10 mA (Marginal)', shapValue: 0.06 },
      ],
      summaryText: 'Concurrent positive SHAP attributions across all three parametric channels indicate catastrophic degradation toward early qualification failure.',
    },
  },
  {
    componentId: 'C-0004',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.02, 2.05, 2.08, 2.12],
      leakage: [0.36, 0.38, 0.39, 0.41],
      propDelay: [8.08, 8.11, 8.14, 8.18],
    },
    predictions: {
      iddq_168h: 2.12,
      leakage_168h: 0.41,
      propDelay_168h: 8.18,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'WITHIN LIMIT',
    aiRisk: 8,
    riskScore: 0.08,
    anomalies: {
      populationAbnormality: false,
      trajectoryAbnormality: false,
      futureRiskPrediction: 'Low (<2%)',
    },
    aiAssessment: 'NORMAL',
    evidence: 'Within Expected Range',
    decision: 'NORMAL',
    status: 'NORMAL',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 8,
      baseValue: 0.15,
      features: [
        { name: 'Pre-Burn-In Baseline Iddq', featureValue: '2.02 mA (Ideal)', shapValue: -0.18 },
        { name: 'Leakage Stability Gradient', featureValue: '+0.05 µA/100h', shapValue: -0.15 },
        { name: 'Propagation Delay Stability', featureValue: '8.14 ns (Ideal)', shapValue: -0.12 },
        { name: 'Iddq Flat Trajectory', featureValue: '2.12 mA proj.', shapValue: -0.10 },
        { name: '24h Quick Drift Check', featureValue: '0.38 µA', shapValue: 0.01 },
      ],
      summaryText: 'Uniformly negative SHAP values reflect exceptionally high parametric stability across all checkpoints.',
    },
  },
  {
    componentId: 'C-0005',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.10, 2.35, 3.10, 4.25],
      leakage: [0.42, 0.60, 0.88, 1.20],
      propDelay: [8.30, 8.75, 9.25, 9.90],
    },
    predictions: {
      iddq_168h: 4.25,
      leakage_168h: 1.20,
      propDelay_168h: 9.90,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'SINGLE PARAMETER BREACH (Iddq)',
    aiRisk: 68,
    riskScore: 0.68,
    anomalies: {
      populationAbnormality: true,
      trajectoryAbnormality: false,
      futureRiskPrediction: 'Elevated Future Risk (64%)',
    },
    aiAssessment: 'SUSPECT',
    evidence: 'Population Anomaly (Iddq Drift)',
    decision: 'SUSPECT',
    status: 'SUSPECT',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 68,
      baseValue: 0.15,
      features: [
        { name: 'Iddq 96h Limit Breach Trajectory', featureValue: '4.25 mA (>4.00 mA limit)', shapValue: 0.41 },
        { name: '24h-96h Iddq Accelerated Slope', featureValue: '+0.75 mA/72h', shapValue: 0.25 },
        { name: 'Leakage Current Stability', featureValue: '1.20 µA (Within Limit)', shapValue: -0.09 },
        { name: 'Propagation Delay Stability', featureValue: '9.90 ns (Within Limit)', shapValue: -0.06 },
        { name: 'Pre-Burn-In Baseline Iddq', featureValue: '2.10 mA (Nominal)', shapValue: 0.02 },
      ],
      summaryText: 'SHAP feature attribution isolates Iddq thermal degradation as the dominant positive risk contributor, while other parameters provide mitigating negative contributions.',
    },
  },
  {
    componentId: 'C-0006',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.05, 2.08, 2.12, 2.16],
      leakage: [0.37, 0.39, 0.42, 0.44],
      propDelay: [8.12, 8.16, 8.20, 8.24],
    },
    predictions: {
      iddq_168h: 2.16,
      leakage_168h: 0.44,
      propDelay_168h: 8.24,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'WITHIN LIMIT',
    aiRisk: 14,
    riskScore: 0.14,
    anomalies: {
      populationAbnormality: false,
      trajectoryAbnormality: false,
      futureRiskPrediction: 'Low (<5%)',
    },
    aiAssessment: 'NORMAL',
    evidence: 'Within Expected Range',
    decision: 'NORMAL',
    status: 'NORMAL',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 14,
      baseValue: 0.15,
      features: [
        { name: 'Pre-Burn-In Baseline Iddq', featureValue: '2.05 mA (Nominal)', shapValue: -0.13 },
        { name: 'Leakage Current Stability', featureValue: '0.44 µA proj.', shapValue: -0.11 },
        { name: 'Propagation Delay Stability', featureValue: '8.20 ns', shapValue: -0.09 },
        { name: 'Iddq Drift Index', featureValue: '+0.04 mA/72h', shapValue: -0.07 },
        { name: '24h Trace Consistency', featureValue: '0.39 µA', shapValue: 0.02 },
      ],
      summaryText: 'Negative SHAP contributions across all primary parameters validate high reliability and minimal predicted degradation.',
    },
  },
  {
    componentId: 'C-0007',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.20, 2.85, 3.95, 4.75],
      leakage: [0.50, 0.90, 1.45, 2.00],
      propDelay: [8.50, 9.10, 9.80, 10.40],
    },
    predictions: {
      iddq_168h: 4.75,
      leakage_168h: 2.00,
      propDelay_168h: 10.40,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'DUAL PARAMETER BREACH (Iddq + Leakage)',
    aiRisk: 93,
    riskScore: 0.93,
    anomalies: {
      populationAbnormality: true,
      trajectoryAbnormality: true,
      futureRiskPrediction: 'Predicted Limit Breach (>98%)',
    },
    aiAssessment: 'CRITICAL',
    evidence: 'Predicted Limit Breach (Dual)',
    decision: 'CRITICAL',
    status: 'CRITICAL',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 93,
      baseValue: 0.15,
      features: [
        { name: 'Iddq Severe Limit Breach', featureValue: '4.75 mA (>4.00 mA limit)', shapValue: 0.42 },
        { name: 'Leakage Current Acceleration', featureValue: '2.00 µA (>1.50 µA limit)', shapValue: 0.35 },
        { name: '24h-96h Dual Degradation', featureValue: 'Dual Steep Gradient', shapValue: 0.16 },
        { name: 'Propagation Delay (Within Spec)', featureValue: '10.40 ns (<11.00 ns)', shapValue: -0.08 },
        { name: 'Pre-Burn-In Baseline', featureValue: '2.20 mA', shapValue: 0.04 },
      ],
      summaryText: 'Severe positive SHAP risk contributions from concurrent Iddq and leakage current violations drive the high failure prediction.',
    },
  },
  {
    componentId: 'C-0008',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.01, 2.04, 2.09, 2.13],
      leakage: [0.35, 0.37, 0.40, 0.42],
      propDelay: [8.09, 8.13, 8.17, 8.21],
    },
    predictions: {
      iddq_168h: 2.13,
      leakage_168h: 0.42,
      propDelay_168h: 8.21,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'WITHIN LIMIT',
    aiRisk: 10,
    riskScore: 0.10,
    anomalies: {
      populationAbnormality: false,
      trajectoryAbnormality: false,
      futureRiskPrediction: 'Low (<3%)',
    },
    aiAssessment: 'NORMAL',
    evidence: 'Within Expected Range',
    decision: 'NORMAL',
    status: 'NORMAL',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 10,
      baseValue: 0.15,
      features: [
        { name: 'Pre-Burn-In Baseline Iddq', featureValue: '2.01 mA', shapValue: -0.16 },
        { name: 'Leakage Stability Index', featureValue: '0.42 µA proj.', shapValue: -0.14 },
        { name: 'Propagation Delay Nominal', featureValue: '8.17 ns', shapValue: -0.11 },
        { name: 'Iddq Flat Trajectory', featureValue: '+0.05 mA/72h', shapValue: -0.09 },
        { name: '24h Stability Trace', featureValue: '0.37 µA', shapValue: 0.01 },
      ],
      summaryText: 'Negative SHAP attributions confirm ideal adherence to nominal manufacturing baseline.',
    },
  },
  {
    componentId: 'C-0009',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.08, 2.28, 2.70, 3.35],
      leakage: [0.41, 0.58, 0.95, 1.65],
      propDelay: [8.22, 8.60, 9.15, 9.80],
    },
    predictions: {
      iddq_168h: 3.35,
      leakage_168h: 1.65,
      propDelay_168h: 9.80,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'SINGLE PARAMETER BREACH (Leakage)',
    aiRisk: 62,
    riskScore: 0.62,
    anomalies: {
      populationAbnormality: false,
      trajectoryAbnormality: true,
      futureRiskPrediction: 'Elevated Future Risk (58%)',
    },
    aiAssessment: 'SUSPECT',
    evidence: 'Trajectory Anomaly (Leakage Drift)',
    decision: 'SUSPECT',
    status: 'SUSPECT',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 62,
      baseValue: 0.15,
      features: [
        { name: 'Leakage Current Over-Limit Spike', featureValue: '1.65 µA (>1.50 µA limit)', shapValue: 0.43 },
        { name: '24h-96h Leakage Gradient', featureValue: '+0.37 µA/72h', shapValue: 0.21 },
        { name: 'Iddq (Within Spec Limit)', featureValue: '3.35 mA proj. (<4.00 mA)', shapValue: -0.09 },
        { name: 'Propagation Delay (Nominal)', featureValue: '9.80 ns (<11.00 ns)', shapValue: -0.07 },
        { name: 'Pre-Burn-In Baseline', featureValue: '0.41 µA', shapValue: 0.01 },
      ],
      summaryText: 'SHAP analysis attributes predicted risk predominantly to anomalous oxide leakage breakdown, while Iddq and propagation delay remain within safe margins.',
    },
  },
  {
    componentId: 'C-0010',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.04, 2.07, 2.11, 2.15],
      leakage: [0.38, 0.40, 0.41, 0.43],
      propDelay: [8.10, 8.15, 8.19, 8.23],
    },
    predictions: {
      iddq_168h: 2.15,
      leakage_168h: 0.43,
      propDelay_168h: 8.23,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'WITHIN LIMIT',
    aiRisk: 15,
    riskScore: 0.15,
    anomalies: {
      populationAbnormality: false,
      trajectoryAbnormality: false,
      futureRiskPrediction: 'Low (<5%)',
    },
    aiAssessment: 'NORMAL',
    evidence: 'Within Expected Range',
    decision: 'NORMAL',
    status: 'NORMAL',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 15,
      baseValue: 0.15,
      features: [
        { name: 'Pre-Burn-In Baseline Iddq', featureValue: '2.04 mA', shapValue: -0.12 },
        { name: 'Leakage Current Stability', featureValue: '0.43 µA proj.', shapValue: -0.10 },
        { name: 'Propagation Delay Stability', featureValue: '8.19 ns', shapValue: -0.08 },
        { name: 'Iddq Drift Index', featureValue: '+0.04 mA/72h', shapValue: -0.06 },
        { name: '24h Check Trace', featureValue: '0.40 µA', shapValue: 0.03 },
      ],
      summaryText: 'Component exhibits stable baseline convergence across all features, yielding net negative SHAP risk impact.',
    },
  },
  {
    componentId: 'C-0011',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.15, 2.40, 2.90, 3.60],
      leakage: [0.45, 0.68, 0.98, 1.30],
      propDelay: [8.35, 8.85, 9.80, 11.60],
    },
    predictions: {
      iddq_168h: 3.60,
      leakage_168h: 1.30,
      propDelay_168h: 11.60,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'SINGLE PARAMETER BREACH (PropDelay)',
    aiRisk: 72,
    riskScore: 0.72,
    anomalies: {
      populationAbnormality: true,
      trajectoryAbnormality: true,
      futureRiskPrediction: 'Elevated Future Risk (75%)',
    },
    aiAssessment: 'SUSPECT',
    evidence: 'Population Anomaly (PropDelay)',
    decision: 'SUSPECT',
    status: 'SUSPECT',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 72,
      baseValue: 0.15,
      features: [
        { name: 'Propagation Delay Limit Breach', featureValue: '11.60 ns (>11.00 ns limit)', shapValue: 0.45 },
        { name: 'Gate Aging Thermal Drift (t_pd)', featureValue: '+0.95 ns/72h (Accelerated)', shapValue: 0.22 },
        { name: 'Iddq (Within Spec Limit)', featureValue: '3.60 mA proj. (<4.00 mA)', shapValue: -0.07 },
        { name: 'Leakage Current (Within Spec)', featureValue: '1.30 µA (<1.50 µA)', shapValue: -0.05 },
        { name: 'Pre-Burn-In Baseline', featureValue: '8.35 ns', shapValue: 0.02 },
      ],
      summaryText: 'Critical path gate delay degradation is the primary feature contributor driving elevated model failure risk.',
    },
  },
  {
    componentId: 'C-0012',
    lotId: 'LOT-2026-001',
    stage: '96h',
    measurements: {
      iddq: [2.25, 2.90, 4.05, 4.90],
      leakage: [0.52, 0.95, 1.55, 2.10],
      propDelay: [8.60, 9.90, 11.35, 12.90],
    },
    predictions: {
      iddq_168h: 4.90,
      leakage_168h: 2.10,
      propDelay_168h: 12.90,
    },
    engineeringLimits: {
      iddq: 4.00,
      leakage: 1.50,
      propDelay: 11.00,
    },
    engineeringLimitStatus: 'LIMIT VIOLATION',
    aiRisk: 99,
    riskScore: 0.99,
    anomalies: {
      populationAbnormality: true,
      trajectoryAbnormality: true,
      futureRiskPrediction: 'High-Risk Prediction (>99%)',
    },
    aiAssessment: 'CRITICAL',
    evidence: 'High-Risk Prediction',
    decision: 'CRITICAL',
    status: 'CRITICAL',
    modelExplanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 168h Limit Risk',
      predictedRiskPercent: 99,
      baseValue: 0.15,
      features: [
        { name: 'Iddq Catastrophic Spike', featureValue: '4.90 mA (Severe Outlier)', shapValue: 0.46 },
        { name: 'Leakage Current Breakdown', featureValue: '2.10 µA (Severe Outlier)', shapValue: 0.38 },
        { name: 'Propagation Delay Severe Breach', featureValue: '12.90 ns (Severe Outlier)', shapValue: 0.22 },
        { name: '24h Severe Slope Divergence', featureValue: 'Critical Divergence', shapValue: 0.14 },
        { name: 'Pre-Burn-In Initial Offset', featureValue: '2.25 mA (Elevated)', shapValue: 0.07 },
      ],
      summaryText: 'Extreme concurrent multi-parameter degradation creates maximum positive SHAP attributions, indicating near-certain component failure.',
    },
  },
];

const API_BASE = 'https://sih26-spad.onrender.com';

function makeRequest(url, options = {}, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body: data });
        }
      });
    });
    req.on('error', reject);
    if (postData) {
      req.write(typeof postData === 'string' ? postData : JSON.stringify(postData));
    }
    req.end();
  });
}

async function seedMockComponents() {
  console.log('=== SPAD Mock Components Seeder ===');
  console.log(`Examining ${mockComponents.length} mock components defined in mockData.js...`);

  // 1. Fetch existing components in MongoDB
  const existingRes = await makeRequest(`${API_BASE}/api/screening`);
  const existingRecords = existingRes.body?.data || [];
  const existingIds = new Set(existingRecords.map((r) => r.componentId));

  console.log(`Already present in MongoDB: ${existingIds.size} (${Array.from(existingIds).join(', ')})`);

  let insertedCount = 0;
  const insertedIds = [];
  const skippedIds = [];

  for (const comp of mockComponents) {
    if (existingIds.has(comp.componentId)) {
      skippedIds.push(comp.componentId);
      continue;
    }

    // Insert missing record
    const postRes = await makeRequest(
      `${API_BASE}/api/screening`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      comp
    );

    if (postRes.statusCode === 201 && postRes.body?.success) {
      insertedCount++;
      insertedIds.push(comp.componentId);
      console.log(`[+] Inserted ${comp.componentId} (${comp.status})`);
    } else {
      console.error(`[-] Failed to insert ${comp.componentId}:`, postRes.body);
    }
  }

  // Verify final count
  const verifyRes = await makeRequest(`${API_BASE}/api/screening`);
  const finalRecords = verifyRes.body?.data || [];

  console.log('\n=== Seeding Summary ===');
  console.log(`A. Total mock components examined: ${mockComponents.length}`);
  console.log(`B. Already present in MongoDB: ${skippedIds.length} (${skippedIds.join(', ')})`);
  console.log(`C. Newly inserted: ${insertedCount}`);
  console.log(`D. Newly inserted IDs: ${insertedIds.join(', ')}`);
  console.log(`E. Total screening records now in MongoDB: ${finalRecords.length}`);
  console.log(`F. C-0001 intact (not duplicated): ${finalRecords.filter((r) => r.componentId === 'C-0001').length === 1}`);
}

if (require.main === module) {
  seedMockComponents().catch((err) => {
    console.error('Seeding error:', err.message);
    process.exit(1);
  });
}

module.exports = { mockComponents, seedMockComponents };
