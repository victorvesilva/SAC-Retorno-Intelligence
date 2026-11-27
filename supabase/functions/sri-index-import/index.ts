import {createClient} from 'npm:@supabase/supabase-js@2.49.8';
import {normalizeImport} from './normalize.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version','Cache-Control':'no-store'};
Deno.serve(async request=>{
 if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
 const reply=(status:number,value:unknown)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json'}});
 if(request.method!=='POST')return reply(405,{error:'Método indisponível'});
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
 const authorization=request.headers.get('Authorization')||'';
 const reader=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const admin=createClient(url,key,{auth:{persistSession:false}});
 let snapshot:string|undefined,job:string|undefined;
 try{
  const input=await request.json();snapshot=input.snapshot_id;
  if(typeof snapshot!=='string'||!/^[-a-f0-9]{36}$/i.test(snapshot))return reply(400,{error:'Apuração inválida'});
  const backfill=typeof input.backfill_token==='string';
  if(typeof input.backfill_token==='string'){
   const allowed=await admin.rpc('sri_import_index_backfill_authorized',{p_token:input.backfill_token,p_snapshot:snapshot});
   if(allowed.error||allowed.data!==true)return reply(403,{error:'Preparação não autorizada'});
   // Short-lived capability is verified again by the dedicated maintenance reader.
  }else{
   const auth=await reader.auth.getUser(authorization.replace(/^Bearer\s+/i,''));if(auth.error||!auth.data.user)return reply(401,{error:'Sessão indisponível'});
   const p=await reader.from('profiles').select('role').eq('id',auth.data.user.id).single();if(p.error||!['admin','manager','supervisor','assistant'].includes(p.data?.role))return reply(403,{error:'Acesso indisponível'});
  }
  const metadata=backfill?await admin.rpc('sri_import_index_backfill_snapshot',{p_token:input.backfill_token,p_snapshot:snapshot,p_payload:false}):await reader.from('daily_result_snapshots').select('payload_sha256,created_at').eq('id',snapshot).single();
  if(metadata.error||!metadata.data)return reply(404,{error:'Apuração indisponível'});
  const begin=await admin.rpc('sri_import_index_start',{p_snapshot:snapshot,p_hash:metadata.data.payload_sha256});if(begin.error)throw Error('index');
  if(begin.data.ready||begin.data.busy)return reply(200,begin.data);
  job=begin.data.job;
  const q=backfill?await admin.rpc('sri_import_index_backfill_snapshot',{p_token:input.backfill_token,p_snapshot:snapshot,p_payload:true}):await reader.from('daily_result_snapshots').select('payload_gzip').eq('id',snapshot).single();if(q.error||!q.data)throw Error('snapshot');
  const bytes=Uint8Array.from(atob(q.data.payload_gzip),c=>c.charCodeAt(0));
  const payload=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  const {rows,imported}=normalizeImport(payload,metadata.data.created_at);
  for(let offset=0;offset<rows.length;offset+=1000){const out=await admin.rpc('sri_import_index_batch',{p_snapshot:snapshot,p_job:job,p_rows:rows.slice(offset,offset+1000)});if(out.error)throw Error('batch');}
  const finish=await admin.rpc('sri_import_index_batch',{p_snapshot:snapshot,p_job:job,p_rows:[],p_final:true,p_total:rows.length,p_imported:imported});if(finish.error)throw Error('finish');
  return reply(200,{ready:true});
 }catch(_){if(snapshot&&job)await admin.rpc('sri_import_index_abort',{p_snapshot:snapshot,p_job:job});return reply(500,{error:'Não foi possível preparar o histórico. Tente novamente.'});}
});
