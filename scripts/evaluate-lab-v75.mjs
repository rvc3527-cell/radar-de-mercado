// Offline, immutable evidence in; a NEW derived file out. No market/active wallet.
import {readFileSync,writeFileSync} from 'node:fs';
import {evaluate} from '../lab/evaluator.js';
const [source,output,protocolPath,phase]=process.argv.slice(2);
if(!source||!output)throw Error('Usage: node scripts/evaluate-lab-v75.mjs source.json NEW-report.json [protocol.json development|selection|final]');
const result=await evaluate(readFileSync(source,'utf8'),protocolPath?{protocol:JSON.parse(readFileSync(protocolPath,'utf8')),phase}:{});
writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,sessions:result.sessions.length,journalChecksum:result.journalChecksum,ranking:result.ranking}));
