import "./style.css";
import { DEFAULTS, makeWorld, simulate, validate } from "./engine.js";
import { createScene } from "./scene.js";

const labels = {
  none: "Sin intervención",
  random: "Vacunación al azar",
  degree: "Vacunación dirigida",
};
const app = document.querySelector("#app");
app.innerHTML = `
<header><a class="brand" href="./"><span class="brand-mark">M<span>+</span></span><div>MANTA <b>OUTBREAK LAB</b><small>SIMULACIÓN EPIDEMIOLÓGICA · TRACK B</small></div></a><div class="header-right"><span class="live-dot"></span> Laboratorio de escenarios <span class="tag">RED SINTÉTICA · 3D</span></div></header>
<main>
<aside class="panel controls"><div class="eyebrow">01 / DISEÑA EL ESCENARIO</div><h1>Una ciudad.<br>Muchas decisiones.</h1><p class="intro">Explora cómo una intervención cambia el rumbo de un brote.</p>
<form id="config"><div class="field-row"><label>Modelo<select name="model"><option>SEIR</option><option>SIR</option></select></label><label>Inicio de referencia<input type="date" name="date" value="2021-03-15"></label></div>
<label>Población sintética <output id="population-out">900</output><input type="range" name="population" min="300" max="1800" step="100" value="900"></label>
<label>Contagio β / día <output id="beta-out">0.65</output><input type="range" name="beta" min="0" max="2" step="0.05" value="0.65"></label>
<div class="field-row"><label>Días infeccioso<input name="infectiousDays" type="number" min="1" max="30" value="7"></label><label>Incubación (días)<input name="latentDays" type="number" min="1" max="20" value="4"></label></div>
<div class="field-row"><label>Infectados iniciales<input name="initial" type="number" min="1" max="200" value="12"></label><label>Duración (días)<input name="days" type="number" min="1" max="60" value="7"></label></div>
<div class="divider"></div><div class="eyebrow">RECURSOS LIMITADOS</div>
<label>Dosis disponibles <output id="vaccines-out">90</output><input type="range" name="vaccines" min="0" max="300" step="10" value="90"></label>
<label>Eficacia inmediata <output id="efficacy-out">90%</output><input type="range" name="efficacy" min="0" max="1" step="0.05" value="0.9"></label>
<div class="field-row"><label>Réplicas Monte Carlo<input name="repetitions" type="number" min="2" max="300" value="40"></label><label>Semilla<input name="seed" type="number" min="0" max="4294967295" value="42"></label></div>
<button class="primary" id="run" type="submit"><span>Comparar estrategias</span><span>↗</span></button><p id="status" role="status">Misma red. Mismas dosis. Comparación justa.</p></form>
<button class="text-button" id="assumptions">Ver supuestos y datos ↗</button></aside>
<section class="workspace">
<div class="scene-top"><div><div class="eyebrow">02 / OBSERVA EL BROTE</div><h2>El pulso de Manta <span>Escenario conceptual</span></h2></div><div class="view-tools"><label><input type="checkbox" id="network" checked> Contactos</label><button id="camera" title="Restablecer cámara">↺ Cámara</button></div></div>
<div class="city"><div id="scene"></div><div class="scene-overlay"><span class="chip">● VISTA 3D EN VIVO</span><span class="chip">3 zonas sintéticas</span></div><div class="zone-labels"><span>Zona oeste</span><span>Zona centro</span><span>Zona este</span></div><div class="scene-bottom"><span>Arrastra para girar · rueda para acercar · señala una persona</span><span>RED DE CONTACTOS ≠ DISTANCIA FÍSICA</span></div><div id="scene-error" hidden></div></div>
<div class="playback panel"><div class="strategy-tabs" role="group" aria-label="Estrategia visible"><button data-strategy="none">Sin intervención</button><button data-strategy="random">Al azar</button><button class="active" data-strategy="degree">Dirigida ✦</button></div><div class="timeline"><button id="play" aria-label="Reproducir o pausar">▶</button><input id="day" aria-label="Día de simulación" type="range" min="0" max="7" value="0"><b id="day-label">DÍA 00 / 07</b><select id="speed" aria-label="Velocidad"><option value="1200">1×</option><option value="600">2×</option><option value="250">4×</option></select></div><div class="state-legend"><span><i class="s"></i>Susceptibles <b id="count-S">—</b></span><span><i class="e"></i>Expuestos <b id="count-E">—</b></span><span><i class="i"></i>Infecciosos <b id="count-I">—</b></span><span><i class="r"></i>Inmunes / retirados <b id="count-R">—</b></span></div><small id="frame-note">Vista de la réplica 1; las estadísticas inferiores promedian todas las réplicas.</small></div>
<div class="results-heading"><div><div class="eyebrow">03 / MIDE EL IMPACTO</div><h2>Decisiones con evidencia</h2></div><button id="export">↓ Exportar resultados</button></div>
<div class="metric-grid"><article class="panel metric"><span>Infecciones evitadas · dirigida</span><strong id="saved">—</strong><small id="saved-range">Frente a no intervenir</small></article><article class="panel metric"><span>Infecciones evitadas · al azar</span><strong id="random-saved">—</strong><small>Con el mismo presupuesto de dosis</small></article><article class="panel metric accent"><span>Recursos empleados</span><strong id="doses">90 <em>dosis</em></strong><small id="cost-note">1 dosis = 1 unidad de presupuesto</small></article></div>
<div class="bottom-grid"><article class="panel chart-panel"><h3>Infecciosos activos <span>Media y rango P10–P90</span></h3><canvas id="chart" height="240" aria-label="Curvas de infectados activos por estrategia"></canvas><div class="chart-legend"><span class="base">Sin intervención</span><span class="random">Al azar</span><span class="directed">Dirigida</span></div></article><article class="panel observed"><div class="eyebrow">CONTEXTO / DATOS DE MANTA</div><h3>La semana observada</h3><strong id="observed-total">—</strong><p id="observed-note">Cargando casos notificados…</p><div id="observed-bars"></div><small>Notificaciones reales, no infectados activos. La población y la red del experimento son sintéticas; no se escala esta cifra.</small></article></div>
<footer>Escenario inspirado en COVID · vacunación preventiva idealizada · no estima muertes ni sustituye una predicción sanitaria.</footer>
</section></main>
<dialog id="about"><button id="close-about" aria-label="Cerrar">✕</button><div class="eyebrow">UN EXPERIMENTO EXPLICABLE</div><h2>Qué simula este laboratorio</h2><p>La ciudad contiene personas sintéticas conectadas mediante hogares, centros de actividad y contactos entre zonas. La ubicación 3D es ilustrativa: los contagios viajan por las aristas, no por la cercanía visual.</p><p>Se vacuna antes del día 0 a susceptibles conocidos. La estrategia dirigida elige los nodos con mayor grado; la aleatoria selecciona igual número de susceptibles. Las dosis tienen la misma eficacia inmediata en ambas estrategias. Es una intervención idealizada, no el tiempo real de una vacuna contra COVID.</p><p>SIR: S → I → R. SEIR: S → E → I → R. Los tiempos son exponenciales. R incluye inmunizados por vacuna y retirados tras infección; no distingue muertes.</p><p>“Infecciones evitadas” es la diferencia de personas que alguna vez se infectaron durante el horizonte entre réplicas emparejadas. Puede ser negativa por azar; no significa muertes evitadas. La banda P10–P90 refleja variación estocástica con parámetros fijos.</p><p>Los casos diarios de Manta se usan como referencia histórica. β, población, red, eficacia y estados iniciales son supuestos editables del experimento; no están calibrados con ese CSV. Cada nodo representa una persona sintética, no una fracción estimada de Manta.</p><p>Por defecto: SEIR, 900 personas, 12 infecciosos, β=0.65/día, 7 días infeccioso, 4 días latente, 90 dosis, eficacia 90%, 40 réplicas y semilla 42. Solo cambia la aleatoriedad epidémica entre réplicas; red y casos iniciales permanecen fijos.</p><p>Fecha: 15–21 marzo de 2021. La fecha cambia los datos observados y las etiquetas; no modifica automáticamente β ni los casos iniciales. Descarga JSON para conservar configuración y resultados completos.</p></dialog>`;

let scene;
try {
  scene = createScene(document.querySelector("#scene"));
} catch (error) {
  document.querySelector("#scene-error").hidden = false;
  document.querySelector("#scene-error").textContent =
    "No se pudo iniciar WebGL. La comparación estadística sigue disponible.";
  console.error(error);
}
const form = document.querySelector("#config"),
  status = document.querySelector("#status");
let result,
  selected = "degree",
  day = 0,
  timer,
  worker,
  busy = false,
  runId = 0,
  observed = [];
const fmt = (n) =>
  new Intl.NumberFormat("es-EC", { maximumFractionDigits: 1 }).format(n);
function config() {
  const c = {};
  for (const [k, v] of new FormData(form))
    c[k] = ["model", "date"].includes(k) ? v : Number(v);
  validate(c);
  return c;
}
function syncOutputs() {
  for (const k of ["population", "beta", "vaccines", "efficacy"])
    document.querySelector(`#${k}-out`).textContent =
      k === "efficacy"
        ? Math.round(form.elements[k].value * 100) + "%"
        : form.elements[k].value;
}
form.addEventListener("input", () => {
  syncOutputs();
  if (result)
    status.textContent =
      "Configuración modificada. Pulsa comparar para aplicar los cambios.";
});
function pause() {
  clearInterval(timer);
  timer = null;
  document.querySelector("#play").textContent = "▶";
}
function setDay(value) {
  day = Number(value);
  if (!result) return;
  const run = result.runs[selected][0],
    frame = run.frames[day],
    counts = run.history[day];
  scene?.update(frame);
  document.querySelector("#day").value = day;
  document.querySelector("#day-label").textContent =
    `DÍA ${String(day).padStart(2, "0")} / ${String(result.config.days).padStart(2, "0")}`;
  for (const s of ["S", "E", "I", "R"])
    document.querySelector(`#count-${s}`).textContent = counts[s];
}
function drawChart() {
  if (!result?.metrics) return;
  const canvas = document.querySelector("#chart"),
    rect = canvas.getBoundingClientRect(),
    dpr = Math.min(devicePixelRatio, 2);
  canvas.width = rect.width * dpr;
  canvas.height = 230 * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const w = rect.width,
    h = 230,
    left = 38,
    right = w - 14,
    top = 15,
    bottom = 200;
  const max =
    Math.max(
      1,
      ...Object.values(result.metrics).flatMap((m) =>
        m.curve.map((x) => x.p90),
      ),
    ) * 1.15;
  const x = (d) => left + ((right - left) * d) / result.config.days,
    y = (v) => bottom - ((bottom - top) * v) / max;
  ctx.font = "11px system-ui";
  ctx.textAlign = "right";
  for (let i = 0; i <= 4; i++) {
    const val = (max * i) / 4;
    ctx.strokeStyle = "#26343d";
    ctx.beginPath();
    ctx.moveTo(left, y(val));
    ctx.lineTo(right, y(val));
    ctx.stroke();
    ctx.fillStyle = "#829aa7";
    ctx.fillText(Math.round(val), left - 6, y(val) + 4);
  }
  ctx.textAlign = "center";
  for (
    let d = 0;
    d <= result.config.days;
    d += Math.max(1, Math.ceil(result.config.days / 7))
  ) {
    ctx.fillText(`D${d}`, x(d), 220);
  }
  for (const [s, col] of Object.entries({
    none: "#ff647c",
    random: "#e9b961",
    degree: "#56d9be",
  })) {
    const curve = result.metrics[s].curve;
    ctx.fillStyle = col + "1c";
    ctx.beginPath();
    curve.forEach((v, d) =>
      d ? ctx.lineTo(x(d), y(v.p90)) : ctx.moveTo(x(d), y(v.p90)),
    );
    for (let d = curve.length - 1; d >= 0; d--)
      ctx.lineTo(x(d), y(curve[d].p10));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.beginPath();
    curve.forEach((v, d) =>
      d ? ctx.lineTo(x(d), y(v.mean)) : ctx.moveTo(x(d), y(v.mean)),
    );
    ctx.stroke();
  }
}
new ResizeObserver(drawChart).observe(document.querySelector("#chart"));
function showObserved(c) {
  const start = new Date(c.date + "T00:00:00Z");
  if (Number.isNaN(start.valueOf())) return;
  const rows = Array.from({ length: c.days }, (_, i) => {
    const date = new Date(start);
    date.setUTCDate(date.getUTCDate() + i);
    const key = date.toISOString().slice(0, 10);
    return { date: key, record: observed.find((r) => r.date === key) };
  });
  const known = rows.filter((r) => r.record);
  document.querySelector("#observed-total").textContent = known.length
    ? fmt(known.reduce((sum, r) => sum + r.record.cases, 0))
    : "Sin datos";
  document.querySelector("#observed-note").textContent =
    `Casos notificados · ${c.date} · ${known.length}/${c.days} días disponibles`;
  const max = Math.max(1, ...known.map((r) => r.record.cases));
  document.querySelector("#observed-bars").innerHTML = rows
    .map(
      (r) =>
        `<div title="${r.date}: ${r.record ? r.record.cases : "sin datos"}"><i style="height:${r.record ? Math.max(2, (r.record.cases / max) * 65) : 2}px;opacity:${r.record ? 1 : 0.2}"></i></div>`,
    )
    .join("");
}
function finish(next) {
  result = next;
  scene?.load(result.world);
  scene?.toggleNetwork(document.querySelector("#network").checked);
  document.querySelector("#day").max = result.config.days;
  setDay(0);
  const m = result.metrics;
  document.querySelector("#saved").textContent = fmt(m.degree.prevented.mean);
  document.querySelector("#saved-range").textContent =
    `P10–P90: ${fmt(m.degree.prevented.p10)} a ${fmt(m.degree.prevented.p90)} · frente a no intervenir`;
  document.querySelector("#random-saved").textContent = fmt(
    m.random.prevented.mean,
  );
  document.querySelector("#doses").innerHTML =
    `${m.degree.doses} <em>dosis</em>`;
  status.textContent = `${result.config.repetitions} réplicas por estrategia · semilla ${result.config.seed} · completado`;
  showObserved(result.config);
  drawChart();
}
function run() {
  let c;
  try {
    c = config();
  } catch (e) {
    status.textContent = e.message;
    return;
  }
  pause();
  worker?.terminate();
  busy = true;
  const id = ++runId;
  document.querySelector("#run").disabled = true;
  status.textContent = "Preparando simulaciones…";
  worker = new Worker(new URL("./worker.js", import.meta.url), {
    type: "module",
  });
  worker.onmessage = ({ data }) => {
    if (id !== runId) return;
    if (data.type === "progress") {
      status.textContent = `Simulando ${data.done}/${data.total} réplicas…`;
      return;
    }
    busy = false;
    document.querySelector("#run").disabled = false;
    if (data.type === "error") {
      status.textContent = data.message;
      return;
    }
    finish(data.result);
    worker.terminate();
  };
  worker.onerror = (e) => {
    busy = false;
    status.textContent = `Error del motor: ${e.message}`;
    document.querySelector("#run").disabled = false;
  };
  worker.postMessage(c);
}
form.addEventListener("submit", (e) => {
  e.preventDefault();
  run();
});
document.querySelectorAll("[data-strategy]").forEach(
  (button) =>
    (button.onclick = () => {
      selected = button.dataset.strategy;
      document
        .querySelectorAll("[data-strategy]")
        .forEach((b) => b.classList.toggle("active", b === button));
      setDay(day);
    }),
);
document.querySelector("#day").oninput = (e) => {
  pause();
  setDay(e.target.value);
};
function play() {
  if (timer) {
    pause();
    return;
  }
  if (!result) return;
  if (day >= result.config.days) setDay(0);
  document.querySelector("#play").textContent = "Ⅱ";
  timer = setInterval(
    () => {
      if (day >= result.config.days) {
        pause();
        return;
      }
      setDay(day + 1);
    },
    Number(document.querySelector("#speed").value),
  );
}
document.querySelector("#play").onclick = play;
document.querySelector("#speed").onchange = () => {
  if (timer) {
    pause();
    play();
  }
};
document.querySelector("#network").onchange = (e) =>
  scene?.toggleNetwork(e.target.checked);
document.querySelector("#camera").onclick = () => scene?.reset();
document.querySelector("#assumptions").onclick = () =>
  document.querySelector("#about").showModal();
document.querySelector("#close-about").onclick = () =>
  document.querySelector("#about").close();
document.querySelector("#export").onclick = () => {
  if (!result || busy) return;
  const payload = {
    ...result,
    exportedAt: new Date().toISOString(),
    dataSource: "casos_diarios_manta.csv",
    observed,
    interpretation:
      "Infecciones evitadas en población sintética; no muertes evitadas.",
  };
  const blob = new Blob([JSON.stringify(payload)], {
      type: "application/json",
    }),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `manta-${result.config.model}-semilla-${result.config.seed}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
fetch("./data/manta.json")
  .then((r) => {
    if (!r.ok) throw Error("No se pudo cargar el CSV exportado");
    return r.json();
  })
  .then((data) => {
    observed = data;
    if (result) showObserved(result.config);
  })
  .catch((e) => {
    document.querySelector("#observed-note").textContent = e.message;
  });
syncOutputs();
const c = { ...DEFAULTS };
const world = makeWorld(c),
  runs = {};
for (const s of ["none", "random", "degree"])
  runs[s] = [simulate(c, world, s, 0, true)];
result = { config: c, world, runs };
scene?.load(world);
setDay(0);
run();
// Estado compacto para verificar la aplicación sin acoplar el motor a la interfaz.
window.mantaLab = {
  get config() {
    return result?.config;
  },
  get metrics() {
    return result?.metrics;
  },
  get busy() {
    return busy;
  },
  get day() {
    return day;
  },
};
