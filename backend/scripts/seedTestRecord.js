/**
 * Temporary Test Data Seeder for SPAD Screening
 * Inserts exactly ONE test screening record into MongoDB Atlas.
 * Kept strictly isolated from application logic so it can be easily removed or replaced.
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ScreeningRecord = require('../models/ScreeningRecord');

const testScreeningData = {
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
};

async function seedOneRecord() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Error: MONGODB_URI is not set in backend/.env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(uri);
    console.log('Connected to MongoDB Atlas.');

    // Check if test record already exists
    const existing = await ScreeningRecord.findOne({ componentId: testScreeningData.componentId });
    if (existing) {
      console.log(`Test record for ${testScreeningData.componentId} already exists (ID: ${existing._id}). Skipping duplicate creation.`);
      console.log(JSON.stringify(existing, null, 2));
    } else {
      const created = await ScreeningRecord.create(testScreeningData);
      console.log(`Successfully inserted test record for ${testScreeningData.componentId} (ID: ${created._id}).`);
      console.log(JSON.stringify(created, null, 2));
    }

    // Verify retrieval
    const count = await ScreeningRecord.countDocuments();
    console.log(`Total screening records in MongoDB: ${count}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB Atlas.');
  } catch (err) {
    console.error('Error seeding test record:', err.message);
    process.exit(1);
  }
}

seedOneRecord();
