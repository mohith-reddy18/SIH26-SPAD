import React, { useState, useEffect, useRef, useCallback } from 'react';
import './ScreeningInput.css';
import { API_BASE_URL } from '../config/api';
import { getParameterMeta, PARAMETER_DISPLAY_MAP } from '../utils/recordMapping';

/**
 * Standard selectable parameters supported by the SPAD data layer
 */
const CANONICAL_PARAMETERS = [
  { key: 'rdson', name: 'On-Resistance (RDS(on))', shortName: 'RDS(on)', unit: 'Ω', defaultLimit: '8.00' },
  { key: 'iddq', name: 'Standby Current (Iddq)', shortName: 'Iddq', unit: 'mA', defaultLimit: '2.80' },
  { key: 'leakage', name: 'Leakage Current (I_leak)', shortName: 'I_leak', unit: 'µA', defaultLimit: '0.80' },
  { key: 'delay', name: 'Propagation Delay (t_pd)', shortName: 't_pd', unit: 'ns', defaultLimit: '15.00' },
  { key: 'v_th', name: 'Threshold Voltage (V_th)', shortName: 'V_th', unit: 'V', defaultLimit: '1.20' },
  { key: 'temp', name: 'Chamber Temperature (T_j)', shortName: 'T_j', unit: '°C', defaultLimit: '205.0' },
  { key: 'freq', name: 'Switching Frequency (f_sw)', shortName: 'f_sw', unit: 'Hz', defaultLimit: '1000' },
  { key: 'vgs', name: 'Gate-Source Voltage (V_GS)', shortName: 'V_GS', unit: 'V', defaultLimit: '12.0' },
  { key: 'vds', name: 'Drain-Source Voltage (V_DS)', shortName: 'V_DS', unit: 'V', defaultLimit: '6.0' },
];

/**
 * Format bytes to human readable string (KB / MB)
 */
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
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

  // 2. Lot ID & Parameter Limits State
  const [lotId, setLotId] = useState(selectedLotId || 'NASA-MOSFET-199C');
  const [parameterLimits, setParameterLimits] = useState([]);
  const [isDetectingParams, setIsDetectingParams] = useState(false);
  const [formErrors, setFormErrors] = useState({});

  // 3. Execution & Processing State
  const [runStatus, setRunStatus] = useState('IDLE'); // 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'ERROR'
  const [runResult, setRunResult] = useState(null);
  const [runError, setRunError] = useState(null);

  /**
   * Automatically detect parameters from dataset and load authoritative DB limits
   */
  const detectDatasetParameters = useCallback(async (file, targetLotId) => {
    if (!file) {
      setParameterLimits([]);
      return;
    }

    setIsDetectingParams(true);
    setFormErrors((prev) => ({ ...prev, general: null, file: null }));

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (targetLotId && targetLotId.trim()) {
        formData.append('lotId', targetLotId.trim());
      }
      formData.append('fileName', file.name);

      const res = await fetch(`${API_BASE_URL}/api/screening/detect-parameters`, {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && Array.isArray(json.parameters)) {
          setParameterLimits(json.parameters);
          setFileInsights((prev) => ({
            type: prev?.type || (file.name.toLowerCase().endsWith('.zip') ? 'NASA Dataset Archive (.ZIP)' : 'Telemetry Dataset'),
            unitsDetected: prev?.unitsDetected || 'Valid Telemetry',
            status: `${json.parameters.length} Params Detected`,
          }));
          return;
        }
      }
    } catch {
      // Fallback
    } finally {
      setIsDetectingParams(false);
    }
  }, []);

  /**
   * Safe file parser for preview insights & automatic parameter detection
   */
  const processSelectedFile = useCallback((file) => {
    setFileError(null);
    setRunError(null);
    setRunStatus('IDLE');

    if (!file) {
      setSelectedFile(null);
      setFileContent(null);
      setFileInsights(null);
      setParameterLimits([]);
      return;
    }

    const fileName = file.name.toLowerCase();
    const isValidExt = fileName.endsWith('.csv') || fileName.endsWith('.json') || fileName.endsWith('.mat') || fileName.endsWith('.zip');

    if (!isValidExt) {
      setFileError('Unsupported file format. Please upload a .ZIP, .CSV, .JSON, or .MAT dataset file.');
      setSelectedFile(null);
      setFileContent(null);
      setFileInsights(null);
      setParameterLimits([]);
      return;
    }

    if (file.size === 0) {
      setFileError('The selected file is empty (0 bytes). Please provide a valid telemetry dataset.');
      setSelectedFile(null);
      setFileContent(null);
      setFileInsights(null);
      setParameterLimits([]);
      return;
    }

    setSelectedFile(file);

    // Read text content for CSV/JSON for preview insights
    if (fileName.endsWith('.csv') || fileName.endsWith('.json')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target.result;
        setFileContent(text);

        try {
          if (fileName.endsWith('.json')) {
            const parsed = JSON.parse(text);
            const count = Array.isArray(parsed) ? parsed.length : (parsed.records?.length || 1);
            setFileInsights({
              type: 'JSON Telemetry',
              unitsDetected: count,
              status: 'Detecting params...',
            });
          } else {
            const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
            const rowCount = Math.max(0, lines.length - 1);
            setFileInsights({
              type: 'CSV Telemetry',
              unitsDetected: rowCount,
              status: 'Detecting params...',
            });
          }
        } catch {
          setFileInsights({
            type: fileName.endsWith('.json') ? 'JSON' : 'CSV',
            unitsDetected: '—',
            status: 'Raw Stream',
          });
        }
      };
      reader.onerror = () => {
        setFileError('Failed to read file from local disk.');
      };
      reader.readAsText(file);
    } else {
      // Binary .ZIP, .MAT, or matrix archive
      setFileContent(null);
      setFileInsights({
        type: fileName.endsWith('.zip') ? 'NASA Dataset Archive (.ZIP)' : 'MATLAB Matrix (.MAT)',
        unitsDetected: fileName.endsWith('.zip') ? 'Multi-file Archive' : 'Binary Dataset',
        status: 'Detecting params...',
      });
    }

    // Trigger automatic dataset parameter detection on backend
    detectDatasetParameters(file, lotId);
  }, [detectDatasetParameters, lotId]);

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
    setParameterLimits([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  /**
   * Parameter Limit Table Handlers
   */
  const handleLimitValueChange = (index, value) => {
    setParameterLimits((prev) => {
      const next = [...prev];
      if (next[index].isAuthoritative) {
        return prev; // Disallow editing authoritative database limits
      }
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
    if (parameterLimits[index]?.isAuthoritative) return;
    setParameterLimits((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Validate all engineering inputs before dispatch
   */
  const validateInputs = () => {
    const errors = {};

    if (!selectedFile) {
      errors.file = 'A screening dataset (.ZIP, .CSV, .JSON, or .MAT) is required.';
    }

    if (!lotId || !lotId.trim()) {
      errors.lotId = 'Lot ID is required.';
    }

    if (parameterLimits.length === 0) {
      errors.general = 'No telemetry parameters detected in the uploaded dataset to screen.';
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
   * Primary Action: Execute Screening Run
   */
  const handleRunScreening = async () => {
    setRunError(null);

    if (!validateInputs()) {
      return;
    }

    setRunStatus('PROCESSING');

    try {
      const cleanLotId = lotId.trim();

      // Build parameter-specific engineering limits map
      const engineeringLimits = {};
      parameterLimits.forEach((param) => {
        engineeringLimits[param.key] = {
          limitValue: parseFloat(param.limitValue),
          unit: param.unit,
          direction: param.direction || 'UPPER',
          source: param.isAuthoritative ? 'DATABASE_CATALOG' : 'USER_ENGINEERING_INPUT',
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
      formData.append('engineeringLimits', JSON.stringify(engineeringLimits));
      formData.append('context', JSON.stringify(contextData));

      const response = await fetch(`${API_BASE_URL}/api/screening/run`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
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
      setRunError(err.message || 'An error occurred during screening analysis.');
      setRunStatus('ERROR');
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
            <span className="spad-panel-badge">FORMATS: .ZIP | .CSV | .JSON | .MAT</span>
          </div>

          <div className="spad-dropzone-wrapper">
            {/* Hidden native file input */}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".zip,.csv,.json,.mat,application/zip,text/csv,application/json"
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
                  <span className="spad-format-chip">.JSON</span>
                  <span className="spad-format-chip">.MAT</span>
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
                      <span className="spad-insight-label">Units Detected</span>
                      <span className="spad-insight-value">{fileInsights.unitsDetected}</span>
                    </div>
                    <div className="spad-insight-stat">
                      <span className="spad-insight-label">Parameters</span>
                      <span className="spad-insight-value" style={{ color: '#10B981' }}>
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
            RIGHT PANEL: ENGINEERING INPUT (Parameter-Specific Limits)
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
            <span className="spad-panel-badge green">PARAMETER LIMITS</span>
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
                  if (selectedFile) {
                    detectDatasetParameters(selectedFile, newLotId);
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
                  onClick={() => {
                    setLotId('NASA-MOSFET-199C');
                    if (selectedFile) detectDatasetParameters(selectedFile, 'NASA-MOSFET-199C');
                  }}
                >
                  NASA-MOSFET-199C
                </button>
                <button
                  type="button"
                  className="spad-preset-btn"
                  onClick={() => {
                    setLotId('LOT-2026-001');
                    if (selectedFile) detectDatasetParameters(selectedFile, 'LOT-2026-001');
                  }}
                >
                  LOT-2026-001
                </button>
                <button
                  type="button"
                  className="spad-preset-btn"
                  onClick={() => {
                    setLotId('LOT-2026-W01');
                    if (selectedFile) detectDatasetParameters(selectedFile, 'LOT-2026-W01');
                  }}
                >
                  LOT-2026-W01
                </button>
              </div>
              {formErrors.lotId && (
                <div className="spad-field-error-msg">{formErrors.lotId}</div>
              )}
            </div>

            {/* 2. Parameter-Specific Engineering Limits Table */}
            <div className="spad-form-field">
              <div className="spad-field-label-row">
                <label className="spad-field-label">
                  ENGINEERING LIMITS <span className="required">*</span>
                </label>
                <span className="spad-field-tag">
                  {parameterLimits.length > 0 ? `${parameterLimits.length} DETECTED` : 'AUTOMATIC DETECTION'}
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

                {parameterLimits.length === 0 ? (
                  <div className="spad-empty-limits-box">
                    {isDetectingParams ? (
                      <span>Detecting dataset engineering parameters...</span>
                    ) : selectedFile ? (
                      <span>No supported engineering parameters detected in the uploaded file.</span>
                    ) : (
                      <span>Upload a screening dataset (.ZIP, .CSV, .JSON, .MAT) to automatically detect telemetry parameters.</span>
                    )}
                  </div>
                ) : (
                  <div className="spad-limits-list">
                    {parameterLimits.map((param, idx) => (
                      <div key={param.key} className="spad-limit-row">
                        {/* Parameter Name & Tag */}
                        <div className="spad-param-cell">
                          <span className="spad-param-name" title={param.name}>
                            {param.name}
                          </span>
                          <span className="spad-param-code">
                            {param.key} • detected
                          </span>
                        </div>

                        {/* Limit Numeric Input */}
                        <div className="spad-limit-input-cell">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            disabled={param.isAuthoritative}
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
                          title={param.isAuthoritative ? 'Authoritative limit from database catalog — locked' : 'Operator-configured engineering limit'}
                        >
                          {param.isAuthoritative ? 'DB AUTH (LOCKED)' : 'OPERATOR'}
                        </span>

                        {/* Remove Button (disabled if authoritative) */}
                        <button
                          type="button"
                          className="spad-row-action-btn"
                          onClick={() => handleRemoveParameter(idx)}
                          disabled={param.isAuthoritative}
                          title={param.isAuthoritative ? 'Authoritative database catalog limit cannot be removed' : 'Remove parameter'}
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
        {/* Primary Action Button */}
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

        {/* Error State Banner */}
        {runStatus === 'ERROR' && runError && (
          <div className="spad-error-banner" role="alert">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="spad-error-content">
              <div className="spad-error-title">SCREENING ANALYSIS FAILED</div>
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
