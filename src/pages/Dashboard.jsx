import React, { useState, useEffect, useMemo } from 'react';
import { mockDashboardData } from '../data/mockData';
import StatCards from '../components/dashboard/StatCards';
import ScreeningPipeline from '../components/dashboard/ScreeningPipeline';
import EvidencePathways from '../components/dashboard/EvidencePathways';
import ParameterTrends from '../components/dashboard/ParameterTrends';
import ComponentTable from '../components/dashboard/ComponentTable';
import SystemStatus from '../components/dashboard/SystemStatus';
import RecentAlerts from '../components/dashboard/RecentAlerts';
import ComponentDetailModal from '../components/dashboard/ComponentDetailModal';
import './Dashboard.css';

import { mapScreeningRecord } from '../utils/recordMapping';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

export default function Dashboard({ onNavigateToComponent }) {
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

  // Summary statistics calculated dynamically from actual engineeringStatus
  const summaryStats = useMemo(() => {
    const totalComponents = componentRecords.length;
    const normalCount = componentRecords.filter((c) => c.engineeringStatus === 'NORMAL').length;
    const suspectCount = componentRecords.filter((c) => c.engineeringStatus === 'SUSPECT').length;
    const criticalCount = componentRecords.filter((c) => c.engineeringStatus === 'CRITICAL').length;

    // Calculate unique lots processed from database records
    const uniqueLots = new Set(componentRecords.map((c) => c.lotId).filter(Boolean));
    const lotsProcessed = uniqueLots.size || (totalComponents > 0 ? 1 : 0);

    return {
      totalComponents,
      normal: normalCount,
      suspect: suspectCount,
      critical: criticalCount,
      passed: normalCount,
      hold: suspectCount,
      rejected: criticalCount,
      lotsProcessed,
    };
  }, [componentRecords]);

  // Screening lot context
  const screeningContext = useMemo(() => {
    const totalUnits = componentRecords.length;
    const normalCount = componentRecords.filter((c) => c.engineeringStatus === 'NORMAL').length;
    const anomalyCount = componentRecords.filter((c) => c.engineeringStatus === 'SUSPECT' || c.engineeringStatus === 'CRITICAL').length;
    const calculatedYield = totalUnits > 0 ? `${((normalCount / totalUnits) * 100).toFixed(1)}%` : '100.0%';
    const primaryLotId = totalUnits > 0 && componentRecords[0].lotId ? componentRecords[0].lotId : 'NASA-MOSFET-199C';

    return {
      ...mockDashboardData.screeningContext,
      lotId: primaryLotId,
      totalUnits,
      screenedUnits: totalUnits,
      currentYield: calculatedYield,
      anomaliesDetected: anomalyCount,
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
    evidencePathways,
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

      {/* 2. Five Summary Metrics Cards */}
      <section aria-label="Screening Summary Cards">
        <StatCards summaryStats={summaryStats} />
      </section>

      {/* 3. Screening Pipeline + Evidence Pathways (Two-Column Section) */}
      <section className="spad-two-col-grid spad-pipeline-evidence-grid" aria-label="Pipeline and AI Reasoning">
        <ScreeningPipeline stages={pipelineStages} context={screeningContext} />
        <EvidencePathways pathways={evidencePathways} />
      </section>

      {/* 4. Parameter Trends (Interactive Burn-in Parameter Trajectory) */}
      <section aria-label="Parametric Trends and Degradation">
        <ParameterTrends
          components={componentRecords}
          context={screeningContext}
        />
      </section>

      {/* 5. Detailed Component View (Full-Width Table) */}
      <section aria-label="Component Screening Records">
        <ComponentTable records={componentRecords} onSelectComponent={handleSelectComponent} />
      </section>

      {/* 6. System Status + Recent Alerts (Two-Column Section) */}
      <section className="spad-two-col-grid" aria-label="System Health and Event Stream">
        <SystemStatus subsystems={systemSubsystems} />
        <RecentAlerts alerts={recentAlerts} onAlertClick={handleAlertClick} />
      </section>

      {/* 7. Detailed Component Analysis & SHAP Explainability Dialog */}
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
