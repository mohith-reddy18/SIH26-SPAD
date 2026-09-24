import React from 'react';
import './MobileNavbar.css';

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="4" x2="20" y1="12" y2="12" />
      <line x1="4" x2="20" y1="6" y2="6" />
      <line x1="4" x2="20" y1="18" y2="18" />
    </svg>
  );
}

function SpadMiniMark() {
  return (
    <svg width="24" height="24" viewBox="0 0 36 36" fill="none" aria-hidden="true">
      <circle cx="18" cy="18" r="15" stroke="rgba(56, 189, 248, 0.4)" strokeWidth="1.5" strokeDasharray="3 3" />
      <rect x="10" y="10" width="16" height="16" rx="2.5" fill="#0c1527" stroke="#38bdf8" strokeWidth="1.6" />
      <circle cx="18" cy="18" r="3" fill="#38bdf8" />
    </svg>
  );
}

export default function MobileNavbar({ onToggleMenu, currentLot = 'NASA-MOSFET-199C' }) {
  return (
    <header className="spad-mobile-topbar" aria-label="Mobile Header">
      <div className="spad-mobile-left">
        <button
          type="button"
          className="spad-mobile-menu-btn"
          onClick={onToggleMenu}
          aria-label="Open Navigation Menu"
        >
          <MenuIcon />
        </button>

        <div className="spad-mobile-brand">
          <SpadMiniMark />
          <span className="spad-mobile-title">SPAD</span>
        </div>
      </div>

      <div className="spad-mobile-right">
        <div className="spad-mobile-lot-pill">
          <span className="spad-mobile-pulse-dot" aria-hidden="true"></span>
          <span>{currentLot}</span>
        </div>
      </div>
    </header>
  );
}
