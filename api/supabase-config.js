// Vercel Function — expõe SOMENTE variáveis públicas exigidas pelo HTML.
// Não publicar service_role, SUPABASE_SECRET_KEY, JWT_SECRET nem senhas.
export default function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('X-Content-Type-Options','nosniff');
 if(!url||!publishableKey){return res.status(503).json({error:'Public Supabase config missing'});}
 if(!/^https:\/\//.test(url)||!/^sb_publishable_|^eyJ/.test(publishableKey))return res.status(503).json({error:'Invalid public Supabase config'});
 return res.status(200).json({url,publishableKey});
}
