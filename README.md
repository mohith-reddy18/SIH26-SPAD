# SPAD — Space-Grade Anomaly Detection

> **AI-driven dynamic screening and early anomaly detection for high-reliability electronic components during burn-in / Environmental Stress Screening (ESS).**

**Smart India Hackathon 2026**  
**Problem Statement:** SIH26170 — AI-Driven Anomaly Detection in Component Burn-In & Screening  
**Organization:** ISRO  

---

## 1. Overview

High-reliability electronic components used in space missions undergo rigorous Environmental Stress Screening (ESS) and burn-in testing under elevated temperature and electrical conditions (e.g., 125°C thermal chambers). 

Traditional screening predominantly relies on static pass/fail engineering limits applied at individual checkpoints. While necessary, static limits alone can miss subtle signs of component degradation or anomalous drift that occur while a device is still technically within specification.

**SPAD (Space-Grade Anomaly Detection)** is a screening assistance system designed to complement standard engineering limits by analyzing how component parameters evolve across multiple burn-in checkpoints.

The prototype tracks critical electrical telemetry:
- **Standby Current ($I_{\text{ddq}}$)** [$\text{mA}$] — Quiescent drain current under high-temperature stress
- **Leakage Current ($I_{\text{leak}}$)** [$\mu\text{A}$] — Subthreshold and parasitic oxide leakage
- **Propagation Delay ($t_{\text{pd}}$)** [$\text{ns}$] — Switching speed degradation indicating gate aging

Across standard burn-in checkpoints:
$$\text{0h} \longrightarrow \text{24h} \longrightarrow \text{96h} \longrightarrow \text{168h}$$

The objective is to identify abnormal behaviors and predict potential future limit violations early, allowing engineers to hold or reject suspicious components before costly assembly and deployment.

---

## 2. Problem We Address

A component may remain within engineering limits at an early checkpoint while already exhibiting abnormal behavioral drift.

| Approach | Question Answered | Limitation |
| :--- | :--- | :--- |
| **Traditional Static Screening** | *"Has the component crossed the maximum limit right now?"* | Detects failures only after a hard breach has already occurred. |
| **SPAD Dynamic Screening** | 1. *"Is this component behaving differently from its lot peers?"*<br>2. *"Is its degradation trajectory abnormal over time?"*<br>3. *"Is it likely to violate engineering limits at later checkpoints?"* | Detects early anomalies before catastrophic failure occurs. |

---

## 3. Core Workflow

```
[ Measure ] ──► [ Validate ] ──► [ Detect ] ──► [ Understand ] ──► [ Predict ] ──► [ Decide ] ──► [ Learn ]
```

1. **Measure:** Ingest parametric measurements at each burn-in checkpoint (0h, 24h, 96h, 168h).
2. **Validate:** Verify data integrity, sensor bounds, and checkpoint continuity.
3. **Detect:** Identify statistical outliers across the lot population and detect trajectory divergence over time.
4. **Understand:** Generate explainable evidence indicators highlighting why a component was flagged.
5. **Predict:** Forecast parameter trends toward the 168h mark based on early trajectory data.
6. **Decide:** Augment engineering review with clear screening recommendations: **PASS**, **HOLD**, or **REJECT**.
7. **Learn:** Ingest confirmed physical failure analysis (FA) results to continuously refine anomaly baselines.

---

## 4. AI Evidence Pathways

SPAD evaluates components through three complementary evidence pathways:

```
                          ┌───────────────────────────────┐
                          │     Parametric Telemetry      │
                          └──────────────┬────────────────┘
                                         │
                 ┌───────────────────────┼───────────────────────┐
                 ▼                       ▼                       ▼
    ┌─────────────────────────┐ ┌───────────────────┐ ┌─────────────────────┐
    │  Population Abnormality │ │     Trajectory    │ │     Future-Risk     │
    │        (Peers)          │ │    Degradation    │ │     Prediction      │
    └────────────┬────────────┘ └─────────┬─────────┘ └──────────┬──────────┘
                 │                        │                      │
                 └───────────────────────►▼◄─────────────────────┘
                                         │
                             ┌───────────────────────┐
                             │  Augmented Decision   │
                             │  (PASS / HOLD / REJ)  │
                             └───────────────────────┘
```

### 1. Population Abnormality
- **Core Question:** *"Is this component statistically unusual compared with its lot peers at the current checkpoint?"*
- **Mechanism:** Identifies distribution outliers across the active lot cohort.

### 2. Trajectory / Degradation Abnormality
- **Core Question:** *"Is the component's rate of change diverging from the nominal degradation baseline?"*
- **Mechanism:** Analyzes checkpoint-to-checkpoint delta slopes ($\Delta I_{\text{ddq}}$, $\Delta I_{\text{leak}}$, $\Delta t_{\text{pd}}$).

### 3. Future-Risk Prediction
- **Core Question:** *"Based on measurements up to the current stage (e.g., 96h), is the component likely to violate limits at 168h?"*
- **Mechanism:** Projects trajectory trends to calculate a future risk probability score ($0.00$ to $1.00$).

> *Note: In the current prototype, AI evidence pathways and risk scores are simulated using structured mock data to demonstrate the user workflow and screening interface.*

---

## 5. Engineering Decision Principle

> ### ⚠️ Core Operating Principle
> **AI AUGMENTS ENGINEERING SCREENING. AI DOES NOT OVERRIDE ENGINEERING SPECIFICATIONS.**

Engineering specification limits established by component qualification standards remain the definitive authority. SPAD provides assistive intelligence to prioritize suspect components for closer engineering inspection.

### Screening Classifications:
- **`PASS`**: Component parameters are within nominal ranges and exhibit stable degradation trajectories matching the healthy baseline.
- **`HOLD`**: Component is currently within specification limits but exhibits suspicious population variance or rapid trajectory drift. Recommended for extended burn-in or engineering review.
- **`REJECT`**: Component has violated hard engineering limits or demonstrates conclusive trajectory divergence with high failure probability.

---

## 6. Dashboard Features

The SPAD Dashboard provides a unified command overview for burn-in screening:

- **Summary Cards:** Real-time counts and percentage progress bars for *Total Components*, *Passed*, *Hold*, *Rejected*, and *Lots Processed*.
- **Screening Pipeline:** Multi-stage checkpoint tracker (0h, 24h, 96h, 168h) displaying active stage progress, chamber environmental telemetry (125°C), and lot context.
- **Evidence Pathways:** Tri-pathway diagnostic status cards showing flagged units, evidence distribution, and screening confidence.
- **Parameter Trends:** Interactive SVG parametric degradation chart with dynamic parameter and component selection.
- **Detailed Component View:** Filterable component table with real-time status badges, risk scores, and evidence summaries.
- **System Health & Recent Alerts:** Subsystem operational status and live event stream.

---

## 7. Interactive Parameter Trends

The Parameter Trends panel enables granular visual analysis of burn-in parametric behavior:

- **Viewing Modes:**
  - **Component View:** Focuses on a selected component's trajectory against the Healthy/Nominal Reference line and the Max Engineering Limit. Includes a compact metadata badge (`Lot ID`, `Status`, `Risk Score`).
  - **Lot Overview:** Displays a representative cohort (`PASS`, `HOLD`, `REJECT` components) on the same axis for comparative drift analysis.
- **Supported Parameters & Units:**
  - **Standby Current ($I_{\text{ddq}}$)** — Unit: $\text{mA}$ | Spec Limit: $4.00\text{ mA}$
  - **Leakage Current ($I_{\text{leak}}$)** — Unit: $\mu\text{A}$ | Spec Limit: $1.50\ \mu\text{A}$
  - **Propagation Delay ($t_{\text{pd}}$)** — Unit: $\text{ns}$ | Spec Limit: $11.00\text{ ns}$
- **Interactive Tooltip:** Hovering over any data point node reveals the Component ID, Checkpoint Time, Parameter Value, and Decision Status.
- **Explicit Identifiers:** All plotted lines and legend entries display actual component IDs (e.g., `C-0003 — REJECT`, `C-0001 — PASS`) rather than generic labels.

---

## 8. Component Search

The dedicated **Component Search** page (`/components`) provides unit-level traceability:

- **Instant Search:** Filter components by Component ID (e.g., `C-0001`), Lot Number (e.g., `LOT-2026-001`), or flagged evidence keywords.
- **Decision Status Filter:** Quick filter tabs for `ALL`, `PASS`, `HOLD`, and `REJECT`.
- **Parametric Detail:** Displays multi-parameter readings ($I_{\text{ddq}}$, $I_{\text{leak}}$, $t_{\text{pd}}$), limit compliance, AI risk scores, and primary screening evidence.

---

## 9. Application Navigation

| Page | Route | Status | Description |
| :--- | :--- | :--- | :--- |
| **Dashboard** | `/` | **Implemented** | Main burn-in screening overview and telemetry trends |
| **Component Search** | `/components` | **Implemented** | Component-level search, filtering, and inspection |
| **Screening Pipeline** | `/screening-pipeline` | *Under Development* | Multi-lot batch pipeline management and chamber routing |
| **Model Performance** | `/model-performance` | *Under Development* | Anomaly detection precision, recall, and ROC analysis |
| **Observability Study** | `/observability` | *Under Development* | Population distribution histograms and statistical bounds |
| **Reports** | `/reports` | *Under Development* | Exportable MIL-STD screening compliance certificates |
| **Failure Analysis** | `/failure-analysis` | *Under Development* | Physical root-cause analysis logging and model retraining |
| **System Settings** | `/settings` | *Under Development* | Engineering limit thresholds and sensor calibration |

---

## 10. Technology Stack

### Current Prototype:
- **Core:** React 19, JavaScript (ES Modules)
- **Build Tool:** Vite 8
- **Styling:** Vanilla CSS with custom design tokens (dark aerospace theme, responsive flexbox & grid layouts)
- **Visualizations:** Native SVG charts with dynamic responsive scaling and tooltips
- **Linter:** Oxlint

### Planned Backend Architecture:
- **Backend API:** Node.js + Express.js (REST API for lot ingestion and component queries)
- **Database:** MongoDB with Mongoose (storing lot runs, component serials, and checkpoint readings)
- **AI/ML Service:** Python / Microservice (statistical outlier detection and trajectory degradation models)

---

## 11. Project Structure

```
SIH26/
├── index.html                   # HTML entry point with font preloads
├── package.json                 # Project dependencies and npm scripts
├── vite.config.js               # Vite build configuration
├── public/                      # Static assets
└── src/
    ├── App.jsx                  # Main application container & view routing
    ├── App.css                  # Top-level application layout styling
    ├── index.css                # Global CSS design tokens and base styles
    ├── main.jsx                 # React root render entry
    ├── components/
    │   ├── Sidebar.jsx          # Left vertical navigation sidebar
    │   ├── Sidebar.css          # Desktop fixed sidebar styling
    │   ├── MobileNavbar.jsx     # Responsive mobile header topbar
    │   ├── MobileNavbar.css     # Mobile topbar styling
    │   └── dashboard/
    │       ├── StatCards.jsx        # Summary stat metrics with progress bars
    │       ├── ScreeningPipeline.jsx # Checkpoint pipeline & chamber context
    │       ├── EvidencePathways.jsx  # Tri-pathway AI reasoning cards
    │       ├── ParameterTrends.jsx   # Interactive SVG trajectory trend chart
    │       ├── ComponentTable.jsx    # Full-width detailed component table
    │       ├── SystemStatus.jsx      # System health and subsystem indicators
    │       └── RecentAlerts.jsx      # Telemetry event stream & alerts
    ├── pages/
    │   ├── Dashboard.jsx        # Main screening dashboard
    │   ├── Dashboard.css        # Dashboard-specific grid and card styles
    │   ├── ComponentSearch.jsx  # Component search & inspection page
    │   ├── ScreeningPipeline.jsx# [Planned] Pipeline page placeholder
    │   ├── ModelPerformance.jsx # [Planned] Model performance placeholder
    │   ├── ObservabilityStudy.jsx# [Planned] Observability placeholder
    │   ├── Reports.jsx          # [Planned] Screening reports placeholder
    │   ├── FailureAnalysis.jsx  # [Planned] Failure analysis placeholder
    │   └── SystemSettings.jsx   # [Planned] Settings placeholder
    └── data/
        └── mockData.js          # Centralized single source of truth for mock data
```

---

## 12. Mock Data Architecture

To maintain separation of concerns and enable seamless future API integration, all mock data is centralized in [`src/data/mockData.js`](src/data/mockData.js).

- **`mockComponents`**: Array of component records (`C-0001` through `C-0012`) with full multi-checkpoint telemetry (`0h`, `24h`, `96h`, `168h`), limit status, risk scores, and evidence labels.
- **`mockParameterSpecs`**: Parameter definitions, measurement keys, engineering spec limits, and nominal baseline references.
- **`mockScreeningContext`**: Active lot ID, chamber temperature (125°C), screening stage, and progress.
- **`mockSummaryStats` & `mockPipelineStages`**: Aggregate lot screening metrics and stage progression.

> *Note: Mock data is designed strictly for UI workflow simulation and does not represent actual test data from operational space missions.*

---

## 13. Data Architecture

```
CURRENT PROTOTYPE
┌─────────────────────────┐
│     mockData.js         │ ──► [ React State ] ──► [ Dashboard & UI Views ]
└─────────────────────────┘

FUTURE ARCHITECTURE (PLANNED)
┌─────────────────────────┐
│   Component Test Data   │
│   (ESS Chamber Ingest)  │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐
│   Data Validation &     │
│   Integrity Ingestion   │
└───────────┬─────────────┘
            ▼
┌─────────────────────────┐     ┌─────────────────────────┐
│     Node.js / Express   │◄───►│       MongoDB           │
│         REST API        │     │  (Lots, Serials, Data)  │
└───────────┬─────────────┘     └─────────────────────────┘
            │
            ├──────────────────►┌─────────────────────────┐
            │                   │   AI / ML Analysis      │
            │                   │  (Outlier & Drift Mod)  │
            │                   └───────────┬─────────────┘
            ▼                               │
┌─────────────────────────┐                 │
│     React Dashboard     │◄────────────────┘
│  (Screening Operations) │
└─────────────────────────┘
```

---

## 14. Getting Started

### Prerequisites
- Node.js (v18 or higher recommended)
- npm or yarn

### Installation & Local Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/mohith-reddy18/SIH26-SPAD.git
   cd SIH26-SPAD
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the development server:**
   ```bash
   npm run dev
   ```

4. **Open your browser:**
   Navigate to the URL displayed in the terminal (typically `http://localhost:5173`).

5. **Build for production:**
   ```bash
   npm run build
   ```

---

## 15. Disclaimer

This repository is an academic prototype developed for **Smart India Hackathon 2026** under Problem Statement **SIH26170**. It represents an experimental concept for AI-augmented component screening. It is not currently certified, qualified, or validated on real ISRO mission hardware.
