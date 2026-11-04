import {readFileSync,writeFileSync} from 'node:fs';
import '../indicators.js';
import {runOffline} from '../lab/offline.js';
const [input,output,phase='selection']=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/run-offline-v76.mjs INPUT.json NEW-output.json [development|selection|final]');
const result=await runOffline(JSON.parse(readFileSync(input,'utf8')),{phase});writeFileSync(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({output,origin:result.origin,decisions:result.decisions.length,financialComparison:result.comparison.financialAllowed}));
