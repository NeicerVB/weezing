# Interfaz del simulador académico de Manta

Este repositorio contiene **solo el frontend** del plan Dev 2: HTML, CSS y JavaScript sin framework ni compilación. La interfaz representa resultados de simulación ficticia; no ofrece predicciones ni recomendaciones sanitarias.

## Contenido

- `src/seir/static/index.html`: controles, visualizaciones, indicadores e informe COE.
- `src/seir/static/style.css`: tema responsivo con contraste y símbolos diferenciados.
- `src/seir/static/app.js`: petición a la API, curvas, animación por diffs e informe.
- `tests/test_frontend_layout.py`, `tests/test_frontend_style.py` y `tests/frontend.test.cjs`: pruebas del frontend.

## Integración pendiente

Esta rama **no contiene motor ni servidor**. El backend territorial deberá servir `src/seir/static/` y proporcionar `POST /api/simulate` con el contrato del Anexo A de la especificación. El frontend muestra curvas y métricas aunque `frames` sea `null`. Para dibujar la red y su animación necesita además una topología inicial (`graph` con `nodes` y `edges`); para sombrear el rango empírico necesita series diarias `range.p2_5` y `range.p97_5`. Estos dos campos no están definidos en el Anexo A y deberán acordarse con el backend antes de integrar.

## Pruebas

- `python -m unittest discover -s tests -q`: ejecuta las pruebas de estructura y contraste con la biblioteca estándar de Python.
- `node --test tests/frontend.test.cjs`: ejecuta las pruebas de interacción y renderizado con el runner incluido en Node.js.

Los comandos no requieren parámetros de ejemplo ni dependencias de frontend. No sustituyen una prueba en navegador real cuando exista el servidor territorial.
