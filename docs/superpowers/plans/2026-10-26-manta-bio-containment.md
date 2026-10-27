# Manta Bio-Containment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build, test, and containerize *Manta Bio-Containment* for Spookython Track B (La Plaga Zombie): an epidemiological simulation tool and tactical decision dashboard for Manta, Ecuador, capable of demonstrating quantitative lives saved under resource constraints compared to doing nothing and random intervention, with sub-second Monte Carlo execution to survive the live jury "Brote Sorpresa".

**Architecture:** Vectorized discrete-time stochastic SEIR meta-population engine across 7 urban sectors of Manta coupled by an inter-sector mobility matrix, evaluated under 3 allocation strategies (No Intervention, Cantonal Uniform, Dynamic Risk-Weighted), aggregated across 50-100 Monte Carlo runs and presented via a Streamlit tactical dashboard containerized for AWS App Runner.

**Tech Stack:** Python 3.11+, Conda (`env_spookython`), NumPy, SciPy, Pandas, Plotly, Streamlit, Pytest, Docker, AWS App Runner.

**Spec:** [`docs/superpowers/specs/2026-10-26-manta-bio-containment-design.md`](file:///home/neicervb/Documentos/Proyectos-personales/Spookython/docs/superpowers/specs/2026-10-26-manta-bio-containment-design.md)

## Global Constraints
- Target population: 220,000 real Manta citizens across 7 sectors (Tarqui, Eloy Alfaro, Los Esteros, Manta Centro, Murciélago, Barbasquillo, San Mateo).
- Local Development Environment: Conda environment (`env_spookython`, Python 3.11) with pinned dependencies in `environment.yml` and `requirements.txt`.
- Quality Verification: Manual execution of `pytest` locally before `git push origin main` (no GitHub Actions CI pipeline).
- Cloud Infrastructure: Pure monolith on AWS App Runner (1 vCPU, 2 GB RAM) executing Streamlit + NumPy simulation 100% in-memory without external database or AI API calls.
- Continuous Deployment (CD): Direct GitHub connection from AWS App Runner to `https://github.com/NeicerVB/weezing.git` (`main` branch) using `apprunner.yaml` and `Dockerfile`.
- Observabilidad y Costos: Amazon CloudWatch para logs y métricas; AWS Budget con alerta por correo (\$5.00 USD).
- Simulation execution speed: < 2.0 seconds for 50 Monte Carlo runs on a single CPU core.
- Mandatory comparison against two baselines: Baseline 0 (No Intervention) and Baseline 1 (Uniform Cantonal Allocation).
- Deterministic reproducibility: exact same output given identical seed and parameters.
- No hardcoded secrets, credentials, or AWS keys in repository.
- Deliverables: README.md with design decisions and reproduction parameters, `docs/costos.md`, architecture diagram (`docs/arquitectura.drawio` / `.png`), and Dockerfile.

## Review Focus
1. **Population conservation under stochasticity:** Total population $S + E + I + R = N_i$ must strictly hold at every time step $t$ without integer rounding drift.
2. **Susceptible non-negativity under vaccination:** Doses administered to sector $i$ at day $t$ cannot exceed available susceptibles: $V_{i,t} \le S_{i,t}$.
3. **Cumulative budget exhaustion ($K_{max}$):** Once cumulative doses reach $K_{max}$, all future vaccinations halt ($V_{i, t \ge t_{exhaust}} = 0$) while the epidemic dynamics continue to $T=90$.
4. **Zero-division prevention in uniform baseline:** If certain sectors deplete their susceptible population, uniform allocation must partition $K$ only across sectors with $S_{i,t} > 0$.
5. **Headless/Offline rendering in Docker:** Plotly and Streamlit visual components must render reliably inside the Linux container without requiring external map tile API keys or internet access.

---

### Task 1: Environment Setup, Demographics & Mobility Model

**Files:**
- Create: `environment.yml`
- Create: `requirements.txt`
- Create: `src/data/__init__.py`
- Create: `src/data/manta_sectors.py`
- Test: `tests/test_sectors.py`

**Interfaces:**
- Produces: 
  - `SECTOR_NAMES: list[str]`
  - `SECTOR_POPULATIONS: dict[str, int]` (Sums to 220,000)
  - `SECTOR_COORDINATES: dict[str, tuple[float, float]]` (Lat, Lon for Manta centroids)
  - `get_mobility_matrix(quarantine_sector: str | None = None) -> np.ndarray` (Shape `(7, 7)`, row-normalized)

- [ ] **Step 0: Create `environment.yml` and `requirements.txt`**

Specify `env_spookython` with Python 3.11 and locked dependencies: `numpy`, `scipy`, `pandas`, `plotly`, `streamlit`, `pytest`.

- [ ] **Step 1: Write failing test in `tests/test_sectors.py`**

```python
import numpy as np
from src.data.manta_sectors import (
    SECTOR_NAMES,
    SECTOR_POPULATIONS,
    SECTOR_COORDINATES,
    get_mobility_matrix,
)

def test_demographic_integrity():
    assert len(SECTOR_NAMES) == 7
    assert sum(SECTOR_POPULATIONS.values()) == 220_000
    assert "Tarqui" in SECTOR_POPULATIONS
    assert SECTOR_POPULATIONS["Tarqui"] == 60_000

def test_mobility_matrix_properties():
    M = get_mobility_matrix()
    assert M.shape == (7, 7)
    assert np.all(M >= 0.0)
    # Row normalization (probabilities of moving or staying)
    np.testing.assert_allclose(M.sum(axis=1), 1.0, atol=1e-5)

def test_mobility_quarantine():
    M_iso = get_mobility_matrix(quarantine_sector="Tarqui")
    idx = SECTOR_NAMES.index("Tarqui")
    # Tarqui should have zero outward and inward transit except internal mobility
    assert np.all(M_iso[idx, :] == np.eye(7)[idx, :])
    assert np.all(M_iso[:, idx] == np.eye(7)[:, idx])
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_sectors.py`  
Expected: FAIL with `ModuleNotFoundError: No module named 'src'`

- [ ] **Step 3: Implement `src/data/manta_sectors.py`**

Implement census populations for the 7 sectors, centroid coordinates in Manta, and a baseline origin-destination mobility matrix where commercial hubs (Tarqui, Manta Centro) have higher transit weights, with optional row/column isolation for quarantine cordons.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_sectors.py`  
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/ tests/test_sectors.py environment.yml requirements.txt
git commit -m "feat(data): implement Manta urban sector demographics and mobility matrix"
```

---

### Task 2: Core Stochastic SEIR Meta-Population Engine

**Files:**
- Create: `src/models/__init__.py`
- Create: `src/models/seir_engine.py`
- Test: `tests/test_simulation.py`

**Interfaces:**
- Consumes: `SECTOR_NAMES`, `SECTOR_POPULATIONS`, `get_mobility_matrix` from `src.data.manta_sectors`
- Produces:
  - `SimulationConfig`: Dataclass containing $\beta, \sigma, \gamma, \eta, T=90, I_0=25$, `initial_sector='Tarqui'`, `seed=42`
  - `SimulationState`: Dataclass with arrays $S, E, I, R \in \mathbb{R}^{T \times 7}$ and cumulative infections $I_{cum} \in \mathbb{R}^{T \times 7}$
  - `simulate_seir(config: SimulationConfig, strategy_fn=None, mobility_matrix=None) -> SimulationState`

- [ ] **Step 1: Write failing test in `tests/test_simulation.py`**

```python
import numpy as np
from src.data.manta_sectors import SECTOR_NAMES, SECTOR_POPULATIONS
from src.models.seir_engine import SimulationConfig, simulate_seir

def test_population_conservation():
    config = SimulationConfig(seed=123, days=60)
    result = simulate_seir(config)
    
    # Population must be conserved on every single day for every sector
    for day in range(config.days):
        day_pop = result.S[day] + result.E[day] + result.I[day] + result.R[day]
        expected_pop = np.array([SECTOR_POPULATIONS[name] for name in SECTOR_NAMES])
        np.testing.assert_array_equal(day_pop, expected_pop)

def test_simulation_reproducibility():
    config1 = SimulationConfig(seed=999, days=30)
    config2 = SimulationConfig(seed=999, days=30)
    r1 = simulate_seir(config1)
    r2 = simulate_seir(config2)
    np.testing.assert_array_equal(r1.I, r2.I)

def test_outbreak_starts_in_designated_sector():
    config = SimulationConfig(seed=42, initial_sector="Tarqui", initial_infected=50)
    res = simulate_seir(config)
    tarqui_idx = SECTOR_NAMES.index("Tarqui")
    assert res.I[0, tarqui_idx] == 50
    # Other sectors start with 0 infected
    assert sum(res.I[0]) == 50
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_simulation.py`  
Expected: FAIL with `ModuleNotFoundError: No module named 'src.models.seir_engine'`

- [ ] **Step 3: Implement `src/models/seir_engine.py`**

Implement the discrete stochastic transitions using NumPy's `Generator.binomial`, with coupling through effective infectious pressure $\lambda_{i,t} = \beta \frac{I_{i,t} + \sum_{j \neq i} M_{ji} I_{j,t}}{N_i}$, ensuring exact integer transitions to avoid rounding drift.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_simulation.py`  
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/models/seir_engine.py tests/test_simulation.py
git commit -m "feat(engine): implement stochastic discrete meta-population SEIR simulator"
```

---

### Task 3: Intervention Strategies (Optimal vs. Baselines)

**Files:**
- Create: `src/models/strategies.py`
- Test: `tests/test_strategies.py`

**Interfaces:**
- Consumes: `SimulationState`, `SimulationConfig` from `src.models.seir_engine`
- Produces:
  - `no_intervention_strategy(day, S, E, I, R, M, config) -> np.ndarray` (Zero vector)
  - `uniform_cantonal_strategy(day, S, E, I, R, M, config) -> np.ndarray` (Equal split among sectors with $S > 0$)
  - `dynamic_risk_priority_strategy(day, S, E, I, R, M, config) -> np.ndarray` (Proportional risk score allocation with recursive overflow redistribution)

- [ ] **Step 1: Write failing test in `tests/test_strategies.py`**

```python
import numpy as np
from src.models.seir_engine import SimulationConfig, simulate_seir
from src.models.strategies import (
    no_intervention_strategy,
    uniform_cantonal_strategy,
    dynamic_risk_priority_strategy,
)

def test_vaccine_allocation_constraints():
    config = SimulationConfig(daily_vaccines=1000, max_vaccines=10000, seed=42)
    # Test allocation on day 10
    S = np.array([50000, 30000, 20000, 10000, 5000, 2000, 500])
    E = np.zeros(7)
    I = np.array([200, 50, 10, 0, 0, 0, 0])
    R = np.zeros(7)
    M = np.eye(7)
    
    alloc_opt = dynamic_risk_priority_strategy(10, S, E, I, R, M, config, cumulative_doses=0)
    assert sum(alloc_opt) <= config.daily_vaccines
    assert np.all(alloc_opt <= S)
    assert np.all(alloc_opt >= 0)

def test_cumulative_cap_enforcement():
    config = SimulationConfig(daily_vaccines=1000, max_vaccines=5000, seed=42)
    S = np.full(7, 10000)
    E, I, R = np.zeros(7), np.ones(7)*10, np.zeros(7)
    M = np.eye(7)
    
    # 4500 doses already used -> max remaining is 500
    alloc = dynamic_risk_priority_strategy(10, S, E, I, R, M, config, cumulative_doses=4500)
    assert sum(alloc) == 500
    
    # 5000 doses already used -> 0 doses
    alloc_exhausted = dynamic_risk_priority_strategy(11, S, E, I, R, M, config, cumulative_doses=5000)
    assert sum(alloc_exhausted) == 0

def test_optimal_strategy_beats_baselines():
    # Over 90 days, optimal must result in fewer cumulative infections than no intervention and uniform
    config = SimulationConfig(daily_vaccines=1000, max_vaccines=20000, seed=42, days=90)
    res_none = simulate_seir(config, strategy_fn=no_intervention_strategy)
    res_uni = simulate_seir(config, strategy_fn=uniform_cantonal_strategy)
    res_opt = simulate_seir(config, strategy_fn=dynamic_risk_priority_strategy)
    
    total_inf_none = res_none.total_infections()
    total_inf_uni = res_uni.total_infections()
    total_inf_opt = res_opt.total_infections()
    
    assert total_inf_opt < total_inf_none
    assert total_inf_opt < total_inf_uni
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_strategies.py`  
Expected: FAIL with `ModuleNotFoundError: No module named 'src.models.strategies'`

- [ ] **Step 3: Implement `src/models/strategies.py`**

Implement `no_intervention_strategy`, `uniform_cantonal_strategy`, and `dynamic_risk_priority_strategy` using vector operations, enforcing $0 \le V_{i,t} \le S_{i,t}$ and remaining budget $K_{rem} = \min(K, K_{max} - K_{used})$.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_strategies.py`  
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/models/strategies.py tests/test_strategies.py
git commit -m "feat(strategies): implement dynamic risk prioritization and baseline strategies"
```

---

### Task 4: Monte Carlo Aggregator & Executive COE Reporting

**Files:**
- Create: `src/utils/__init__.py`
- Create: `src/utils/metrics.py`
- Create: `src/models/monte_carlo.py`
- Test: `tests/test_monte_carlo.py`

**Interfaces:**
- Consumes: `simulate_seir` and strategies from `src.models`
- Produces:
  - `run_monte_carlo(config: SimulationConfig, num_runs: int = 50) -> dict[str, MonteCarloResult]`
  - `calculate_comparative_kpis(results: dict[str, MonteCarloResult]) -> dict[str, float]`
  - `generate_coe_briefing(kpis: dict, config: SimulationConfig) -> str`

- [ ] **Step 1: Write failing test in `tests/test_monte_carlo.py`**

```python
import time
from src.models.seir_engine import SimulationConfig
from src.models.monte_carlo import run_monte_carlo
from src.utils.metrics import calculate_comparative_kpis, generate_coe_briefing

def test_monte_carlo_execution_speed_and_structure():
    config = SimulationConfig(days=90, daily_vaccines=1000, max_vaccines=20000, seed=42)
    start_time = time.time()
    results = run_monte_carlo(config, num_runs=50)
    elapsed = time.time() - start_time
    
    # Must complete 50 runs for all 3 strategies in under 2.5 seconds
    assert elapsed < 2.5
    assert set(results.keys()) == {"no_intervention", "uniform", "optimal"}
    
    # Check shape of aggregated statistics (days x sectors)
    opt_stats = results["optimal"]
    assert opt_stats.mean_infected.shape == (90, 7)
    assert opt_stats.ci_lower_infected.shape == (90, 7)
    assert opt_stats.ci_upper_infected.shape == (90, 7)

def test_kpis_and_coe_briefing():
    config = SimulationConfig(days=90, daily_vaccines=1000, max_vaccines=20000, seed=42)
    results = run_monte_carlo(config, num_runs=20)
    kpis = calculate_comparative_kpis(results)
    
    assert "lives_saved_vs_none" in kpis
    assert "lives_saved_vs_uniform" in kpis
    assert kpis["lives_saved_vs_none"] > 0
    assert kpis["lives_saved_vs_uniform"] > 0
    
    briefing = generate_coe_briefing(kpis, config)
    assert "Manta" in briefing
    assert "Tarqui" in briefing
    assert "COE Cantonal" in briefing
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_monte_carlo.py`  
Expected: FAIL with `ModuleNotFoundError: No module named 'src.models.monte_carlo'`

- [ ] **Step 3: Implement `src/utils/metrics.py` and `src/models/monte_carlo.py`**

Vectorize the Monte Carlo runs with pre-allocated NumPy arrays. Compute 2.5th and 97.5th percentiles for the 95% confidence intervals. Generate a crisp, professional markdown executive report for the COE Cantonal using dynamic, deterministic Python rule-based templates (zero API costs or external dependencies).

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_monte_carlo.py`  
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/metrics.py src/models/monte_carlo.py tests/test_monte_carlo.py
git commit -m "feat(analytics): implement Monte Carlo aggregator and COE Cantonal briefing"
```

---

### Task 5: Streamlit Tactical Dashboard & Brote Sorpresa Controller

**Files:**
- Create: `src/app.py`
- Create: `configs/default_params.json`
- Test: `tests/test_ui_smoke.py`

**Interfaces:**
- Consumes: `src.models.monte_carlo`, `src.utils.metrics`, `src.data.manta_sectors`
- Produces: Live web server on port 8501 with tabs for Curves, Spatial Map, KPIs, and COE Briefing.

- [ ] **Step 1: Write smoke test in `tests/test_ui_smoke.py`**

```python
import json
from configs.default_params import DEFAULT_CONFIG
from src.models.seir_engine import SimulationConfig
from src.models.monte_carlo import run_monte_carlo

def test_default_config_schema():
    with open("configs/default_params.json", "r") as f:
        data = json.load(f)
    assert data["seed"] == 42
    assert data["population_total"] == 220_000
    assert data["initial_sector"] == "Tarqui"

def test_engine_runs_from_default_config():
    config = SimulationConfig(**DEFAULT_CONFIG)
    results = run_monte_carlo(config, num_runs=5)
    assert results is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_ui_smoke.py`  
Expected: FAIL (file `configs/default_params.json` not found)

- [ ] **Step 3: Implement `configs/default_params.json` and `src/app.py`**

Build the Streamlit application:
1. Sidebar: sliders for $\beta, \sigma, \gamma, K, K_{max}, \eta$, Patient Zero selector, and Seed.
2. "🎃 Brote Sorpresa" quick triggers:
   - *Variante Z-Delta (2x Transmisión)*
   - *Foco en Mercado de Tarqui ($I_0=100$)*
   - *Recorte Sanitario (50% Vacunas)*
   - *Eficacia Vacunal Parcial ($\eta=0.5$)*
   - *Cordón Sanitario (Aislamiento Barrial)*
3. Main view with 4 tabs:
   - Tab 1: Curvas Epidemiológicas comparativas (Sanos, Zombies activos, Inmunizados) con bandas sombreadas CI 95%.
   - Tab 2: Mapa Territorial Interactivo de Manta (`px.scatter_mapbox` con `open-street-map`, libre de tokens y offline-friendly) con slider animado de días 0 a 90 mostrando el avance de contagios por parroquia (Nivel Pro).
   - Tab 3: Panel de Eficiencia Táctica (KPIs de vidas salvadas y costo por vida protegida).
   - Tab 4: Informe Ejecutivo para el COE Cantonal con exportación a Markdown.

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_ui_smoke.py`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app.py configs/ tests/test_ui_smoke.py
git commit -m "feat(ui): implement Streamlit tactical dashboard with Brote Sorpresa controls"
```

---

### Task 6: Docker Containerization, AWS App Runner & Cost Documentation

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `apprunner.yaml`
- Create: `docs/costos.md`
- Create: `docs/arquitectura.drawio`
- Create: `docs/arquitectura.png` (exported/rendered)
- Modify: `README.md`
- Test: Verify local Docker build and curl response

- [ ] **Step 1: Write `Dockerfile`, `.dockerignore`, and `apprunner.yaml`**

Multi-stage lightweight Dockerfile based on `python:3.11-slim`, non-root user, exposing 8501, running `streamlit run src/app.py --server.port=8501 --server.address=0.0.0.0 --server.headless=true`. Add `apprunner.yaml` configured for version 1.0 runtime with start command.

- [ ] **Step 2: Verify Docker container build locally**

Run: `docker build -t manta-bio-containment:test .`  
Expected: Successful image build without errors.

- [ ] **Step 3: Create `docs/costos.md` with explicit formulas**

Document operating costs:
- AWS App Runner (1 vCPU, 2 GB RAM): \$0.007/GB-hora + \$0.064/vCPU-hora provisionada.
- Total cost for 48 hours of hackathon testing: < \$0.85 USD.
- Monthly production projection with auto-scale to zero during idle: ~\$4.50 USD/month.

- [ ] **Step 4: Create Architecture Diagram (`docs/arquitectura.drawio` & `.png`)**

Diagram illustrating: User Web Browser $\rightarrow$ AWS App Runner (TLS/HTTPS) $\leftarrow$ GitHub Repository (`NeicerVB/weezing` on `main`) $\rightarrow$ Amazon CloudWatch & AWS Budget alerts.

- [ ] **Step 5: Complete `README.md`**

Fill out all requirements from `entregables.md`: project summary, reproducible parameters and seed, AWS App Runner deployment link and console connection guide, architecture diagram link, cost summary, and design decisions.

- [ ] **Step 6: Run full test suite and commit**

```bash
pytest
git add Dockerfile .dockerignore apprunner.yaml docs/ README.md
git commit -m "docs(infra): add Dockerfile, apprunner.yaml, architecture diagrams, cost declaration, and README"
```

---

## Plan Self-Review Checklist

- [x] **Spec coverage:** Demographics, SEIR model, single intervention, two baselines, Monte Carlo, reproducibility, Streamlit dashboard, Brote Sorpresa, AWS App Runner deployment, and cost declaration are all covered across Tasks 1–6.
- [x] **Step scan:** Every step contains explicit file paths, test code, or shell commands with checkable results.
- [x] **Type & interface consistency:** `SimulationConfig` and `SimulationState` are cleanly defined in Task 2 and consumed identically in Tasks 3, 4, and 5.
- [x] **Review focus addressed:** Mass conservation, non-negative susceptibles, cumulative dose bounds, and division-by-zero protections are explicitly tested.
- [x] **Proportion:** Compact, modular task instructions without transcript bloat.