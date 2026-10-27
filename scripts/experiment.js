import {writeFileSync,mkdirSync} from 'node:fs';
import {DEFAULTS,compare} from '../src/engine.js';
const result=compare({...DEFAULTS});
mkdirSync('docs',{recursive:true});
writeFileSync('docs/resultado-referencia.json',JSON.stringify({version:result.version,config:result.config,metrics:result.metrics},null,2)+'\n');
for(const [strategy,m]of Object.entries(result.metrics))console.log(`${strategy}: infectados=${m.infected.mean}, evitadas=${m.prevented.mean}, dosis=${m.doses}`);
