import React, { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import ComponentSearch from './pages/ComponentSearch';
import ScreeningPipeline from './pages/ScreeningPipeline';
import ModelPerformance from './pages/ModelPerformance';
import ObservabilityStudy from './pages/ObservabilityStudy';
import Reports from './pages/Reports';
import FailureAnalysis from './pages/FailureAnalysis';
import SystemSettings from './pages/SystemSettings';

// Route dictionary mapping path to page component
const PAGE_ROUTES = {
  '/': Dashboard,
  '/components': ComponentSearch,
  '/screening-pipeline': ScreeningPipeline,
  '/model-performance': ModelPerformance,
  '/observability': ObservabilityStudy,
  '/reports': Reports,
  '/failure-analysis': FailureAnalysis,
  '/settings': SystemSettings,
};

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    return window.location.pathname in PAGE_ROUTES ? window.location.pathname : '/';
  });

  // Handle browser back/forward history events
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setCurrentPath(path in PAGE_ROUTES ? path : '/');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (path) => {
    if (path !== currentPath) {
      window.history.pushState({}, '', path);
      setCurrentPath(path);
    }
  };

  const CurrentPageComponent = PAGE_ROUTES[currentPath] || Dashboard;

  return (
    <div className="app-container">
      {/* 1. Fixed Left Vertical Navigation Bar */}
      <Sidebar activePath={currentPath} onNavigate={handleNavigate} />

      {/* 2. Main Content Area */}
      <main className="app-main-content">
        <CurrentPageComponent />
      </main>
    </div>
  );
}
