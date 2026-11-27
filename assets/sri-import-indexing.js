/* Preparation runs after publishing, outside the historical lookup. */
(()=>{'use strict';
const pending=new Map();
window.sriPrepareImportIndex=async(client,snapshot)=>{
 if(!snapshot||!client?.functions)return false;
 if(pending.has(snapshot))return pending.get(snapshot);
 const work=(async()=>{try{const r=await client.functions.invoke('sri-index-import',{body:{snapshot_id:snapshot}});if(r.error||!r.data?.ready)throw Error('Index pending');window.dispatchEvent(new CustomEvent('sri-import-index-ready'));return true;}catch(_){window.sriToast?.('Apuração salva. O histórico desta importação ainda está sendo preparado.','warning');return false;}finally{pending.delete(snapshot);}})();
 pending.set(snapshot,work);return work;
};
})();
