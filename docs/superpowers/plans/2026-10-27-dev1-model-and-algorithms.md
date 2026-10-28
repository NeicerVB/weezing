# Plan de Implementación — Dev 1: Modelado, Algoritmos y Motor Epidemiológico
**Responsable:** Neicer Vásquez  
**Área:** Motor SEIR sobre Grafos, Topología Territorial de Manta y Estrategias de Intervención  

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el motor de simulación SEIR discreto estocástico nodo a nodo sobre la red de contactos territorial de Manta (7 sectores con hubs y puentes), el protocolo dinámico de intervención en 3 pasos con cuota flotante y reinversión, la línea base al azar con paridad estricta de dosis gastadas, la mecánica de brigadistas de convalecientes y el cálculo analítico de $R_0$.

**Architecture:** Módulos de Python 3.12 puro (sin dependencias externas pesadas) organizados en `src/seir/`. Clases inmutables con generador de números pseudoaleatorios determinista libre de colisiones (hashing Blake2b). Algoritmo de simulación con ejecución sincrónica de snapshots diarios y verificación estricta de invariantes de conservación.

**Tech Stack:** Python 3.12, pytest, dataclasses, typing, biblioteca estándar de Python.

**Spec:** [docs/superpowers/specs/2026-10-27-manta-containment-simulator-design.md](file:///home/neicervb/.gemini/antigravity/worktrees/Spookython/spookython_mentor_simulator_architecture/docs/superpowers/specs/2026-10-27-manta-containment-simulator-design.md)

## Global Constraints

- **Python Runtime:** Python 3.12 estricto.
- **Ubicación del código:** Todo el código del motor vive en `src/seir/`.
- **Rigor en Métricas:** Usar siempre "contagios evitados" ($I_{\text{cum}}^{\text{nada}} - I_{\text{cum}}^{\text{estrategia}}$), nunca "vidas salvadas". Prescindir de "protección efectiva" y reportar "dosis gastadas".
- **Invariantes Universales:** Conservación $|S| + |E| + |I| + |R| = N$ en cada día. Paridad estricta de dosis administradas ($D_t^{\text{azar}} = D_t^{\text{propuesta}}$). Tope global $K_{\max} = 0.40 N$.
- **Rendimiento:** Ejecución de las 3 estrategias emparejadas en p95 $\le 300$ ms en local para $N=1000, T=60$.

## Review Focus

1. **Topología de Manta Conexa:** La red generada no debe tener componentes desconectadas que dejen sectores aislados antes del brote.
2. **Paridad de Dosis en Días con Pocos Susceptibles:** Si la estrategia propuesta administra menos dosis que $K_t$ porque el foco está cercado, la línea base al azar no puede gastar más de lo que la propuesta administró.
3. **Pérdida de Dosis por Retraso:** Si un nodo en $S$ recibe vacuna con retraso $d_{\text{vac}} > 0$ y se contagia antes del día efectivo, la dosis se pierde y el nodo pasa a $E$.
4. **Brigadistas en Sectores Limpios:** Un voluntario en un sector donde no hay infectados ($I = 0$) tiene un riesgo de reinfección estrictamente igual a 0.
5. **División por Cero en Outbreak Vacío:** Si $I_0 = 0$, $R_0$ y $K_t$ deben computarse sin excepciones numéricas.

---

## Tareas

### Tarea 1: Reorganización del Código Base en `src/seir/` y Verificación de Regresión

**Files:**
- Modify: `pyproject.toml`
- Create: `requirements.txt`
- Move: `seir/` $\to$ `src/seir/`
- Test: `tests/test_engine.py` (38 tests existentes)

**Interfaces:**
- Consumes: Módulos actuales de `seir/`.
- Produces: Paquete `src.seir` accesible en el `PYTHONPATH`.

- [ ] **Paso 1: Mover atómicamente el paquete `seir/` a `src/seir/`**
  Ejecutar:
  ```bash
  mkdir -p src && git mv seir src/seir
  ```

- [ ] **Paso 2: Actualizar `pyproject.toml` y generar `requirements.txt`**
  Configurar `pythonpath = ["src"]` en la sección de pytest de `pyproject.toml` y fijar las dependencias de producción y pruebas. Generar `requirements.txt` con `pytest>=8.3.0`, `fastapi>=0.115.0`, `uvicorn>=0.32.0`, `pydantic>=2.9.0`.

- [ ] **Paso 3: Ejecutar la suite de pruebas existente para verificar cero regresión**
  Ejecutar: `pytest tests/ -v`  
  Salida esperada: 38 passed.

- [ ] **Paso 4: Commit**
  ```bash
  git add pyproject.toml requirements.txt src/ tests/
  git commit -m "refactor(dev1): move seir package into src/seir and verify test suite"
  ```

---

### Tarea 2: `TerritorialGraph` y Generador del Grafo de Manta (`src/seir/topology.py`)

**Files:**
- Create: `src/seir/topology.py`
- Create: `tests/test_topology.py`

**Interfaces:**
- Consumes: `src.seir.graph.Graph` (grafo inmutable base).
- Produces:
  ```python
  SECTORS: tuple[str, ...] = ("tarqui", "eloy_alfaro", "los_esteros", "manta_centro", "murcielago", "barbasquillo", "san_mateo")
  SECTOR_ADJACENCY: tuple[tuple[str, str], ...]

  @dataclass(frozen=True)
  class TerritorialGraph:
      graph: Graph
      sectors: tuple[str, ...]                  # Sector por nodo [0..N-1]
      hubs: frozenset[int]                      # IDs de nodos hub (~4x grado medio)
      labels: tuple[str, ...]                   # Nombres de puntos (ej. "Mercado de Tarqui")
      coords: tuple[tuple[float, float], ...]   # Coordenadas relativas (x, y) en [0, 100]

  def generate_manta_graph(n: int, average_degree: float, rng: random.Random) -> TerritorialGraph: ...
  def resolve_initial_infections(t_graph: TerritorialGraph, initial: dict[str, int], initial_ids: list[int] | None, rng: random.Random) -> frozenset[int]: ...
  ```

- [ ] **Paso 1: Escribir pruebas unitarias en `tests/test_topology.py`**
  Validar que `SECTOR_ADJACENCY` conecte los 7 sectores, que cada nodo tenga un sector asignado, que los hubs tengan grado mayor al promedio, que las coordenadas estén en $[0, 100]^2$, y que `resolve_initial_infections` resuelva siembras multi-sectoriales (`initial: {"tarqui": 5, "los_esteros": 2}`).

- [ ] **Paso 2: Ejecutar pruebas para verificar que fallen**
  Ejecutar: `pytest tests/test_topology.py -v`  
  Salida esperada: FAIL (módulo inexistente).

- [ ] **Paso 3: Implementar `src/seir/topology.py`**
  Implementar la clase `TerritorialGraph` con validaciones de invariantes en su constructor. Implementar `generate_manta_graph` generando enlaces densos intra-sectoriales, enlaces hacia hubs locales y puentes intersectoriales limítrofes según `SECTOR_ADJACENCY`.

- [ ] **Paso 4: Ejecutar pruebas para verificar que pasen**
  Ejecutar: `pytest tests/test_topology.py -v`  
  Salida esperada: PASS.

- [ ] **Paso 5: Commit**
  ```bash
  git add src/seir/topology.py tests/test_topology.py
  git commit -m "feat(dev1): implement TerritorialGraph and procedural Manta network generator"
  ```

---

### Tarea 3: Vacunación Leaky, Retraso Inmunológico y Brigadas de Convalecientes

**Files:**
- Modify: `src/seir/states.py`
- Modify: `src/seir/engine.py`
- Create: `tests/test_volunteers.py`
- Modify: `tests/test_engine.py`

**Interfaces:**
- Consumes: `TerritorialGraph` de `src.seir.topology`.
- Produces:
  - Estados extendidos y flags en `DayRecord`: `doses_administered: int`, `active_volunteers: int`, `volunteer_reinfections: int`.
  - Mecánica de vacuna leaky: $P(S_{\text{vac}} \to E) = 1 - (1 - (1 - \eta)\beta)^k$.
  - Seguimiento de vacunas pendientes (`d_vac`) con pérdida de dosis si el nodo se infecta antes de inmunizar.
  - Alistamiento de recuperados ($I \to R$) con $p_{\text{vol}} \in [0.10, 0.15]$ y riesgo ocupacional ($R \to E$) con $p_{\text{reinf}} \in [0.03, 0.05]$ si hay infectados en su sector.

- [ ] **Paso 1: Escribir pruebas en `tests/test_volunteers.py` y `tests/test_engine.py`**
  Validar la reducción de susceptibilidad con $\eta=0.8$, pérdida de dosis al infectarse antes de cumplir `d_vac`, alistamiento de voluntarios y riesgo de reinfección condicional a casos en su sector.

- [ ] **Paso 2: Ejecutar pruebas para verificar que fallen**
  Ejecutar: `pytest tests/test_volunteers.py -v`  
  Salida esperada: FAIL.

- [ ] **Paso 3: Implementar cambios en `states.py` y `engine.py`**
  Agregar soporte para nodos vacunados y pendientes, cálculo de probabilidad leaky, sorteo determinista de voluntarios al recuperar y sorteo de reinfección ocupacional preservando el cálculo en instantánea simultánea.

- [ ] **Paso 4: Ejecutar pruebas para verificar que pasen**
  Ejecutar: `pytest tests/test_volunteers.py tests/test_engine.py -v`  
  Salida esperada: PASS.

- [ ] **Paso 5: Commit**
  ```bash
  git add src/seir/states.py src/seir/engine.py tests/test_volunteers.py tests/test_engine.py
  git commit -m "feat(dev1): implement leaky vaccination, delay handling, and volunteer brigade dynamics"
  ```

---

### Tarea 4: Estrategias de Intervención, Paridad de Dosis y $R_0$ Analítico

**Files:**
- Create: `src/seir/strategies.py`
- Create: `tests/test_strategies.py`

**Interfaces:**
- Consumes: `TerritorialGraph` y `SeirEngine` de Tareas 2 y 3.
- Produces:
  ```python
  def compute_r0(beta: float, average_degree: float, gamma: float) -> float: ...
  def compute_dynamic_quota(n: int, active_i: int, active_e: int) -> int: ...

  def run_paired_simulation(
      t_graph: TerritorialGraph,
      config: SimulationConfig,
      initial_infections: frozenset[int],
      intervention_mode: str,          # "dynamic" o "static"
      quota: int,                      # K diario si static
      k_max: int,                      # Tope global
      efficacy: float,                 # eta
      delay: int,                      # d_vac
      p_vol: float,
      p_reinf: float,
      include_frames: bool = False,
  ) -> dict[str, Any]: ...
  ```

- [ ] **Paso 1: Escribir pruebas en `tests/test_strategies.py`**
  Validar cálculo de $R_0 = \beta \cdot \langle k \rangle / \gamma$, fórmula determinista de $K_t \in [15, 50]$ para $N=1000$, paridad estricta de dosis efectivamente administradas ($D_t^{\text{azar}} = D_t^{\text{propuesta}}$), cascada de 3 pasos (puentes $\to$ hubs $\to$ anillo $\to$ hubs preventivos), y que la estrategia propuesta supere al azar en el escenario benchmark fijado.

- [ ] **Paso 2: Ejecutar pruebas para verificar que fallen**
  Ejecutar: `pytest tests/test_strategies.py -v`  
  Salida esperada: FAIL.

- [ ] **Paso 3: Implementar `src/seir/strategies.py`**
  Implementar `compute_r0`, `compute_dynamic_quota`, la detección de sectores activos por carga ($I + 0.5E$), la ejecución emparejada de la estrategia propuesta (generando $[D_1, \dots, D_T]$) y el consumo idéntico de dosis por la línea base al azar con flujo pseudoaleatorio aislado (`"random_pick"`).

- [ ] **Paso 4: Ejecutar pruebas para verificar que pasen**
  Ejecutar: `pytest tests/test_strategies.py -v`  
  Salida esperada: PASS.

- [ ] **Paso 5: Commit**
  ```bash
  git add src/seir/strategies.py tests/test_strategies.py
  git commit -m "feat(dev1): implement 3-step intervention protocol, strict dose parity baseline, and R0"
  ```
