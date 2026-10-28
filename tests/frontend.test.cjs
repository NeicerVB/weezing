const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '../src/seir/static');

class Element {
  constructor(tag = 'div', attrs = {}) {
    this.tagName = tag;
    this.attrs = { ...attrs };
    this.children = [];
    this.listeners = {};
    this.value = attrs.value ?? '';
    this.checked = 'checked' in attrs;
    this.hidden = 'hidden' in attrs;
    this.disabled = 'disabled' in attrs;
    this.textContent = '';
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  appendChild(child) { this.children.push(child); return child; }
  replaceChildren(...children) { this.children = children; this.textContent = ''; }
  addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); }
  fire(name, data = {}) { for (const fn of this.listeners[name] ?? []) fn({ preventDefault() {}, ...data }); }
  showModal() { this.open = true; }
  close() { this.open = false; this.fire('close'); }
  focus() { this.focused = true; }
  checkValidity() { return true; }
}

function setup(fetchImpl = async () => response(fixture())) {
  assert.ok(fs.existsSync(path.join(root, 'app.js')), 'Falta el controlador territorial');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const elements = {};
  const details = [];
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
    elements[match[3]] = new Element(match[1], attrs);
    if (match[1] === 'select') {
      const firstOption = html.slice(match.index + match[0].length).match(/<option value="([^"]+)"/);
      elements[match[3]].value = firstOption?.[1] ?? '';
    }
  }
  for (const match of html.matchAll(/<details\b([^>]*)>/g)) {
    const attrs = Object.fromEntries([...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
    details.push(new Element('details', attrs));
  }
  const document = {
    listeners: {},
    addEventListener(name, fn) { (this.listeners[name] ??= []).push(fn); },
    fire(name) { for (const fn of this.listeners[name] ?? []) fn(); },
    getElementById: (id) => elements[id],
    querySelector: (selector) => selector === ".layout" ? elements.layout : null,
    querySelectorAll: (selector) => selector === ".control-details" ? details : [],
    createElementNS: (_, tag) => new Element(tag),
    createElement: (tag) => new Element(tag),
  };
  let now = 0;
  let sequence = 0;
  const timers = new Map();
  const setTimeout = (fn, delay) => { const id = ++sequence; timers.set(id, { at: now + delay, fn }); return id; };
  const clearTimeout = (id) => timers.delete(id);
  const tick = (ms) => {
    now += ms;
    for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
  };
  const context = vm.createContext({ document, fetch: fetchImpl, setTimeout, clearTimeout, console });
  vm.runInContext(fs.readFileSync(path.join(root, 'scenario.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, { filename: 'app.js' });
  return { elements, tick, document, details };
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

test('no inicia una simulación al cargar y espera una acción explícita', async () => {
  let release;
  let sent = 0;
  const { elements: el, document } = setup((url, options) => {
    sent += 1;
    return new Promise(resolve => { release = resolve; });
  });
  document.fire('DOMContentLoaded');
  await flush();
  assert.equal(sent, 0);
  assert.equal(el['map-empty'].hidden, false);
  el.simulate.fire('click');
  await flush();
  assert.equal(sent, 1);
  assert.equal(el.simulate.disabled, true);
  assert.match(el.simulate.textContent, /generando/i);
  assert.equal(el['map-loading'].hidden, false);
  assert.equal(el.workspace.getAttribute('aria-busy'), 'true');
  release(response(fixture()));
  await flush();
  assert.equal(el['map-loading'].hidden, true);
  assert.equal(el.simulate.disabled, false);
  assert.equal(el.workspace.getAttribute('aria-busy'), 'false');
});

test('los cambios durante una petición obsoleta no dejan la pantalla bloqueada', async () => {
  const pending = [];
  const { elements: el } = setup(() => new Promise(resolve => pending.push(resolve)));
  el.simulate.fire('click'); await flush();
  el.beta.value = '0.2';
  el.controls.fire('input');
  pending[0](response(fixture()));
  await flush();
  assert.equal(el.simulate.disabled, false);
  assert.equal(el['map-loading'].hidden, true);
  assert.equal(el.workspace.getAttribute('aria-busy'), 'false');
});

test('un error retira la carga, conserva resultados previos y permite reintentar', async () => {
  let fail = false;
  const { elements: el } = setup(async () => fail ? response({error:'Servidor ocupado'},429,'2') : response(fixture()));
  el.simulate.fire('click');
  await flush();
  fail = true;
  el.simulate.fire('click');
  await flush();
  assert.equal(el.r0.textContent, '2.40');
  assert.equal(el['map-loading'].hidden, true);
  assert.equal(el.simulate.disabled, false);
  assert.equal(el['app-status'].getAttribute('data-state'), 'error');
  assert.match(el.error.textContent, /ocupado/);
});

test('el dado cambia parámetros sin ejecutar una simulación automáticamente', async () => {
  const sent=[];
  const { elements: el } = setup(async (url,options) => { sent.push(JSON.parse(options.body)); return response(fixture()); });
  let previousSeed=Number(el.seed.value);
  assert.ok(el.randomize, 'Falta el botón dado');
  for(let roll=0; roll<20; roll++) {
    el.randomize.fire('click');
    await flush();
    assert.equal(sent.length, 0);
    const seed=Number(el.seed.value);
    assert.notEqual(seed,previousSeed);
    previousSeed=seed;
    const n=Number(el.n.value);
    assert.ok(n>=7 && n<=2000);
    assert.ok(Number(el.days.value)>=1 && Number(el.days.value)<=90);
    assert.ok(Number(el.beta.value)>0 && Number(el.beta.value)<=1);
    assert.ok(Number(el.k_max.value)<=Math.floor(.4*n));
    const initial=Object.fromEntries(['tarqui','eloy_alfaro','los_esteros','manta_centro','murcielago','barbasquillo','san_mateo'].map(sector => [sector,Number(el[`initial-${sector}`].value)]));
    assert.ok(Object.values(initial).reduce((a,b)=>a+b,0)>0);
    for(const [sector,count] of Object.entries(initial)) {
      const index=['tarqui','eloy_alfaro','los_esteros','manta_centro','murcielago','barbasquillo','san_mateo'].indexOf(sector);
      assert.ok(count<=Math.floor(n/7)+(index<n%7?1:0));
    }
  }
  assert.match(el['scenario-note'].textContent,/semilla/i);
});

test('la red espera inicio explícito y sincroniza día y balance; pausa y reinicio funcionan', async () => {
  const data=fixture();
  data.graph={nodes:[{id:0,x:10,y:20,state:'S'},{id:1,x:30,y:40,state:'I'}],edges:[[0,1]]};
  data.frames=[{day:1,changed:[{id:0,state:'E'}]}];
  data.strategies.proposed.days=[{day:0,s:1,e:0,i:1,r:0},{day:1,s:0,e:1,i:1,r:0}];
  const {elements:el,tick}=setup(async()=>response(data));
  assert.equal(descendants(el.map).filter(child => child.attrs.class === 'territory-shape').length, 1);
  el.simulate.fire('click'); await flush();
  tick(250);
  assert.equal(el.day.textContent,'Día 0');
  assert.equal(descendants(el.map).filter(child => child.attrs.class === 'territory-shape').length, 1,
    'La silueta ilustrativa permanece al renderizar la red.');
  assert.equal(el.play.textContent, '▶');
  assert.equal(el.play.getAttribute('aria-label'), 'Reproducir animación');
  assert.equal(el.play.getAttribute('title'), 'Reproducir animación');
  el.play.fire('click');
  tick(250);
  assert.equal(el.day.textContent,'Día 1');
  assert.equal(el.play.textContent, '▶');
  assert.equal(el.play.getAttribute('aria-label'), 'Repetir animación');
  assert.equal(el.play.getAttribute('title'), 'Repetir desde el día cero');
  assert.equal(el['map-count-e'].textContent,'1');
  el.restart.fire('click');
  assert.equal(el.day.textContent,'Día 0');
  assert.equal(el['map-count-s'].textContent,'1');
  el.play.fire('click'); el.pause.fire('click'); tick(500);
  assert.equal(el.day.textContent,'Día 0');
});

test('solicita Monte Carlo explícito y dibuja medias con rango empírico real', async () => {
  const requests = [];
  const { elements: el } = setup(async (url, options) => {
    requests.push({ url, body: JSON.parse(options.body) });
    if (url === '/api/simulate') return response(fixture());
    return response({ replicas: 30, series: {
      proposed: { mean: [2,4], p2_5: [2,1], p97_5: [2,6] },
      random: { mean: [2,5], p2_5: [2,3], p97_5: [2,8] },
      none: { mean: [2,7], p2_5: [2,5], p97_5: [2,10] },
    }, strategies: {} });
  });
  assert.ok(el['run-batch'], 'Falta el control Monte Carlo');
  el.simulate.fire('click');
  await flush();
  el['run-batch'].fire('click');
  await flush();
  assert.equal(requests[1].url, '/api/batch');
  assert.equal(requests[1].body.replicas, 30);
  assert.equal(requests[1].body.include_series, true);
  assert.equal(descendants(el.curve).filter(item => item.tagName === 'polygon').length, 1);
  assert.match(el['monte-carlo-status'].textContent, /30/);
  assert.match(el['monte-carlo-status'].textContent, /media/i);
});

test('mantiene Monte Carlo ocupado hasta que termine el lote anterior al cambiar parámetros', async () => {
  let releaseBatch;
  let releaseNew;
  let simulations = 0;
  const { elements: el, tick } = setup((url) => {
    if (url === '/api/batch') return new Promise(resolve => { releaseBatch = resolve; });
    simulations += 1;
    if (simulations === 1) return Promise.resolve(response(fixture()));
    return new Promise(resolve => { releaseNew = resolve; });
  });
  el.simulate.fire('click');
  await flush();
  el['run-batch'].fire('click');
  el.seed.value = '43';
  el.controls.fire('input');
  tick(150);
  el.simulate.fire('click');
  releaseNew(response(fixture()));
  await flush();
  assert.equal(el['run-batch'].disabled, true);
  releaseBatch(response({})); // Ya obsoleto: no se deben leer sus series.
  await flush();
  assert.equal(el['run-batch'].disabled, false);
  assert.equal(descendants(el.curve).filter(item => item.tagName === 'polygon').length, 0);
});

test('ajusta stock y grado válidos cuando cambia la población del Brote Sorpresa', () => {
  const { elements: el } = setup();
  el['count-s'].value = '0'; el['count-i'].value = '7';
  el.controls.fire('input');
  assert.equal(Number(el.k_max.value), 2);
  assert.equal(el.k_max.getAttribute('max'), '2');
  assert.equal(Number(el.degree.value), 6);
  assert.equal(el.degree.getAttribute('max'), '6');
  assert.equal(Number(el['initial-tarqui'].value), 5, 'No cambia silenciosamente los focos del borrador');
  assert.equal(Number(el['initial-los_esteros'].value), 2);
});

test('numera las siete regiones y la leyenda conserva el mapeo legible', async () => {
  const mapping = [
    ['san_mateo', '1', 'San Mateo'], ['murcielago', '2', 'Murciélago'],
    ['manta_centro', '3', 'Manta Centro'], ['tarqui', '4', 'Tarqui'],
    ['los_esteros', '5', 'Los Esteros'], ['eloy_alfaro', '6', 'Eloy Alfaro'],
    ['barbasquillo', '7', 'Barbasquillo'],
  ];
  const data = fixture();
  data.graph = {nodes:mapping.map(([sector], id)=>({id,x:50,y:50,state:'S',sector})),edges:[]};
  const { elements: el } = setup(async () => response(data));
  el.simulate.fire('click'); await flush();
  assert.equal(el.error.hidden, true, `La respuesta de prueba no debe fallar: ${el.error.textContent}`);
  const labels = Object.fromEntries(el.map.children.filter(node => node.attrs.class === 'sector-number')
    .map(node => [node.attrs['data-sector'], node.textContent]));
  assert.deepEqual(labels, Object.fromEntries(mapping.map(([sector, number]) => [sector, number])));
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const entries = [...html.matchAll(/<li data-sector="([^"]+)" data-number="([^"]+)">([^<]+)<\/li>/g)]
    .map(([, sector, number, name]) => [sector, number, name]);
  assert.deepEqual(entries, mapping);
});

test('los siete polígonos cubren el contorno sin solaparse y contienen nodos estables a N=1000 y N=2000', async () => {
  const sectors = ['tarqui', 'eloy_alfaro', 'los_esteros', 'manta_centro', 'murcielago', 'barbasquillo', 'san_mateo'];
  const parsePath = path => [...path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(match => [Number(match[1]), Number(match[2])]);
  const parseSubpaths = path => path.split(/(?=M)/).filter(Boolean).map(parsePath);
  const parseSegments = path => {
    const points = parsePath(path);
    return Array.from({length:Math.floor(points.length/2)},(_,index)=>[points[index*2],points[index*2+1]]);
  };
  const inside = (polygon, x, y) => polygon.reduce((value, [xi,yi], index) => {
    const [xj,yj] = polygon[(index + polygon.length - 1) % polygon.length];
    return ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ? !value : value;
  }, false);
  const edgeDistance = (edges, x, y) => Math.min(...edges.map(([[x1,y1],[x2,y2]]) => {
    const ratio = Math.max(0, Math.min(1, ((x-x1)*(x2-x1)+(y-y1)*(y2-y1))/((x2-x1)**2+(y2-y1)**2)));
    return Math.hypot(x-(x1+ratio*(x2-x1)),y-(y1+ratio*(y2-y1)));
  }));
  let prior = null;
  for (const total of [1000, 2000]) {
    const data = fixture();
    data.graph = { nodes: Array.from({ length: total }, (_, id) => ({ id, sector: sectors[id % 7], x: 0, y: 0, state: 'V' })), edges: [] };
    const { elements: el } = setup(async () => response(data));
    el.simulate.fire('click'); await flush();
    const svg = descendants(el.map);
    const outline = parsePath(svg.find(item => item.attrs.class === 'territory-shape').attrs.d);
    const regions = Object.fromEntries(svg.filter(item => item.attrs.class === 'sector-region')
      .map(item => [item.attrs['data-sector'], parseSubpaths(item.attrs.d)]));
    const boundaries = Object.fromEntries(svg.filter(item => item.attrs.class === 'sector-boundary')
      .map(item => [item.attrs['data-sector'], parseSegments(item.attrs.d)]));
    assert.equal(Object.keys(regions).length, 7, 'Cada sector conserva un polígono SVG propio');
    const owners = (x, y) => Object.values(regions).filter(parts => parts.some(polygon => inside(polygon, x, y))).length;
    if (total === 1000) {
      assert.equal(inside(outline, 49.807, 20.733), false, 'La muestra crítica está fuera del contorno');
      assert.equal(owners(49.807, 20.733), 0, 'El sector no debe extenderse fuera de la silueta');
      for (let y = 15.37; y < 85; y += 1.13) for (let x = .31; x < 100; x += 1.17) {
        assert.equal(owners(x, y), inside(outline, x, y) ? 1 : 0,
          `(${x}, ${y}) debe tener un dueño solo dentro del territorio`);
      }
    }
    const nodes = svg.filter(item => item.tagName === 'g');
    assert.equal(nodes.length, total);
    const first = nodes.map(node => [Number(node.attrs['data-x']), Number(node.attrs['data-y']), node.attrs['data-sector'], Number(node.attrs['data-scale'])]);
    assert.equal(new Set(first.map(([x,y]) => `${x},${y}`)).size, total, 'No empty or duplicated node positions');
    for (const [x,y,sector,scale] of first) {
      const region = regions[sector];
      assert.ok(inside(outline, x, y), `${sector} center (${x}, ${y}) must remain inside the territory outline`);
      assert.ok(region.some(polygon=>inside(polygon,x,y)), `${sector} center must belong to its region`);
      assert.equal(Object.values(regions).filter(parts=>parts.some(polygon=>inside(polygon,x,y))).length, 1, 'Displayed centers have unique ownership');
      assert.ok(edgeDistance(boundaries[sector], x, y) >= .85 * scale + .14, 'Every symbol stroke must clear its cell and outline boundaries');
      const node = nodes.find(item => Number(item.attrs['data-x']) === x && Number(item.attrs['data-y']) === y);
      const vertices = node.children[0].attrs.points.split(/\s+/).map(pair => pair.split(',').map(Number));
      assert.ok(vertices.every(([vx,vy]) => region.some(polygon=>inside(polygon,vx,vy)) && edgeDistance(boundaries[sector],vx,vy) >= .14), 'Every star vertex remains in its region with half-stroke clearance');
    }
    const { elements: again } = setup(async () => response(data));
    again.simulate.fire('click'); await flush();
    assert.deepEqual(descendants(again.map).filter(item => item.tagName === 'g').map(node => [Number(node.attrs['data-x']), Number(node.attrs['data-y'])]), first.map(([x,y]) => [x,y]),
      `Las posiciones se repiten de forma estable a N=${total}`);
    if (total === 1000) prior = first;
    else assert.equal(prior.length, 1000);
  }
});

test('cada sector es continuo y conserva la ubicación indicada por el croquis', async () => {
  const ordered = ['san_mateo','barbasquillo','murcielago','manta_centro','tarqui','los_esteros','eloy_alfaro'];
  const normalizedAnchors = {
    san_mateo:[13,28], barbasquillo:[29,27], murcielago:[46,24], manta_centro:[44,43],
    tarqui:[58,37], los_esteros:[75,35], eloy_alfaro:[73,63],
  };
  const data = fixture();
  data.graph = {nodes:ordered.map((sector,id)=>({id,x:50,y:50,state:'S',sector})),edges:[]};
  const {elements:el}=setup(async()=>response(data));
  el.simulate.fire('click'); await flush();
  const parsePath = path => [...path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(match=>[Number(match[1]),Number(match[2])]);
  const regions=Object.fromEntries(el.map.children.filter(node=>node.attrs.class==='sector-region')
    .map(node=>[node.attrs['data-sector'],node.attrs.d.split(/(?=M)/).filter(Boolean).map(parsePath)]));
  const inside=(polygon,x,y)=>polygon.reduce((value,[xi,yi],index)=>{
    const [xj,yj]=polygon[(index+polygon.length-1)%polygon.length];
    return ((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)?!value:value;
  },false);
  const edgeKey=(a,b)=>[a.join(','),b.join(',')].sort().join('|');
  const disconnected=[];
  const misplaced=[];
  for(const sector of ordered){
    const triangles=regions[sector];
    const edgeOwners=new Map();
    triangles.forEach((polygon,index)=>polygon.forEach((point,edge)=>{
      const key=edgeKey(point,polygon[(edge+1)%polygon.length]);
      (edgeOwners.get(key)??edgeOwners.set(key,[]).get(key)).push(index);
    }));
    const adjacent=Array.from({length:triangles.length},()=>new Set());
    for(const owners of edgeOwners.values()) if(owners.length===2){adjacent[owners[0]].add(owners[1]);adjacent[owners[1]].add(owners[0]);}
    let reached=new Set([0]), queue=[0];
    while(queue.length){for(const next of adjacent[queue.shift()])if(!reached.has(next)){reached.add(next);queue.push(next);}}
    if(reached.size!==triangles.length)disconnected.push(`${sector}: ${triangles.length-reached.size} triangle islands unreachable`);
    const [x,normalizedY]=normalizedAnchors[sector], y=15+normalizedY*.7;
    if(!triangles.some(polygon=>inside(polygon,x,y)))misplaced.push(sector);
  }
  assert.deepEqual(misplaced,[],`Sketch anchors owned by the wrong sectors: ${misplaced.join(', ')}`);
  assert.deepEqual(disconnected,[],`Disconnected sectors: ${disconnected.join('; ')}`);
});

test('los marcadores numéricos conservan separación entre sí y de nodos densos en cada sector', async () => {
  const sectors=['tarqui','eloy_alfaro','los_esteros','manta_centro','murcielago','barbasquillo','san_mateo'];
  const data=fixture();
  data.graph={nodes:sectors.flatMap((sector,index)=>Array.from({length:286},(_,copy)=>({id:index*286+copy,x:50,y:50,state:'S',sector}))),edges:[]};
  const {elements:el}=setup(async()=>response(data));
  el.simulate.fire('click'); await flush();
  const markers=el.map.children.filter(node=>node.attrs.class==='sector-number').map(node=>({sector:node.attrs['data-sector'],x:Number(node.attrs.x),y:Number(node.attrs.y)}));
  const nodes=el.map.children.filter(node=>node.attrs.class==='node-group').map(node=>({sector:node.attrs['data-sector'],x:Number(node.attrs['data-x']),y:Number(node.attrs['data-y'])}));
  assert.equal(markers.length,7);
  assert.equal(nodes.length,2002);
  for(let i=0;i<markers.length;i++){
    for(let j=i+1;j<markers.length;j++) assert.ok(Math.hypot(markers[i].x-markers[j].x,markers[i].y-markers[j].y)>2.5,
      `Markers ${markers[i].sector} and ${markers[j].sector} must not collide`);
    for(const node of nodes) assert.ok(Math.hypot(markers[i].x-node.x,markers[i].y-node.y)>2.5,
      `Marker ${markers[i].sector} must clear node ${node.sector}`);
  }
});

test('abre todos los controles y sitúa el balance diario dentro del mapa', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="parameter-fields" class="parameter-fields" data-open="true"/);
  assert.match(html, /<details class="control-details" open>/g);
  assert.ok(html.indexOf('class="day-balance"') > html.indexOf('id="map"') &&
    html.indexOf('class="day-balance"') < html.indexOf('class="playback"'));
  assert.match(html, /informe final aparece al completar la reproducción/i);
  const { elements: el, details } = setup();
  delete details[0].attrs.open;
  delete details[1].attrs.open;
  el['sidebar-toggle'].fire('click');
  el['sidebar-toggle'].fire('click');
  assert.equal(el['sidebar-toggle'].getAttribute('aria-expanded'), 'true');
  assert.ok(details.every(group => group.getAttribute('open') !== null));
});

function fixture() {
  const proposed = {
    days: [{ day: 0, i: 2 }, { day: 1, i: 3 }],
    metrics: { avoided_infections: 6, cumulative_infections: 7, doses_spent: 4, peak_i: 3,
      peak_day: 1, active_volunteers: 1, volunteer_reinfections: 0 },
  };
  return {
    meta: { n: 1000, days: 1, r0: 2.4 },
    strategies: {
      proposed,
      random: { days: [{ day: 0, i: 2 }, { day: 1, i: 5 }], metrics: { cumulative_infections: 9, peak_i: 5, doses_spent: 4 } },
      none: { days: [{ day: 0, i: 2 }, { day: 1, i: 8 }], metrics: { cumulative_infections: 13, peak_i: 8, doses_spent: 0 } },
    },
    frames: null,
  };
}

function response(data, status = 200, retryAfter = null) {
  return { ok: status < 400, status, headers: { get: () => retryAfter }, json: async () => data };
}

function descendants(element) {
  return element.children.flatMap((child) => [child, ...descendants(child)]);
}

test('serializa los parámetros y agrupa los cambios rápidos en una única petición', async () => {
  const requests = [];
  const { elements: el, tick } = setup(async (url, options) => {
    requests.push({ url, options });
    return response(fixture());
  });
  el.beta.value = '0.15';
  el.controls.fire('input');
  tick(100);
  el.beta.value = '0.17';
  el.include_frames.checked = true;
  el['initial-tarqui'].value = '9';
  el['initial-los_esteros'].value = '3';
  el['count-i'].value = '12'; el['count-s'].value = '988';
  el.controls.fire('input');
  tick(149);
  assert.equal(requests.length, 0);
  tick(500);
  await flush();
  assert.equal(requests.length, 0, 'Editar parámetros no debe ejecutar el escenario');
  el['accept-scenario'].fire('click');
  el.simulate.fire('click');
  await flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/simulate');
  assert.equal(requests[0].options.method, 'POST');
  const data = JSON.parse(requests[0].options.body);
  assert.equal(data.beta, 0.17);
  assert.deepEqual(data.initial, { tarqui: 9, los_esteros: 3 });
  assert.deepEqual(data.intervention, { mode: 'dynamic', efficacy: 0.8, delay: 0, quota: 30, k_max: 400 });
  assert.deepEqual(data.volunteers, { enlist: 0.12, reinfection: 0.04 });
  assert.equal(data.include_frames, true);
  assert.equal(data.n, 1000);
  assert.equal(data.seed, 42);
});

test('muestra el valor numérico al mover los controles deslizantes', () => {
  const { elements: el } = setup();
  el.beta.value = '0.17';
  el.efficacy.value = '0.65';
  el.controls.fire('input');
  assert.ok(el['beta-value'] && el['efficacy-value'], 'Faltan las lecturas numéricas de los sliders');
  assert.equal(el['beta-value'].textContent, '0.17');
  assert.equal(el['efficacy-value'].textContent, '0.65');
});

test('con frames nulos muestra tres curvas, indicadores, tabla e informe sin inventar un mapa', async () => {
  const { elements: el } = setup();
  el.simulate.fire('click');
  await flush();
  assert.equal(el.error.hidden, true);
  assert.equal(descendants(el.curve).filter((item) => item.tagName === 'polyline').length, 3);
  assert.equal(el.r0.textContent, '2.40');
  assert.match(el['r0-meaning'].textContent, /potencial expansivo/i);
  assert.equal(el.avoided.textContent, '6');
  assert.equal(el.doses.textContent, '4');
  assert.match(el.peak.textContent, /3.*1/);
  assert.equal(el.volunteers.textContent, '1');
  assert.equal(el['metrics-table'].children.length, 3);
  assert.match(el['report-body'].textContent, /Contagios evitados: 6/);
  assert.match(el['report-body'].textContent, /Simulación computacional ficticia/);
  assert.match(el['map-status'].textContent, /no disponible/i);
  assert.equal(el.play.disabled, false, 'Sin red, se reproduce el calendario de las curvas sin inventar nodos');
  assert.equal(el.report.hidden, true);
});

test('muestra errores 400 y 429 accesibles, con espera del servidor', async () => {
  for (const [status, error, retry] of [
    [400, 'Parámetro inválido: N', null],
    [429, 'Servidor ocupado', '2'],
  ]) {
    const { elements: el } = setup(async () => response({ error }, status, retry));
    el.simulate.fire('click');
    await flush();
    assert.equal(el.error.hidden, false);
    assert.match(el.error.textContent, new RegExp(error));
    if (status === 429) assert.match(el.error.textContent, /2 segundos/);
  }
});

test('una respuesta anterior no sobrescribe los resultados más recientes', async () => {
  const pending = [];
  const { elements: el, tick } = setup(() => new Promise((resolve) => pending.push(resolve)));
  el.simulate.fire('click');
  await flush();
  el.beta.value = '0.2';
  el.controls.fire('input');
  el.simulate.fire('click');
  await flush();
  assert.equal(pending.length, 1, 'Agrupa cambios mientras hay una simulación en curso');
  const old = fixture();
  old.meta.r0 = 9;
  pending[0](response(old));
  await flush();
  assert.equal(pending.length, 2);
  assert.notEqual(el.r0.textContent, '9.00');
  pending[1](response(fixture()));
  await flush();
  assert.equal(el.r0.textContent, '2.40');
});

test('un cambio editado no reemplaza la corrida hasta que se solicita explícitamente', async () => {
  const pending=[];
  const {elements:el,tick}=setup(()=>new Promise(resolve=>pending.push(resolve)));
  el.simulate.fire('click');
  el['open-scenario'].fire('click');
  el.beta.value='0.04'; el.controls.fire('input'); el['accept-scenario'].fire('click'); tick(150);
  assert.equal(pending.length,1);
  pending[0](response(fixture())); await flush();
  assert.equal(pending.length,1);
  assert.notEqual(el.r0.textContent,'2.40');
  el.simulate.fire('click'); await flush();
  assert.equal(pending.length,2);
  pending[1](response(fixture())); await flush();
  tick(150); await flush();
  assert.equal(pending.length,2,'No debe gastar CPU repitiendo el último escenario');
});

test('dibuja la topología opcional y aplica diffs sin perder el estado inicial al volver al día cero', async () => {
  const data = fixture();
  data.graph = { nodes: [{ id: 1, x: 20, y: 30, state: 'S' }, { id: 2, x: 70, y: 60, state: 'I' }], edges: [[1, 2]] };
  data.frames = [{ day: 1, changed: [{ id: 1, state: 'E' }, { id: 2, state: 'V' }] }];
  const { elements: el, tick } = setup(async () => response(data));
  el.include_frames.checked = true;
  el.simulate.fire('click');
  await flush();
  assert.equal(el.play.disabled, false, 'La reproducción queda disponible, pero no inicia sola');
  assert.equal(descendants(el.map).filter((child) => child.tagName === 'line').length, 1);
  let shapes = descendants(el.map).filter((child) => child.attrs['data-node-id']);
  assert.deepEqual(shapes.map((shape) => shape.tagName), ['circle', 'polygon']);
  el.play.fire('click');
  tick(250);
  shapes = descendants(el.map).filter((child) => child.attrs['data-node-id']);
  assert.deepEqual(shapes.map((shape) => shape.tagName), ['rect', 'polygon']);
  assert.equal(shapes[1].attrs.class, 'node-vol');
  el.timeline.value = '0';
  el.timeline.fire('input');
  shapes = descendants(el.map).filter((child) => child.attrs['data-node-id']);
  assert.deepEqual(shapes.map((shape) => shape.attrs.class), ['node-s', 'node-i']);
});

test('representa el rango empírico solo cuando se proporciona la serie diaria', async () => {
  const data = fixture();
  data.range = { p2_5: [2, 1], p97_5: [3, 6] };
  const { elements: el } = setup(async () => response(data));
  el.simulate.fire('click');
  await flush();
  assert.equal(descendants(el.curve).filter((item) => item.attrs.class === 'range').length, 1);
  assert.match(el['range-status'].textContent, /p2.5 - p97.5/);
});

test('no interpreta R₀ nulo como extinción cuando gamma es cero', async () => {
  const data = fixture();
  data.meta.r0 = null;
  const { elements: el } = setup(async () => response(data));
  el.simulate.fire('click');
  await flush();
  assert.equal(el.r0.textContent, '—');
  assert.match(el['r0-meaning'].textContent, /no calculable/i);
});

test('la selección de estrategia aplica valores visibles sin simular ni inventar corridas', async () => {
  const requests = [];
  const { elements: el } = setup(async (url, options) => {
    requests.push(JSON.parse(options.body));
    return response(fixture());
  });
  el.simulate.fire('click'); await flush();
  const count = requests.length;
  assert.ok(el['strategy-proposed'] && el['strategy-random'] && el['strategy-none']);
  el['strategy-random'].fire('click');
  assert.equal(Number(el.n.value), requests[0].n);
  assert.equal(Number(el.k_max.value), requests[0].intervention.k_max);
  assert.equal(requests.length, count);
  assert.match(el['scenario-note'].textContent, /asignación al azar/i);
  el['strategy-none'].fire('click');
  assert.equal(Number(el.k_max.value), 0);
  assert.match(el['scenario-note'].textContent, /sin dosis/i);
  assert.equal(requests.length, count);
});

test('el menú lateral se puede contraer y anuncia el estado accesible', () => {
  const { elements: el } = setup();
  el['sidebar-toggle'].fire('click');
  assert.equal(el.layout.getAttribute('data-controls-open'), 'false');
  assert.equal(el['sidebar-toggle'].getAttribute('aria-expanded'), 'false');
  el['sidebar-toggle'].fire('click');
  assert.equal(el.layout.getAttribute('data-controls-open'), 'true');
  assert.equal(el['sidebar-toggle'].getAttribute('aria-expanded'), 'true');
});

test('el selector del gráfico abre los parámetros y carga valores de la última corrida', async () => {
  const requests = [];
  const { elements: el } = setup(async (url, options) => {
    requests.push(JSON.parse(options.body));
    return response(fixture());
  });
  el.simulate.fire('click'); await flush();
  el['sidebar-toggle'].fire('click');
  el['strategy-none'].fire('click');
  assert.equal(el.layout.getAttribute('data-controls-open'), 'true');
  assert.equal(el['sidebar-toggle'].getAttribute('aria-expanded'), 'true');
  assert.equal(el['parameter-fields'].getAttribute('data-open'), 'true');
  assert.equal(el['toggle-parameters'].getAttribute('aria-expanded'), 'true');
  assert.equal(Number(el.k_max.value), 0);
  assert.equal(requests.length, 1);
});

test('distribuye los nodos densos sin solapar símbolos y repite sus posiciones', async () => {
  const data = fixture();
  data.graph = { nodes: Array.from({ length: 286 }, (_, id) => ({
    id, x: 50, y: 50, state: 'S', sector: 'tarqui',
  })), edges: [] };
  const { elements: el } = setup(async () => response(data));
  const getPositions = () => descendants(el.map)
    .filter(node => node.attrs['data-node-id'])
    .map(node => ({ x: Number(node.attrs.cx), y: Number(node.attrs.cy), r: Number(node.attrs.r) }));
  el.simulate.fire('click'); await flush();
  const first = getPositions();
  assert.equal(first.length, 286);
  for (let left = 0; left < first.length; left++) {
    for (let right = left + 1; right < first.length; right++) {
      const distance = Math.hypot(first[left].x - first[right].x, first[left].y - first[right].y);
      assert.ok(distance >= first[left].r + first[right].r,
        `Los nodos ${left} y ${right} se solapan a distancia ${distance}.`);
    }
  }
  el.simulate.fire('click'); await flush();
  assert.deepEqual(getPositions(), first, 'La distribución visual debe ser determinista.');
});

test('el control Mostrar conexiones entre nodos oculta solo las líneas', async () => {
  const { elements: el } = setup(async () => response(fixture()));
  const connections = el['filter-connections'];
  assert.ok(connections, 'Debe existir el control para mostrar conexiones.');
  connections.checked = false;
  connections.fire('change');
  assert.equal(el.map.getAttribute('data-show-connections'), 'false');
  connections.checked = true;
  connections.fire('change');
  assert.equal(el.map.getAttribute('data-show-connections'), 'true');
});

test('los límites de sector se dibujan encima de las conexiones', async () => {
  const data = fixture();
  data.graph = {nodes:[{id:0,x:70,y:50,state:'S',sector:'tarqui',label:'a'},{id:1,x:75,y:52,state:'I',sector:'tarqui',label:'b'}],edges:[[0,1]]};
  const { elements: el } = setup(async () => response(data));
  el.simulate.fire('click'); await flush();
  const children = el.map.children;
  const boundary = children.findIndex(node => node.attrs.class === 'sector-boundary');
  const lastNode = children.reduce((last, node, index) =>
    node.attrs.class === 'node-group' ? index : last, -1);
  assert.ok(boundary > lastNode, `El borde visible debe renderizarse sobre los nodos y conexiones (${boundary} <= ${lastNode}).`);
});

test('cada número territorial queda dentro de su región asignada', async () => {
  const sectors = ['tarqui','eloy_alfaro','los_esteros','manta_centro','murcielago','barbasquillo','san_mateo'];
  const data = fixture();
  data.graph = {nodes:sectors.map((sector,id)=>({id,x:50,y:50,state:'S',sector,label:sector})),edges:[]};
  const { elements: el } = setup(async () => response(data));
  el.simulate.fire('click'); await flush();
  const parsePath = path => [...path.matchAll(/(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g)].map(match => [Number(match[1]), Number(match[2])]);
  const parseSubpaths = path => path.split(/(?=M)/).filter(Boolean).map(parsePath);
  const inside = (polygon, x, y) => polygon.reduce((value, [xi,yi], index) => {
    const [xj,yj] = polygon[(index + polygon.length - 1) % polygon.length];
    return ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ? !value : value;
  }, false);
  const regions = Object.fromEntries(el.map.children.filter(node => node.attrs.class === 'sector-region')
    .map(node => [node.attrs['data-sector'], parseSubpaths(node.attrs.d)]));
  const numbers = Object.fromEntries(el.map.children.filter(node => node.attrs.class === 'sector-number')
    .map(node => [node.attrs['data-sector'], node]));
  const nodes = el.map.children.filter(node => node.attrs.class === 'node-group');
  const ordered = ['san_mateo','murcielago','manta_centro','tarqui','los_esteros','eloy_alfaro','barbasquillo'];
  assert.equal(Object.keys(numbers).length, 7);
  ordered.forEach((sector, index) => {
    const number = numbers[sector];
    assert.equal(number.textContent, String(index + 1));
    assert.ok(regions[sector].some(polygon => inside(polygon, Number(number.attrs.x), Number(number.attrs.y))), `${number.textContent} pertenece a ${sector}`);
    assert.ok(nodes.every(node => Math.hypot(Number(number.attrs.x) - Number(node.attrs['data-x']), Number(number.attrs.y) - Number(node.attrs['data-y'])) > 2.5),
      `El marcador ${number.textContent} debe quedar separado de los nodos`);
  });
});

test('los marcadores numéricos conservan posiciones aunque cambien los nodos', async () => {
  const sectors = ['tarqui','eloy_alfaro','los_esteros','manta_centro','murcielago','barbasquillo','san_mateo'];
  const positionsFor = async multiplier => {
    const data = fixture();
    data.graph = {nodes:sectors.flatMap((sector,index)=>Array.from({length:multiplier},(_,copy)=>({id:index*multiplier+copy,x:50,y:50,state:'S',sector}))),edges:[]};
    const { elements: el } = setup(async () => response(data));
    el.simulate.fire('click'); await flush();
    return Object.fromEntries(el.map.children.filter(node => node.attrs.class === 'sector-number')
      .map(node => [node.attrs['data-sector'], [Number(node.attrs.x), Number(node.attrs.y)]]));
  };
  assert.deepEqual(await positionsFor(2), await positionsFor(5));
});

test('oculta la frase secundaria de la ciudad vacía', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.doesNotMatch(html, /Genera una simulación para explorar su evolución/);
  assert.doesNotMatch(html, /La ciudad está lista/);
});

test('los focos iniciales no muestran ayudas redundantes y el stock conserva su nota', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  for (const sector of ['tarqui','eloy_alfaro','los_esteros','manta_centro','murcielago','barbasquillo','san_mateo']) {
    const label = html.match(new RegExp(`<label for="initial-${sector}">([^<]*)</label>`))?.[1] ?? '';
    assert.doesNotMatch(label, /field-help/);
  }
  assert.match(html, /<label for="k_max">Stock total\s*<span class="field-note">Máximo 40 % de N<\/span>/);
});


test('modal accepts a valid draft without running, and cancel discards edits', async () => {
  const sent=[];
  const {elements:el}=setup(async (url,options)=>{sent.push(JSON.parse(options.body)); return response(fixture());});
  el['open-scenario'].fire('click');
  assert.equal(el['scenario-dialog'].open,true);
  el.beta.value='.17'; el.controls.fire('input');
  el['cancel-scenario'].fire('click');
  el.simulate.fire('click'); await flush();
  assert.equal(sent[0].beta,.03);
  el['open-scenario'].fire('click');
  el.beta.value='.17'; el['accept-scenario'].fire('click');
  assert.equal(sent.length,1);
  assert.equal(el['scenario-dialog'].open,false);
  el.simulate.fire('click'); await flush();
  assert.equal(sent[1].beta,.17);
});

test('modal derives N and rejects foci above I without accepting or executing', async () => {
  const sent=[];
  const {elements:el}=setup(async (url,options)=>{sent.push(JSON.parse(options.body)); return response(fixture());});
  el['open-scenario'].fire('click');
  el['count-s'].value='65'; el['count-e'].value='3'; el['count-i'].value='2'; el['count-r'].value='0';
  el.controls.fire('input');
  assert.equal(Number(el.n.value),70);
  el['initial-tarqui'].value='3'; el['initial-los_esteros'].value='0';
  el['accept-scenario'].fire('click');
  assert.equal(el['scenario-dialog'].open,true);
  assert.match(el['scenario-error'].textContent,/superar I/);
  el['initial-tarqui'].value='1'; el['incubation-days'].value='4'; el['incubation-days'].fire('input');
  el['accept-scenario'].fire('click');
  assert.equal(sent.length,0);
  el.simulate.fire('click'); await flush();
  assert.deepEqual(sent[0].initial_state,{s:65,e:3,i:2,r:0});
  assert.equal(sent[0].sigma,.25);
});

test('final report waits for playback completion, stop hides it and restart reuses result', async () => {
  const data=fixture();
  data.graph={nodes:[{id:0,x:10,y:20,state:'S',sector:'tarqui'}],edges:[]};
  data.frames=[{day:1,changed:[{id:0,state:'E'}]}];
  let sent=0;
  const {elements:el,tick}=setup(async()=>{sent++; return response(data);});
  el.simulate.fire('click'); await flush();
  assert.equal(el.report.hidden,true);
  el.play.fire('click'); tick(250);
  assert.equal(el.report.hidden,false);
  el.stop.fire('click');
  assert.equal(el.report.hidden,true);
  assert.equal(el.day.textContent,'Día 0');
  tick(500); assert.equal(el.day.textContent,'Día 0');
  el.restart.fire('click'); tick(250);
  assert.equal(el.report.hidden,false);
  assert.equal(sent,1);
});

test('accepted scenario invalidates an older response but cancelled drafts do not', async () => {
  const pending=[];
  const {elements:el}=setup(()=>new Promise(resolve=>pending.push(resolve)));
  el.simulate.fire('click');
  el['open-scenario'].fire('click'); el.beta.value='.2'; el['accept-scenario'].fire('click');
  pending[0](response(fixture())); await flush();
  assert.notEqual(el.r0.textContent,'2.40');
  el.simulate.fire('click');
  el['open-scenario'].fire('click'); el.beta.value='.9'; el['cancel-scenario'].fire('click');
  pending[1](response(fixture())); await flush();
  assert.equal(el.r0.textContent,'2.40');
});

test('zero incubation never sends an infinite reciprocal and Escape restores accepted draft', async () => {
  const sent=[];
  const {elements:el}=setup(async(url,options)=>{sent.push(JSON.parse(options.body));return response(fixture());});
  el['open-scenario'].fire('click');
  el['incubation-days'].value='0'; el['incubation-days'].fire('input');
  el['accept-scenario'].fire('click');
  el.simulate.fire('click'); await flush();
  assert.equal(sent[0].sigma,0);
  el['open-scenario'].fire('click'); el.beta.value='.9';
  el['scenario-dialog'].fire('cancel'); el['scenario-dialog'].close();
  assert.equal(Number(el.beta.value),.03);
  assert.equal(el['open-scenario'].focused,true);
});

test('SEIR symbols keep individual state identity, including recovered volunteer shape', async () => {
  const data=fixture();
  data.graph={nodes:['S','E','I','R','V'].map((state,id)=>({id,x:10+id,y:20,state,sector:'tarqui'})),edges:[]};
  const {elements:el}=setup(async()=>response(data));
  el.simulate.fire('click'); await flush();
  const symbols=descendants(el.map).filter(node=>node.attrs['data-node-id']!==undefined);
  [/susceptible/,/expuesto/,/infeccioso/,/recuperado/,/recuperado.*brigadista/].forEach((label,index)=>assert.match(symbols[index].attrs['aria-label'],label));
  assert.deepEqual(symbols.map(node=>node.tagName),['circle','rect','polygon','circle','polygon']);
});
