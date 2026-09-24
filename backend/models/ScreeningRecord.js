const mongoose = require('mongoose');

/**
 * SPAD Screening Record Schema — Aligned with Final AI Output Contract
 *
 * Canonical Structure:
 * - componentId: Unique component identifier
 * - lotId: Lot / batch identifier
 * - stage: Current screening burn-in stage (e.g., '0h', '24h', '96h', '168h')
 * - measurements: Dynamic physical parameter measurements across timepoints
 * - engineeringLimits: Official engineering specification limits with direction & source
 * - engineeringStatus: Deterministic screening decision ('NORMAL' | 'SUSPECT' | 'CRITICAL')
 * - aiAssessment: Multi-method AI evaluation (overallStatus, prediction, lotAnomaly, explanation)
 */
const screeningRecordSchema = new mongoose.Schema(
  {
    // --- Canonical Identifiers ---
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
      default: '24h',
    },

    // --- Dynamic Parameter Measurements ---
    // Example: { iddq: { unit: 'mA', '0h': 2.0, '24h': 2.1 }, leakage: { unit: 'uA', '0h': 0.4, '24h': 0.5 } }
    measurements: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // --- Official Engineering Specification Limits ---
    // Example: { iddq: { limitValue: 4.0, direction: 'UPPER', source: 'DATABASE_CATALOG' } }
    // Sources: 'SUPPLIED' | 'DATABASE_CATALOG' | 'AI_ESTIMATED_BOUNDARY' | 'NONE_AVAILABLE'
    engineeringLimits: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // --- Deterministic Engineering Status ---
    // Strictly computed from physical measurements + official limits: 'NORMAL' | 'SUSPECT' | 'CRITICAL'
    engineeringStatus: {
      type: String,
      trim: true,
      default: 'NORMAL',
    },

    // --- Canonical AI Assessment Object ---
    // Supports { overallStatus, prediction, lotAnomaly, explanation }
    aiAssessment: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // ========================================================================
    // Legacy Fields (Retained strictly for backward compatibility with existing documents)
    // ========================================================================
    status: {
      type: String,
      trim: true,
    },
    decision: {
      type: String,
      trim: true,
    },
    riskScore: {
      type: Number,
    },
    aiRisk: {
      type: Number,
    },
    engineeringLimitStatus: {
      type: String,
      trim: true,
    },
    anomalies: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    predictions: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    parameters: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    evidence: {
      type: String,
      trim: true,
    },
    modelExplanation: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    strict: false, // Allows additional dynamic fields without schema errors
  }
);

// Compound index for fast queries by lot and component
screeningRecordSchema.index({ lotId: 1, componentId: 1 });

const ScreeningRecord = mongoose.model('ScreeningRecord', screeningRecordSchema);

module.exports = ScreeningRecord;
