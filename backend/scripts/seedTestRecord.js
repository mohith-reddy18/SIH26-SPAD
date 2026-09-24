/**
 * Test Data Seeder for SPAD Screening (TEST-01)
 * Inserts one NASA MOSFET test screening record into MongoDB Atlas.
 */
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const ScreeningRecord = require('../models/ScreeningRecord');

const testScreeningData = {
  componentId: 'TEST-01',
  lotId: 'NASA-MOSFET-199C',
  stage: '100%',
  measurements: {
    rdson: [0.512410, 0.540182, 0.562304, 0.595211],
    delta_rdson: [0.0, 0.027772, 0.049894, 0.082801],
    vgs: [10.0, 10.0, 10.0, 10.0],
    vds: [5.0, 5.0, 5.0, 5.0],
    temp: [199.8, 200.1, 199.9, 200.2],
  },
  predictions: {
    rdson: 0.602140,
    rdson_168h: 0.602140,
    residual: 0.006929,
  },
  engineeringLimits: {
    rdson: { limitValue: 1.00, direction: 'UPPER', source: 'NASA_SPEC_LIMIT', unit: 'Ω' },
    vgs: { limitValue: 12.0, direction: 'UPPER', source: 'NASA_SPEC_LIMIT', unit: 'V' },
    temp: { limitValue: 210.0, direction: 'UPPER', source: 'NASA_SPEC_LIMIT', unit: '°C' },
  },
  engineeringLimitStatus: 'WITHIN LIMIT',
  aiRisk: 8,
  riskScore: 0.08,
  anomalies: {
    populationAbnormality: false,
    trajectoryAbnormality: false,
    futureRiskPrediction: 'Low (<10%)',
  },
  aiAssessment: {
    overallStatus: 'NOT FLAGGED',
    prediction: {
      status: 'PREDICTED',
      parameters: {
        rdson: {
          predicted168h: 0.602140,
          futureRiskScore: 0.08,
          aiFlag: 'NOT FLAGGED',
        },
      },
    },
    lotAnomaly: {
      overallStatus: 'NOT FLAGGED',
      score: 0.0821,
      method: 'Isolation Forest',
    },
    explanation: {
      framework: 'SHAP (TreeExplainer)',
      targetPrediction: 'Predicted 100% Stage RDS(on)',
      predictedRiskPercent: 8,
      baseValue: 0.5519,
      features: [
        { name: 'RDS33 Checkpoint (Mod B SHAP)', featureValue: '0.540 Ω (Normal)', shapValue: -0.012 },
        { name: 'RDS0 Baseline (Mod B SHAP)', featureValue: '0.512 Ω (Nominal)', shapValue: -0.008 },
        { name: 'ΔRDS(0→33) Drift (Mod A SHAP)', featureValue: '+0.028 Ω (Nominal)', shapValue: 0.150 },
      ],
      summaryText: 'Normal trajectory tightly tracking reference median (0.5519 Ω). Forecast residual 0.007 Ω is well below the 0.165 Ω upper fence.',
    },
  },
  evidence: 'Within Normal Degradation Envelope',
  decision: 'NORMAL',
  status: 'NORMAL',
  modelExplanation: {
    framework: 'SHAP (TreeExplainer)',
    targetPrediction: 'Predicted 100% Stage RDS(on)',
    predictedRiskPercent: 8,
    baseValue: 0.5519,
    features: [
      { name: 'RDS33 Checkpoint (Mod B SHAP)', featureValue: '0.540 Ω (Normal)', shapValue: -0.012 },
      { name: 'RDS0 Baseline (Mod B SHAP)', featureValue: '0.512 Ω (Nominal)', shapValue: -0.008 },
      { name: 'ΔRDS(0→33) Drift (Mod A SHAP)', featureValue: '+0.028 Ω (Nominal)', shapValue: 0.150 },
    ],
    summaryText: 'Normal trajectory tightly tracking reference median (0.5519 Ω). Forecast residual 0.007 Ω is well below the 0.165 Ω upper fence.',
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

    const updated = await ScreeningRecord.findOneAndUpdate(
      { componentId: testScreeningData.componentId },
      { $set: testScreeningData },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log(`Successfully saved test record for ${testScreeningData.componentId} (ID: ${updated._id}).`);

    const count = await ScreeningRecord.countDocuments();
    console.log(`Total screening records in MongoDB: ${count}`);

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB Atlas.');
  } catch (err) {
    console.error('Error seeding test record:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedOneRecord();
}

module.exports = { testScreeningData, seedOneRecord };
