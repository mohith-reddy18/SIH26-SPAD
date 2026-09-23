const mongoose = require('mongoose');

/**
 * SPAD Screening Record Schema
 * Supports dynamic parameter measurements, engineering limits, and AI assessment outputs.
 */
const screeningRecordSchema = new mongoose.Schema(
  {
    componentId: {
      type: String,
      required: [true, 'Component ID is required'],
      trim: true,
      index: true,
    },
    lotId: {
      type: String,
      required: [true, 'Lot ID is required'],
      trim: true,
      index: true,
    },
    stage: {
      type: String,
      trim: true,
      default: '96h',
    },
    // Dynamic parameter measurements (e.g., { iddq: [2.0, 2.1, 2.2], leakage: [0.38, 0.40], ... })
    measurements: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Parameter metadata or specifications
    parameters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Predicted/forecasted values from AI analysis (e.g., predicted 168h values)
    predictions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    // Engineering limit definitions & compliance status
    engineeringLimits: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    engineeringLimitStatus: {
      type: String,
      trim: true,
    },
    // AI screening assessment & risk scoring
    aiAssessment: {
      type: String,
      trim: true,
    },
    aiRisk: {
      type: Number,
    },
    riskScore: {
      type: Number,
    },
    // Multi-modal evidence pathways
    anomalies: {
      populationAbnormality: { type: Boolean, default: false },
      trajectoryAbnormality: { type: Boolean, default: false },
      futureRiskPrediction: { type: String },
    },
    evidence: {
      type: String,
      trim: true,
    },
    decision: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      trim: true,
    },
    // Explainability information (e.g., SHAP feature attributions, summary text)
    modelExplanation: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    strict: false, // Allows additional dynamic fields without schema alteration
  }
);

// Compound index for fast queries by lot and component
screeningRecordSchema.index({ lotId: 1, componentId: 1 });

const ScreeningRecord = mongoose.model('ScreeningRecord', screeningRecordSchema);

module.exports = ScreeningRecord;
