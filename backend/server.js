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
 * Parses uploaded dataset content (.CSV or .JSON) into canonical telemetry structures.
 */
function parseDatasetContent(content, fallbackLotId) {
  if (!content) return [];
  if (Array.isArray(content)) return content;
  if (typeof content === 'object') return [content];

  const text = String(content).trim();
  if (!text) return [];

  // 1. JSON parsing
  if (text.startsWith('[') || text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.map((item) => {
        const compId = item.Test_ID || item.componentId || item.Component_ID || item.id || item.Sample_ID;
        const lot = item.lotId || fallbackLotId;
        const measurements = item.measurements ? { ...item.measurements } : {};

        const rds0 = item.RDS0 ?? item.val0h ?? measurements.rdson?.['0h'] ?? item['0h'] ?? item[0];
        const rds33 = item.RDS33 ?? item.val24h ?? measurements.rdson?.['24h'] ?? item['24h'] ?? item[24];
        if (typeof rds0 === 'number' || typeof rds33 === 'number') {
          measurements.rdson = {
            unit: 'Ω',
            '0h': typeof rds0 === 'number' ? rds0 : null,
            '24h': typeof rds33 === 'number' ? rds33 : null,
          };
        }

        // Generic other parameters in item if present
        ['iddq', 'leakage', 'delay', 'v_th', 'temp', 'freq', 'vgs', 'vds'].forEach((pk) => {
          const v0 = item[`${pk}_0h`] ?? item[`${pk}0`] ?? (item[pk] && typeof item[pk] === 'object' ? item[pk]['0h'] : undefined);
          const v24 = item[`${pk}_24h`] ?? item[`${pk}24`] ?? (item[pk] && typeof item[pk] === 'object' ? item[pk]['24h'] : undefined);
          if (typeof v0 === 'number' || typeof v24 === 'number') {
            const unit = pk.includes('rds') ? 'Ω' : pk.includes('temp') ? '°C' : pk.startsWith('v') ? 'V' : pk.includes('freq') ? 'Hz' : pk === 'iddq' ? 'mA' : pk.includes('leak') ? 'µA' : pk.includes('delay') ? 'ns' : '';
            measurements[pk] = {
              unit,
              '0h': typeof v0 === 'number' ? v0 : null,
              '24h': typeof v24 === 'number' ? v24 : null,
            };
          }
        });

        return {
          componentId: String(compId || '').trim(),
          lotId: String(lot || fallbackLotId || '').trim(),
          stage: item.stage || '24h',
          measurements: Object.keys(measurements).length > 0 ? measurements : undefined,
        };
      }).filter((r) => r.componentId);
    } catch {
      // Fall through to CSV parsing
    }
  }

  // 2. CSV parsing
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));
  const compIdIdx = headers.findIndex((h) => /^(Test_ID|componentId|Component_ID|id|Sample_ID)$/i.test(h));
  const lotIdIdx = headers.findIndex((h) => /^(lotId|Lot_ID|lot)$/i.test(h));
  const rds0Idx = headers.findIndex((h) => /^(RDS0|0h|val0h|rdson_0h|0)$/i.test(h));
  const rds33Idx = headers.findIndex((h) => /^(RDS33|24h|val24h|rdson_24h|24)$/i.test(h));

  const records = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^["']|["']$/g, ''));
    if (cols.length === 0 || !cols[0]) continue;

    const rawCompId = compIdIdx !== -1 ? cols[compIdIdx] : cols[0];
    if (!rawCompId) continue;

    const rowLotId = lotIdIdx !== -1 ? cols[lotIdIdx] : fallbackLotId;
    const v0 = rds0Idx !== -1 ? parseFloat(cols[rds0Idx]) : NaN;
    const v24 = rds33Idx !== -1 ? parseFloat(cols[rds33Idx]) : NaN;

    const measurements = {};
    if (!isNaN(v0) || !isNaN(v24)) {
      measurements.rdson = {
        unit: 'Ω',
        '0h': !isNaN(v0) ? v0 : null,
        '24h': !isNaN(v24) ? v24 : null,
      };
    }

    // Additional parameter column scan
    headers.forEach((h, hIdx) => {
      const match = h.match(/^([a-zA-Z_]+)_(0h|24h|0|24)$/i);
      if (match) {
        const paramBase = match[1].toLowerCase();
        const timepoint = match[2].toLowerCase().includes('0') ? '0h' : '24h';
        const val = parseFloat(cols[hIdx]);
        if (!isNaN(val)) {
          if (!measurements[paramBase]) {
            const unit = paramBase.includes('rds') ? 'Ω' : paramBase.includes('temp') ? '°C' : paramBase.startsWith('v') ? 'V' : paramBase.includes('freq') ? 'Hz' : paramBase === 'iddq' ? 'mA' : paramBase.includes('leak') ? 'µA' : paramBase.includes('delay') ? 'ns' : '';
            measurements[paramBase] = { unit, '0h': null, '24h': null };
          }
          measurements[paramBase][timepoint] = val;
        }
      }
    });

    records.push({
      componentId: String(rawCompId).trim(),
      lotId: String(rowLotId || fallbackLotId).trim(),
      stage: '24h',
      measurements,
    });
  }

  return records;
}

const { detectParametersFromDataset, CANONICAL_PARAM_DEFINITIONS } = require('./utils/datasetParameterDetector');

/**
 * POST /api/screening/detect-parameters
 * Analyzes uploaded dataset structure (ZIP, CSV, JSON, MAT) to extract only the parameters actually present,
 * and attaches lot-specific authoritative database engineering limits where available.
 */
app.post('/api/screening/detect-parameters', upload.single('file'), async (req, res) => {
  try {
    const file = req.file || null;
    const fileName = file?.originalname || req.body?.fileName || '';
    const lotId = req.body?.lotId || '';
    const cleanLotId = typeof lotId === 'string' ? lotId.trim() : '';
    const dataset = req.body?.datasetContent || req.body?.dataset || null;

    // 1. Detect actual parameter keys present in the dataset
    const detectedKeys = detectParametersFromDataset({
      file,
      dataset,
      datasetContent: dataset,
      fileName,
    });

    // 2. Fetch authoritative database limits for the selected lot if available
    let dbLimits = {};
    if (cleanLotId) {
      try {
        const sampleRecord = await ScreeningRecord.findOne({ lotId: cleanLotId }).lean();
        if (sampleRecord?.engineeringLimits && typeof sampleRecord.engineeringLimits === 'object') {
          dbLimits = sampleRecord.engineeringLimits;
        }
      } catch {
        // Fallback gracefully if database lookup fails
      }
    }

    // 3. Build detected parameters list with metadata and authoritative DB status
    const parameters = detectedKeys.map((key) => {
      const canonical = CANONICAL_PARAM_DEFINITIONS[key] || {
        key,
        name: key.toUpperCase(),
        shortName: key,
        unit: '—',
      };

      const dbLim = dbLimits[key];
      let isAuthoritative = false;
      let limitValue = null;
      let direction = 'UPPER';
      let source = 'USER_ENGINEERING_INPUT';

      if (dbLim !== undefined && dbLim !== null) {
        const isDbCatalog = typeof dbLim === 'object'
          ? (String(dbLim.source || '').toUpperCase() === 'DATABASE_CATALOG')
          : true;

        if (isDbCatalog) {
          isAuthoritative = true;
          source = 'DATABASE_CATALOG';
          limitValue = typeof dbLim === 'object'
            ? (dbLim.limitValue ?? dbLim.upper ?? dbLim.lower ?? dbLim.max ?? null)
            : dbLim;
          if (typeof dbLim === 'object' && dbLim.direction) {
            direction = dbLim.direction;
          }
        }
      }

      return {
        key,
        name: canonical.name,
        shortName: canonical.shortName,
        unit: canonical.unit,
        isAuthoritative,
        limitValue: limitValue !== null ? String(limitValue) : '',
        direction,
        source,
      };
    });

    return res.status(200).json({
      success: true,
      lotId: cleanLotId,
      fileName: fileName || file?.originalname || null,
      detectedCount: parameters.length,
      parameters,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'PARAMETER_DETECTION_ERROR',
        message: error.message || 'Failed to detect parameters from the provided dataset',
      },
    });
  }
});

/**
 * POST /api/screening/run
 * Execute full end-to-end screening orchestration flow:
 * Accepts either multipart/form-data (with file, lotId, engineeringLimits, context)
 * or application/json (for programmatic/test invocations).
 */
app.post('/api/screening/run', upload.single('file'), async (req, res) => {
  try {
    const {
      componentId,
      lotId,
      records,
    } = req.body || {};

    let engineeringLimits = req.body?.engineeringLimits;
    if (typeof engineeringLimits === 'string') {
      try {
        engineeringLimits = JSON.parse(engineeringLimits);
      } catch {
        engineeringLimits = {};
      }
    }

    let context = req.body?.context;
    if (typeof context === 'string') {
      try {
        context = JSON.parse(context);
      } catch {
        context = {};
      }
    }

    const file = req.file || null;
    const fileName = file?.originalname || req.body?.fileName || null;
    const fileType = file?.mimetype || req.body?.fileType || null;
    const fileSize = file?.size !== undefined ? file.size : req.body?.fileSize;
    let datasetContent = req.body?.datasetContent || req.body?.dataset;

    // If a text file (CSV/JSON) was uploaded as multipart, extract content if datasetContent not already provided
    if (file && !datasetContent && (file.mimetype?.includes('csv') || file.mimetype?.includes('json') || fileName?.endsWith('.csv') || fileName?.endsWith('.json'))) {
      try {
        datasetContent = file.buffer.toString('utf-8');
      } catch {
        // Retain binary buffer
      }
    }

    const cleanCompId = typeof componentId === 'string' && componentId.trim() ? componentId.trim() : null;
    const cleanLotId = typeof lotId === 'string' && lotId.trim() ? lotId.trim() : null;

    if (!cleanCompId && !cleanLotId) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Either "lotId" or "componentId" is required for screening analysis',
          timestamp: new Date().toISOString(),
        },
      });
    }

    // Validate engineeringLimits format if supplied
    if (engineeringLimits !== undefined && engineeringLimits !== null) {
      if (typeof engineeringLimits !== 'object' || Array.isArray(engineeringLimits)) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Field "engineeringLimits" must be an object containing parameter-specific limits',
            timestamp: new Date().toISOString(),
          },
        });
      }

      for (const [paramKey, limitObj] of Object.entries(engineeringLimits)) {
        if (limitObj !== null && limitObj !== undefined) {
          const val = typeof limitObj === 'object' ? limitObj.limitValue : limitObj;
          if (val !== undefined && val !== null && (typeof val !== 'number' || isNaN(val) || !isFinite(val) || val <= 0)) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'VALIDATION_ERROR',
                message: `Invalid engineering limit value for parameter "${paramKey}"`,
                timestamp: new Date().toISOString(),
              },
            });
          }
        }
      }
    }

    // Ingest dataset records into MongoDB if text dataset supplied with the screening run
    const rawContent = datasetContent || records;
    if (rawContent) {
      const parsedRecords = parseDatasetContent(rawContent, cleanLotId);
      if (parsedRecords && parsedRecords.length > 0) {
        const bulkOps = parsedRecords.map((rec) => ({
          updateOne: {
            filter: { componentId: rec.componentId, lotId: rec.lotId },
            update: { $set: rec },
            upsert: true,
          },
        }));
        await ScreeningRecord.bulkWrite(bulkOps);
      } else if (typeof rawContent === 'string' && rawContent.trim().length > 0) {
        // Content was provided but failed parsing
        const existingCount = cleanLotId ? await ScreeningRecord.countDocuments({ lotId: cleanLotId }) : 0;
        if (existingCount === 0 && !file) {
          return res.status(400).json({
            success: false,
            error: {
              code: 'INVALID_DATASET_FORMAT',
              message: 'Failed to parse valid telemetry records from the provided dataset',
              timestamp: new Date().toISOString(),
            },
          });
        }
      }
    }

    const mergedContext = {
      ...(context && typeof context === 'object' ? context : {}),
      ...(fileName ? { fileName } : {}),
      ...(fileType ? { fileType } : {}),
      ...(fileSize !== undefined ? { fileSize } : {}),
    };

    const result = await runScreeningOrchestration({
      componentId: cleanCompId,
      lotId: cleanLotId,
      customLimits: engineeringLimits,
      context: mergedContext,
      file,
      datasetContent,
      dataset: datasetContent,
      records,
      fileName,
      fileType,
      fileSize,
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
 * GET /api/screening/history
 * Aggregates screening records from MongoDB Atlas by lotId into lot screening runs.
 */
app.get('/api/screening/history', async (req, res) => {
  try {
    const records = await ScreeningRecord.find({}).sort({ updatedAt: -1, createdAt: -1 }).lean();
    if (!records || records.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
      });
    }

    const lotsMap = {};
    for (const rec of records) {
      const lotId = rec.lotId || 'UNKNOWN-LOT';
      if (!lotsMap[lotId]) {
        lotsMap[lotId] = {
          lotId,
          records: [],
          createdAt: rec.createdAt || null,
          updatedAt: rec.updatedAt || rec.createdAt || null,
        };
      }
      lotsMap[lotId].records.push(rec);
      if (rec.updatedAt && (!lotsMap[lotId].updatedAt || new Date(rec.updatedAt) > new Date(lotsMap[lotId].updatedAt))) {
        lotsMap[lotId].updatedAt = rec.updatedAt;
      }
      if (rec.createdAt && (!lotsMap[lotId].createdAt || new Date(rec.createdAt) < new Date(lotsMap[lotId].createdAt))) {
        lotsMap[lotId].createdAt = rec.createdAt;
      }
    }

    const history = Object.values(lotsMap).map((lot) => {
      const totalUnits = lot.records.length;
      const normalCount = lot.records.filter((r) => r.engineeringStatus === 'NORMAL' || r.status === 'NORMAL').length;
      const suspectCount = lot.records.filter((r) => r.engineeringStatus === 'SUSPECT' || r.status === 'SUSPECT').length;
      const criticalCount = lot.records.filter((r) => r.engineeringStatus === 'CRITICAL' || r.status === 'CRITICAL').length;
      const anomalyCount = suspectCount + criticalCount;
      const yieldPct = totalUnits > 0 ? `${((normalCount / totalUnits) * 100).toFixed(1)}%` : '100.0%';

      const hasPredictions = lot.records.some(
        (r) => (r.predictions && Object.keys(r.predictions).length > 0) || r.aiAssessment?.prediction
      );
      const hasAnomalyDet = lot.records.some(
        (r) => r.aiAssessment?.lotAnomaly || r.anomalies || r.engineeringStatus !== undefined
      );

      return {
        lotId: lot.lotId,
        status: totalUnits > 0 ? 'COMPLETED' : 'PENDING',
        totalUnits,
        normalCount,
        anomalyCount,
        yield: yieldPct,
        hasPredictions: hasPredictions || totalUnits > 0,
        hasAnomalyDet: hasAnomalyDet || totalUnits > 0,
        predictionStatus: (hasPredictions || totalUnits > 0) ? 'Available' : 'Pending',
        anomalyStatus: anomalyCount > 0 ? `${anomalyCount} Flagged` : '0 Flagged (Nominal)',
        completedAt: lot.updatedAt || lot.createdAt || null,
      };
    });

    return res.status(200).json({
      success: true,
      count: history.length,
      data: history,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Database Error',
      message: error.message || 'Failed to aggregate lot screening history from MongoDB',
    });
  }
});

/**
 * GET /api/screening/lots
 * Retrieves distinct lot IDs from MongoDB Atlas.
 */
app.get('/api/screening/lots', async (req, res) => {
  try {
    const lots = await ScreeningRecord.distinct('lotId');
    const filteredLots = lots.filter(Boolean);
    return res.status(200).json({
      success: true,
      count: filteredLots.length,
      data: filteredLots,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: 'Database Error',
      message: error.message || 'Failed to retrieve lots list from MongoDB',
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
