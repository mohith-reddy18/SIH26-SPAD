import { useState, useEffect } from 'react';
import Sidebar, { NAV_ITEMS } from './components/Sidebar';

function App() {
  const [activeId, setActiveId] = useState('dashboard');

  // Sync state with browser location path if loaded directly or navigating
  useEffect(() => {
    const currentPath = window.location.pathname;
    const matchedItem = NAV_ITEMS.find((item) => item.path === currentPath);
    if (matchedItem) {
      setActiveId(matchedItem.id);
    }

    const handlePopState = () => {
      const match = NAV_ITEMS.find((item) => item.path === window.location.pathname);
      if (match) {
        setActiveId(match.id);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleItemSelect = (item) => {
    setActiveId(item.id);
    window.history.pushState({}, '', item.path);
  };

  const activeItem = NAV_ITEMS.find((item) => item.id === activeId) || NAV_ITEMS[0];

  return (
    <div className="app-container">
      {/* Fixed Left Vertical Navigation Sidebar */}
      <Sidebar activeId={activeId} onItemSelect={handleItemSelect} />

      {/* Main Content Area (starts immediately to the right of fixed sidebar) */}
      <main className="app-main-content">
        {/* Minimal System Topbar */}
        <header className="spad-topbar-placeholder">
          <div className="spad-view-badge">
            <span>SPAD CONTROL</span>
            <span>/</span>
            <span className="spad-view-badge-active">{activeItem.label}</span>
          </div>
          <div className="spad-telemetry-pill">
            <span>RAD-HARD TELEMETRY READY</span>
          </div>
        </header>

        {/* Minimal View Placeholder (Content will be added in subsequent steps) */}
        <section className="spad-placeholder-view">
          <h1 className="spad-placeholder-heading">{activeItem.label}</h1>
          <p className="spad-placeholder-desc">
            Space-Grade Anomaly Detection &bull; AI-Driven Dynamic Screening for High-Reliability Electronics
          </p>

          <div className="spad-placeholder-card">
            <span className="spad-placeholder-card-title">{activeItem.code} &mdash; {activeItem.label.toUpperCase()} VIEW</span>
            <span className="spad-placeholder-card-hint">Navigation active. Module content ready to be mounted.</span>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
