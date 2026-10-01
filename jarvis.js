let engine = null;
let loading = false;
let messages = [];
let current = null;
let introShown = false;
const modelIds = ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC','Llama-3.2-1B-Instruct-q4f16_1-MLC'];
const panel = document.getElementById('jarvisPanel');
const output = document.getElementById('jarvisMessages');
const input = document.getElementById('jarvisInput');
const send = document.getElementById('jarvisSend');
const loadButton = document.getElementById('jarvisLoad');
const status = document.getElementById('jarvisStatus');
const title = document.getElementById('jarvisTitle');
function setStatus(text){ if(status) status.textContent=text; }
function greet(){ if(introShown)return; introShown=true; const text='Hi, I am your universal Engineer, what you working on ?'; add('assistant',text); if(window.voiceReplies) speak(text); }
function add(role,text){ const el=document.createElement('div'); el.className='jarvis-msg '+role; el.textContent=text; output.appendChild(el); output.scrollTop=output.scrollHeight; }
function contextFor(machine){
  if(!machine) return 'No machine has been selected yet.';
  const docs=(machine.documents||[]).map(x=>x.path).join('\n') || (machine.manuals||[]).join('\n');
  const engineering=(machine.engineering||[]).join('; ');
  return `Selected machine: ${machine.name}\nModel: ${machine.model}\nCategory: ${machine.category}\nCapacity: ${machine.speed}\nDescription: ${machine.description}\nOfficial source: ${machine.source}\nManuals and flipbooks: ${docs||'No local manual link recorded yet.'}\nDocumented engineering content: ${engineering||'Not yet extracted from the approved public documents.'}\nAsset status: ${machine.assetStatus||'Conceptual model'}\nModel dimensions (conceptual only): ${JSON.stringify(machine.model3d?.dimensions||{})}
Installation profile: ${JSON.stringify(machine.installationProfile||{})}
Parts profile: ${JSON.stringify(machine.partsProfile||{})}`;
}
async function loadEngine(){
  if(engine||loading)return;
  loading=true; loadButton.disabled=true; setStatus('Downloading free local model… first load may be large');
  try{
    const webllm=await import('https://esm.run/@mlc-ai/web-llm');
    let lastError;
    for(const modelId of modelIds){
      try { engine=await webllm.CreateMLCEngine(modelId,{initProgressCallback:p=>{ if(p?.text) setStatus(p.text); }}); break; }
      catch(e){ lastError=e; console.warn('Jarvis model unavailable',modelId,e); }
    }
    if(!engine) throw lastError || new Error('No supported local model');
    setStatus('Jarvis ready · runs locally in this browser');
    add('assistant','Jarvis is ready. I can explain the selected product using the verified engineering record and approved document context. I will clearly identify anything not documented.');
  }catch(e){ console.error(e); setStatus('Local model unavailable on this device.'); add('assistant','The browser model is unavailable on this device. Use a supported Chrome/Edge WebGPU browser or configure the secure Gemini/OpenAI provider.'); }
  finally{loading=false;loadButton.disabled=false;}
}
async function remoteAsk(question){
  try{
    const reply=await fetch('/api/jarvis',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({system:`You are Jarvis, a cautious packaging-machinery service assistant. Use the selected machine context below and general safety principles. Never invent part numbers, dimensions, wiring terminals, pressure, torque, fault codes or service steps. If documentation is missing, say so. For electrical/pneumatic/mechanical work, include lockout/tagout and qualified-person warnings. Keep responses practical and structured.\n\n${contextFor(current)}`,messages:[...messages.slice(-8),{role:'user',content:question}]})});
    if(!reply.ok)return null;
    const data=await reply.json();return data.text?data:null;
  }catch(e){console.info('Remote Jarvis unavailable; using local fallback',e);return null}
}
async function ask(){
  const question=input.value.trim(); if(!question)return;
  input.value=''; add('user',question); send.disabled=true; setStatus('Connecting to Jarvis…');
  try{
    const remote=await remoteAsk(question);
    if(remote){add('assistant',remote.text);messages.push({role:'user',content:question},{role:'assistant',content:remote.text});setStatus(`Jarvis ready · ${remote.provider||'secure server model'}`);return;}
    if(!engine){add('assistant','The secure Jarvis provider is unavailable right now. You can press “Load free local AI model” to try the browser model manually, or continue using the source records.');setStatus('Remote provider unavailable · local model not started automatically');return;}
    setStatus('Jarvis is thinking locally…');
    const system=`You are Jarvis, a cautious packaging-machinery service assistant inside CROWN ENGINEERS LTD SYSTEM. Use only the selected product context below and general safety principles. Never invent a part number, dimension, wiring terminal, pressure, torque, fault code, or service step. If the approved documents do not provide an answer, say that it is not documented and recommend checking the approved manual or a qualified engineer. For maintenance or electrical/pneumatic work, provide a clear safety warning and lockout/tagout reminder before steps. Keep answers structured and practical.\n\n${contextFor(current)}`;
    const reply=await engine.chat.completions.create({messages:[{role:'system',content:system},...messages.slice(-8),{role:'user',content:question}],temperature:0.2,max_tokens:450});
    const text=reply.choices?.[0]?.message?.content||'No response was generated.';add('assistant',text);messages.push({role:'user',content:question},{role:'assistant',content:text});setStatus('Jarvis ready · local browser model');
  }catch(e){console.error(e);add('assistant','I could not complete that response. Try again or use the linked approved manual.');setStatus('Jarvis response error');}
  finally{send.disabled=false;}
}
window.setJarvisMachine=function(machine){greet();current=machine; title.textContent='UNIVERSAL ENGINEER · '+machine.name; panel.classList.add('open'); add('assistant',`Product context loaded: ${machine.name} (${machine.model}). Ask me about documented operation, service, parts, electrical, pneumatic systems, or the manual.`);};
document.getElementById('homeJarvis')?.addEventListener('click',()=>{greet();panel.classList.add('open')});
greet();
loadButton?.addEventListener('click',loadEngine);send?.addEventListener('click',ask);input?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();ask();}});document.getElementById('jarvisClose')?.addEventListener('click',()=>panel.classList.remove('open'));

// Voice interface: browser speech recognition for input and speech synthesis for replies.
let voiceRecognition=null, voiceOn=false;
function speak(text){if('speechSynthesis' in window){speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text);u.rate=.98;u.pitch=1;speechSynthesis.speak(u)}}
function toggleVoice(){const Speech=window.SpeechRecognition||window.webkitSpeechRecognition;if(!Speech){setStatus('Voice input is not supported in this browser. Use Chrome or Edge.');return}if(voiceOn){voiceRecognition?.stop();voiceOn=false;voiceButton.textContent='🎙 Talk';return}voiceRecognition=new Speech();voiceRecognition.lang='en-GB';voiceRecognition.interimResults=false;voiceRecognition.onstart=()=>{voiceOn=true;voiceButton.textContent='Listening…';setStatus('Listening for your Jarvis question…')};voiceRecognition.onresult=e=>{input.value=e.results[0][0].transcript;ask()};voiceRecognition.onerror=()=>{voiceOn=false;voiceButton.textContent='🎙 Talk';setStatus('Voice input stopped. Try again.')};voiceRecognition.onend=()=>{voiceOn=false;voiceButton.textContent='🎙 Talk'};voiceRecognition.start()}
const voiceButton=document.getElementById('jarvisVoice');voiceButton?.addEventListener('click',toggleVoice);
const oldAdd=add;add=function(role,text){oldAdd(role,text);if(role==='assistant'&&window.voiceReplies) speak(text)};
