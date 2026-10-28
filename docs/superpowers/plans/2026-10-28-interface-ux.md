# Mejora visual y UX — plan de implementación

**Objetivo:** hacer legible el simulador, mostrar su actividad y convertir red,
timeline y dado en controles útiles para la demo. Diseño en
`../specs/2026-10-28-interface-ux-design.md`.

- [x] Escribir y observar fallos de carga, autoplay, dado y solicitudes agrupadas.
- [x] Reorganizar HTML/CSS: KPI arriba, controles compactos, estados vacíos,
  mapa por sectores, toolbar temporal, jerarquía tipográfica y móvil.
- [x] Implementar carga/error/éxito, generación inicial, reproducción, balance
  diario, cursor de gráfica, dado válido y agrupación de solicitudes.
- [x] Verificar Node/Python, navegador escritorio/móvil, bundle <80 KB y revisión.
- [x] Commit, push y dejar vista local lista para revisar.

Evidencia: 16 pruebas Node; 115 pruebas Python y 81 subpruebas. Contraste de
paleta y semántica verificados. Bundle 54.217 bytes. Navegador real: escritorio
1440 y móvil 390, sin desbordamiento horizontal; plegado móvil probado;
autoplay/pausa/reinicio y cambio de semilla con el dado verificados. Una respuesta
real retenida en el cliente durante la prueba confirmó carga, overlay y botón
deshabilitado; al liberarla se renderizaron los datos reales sin error.

Revisión independiente detectó una repetición de la última petición cuando una
respuesta de la cola era más rápida que el debounce pendiente. Reproducida RED,
corregida cancelando el debounce al iniciar la petición; suite Node GREEN.

La vista localhost usaba un contenedor antiguo. Se reconstruyó la misma etiqueta
local y se sustituyó el contenedor; la versión anterior quedó detenida como
`spookython-web-before-ux-20261028`. El contenedor nuevo está healthy y la vista
localhost sirve el diseño nuevo. No se modificaron recursos AWS.
