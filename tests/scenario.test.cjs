const {test} = require('node:test');
const assert = require('node:assert/strict');
const Scenario = require('../src/seir/static/scenario.js');

test('rejects inconsistent counts, excessive foci, sector capacity and fractional counts', () => {
  const base = Scenario.defaults();
  assert.equal(Scenario.validate(base).n, 1000);
  for (const change of [
    {initial_state: {s: 992, e: 0, i: 7, r: 0}},
    {initial: {tarqui: 8}}, {initial: {tarqui: 144}, initial_state: {s: 850, e: 0, i: 150, r: 0}},
    {initial_state: {s: 992.5, e: .5, i: 7, r: 0}},
    {sigma: Infinity}, {degree: 1000}, {all_s_import: 'yes'},
  ]) assert.throws(() => Scenario.validate({...base, ...change}));
  const zero = {...base, initial_state: {s:1000,e:0,i:0,r:0}, initial:{}};
  assert.equal(Scenario.validate(zero).initial_state.i, 0);
});

test('three base scenarios are fresh copies and persist separately from editor acceptance', () => {
  const bases = Scenario.basePresets();
  assert.equal(bases.length, 3);
  bases[0].config.beta = .99;
  assert.equal(Scenario.basePresets()[0].config.beta, .03);
  const data = new Map();
  const storage = {getItem: key => data.get(key) ?? null, setItem:(key,value) => data.set(key,value)};
  assert.deepEqual(Scenario.readPresets(storage).presets, []);
  const saved = Scenario.savePreset(storage, 'Mi escenario', Scenario.defaults());
  assert.equal(saved.ok, true);
  assert.equal(Scenario.readPresets(storage).presets[0].name, 'Mi escenario');
  assert.equal(Scenario.savePreset(storage, '', Scenario.defaults()).ok, false);
  assert.equal(Scenario.savePreset(storage, 'Mi escenario', Scenario.defaults()).ok, false);
});

test('corrupt, outdated or blocked preset storage never overwrites existing data', () => {
  for (const raw of ['{bad', '{"version":99,"presets":[]}', '{"version":1,"presets":[{"name":"bad","config":{}}]}']) {
    let writes = 0;
    const storage = {getItem:()=>raw, setItem:()=>writes++};
    assert.equal(Scenario.readPresets(storage).ok, false);
    assert.equal(Scenario.savePreset(storage, 'new', Scenario.defaults()).ok, false);
    assert.equal(writes, 0);
  }
  const blocked = {getItem(){throw new Error('denied')},setItem(){throw new Error('denied')}};
  assert.equal(Scenario.readPresets(blocked).ok, false);
  assert.equal(Scenario.savePreset(blocked, 'new', Scenario.defaults()).ok, false);
});
