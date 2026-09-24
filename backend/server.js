const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
const corsOrigin = process.env.CORS_ORIGIN;
const corsOptions = corsOrigin && corsOrigin.trim() !== '*'
  ? { origin: corsOrigin.split(',').map((o) => o.trim()) }
  : undefined;

app.use(cors(corsOptions));
app.use(express.json({ limit: '2mb' }));

// MongoDB Atlas Connection
if (MONGODB_URI) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      console.log('Connected to MongoDB Atlas successfully');
    })
    .catch((err) => {
      console.error('MongoDB Atlas connection error:', err.message);
    });
} else {
  console.warn('Warning: MONGODB_URI is not defined in environment variables');
}

// AI endpoints (Method 1: Future Prediction, Method 2: Lot Anomaly Detection)
const aiRouter = require('./routes/ai');
app.use('/api/ai', aiRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  const aiServiceStatus = process.env.AI_SERVICE_URL ? 'configured' : 'local_dev_interface';
  res.status(200).json({
    status: 'ok',
    message: 'SPAD backend is running',
    database: dbStatus,
    aiService: aiServiceStatus,
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString()
  });
});

// Screening analysis foundation endpoint (placeholder for future AI integration)
app.post('/api/screening/analyze', (req, res) => {
  try {
    const { componentId, lotId, measurements, parameters, engineeringLimits, specs } = req.body || {};

    // Basic validation for required component identifiers
    if (!componentId || typeof componentId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Missing or invalid "componentId" in request body'
      });
    }

    if (!lotId || typeof lotId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Missing or invalid "lotId" in request body'
      });
    }

    // Dynamic parameter and measurement extraction (no fixed parameter names)
    const paramData = measurements || parameters || {};
    const limitsData = engineeringLimits || specs || {};

    return res.status(200).json({
      success: true,
      message: 'Screening data received successfully for analysis',
      componentId,
      lotId,
      receivedData: {
        parameters: paramData,
        engineeringLimits: limitsData,
        metadata: {
          receivedAt: new Date().toISOString(),
          parameterCount: Object.keys(paramData).length
        }
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Internal Server Error',
      message: error.message || 'An unexpected error occurred while processing screening data'
    });
  }
});

// ============================================================================
// SPAD Screening Data Layer Routes (MongoDB Atlas)
// ============================================================================

const ScreeningRecord = require('./models/ScreeningRecord');
const { runScreeningOrchestration } = require('./services/screeningOrchestrator');

/**
 * POST /api/screening/run
 * Execute full end-to-end screening orchestration flow:
 * Component -> Load Data & Cohort -> Method 1 + Method 2 -> Engineering Status -> Overall AI Status -> Persist -> Return
 */
app.post('/api/screening/run', async (req, res) => {
  try {
    const { componentId, lotId, engineeringLimits, context } = req.body || {};
    const result = await runScreeningOrchestration({
      componentId,
      lotId,
      customLimits: engineeringLimits,
      context,
    });
    return res.status(200).json(result);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      error: {
        code: error.code || 'INTERNAL_ERROR',
        message: error.message || 'An unexpected error occurred during screening orchestration',
        componentId: error.componentId || req.body?.componentId || null,
        lotId: error.lotId || req.body?.lotId || null,
        timestamp: new Date().toISOString(),
      },
    });
  }
});

const { validateAtePayload } = require('./utils/ateValidation');

/**
 * POST /api/screening
 * Ingest / Store an ATE screening record in MongoDB Atlas with mass-assignment protection.
 */
app.post('/api/screening', async (req, res) => {
  try {
    const validation = validateAtePayload(req.body);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: validation.error,
      });
    }

    const { componentId, lotId, stage, measurements, engineeringLimits, context } = req.body;
    const cleanCompId = componentId.trim();
    const cleanLotId = lotId.trim();

    // Mass-assignment protection: Only ingest allowed fields; protected screening fields remain server-authoritative
    const allowedFields = {
      componentId: cleanCompId,
      lotId: cleanLotId,
      ...(typeof stage === 'string' && stage.trim() ? { stage: stage.trim() } : {}),
      ...(measurements && typeof measurements === 'object' ? { measurements } : {}),
      ...(engineeringLimits && typeof engineeringLimits === 'object' ? { engineeringLimits } : {}),
      ...(context && typeof context === 'object' ? { context } : {}),
    };

    // Upsert or save the record to handle repeated/duplicate checkpoint data cleanly
    const savedRecord = await ScreeningRecord.findOneAndUpdate(
      { componentId: cleanCompId, lotId: cleanLotId },
      { $set: allowedFields },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      success: true,
      message: 'Screening record created successfully',
      data: savedRecord,
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Database Error',
      message: error.message || 'Failed to save screening record to MongoDB',
    });
  }
});

/**
 * GET /api/screening
 * Retrieve screening records from MongoDB Atlas with query sanitization.
 */
app.get('/api/screening', async (req, res) => {
  try {
    const { lotId, limit } = req.query;
    const filter = {};
    if (typeof lotId === 'string' && lotId.trim()) {
      filter.lotId = lotId.trim();
    }

    const maxLimit = Math.min(Math.max(parseInt(limit, 10) || 100, 1), 500);
    const records = await ScreeningRecord.find(filter)
      .sort({ createdAt: -1 })
      .limit(maxLimit)
      .lean();

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Database Error',
      message: error.message || 'Failed to retrieve screening records from MongoDB'
    });
  }
});

/**
 * GET /api/screening/:componentId
 * Retrieve the screening record(s) for a specific component with parameter sanitization.
 */
app.get('/api/screening/:componentId', async (req, res) => {
  try {
    const { componentId } = req.params;

    if (!componentId || typeof componentId !== 'string' || !componentId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Parameter "componentId" is required and must be a non-empty string'
      });
    }

    const cleanCompId = componentId.trim();

    // Find the latest screening record for this component
    const record = await ScreeningRecord.findOne({ componentId: cleanCompId })
      .sort({ createdAt: -1 })
      .lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Screening record for component "${cleanCompId}" not found`
      });
    }

    return res.status(200).json({
      success: true,
      data: record
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Database Error',
      message: error.message || 'Failed to retrieve component screening record from MongoDB'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`SPAD backend server running on port ${PORT}`);
});
