# SPAD — AI Model Developer Requirements & Integration Specification

**Document Version:** 1.0.0  
**Target Audience:** Machine Learning Engineers, Data Scientists, and AI Model Developers building the production AI models for the SPAD (Statistical Parametric Anomaly Detection) Platform.  
**System Boundary:** SPAD Node/Express Backend $\longleftrightarrow$ SPAD AI Inference Service / Model Engine.

---

## 1. Project Objective & System Overview

SPAD is an AI-assisted parametric anomaly detection and future-risk screening platform designed for high-reliability electronic component burn-in qualification and screening.

The production AI inference subsystem has **two mandatory and independent evaluation methods**:

1. **Method 1: 168h Future Trajectory & Risk Prediction**  
   Evaluates a single component's early burn-in observations ($0\text{h}$ and $24\text{h}$) to predict final-stage ($168\text{h}$) parametric drift and quantify end-of-life qualification risk.
2. **Method 2: Intra-Lot Statistical Peer Comparison & Anomaly Detection**  
   Evaluates a target component against eligible comparable units within the **same manufacturing lot** at the $24\text{h}$ intermediate inspection point to detect population outliers and anomalous degradation distributions.

```
+-------------------------------------------------------------------------------+
|                                  SPAD SYSTEM ARCHITECTURE                     |
|                                                                               |
|   React Frontend  <--->  Express Backend  <--->  AI Inference Adapter         |
|                             |                           |                     |
|                   [Deterministic Logic]        [AI Inference Engine]          |
|                   - engineeringStatus          - Method 1 (168h Drift)        |
|                   - rateOfChangePerHour        - Method 2 (Lot Anomalies)     |
|                   - projectedMargin            - Model Explanations           |
|                   - overallStatus              - Model Metadata               |
|                   - currentYield                                              |
+-------------------------------------------------------------------------------+
```

> [!IMPORTANT]
> **Separation of Concerns:**  
> AI assessment and deterministic engineering limits are **separate evidence pathways**. The AI model provides predictive risk scores and anomaly indicators; it **never directly computes or overrides `engineeringStatus`**.

---

## 2. Method 1: 168h Future Trajectory Prediction

### 2.1 Core Principle & Input Constraints
- **Core Input:** Early telemetry observations at $0\text{h}$ (pre-burn-in baseline) and $24\text{h}$ (intermediate burn-in).
- **Hard Rule:** Final-stage prediction ($168\text{h}$) **MUST operate exclusively from $0\text{h}$ and $24\text{h}$ data**. Telemetry at $96\text{h}$ or beyond **MUST NOT** be required.
- **Dynamic Parameters:** The model must accept dynamic parameter dictionaries (e.g., `iddq`, `leakage`, `propDelay`, `vth`, `rdsOn`, or custom customer telemetry channels) rather than assuming a hard-coded set.

### 2.2 Input Payload Contract
```json
{
  "componentId": "C-0001",
  "lotId": "LOT-2026-001",
  "parameters": {
    "iddq": {
      "unit": "mA",
      "observed": {
        "0h": 2.00,
        "24h": 2.10
      }
    },
    "leakage": {
      "unit": "µA",
      "observed": {
        "0h": 0.38,
        "24h": 0.40
      }
    }
  },
  "engineeringLimits": {
    "iddq": {
      "limitValue": 4.00,
      "direction": "UPPER",
      "source": "DATABASE_CATALOG"
    }
  },
  "context": {
    "deviceType": "Radiation-Hardened Power MOSFET",
    "chamberId": "CH-04"
  }
}
```

### 2.3 Model-Owned Output Specification
The AI model/service must return:
```json
{
  "predictions": {
    "<parameterName>": {
      "status": "PREDICTED",
      "predicted168h": 2.70,
      "predictionInterval": [2.55, 2.85],
      "futureRiskScore": 0.15,
      "futureRiskPercent": null,
      "limitBreachProbability": null,
      "aiFlag": "NOT FLAGGED",
      "modelExplanation": {
        "featureContributions": [
          { "feature": "0h-to-24h Slope", "value": 0.004167, "impact": -0.12 }
        ],
        "summary": "Stable trajectory closely following nominal baseline."
      }
    }
  }
}
```

### 2.4 Method 1 Field Semantics & Constraints
- `status`: `"PREDICTED"` when successful; `"UNSUPPORTED_PARAMETER"` if required telemetry is absent or non-numeric.
- `predicted168h`: (Numeric `float` or `null`). Required when `status === "PREDICTED"`.
- `predictionInterval`: (`[lower, upper]` or `null`). Optional; return only when calibrated confidence bounds (e.g. 95% interval) are mathematically computed.
- `futureRiskScore`: (`float` between `0.0` and `1.0`). Model-derived risk magnitude.
- `futureRiskPercent`: (`float` between `0.0` and `100.0` or `null`). Optional; allowed **only if properly calibrated as a genuine frequentist or Bayesian failure probability**.
- `limitBreachProbability`: (`float` between `0.0` and `1.0` or `null`). Probability of exceeding official engineering limit at 168h. Return `null` if no official limit exists.
- `aiFlag`: Must be strictly one of:
  - `"FLAGGED"` — Trajectory exhibits elevated degradation or projected limit breach risk.
  - `"NOT FLAGGED"` — Trajectory follows normal healthy behavior.
  - `"NOT_EVALUATED"` — Parameter telemetry insufficient or unsupported.
- `modelExplanation`: Optional structured explanation object (e.g. SHAP feature attributions).

---

## 3. Method 2: Intra-Lot Statistical Anomaly Detection

### 3.1 Core Principle & Same-Lot Isolation
- **Mandatory Same-Lot Rule:** Peer comparison must compare the target component **strictly against eligible units from the exact same manufacturing lot (`lotId`)**.
- **Cross-Lot Purity:** Never pull peers from different lots, arbitrary historical repositories, or uncalibrated global populations into the peer reference.
- **Minimum Cohort Size:** At least **3 comparable units** (target + at least 2 peers) in the same lot are required.
  - If $\text{cohort} < 3$: The AI model must return `status: "INSUFFICIENT_COHORT"`, `lotAnomalyScore: null`, and `aiFlag: "NOT_EVALUATED"`.

### 3.2 Input Payload Contract
```json
{
  "targetComponentId": "C-0001",
  "lotId": "LOT-2026-001",
  "cohort": [
    {
      "componentId": "C-0001",
      "lotId": "LOT-2026-001",
      "parameters": {
        "iddq": { "unit": "mA", "observed": { "0h": 2.00, "24h": 2.10 } }
      }
    },
    {
      "componentId": "C-0002",
      "lotId": "LOT-2026-001",
      "parameters": {
        "iddq": { "unit": "mA", "observed": { "0h": 2.00, "24h": 2.20 } }
      }
    },
    {
      "componentId": "C-0003",
      "lotId": "LOT-2026-001",
      "parameters": {
        "iddq": { "unit": "mA", "observed": { "0h": 2.10, "24h": 2.70 } }
      }
    }
  ],
  "context": { "lotSize": 12 }
}
```

### 3.3 Model-Owned Output Specification
```json
{
  "anomalyResults": {
    "<parameterName>": {
      "status": "ANALYZED",
      "lotAnomalyScore": 0.053,
      "peerComparisonEvidence": {
        "peerMean": 2.065,
        "peerStd": 0.182,
        "peerCount": 11,
        "zScore": 0.192
      },
      "divergenceType": "NOMINAL",
      "aiFlag": "NOT FLAGGED",
      "modelExplanation": null
    }
  }
}
```

### 3.4 Method 2 Field Semantics & Constraints
- `status`: `"ANALYZED"` when evaluated; `"UNSUPPORTED_PARAMETER"` or `"INSUFFICIENT_COHORT"` when data is insufficient.
- `lotAnomalyScore`: (`float` between `0.0` and `1.0` or `null`). Statistical outlier severity.
- `peerComparisonEvidence`: Dictionary containing computed peer metrics (e.g. `peerMean`, `peerStd`, `peerCount`, `zScore`, `mahalanobisDistance`, `isolationScore`).
- `divergenceType`: High-level distribution classification string (e.g. `"NOMINAL"`, `"ELEVATED_OUTLIER"`, `"DEPRESSED_OUTLIER"`, `"DISTRIBUTION_SHIFT"`, or `null`).
- `aiFlag`: Must be strictly `"FLAGGED"`, `"NOT FLAGGED"`, or `"NOT_EVALUATED"`.
- Algorithm Agnostic: The developer may utilize statistical methods, Mahalanobis distance, Isolation Forests, One-Class SVM, or autoencoders, provided the output adheres to this schema.

---

## 4. Backend-Owned Calculations (AI Must NOT Compute)

The following metrics are **strictly calculated by the backend** deterministically. The AI model must **NOT** attempt to calculate, override, or include these fields:

| Field | Owner | Formula / Rule |
| :--- | :--- | :--- |
| `rateOfChangePerHour` | **Backend** | $\text{RoC} = \frac{\text{val}_{24\text{h}} - \text{val}_{0\text{h}}}{24}$ |
| `projectedMargin` | **Backend** | Upper limit: $\text{Limit} - \text{Predicted}_{168\text{h}}$<br>Lower limit: $\text{Predicted}_{168\text{h}} - \text{Limit}$ |
| `engineeringStatus` | **Backend** | $0$ distinct official limit breaches $\rightarrow$ `NORMAL`<br>$1$ distinct official limit breach $\rightarrow$ `SUSPECT`<br>$\ge 2$ distinct official limit breaches $\rightarrow$ `CRITICAL` |
| `aiAssessment.overallStatus` | **Backend** | Any valid `FLAGGED` $\rightarrow$ `FLAGGED`<br>$\ge 1$ evaluated and $0$ flagged $\rightarrow$ `NOT FLAGGED`<br>All `NOT_EVALUATED` $\rightarrow$ `NOT_EVALUATED` |
| `currentYield` | **Backend** | $\text{Yield} = \frac{\text{Count}(\text{NORMAL})}{\text{Total Components}} \times 100$ |

---

## 5. Engineering Limit Safety & Authority

1. **Official Limits (`DATABASE_CATALOG`, `SUPPLIED`):**  
   These are formal manufacturer datasheet limits or customer specifications. Only official limits determine `engineeringStatus` and `projectedMargin`.
2. **AI-Estimated Boundaries (`AI_ESTIMATED_BOUNDARY`):**  
   May be produced by AI for advisory visualization, but **MUST NEVER** determine `engineeringStatus`.
3. **No Limits (`NONE_AVAILABLE`):**  
   Method 1 prediction and risk scoring still execute normally. `projectedMargin` and `limitBreachProbability` must remain `null`.

---

## 6. Model Metadata & Traceability

Every inference response must include verifiable model metadata:

```json
{
  "modelMetadata": {
    "modelName": "SPAD-Trajectory-Transformer-V1",
    "modelVersion": "1.2.0-prod",
    "inferenceTimestamp": "2026-09-24T10:00:00.000Z"
  }
}
```

- **Environment Configurable:**  
  The backend expects the model service to supply its active version or receive it via `AI_MODEL_NAME` and `AI_MODEL_VERSION`.
- **No Masquerading:**  
  Experimental or heuristic fallback logic must clearly declare non-production versions (e.g. `1.0.0-dev`).

---

## 7. Explainability Guidelines

- **Explainability Target:**  
  Provide explanations for *why the model flagged a component* (e.g., feature importance, rate-of-drift contribution, peer deviation distance).
- **No Fabricated SHAP:**  
  If the model architecture does not support TreeSHAP / KernelSHAP, do not synthesize mock feature weights. Provide true analytical metrics (e.g., delta magnitude, normalized z-score).
- **Causality Disclaimer:**  
  Model explanations represent mathematical feature attribution, not definitive physical failure mechanisms (such as oxide breakdown or electromigration).

---

## 8. Model Validation & Leakage Prevention Requirements

### 8.1 Validation Metrics
The AI developer must document and provide formal validation results on held-out test datasets:
- **Method 1 (Regression):** Mean Absolute Error (MAE), Root Mean Squared Error (RMSE), Median Absolute Error (MedAE), and Prediction Interval Coverage Probability (PICP) for intervals.
- **Method 2 (Anomaly Detection):** False Positive Rate at target Recall, ROC-AUC / PR-AUC on ground-truth outlier benchmarks, and inter-lot stability.

### 8.2 Strict Data Leakage Safeguards
- **Temporal Isolation:** Future burn-in telemetry ($48\text{h}$, $96\text{h}$, $168\text{h}$) must **never** be accessible to Method 1 during feature extraction or model inference.
- **Cohort Target Exclusion:** The target component under evaluation must not bias its own peer reference baseline during variance calculation.
- **Split Purity:** Train, validation, and test datasets must be split **by physical device / lot** to prevent data from the same silicon die or package appearing across splits.

---

## 9. Edge Cases & Insufficient-Data Behavior

| Scenario | Expected Method 1 Behavior | Expected Method 2 Behavior |
| :--- | :--- | :--- |
| **Missing $0\text{h}$ or $24\text{h}$** | `status: "UNSUPPORTED_PARAMETER"`, `predicted168h: null`, `aiFlag: "NOT_EVALUATED"` | Evaluates if $24\text{h}$ exists; otherwise `NOT_EVALUATED` |
| **Non-numeric / NaN value** | Graceful rejection with `NOT_EVALUATED` | Graceful rejection with `NOT_EVALUATED` |
| **Same-lot cohort $< 3$ units** | Evaluates normally (M1 is component-level) | `status: "INSUFFICIENT_COHORT"`, `lotAnomalyScore: null`, `aiFlag: "NOT_EVALUATED"` |
| **Missing engineering limit** | Generates prediction; `margin = null`, `breachProb = null` | Evaluates normally against peers |
| **Zero/Near-Zero baseline** | Avoid division-by-zero; use absolute delta fallback | Compute robust standard deviation with minimum epsilon floor |
| **Inference Service Down** | Returns HTTP 503 `MODEL_UNAVAILABLE` | Returns HTTP 503 `MODEL_UNAVAILABLE` |

---

## 10. Integration Interfaces

The AI developer can implement the inference engine either as:

### Option A: Remote HTTP Microservice (Recommended)
Expose an HTTP service listening on `AI_SERVICE_URL` with endpoints:
- `POST /predict-168h`
- `POST /detect-lot-anomalies`

The service must respond within `AI_SERVICE_TIMEOUT_MS` (default `5000ms`).

### Option B: Node.js In-Process Adapter
Implement the exported functions in [`backend/services/aiService.js`](file:///c:/college/SIH26/SIH26/backend/services/aiService.js):
```javascript
async function predict168h(input) { ... }
async function detectLotAnomalies(input) { ... }
```

---

## 11. Context Regarding NASA MOSFET V1 Experiment

> [!NOTE]
> The early NASA MOSFET V1 experiment in the project repository served as a **proof-of-concept and methodological reference** demonstrating that $0\text{h} \rightarrow 24\text{h}$ degradation trajectories correlate with final screening failures.  
>  
> The production SPAD model **is NOT restricted to Random Forest or Isolation Forest**, nor is it bound to the specific features or hyper-parameters of the NASA prototype. The production architecture should be selected and justified based on the real dataset characteristics.

---

## 12. Final AI Developer Deliverables Checklist

Before production handoff, the AI developer must deliver:

- [ ] **1. Trained Model Artifacts & Weights** (e.g. ONNX, SavedModel, or serializable pipeline).
- [ ] **2. Inference Service Code** implementing `POST /predict-168h` and `POST /detect-lot-anomalies`.
- [ ] **3. Preprocessing & Feature Engineering Pipeline** (handling scaling, unit conversion, and dynamic channels).
- [ ] **4. Model Validation & Benchmarking Report** detailing MAE, RMSE, and anomaly detection metrics on test lots.
- [ ] **5. Supported Parameter Catalog & Bounds** defining known channels and valid physical ranges.
- [ ] **6. Model Limitations & Operational Domain Specification**.
- [ ] **7. Deployment & Containerization Instructions** (Docker / Environment variables).

---

## 13. Authority & AI Output Contract Reference

The **SPAD AI Output Contract** enforced by the SPAD backend is the single source of truth for all API responses, MongoDB document storage, and frontend visualizations. All model outputs will be strictly validated against this contract before distribution across the platform.
