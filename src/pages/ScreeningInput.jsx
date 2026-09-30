import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ScreeningInput.css';
import { API_BASE_URL } from '../config/api';

/**
 * Standard complete selectable parameters supported by the SPAD data layer
 * 6 Default parameters used in last NASA-MOSFET screening test + optional parameters available via Add Parameters
 */
const CANONICAL_PARAMETERS = [
  // 1. On-Resistance (RDS(on)) — Limit: 1.00 Ω
  { key: 'rdson', name: 'On-Resistance (RDS(on))', shortName: 'RDS(on)', unit: 'Ω', defaultLimit: '1.00', direction: 'UPPER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  // 2. Chamber Temperature — Operating condition: 199–200 °C
  { key: 'temp', name: 'Chamber Temperature', shortName: 'T_j', unit: '°C', defaultLimit: '200', direction: 'UPPER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  // 3. Gate-Source Voltage (VGS) — Test value: 10 V
  { key: 'vgs', name: 'Gate-Source Voltage (VGS)', shortName: 'VGS', unit: 'V', defaultLimit: '10', direction: 'UPPER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  // 4. Drain-Source Voltage (VDS) — Test value: 5 V
  { key: 'vds', name: 'Drain-Source Voltage (VDS)', shortName: 'VDS', unit: 'V', defaultLimit: '5', direction: 'UPPER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  // 5. Switching Frequency (fSW) — Test value: 1000 Hz
  { key: 'freq', name: 'Switching Frequency (fSW)', shortName: 'fSW', unit: 'Hz', defaultLimit: '1000', direction: 'UPPER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  // 6. Duty Cycle — Test value: 40 %
  { key: 'dutyCycle', name: 'Duty Cycle', shortName: 'Duty', unit: '%', defaultLimit: '40', direction: 'UPPER', source: 'SUPPLIED', isAuthoritative: false },
  // Optional parameters available through "Add Parameters"
  { key: 'v_th', name: 'Threshold Voltage (V_th)', shortName: 'V_th', unit: 'V', defaultLimit: '1.20', direction: 'LOWER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  { key: 'iddq', name: 'Standby Current (Iddq)', shortName: 'Iddq', unit: 'mA', defaultLimit: '2.80', direction: 'UPPER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  { key: 'leakage', name: 'Leakage Current (I_leak)', shortName: 'I_leak', unit: 'µA', defaultLimit: '0.80', direction: 'UPPER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  { key: 'delay', name: 'Propagation Delay (t_pd)', shortName: 't_pd', unit: 'ns', defaultLimit: '15.00', direction: 'UPPER', source: 'DATABASE_CATALOG', isAuthoritative: true },
  { key: 'delta_rdson', name: 'Early Drift ΔRDS(0→33)', shortName: 'ΔRDS', unit: 'Ω', defaultLimit: '0.08', direction: 'UPPER', source: 'SUPPLIED', isAuthoritative: false },
];

const DEFAULT_PARAMETER_KEYS = ['rdson', 'temp', 'vgs', 'vds', 'freq', 'dutyCycle'];

/**
 * Returns only the default 6 parameters used in the NASA-MOSFET screening test
 */
function getInitialParameterLimits() {
  return DEFAULT_PARAMETER_KEYS.map((key) => {
    const p = CANONICAL_PARAMETERS.find((param) => param.key === key);
    return {
      key: p.key,
      name: p.name,
      shortName: p.shortName,
      unit: p.unit,
      limitValue: p.defaultLimit,
      direction: p.direction || 'UPPER',
      source: p.source || 'DATABASE_CATALOG',
      isAuthoritative: p.isAuthoritative ?? true,
    };
  });
}

/**
 * Format bytes to human readable string (KB / MB / GB)
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default function ScreeningInput({ onNavigate, onSelectLot, selectedLotId, onRefreshHistory }) {
  // 1. File Upload State
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileContent, setFileContent] = useState(null);
  const [fileInsights, setFileInsights] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileError, setFileError] = useState(null);
  const fileInputRef = useRef(null);

  // 2. Lot ID & Parameter Limits State (prefilled immediately on mount with complete limits)
  const [lotId, setLotId] = useState(selectedLotId || 'NASA-MOSFET-199C');
  const [parameterLimits, setParameterLimits] = useState(getInitialParameterLimits);
  const [selectedAddParamKey, setSelectedAddParamKey] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // 3. Execution & Processing State
  const [runStatus, setRunStatus] = useState('IDLE'); // 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'ERROR'
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);
  const activeAbortControllerRef = useRef(null);
  const activeRunIdRef = useRef(null);

  /**
   * Fetch authoritative engineering limits from database catalog for selected lot if present
   */
  const loadAuthoritativeLimits = useCallback(async (targetLotId) => {
    if (!targetLotId || !targetLotId.trim()) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/screening?lotId=${encodeURIComponent(targetLotId.trim())}&limit=1`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const sample = json.data[0];
          const dbLimits = sample.engineeringLimits || {};
          
          if (Object.keys(dbLimits).length > 0) {
            setParameterLimits((prev) => {
              return prev.map((param) => {
                const dbLim = dbLimits[param.key];
                if (dbLim !== undefined && dbLim !== null) {
                  const limVal = typeof dbLim === 'number' ? dbLim : (dbLim?.limitValue ?? dbLim?.upper ?? dbLim?.max ?? param.limitValue);
                  const isAuth = typeof dbLim === 'object' ? (String(dbLim.source || '').toUpperCase() === 'DATABASE_CATALOG') : true;
                  return {
                    ...param,
                    limitValue: String(limVal),
                    source: isAuth ? 'DATABASE_CATALOG' : (dbLim?.source || param.source),
                    isAuthoritative: isAuth,
                  };
                }
                return param;
              });
            });
          }
        }
      }
    } catch {
      // Retain prefilled default limits if database query is not available
    }
  }, []);

  useEffect(() => {
    if (lotId) {
      loadAuthoritativeLimits(lotId);
    }
  }, [lotId, loadAuthoritativeLimits]);

  /**
   * Safe file parser for preview insights (does not mutate or filter engineering limits)
   */
  const processSelectedFile = useCallback((file) => {
    setFileError(null);
    setRunError(null);
    setRunStatus('IDLE');

    if (!file) {
      setSelectedFile(null);
      setFileContent(null);
      setFileInsights(null);
      return;
    }

    const fileName = file.name.toLowerCase();
    const isValidExt = fileName.endsWith('.csv') || fileName.endsWith('.zip');

    if (!isValidExt) {
      setFileError('Unsupported file format. Please upload a .CSV or .ZIP dataset file.');
      setSelectedFile(null);
      setFileContent(null);
      setFileInsights(null);
      return;
    }

    if (file.size === 0) {
      setFileError('The selected file is empty (0 bytes). Please provide a valid telemetry dataset.');
      setSelectedFile(null);
      setFileContent(null);
      setFileInsights(null);
      return;
    }

    setSelectedFile(file);

    // Read preview content for small CSV files
    if (fileName.endsWith('.csv')) {
      if (file.size <= 5 * 1024 * 1024) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const text = e.target.result;
          setFileContent(text);

          try {
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            const rowCount = Math.max(0, lines.length - 1);
            setFileInsights({
              type: 'CSV Telemetry',
              unitsDetected: `${rowCount} rows`,
              status: 'Ready for Analysis',
            });
          } catch {
            setFileInsights({
              type: 'CSV',
              unitsDetected: '—',
              status: 'Ready for Analysis',
            });
          }
        };
        reader.onerror = () => {
          setFileError('Failed to read file from local disk.');
        };
        reader.readAsText(file);
      } else {
        setFileContent(null);
        setFileInsights({
          type: 'CSV Telemetry',
          unitsDetected: 'Streaming Telemetry',
          status: 'Ready for Analysis',
        });
      }
    } else {
      // .ZIP Archive
      setFileContent(null);
      setFileInsights({
        type: 'NASA Dataset Archive (.ZIP)',
        unitsDetected: 'Multi-file Archive',
        status: 'Ready for Analysis',
      });
    }
  }, []);

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setFileContent(null);
    setFileInsights(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Parameter Limit Table Handlers — User can freely edit values
   */
  const handleLimitValueChange = (index, value) => {
    setParameterLimits((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        limitValue: value,
        source: 'USER_ENGINEERING_INPUT',
      };
      return next;
    });

    if (formErrors[`limit_${index}`]) {
      setFormErrors((prev) => ({ ...prev, [`limit_${index}`]: null }));
    }
  };

  const handleRemoveParameter = (index) => {
    setParameterLimits((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddParameter = (paramKey) => {
    const canonical = CANONICAL_PARAMETERS.find((p) => p.key === paramKey);
    if (!canonical) return;

    if (parameterLimits.some((p) => p.key === paramKey)) return;

    setParameterLimits((prev) => [
      ...prev,
      {
        key: canonical.key,
        name: canonical.name,
        shortName: canonical.shortName,
        unit: canonical.unit,
        limitValue: canonical.defaultLimit,
        direction: canonical.direction || 'UPPER',
        source: 'USER_ENGINEERING_INPUT',
        isAuthoritative: false,
      },
    ]);
    setSelectedAddParamKey('');
  };

  const handleResetDefaultLimits = () => {
    setParameterLimits(getInitialParameterLimits());
  };

  /**
   * Validate all engineering inputs before dispatch
   */
  const validateInputs = () => {
    const errors = {};

    if (!selectedFile) {
      errors.file = 'A screening dataset (.CSV or .ZIP) is required.';
    }

    if (!lotId || !lotId.trim()) {
      errors.lotId = 'Lot ID is required.';
    }

    if (parameterLimits.length === 0) {
      errors.general = 'At least one engineering parameter limit must be configured.';
    }

    parameterLimits.forEach((param, idx) => {
      const num = parseFloat(param.limitValue);
      if (isNaN(num) || !isFinite(num) || num <= 0) {
        errors[`limit_${idx}`] = `Valid numeric limit required for ${param.shortName || param.name}`;
      }
    });

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  /**
   * Primary Action: Execute Screening Run with complete engineeringLimits payload
   */
  const handleRunScreening = async () => {
    setRunError(null);

    if (!validateInputs()) {
      return;
    }

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    activeRunIdRef.current = runId;
    const abortController = new AbortController();
    activeAbortControllerRef.current = abortController;

    setRunStatus('PROCESSING');

    try {
      const cleanLotId = lotId.trim();

      // Build parameter-specific engineering limits map containing all configured limits
      const engineeringLimits = {};
      parameterLimits.forEach((param) => {
        const num = parseFloat(param.limitValue);
        const rawDir = String(param.direction || 'UPPER').toUpperCase();
        const safeDir = (rawDir === 'LOWER' || rawDir === 'MIN') ? 'LOWER' : 'UPPER';
        engineeringLimits[param.key] = {
          limitValue: isNaN(num) ? 0 : num,
          unit: param.unit,
          direction: safeDir,
          source: param.source || (param.isAuthoritative ? 'DATABASE_CATALOG' : 'USER_ENGINEERING_INPUT'),
        };
      });

      const contextData = {
        fileName: selectedFile.name,
        fileType: selectedFile.type || (selectedFile.name.endsWith('.zip') ? 'application/zip' : 'text/csv'),
        fileSize: selectedFile.size,
        submittedAt: new Date().toISOString(),
        parametersConfigured: parameterLimits.map((p) => p.key),
      };

      // Construct multipart/form-data payload preserving the original uploaded file
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('lotId', cleanLotId);
      formData.append('runId', runId);
      formData.append('engineeringLimits', JSON.stringify(engineeringLimits));
      formData.append('context', JSON.stringify(contextData));

      const response = await fetch(`${API_BASE_URL}/api/screening/run`, {
        method: 'POST',
        headers: {
          'X-Run-ID': runId,
        },
        body: formData,
        signal: abortController.signal,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        if (response.status === 499 || data.error?.code === 'SCREENING_ABORTED') {
          setRunStatus('IDLE');
          setRunResult(null);
          setRunError('SCREENING ANALYSIS STOPPED — Run cancelled by operator.');
          return;
        }
        throw new Error(data.error?.message || data.message || `Server returned HTTP ${response.status}`);
      }

      setRunResult(data);
      setRunStatus('COMPLETED');

      // Update active lot in parent state & refresh history
      if (onSelectLot) {
        onSelectLot(cleanLotId);
      }
      if (onRefreshHistory) {
        onRefreshHistory();
      }
    } catch (err) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        setRunStatus('IDLE');
        setRunResult(null);
        setRunError('SCREENING ANALYSIS STOPPED — Run cancelled by operator.');
        return;
      }
      setRunError(err.message || 'An error occurred during screening analysis.');
      setRunStatus('ERROR');
    } finally {
      activeAbortControllerRef.current = null;
      activeRunIdRef.current = null;
    }
  };

  /**
   * Explicit FORCE STOP handler to cancel client request and tell backend to terminate running jobs
   */
  const handleForceStop = async () => {
    const currentRunId = activeRunIdRef.current;
    const cleanLotId = lotId?.trim();

    // 1. Immediately abort active browser fetch
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    // 2. Return UI to idle state immediately with stopped notification
    setRunStatus('IDLE');
    setRunResult(null);
    setRunError('SCREENING ANALYSIS STOPPED — Run cancelled by operator.');

    // 3. Notify backend to terminate server-side process and clean up temporary files
    try {
      await fetch(`${API_BASE_URL}/api/screening/stop`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(currentRunId ? { 'X-Run-ID': currentRunId } : {}),
        },
        body: JSON.stringify({
          runId: currentRunId || undefined,
          lotId: cleanLotId || undefined,
        }),
      });
    } catch (err) {
      console.warn('Backend stop notification note:', err);
    }
  };

  const availableParamsToAdd = CANONICAL_PARAMETERS.filter(
    (c) => !parameterLimits.some((p) => p.key === c.key)
  );

  return (
    <div className="spad-page-container spad-screening-input-page">
      {/* 1. Technical Header */}
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">SCREENING INPUT</h1>
          <span className="spad-page-tag">ML INFERENCE ENGINE</span>
        </div>
        <p className="spad-page-description">
          Upload telemetry screening datasets and configure parameter-specific engineering boundary limits to execute automated Random Forest trajectory forecasting and Isolation Forest lot anomaly detection.
        </p>
      </header>

      {/* 2. Side-by-Side Two Panel Layout */}
      <div className="spad-screening-grid">
        {/* ================================================================
            LEFT PANEL: DATASET INPUT
            ================================================================ */}
        <section className="spad-input-panel" aria-label="Dataset Input Panel">
          <div className="spad-panel-header">
            <div className="spad-panel-title-group">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
              <h2 className="spad-panel-title">DATASET INPUT</h2>
            </div>
            <span className="spad-panel-badge">.CSV | .ZIP</span>
          </div>

          <div className="spad-dropzone-wrapper">
            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".csv,.zip,text/csv,application/zip,application/x-zip-compressed"
              style={{ display: 'none' }}
              id="spad-dataset-file-input"
            />

            {!selectedFile ? (
              /* Empty Dropzone State */
              <div
                className={`spad-upload-dropzone ${isDragging ? 'dragging' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    fileInputRef.current?.click();
                  }
                }}
                aria-label="Upload screening dataset"
              >
                <div className="spad-dropzone-icon-box">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="spad-dropzone-primary-text">
                  Drag and drop screening telemetry dataset here
                </div>
                <div className="spad-dropzone-subtext">
                  or click anywhere inside this dropzone to browse local files
                </div>

                <div className="spad-format-chips">
                  <span className="spad-format-chip">.CSV</span>
                  <span className="spad-format-chip">.ZIP</span>
                </div>
              </div>
            ) : (
              /* Selected File Summary Card */
              <div className="spad-file-summary-card">
                <div className="spad-file-card-top">
                  <div className="spad-file-info-group">
                    <div className="spad-file-icon-box">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    </div>
                    <div className="spad-file-details">
                      <div className="spad-file-name" title={selectedFile.name}>
                        {selectedFile.name}
                      </div>
                      <div className="spad-file-meta">
                        <span>{formatFileSize(selectedFile.size)}</span>
                        <span>•</span>
                        <span>{selectedFile.type || 'Telemetry Dataset'}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="spad-file-clear-btn"
                    onClick={handleClearFile}
                    aria-label="Remove selected file"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                    <span>Remove</span>
                  </button>
                </div>

                {/* File Insights */}
                {fileInsights && (
                  <div className="spad-file-insights">
                    <div className="spad-insight-stat">
                      <span className="spad-insight-label">Type</span>
                      <span className="spad-insight-value">{fileInsights.type}</span>
                    </div>
                    <div className="spad-insight-stat">
                      <span className="spad-insight-label">Size / Count</span>
                      <span className="spad-insight-value">{fileInsights.unitsDetected}</span>
                    </div>
                    <div className="spad-insight-stat">
                      <span className="spad-insight-label">Status</span>
                      <span className="spad-insight-value" style={{ color: 'var(--spad-green, #22C55E)' }}>
                        {fileInsights.status}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {fileError && <div className="spad-field-error-msg">{fileError}</div>}
            {formErrors.file && !fileError && (
              <div className="spad-field-error-msg">{formErrors.file}</div>
            )}
          </div>
        </section>

        {/* ================================================================
            RIGHT PANEL: ENGINEERING INPUT (Complete Prefilled Limits)
            ================================================================ */}
        <section className="spad-input-panel" aria-label="Engineering Input Panel">
          <div className="spad-panel-header">
            <div className="spad-panel-title-group">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <h2 className="spad-panel-title">ENGINEERING INPUT</h2>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                type="button"
                onClick={handleResetDefaultLimits}
                className="spad-view-all-btn"
                title="Reset all limits to catalog defaults"
              >
                Reset Defaults
              </button>
              <span className="spad-panel-badge green">PARAMETER LIMITS</span>
            </div>
          </div>

          <div className="spad-eng-form">
            {/* 1. Lot ID Field */}
            <div className="spad-form-field">
              <div className="spad-field-label-row">
                <label htmlFor="spad-lot-id" className="spad-field-label">
                  LOT ID <span className="required">*</span>
                </label>
                <span className="spad-field-tag">COHORT IDENTIFIER</span>
              </div>
              <input
                id="spad-lot-id"
                type="text"
                className={`spad-input-control ${formErrors.lotId ? 'error' : ''}`}
                value={lotId}
                onChange={(e) => {
                  const newLotId = e.target.value;
                  setLotId(newLotId);
                  if (formErrors.lotId) {
                    setFormErrors((prev) => ({ ...prev, lotId: null }));
                  }
                }}
                placeholder="e.g. NASA-MOSFET-199C"
                required
              />
              <div className="spad-lot-presets">
                <span style={{ fontSize: '10.5px', color: '#5C6070' }}>Presets:</span>
                <button
                  type="button"
                  className="spad-preset-btn"
                  onClick={() => setLotId('NASA-MOSFET-199C')}
                >
                  NASA-MOSFET-199C
                </button>
                <button
                  type="button"
                  className="spad-preset-btn"
                  onClick={() => setLotId('LOT-2026-001')}
                >
                  LOT-2026-001
                </button>
                <button
                  type="button"
                  className="spad-preset-btn"
                  onClick={() => setLotId('LOT-2026-W01')}
                >
                  LOT-2026-W01
                </button>
              </div>
              {formErrors.lotId && (
                <div className="spad-field-error-msg">{formErrors.lotId}</div>
              )}
            </div>

            {/* 2. Parameter-Specific Engineering Limits Table (Prefilled Immediately) */}
            <div className="spad-form-field">
              <div className="spad-field-label-row">
                <label className="spad-field-label">
                  ENGINEERING LIMITS <span className="required">*</span>
                </label>
                <span className="spad-field-tag">
                  {parameterLimits.length} CONFIGURED
                </span>
              </div>

              <div className="spad-limits-table-wrapper">
                <div className="spad-limits-table-header">
                  <span>Parameter</span>
                  <span>Limit Value</span>
                  <span>Unit</span>
                  <span>Source</span>
                  <span></span>
                </div>

                <div className="spad-limits-list">
                  {parameterLimits.map((param, idx) => (
                    <div key={param.key} className="spad-limit-row">
                      {/* Parameter Name */}
                      <div className="spad-param-cell">
                        <span className="spad-param-name" title={param.name}>
                          {param.name}
                        </span>
                      </div>

                      {/* Limit Numeric Input (Fully editable) */}
                      <div className="spad-limit-input-cell">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          className={`spad-limit-input ${formErrors[`limit_${idx}`] ? 'error' : ''}`}
                          value={param.limitValue}
                          onChange={(e) => handleLimitValueChange(idx, e.target.value)}
                          placeholder="0.00"
                          aria-label={`Limit for ${param.name}`}
                        />
                      </div>

                      {/* Unit Badge */}
                      <span className="spad-unit-badge">{param.unit}</span>

                      {/* Authoritative / Operator Source Badge */}
                      <span
                        className={`spad-source-badge ${param.isAuthoritative ? 'authoritative' : 'operator'}`}
                        title={param.isAuthoritative ? 'Authoritative limit from database catalog' : 'Operator-configured engineering limit'}
                      >
                        {param.isAuthoritative ? 'DB AUTH' : 'OPERATOR'}
                      </span>

                      {/* Remove Button */}
                      <button
                        type="button"
                        className="spad-row-action-btn"
                        onClick={() => handleRemoveParameter(idx)}
                        disabled={parameterLimits.length <= 1}
                        title={parameterLimits.length <= 1 ? 'At least one parameter limit required' : 'Remove parameter'}
                        aria-label={`Remove ${param.name}`}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Parameter Dropdown if any canonical parameter was removed */}
                {availableParamsToAdd.length > 0 && (
                  <div className="spad-add-param-row">
                    <select
                      className="spad-input-control"
                      style={{ padding: '6px 10px', fontSize: '12px' }}
                      value={selectedAddParamKey}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val) {
                          handleAddParameter(val);
                        }
                      }}
                      aria-label="Add screening parameter"
                    >
                      <option value="">+ Add Additional Parameter Limit...</option>
                      {availableParamsToAdd.map((p) => (
                        <option key={p.key} value={p.key}>
                          {p.name} ({p.unit})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {formErrors.general && (
                <div className="spad-field-error-msg">{formErrors.general}</div>
              )}
            </div>
          </div>
        </section>
      </div>

      {/* ================================================================
          3. EXECUTION SECTION & STATUS BANNERS
          ================================================================ */}
      <div className="spad-action-section">
        {/* Primary Action Button & Force Stop Button */}
        <div className="spad-run-actions-container">
          <button
            type="button"
            className={`spad-run-btn ${runStatus === 'PROCESSING' ? 'processing' : ''}`}
            onClick={handleRunScreening}
            disabled={runStatus === 'PROCESSING'}
            id="spad-run-screening-btn"
          >
            {runStatus === 'PROCESSING' ? (
              <>
                <span className="spad-spinner" aria-hidden="true" />
                <span>Running screening analysis...</span>
              </>
            ) : runStatus === 'COMPLETED' ? (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>RE-RUN SCREENING ANALYSIS</span>
              </>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                <span>RUN SCREENING ANALYSIS</span>
              </>
            )}
          </button>

          {/* Clearly visible FORCE STOP button shown exclusively during active processing */}
          {runStatus === 'PROCESSING' && (
            <button
              type="button"
              className="spad-stop-btn"
              onClick={handleForceStop}
              id="spad-force-stop-btn"
              title="Force stop active screening analysis"
              aria-label="Force stop active screening analysis"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
              <span>FORCE STOP</span>
            </button>
          )}
        </div>

        {/* Processing State Details */}
        {runStatus === 'PROCESSING' && (
          <div className="spad-processing-panel" aria-live="polite">
            <div className="spad-panel-title-group">
              <span className="spad-spinner" style={{ width: '14px', height: '14px' }} />
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#38bdf8' }}>
                Running screening analysis...
              </span>
            </div>
            <div className="spad-processing-steps">
              <div className="spad-step-row">
                <span className="spad-step-bullet" />
                <span>Validating dataset telemetry & parameter-specific engineering limits</span>
              </div>
              <div className="spad-step-row">
                <span className="spad-step-bullet" />
                <span>Executing Method 1: Random Forest 100% Trajectory Prediction</span>
              </div>
              <div className="spad-step-row">
                <span className="spad-step-bullet" />
                <span>Executing Method 2: Isolation Forest Lot-Level Anomaly Detection</span>
              </div>
              <div className="spad-step-row">
                <span className="spad-step-bullet" />
                <span>Evaluating parameter-specific engineering thresholds (NORMAL / SUSPECT / CRITICAL)</span>
              </div>
              <div className="spad-step-row">
                <span className="spad-step-bullet" />
                <span>Persisting canonical screening records to MongoDB Atlas</span>
              </div>
            </div>
          </div>
        )}

        {/* Error / Stopped State Banner */}
        {runError && runStatus !== 'PROCESSING' && runStatus !== 'COMPLETED' && (
          <div className="spad-error-banner" role="alert">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="spad-error-content">
              <div className="spad-error-title">
                {runError.includes('STOPPED') ? 'SCREENING ANALYSIS STOPPED' : 'SCREENING ANALYSIS FAILED'}
              </div>
              <div className="spad-error-desc">{runError}</div>
            </div>
          </div>
        )}

        {/* Completed Results Summary Card */}
        {runStatus === 'COMPLETED' && runResult && (
          <div className="spad-results-card" aria-label="Screening Run Results">
            <div className="spad-results-header">
              <div className="spad-results-title-group">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <h3 className="spad-panel-title" style={{ color: '#22C55E' }}>
                  SCREENING RUN COMPLETED — {runResult.lotId || lotId}
                </h3>
              </div>
              <span className="spad-panel-badge green">PERSISTED TO ATLAS</span>
            </div>

            {/* Key Metrics Grid */}
            <div className="spad-results-metrics-grid">
              <div className="spad-metric-pill">
                <span className="spad-metric-label">Total Evaluated</span>
                <span className="spad-metric-value">
                  {runResult.summary?.totalComponents || runResult.summary?.evaluatedCount || (Array.isArray(runResult.data) ? runResult.data.length : 1)}
                </span>
              </div>

              <div className="spad-metric-pill">
                <span className="spad-metric-label">Normal</span>
                <span className="spad-metric-value normal">
                  {runResult.summary?.normalCount ?? '—'}
                </span>
              </div>

              <div className="spad-metric-pill">
                <span className="spad-metric-label">Suspect</span>
                <span className="spad-metric-value suspect">
                  {runResult.summary?.suspectCount ?? '0'}
                </span>
              </div>

              <div className="spad-metric-pill">
                <span className="spad-metric-label">Critical</span>
                <span className="spad-metric-value critical">
                  {runResult.summary?.criticalCount ?? '0'}
                </span>
              </div>

              <div className="spad-metric-pill">
                <span className="spad-metric-label">AI Flagged</span>
                <span className="spad-metric-value flagged">
                  {runResult.summary?.aiFlaggedCount ?? '0'}
                </span>
              </div>

              <div className="spad-metric-pill">
                <span className="spad-metric-label">Engineering Yield</span>
                <span className="spad-metric-value normal">
                  {runResult.summary?.engineeringYield !== undefined
                    ? `${runResult.summary.engineeringYield}%`
                    : '100.0%'}
                </span>
              </div>
            </div>

            {/* Quick Navigation Actions */}
            <div className="spad-results-actions-row">
              <button
                type="button"
                className="spad-btn-primary"
                onClick={() => {
                  if (onSelectLot) onSelectLot(runResult.lotId || lotId);
                  if (onNavigate) onNavigate('/');
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="7" height="9" x="3" y="3" rx="1" />
                  <rect width="7" height="5" x="14" y="3" rx="1" />
                  <rect width="7" height="9" x="14" y="12" rx="1" />
                  <rect width="7" height="5" x="3" y="16" rx="1" />
                </svg>
                <span>View in Dashboard</span>
              </button>

              <button
                type="button"
                className="spad-btn-secondary"
                onClick={() => {
                  if (onSelectLot) onSelectLot(runResult.lotId || lotId);
                  if (onNavigate) onNavigate('/screening-pipeline');
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" x2="6" y1="3" y2="15" />
                  <circle cx="18" cy="6" r="3" />
                  <circle cx="6" cy="18" r="3" />
                  <path d="M18 9a9 9 0 0 1-9 9" />
                </svg>
                <span>View Screening Pipeline</span>
              </button>

              <button
                type="button"
                className="spad-btn-secondary"
                onClick={() => {
                  handleClearFile();
                  setRunStatus('IDLE');
                  setRunResult(null);
                }}
              >
                <span>Screen Another Lot</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
