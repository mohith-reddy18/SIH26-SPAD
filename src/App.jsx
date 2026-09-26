import React, { useState, useEffect } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Sidebar from './components/Sidebar';
import MobileNavbar from './components/MobileNavbar';
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
  '/dashboard': Dashboard,
  '/components': ComponentSearch,
  '/component-search': ComponentSearch,
  '/screening-pipeline': ScreeningPipeline,
  '/model-performance': ModelPerformance,
  '/observability': ObservabilityStudy,
  '/observability-study': ObservabilityStudy,
  '/reports': Reports,
  '/failure-analysis': FailureAnalysis,
  '/settings': SystemSettings,
  '/system-settings': SystemSettings,
};

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    return window.location.pathname in PAGE_ROUTES ? window.location.pathname : '/';
  });
  const [selectedComponentId, setSelectedComponentId] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    setIsMobileMenuOpen(false);
  };

  const handleNavigateToComponent = (componentId) => {
    setSelectedComponentId(componentId);
    handleNavigate('/components');
  };

  const CurrentPageComponent = PAGE_ROUTES[currentPath] || Dashboard;

  return (
    <div className="app-container">
      {/* 1. Left Vertical Navigation Bar (Fixed on Desktop, Slide-out Drawer on Mobile) */}
      <Sidebar 
        activePath={currentPath} 
        onNavigate={handleNavigate} 
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      {/* 2. Main Content Area */}
      <div className="app-main-layout">
        {/* Mobile Header Topbar (Visible on < 1024px) */}
        <MobileNavbar 
          onToggleMenu={() => setIsMobileMenuOpen((prev) => !prev)}
          currentLot="NASA-MOSFET-199C"
        />

        <main className="app-main-content">
          <CurrentPageComponent 
            onNavigate={handleNavigate}
            onNavigateToComponent={handleNavigateToComponent}
            initialComponentId={selectedComponentId}
          />
        </main>
      </div>
      <Analytics />
    </div>
  );
}
