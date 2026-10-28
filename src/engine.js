// Motor independiente del render: también se ejecuta en Node y Web Workers.
export const DEFAULTS = Object.freeze({
  model: "SEIR",
  population: 900,
  beta: 0.65,
  infectiousDays: 7,
  latentDays: 4,
  initial: 12,
  vaccines: 90,
  efficacy: 0.9,
  seed: 42,
  days: 7,
  repetitions: 40,
  date: "2021-03-15",
});
export const STRATEGIES = ["none", "random", "degree"];
export function random(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function validate(c) {
  for (const k of [
    "population",
    "initial",
    "vaccines",
    "seed",
    "days",
    "repetitions",
  ])
    if (!Number.isSafeInteger(c[k])) throw Error(`${k}: debe ser un entero.`);
  if (
    c.population < 50 ||
    c.population > 2500 ||
    c.initial < 1 ||
    c.initial >= c.population ||
    c.vaccines < 0 ||
    c.vaccines > c.population - c.initial ||
    c.days < 1 ||
    c.days > 60 ||
    c.repetitions < 2 ||
    c.repetitions > 300 ||
    c.seed < 0 ||
    c.seed > 0xffffffff
  )
    throw Error(
      "Revisa los límites: población 50–2500, réplicas 2–300, días 1–60 y vacunas ≤ población menos infectados iniciales.",
    );
  if (
    !["SIR", "SEIR"].includes(c.model) ||
    !Number.isFinite(c.beta) ||
    c.beta < 0 ||
    c.beta > 5 ||
    !Number.isFinite(c.infectiousDays) ||
    c.infectiousDays <= 0 ||
    !Number.isFinite(c.latentDays) ||
    c.latentDays <= 0 ||
    !Number.isFinite(c.efficacy) ||
    c.efficacy < 0 ||
    c.efficacy > 1
  )
    throw Error("Parámetros epidemiológicos inválidos.");
}
function shuffled(n, rng) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function makeWorld(c) {
  validate(c);
  const rng = random(c.seed),
    n = c.population,
    nodes = [],
    edges = [],
    seen = new Set(),
    adjacency = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const zone = i % 3,
      x = (zone - 1) * 22 + (rng() - 0.5) * 19,
      z = (rng() - 0.5) * 34;
    nodes.push({ x, z, zone });
  }
  function add(a, b) {
    if (a === b) return;
    const key = Math.min(a, b) * n + Math.max(a, b);
    if (seen.has(key)) return;
    seen.add(key);
    edges.push([a, b]);
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  // Hogares sintéticos de cuatro vecinos dentro de la misma zona.
  for (let zone = 0; zone < 3; zone++) {
    const ids = nodes
      .map((v, i) => (v.zone === zone ? i : -1))
      .filter((i) => i >= 0);
    for (let start = 0; start < ids.length; start += 4)
      for (let a = start; a < Math.min(start + 4, ids.length); a++)
        for (let b = a + 1; b < Math.min(start + 4, ids.length); b++)
          add(ids[a], ids[b]);
    // Centros de actividad con grado alto: mercados/colegios sintéticos.
    for (let k = 0; k < ids.length; k++) {
      if (rng() < 0.7) add(ids[k], ids[Math.floor(k / 35) * 35]);
    }
  }
  for (let i = 0; i < n; i++)
    for (let k = 0; k < 2; k++) add(i, Math.floor(rng() * n));
  const order = shuffled(n, random(c.seed ^ 0x9e3779b9));
  return {
    nodes,
    edges,
    adjacency,
    initial: order.slice(0, c.initial),
    degree: adjacency.map((a) => a.length),
    meanDegree: (edges.length * 2) / n,
  };
}
// Aleatoriedad indexada por réplica, día, subpaso, individuo y tipo de evento.
// Las tres políticas comparten los mismos números, incluso si divergen sus estados.
function u(seed, day, step, node, channel) {
  let x =
    (seed ^
      Math.imul(day + 1, 0x9e3779b1) ^
      Math.imul(step + 1, 0x85ebca6b) ^
      Math.imul(node + 1, 0xc2b2ae35) ^
      Math.imul(channel + 1, 0x27d4eb2d)) >>>
    0;
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}
export function simulate(c, world, strategy, replicate = 0, snapshots = false) {
  if (!STRATEGIES.includes(strategy)) throw Error("Estrategia inválida");
  const n = c.population,
    state = new Uint8Array(n),
    ever = new Uint8Array(n),
    vaccinated = new Uint8Array(n),
    seed = (c.seed + Math.imul(replicate + 1, 104729)) >>> 0;
  for (const i of world.initial) {
    state[i] = 2;
    ever[i] = 1;
  }
  let doses = 0;
  if (strategy !== "none") {
    const candidates = shuffled(n, random(seed ^ 0xa5a5a5a5)).filter(
      (i) => state[i] === 0,
    );
    if (strategy === "degree")
      candidates.sort((a, b) => world.degree[b] - world.degree[a]);
    for (const i of candidates.slice(0, c.vaccines)) {
      doses++;
      vaccinated[i] = 1;
      if (u(seed, 0, 0, i, 8) < c.efficacy) state[i] = 3;
    }
  }
  const history = [],
    frames = [];
  function record(day, incidence) {
    const count = [0, 0, 0, 0];
    for (const s of state) count[s]++;
    history.push({
      day,
      S: count[0],
      E: count[1],
      I: count[2],
      R: count[3],
      ever: ever.reduce((a, b) => a + b, 0),
      incidence,
      doses,
    });
    if (snapshots) frames.push(Array.from(state));
  }
  record(0, 0);
  const dt = 0.25,
    recover = -Math.expm1(-dt / c.infectiousDays),
    progress = -Math.expm1(-dt / c.latentDays);
  for (let day = 1; day <= c.days; day++) {
    let incidence = 0;
    for (let step = 0; step < 4; step++) {
      const next = state.slice();
      for (let i = 0; i < n; i++) {
        if (state[i] === 0) {
          let contacts = 0;
          for (const j of world.adjacency[i]) if (state[j] === 2) contacts++;
          if (
            u(seed, day, step, i, 0) <
            -Math.expm1(((-c.beta * contacts) / world.meanDegree) * dt)
          ) {
            next[i] = c.model === "SEIR" ? 1 : 2;
            ever[i] = 1;
            incidence++;
          }
        } else if (state[i] === 1 && u(seed, day, step, i, 1) < progress)
          next[i] = 2;
        else if (state[i] === 2 && u(seed, day, step, i, 2) < recover)
          next[i] = 3;
      }
      state.set(next);
    }
    record(day, incidence);
  }
  return {
    strategy,
    replicate,
    history,
    frames,
    doses,
    vaccinated: Array.from(vaccinated),
  };
}
export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b),
    mean = values.reduce((a, b) => a + b, 0) / values.length;
  const q = (p) => {
    const h = (sorted.length - 1) * p,
      k = Math.floor(h);
    return (
      sorted[k] +
      (sorted[Math.min(k + 1, sorted.length - 1)] - sorted[k]) * (h - k)
    );
  };
  return { mean, p10: q(0.1), p90: q(0.9), min: sorted[0], max: sorted.at(-1) };
}
export function compare(c, progress = () => {}) {
  validate(c);
  const world = makeWorld(c),
    runs = { none: [], random: [], degree: [] };
  for (let r = 0; r < c.repetitions; r++) {
    for (const s of STRATEGIES) runs[s].push(simulate(c, world, s, r, r === 0));
    progress(r + 1, c.repetitions);
  }
  const metrics = {};
  for (const s of STRATEGIES) {
    const final = runs[s].map((r) => r.history.at(-1).ever);
    const prevented = final.map((v, i) => runs.none[i].history.at(-1).ever - v);
    metrics[s] = {
      infected: summarize(final),
      prevented: summarize(prevented),
      doses: runs[s][0].doses,
      curve: Array.from({ length: c.days + 1 }, (_, d) =>
        summarize(runs[s].map((r) => r.history[d].I)),
      ),
    };
  }
  return { config: c, world, runs, metrics, version: 1 };
}
