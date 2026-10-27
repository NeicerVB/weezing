# Especificación de Diseño: Manta Bio-Containment
**Proyecto:** Spookython Hackathon — Track B (La Plaga Zombie)  
**Fecha:** 2026-10-26  
**Equipo:** Josué Palma, Alex Triviño, Neicer Vásquez  
**Estado:** Propuesta de Diseño (Pendiente de Aprobación)

---

## 1. Intención y Propósito ("The Why")
El objetivo es proveer una herramienta web interactiva de simulación epidemiológica y toma de decisiones tácticas ante un brote de "Plaga Zombie" en la ciudad de Manta, Ecuador. 

El sistema permite a un tomador de decisiones (autoridad municipal, COE Cantonal o jurado evaluador) simular la propagación día a día y aplicar una **estrategia de intervención optimizada con recursos limitados** (dosis de vacuna/antídoto), demostrando cuantitativamente mediante simulaciones Monte Carlo cuántas vidas se salvan en comparación con dos líneas base: **No Intervenir** e **Intervenir al Azar**.

El diseño está concebido para responder de forma instantánea (< 2 segundos) ante el desafío de la **Prueba de Fuego** y el **Brote Sorpresa** del jurado (adaptación a nuevas condiciones de contagio o recursos en menos de 5 minutos).

---

## 2. Objetivos, No-Objetivos y Anti-Objetivos

### 1. Parámetros de Escala Poblacional y Recursos (Decisiones de Ingeniería)
- **Población Real de Manta ($N_{total} \approx 220,000$ habitantes):** El modelo corre sobre datos reales demográficos distribuidos en 7 sectores:
  - Tarqui: 60,000 hab.
  - Eloy Alfaro: 45,000 hab.
  - Los Esteros: 35,000 hab.
  - Manta Centro: 30,000 hab.
  - Murciélago: 24,000 hab.
  - Barbasquillo: 20,000 hab.
  - San Mateo: 6,000 hab.
  *(Dado que el modelo meta-poblacional opera sobre matrices de dimensión $7 \times 7$ con NumPy, el costo de cómputo para $N=220,000$ es idéntico al de $N=10,000$ (< 1 ms por corrida), permitiendo mostrar métricas humanas reales en el informe para el COE).*
- **Semilla Inicial de Infección ($I_0$):** Por defecto, brote inicial de $I_0 = 25$ infectados activos en el sector seleccionado (evita la extinción estocástica prematura en una población de 220,000).
- **Recursos Limitados:**
  - Dosis diarias por defecto: $K = 1,000$ dosis/día.
  - Tope acumulado de vacunas: $K_{max} = 25,000$ dosis (~11% de la población total).
  - Al agotarse $K_{max}$, la tasa de vacunación cesa ($V_t = 0$) y la epidemia sigue su curso natural.
- **Horizonte Temporal ($T$):** $T = 90$ días (captura el ciclo epidemiológico completo de onda única).

### 2. Formulación Matemática Rigurosa de las Estrategias
- **Línea Base 0 (Do Nothing):** $V_{i, t} = 0 \quad \forall i, t$.
- **Línea Base 1 (Equitativo / Uniforme Cantonal):**
  - Representa la política pública estándar de reparto cantonal equitativo.
  - Dosis asignadas a cada sector: $V_{i, t} = \min\left(S_{i, t}, \frac{K}{\sum_{j} \mathbb{I}(S_{j, t} > 0)}\right)$.
- **Estrategia Propuesta (Heurística Dinámica de Riesgo de Red):**
  - Cálculo diario dinámico del Score de Presión de Infección por sector:
    $$\text{Score}_{i, t} = \frac{S_{i, t}}{N_i} \cdot \left( I_{i, t} + \sum_{j=1}^7 M_{ji} \cdot I_{j, t} \right)$$
  - Distribución de las $K$ dosis proporcional al riesgo:
    $$V_{i, t} = \min\left(S_{i, t}, \left\lfloor K \cdot \frac{\text{Score}_{i, t}}{\sum_{m=1}^7 \text{Score}_{m, t}} \right\rfloor\right)$$
  - Si un sector satura su población susceptible ($V_{i, t} = S_{i, t}$), las dosis sobrantes se redistribuyen de forma recursiva a los siguientes sectores con mayor score.

### 3. Mecanismo de Respuesta ante el "Brote Sorpresa"
Para garantizar el éxito en los 5 minutos de la evaluación en vivo:
1. **Controles Reactivos Continuos en UI:** Sliders independientes para $\beta$ (contagiosidad), $\eta$ (eficacia vacuna), $K$ (stock diario), $K_{max}$ (tope total), sector de inicio del paciente cero y semilla del generador pseudoaleatorio.
2. **Presets de 1 Clic:**
   - *Brote en Mercado Central de Tarqui* ($I_{0, \text{Tarqui}} = 100$).
   - *Variante Z-Delta (Doble contagio)* ($\beta \times 2$).
   - *Crisis de Suministros (Corte del 50%)* ($K / 2$).
   - *Eficacia Vacunal Parcial* ($\eta = 0.5$).
   - *Cordón Sanitario (Aislamiento de Movilidad en Foco)* ($M_{ik} = 0$).

### No-Objetivos (Non-Goals)
- Modelar física individual de peatones/agentes en coordenadas GPS exactas (ABM pesado a nivel de milisegundos).
- Múltiples intervenciones combinadas (cuarentenas dinámicas, restricciones de movilidad, toques de queda) para evitar saturación del alcance en 44 horas.
- Persistencia en bases de datos relacionales complejas (todo el cómputo corre en memoria y bajo demanda en la instancia).
- Pasarelas de autenticación o roles de usuario (aplicación de acceso público directo para evaluación inmediata).

### Anti-Objetivos (Anti-Goals)
- Tiempos de cómputo superiores a 3 segundos por ejecución (arruinaría la experiencia de la demo en vivo y el Brote Sorpresa).
- Arquitecturas AWS sobredimensionadas (clusters EKS, ECS multi-nodo o colas SQS) que eleven costos innecesarios y compliquen el despliegue.
- Dependencias de librerías propietarias o modelos LLM lentos en la ruta crítica del cálculo matemático.

---

## 3. Restricciones del Proyecto
- **Tiempo límite:** Entrega en plataforma miércoles 28 de octubre a las 10:00 AM (Ecuador). Ventana de trabajo efectiva < 44 horas.
- **Equipo:** 3 desarrolladores con conocimientos intermedios de Python.
- **Infraestructura Cloud:** Cuenta de AWS activa, región `us-east-1`, uso de AWS App Runner y ECR.
- **Seguridad:** Cero secretos, tokens o credenciales en el repositorio Git.
- **Prueba de Fuego del Jurado:**
  - Demostración en vivo con semilla elegida por el jurado.
  - "Brote Sorpresa": cambio drástico de condiciones en vivo con 5 minutos de tiempo de reacción.

---

## 4. Enfoques Considerados y Selección

| Enfoque | Descripción | Ventajas | Desventajas | Decisión |
| :--- | :--- | :--- | :--- | :--- |
| **Opción 1: Manta Bio-Containment (SEIR Meta-Poblacional)** | Modelo compartimental discreto por sectores conectados por matriz de movilidad urbana. | Cómputo matricial NumPy instantáneo (< 1 s para 100 corridas Monte Carlo). Alta pertinencia local para jurados de Manta/ULEAM. Modificación inmediata para el Brote Sorpresa. | Granularidad a nivel de sector, no de individuo específico. | **SELECCIONADO (Elegido por el equipo)** |
| **Opción 2: NecroNet Hub-Defender (Grafo de Redes)** | Red sintética de contactos nodo por nodo con centralidad de grado y betweenness. | Alto rigor en teoría de grafos. | Recalcular betweenness en cada réplica estocástica es computacionalmente costoso en Python. Riesgo de lentitud en App Runner. | Descartado |
| **Opción 3: BioGrid Manta (Cuadrícula 2D con Agentes)** | Simulación visual de agentes transitando entre puntos de interés en una grilla. | Muy llamativo visualmente. | Complejidad de balanceo físico y estocástico en menos de 40 horas. | Descartado |

---

## 5. Arquitectura Técnica y Decisiones de Implementación

### 5.1 Componentes del Sistema
1. **Módulo de Datos Territoriales (`src/data/manta_sectors.py`):**
   - Parroquias/Sectores: Tarqui, Los Esteros, Manta Centro, Eloy Alfaro, San Mateo, Barbasquillo, Murciélago.
   - Población total aproximada representativa de Manta (~220,000 habitantes escalables a tamaño de muestra computacional N=10,000 para optimización numérica idéntica).
   - Matriz de movilidad origen-destino normalizada ($M \in \mathbb{R}^{7 \times 7}$), donde Tarqui y Manta Centro concentran el mayor tránsito comercial y laboral.
   - Coordenadas geográficas centroidales y polígonos GeoJSON simplificados para renderizado Plotly.

2. **Motor de Simulación Epidemiológica (`src/models/seir_engine.py`):**
   - Ecuaciones discretas estocásticas día a día ($t \in [0, T]$):
     $$\Delta E_{i, t} \sim \text{Binomial}\left(S_{i, t}, 1 - e^{-\lambda_{i, t}}\right)$$
     $$\Delta I_{i, t} \sim \text{Binomial}\left(E_{i, t}, \sigma\right)$$
     $$\Delta R_{i, t} \sim \text{Binomial}\left(I_{i, t}, \gamma\right)$$
     donde la fuerza de infección $\lambda_{i, t}$ incorpora la presión viral interna del sector y la importada a través de la movilidad inter-sectorial:
     $$\lambda_{i, t} = \beta \frac{I_{i, t} + \sum_{j \neq i} M_{ji} I_{j, t}}{N_i}$$
   - Regla de aplicación de vacunas ($V_{i, t}$): Inmunización efectiva $\eta \cdot V_{i, t}$ transferida de $S_{i, t}$ a $R_{i, t}$, con $V_{i, t} \le S_{i, t}$.
   - Soporte nativo de `seed` para determinismo y reproducibilidad matemática.

3. **Estrategias de Intervención (`src/models/strategies.py`):**
   - `NoInterventionStrategy`: Asignación nula ($V_{i, t} = 0$).
   - `RandomStrategy`: Reparto estocástico/uniforme de las $K$ dosis entre los sectores disponibles que tengan $S_i > 0$.
   - `OptimalRiskPriorityStrategy`: Asignación codiciosa/prioritaria en función del índice de vulnerabilidad y centralidad $Score_i = \beta \cdot \frac{S_i}{N_i} \cdot (I_i + \sum_j M_{ij} I_j)$. Protege los corredores de contagio antes de que la plaga se vuelva incontrolable.

4. **Motor Monte Carlo Paralelo (`src/models/monte_carlo.py`):**
   - Ejecuta $R$ iteraciones (defecto: 50 corridas) para cada una de las 3 estrategias.
   - Genera agregaciones estadísticas: media, mediana, percentil 2.5 y percentil 97.5 (intervalo de confianza 95%).
   - Calcula métricas comparativas:
     $$\text{Vidas Salvadas} = \mathbb{E}[I_{cum,\text{Base}}] - \mathbb{E}[I_{cum,\text{Estrategia}}]$$
     $$\text{Eficacia Relativa} = \frac{\text{Vidas Salvadas}}{\text{Total Dosis Aplicadas}}$$

5. **Interfaz de Usuario Web (`src/app.py`):**
   - Desarrollada con **Streamlit** y gráficos vectoriales interactivos con **Plotly**.
   - Barra lateral con sliders reactivos para todos los parámetros (tasa de infección, días de incubación, dosis diarias, punto de inicio del brote, semilla).
   - Botón directo **"🎃 Modo Brote Sorpresa"** con presets rápidos (ej. Doble contagio, Foco en Mercado de Tarqui, Reducción de vacunas al 50%) para ajustar todo en 1 clic durante la evaluación del jurado.
   - Pestaña de visualización de curvas temporales con bandas de incertidumbre.
   - Pestaña de mapa espacial de Manta con coropletas de calor.
   - Pestaña de "Informe Ejecutivo para el COE Cantonal" con redacción automática en lenguaje accesible para toma de decisiones.

6. **Infraestructura y Despliegue AWS (`Dockerfile`, `docs/arquitectura.png`, `docs/costos.md`):**
   - Contenedor Docker optimizado (Python 3.11-slim, multi-stage, usuario no root).
   - Repositorio ECR y servicio **AWS App Runner** con auto-escalado mínimo (1 instancia vCPU 1GB).
   - Generación de diagrama de arquitectura formal (App Runner + ECR + CloudWatch + IAM).
   - Configuración de alerta de AWS Budget (\$5.00 USD).

---

## 6. Organización del Repositorio (`weezing`)

```text
weezing/
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD opcional para build y push a ECR / App Runner
├── configs/
│   └── default_params.json     # Semilla y parámetros reproducibles por defecto
├── docs/
│   ├── arquitectura.png        # Diagrama de arquitectura AWS
│   ├── arquitectura.drawio     # Archivo fuente editable
│   ├── budget.png              # Captura de pantalla de AWS Budget con alerta activa
│   ├── costos.md               # Declaración de costos mensual y de evento
│   └── superpowers/specs/      # Documentación de diseño
├── src/
│   ├── __init__.py
│   ├── app.py                  # Entrypoint de la aplicación Streamlit
│   ├── data/
│   │   ├── __init__.py
│   │   ├── manta_sectors.py    # Datos poblacionales y matriz de movilidad
│   │   └── geojson_manta.py    # Geometrías para el mapa de calor
│   ├── models/
│   │   ├── __init__.py
│   │   ├── seir_engine.py      # Ecuaciones SEIR meta-poblacionales estocásticas
│   │   ├── strategies.py       # Algoritmos de intervención (Óptima, Azar, Sin acción)
│   │   └── monte_carlo.py      # Ejecución batch y cálculo de estadísticas
│   └── utils/
│       ├── __init__.py
│       └── metrics.py          # Cálculo de vidas salvadas y KPIs comparativos
├── tests/
│   ├── test_simulation.py      # Pruebas unitarias de reproducibilidad y balance de población
│   └── test_strategies.py      # Verificación de que la óptima supera al azar
├── Dockerfile                  # Contenedor listo para AWS App Runner
├── requirements.txt            # Dependencias fijadas (Streamlit, Plotly, NumPy, SciPy, etc.)
└── README.md                   # Documentación principal exigida por la rúbrica
```

---

## 7. Responsabilidades del Equipo (Plan de Ejecución 44h)

- **Desarrollador 1 (Neicer Vásquez - Modelado & Algoritmos):**
  - Implementación del modelo SEIR meta-poblacional en `src/models/seir_engine.py`.
  - Formulación de la heurística de asignación óptima en `src/models/strategies.py`.
  - Pruebas unitarias de reproducibilidad matemática y Monte Carlo con `pytest`.
- **Desarrollador 2 (Alex Triviño - Dashboard & UI):**
  - Construcción de la interfaz interactiva Streamlit en `src/app.py`.
  - Integración de gráficos Plotly (curvas con intervalos de confianza) y mapa espacial de Manta.
  - Implementación del selector de escenarios y botón de "Brote Sorpresa".
- **Desarrollador 3 (Josué Palma - Cloud, Documentación & Entregables):**
  - Creación del `Dockerfile` y configuración del despliegue en AWS App Runner.
  - Configuración de AWS Budget en la consola de AWS y captura `docs/budget.png`.
  - Redacción de `docs/costos.md`, diagrama de arquitectura (`docs/arquitectura.png/.drawio`) y estructura del `README.md`.
  - Preparación de las diapositivas del Pitch (máximo 20 MB).

---

## 8. Lo que queda a criterio del Desarrollador (Builder Details)
- Selección de la paleta cromática de la UI (sugerido: tema oscuro acorde a Halloween / Plaga Zombie con contrastes accesibles).
- Valores numéricos exactos de calibración inicial de $\beta, \sigma, \gamma$ alineados a referencias epidemiológicas reales (ej. dengue adaptado o virus de alta tasa $R_0 \approx 2.5 - 3.5$).
- Detalles finos de la vectorización en NumPy para máxima eficiencia de memoria.