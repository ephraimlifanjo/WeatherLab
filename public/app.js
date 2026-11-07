'use strict';
const $ = id => document.getElementById(id);
const icons = { clear:'☀️', mainly:'🌤️', clouds:'⛅', overcast:'☁️', fog:'🌫️', drizzle:'🌦️', rain:'🌧️', snow:'❄️', storm:'⛈️' };
const state = {
  city: JSON.parse(localStorage.getItem('wl-city') || 'null') || { name:'Douala', country:'Cameroon', lat:4.0511, lon:9.7679 },
  fahrenheit: localStorage.getItem('wl-unit') === 'f', weather:null,
  saved:JSON.parse(localStorage.getItem('wl-saved') || '[]'),
  visitor: localStorage.getItem('wl-visitor') || (crypto.randomUUID ? crypto.randomUUID() : 'visitor-' + Math.random().toString(36).slice(2) + Date.now().toString(36))
};
localStorage.setItem('wl-visitor', state.visitor);
const escapeHTML = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const key = c => Number(c.lat).toFixed(3) + '_' + Number(c.lon).toFixed(3);
const unit = n => Number.isFinite(Number(n)) ? Math.round(state.fahrenheit ? Number(n) * 9/5 + 32 : Number(n)) : '--';
const condition = (c, day = true) => {
  if (c === 0) return { text: day ? 'Clear skies' : 'Clear night', icon:day ? icons.clear : '🌙' };
  if (c === 1) return { text:'Mostly clear', icon:icons.mainly };
  if (c === 2) return { text:'Partly cloudy', icon:icons.clouds };
  if (c === 3) return { text:'Overcast', icon:icons.overcast };
  if ([45,48].includes(c)) return { text:'Foggy', icon:icons.fog };
  if ([51,53,55,56,57].includes(c)) return { text:'Light drizzle', icon:icons.drizzle };
  if ([61,63,65,66,67,80,81,82].includes(c)) return { text:'Rainy', icon:icons.rain };
  if ([71,73,75,77,85,86].includes(c)) return { text:'Snowy', icon:icons.snow };
  if ([95,96,99].includes(c)) return { text:'Thunderstorms', icon:icons.storm };
  return { text:'Variable conditions', icon:icons.clouds };
};
const dayName = (s, i) => i === 0 ? 'Today' : new Date(s+'T12:00:00').toLocaleDateString('en',{weekday:'short'});
const timeLabel = s => s ? s.slice(11,16) : '--:--';
let toastTimeout, searchTimer, requestId = 0;
function toast(message) { const e=$('toast');e.textContent=message;e.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>e.classList.remove('show'),3500); }
function reportError(message){$('error-banner').textContent=message;$('error-banner').hidden=false;}
function hideError(){$('error-banner').hidden=true;}
async function api(path, options={}) {
  const response=await fetch(path, { ...options, headers: {'x-visitor-id':state.visitor, ...(options.body ? {'Content-Type':'application/json'} : {}), ...(options.headers||{})} });
  let payload={};try {payload=await response.json();} catch {}
  if(!response.ok)throw new Error(payload.error||'Request failed ('+response.status+')');
  return payload;
}
async function openCity(city) {
  const seq=++requestId;
  state.city=city; localStorage.setItem('wl-city',JSON.stringify(city));
  $('hero-city').textContent=city.name + (city.country ? ', '+city.country : '');
  $('hero-description').textContent='Loading live conditions...';
  hideError();
  $('search-results').hidden=true;$('city-search').value='';
  try {
    const p=new URLSearchParams({lat:city.lat,lon:city.lon,name:city.name});
    const data=await api('/api/weather?'+p);
    if(seq!==requestId)return;
    state.weather=data;renderWeather();void loadHistory();
    toast('Weather updated for '+city.name);
  } catch(e) {if(seq!==requestId)return;state.weather=null;reportError('Could not load live weather. '+e.message+' Try refreshing.');$('hero-description').textContent='Weather unavailable';}
  renderSaved();
}
function renderWeather() {
  const data=state.weather;if(!data)return;
  const c=data.current, city=state.city, today=data.days[0], desc=condition(c.weather_code,c.is_day===1);
  $('hero-city').textContent=city.name+(city.country?', '+city.country:'');
  $('hero-temp').textContent=unit(c.temperature_2m);$('hero-unit').textContent=state.fahrenheit?'°F':'°C';
  $('hero-description').textContent=desc.icon+'  '+desc.text;
  $('hero-updated').textContent='Updated '+timeLabel(c.time)+' · '+(data.timezone||'local time')+' · Open-Meteo';
  $('hero-humidity').textContent=(c.relative_humidity_2m??'--')+'%';
  $('hero-wind').textContent=(c.wind_speed_10m??'--')+' km/h';
  $('hero-rain').textContent=(c.precipitation??'--')+' mm';
  $('uv-index').textContent=today?.uv!=null?Number(today.uv).toFixed(1):'--';
  $('uv-label').textContent=today?.uv==null?'Unavailable':today.uv<3?'Low exposure':today.uv<6?'Moderate':today.uv<8?'High':'Very high';
  $('cloud-cover').textContent=(c.cloud_cover??'--')+'%';
  $('feels-like').textContent=unit(c.apparent_temperature)+'°';
  $('pressure').textContent=(c.surface_pressure??'--')+' hPa';
  $('sunrise').textContent=timeLabel(today?.sunrise);$('sunset').textContent=timeLabel(today?.sunset);
  $('chart-unit').textContent=state.fahrenheit?'°F':'°C';
  $('unit-toggle').innerHTML=state.fahrenheit?'°F <span>/</span> °C':'°C <span>/</span> °F';
  const heart=$('save-current');heart.classList.toggle('saved',state.saved.some(x=>key(x)===key(city)));
  heart.setAttribute('aria-label',heart.classList.contains('saved')?'Remove saved city':'Save this city');
  renderHours(data.hours);renderWeek(data.days);
}
function renderHours(hours){
  const visible=hours.slice(0,6);
  $('hour-strip').innerHTML=visible.map((h,i)=>'<div class="hour-cell"><small>'+ (i===0?'Now':timeLabel(h.time)) +'</small><span class="wi">'+condition(h.code).icon+'</span><b>'+unit(h.temperature)+'°</b><span class="rain-chance">💧 '+(h.rain??0)+'%</span></div>').join('');
  const values=hours.slice(0,12).map(h=>Number(state.fahrenheit?h.temperature*9/5+32:h.temperature));
  if(values.some(v=>!Number.isFinite(v))||values.length<2){$('chart-wrap').textContent='Temperature chart unavailable';return;}
  const min=Math.min(...values)-2,max=Math.max(...values)+2,w=760,h=152,pad=18;
  const pts=values.map((v,i)=>[(i/(values.length-1))*w, pad+(max-v)/(max-min)*(h-2*pad)]);
  const line=pts.map((p,i)=>(i?'L':'M')+p[0].toFixed(1)+' '+p[1].toFixed(1)).join(' ');
  const area=line+' L'+w+' '+h+' L0 '+h+' Z';
  const grid=[.2,.5,.8].map(v=>'<line x1="0" y1="'+(h*v)+'" x2="'+w+'" y2="'+(h*v)+'" stroke="#edf0f8" stroke-dasharray="4 7"/>').join('');
  const dots=pts.map((p,i)=>i%2===0?'<circle cx="'+p[0]+'" cy="'+p[1]+'" r="3.3" fill="#fff" stroke="#7974ed" stroke-width="2"/>':'').join('');
  $('chart-wrap').innerHTML='<svg viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Temperature trend for the next twelve hours" preserveAspectRatio="none"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#9693f8" stop-opacity=".24"/><stop offset="1" stop-color="#9693f8" stop-opacity="0"/></linearGradient></defs>'+grid+'<path d="'+area+'" fill="url(#chartFill)"/><path d="'+line+'" fill="none" stroke="#7975ef" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>'+dots+'</svg>';
}
function renderWeek(days){
  const lows=days.map(d=>Number(d.low)).filter(Number.isFinite), highs=days.map(d=>Number(d.high)).filter(Number.isFinite);
  const lo=Math.min(...lows),hi=Math.max(...highs),range=Math.max(hi-lo,1);
  $('week-list').innerHTML=days.map((d,i)=>{
    const left=Math.max(0,(d.low-lo)/range*100), width=Math.max(8,(d.high-d.low)/range*100);
    return '<div class="week-row"><span class="week-day '+(i===0?'today':'')+'">'+dayName(d.date,i)+'</span><span class="week-icon">'+condition(d.code).icon+'</span><div class="week-bars"><span style="left:'+left.toFixed(1)+'%;width:'+Math.min(width,100-left).toFixed(1)+'%"></span></div><span class="week-temp"><b>'+unit(d.high)+'°</b>'+unit(d.low)+'°</span></div>';
  }).join('');
}
async function search(q){
  if(q.trim().length<2){$('search-results').hidden=true;return;}
  const box=$('search-results');box.hidden=false;box.innerHTML='<div class="search-message">Searching locations...</div>';
  try{
    const data=await api('/api/search?q='+encodeURIComponent(q.trim()));
    if($('city-search').value.trim()!==q.trim())return;
    box.replaceChildren();
    if(!data.cities.length){box.innerHTML='<div class="search-message">No cities found. Try a different spelling.</div>';return;}
    data.cities.forEach(c=>{
      const b=document.createElement('button');b.type='button';b.className='search-result';b.setAttribute('role','option');
      b.innerHTML='<svg><use href="#i-pin"/></svg><span><strong>'+escapeHTML(c.name)+'</strong><small>'+escapeHTML([c.region,c.country].filter(Boolean).join(', '))+'</small></span>';
      b.addEventListener('click',()=>void openCity(c));box.appendChild(b);
    });
  }catch(e){box.innerHTML='<div class="search-message">'+escapeHTML(e.message)+'</div>';}
}
function renderSaved(){
  const list=state.saved;
  $('saved-count').textContent=list.length;
  $('saved-grid').innerHTML=list.length?'':'<div class="empty-card">No saved cities yet. Find a place above and tap the heart ♥</div>';
  list.forEach(city=>{
    const wrap=document.createElement('div');wrap.className='saved-card';
    wrap.innerHTML='<span class="saved-icon">🌤️</span><div class="saved-info"><strong>'+escapeHTML(city.name)+'</strong><small>'+escapeHTML(city.country||'Saved destination')+'</small></div><button type="button" class="remove-city" aria-label="Remove '+escapeHTML(city.name)+'">✕</button>';
    wrap.addEventListener('click',()=>{void openCity(city);window.scrollTo({top:0,behavior:'smooth'});});
    wrap.querySelector('button').addEventListener('click',event=>{event.stopPropagation();void removeFavorite(city);});
    $('saved-grid').appendChild(wrap);
  });
  const selected=state.saved.some(c=>key(c)===key(state.city));
  $('save-current').classList.toggle('saved',selected);
  $('save-current').title=selected?'Remove city':'Save city';
}
async function addFavorite(city) {
  if(state.saved.some(c=>key(c)===key(city)))return;
  state.saved.unshift(city);state.saved=state.saved.slice(0,30);
  localStorage.setItem('wl-saved',JSON.stringify(state.saved));renderSaved();
  try {await api('/api/favorites',{method:'POST',body:JSON.stringify(city)});$('saved-sync').textContent='Saved on device + MongoDB';toast(city.name+' saved to MongoDB');}
  catch { $('saved-sync').textContent='Local storage · MongoDB unavailable';toast(city.name+' saved to this device'); }
}
async function removeFavorite(city) {
  state.saved=state.saved.filter(c=>key(c)!==key(city));localStorage.setItem('wl-saved',JSON.stringify(state.saved));renderSaved();
  try{await api('/api/favorites/'+encodeURIComponent(key(city)),{method:'DELETE'});}catch{}
  toast(city.name+' removed from saved places');
}
async function loadFavorites(){
  try {
    const result=await api('/api/favorites');
    let merged=[...state.saved];
    for(const c of result.cities)if(!merged.some(s=>key(s)===key(c)))merged.push(c);
    state.saved=merged.slice(0,30);
    localStorage.setItem('wl-saved',JSON.stringify(state.saved));renderSaved();
    $('saved-sync').textContent='Synced with MongoDB';
  }catch { $('saved-sync').textContent='On-device favorites · MongoDB not connected'; }
}
async function checkConnections() {
  for(const id of ['mongo-status','cassandra-status']){$(id).textContent='Checking...';$(id).className='status-pill';}
  try{
    const result=await api('/api/health');
    for(const db of ['mongo','cassandra']){
      const status=result[db];const el=$(db+'-status');
      el.textContent=status==='connected'?'● Connected':status==='not configured'?'Not configured':'● Offline';
      el.className='status-pill '+(status==='connected'?'connected':'offline');
    }
    if(result.mongo==='connected')await loadFavorites();
  }catch(e){
    for(const id of ['mongo-status','cassandra-status']){$(id).textContent='Unavailable';$(id).className='status-pill offline';}
  }
}
async function loadHistory() {
  if(!state.weather)return;
  const seq=requestId,city=state.city;
  $('history-content').textContent='Loading actual recorded observations...';
  try{
    const result=await api('/api/history?'+new URLSearchParams({lat:city.lat,lon:city.lon}));
    if(seq!==requestId)return;
    const rows=result.observations||[];
    $('history-count').textContent=rows.length+' record'+(rows.length===1?'':'s');
    if(!rows.length){$('history-content').textContent='No observations saved for this location yet. Refresh the weather to collect your first reading.';return;}
    $('history-content').innerHTML='<table class="history-table"><thead><tr><th>Recorded at (UTC)</th><th>Temperature</th><th>Humidity</th><th>Wind</th></tr></thead><tbody>'+rows.slice(0,12).map(r=>'<tr><td>'+escapeHTML(new Date(r.time).toLocaleString('en',{timeZone:'UTC',dateStyle:'medium',timeStyle:'short'}))+'</td><td>'+unit(r.temperature)+'°</td><td>'+(r.humidity??'--')+'%</td><td>'+(r.wind??'--')+' km/h</td></tr>').join('')+'</tbody></table>';
  } catch { $('history-count').textContent='Offline'; $('history-content').textContent='Cassandra has no live connection yet. Start Docker locally or configure managed Cassandra on Vercel to collect real weather observations.'; }
}
const quickLocations={
  'Yaoundé':{name:'Yaoundé',country:'Cameroon',lat:3.848,lon:11.502},
  'Ngaoundéré':{name:'Ngaoundéré',country:'Cameroon',lat:7.317,lon:13.583},
  'Bamenda':{name:'Bamenda',country:'Cameroon',lat:5.959,lon:10.146},
  'Garoua':{name:'Garoua',country:'Cameroon',lat:9.301,lon:13.398}
};
$('city-search').addEventListener('input',e=>{clearTimeout(searchTimer);const q=e.target.value;searchTimer=setTimeout(()=>void search(q),300);});
$('city-search').addEventListener('keydown',e=>{if(e.key==='Escape'){$('search-results').hidden=true;e.target.blur();}if(e.key==='Enter'){e.preventDefault();const first=$('search-results').querySelector('.search-result');if(first)first.click();else void search(e.target.value);}});
document.addEventListener('click',e=>{if(!e.target.closest('.search-zone'))$('search-results').hidden=true;});
$('refresh').addEventListener('click',()=>void openCity(state.city));
$('save-current').addEventListener('click',()=>{const c=state.city;if(state.saved.some(x=>key(x)===key(c)))void removeFavorite(c);else void addFavorite(c);});
$('unit-toggle').addEventListener('click',()=>{state.fahrenheit=!state.fahrenheit;localStorage.setItem('wl-unit',state.fahrenheit?'f':'c');if(state.weather)renderWeather();if(state.weather)void loadHistory();});
$('check-dbs').addEventListener('click',()=>{void checkConnections();void loadHistory();});
document.querySelectorAll('[data-city]').forEach(el=>el.addEventListener('click',()=>{void openCity(quickLocations[el.dataset.city]);window.scrollTo({top:0,behavior:'smooth'});}));
document.querySelectorAll('.side-link').forEach(el=>el.addEventListener('click',()=>{document.querySelectorAll('.side-link').forEach(x=>x.classList.remove('active'));el.classList.add('active');}));
renderSaved();void openCity(state.city);void checkConnections();void loadFavorites();
