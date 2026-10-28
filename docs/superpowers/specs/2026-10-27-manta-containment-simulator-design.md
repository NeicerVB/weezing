# Especificación de Diseño: Simulador de Contención Epidémica Manta (Track B - Spookython)
**Proyecto:** Spookython Hackathon — Track B (La Plaga Zombie)  
**Fecha:** 2026-10-27  
**Equipo:** Neicer Vásquez (Modelado y Algoritmos), Alex Triviño (Frontend y Visualización), Josué Palma (Cloud, Arquitectura y Entregables)  
**Estado:** Propuesta de Diseño Definitiva (Aprobada con Observaciones de Organización)

---

## 1. Intención y Propósito ("The Why")
Proveer una plataforma web interactiva y reproducible de simulación epidemiológica y toma de decisiones tácticas ante un brote de plaga infecciosa en la ciudad de Manta, Ecuador.

El sistema modela la dinámica de contagio sobre una red de contactos georreferenciada con 7 sectores urbanos clave y evalúa cuantitativamente el impacto de un **Protocolo Dinámico de 3 Pasos con recursos limitados** frente a dos líneas base obligatorias por la rúbrica del reto:
1. **Línea Base 0 (Do Nothing):** Curso natural del brote sin aplicar ninguna medida.
2. **Línea Base 1 (Intervención al Azar):** Asignación aleatoria de los mismos recursos diarios exactos entre la población susceptible.

El diseño está optimizado para responder de manera determinista e instantánea (< 100 ms localmente y < 2 s en la nube) ante la **Prueba de Fuego** y el desafío del **🎃 Brote Sorpresa** del jurado calificador de la ULEAM (adaptación a nuevas condiciones de contagio, focos territoriales en múltiples sectores o variación de recursos en menos de 5 minutos mediante controles reactivos directos).

---

## 2. Objetivos, No-Objetivos y Anti-Objetivos

### Objetivos Principales
1. **Simulación Estocástica Discreta sobre Grafos:** Modelar la transmisión nodo a nodo ($S \to E \to I \to R$) día a día sobre una topología que refleje clústeres comunitarios (hogares/barrios), puentes intersectoriales y hubs de alta concurrencia (como el Mercado Central de Tarqui).
2. **Protocolo Dinámico de Intervención en 3 Pasos con Cascada y Reinversión en Hubs:**
   - *Paso 1 - Anillo Exterior (Freno Macro):* Cortar la propagación intersectorial vacunando los nodos frontera y puentes de tránsito del sector afectado.
   - *Paso 2 - Desactivar Hubs (Freno Interno):* Vacunar los nodos de mayor centralidad y concurrencia dentro del sector activo.
   - *Paso 3 - Anillo Micro (Vacunación Directa):* Vacunación en anillo de los vecinos directos susceptibles de individuos infectados.
   - *Regla de Sobrantes:* Las dosis sobrantes tras atender el foco se reinvierten inmediatamente en vacunar preventivamente los hubs de otros sectores de Manta.
3. **Mecánica Táctica de Brigada de Convalecientes:**
   - Los individuos recuperados ($R$) tienen una probabilidad del $10\% - 15\%$ de alistarse voluntariamente en el equipo de contención.
   - Cada voluntario activo incrementa la capacidad operativa del equipo (bono de vacunación o agilidad en cierre de anillos).
   - Los voluntarios en primera línea presentan un riesgo ocupacional del $3\% - 5\%$ de reinfección accidental ($R \to E$), obligando a gestionar el balance entre capacidad operativa y seguridad.
4. **Gestión de Recursos y Paridad Estricta:**
   - *Modo Dinámico (Cuota Diaria Flotante):* Asignación diaria según casos activos en el rango de $15$ a $50$ dosis/día (para $N=1000$), con tope acumulado global del $40\%$ de la población ($K_{\max} = 0.40 N$).
   - *Modo Estático:* Cuota fija diaria $K$ hasta agotar stock.
   - *Paridad con Línea Base 1:* La estrategia propuesta genera el vector histórico diario $[K_1, \dots, K_T]$, y la línea base al azar consume exactamente esa misma secuencia para una comparación científica rigurosa.
5. **Arquitectura Cloud Moderna y No Deprecada en AWS:**
   - Monolito modular en contenedor Docker desplegado en **Amazon ECS Fargate** mediante **Amazon ECS Express Mode** (el reemplazo oficial de AWS para App Runner con gestión automática de balanceador HTTPS).
   - Integración con **AWS Step Functions Express (Inline Map)** y **AWS Lambda** para simulaciones masivas paralelas en memoria (< 2 s), con fallback local mediante `multiprocessing` para ejecución offline en la ULEAM.
   - Alerta temprana de costo con **AWS Budgets** fijada en \$5.00 USD y auditoría en **Amazon CloudWatch**.
6. **Frontend Ultraligero y Reactivo:**
   - Desarrollado en Vanilla JS + SVG nativo servido por FastAPI, con visualización 2D interactiva de la red de Manta animada día a día.
   - Controles interactivos directos (sliders y campos numéricos) para responder en caliente al **"🎃 Brote Sorpresa"** (duplicar contagio, recortar vacunas, cambiar eficacias o reubicar focos en vivo sin depender de botones predefinidos).
   - Generador automático del **"Informe Ejecutivo para el Alcalde / COE Cantonal"**.
7. **Rigor y Reproducibilidad Matemática:**
   - Horizonte temporal estándar: $T = 60$ días.
   - **Infección Inicial Multi-Sectorial:** Capacidad de configurar y distribuir los infectados iniciales ($I_0$) en uno o varios sectores simultáneamente (ej. brote simultáneo en Tarqui, Los Esteros o Manta Centro).
   - Determinismo estricto fijado por semilla (`seed`).
   - Invariante estricto de conservación poblacional: $S + E + I + R = N$ en todo instante.

### No-Objetivos (Non-Goals)
- Modelar física continua o trayectorias de agentes tipo videojuego (ABM pesado a nivel de milisegundos).
- Implementar bases de datos relacionales pesadas (Postgres/RDS) o sistemas de autenticación: el simulador opera 100% en memoria para máxima agilidad durante la evaluación en vivo.
- Modelar múltiples patologías simultáneas.

### Anti-Objetivos (Anti-Goals)
- Tiempos de cálculo superiores a 2 segundos en la interfaz web.
- Uso de servicios de AWS en modo de mantenimiento, cerrados a nuevas cuentas o en fin de vida (cero AWS App Runner, cero AWS CodeCommit, cero AWS Cloud9, cero AWS OpsWorks).
- Modelos complejos de caja negra o llamadas a LLMs externos en la ruta crítica de la simulación epidemiológica.

---

## 3. Restricciones y Entorno del Reto

- **Fecha límite de entrega:** Miércoles 28 de octubre a las 10:00 AM (Ecuador).
- **Prueba presencial:** Viernes 30 de octubre en la Universidad Laica Eloy Alfaro de Manabí (ULEAM): 5 min de pitch + 3 min de preguntas del jurado.
- **Entorno de ejecución:** 
  - Local: Python 3.12 (Conda `env_spookython`), FastAPI, Uvicorn, pytest.
  - Cloud: AWS región `us-east-2`, cuenta con AWS Budget de \$5 USD con alerta activa (`docs/budget.png`).
- **Seguridad:** Cero credenciales, claves API o secretos en el repositorio Git.

---

## 4. Enfoques Considerados y Selección

| Enfoque | Descripción | Ventajas | Desventajas | Decisión |
| :--- | :--- | :--- | :--- | :--- |
| **Opción 1: Grafo Territorial Atribuido + Monolito ECS Express Mode (Propuesta Consolidada)** | Autómata SEIR individual sobre red de contactos con 7 sectores de Manta, focos multi-sectoriales, desplegado en contenedor único en ECS Express Mode y Step Functions Express para Monte Carlo en memoria. | Rigor matemático en grafos, alta pertinencia local para el jurado ULEAM, visualización espacial SVG en tiempo real, latencia < 100 ms y cumplimiento de la arquitectura recomendada por el mentor. | Requiere generar un generador procedimental de topología territorial balanceado. | **SELECCIONADO** |
| **Opción 2: Grafo Sintético Abstracto Puro** | Red aleatoria matemática simple (nodos 0..N-1 y grado medio) sin sectores urbanos ni lugares físicos. | Muy simple de codificar, ya existente en el prototipo base. | Imposible contextualizar con Manta o responder creíblemente al Brote Sorpresa en el Mercado Central de Tarqui. | Descartado |
| **Opción 3: Meta-Población Compartimental 7x7 (Matrices NumPy)** | Ecuaciones diferenciales discretas matriciales sin seguimiento de individuos. | Cómputo ultra-rápido para grandes volúmenes. | No modela la red de contactos individual, no permite vacunación en anillo micro ni aprovecha el motor de grafos ya programado en Python. | Descartado |

---

## 5. Arquitectura Técnica y Especificación de Componentes

### 5.1 Generador del Grafo Territorial de Manta (`src/topology.py`)
- **7 Sectores Urbanos:**
  1. *Tarqui* (zona comercial y portuaria, alta densidad).
  2. *Eloy Alfaro* (zona residencial densa).
  3. *Los Esteros* (zona pesquera/industrial).
  4. *Manta Centro* (actividad administrativa y financiera).
  5. *Murciélago* (turismo, hotelería y servicios).
  6. *Barbasquillo* (zona universitaria y residencial).
  7. *San Mateo* (parroquia costera de menor densidad).
- **Estructura del Grafo:**
  - $N$ nodos (defecto: $N = 1000$, configurable entre $500$ y $2000$).
  - Cada nodo posee: `id` (int), `sector` (str), `is_hub` (bool), `label` (str opcional: "Mercado Central", "Terminal", "Hospital", "Hogar"), y coordenadas relativas $(x, y) \in [0, 100]^2$ para renderizado 2D.
  - Conectividad:
    - *Aristas intra-sectoriales:* Formación de vecindarios de grupos pequeños (hogares y manzanas) con alto coeficiente de agrupamiento.
    - *Hubs internos:* Puntos neurálgicos con grado significativamente mayor ($\approx 4\times$ el grado medio).
    - *Puentes intersectoriales:* Rutas de tránsito y transporte público que conectan sectores limítrofes.

### 5.2 Motor de Simulación Epidemiológica (`src/engine.py`, `src/states.py`)
- **Espacio de Estados por Nodo:**
  - `S` (Susceptible - Verde)
  - `E` (Expuesto/Incubando - Amarillo)
  - `I` (Infeccioso/Zombie - Rojo)
  - `R` (Recuperado/Exorcizado - Azul)
  - Modificadores ortogonales: `is_vaccinated` (bool), `is_volunteer` (bool).
- **Ecuaciones de Transición Diaria ($t \in [0, T]$, $T=60$ días):**
  - *Infección ($S \to E$):* Un nodo $u \in S$ no vacunado con $k$ vecinos en estado $I$ se expone con probabilidad:
    $$P(S \to E) = 1 - (1 - \beta)^k$$
    Si el nodo está vacunado pero con eficacia parcial $\eta \in [0, 1]$, la probabilidad efectiva es:
    $$P(S_{\text{vac}} \to E) = 1 - (1 - (1 - \eta)\beta)^k$$
  - *Progresión ($E \to I$):* Sorteo determinista con probabilidad $\sigma = 1 / d_{\text{incubation}}$.
  - *Recuperación ($I \to R$):* Sorteo determinista con probabilidad $\gamma = 1 / d_{\text{infection}}$.
  - *Reclutamiento de Brigadistas ($R \to \text{Voluntario}$):* Al momento de transicionar a $R$, sorteo con probabilidad $p_{\text{vol}} \in [0.10, 0.15]$.
  - *Riesgo Ocupacional de Brigadista:* Un voluntario activo en un sector con infectados sufre un riesgo de reinfección diaria:
    $$P(\text{Voluntario} \to E) = p_{\text{reinf}} \quad (\text{rango } 3\% - 5\%)$$
- **Invariante y Determinismo:**
  - Transiciones calculadas en snapshot sincrónico al inicio del día y aplicadas en bloque al finalizar el paso.
  - Invariante estricto verificado en cada tick: $|S| + |E| + |I| + |R| = N$.
  - Generación pseudo-aleatoria libre de colisiones mediante hash determinista: `event_uniform(seed, day, node_id, event_tag)`.

### 5.3 Módulo de Estrategias y Gestión de Recursos (`src/strategies.py`)
- **Regímenes de Recursos:**
  - *Modo Dinámico (Cuota Diaria Flotante):* Asignación diaria $K_t$ acotada entre $15$ y $50$ dosis/día en función de la aceleración de casos activos, hasta agotar un presupuesto acumulado total de $K_{\max} = 0.40 N$ (40% de la población total).
  - *Modo Estático:* Cuota fija diaria $K$ hasta agotar stock.
- **Líneas Base de Comparación:**
  - `DoNothingStrategy`: Cero vacunas aplicadas en todos los días ($V_t = 0$).
  - `RandomStrategy`: Consume exactamente el mismo vector diario $[K_1, \dots, K_T]$ determinado por la estrategia propuesta, repartiendo uniformemente al azar entre los nodos en estado $S$.
- **Estrategia Propuesta: Protocolo Dinámico de 3 Pasos con Cascada y Reinversión:**
  1. *Foco y Riesgo Multi-Sectorial:* Si hay múltiples sectores con casos activos iniciales o sobrevenidos, el presupuesto del día $K_t$ se reparte ponderando la tasa de ataque y el tránsito de cada sector activo.
  2. *Paso 1 (Freno Macro):* Se vacunan prioritariamente los nodos frontera (puentes intersectoriales) del sector afectado para crear un cordón sanitario y evitar la fuga a barrios vecinos.
  3. *Paso 2 (Freno Interno):* Se vacunan los hubs de mayor grado dentro del sector activo para apagar eventos de súper-propagación.
  4. *Paso 3 (Anillo Micro):* Se vacuna en anillo a los vecinos susceptibles directos de los nodos infectados. Si hay brigadistas disponibles, la capacidad de vacunación en anillo recibe un bono multiplicador (+1 dosis por cada 5 brigadistas activos).
  5. *Regla de Sobrantes:* Si tras cubrir los pasos 1, 2 y 3 en los sectores afectados aún restan dosis diarias, estas se aplican a vacunar los hubs preventivos del resto de sectores de Manta.

### 5.4 Arquitectura Cloud y Despliegue en AWS
- **Contenedor Monolítico Modular:**
  - Imagen base `python:3.12-slim` con empaquetado multi-stage.
  - Servidor FastAPI con Uvicorn ejecutando el motor y sirviendo archivos estáticos (`src/static/`).
  - Endpoints REST:
    - `GET /health`: Health check para el balanceador.
    - `POST /api/simulate`: Ejecución individual o emparejada de las 3 estrategias (< 100 ms). Retorna curvas agregadas y eventos dispersos (< 80 KB).
    - `POST /api/batch`: Orquestación de Monte Carlo (100 réplicas con intervalos de confianza del 95%).
- **Despliegue con Amazon ECS Express Mode:**
  - Archivos en `infra/`: `infra/Dockerfile` y especificación de servicio.
  - Comando oficial: `aws ecs create-express-gateway-service` / CDK `CfnExpressGatewayService`.
  - Provee balanceador de carga, certificado SSL/HTTPS y dominio público automático sin necesidad de configurar VPC, NAT Gateway ni ALB manualmente.
- **Orquestación de Lotes Pro (AWS Step Functions Express + Lambda):**
  - Definición en `infra/step_function_def.json` y worker en `infra/lambda_worker.py`.
  - Step Functions Express con `Inline Map` sincrónico devolviendo el resultado directamente en memoria en < 2 segundos.
  - Fallback local transparente con `concurrent.futures.ProcessPoolExecutor` para pruebas locales y evaluación offline en la ULEAM.
- **Gobierno de Costos y Observabilidad:**
  - **AWS Budgets:** Alerta configurada a \$5.00 USD mediante SNS/Email (`docs/budget.png`).
  - **Amazon CloudWatch:** Logs de acceso y métricas de latencia de ejecución.

### 5.5 Interfaz de Usuario y Demostración en Vivo (`src/static/`)
- **Arquitectura de Frontend:**
  - Vanilla JavaScript ES6 + SVG interactivo, sin dependencias externas pesadas.
  - Tamaño total del bundle < 80 KB; tiempo de carga < 100 ms.
- **Vistas Principales:**
  1. *Panel de Parámetros y Ajuste para Brote Sorpresa:* Controles directos (sliders y campos numéricos) para alterar en vivo cualquier variable del modelo: contagio $\beta$, periodo de incubación, cuota de vacunas $K$, modo de entrega (Dinámico vs Estático), eficacia vacunal, y selección/distribución de infectados iniciales $I_0$ en múltiples sectores simultáneos.
  2. *Visualizador Espacial 2D de Manta:* Representación visual del grafo por sectores, con animación paso a paso donde los nodos se colorean en tiempo real ($S$: verde, $E$: amarillo, $I$: rojo, $R$: azul, Brigadistas: celeste con insignia).
  3. *Gráfica Comparativa Multicurva:* Visualización de las 3 curvas superpuestas (Propuesta vs Azar vs Sin Intervención) destacando la reducción del pico de infección y el total de vidas salvadas.
  4. *Métricas Tácticas y Brigadistas:* Indicadores de vidas salvadas, brigadistas activos, reinfecciones ocupacionales y eficacia por dosis.
  5. *Informe Ejecutivo para el COE Cantonal / Alcalde:* Panel de texto claro y no técnico generado automáticamente con el resumen de la recomendación y balance de recursos.

---

## 6. Organización del Repositorio (Estructura Oficial Spookython)

Conforme a lo exigido en `entregables.md` de la organización:

```text
weezing/ (o raíz del repositorio)
├── README.md                   # Documentación principal exigida por la rúbrica y captura del budget
├── requirements.txt            # Dependencias del proyecto (FastAPI, Uvicorn, pytest)
├── configs/
│   └── default_params.json     # Semilla y parámetros reproducibles por defecto
├── docs/
│   ├── arquitectura.png        # Diagrama de arquitectura AWS (ECS Express + Step Functions + Lambda)
│   ├── arquitectura.drawio     # Archivo fuente editable
│   ├── budget.png              # Captura de pantalla de AWS Budget ($5 USD)
│   ├── costos.md               # Análisis de costos mensual y de evento
│   └── superpowers/
│       ├── specs/              # Especificaciones de diseño formal
│       └── plans/              # Plan de ejecución paso a paso
├── src/
│   ├── __init__.py
│   ├── app.py                  # Servidor web FastAPI y API REST (/health, /api/simulate, /api/batch)
│   ├── config.py               # Dataclasses de configuración y validaciones
│   ├── engine.py               # Ciclo diario estocástico SEIR y conservación
│   ├── graph.py                # Estructura básica de grafo inmutable
│   ├── rng.py                  # Generador determinista de eventos pseudoaleatorios
│   ├── states.py               # Enumeración de estados y transiciones
│   ├── strategies.py           # Protocolo de 3 Pasos, Random y Do Nothing
│   ├── topology.py             # Generador del Grafo Territorial de Manta (7 sectores y hubs)
│   └── static/
│       ├── index.html          # Interfaz web principal
│       ├── app.js              # Controlador reactivo y renderizado SVG
│       └── style.css           # Estilos oscuros acordes a Spookython
├── infra/                      # Despliegue en AWS
│   ├── Dockerfile              # Contenedor listo para Amazon ECS Express Mode
│   ├── lambda_worker.py        # Worker para simulación paralela en Lambda
│   └── step_function_def.json  # Definición del flujo distribuido Express
└── tests/
    ├── test_engine.py          # Verificación de invariante S+E+I+R = N
    ├── test_strategies.py      # Verificación de que la estrategia supera al azar
    ├── test_topology.py        # Validación de sectores y hubs de Manta
    ├── test_volunteers.py      # Pruebas de alistamiento y riesgo de brigadistas
    └── test_api_smoke.py       # Pruebas de integración de endpoints FastAPI
```

---

## 7. Responsabilidades del Equipo (Plan de Ejecución 44h)

- **Neicer Vásquez (Modelado, Algoritmos y Lógica de Simulación):**
  - Implementación del generador territorial de Manta en `src/topology.py` con soporte multi-sectorial.
  - Implementación del Protocolo Dinámico de 3 Pasos y la mecánica de Brigadistas en `src/strategies.py`.
  - Suite de pruebas unitarias y de reproducibilidad con `pytest` en `tests/`.
- **Alex Triviño (Frontend, Visualización y Experiencia de Usuario):**
  - Desarrollo de la interfaz web responsiva en `src/static/`.
  - Implementación del visualizador SVG 2D animado día a día del grafo de Manta.
  - Implementación de las curvas multicurva comparativas y controles interactivos directos para el Brote Sorpresa.
  - Generador dinámico del **"Informe para el Alcalde / COE Cantonal"**.
- **Josué Palma (Arquitectura Cloud, Infraestructura y Entregables):**
  - Creación del `infra/Dockerfile` optimizado y configuración para **Amazon ECS Express Mode**.
  - Configuración del flujo de **AWS Step Functions Express + Lambda** en `infra/` para lotes Nivel Pro.
  - Configuración de la alerta en **AWS Budgets** (\$5 USD) y captura en `docs/budget.png`.
  - Redacción de `docs/costos.md`, diagramas de arquitectura (`docs/arquitectura.png/.drawio`) y estructura del `README.md`.
  - Preparación de las diapositivas del Pitch (máximo 20 MB).

---

## 8. Lo que queda a criterio del Desarrollador (Builder Details)

- Paleta cromática exacta del SVG (contrastes accesibles con estética temática Halloween / Brote Zombie).
- Coordenadas de dispersión $(x, y)$ de los nodos dentro de cada polígono de sector de Manta para un renderizado visualmente limpio sin solapamientos excesivos.
- Ajuste fino de la ponderación de tránsito intersectorial al distribuir cuotas entre sectores activos.
