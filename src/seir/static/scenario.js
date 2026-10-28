"use strict";

const Scenario = (() => {
  const sectors = ["tarqui", "eloy_alfaro", "los_esteros", "manta_centro", "murcielago", "barbasquillo", "san_mateo"];
  const storageKey = "weezing.scenarios.v1";
  const copy = value => JSON.parse(JSON.stringify(value));
  function defaults() {
    return {n:1000, days:60, seed:42, beta:.03, sigma:.2, gamma:.1, degree:8,
      initial_state:{s:993,e:0,i:7,r:0}, initial:{tarqui:5,los_esteros:2}, initial_ids:null,
      all_s_import:true, intervention:{mode:"dynamic",efficacy:.8,delay:0,quota:30,k_max:400},
      volunteers:{enlist:.12,reinfection:.04}, include_frames:true};
  }
  function validate(config) {
    const fail = message => { throw new Error(message); };
    const number = (x, min, max, integer=false) => typeof x === "number" && Number.isFinite(x) && x >= min && x <= max && (!integer || Number.isInteger(x));
    if (!config || typeof config !== "object") fail("Escenario inválido.");
    const counts = config.initial_state;
    if (!counts || !["s","e","i","r"].every(key => number(counts[key],0,2000,true))) fail("S, E, I y R deben ser enteros no negativos.");
    if (!number(config.n,7,2000,true) || counts.s+counts.e+counts.i+counts.r !== config.n) fail("S + E + I + R debe definir N entre 7 y 2000.");
    for (const [key,min,max,integer] of [["days",0,90,true],["seed",0,4294967295,true],["beta",0,1],["sigma",0,1],["gamma",0,1],["degree",0,Math.min(50,config.n-1)]]) {
      if (!number(config[key],min,max,integer)) fail(`Parámetro inválido: ${key}.`);
    }
    const foci = config.initial;
    if (!foci || Array.isArray(foci) || typeof foci !== "object") fail("Focos inválidos.");
    for (const [sector,count] of Object.entries(foci)) {
      const index = sectors.indexOf(sector);
      const capacity = Math.floor(config.n/7)+(index<config.n%7 ? 1 : 0);
      if (index<0 || !number(count,0,capacity,true)) fail(`Foco inválido o sin capacidad: ${sector}.`);
    }
    if (Object.values(foci).reduce((a,b)=>a+b,0)>counts.i) fail("La suma de focos no puede superar I.");
    if (config.initial_ids !== null) fail("El editor utiliza focos por sector, no IDs manuales.");
    const intervention = config.intervention;
    if (!intervention || !["dynamic","static"].includes(intervention.mode)) fail("Asignación inválida.");
    for (const [key,max,integer] of [["efficacy",1],["delay",90,true],["quota",2000,true],["k_max",Math.floor(.4*config.n),true]]) {
      if (!number(intervention[key],0,max,integer)) fail(`Campaña inválida: ${key}.`);
    }
    if (!config.volunteers || !["enlist","reinfection"].every(key=>number(config.volunteers[key],0,1))) fail("Parámetros de brigadistas inválidos.");
    if (typeof config.include_frames!=="boolean" || typeof config.all_s_import!=="boolean") fail("Opciones de escenario inválidas.");
    return copy(config);
  }
  function basePresets() {
    const base = defaults();
    return [
      {name:"Escenario base",config:base},
      {name:"Solo susceptibles · importación día 1",config:{...defaults(),initial_state:{s:1000,e:0,i:0,r:0},initial:{}}},
      {name:"Estados mixtos",config:{...defaults(),initial_state:{s:950,e:20,i:10,r:20},initial:{tarqui:5,los_esteros:2}}},
    ];
  }
  function readPresets(storage) {
    try {
      if (!storage) throw new Error("Almacenamiento no disponible.");
      const raw = storage.getItem(storageKey);
      if (raw === null) return {ok:true,presets:[]};
      const stored = JSON.parse(raw);
      if (stored.version!==1 || !Array.isArray(stored.presets) || stored.presets.length>50) throw new Error("Formato de escenarios no compatible.");
      const names = new Set();
      const presets = stored.presets.map(item=>{
        if (typeof item.name!=="string" || !item.name.trim() || item.name.length>80 || names.has(item.name)) throw new Error("Nombre de escenario inválido.");
        names.add(item.name);
        return {name:item.name,config:validate(item.config)};
      });
      return {ok:true,presets};
    } catch (error) { return {ok:false,presets:[],error:"No se pudieron leer los escenarios guardados. No se modificaron los datos."}; }
  }
  function savePreset(storage, name, config) {
    try {
      const loaded = readPresets(storage);
      if (!loaded.ok) return loaded;
      name = name.trim();
      if (!name || name.length>80) throw new Error("Escribe un nombre de 1 a 80 caracteres.");
      if (loaded.presets.length>=50) throw new Error("Se alcanzó el límite de 50 escenarios.");
      if ([...basePresets(),...loaded.presets].some(item=>item.name===name)) throw new Error("Ya existe un escenario con ese nombre.");
      const presets = [...loaded.presets,{name,config:validate(config)}];
      storage.setItem(storageKey,JSON.stringify({version:1,presets}));
      return {ok:true,presets};
    } catch (error) { return {ok:false,error:error.message || "No se pudo guardar el escenario."}; }
  }
  return {defaults,validate,basePresets,readPresets,savePreset};
})();
if (typeof module !== "undefined") module.exports = Scenario;
