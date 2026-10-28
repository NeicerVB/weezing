# Scenario modal and SEIR playback

## Objective and approved design
Implement the user-approved scenario editor and game-like simulation screen using existing Python and vanilla JS/CSS architecture. Preserve the current seven-sector map, zoom/reset, edge/bridge toggles, counters, day, speed and timeline. User approved execution on 2026-10-28.

- Central state palette: S blue, E yellow/orange, I red, R green. Every node and all legends/counters agree; retain shape distinctions.
- Near-full-screen accessible modal opened by `Personaliza el escenario`, blurred backdrop, existing options, draft Accept/Cancel. Accept validates and stores configuration, never starts simulation; Cancel discards edits.
- Initial nonnegative integer S/E/I/R sum defines N. Manual sector I sum cannot exceed I; distribute remainder randomly without duplicates/capacity overflow. Validate both browser and API.
- Preserve synchronous daily stochastic abstract SEIR. Display mean incubation days (conversion to existing sigma); no pathogen calibration. For explicitly configured all-S state, day zero remains all-S and a single seeded external case occurs on day one, preserving N and shared comparison conditions. Legacy request behavior remains compatible.
- Scrollable presets sidebar: three immutable base scenarios (not the existing comparison buttons), custom named presets in versioned localStorage with validation and safe storage errors. Save is distinct from Accept; Clear restores editor defaults without deleting saved presets.
- Main Run computes accepted scenario. Bottom large play/pause, stop (day zero, stopped), restart (day zero, playing, same seed/config); retain speed and seeking. Do not permit stale responses or old reports to overwrite newer runs.
- Show final report after playback completion, with daily chart, existing metrics/comparisons and correctly labeled aggregate means/ranges where available; no final report for an incomplete stopped run.
- Pixel-art-inspired high contrast, CSS/SVG-native, no new dependencies or generated assets. Existing Spanish UI remains Spanish. Preserve map geometry.

## Scope and constraints
Source of truth: backend config/model and shared frontend state/palette; do not duplicate configuration or create a database for presets. Preserve staged pre-existing work. No infra, hardware, remote operations, installs, pushes or PRs. Work in current feature checkout; no unsolicited worktree creation. RDD effective OFF (global), so do not launch native reviews.

## Work units
- [ ] T1: Full initial SEIR contract, deterministic foci remainder, opt-in single import, API serialization and regression tests. Route delegated: backend changes span non-trivial files.
- [ ] T2: Modal draft/accepted state, preset storage and validation, explicit run lifecycle, regression tests. Route delegated: preparation and multi-file implementation.
- [ ] T3: Pixel-art palette/nodes, preserved map controls, playback terminal report and documentation/tests. Route delegated: multi-file UI integration.
- [ ] T4: Independent functional verification and scoped fixes. Route delegated: full suite and browser checks.

Each behavior follows observed RED/GREEN tests; CSS/passive docs use structural checks. Writer handles T1-T3 sequentially with one writer only. Parent owns task completion and review.

## Verification
- `./.venv/bin/python -m pytest -q -p no:cacheprovider tests/test_config.py tests/test_engine.py tests/test_strategies.py tests/test_topology.py tests/test_acceptance.py`
- `node --test tests/frontend.test.cjs`
- `./.venv/bin/python -m pytest -q -p no:cacheprovider tests/test_frontend_layout.py tests/test_frontend_style.py`
- Full Python suite with bounded timeout; prior API smoke attempt hung, not an accepted passing result. Diagnose environment before changing unrelated code.
- `git diff --check`
- Browser smoke if tooling available: modal accept/cancel, invalid allocations, save/reload presets, four visible node colors, timeline and report gating.

## Review focus
Population/foci overflow and zero values; sector capacity; deterministic import common to baselines; invalid/blocked storage; cancellation and stale asynchronous result races; early termination and replay report visibility; node fill specificity and readable dense edges.

## Delivery and progress
Forecast: approximately 800-1400 authored changed lines; coherent behavior/testing takes priority over arbitrary line caps. Delivery strategy ask-on-risk. Commit/chain choice pending before commits; do not include pre-existing staged work in task commits. No push/PR authorized. Work-unit boundaries T1/T2/T3 above; no commits yet.

## Writer handoff — 2026-10-28

T1–T3 are implemented and self-verified, but the checkboxes above intentionally remain open pending parent verification and delivery decisions. No commits, staging, resets or branch changes were performed; the pre-existing staged baseline is preserved. RDD remains off.

- T1: optional `initial_state: {s,e,i,r}` and `all_s_import: false` default; exact totals, bounded sector foci and deterministic disjoint remainder allocation. Legacy calls remain compatible. Explicit all-S opt-in produces one common infectious import at the end of day 1, preserving day 0 and N. `meta.external_import` identifies the event and API rows include `imported_cases`. CLI row schema stays unchanged when no import is configured.
- T2: native accessible dialog, draft/accepted separation, accept/cancel/Escape, derived N, zero-safe incubation conversion, immutable three base scenarios and validated version-1 localStorage presets. Save, clear, accept and run have separate effects. Stock/degree adapt to N; sector foci are never silently rewritten. Request IDs reject results invalidated by acceptance or a newer run.
- T3: S blue / E yellow-orange / I red / R green on every symbol and counter; recovered volunteer stars stay green. Existing sector geometry, edge/bridge controls, zoom/reset and dense layout tests are preserved. Playback supports play/pause, stop-to-zero, restart-and-play, speed and seeking. The final report stays hidden until completion, with aggregate mean/range summaries explicitly separate from individual-run metrics. Daily counts remain playable without inventing unavailable map frames. README removes conflicting automatic-execution, calibration and guaranteed-superiority claims.

### Observed test evidence

- RED: new initial-state tests failed because `initial_state`/`all_s_import` were forbidden; modal tests failed because the editor was absent, and report visibility was wrong. Preset tests initially failed because the module was absent. Recovered volunteer accessibility test failed because it omitted the recovered state.
- GREEN: prescribed focused backend command: 60 passed, 25 subtests. Focused backend plus frontend structural checks: 80 passed, 86 subtests.
- GREEN: `node --test tests/frontend.test.cjs tests/scenario.test.cjs` passed both test files. `node --test --test-isolation=none tests/frontend.test.cjs tests/scenario.test.cjs` reported **41 individual cases passed**; the default Node reporter reports files rather than that individual total.
- Full non-API regression run initially caught `CliTests.test_json_is_reproducible` after a new dataclass field changed legacy JSON keys. The shared CLI serializer was corrected, preserving the regression test unchanged. Fresh `timeout 20s ./.venv/bin/python -m pytest -q -p no:cacheprovider --ignore=tests/test_api_smoke.py`: **104 passed, 93 subtests** after an additional RED/GREEN regression proved explicit initial IDs cannot bypass per-sector foci capacity.
- Full Python suite: `timeout 35s ./.venv/bin/python -m pytest -q -p no:cacheprovider` timed out (exit 124) at the existing API suite. Bounded isolated API startup test with a 5-second faulthandler dump also timed out at 12 seconds: `TestClient.__enter__` waits in the AnyIO blocking portal before HTTP/application startup. No API/environment workaround was made. HTTP/API integration remains pending, not passing.
- `git diff --check`: passed.
- Browser smoke unavailable: no installed browser, Playwright/Puppeteer/Selenium package or browser tool was found. Modal focus containment/Escape use native dialog behavior; DOM regression tests cover acceptance, cancellation, field restoration and focus return, but are not a real-browser rendering/accessibility audit.

### Pending work and boundaries

- T4 parent independent verification, including HTTP/API and real-browser smoke when available.
- Commit/chain strategy decision remains pending; no publication authorized.
- Tracked implementation diff versus the preserved index: approximately 608 additions / 165 deletions before final tracker edits; new `scenario.js` and `scenario.test.cjs` add 124 lines. Pre-existing staged baseline remains separate (577 additions / 117 deletions).
- No installs, remote operations, environment configuration changes or source normalizers were run.

## Next step
Parent runs independent verification and decides any scoped corrections; leave T1–T3 completion and all commits pending until then.
