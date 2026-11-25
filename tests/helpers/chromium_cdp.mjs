/* Native Chromium CDP harness: accurate viewport and visible-surface screenshots. */
import {spawn} from 'node:child_process';
export async function startChromium(chrome,profile){
 const child=spawn(chrome,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--disable-background-networking','--allow-file-access-from-files','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{let stderr='';const timeout=setTimeout(()=>reject(Error('Chromium CDP startup timed out')),15000);
  child.once('error',reject);child.stderr.on('data',chunk=>{stderr+=chunk;const match=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(match){clearTimeout(timeout);resolve(match[1]);}});child.once('exit',code=>{clearTimeout(timeout);reject(Error('Chromium exited '+code));});});
 const ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 let nextId=0;const pending=new Map();
 ws.addEventListener('message',event=>{const data=JSON.parse(event.data);const request=pending.get(data.id);if(!request)return;pending.delete(data.id);clearTimeout(request.timeout);if(data.error)request.reject(Error(JSON.stringify(data.error)));else request.resolve(data.result);});
 const send=(method,params={},sessionId)=>new Promise((resolve,reject)=>{const id=++nextId;const timeout=setTimeout(()=>{pending.delete(id);reject(Error('CDP timed out: '+method));},15000);pending.set(id,{resolve,reject,timeout});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));});
 return {
  async page(url,width,height){
   const {targetId}=await send('Target.createTarget',{url:'about:blank'});const {sessionId}=await send('Target.attachToTarget',{targetId,flatten:true});
   const command=(method,params)=>send(method,params,sessionId);
   await command('Page.enable');await command('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await command('Page.bringToFront');await command('Page.navigate',{url});
   return {
    async evaluate(expression){const result=await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(result.exceptionDetails.text+': '+result.exceptionDetails.exception?.description);return result.result?.value;},
    async waitFor(expression){for(let attempt=0;attempt<150;attempt++){const result=await this.evaluate(expression);if(result)return result;await new Promise(resolve=>setTimeout(resolve,30));}throw Error('Page condition timed out');},
    async screenshot(){await command('Page.bringToFront');await command('Runtime.evaluate',{expression:'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))',awaitPromise:true});const result=await command('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:false});return Buffer.from(result.data,'base64');},
    close:()=>send('Target.closeTarget',{targetId})
   };
  },
  async close(){try{await send('Browser.close');}catch(_){}ws.close();child.kill();}
 };
}
