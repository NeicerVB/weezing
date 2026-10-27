import {compare} from './engine.js';
self.onmessage=({data})=>{try{const result=compare(data,(done,total)=>self.postMessage({type:'progress',done,total}));self.postMessage({type:'result',result});}catch(e){self.postMessage({type:'error',message:e.message});}};
