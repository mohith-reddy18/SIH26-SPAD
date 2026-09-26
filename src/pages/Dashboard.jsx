import React, { useState, useEffect, useMemo } from 'react';
import { mockDashboardData } from '../data/mockData';
import ScreeningPipeline from '../components/dashboard/ScreeningPipeline';
import ScreeningHistory from '../components/dashboard/ScreeningHistory';
import ParameterTrends from '../components/dashboard/ParameterTrends';
import ComponentTable from '../components/dashboard/ComponentTable';
import SystemStatus from '../components/dashboard/SystemStatus';
import RecentAlerts from '../components/dashboard/RecentAlerts';
import LotAnomalyDetection from '../components/dashboard/LotAnomalyDetection';
import RandomForestPrediction from '../components/dashboard/RandomForestPrediction';
import ComponentDetailModal from '../components/dashboard/ComponentDetailModal';
import './Dashboard.css';

import { mapScreeningRecord } from '../utils/recordMapping';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

export default function Dashboard({ onNavigateToComponent, onNavigate }) {
  const [selectedModalComponent, setSelectedModalComponent] = useState(null);
  const [componentRecords, setComponentRecords] = useState([]);
  const [dataSource, setDataSource] = useState('loading'); // 'loading' | 'api' | 'empty' | 'offline'
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Primary data fetch from backend API
  useEffect(() => {
    let isMounted = true;

    async function loadScreeningRecords() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/screening`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.data)) {
            if (isMounted) {
              const mapped = result.data.map(mapScreeningRecord);
              setComponentRecords(mapped);
              setDataSource('api');
            }
            return;
          }
        }
        if (isMounted) {
          setDataSource('empty');
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[SPAD] Failed to fetch screening records from backend:', err.message);
          setFetchError(err.message);
          setDataSource('offline');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadScreeningRecords();

    return () => {
      isMounted = false;
    };
  }, []);

  // Group database records into lot history runs
  const screeningHistory = useMemo(() => {
    if (componentRecords.length === 0) return [];
    const lotsMap = {};

    componentRecords.forEach((rec) => {
      const lotId = rec.lotId || 'NASA-MOSFET-199C';
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
  }, [componentRecords]);

  // Primary screening lot context
  const screeningContext = useMemo(() => {
    const totalUnits = componentRecords.length;
    const normalCount = componentRecords.filter((c) => c.engineeringStatus === 'NORMAL').length;
    const anomalyCount = componentRecords.filter((c) => c.engineeringStatus === 'SUSPECT' || c.engineeringStatus === 'CRITICAL').length;
    const calculatedYield = totalUnits > 0 ? `${((normalCount / totalUnits) * 100).toFixed(1)}%` : '100.0%';
    const primaryLotId = totalUnits > 0 && componentRecords[0].lotId ? componentRecords[0].lotId : 'NASA-MOSFET-199C';
    const hasPredictions = componentRecords.some((c) => c.predictions && Object.keys(c.predictions).length > 0);
    const hasAnomalies = componentRecords.some((c) => c.anomalies || c.engineeringStatus !== undefined);

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
  }, [componentRecords]);

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

      {/* Backend API Connection Error Banner */}
      {fetchError && (
        <div style={{ padding: '12px 16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '6px', color: '#fca5a5', fontSize: '13px', marginBottom: '16px' }}>
          <strong>Backend Connection Notice:</strong> Unable to load live screening records from API ({fetchError}). Ensure backend server is running.
        </div>
      )}

      {/* 2. Screening Result Summary + Screening History (Two-Column Section) */}
      <section className="spad-two-col-grid spad-pipeline-history-grid" aria-label="Screening Result and Run History">
        <ScreeningPipeline stages={pipelineStages} context={screeningContext} />
        <ScreeningHistory history={screeningHistory} isLoading={isLoading} onNavigate={onNavigate} />
      </section>

      {/* 3. Parameter Trends (Interactive Burn-in Parameter Trajectory) */}
      <section aria-label="Parametric Trends and Degradation">
        <ParameterTrends
          components={componentRecords}
          context={screeningContext}
        />
      </section>

      {/* 4. ML Model 1: Random Forest — Future Prediction */}
      <section aria-label="Random Forest — Future Prediction">
        <RandomForestPrediction
          records={componentRecords}
          onSelectComponent={handleSelectComponent}
        />
      </section>

      {/* 5. ML Model 2: Isolation Forest — Anomaly Detection */}
      <section aria-label="Isolation Forest — Anomaly Detection">
        <LotAnomalyDetection
          records={componentRecords}
          onSelectComponent={handleSelectComponent}
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
