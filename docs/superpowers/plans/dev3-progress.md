# Ejecución Dev 3 — 2026-10-28

Plan: `2026-10-27-dev3-cloud-api-and-deliverables.md`.
Especificación: `../specs/2026-10-27-manta-containment-simulator-design.md`.

- Base: merge real de `origin/dev1-manta-seir-engine` (4610972) y
  `origin/dev2-frontend-visualization` (5851c98), commit dee08e2.
- El trabajo local anterior se retiró del árbol; respaldo externo en
  `C:\weezing-respaldo-20261028` y rama `backup/antes-integracion-dev1-dev2`.
- Preflight: Dev 1 produce estados de animación distintos del contrato de Dev 2;
  se normaliza brigadista a V y se conserva SEIR en vacunados.
- Decisión: prevalece el límite T <= 90 de la especificación frente a los
  365 días del prototipo retirado. N mínimo 7 para representar los siete sectores;
  grado máximo 50 para acotar CPU y tamaño de la topología.
- Tarea 1: pruebas RED por ausencia de `seir.app`; 19 pruebas iniciales GREEN.
  Prueba adicional RED detectó vacunados ocultando transiciones epidemiológicas;
  corregida en strategies.py. Suite: 77 pruebas y 81 subpruebas Python;
  8 pruebas frontend Node. Servidor y frontend antiguos retirados.
- AWS: configuración local us-east-2; plan FREE ACTIVE. No se ha desplegado
  infraestructura ni creado una alerta; faltan evidencias reales de nube.
- Tarea 2: worker RED por archivo ausente; GREEN 2/2. Docker construido y
  probado con 0,25 CPU/512 MiB y salud HTTP 200. Definición EXPRESS validada
  por AWS sin diagnósticos. Configuración ECS preparada, sin recursos nuevos.
- Decisión: corregir los comandos abreviados del plan usando containerPort
  dentro de primaryContainer y delete por service-arn; conservar placeholders
  explícitos hasta tener imagen y roles reales. Usar plantilla sin completar
  falla de forma visible, no crea un servicio distinto por accidente.
- Revisión independiente: detectó paridad rota al agotar susceptibles del azar,
  semillas batch fuera de rango derivado y exceso de bytes en animación.
  Los tres se reprodujeron RED y se corrigieron GREEN. Suite final 82 pruebas
  y 81 subpruebas Python; 8 pruebas Node.
- Decisión: limitar cuota compartida por susceptibles disponibles del azar
  antes de vacunar propuesta; resta dosis posibles pero preserva paridad.
- Decisión: meta de 50 KB de animación interpretada como transferencia gzip
  para configuración oficial; sin compresión el payload excede la meta.
- Tarea 3: configuración semilla 42, README, costos, diagrama PNG/drawio y
  captura auténtica de Budget añadidos. Budget existente USD 5, tres alertas,
  correo sin verificar. La tarea permanece parcialmente pendiente por URL cloud
  y verificación del correo. No se fabrican capturas ni URL de otra versión.
- Costos: tarifas consultadas en AWS Price List para Ohio; se incluyen IPv4 y
  ALB. Subtotal estimado USD 1,19622/día y USD 36,385025/730 h más variables.
- Revisión documental independiente: sin problemas importantes. Menores
  diferidos: verificacion.md llama «resultados brutos» a resúmenes estadísticos;
  la tarjeta Budget del diagrama tiene un pequeño desbordamiento de texto.
  No afectan ejecución ni interpretación de los pendientes de despliegue.
- El warning de Starlette sobre httpx está registrado como limitación de
  dependencias de prueba.
