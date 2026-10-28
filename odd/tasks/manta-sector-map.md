# Manta Seven-Sector Map Implementation

## Objective
Redraw the territorial map to match the user's supplied silhouette and seven hand-drawn divisions, place the matching numbers inside each area, and show a nearby number-to-sector legend.

## Problem and Why
The current frontend uses Voronoi cells around sector centers, so its boundaries cannot match the supplied sketch. The user wants an intuitive numbered map while preserving the existing simulation.

## Scope and Constraints
- Frontend presentation and frontend tests only; preserve the API, backend sector IDs, graph data, simulation behavior, and graph controls.
- Do not modify README, `docs/`, AWS files, or unrelated configuration.
- Match the supplied illustrative shape and divisions; do not claim official boundaries or geographic scale.
- Number mapping: 1 San Mateo, 2 Murciélago, 3 Manta Centro, 4 Tarqui, 5 Los Esteros, 6 Eloy Alfaro, 7 Barbasquillo.

## Approaches
- **Selected — fixed SVG sector polygons:** keeps map boundaries, node containment, zoom, and numeric overlays aligned and crisp at responsive sizes.
- Rejected — use the uploaded raster as a background: it would not keep simulated nodes constrained by each visible division and would blur under zoom.
- Rejected — retain Voronoi sectors: their generated boundaries cannot reproduce the supplied hand-drawn partitions.

## Authorized Scope
- `src/seir/static/app.js`
- `src/seir/static/index.html`
- `src/seir/static/style.css`
- `tests/frontend.test.cjs`
- `tests/test_frontend_style.py`

## Tasks
- [ ] MAP-1 Replace generated sector cells with fixed, tested SVG regions matching the sketch; render numeric labels and the adjacent sector legend while keeping nodes inside their stable sectors.

## Acceptance Criteria
- The outline and seven divisions visually follow the supplied sketch.
- The map shows numbers 1–7 inside their corresponding sectors and a readable adjacent legend with the exact names/order above.
- Existing simulated node states, links, zoom, playback, and API sector identifiers remain unchanged.
- Deterministic geometry tests confirm the seven polygons cover the map without overlap and high-population node positions stay within their assigned areas.
- Region polygons do not extend beyond the territory outline; sector-number markers use fixed clear positions rather than covering graph nodes.
- Every named sector forms one connected area, with the sketch's spatial order preserved: 1 west, 7 upper-west, 2 upper-center, 3 central/lower-left, 4 center-right, 5 northeast, and 6 south.
- Dense node placement reserves clearance from every sector marker, not only the node's own sector marker.
- Existing floating map toolbar and SEIR balance cards remain visible above the map.
- No README, `docs/`, or backend file is modified.

## Checks
- `node tests/frontend.test.cjs`
- `./.venv/bin/python -m pytest -q tests/test_frontend_style.py`
- `git diff --check`

## Route and Progress
- Route: delegated direct; mapping exceeded the inline evidence budget and implementation spans SVG geometry, HTML legend, and tests.
- Forecast: about 250 authored changed lines; delivery strategy `ask-on-risk`.
- Current state: implementation corrected after two independent audits; sector regions are connected and contained, labels align with the sketch ordering, dense node positions clear all markers, map overlays remain visible, and tooltip/stock-note styles are fixed. Independent verification and parent Node run pass.
- Verification: `node tests/frontend.test.cjs` — 32/32; `./.venv/bin/python -m pytest -q tests/test_frontend_style.py` — 14 passed + 12 subtests; `git diff --check` — passed. Browser screenshot review remains unavailable.
- Delivery: current tracked worktree diff is 568 authored changed lines, over the ~400-line `ask-on-risk` threshold; work-unit commit awaits the user's chain strategy.

## Next Step
Obtain the chain strategy before committing the work unit; then record commit evidence. Do not push until remote credential/session authorization is explicit.

## Relevant Files
- `src/seir/static/app.js` — SVG geometry, node relocation, boundaries, and labels.
- `src/seir/static/index.html` — map SVG and legend markup.
- `src/seir/static/style.css` — responsive map and legend layout.
- `tests/frontend.test.cjs` — geometry, containment, and numeric mapping checks.
- `tests/test_frontend_style.py` — responsive legend checks.
