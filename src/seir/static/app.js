"use strict";

const SVG_NS = "http://www.w3.org/2000/svg";
const SECTORS = ["tarqui", "eloy_alfaro", "los_esteros", "manta_centro", "murcielago", "barbasquillo", "san_mateo"];
const DISCLAIMER = "Simulación computacional ficticia con fines académicos para el Spookython Hackathon. No constituye una predicción epidemiológica ni una recomendación sanitaria real.";
const field = (id) => document.getElementById(id);
const value = (id) => Number(field(id).value);
const form = field("controls");
let debounce;
let requestId = 0;
let playback;
let frames = [];
let currentDay = 0;
let points = new Map();
let lastSimulation = null;
let lastPayload = null;
let lastSimulationId = -1;
let batchBusy = false;
let lastPopulation = value("n");
let simulationBusy = false;
let activeSimulationId = -1;
let queuedSimulation = null;
let chartCursor = null;
const modifiedPoints = new Set();

const MAP_DEFAULT_VB = { x: 0, y: 15, w: 100, h: 70 };
let mapVb = { ...MAP_DEFAULT_VB };
let isPanning = false;
let panStart = { x: 0, y: 0 };
let startVb = { ...mapVb };

function updateMapViewBox() {
  const map = field("map");
  if (!map) return;
  map.setAttribute("viewBox", `${mapVb.x.toFixed(2)} ${mapVb.y.toFixed(2)} ${mapVb.w.toFixed(2)} ${mapVb.h.toFixed(2)}`);
}

function zoomMap(factor, clientX, clientY) {
  const map = field("map");
  if (!map) return;
  const rect = typeof map.getBoundingClientRect === "function" ? map.getBoundingClientRect() : null;
  const mouseRatioX = rect && rect.width && Number.isFinite(clientX) ? (clientX - rect.left) / rect.width : 0.5;
  const mouseRatioY = rect && rect.height && Number.isFinite(clientY) ? (clientY - rect.top) / rect.height : 0.5;
  const newW = Math.max(15, Math.min(150, mapVb.w * factor));
  const newH = Math.max(10.5, Math.min(105, mapVb.h * factor));
  mapVb.x += (mapVb.w - newW) * mouseRatioX;
  mapVb.y += (mapVb.h - newH) * mouseRatioY;
  mapVb.w = newW;
  mapVb.h = newH;
  updateMapViewBox();
}

function resetMapView() {
  mapVb = { ...MAP_DEFAULT_VB };
  updateMapViewBox();
}

function appStatus(text, state = "ready") {
  field("app-status").textContent = text;
  field("app-status").setAttribute("data-state", state);
}

function setBusy(busy) {
  field("simulate").disabled = busy;
  field("randomize").disabled = busy;
  field("simulate").textContent = busy ? "Generando…" : "Generar simulación";
  field("workspace").setAttribute("aria-busy", String(busy));
  field("map-loading").hidden = !busy;
  field("map-empty").hidden = busy || points.size > 0;
  if (busy) {
    stop();
    appStatus("Generando escenario…", "loading");
    if (lastSimulation) field("results-context").textContent = "Actualizando · balance del escenario anterior";
  }
}

function syncPopulationLimits() {
  const n = value("n");
  if (!Number.isInteger(n) || n < 7 || n > 2000) return;
  const changed = n !== lastPopulation;
  const limits = [["k_max", Math.floor(.4 * n)], ["degree", Math.min(50, n - 1)]];
  SECTORS.forEach((sector, index) => {
    limits.push([`initial-${sector}`, Math.floor(n / 7) + (index < n % 7 ? 1 : 0)]);
  });
  for (const [id, maximum] of limits) {
    field(id).setAttribute("max", maximum);
    if (changed && value(id) > maximum) field(id).value = String(maximum);
  }
  lastPopulation = n;
}
syncPopulationLimits();

function payload() {
  const initial = {};
  for (const sector of SECTORS) {
    const count = value(`initial-${sector}`);
    if (count > 0) initial[sector] = count;
  }
  return {
    n: value("n"), days: value("days"), seed: value("seed"), beta: value("beta"),
    sigma: value("sigma"), gamma: value("gamma"), degree: value("degree"),
    initial, initial_ids: null,
    intervention: { mode: field("mode").value, efficacy: value("efficacy"), delay: 0,
      quota: value("quota"), k_max: value("k_max") },
    volunteers: { enlist: 0.12, reinfection: 0.04 },
    include_frames: field("include_frames").checked,
  };
}

function alertUser(message) {
  field("error").textContent = message;
  field("error").hidden = false;
}

async function fetchSimulation(id) {
  if (simulationBusy) { if (id !== activeSimulationId) queuedSimulation = id; return; }
  clearTimeout(debounce);
  if (!form.checkValidity()) {
    form.reportValidity();
    setBusy(false);
    appStatus("Revisa los parámetros", "error");
    return;
  }
  const body = payload();
  if (Object.values(body.initial).reduce((sum, count) => sum + count, 0) > body.n) {
    alertUser("Los focos iniciales no pueden superar la población.");
    setBusy(false);
    appStatus("Revisa los focos iniciales", "error");
    return;
  }
  simulationBusy = true;
  activeSimulationId = id;
  setBusy(true);
  field("error").hidden = true;
  try {
    const response = await fetch("/api/simulate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (id !== requestId) return;
    if (!response.ok) {
      appStatus("No se pudo generar", "error");
      if (response.status === 429) {
        const wait = response.headers.get("Retry-After");
        alertUser(`${data.error || "Servidor ocupado."} ${wait ? `Vuelva a intentarlo en ${wait} segundos.` : "Inténtelo de nuevo más tarde."}`);
      } else {
        alertUser(data.error || (response.status === 400 ? "Revise los parámetros." : "No se pudo simular."));
      }
      return;
    }
    show(data, body);
  } catch (error) {
    if (id === requestId) {
      alertUser("No se pudo conectar con el servidor. Inténtelo de nuevo.");
      appStatus("Sin conexión · reintenta", "error");
    }
  } finally {
    simulationBusy = false;
    if (queuedSimulation !== null) {
      queuedSimulation = null;
      fetchSimulation(requestId);
    } else if (id === requestId) setBusy(false);
  }
}

form.addEventListener("input", () => {
  syncPopulationLimits();
  field("run-batch").disabled = true;
  for (const id of ["beta", "efficacy"]) field(`${id}-value`).textContent = field(id).value;
  clearTimeout(debounce);
  const id = ++requestId;
  setBusy(true);
  debounce = setTimeout(() => fetchSimulation(id), 150);
});
form.addEventListener("change", () => {
  syncPopulationLimits();
  field("run-batch").disabled = true;
  clearTimeout(debounce);
  const id = ++requestId;
  setBusy(true);
  debounce = setTimeout(() => fetchSimulation(id), 150);
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  field("run-batch").disabled = true;
  clearTimeout(debounce);
  fetchSimulation(++requestId);
});

function svgNode(tag, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, item] of Object.entries(attrs)) element.setAttribute(key, item);
  return element;
}

function label(svg, text, x, y, anchor = "middle") {
  const element = svgNode("text", { x, y, "text-anchor": anchor });
  element.textContent = text;
  svg.appendChild(element);
}

function drawCurves(data) {
  const svg = field("curve");
  svg.replaceChildren();
  const proposed = data.strategies.proposed.days;
  const series = [
    ["proposed", "Propuesta"], ["random", "Azar"], ["none", "Sin intervención"],
  ];
  const range = data.range;
  const bounds = range && range.p2_5 && range.p97_5 &&
    range.p2_5.length === proposed.length && range.p97_5.length === proposed.length &&
    [...range.p2_5, ...range.p97_5].every(Number.isFinite);
  const maximum = Math.max(1, ...series.flatMap(([key]) => data.strategies[key].days.map((row) => row.i)),
    ...(bounds ? range.p97_5 : []));
  const x = (index) => 52 + 650 * index / Math.max(1, proposed.length - 1);
  const y = (count) => 260 - 240 * count / maximum;
  for (let tick = 0; tick <= 4; tick += 1) {
    const ordinate = 260 - 60 * tick;
    svg.appendChild(svgNode("line", { x1: 52, x2: 702, y1: ordinate, y2: ordinate, class: "grid" }));
    label(svg, String(Math.round(maximum * tick / 4)), 45, ordinate + 4, "end");
  }
  if (bounds) {
    const upper = range.p97_5.map((v, i) => `${x(i)},${y(v)}`);
    const lower = range.p2_5.map((v, i) => `${x(i)},${y(v)}`).reverse();
    svg.appendChild(svgNode("polygon", { points: [...upper, ...lower].join(" "), class: "range" }));
    field("range-status").textContent = "Rango empírico de simulación (p2.5 - p97.5) de la propuesta.";
  } else {
    field("range-status").textContent = "Rango empírico de simulación (p2.5 - p97.5): serie diaria no disponible.";
  }
  for (const [key, name] of series) {
    svg.appendChild(svgNode("polyline", {
      points: data.strategies[key].days.map((row, index) => `${x(index)},${y(row.i)}`).join(" "),
      class: `line-${key}`, "aria-label": name,
    }));
  }
  label(svg, `Día ${proposed[0].day}`, 52, 283);
  label(svg, `Día ${proposed[proposed.length - 1].day}`, 702, 283);
  label(svg, `Pico I: ${data.strategies.proposed.metrics.peak_i}`, 360, 18);
  chartCursor = svgNode("line", { x1: 52, x2: 52, y1: 25, y2: 260, class: "day-cursor" });
  svg.appendChild(chartCursor);
  updateDay();
}

function symbol(id, x, y, state) {
  const stateClass = { S: "s", E: "e", I: "i", R: "r", V: "vol" };
  const common = { class: `node-${stateClass[state] || "s"}`,
    "data-node-id": id,
    role: "img" };
  let node;
  if (state === "E") node = svgNode("rect", { ...common, x: x - .5, y: y - .5, width: 1, height: 1 });
  else if (state === "I") node = svgNode("polygon", { ...common,
    points: `${x},${y - .8} ${x - .7},${y + .6} ${x + .7},${y + .6}` });
  else if (state === "V") {
    const vertices = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 ? .36 : .85;
      return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`;
    });
    node = svgNode("polygon", { ...common, points: vertices.join(" ") });
  } else node = svgNode("circle", { ...common, cx: x, cy: y, r: .48 });
  const names = { S: "susceptible", E: "expuesto", I: "infeccioso", R: "recuperado", V: "brigadista" };
  node.setAttribute("aria-label", `Nodo ${id}: ${names[state] || names.S}`);
  return node;
}

function paintPoint(point, state) {
  if (point.visualState === state && (point.group.children?.length || point.group.childNodes?.length)) return;
  point.visualState = state;
  point.group.replaceChildren(symbol(point.id, point.x, point.y, state));
  if (state === "R") {
    point.group.appendChild(svgNode("line", { x1: point.x - .3, y1: point.y - .3,
      x2: point.x + .3, y2: point.y + .3, class: "mark" }));
    point.group.appendChild(svgNode("line", { x1: point.x + .3, y1: point.y - .3,
      x2: point.x - .3, y2: point.y + .3, class: "mark" }));
  }
  const title = svgNode("title");
  title.textContent = `${point.label || `Nodo ${point.id}`} · ${state === "V" ? "Brigadista" : state}`;
  point.group.appendChild(title);
}

function stop() {
  clearTimeout(playback);
  playback = null;
  const available = points.size > 0 && frames.length > 0;
  field("play").disabled = !available;
  field("pause").disabled = true;
  field("restart").disabled = !available;
  const ended = available && currentDay >= frames[frames.length - 1].day;
  field("play").textContent = ended ? "Repetir" : "Reproducir";
  field("playback-status").textContent = !available ? "Sin animación" : ended ? "Finalizado" : "En pausa";
  field("playback-status").setAttribute("data-playing", "false");
}

function updateDay() {
  field("timeline").value = String(currentDay);
  field("day").textContent = `Día ${currentDay}`;
  const row = lastSimulation?.strategies.proposed.days.find(item => item.day === currentDay);
  const counts = { S: 0, E: 0, I: 0, R: 0 };
  for (const point of points.values()) counts[point.visualState === "V" ? "R" : point.visualState] += 1;
  for (const state of ["S", "E", "I", "R"]) {
    const number = row?.[state.toLowerCase()] ?? (points.size ? counts[state] : "—");
    field(`map-count-${state.toLowerCase()}`).textContent = String(number);
  }
  if (chartCursor) {
    const days = Math.max(1, lastSimulation?.meta.days ?? 1);
    const x = 52 + 650 * Math.min(currentDay, days) / days;
    chartCursor.setAttribute("x1", x);
    chartCursor.setAttribute("x2", x);
    chartCursor.setAttribute("opacity", frames.length && points.size ? "1" : "0");
  }
}

function seek(day) {
  stop();
  for (const point of modifiedPoints) {
    paintPoint(point, point.state);
  }
  modifiedPoints.clear();
  for (const frame of frames) {
    if (frame.day > day) break;
    for (const change of frame.changed) {
      const point = points.get(change.id);
      if (point) {
        paintPoint(point, change.state);
        if (change.state !== point.state) modifiedPoints.add(point);
      }
    }
  }
  currentDay = day;
  updateDay();
  stop();
}

function nextFrame() {
  const frame = frames.find((item) => item.day > currentDay);
  if (!frame) { stop(); return; }
  for (const change of frame.changed) {
    const point = points.get(change.id);
    if (point) {
      paintPoint(point, change.state);
      if (change.state !== point.state) modifiedPoints.add(point);
    }
  }
  currentDay = frame.day;
  updateDay();
  if (frames.some((item) => item.day > currentDay)) playback = setTimeout(nextFrame, Number(field("speed").value));
  else stop();
}

function startPlayback() {
  if (!points.size || !frames.length) return;
  stop();
  if (currentDay >= frames[frames.length - 1].day) seek(0);
  field("play").disabled = true;
  field("pause").disabled = false;
  field("playback-status").textContent = "Reproduciendo";
  field("playback-status").setAttribute("data-playing", "true");
  playback = setTimeout(nextFrame, Number(field("speed").value));
}
field("play").addEventListener("click", startPlayback);
field("pause").addEventListener("click", stop);
field("restart").addEventListener("click", () => seek(0));
field("speed").addEventListener("change", () => { if (playback !== null) startPlayback(); });

let seekRaf = null;
field("timeline").addEventListener("input", () => {
  const targetDay = Number(field("timeline").value);
  if (typeof requestAnimationFrame === "function") {
    if (seekRaf) cancelAnimationFrame(seekRaf);
    seekRaf = requestAnimationFrame(() => {
      seek(targetDay);
      seekRaf = null;
    });
  } else {
    seek(targetDay);
  }
});

function drawMap(data) {
  stop();
  frames = Array.isArray(data.frames) ? data.frames : [];
  points = new Map();
  modifiedPoints.clear();
  resetMapView();
  const map = field("map");
  map.replaceChildren();
  const graph = data.graph;
  field("map-empty").hidden = Boolean(graph?.nodes?.length);
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    field("map-status").textContent = data.meta?.animation_warning ? "La red es demasiado densa para la vista detallada; las curvas y métricas están completas." : "Red territorial no disponible en esta respuesta; las curvas y métricas siguen visibles.";
    field("map-empty-title").textContent = data.meta?.animation_warning ? "Una red demasiado densa" : "Animación desactivada";
    field("map-empty-copy").textContent = data.meta?.animation_warning ? "Reduce la población o el grado medio para explorar la red." : "Activa «Animar la red» en la configuración para seguir el día a día.";
  } else {
    const centers = {tarqui:[68,48],eloy_alfaro:[74,72],los_esteros:[82,32],manta_centro:[54,48],murcielago:[42,38],barbasquillo:[30,60],san_mateo:[15,75]};
    const names = {tarqui:"Tarqui",eloy_alfaro:"Eloy Alfaro",los_esteros:"Los Esteros",manta_centro:"Manta Centro",murcielago:"Murciélago",barbasquillo:"Barbasquillo",san_mateo:"San Mateo"};
    const present = new Set(graph.nodes.map(node => node.sector));
    for (const sector of SECTORS) if (present.has(sector)) {
      const [x,y] = centers[sector];
      map.appendChild(svgNode("circle", {cx:x,cy:y,r:9,class:"sector-halo"}));
    }
    const byId = new Map(graph.nodes.map(point => [point.id, point]));
    for (const edge of graph.edges || []) {
      const [source, target] = edge;
      const from = byId.get(source);
      const to = byId.get(target);
      if (from && to) {
        const isBridge = from.sector && to.sector && from.sector !== to.sector;
        map.appendChild(svgNode("line", {
          x1: from.x, y1: from.y, x2: to.x, y2: to.y,
          class: isBridge ? "edge edge-bridge" : "edge edge-internal",
          "data-bridge": isBridge ? "true" : "false",
        }));
      }
    }
    for (const { id, x, y, state, sector, label: nodeLabel } of graph.nodes) {
      const group = svgNode("g");
      const point = { id, x, y, state, sector, group, label: nodeLabel };
      points.set(id, point);
      paintPoint(point, state);
      map.appendChild(group);
    }
    for (const sector of SECTORS) if (present.has(sector)) {
      const [x,y] = centers[sector];
      const text = svgNode("text", {x,y:sector === "manta_centro" ? y+10.8 : y-10.6,"text-anchor":"middle",class:"sector-label"});
      text.textContent = names[sector];
      map.appendChild(text);
    }
    field("map-status").textContent = `Red territorial: ${points.size} nodos.`;
  }
  field("play").disabled = field("pause").disabled = field("timeline").disabled = !points.size || !frames.length;
  field("timeline").max = String(frames.length ? frames[frames.length - 1].day : 0);
  seek(0);
  if (frames.length && points.size && (typeof matchMedia !== "function" || !matchMedia("(prefers-reduced-motion: reduce)").matches)) startPlayback();
}

function metrics(data) {
  const { proposed } = data.strategies;
  const metric = proposed.metrics;
  const r0 = data.meta.r0;
  field("r0").textContent = typeof r0 === "number" && Number.isFinite(r0) ? r0.toFixed(2) : "—";
  field("r0-meaning").textContent = r0 == null || !Number.isFinite(r0) ? "No calculable" :
    r0 > 1 ? "Potencial expansivo" : r0 < 1 ? "Tendencia a la extinción" : "Umbral de reproducción";
  field("avoided").textContent = String(metric.avoided_infections);
  field("doses").textContent = String(metric.doses_spent);
  field("peak").textContent = `${metric.peak_i} · día ${metric.peak_day}`;
  field("volunteers").textContent = String(metric.active_volunteers ?? 0);
  const table = field("metrics-table");
  table.replaceChildren();
  for (const [key, name] of [["proposed", "Propuesta"], ["random", "Azar"], ["none", "Sin intervención"]]) {
    const row = document.createElement("tr");
    for (const text of [name, data.strategies[key].metrics.cumulative_infections,
      data.strategies[key].metrics.peak_i, data.strategies[key].metrics.doses_spent]) {
      const cell = document.createElement("td");
      cell.textContent = String(text);
      row.appendChild(cell);
    }
    table.appendChild(row);
  }
  field("report-body").textContent =
    `Informe académico para el COE Cantonal de Manta. En ${data.meta.days} días con ${data.meta.n} habitantes simulados, ` +
    `el protocolo propuesto registró ${metric.cumulative_infections} contagios acumulados. ` +
    `Contagios evitados: ${metric.avoided_infections} frente a no intervenir. ` +
    `Pico de infección: ${metric.peak_i} en el día ${metric.peak_day}. ` +
    `Dosis gastadas: ${metric.doses_spent}. Brigadistas activos: ${metric.active_volunteers ?? 0}; ` +
    `reinfecciones ocupacionales: ${metric.volunteer_reinfections ?? 0}. ` + DISCLAIMER;
}

function show(data, body) {
  lastSimulation = data;
  lastPayload = body;
  lastSimulationId = requestId;
  drawCurves(data);
  drawMap(data);
  metrics(data);
  field("error").hidden = true;
  field("results-context").textContent = `Balance final · ${data.meta.days} días · semilla ${body?.seed ?? data.meta.seed ?? "—"}`;
  appStatus("Escenario actualizado");
  field("run-batch").disabled = batchBusy;
  field("monte-carlo-status").textContent = "Curvas, tarjetas e informe: simulación individual con la semilla elegida.";
}

field("run-batch").addEventListener("click", async () => {
  if (!lastSimulation || !lastPayload || batchBusy || lastSimulationId !== requestId) return;
  const id = requestId;
  const original = lastSimulation;
  batchBusy = true;
  field("run-batch").disabled = true;
  field("run-batch").textContent = "Calculando 30 réplicas…";
  field("monte-carlo-status").textContent = "Calculando 30 réplicas Monte Carlo…";
  try {
    const response = await fetch("/api/batch", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base: lastPayload, replicas: 30, include_series: true }),
    });
    const data = await response.json();
    if (id !== requestId) return;
    if (!response.ok) {
      const retry = response.headers.get("Retry-After");
      throw new Error(`${data.error || "No se pudo calcular Monte Carlo."}${retry ? ` Reintente en ${retry} segundos.` : ""}`);
    }
    const strategies = {};
    for (const key of ["proposed", "random", "none"]) {
      strategies[key] = {
        days: data.series[key].mean.map((count, day) => ({ day, i: count })),
        metrics: { peak_i: Math.max(...data.series[key].mean) },
      };
    }
    drawCurves({ strategies, range: data.series.proposed });
    field("monte-carlo-status").textContent = `Curvas: medias de ${data.replicas} réplicas; banda: rango empírico de la propuesta. Tarjetas e informe: simulación individual, semilla ${original.meta.seed ?? lastPayload.seed}.`;
  } catch (error) {
    if (id === requestId) {
      alertUser(error.message || "No se pudo conectar con el servidor.");
      field("monte-carlo-status").textContent = "Monte Carlo no disponible; se conserva la gráfica anterior.";
    }
  } finally {
    batchBusy = false;
    field("run-batch").textContent = "Comparar 30 réplicas";
    field("run-batch").disabled = !lastPayload || lastSimulationId !== requestId;
  }
});

field("randomize").addEventListener("click", () => {
  if (field("randomize").disabled) return;
  const pick = items => items[Math.floor(Math.random() * items.length)];
  const integer = (min,max) => min + Math.floor(Math.random() * (max-min+1));
  const previousSeed = value("seed");
  let seed = integer(0, 2147483646);
  if (seed === previousSeed) seed = (seed + 1) % 2147483647;
  const n = pick([350,500,750,1000]);
  const choices = {n,days:pick([45,60,75]),seed,degree:pick([6,8,10]),
    beta:(integer(15,85)/1000).toFixed(3),sigma:(integer(12,35)/100).toFixed(2),
    gamma:(integer(5,18)/100).toFixed(2),efficacy:(integer(55,95)/100).toFixed(2),
    mode:pick(["dynamic","static"]),quota:integer(10,40),k_max:Math.floor(n*integer(20,40)/100)};
  for (const [id,number] of Object.entries(choices)) field(id).value = String(number);
  syncPopulationLimits();
  const sectors = [...SECTORS];
  for (let i=sectors.length-1;i>0;i--) { const j=integer(0,i); [sectors[i],sectors[j]]=[sectors[j],sectors[i]]; }
  const active = sectors.slice(0,integer(1,3));
  for (const sector of SECTORS) field(`initial-${sector}`).value = active.includes(sector) ? String(integer(2,12)) : "0";
  for (const id of ["beta","efficacy"]) field(`${id}-value`).textContent = field(id).value;
  field("scenario-note").textContent = `Escenario al azar · semilla ${seed} · ${n} personas · ${active.length} ${active.length===1?"foco":"focos"}.`;
  clearTimeout(debounce);
  field("run-batch").disabled = true;
  fetchSimulation(++requestId);
});

document.addEventListener("DOMContentLoaded", () => fetchSimulation(++requestId), {once:true});
field("toggle-parameters").addEventListener("click", () => {
  const open = field("parameter-fields").getAttribute("data-open") !== "true";
  field("parameter-fields").setAttribute("data-open", String(open));
  field("toggle-parameters").setAttribute("aria-expanded", String(open));
  field("toggle-parameters").textContent = open ? "Ocultar parámetros" : "Ver parámetros";
});

const btnZoomIn = field("zoom-in");
if (btnZoomIn) btnZoomIn.addEventListener("click", () => zoomMap(0.8));
const btnZoomOut = field("zoom-out");
if (btnZoomOut) btnZoomOut.addEventListener("click", () => zoomMap(1.25));
const btnZoomReset = field("zoom-reset");
if (btnZoomReset) btnZoomReset.addEventListener("click", resetMapView);
const filterBridges = field("filter-bridges");
if (filterBridges) filterBridges.addEventListener("change", (e) => {
  const map = field("map");
  if (map) map.setAttribute("data-filter-bridges", e.target?.checked || filterBridges.checked ? "true" : "false");
});

const mapEl = field("map");
if (mapEl) {
  mapEl.addEventListener("wheel", (e) => {
    if (e.preventDefault) e.preventDefault();
    const factor = (e.deltaY || 0) < 0 ? 0.85 : 1.15;
    zoomMap(factor, e.clientX, e.clientY);
  });
  mapEl.addEventListener("mousedown", (e) => {
    if (e.button && e.button !== 0) return;
    isPanning = true;
    panStart = { x: e.clientX || 0, y: e.clientY || 0 };
    startVb = { ...mapVb };
  });
}
if (typeof window !== "undefined") {
  window.addEventListener("mousemove", (e) => {
    if (!isPanning || !mapEl) return;
    const rect = typeof mapEl.getBoundingClientRect === "function" ? mapEl.getBoundingClientRect() : null;
    if (!rect || !rect.width || !rect.height) return;
    const dx = (e.clientX - panStart.x) * (startVb.w / rect.width);
    const dy = (e.clientY - panStart.y) * (startVb.h / rect.height);
    mapVb.x = startVb.x - dx;
    mapVb.y = startVb.y - dy;
    updateMapViewBox();
  });
  window.addEventListener("mouseup", () => {
    isPanning = false;
  });
}
