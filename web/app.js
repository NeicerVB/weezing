const NS = "http://www.w3.org/2000/svg";
const FIELDS = ["n", "days", "seed", "beta", "sigma", "gamma", "degree", "e0", "i0", "r0"];
const SERIES = [
  ["s", "--s", "S"],
  ["e", "--e", "E"],
  ["i", "--i", "I"],
  ["r", "--r", "R"],
];

const form = document.querySelector("#form");
const errorBox = document.querySelector("#error");
const results = document.querySelector("#results");
const summary = document.querySelector("#summary");
const submit = document.querySelector("#submit");

let activeNetwork = null;

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = {};
  for (const id of FIELDS) {
    payload[id] = Number(document.querySelector(`#${id}`).value);
  }
  submit.disabled = true;
  try {
    const response = await fetch("/api/simulate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "no se pudo simular");
    show(data);
  } catch (error) {
    results.hidden = true;
    errorBox.textContent = error.message;
    errorBox.hidden = false;
  } finally {
    submit.disabled = false;
  }
});

function show(data) {
  errorBox.hidden = true;
  const peak = data.days.reduce((best, row) => (row.i > best.i ? row : best));
  const last = data.days[data.days.length - 1];
  summary.textContent =
    `N=${data.meta.n} · grado ${data.meta.average_degree} · ` +
    `pico I=${peak.i} (día ${peak.day}) · acumulados=${last.cumulative}`;
  results.hidden = false;
  drawCurves(data.days);
  drawBars(data.days);

  if (activeNetwork) {
    activeNetwork.destroy();
    activeNetwork = null;
  }
  if (data.network) {
    activeNetwork = new NetworkGraph(data);
  }
}


function node(name, attributes) {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value);
  }
  return element;
}

function style(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function frame(svg, label) {
  svg.replaceChildren();
  const width = 720;
  const height = Number(svg.getAttribute("viewBox").split(" ")[3]);
  const pad = { left: 52, right: 16, top: 16, bottom: 28 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const title = node("title", { id: label });
  title.textContent = label === "curve-title" ? "Curvas S, E, I y R" : "Nuevos expuestos por día";
  svg.appendChild(title);
  return { width, height, pad, plotWidth, plotHeight, title };
}

function axes(svg, chart, rows, maxY) {
  const { pad, plotWidth, plotHeight } = chart;
  for (let index = 0; index <= 4; index += 1) {
    const value = (maxY * index) / 4;
    const y = pad.top + plotHeight * (1 - index / 4);
    svg.appendChild(node("line", {
      x1: pad.left, y1: y, x2: pad.left + plotWidth, y2: y, class: "grid",
    }));
    const text = node("text", { x: pad.left - 8, y: y + 4, "text-anchor": "end" });
    text.textContent = Math.round(value);
    svg.appendChild(text);
  }
  const step = Math.max(1, Math.ceil((rows.length - 1) / 8));
  for (let index = 0; index < rows.length; index += step) {
    const x = pad.left + (rows.length === 1 ? 0 : (plotWidth * index) / (rows.length - 1));
    const text = node("text", { x, y: pad.top + plotHeight + 18, "text-anchor": "middle" });
    text.textContent = rows[index].day;
    svg.appendChild(text);
  }
}

function drawCurves(rows) {
  const svg = document.querySelector("#curve");
  const chart = frame(svg, "curve-title");
  const maxY = Math.max(1, ...rows.flatMap((row) => [row.s, row.e, row.i, row.r]));
  axes(svg, chart, rows, maxY);
  const x = (index) => chart.pad.left +
    (rows.length === 1 ? 0 : (chart.plotWidth * index) / (rows.length - 1));
  const y = (value) => chart.pad.top + chart.plotHeight * (1 - value / maxY);
  for (const [key, color, name] of SERIES) {
    const points = rows.map((row, index) => `${x(index)},${y(row[key])}`).join(" ");
    svg.appendChild(node("polyline", {
      points, fill: "none", stroke: style(color), "stroke-width": "2",
      "stroke-linejoin": "round", "aria-label": name,
    }));
  }
}

function drawBars(rows) {
  const svg = document.querySelector("#bars");
  const chart = frame(svg, "bars-title");
  const maxY = Math.max(1, ...rows.map((row) => row.new_s_to_e));
  axes(svg, chart, rows, maxY);
  const slot = chart.plotWidth / Math.max(rows.length, 1);
  const barWidth = Math.max(1, slot * 0.7);
  rows.forEach((row, index) => {
    if (row.new_s_to_e === 0) return;
    const height = chart.plotHeight * (row.new_s_to_e / maxY);
    svg.appendChild(node("rect", {
      x: chart.pad.left + slot * index + (slot - barWidth) / 2,
      y: chart.pad.top + chart.plotHeight - height,
      width: barWidth, height, fill: style("--e"), rx: 2,
    }));
  });
}

class NetworkGraph {
  constructor(data) {
    this.data = data;
    this.canvas = document.querySelector("#network-canvas");
    this.container = document.querySelector(".network-container");
    this.tooltip = document.querySelector("#network-tooltip");
    this.ctx = this.canvas.getContext("2d");

    this.playBtn = document.querySelector("#net-play");
    this.resetBtn = document.querySelector("#net-reset");
    this.slider = document.querySelector("#net-slider");
    this.dayBadge = document.querySelector("#net-day-val");
    this.maxDayBadge = document.querySelector("#net-day-max");
    this.speedSelect = document.querySelector("#net-speed");
    this.scaleNote = document.querySelector("#net-scale-note");

    this.maxDays = data.days.length - 1;
    this.currentDay = 0;
    this.isPlaying = false;
    this.playTimer = null;

    if (this.scaleNote) {
      this.scaleNote.hidden = data.meta.n <= 150;
    }

    this.slider.max = this.maxDays;
    this.slider.value = 0;
    this.maxDayBadge.textContent = this.maxDays;
    this.dayBadge.textContent = "0";

    this.width = 900;
    this.height = 520;

    const rawNodes = data.network.nodes || [];
    const rawEdges = data.network.edges || [];
    const n = rawNodes.length;

    this.nodeRadius = n <= 50 ? 8 : n <= 120 ? 6 : n <= 250 ? 4.5 : 3.5;

    const neighborsMap = new Map();
    for (const [u, v] of rawEdges) {
      if (!neighborsMap.has(u)) neighborsMap.set(u, new Set());
      if (!neighborsMap.has(v)) neighborsMap.set(v, new Set());
      neighborsMap.get(u).add(v);
      neighborsMap.get(v).add(u);
    }

    const cx = this.width / 2;
    const cy = this.height / 2;
    const initialRadius = Math.min(cx, cy) * 0.75;

    this.nodes = rawNodes.map((item, idx) => {
      const angle = (2 * Math.PI * idx) / Math.max(n, 1);
      const dist = initialRadius * (0.3 + 0.7 * Math.sqrt((idx + 1) / Math.max(n, 1)));
      return {
        id: item.id,
        initial: item.initial,
        t_e: item.t_e,
        t_i: item.t_i,
        t_r: item.t_r,
        degree: neighborsMap.has(item.id) ? neighborsMap.get(item.id).size : 0,
        neighbors: neighborsMap.get(item.id) || new Set(),
        x: cx + Math.cos(angle) * dist + (Math.random() - 0.5) * 20,
        y: cy + Math.sin(angle) * dist + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        fx: null,
        fy: null,
      };
    });

    this.nodesById = new Map(this.nodes.map((node) => [node.id, node]));
    this.edges = rawEdges
      .map(([u, v]) => ({
        source: this.nodesById.get(u),
        target: this.nodesById.get(v),
      }))
      .filter((e) => e.source && e.target);

    this.targetDist = Math.max(35, Math.min(120, 450 / Math.sqrt(Math.max(n, 1))));
    this.kSpring = 0.04;
    this.kRep = Math.min(2500, Math.max(600, 15000 / Math.sqrt(Math.max(n, 1))));
    this.kGravity = 0.015;
    this.damping = 0.88;

    this.hoveredNode = null;
    this.dragNode = null;

    this.setupDpi();

    this.boundResize = () => this.setupDpi();
    window.addEventListener("resize", this.boundResize);

    this.boundPointerDown = (e) => this.onPointerDown(e);
    this.boundPointerMove = (e) => this.onPointerMove(e);
    this.boundPointerUp = () => this.onPointerUp();

    this.canvas.addEventListener("pointerdown", this.boundPointerDown);
    window.addEventListener("pointermove", this.boundPointerMove);
    window.addEventListener("pointerup", this.boundPointerUp);

    this.boundPlayToggle = () => this.togglePlay();
    this.boundReset = () => this.reset();
    this.boundSlider = (e) => this.onSlider(e);

    this.playBtn.addEventListener("click", this.boundPlayToggle);
    this.resetBtn.addEventListener("click", this.boundReset);
    this.slider.addEventListener("input", this.boundSlider);

    this.animId = null;
    this.animate = this.animate.bind(this);
    this.animId = requestAnimationFrame(this.animate);
  }

  setupDpi() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    const displayWidth = rect.width || this.width;
    const displayHeight = (displayWidth * this.height) / this.width;

    this.canvas.width = Math.round(displayWidth * dpr);
    this.canvas.height = Math.round(displayHeight * dpr);
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(
      this.canvas.width / this.width,
      this.canvas.height / this.height
    );
  }

  onPointerDown(e) {
    const pt = this.getCanvasPoint(e);
    const hitRadius = this.nodeRadius + 6;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      const dx = node.x - pt.x;
      const dy = node.y - pt.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        this.dragNode = node;
        node.fx = pt.x;
        node.fy = pt.y;
        this.container.classList.add("dragging");
        this.updateTooltip(node, e);
        break;
      }
    }
  }

  onPointerMove(e) {
    const pt = this.getCanvasPoint(e);
    if (this.dragNode) {
      this.dragNode.fx = pt.x;
      this.dragNode.fy = pt.y;
      this.updateTooltip(this.dragNode, e);
      return;
    }

    const hitRadius = this.nodeRadius + 5;
    let hitNode = null;
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const node = this.nodes[i];
      const dx = node.x - pt.x;
      const dy = node.y - pt.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        hitNode = node;
        break;
      }
    }

    if (hitNode !== this.hoveredNode) {
      this.hoveredNode = hitNode;
      if (hitNode) {
        this.updateTooltip(hitNode, e);
      } else {
        this.tooltip.hidden = true;
      }
    } else if (hitNode) {
      this.updateTooltipPosition(e);
    }
  }

  onPointerUp() {
    if (this.dragNode) {
      this.dragNode.fx = null;
      this.dragNode.fy = null;
      this.dragNode = null;
      this.container.classList.remove("dragging");
    }
  }

  getCanvasPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * this.width;
    const y = ((e.clientY - rect.top) / rect.height) * this.height;
    return { x, y };
  }

  updateTooltip(node, e) {
    const stateKey = this.getNodeState(node, this.currentDay);
    const stateNames = { s: "Susceptible", e: "Expuesto", i: "Infectado", r: "Recuperado" };
    const stateColor = style(`--${stateKey}`);
    this.tooltip.innerHTML = `
      <strong>Nodo #${node.id}</strong><br>
      Estado: <span style="color:${stateColor}; font-weight:600;">${stateNames[stateKey]} (${stateKey.toUpperCase()})</span><br>
      Vecinos: ${node.degree}
    `;
    this.tooltip.hidden = false;
    if (e && e.clientX) {
      this.updateTooltipPosition(e);
    }
  }

  updateTooltipPosition(e) {
    const contRect = this.container.getBoundingClientRect();
    const left = e.clientX - contRect.left + 14;
    const top = e.clientY - contRect.top + 14;
    this.tooltip.style.left = `${Math.min(left, contRect.width - 160)}px`;
    this.tooltip.style.top = `${Math.min(top, contRect.height - 80)}px`;
  }

  getNodeState(node, day) {
    if (node.t_r !== null && day >= node.t_r) return "r";
    if (node.t_i !== null && day >= node.t_i) return "i";
    if (node.t_e !== null && day >= node.t_e) return "e";
    return (node.initial || "S").toLowerCase();
  }

  togglePlay() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  play() {
    if (this.currentDay >= this.maxDays) {
      this.currentDay = 0;
      this.updateDayUI();
    }
    this.isPlaying = true;
    this.playBtn.textContent = "⏸";
    const speed = Number(this.speedSelect.value) || 500;
    this.playTimer = setInterval(() => {
      if (this.currentDay < this.maxDays) {
        this.currentDay += 1;
        this.updateDayUI();
        if (this.hoveredNode) this.updateTooltip(this.hoveredNode, { clientX: 0, clientY: 0 });
      } else {
        this.pause();
      }
    }, speed);
  }

  pause() {
    this.isPlaying = false;
    this.playBtn.textContent = "▶";
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
  }

  reset() {
    this.pause();
    this.currentDay = 0;
    this.updateDayUI();
    if (this.hoveredNode) this.updateTooltip(this.hoveredNode, { clientX: 0, clientY: 0 });
  }

  onSlider(e) {
    this.pause();
    this.currentDay = Number(e.target.value);
    this.updateDayUI();
    if (this.hoveredNode) this.updateTooltip(this.hoveredNode, { clientX: 0, clientY: 0 });
  }

  updateDayUI() {
    this.slider.value = this.currentDay;
    this.dayBadge.textContent = this.currentDay;
  }

  stepPhysics() {
    const nodes = this.nodes;
    const n = nodes.length;
    const cx = this.width / 2;
    const cy = this.height / 2;
    const dt = 0.5;

    for (let i = 0; i < n; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < n; j++) {
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) d2 = 1;
        if (d2 > 90000 && n > 150) continue;
        const dist = Math.sqrt(d2);
        const f = this.kRep / d2;
        const fx = (dx / dist) * f;
        const fy = (dy / dist) * f;
        a.vx -= fx;
        a.vy -= fy;
        b.vx += fx;
        b.vy += fy;
      }
    }

    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      const a = edge.source;
      const b = edge.target;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.001;
      const displacement = dist - this.targetDist;
      const f = displacement * this.kSpring;
      const fx = (dx / dist) * f;
      const fy = (dy / dist) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    const pad = this.nodeRadius + 12;
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      if (node.fx !== null) {
        node.x = node.fx;
        node.y = node.fy;
        node.vx = 0;
        node.vy = 0;
        continue;
      }

      node.vx += (cx - node.x) * this.kGravity;
      node.vy += (cy - node.y) * this.kGravity;

      node.vx *= this.damping;
      node.vy *= this.damping;

      node.x += node.vx * dt;
      node.y += node.vy * dt;

      if (node.x < pad) { node.x = pad; node.vx *= -0.5; }
      else if (node.x > this.width - pad) { node.x = this.width - pad; node.vx *= -0.5; }
      if (node.y < pad) { node.y = pad; node.vy *= -0.5; }
      else if (node.y > this.height - pad) { node.y = this.height - pad; node.vy *= -0.5; }
    }
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    const hovered = this.hoveredNode || this.dragNode;
    const accentColor = style("--accent");
    const lineColor = style("--line");

    for (let i = 0; i < this.edges.length; i++) {
      const edge = this.edges[i];
      const a = edge.source;
      const b = edge.target;
      const isIncident = hovered && (a === hovered || b === hovered);

      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);

      if (isIncident) {
        ctx.strokeStyle = accentColor;
        ctx.lineWidth = 2.2;
        ctx.globalAlpha = 0.95;
      } else {
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.globalAlpha = hovered ? 0.2 : 0.6;
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1.0;

    const colors = {
      s: style("--s"),
      e: style("--e"),
      i: style("--i"),
      r: style("--r"),
    };

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const stateKey = this.getNodeState(node, this.currentDay);
      const isHovered = node === hovered;
      const isNeighbor = hovered && hovered.neighbors.has(node.id);

      ctx.beginPath();
      const r = isHovered ? this.nodeRadius * 1.45 : isNeighbor ? this.nodeRadius * 1.15 : this.nodeRadius;
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = colors[stateKey] || colors.s;
      ctx.fill();

      if (isHovered) {
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 3, 0, 2 * Math.PI);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = accentColor;
        ctx.stroke();
      } else if (isNeighbor) {
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = accentColor;
        ctx.stroke();
      } else {
        ctx.lineWidth = 1;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
        ctx.stroke();
      }
    }
  }

  animate() {
    this.stepPhysics();
    this.render();
    this.animId = requestAnimationFrame(this.animate);
  }

  destroy() {
    this.pause();
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    window.removeEventListener("resize", this.boundResize);
    this.canvas.removeEventListener("pointerdown", this.boundPointerDown);
    window.removeEventListener("pointermove", this.boundPointerMove);
    window.removeEventListener("pointerup", this.boundPointerUp);
    this.playBtn.removeEventListener("click", this.boundPlayToggle);
    this.resetBtn.removeEventListener("click", this.boundReset);
    this.slider.removeEventListener("input", this.boundSlider);
    if (this.tooltip) this.tooltip.hidden = true;
  }
}

