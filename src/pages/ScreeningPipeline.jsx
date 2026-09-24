import React, { useState, useEffect, useMemo } from 'react';
import ScreeningPipelineCard from '../components/dashboard/ScreeningPipeline';
import { mockPipelineStages, mockScreeningContext } from '../data/mockData';
import { getNormalizedEngineeringStatus } from '../utils/recordMapping';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'https://sih26-spad.onrender.com';

export default function ScreeningPipeline() {
  const [screeningRecords, setScreeningRecords] = useState([]);
  const [selectedLotId, setSelectedLotId] = useState(null);
  const [dataSource, setDataSource] = useState('fallback'); // 'api' | 'fallback'
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);

  // Fetch lot-level screening records from backend API
  useEffect(() => {
    let isMounted = true;

    async function loadPipelineData() {
      setIsLoading(true);
      setFetchError(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/screening`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && Array.isArray(result.data) && result.data.length > 0) {
            if (isMounted) {
              setScreeningRecords(result.data);
              setDataSource('api');
              const firstLot = result.data[0].lotId || 'LOT-2026-001';
              setSelectedLotId((prev) => prev || firstLot);
            }
            return;
          }
        }
        // Fallback when API returns empty/unexpected structure
        if (isMounted) {
          console.warn('[SPAD] API returned empty/invalid records; using mock fallback.');
          setDataSource('fallback');
        }
      } catch (err) {
        if (isMounted) {
          console.warn('[SPAD] Failed to fetch screening records from backend:', err.message);
          setFetchError(err.message);
          setDataSource('fallback');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPipelineData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Group screening records by lotId for lot-level pipeline analysis
  const lotsMap = useMemo(() => {
    const map = {};
    if (dataSource === 'api' && screeningRecords.length > 0) {
      screeningRecords.forEach((rec) => {
        const lot = rec.lotId || 'LOT-2026-001';
        if (!map[lot]) {
          map[lot] = [];
        }
        map[lot].push(rec);
      });
    }
    return map;
  }, [screeningRecords, dataSource]);

  const availableLotIds = useMemo(() => Object.keys(lotsMap), [lotsMap]);
  const activeLotId = selectedLotId || availableLotIds[0] || mockScreeningContext.lotId;
  const currentLotRecords = lotsMap[activeLotId] || [];

  // Derive lot-level screening context from database data
  const lotContext = useMemo(() => {
    if (dataSource === 'api' && currentLotRecords.length > 0) {
      const totalUnits = currentLotRecords.length;
      const normalCount = currentLotRecords.filter(
        (r) => getNormalizedEngineeringStatus(r) === 'NORMAL'
      ).length;
      const anomaliesCount = currentLotRecords.filter(
        (r) => getNormalizedEngineeringStatus(r) !== 'NORMAL'
      ).length;
      const currentYieldPct = totalUnits > 0 ? `${((normalCount / totalUnits) * 100).toFixed(1)}%` : '100.0%';
      const activeStage = currentLotRecords[0].stage || '24h';

      return {
        lotId: activeLotId,
        lotStatus: 'PREDICTIVE SCREENING ACTIVE',
        currentStage: activeStage,
        currentProgressPercent: 75,
        totalUnits: totalUnits,
        screenedUnits: totalUnits,
        currentYield: currentYieldPct,
        anomaliesDetected: anomaliesCount,
        nextGate: '168h Physical Validation Gate',
        temperature: '125°C',
        chamberId: 'CHAMBER-B4-RAD',
        operator: 'ENG-MIL-SPEC-883',
      };
    }

    // Fallback context when API data is unavailable
    return mockScreeningContext;
  }, [currentLotRecords, activeLotId, dataSource]);

  // Derive pipeline stage status
  const pipelineStages = useMemo(() => {
    if (dataSource === 'api' && currentLotRecords.length > 0) {
      const sample = currentLotRecords[0];
      const hasBaseline = Boolean(sample.measurements && Object.keys(sample.measurements).length > 0);
      const has24h = Boolean(sample.measurements && Object.keys(sample.measurements).length > 0);
      const hasPrediction = Boolean(sample.aiAssessment?.prediction || (sample.predictions && Object.keys(sample.predictions).length > 0));

      return [
        {
          id: 'stage-0h',
          timeLabel: '0h',
          name: 'Baseline Measurement',
          category: 'INPUT MEASUREMENT',
          status: hasBaseline ? 'complete' : 'pending',
          badge: hasBaseline ? 'Complete' : 'Pending',
          description: 'Initial room & high-temp physical baseline screening completed.',
          completedAt: '2026-09-12 10:30',
          sampleYield: '100%',
        },
        {
          id: 'stage-24h',
          timeLabel: '24h',
          name: 'Early Burn-In Check',
          category: 'INPUT MEASUREMENT',
          status: has24h ? 'complete' : 'pending',
          badge: has24h ? 'Complete' : 'Pending',
          description: 'Early thermal stress physical checkpoint verified; quick-drift input data acquired.',
          completedAt: '2026-09-13 10:30',
          sampleYield: '100%',
        },
        {
          id: 'stage-ai',
          timeLabel: 'AI',
          name: '168h Risk Prediction',
          category: 'AI PREDICTION',
          status: hasPrediction ? 'available' : 'pending',
          badge: hasPrediction ? 'Available' : 'Pending',
          description: 'Early AI Bayesian drift model forecasts 168h trajectory and limit breaches from 0h+24h inputs.',
          completedAt: '2026-09-13 11:00',
          sampleYield: `${lotContext.currentYield} Projected`,
        },
        {
          id: 'stage-168h',
          timeLabel: '168h',
          name: 'Physical Validation',
          category: 'PHYSICAL VALIDATION',
          status: 'pending',
          badge: 'Pending',
          description: 'Actual MIL-STD-883 physical qualification test executed later to validate predictions.',
          completedAt: null,
          sampleYield: 'Pending (Physical)',
        },
      ];
    }

    return mockPipelineStages;
  }, [currentLotRecords, lotContext, dataSource]);

  return (
    <div className="spad-page-container">
      {/* 1. Page Header */}
      <header className="spad-page-header">
        <div className="spad-page-title-row">
          <h1 className="spad-page-title">Screening Pipeline</h1>
          <span className="spad-page-tag">PREDICTIVE SCREENING WORKFLOW</span>
        </div>
        <p className="spad-page-description">
          Early predictive burn-in screening workflow: 0h &amp; 24h baseline physical measurements (Complete) &rarr; AI 168h Risk Prediction (Available) &rarr; 168h Physical Validation (Pending).
        </p>
      </header>

      {/* 2. Lot-Level Screening Pipeline Card */}
      <ScreeningPipelineCard stages={pipelineStages} context={lotContext} />
    </div>
  );
}
