const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;

// Comprehensive CORS Configuration
const allowedOrigins = [
  'https://sih-26-spad.vercel.app',
  'https://sih26-spad.vercel.app',
  'http://localhost:5173',
  'http://localhost:5000',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5000',
];

const corsOriginEnv = process.env.CORS_ORIGIN;
const isOriginAllowed = (origin) => {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  if (origin.endsWith('.vercel.app') || origin.endsWith('.onrender.com')) return true;
  if (process.env.NODE_ENV !== 'production') return true;
  if (corsOriginEnv) {
    const envOrigins = corsOriginEnv.split(',').map((o) => o.trim());
    if (envOrigins.includes(origin)) return true;
  }
  return false;
};

const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Run-ID', 'x-run-id', 'Accept', 'Origin', 'Cache-Control', 'X-Requested-With'],
  exposedHeaders: ['X-Run-ID', 'x-run-id', 'Content-Disposition'],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));

// Explicit fallback header injection to guarantee CORS headers on all responses (including errors, timeouts & preflights)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (isOriginAllowed(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin || 'https://sih-26-spad.vercel.app');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Run-ID, x-run-id, Accept, Origin, Cache-Control, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', 'X-Run-ID, x-run-id, Content-Disposition');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: '2mb' }));

// Streamed disk storage for uploaded datasets (avoids Node RAM exhaustion for multi-GB files)
const uploadDir = path.join(os.tmpdir(), 'spad-uploads');
try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch {
  // Directory initialized on demand
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      cb(null, uploadDir);
    } catch (err) {
      cb(err);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safeExt = path.extname(file.originalname || '') || '';
    cb(null, `spad-${uniqueSuffix}${safeExt}`);
  },
});

// Multer without arbitrary application-level fileSize limits (streamed safely to disk)
const upload = multer({
  storage: diskStorage,
});

/**
 * Express middleware wrapper for multer single-file streaming upload with robust error handling.
 */
function handleUploadSingle(fieldName) {
  const uploadMiddleware = upload.single(fieldName);
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UPLOAD_ERROR',
            message: `Upload error: ${err.message}`,
            timestamp: new Date().toISOString(),
          },
        });
      } else if (err) {
        const isStorageError = err.code === 'ENOSPC' || err.code === 'EACCES';
        const statusCode = isStorageError ? 507 : 400;
        return res.status(statusCode).json({
          success: false,
          error: {
            code: isStorageError ? 'INSUFFICIENT_STORAGE' : 'UPLOAD_ERROR',
            message: isStorageError
              ? 'Server storage capacity exceeded while streaming uploaded dataset.'
              : (err.message || 'File upload failed'),
            timestamp: new Date().toISOString(),
          },
        });
      }
      next();
    });
  };
}

/**
 * Helper to safely clean up temporary upload files from disk.
 */
function cleanupTempFile(filePath) {
  if (filePath && typeof filePath === 'string') {
    fs.unlink(filePath, () => {});
  }
}

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
        const lot = fallbackLotId || item.lotId;
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

    const rowLotId = fallbackLotId || (lotIdIdx !== -1 ? cols[lotIdIdx] : fallbackLotId);
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
 * Inspects file stream/headers on disk without loading multi-GB into Node RAM.
 */
app.post('/api/screening/detect-parameters', handleUploadSingle('file'), async (req, res) => {
  const file = req.file || null;
  const tempFilePath = file?.path;

  try {
    const fileName = file?.originalname || req.body?.fileName || '';
    const lotId = req.body?.lotId || '';
    const cleanLotId = typeof lotId === 'string' ? lotId.trim() : '';
    const dataset = req.body?.datasetContent || req.body?.dataset || null;

    // 1. Detect actual parameter keys present in the dataset (strictly from CSV/JSON headers or ZIP contents)
    const detectedResult = detectParametersFromDataset({
      file,
      filePath: tempFilePath,
      dataset,
      datasetContent: dataset,
      fileName,
    });
    const detectedKeys = Array.isArray(detectedResult) ? detectedResult : (detectedResult.detectedKeys || []);
    const formatStatus = detectedResult.formatStatus || (detectedKeys.length > 0 ? 'DETECTED' : 'NO_PARAMETERS_FOUND');
    const message = detectedResult.message || '';

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
      formatStatus,
      message,
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
  } finally {
    cleanupTempFile(tempFilePath);
  }
});

// Active Screening Runs Registry for Force Stop and Job Lifecycle Management
const activeScreeningRuns = new Map();

/**
 * POST /api/screening/stop
 * Force stop an active screening analysis run, terminate Python/Node processing, and clean up temporary files.
 */
app.post(['/api/screening/stop', '/api/screening/stop/:runId', '/api/screening/run/stop'], async (req, res) => {
  try {
    const runId = req.params?.runId || req.body?.runId || req.headers['x-run-id'];
    const lotId = req.body?.lotId;

    let targetRun = null;
    let targetRunId = null;

    if (runId && activeScreeningRuns.has(runId)) {
      targetRun = activeScreeningRuns.get(runId);
      targetRunId = runId;
    } else if (lotId) {
      for (const [id, run] of activeScreeningRuns.entries()) {
        if (run.lotId === lotId) {
          targetRun = run;
          targetRunId = id;
          break;
        }
      }
    }

    if (targetRun) {
      if (targetRun.abortController && !targetRun.abortController.signal.aborted) {
        targetRun.abortController.abort();
      }
      if (targetRun.tempFilePath) {
        cleanupTempFile(targetRun.tempFilePath);
      }
      if (process.env.AI_SERVICE_URL && process.env.AI_SERVICE_URL.trim()) {
        try {
          fetch(`${process.env.AI_SERVICE_URL.replace(/\/+$/, '')}/cancel-screening`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ runId: targetRunId, lotId: targetRun.lotId }),
            signal: AbortSignal.timeout(3000),
          }).catch(() => {});
        } catch {
          // Non-blocking best-effort Python cancel notification
        }
      }
      activeScreeningRuns.delete(targetRunId);

      return res.status(200).json({
        success: true,
        message: 'Screening analysis forcefully stopped',
        runId: targetRunId,
        lotId: targetRun.lotId,
        timestamp: new Date().toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      message: 'No active screening analysis found for the specified run/lot or run already completed',
      runId: runId || null,
      lotId: lotId || null,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: {
        code: 'STOP_FAILED',
        message: error.message || 'Failed to stop screening analysis',
        timestamp: new Date().toISOString(),
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
app.post('/api/screening/run', handleUploadSingle('file'), async (req, res) => {
  const file = req.file || null;
  const tempFilePath = file?.path;
  const runId = req.headers['x-run-id'] || req.body?.runId || `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const runAbortController = new AbortController();

  try {
    // Validate uploaded dataset format: accept only .csv and .zip
    if (file) {
      const lowerName = (file.originalname || '').toLowerCase();
      const isValid = lowerName.endsWith('.csv') || lowerName.endsWith('.zip');
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'UNSUPPORTED_FILE_FORMAT',
            message: 'Uploaded dataset must be a .CSV or .ZIP file.',
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

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

    const fileName = file?.originalname || req.body?.fileName || null;
    const fileType = file?.mimetype || req.body?.fileType || null;
    const fileSize = file?.size !== undefined ? file.size : req.body?.fileSize;
    let datasetContent = req.body?.datasetContent || req.body?.dataset;

    // If small text file (< 5MB) was uploaded as multipart, extract content for MongoDB ingestion
    if (file && !datasetContent && file.size < 5 * 1024 * 1024 && (file.mimetype?.includes('csv') || file.mimetype?.includes('json') || fileName?.endsWith('.csv') || fileName?.endsWith('.json'))) {
      try {
        if (file.path && fs.existsSync(file.path)) {
          datasetContent = fs.readFileSync(file.path, 'utf-8');
        } else if (file.buffer) {
          datasetContent = file.buffer.toString('utf-8');
        }
      } catch {
        // Retain file stream
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

    // Register active run for tracking and Force Stop propagation
    activeScreeningRuns.set(runId, {
      runId,
      lotId: cleanLotId,
      componentId: cleanCompId,
      tempFilePath,
      abortController: runAbortController,
      startedAt: new Date().toISOString(),
    });

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
      signal: runAbortController.signal,
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
  } finally {
    activeScreeningRuns.delete(runId);
    cleanupTempFile(tempFilePath);
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
    const rawRecords = await ScreeningRecord.find(filter)
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(maxLimit * 2)
      .lean();

    // Deduplicate by componentId (or lotId + componentId if no lotId filter), prioritizing evaluated records with aiAssessment
    const dedupedMap = new Map();
    for (const rec of rawRecords) {
      const key = filter.lotId ? rec.componentId : `${rec.lotId || ''}__${rec.componentId}`;
      const hasAi = Boolean(
        rec.aiAssessment &&
        typeof rec.aiAssessment === 'object' &&
        Object.keys(rec.aiAssessment).length > 0 &&
        (rec.aiAssessment.overallStatus || rec.aiAssessment.prediction || rec.aiAssessment.lotAnomaly)
      );

      if (!dedupedMap.has(key)) {
        dedupedMap.set(key, rec);
      } else {
        const existing = dedupedMap.get(key);
        const existingHasAi = Boolean(
          existing.aiAssessment &&
          typeof existing.aiAssessment === 'object' &&
          Object.keys(existing.aiAssessment).length > 0 &&
          (existing.aiAssessment.overallStatus || existing.aiAssessment.prediction || existing.aiAssessment.lotAnomaly)
        );
        if (hasAi && !existingHasAi) {
          dedupedMap.set(key, rec);
        }
      }
    }

    const records = Array.from(dedupedMap.values()).slice(0, maxLimit);

    // Diagnostic logging for TEST-06 in list retrieval
    const test06 = records.find((r) => r.componentId === 'TEST-06');
    if (test06) {
      const hasAi = Boolean(
        test06.aiAssessment &&
        typeof test06.aiAssessment === 'object' &&
        Object.keys(test06.aiAssessment).length > 0 &&
        (test06.aiAssessment.overallStatus || test06.aiAssessment.prediction || test06.aiAssessment.lotAnomaly)
      );
      const predsEmpty = !test06.predictions || Object.keys(test06.predictions).length === 0;
      const paramsEmpty = !test06.parameters || Object.keys(test06.parameters).length === 0;
      const anomEmpty = !test06.anomalies || Object.keys(test06.anomalies).length === 0;
      console.log(`[SPAD Diagnostic TEST-06 List] componentId: ${test06.componentId} | lotId: ${test06.lotId} | _id: ${test06._id} | createdAt: ${test06.createdAt} | updatedAt: ${test06.updatedAt} | hasAiAssessment: ${hasAi} | legacyEmpty(preds/params/anom): ${predsEmpty}/${paramsEmpty}/${anomEmpty}`);
    }

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
 * Supports optional lotId query parameter for lot-scoped queries.
 */
app.get('/api/screening/:componentId', async (req, res) => {
  try {
    const { componentId } = req.params;
    const { lotId } = req.query;

    if (!componentId || typeof componentId !== 'string' || !componentId.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Validation Error',
        message: 'Parameter "componentId" is required and must be a non-empty string'
      });
    }

    const cleanCompId = componentId.trim();
    const cleanLotId = (typeof lotId === 'string' && lotId.trim()) ? lotId.trim() : null;

    const query = { componentId: cleanCompId };
    if (cleanLotId) {
      query.lotId = cleanLotId;
    }

    // 1. Prefer evaluated record with aiAssessment (overallStatus / prediction / lotAnomaly)
    let record = await ScreeningRecord.findOne({
      ...query,
      $or: [
        { 'aiAssessment.overallStatus': { $exists: true, $ne: null } },
        { 'aiAssessment.prediction': { $exists: true, $ne: null } },
      ],
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .lean();

    // 2. Fallback to latest record matching query if no evaluated record exists yet
    if (!record) {
      record = await ScreeningRecord.findOne(query)
        .sort({ updatedAt: -1, createdAt: -1 })
        .lean();
    }

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Screening record for component "${cleanCompId}"${cleanLotId ? ` in lot "${cleanLotId}"` : ''} not found`
      });
    }

    const hasAiAssessment = Boolean(
      record.aiAssessment &&
      typeof record.aiAssessment === 'object' &&
      Object.keys(record.aiAssessment).length > 0 &&
      (record.aiAssessment.overallStatus || record.aiAssessment.prediction || record.aiAssessment.lotAnomaly)
    );

    const predsEmpty = !record.predictions || Object.keys(record.predictions).length === 0;
    const paramsEmpty = !record.parameters || Object.keys(record.parameters).length === 0;
    const anomEmpty = !record.anomalies || Object.keys(record.anomalies).length === 0;

    // Diagnostic logging showing required fields
    console.log(`[SPAD Diagnostic TEST-06 Single] componentId: ${cleanCompId} | requested lotId: ${cleanLotId || '(none)'} | selected lotId: ${record.lotId || '(unknown)'} | _id: ${record._id} | createdAt: ${record.createdAt || '(none)'} | updatedAt: ${record.updatedAt || record.createdAt || '(none)'} | hasAiAssessment: ${hasAiAssessment} | legacyEmpty(preds/params/anom): ${predsEmpty}/${paramsEmpty}/${anomEmpty}`);

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

// 404 Handler for unmatched API routes
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
      timestamp: new Date().toISOString(),
    },
  });
});

// Global Error-Handling Middleware (ensures consistent JSON and CORS headers on any unhandled error)
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || (err.status >= 400 && err.status < 600 ? err.status : 500);
  const errorCode = err.code || (statusCode === 400 ? 'BAD_REQUEST' : 'INTERNAL_ERROR');
  const message = err.message || 'An unexpected internal server error occurred';

  if (res.headersSent) {
    return next(err);
  }

  return res.status(statusCode).json({
    success: false,
    error: {
      code: errorCode,
      message,
      timestamp: new Date().toISOString(),
    },
  });
});

// Start server with long-connection & large-file transfer support on all interfaces for Render
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`SPAD backend server successfully bound to http://0.0.0.0:${PORT} (process.env.PORT=${process.env.PORT || 'default 5000'})`);
  let parsedHost = 'none';
  if (process.env.AI_SERVICE_URL && process.env.AI_SERVICE_URL.trim()) {
    try {
      parsedHost = new URL(process.env.AI_SERVICE_URL).hostname;
    } catch {
      parsedHost = 'invalid-url';
    }
  }
  console.log(`AI_SERVICE_URL configured: ${Boolean(process.env.AI_SERVICE_URL && process.env.AI_SERVICE_URL.trim())}`);
  console.log(`AI_SERVICE_URL host: ${parsedHost}`);
});

// Configure server socket timeouts to prevent premature termination during multi-GB dataset transfers
server.requestTimeout = 0; // Disable automatic 5-minute request timeout for large dataset streaming
server.timeout = 0; // Disable idle socket timeout
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
