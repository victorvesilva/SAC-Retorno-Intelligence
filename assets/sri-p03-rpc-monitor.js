/* Measurements contain elapsed time and outcome only. RPC arguments and replies
 * remain in their original call path. PostgREST chaining is preserved. */
(()=>{
 'use strict';
 const clients=new WeakSet();
 const instrument=client=>{
  if(!client||clients.has(client)||typeof client.rpc!=='function')return client;
  clients.add(client);
  const rpc=client.rpc.bind(client);
  client.rpc=function(name,...args){
   const started=performance.now(),request=rpc(name,...args);
   if(name==='sri_monitor_write'||name==='sri_p03_rpc_measure'||!request?.then)return request;
   const then=request.then.bind(request);
   let recorded=false;
   const record=failed=>{
    if(recorded)return;recorded=true;
    const duration=Math.min(600000,Math.max(0,Math.round(performance.now()-started)));
    Promise.resolve(rpc('sri_p03_rpc_measure',{p_duration:duration,p_failed:failed})).catch(()=>{});
    if(failed)window.sriMonitorEvent?.('ERROR','RPC_ERROR','Supabase');
   };
   request.then=function(resolve,reject){
    return then(result=>{record(Boolean(result?.error));return resolve?resolve(result):result;},
     error=>{record(true);if(reject)return reject(error);throw error;});
   };
   return request;
  };
  return client;
 };
 const getter=window.sriGetSupabaseClient;
 if(typeof getter==='function'){
  window.sriGetSupabaseClient=async(...args)=>instrument(await getter(...args));
 }
})();
