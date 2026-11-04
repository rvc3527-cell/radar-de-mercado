// Versioned extension. v7.5 protocol reader and catalog stay unchanged.
import {createProtocol,verifyProtocol,freeze} from './contracts.js';
import {CONFIRMED_TREND} from './confirmed-trend.js';
import {digest,canonical} from '../paper/integrity.js';
import {invariant} from '../paper/money.js';
export async function createProtocolV76(input){
 const legacy=await createProtocol(input);invariant(typeof input.protocolId==='string'&&/^[A-Za-z0-9:_.-]{1,100}$/.test(input.protocolId),'PROTOCOL_ID');
 for(const key of ['paper/config.js','paper/provenance.js','lab/protocol.js','lab/confirmed-trend.js','lab/offline.js'])invariant(/^[a-f0-9]{64}$/.test(input.codeHashes[key]),'PROTOCOL_CODE_HASH');
 const {seal,...base}=legacy,body={...base,format:'radar-protocol-v76',protocolId:input.protocolId,protocolVersion:'7.6',activationGraceMs:60000,candidate:CONFIRMED_TREND,anteriority:'client-declared-not-independent'};
 return freeze({...body,seal:await digest(body)});
}
export async function verifyAnyProtocol(input){if(input?.format!=='radar-protocol-v76')return verifyProtocol(input);const expected=await createProtocolV76(input);invariant(canonical(input)===canonical(expected),'PROTOCOL_SEAL');return expected}
