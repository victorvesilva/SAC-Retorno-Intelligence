/* One-time maintenance. Config contains a short-lived database-scoped token; never commit it. */
import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const settings=await fetch('https://sac-intelligence.vercel.app/api/supabase-config').then(r=>r.json());
if(settings.url!=='https://djjgvvzmopehatdsnlnd.supabase.co')throw Error('Unexpected project');
const endpoint=settings.url+'/functions/v1/sri-index-import';
for(const [i,snapshot] of config.snapshots.entries()){
 let ready=false;
 for(let attempt=0;attempt<3&&!ready;attempt++){
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',apikey:settings.publishableKey},body:JSON.stringify({snapshot_id:snapshot,backfill_token:config.token}),signal:AbortSignal.timeout(60000)});
  const result=await response.json();if(!response.ok)throw Error('Preparação falhou: HTTP '+response.status+' '+(result.error||''));
  ready=result.ready===true;if(!ready)await new Promise(r=>setTimeout(r,1000));
 }
 if(!ready)throw Error('Preparation still running');
 console.log('PASS importação '+(i+1)+'/'+config.snapshots.length+' preparada');
}
const denied=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({snapshot_id:config.snapshots[0]})});
if(denied.status!==401)throw Error('Unauthenticated request was not rejected');
console.log('PASS acesso sem sessão rejeitado');
