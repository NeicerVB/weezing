# Verificación de la integración Dev 3 + Manta UX/UI — 28 de octubre de 2026

## Base y estructura

Integración de `dev_3-cloud-api-deliverables` sobre `feat/manta-ux-ui`,
partiendo de Dev 1 (4610972) y Dev 2 (5851c98). El prototipo anterior de
Vite/Three.js y sus datasets fueron retirados; el repositorio conserva el
simulador FastAPI + SVG y los artefactos de despliegue AWS.

Están presentes los archivos de la estructura solicitada: README, pyproject,
lock de producción, configuración por defecto, cinco documentos del reto,
paquete `src/seir/` con API y `static/`, Dockerfile, ECS JSON, políticas IAM,
worker Lambda, definición Step Functions y pruebas API. Se conservan pruebas
adicionales y CLI del motor como utilidades del equipo. Los planes internos y
las evidencias JSON redundantes se retiraron para alinear la entrega con el reto.

## Evidencia local

- `python -m pytest -q`: **119 passed, 100 subtests passed**. Una advertencia de
  dependencia: Starlette anuncia la futura retirada de su adaptador httpx;
  no hay pruebas fallidas.
- `node --test tests/frontend.test.cjs`: **23/23**, incluyendo carga/error,
  dado, autoplay, controles temporales y agrupación de solicitudes.
- Las pruebas API se escribieron antes de `app.py` y fallaron por ausencia del
  módulo; después pasaron. Regresiones posteriores se observaron en RED antes
  de corregir animación de vacunados, paridad de dosis y semillas batch.
- Docker multi-stage Python 3.12 construido con dependencias fijadas. Imagen
  ejecutada con usuario sin privilegios, 0,25 CPU y 512 MiB.
- `GET /health`: HTTP 200 `{"status":"healthy"}`; healthcheck Docker `healthy`.
- Contrato, conservación poblacional, cuotas, reproducibilidad, entradas
  inválidas 400 y saturación 429 con `Retry-After: 2` cubiertos por pruebas.
- Inline Map validado mediante `ValidateStateMachineDefinition`, tipo EXPRESS:
  **OK, cero diagnósticos**. Esa llamada valida sintaxis sin crear recursos.

## Rendimiento y tamaño

Configuración oficial semilla 42, N=1000 y T=60. Veinte solicitudes secuenciales
calientes por perfil, p95 por rango más próximo. No es una prueba de carga ni
una medición de AWS.

| Perfil | Arranque frío | p95 caliente |
|---|---:|---:|
| ASGI local, CPU del equipo sin limitar | 1,4240 s | 0,7264 s |
| Docker local, 0,25 CPU / 512 MiB | 2,0518 s | 1,7058 s |

La meta local de 800 ms se cumple en la muestra caliente sin limitar CPU; no
se cumple con CPU limitado. La meta cloud ≤3 s aún requiere medida en AWS.

Con `Accept-Encoding: gzip`, en el contenedor se midieron 2.736 bytes para la
respuesta normal y **28.692 bytes** con animación. El JSON de animación sin
comprimir supera 50 KB: la garantía corresponde a transferencia comprimida de
la configuración oficial, no a cualquier entrada máxima ni a clientes sin gzip.
Un lote de prueba reducido de tres réplicas ocupó 755 bytes comprimidos;
las pruebas también verifican que el JSON agregado descomprimido quede <30 KB.
Un lote completo de 30 réplicas con series diarias ocupó 4.256 bytes JSON y
tardó 37,9644 s con CPU limitado; no se afirma que Monte Carlo cumpla 3 s.
Véase el [dictamen final](dictamen-aws.md) para correcciones, navegador real y
condiciones de entrada a AWS.

Semilla oficial: propuesta 33 contagios acumulados, azar 146, sin intervención
307; dosis 400/400/0. Son resultados sintéticos del modelo, no pronósticos reales.

## AWS y entrega: pendientes explícitos

- [x] Región configurada us-east-2 y estado del plan consultados: FREE ACTIVE.
- [x] Budget USD 5 existente y notificaciones consultadas; captura real incluida.
- [ ] El destinatario debe **verificar su correo** en AWS Budgets; consola 0/1.
- [x] Imagen ECR y roles reales registrados en `infra/ecs_service.json`; ECS desplegado.
- [x] URL HTTPS guardada y salud/simulación comprobadas desde el endpoint público:
  https://sp-5fba9b85d454464f8e6c6409e5df280d.ecs.us-east-2.on.aws
- [ ] Medir p95 cloud y registrar gasto final del evento.
- [x] Lambda/Step Functions desplegados y comparados con los artefactos locales.
- [ ] Incorporar presentación del pitch antes de entregar al hackathon.

La implementación local y los artefactos están preparados. La entrega cloud
completa **no se declara terminada** mientras falten las evidencias anteriores.
