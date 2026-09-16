import React from 'react';

export default function ComponentSearch() {
  return (
    <div className="spad-page-container">
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">Component Search</h1>
          <span className="spad-page-tag">INSPECTION &bull; TRACEABILITY</span>
        </div>
        <p className="spad-page-description">
          Search and query individual components, serial numbers, and screening test history across lot runs.
        </p>
      </header>

      <div className="spad-page-placeholder">
        <div className="spad-placeholder-badge">MODULE: COMPONENT SEARCH (02)</div>
        <p className="spad-placeholder-text">
          Component lookup, parametric measurement filters (Iddq, Leakage, Propagation Delay), and component inspection logs will be mounted here.
        </p>
      </div>
    </div>
  );
}
