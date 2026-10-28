# Simulador de Contención Epidémica de Manta (Proyecto Weezing)

**Spookython · Track B: Modelos y Algoritmos de Contención**  
Simulación computacional ficticia de estados SEIR sobre una red sintética de siete sectores de Manta (Ecuador). Compara un protocolo territorial de recursos limitados con una asignación al azar y con la ausencia de intervención, bajo las mismas condiciones iniciales. Los parámetros son abstractos, sin calibración a un patógeno real.

> **Aviso de alcance:** Simulación computacional académica desarrollada exclusivamente para el hackathon Spookython. Los parámetros son ilustrativos y no constituyen predicción epidemiológica ni recomendación sanitaria clínica oficial.

---

## Resumen del Escenario Epidemiológico

- **El modelo:** Autómata discreto y estocástico **SEIR** ($S \to E \to I \to R$), con actualizaciones simultáneas una vez al día. Los valores por defecto son ilustrativos; no describen un patógeno real.
- **La población:** Red sintética repartida entre *Tarqui, Eloy Alfaro, Los Esteros, Manta Centro, Murciélago, Barbasquillo y San Mateo*. La interfaz conserva un contorno ilustrativo y siete regiones; no representa cartografía ni contactos reales.
- **La intervención:** Vacunación focalizada con vacuna imperfecta tipo *leaky* (eficacia $\eta = 0.8$, reduciendo la probabilidad de contagio en un 80%), soporte de brigadistas comunitarios voluntarios ($v = 0.12$) y stock restringido al 40% de la población ($K = 400$ dosis).
- **Regla estricta de elegibilidad:** El algoritmo solo vacuna a individuos en estado Susceptible ($S$). Nunca se desperdician dosis en personas ya infectadas ($E, I$) o recuperadas/inmunes ($R$).

---

## 1. Puesta en Marcha Rápida (Cómo encender el simulador)

Para poder visualizar el simulador en el navegador (`http://localhost:8000`) o consumir su API, primero debemos iniciar el servidor backend. Elige la opción adecuada para tu entorno:

### Opción A (Recomendada): Vía Docker
*(No requiere configurar Python ni entornos locales; solo requiere tener Docker en ejecución)*

```bash
# 1. Construir la imagen del contenedor
docker build -f infra/Dockerfile -t manta-sim .

# 2. Iniciar el contenedor escuchando en el puerto 8000
docker run --rm -p 8000:8000 manta-sim
```

---

### Opción B: Vía Python en Linux / macOS
*(Requiere Python 3.12)*

```bash
# 1. Crear y activar el entorno virtual
python3 -m venv .venv
source .venv/bin/activate

# 2. Instalar dependencias del proyecto y pruebas
python -m pip install -r requirements.txt
python -m pip install -e ".[test]"

# 3. Iniciar el servidor FastAPI con Uvicorn
python3 -m uvicorn seir.app:app --app-dir src --host 127.0.0.1 --port 8000 --reload
```

---

### Opción C: Vía Python en Windows (PowerShell)
*(Requiere Python 3.12)*

```powershell
# 1. Crear y activar el entorno virtual
python -m venv .venv
.venv\Scripts\Activate.ps1

# 2. Instalar dependencias del proyecto y pruebas
python -m pip install -r requirements.txt
python -m pip install -e ".[test]"

# 3. Iniciar el servidor FastAPI con Uvicorn
python3 -m uvicorn seir.app:app --app-dir src --host 127.0.0.1 --port 8000 --reload
```

---

### Opción D: Alternativa con Conda / Mamba
*(Si utilizas Anaconda o Miniconda)*

```bash
# 1. Crear y activar entorno Conda con Python 3.12
conda create -n manta python=3.12 -y
conda activate manta

# 2. Instalar dependencias del proyecto y pruebas
python -m pip install -r requirements.txt
python -m pip install -e ".[test]"

# 3. Iniciar el servidor
python3 -m uvicorn seir.app:app --app-dir src --host 127.0.0.1 --port 8000 --reload
```

> **Servicio activo:** Cuando la terminal indique `Uvicorn running on http://0.0.0.0:8000`, el servidor estará listo. Mantén esa terminal abierta y continúa con el paso 2.

---

## 2. Reproducción para el Jurado (Track B)

Con el servidor encendido en el paso anterior, el jurado puede validar inmediatamente la configuración oficial congelada en [`configs/default_params.json`](configs/default_params.json) (*Semilla 42, N=1000, 60 días, Stock 400, Tarqui como foco inicial*):

### Vía Visual (Recomendada)
Abre en tu navegador:  
👉 **`http://localhost:8000`**

La interfaz no ejecuta cálculos al abrirse. Selecciona **Personaliza el escenario**, acepta el borrador y pulsa **Ejecutar simulación**. Los escenarios base del editor son distintos de los botones que cargan parámetros de las tres estrategias comparadas; no reemplazan el archivo de ejemplo de la API.

### Vía Terminal / API (Auditoría Técnica sin navegador)
*(Ejecutar en una segunda ventana de terminal mientras el servidor del Paso 1 continúa corriendo)*

**En Linux / macOS (cURL):**
```bash
# 1. Comprobar que el servicio responde
curl -s http://localhost:8000/health

# 2. Obtener el resumen numérico exacto de la simulación oficial
curl -s -X POST http://localhost:8000/api/simulate \
  -H "Content-Type: application/json" \
  -d @configs/default_params.json | jq '{propuesta: .strategies.proposed.metrics, azar: .strategies.random.metrics, control: .strategies.none.metrics}'
```

**En Windows (PowerShell):**
```powershell
# 1. Comprobar que el servicio responde
Invoke-RestMethod http://localhost:8000/health

# 2. Obtener el resumen numérico exacto de la simulación oficial
$body = Get-Content configs/default_params.json -Raw
$res = Invoke-RestMethod http://localhost:8000/api/simulate -Method Post -ContentType application/json -Body $body
[PSCustomObject]@{
    Propuesta = $res.strategies.proposed.metrics
    Azar      = $res.strategies.random.metrics
    Control   = $res.strategies.none.metrics
} | ConvertTo-Json -Depth 3
```

### Resultados reproducibles

La respuesta de la API incluye métricas y curvas para las tres estrategias. Usa los resultados calculados para la configuración y semilla solicitadas; no se garantiza que una estrategia gane en cada corrida estocástica.

---

## 3. Prueba de Fuego y Brote Sorpresa (Defensa en Vivo)

Durante la evaluación en vivo (5 minutos de ajuste ante el Brote Sorpresa impuesto por el jurado), no es necesario reiniciar el servidor ni editar código:

- **Sliders interactivos en tiempo real:** Desde la interfaz web (`http://localhost:8000`), el jurado y el equipo pueden alterar de inmediato cualquier condición crítica:
  - *Probabilidad abstracta de transición:* modificar la probabilidad de contagio ($\beta$) o el grado de contacto.
  - *Restricción de insumos:* recortar el stock total de vacunas o variar la cuota de aplicación diaria.
  - *Foco territorial alternativo:* desplazar el brote inicial hacia cualquiera de los 7 sectores urbanos.
  - *Eficacia ilustrativa:* ajustar el parámetro de protección ($\eta$).
- **Botón Aleatorio («🎲»):** Carga un borrador con otra semilla y parámetros válidos; no lo acepta, guarda ni ejecuta automáticamente. Acepta el borrador y ejecuta para calcular las tres estrategias.

---

## 4. Requisitos Nivel Pro Cumplidos (Puntos Extra)

El proyecto implementa las capacidades avanzadas de la rúbrica oficial:

- [x] **Monte Carlo en paralelo (30 réplicas):** Endpoint `POST /api/batch` que computa agregaciones estocásticas reportando media, mínimo, máximo y rango empírico $p2.5 - p97.5$.
- [x] **Visualización territorial animada (SVG Nativo):** Mapa interactivo de Manta con actualizaciones diarias por diferencias, con soporte completo de Pan & Zoom y sin dependencias de frameworks pesados.
- [x] **Informe ejecutivo para tomadores de decisiones:** Resumen académico al completar la reproducción, con métricas de la corrida y, cuando se solicitan, agregados Monte Carlo claramente separados. No calcula saturación hospitalaria ni recomendaciones sanitarias.
- [x] **Intervención multidimensional:** Combinación sinérgica de vacunación *leaky* con brigadistas comunitarios y reasignación dinámica de cuotas sobrantes.
- [x] **Arquitectura desacoplada Cloud-Ready:** Preparado para orquestación masiva mediante AWS Step Functions Express y workers AWS Lambda.

---

## 5. Arquitectura del Sistema y Flujo de Datos

![Diagrama de Arquitectura del Sistema](docs/arquitectura.svg)

- **Diagrama en formato vectorial:** [docs/arquitectura.svg](docs/arquitectura.svg)
- **Archivo fuente editable en Draw.io:** [docs/arquitectura.drawio](docs/arquitectura.drawio)

### Componentes y Delimitación de Acceso

1. **Capa Pública:**
   - **ALB / Ingress Gateway (Puerto 8000):** Punto de entrada HTTPS con terminación TLS y enrutamiento hacia la aplicación FastAPI.
   - **Frontend Command Center:** HTML5/CSS3/Vanilla JS servido como estáticos optimizados (<50 KB comprimidos vía Gzip).
2. **Capa Privada / Núcleo de Cómputo:**
   - **FastAPI ASGI Server:** Endpoints `/health`, `/api/simulate` y `/api/batch`.
   - **Control de Sobrecarga:** Semáforo `asyncio.Semaphore(2)` que protege el servidor contra denegación de servicio (HTTP 429 con cabecera `Retry-After: 2`).
   - **Aislamiento de CPU:** `ProcessPoolExecutor(2)` dedicado para cálculos pesados de autómata celular, manteniendo el bucle asíncrono y los healthchecks libres de bloqueos.
   - **Motor SEIR & Topología O(1):** Grafos inmutables en Python con adyacencias en `frozenset` para consultas en tiempo constante.
   - **Infraestructura AWS:** Contenedor Docker en AWS ECS Fargate (0.25 vCPU, 512 MiB), logs centralizados en AWS CloudWatch y soporte para expansión Monte Carlo en Step Functions + Lambda.

---

## 6. Despliegue en AWS y URL Pública

### Estado del Despliegue y URL Pública

- **URL Pública del Servicio:** `https://<ALB-DNS-O-IP-PUBLICA>:8000` *(aprovisionada para la sesión de pitch y demo del jurado)*
- **Endpoint de verificación rápida:** `https://<ALB-DNS-O-IP-PUBLICA>:8000/health`
- **Región AWS:** `us-east-2` (Ohio)

### Comandos de Aprovisionamiento (AWS CLI)
> **Prerrequisito:** Requiere tener instalado el [AWS CLI](https://aws.amazon.com/cli/), credenciales activas con permisos de ECS (`aws configure`) y la imagen de Docker subida a Amazon ECR.

El despliegue se gestiona mediante la especificación declarativa en [`infra/ecs_service.json`](infra/ecs_service.json):

```bash
# 1. Crear el servicio Express Gateway en ECS Fargate
aws ecs create-express-gateway-service \
  --region us-east-2 \
  --cli-input-json file://infra/ecs_service.json

# 2. Verificar estado de salud remoto
curl -f https://<ALB-DNS-O-IP-PUBLICA>:8000/health

# 3. Desmantelar servicio tras evaluación (control estricto de gasto)
aws ecs delete-express-gateway-service \
  --region us-east-2 \
  --service-arn <ARN-DEL-SERVICIO>
```

---

## 7. Declaración de Costos y AWS Budget

### Presupuesto Configurado

![AWS Budget con Alertas](docs/budget.png)

Se configuró un **AWS Budget** de **USD 5.00** con notificaciones automáticas por correo electrónico al alcanzar el 50%, 80% y 100% del umbral previsto, garantizando control presupuestario estricto desde el inicio del proyecto.

### Desglose de Costos de Operación

| Concepto | Especificación | Costo Diario Estimado | Costo Mensual Estimado |
|---|---|---:|---:|
| **AWS ECS Fargate** | 1 tarea (0.25 vCPU, 512 MiB RAM) | USD 0.35 | USD 10.50 |
| **Application Load Balancer (ALB)** | 1 ALB en us-east-2 + 1 LCU base | USD 0.75 | USD 22.50 |
| **Tráfico y CloudWatch Logs** | Gzip <50KB por petición + retención 7 días | USD 0.10 | USD 3.39 |
| **Gasto Real Durante el Evento** | Consumo acumulado de pruebas | **USD 0.00** | *(Capa gratuita / Sandbox)* |
| **Total Operativo Proyectado** | **Operación continua 24/7** | **~USD 1.20 / día** | **~USD 36.39 / mes** |

*Cálculo detallado, supuestos de dimensionamiento y políticas de ahorro documentados en [docs/costos.md](docs/costos.md).*

---

## 8. Justificación de Supuestos y Decisiones de Diseño

En cumplimiento con el punto 8 de los requisitos del reto, se detalla el origen y justificación de cada parámetro del sistema:

1. **Estructura del Grafo Territorial:**
   - La población de Manta se agrupa en 7 sectores representativos. Los puentes intersectoriales representan las vías principales de conexión física (avenidas y accesos interparroquiales). Al blindar estos puentes, la propagación queda confinada a focos aislados.
2. **Parámetros abstractos:**
   - La media de pasos diarios en E se expresa como $1/\sigma$ para $\sigma>0$; $\sigma=0$ impide la progresión E → I y se presenta como «sin progresión», no como una incubación de cero días.
   - Los valores de recuperación y transición por contacto son controles ilustrativos del autómata, sin calibración clínica o urbana.
3. **Estrategia Territorial en Cascada (Qué compara):**
   - *Paso 1 (Cortafuegos):* Vacuna prioritariamente a los nodos que sirven de puente entre el sector activo y los sectores sanos.
   - *Paso 2 (Hubs internos):* Inmuniza los nodos con mayor grado de centralidad dentro del sector para evitar la dispersión exponencial interna.
   - *Paso 3 (Anillo perimetral):* Aplica dosis a los contactos directos de personas en periodo infeccioso.
   - *Reinversión de excedentes:* Si un sector se estabiliza, las dosis no utilizadas se transfieren a hubs de sectores colindantes en modo preventivo.
4. **Arquitectura Tecnológica:**
   - Se eligió FastAPI y Vanilla JavaScript para prescindir de pasos de construcción (`npm build`), garantizando que cualquier persona pueda clonar y ejecutar el repositorio sin discrepancias de entorno.

---

## 9. Pruebas Automatizadas y Limitaciones Conocidas

### Batería de Pruebas Automatizadas
> **Prerrequisito:** Requiere tener el entorno virtual de Python activado con las dependencias de prueba (`python -m pip install -e ".[test]"`) y [Node.js](https://nodejs.org/) v18+ instalado.

```bash
# 1. Pruebas unitarias y de integración de Python (suite de Python)
python -m pytest -q

# 2. Pruebas unitarias de interfaz y lógica frontend (suite de interfaz)
node --test tests/frontend.test.cjs tests/scenario.test.cjs
```

### Ejecución Local con Restricciones de Recursos
Para simular en local el comportamiento exacto de la instancia mínima de AWS ECS Fargate:

```bash
# Ejecutar contenedor con límite estricto de 0.25 vCPU y 512 MiB
docker run --rm --cpus=0.25 --memory=512m -p 8000:8000 manta-sim
```

### Limitaciones Conocidas

- **Restricción de CPU en ECS Fargate:** En una instancia mínima de 0.25 vCPU, la ejecución de una simulación individual tarda ~1.7 s. Un lote completo de 30 réplicas Monte Carlo en un solo hilo tarda ~38 s; para reducir este tiempo por debajo de 3 s en producción masiva, se debe escalar a workers distribuidos vía Step Functions Express.
- **Red Sintética:** Aunque la topología refleja la conectividad urbana de Manta, no incorpora censos nominales en tiempo real del INEC ni historiales clínicos individuales.


## Scenario editor and API initialization contract

The editor keeps a draft separate from the accepted configuration. **Aceptar** validates and accepts without running or saving a named preset. **Cancelar** and Escape discard the draft. **Limpiar** restores editor defaults without deleting saved presets. **Guardar escenario** saves the current valid draft under a unique name in this browser only (`weezing.scenarios.v1`, version 1); corrupt, unsupported or unavailable storage is reported without replacing existing data. Three immutable base presets remain available without storage.

The population is derived from integer S/E/I/R counts (7–2000 total). Sector foci reserve part of I; their sum cannot exceed I or each sector's population. The remaining I and all E/R are assigned to distinct nodes using the seed. Reducing N adapts graph/stock limits but never silently rewrites sector foci.

`POST /api/simulate` and `base` in `POST /api/batch` accept these optional additions:

```json
{
  "n": 70,
  "initial_state": {"s": 60, "e": 3, "i": 5, "r": 2},
  "initial": {"tarqui": 2},
  "all_s_import": true
}
```

- `initial_state` requires all four nonnegative integer counts, summing exactly to `n`. When it is supplied and `initial` is omitted, sector foci default to `{}`. `initial_ids`, when supplied, must contain exactly I unique valid IDs.
- `all_s_import` defaults to `false` for legacy requests. It only acts when an explicit initial state is entirely S. Day zero stays entirely S; one deterministic common node becomes I at the end of day one, with no same-day secondary transition. All three strategies share this event. No import occurs for an E-only initial state, mixed state, zero-day horizon or legacy zero-focus request.
- Each daily record includes `imported_cases` (0 or 1). `meta.external_import` is either `null` or `{day: 1, node: <id>, state: "I"}`. The event conserves N and counts once in cumulative infections, separately from `new_s_to_e`.
- Incubation days are a UI conversion to the existing `sigma` API parameter, not an additional backend rate. `sigma=0` means no E→I progression.

Run computes the accepted scenario; playback never recomputes it. Play/pause, stop-to-day-zero, restart-and-play, speed and seeking remain independent controls. S is blue, E yellow/orange, I red and R green on nodes and counters; recovered volunteer stars stay green. The final report appears only after playback completion and is hidden again by stop/restart/seek. Without map frames, the daily curve counts remain playable without fabricating node states. Single-seed metrics and Monte Carlo means/empirical ranges are labeled separately; this implementation adds no deployment or external-service requirement.
