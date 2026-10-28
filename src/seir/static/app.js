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
let acceptedScenario = Scenario.defaults();
let lastAggregate = null;
let simulationBusy = false;
let activeSimulationId = -1;
let queuedSimulation = null;
let chartCursor = null;
const modifiedPoints = new Set();

function invalidateEditedScenario() {
  clearTimeout(debounce);
  requestId += 1;
  queuedSimulation = null;
  field("run-batch").disabled = true;
  appStatus(lastSimulation ? "Parámetros modificados · genera para actualizar" : "Configura el escenario y genera la simulación");
}

const MAP_DEFAULT_VB = { x: 0, y: 15, w: 100, h: 70 };
const TERRITORY_POLYGON = [[49,15],[50.8,17.3],[50.4,20.1],[48.3,22.2],[46.9,24.1],[46.2,27.1],[45.4,28.1],[46.3,29],[47.7,28.8],[48.8,29.7],[49,31.3],[51.2,32.5],[56.2,32.7],[59.6,32.5],[63.7,31.3],[67.9,31.1],[73.5,31.1],[73.7,34.6],[75.2,37],[77.1,39.1],[79.8,39.7],[82.9,39],[85.4,37.2],[88.5,36.2],[92.1,34.4],[94,32.9],[96.2,33.9],[96.5,36.9],[96.5,39.1],[97.7,42.5],[99.8,45.6],[97.7,47.4],[95.4,49.3],[95,51.6],[95.4,54.2],[95.2,55.9],[93.7,57.4],[90.6,57.7],[88.7,58.4],[87.3,60.5],[86.5,63.1],[84.2,65],[82.1,68.4],[80.4,70.5],[82.1,72.8],[81.9,75.4],[81.5,77.8],[81.7,80.1],[80.6,82.5],[79,84.1],[75.8,83.3],[72.9,81],[71.2,79.2],[68.8,78.7],[66.5,78.3],[65,78.7],[63.3,78],[62.3,76.6],[60,75.2],[58.5,73.6],[56.7,71.9],[55.6,69.6],[54.6,68.2],[55.2,65.9],[55,63.8],[53.7,62.3],[51.2,61],[49.6,59.6],[48.3,57.4],[47.5,55.4],[45.2,54.9],[42.9,54.2],[40.4,53.3],[38.3,52.5],[36.3,51.1],[35.8,49.3],[36,46.5],[35.4,44.8],[34,43.9],[31,43.7],[28.1,43.5],[25,43.4],[22.1,42.3],[19.2,41.8],[16.5,41.6],[13.7,40.9],[11.2,40.9],[9,40.5],[7.1,40.4],[4.8,40.4],[2.7,39.8],[1.3,38.5],[0.8,36.5],[1,35],[2.9,33.7],[5,32.3],[7.7,30.4],[10.2,29],[12.7,26.6],[16,26.9],[18.8,27.8],[21.7,28.1],[25,27.9],[29.4,27.6],[33.3,26.7],[36.7,25.5],[40.2,24.1],[42.7,22.4],[45.6,20.1],[47.3,18.5],[47.3,16.4],[48.5,15.2]];
const SECTOR_NUMBERS = {
  san_mateo:"1", murcielago:"2", manta_centro:"3", tarqui:"4",
  los_esteros:"5", eloy_alfaro:"6", barbasquillo:"7",
};
const SECTOR_MARKERS = {
  san_mateo:[13,34.6], barbasquillo:[29,33.9], murcielago:[46,31.8],
  manta_centro:[44,45.1], tarqui:[58,40.9], los_esteros:[75,39.5], eloy_alfaro:[73,59.1],
};
let mapVb = { ...MAP_DEFAULT_VB };
const territoryShape = svgNode("path", { class: "territory-shape",
  d: polygonPath(TERRITORY_POLYGON) });
field("map").appendChild(territoryShape);
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
  field("randomize").disabled = false;
  field("simulate").textContent = busy ? "Generando…" : "Ejecutar simulación";
  field("workspace").setAttribute("aria-busy", String(busy));
  field("map-loading").hidden = !busy;
  field("map-empty").hidden = busy || points.size > 0;
  if (busy) {
    stop();
    field("report").hidden = true;
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
    if (changed && !id.startsWith("initial-") && value(id) > maximum) field(id).value = String(maximum);
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
    initial_state: Object.fromEntries(["s","e","i","r"].map(key=>[key,value(`count-${key}`)])),
    all_s_import: field("all-s-import").checked,
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
  const body = JSON.parse(JSON.stringify(acceptedScenario));
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
    } else setBusy(false);
  }
}

function syncDraft() {
  field("n").value = String(["s","e","i","r"].reduce((sum,key)=>sum+value(`count-${key}`),0));
  syncPopulationLimits();
  for (const id of ["beta","efficacy"]) field(`${id}-value`).textContent = field(id).value;
}

function fillDraft(config) {
  for (const key of ["n","days","seed","beta","sigma","gamma","degree"]) field(key).value = String(config[key]);
  for (const key of ["s","e","i","r"]) field(`count-${key}`).value = String(config.initial_state[key]);
  for (const key of ["mode","efficacy","quota","k_max"]) field(key).value = String(config.intervention[key]);
  for (const sector of SECTORS) field(`initial-${sector}`).value = String(config.initial[sector] || 0);
  field("include_frames").checked = config.include_frames;
  field("all-s-import").checked = config.all_s_import;
  field("incubation-days").value = config.sigma === 0 ? "0" : String(1/config.sigma);
  syncDraft();
}

function draft() {
  const numericFields=["days","seed","beta","sigma","gamma","degree","quota","k_max","efficacy","incubation-days",...["s","e","i","r"].map(key=>`count-${key}`),...SECTORS.map(sector=>`initial-${sector}`)];
  if (numericFields.some(id=>String(field(id).value).trim()==="")) throw new Error("Completa todos los campos numéricos; puedes usar cero.");
  if (!form.checkValidity()) throw new Error("Revisa los límites de los campos del escenario.");
  const days = value("incubation-days");
  if (!Number.isFinite(days) || days<0 || (days>0 && days<1)) throw new Error("La incubación media debe ser al menos 1 día, o 0 sin progresión.");
  return Scenario.validate(payload());
}

function scenarioError(message) {
  field("scenario-error").textContent = message;
  field("scenario-error").hidden = false;
}
function acceptScenario() {
  try {
    syncDraft();
    acceptedScenario = draft();
    invalidateEditedScenario();
    field("accepted-summary").textContent = `${acceptedScenario.n} personas · ${acceptedScenario.days} días · semilla ${acceptedScenario.seed}`;
    field("scenario-dialog").close();
    field("open-scenario").focus();
    appStatus("Escenario aceptado · listo para ejecutar");
  } catch (error) { scenarioError(error.message); }
}
function storage() {
  try { return globalThis.localStorage; } catch (error) { return null; }
}
function renderPresets() {
  const saved = Scenario.readPresets(storage());
  const list = field("preset-list");
  list.replaceChildren();
  if (!saved.ok) field("preset-status").textContent = saved.error;
  for (const [index,item] of [...Scenario.basePresets(),...saved.presets].entries()) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "preset-button";
    button.textContent = `${item.name}${index<3 ? " · base" : ""}`;
    button.addEventListener("click",()=>{
      fillDraft(item.config);
      field("scenario-error").hidden = true;
      field("scenario-note").textContent = `${item.name}: borrador cargado. Acepta para utilizarlo.`;
    });
    list.appendChild(button);
  }
}
function openScenario(config=acceptedScenario) {
  fillDraft(config);
  field("scenario-error").hidden = true;
  renderPresets();
  const dialog = field("scenario-dialog");
  if (!dialog.open) dialog.showModal();
  field("count-s").focus();
}
field("open-scenario").addEventListener("click",()=>openScenario());
field("accept-scenario").addEventListener("click",acceptScenario);
field("cancel-scenario").addEventListener("click",()=>field("scenario-dialog").close());
field("scenario-dialog").addEventListener("close",()=>{
  fillDraft(acceptedScenario);
  field("open-scenario").focus();
});
field("scenario-dialog").addEventListener("cancel",()=>{
  fillDraft(acceptedScenario);
  field("open-scenario").focus();
});
field("clear-scenario").addEventListener("click",()=>{fillDraft(Scenario.defaults()); field("scenario-error").hidden=true;});
field("save-scenario").addEventListener("click",()=>{
  try {
    const saved = Scenario.savePreset(storage(),field("preset-name").value,draft());
    if (!saved.ok) throw new Error(saved.error);
    renderPresets();
    field("preset-status").textContent = "Escenario guardado en este navegador. Aceptar sigue siendo independiente.";
  } catch (error) { field("preset-status").textContent=error.message; }
});
field("incubation-days").addEventListener("input",()=>{
  const days=value("incubation-days");
  field("sigma").value=String(days===0 ? 0 : 1/days);
});
field("sigma").addEventListener("input",()=>{
  const sigma=value("sigma");
  field("incubation-days").value=String(sigma===0 ? 0 : 1/sigma);
});
form.addEventListener("input",syncDraft);
form.addEventListener("change",syncDraft);
form.addEventListener("submit",event=>{event.preventDefault(); acceptScenario();});
field("simulate").addEventListener("click",()=>{
  field("run-batch").disabled=true;
  fetchSimulation(++requestId);
});

function svgNode(tag, attrs = {}) {
  const element = document.createElementNS(SVG_NS, tag);
  for (const [key, item] of Object.entries(attrs)) element.setAttribute(key, item);
  return element;
}

function polygonPath(points) {
  return `M${points.map(([x,y]) => `${x} ${y}`).join(" L")} Z`;
}

function containsPoint(polygon, x, y) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i], [xj, yj] = polygon[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function sectorPolygons() {
  const cross = (a,b,c) => (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const area = TERRITORY_POLYGON.reduce((sum, [x,y], index) => {
    const [nx,ny] = TERRITORY_POLYGON[(index+1)%TERRITORY_POLYGON.length];
    return sum + x*ny - nx*y;
  }, 0);
  const orientation = Math.sign(area);
  const remaining = TERRITORY_POLYGON.map((_, index) => index);
  const triangles = [];
  while (remaining.length > 3) {
    let clipped = false;
    for (let index = 0; index < remaining.length; index++) {
      const previous = remaining[(index+remaining.length-1)%remaining.length];
      const current = remaining[index];
      const next = remaining[(index+1)%remaining.length];
      const triangle = [TERRITORY_POLYGON[previous],TERRITORY_POLYGON[current],TERRITORY_POLYGON[next]];
      if (cross(...triangle)*orientation <= 1e-8) continue;
      const containsVertex = remaining.some(point => point !== previous && point !== current && point !== next &&
        cross(triangle[0],triangle[1],TERRITORY_POLYGON[point])*orientation > 1e-8 &&
        cross(triangle[1],triangle[2],TERRITORY_POLYGON[point])*orientation > 1e-8 &&
        cross(triangle[2],triangle[0],TERRITORY_POLYGON[point])*orientation > 1e-8);
      if (containsVertex) continue;
      triangles.push(triangle);
      remaining.splice(index,1);
      clipped = true;
      break;
    }
    if (!clipped) throw new Error("The territory outline cannot be partitioned into SVG triangles.");
  }
  triangles.push(remaining.map(index => TERRITORY_POLYGON[index]));
  const centers=triangles.map(triangle=>[triangle.reduce((sum,point)=>sum+point[0],0)/3,triangle.reduce((sum,point)=>sum+point[1],0)/3]);
  const regions=Object.fromEntries(Object.keys(SECTOR_MARKERS).map(sector=>[sector,[]]));
  const triangleOwners=Array(triangles.length).fill(null);
  const edges = new Map();
  for (const [triangleIndex,triangle] of triangles.entries()) {
    for (let index = 0; index < 3; index++) {
      const from = triangle[index], to = triangle[(index+1)%3];
      const key = [from.join(","),to.join(",")].sort().join("|");
      if (!edges.has(key)) edges.set(key,[]);
      edges.get(key).push({triangleIndex,from,to});
    }
  }
  const neighbors=Array.from({length:triangles.length},()=>[]);
  for(const owners of edges.values()) if(owners.length===2) {
    const [a,b]=owners.map(owner=>owner.triangleIndex);
    const distance=Math.hypot(centers[a][0]-centers[b][0],centers[a][1]-centers[b][1]);
    neighbors[a].push([b,distance]); neighbors[b].push([a,distance]);
  }
  const frontier=Object.entries(SECTOR_MARKERS).map(([sector,[x,y]])=>{
    const index=triangles.findIndex(triangle=>containsPoint(triangle,x,y));
    if(index<0) throw new Error(`The ${sector} marker must be inside the territory triangulation.`);
    triangleOwners[index]=sector;
    return {index,sector,distance:0};
  });
  const processed=new Set();
  while(frontier.length) {
    frontier.sort((a,b)=>a.distance-b.distance);
    const current=frontier.shift();
    if(processed.has(current.index)||triangleOwners[current.index]&&triangleOwners[current.index]!==current.sector) continue;
    triangleOwners[current.index]=current.sector;
    processed.add(current.index);
    for(const [index,distance] of neighbors[current.index]) if(!processed.has(index)) {
      frontier.push({index,sector:current.sector,distance:current.distance+distance});
    }
  }
  triangles.forEach((triangle,index)=>regions[triangleOwners[index]].push(triangle));
  const boundaries = Object.fromEntries(Object.keys(SECTOR_MARKERS).map(sector => [sector,[]]));
  for (const owners of edges.values()) {
    const sectors = [...new Set(owners.map(owner=>triangleOwners[owner.triangleIndex]))];
    if (sectors.length > 1 || owners.length === 1) for (const sector of sectors) {
      const edge = owners.find(owner=>triangleOwners[owner.triangleIndex]===sector);
      boundaries[sector].push([edge.from,edge.to]);
    }
  }
  return {regions,boundaries,markers:SECTOR_MARKERS};
}

function edgeListDistance(edges, x, y) {
  return Math.min(...edges.map(([[x1,y1],[x2,y2]]) => {
    const ratio = Math.max(0,Math.min(1,((x-x1)*(x2-x1)+(y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2)));
    return Math.hypot(x-(x1+ratio*(x2-x1)),y-(y1+ratio*(y2-y1)));
  }));
}

function pointsInRegion(polygons, edges, count, clearance, markers) {
  if (!count) return [];
  const xs = polygons.flat().map(([x]) => x), ys = polygons.flat().map(([,y]) => y);
  const area = polygons.reduce((sum,polygon)=>sum+Math.abs(polygon.reduce((value,[x,y],index)=>{
    const [nx,ny]=polygon[(index+1)%polygon.length]; return value+x*ny-nx*y;
  },0))/2,0);
  let step = Math.min(1.1, Math.sqrt(area / (2 * count)) * .62);
  let candidates = [];
  for (let attempt = 0; attempt < 10; attempt++, step *= .75) {
    const minimumClearance = attempt < 6 ? clearance : Math.max(.12, clearance * .75 ** (attempt - 5));
    candidates = [];
    for (let y = Math.min(...ys) + step / 2; y < Math.max(...ys); y += step) {
      for (let x = Math.min(...xs) + step / 2; x < Math.max(...xs); x += step) {
        if (polygons.some(polygon=>containsPoint(polygon,x,y)) && edgeListDistance(edges,x,y)>=minimumClearance && markers.every(([markerX,markerY])=>Math.hypot(x-markerX,y-markerY)>2.5)) candidates.push({x,y});
      }
    }
    if (candidates.length >= count) break;
  }
  return Array.from({length: count}, (_, index) => candidates[Math.floor((index + .5) * candidates.length / count)]);
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

function symbol(id, x, y, state, scale = 1) {
  const stateClass = { S: "s", E: "e", I: "i", R: "r", V: "vol" };
  const common = { class: `node-${stateClass[state] || "s"}`,
    "data-node-id": id,
    role: "img" };
  let node;
  if (state === "E") node = svgNode("rect", { ...common, x: x - .5 * scale, y: y - .5 * scale, width: scale, height: scale });
  else if (state === "I") node = svgNode("polygon", { ...common,
    points: `${x},${y - .8 * scale} ${x - .7 * scale},${y + .6 * scale} ${x + .7 * scale},${y + .6 * scale}` });
  else if (state === "V") {
    const vertices = Array.from({ length: 10 }, (_, i) => {
      const angle = -Math.PI / 2 + i * Math.PI / 5;
      const radius = (i % 2 ? .36 : .85) * scale;
      return `${x + radius * Math.cos(angle)},${y + radius * Math.sin(angle)}`;
    });
    node = svgNode("polygon", { ...common, points: vertices.join(" ") });
  } else node = svgNode("circle", { ...common, cx: x, cy: y, r: .48 * scale });
  const names = { S: "susceptible", E: "expuesto", I: "infeccioso", R: "recuperado", V: "recuperado, brigadista" };
  node.setAttribute("aria-label", `Nodo ${id}: ${names[state] || names.S}`);
  return node;
}

function paintPoint(point, state) {
  if (point.visualState === state && (point.group.children?.length || point.group.childNodes?.length)) return;
  point.visualState = state;
  point.group.replaceChildren(symbol(point.id, point.x, point.y, state, point.scale));
  if (state === "R") {
    point.group.appendChild(svgNode("line", { x1: point.x - .3 * point.scale, y1: point.y - .3 * point.scale,
      x2: point.x + .3 * point.scale, y2: point.y + .3 * point.scale, class: "mark" }));
    point.group.appendChild(svgNode("line", { x1: point.x + .3 * point.scale, y1: point.y - .3 * point.scale,
      x2: point.x - .3 * point.scale, y2: point.y + .3 * point.scale, class: "mark" }));
  }
  const title = svgNode("title");
  title.textContent = `${point.label || `Nodo ${point.id}`} · ${state === "V" ? "Brigadista" : state}`;
  point.group.appendChild(title);
}

function stop() {
  clearTimeout(playback);
  playback = null;
  const available = Boolean(lastSimulation);
  field("play").disabled = !available;
  field("pause").disabled = true;
  field("restart").disabled = !available;
  const ended = available && currentDay >= (frames.at(-1)?.day ?? 0);
  field("stop").disabled = !available;
  field("play").textContent = "▶";
  field("play").setAttribute("aria-label", ended ? "Repetir animación" : "Reproducir animación");
  field("play").setAttribute("title", ended ? "Repetir desde el día cero" : "Reproducir animación");
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
    chartCursor.setAttribute("opacity", lastSimulation ? "1" : "0");
  }
}

function seek(day) {
  stop();
  field("report").hidden=true;
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
  if (!frame) { stop(); finishPlayback(); return; }
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
  else { stop(); finishPlayback(); }
}

function finishPlayback() {
  if (!lastSimulation || simulationBusy || lastSimulationId !== requestId) return;
  field("report").hidden=false;
  field("report").open=true;
}

function startPlayback() {
  if (!lastSimulation || simulationBusy) return;
  stop();
  if (currentDay >= (frames.at(-1)?.day ?? 0)) seek(0);
  field("report").hidden=true;
  field("play").disabled = false;
  field("play").textContent="Ⅱ";
  field("play").setAttribute("aria-label","Pausar animación");
  field("pause").disabled = false;
  field("playback-status").textContent = "Reproduciendo";
  field("playback-status").setAttribute("data-playing", "true");
  playback = setTimeout(nextFrame, Number(field("speed").value));
}
field("play").addEventListener("click", () => playback !== null ? stop() : startPlayback());
field("pause").addEventListener("click", stop);
field("stop").addEventListener("click", () => seek(0));
field("restart").addEventListener("click", () => {seek(0); startPlayback();});
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
  frames = Array.isArray(data.frames) ? data.frames : data.strategies.proposed.days.slice(1).map(row=>({day:row.day,changed:[]}));
  points = new Map();
  modifiedPoints.clear();
  resetMapView();
  const map = field("map");
  map.replaceChildren(territoryShape);
  const graph = data.graph;
  field("map-empty").hidden = Boolean(graph?.nodes?.length);
  if (!graph || !Array.isArray(graph.nodes) || !graph.nodes.length) {
    field("map-status").textContent = data.meta?.animation_warning ? "La red es demasiado densa para la vista detallada; las curvas y métricas están completas." : "Red territorial no disponible en esta respuesta; las curvas y métricas siguen visibles.";
  } else {
    const {regions,boundaries,markers} = sectorPolygons();
    const centers = markers;
    const present = new Set(graph.nodes.map(node => node.sector));
    for (const sector of SECTORS) {
      map.appendChild(svgNode("path", {d:regions[sector].map(polygonPath).join(" "), class:"sector-region", "data-sector":sector}));
    }
    for (const sector of SECTORS) if (present.has(sector)) {
      const [x,y] = centers[sector];
      map.appendChild(svgNode("circle", {cx:x,cy:y,r:1.4,class:"sector-halo"}));
    }
    const layoutNodes = graph.nodes.map(point => ({ ...point }));
    for (const sector of SECTORS) {
      const members = layoutNodes.filter(point => point.sector === sector);
      if (!members.length) continue;
      const region = regions[sector];
      const area = region.reduce((sum,polygon)=>sum+Math.abs(polygon.reduce((value,[x,y],index)=>{
        const [nx,ny]=polygon[(index+1)%polygon.length]; return value+x*ny-nx*y;
      },0))/2,0);
      const scale = Math.max(.14, Math.min(.35, Math.sqrt(area / Math.max(1, members.length)) * .12));
      const positions = pointsInRegion(region, boundaries[sector], members.length, scale * .85 + .15, Object.values(centers));
      members.forEach((point, index) => {
        point.displayX = positions[index].x;
        point.displayY = positions[index].y;
        point.displayScale = scale;
      });
    }
    const byId = new Map(layoutNodes.map(point => [point.id, point]));
    for (const edge of graph.edges || []) {
      const [source, target] = edge;
      const from = byId.get(source);
      const to = byId.get(target);
      if (from && to) {
        const isBridge = from.sector && to.sector && from.sector !== to.sector;
        map.appendChild(svgNode("line", {
          x1: from.displayX ?? from.x, y1: from.displayY ?? from.y,
          x2: to.displayX ?? to.x, y2: to.displayY ?? to.y,
          class: isBridge ? "edge edge-bridge" : "edge edge-internal",
          "data-bridge": isBridge ? "true" : "false",
        }));
      }
    }
    for (const { id, x, y, displayX, displayY, displayScale, state, sector, label: nodeLabel } of layoutNodes) {
      const group = svgNode("g", {class:"node-group", "data-sector":sector, "data-x":displayX ?? x, "data-y":displayY ?? y, "data-scale":displayScale ?? 1});
      const point = { id, x: displayX ?? x, y: displayY ?? y, scale: displayScale ?? 1, state, sector, group, label: nodeLabel };
      points.set(id, point);
      paintPoint(point, state);
      map.appendChild(group);
    }
    for (const sector of SECTORS) {
      map.appendChild(svgNode("path", {d:boundaries[sector].map(([[x1,y1],[x2,y2]])=>`M${x1} ${y1} L${x2} ${y2}`).join(" "), class:"sector-boundary", "data-sector":sector}));
    }
    for (const sector of SECTORS) {
      const [x,y] = centers[sector];
      const text = svgNode("text", {x,y,"text-anchor":"middle",class:"sector-number","data-sector":sector});
      text.textContent = SECTOR_NUMBERS[sector];
      map.appendChild(text);
    }
    field("map-status").textContent = `Red territorial: ${points.size} nodos.`;
  }
  field("play").disabled = field("pause").disabled = field("timeline").disabled = !frames.length;
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
    (data.meta.external_import ? `Importación externa: un caso I el día ${data.meta.external_import.day}; el día 0 no incluye ese caso. ` : "") +
    `Dosis gastadas: ${metric.doses_spent}. Brigadistas activos: ${metric.active_volunteers ?? 0}; ` +
    `reinfecciones ocupacionales: ${metric.volunteer_reinfections ?? 0}. ` + DISCLAIMER;
}

function show(data, body) {
  lastSimulation = data;
  lastAggregate = null;
  field("aggregate-report").textContent="";
  lastPayload = body;
  lastSimulationId = requestId;
  drawCurves(data);
  drawMap(data);
  metrics(data);
  field("error").hidden = true;
  field("results-context").textContent = `Balance final · ${data.meta.days} días · semilla ${body?.seed ?? data.meta.seed ?? "—"}`;
  appStatus("Escenario actualizado");
  field("run-batch").disabled = batchBusy;
  for (const strategy of ["proposed", "random", "none"]) field(`strategy-${strategy}`).disabled = false;
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
    lastAggregate = data;
    drawCurves({ strategies, range: data.series.proposed });
    aggregateReport(data);
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
  const infectious = SECTORS.reduce((sum,sector)=>sum+value(`initial-${sector}`),0);
  for (const [key,count] of Object.entries({s:n-infectious,e:0,i:infectious,r:0})) field(`count-${key}`).value=String(count);
  field("incubation-days").value=String(1/value("sigma"));
  syncDraft();
  field("scenario-note").textContent = `Parámetros al azar listos · semilla ${seed} · ${n} personas · ${active.length} ${active.length===1?"foco":"focos"}. Acepta el borrador y luego ejecuta la simulación.`;
  appStatus("Borrador al azar listo · acepta para utilizarlo");
});

for (const strategy of ["proposed", "random", "none"]) field(`strategy-${strategy}`).disabled = true;
for (const strategy of ["proposed", "random", "none"]) {
  field(`strategy-${strategy}`).addEventListener("click", () => {
    if (!lastPayload) return;
    const base = lastPayload;
    const selected = JSON.parse(JSON.stringify(base));
    if (strategy === "none") {
      selected.intervention.k_max = 0;
      selected.intervention.quota = 0;
    }
    openScenario(selected);
    field("scenario-note").textContent = strategy === "random"
      ? "Asignación al azar cambia cómo se reparten las dosis; no es un escenario aleatorio. Se cargaron las condiciones de la última simulación."
      : strategy === "none"
        ? "Se cargaron las mismas condiciones de la última simulación, sin dosis. Acepta el borrador y ejecuta para actualizar el resultado."
        : "Se cargaron las condiciones de la propuesta en la última simulación. Acepta el borrador y ejecuta para actualizar el resultado.";
    const layout = document.querySelector(".layout");
    layout.setAttribute("data-controls-open", "true");
    field("sidebar-toggle").setAttribute("aria-expanded", "true");
    field("sidebar-toggle").setAttribute("aria-label", "Ocultar parámetros");
    field("parameter-fields").setAttribute("data-open", "true");
    field("toggle-parameters").setAttribute("aria-expanded", "true");
    field("toggle-parameters").textContent = "Ocultar parámetros";
    appStatus("Parámetros cargados · genera para actualizar");
  });
}

field("sidebar-toggle").addEventListener("click", () => {
  const layout = document.querySelector(".layout");
  const open = layout.getAttribute("data-controls-open") !== "false";
  layout.setAttribute("data-controls-open", String(!open));
  field("sidebar-toggle").setAttribute("aria-expanded", String(!open));
  field("sidebar-toggle").setAttribute("aria-label", open ? "Mostrar parámetros" : "Ocultar parámetros");
  if (!open) {
    field("parameter-fields").setAttribute("data-open", "true");
    field("toggle-parameters").setAttribute("aria-expanded", "true");
    field("toggle-parameters").textContent = "Ocultar parámetros";
    document.querySelectorAll(".control-details").forEach(details => details.setAttribute("open", ""));
  }
});
field("toggle-parameters").addEventListener("click", () => {
  const open = field("parameter-fields").getAttribute("data-open") !== "true";
  field("parameter-fields").setAttribute("data-open", String(open));
  field("toggle-parameters").setAttribute("aria-expanded", String(open));
  field("toggle-parameters").textContent = open ? "Ocultar parámetros" : "Ver parámetros";
  if (open) document.querySelectorAll(".control-details").forEach(details => details.setAttribute("open", ""));
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
const filterConnections = field("filter-connections");
if (filterConnections) filterConnections.addEventListener("change", () => {
  field("map").setAttribute("data-show-connections", String(filterConnections.checked));
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

function aggregateReport(data) {
  const container=field("aggregate-report");
  container.replaceChildren();
  const heading=document.createElement("h3");
  heading.textContent=`Agregado independiente · ${data.replicas} réplicas (medias y rango empírico p2.5–p97.5)`;
  container.appendChild(heading);
  for (const [key,name] of [["proposed","Propuesta"],["random","Al azar"],["none","Sin intervención"]]) {
    const summary=data.strategies[key];
    if (!summary) continue;
    const paragraph=document.createElement("p");
    paragraph.textContent=name+": "+[["avoided_infections","contagios evitados"],["peak_i","pico I"],["doses_spent","dosis"]].map(([metric,label])=>{
      const result=summary[metric];
      return result ? `${label}: media ${result.mean.toFixed(2)}, rango ${result.p2_5.toFixed(2)}–${result.p97_5.toFixed(2)}` : `${label}: no disponible`;
    }).join("; ")+". El mapa, las tarjetas y el informe anterior pertenecen a una sola semilla, no a estas medias.";
    container.appendChild(paragraph);
  }
}
