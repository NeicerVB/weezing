# Manta Containment Simulator (Track B - Spookython) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a deterministic, lightweight web simulator on AWS (`us-east-2`) modeling a discrete SEIR epidemic on an attributed Manta contact network, comparing a 3-Step Dynamic Intervention Protocol against two baselines (Do Nothing and Random with strict dose parity) and featuring an analytical $R_0$ metric, diff-based SVG spatial visualization, and direct controls for the live "Brote Sorpresa".

**Architecture:** Monolithic container serving a FastAPI backend and static Vanilla JS + SVG frontend. Core simulation runs in-memory with deterministic pseudo-random hashing across 7 urban sectors of Manta. Deployed as a single ECS Fargate task via Amazon ECS Express Mode behind an automated HTTPS load balancer, backed by local multiprocessing for batch Monte Carlo simulations.

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, Pydantic, pytest, Docker multi-stage (`python:3.12-slim`), Amazon ECS Express Mode (`us-east-2`), Vanilla JavaScript (ES6) + SVG.

**Spec:** [docs/superpowers/specs/2026-10-27-manta-containment-simulator-design.md](file:///home/neicervb/.gemini/antigravity/worktrees/Spookython/spookython_mentor_simulator_architecture/docs/superpowers/specs/2026-10-27-manta-containment-simulator-design.md)

## Global Constraints

- **Python Runtime:** Python 3.12 strict (`requires-python = ">=3.12, <3.13"`).
- **AWS Region:** `us-east-2` (Ohio).
- **Repository Structure:** Must strictly adhere to `entregables.md` layout: `src/seir/`, `infra/`, `docs/`, `tests/`, `configs/`, `README.md`.
- **Terminology & Rigor:** Always use "contagios evitados" ($I_{\text{cum}}^{\text{nada}} - I_{\text{cum}}^{\text{estrategia}}$), never "vidas salvadas". Always use "rango empírico de simulación (p2.5 - p97.5)", never "intervalo de confianza del 95%".
- **Performance Targets:** p95 latency $\le 800$ ms local, $\le 3$ s in cloud for 3 paired strategies ($N=1000, T=60$). Response payloads $< 50$ KB.
- **Invariants:** Conservation $|S| + |E| + |I| + |R| = N$ at every day step. Strict dose parity $D_t^{\text{azar}} = D_t^{\text{propuesta}}$. Total doses never exceed $K_{\max} = 0.40 N$. Determinism fixed strictly by seed.

## Review Focus

1. **Zero-Infection / Extinct Outbreak (`initial = {}` or $I_0 = 0$):** Engine must not divide by zero in rate calculations ($R_0$ or $K_t$) and must return stable 0-count series.
   - *Test in Task 4:* `tests/test_strategies.py::test_zero_infection_edge_case`
2. **Exhaustion of Susceptibles Before Quota:** If active sector has fewer susceptible nodes than daily quota $K_t$, waterfall must cascade gracefully to outer hubs and record unspent doses without crashing.
   - *Test in Task 4:* `tests/test_strategies.py::test_susceptible_depletion_cascades_to_hubs`
3. **Delayed Vaccine Loss on Infection:** A node vaccinated with delay $d_{\text{vac}} > 0$ that transitions $S \to E$ before $t + d_{\text{vac}}$ must irrevocably lose its dose and not become immune.
   - *Test in Task 3:* `tests/test_engine.py::test_delayed_vaccine_lost_upon_infection`
4. **Volunteer Death/Extinction Boundary:** A convalescent volunteer in a sector with 0 active infected ($I=0$) must have strictly 0% reinfection risk.
   - *Test in Task 3:* `tests/test_volunteers.py::test_volunteer_zero_reinfection_in_inactive_sector`
5. **Payload Oversize & Rate Limiting Guard:** Requests with $N > 2000$ or concurrent batch overload must be intercepted and rejected with HTTP 400 or HTTP 429 before allocating memory.
   - *Test in Task 5:* `tests/test_api_smoke.py::test_input_guards_and_rate_limiting`

---

## Tasks

### Task 1: Reorganize Codebase into `src/seir/` and Lock Dependencies

**Files:**
- Create: `requirements.txt`
- Modify: `pyproject.toml`
- Move: `seir/` $\to$ `src/seir/`
- Test: `tests/test_engine.py` (run existing 38 tests to ensure zero regression)

**Interfaces:**
- Consumes: Existing graph and engine codebase in `seir/`.
- Produces: `src.seir` package importable by all subsequent modules and tests.

- [ ] **Step 1: Move `seir/` package to `src/seir/`**
  Execute `mkdir -p src && git mv seir src/seir`.

- [ ] **Step 2: Update `pyproject.toml` and generate `requirements.txt`**
  Update `pyproject.toml` to configure `pythonpath = ["src"]` and define dependencies (`fastapi>=0.115.0`, `uvicorn>=0.32.0`, `pydantic>=2.9.0`, `pytest>=8.3.0`). Generate `requirements.txt` with locked versions.

- [ ] **Step 3: Run existing unit test suite to verify zero regression**
  Run: `pytest tests/ -v`
  Expected: 38 passed.

- [ ] **Step 4: Commit**
  ```bash
  git add pyproject.toml requirements.txt src/ tests/
  git commit -m "refactor: move seir package into src/seir and lock dependencies"
  ```

---

### Task 2: Territorial Graph & Manta Procedural Topology Generator

**Files:**
- Create: `src/seir/topology.py`
- Test: `tests/test_topology.py`

**Interfaces:**
- Consumes: `src.seir.graph.Graph` (immutable base graph).
- Produces:
  ```python
  SECTORS: tuple[str, ...]
  SECTOR_ADJACENCY: tuple[tuple[str, str], ...]

  @dataclass(frozen=True)
  class TerritorialGraph:
      graph: Graph
      sectors: tuple[str, ...]                  # Sector name per node [0..N-1]
      hubs: frozenset[int]                      # Set of high-degree hub node IDs
      labels: tuple[str, ...]                   # Optional text labels (e.g. "Mercado Central")
      coords: tuple[tuple[float, float], ...]   # 2D relative coords (x, y) in [0, 100]^2

  def generate_manta_graph(n: int, average_degree: float, rng: random.Random) -> TerritorialGraph: ...
  def resolve_initial_infections(t_graph: TerritorialGraph, initial: dict[str, int], initial_ids: list[int] | None, rng: random.Random) -> frozenset[int]: ...
  ```

- [ ] **Step 1: Write failing tests in `tests/test_topology.py`**
  Test `SECTOR_ADJACENCY` completeness, node sector assignment matching $N$, hub degree verification ($\approx 4\times$ mean degree), coordinates bounded in $[0, 100]$, and multi-sector initial infection seeding resolution.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pytest tests/test_topology.py -v`
  Expected: FAIL (module `topology` does not exist).

- [ ] **Step 3: Implement `src/seir/topology.py`**
  Implement `SECTORS` (7 sectors), `SECTOR_ADJACENCY` as specified in spec §5.1, `TerritorialGraph` class with constructor validation, procedural clustering algorithm distributing $N$ across sectors with intra-sector clusters and inter-sector bridge edges, and `resolve_initial_infections`.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pytest tests/test_topology.py -v`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/seir/topology.py tests/test_topology.py
  git commit -m "feat(topology): implement TerritorialGraph and Manta procedural network generator"
  ```

---

### Task 3: Leaky Vaccine Mechanics, Delay & Convalescent Volunteer Brigades

**Files:**
- Modify: `src/seir/states.py`
- Modify: `src/seir/engine.py`
- Create: `tests/test_volunteers.py`
- Modify: `tests/test_engine.py`

**Interfaces:**
- Consumes: `TerritorialGraph` from `src.seir.topology`.
- Produces:
  - Extended node tracking: `vaccinated: set[int]`, `pending_vaccine: dict[int, int]` (node $\to$ effective day), `volunteers: set[int]`, `enlistment_count: Counter[int]`.
  - Daily record attributes: `doses_administered: int`, `active_volunteers: int`, `volunteer_reinfections: int`.
  - Invariant verified: $|S| + |E| + |I| + |R| = N$.

- [ ] **Step 1: Write failing tests in `tests/test_volunteers.py` and `tests/test_engine.py`**
  Test leaky vaccine transmission: $P(S_{\text{vac}} \to E) = 1 - (1 - (1 - \eta)\beta)^k$.
  Test delayed vaccine loss: vaccinated node in $S$ with $d_{\text{vac}}=3$ that transitions to $E$ at day 2 loses dose.
  Test volunteer recruitment: $I \to R$ rolls $p_{\text{vol}} \in [0.10, 0.15]$.
  Test occupational risk: volunteer with $I$ in sector has $p_{\text{reinf}} \in [0.03, 0.05]$ risk of $R \to E$; volunteer in sector with $I=0$ has 0% risk.
  Test max 1 re-enlistment (max 2 total).

- [ ] **Step 2: Run tests to verify they fail**
  Run: `pytest tests/test_volunteers.py tests/test_engine.py -v`
  Expected: FAIL.

- [ ] **Step 3: Update `states.py` and `engine.py`**
  Incorporate `pending_vaccine` map, leaky probability formula, volunteer enlistment draw upon $I \to R$, occupational reinfection step, and ensure all changes preserve simultaneous snapshot step execution.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `pytest tests/test_volunteers.py tests/test_engine.py -v`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/seir/states.py src/seir/engine.py tests/test_volunteers.py tests/test_engine.py
  git commit -m "feat(engine): add leaky vaccination, pending delay, and volunteer brigade lifecycle"
  ```

---

### Task 4: Intervention Strategies, Strict Dose Parity & Analytical $R_0$

**Files:**
- Create: `src/seir/strategies.py`
- Test: `tests/test_strategies.py`

**Interfaces:**
- Consumes: `TerritorialGraph`, `SeirEngine` from Task 2 and 3.
- Produces:
  ```python
  def compute_r0(beta: float, average_degree: float, gamma: float) -> float: ...
  def compute_dynamic_quota(n: int, active_i: int, active_e: int) -> int: ...

  class InterventionStrategy(Protocol):
      def select_vaccinations(self, day: int, quota: int, engine: SeirEngine, t_graph: TerritorialGraph) -> list[int]: ...

  class DoNothingStrategy: ...
  class RandomStrategy: ...
  class ProposedThreeStepStrategy: ...

  def run_paired_simulation(t_graph: TerritorialGraph, config: SimulationConfig) -> dict[str, Any]: ...
  ```

- [ ] **Step 1: Write failing tests in `tests/test_strategies.py`**
  Test `compute_r0` formula: $R_0 = \beta \cdot \langle k \rangle / \gamma$.
  Test `compute_dynamic_quota` formula: $K_t = \text{round}(\text{clamp}(0.015, 0.05, 0.015 + 0.7 \cdot \text{activos}/N) \cdot N)$ bounded by $[15, 50]$ for $N=1000$.
  Test strict dose parity: $D_t^{\text{azar}} == D_t^{\text{propuesta}}$ on every day $t$.
  Test 3-step waterfall: Macro bridge nodes $\to$ Internal hubs $\to$ Micro ring direct contacts $\to$ Surplus reinvestment in external hubs.
  Test zero-infection edge case ($I_0 = 0$) and total stockpile cap ($K_{\max} = 0.40 N$).

- [ ] **Step 2: Run test to verify it fails**
  Run: `pytest tests/test_strategies.py -v`
  Expected: FAIL.

- [ ] **Step 3: Implement `src/seir/strategies.py`**
  Implement analytical $R_0$, dynamic quota formula, active sector detection ($I_s + 0.5 E_s$), strict priority waterfall with volunteer search boost, and paired execution pipeline (Proposed runs first generating $[D_1, \dots, D_T]$, consumed identically by Random).

- [ ] **Step 4: Run test to verify it passes**
  Run: `pytest tests/test_strategies.py -v`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/seir/strategies.py tests/test_strategies.py
  git commit -m "feat(strategies): implement 3-step protocol, dose parity random baseline, and analytical R0"
  ```

---

### Task 5: FastAPI Application, Frozen REST API Contract & Security Guards

**Files:**
- Create: `src/seir/app.py`
- Modify: `src/seir/config.py`
- Create: `tests/test_api_smoke.py`

**Interfaces:**
- Consumes: `run_paired_simulation` from `src.seir.strategies`, `TerritorialGraph` from `src.seir.topology`.
- Produces:
  - `GET /health` $\to$ `200 {"status": "healthy"}`
  - `POST /api/simulate` $\to$ `200` JSON matching Annex A schema (with optional diff `frames`)
  - `POST /api/batch` $\to$ `200` JSON matching Annex A schema with Monte Carlo statistics (30 replicas default)
  - HTTP 400 for invalid inputs, HTTP 429 on concurrent overload ($> 2$ concurrent heavy tasks).

- [ ] **Step 1: Write failing tests in `tests/test_api_smoke.py`**
  Test `GET /health` returns 200.
  Test `POST /api/simulate` returns contract structure with $R_0$, `avoided_infections`, and diff `frames` when requested.
  Test input guardrails: $N > 2000$ returns 400.
  Test concurrency limiter: simultaneous requests beyond semaphore capacity return 429 with `Retry-After`.
  Test `POST /api/batch` returns mean, p2.5, and p97.5 aggregates without node-level arrays.

- [ ] **Step 2: Run test to verify it fails**
  Run: `pytest tests/test_api_smoke.py -v`
  Expected: FAIL.

- [ ] **Step 3: Implement `src/seir/app.py` and Pydantic schemas in `src/seir/config.py`**
  Implement FastAPI app, mounting `/health`, `/api/simulate`, `/api/batch`, mounting `src/seir/static` as static files, setting up `asyncio.Semaphore(2)` for rate limiting, and integrating `ProcessPoolExecutor` for local batch parallelism.

- [ ] **Step 4: Run test to verify it passes**
  Run: `pytest tests/test_api_smoke.py -v`
  Expected: PASS.

- [ ] **Step 5: Commit**
  ```bash
  git add src/seir/app.py src/seir/config.py tests/test_api_smoke.py
  git commit -m "feat(api): implement FastAPI REST endpoints matching frozen contract with safety guards"
  ```

---

### Task 6: Accessible Vanilla JS + SVG Frontend with Live Controls

**Files:**
- Create: `src/seir/static/index.html`
- Create: `src/seir/static/app.js`
- Create: `src/seir/static/style.css`

**Interfaces:**
- Consumes: `POST /api/simulate` and `GET /health` from FastAPI.
- Produces: Interactive single-page UI (< 80 KB total) displaying 2D SVG Manta network with diff-based animation, multi-curve comparison, $R_0$ KPI, and academic disclaimer.

- [ ] **Step 1: Create `src/seir/static/index.html`**
  Write accessible HTML5 shell with:
  - Prominent academic disclaimer header.
  - Parameter controls (sliders & inputs for $\beta$, $d_{\text{inc}}$, $d_{\text{inf}}$, $K$, mode, $\eta$, multi-sector $I_0$ inputs).
  - SVG visualizer container with accessible legend (color + shape: Circle S, Square E, Triangle I, Crossed Circle R, Star Volunteer).
  - Multi-curve chart canvas/SVG showing 3 strategies and p2.5–p97.5 empirical range.
  - KPI cards: $R_0$, Contagios Evitados, Dosis Gastadas, Pico de Infección, Brigadistas.
  - Executive Report generator section for "COE Cantonal (Simulación Académica)".

- [ ] **Step 2: Create `src/seir/static/style.css`**
  Theme with high-contrast Spookython dark palette (WCAG AA compliant), responsive grid layout, and crisp SVG vector styling.

- [ ] **Step 3: Create `src/seir/static/app.js`**
  Implement fetch calls to `/api/simulate`, reactive slider listeners, state-diff day-by-day animator for SVG nodes, and multi-curve SVG plotter.

- [ ] **Step 4: Verify static file integration via FastAPI**
  Run: `pytest tests/test_api_smoke.py -k "test_static" -v`
  Verify `GET /` serves `index.html` with status 200.

- [ ] **Step 5: Commit**
  ```bash
  git add src/seir/static/
  git commit -m "feat(ui): create accessible Vanilla JS and SVG dashboard with live Brote Sorpresa controls"
  ```

---

### Task 7: Containerization & AWS ECS Express Mode Infrastructure (`us-east-2`)

**Files:**
- Create: `infra/Dockerfile`
- Create: `infra/ecs_service.json`
- Create: `docs/costos.md`
- Create: `docs/budget.png` (placeholder image / instructions)

**Interfaces:**
- Consumes: `src/seir/` package and `requirements.txt`.
- Produces: Docker image exposing port 8000, ECS Express Mode deployment blueprint, and budget governance documentation.

- [ ] **Step 1: Create multi-stage `infra/Dockerfile`**
  ```dockerfile
  FROM python:3.12-slim as builder
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt

  FROM python:3.12-slim
  WORKDIR /app
  COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
  COPY --from=builder /usr/local/bin /usr/local/bin
  COPY src/ /app/src/
  EXPOSE 8000
  CMD ["uvicorn", "src.seir.app:app", "--host", "0.0.0.0", "--port", "8000"]
  ```

- [ ] **Step 2: Create `infra/ecs_service.json` & deployment commands**
  Document the exact AWS CLI command for `us-east-2`:
  ```bash
  aws ecs create-express-gateway-service \
      --region us-east-2 \
      --service-name manta-containment-simulator \
      --container-port 8000 \
      --health-check-path /health
  ```
  and the teardown command:
  ```bash
  aws ecs delete-express-gateway-service --region us-east-2 --service-name manta-containment-simulator
  ```

- [ ] **Step 3: Create `docs/costos.md`**
  Document continuous cost (~25–30 USD/month) vs hackathon event operational cost (~1 USD/day with 256 CPU / 512 MiB Fargate), demonstrating strict compliance with the \$5 USD AWS Budget alert.

- [ ] **Step 4: Verify Docker container build and health check locally**
  Run: `docker build -f infra/Dockerfile -t manta-sim:test .`
  Run container in background and query `curl -s http://localhost:8000/health`. Verify HTTP 200 `{"status": "healthy"}`.

- [ ] **Step 5: Commit**
  ```bash
  git add infra/ docs/costos.md
  git commit -m "feat(infra): add Dockerfile for ECS Express Mode and cost documentation for us-east-2"
  ```

---

### Task 8: End-to-End Acceptance Verification & Official `README.md`

**Files:**
- Create: `README.md`
- Create: `configs/default_params.json`
- Verify: Full test suite against Annex B Acceptance Checklist

**Interfaces:**
- Consumes: All modules, API, docs, and tests.
- Produces: Official competition delivery repository ready for submission.

- [ ] **Step 1: Create `configs/default_params.json`**
  Store default reproducible configuration parameters ($N=1000, T=60, \text{seed}=42, \beta=0.03, \sigma=0.2, \gamma=0.1, \text{quota}=30, K_{\max}=400, \text{initial}=\{\text{"tarqui"}: 10\}$).

- [ ] **Step 2: Run complete test suite and benchmarks**
  Run: `pytest tests/ -v`
  Verify all invariant, strategy, volunteer, topology, and API smoke tests pass (100% green).
  Measure latency: verify local p95 $\le 800$ ms.

- [ ] **Step 3: Write comprehensive `README.md`**
  Document:
  - Project summary & Track B objective.
  - Deployed AWS URL (in `us-east-2`) and architectural flow.
  - Setup instructions (Conda `env_spookython`, Python 3.12, Docker).
  - Explicit reproducible seed (seed 42) and default parameters for the jury.
  - 3-Step Protocol explanation & baseline comparisons.
  - Ethical disclaimer and model limitations.
  - Screenshot reference to `docs/budget.png` with \$5 USD alert.
  - Teardown instructions for cost safety.

- [ ] **Step 4: Commit**
  ```bash
  git add configs/default_params.json README.md
  git commit -m "docs: complete official README with architecture, reproduction seed, and budget proof"
  ```

---

## Self-Review Checklist

- **Spec Coverage:**
  - `TerritorialGraph` & 7 sectors of Manta: Covered in Task 2.
  - Multi-sector initial seeding: Covered in Task 2 and 5.
  - Leaky vaccine ($\eta=0.8$) & delayed immunity: Covered in Task 3.
  - Convalescent volunteer brigade ($10-15\%$ roll, $3-5\%$ reinfection): Covered in Task 3.
  - 3-Step Dynamic Protocol & Random with strict dose parity: Covered in Task 4.
  - Explicit $K_t$ formula & $K_{\max} = 0.40 N$: Covered in Task 4.
  - Analytical $R_0$ metric: Covered in Task 4, 5, and 6.
  - Frozen API contract (Annex A): Covered in Task 5.
  - SVG 2D Manta visualizer with diff frames: Covered in Task 6.
  - ECS Express Mode (`us-east-2`, 8000, `/health`, \$5 budget): Covered in Task 7.
  - Acceptance checklist (Annex B/C): Covered in Task 8.
- **Type & Interface Consistency:** `TerritorialGraph`, `compute_r0`, `compute_dynamic_quota`, `run_paired_simulation` use consistent argument signatures across Tasks 2, 3, 4, and 5.
- **Proportion:** Clear, step-by-step actionable instructions with checkable results and zero fluff.
