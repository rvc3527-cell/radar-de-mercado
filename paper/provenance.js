import {verifyAnyProtocol} from '../lab/protocol.js';
import {freeze} from '../lab/contracts.js';
import {canonical,digest} from './integrity.js';
import {invariant} from './money.js';
export async function checkedProtocol(input,runtimeHashes){
 const p=await verifyAnyProtocol(input);invariant(p.format==='radar-protocol-v76','PROTOCOL_VERSION');
 invariant(runtimeHashes&&canonical(p.codeHashes)===canonical(runtimeHashes),'PROTOCOL_RUNTIME_MISMATCH');return p;
}
export async function createBinding({protocol,runtimeHashes,config,origin,activatedAt,startedAt}){
 const p=await checkedProtocol(protocol,runtimeHashes),w=p.windows.final;
 invariant(canonical(config)===canonical(p.config)&&origin===p.origin,'PROTOCOL_CONTEXT');
 invariant(Number.isSafeInteger(activatedAt)&&Number.isSafeInteger(startedAt)&&activatedAt>=w[0]&&startedAt>=activatedAt&&startedAt<w[1]&&startedAt-w[0]<=p.activationGraceMs,'PROTOCOL_WINDOW');
 const body={schema:'radar-session-binding-v76',protocolId:p.protocolId,protocolVersion:p.protocolVersion,manifestSha256:p.seal,protocol:p,executedCodeHashes:{...runtimeHashes},strategy:p.strategy,policy:p.policy,instrument:p.instrument,config:p.config,window:w,activatedAt,startedAt,codeTrust:'runtime-manifest-host-checked',clockTrust:'client-declared',independentAnteriority:false};
 const binding=freeze({...body,seal:await digest(body)});invariant(JSON.stringify(binding).length<14000,'PROTOCOL_SIZE');return binding;
}
export async function verifyBinding(binding,{config,origin,startedAt,endsAt,strategy,policy,instrument}){
 invariant(binding?.schema==='radar-session-binding-v76','PROVENANCE_MISSING');
 const expected=await createBinding({protocol:binding.protocol,runtimeHashes:binding.executedCodeHashes,config,origin,activatedAt:binding.activatedAt,startedAt});
 invariant(canonical(binding)===canonical(expected)&&endsAt===binding.window[1]&&strategy===binding.strategy&&policy===binding.policy&&canonical(instrument)===canonical(binding.instrument),'PROVENANCE_MISMATCH');
 return {linked:true,protocolId:binding.protocolId,manifestSha256:binding.manifestSha256,independentAnteriority:false,finalValidationAllowed:false,limitation:'Vínculo local íntegro; relógio e código declarados pelo host, sem atestação independente.'};
}
