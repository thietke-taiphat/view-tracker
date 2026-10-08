const PL = {yt:{n:'YouTube',s:'YT'}, tt:{n:'TikTok',s:'TT'}, fb:{n:'Facebook',s:'FB'}, ig:{n:'Instagram',s:'IG'}};
const COLORS = {yt:'#e53935', tt:'#111827', fb:'#1877f2', ig:'#c13584'};
const BRAND = {FUJI:'#0b5fff', KAITASHI:'#0f9d6b'};
const fmt = n => (n ?? 0).toLocaleString('vi-VN');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const state = {metric:{}, data:null, hist:null, range:{}, sort:{}, q:{}, charts:{}};
const only = () => document.getElementById('onlyMatched').checked;
const sum = o => Object.values(o||{}).reduce((a,b)=>a+b,0);

async function load(){
  const t = Date.now();
  try{
    const [d,h] = await Promise.all([
      fetch('data/data.json?t='+t,{cache:'no-store'}).then(r=>r.json()),
      fetch('data/history.json?t='+t,{cache:'no-store'}).then(r=>r.json())]);
    state.data=d; state.hist=h; render();
  }catch(e){ document.getElementById('updated').textContent='Chưa có dữ liệu — hãy chạy cập nhật lần đầu'; console.error(e); }
}

function ago(ts){
  const m=Math.max(0,Math.round((Date.now()/1000-ts)/60));
  if(m<1) return 'vừa xong'; if(m<60) return m+' phút trước';
  const h=Math.floor(m/60); return h<24? h+' giờ trước' : Math.floor(h/24)+' ngày trước';
}
function tickHeader(){
  if(!state.data) return;
  const u=state.data.updated, el=document.getElementById('updated');
  el.textContent='Cập nhật '+ago(u)+' · '+new Date(u*1000).toLocaleString('vi-VN');
  document.getElementById('dot').classList.toggle('stale',(Date.now()/1000-u)>3*3600);
}

function render(){
  const app=document.getElementById('app');
  const open = new Set([...document.querySelectorAll('[data-keep]')].map(e=>e.id));
  app.innerHTML = Object.entries(state.data.channels).map(([id,ch])=>section(id,ch)).join('');
  for(const [id,ch] of Object.entries(state.data.channels)){ bindSection(id,ch); drawChart(id); }
  tickHeader();
}

function visibleRows(ch){ return only()? ch.rows.filter(r=>r.n>=2) : ch.rows; }

function section(id,ch){
  const c=BRAND[id]||'#0b5fff';
  const tot = only()? ch.totals_matched : ch.totals_all;
  const grand = sum(tot);
  const rows = visibleRows(ch);
  const g = growth(id);
  const errs = Object.entries(ch.status).filter(([,s])=>!s.ok).map(([p,s])=>s.setup?`<div class="err info">ℹ ${PL[p].n}: chưa kết nối (cần token API chính thức — xem README). Tổng view hiện chưa gồm ${PL[p].n}.</div>`:`<div class="err">⚠ ${PL[p].n}: chưa cập nhật được lần gần nhất, đang hiển thị số liệu cũ.</div>`).join('');
  return `<section class="brand" id="sec-${id}" style="--c:${c}">
    <div class="brand-h"><h2>${esc(ch.name)}</h2><span class="pill" style="background:${c}">${rows.length} video${only()?' trùng':''}</span>
      ${Object.keys(PL).map(p=>`<a class="muted" target="_blank" rel="noopener" href="${esc(ch.sources[p])}">${PL[p].n} ↗</a>`).join(' · ')}</div>
    ${errs}
    <div class="kpis">
      <div class="kpi main"><small>Tổng view các nền tảng</small><b>${fmt(grand)}</b>${g?`<em>▲ ${fmt(g.d)} trong ${g.label} qua</em>`:''}<div style="margin-top:6px;font-size:13px">👥 ${fmt(sum(ch.followers))} người theo dõi</div></div>
      ${Object.keys(PL).map(p=>`<div class="kpi"><small>${PL[p].n}</small><b>${ch.status[p]?.setup?'<span class="muted" style="font-size:14px">Chưa kết nối</span>':fmt(tot[p])}</b><div class="muted" style="margin-top:4px;font-size:13px">👥 ${ch.status[p]?.setup?'—':fmt(ch.followers?.[p])} theo dõi</div></div>`).join('')}
    </div>
    <div class="grid">
      <div class="card">
        <div class="card-h"><h3>Danh sách video</h3><input type="search" placeholder="Tìm tên video…" data-q="${id}" value="${esc(state.q[id]||'')}"></div>
        <div class="tw"><table id="tb-${id}">${tableHTML(id,ch)}</table></div>
      </div>
      <div class="side card">
        <div class="card-h"><h3>Tăng trưởng</h3>
          <div class="seg" data-metric="${id}">${[['views','Lượt view'],['followers','Người theo dõi']].map(([k,l])=>`<button data-m="${k}" class="${(state.metric[id]||'views')==k?'on':''}">${l}</button>`).join('')}</div>
          <div class="seg" data-range="${id}">${[['24h',1],['7 ngày',7],['30 ngày',30],['Tất cả',0]].map(([l,d])=>`<button data-d="${d}" class="${(state.range[id]??0)==d?'on':''}">${l}</button>`).join('')}</div></div>
        <div class="chart-box"><canvas id="ch-${id}" height="300"></canvas></div>
        <div class="note" id="cn-${id}"></div>
      </div>
    </div>
  </section>`;
}

function tableHTML(id,ch){
  const q=(state.q[id]||'').toLowerCase();
  let rows=visibleRows(ch).filter(r=>!q||r.title.toLowerCase().includes(q));
  const s=state.sort[id]||{k:'total',d:-1};
  rows=[...rows].sort((a,b)=> s.k==='title'? s.d*a.title.localeCompare(b.title,'vi') : s.d*((a[s.k]??0)-(b[s.k]??0)));
  const th=(k,l,cls='')=>`<th class="${cls}" data-sort="${id}:${k}">${l}${s.k===k?(s.d<0?' ▼':' ▲'):''}</th>`;
  const body=rows.map((r,i)=>`<tr>
    <td class="stt">${i+1}</td>
    <td class="title">${esc(r.title)||'<span class="muted">(không có tiêu đề)</span>'}</td>
    <td><div class="lk">${Object.keys(PL).filter(p=>r.links[p]).map(p=>`<a class="${p}" target="_blank" rel="noopener" href="${esc(r.links[p])}">${PL[p].s}</a>`).join('')}</div></td>
    <td class="n"><div class="v">${Object.keys(PL).filter(p=>r.links[p]).map(p=>`<span>${fmt(r.views[p])}<i class="${p}">${PL[p].s}</i></span>`).join('')}</div></td>
    <td class="n tot">${fmt(r.total)}</td></tr>`).join('');
  const tsum=rows.reduce((a,r)=>a+r.total,0);
  return `<thead><tr>${th('i','STT','')}${th('title','Tên video')}<th>Link video</th>${th('l','Số view lẻ','n')}${th('total','Tổng view trên các nền tảng','n')}</tr></thead>
   <tbody>${body||'<tr><td colspan="5" class="muted">Không có video phù hợp.</td></tr>'}</tbody>
   <tfoot><tr><td></td><td>TỔNG (${rows.length} video)</td><td></td><td></td><td class="n">${fmt(tsum)}</td></tr></tfoot>`;
}

function series(id){
  const h=(state.hist[id]||[]); const key=only()?'matched':'all';
  const src = (state.metric[id]||'views')==='followers' ? (p=>p.followers||{}) : (p=>p[key]);
  return h.map(p=>{const v=src(p); return {t:p.t*1000, yt:v.yt||0, tt:v.tt||0, fb:v.fb||0, ig:v.ig||0, all:sum(v)};});
}
function ranged(id){
  const d=state.range[id]??0, s=series(id);
  if(!d) return s; const from=Date.now()-d*86400000;
  const r=s.filter(p=>p.t>=from);
  // thêm điểm ngay trước mốc để thấy được mức tăng
  const before=s.filter(p=>p.t<from).pop(); return before? [before,...r] : r;
}
function growth(id){
  const keep=state.metric[id]; state.metric[id]='views'; const s=ranged(id); state.metric[id]=keep; if(s.length<2) return null;
  const d=s[s.length-1].all-s[0].all; const days=(s[s.length-1].t-s[0].t)/86400000;
  const label= days<1/24? Math.max(1,Math.round(days*1440))+' phút' : days<1.2? Math.round(days*24)+' giờ' : Math.round(days)+' ngày';
  return d>0?{d,label}:null;
}

function drawChart(id){
  const s=ranged(id), cv=document.getElementById('ch-'+id); if(!cv) return;
  const note=document.getElementById('cn-'+id);
  note.textContent = s.length<2 ? 'Biểu đồ sẽ hiện đường tăng trưởng khi có từ 2 lần cập nhật trở lên (mỗi ~30 phút một điểm).' : '';
  state.charts[id]?.destroy();
  const ds=[{label:'Tổng',data:s.map(p=>({x:p.t,y:p.all})),borderColor:BRAND[id]||'#0b5fff',backgroundColor:(BRAND[id]||'#0b5fff')+'22',fill:true,borderWidth:3,tension:.25,pointRadius:s.length<30?3:0},
    ...Object.keys(PL).filter(p=>s.some(q=>q[p]>0)).map(p=>({label:PL[p].n,data:s.map(q=>({x:q.t,y:q[p]})),borderColor:COLORS[p],borderWidth:1.5,borderDash:[5,4],tension:.25,pointRadius:0,fill:false}))];
  state.charts[id]=new Chart(cv,{type:'line',data:{datasets:ds},options:{
    responsive:true,maintainAspectRatio:true,aspectRatio:1.35,interaction:{mode:'index',intersect:false},
    scales:{x:{type:'linear',ticks:{maxTicksLimit:6,callback:v=>{const d=new Date(v);return (ranged(id).length&&(s[s.length-1].t-s[0].t)<2*86400000)?d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}):d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit'})}},grid:{display:false}},
            y:{ticks:{callback:v=>v>=1e6?(v/1e6)+'M':v>=1e3?(v/1e3)+'K':v}}},
    plugins:{legend:{position:'bottom',labels:{usePointStyle:true,boxWidth:8}},
      tooltip:{callbacks:{title:i=>new Date(i[0].parsed.x).toLocaleString('vi-VN'),label:c=>` ${c.dataset.label}: ${fmt(c.parsed.y)}`}}}}});
}

function bindSection(id,ch){
  const sec=document.getElementById('sec-'+id);
  sec.querySelector('[data-q]').addEventListener('input',e=>{state.q[id]=e.target.value;sec.querySelector('table').innerHTML=tableHTML(id,ch);bindSort(sec,ch)});
  sec.querySelectorAll('[data-metric] button').forEach(b=>b.onclick=()=>{state.metric[id]=b.dataset.m;
    sec.querySelectorAll('[data-metric] button').forEach(x=>x.classList.toggle('on',x===b));drawChart(id);});
  sec.querySelectorAll('[data-range] button').forEach(b=>b.onclick=()=>{state.range[id]=+b.dataset.d;
    sec.querySelectorAll('[data-range] button').forEach(x=>x.classList.toggle('on',x===b));drawChart(id);});
  bindSort(sec,ch);
}
function bindSort(sec,ch){
  sec.querySelectorAll('th[data-sort]').forEach(th=>th.onclick=()=>{
    const [id,k]=th.dataset.sort.split(':'); if(k==='i'||k==='l') return;
    const s=state.sort[id]||{k:'total',d:-1}; state.sort[id]={k,d:s.k===k?-s.d:-1};
    sec.querySelector('table').innerHTML=tableHTML(id,ch);bindSort(sec,ch);});
}

document.getElementById('onlyMatched').addEventListener('change',()=>state.data&&render());
setInterval(load,60000); setInterval(tickHeader,30000); load();
