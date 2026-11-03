import {encodeArchive,MAX_ARCHIVE_BYTES} from './archive.js';
import {explainError} from './messages.js';
export function mountArchivePanel(session,{run}){
 const $=id=>document.getElementById(id),status=t=>$('paperArchiveStatus').textContent=t;
 let prepared=null,selected=null,selection=0,saving=false;
 const paused=view=>!view.active&&!['Pronto para simulação','Aguardando dados'].includes(view.state);
 const controls={render(view,busy){const allowed=paused(view)&&!busy;$('paperArchivePrepare').disabled=!allowed||!view.wallet;$('paperArchiveSave').disabled=!allowed||!prepared||saving;$('paperArchiveFile').disabled=!allowed;$('paperArchiveConfirm').disabled=!allowed||!selected;$('paperArchiveImport').disabled=!allowed||!selected||!$('paperArchiveConfirm').checked}};
 function refresh(){controls.render(session.view(),false)}
 $('paperArchivePrepare').addEventListener('click',()=>run(async()=>{
  prepared=null;status('Preparando cópia integral e verificando todos os eventos…');
  try{const archive=await session.backup(),text=encodeArchive(archive);prepared={file:new File([text],'radar-copia-'+Date.now()+'.json',{type:'application/json'}),version:archive.journal.version,checksum:archive.journal.checksum};status('Cópia verificada preparada: '+prepared.version+' eventos · checksum '+prepared.checksum+'. Toque em Salvar e depois confira o arquivo em Arquivos. Isso não libera espaço no diário.')}catch(error){status(explainError(error));throw error}
 }));
 $('paperArchiveSave').addEventListener('click',async()=>{
  if(!prepared||!paused(session.view()))return;saving=true;refresh();
  try{
   if(navigator.canShare?.({files:[prepared.file]})&&typeof navigator.share==='function'){await navigator.share({files:[prepared.file],title:'Cópia do diário fictício Radar'});status('Compartilhamento concluído pelo navegador. Confira o arquivo em Arquivos e selecione-o abaixo para verificar.');}
   else {const url=URL.createObjectURL(prepared.file),a=document.createElement('a');a.href=url;a.download=prepared.file.name;a.style.display='none';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);status('Download solicitado. O Radar não consegue confirmar a gravação em Arquivos. Selecione a cópia abaixo para verificar sua integridade.');}
  }catch(error){status(error.name==='AbortError'?'Compartilhamento cancelado. A cópia preparada continua disponível para salvar.':explainError(error))}finally{saving=false;refresh()}
 });
 $('paperArchiveFile').addEventListener('change',()=>{
  const token=++selection,file=$('paperArchiveFile').files?.[0];selected=null;$('paperArchiveConfirm').checked=false;
  void run(async()=>{try{
   if(!file){status('Nenhum arquivo selecionado.');return}if(file.size>MAX_ARCHIVE_BYTES)throw {code:'ARCHIVE_SIZE'};
   status('Verificando o arquivo completo…');const info=await session.inspectBackup(await file.text());if(token!==selection)return;selected=info;
   status((info.legacy?'Exportação antiga verificada; resumo importado será recalculado. ':'Arquivo e manifesto verificados. ')+info.journal.version+' eventos · saldo e risco serão reconstruídos do diário. SHA-256 '+info.digest+'. Verificar não restaura nem ativa a sessão.');
  }catch(error){if(token===selection)status(explainError(error));throw error}});
 });
 $('paperArchiveConfirm').addEventListener('change',()=>refresh());
 $('paperArchiveImport').addEventListener('click',()=>run(async()=>{
  try{const result=await session.importBackup(selected,{confirmed:$('paperArchiveConfirm').checked});prepared=null;selected=null;$('paperArchiveConfirm').checked=false;status(result.status==='unchanged'?'Esta cópia já está preservada; nenhum evento ou saldo foi duplicado.':'Restauração verificada: '+result.version+' eventos. A sessão continua desativada; valide a fonte e ative manualmente.');}
  catch(error){status(explainError(error));throw error}
 }));
 return controls;
}
