const PL = {yt:{n:'YouTube',s:'YT'}, tt:{n:'TikTok',s:'TT'}, fb:{n:'Facebook',s:'FB'}, ig:{n:'Instagram',s:'IG'}};
const COLORS = {yt:'#e53935', tt:'#111827', fb:'#1877f2', ig:'#c13584'};
const BRAND = {FUJI:'#0b5fff', KAITASHI:'#0f9d6b'};
const fmt = n => (n ?? 0).toLocaleString('vi-VN');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const state = {metric:{}, data:null, hist:null, range:{}, platform:{}, sort:{}, q:{}, charts:{}};
try { state.sort = JSON.parse(localStorage.getItem('view-tracker-sort') || '{}'); } catch(e) {}
const SORTS = {
  total_desc: {k:'total',d:-1,label:'Nhiều view nhất'},
  total_asc: {k:'total',d:1,label:'Ít view nhất'},
  published_at_desc: {k:'published_at',d:-1,label:'Mới đăng nhất'},
  first_seen_desc: {k:'first_seen',d:-1,label:'Mới được ghi nhận'},
  title_asc: {k:'title',d:1,label:'Tên A–Z'}
};
function rememberSort(){ try { localStorage.setItem('view-tracker-sort', JSON.stringify(state.sort)); } catch(e) {} }
function dateLabel(ts){ return ts ? new Date(ts*1000).toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'Asia/Ho_Chi_Minh'}) : ''; }
function sortedRows(id,ch){
  const q=(state.q[id]||'').toLowerCase();
  const rows=visibleRows(ch).filter(r=>!q||r.title.toLowerCase().includes(q));
  const s=state.sort[id]||SORTS.total_desc;
  return [...rows].sort((a,b)=>{
    if(s.k==='title') return s.d*a.title.localeCompare(b.title,'vi');
    if(s.k==='published_at'||s.k==='first_seen'){
      if(!a[s.k]&&!b[s.k]) return b.total-a.total;
      if(!a[s.k]) return 1;
      if(!b[s.k]) return -1;
    }
    return s.d*((a[s.k]??0)-(b[s.k]??0)) || b.total-a.total;
  });
}
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
  el.textContent='Cập nhật '+ago(u)+' · '+fullTime(u)+' (giờ VN)';
  document.getElementById('dot').classList.toggle('stale',(Date.now()/1000-u)>3*3600);
}

function render(){
  const app=document.getElementById('app');
  Object.values(state.charts).forEach(chart=>chart.destroy());state.charts={};
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

  const errs = Object.entries(ch.status).filter(([,s])=>!s.ok).map(([p,s])=>s.setup?`<div class="err info">ℹ ${PL[p].n}: chưa kết nối (cần token API chính thức — xem README). Tổng view hiện chưa gồm ${PL[p].n}.</div>`:`<div class="err">⚠ ${PL[p].n}: chưa cập nhật được lần gần nhất, đang hiển thị số liệu cũ.</div>`).join('');
  return `<section class="brand" id="sec-${id}" style="--c:${c}">
    <div class="brand-h"><h2>${esc(ch.name)}</h2><span class="pill" style="background:${c}">${rows.length} video${only()?' trùng':''}</span>
      ${Object.keys(PL).map(p=>`<a class="muted" target="_blank" rel="noopener" href="${esc(ch.sources[p])}">${PL[p].n} ↗</a>`).join(' · ')}</div>
    ${errs}
    <div class="kpis">
      <div class="kpi main"><small>Tổng view các nền tảng</small><b>${fmt(grand)}</b><div style="margin-top:6px;font-size:13px">👥 ${fmt(sum(ch.followers))} lượt theo dõi cộng gộp</div></div>
      ${Object.keys(PL).map(p=>`<div class="kpi"><small>${PL[p].n}</small><b>${ch.status[p]?.setup?'<span class="muted" style="font-size:14px">Chưa kết nối</span>':fmt(tot[p])}</b><div class="muted" style="margin-top:4px;font-size:13px">👥 ${ch.status[p]?.setup?'—':(ch.followers_known?.[p]===false?'—':fmt(ch.followers?.[p]))} theo dõi</div></div>`).join('')}
    </div>
    <div class="grid">
      <div class="card">
        <div class="card-h"><h3>Danh sách video</h3><input type="search" placeholder="Tìm tên video…" data-q="${id}" value="${esc(state.q[id]||'')}"></div>
        <div style="padding:10px 18px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <label for="sort-${id}">Sắp xếp:</label>
          <select id="sort-${id}" data-order="${id}" style="padding:8px;border:1px solid #d1d5db;border-radius:8px;background:white;max-width:100%">
            ${Object.entries(SORTS).map(([key,opt])=>`<option value="${key}" ${((state.sort[id]?.k||'total')===opt.k&&(state.sort[id]?.d??-1)===opt.d)?'selected':''}>${opt.label}</option>`).join('')}
          </select>
        </div>
        <p class="muted" style="padding:0 18px;font-size:12px">Mới đăng nhất: theo ngày đăng gần nhất tìm được trong mỗi dòng; video thiếu ngày xếp cuối. Ngày đăng hiển thị theo giờ Việt Nam (ngày/tháng/năm). Mới được ghi nhận: lúc hệ thống thấy video lần đầu, không phải ngày đăng; dữ liệu này bắt đầu từ bản cập nhật này.</p>
        <div class="tw"><table id="tb-${id}">${tableHTML(id,ch)}</table></div>
      </div>
      <aside class="side card" aria-label="Biểu đồ và lịch sử ${esc(ch.name)}">
        <div class="card-h chart-head"><div><h3>Diễn biến số liệu</h3><p class="muted">Chọn một nền tảng để xem rõ hơn</p></div></div>
        <div class="chart-controls">
          <div class="seg metric-tabs" data-metric="${id}" aria-label="Chỉ số">${[['views','Lượt xem'],['followers','Người theo dõi']].map(([k,l])=>`<button type="button" data-m="${k}" aria-pressed="${(state.metric[id]||'views')===k}" class="${(state.metric[id]||'views')===k?'on':''}">${l}</button>`).join('')}</div>
          <div class="platform-tabs" data-platform="${id}" aria-label="Nền tảng">${[['all','Tổng'],...Object.entries(PL).map(([k,p])=>[k,p.n])].map(([k,l])=>`<button type="button" data-p="${k}" aria-pressed="${(state.platform[id]||'all')===k}" class="${(state.platform[id]||'all')===k?'on':''}">${l}</button>`).join('')}</div>
          <div class="seg range-tabs" data-range="${id}" aria-label="Khoảng thời gian">${[['24 giờ',1],['7 ngày',7],['30 ngày',30],['Tất cả',0]].map(([l,d])=>`<button type="button" data-d="${d}" aria-pressed="${(state.range[id]??7)===d}" class="${(state.range[id]??7)===d?'on':''}">${l}</button>`).join('')}</div>
        </div>
        <div id="summary-${id}" class="chart-summary" aria-live="polite"></div>
        <div class="chart-box"><canvas id="ch-${id}" role="img" aria-label="Diễn biến chỉ số theo thời điểm cập nhật"></canvas></div>
        <div class="note" id="cn-${id}"></div>
        <div class="history-heading"><h4>Lịch sử cập nhật</h4><span class="muted">6 mốc gần nhất trong khoảng đã chọn</span></div>
        <div class="history-scroll"><table class="history-table" id="history-${id}" aria-label="Lịch sử số liệu ${esc(ch.name)}"></table></div>
        <div class="note explanation">Chênh lệch là thay đổi giữa hai lần ghi nhận, không phải số lượt xem phát sinh chính xác trong ngày. Số liệu có thể đổi khi video được thêm, ghép lại hoặc nguồn tải thiếu. Tổng chỉ gồm các nguồn có dữ liệu, có thể gồm số cũ; lượt theo dõi cộng gộp không phải số người duy nhất.</div>
      </aside>
    </div>
  </section>`;
}

function tableHTML(id,ch){
  const rows=sortedRows(id,ch);
  const s=state.sort[id]||SORTS.total_desc;
  const th=(k,l,cls='')=>`<th class="${cls}" data-sort="${id}:${k}">${l}${s.k===k?(s.d<0?' ▼':' ▲'):''}</th>`;
  const body=rows.map((r,i)=>`<tr>
    <td class="stt">${i+1}</td>
    <td class="title">${esc(r.title)||'<span class="muted">(không có tiêu đề)</span>'}<div class="muted" style="font-size:11px;margin-top:5px">${r.first_seen?'Hệ thống ghi nhận: '+dateLabel(r.first_seen):''}</div></td>
    <td style="min-width:155px"><div class="v">${Object.keys(PL).filter(p=>r.links[p]).map(p=>`<span style="white-space:nowrap"><i class="${p}">${PL[p].s}</i> ${r.published_dates?.[p]?dateLabel(r.published_dates[p]):'<span class="muted">Chưa có dữ liệu</span>'}</span>`).join('')}</div></td>
    <td><div class="lk">${Object.keys(PL).filter(p=>r.links[p]).map(p=>`<a class="${p}" target="_blank" rel="noopener" href="${esc(r.links[p])}">${PL[p].s}</a>`).join('')}</div></td>
    <td class="n"><div class="v">${Object.keys(PL).filter(p=>r.links[p]).map(p=>`<span>${fmt(r.views[p])}<i class="${p}">${PL[p].s}</i></span>`).join('')}</div></td>
    <td class="n tot">${fmt(r.total)}</td></tr>`).join('');
  const tsum=rows.reduce((a,r)=>a+r.total,0);
  return `<thead><tr>${th('i','STT','')}${th('title','Tên video')}${th('published_at','Ngày đăng')}<th>Link video</th>${th('l','Số view lẻ','n')}${th('total','Tổng view trên các nền tảng','n')}</tr></thead>
   <tbody>${body||'<tr><td colspan="6" class="muted">Không có video phù hợp.</td></tr>'}</tbody>
   <tfoot><tr><td></td><td>TỔNG (${rows.length} video)</td><td></td><td></td><td></td><td class="n">${fmt(tsum)}</td></tr></tfoot>`;
}

function fullTime(ts){
  return new Date(ts*1000).toLocaleString('vi-VN',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'});
}
function valueAt(id,point,p){
  const metric=state.metric[id]||'views', ch=state.data.channels[id];
  const values=metric==='followers'?point.followers:point[only()?'matched':'all'];
  if(!values) return null;
  function v(k){
    const status=point.status?.[k];
    if(status?.setup) return null;
    if(!point.status && ch.status?.[k]?.setup) return null;
    if(metric==='followers'){
      if(point.followers_known?.[k]===false) return null;
      if(!point.followers_known && values[k]===0) return null; // legacy zero may mean missing
    }
    const n=values[k];
    return typeof n==='number' && Number.isFinite(n)?n:null;
  }
  if(p!=='all') return v(p);
  const known=Object.keys(PL).map(v).filter(n=>n!==null);
  return known.length?sum(known):null;
}
function allPoints(id){
  return [...(state.hist[id]||[])].sort((a,b)=>a.t-b.t).map(p=>({...p,y:valueAt(id,p,state.platform[id]||'all')}));
}
function ranged(id){
  const d=state.range[id]??7;
  return allPoints(id).filter(p=>!d||p.t*1000>=Date.now()-d*86400000);
}
function signed(n){ return n===null?'—':(n>0?'+':n<0?'−':'')+fmt(Math.abs(n)); }
function diff(a,b){ return a===null||b===null?null:a-b; }
function currentPoint(id){
  const ch=state.data.channels[id];
  return {t:state.data.updated,all:ch.totals_all,matched:ch.totals_matched,followers:ch.followers,status:ch.status,followers_known:ch.followers_known};
}
function recordNote(id,p){
  if(!p.status) return 'Lịch sử cũ: chưa lưu trạng thái nguồn';
  const platform=state.platform[id]||'all';
  const keys=platform==='all'?Object.keys(PL):[platform];
  const old=keys.filter(k=>p.status[k]&&!p.status[k].ok&&!p.status[k].setup);
  const missing=keys.filter(k=>p.status[k]?.setup);
  return [old.length?'Có số cũ: '+old.map(k=>PL[k].n).join(', '):'',missing.length?'Chưa kết nối: '+missing.map(k=>PL[k].n).join(', '):''].filter(Boolean).join(' · ')||'Đã ghi nhận';
}
function drawChart(id){
  const cv=document.getElementById('ch-'+id);if(!cv)return;
  state.charts[id]?.destroy();delete state.charts[id];
  const platform=state.platform[id]||'all', metric=state.metric[id]||'views';
  const label=platform==='all'?'Tổng ghi nhận':PL[platform].n;
  const unit=metric==='followers'?'lượt theo dõi':'lượt xem';
  const current=currentPoint(id), now=valueAt(id,current,platform);
  const previous=allPoints(id).filter(p=>p.t<current.t).pop();
  const change=previous?diff(now,previous.y):null;
  const s=ranged(id), valid=s.filter(p=>p.y!==null);
  const unavailable=platform!=='all'&&state.data.channels[id].status?.[platform]?.setup;
  const summary=document.getElementById('summary-'+id);
  summary.innerHTML=`<div class="summary-label">${label} · ${metric==='followers'?'Người theo dõi':'Lượt xem'} hiện tại</div>
    <div class="summary-value">${now===null?'Chưa có dữ liệu':fmt(now)}<span>${now===null?'':unit}</span></div>
    <div class="summary-change ${change!==null&&change<0?'negative':''}">${change===null?'Chưa đủ dữ liệu để so sánh':signed(change)+' so với lần ghi nhận trước'}</div>
    <div class="summary-time">Mốc dữ liệu: ${fullTime(current.t)}</div>`;
  const note=document.getElementById('cn-'+id);
  const caveat=recordNote(id,current);
  note.textContent=unavailable?'Chưa kết nối '+label+'. Không hiển thị thành 0.':(!valid.length?'Chưa có dữ liệu trong khoảng đã chọn.':valid.length===1?'Mới có một điểm dữ liệu; cần thêm lần cập nhật để thấy xu hướng.':'Mỗi điểm là một lần ghi nhận. Chạm hoặc rê chuột để xem số liệu.')+(caveat==='Đã ghi nhận'?'':' '+caveat+'.');
  cv.style.display=valid.length&&!unavailable?'block':'none';
  document.getElementById('history-'+id).innerHTML=`<thead><tr><th>Thời điểm (VN)</th><th>${metric==='followers'?'Lượt theo dõi':'Lượt xem'}</th><th>Chênh lệch</th></tr></thead><tbody>${s.slice(-6).reverse().map(p=>{
    const before=allPoints(id).filter(x=>x.t<p.t).pop();
    const d=before?diff(p.y,before.y):null;
    return `<tr><td>${fullTime(p.t)}<small>${esc(recordNote(id,p))}</small></td><td>${p.y===null?'—':fmt(p.y)}</td><td class="${d!==null&&d<0?'negative':''}">${signed(d)}</td></tr>`;
  }).join('')||'<tr><td colspan="3">Chưa có lịch sử trong khoảng đã chọn.</td></tr>'}</tbody>`;
  if(!valid.length||unavailable)return;
  if(typeof Chart==='undefined'){note.textContent='Không tải được biểu đồ. Xem số liệu ở bảng lịch sử bên dưới.';cv.style.display='none';return;}
  const dark=window.matchMedia('(prefers-color-scheme: dark)').matches;
  const tickColor=dark?'#c0ccdb':'#596575',gridColor=dark?'#414957':'#edf0f3';
  const color=dark?(platform==='all'?(id==='KAITASHI'?'#72cba9':'#89b6ff'):({yt:'#ff9993',tt:'#d3dfed',fb:'#89b6ff',ig:'#f299d7'}[platform])):(platform==='all'?(BRAND[id]||'#0b5fff'):COLORS[platform]);
  const data=s.map(p=>({x:p.t*1000,y:p.y}));
  state.charts[id]=new Chart(cv,{type:'line',data:{datasets:[{label,data,borderColor:color,backgroundColor:color+'12',fill:true,borderWidth:2.5,tension:0,pointRadius:s.length>150?1:2.5,pointHoverRadius:5,spanGaps:false}]},options:{
    responsive:true,maintainAspectRatio:false,animation:false,interaction:{mode:'nearest',axis:'x',intersect:false},
    scales:{x:{type:'linear',...(s.length===1?{min:s[0].t*1000-1800000,max:s[0].t*1000+1800000}:{min:s[0].t*1000,max:s[s.length-1].t*1000}),grid:{display:false},ticks:{maxTicksLimit:5,color:tickColor,font:{size:12},callback:v=>{const d=new Date(v);return (state.range[id]===1)?d.toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Ho_Chi_Minh'}):d.toLocaleDateString('vi-VN',{day:'2-digit',month:'2-digit',timeZone:'Asia/Ho_Chi_Minh'});}}},
      y:{beginAtZero:true,grid:{color:gridColor},ticks:{maxTicksLimit:5,color:tickColor,font:{size:12},callback:v=>fmt(v)}}},
    plugins:{legend:{display:false},tooltip:{displayColors:false,callbacks:{title:items=>items.length?fullTime(items[0].parsed.x/1000):'',label:c=>`${label}: ${fmt(c.parsed.y)} ${unit}`}}}
  }});
}

function bindSection(id,ch){
  const sec=document.getElementById('sec-'+id);
  sec.querySelector('[data-order]').addEventListener('change',e=>{
    state.sort[id]={...SORTS[e.target.value]};rememberSort();
    sec.querySelector('#tb-'+id).innerHTML=tableHTML(id,ch);bindSort(sec,ch);
  });
  sec.querySelector('[data-q]').addEventListener('input',e=>{state.q[id]=e.target.value;sec.querySelector('#tb-'+id).innerHTML=tableHTML(id,ch);bindSort(sec,ch)});
  sec.querySelectorAll('[data-metric] button').forEach(b=>b.onclick=()=>{state.metric[id]=b.dataset.m;
    sec.querySelectorAll('[data-metric] button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});drawChart(id);});
  sec.querySelectorAll('[data-platform] button').forEach(b=>b.onclick=()=>{state.platform[id]=b.dataset.p;
    sec.querySelectorAll('[data-platform] button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});drawChart(id);});
  sec.querySelectorAll('[data-range] button').forEach(b=>b.onclick=()=>{state.range[id]=+b.dataset.d;
    sec.querySelectorAll('[data-range] button').forEach(x=>{x.classList.toggle('on',x===b);x.setAttribute('aria-pressed',String(x===b));});drawChart(id);});
  bindSort(sec,ch);
}
function bindSort(sec,ch){
  sec.querySelectorAll('th[data-sort]').forEach(th=>th.onclick=()=>{
    const [id,k]=th.dataset.sort.split(':'); if(k==='i'||k==='l') return;
    const s=state.sort[id]||{k:'total',d:-1}; state.sort[id]={k,d:s.k===k?-s.d:-1};rememberSort();
    const select=sec.querySelector('[data-order]');
    select.value=Object.keys(SORTS).find(key=>SORTS[key].k===k&&SORTS[key].d===state.sort[id].d)||'';
    sec.querySelector('#tb-'+id).innerHTML=tableHTML(id,ch);bindSort(sec,ch);});
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(state.data)Object.keys(state.data.channels).forEach(drawChart);});
document.getElementById('onlyMatched').addEventListener('change',()=>state.data&&render());
setInterval(load,60000); setInterval(tickHeader,30000); load();
