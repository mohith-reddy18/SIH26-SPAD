import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { mockDashboardData } from '../data/mockData';
import ScreeningPipeline from '../components/dashboard/ScreeningPipeline';
import ScreeningHistory from '../components/dashboard/ScreeningHistory';
import ParameterTrends from '../components/dashboard/ParameterTrends';
import ComponentTable from '../components/dashboard/ComponentTable';
import SystemStatus from '../components/dashboard/SystemStatus';
import RecentAlerts from '../components/dashboard/RecentAlerts';
import LotAnomalyDetection from '../components/dashboard/LotAnomalyDetection';
import ComponentDetailModal from '../components/dashboard/ComponentDetailModal';
import './Dashboard.css';

import { mapScreeningRecord } from '../utils/recordMapping';
import { API_BASE_URL } from '../config/api';

export default function Dashboard({ onNavigateToComponent, onNavigate, selectedLotId = 'NASA-MOSFET-199C', onSelectLot }) {
  const effectiveLotId = selectedLotId || 'NASA-MOSFET-199C';
  const [selectedModalComponent, setSelectedModalComponent] = useState(null);
  const [componentRecords, setComponentRecords] = useState([]);
  const [backendHistory, setBackendHistory] = useState([]);
  const [dataSource, setDataSource] = useState('loading'); // 'loading' | 'api' | 'empty' | 'offline'
  const [isLoadingComponents, setIsLoadingComponents] = useState(true);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // 1. Fetch Screening History independently on mount
  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const histRes = await fetch(`${API_BASE_URL}/api/screening/history`);
      if (histRes.ok) {
        const histResult = await histRes.json();
        if (histResult.success && Array.isArray(histResult.data)) {
          setBackendHistory(histResult.data);
        }
      }
    } catch (err) {
      console.warn('[SPAD] Failed to fetch screening history from backend:', err.message);
    } finally {
      setIsLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // 2. Fetch component records strictly for the active selected lot
  const loadComponentRecords = useCallback(async () => {
    setIsLoadingComponents(true);
    setFetchError(null);

    try {
      const queryParam = `?lotId=${encodeURIComponent(effectiveLotId)}`;
      const compRes = await fetch(`${API_BASE_URL}/api/screening${queryParam}`);

      if (compRes.ok) {
        const result = await compRes.json();
        if (result.success && Array.isArray(result.data)) {
          const mapped = result.data.map(mapScreeningRecord);
          // Strict lot-isolation filter: only include components belonging to the effective lot
          const filtered = mapped.filter((r) => !r.lotId || r.lotId === effectiveLotId);
          setComponentRecords(filtered);
          setDataSource(filtered.length > 0 ? 'api' : 'empty');
        } else {
          setComponentRecords([]);
          setDataSource('empty');
        }
      } else {
        setComponentRecords([]);
        setDataSource('empty');
      }
    } catch (err) {
      console.warn('[SPAD] Failed to fetch screening data from backend:', err.message);
      setFetchError(err.message || 'Unable to connect to SPAD backend');
      setDataSource('offline');
    } finally {
      setIsLoadingComponents(false);
    }
  }, [effectiveLotId]);

  useEffect(() => {
    loadComponentRecords();
  }, [loadComponentRecords]);

  const handleRetry = () => {
    loadHistory();
    loadComponentRecords();
  };

  // Combine backend lot history with client records if backend history endpoint is empty
  const screeningHistory = useMemo(() => {
    if (backendHistory.length > 0) {
      return backendHistory;
    }
    if (componentRecords.length === 0) return [];

    const lotsMap = {};
    componentRecords.forEach((rec) => {
      const lotId = rec.lotId || 'LOT-UNKNOWN';
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
    });

    return Object.values(lotsMap).map((lot) => {
      const totalUnits = lot.records.length;
      const normalCount = lot.records.filter((r) => r.engineeringStatus === 'NORMAL').length;
      const suspectCount = lot.records.filter((r) => r.engineeringStatus === 'SUSPECT').length;
      const criticalCount = lot.records.filter((r) => r.engineeringStatus === 'CRITICAL').length;
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
  }, [backendHistory, componentRecords]);

  // Derive selected lot summary from already-loaded history or active component records
  const activeLotSummary = useMemo(() => {
    return backendHistory.find((h) => h.lotId === effectiveLotId) || null;
  }, [backendHistory, effectiveLotId]);

  // Primary screening lot context derived coherently from database lot summary and active records
  const screeningContext = useMemo(() => {
    const activeLotRecords = componentRecords.filter((c) => !c.lotId || c.lotId === effectiveLotId);

    if (activeLotRecords.length > 0) {
      const totalUnits = activeLotRecords.length;
      const normalCount = activeLotRecords.filter((c) => c.engineeringStatus === 'NORMAL').length;
      const anomalyCount = activeLotRecords.filter((c) => c.engineeringStatus === 'SUSPECT' || c.engineeringStatus === 'CRITICAL').length;
      const calculatedYield = totalUnits > 0 ? `${((normalCount / totalUnits) * 100).toFixed(1)}%` : '100.0%';
      const primaryLotId = effectiveLotId;
      const hasPredictions = activeLotRecords.some((c) => (c.predictions && Object.keys(c.predictions).length > 0) || c.aiAssessment?.prediction);
      const hasAnomalies = activeLotRecords.some((c) => c.anomalies || c.engineeringStatus !== undefined || c.aiAssessment?.lotAnomaly);

      return {
        ...mockDashboardData.screeningContext,
        lotId: primaryLotId,
        lotStatus: totalUnits > 0 ? 'COMPLETED' : 'NO ACTIVE LOT',
        totalUnits,
        screenedUnits: totalUnits,
        currentYield: calculatedYield,
        anomaliesDetected: anomalyCount,
        hasFuturePrediction: hasPredictions || totalUnits > 0,
        hasAnomalyDetection: hasAnomalies || totalUnits > 0,
        completionRate: totalUnits > 0 ? '100%' : '—',
      };
    }

    if (activeLotSummary) {
      return {
        ...mockDashboardData.screeningContext,
        lotId: activeLotSummary.lotId,
        lotStatus: activeLotSummary.status || (activeLotSummary.totalUnits > 0 ? 'COMPLETED' : 'PENDING'),
        totalUnits: activeLotSummary.totalUnits || 0,
        screenedUnits: activeLotSummary.totalUnits || 0,
        currentYield: activeLotSummary.yield || '100.0%',
        anomaliesDetected: activeLotSummary.anomalyCount || 0,
        hasFuturePrediction: activeLotSummary.hasPredictions !== false && activeLotSummary.totalUnits > 0,
        hasAnomalyDetection: activeLotSummary.hasAnomalyDet !== false && activeLotSummary.totalUnits > 0,
        completionRate: activeLotSummary.totalUnits > 0 ? '100%' : '—',
      };
    }

    return {
      ...mockDashboardData.screeningContext,
      lotId: effectiveLotId,
      lotStatus: isLoadingComponents ? 'LOADING' : 'NO ACTIVE LOT',
      totalUnits: 0,
      screenedUnits: 0,
      currentYield: '—',
      anomaliesDetected: 0,
      hasFuturePrediction: false,
      hasAnomalyDetection: false,
      completionRate: '—',
    };
  }, [componentRecords, effectiveLotId, activeLotSummary, isLoadingComponents]);

  // Derive alerts dynamically from database component records
  const recentAlerts = useMemo(() => {
    const alerts = [];
    componentRecords.forEach((c) => {
      const isCritical = c.engineeringStatus === 'CRITICAL' || c.status === 'CRITICAL';
      const isSuspect = c.engineeringStatus === 'SUSPECT' || c.status === 'SUSPECT';
      if (isCritical || isSuspect) {
        alerts.push({
          id: `alert-${c.id}`,
          targetId: c.id,
          type: 'component',
          severity: isCritical ? 'danger' : 'warning',
          message: c.evidence || `${c.id} flagged with ${c.status || c.engineeringStatus} anomaly status by screening models.`,
          timeAgo: 'Live DB',
          timestamp: 'MongoDB',
        });
      }
    });
    return alerts;
  }, [componentRecords]);

  const {
    pipelineStages,
    systemSubsystems,
  } = mockDashboardData;

  const handleSelectComponent = (component) => {
    setSelectedModalComponent(component);
  };

  const handleAlertClick = (alert) => {
    if (alert.type === 'component') {
      const target = componentRecords.find((c) => c.id === alert.targetId);
      if (target) {
        setSelectedModalComponent(target);
      } else if (onNavigateToComponent) {
        onNavigateToComponent(alert.targetId);
      }
    }
  };

  return (
    <div className="spad-dashboard-page" role="main" aria-label="SPAD Screening Command Center">
      {/* 1. Dashboard Header */}
      <header className="spad-dashboard-header">
        <div className="spad-header-left">
          <h1 className="spad-header-title">Dashboard</h1>
          <span className="spad-header-subtitle">Burn-In Screening Overview</span>
        </div>

        <div className="spad-header-right">
          <div className="spad-lot-badge">
            <span className="spad-lot-name">{screeningContext.lotId}</span>
            <span className="spad-pulse-indicator" aria-hidden="true"></span>
            <span>{screeningContext.lotStatus}</span>
          </div>
          <div className="spad-stage-pill">
            <span>Current Stage:</span>
            <strong>{screeningContext.currentStage}</strong>
          </div>
        </div>
      </header>

      {/* Backend API Connection Error Banner (Requirement 8A) */}
      {dataSource === 'offline' && (
        <div style={{ padding: '14px 18px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <strong>Unable to connect to SPAD backend</strong> ({fetchError || 'Network request failed'}).
          </div>
          <button
            type="button"
            onClick={handleRetry}
            style={{
              background: '#ef4444',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              padding: '6px 14px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
            }}
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Backend Connected but No Data Banner (Requirement 8B) */}
      {dataSource === 'empty' && !isLoadingComponents && (
        <div style={{ padding: '14px 18px', background: 'rgba(56, 189, 248, 0.06)', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: '6px', color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
          No screening data available in database for active selection.
        </div>
      )}

      {/* 2. Screening Result Summary + Screening History (Two-Column Section) */}
      <section className="spad-two-col-grid spad-pipeline-history-grid" aria-label="Screening Result and Run History">
        <ScreeningPipeline
          stages={pipelineStages}
          context={screeningContext}
          isLoading={isLoadingComponents && !activeLotSummary}
        />
        <ScreeningHistory
          history={screeningHistory}
          isLoading={isLoadingHistory}
          onNavigate={onNavigate}
          selectedLotId={selectedLotId || screeningContext.lotId}
          onSelectLot={onSelectLot}
        />
      </section>

      {/* 3. Parameter Trends (Interactive Burn-in Parameter Trajectory) */}
      <section aria-label="Parametric Trends and Degradation">
        <ParameterTrends
          components={componentRecords}
          context={screeningContext}
        />
      </section>

      {/* 5. ML Model 2: Isolation Forest — Anomaly Detection */}
      <section aria-label="Isolation Forest — Anomaly Detection">
        <LotAnomalyDetection
          records={componentRecords}
        />
      </section>

      {/* 6. Detailed Component View (Full-Width Table) */}
      <section aria-label="Component Screening Records">
        <ComponentTable records={componentRecords} onSelectComponent={handleSelectComponent} />
      </section>

      {/* 7. System Status + Recent Alerts (Two-Column Section) */}
      <section className="spad-two-col-grid" aria-label="System Health and Event Stream">
        <SystemStatus subsystems={systemSubsystems} />
        <RecentAlerts alerts={recentAlerts} onAlertClick={handleAlertClick} />
      </section>

      {/* 8. Detailed Component Analysis & SHAP Explainability Dialog */}
      <ComponentDetailModal
        component={selectedModalComponent}
        isOpen={Boolean(selectedModalComponent)}
        onClose={() => setSelectedModalComponent(null)}
        components={componentRecords}
        onSelectComponent={(comp) => setSelectedModalComponent(comp)}
      />
    </div>
  );
}
