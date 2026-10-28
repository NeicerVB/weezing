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
  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }
  const body = payload();
  if (Object.values(body.initial).reduce((sum, count) => sum + count, 0) > body.n) {
    alertUser("Los focos iniciales no pueden superar la población.");
    return;
  }
  field("error").hidden = true;
  try {
    const response = await fetch("/api/simulate", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    const data = await response.json();
    if (id !== requestId) return;
    if (!response.ok) {
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
    if (id === requestId) alertUser("No se pudo conectar con el servidor. Inténtelo de nuevo.");
  }
}

form.addEventListener("input", () => {
  syncPopulationLimits();
  field("run-batch").disabled = true;
  for (const id of ["beta", "efficacy"]) field(`${id}-value`).textContent = field(id).value;
  clearTimeout(debounce);
  const id = ++requestId;
  debounce = setTimeout(() => fetchSimulation(id), 150);
});
form.addEventListener("change", () => {
  syncPopulationLimits();
  field("run-batch").disabled = true;
  clearTimeout(debounce);
  const id = ++requestId;
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
}

function symbol(id, x, y, state) {
  const stateClass = { S: "s", E: "e", I: "i", R: "r", V: "vol" };
  const common = { class: `node-${stateClass[state] || "s"}`,
    "data-node-id": id };
  let node;
  if (state === "E") node = svgNode("rect", { ...common, x: x - 1, y: y - 1, width: 2, height: 2 });
  else if (state === "I") node = svgNode("polygon", { ...common,
    points: `${x},${y - 1.6} ${x - 1.5},${y + 1.3} ${x + 1.5},${y + 1.3}` });
  else if (state === "V") {
    const vertices = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = i % 2 ? .7 : 1.6;
      return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`;
    });
    node = svgNode("polygon", { ...common, points: vertices.join(" ") });
  } else node = svgNode("circle", { ...common, cx: x, cy: y, r: 1 });
  const names = { S: "susceptible", E: "expuesto", I: "infeccioso", R: "recuperado", V: "brigadista" };
  node.setAttribute("aria-label", `Nodo ${id}: ${names[state] || names.S}`);
  return node;
}

function paintPoint(point, state) {
  point.group.replaceChildren(symbol(point.id, point.x, point.y, state));
  if (state === "R") {
    point.group.appendChild(svgNode("line", { x1: point.x - .7, y1: point.y - .7,
      x2: point.x + .7, y2: point.y + .7, class: "mark" }));
    point.group.appendChild(svgNode("line", { x1: point.x + .7, y1: point.y - .7,
      x2: point.x - .7, y2: point.y + .7, class: "mark" }));
  }
}

function stop() {
  clearTimeout(playback);
  playback = null;
}

function seek(day) {
  stop();
  for (const point of points.values()) paintPoint(point, point.state);
  for (const frame of frames) {
    if (frame.day > day) break;
    for (const change of frame.changed) {
      const point = points.get(change.id);
      if (point) paintPoint(point, change.state);
    }
  }
  currentDay = day;
  field("timeline").value = String(day);
  field("day").textContent = `Día ${day}`;
}

function nextFrame() {
  const frame = frames.find((item) => item.day > currentDay);
  if (!frame) { stop(); return; }
  for (const change of frame.changed) {
    const point = points.get(change.id);
    if (point) paintPoint(point, change.state);
  }
  currentDay = frame.day;
  field("timeline").value = String(currentDay);
  field("day").textContent = `Día ${currentDay}`;
  if (frames.some((item) => item.day > currentDay)) playback = setTimeout(nextFrame, 250);
}

field("play").addEventListener("click", () => {
  if (!points.size || !frames.length) return;
  stop();
  if (currentDay >= frames[frames.length - 1].day) seek(0);
  playback = setTimeout(nextFrame, 250);
});
field("pause").addEventListener("click", stop);
field("timeline").addEventListener("input", () => seek(Number(field("timeline").value)));

function drawMap(data) {
  stop();
  frames = Array.isArray(data.frames) ? data.frames : [];
  points = new Map();
  const map = field("map");
  map.replaceChildren();
  const graph = data.graph;
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    field("map-status").textContent = data.meta?.animation_warning || "Red territorial no disponible en esta respuesta; las curvas y métricas siguen visibles.";
  } else {
    for (const edge of graph.edges || []) {
      const [source, target] = edge;
      const from = graph.nodes.find((point) => point.id === source);
      const to = graph.nodes.find((point) => point.id === target);
      if (from && to) map.appendChild(svgNode("line", {
        x1: from.x, y1: from.y, x2: to.x, y2: to.y, class: "edge",
      }));
    }
    for (const { id, x, y, state } of graph.nodes) {
      const group = svgNode("g");
      const point = { id, x, y, state, group };
      points.set(id, point);
      paintPoint(point, state);
      map.appendChild(group);
    }
    field("map-status").textContent = `Red territorial: ${points.size} nodos.`;
  }
  field("play").disabled = field("pause").disabled = field("timeline").disabled = !points.size || !frames.length;
  field("timeline").max = String(frames.length ? frames[frames.length - 1].day : 0);
  seek(0);
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
  field("run-batch").disabled = batchBusy;
  field("monte-carlo-status").textContent = "Curvas, tarjetas e informe: simulación individual con la semilla elegida.";
}

field("run-batch").addEventListener("click", async () => {
  if (!lastSimulation || !lastPayload || batchBusy || lastSimulationId !== requestId) return;
  const id = requestId;
  const original = lastSimulation;
  batchBusy = true;
  field("run-batch").disabled = true;
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
    field("run-batch").disabled = !lastPayload || lastSimulationId !== requestId;
  }
});
