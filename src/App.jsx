import React, { useState, useEffect, useCallback } from 'react';
import { Analytics } from '@vercel/analytics/react';
import Sidebar from './components/Sidebar';
import MobileNavbar from './components/MobileNavbar';
import ScreeningHistory from './components/dashboard/ScreeningHistory';
import Dashboard from './pages/Dashboard';
import ComponentSearch from './pages/ComponentSearch';
import ScreeningPipeline from './pages/ScreeningPipeline';
import ModelPerformance from './pages/ModelPerformance';
import ObservabilityStudy from './pages/ObservabilityStudy';
import Reports from './pages/Reports';
import FailureAnalysis from './pages/FailureAnalysis';
import SystemSettings from './pages/SystemSettings';
import { API_BASE_URL } from './config/api';

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
  const [selectedLotId, setSelectedLotId] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const lot = params.get('lot');
    return (lot && lot !== 'ALL') ? lot : null;
  });
  const [selectedComponentId, setSelectedComponentId] = useState(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [screeningHistory, setScreeningHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  // 1. Fetch Screening History independently on mount
  const loadHistory = useCallback(async () => {
    setIsLoadingHistory(true);
    try {
      const histRes = await fetch(`${API_BASE_URL}/api/screening/history`);
      if (histRes.ok) {
        const histResult = await histRes.json();
        if (histResult.success && Array.isArray(histResult.data)) {
          setScreeningHistory(histResult.data);
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

  // Handle browser back/forward history events
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      setCurrentPath(path in PAGE_ROUTES ? path : '/');
      const params = new URLSearchParams(window.location.search);
      const lot = params.get('lot');
      setSelectedLotId((lot && lot !== 'ALL') ? lot : null);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleNavigate = (path) => {
    const searchParams = new URLSearchParams(window.location.search);
    if (selectedLotId && selectedLotId !== 'ALL') {
      searchParams.set('lot', selectedLotId);
    } else {
      searchParams.delete('lot');
    }
    const newSearch = searchParams.toString();
    const targetUrl = `${path}${newSearch ? `?${newSearch}` : ''}`;

    if (path !== currentPath) {
      window.history.pushState({}, '', targetUrl);
      setCurrentPath(path);
    }
    setIsMobileMenuOpen(false);
  };

  const handleNavigateToComponent = (componentId) => {
    setSelectedComponentId(componentId);
    handleNavigate('/components');
  };

  const handleSelectLot = (lotId) => {
    const effective = (!lotId || lotId === 'ALL') ? null : lotId;
    setSelectedLotId(effective);

    const searchParams = new URLSearchParams(window.location.search);
    if (effective) {
      searchParams.set('lot', effective);
    } else {
      searchParams.delete('lot');
    }
    const newSearch = searchParams.toString();
    const targetUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ''}`;
    window.history.pushState({}, '', targetUrl);
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
          currentLot={selectedLotId || 'ALL LOTS'}
        />

        {/* 3. Global Two-Column Workspace Layout (Main Content Left + Sticky Screening History Right) */}
        <div className="app-workspace-layout">
          <main className="app-main-content">
            <CurrentPageComponent 
              onNavigate={handleNavigate}
              onNavigateToComponent={handleNavigateToComponent}
              initialComponentId={selectedComponentId}
              selectedLotId={selectedLotId}
              onSelectLot={handleSelectLot}
              screeningHistory={screeningHistory}
              isLoadingHistory={isLoadingHistory}
            />
          </main>

          {/* Persistent Global Screening History Panel */}
          <aside className="app-history-sidebar" aria-label="Screening History Audit">
            <ScreeningHistory
              history={screeningHistory}
              isLoading={isLoadingHistory}
              onNavigate={handleNavigate}
              selectedLotId={selectedLotId}
              onSelectLot={handleSelectLot}
            />
          </aside>
        </div>
      </div>
      <Analytics />
    </div>
  );
}
