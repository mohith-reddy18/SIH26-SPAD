import React from 'react';
import { mockDashboardData } from '../data/mockData';
import StatCards from '../components/dashboard/StatCards';
import ScreeningPipeline from '../components/dashboard/ScreeningPipeline';
import EvidencePathways from '../components/dashboard/EvidencePathways';
import ParameterTrends from '../components/dashboard/ParameterTrends';
import ComponentTable from '../components/dashboard/ComponentTable';
import SystemStatus from '../components/dashboard/SystemStatus';
import RecentAlerts from '../components/dashboard/RecentAlerts';
import './Dashboard.css';

export default function Dashboard({ onNavigateToComponent }) {
  const {
    screeningContext,
    summaryStats,
    pipelineStages,
    evidencePathways,
    parameterSpecs,
    componentRecords,
    systemSubsystems,
    recentAlerts,
  } = mockDashboardData;

  const handleSelectComponent = (component) => {
    if (onNavigateToComponent) {
      onNavigateToComponent(component.id);
    }
  };

  const handleAlertClick = (alert) => {
    if (alert.type === 'component' && onNavigateToComponent) {
      onNavigateToComponent(alert.targetId);
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
      <section className="spad-two-col-grid" aria-label="Pipeline and AI Reasoning">
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
    </div>
  );
}
