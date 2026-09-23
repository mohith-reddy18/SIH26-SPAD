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

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

function mapScreeningRecordToComponent(record) {
  const iddqArray = record.measurements?.iddq || [];
  const leakageArray = record.measurements?.leakage || [];
  const propDelayArray = record.measurements?.propDelay || [];

  const latestIddq = iddqArray.length > 0 ? iddqArray[iddqArray.length - 1] : null;
  const latestLeakage = leakageArray.length > 0 ? leakageArray[leakageArray.length - 1] : null;
  const latestPropDelay = propDelayArray.length > 0 ? propDelayArray[propDelayArray.length - 1] : null;

  return {
    id: record.componentId || record.id,
    lotId: record.lotId || 'LOT-2026-001',
    stage: record.stage || '96h',
    standbyCurrent: latestIddq !== null ? `${typeof latestIddq === 'number' ? latestIddq.toFixed(2) : latestIddq} mA` : '-',
    leakageCurrent: latestLeakage !== null ? `${typeof latestLeakage === 'number' ? latestLeakage.toFixed(2) : latestLeakage} µA` : '-',
    propagationDelay: latestPropDelay !== null ? `${typeof latestPropDelay === 'number' ? latestPropDelay.toFixed(2) : latestPropDelay} ns` : '-',
    measurements: record.measurements || {},
    predictions: record.predictions || {},
    engineeringLimits: record.engineeringLimits || {},
    engineeringLimitStatus: record.engineeringLimitStatus || 'WITHIN LIMIT',
    aiRisk: typeof record.aiRisk === 'number' ? record.aiRisk : 0,
    riskScore: typeof record.riskScore === 'number' ? record.riskScore : 0,
    anomalies: record.anomalies || {},
    aiAssessment: record.aiAssessment || record.status || 'NORMAL',
    evidence: record.evidence || 'Within Expected Range',
    decision: record.decision || record.status || 'NORMAL',
    status: record.status || 'NORMAL',
    modelExplanation: record.modelExplanation || null,
    _source: 'backend-api',
  };
}

export default function Dashboard({ onNavigateToComponent }) {
  const [selectedModalComponent, setSelectedModalComponent] = useState(null);
  const [componentRecords, setComponentRecords] = useState(mockDashboardData.componentRecords);
  const [dataSource, setDataSource] = useState('fallback'); // 'api' | 'fallback'
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
          if (result.success && Array.isArray(result.data) && result.data.length > 0) {
            if (isMounted) {
              const mapped = result.data.map(mapScreeningRecordToComponent);
              setComponentRecords(mapped);
              setDataSource('api');
            }
            return;
          }
        }
        // If response is not ok or empty, trigger mock fallback
        if (isMounted) {
          console.warn('[SPAD] Backend API returned empty/invalid records; using mock fallback.');
          setComponentRecords(mockDashboardData.componentRecords);
          setDataSource('fallback');
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[SPAD] Failed to fetch screening records from backend:', err.message);
          setFetchError(err.message);
          setComponentRecords(mockDashboardData.componentRecords);
          setDataSource('fallback');
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

  // Summary statistics calculated dynamically from active records (never hard-coded)
  const summaryStats = useMemo(() => {
    if (dataSource === 'api') {
      const totalComponents = componentRecords.length;
      const normalCount = componentRecords.filter(
        (c) => c.status === 'NORMAL' || c.status === 'PASS'
      ).length;
      const suspectCount = componentRecords.filter(
        (c) => c.status === 'SUSPECT' || c.status === 'HOLD'
      ).length;
      const criticalCount = componentRecords.filter(
        (c) => c.status === 'CRITICAL' || c.status === 'REJECT'
      ).length;

      // Calculate unique lots processed from database records
      const uniqueLots = new Set(componentRecords.map((c) => c.lotId).filter(Boolean));
      const lotsProcessed = uniqueLots.size;

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
    }

    // Fallback summary stats when API is unavailable
    return mockDashboardData.summaryStats;
  }, [componentRecords, dataSource]);

  // Screening lot context
  const screeningContext = useMemo(() => {
    if (dataSource === 'api' && componentRecords.length > 0) {
      const primaryLotId = componentRecords[0].lotId || 'LOT-2026-001';
      return {
        ...mockDashboardData.screeningContext,
        lotId: primaryLotId,
        totalUnits: componentRecords.length,
        screenedUnits: componentRecords.length,
      };
    }
    return mockDashboardData.screeningContext;
  }, [componentRecords, dataSource]);

  const {
    pipelineStages,
    evidencePathways,
    parameterSpecs,
    systemSubsystems,
    recentAlerts,
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
          parameterSpecs={parameterSpecs}
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
        parameterSpecs={parameterSpecs}
      />
    </div>
  );
}
