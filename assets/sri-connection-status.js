/* SAC Retorno Intelligence 2.0 — Indicador real de conexão com o Supabase.
 * Nunca infere "Online" pela presença de internet nem por ter importado CSVs.
 * A leitura autenticada do perfil é uma verificação remota, independente da apuração.
 */
(function(){
  'use strict';
  const byId=id=>document.getElementById(id);
  let remote='checking',lastVerifiedAt=null,lastCloudSaveAt=null,checking=false,generation=0;
  const fmt=at=>at?new Intl.DateTimeFormat('pt-BR',{
    timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit'
  }).format(new Date(at)):'';
  function resolveStatus({remote,online,busy,pending}){
    if(!online||remote==='failed')return {label:'Sem conexão',kind:'offline'};
    if(remote==='session')return {label:'Sessão necessária',kind:'session'};
    if(remote!=='ready')return {label:'Verificando...',kind:'checking'};
    if(busy)return {label:'Sincronizando',kind:'syncing'};
    if(pending)return {label:'Pendente',kind:'pending'};
    return {label:'Online',kind:'online'};
  }
  // Função determinística para testes, sem fazer rede.
  window.sriResolveConnectionDisplay=resolveStatus;
  function localState(){
    try{return window.sriGetCloudSyncState?.()||{}}catch(_){return {}}
  }
  function render(){
    const chip=byId('sri-connection-chip'),label=byId('connection-text');
    if(!chip||!label)return;
    const sync=localState();
    if(sync.lastSaveAt)lastCloudSaveAt=sync.lastSaveAt;
    const display=resolveStatus({
      remote,online:navigator.onLine!==false,
      busy:Boolean(sync.busy),pending:Boolean(sync.pending)
    });
    if(label.textContent!==display.label)label.textContent=display.label;
    chip.dataset.connection=display.kind;
    let info=display.kind==='online'
      ?'Comunicação autenticada com o Supabase verificada.'
      :display.kind==='syncing'?'Atualização ou carregamento em andamento.'
      :display.kind==='pending'?'Há alterações locais ainda não confirmadas no Supabase.'
      :display.kind==='session'?'Entre na sua conta para validar a conexão com o Supabase.'
      :display.kind==='offline'?'Não foi possível validar a comunicação com o Supabase.'
      :'Conferindo a sessão e o acesso remoto ao Supabase.';
    if(lastVerifiedAt)info+=' Última verificação: '+fmt(lastVerifiedAt)+'.';
    if(lastCloudSaveAt)info+=' Última gravação confirmada nesta sessão: '+fmt(lastCloudSaveAt)+'.';
    chip.title=info;
    chip.setAttribute('aria-label',display.label+'. '+info);
  }
  async function probe(){
    if(checking)return;
    const sequence=++generation;
    if(navigator.onLine===false){remote='failed';render();return;}
    if(typeof window.sriGetSupabaseClient!=='function'){
      remote='checking';render();return;
    }
    checking=true;
    if(remote!=='ready')remote='checking';
    render();
    try{
      const client=await window.sriGetSupabaseClient();
      const {data:sessionData,error:sessionError}=await client.auth.getSession();
      if(sequence!==generation)return;
      if(sessionError)throw sessionError;
      const userId=sessionData?.session?.user?.id;
      if(!userId){remote='session';return;}
      // Requisição real ao banco: não confundir navegador online com serviço saudável.
      const outcome=await Promise.race([
        client.from('profiles').select('id').eq('id',userId).maybeSingle(),
        new Promise(resolve=>setTimeout(()=>resolve({timeout:true}),12000))
      ]);
      if(sequence!==generation)return;
      if(outcome.timeout)throw Error('Tempo esgotado para confirmar o Supabase');
      if(outcome.error){
        if(outcome.error.status===401||outcome.error.status===403){
          remote='session';return;
        }
        throw outcome.error;
      }
      remote=outcome.data?.id===userId?'ready':'session';
      if(remote==='ready')lastVerifiedAt=new Date().toISOString();
    }catch(e){
      if(sequence===generation){
        remote='failed';
        console.warn('[Conexão Supabase] Verificação remota indisponível:',e?.message||String(e));
      }
    }finally{checking=false;render();}
  }
  function start(){
    render();
    probe();
    setInterval(render,1300);
    setInterval(()=>{if(!document.hidden)void probe()},45000);
    window.addEventListener('online',()=>{remote='checking';void probe()});
    window.addEventListener('offline',()=>{remote='failed';render()});
    window.addEventListener('focus',()=>{void probe()});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)void probe()});
    window.addEventListener('sri-cloud-saved',e=>{
      if(e.detail?.at)lastCloudSaveAt=e.detail.at;
      render();
    });
    const obs=new MutationObserver(mutations=>{
      if(mutations.some(m=>m.attributeName==='class'))void probe();
    });
    obs.observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
