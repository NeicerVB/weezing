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
