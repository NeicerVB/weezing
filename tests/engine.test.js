import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULTS,makeWorld,simulate,compare,validate} from '../src/engine.js';
const base={...DEFAULTS,population:300,vaccines:30,repetitions:8};
test('misma configuración produce idéntica red, trayectorias y resumen',()=>{
  assert.deepEqual(compare(base),compare(base));
});
for(const model of ['SIR','SEIR'])for(const strategy of ['none','random','degree'])test(`${model}/${strategy}: conserva población, estados y presupuesto`,()=>{
  const c={...base,model},w=makeWorld(c),r=simulate(c,w,strategy,0,true);
  assert.equal(r.doses,strategy==='none'?0:c.vaccines);
  for(let d=0;d<r.history.length;d++){
    const h=r.history[d];assert.equal(h.S+h.E+h.I+h.R,c.population);
    assert.ok([h.S,h.E,h.I,h.R,h.ever].every(n=>Number.isInteger(n)&&n>=0));
    if(model==='SIR')assert.equal(h.E,0);
    if(d){assert.ok(h.ever>=r.history[d-1].ever);assert.ok(h.S<=r.history[d-1].S);assert.ok(h.R>=r.history[d-1].R);}
    assert.equal(r.frames[d].length,c.population);
  }
});
test('con cero dosis las tres políticas son idénticas en cada réplica',()=>{
  const c={...base,vaccines:0},r=compare(c);
  for(let i=0;i<c.repetitions;i++)for(const s of ['random','degree'])assert.deepEqual(r.runs.none[i].history,r.runs[s][i].history);
  assert.equal(r.metrics.degree.prevented.mean,0);
});
test('beta cero impide nuevos contagios',()=>{
  const c={...base,beta:0};const r=compare(c);
  for(const runs of Object.values(r.runs))for(const run of runs)assert.equal(run.history.at(-1).ever,c.initial);
});
test('vacuna eficaz protege a todos los susceptibles cuando hay dosis suficientes',()=>{
  const c={...base,vaccines:base.population-base.initial,efficacy:1};const w=makeWorld(c);
  for(const s of ['random','degree'])assert.equal(simulate(c,w,s).history.at(-1).ever,c.initial);
});
test('vacuna con eficacia cero gasta dosis pero no altera las infecciones',()=>{
  const c={...base,efficacy:0},r=compare(c);
  for(let i=0;i<c.repetitions;i++)for(const s of ['random','degree'])assert.equal(r.runs.none[i].history.at(-1).ever,r.runs[s][i].history.at(-1).ever);
});
test('dirigida vacuna los mayores grados elegibles',()=>{
  const w=makeWorld(base),r=simulate(base,w,'degree'),initial=new Set(w.initial);
  const chosen=w.degree.filter((_,i)=>r.vaccinated[i]),other=w.degree.filter((_,i)=>!r.vaccinated[i]&&!initial.has(i));
  assert.ok(Math.min(...chosen)>=Math.max(...other));
});
test('métrica de impacto usa diferencias emparejadas, sin truncar resultados',()=>{
  const r=compare(base);const diffs=r.runs.none.map((run,i)=>run.history.at(-1).ever-r.runs.degree[i].history.at(-1).ever);
  assert.equal(r.metrics.degree.prevented.mean,diffs.reduce((a,b)=>a+b,0)/diffs.length);
});
test('red no contiene bucles ni aristas repetidas y sus listas son simétricas',()=>{
  const w=makeWorld(base),keys=new Set();for(const [a,b]of w.edges){assert.notEqual(a,b);assert.ok(w.adjacency[a].includes(b)&&w.adjacency[b].includes(a));keys.add([a,b].sort((x,y)=>x-y).join('-'));}assert.equal(keys.size,w.edges.length);
});
test('rechaza recursos imposibles y parámetros no finitos',()=>{
  for(const override of [{vaccines:1000},{beta:NaN},{population:1},{repetitions:0},{seed:-1},{infectiousDays:Infinity}])assert.throws(()=>validate({...base,...override}));
});
