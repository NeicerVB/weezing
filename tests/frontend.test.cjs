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
  fire(name) { for (const fn of this.listeners[name] ?? []) fn({ preventDefault() {} }); }
  checkValidity() { return true; }
}

function setup(fetchImpl = async () => response(fixture())) {
  assert.ok(fs.existsSync(path.join(root, 'app.js')), 'Falta el controlador territorial');
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const elements = {};
  for (const match of html.matchAll(/<([a-z][\w-]*)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
    const attrs = Object.fromEntries([...match[2].matchAll(/([\w-]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
    elements[match[3]] = new Element(match[1], attrs);
    if (match[1] === 'select') {
      const firstOption = html.slice(match.index + match[0].length).match(/<option value="([^"]+)"/);
      elements[match[3]].value = firstOption?.[1] ?? '';
    }
  }
  const document = {
    getElementById: (id) => elements[id],
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
  vm.runInNewContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), {
    document, fetch: fetchImpl, setTimeout, clearTimeout, console,
  }, { filename: 'app.js' });
  return { elements, tick, document };
}

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

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
  el.controls.fire('input');
  tick(149);
  assert.equal(requests.length, 0);
  tick(1);
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
  el.controls.fire('submit');
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
  assert.equal(el.play.disabled, true);
});

test('muestra errores 400 y 429 accesibles, con espera del servidor', async () => {
  for (const [status, error, retry] of [
    [400, 'Parámetro inválido: N', null],
    [429, 'Servidor ocupado', '2'],
  ]) {
    const { elements: el } = setup(async () => response({ error }, status, retry));
    el.controls.fire('submit');
    await flush();
    assert.equal(el.error.hidden, false);
    assert.match(el.error.textContent, new RegExp(error));
    if (status === 429) assert.match(el.error.textContent, /2 segundos/);
  }
});

test('una respuesta anterior no sobrescribe los resultados más recientes', async () => {
  const pending = [];
  const { elements: el, tick } = setup(() => new Promise((resolve) => pending.push(resolve)));
  el.controls.fire('submit');
  await flush();
  el.beta.value = '0.2';
  el.controls.fire('input');
  tick(150);
  await flush();
  assert.equal(pending.length, 2);
  pending[1](response(fixture()));
  await flush();
  assert.equal(el.r0.textContent, '2.40');
  const old = fixture();
  old.meta.r0 = 9;
  pending[0](response(old));
  await flush();
  assert.equal(el.r0.textContent, '2.40');
});

test('dibuja la topología opcional y aplica diffs sin perder el estado inicial al volver al día cero', async () => {
  const data = fixture();
  data.graph = { nodes: [{ id: 1, x: 20, y: 30, state: 'S' }, { id: 2, x: 70, y: 60, state: 'I' }], edges: [[1, 2]] };
  data.frames = [{ day: 1, changed: [{ id: 1, state: 'E' }, { id: 2, state: 'V' }] }];
  const { elements: el, tick } = setup(async () => response(data));
  el.include_frames.checked = true;
  el.controls.fire('submit');
  await flush();
  assert.equal(el.play.disabled, false);
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
  el.controls.fire('submit');
  await flush();
  assert.equal(descendants(el.curve).filter((item) => item.attrs.class === 'range').length, 1);
  assert.match(el['range-status'].textContent, /p2.5 - p97.5/);
});

test('no interpreta R₀ nulo como extinción cuando gamma es cero', async () => {
  const data = fixture();
  data.meta.r0 = null;
  const { elements: el } = setup(async () => response(data));
  el.controls.fire('submit');
  await flush();
  assert.equal(el.r0.textContent, '—');
  assert.match(el['r0-meaning'].textContent, /no calculable/i);
});
