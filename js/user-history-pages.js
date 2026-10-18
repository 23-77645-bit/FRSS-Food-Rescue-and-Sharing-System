(function(){
  const $=(s)=>document.querySelector(s);
  const esc=(v)=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const date=(v)=>{if(!v)return '—';const d=new Date(v);if(Number.isNaN(d.getTime()))return String(v);return d.toLocaleString([],{month:'short',day:'numeric',year:'numeric',hour:'numeric',minute:'2-digit'});};
  const status=(v)=>esc(String(v||'—').replace(/_/g,' '));
  const icon=(name)=>`<i data-feather="${esc(name)}"></i>`;
  function renderIcons(){if(window.feather)window.feather.replace({width:18,height:18,'stroke-width':1.8});}
  function setLoading(msg='Loading…'){const el=$('#historyList');if(el)el.innerHTML=`<div class="history-empty">${esc(msg)}</div>`;}
  function setCount(n,label){const el=$('#pageCount');if(el)el.textContent=`${n} ${label}${n===1?'':'s'}`;}
  function renderRows(rows,renderer,empty){const el=$('#historyList');if(!el)return;if(!rows.length){el.innerHTML=`<div class="history-empty">${esc(empty)}</div>`;return;}el.innerHTML=rows.map(renderer).join('');renderIcons();}

  async function requireUser(){
    if(!window.sb?.auth){window.location.href='login.html';return null;}
    const {data,error}=await window.sb.auth.getUser();
    if(error||!data?.user){window.location.href='login.html';return null;}
    window.currentUserId=data.user.id; return data.user;
  }

  async function loadActivity(uid){
    const base='id,claimant_id,quantity,status,claimed_at,confirmed_at,ready_at,picked_up_at,completed_at,pickup_code,food_post_id,food_posts(food_name,unit,pickup_location,donor_id)';
    const [claims,donations]=await Promise.all([
      window.sb.from('claims').select(base).eq('claimant_id',uid).order('claimed_at',{ascending:false}).limit(100),
      window.sb.from('claims').select(base.replace('food_posts(', 'food_posts!inner(')).eq('food_posts.donor_id',uid).order('claimed_at',{ascending:false}).limit(100)
    ]);
    if(claims.error||donations.error)throw claims.error||donations.error;
    const map=new Map();[...(claims.data||[]),...(donations.data||[])].forEach(r=>map.set(String(r.id),r));
    let rows=[...map.values()].sort((a,b)=>new Date(b.claimed_at)-new Date(a.claimed_at));
    const filter=$('#activityFilter')?.value||'all';
    rows=rows.filter(c=>{const donor=String(c.food_posts?.donor_id||'')===String(uid);const claimant=String(c.claimant_id||'')===String(uid);if(filter==='donations')return donor;if(filter==='claims')return claimant;if(filter==='completed')return c.status==='completed';if(filter==='cancelled')return c.status==='cancelled';return donor||claimant;});
    setCount(rows.length,'record');
    renderRows(rows,c=>{
      const post=c.food_posts||{};const donor=String(post.donor_id||'')===String(uid);const role=donor?'Donation':'Claim';
      const pickup=c.pickup_code?`<span class="history-code">${esc(c.pickup_code)}</span>`:'';
      return `<article class="history-card"><div class="history-icon">${icon(donor?'package':'heart')}</div><div class="history-main"><div class="history-title-row"><strong>${esc(post.food_name||'Food post')}</strong><span class="history-badge">${status(c.status)}</span></div><p>${role} · ${esc(String(c.quantity))} ${esc(post.unit||'unit(s)')}</p><small>${esc(date(c.claimed_at))}${post.pickup_location?' · '+esc(post.pickup_location):''}</small></div><div class="history-side">${pickup||`<span class="history-muted">${c.status==='completed'?'Completed':'In progress'}</span>`}</div></article>`;
    },'No donation or claim activity yet.');
  }

  async function loadReports(uid){
    const [food,claim]=await Promise.all([
      window.sb.from('food_reports').select('id,reason,details,status,created_at,food_posts(food_name)').eq('reporter_id',uid).order('created_at',{ascending:false}).limit(50),
      window.sb.from('claim_reports').select('id,reason,details,status,created_at,claims(food_post_id,food_posts(food_name))').eq('reporter_id',uid).order('created_at',{ascending:false}).limit(50)
    ]);
    if(food.error||claim.error)throw food.error||claim.error;
    const rows=[...(food.data||[]).map(r=>({...r,kind:'Food report',name:r.food_posts?.food_name||'Food post'})),...(claim.data||[]).map(r=>({...r,kind:'Claim report',name:r.claims?.food_posts?.food_name||'Claim'}))].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
    setCount(rows.length,'report');
    renderRows(rows,r=>`<article class="history-card"><div class="history-icon">${icon('flag')}</div><div class="history-main"><div class="history-title-row"><strong>${esc(r.kind)} · ${esc(r.name)}</strong><span class="history-badge">${status(r.status)}</span></div><p>${esc(r.reason)}</p><small>${esc(date(r.created_at))}</small>${r.details?`<div class="history-details">${esc(r.details)}</div>`:''}</div></article>`,'You have not submitted any reports.');
  }

  async function loadExpired(uid){
    const {data,error}=await window.sb.from('food_posts').select('id,food_name,quantity,unit,expiration_at,status,pickup_location,created_at').eq('donor_id',uid).eq('status','expired').order('expiration_at',{ascending:false}).limit(100);
    if(error)throw error;const rows=data||[];setCount(rows.length,'expired post');
    renderRows(rows,p=>`<article class="history-card"><div class="history-icon">${icon('calendar')}</div><div class="history-main"><div class="history-title-row"><strong>${esc(p.food_name||'Food post')}</strong><span class="history-badge history-badge-expired">Expired</span></div><p>${esc(String(p.quantity))} ${esc(p.unit||'unit(s)')}${p.pickup_location?' · '+esc(p.pickup_location):''}</p><small>Expired ${esc(date(p.expiration_at))}</small></div></article>`,'You have no expired food posts.');
  }

  async function loadReservations(uid){
    const {data,error}=await window.sb.from('food_posts').select('id,food_name,quantity,remaining_quantity,unit,expiration_at,reservation_expires_at,status,pickup_location').eq('donor_id',uid).eq('status','reserved').order('reservation_expires_at',{ascending:true}).limit(100);
    if(error)throw error;const rows=data||[];setCount(rows.length,'reservation');
    renderRows(rows,p=>`<article class="history-card"><div class="history-icon">${icon('clock')}</div><div class="history-main"><div class="history-title-row"><strong>${esc(p.food_name||'Food post')}</strong><span class="history-badge history-badge-reserved">Being claimed</span></div><p>${esc(String(p.remaining_quantity ?? p.quantity ?? '—'))} ${esc(p.unit||'unit(s)')} remaining${p.pickup_location?' · '+esc(p.pickup_location):''}</p><small>Reservation hold ends ${esc(date(p.reservation_expires_at))}</small></div></article>`,'No one is currently claiming your food posts.');
  }

  async function init(){
    const user=await requireUser();if(!user)return;
    const type=document.body.dataset.historyPage;
    const titles={activity:['MY ACTIVITY','Donation & claim history'],reports:['MY REPORTS','Reports I submitted'],expired:['EXPIRED DONATIONS','Food that has expired'],reservations:['ACTIVE RESERVATIONS','Food being claimed']};
    const meta=titles[type]||titles.activity;const eyebrow=$('#pageEyebrow'),title=$('#pageTitle');if(eyebrow)eyebrow.textContent=meta[0];if(title)title.textContent=meta[1];
    if(type==='activity'){
      $('#activityFilter')?.addEventListener('change',()=>loadActivity(user.id).catch(e=>{console.error(e);setLoading('Activity history is unavailable.');}));
    }
    try{
      setLoading();
      if(type==='activity')await loadActivity(user.id);
      else if(type==='reports')await loadReports(user.id);
      else if(type==='expired')await loadExpired(user.id);
      else await loadReservations(user.id);
    }catch(e){console.error(e);setLoading('This information is currently unavailable.');}
    renderIcons();
  }
  document.addEventListener('DOMContentLoaded',init);
})();
