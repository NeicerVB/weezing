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
