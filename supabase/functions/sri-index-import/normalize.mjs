export function normalizeImport(payload,fallback){
 if(!Array.isArray(payload?.source))throw Error('Missing source');
 const fields=['status','statusDesc','bko','area','agente','limite','envio','filial'],groups=new Map();
 for(const source of payload.source){const protocol=String(source.id||'');if(!protocol||protocol.length>80)throw Error('Invalid protocol');const row=Object.fromEntries(fields.map(f=>[f,source[f]??null])),group=groups.get(protocol)||new Map();group.set(JSON.stringify(row),row);groups.set(protocol,group);}
 const rows=[...groups].map(([protocol,group])=>({protocol,rows:[...group.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([,row])=>row)}));
 const date=new Date(payload.importedAt||payload.savedAt||fallback);if(!Number.isFinite(+date))throw Error('Invalid date');
 return {rows,imported:date.toISOString()};
}
