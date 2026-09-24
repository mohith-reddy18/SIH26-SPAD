# NASA MOSFET V1 — Worklog and Decision Record

**Project:** Dynamic latent-defect observability and sequential screening framework
**Primary dataset:** NASA MOSFET Thermal Overstress Aging data
**Version documented:** V1
**Status:** V1 experiment frozen; V2 upgrade planned

---

## 1. Purpose of this record

This document records the decisions, experiments, results, rejected alternatives, and reasoning used to construct the first independent ML screening pipeline on the NASA MOSFET thermal-overstress aging dataset.

The original framework is broader than the current experiment. It defines a dynamic screening system based on evidence accumulation, with population abnormality, trajectory/degradation behavior, forecasting, explainability, calibration, and decision logic as possible components. It explicitly states that the architecture should be built only after observability and ablation have established which pathways are useful. [Source framework, Sections 0–3]

The present document therefore describes **what was actually implemented in V1**, rather than claiming that the full framework has already been realized.

---

# 2. Original challenge requirement

The challenge asks for two main modules:

### Module A — Dynamic outlier detection

Detect components that are anomalous relative to the population, even when absolute engineering limits are not violated.

The motivating example in the challenge is a component with leakage substantially above the lot average while still remaining below the absolute datasheet limit.

### Module B — Time-series drift prediction

Use early measurements to predict a later measurement. The challenge gives the conceptual structure:

```text
Value_0h + Value_24h  →  Value_168h
```

and proposes flagging excessive future drift based on the prediction.

### Evaluation requirements

The challenge emphasizes:

- missed-defect sensitivity / false-negative cost,
- prediction accuracy, specifically MAE for future-value prediction,
- explainability for QA inspection.

The attached design framework is compatible with this direction: it treats the system as **measurement → evidence → risk → engineering action**, rather than measurement → black-box classifier → PASS/FAIL. [Source framework, Section 1]

---

# 3. Dataset selection and adaptation

## 3.1 Dataset selected

The NASA MOSFET Thermal Overstress Aging dataset was selected as the primary dataset.

Other candidate datasets discussed earlier were not used for the main V1 experiment.

## 3.2 Why the NASA dataset required adaptation

The challenge describes explicit checkpoints such as 0h, 24h, 96h, and 168h. The NASA MOSFET dataset does not naturally provide those exact universal checkpoints across the selected devices.

Therefore, V1 does **not** fabricate 24h/96h/168h labels.

Instead, each selected MOSFET trajectory is represented at four normalized stress stages:

```text
0%
33.33%
66.67%
100%
```

These are explicitly treated as **normalized trajectory stages**, not as real elapsed hours.

The clean modeling representation is:

```text
Test_ID | Normalized_Progress | RDSon_Ohm
```

or, after pivoting:

```text
Test_ID | RDS0 | RDS33 | RDS66 | RDS100
```

---

# 4. Operating-condition selection

V1 uses the following selected NASA MOSFET operating condition:

- Temperature: approximately 199–200°C
- Gate voltage: 10 V
- Supply voltage: 5 V
- Switching frequency: 1000 Hz
- Duty cycle: 40%

Under this selected condition, 15 physical MOSFET Test IDs had usable repeated observations for the chosen trajectory construction.

The V1 population therefore consists of:

```text
15 physical MOSFETs total
13 normal-reference devices
2 held-out gross-abnormal candidates
```

The held-out candidates are:

```text
Test 10
Test 13
```

These devices were excluded from normal-model training.

---

# 5. RDS(on) extraction methodology

## 5.1 Why raw transient data had to be processed

The NASA transient records contain time-domain quantities including:

- drain current,
- drain-source voltage,
- gate signal voltage,
- gate-source voltage,
- sampling interval.

A direct whole-pulse median of `VDS / ID` was not considered appropriate because the electrical switching waveform changes substantially across the ON interval.

## 5.2 ON-state extraction

An automatic ON-window detector was developed using the gate waveform:

1. median filtering of the gate signal,
2. low/high reference levels based on robust percentiles,
3. hysteresis-style ON/OFF thresholds,
4. longest contiguous ON region selected.

Within the detected ON interval, a late-pulse region was evaluated for stability.

## 5.3 Frozen V1 RDS(on) rule

The provisional extraction rule was frozen as:

> **Use 70–90% of the detected ON interval and calculate RDS(on) = median(VDS / ID) in that region for each matched transient; aggregate matched transients within the run using their median.**

This was selected because the late portion of the ON pulse was empirically more stable than the beginning of the pulse.

The resulting run-level file was:

```text
MOSFET_199_200C_RDSon_RunLevel.csv
```

---

# 6. Important waveform findings

Two unusual high-RDS trajectories were checked directly against the raw transient waveforms.

### Test 10

Test 10 showed very high RDS(on) values across its trajectory, not merely a single isolated transient.

Representative run-level values included approximately:

```text
Run 1  ≈ 13.334 Ω
Later  ≈ 14.374 Ω
```

Transient-level distributions were also systematically high within the abnormal runs.

### Test 13

Test 13 was normal-like during its early checkpoints and then exhibited a very large final-state jump.

The relevant normalized trajectory is approximately:

```text
0%       0.513 Ω
33.33%   0.545 Ω
66.67%   0.569 Ω
100%    24.675 Ω
```

The high final-run RDS(on) was also persistent within that run, so it was not treated simply as one accidental transient sample.

However, V1 does **not** claim a physical failure mechanism for this behavior.

---

# 7. Why global age-based modeling was not used

An early experiment attempted to construct a global population aging curve `RDS = f(age)`.

This was rejected for V1 because:

- device trajectories were sparse and heterogeneous,
- later-age population coverage became very small,
- the resulting population median could be based on only a few devices,
- the global curve did not cleanly match the actual challenge structure.

A nearest-peer age-matching approach was also explored. Robust z/MAD scores became excessively large because tiny peer groups produced extremely small robust dispersion estimates.

An age-interpolated peer ratio was more interpretable, but late-stage population coverage remained sparse.

Therefore V1 moved to **normalized same-stage trajectory comparison and early-input forecasting**, which is closer to the challenge formulation and more honest for this dataset.

---

# 8. Identification of normal reference population

A robust IQR analysis was applied separately at the four normalized stages.

This identified Test 10 and Test 13 as the two gross-outlier candidates used for held-out evaluation.

The modeling files created were:

```text
MOSFET_Normal_Training_4Checkpoints.csv
MOSFET_Gross_Outlier_Holdout.csv
```

The split is by physical MOSFET, not by individual rows.

This is important because random row splitting would leak trajectory information between training and evaluation.

---

# 9. Module B baseline experiments

## 9.1 First baseline: one input

An initial regression formulation used:

```text
RDS33  →  RDS100
```

This was intentionally simple as a baseline, but it did not match the challenge as closely as the challenge's stated two-input formulation.

## 9.2 Linear model

A linear `RDS33 → RDS100` model was initially contaminated by the two extreme held-out candidates when fit to the entire set.

After training on the 13 normal devices only, the linear baseline achieved approximately:

```text
MedAE ≈ 0.0536 Ω
RMSE  ≈ 0.0713 Ω
Median relative error ≈ 7.97%
```

This established that the normal population has a reasonably learnable early-to-late relationship, but the formulation was subsequently improved.

## 9.3 Random Forest baseline

A Random Forest was then tested on the same one-input structure.

For the 13-device normal population using leave-one-device-out validation:

```text
MedAE ≈ 0.0448 Ω
RMSE  ≈ 0.0693 Ω
Median relative error ≈ 7.73%
```

This was retained as evidence that a nonlinear ensemble could model normal degradation adequately.

---

# 10. Final V1 Module B formulation

The challenge explicitly requests two early inputs and one future output, so V1 was reformulated as:

```text
[RDS0, RDS33]  →  RDS100
```

This is the closest honest NASA adaptation of the challenge's:

```text
[Value0h, Value24h] → Value168h
```

while preserving the rule that normalized stages are not real elapsed hours.

## 10.1 Model

Random Forest Regressor:

```text
n_estimators = 300
max_depth = 3
min_samples_leaf = 2
max_features = 1.0
random_state = 42
```

## 10.2 Normal leave-one-device-out performance

```text
MAE                    = 0.052832 Ω
RMSE                   = 0.067271 Ω
Median absolute error  = 0.044947 Ω
Median relative error  = 7.065%
```

## 10.3 Held-out abnormal candidates

### Test 10

```text
Predicted RDS100  = 0.693572 Ω
Actual RDS100     = 14.374252 Ω
Residual          = 13.680680 Ω
Actual/Predicted  = 20.72×
```

### Test 13

```text
Predicted RDS100  = 0.633177 Ω
Actual RDS100     = 24.675459 Ω
Residual          = 24.042283 Ω
Actual/Predicted  = 38.97×
```

These results provide strong separation between normal forecast error and the two held-out extreme trajectories.

## 10.4 Feature importance

The Random Forest reported:

```text
RDS0  = 16.95%
RDS33 = 83.05%
```

This indicates that, within this small V1 dataset and this model, the 33.33% measurement contributed more to the learned prediction than the initial measurement.

---

# 11. Module A — dynamic anomaly detection

## 11.1 Initial single-feature approach

The first population detector compared `RDS33` against the normal population using robust IQR limits.

At 33.33%:

```text
Normal median = 0.551900 Ω
Q1            = 0.518506 Ω
Q3            = 0.582566 Ω
IQR           = 0.064061 Ω
Upper fence   = 0.678658 Ω
```

Held-out results:

```text
Test 10: 13.612318 Ω → anomaly
Test 13:  0.544736 Ω → not anomalous
```

This gave a clean, interpretable statistical baseline.

## 11.2 Isolation Forest experiment

Isolation Forest was then tested on a single `RDS33` feature.

It flagged 8 of 13 normal training devices under its automatic binary decision threshold.

Decision:

> Do not use `IsolationForest.predict()` as a final V1 engineering decision when the healthy reference set is only 13 devices and the input is a single scalar.

However, the continuous Isolation Forest score remained useful as a **trajectory novelty/evidence score**.

This is consistent with the attached framework's principle that detection should produce evidence before engineering action, rather than immediately forcing every model output into PASS/FAIL. [Source framework, Section 1]

---

# 12. Final V1 Module A representation

The early dynamic behavior is represented by:

```text
Feature 1 = RDS0
Feature 2 = ΔRDS(0→33) = RDS33 − RDS0
```

Isolation Forest parameters:

```text
n_estimators = 500
max_samples = number of normal reference devices
contamination = auto
random_state = 42
```

The binary Isolation Forest label is not treated as a validated production threshold.

The continuous `IF_Score` is retained as an evidence/novelty measure, with lower values corresponding to greater isolation from the learned normal population.

Observed held-out results:

### Test 10

```text
RDS0              = 13.334364 Ω
RDS33             = 13.612318 Ω
ΔRDS              = 0.277954 Ω
IF score          = -0.159831
```

### Test 13

```text
RDS0              = 0.513423 Ω
RDS33             = 0.544736 Ω
ΔRDS              = 0.031312 Ω
IF score          = 0.016411
```

Interpretation:

- Test 10 is visibly unusual in the early measurements.
- Test 13 is not strongly distinguishable from the normal population at this early stage.

This demonstrates an **observability limitation**, not necessarily an algorithmic failure.

---

# 13. Why Test 13 cannot be reliably predicted from early RDS(on) alone

This was a central reasoning decision in V1.

Test 13 has an approximately normal early trajectory:

```text
0%       0.513 Ω
33.33%   0.545 Ω
66.67%   0.569 Ω
```

and then jumps to:

```text
100%    24.675 Ω
```

No algorithm can reliably recover information that is not present in the available early observations.

Therefore the correct interpretation is:

> If the early measurements contain no distinguishable signal for the eventual transition, a more complex algorithm should not be claimed to predict that transition reliably.

The attached framework explicitly identifies poor early observability as a valid outcome and recommends changing instrumentation/observables rather than endlessly adding algorithms. [Source framework, Section 3]

Module B nevertheless provides a useful result: although the early state looks normal, the eventual measurement is **dramatically inconsistent with the learned normal forecast**.

---

# 14. Why the V1 sequential formulation was chosen

A single full-trajectory model using `[RDS0, RDS33, RDS66, RDS100]` was considered.

However, for the challenge objective, the final V1 design deliberately starts from the earliest two useful observations:

```text
RDS0 + RDS33
```

This allows the same early information to support two independent questions:

### Module A

> Is the early behavior unusual compared with normal devices?

### Module B

> Given the early behavior, what future RDS100 should be expected?

This directly mirrors the challenge's requested two-module structure.

A future V2 extension can add more observations as they become available:

```text
Stage 1: [RDS0, RDS33]
Stage 2: [RDS0, RDS33, RDS66]
Stage 3: [RDS0, RDS33, RDS66, RDS100]
```

This is a sequential screening concept rather than a single retrospective classifier, consistent with the framework's decision-time discipline. [Source framework, Section 1]

---

# 15. Module A + Module B combined evidence

The combined V1 evidence table was generated as:

```text
MOSFET_Combined_ModuleA_ModuleB_Evidence.csv
```

For Module B, the 13 normal forecast errors were used to define a normal error reference:

```text
Median error = 0.044947 Ω
Q1           = 0.020351 Ω
Q3           = 0.078229 Ω
IQR          = 0.057878 Ω
Upper fence  = 0.165046 Ω
```

The two held-out candidates were far beyond this normal error range:

```text
Test 10 absolute forecast error = 13.680680 Ω
Test 13 absolute forecast error = 24.042283 Ω
```

Therefore Module B provides the strongest V1 evidence for the two held-out abnormal candidates.

Important decision:

> We do not treat the current Module A Isolation Forest percentile rule as a validated binary engineering decision, because the tiny normal population makes unsupervised tail thresholds unstable. Module A remains a continuous novelty/evidence pathway.

---

# 16. SHAP explainability layer

SHAP was added as the model-level explanation mechanism.

## 16.1 Module A SHAP features

```text
RDS0
ΔRDS(0→33)
```

SHAP interpretation for Module A:

- lower Isolation Forest output corresponds to greater novelty,
- SHAP contributions that drive the model output lower therefore contribute toward anomaly/novelty,
- SHAP is explaining the model output and is not a proof of physical causality.

### Test 10 Module A SHAP

```text
RDS0             SHAP ≈ -0.079959
ΔRDS(0→33)       SHAP ≈ -1.694233
```

The early-change feature was the dominant contribution toward a more anomalous Isolation Forest output.

### Test 13 Module A SHAP

```text
RDS0             SHAP ≈ +0.328946
ΔRDS(0→33)       SHAP ≈ -0.185211
```

The early measurements do not provide strong evidence of abnormality.

## 16.2 Module B SHAP features

```text
RDS0
RDS33
```

SHAP explains the model's **predicted RDS100**.

### Test 10 Module B SHAP

```text
RDS0             SHAP ≈ -0.011298
RDS33            SHAP ≈ +0.069433
```

### Test 13 Module B SHAP

```text
RDS0             SHAP ≈ +0.012451
RDS33            SHAP ≈ -0.014711
```

The SHAP values explain why the model predicts a normal-range future value. The anomaly evidence comes from the subsequent comparison:

```text
Predicted RDS100 vs actual RDS100
```

This distinction must remain explicit in the paper.

---

# 17. Final V1 conceptual architecture

```text
                    NASA MOSFET aging data
                              │
                              ▼
                         RDS(on) extraction
                              │
                              ▼
                   Normalized trajectory stages
                    0% → 33% → 66% → 100%
                              │
                              ▼
                     Early observations
                       RDS0 + RDS33
                              │
                 ┌────────────┴────────────┐
                 ▼                         ▼
          MODULE A                     MODULE B
      Dynamic anomaly                Drift prediction
          pathway                      pathway
                 │                         │
       [RDS0, ΔRDS0→33]             [RDS0, RDS33]
                 │                         │
          Isolation Forest          Random Forest
                 │                         │
         novelty / evidence         predicted RDS100
                 │                         │
             SHAP                     SHAP
                 │                         │
                 └────────────┬────────────┘
                              ▼
                        Explainable evidence
                              │
                              ▼
                   Future sequential screening
```

This is the **V1 independent ML pipeline**.

It is not yet the full qualification-ready architecture described in the larger framework.

---

# 18. What V1 demonstrates

V1 demonstrates the following:

1. RDS(on) can be extracted reproducibly from the selected NASA transient records using a defined late-ON-window procedure.
2. Normal MOSFET trajectories can be learned from 13 physical devices while keeping two abnormal candidates fully held out.
3. A simple population-based detector can expose a device such as Test 10 when its early RDS(on) is already abnormal.
4. A Random Forest model using `[RDS0, RDS33]` can predict `RDS100` for normal devices with MAE ≈ 0.0528 Ω under leave-one-device-out validation.
5. Test 10 and Test 13 show extremely large deviations between predicted and actual RDS100.
6. SHAP provides model-level explanations for the early anomaly score and future-value prediction.
7. The dataset also exposes a genuine observability limitation: Test 13 is not distinguishable from normal using early RDS(on) alone before the abrupt final transition.

---

# 19. What V1 does NOT demonstrate

The following claims must **not** be made from V1:

- universal early prediction of all latent failures,
- qualification-level false-negative guarantees,
- a statistically validated production anomaly threshold,
- physical proof of the MOSFET failure mechanism from SHAP alone,
- generalization to all operating conditions, suppliers, lots, or component families,
- equivalence between normalized percentages and actual elapsed burn-in hours,
- large-sample statistical performance from only 15 physical devices.

The attached framework explicitly emphasizes confidence-bounded recall, reference-population qualification, dependence analysis, and calibration before making strong production claims. [Source framework, Sections 5–7]

---

# 20. Decisions that are now frozen for V1

### Frozen decision 1 — Dataset

NASA MOSFET Thermal Overstress Aging is the only primary dataset for V1.

### Frozen decision 2 — Time representation

Use normalized stress progress:

```text
0%, 33.33%, 66.67%, 100%
```

Do not fabricate 24/96/168h equivalents.

### Frozen decision 3 — Primary response

Use extracted run-level `RDS(on)` as the V1 degradation parameter.

### Frozen decision 4 — Training split

13 normal physical MOSFETs for reference/model development; Test 10 and Test 13 held out as abnormal candidates.

### Frozen decision 5 — Module A V1

Use a continuous Isolation Forest novelty score based on:

```text
RDS0
ΔRDS(0→33)
```

Do not use the automatic Isolation Forest binary threshold as a final production decision.

### Frozen decision 6 — Module B V1

Use:

```text
RDS0 + RDS33 → RDS100
```

with Random Forest regression.

### Frozen decision 7 — Explainability

Use SHAP for model-level feature attribution.

### Frozen decision 8 — Evidence, not unsupported PASS/FAIL claims

Use model outputs as evidence for subsequent engineering decision logic rather than pretending that the V1 thresholds are already qualification-ready.

---

# 21. Approaches explicitly rejected or deferred

| Approach | Decision | Reason |
|---|---|---|
| Global `RDS=f(age)` population curve | Rejected for V1 | Sparse/heterogeneous age coverage |
| Nearest-peer age z/MAD | Rejected for V1 | Tiny peer groups caused unstable huge scores |
| Age-interpolated peer ratio as primary detector | Deferred | Late-stage peer coverage remained sparse |
| Single-feature Isolation Forest on RDS33 with default binary labels | Rejected as final decision | Flagged many normal devices with only 13 references |
| Full 4-point Isolation Forest `[RDS0,RDS33,RDS66,RDS100]` as primary V1 detector | Deferred | Retrospective/full-information model; less aligned with early challenge input structure |
| One-input Module B `RDS33→RDS100` | Baseline only | Does not match the challenge's two-input formulation as closely as `[RDS0,RDS33]→RDS100` |
| Automatic claim that Test 13 is predictable before its final jump | Rejected | Early RDS(on) contains little/no distinguishing signal for the abrupt transition |

---

# 22. Planned V2 upgrade

The next development phase is intended to move from the simple V1 pipeline toward a **multidimensional early-input, one-output framework**.

## Planned direction

### Module A V2

Increase the early feature space beyond one electrical parameter, for example by incorporating additional physically meaningful measurements/features available from the dataset.

Goal:

> capture abnormality that cannot be expressed through a single RDS(on) scalar or simple early drift feature.

### Module B V2

Use multiple early features as inputs and keep a single future target as the output:

```text
Multiple early features  →  one future RDS(on) / future parameter
```

This retains the challenge's one-output forecasting idea while increasing observability.

### Explainability

Extend SHAP from the current two-feature demonstration to the multidimensional feature set.

### Additional independent pathway

Investigate whether the dataset supports an additional **physically distinct evidence pathway**, provided it is genuinely independent enough to add information rather than simply duplicating Module A or Module B.

The framework explicitly warns that model count is not the goal; different pathways should cover distinct failure signatures, and dependence should be measured before using multiple pathways as corroborating evidence. [Source framework, Sections 1–2]

Potential V2 candidates include:

- a trajectory-shape/degradation-rate pathway,
- a population-based multivariate pathway,
- another electrical/physical observable if available,
- a novelty or uncertainty pathway.

No additional pathway is considered committed until ablation demonstrates that it adds measurable protection.

---

# 23. V2 development philosophy

The V2 upgrade should follow the sequence already established in the framework:

```text
Observability
      ↓
Early detectability
      ↓
Dependence analysis
      ↓
Ablation
      ↓
Architecture freeze
      ↓
Qualification/deployment considerations
```

The objective is not to add algorithms merely because they are more sophisticated.

The objective is to determine whether additional information and genuinely independent evidence pathways improve detection without creating unsupported claims or excessive false-alarm behavior.

---

# 24. Reproducibility artifacts created during V1

Known V1 artifacts include:

```text
MOSFET_199_200C_RDSon_RunLevel.csv
MOSFET_Normal_Training_4Checkpoints.csv
MOSFET_Gross_Outlier_Holdout.csv
MOSFET_Percentage_Peer_Anomaly.csv
MOSFET_ModuleA_33pct_Anomaly.csv
MOSFET_ModuleA_IsolationForest_33pct.csv
MOSFET_ModuleA_PartialTrajectory_IF.csv
MOSFET_ModuleA_Dynamic_IF_RDS0_RDS33.csv
MOSFET_ModuleB_RF_RDS0_RDS33_to_RDS100.csv
MOSFET_Combined_ModuleA_ModuleB_Evidence.csv
MOSFET_ModuleA_SHAP.csv
MOSFET_ModuleB_SHAP.csv
MOSFET_Final_QA_Explainability_Table.csv
```

The exact absolute Windows paths used during development were under:

```text
C:\Users\Admin\Downloads\
```

---

# 25. Current V1 conclusion

The V1 pipeline is intentionally modest:

```text
Early RDS0 + RDS33
        │
        ├── Module A: dynamic novelty evidence
        │
        └── Module B: forecast RDS100
                         │
                         ▼
                 forecast residual
                         │
                         ▼
                    SHAP explanation
```

The strongest demonstrated V1 result is Module B: normal devices can be forecast with approximately `0.0528 Ω` MAE under leave-one-device-out validation, while Tests 10 and 13 show residuals of approximately `13.68 Ω` and `24.04 Ω`, respectively.

The strongest scientific limitation is equally important: Test 13 shows that an abrupt late transition cannot be reliably predicted from early RDS(on) measurements alone when the early observations contain no distinguishing signal.

Therefore V1 should be presented as a **validated proof-of-concept independent ML screening pipeline and observability study**, not as a qualification-ready latent-failure predictor.

The next goal is V2: **multidimensional early features → one future output, SHAP-based explanation, and a genuinely independent additional pathway if the data supports it.**
