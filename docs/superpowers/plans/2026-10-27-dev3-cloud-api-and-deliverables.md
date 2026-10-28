# Plan de Implementación — Dev 3: Cloud, API, Infraestructura y Entregables
**Responsable:** Josué Palma  
**Área:** Servidor FastAPI, Despliegue en AWS (Amazon ECS Express Mode), Seguridad, Costos y Entregables Oficiales  

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el servidor web FastAPI con el contrato de API REST congelado (Anexo A) y guardas de seguridad/concurrencia, empaquetar el contenedor Docker multi-stage optimizado en Python 3.12 (puerto 8000), configurar el despliegue en Amazon ECS Express Mode en `us-east-2`, gestionar la alerta del AWS Budget (\$5 USD), y redactar los entregables oficiales de la Spookython (`README.md`, `docs/costos.md`, `docs/budget.png`, y checklist de aceptación).

**Architecture:** Servidor ASGI FastAPI con Uvicorn ejecutándose como un monolito modular dentro de una sola tarea Fargate. Rutas `/health`, `/api/simulate` y `/api/batch` (con `ProcessPoolExecutor` para paralelismo local). Balanceador ALB y certificado SSL/HTTPS gestionados automáticamente por Amazon ECS Express Mode en `us-east-2`.

**Tech Stack:** Python 3.12, FastAPI, Uvicorn, Pydantic, Docker multi-stage, AWS CLI / Amazon ECS Express Mode (`us-east-2`), AWS Budgets, CloudWatch.

**Spec:** [docs/superpowers/specs/2026-10-27-manta-containment-simulator-design.md](file:///home/neicervb/.gemini/antigravity/worktrees/Spookython/spookython_mentor_simulator_architecture/docs/superpowers/specs/2026-10-27-manta-containment-simulator-design.md) (Especialmente §5.4, §6 y Anexo A).

## Global Constraints

- **Región AWS:** `us-east-2` (Ohio).
- **Puerto y Health Check:** Escucha en `0.0.0.0:8000`, ruta de comprobación de salud `/health`.
- **Límite de Presupuesto:** Alerta de AWS Budget fijada en \$5.00 USD. Mantener Fargate en tamaño mínimo (256 CPU / 512 MiB, 1 tarea).
- **Comando de Borrado Obligatorio:** Proveer y documentar el comando de teardown exacto en el `README.md` para evitar costos residuales tras la evaluación.
- **Cero Servicios Obsoletos:** Vetados formalmente App Runner, CodeCommit, Cloud9 y OpsWorks.

## Review Focus

1. **Desajuste de Puerto entre ECS y Uvicorn:** Verificar que `containerPort: 8000` y `healthCheckPath: /health` estén explícitamente fijados en la definición de Express Mode para evitar que el balanceador marque la tarea como *Unhealthy*.
2. **Payload Oversize en Simulaciones Masivas:** `/api/batch` debe retornar únicamente resúmenes agregados (media, p2.5, p97.5, min, max) sin trazas por nodo para no superar los 30 KB.
3. **Manejo de Sobrecarga Concurrente (HTTP 429):** El semáforo de FastAPI debe interceptar peticiones simultáneas que superen la capacidad del contenedor y responder de inmediato con `HTTP 429 Too Many Requests` y cabecera `Retry-After: 2`.
4. **Verificación de la URL Pública Externa:** Antes de dar la tarea por concluida, comprobar que la URL HTTPS de AWS responda y sea accesible desde un dispositivo ajeno a la red de desarrollo.
5. **Completitud del README según la Rúbrica:** El README debe contener la semilla de reproducción (semilla 42), la captura de AWS Budget con la alerta, el cálculo de costos y las instrucciones paso a paso.

---

## Tareas

### Tarea 1: Aplicación FastAPI, Schemas Pydantic y Seguridad (`src/seir/app.py`, `src/seir/config.py`)

**Files:**
- Create: `src/seir/app.py`
- Modify: `src/seir/config.py`
- Create: `tests/test_api_smoke.py`

**Interfaces:**
- Consumes: `run_paired_simulation` de `src.seir.strategies` (Dev 1), `TerritorialGraph` de `src.seir.topology` (Dev 1), y carpeta estática `src/seir/static/` (Dev 2).
- Produces:
  - `GET /health` $\to$ `200 {"status": "healthy"}`
  - `POST /api/simulate` $\to$ `200` JSON (Contrato Anexo A)
  - `POST /api/batch` $\to$ `200` JSON (Contrato Anexo A con estadísticas agregadas)
  - Respuestas controladas de error: `HTTP 400` para entradas inválidas, `HTTP 429` en sobrecarga.

- [ ] **Paso 1: Escribir pruebas de integración en `tests/test_api_smoke.py`**
  Probar `GET /health` (retorna 200), `POST /api/simulate` con payload estándar del Anexo A, validación de límites ($N > 2000$ retorna 400), y semáforo de concurrencia (exceso retorna 429 con `Retry-After`).

- [ ] **Paso 2: Ejecutar pruebas para verificar que fallen**
  Ejecutar: `pytest tests/test_api_smoke.py -v`  
  Salida esperada: FAIL.

- [ ] **Paso 3: Implementar schemas en `src/seir/config.py` y servidor en `src/seir/app.py`**
  - Definir modelos Pydantic (`SimulateRequest`, `BatchRequest`, `InterventionConfig`, `VolunteersConfig`).
  - Implementar endpoints `/health`, `/api/simulate` y `/api/batch`.
  - Configurar `asyncio.Semaphore(2)` como middleware/dependencia para limitar a un máximo de 2 simulaciones pesadas concurrentes.
  - Montar `src/seir/static/` para servir el frontend de Dev 2.

- [ ] **Paso 4: Ejecutar pruebas para verificar que pasen**
  Ejecutar: `pytest tests/test_api_smoke.py -v`  
  Salida esperada: PASS.

- [ ] **Paso 5: Commit**
  ```bash
  git add src/seir/app.py src/seir/config.py tests/test_api_smoke.py
  git commit -m "feat(dev3): implement FastAPI server matching frozen contract with Pydantic and rate limiting"
  ```

---

### Tarea 2: Dockerfile Multi-Stage y Despliegue en Amazon ECS Express Mode (`infra/`)

**Files:**
- Create: `infra/Dockerfile`
- Create: `infra/ecs_service.json`
- Create: `infra/lambda_worker.py`
- Create: `infra/step_function_def.json`

**Interfaces:**
- Consumes: Código fuente en `src/seir/` y `requirements.txt`.
- Produces: Contenedor listo para producción, receta de despliegue en `us-east-2` y artefactos cloud para Nivel Pro.

- [ ] **Paso 1: Crear `infra/Dockerfile` multi-stage optimizado**
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

- [ ] **Paso 2: Probar la compilación y ejecución local del contenedor**
  Construir la imagen y probar el endpoint de salud:
  ```bash
  docker build -f infra/Dockerfile -t manta-sim:test .
  # Arrancar contenedor y comprobar con curl http://localhost:8000/health
  ```
  Salida esperada: HTTP 200 `{"status": "healthy"}`.

- [ ] **Paso 3: Definir configuración de despliegue en ECS Express Mode (`infra/ecs_service.json`)**
  Configurar el comando de despliegue para `us-east-2`:
  ```bash
  aws ecs create-express-gateway-service \
      --region us-east-2 \
      --service-name manta-containment-simulator \
      --container-port 8000 \
      --health-check-path /health
  ```
  y el comando de teardown para no gastar presupuesto:
  ```bash
  aws ecs delete-express-gateway-service --region us-east-2 --service-name manta-containment-simulator
  ```

- [ ] **Paso 4: Crear archivos de Step Functions / Lambda para Nivel Pro**
  Escribir `infra/lambda_worker.py` (que invoca a `run_paired_simulation`) y `infra/step_function_def.json` (flujo Express con `Inline Map` sincrónico) listos para desplegar como complemento de puntos extra.

- [ ] **Paso 5: Commit**
  ```bash
  git add infra/
  git commit -m "feat(dev3): create multi-stage Dockerfile, ECS Express config in us-east-2, and Step Functions spec"
  ```

---

### Tarea 3: Documentación Oficial, Control de Costos y Entrega (`README.md`, `docs/`)

**Files:**
- Create: `configs/default_params.json`
- Create: `docs/costos.md`
- Create: `docs/budget.png` (captura del AWS Budget con alerta de \$5 USD)
- Create: `README.md`

**Interfaces:**
- Consumes: URL desplegada en AWS, mediciones de latencia, captura de consola de AWS y resultados del simulador.
- Produces: Repositorio completamente documentado listo para entregar en la plataforma de la Spookython.

- [ ] **Paso 1: Generar `configs/default_params.json`**
  Fijar la semilla oficial de evaluación (semilla 42) y los parámetros calibrados por defecto ($N=1000, T=60, \beta=0.03, \sigma=0.2, \gamma=0.1, K=30, K_{\max}=400, \text{initial}: \{\text{"tarqui"}: 10\}$).

- [ ] **Paso 2: Redactar `docs/costos.md`**
  Detallar el costo mensual continuo (~25–30 USD/mes) versus el costo real del evento (~1 USD/día para 1 tarea de 256 CPU / 512 MiB Fargate), justificando matemáticamente que el evento se mantiene estrictamente por debajo del umbral de \$5.00 USD fijado en la alerta.

- [ ] **Paso 3: Colocar la captura de AWS Budget en `docs/budget.png`**
  Asegurar que la imagen muestre la alerta activa de \$5.00 USD en la región `us-east-2`.

- [ ] **Paso 4: Redactar el `README.md` integral exigido por la rúbrica**
  Estructurar el documento con:
  - Resumen del proyecto y problema de salud pública de Manta (Track B).
  - Enlace a la URL pública funcional desplegada en AWS.
  - Diagrama de arquitectura y justificación de decisiones (ECS Express Mode, Step Functions, cero servicios obsoletos).
  - Protocolo Dinámico de 3 Pasos y demostración cuantitativa de contagios evitados frente a las dos líneas base.
  - Semilla oficial (semilla 42) y receta exacta de reproducción para el jurado.
  - Guía de ejecución local (Conda, Docker) y comandos de prueba (`pytest`).
  - Alerta de AWS Budget y comando de borrado del servicio cloud.
  - Aviso ético y limitaciones del modelo.

- [ ] **Paso 5: Commit**
  ```bash
  git add configs/default_params.json docs/costos.md docs/budget.png README.md
  git commit -m "docs(dev3): finalize official competition README, cost breakdown, and default configuration"
  ```
