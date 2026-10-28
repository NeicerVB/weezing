# Validación final antes de AWS

Base: 78a8850. Especificación: `../specs/2026-10-27-manta-containment-simulator-design.md`.
Alcance: analizar, validar y corregir para pasar a la etapa de despliegue;
no crear recursos facturables durante esta verificación.

- [x] Reproducir y corregir adyacencia en grafos densos e IDs vacíos.
- [x] Verificar cascada, extinción y diferencia firmada de contagios evitados.
- [x] Verificar vacuna con retraso y ciclo completo de brigadistas.
- [x] Verificar guardas API, lote Monte Carlo y frontend en navegador real.
- [x] Reconstruir contenedor y medir latencia/tamaño con configuración oficial.
- [x] Validar configuración AWS, riesgos pendientes y revisión independiente.
- [x] Registrar evidencia actualizada y commits; publicación en la rama Dev 3.

Decisiones de interpretación:

- El generador debe respetar adyacencia incluso si no puede alcanzar el grado
  solicitado. Se informa el grado real en meta; conectividad mínima también
  puede imponer un grado mayor que un objetivo demasiado pequeño.
- Con IDs explícitos vacíos no hay infecciones iniciales; `null` usa el mapa
  de sectores. Sin E ni I no se gasta stock para un brote inexistente.
- El protocolo termina en hubs externos: no debe gastar sobrantes en otros
  nodos arbitrarios. El stock sin administrar queda disponible para días siguientes.
- Contagios evitados conserva signo; una réplica desfavorable puede ser negativa.
- R0 depende de parámetros y topología, no debe forzarse a cero por I0=0.
- `new_s_to_e` cuenta solo S->E; reinfecciones R->E se contabilizan en
  `volunteer_reinfections` y en el acumulado total.
- Las clases de estrategias del plan son una propuesta de organización: la
  implementación funcional integrada conserva su interfaz explícita ya usada
  por Dev 1 y la API; su comportamiento se verifica directamente.
- La banda diaria de Monte Carlo se habilitó con `include_series: true`, una
  extensión optativa compatible. Las tarjetas siguen correspondiendo a la
  semilla individual y se indica en pantalla. No se ejecutan 30 réplicas al
  mover controles.
- El límite de 50 KB se verifica en transferencia gzip. Si una animación supera
  ese límite se devuelven curvas completas y aviso, con frames/graph nulos.
  No se afirma límite de 50 KB para el JSON descomprimido.
- Matriz nueva: adyacencia densa, IDs explícitos vacíos, extinción, prioridades,
  diferencia firmada, tasa leaky, exposición no transmisora, dosis con retraso,
  brigadista sin riesgo y máximo dos alistamientos. Fallos corregidos RED->GREEN.
- Revisión independiente: sin bloqueos locales; hallazgo de botón Monte Carlo
  ocupado tras cambiar parámetros reproducido con promesas diferidas y corregido.
- Observación menor diferida: precisar si el rastreo de distancia 2 debe
  atravesar también contactos no elegibles; actualmente parte de susceptibles
  elegibles. No se cambió esa decisión de modelado sin una regla explícita.
- Validación real: red 1000 nodos, tres curvas, R0=2,40, timeline día 30,
  simulación N=140 con stock ajustado a 56 y Monte Carlo con banda real.
- Rendimiento: local caliente p95=0,7264 s; Docker mínimo p95=1,7058 s.
  Lote 30 réplicas completo=37,9644 s, JSON 4.256 bytes. Nivel Pro <3 s no
  verificado ni satisfecho por este fallback local de CPU mínimo.
- AWS solo lectura: FREE ACTIVE, us-east-2, ECR spookython-simulador sin imágenes,
  sin clúster ECS ni roles ECS. Budget USD 5, correo todavía no verificado.
- Dictamen y próximos pasos en `../../dictamen-aws.md`. No se crearon recursos
  cloud ni se enviaron correos durante esta auditoría.
