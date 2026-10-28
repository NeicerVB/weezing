# Especificación de Diseño: Simulador de Contención Epidémica Manta (Track B - Spookython)
**Proyecto:** Spookython Hackathon — Track B (La Plaga Zombie)  
**Fecha:** 2026-10-27  
**Equipo:** Neicer Vásquez (Modelado y Algoritmos), Alex Triviño (Frontend y Visualización), Josué Palma (Cloud, Arquitectura y Entregables)  
**Estado:** Propuesta de Diseño Definitiva (Consolidada tras Revisión Técnica y Grill-Me R1–R34)

---

## 1. Intención y Propósito ("The Why")
Proveer una plataforma web interactiva y reproducible de simulación epidemiológica y toma de decisiones tácticas ante un brote de plaga infecciosa en la ciudad de Manta, Ecuador.

El sistema modela la dinámica de contagio nodo a nodo sobre una red de contactos georreferenciada con 7 sectores urbanos clave y evalúa cuantitativamente el impacto de un **Protocolo Dinámico de 3 Pasos con recursos limitados** frente a dos líneas base obligatorias por la rúbrica del reto:
1. **Línea Base 0 (Do Nothing):** Curso natural del brote sin aplicar ninguna medida.
2. **Línea Base 1 (Intervención al Azar):** Asignación aleatoria de exactamente las mismas dosis administradas entre la población susceptible.

La métrica principal de impacto del sistema es el total de **Contagios Evitados** ($I_{\text{cum}}^{\text{nada}} - I_{\text{cum}}^{\text{estrategia}}$), descartando el término "vidas salvadas" dado que el modelo SEIR no formula letalidad ni muertes.

El diseño está optimizado para responder de manera determinista con un **p95 ≤ 800 ms en local** y **≤ 3 s en la nube**, permitiendo responder holgadamente ante la **Prueba de Fuego** y el desafío del **🎃 Brote Sorpresa** del jurado calificador de la ULEAM (adaptación a nuevas condiciones de contagio, focos territoriales multi-sectoriales o variación de recursos en menos de 5 minutos mediante controles reactivos directos).

---

## 2. Objetivos, No-Objetivos y Anti-Objetivos

### Objetivos Principales
1. **Simulación Estocástica Discreta sobre Grafos:** Modelar la transmisión nodo a nodo ($S \to E \to I \to R$) día a día sobre una topología `TerritorialGraph` que refleje clústeres comunitarios (hogares/barrios), puentes intersectoriales y hubs de alta concurrencia (como el Mercado Central de Tarqui).
2. **Protocolo Dinámico de Intervención en 3 Pasos con Cascada y Reinversión en Hubs:**
   - *Paso 1 - Freno Macro:* Reducción de la probabilidad de transmisión en puentes intersectoriales vacunando los nodos frontera del sector afectado (sin prometer un bloqueo físico del 100%).
   - *Paso 2 - Desactivar Hubs (Freno Interno):* Vacunación prioritaria de los nodos de mayor centralidad y concurrencia dentro del sector activo.
   - *Paso 3 - Anillo Micro (Vacunación Directa):* Vacunación en anillo de los vecinos directos susceptibles de individuos infectados.
   - *Regla de Sobrantes:* Las dosis sobrantes tras atender el foco se reinvierten inmediatamente en vacunar preventivamente los hubs de otros sectores de Manta.
3. **Mecánica Táctica de Brigada de Convalecientes:**
   - Al pasar de $I \to R$, sorteo determinista con probabilidad $p_{\text{vol}} \in [0.10, 0.15]$ (una vez por recuperación).
   - El voluntario no genera vacunas adicionales (el presupuesto $K_{\max}$ es inviolable); en su lugar, amplía la capacidad de rastreo y examen de contactos en el Paso 3.
   - Riesgo ocupacional de reinfección accidental ($R \to E$ con $p_{\text{reinf}} \in [0.03, 0.05]$) únicamente si el voluntario está activo y en su sector hay al menos un infectado activo ($I > 0$). Al reinfectarse, pierde inmediatamente el rol de voluntario (máximo 1 alistamiento adicional).
4. **Gestión de Recursos y Paridad Estricta de Dosis:**
   - *Modo Dinámico (Fórmula Explícita):* Cuota diaria flotante calculada deterministamente según la carga de casos activos:
     $$\text{activos}_t = I_t + 0.5 \cdot E_t$$
     $$K_t = \text{round}\left( \text{clamp}\left(0.015, 0.05, 0.015 + 0.7 \cdot \frac{\text{activos}_t}{N}\right) \cdot N \right)$$
     acotada entre $15$ y $50$ dosis/día (para $N=1000$), con tope acumulado global de $K_{\max} = 0.40 N$ ($400$ dosis).
   - *Modo Estático:* Cuota fija diaria $K$ hasta agotar stock acumulado.
   - *Paridad Estricta de Dosis Gastadas:* La Línea Base al Azar consume exactamente el mismo número de dosis efectivamente administradas que la propuesta en cada día ($D_t^{\text{azar}} = D_t^{\text{propuesta}}$).
5. **Métricas Epidemiológicas y Rigor Estadístico:**
   - **Número Básico de Reproducción ($R_0$) Explícito:** Tarjeta destacada en el dashboard calculada analíticamente a partir de la topología:
     $$R_0 = \beta \cdot \langle k \rangle \cdot \frac{1}{\gamma}$$
     donde $\beta$ es el contagio por enlace, $\langle k \rangle$ el grado medio y $1/\gamma$ el periodo infeccioso.
   - **Rango Empírico de Simulación (p2.5 - p97.5):** Dispersión estocástica en Monte Carlo reportada junto a la media (sin confundir percentiles con intervalos de confianza de la media).
   - **Métricas Claras:** Se reportan "Dosis Gastadas", "Pico de Infección", "Día del Pico" y "Contagios Evitados" (prescindiendo del término confuso "protección efectiva").
6. **Arquitectura Cloud Moderna y Gobernada en AWS (`us-east-2`):**
   - Monolito modular en contenedor Docker desplegado en **Amazon ECS Fargate** mediante **Amazon ECS Express Mode** en la región `us-east-2`.
   - Dimensionamiento mínimo (256 CPU / 512 MiB, 1 tarea) para costo de ~1 USD/día en evento (~25-30 USD/mes continuo), documentando el comando de borrado explícito en el README.
   - Estandarización de puerto 8000 y health check `/health` (`containerPort: 8000`, `healthCheckPath: /health`).
   - Lote masivo paralelo con **AWS Step Functions Express (Inline Map)** para Monte Carlo en memoria (< 3 s), retornando exclusivamente agregados estadísticos (< 30 KB). Fallback local con `ProcessPoolExecutor`.
   - Alerta temprana de costo con **AWS Budgets** fijada en \$5.00 USD (`docs/budget.png`) y auditoría en **Amazon CloudWatch**.
   - Plan B de infraestructura: Servicio ECS Fargate tradicional con CDK/CLI documentado.
7. **Frontend Ultraligero, Accesible y Blindado:**
   - Vanilla JS + SVG nativo servido por FastAPI (< 80 KB total).
   - Marcos de animación por diferencia (diffs diarios bajo demanda `include_frames`), reduciendo el payload a < 50 KB.
   - Controles interactivos directos (sliders y campos numéricos) para responder en caliente al **"🎃 Brote Sorpresa"** (sin presets rígidos).
   - Infección inicial multi-sectorial estructurada: `initial: {"tarqui": 5, "los_esteros": 2}` con soporte opcional de IDs explícitos.
   - Accesibilidad visual: diferenciación de estados mediante color + forma/símbolo geométrico y leyenda interactiva.
   - Disclaimer ético visible en la interfaz y en el informe: *«Simulación computacional ficticia con fines académicos para el Spookython Hackathon. No constituye una predicción epidemiológica ni una recomendación sanitaria real.»*
   - Blindaje de API: validación Pydantic ($N \le 2000, T \le 90, \text{replicas} \le 100$) y semáforo de concurrencia máxima con respuestas HTTP 400 y HTTP 429.

### No-Objetivos (Non-Goals)
- Modelar física continua o trayectorias de agentes tipo videojuego (ABM pesado).
- Implementar bases de datos relacionales pesadas (Postgres/RDS) o pasarelas de autenticación: el simulador opera 100% en memoria para máxima agilidad en la demo.
- Modelar muertes o letalidad (el motor no formula fallecimientos).

### Anti-Objetivos (Anti-Goals)
- Latencias p95 superiores a 800 ms en local o 3 s en la nube para la simulación emparejada.
- Uso de servicios de AWS obsoletos, en mantenimiento o cerrados a nuevas cuentas (cero AWS App Runner, cero AWS CodeCommit, cero AWS Cloud9, cero AWS OpsWorks).
- Respuestas de Step Functions superiores a 256 KB o dependencias no controladas de S3 en la ruta crítica síncrona.

---

## 3. Restricciones y Entorno del Reto

- **Fecha límite de entrega:** Miércoles 28 de octubre a las 10:00 AM (Ecuador).
- **Prueba presencial:** Viernes 30 de octubre en la ULEAM: 5 min de pitch + 3 min de preguntas del jurado.
- **Entorno de ejecución:** 
  - Local: Python 3.12 estricto (Conda `env_spookython`), FastAPI, Uvicorn, pytest.
  - Cloud: AWS región `us-east-2`, cuenta con AWS Budget de \$5 USD con alerta activa (`docs/budget.png`).
- **Seguridad:** Cero credenciales, claves API o secretos en el repositorio Git.

---

## 4. Enfoques Considerados y Selección

| Enfoque | Descripción | Ventajas | Desventajas | Decisión |
| :--- | :--- | :--- | :--- | :--- |
| **Opción 1: Grafo Territorial Atribuido + Monolito ECS Express Mode (Propuesta Consolidada)** | Autómata SEIR individual con `TerritorialGraph` en 7 sectores de Manta, focos multi-sectoriales, desplegado en contenedor único en ECS Express Mode (`us-east-2`) y Step Functions Express para Monte Carlo. | Rigor matemático en grafos, alta pertinencia local para el jurado ULEAM, visualización espacial SVG por diffs, latencia p95 ≤ 800 ms y cumplimiento de la arquitectura del mentor. | Requiere un generador procedimental balanceado con adyacencias fijas. | **SELECCIONADO** |
| **Opción 2: Grafo Sintético Abstracto Puro** | Red aleatoria matemática simple (nodos 0..N-1 y grado medio) sin sectores urbanos ni lugares físicos. | Muy simple de codificar, ya existente en el prototipo base. | Imposible contextualizar con Manta o responder creíblemente al Brote Sorpresa en el Mercado Central de Tarqui. | Descartado |
| **Opción 3: Meta-Población Compartimental 7x7 (Matrices NumPy)** | Ecuaciones diferenciales discretas matriciales sin seguimiento de individuos. | Cómputo ultra-rápido para grandes volúmenes. | No modela la red de contactos individual, no permite vacunación en anillo micro ni aprovecha el motor de grafos ya programado en Python. | Descartado |

---

## 5. Arquitectura Técnica y Especificación de Componentes

### 5.1 Generador del Grafo Territorial de Manta (`src/seir/topology.py`)
- **7 Sectores Urbanos:**
  1. *Tarqui* (zona comercial y portuaria, alta densidad).
  2. *Eloy Alfaro* (zona residencial densa).
  3. *Los Esteros* (zona pesquera/industrial).
  4. *Manta Centro* (actividad administrativa y financiera).
  5. *Murciélago* (turismo, hotelería y servicios).
  6. *Barbasquillo* (zona universitaria y residencial).
  7. *San Mateo* (parroquia costera de menor densidad).
- **Adyacencia Intersectorial Explícita (`SECTOR_ADJACENCY`):**
  ```python
  SECTOR_ADJACENCY: tuple[tuple[str, str], ...] = (
      ("tarqui", "eloy_alfaro"),
      ("tarqui", "los_esteros"),
      ("tarqui", "manta_centro"),
      ("manta_centro", "murcielago"),
      ("manta_centro", "barbasquillo"),
      ("barbasquillo", "san_mateo"),
      ("eloy_alfaro", "los_esteros"),
  )
  ```
- **Estructura `TerritorialGraph`:**
  - Encapsula una instancia inmutable de `Graph` sin alterar su código ni sus pruebas.
  - Tuplas inmutables paralelas:
    - `sectors: tuple[str, ...]`: Sector de cada nodo $[0..N-1]$.
    - `hubs: frozenset[int]`: Nodos de alta concurrencia ($\approx 4\times$ el grado medio, ej. Mercado de Tarqui, Terminal).
    - `labels: tuple[str, ...]`: Etiquetas opcionales de lugares de interés.
    - `coords: tuple[tuple[float, float], ...]`: Coordenadas relativas $(x, y) \in [0, 100]^2$.

### 5.2 Motor de Simulación Epidemiológica (`src/seir/engine.py`, `src/seir/states.py`)
- **Espacio de Estados por Nodo:**
  - `S` (Susceptible - Círculo Verde)
  - `E` (Expuesto/Incubando - Cuadrado Amarillo)
  - `I` (Infeccioso/Zombie - Triángulo Rojo)
  - `R` (Recuperado/Exorcizado - Círculo con Cruz Azul)
  - Modificadores ortogonales: `is_vaccinated` (bool), `is_pending` (bool), `is_volunteer` (bool).
- **Reglas de Vacunación y Eficacia Leaky:**
  - Solo se vacuna a nodos en estado `S` no vacunados ni pendientes.
  - La dosis se descuenta al administrarse. Si $d_{\text{vac}} > 0$, el nodo queda `pending` hasta $t + d_{\text{vac}}$; si enferma antes, la dosis se pierde.
  - Eficacia leaky ($\eta = 0.8$ por defecto):
    $$P(S_{\text{vac}} \to E) = 1 - (1 - (1 - \eta)\beta)^k$$
  - Sin revacunación y con tope estricto en $K_{\max}$.
- **Transiciones y Ciclo de Brigadistas:**
  - $E \to I$ con probabilidad $\sigma = 1 / d_{\text{incubation}}$.
  - $I \to R$ con probabilidad $\gamma = 1 / d_{\text{infection}}$.
  - $I \to R \to \text{Voluntario}$ con probabilidad $p_{\text{vol}} \in [0.10, 0.15]$.
  - Riesgo de reinfección de brigadista: $P(\text{Voluntario} \to E) = p_{\text{reinf}} \in [0.03, 0.05]$ solo si el voluntario está vivo, activo y su sector tiene al menos un infectado ($I > 0$). Al reinfectarse, `is_volunteer = False` (máximo 1 re-alistamiento posterior).
- **Invariante y Aislamiento de Semillas:**
  - Invariante estricto en cada tick: $|S| + |E| + |I| + |R| = N$.
  - Transmisión biológica idéntica e inmune a las llamadas de vacunación:
    `event_uniform(base_seed, day, node_id, "s2e" | "e2i" | "i2r")`.
  - La selección aleatoria de dosis en la Línea Base 1 usa una secuencia derivada independiente con tag `"random_pick"`. Desempates con `"tie"`.

### 5.3 Módulo de Estrategias y Paridad de Dosis (`src/seir/strategies.py`)
- **Definición de Sector Activo y Prioridad:**
  - Un sector es *activo* si $I > 0$ o $E > 0$.
  - Jerarquía multifocal ordenada por carga viral descendente ($\text{Carga}_s = I_s + 0.5 E_s$), con desempate alfabético determinista.
- **Líneas Base de Comparación:**
  - `DoNothingStrategy`: Cero vacunas aplicadas en todos los días ($V_t = 0$).
  - `RandomStrategy`: Consume en cada día exactamente el mismo número de dosis que la propuesta administró ese día ($D_t^{\text{azar}} = D_t^{\text{propuesta}}$), sorteadas uniformemente entre sus nodos $S$ elegibles.
- **Estrategia Propuesta (Protocolo Dinámico de 3 Pasos):**
  1. *Paso 1 (Freno Macro):* Vacunación prioritaria de los nodos frontera (puentes intersectoriales limítrofes) del sector activo para mitigar la probabilidad de escape viral.
  2. *Paso 2 (Freno Interno):* Vacunación de los hubs internos del sector activo.
  3. *Paso 3 (Anillo Micro):* Vacunación en anillo de los vecinos directos susceptibles de individuos infectados. Los brigadistas amplían la profundidad de rastreo de candidatos dentro de la cuota diaria sin crear vacunas extras.
  4. *Regla de Sobrantes:* Las dosis no gastadas en los pasos 1–3 se reinvierten en vacunar preventivamente los hubs de otros sectores de Manta.

### 5.4 Arquitectura Cloud y Despliegue en AWS (`us-east-2`)
- **Contenedor Monolítico Modular:**
  - Imagen base `python:3.12-slim` con empaquetado multi-stage en `infra/Dockerfile`.
  - Servidor FastAPI con Uvicorn escuchando en `0.0.0.0:8000`:
    `uvicorn src.seir.app:app --host 0.0.0.0 --port 8000`
  - Endpoints REST validados con Pydantic:
    - `GET /health`: Responde HTTP 200 `{"status": "healthy"}`.
    - `POST /api/simulate`: Simulación emparejada de las 3 estrategias. Latencia p95 ≤ 800 ms local y ≤ 3 s en nube. Retorna curvas agregadas y diffs de animación (< 50 KB).
    - `POST /api/batch`: Monte Carlo (30 réplicas por defecto, 100 Nivel Pro). Retorna únicamente agregados estadísticos (media, p2.5, p97.5, min, max) en < 30 KB.
  - Límites de seguridad: $N \le 2000, T \le 90, \text{replicas} \le 100$, semáforo de concurrencia máxima (máx 2 simultáneas), respuestas HTTP 400 y 429.
- **Despliegue con Amazon ECS Express Mode:**
  - Configuración explícita: `containerPort: 8000`, `healthCheckPath: /health`.
  - Provee balanceador ALB, certificado SSL/HTTPS y dominio público automático.
  - Dimensionamiento: 1 tarea Fargate, 0.25 vCPU (256 CPU units) y 0.5 GB RAM (512 MiB). Coste de evento ~1 USD/día (~25-30 USD/mes continuo).
  - Comando de borrado documentado en el README:
    `aws ecs delete-express-gateway-service --service-arn <ARN>`
  - Plan B: Despliegue ECS Fargate tradicional con CDK/CLI documentado.
- **Orquestación de Lotes Pro (AWS Step Functions Express + Lambda):**
  - Flujo Express sincrónico con `Inline Map` en `us-east-2`, retornando el resumen estadístico directo en memoria (< 3 s).
  - Fallback local transparente con `concurrent.futures.ProcessPoolExecutor` para funcionamiento offline en la ULEAM.
- **Gobierno de Costos y Observabilidad:**
  - **AWS Budgets:** Alerta configurada a \$5.00 USD mediante correo (`docs/budget.png`).
  - **Amazon CloudWatch:** Logs y alarmas operativas.

### 5.5 Interfaz de Usuario y Demostración en Vivo (`src/seir/static/`)
- **Arquitectura de Frontend:**
  - Vanilla JavaScript ES6 + SVG interactivo (< 80 KB total).
  - Sin dependencias pesadas ni frameworks de terceros.
- **Vistas Principales:**
  1. *Disclaimer Ético Destacado:* Cabecera visible indicando el carácter ficticio y académico de la simulación.
  2. *Panel de Parámetros y Ajuste para Brote Sorpresa:* Controles interactivos directos (sliders y campos numéricos) para modificar en tiempo real $\beta$, periodo de incubación, cuota de vacunas $K$, modo (Dinámico vs Estático), eficacia vacunal y siembra multi-sectorial de $I_0$.
  3. *Visualizador Espacial 2D de Manta:* Representación visual del grafo por sectores, con animación paso a paso basada en marcos por diferencia (`changed: [{id, state}]`). Distinción accesible por color + forma geométrica + símbolo.
  4. *Gráfica Comparativa Multicurva:* Visualización superpuesta de las 3 curvas de contagio (Propuesta vs Azar vs Sin Intervención) con el rango empírico de simulación (p2.5–p97.5) en gris y medias consolidadas.
  5. *Métricas Epidemiológicas y Tácticas en el Dashboard:*
     - **Tarjeta de Número Básico de Reproducción ($R_0$):** Indicador explícito del potencial de propagación base ($\beta \cdot \langle k \rangle / \gamma$).
     - **Tarjeta de Contagios Evitados:** Reducción neta frente a Do Nothing ($I_{\text{cum}}^{\text{nada}} - I_{\text{cum}}^{\text{estrategia}}$).
     - **Tarjeta de Dosis Gastadas:** Total de vacunas aplicadas en la campaña.
     - **Tarjeta de Pico y Día del Pico:** Amortiguamiento del pico hospitalario de infecciosos ($I$).
     - **Tarjeta de Brigadistas:** Voluntarios activos y reinfecciones ocupacionales controladas.
  6. *Informe Ejecutivo para el COE Cantonal (Simulación Académica):* Resumen determinista generado por plantilla en lenguaje claro y de toma de decisiones sin sesgos médicos reales.

---

## 6. Organización del Repositorio (Estructura Oficial Spookython)

Alineada estrictamente a `entregables.md` de la organización:

```text
weezing/ (raíz del repositorio Git)
├── README.md                   # Documentación principal, decisiones, receta de despliegue y budget
├── pyproject.toml              # Fuente única de verdad de dependencias y configuración (Python 3.12)
├── requirements.txt            # Dependencias fijadas generadas automáticamente para Docker
├── configs/
│   └── default_params.json     # Semilla y parámetros reproducibles por defecto
├── docs/
│   ├── arquitectura.png        # Diagrama de arquitectura AWS (ECS Express + Step Functions + Lambda)
│   ├── arquitectura.drawio     # Archivo fuente editable
│   ├── budget.png              # Captura de pantalla de AWS Budget ($5 USD)
│   ├── costos.md               # Análisis de costos mensual y de evento (~1 USD/día)
│   ├── reto/                   # Copia oficial de los 5 archivos del hackathon
│   │   ├── entregables.md
│   │   ├── objetivo.md
│   │   ├── recursos.md
│   │   ├── reglas.md
│   │   └── requisitos.md
│   └── superpowers/
│       ├── specs/              # Especificaciones formales de diseño
│       └── plans/              # Plan de implementación paso a paso por horas
├── src/
│   └── seir/                   # Paquete modular oficial del simulador
│       ├── __init__.py
│       ├── app.py              # Servidor web FastAPI y API REST (/health, /api/simulate, /api/batch)
│       ├── config.py           # Dataclasses de configuración y esquemas Pydantic
│       ├── engine.py           # Motor de simulación SEIR estocástico y conservación N
│       ├── graph.py            # Grafo base inmutable probado
│       ├── rng.py              # Generador determinista de eventos pseudoaleatorios
│       ├── states.py           # Enumeración de estados y modificadores
│       ├── strategies.py       # Protocolo de 3 Pasos, Random (paridad) y Do Nothing
│       ├── topology.py         # TerritorialGraph y generador de Manta con SECTOR_ADJACENCY
│       └── static/
│           ├── index.html      # Interfaz web accesible con disclaimer
│           ├── app.js          # Controlador reactivo y renderizado SVG por diffs
│           └── style.css       # Estilos temáticos de alto contraste
├── infra/                      # Despliegue en AWS (us-east-2)
│   ├── Dockerfile              # Contenedor optimizado (Python 3.12, containerPort: 8000)
│   ├── ecs_service.json        # Definición de servicio para ECS Express Mode
│   ├── lambda_worker.py        # Worker para simulación paralela en Lambda
│   └── step_function_def.json  # Definición del flujo distribuido Express
└── tests/
    ├── test_engine.py          # Verificación de invariante S+E+I+R = N
    ├── test_strategies.py      # Verificación de invariantes matemáticos y paridad de dosis
    ├── test_topology.py        # Validación de TerritorialGraph, sectores y hubs de Manta
    ├── test_volunteers.py      # Pruebas de alistamiento y riesgo ocupacional de brigadistas
    └── test_api_smoke.py       # Pruebas de integración HTTP (/health, /api/simulate, límites)
```

---

## 7. Ruta Crítica por Horas, Triaje de Alcance y Responsabilidades (R33, R34)

### Triaje de Alcance
- **Se queda (Núcleo Obligatorio No Negociable):** Motor SEIR territorial de Manta (7 sectores con `TerritorialGraph`), 3 estrategias con paridad estricta de dosis gastadas, controles interactivos directos para el Brote Sorpresa, métricas ($R_0$, Contagios Evitados, Pico de $I$, Dosis), 3 curvas comparativas superpuestas, contenedor Docker en ECS Express Mode en `us-east-2`, captura de AWS Budget ($5 USD) y README completo.
- **Se simplifica:** Animación SVG 2D optimizada por diffs (si apremia el tiempo, mapa de calor agregado por sector), informe ejecutivo por plantilla en Python, Monte Carlo con 30 réplicas por defecto mediante `ProcessPoolExecutor`.
- **Se pospone (Nivel Pro Condicional):** Despliegue de Step Functions Express en AWS (activado solo tras validar la URL de ECS) y mecánica de Brigadistas de convalecientes (integrada sobre el motor base funcional).

### Cronograma por Horas
| Franja | Meta | Dueño |
| :--- | :--- | :--- |
| **Hora 0–3** | `src/seir/topology.py`, `TerritorialGraph`, adyacencia de Manta, carga y tests de topología. | Neicer |
| **Hora 3–6** | `src/seir/strategies.py`, paridad de dosis gastadas, aislamiento de semillas, invariantes en pytest. | Neicer |
| **Hora 6–8** | `src/seir/app.py`, endpoints `/health` y `/api/simulate` según contrato del Anexo A, schemas Pydantic y rate limiting. | Neicer / Josué |
| **Hora 8–10** | Frontend en `src/seir/static/`: sliders del Brote Sorpresa, multicurva, tarjeta de $R_0$, tabla de métricas y disclaimer. | Alex |
| **Hora 10–11** | Empaquetado `infra/Dockerfile`, prueba local del contenedor y verificación de `/health`. | Josué |
| **Hora 11–12** | Despliegue en AWS ECS Express Mode (`us-east-2`), alerta de AWS Budget (\$5 USD) y prueba de URL pública. | Josué |
| **Hora 12–13** | Documentación obligatoria: `README.md`, `docs/costos.md`, `docs/budget.png`, diagrama de arquitectura y diapositivas. | Josué / Alex |
| **Hora 13–14** | Ensayo cronometrado de la Prueba de Fuego y margen de contingencia. | Equipo |

**Línea de Recorte (Freno de Emergencia):** Si a la hora 8 la integración general presenta demoras, se entrega la vista agregada por sectores con curvas comparativas y métricas, posponiendo la animación nodo a nodo y los brigadistas. **Nunca se recortan:** las 3 estrategias comparadas con paridad, la reproducibilidad por semilla, el cálculo analítico de $R_0$, el despliegue público en AWS ni el budget.

---

## 8. Observaciones de la Organización y Estado de Cumplimiento (R28)

| Observación / Requisito Oficial | Cómo se Cumple en este Diseño | Estado |
| :--- | :--- | :--- |
| **Estructura de Carpetas (`entregables.md`)** | Se adopta estrictamente `src/`, `infra/`, `docs/`, `tests/`, `configs/` y `README.md`. | **Cerrada** |
| **Dos Líneas Base Obligatorias (`requisitos.md`)** | Se incluye formalmente Do Nothing e Intervención al Azar con paridad estricta de dosis gastadas. | **Cerrada** |
| **Brote Sorpresa en Vivo (`reglas.md`)** | Controles reactivos directos (sliders y campos numéricos) para alterar en caliente cualquier parámetro en < 5 minutos sin depender de botones rígidos. | **Cerrada** |
| **Infección Multi-Sectorial** | Soporte para siembra inicial $I_0$ en múltiples sectores simultáneos (`initial: {"tarqui": 5, "los_esteros": 2}`). | **Cerrada** |
| **Número Básico de Reproducción ($R_0$)** | Métrica analítica explícita y tarjeta visible en el dashboard: $R_0 = \beta \cdot \langle k \rangle / \gamma$. | **Cerrada** |
| **Región de Despliegue** | Fijada en `us-east-2` (Ohio). | **Cerrada** |
| **Control de Costos de AWS** | AWS Budget de \$5 USD con alerta activa y comando explícito de borrado para ECS Express Mode (~1 USD/día). | **Cerrada** |
| **Cero Servicios Obsoletos** | Vetados formalmente App Runner, CodeCommit, Cloud9 y OpsWorks. | **Cerrada** |

---

## Anexo A — Contrato de API Congelado (R25)

### `POST /api/simulate`

```json
{
  "n": 1000,
  "days": 60,
  "seed": 42,
  "beta": 0.03,
  "sigma": 0.2,
  "gamma": 0.1,
  "degree": 8,
  "initial": {"tarqui": 5, "los_esteros": 2},
  "initial_ids": null,
  "intervention": {
    "mode": "dynamic",
    "efficacy": 0.8,
    "delay": 0,
    "quota": 30,
    "k_max": 400
  },
  "volunteers": {"enlist": 0.12, "reinfection": 0.04},
  "include_frames": false
}
```

Respuesta `HTTP 200`:

```json
{
  "meta": {
    "n": 1000,
    "days": 60,
    "seed": 42,
    "average_degree": 8.0,
    "sectors": ["tarqui", "eloy_alfaro", "los_esteros", "manta_centro", "murcielago", "barbasquillo", "san_mateo"],
    "r0": 2.4,
    "effective": {
      "beta": 0.03,
      "sigma": 0.2,
      "gamma": 0.1,
      "quota": 30,
      "k_max": 400
    }
  },
  "strategies": {
    "proposed": {
      "days": [
        {"day": 0, "s": 993, "e": 0, "i": 7, "r": 0, "new_s_to_e": 0, "cumulative": 7, "volunteers": 0}
      ],
      "metrics": {
        "doses_spent": 0,
        "cumulative_infections": 7,
        "peak_i": 7,
        "peak_day": 0,
        "avoided_infections": 0,
        "active_volunteers": 0,
        "volunteer_reinfections": 0
      }
    },
    "random": {
      "days": [],
      "metrics": {
        "doses_spent": 0,
        "cumulative_infections": 7,
        "peak_i": 7,
        "peak_day": 0,
        "avoided_infections": 0
      }
    },
    "none": {
      "days": [],
      "metrics": {
        "doses_spent": 0,
        "cumulative_infections": 7,
        "peak_i": 7,
        "peak_day": 0,
        "avoided_infections": 0
      }
    }
  },
  "frames": null
}
```

*Nota:* Cuando `include_frames: true`, `frames` es una lista diaria de diffs:
`[{"day": 1, "changed": [{"id": 14, "state": "E"}, {"id": 89, "state": "V"}]}]`.

Errores controlados:
- `HTTP 400 Bad Request`: `{"error": "Parámetro inválido: N debe ser ≤ 2000"}`.
- `HTTP 429 Too Many Requests`: `{"error": "Servidor ocupado. Demasiadas simulaciones concurrentes."}` con cabecera `Retry-After: 2`.

### `POST /api/batch`

```json
{
  "base": {
    "n": 1000,
    "days": 60,
    "beta": 0.03,
    "sigma": 0.2,
    "gamma": 0.1,
    "degree": 8
  },
  "replicas": 30
}
```

Respuesta `HTTP 200`:

```json
{
  "replicas": 30,
  "r0": 2.4,
  "strategies": {
    "proposed": {
      "avoided_infections": {"mean": 215.4, "p2_5": 178.0, "p97_5": 242.0, "min": 165.0, "max": 251.0},
      "peak_i": {"mean": 45.2, "p2_5": 38.0, "p97_5": 54.0, "min": 35.0, "max": 58.0},
      "doses_spent": {"mean": 380.0, "p2_5": 360.0, "p97_5": 400.0, "min": 350.0, "max": 400.0}
    },
    "random": {
      "avoided_infections": {"mean": 82.1, "p2_5": 45.0, "p97_5": 110.0, "min": 38.0, "max": 118.0},
      "peak_i": {"mean": 95.0, "p2_5": 82.0, "p97_5": 112.0, "min": 78.0, "max": 119.0},
      "doses_spent": {"mean": 380.0, "p2_5": 360.0, "p97_5": 400.0, "min": 350.0, "max": 400.0}
    },
    "none": {
      "avoided_infections": {"mean": 0.0, "p2_5": 0.0, "p97_5": 0.0, "min": 0.0, "max": 0.0},
      "peak_i": {"mean": 142.3, "p2_5": 128.0, "p97_5": 160.0, "min": 120.0, "max": 168.0},
      "doses_spent": {"mean": 0.0, "p2_5": 0.0, "p97_5": 0.0, "min": 0.0, "max": 0.0}
    }
  }
}
```

---

## Anexo B — Checklist de Aceptación (R29)

- [ ] `S + E + I + R = N` en cada paso y en las 3 estrategias.
- [ ] `β = 0` no produce exposiciones; `σ = 0` no vacía $E$; `γ = 0` no vacía $I$.
- [ ] `K_{\max} = 0` hace coincidir las 3 curvas en la misma semilla.
- [ ] Nunca se administran más dosis que $K_{\max}$ ni se revacuna a ningún nodo.
- [ ] Propuesta y azar administran exactamente el mismo número de dosis por día ($D_t^{\text{azar}} = D_t^{\text{propuesta}}$).
- [ ] Misma semilla ⇒ respuesta idéntica determinista; semilla distinta ⇒ salida distinta.
- [ ] $E$ no transmite y los cambios del día se aplican sincrónicamente.
- [ ] Un nodo vacunado con retraso ($d_{\text{vac}} > 0$) que enferma antes de inmunizar pierde la dosis.
- [ ] Multifoco: la suma de infectados iniciales no supera $N$.
- [ ] `POST /api/simulate` responde dentro de las metas de latencia (p95 ≤ 800 ms local, ≤ 3 s nube).
- [ ] `GET /health` responde HTTP 200 dentro del contenedor Docker.
- [ ] Límites de entrada devuelven HTTP 400; exceso de concurrencia devuelve HTTP 429 con `Retry-After`.
- [ ] La interfaz web y el informe exhiben el aviso destacado de simulación académica ficticia.
- [ ] URL pública HTTPS en `us-east-2` probada con éxito desde un dispositivo externo.
- [ ] Captura de AWS Budgets (\$5 USD) y receta de borrado documentadas en `README.md`.
