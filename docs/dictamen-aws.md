# Dictamen final — preparación para AWS

**Resultado: APTO para iniciar el despliegue del núcleo en us-east-2.**
Esto acredita el software y su contenedor local. No acredita todavía una
URL HTTPS pública, latencia real de AWS ni una entrega cloud terminada.

Auditoría del 28 de octubre de 2026 sobre la integración Dev 1 + Dev 2 + Dev 3.
Se usaron depuración sistemática, TDD, pruebas del Anexo B y revisión de código
independiente. Los fallos nuevos se reprodujeron antes de corregirse.

## Resultado por etapa

| Etapa | Evidencia | Estado |
|---|---|---|
| 1. Python y organización | Python 3.12, rango >=3.12,<3.13, src/seir y lock generado | Verificado |
| 2. Topología | Siete sectores, coordenadas, hubs ~4× grado en escenario oficial, adyacencias incluso con grafos densos | Verificado |
| 3. Vacuna y brigadistas | Leaky 0,8, retraso/pérdida, cero riesgo en sector limpio, máximo dos alistamientos | Verificado |
| 4. Estrategias | Cascada, sobrantes en hubs, stock y paridad por día, R0 y determinismo | Verificado |
| 5. API | Contrato por defecto, 400/429, límite 2, lotes agregados, mensajes sin rutas internas | Verificado |
| 6. Frontend | Navegador real: 1000 nodos, tres curvas, animación, KPI, informe y Monte Carlo | Verificado |
| 7. Docker/infra | Imagen construida, usuario simulator, 0,25 CPU/512 MiB, puerto 8000, /health | Docker verificado; cloud pendiente |
| 8. Aceptación | 115 pruebas Python, 81 subpruebas; 16 pruebas Node tras mejora UX; documentos e imágenes oficiales | Núcleo local verificado |

Las estrategias están implementadas como funciones con interfaz explícita,
en lugar de las clases Protocol sugeridas por el plan. La API y el worker
consumen esa interfaz y las pruebas verifican el comportamiento común.

## Correcciones de esta auditoría

1. Grafos densos ya no introducen enlaces entre sectores no adyacentes. El
   grado solicitado se satura si la estructura territorial no permite alcanzarlo.
2. `initial_ids: []` significa brote vacío y prevalece sobre `initial`;
   `null` usa el mapa sectorial. Entradas imposibles por sector se rechazan
   antes de generar el grafo.
3. No se administran dosis sin E ni I. Tras la cascada solo se reinvierte
   en hubs externos; el resto del stock queda disponible.
4. Contagios evitados conserva la resta firmada. Regresión reproducible:
   N=70, T=60, semilla 121, beta=0,03, Tarqui=1, cuota estática=1, stock=28:
   el azar puede producir **-5**, no se oculta como cero.
5. Una reinfección R->E incrementa el acumulado y reinfecciones ocupacionales,
   pero no el contador `new_s_to_e`.
6. `/api/batch` admite `include_series: true` como extensión opcional. Devuelve
   medias y percentiles diarios de I agregados, sin trazas por nodo. La respuesta
   del Anexo A por defecto se conserva. La interfaz solicita 30 réplicas solo
   al pulsar el botón; no ejecuta Monte Carlo con cada movimiento de slider.
7. La UI distingue medias Monte Carlo de tarjetas/informe de la semilla
   individual; ignora lotes obsoletos y conserva el estado ocupado correctamente.
8. Los controles ajustan stock, grado y capacidades sectoriales al cambiar N.
9. Las respuestas 400 no exponen rutas del servidor. Si una animación excede
   50 KB comprimidos, se conservan curvas/métricas y se avisa explícitamente
   que no se envía esa animación, sin truncar resultados.

## Aceptación y casos límite

Pruebas identificables por nombre:

- `tests/test_strategies.py::test_zero_infection_edge_case`.
- `tests/test_strategies.py::test_susceptible_depletion_cascades_to_hubs`.
- `tests/test_engine.py::test_delayed_vaccine_lost_upon_infection`.
- `tests/test_volunteers.py::test_volunteer_zero_reinfection_in_inactive_sector`.
- `tests/test_api_smoke.py::test_input_guards_and_rate_limiting`.
- `tests/test_acceptance.py`: matriz de semillas/modos, N conservada, cuota
  global, paridad diaria, tasas nulas y stock cero incluso con brigadistas.

Se comprobaron dos lotes concurrentes de 30 réplicas con la API real de ASGI:
la tercera simulación recibió 429 y Retry-After: 2; salud siguió respondiendo.
La exploración de claves privadas y patrones de credenciales AWS no encontró
coincidencias en los archivos versionados. No sustituye una auditoría de secretos
completa del historial, pero cubre los archivos entregados en esta rama.

## Rendimiento medido y límites

Configuración N=1000, T=60, semilla 42, tres estrategias; 20 solicitudes calientes
por perfil. El arranque frío se registra aparte.

| Perfil | p95 caliente | Arranque frío |
|---|---:|---:|
| ASGI local sin limitar CPU del equipo | **0,7264 s** | 1,4240 s |
| Docker con 0,25 CPU / 512 MiB | **1,7058 s** | 2,0518 s |

La meta local ≤800 ms se cumple en la muestra caliente sin limitar CPU. La
configuración mínima de contenedor no cumple esa meta local, pero queda por
debajo de 3 s en esta muestra local; eso **no demuestra** el p95 de AWS.

- Frontend tras mejora visual/UX: aproximadamente 54 KB, menor a 80 KB.
- Animación oficial: **28.692 bytes transferidos con gzip**. El JSON sin
  comprimir es mayor a 50 KB. La interpretación aquí es tamaño de transferencia
  negociada; no se afirma un límite de 50 KB descomprimidos.
- Lote completo de 30 réplicas con series: **4.256 bytes JSON**, 1.379 bytes
  comprimidos; menor a 30 KB sin comprimir.
- Ese lote tardó **37,9644 s con 0,25 CPU**. No cumple una meta de 3 s para
  Monte Carlo. El despliegue Pro Step Functions/Lambda y su latencia siguen
  pendientes; no se confunde el rendimiento individual con el de 30 réplicas.

Resultados registrados: [local](local-verification.json),
[Docker](runtime-verification.json), [Monte Carlo](batch-verification.json).

## Comprobaciones en navegador

Chrome contra el contenedor local:

- Red oficial: 1000 nodos SVG, tres curvas, R0=2,40, timeline hasta día 60.
- Avance al día 30 y aviso académico visible en interfaz/informe.
- Cambio a N=140: stock se ajusta a 56; simulación responde sin error.
- Botón Monte Carlo: tres medias y una banda empírica real; etiqueta distingue
  tarjetas de la simulación individual. Sin errores de consola.

## Puerta de entrada a AWS

Consulta de solo lectura confirmada: proyecto FREE ACTIVE, Región configurada
us-east-2, repositorio ECR **spookython-simulador** existente pero sin imágenes,
sin clúster ECS y sin roles de servicio ECS identificados.

Antes de dejar una aplicación pública operativa:

1. Verificar el correo del **Spookython-Budget**: existe el presupuesto USD 5,
   pero la consola sigue indicando **0/1 email verified / Inactive**.
2. Publicar la imagen validada con etiqueta de commit en el ECR existente.
3. Crear execution role e infrastructure role para servicios, sin asignarlos
   a personas. Completar sus ARN y la imagen en `infra/ecs_service.json`.
4. Crear ECS Express en us-east-2 con 256 CPU, 512 MiB, una tarea, puerto 8000,
   `/health`. Seguir [infra/README.md](../infra/README.md), que incluye Plan B
   tradicional, comandos corregidos y eliminación por ARN.
5. Probar HTTPS desde otra red, medir p95 cloud y actualizar URL/costos reales.
6. Mantener Pro pospuesto hasta validar la aplicación principal. Presupuesto
   USD 5 es una alerta, no un tope automático: revisar AWS Settings > Billing.

La auditoría no creó recursos facturables, no publicó contenedores y no envió
correos. No queda un fallo local bloqueante identificado; la entrega completa
sigue condicionada a las verificaciones cloud y al Budget operativo.

Observación menor de revisión: el rastreo ampliado de brigadistas parte de
contactos directos susceptibles elegibles; no atraviesa un contacto ya vacunado
o en E/I para buscar otro susceptible a dos saltos. La especificación no define
ese intermediario; queda como decisión de modelado por precisar, sin atribuirle
una capacidad de rastreo más amplia que la implementada.
