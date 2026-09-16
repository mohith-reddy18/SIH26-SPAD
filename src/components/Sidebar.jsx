import React from 'react';
import './Sidebar.css';

/**
 * Technical aerospace & high-reliability electronics icons
 * Rendered as precision SVG components with consistent 24x24 viewBox & 2px stroke
 */
function DashboardIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect width="7" height="9" x="3" y="3" rx="1" />
      <rect width="7" height="5" x="14" y="3" rx="1" />
      <rect width="7" height="9" x="14" y="12" rx="1" />
      <rect width="7" height="5" x="3" y="16" rx="1" />
    </svg>
  );
}

function SearchIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function PipelineIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="6" x2="6" y1="3" y2="15" />
      <circle cx="18" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M18 9a9 9 0 0 1-9 9" />
    </svg>
  );
}

function PerformanceIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    </svg>
  );
}

function ObservabilityIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34" />
      <path d="M4 6h.01" />
      <path d="M2.29 9.62A10 10 0 1 0 21.31 8.35" />
      <circle cx="12" cy="12" r="2" />
      <path d="m13.41 10.59 5.66-5.66" />
    </svg>
  );
}

function ReportsIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  );
}

function FailureIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 2v7.31" />
      <path d="M14 9.3V1.99" />
      <path d="M8.5 2h7" />
      <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
      <path d="M5.52 16h12.96" />
    </svg>
  );
}

function SettingsIcon({ className }) {
  return (
    <svg className={className} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/**
 * Aerospace & Microelectronics Emblem (SPAD Mission Mark)
 */
function SpadLogo() {
  return (
    <div className="spad-logo-wrapper" aria-hidden="true">
      <svg className="spad-emblem-svg" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="spadGlow" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
        </defs>
        {/* Outer orbital trajectory ring */}
        <circle cx="18" cy="18" r="15" stroke="rgba(56, 189, 248, 0.25)" strokeWidth="1.2" strokeDasharray="3 3" />
        {/* High-reliability microchip package square */}
        <rect x="10" y="10" width="16" height="16" rx="2.5" fill="#0c1527" stroke="url(#spadGlow)" strokeWidth="1.6" />
        {/* Microchip lead pins */}
        <line x1="14" y1="7" x2="14" y2="10" stroke="#38bdf8" strokeWidth="1.2" />
        <line x1="22" y1="7" x2="22" y2="10" stroke="#38bdf8" strokeWidth="1.2" />
        <line x1="14" y1="26" x2="14" y2="29" stroke="#38bdf8" strokeWidth="1.2" />
        <line x1="22" y1="26" x2="22" y2="29" stroke="#38bdf8" strokeWidth="1.2" />
        <line x1="7" y1="14" x2="10" y2="14" stroke="#38bdf8" strokeWidth="1.2" />
        <line x1="7" y1="22" x2="10" y2="22" stroke="#38bdf8" strokeWidth="1.2" />
        <line x1="26" y1="14" x2="29" y2="14" stroke="#38bdf8" strokeWidth="1.2" />
        <line x1="26" y1="22" x2="29" y2="22" stroke="#38bdf8" strokeWidth="1.2" />
        {/* Core telemetry sensor node */}
        <circle cx="18" cy="18" r="3" fill="#38bdf8" />
      </svg>
    </div>
  );
}

/**
 * NAVIGATION ITEMS SPECIFICATION
 * EXACT ORDER:
 * 1. Dashboard
 * 2. Component Search
 * 3. Screening Pipeline
 * 4. Model Performance
 * 5. Observability Study
 * 6. Reports
 * 7. Failure Analysis
 * 8. System Settings
 */
export const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    path: '/',
    icon: DashboardIcon,
    code: 'NAV-01',
  },
  {
    id: 'component-search',
    label: 'Component Search',
    path: '/components',
    icon: SearchIcon,
    code: 'NAV-02',
  },
  {
    id: 'screening-pipeline',
    label: 'Screening Pipeline',
    path: '/screening-pipeline',
    icon: PipelineIcon,
    code: 'NAV-03',
  },
  {
    id: 'model-performance',
    label: 'Model Performance',
    path: '/model-performance',
    icon: PerformanceIcon,
    code: 'NAV-04',
  },
  {
    id: 'observability',
    label: 'Observability Study',
    path: '/observability',
    icon: ObservabilityIcon,
    code: 'NAV-05',
  },
  {
    id: 'reports',
    label: 'Reports',
    path: '/reports',
    icon: ReportsIcon,
    code: 'NAV-06',
  },
  {
    id: 'failure-analysis',
    label: 'Failure Analysis',
    path: '/failure-analysis',
    icon: FailureIcon,
    code: 'NAV-07',
  },
  {
    id: 'system-settings',
    label: 'System Settings',
    path: '/settings',
    icon: SettingsIcon,
    code: 'NAV-08',
  },
];

/**
 * Sidebar Component for SPAD: Space-Grade Anomaly Detection
 * Supports both fixed desktop mode and sliding mobile drawer mode.
 * 
 * @param {Object} props
 * @param {string} [props.activePath='/'] - Current active route path
 * @param {Function} [props.onNavigate] - Navigation handler callback
 * @param {boolean} [props.isOpen=false] - Mobile drawer open state
 * @param {Function} [props.onClose] - Mobile drawer close callback
 */
export default function Sidebar({ activePath = '/', onNavigate, isOpen = false, onClose }) {
  const handleItemClick = (item, e) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(item.path);
    }
    if (onClose) {
      onClose();
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      <div 
        className={`spad-sidebar-overlay ${isOpen ? 'active' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside className={`spad-sidebar ${isOpen ? 'drawer-open' : ''}`} aria-label="Primary Navigation">
        {/* 1. Header / Aerospace Branding */}
        <div className="spad-sidebar-header">
          <div className="spad-brand-row">
            <SpadLogo />
            <div className="spad-title-block">
              <span className="spad-brand-title">SPAD</span>
              <span className="spad-brand-badge">AEROSPACE GRADE</span>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          <button 
            type="button" 
            className="spad-sidebar-close-btn" 
            onClick={onClose}
            aria-label="Close Navigation Menu"
          >
            <CloseIcon />
          </button>
        </div>

        <div className="spad-brand-subtitle">
          Space-Grade Anomaly Detection
        </div>

        {/* 2. Navigation Items List */}
        <nav className="spad-nav-container">
          <div className="spad-nav-section-label">SCREENING & CONTROL</div>
          <ul className="spad-nav-list" role="list">
            {NAV_ITEMS.map((item) => {
              const isActive = activePath === item.path;
              const Icon = item.icon;

              return (
                <li key={item.id} className="spad-nav-item">
                  <a
                    href={item.path}
                    onClick={(e) => handleItemClick(item, e)}
                    className={`spad-nav-link ${isActive ? 'active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span className="spad-nav-icon-wrapper">
                      <Icon className="spad-nav-icon" />
                    </span>
                    <span className="spad-nav-label">{item.label}</span>
                    {isActive && <span className="spad-active-indicator" aria-hidden="true" />}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* 3. Bottom Version & System Indicator */}
        <div className="spad-sidebar-footer">
          <div className="spad-system-status">
            <span className="spad-status-dot" aria-hidden="true"></span>
            <div className="spad-status-text">
              <span className="spad-status-header">SPAD v1.0</span>
              <span className="spad-status-sub">Screening System</span>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
