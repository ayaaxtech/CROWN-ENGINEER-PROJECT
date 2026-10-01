import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||10000);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gltf':'model/gltf+json','.bin':'application/octet-stream','.pdf':'application/pdf','.wasm':'application/wasm','.svg':'image/svg+xml'};
const json=(res,data,status=200)=>{res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(data))};
const MAX_BODY_BYTES=8*1024*1024;
async function body(req){let size=0;let s='';for await(const c of req){size+=c.length;if(size>MAX_BODY_BYTES)throw Object.assign(new Error('Request body is too large.'),{status:413});s+=c}try{return JSON.parse(s||'{}')}catch{throw Object.assign(new Error('Request body must be valid JSON.'),{status:400})}}

const preferredGemini=['gemini-2.5-flash','gemini-2.5-flash-lite','gemini-2.0-flash','gemini-2.0-flash-lite','gemini-1.5-flash'];
const cleanModel=name=>String(name||'').replace(/^models\//,'').trim();
async function geminiModels(key){
  const requested=cleanModel(process.env.GEMINI_MODEL);
  try{
    const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    const j=await r.json().catch(()=>({}));
    if(r.ok){
      const available=(j.models||[]).filter(m=>(m.supportedGenerationMethods||[]).includes('generateContent')).map(m=>cleanModel(m.name));
      const ordered=[requested,...preferredGemini,...available].filter(Boolean);
      return [...new Set(ordered.filter(model=>available.length===0||available.includes(model)))];
    }
  }catch{}
  return [...new Set([requested,...preferredGemini].filter(Boolean))];
}
async function geminiGenerate(key,model,payload){
  return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
}
async function jarvis(req,res){
  const payload=await body(req);const system=typeof payload.system==='string'?payload.system.slice(0,12000):'';const messages=Array.isArray(payload.messages)?payload.messages.slice(-12).filter(x=>x&&['user','assistant','system'].includes(x.role)&&typeof x.content==='string').map(x=>({role:x.role,content:x.content.slice(0,6000)})):[];
  if(!system || !messages.length) return json(res,{error:'A bounded system context and at least one message are required.'},400);
  const g=process.env.GEMINI_API_KEY;
  if(g){
    const models=await geminiModels(g);const contents=messages.map(x=>({role:x.role==='assistant'?'model':'user',parts:[{text:String(x.content)}]}));let last='';
    for(const model of models){try{
      const r=await geminiGenerate(g,model,{systemInstruction:{parts:[{text:system}]},contents,generationConfig:{temperature:.2,maxOutputTokens:900}});const j=await r.json().catch(()=>({}));
      if(r.ok){const text=j.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('').trim();if(text)return json(res,{text,provider:'Gemini '+model});last='Gemini returned no text';continue;}
      last=j.error?.message||`Gemini model ${model} returned ${r.status}`;
    }catch(e){last=e.message}}
    return json(res,{error:'Gemini provider rejected the request',detail:last,modelsTried:models},502);
  }
  const key=process.env.OPENAI_API_KEY;if(!key)return json(res,{error:'No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY on Render.'},503);
  const base=process.env.OPENAI_API_BASE||'https://api.openai.com/v1';const r=await fetch(base+'/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${key}`},body:JSON.stringify({model:process.env.JARVIS_MODEL||'gpt-4o-mini',temperature:.2,max_tokens:900,messages:[{role:'system',content:system},...messages]})});
  if(!r.ok)return json(res,{error:'OpenAI-compatible request failed'},502);const j=await r.json();const text=j.choices?.[0]?.message?.content?.trim();if(!text)return json(res,{error:'The assistant provider returned no text.'},502);return json(res,{text,provider:'OpenAI-compatible'});
}
async function identify(req,res){
  const {image,text='',catalog=[]}=await body(req);const g=process.env.GEMINI_API_KEY;
  const imageValue=String(image||'');const dataUrl=imageValue.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
  if(!dataUrl)return json(res,{error:'A valid JPEG, PNG, WebP, or GIF data URL is required.',confidence:'unknown',verified:false,results:[]},400);
  const mimeType=dataUrl[1].toLowerCase();const imageData=dataUrl[2].replace(/\s/g,'');
  if(imageData.length>7*1024*1024)return json(res,{error:'Image is too large. Use an image under 5 MB.',confidence:'unknown',verified:false,results:[]},413);
  if(!imageData || imageData.length<16)return json(res,{error:'Image data is empty or invalid.',confidence:'unknown',verified:false,results:[]},400);
  const knownCatalog=(Array.isArray(catalog)?catalog:[]).slice(0,40).map(x=>({id:String(x.id||''),model:String(x.model||''),name:String(x.name||'')}));
  const prompt=`Inspect this industrial nameplate or product image. OCR text already extracted by the browser: ${String(text).slice(0,5000)}. Local catalog candidates (use only if a model code is clearly visible in the image or OCR): ${JSON.stringify(knownCatalog)}. Return JSON only with these fields: manufacturer, modelCode, serialNumber, plateText (your best transcription of visible plate text), confidence (high/medium/low), evidence (quote the exact visible model-code text supporting a match), catalogMatch (a catalog id or model code only when the exact code is legible; otherwise null), query, and results (array of title, confidence, description, reason, url if known). Do not infer a serial number, exact model, part number, internal component location, or repair procedure from appearance alone. If uncertain, use null/empty fields and give only cautious candidates.`;
  if(g){
    const models=await geminiModels(g);let last='';
    for(const model of models){try{
      const r=await geminiGenerate(g,model,{contents:[{role:'user',parts:[{text:prompt},{inline_data:{mime_type: mimeType, data:imageData}}]}],generationConfig:{temperature:.1,maxOutputTokens:1600}});const e=await r.json().catch(()=>({}));
      if(!r.ok){last=e.error?.message||`HTTP ${r.status}`;continue}
      let raw=e.candidates?.[0]?.content?.parts?.map(x=>x.text||'').join('')||'{}';raw=raw.replace(/^```(?:json)?\s*|\s*```$/gi,'').trim();
      try{const parsed=JSON.parse(raw);const confidence=['high','medium','low'].includes(String(parsed.confidence||'').toLowerCase())?String(parsed.confidence).toLowerCase():'unknown';
        const exactEvidence=String(parsed.evidence||'').trim();const exactCode=String(parsed.modelCode||'').trim();
        const catalogMatch=confidence==='high'&&exactEvidence&&exactCode&&knownCatalog.some(x=>x.id===parsed.catalogMatch||x.model===parsed.catalogMatch||x.model===exactCode)?(parsed.catalogMatch||exactCode):null;
        return json(res,{manufacturer:String(parsed.manufacturer||'').slice(0,200),modelCode:exactCode.slice(0,200),serialNumber:String(parsed.serialNumber||'').slice(0,200),plateText:String(parsed.plateText||'').slice(0,5000),confidence,evidence:exactEvidence.slice(0,500),catalogMatch,verified:false,query:String(parsed.query||text).slice(0,500),results:Array.isArray(parsed.results)?parsed.results.slice(0,8).map(x=>({title:String(x?.title||'').slice(0,200),confidence:String(x?.confidence||'unknown').slice(0,30),description:String(x?.description||'').slice(0,1000),reason:String(x?.reason||'').slice(0,1000),url:typeof x?.url==='string'?x.url:''})):[],source:'Gemini '+model})}catch{return json(res,{query:String(text).slice(0,500),confidence:'unknown',verified:false,evidence:'',results:[],source:'Gemini '+model,error:'The visual provider returned an unreadable response. No machine was identified.'},502)}
    }catch(err){last=err.message}}
    return json(res,{error:'Gemini visual request failed',detail:last,modelsTried:models,results:[]},502);
  }
  return json(res,{error:'No visual AI provider is configured. OCR can still run locally, but machine identification remains unknown/unverified.',confidence:'unknown',verified:false,results:[]},503);
}
async function search(req,res){const q=new URL(req.url,'http://localhost').searchParams.get('q')?.trim()||'';if(!q)return json(res,{results:[]});const get=u=>fetch(u).then(r=>r.json());const [w,d,dd]=await Promise.allSettled([get(`https://en.wikipedia.org/w/rest.php/v1/search/page?q=${encodeURIComponent(q)}&limit=6`),get(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(q)}&language=en&format=json&limit=6&origin=*`),get(`https://api.duckduckgo.com/?q=${encodeURIComponent(q)}&format=json&no_html=1&skip_disambig=1`)]);const out=[];if(w.status==='fulfilled')for(const x of w.value.pages||[])out.push({source:'Wikipedia',title:x.title,description:x.description||x.excerpt||'',url:'https://en.wikipedia.org/wiki/'+encodeURIComponent((x.key||x.title).replaceAll(' ','_'))});if(d.status==='fulfilled')for(const x of d.value.search||[])out.push({source:'Wikidata',title:x.label||x.id,description:x.description||'',url:'https://www.wikidata.org/wiki/'+x.id});if(dd.status==='fulfilled'&&dd.value.AbstractText)out.unshift({source:'DuckDuckGo public index',title:dd.value.Heading||q,description:dd.value.AbstractText,url:dd.value.AbstractURL});return json(res,{query:q,results:out})}
const server=http.createServer(async(req,res)=>{try{const u=new URL(req.url,'http://localhost');if(u.pathname==='/health')return json(res,{ok:true,service:'crown-engineers',catalogAvailable:fs.existsSync(path.join(root,'data/catalog.json')),aiConfigured:Boolean(process.env.GEMINI_API_KEY||process.env.OPENAI_API_KEY)});if(u.pathname==='/api/jarvis'&&req.method==='POST')return await jarvis(req,res);if(u.pathname==='/api/global-identify'&&req.method==='POST')return await identify(req,res);if(u.pathname==='/api/global-search')return await search(req,res);let rel=decodeURIComponent(u.pathname);if(rel==='/'||rel==='')rel='/index.html';const file=path.resolve(root,'.'+rel);if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory())return res.writeHead(404).end('Not found');res.writeHead(200,{'content-type':mime[path.extname(file).toLowerCase()]||'application/octet-stream'});fs.createReadStream(file).pipe(res)}catch(e){console.error(e);json(res,{error:e.status?e.message:'Server error'},e.status||500)}});
server.listen(port,'0.0.0.0',()=>console.log(`Universal Engineer server listening on ${port}`));
