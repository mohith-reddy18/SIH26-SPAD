const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors());
app.use(express.json());

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
  res.status(200).json({
    status: 'ok',
    message: 'SPAD backend is running',
    database: dbStatus,
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

/**
 * POST /api/screening
 * Store a screening record in MongoDB Atlas.
 */
app.post('/api/screening', async (req, res) => {
  try {
    const { componentId, lotId } = req.body || {};

    // Validate required fields
    if (!componentId || typeof componentId !== 'string' || !componentId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Field "componentId" is required and must be a non-empty string'
      });
    }

    if (!lotId || typeof lotId !== 'string' || !lotId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Field "lotId" is required and must be a non-empty string'
      });
    }

    // Create and save the screening record
    const newRecord = new ScreeningRecord(req.body);
    const savedRecord = await newRecord.save();

    return res.status(201).json({
      success: true,
      message: 'Screening record created successfully',
      data: savedRecord
    });
  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Database Error',
      message: error.message || 'Failed to save screening record to MongoDB'
    });
  }
});

/**
 * GET /api/screening
 * Retrieve screening records from MongoDB Atlas (supports optional lotId filter).
 */
app.get('/api/screening', async (req, res) => {
  try {
    const { lotId, limit } = req.query;
    const filter = {};
    if (lotId) filter.lotId = lotId;

    const maxLimit = parseInt(limit, 10) || 100;
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
 * Retrieve the screening record(s) for a specific component.
 */
app.get('/api/screening/:componentId', async (req, res) => {
  try {
    const { componentId } = req.params;

    if (!componentId) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Parameter "componentId" is required'
      });
    }

    // Find the latest screening record for this component
    const record = await ScreeningRecord.findOne({ componentId })
      .sort({ createdAt: -1 })
      .lean();

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Screening record for component "${componentId}" not found`
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
