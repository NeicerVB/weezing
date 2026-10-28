# Mejora visual y UX del simulador

Solicitud: corregir presentación, red que parece estática, ausencia de carga y
añadir un dado que cambie los parámetros. Se conserva Vanilla JS/SVG, el tema
oscuro de Spookython, la accesibilidad, el aviso académico y el motor/API actual.

Diseño adoptado dentro de ese alcance: controles compactos a la izquierda;
resultado de la propuesta arriba; red protagonista con nombres de sectores,
balance diario y timeline; comparativa y tabla debajo. Mayor contraste entre
superficies, tipografía legible, bordes sutiles y un acento naranja consistente.
En móvil se apilan controles y resultados sin desbordamientos.

Alternativas consideradas: solo añadir un spinner no corrige la jerarquía;
reescribir con un framework o mapa geográfico real contradice las restricciones.
Se mejora la interfaz existente, con ajustes visuales y de comportamiento.

Estados: inicio con generación automática; generando con aria-busy y feedback;
éxito con reproducción automática (salvo movimiento reducido), pausa, reinicio
y velocidad; error visible conservando el resultado anterior y permitiendo
reintento. Se identifica cuándo los resultados pertenecen al escenario anterior.
Las solicitudes intermedias se agrupan para evitar saturación al mover controles.

Dado: genera parámetros dentro de las restricciones actuales, semilla nueva,
stock <=0,40N y focos por sector válidos. Actualiza los controles y solicita
una simulación; nunca inventa resultados. Muestra un breve resumen del escenario.

La red y su balance siguen el día seleccionado; los KPI de impacto siguen
identificados como resultados finales. Las curvas muestran un cursor temporal.
Las vistas Monte Carlo conservan su identificación estadística.

Validación: pruebas de estado pendiente/éxito/error, autoplay/pausa/reinicio,
aleatorización válida, navegación temporal y controles existentes; navegador
real a tamaño escritorio y móvil; suite Python de regresión y bundle <80 KB.
