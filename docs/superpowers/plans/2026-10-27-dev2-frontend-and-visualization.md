# Plan de Implementación — Dev 2: Frontend, Visualización y Experiencia de Usuario
**Responsable:** Alex Triviño  
**Área:** Interfaz Web Accesible, Visualizador Espacial SVG 2D, Curvas Comparativas e Informe COE  

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una interfaz web ultraligera (< 80 KB) y reactiva en Vanilla JS y SVG nativo que renderice la red territorial de Manta con animación por diferencias (diffs diarios), controles interactivos directos para responder en vivo al "Brote Sorpresa", gráfica comparativa multicurva con rango empírico (p2.5–p97.5), tarjeta destacada de $R_0$, tabla de métricas y el generador del informe ejecutivo del COE Cantonal con advertencia académica.

**Architecture:** Frontend estático servido directamente por FastAPI desde `src/seir/static/` (`index.html`, `app.js`, `style.css`). Cero dependencias pesadas ni frameworks de terceros (sin React, sin npm build step). Renderizado vectorial SVG 2D con símbolos geométricos accesibles y actualización reactiva mediante la API Fetch consumiendo `POST /api/simulate`.

**Tech Stack:** HTML5 semántico accesible, CSS3 (Variables, Grid, Flexbox, WCAG AA), Vanilla JavaScript ES6, SVG nativo interactivo.

**Spec:** [docs/superpowers/specs/2026-10-27-manta-containment-simulator-design.md](file:///home/neicervb/.gemini/antigravity/worktrees/Spookython/spookython_mentor_simulator_architecture/docs/superpowers/specs/2026-10-27-manta-containment-simulator-design.md) (Especialmente §5.5 y Contrato Anexo A).

## Global Constraints

- **Sin frameworks externos de frontend:** Todo en HTML, CSS y JS puro. Cero pasos de compilación (sin webpack, vite ni node_modules para el frontend).
- **Peso Máximo:** Bundle total del frontend < 80 KB. Carga inicial < 100 ms.
- **Accesibilidad Visual:** Diferenciación obligatoria de estados por **Color + Forma Geométrica** (apto para daltonismo y proyectores de baja calidad).
- **Aviso Ético Obligatorio:** Disclaimer visible en la cabecera: *«Simulación computacional ficticia con fines académicos para el Spookython Hackathon. No constituye una predicción epidemiológica ni una recomendación sanitaria real.»*
- **Terminología Oficial:** "Contagios evitados", nunca "vidas salvadas". "Rango empírico de simulación (p2.5 - p97.5)", nunca "intervalo de confianza del 95%".

## Review Focus

1. **Recepción de Diff Frames Vacíos o Nulos:** Si el usuario no activa la animación espacial (`include_frames: false`), el frontend no debe fallar al recibir `frames: null` y debe mostrar las curvas y métricas normalmente.
2. **Respuesta Rápida a Sliders (Debounce):** Si el jurado mueve rápidamente los sliders durante el Brote Sorpresa, la interfaz debe aplicar un *debounce* de ~150 ms para no saturar al backend con peticiones concurrentes innecesarias.
3. **Manejo de Errores HTTP 400 y 429:** Mostrar alertas accesibles y amigables en caso de que el backend responda con validación fallida (400) o servidor ocupado (429 con `Retry-After`).
4. **Contraste de Texto y Gráficos en Proyector:** La paleta oscura de Spookython debe cumplir con ratio de contraste WCAG AA (mínimo 4.5:1) para legibilidad en el auditorio de la ULEAM.
5. **Renderizado de $R_0$:** Mostrar claramente en la tarjeta del KPI el valor numérico derivado y su significado cualitativo ($R_0 > 1$: potencial expansivo; $R_0 < 1$: tendencia a la extinción).

---

## Tareas

### Tarea 1: Estructura HTML Semántica y Accesible (`src/seir/static/index.html`)

**Files:**
- Create: `src/seir/static/index.html`

**Interfaces:**
- Consumes: Contrato JSON de `POST /api/simulate` (Anexo A de la especificación).
- Produces: Estructura de componentes DOM para el panel de control, visualizador SVG, curvas y panel de reporte.

- [ ] **Paso 1: Redactar la estructura base en `src/seir/static/index.html`**
  Incluir:
  - Banner de advertencia académica ficticia en la cabecera.
  - Formulario de parámetros reactivos con inputs de rango y número: Contagio ($\beta$), Incubación ($\sigma$), Infección ($\gamma$), Cuota diaria ($K$), Tope acumulado ($K_{\max}$), Eficacia vacunal ($\eta$), Modo (Dinámico vs Estático), Semilla, y campos de siembra multi-sectorial por parroquia (`initial`).
  - Contenedor del visualizador SVG 2D con leyenda accesible (Verde Círculo: S, Amarillo Cuadrado: E, Rojo Triángulo: I, Azul Círculo Cruzado: R, Celeste Estrella: Brigadista).
  - Contenedor SVG para la gráfica multicurva comparativa.
  - Tablero de tarjetas KPI: $R_0$ (Número Básico de Reproducción), Contagios Evitados, Dosis Gastadas, Pico de Infección y Brigadistas Activos.
  - Panel colapsable de "Informe Ejecutivo para el COE Cantonal (Simulación Académica)".

- [ ] **Paso 2: Verificar validez semántica HTML5 y presencia de etiquetas de accesibilidad**
  Validar que todos los sliders tengan sus etiquetas `<label for="...">` asociadas, atributos `aria-live` en las tarjetas de resultados y roles accesibles.

- [ ] **Paso 3: Commit**
  ```bash
  git add src/seir/static/index.html
  git commit -m "feat(dev2): create accessible HTML5 layout with controls, KPI cards, and disclaimer"
  ```

---

### Tarea 2: Estilos Temáticos Spookython de Alto Contraste (`src/seir/static/style.css`)

**Files:**
- Create: `src/seir/static/style.css`

**Interfaces:**
- Consumes: Clases y elementos definidos en `index.html`.
- Produces: Hoja de estilos moderna, responsiva y accesible para monitores y proyectores.

- [ ] **Paso 1: Definir variables de diseño y paleta de alto contraste**
  Configurar variables CSS (`--bg-primary: #0f111a`, `--bg-card: #1a1d2e`, `--text-primary: #e6edf3`, `--color-s: #22c55e`, `--color-e: #eab308`, `--color-i: #ef4444`, `--color-r: #3b82f6`, `--color-vol: #06b6d4`, `--accent-spooky: #f97316`).

- [ ] **Paso 2: Implementar layout de rejilla responsiva (Grid y Flexbox)**
  Diseñar una interfaz dividida en dos columnas principales en pantallas de escritorio (Panel de parámetros a la izquierda; Visualizador SVG y Gráficas a la derecha) que se apile limpiamente en una sola columna en pantallas móviles o pantallas divididas.

- [ ] **Paso 3: Estilar las formas geométricas accesibles de los nodos SVG**
  Definir estilos SVG para las formas diferenciadas (`.node-s`, `.node-e`, `.node-i`, `.node-r`, `.node-vol`) garantizando bordes nítidos y visibilidad sin depender únicamente del color.

- [ ] **Paso 4: Commit**
  ```bash
  git add src/seir/static/style.css
  git commit -m "feat(dev2): add high-contrast responsive dark theme with accessible SVG node styling"
  ```

---

### Tarea 3: Controlador Reactivo, Animación por Diffs y Multicurva (`src/seir/static/app.js`)

**Files:**
- Create: `src/seir/static/app.js`

**Interfaces:**
- Consumes: Endpoints `/api/simulate` y `/health` expuestos por Dev 3 (Josué).
- Produces: Controlador dinámico del simulador, renderizador de curvas, animador SVG y generador del informe.

- [ ] **Paso 1: Implementar módulo de comunicación con la API (`fetchSimulation`)**
  Escribir función asíncrona que recolecte los valores actuales de los sliders y campos de siembra multi-sectorial, aplique *debounce* de 150 ms, y ejecute `POST /api/simulate`. Manejar respuestas de error HTTP 400 y HTTP 429 mostrando mensajes claros en pantalla.

- [ ] **Paso 2: Implementar renderizado del Grafo 2D y animación por diffs**
  - Dibujar los nodos en el SVG según las coordenadas relativas $(x, y)$ y las aristas intersectoriales y locales provistas en el primer payload.
  - Cuando se retorne `frames`, ejecutar un bucle de animación temporal (con controles de Play, Pausa, y barra de tiempo) que aplique únicamente los cambios de estado del día (`changed: [{id, state}]`), modificando la clase y símbolo del nodo en tiempo real de forma ultra-fluida.

- [ ] **Paso 3: Implementar gráfica multicurva comparativa en SVG nativo**
  Dibujar las 3 curvas superpuestas:
  - Curva Propuesta (Azul / Naranja destacado con línea sólida).
  - Curva Azar (Línea punteada amarilla).
  - Curva Sin Intervención (Línea roja discontinua).
  Dibujar el área sombreada del rango empírico (p2.5–p97.5) en gris sutil y renderizar los ejes temporales y valores pico.

- [ ] **Paso 4: Implementar actualización de tarjetas KPI y generador del Informe COE**
  - Actualizar la tarjeta destacada de $R_0$ con su valor analítico.
  - Actualizar tarjetas de Contagios Evitados, Dosis Gastadas, Pico de $I$ y Brigadistas.
  - Rellenar dinámicamente la plantilla del "Informe Ejecutivo para el COE Cantonal" con redacción clara y cuantitativa dirigida a las autoridades.

- [ ] **Paso 5: Commit**
  ```bash
  git add src/seir/static/app.js
  git commit -m "feat(dev2): implement reactive controller, SVG diff animator, multi-curve plotter, and COE report"
  ```
