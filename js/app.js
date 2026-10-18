const $=s=>document.querySelector(s);
const root=document.documentElement;
const body=document.body;
function ensureStatusToast(){
  let el=document.getElementById('statusToast');
  if(el)return el;
  document.body.insertAdjacentHTML('beforeend','<div class="status-toast" id="statusToast" role="status" aria-live="polite"><span class="status-toast-icon" id="statusToastIcon"></span><span id="statusToastText"></span></div>');
  return document.getElementById('statusToast');
}
function showStatusToast(loadingText){
  const el=ensureStatusToast(),icon=$('#statusToastIcon'),text=$('#statusToastText');
  clearTimeout(el._hideTimer);
  icon.innerHTML='<span class="status-toast-spinner"></span>';
  text.textContent=loadingText;
  el.classList.add('show');
  const finish=(html,msg)=>{icon.innerHTML=html;text.textContent=msg;el._hideTimer=setTimeout(()=>el.classList.remove('show'),2600)};
  return{
    success(msg){finish('<span class="status-toast-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 9 18 20 6"></polyline></svg></span>',msg)},
    fail(msg){finish('<span class="status-toast-error"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>',msg)}
  };
}
function showToast(message){const t=$('#toast');if(!t)return;t.textContent=message;t.classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>t.classList.remove('show'),2600)}
function renderFeatherIcons(){if(window.feather)window.feather.replace({width:18,height:18,'stroke-width':1.8});}
function setupTheme(){const saved=localStorage.getItem('frss-theme');if(saved==='dark')body.classList.add('dark');const btn=$('#themeFab');if(!btn)return;const sync=()=>{const dark=body.classList.contains('dark');btn.innerHTML=dark?'<i data-feather="sun" aria-hidden="true"></i>':'<i data-feather="moon" aria-hidden="true"></i>';btn.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');btn.setAttribute('title',dark?'Switch to light mode':'Switch to dark mode');btn.classList.toggle('is-dark',dark);renderFeatherIcons()};sync();btn.addEventListener('click',()=>{body.classList.toggle('dark');localStorage.setItem('frss-theme',body.classList.contains('dark')?'dark':'light');sync()})}
function setupMenu(){const btn=$('#mobileMenuBtn'),nav=$('#mainNav');if(!btn||!nav)return;const sync=()=>{const open=nav.classList.contains('open');btn.innerHTML=open?'<i data-feather="x" aria-hidden="true"></i><span class="sr-only">Close menu</span>':'<i data-feather="menu" aria-hidden="true"></i><span class="sr-only">Open menu</span>';btn.setAttribute('aria-expanded',open);btn.setAttribute('aria-label',open?'Close menu':'Open menu');renderFeatherIcons()};btn.addEventListener('click',()=>{nav.classList.toggle('open');sync()});nav.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{nav.classList.remove('open');sync()}));sync()}
function setupScroll(){const header=$('#siteHeader'),top=$('#toTop'),progress=$('#scrollProgress');const update=()=>{const y=window.scrollY;header?.classList.toggle('scrolled',y>10);top?.classList.toggle('show',y>450);const max=document.documentElement.scrollHeight-innerHeight;if(progress)progress.style.width=(max?y/max*100:0)+'%'};window.addEventListener('scroll',update,{passive:true});top?.addEventListener('click',()=>window.scrollTo({top:0,behavior:'smooth'}));update()}
function foodCard(f){
  const qty=Number(f.qty??f.remaining_quantity??0);
  const category=f.category||f.categories?.name||'Food';
  const expires=f.expires||formatExpiry(f.expiration_at);
  const location=f.location||f.pickup_location||'Pickup location to be confirmed';
  const distance=f.distance_km;
  const distanceText=Number.isFinite(distance)?formatDistance(distance):'';
  const emoji=f.emoji||emojiForCategory(category);
  const imageUrl=String(f.image_url||f.photo_url||f.food_image_url||(Array.isArray(f.image_urls)&&f.image_urls[0])||'').trim();
  const foodName=String(f.name||f.food_name||'Food');
  const imageMarkup=imageUrl
    ? `<img class="food-card-image" src="${escapeHtml(imageUrl)}" alt="${escapeHtml(foodName)} photo" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='grid'"><span class="food-card-image-fallback" aria-hidden="true">${emoji}</span>`
    : `<span class="food-card-image-fallback" aria-hidden="true">${emoji}</span>`;
  const isReserved=f.status==='reserved';
  const reservationText=isReserved
    ? `<div class="reservation-notice"><i data-feather="clock" aria-hidden="true"></i><span>Someone is already claiming this food. Please choose another post.</span></div>`
    : '';
  return `<article class="food-card reveal visible ${isReserved?'is-reserved':''}"><div class="food-image">${imageMarkup}</div><div class="food-body"><h3>${escapeHtml(foodName)}</h3><div class="food-details"><div>Expires<strong>${escapeHtml(expires)}</strong></div><div>Pickup<strong class="pickup-location" title="${escapeHtml(location)}">${escapeHtml(location)}</strong></div></div>${reservationText}<div class="food-card-actions"><button class="btn btn-outline view-food-btn" data-id="${escapeHtml(String(f.id))}" type="button">View Details</button></div></div></article>`
}
function escapeHtml(v){return String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function formatExpiry(value){if(!value)return '—';const d=new Date(value);if(Number.isNaN(d.getTime()))return String(value);return d.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
function emojiForCategory(category){const c=String(category).toLowerCase();const map=[['ulam','🍲'],['pancit','🍜'],['kanin','🍚'],['sabaw','🥣'],['meryenda','🥟'],['kakanin','🍡'],['tinapay','🍞'],['prutas','🍌'],['gulay','🥬'],['inumin','🧃'],['delata','🥫'],['cooked','🍲'],['bakery','🍞'],['fruit','🍌'],['vegetable','🥬'],['canned','🥫'],['packaged','📦'],['drink','🧃'],['other','🍽️']];const hit=map.find(([k])=>c.includes(k));return hit?hit[1]:'🍽️'}
function getStaticFoods(){return []}
async function safeRequest(action){
  try { return await action(); } catch(error) { return {error}; }
}
function localAssetPath(path){return window.location.pathname.includes('/pages/')?'../'+path:path}
function getFoodCoordinates(food){
  const lat=food?.latitude,lng=food?.longitude;
  if(lat==null||lng==null||String(lat).trim()===''||String(lng).trim()==='')return null;
  const latitude=Number(lat),longitude=Number(lng);
  return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{lat:latitude,lng:longitude}:null;
}
function loginPath(){return window.location.pathname.includes('/pages/')?'login.html':'pages/login.html'}

function getCategoryName(food){
  return String(food?.category||food?.categories?.name||'').trim();
}

function normalizeCategory(value){
  return String(value||'').trim().toLowerCase();
}

async function loadFoodCategories(){
  const filter=$('#categoryFilter');
  if(!filter)return;
  const current=filter.value;
  if(!window.sb)return;
  const {data,error}=await window.sb.from('categories').select('id,name').eq('is_active',true).order('name');
  if(error){console.warn('Could not load food categories:',error);return;}
  filter.innerHTML='<option value="all">All categories</option>'+(data||[]).map(c=>`<option value="${escapeHtml(c.name)}">${escapeHtml(c.name)}</option>`).join('');
  if((data||[]).some(c=>c.name===current))filter.value=current;
}

function ensureClaimModal(){
  let modal=$('#claimModal');
  if(modal)return modal;
  document.body.insertAdjacentHTML('beforeend',`<div class="claim-modal" id="claimModal" aria-hidden="true"><div class="claim-dialog" role="dialog" aria-modal="true" aria-labelledby="claimFoodName"><button class="claim-modal-close" id="claimModalClose" type="button" aria-label="Close"><i data-feather="x"></i></button><span class="eyebrow">CLAIM FOOD</span><h2 id="claimFoodName">Food</h2><p id="claimAvailable" class="muted">Available</p><p class="claim-hold-note">Your request will be sent to the donor for approval. The food is held for up to 60 minutes while the request is pending.</p><form id="claimForm"><label for="claimQuantity">Quantity</label><div class="qty-stepper"><button type="button" class="qty-btn qty-btn--minus" id="claimQtyMinus" aria-label="Decrease quantity">&#8722;</button><input id="claimQuantity" name="quantity" type="number" inputmode="numeric" min="1" step="1" value="1" required><button type="button" class="qty-btn qty-btn--plus" id="claimQtyPlus" aria-label="Increase quantity">+</button></div><div class="claim-actions"><button class="btn btn-outline" id="claimCancel" type="button">Cancel</button><button class="btn btn-primary" type="submit">Send Claim Request</button></div></form></div></div>`);
  renderFeatherIcons();
  return $('#claimModal');
}

function setupFoodDetailModal(){
  let modal=$('#foodDetailModal');
  if(!modal){
    document.body.insertAdjacentHTML('beforeend',`<div class="food-detail-modal" id="foodDetailModal" aria-hidden="true"><div class="food-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="foodDetailName"><button class="food-detail-close" id="foodDetailClose" type="button" aria-label="Close food details"><i data-feather="x"></i></button><div class="food-detail-hero" id="foodDetailHero"><img class="food-detail-hero-bg" id="foodDetailImageBg" src="${localAssetPath('img/modal-food-reference.jpg')}" alt="" aria-hidden="true"><img id="foodDetailImage" src="${localAssetPath('img/modal-food-reference.jpg')}" alt="Food photo"><div class="food-detail-hero-fade"></div><div class="food-detail-hero-copy"><span class="food-detail-pack-badge">FOOD PACK</span><h2 id="foodDetailName">Food</h2><span class="food-detail-title-line"></span><div id="foodDetailSummary" class="food-detail-summary" aria-live="polite">—</div><p id="foodDetailDescription" class="food-detail-description"></p></div></div><div class="food-detail-grid"><div><span>Category</span><strong id="foodDetailCategory">—</strong></div><div><span>Available</span><strong id="foodDetailQuantity">—</strong></div><div><span>Expires</span><strong id="foodDetailExpires">—</strong></div><div><span>Donor</span><strong id="foodDetailDonor">Community donor</strong></div><div><span>Pickup location</span><strong id="foodDetailLocation">—</strong></div><div><span>Distance from you</span><strong id="foodDetailDistance">—</strong></div><div><span>Pickup window</span><strong id="foodDetailPickupWindow">Not specified</strong></div><div><span>Pickup coordinates</span><strong id="foodDetailCoordinates">—</strong></div><div><span>Food condition</span><strong id="foodDetailCondition">Not specified</strong></div><div><span>Allergens</span><strong id="foodDetailAllergens">Not specified</strong></div></div><div class="food-detail-reservation" id="foodDetailReservation" hidden><strong id="foodDetailReservationTitle">Being claimed</strong><span id="foodDetailReservationText">Someone is currently reserving this food.</span></div><div class="food-detail-instructions" id="foodDetailInstructionsWrap"><span>Pickup instructions</span><p id="foodDetailInstructions">—</p></div><div class="food-detail-actions"><div class="food-detail-route" id="foodDetailRouteWrap" hidden><a class="btn btn-outline" id="foodDetailRoute" href="#" target="_blank" rel="noopener"><i data-feather="navigation"></i> View route</a></div><button class="btn btn-outline" id="foodDetailReport" type="button"><i data-feather="flag"></i> Report a problem</button><button class="btn btn-primary" id="foodDetailClaim" type="button"><i data-feather="heart"></i> Claim Food</button></div></div></div>`);
    modal=$('#foodDetailModal');
    const hide=()=>{modal.classList.remove('show');modal.setAttribute('aria-hidden','true');clearInterval(window.foodDetailCountdownTimer)};
    $('#foodDetailClose')?.addEventListener('click',hide);
    modal.addEventListener('click',e=>{if(e.target===modal)hide()});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&modal.classList.contains('show'))hide()});
  }
  renderFeatherIcons();
}

function openFoodDetails(food){
  setupFoodDetailModal();
  const modal=$('#foodDetailModal');if(!modal||!food)return;
  const category=getCategoryName(food)||'Food';
  const qty=Number(food.remaining_quantity??food.qty??0);
  const unit=food.unit||'';
  const detailImage=$('#foodDetailImage');
  const detailImageBg=$('#foodDetailImageBg');
  const imageUrl=String(food.image_url||food.photo_url||food.food_image_url||'').trim();
  const resolvedImage=imageUrl||localAssetPath('img/modal-food-reference.jpg');
  if(detailImage){
    detailImage.onerror=()=>{ detailImage.onerror=null; detailImage.src=localAssetPath('img/modal-food-reference.jpg'); if(detailImageBg) detailImageBg.src=localAssetPath('img/modal-food-reference.jpg'); };
    detailImage.src=resolvedImage;
    detailImage.alt=`${food.food_name||food.name||'Food'} photo`;
  }
  if(detailImageBg){
    detailImageBg.onerror=()=>{ detailImageBg.onerror=null; detailImageBg.src=localAssetPath('img/modal-food-reference.jpg'); };
    detailImageBg.src=resolvedImage;
  }
  $('#foodDetailName').textContent=food.food_name||food.name||'Food';
  const summaryEl=$('#foodDetailSummary');
  if(summaryEl) summaryEl.textContent=`${qty} ${unit}`.trim();
  $('#foodDetailDescription').textContent=food.description||'Safe-to-share food available for community pickup.';
  $('#foodDetailCategory').textContent=category;
  $('#foodDetailQuantity').textContent=`${qty} ${unit}`.trim();
  $('#foodDetailExpires').textContent=food.expires||formatExpiry(food.expiration_at);
  $('#foodDetailLocation').textContent=food.location||food.pickup_location||'Pickup location to be confirmed';
  const donorCoordinates=getFoodCoordinates(food);
  const donorLat=donorCoordinates?.lat,donorLng=donorCoordinates?.lng;
  const hasDonorCoordinates=donorCoordinates!==null;
  const savedLocation=getSavedLocation();
  const computedDistance=Number.isFinite(food.distance_km) ? food.distance_km : (hasDonorCoordinates&&savedLocation ? distanceKm(savedLocation.lat,savedLocation.lng,donorLat,donorLng) : null);
  const distanceEl=$('#foodDetailDistance');
  const coordinatesEl=$('#foodDetailCoordinates');
  if(distanceEl) distanceEl.textContent=Number.isFinite(computedDistance) ? formatDistance(computedDistance) : (savedLocation ? 'Distance unavailable' : 'Turn on location');
  if(summaryEl){
    const distanceSummary=Number.isFinite(computedDistance) ? formatDistance(computedDistance) : (savedLocation ? 'Distance unavailable' : 'Turn on location');
    summaryEl.textContent=`${qty} ${unit}`.trim()+` · ${distanceSummary}`;
  }
  if(coordinatesEl) coordinatesEl.textContent=hasDonorCoordinates ? `${donorLat.toFixed(6)}, ${donorLng.toFixed(6)}` : 'Not provided by donor';
  const donorLabel=(window.sb?.auth ? null : null);
  $('#foodDetailDonor').textContent=food.donor_id && window.currentUserId && String(food.donor_id)===String(window.currentUserId) ? 'You' : 'Community donor';
  const pickupStart=food.pickup_available_from?new Date(food.pickup_available_from):null;
  const pickupEnd=food.pickup_available_until?new Date(food.pickup_available_until):null;
  const validStart=pickupStart&&!Number.isNaN(pickupStart.getTime());
  const validEnd=pickupEnd&&!Number.isNaN(pickupEnd.getTime());
  const pickupWindowEl=$('#foodDetailPickupWindow');
  if(pickupWindowEl){
    pickupWindowEl.textContent=validStart&&validEnd ? `${pickupStart.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})} – ${pickupEnd.toLocaleString([], {hour:'numeric',minute:'2-digit'})}` : validStart ? `From ${pickupStart.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}` : validEnd ? `Until ${pickupEnd.toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}` : 'Not specified';
  }
  $('#foodDetailCondition').textContent=food.food_condition||'Not specified';
  $('#foodDetailAllergens').textContent=food.allergen_info||'Not specified';
  const routeWrap=$('#foodDetailRouteWrap'),route=$('#foodDetailRoute');
  if(routeWrap&&route){
    if(hasDonorCoordinates){ route.href=`https://www.google.com/maps/dir/?api=1&destination=${donorLat},${donorLng}`; routeWrap.hidden=false; }
    else routeWrap.hidden=true;
  }
  const reservationBox=$('#foodDetailReservation'),reservationTitle=$('#foodDetailReservationTitle'),reservationText=$('#foodDetailReservationText');
  clearInterval(window.foodDetailCountdownTimer);
  if(reservationBox){
    if(food.status==='reserved'){
      reservationBox.hidden=false;
      reservationTitle.textContent='Being claimed';
      const updateReservationCountdown=()=>{
        const target=food.reservation_expires_at?new Date(food.reservation_expires_at).getTime():NaN;
        if(!Number.isFinite(target)){reservationText.textContent='Someone is currently reserving this food.';return;}
        const remaining=Math.max(0,target-Date.now());
        if(remaining<=0){reservationText.textContent='Reservation is ending. Refreshing availability…';clearInterval(window.foodDetailCountdownTimer);
          loadFoodPosts(getSavedLocation(),{silent:true}).catch(error=>showToast(error?.message||'Could not refresh availability.'));return;}
        const totalSeconds=Math.floor(remaining/1000),mins=Math.floor(totalSeconds/60),secs=totalSeconds%60;
        reservationText.textContent=`Another recipient is claiming this food. Reservation ends in ${mins}m ${String(secs).padStart(2,'0')}s.`;
      };
      window.foodDetailCountdownTimer=setInterval(updateReservationCountdown,1000); updateReservationCountdown();
    } else { reservationBox.hidden=true; }
  }
  const instructions=food.pickup_instructions||'';
  $('#foodDetailInstructions').textContent=instructions||'No additional pickup instructions provided.';
  $('#foodDetailInstructionsWrap').hidden=!instructions;
  const reportBtn=$('#foodDetailReport');
  if(reportBtn){ reportBtn.onclick=()=>openFoodReportModal(food); }
  const detailClaim=$('#foodDetailClaim');
  if(detailClaim){
    detailClaim.disabled=food.status==='reserved';
    detailClaim.textContent=food.status==='reserved'?'Being claimed':'Claim Food';
    detailClaim.onclick=async()=>{
      if(food.status==='reserved'){showToast('This food is currently being claimed by another recipient.');return}
      if(!window.sb){showToast('Supabase is not configured.');return}
      const {data:{user}}=await window.sb.auth.getUser();
      if(!user){window.location.href=loginPath();return}
      modal.classList.remove('show');modal.setAttribute('aria-hidden','true');openClaimModal(food);
    };
  }
  modal.classList.add('show');modal.setAttribute('aria-hidden','false');
}

function ensureFoodReportModal(){
  let modal=$('#foodReportModal');
  if(modal)return modal;
  document.body.insertAdjacentHTML('beforeend',`<div class="food-report-modal" id="foodReportModal" aria-hidden="true"><div class="food-report-dialog" role="dialog" aria-modal="true" aria-labelledby="foodReportTitle"><h2 id="foodReportTitle">Report this food</h2><p class="muted" id="foodReportFoodName"></p><form id="foodReportForm"><label>Reason<select id="foodReportReason" required><option value="expired">Food appears expired</option><option value="unavailable">Food is no longer available</option><option value="location">Pickup location is incorrect</option><option value="inaccurate">Listing is inaccurate</option><option value="safety">Food safety concern</option><option value="other">Other</option></select></label><label>Details<textarea id="foodReportDetails" rows="4" placeholder="Tell the admin what is wrong..."></textarea></label><div class="claim-actions"><button class="btn btn-outline" id="foodReportCancel" type="button">Cancel</button><button class="btn btn-primary" type="submit">Submit report</button></div></form></div></div>`);
  renderFeatherIcons();
  modal=$('#foodReportModal');
  const hide=()=>{modal.classList.remove('show');modal.setAttribute('aria-hidden','true');document.body.classList.remove('claim-modal-open')};
  $('#foodReportCancel')?.addEventListener('click',hide);modal.addEventListener('click',e=>{if(e.target===modal)hide()});
  $('#foodReportForm')?.addEventListener('submit',async e=>{
    e.preventDefault(); const id=$('#foodReportForm').dataset.foodId; if(!window.sb||!id)return;
    const {data:{user}}=await window.sb.auth.getUser(); if(!user){window.location.href=loginPath();return;}
    const reason=$('#foodReportReason').value,details=$('#foodReportDetails').value.trim();
    const submitBtn=$('#foodReportForm').querySelector('button[type="submit"]');
    submitBtn.disabled=true;
    const status=showStatusToast('Sending your report…');
    const {error}=await safeRequest(()=>window.sb.from('food_reports').insert({food_post_id:id,reporter_id:user.id,reason,details:details||null}));
    submitBtn.disabled=false;
    if(error){status.fail(error.message||'Could not submit report.');return;}
    hide();status.success('Report sent to the admin. Thank you.');
  });
  return modal;
}
function openFoodReportModal(food){
  const modal=ensureFoodReportModal();if(!modal||!food)return;
  $('#foodReportFoodName').textContent=food.food_name||food.name||'Food post';
  $('#foodReportForm').dataset.foodId=food.id;$('#foodReportDetails').value='';
  modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.classList.add('claim-modal-open');
}

function openClaimModal(food){
  const modal=ensureClaimModal();if(!modal||!food)return;
  const remaining=Number(food.remaining_quantity??food.qty??0);
  $('#claimFoodName').textContent=food.food_name||food.name||'Food';
  $('#claimAvailable').textContent=`Available: ${remaining} ${food.unit||''}`;
  $('#claimQuantity').max=remaining;
  $('#claimQuantity').value=1;
  $('#claimQtyMinus').disabled=true;
  $('#claimQtyPlus').disabled=remaining<=1;
  $('#claimForm').dataset.foodId=food.id;
  modal.classList.add('show');modal.setAttribute('aria-hidden','false');document.body.classList.add('claim-modal-open');
  setTimeout(()=>$('#claimQuantity')?.focus(),50);
}

function setupClaimModal(){
  ensureClaimModal();
  const modal=$('#claimModal'),close=$('#claimModalClose'),cancel=$('#claimCancel'),form=$('#claimForm'),qtyInput=$('#claimQuantity'),qtyMinus=$('#claimQtyMinus'),qtyPlus=$('#claimQtyPlus');
  if(!modal||!form||form.dataset.bound)return;
  form.dataset.bound='true';
  const hide=()=>{modal.classList.remove('show');modal.setAttribute('aria-hidden','true');document.body.classList.remove('claim-modal-open');form.reset()};
  close?.addEventListener('click',hide);cancel?.addEventListener('click',hide);modal.addEventListener('click',e=>{if(e.target===modal)hide()});
  const clampQty=()=>{
    const min=Number(qtyInput.min)||1;
    const max=qtyInput.max!==''?Number(qtyInput.max):Infinity;
    let val=Number(qtyInput.value);
    if(!Number.isFinite(val))val=min;
    val=Math.min(Math.max(Math.round(val),min),max);
    qtyInput.value=val;
    if(qtyMinus)qtyMinus.disabled=val<=min;
    if(qtyPlus)qtyPlus.disabled=val>=max;
  };
  qtyMinus?.addEventListener('click',()=>{qtyInput.value=(Number(qtyInput.value)||1)-1;clampQty()});
  qtyPlus?.addEventListener('click',()=>{qtyInput.value=(Number(qtyInput.value)||0)+1;clampQty()});
  qtyInput?.addEventListener('input',clampQty);
  qtyInput?.addEventListener('change',clampQty);
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const id=form.dataset.foodId;
    const qty=Number(qtyInput.value);
    const food=(window.currentFoods||[]).find(f=>String(f.id)===String(id));
    if(!food||!window.sb){showToast('Please log in to claim food.');return}
    const remaining=Number(food.remaining_quantity??food.qty??0);
    if(!Number.isFinite(qty)||qty<=0||qty>remaining){showToast('Enter a valid quantity available for this food.');return}
    const {data:{user}}=await window.sb.auth.getUser();
    if(!user){window.location.href=loginPath();return}
    const btn=form.querySelector('button[type="submit"]');btn.disabled=true;btn.textContent='Sending…';
    const {error}=await safeRequest(()=>window.sb.rpc('claim_food',{p_food_post_id:id,p_quantity:qty}));
    btn.disabled=false;btn.textContent='Send Claim Request';
    if(error){showToast(error.message||'Could not claim this food.');return}
    hide();
    showToast(`Claim request sent for ${qty} ${food.unit||'unit(s)'} of ${food.food_name||food.name}. The donor will be notified.`);
    await loadFoodPosts();
  });
}

function setupFoodRealtime(){
  if(!window.sb||window.foodRealtimeChannel)return;
  window.foodRealtimeChannel=window.sb.channel('frss-food-posts-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'food_posts'},()=>{
      clearTimeout(window.foodRealtimeTimer);
      window.foodRealtimeTimer=setTimeout(()=>{
        const loc=getSavedLocation();
        if(loc)loadFoodPosts(loc,{silent:true});
      },350);
    })
    .subscribe();
}

async function updateClaimStatus(claimId,status){
  if(!window.sb||!claimId)return false;
  const {error}=await safeRequest(()=>window.sb.rpc('update_claim_status',{p_claim_id:claimId,p_status:status}));
  if(error){showToast(error.message||'Could not update the claim.');return false;}
  return true;
}

function notificationTypeIcon(type){
  const map={claim_request:'bell',claim_confirmed:'check-circle',claim_declined:'x-circle',claim_cancelled:'slash',ready_for_pickup:'navigation',picked_up:'package',completed:'heart',reservation_expired:'clock',food_expired:'alert-circle'};
  return map[type]||'bell';
}

function formatNotificationTime(value){
  if(!value)return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '';
  const delta=Math.max(0,Date.now()-d.getTime());
  const mins=Math.floor(delta/60000);
  if(mins<1)return 'Just now';
  if(mins<60)return `${mins}m ago`;
  const hours=Math.floor(mins/60);
  if(hours<24)return `${hours}h ago`;
  const days=Math.floor(hours/24);
  if(days<7)return `${days}d ago`;
  return d.toLocaleDateString([], {month:'short',day:'numeric'});
}

function renderNotifications(rows){
  const list=$('#userNotifications'),count=$('#notificationCount');
  if(!list)return;
  const notifications=Array.isArray(rows)?rows:[];
  if(count)count.textContent=String(notifications.filter(n=>!n.is_read).length);
  list.innerHTML=notifications.length?notifications.map(n=>`<article class="notification-item ${n.is_read?'is-read':''}" data-notification-id="${escapeHtml(n.id)}"><div class="notification-icon"><i data-feather="${escapeHtml(notificationTypeIcon(n.type))}"></i></div><div class="notification-copy"><strong>${escapeHtml(n.title||'Notification')}</strong><p>${escapeHtml(n.message||'')}</p><small>${escapeHtml(formatNotificationTime(n.created_at))}</small></div>${n.is_read?'':'<button class="btn btn-outline notification-mark-read" type="button">Mark read</button>'}</article>`).join(''):'<span class="admin-muted">No notifications yet.</span>';
  if(window.feather)window.feather.replace({width:18,height:18,'stroke-width':1.8});
  list.querySelectorAll('.notification-mark-read').forEach(btn=>btn.addEventListener('click',async()=>{
    const item=btn.closest('.notification-item'),id=item?.dataset.notificationId;if(!id||!window.sb)return;
    btn.disabled=true;
    const {error}=await window.sb.from('notifications').update({is_read:true}).eq('id',id);
    if(error){showToast(error.message||'Could not mark notification as read.');btn.disabled=false;return;}
    item.classList.add('is-read');btn.remove();
    if(count)count.textContent=String(list.querySelectorAll('.notification-item:not(.is-read)').length);
  }));
}

async function loadUserNotifications(uid){
  const list=$('#userNotifications');if(!list||!window.sb||!uid)return;
  const {data,error}=await window.sb.from('notifications').select('id,claim_id,type,title,message,is_read,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(12);
  if(error){console.warn('Could not load notifications:',error);list.innerHTML='<span class="admin-muted">Notifications are unavailable. Run the notification migration in Supabase.</span>';return;}
  renderNotifications(data||[]);
}

async function markAllNotificationsRead(){
  if(!window.sb||!window.currentUserId)return;
  const {error}=await window.sb.from('notifications').update({is_read:true}).eq('user_id',window.currentUserId).eq('is_read',false);
  if(error){showToast(error.message||'Could not mark notifications as read.');return;}
  await loadUserNotifications(window.currentUserId);
  if (typeof loadNotificationInbox === 'function') await loadNotificationInbox(window.currentUserId);
}

function setupNotificationRealtime(uid){
  if(!window.sb||!uid)return;
  if(window.notificationRealtimeChannel&&window.notificationRealtimeUserId===uid)return;
  if(window.notificationRealtimeChannel)window.sb.removeChannel(window.notificationRealtimeChannel);
  window.notificationRealtimeUserId=uid;
  window.notificationRealtimeChannel=window.sb.channel(`frss-notifications-${uid}`).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${uid}`},async()=>{await loadUserNotifications(uid);if(typeof loadNotificationInbox==='function')await loadNotificationInbox(uid);}).subscribe();
}

function getSavedLocation(){
  try{
    const raw=sessionStorage.getItem('frss-user-location');
    if(!raw)return null;
    const value=JSON.parse(raw);
    if(Number.isFinite(value?.lat)&&Number.isFinite(value?.lng))return value;
  }catch(e){console.warn('Could not read saved location:',e)}
  return null;
}

function saveLocation(lat,lng){
  const value={lat:Number(lat),lng:Number(lng),savedAt:Date.now()};
  try{sessionStorage.setItem('frss-user-location',JSON.stringify(value))}catch(e){}
  return value;
}

function requestUserLocation(){
  return new Promise((resolve,reject)=>{
    if(!navigator.geolocation){reject(new Error('Location is not supported by this browser.'));return}
    navigator.geolocation.getCurrentPosition(
      position=>resolve(saveLocation(position.coords.latitude,position.coords.longitude)),
      error=>{
        const messages={1:'Location permission was denied. Please allow location access in your browser settings.',2:'Your location could not be determined. Please try again.',3:'Location request timed out. Please try again.'};
        reject(new Error(messages[error.code]||'Unable to get your location.'));
      },
      {enableHighAccuracy:true,timeout:12000,maximumAge:300000}
    );
  });
}

function distanceKm(lat1,lng1,lat2,lng2){
  const toRad=v=>v*Math.PI/180;
  const dLat=toRad(lat2-lat1),dLng=toRad(lng2-lng1);
  const a=Math.sin(dLat/2)**2+Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

function formatDistance(km){
  if(!Number.isFinite(km))return '';
  if(km<1)return `${Math.round(km*1000)} m away`;
  return `${km.toFixed(km<10?1:0)} km away`;
}

function setLocationUI(location){
  const homeNote=$('#homeLocationNote'),homeBtn=$('#homeLocationBtn'),findTitle=$('#findLocationTitle'),findStatus=$('#findLocationStatus'),findBtn=$('#findLocationBtn');
  if(location){
    if(homeNote)homeNote.textContent='Showing the closest available food to your location.';
    if(homeBtn){homeBtn.innerHTML='<i data-feather="check" aria-hidden="true"></i> Location on';homeBtn.disabled=true;}
    if(findTitle)findTitle.textContent='Location enabled';
    if(findStatus)findStatus.textContent='Food is sorted by distance from your current location.';
    if(findBtn){findBtn.innerHTML='<i data-feather="check" aria-hidden="true"></i> Location on';findBtn.disabled=true;}
  }
  renderFeatherIcons();
}

async function enableLocationAndLoad(){
  const homeBtn=$('#homeLocationBtn'),findBtn=$('#findLocationBtn');
  [homeBtn,findBtn].forEach(btn=>{if(btn)btn.disabled=true});
  [homeBtn,findBtn].forEach(btn=>{if(btn)btn.textContent='Locating…'});
  try{
    const location=await requestUserLocation();
    setLocationUI(location);
    await loadFoodPosts(location);
  }catch(error){
    [homeBtn,findBtn].forEach(btn=>{if(btn)btn.disabled=false});
    if(homeBtn)homeBtn.innerHTML='<i data-feather="navigation" aria-hidden="true"></i> Use my location';
    if(findBtn)findBtn.textContent='Use my location';
    const note=$('#homeLocationNote'),findStatus=$('#findLocationStatus');
    if(note)note.textContent=error.message;
    if(findStatus)findStatus.textContent=error.message;
    showToast(error.message);
    renderFeatherIcons();
  }
}

async function loadFoodPosts(locationOverride=null,options={}){
  const grid=$('#foodGrid'),empty=$('#emptyState');if(!grid)return;
  const list=[];
  if(!window.sb){
    if(empty){empty.classList.remove('hidden');empty.innerHTML='<div>⚠️</div><h3>Food listings are unavailable</h3><p>Supabase is not configured on this page.</p>';}
    window.currentFoods=[];renderFoodList([]);return;
  }
  const isHomePage=!document.body.classList.contains('find-page');
  const location=locationOverride||getSavedLocation();
  if(!location){
    grid.classList.add('hidden');
    $('#homeFoodFooter')?.classList.add('hidden');
    window.currentFoods=[];renderFoodList([]);return;
  }
  const {data:authData,error:userError}=await window.sb.auth.getUser();
  if(userError)console.warn('Could not read the current session:',userError);
  // Mark time-expired posts before loading listings when a signed-in user is
  // present. Public listings are still protected by the expiration_at filter.
  if(authData?.user){
    const {error:releaseError}=await window.sb.rpc('release_expired_reservations');
    if(releaseError) console.warn('Could not release expired reservations:',releaseError);
    const {error:expireError}=await window.sb.rpc('expire_food_posts');
    if(expireError) console.warn('Could not refresh expired food statuses:',expireError);
  }
  // Load all currently available food. Posts without coordinates are kept as a
  // fallback because they may still be useful to someone nearby, but they cannot
  // be distance-ranked.
  const {data,error}=await window.sb.from('food_posts')
    .select('id,donor_id,food_name,description,quantity,remaining_quantity,unit,expiration_at,pickup_location,pickup_instructions,pickup_available_from,pickup_available_until,food_condition,allergen_info,image_url,category_id,created_at,latitude,longitude,status,reservation_expires_at,categories(name)')
    .in('status',['available','reserved'])
    .or('status.eq.reserved,remaining_quantity.gt.0')
    .gt('expiration_at',new Date().toISOString())
    .order('created_at',{ascending:false});
  if(error){
    console.error('Could not load food posts:',error);
    window.currentFoods=[];
    if(empty){empty.classList.remove('hidden');empty.innerHTML='<div>⚠️</div><h3>Could not load food posts</h3><p>Please check your Supabase connection and refresh.</p>';}
    renderFoodList([]);return;
  }

  const foods=(Array.isArray(data)?data:[]).map(food=>{
    const coordinates=getFoodCoordinates(food);
    const lat=coordinates?.lat,lng=coordinates?.lng;
    const hasCoordinates=coordinates!==null;
    return {...food,has_coordinates:hasCoordinates,distance_km:hasCoordinates?distanceKm(location.lat,location.lng,lat,lng):null};
  });
  const availableFoods=foods.filter(f=>f.status==='available');
  const reservedFoods=foods.filter(f=>f.status==='reserved');
  const geoAvailable=availableFoods.filter(f=>f.has_coordinates).sort((a,b)=>a.distance_km-b.distance_km);
  const fallbackAvailable=availableFoods.filter(f=>!f.has_coordinates).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  const geoReserved=reservedFoods.filter(f=>f.has_coordinates).sort((a,b)=>a.distance_km-b.distance_km);
  const fallbackReserved=reservedFoods.filter(f=>!f.has_coordinates).sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));

  if(isHomePage){
    const NEARBY_RADIUS_KM=10;
    const nearby=geoAvailable.filter(f=>f.distance_km<=NEARBY_RADIUS_KM);
    let selected=(nearby.length?nearby:geoAvailable).slice(0,4);
    if(selected.length<4){
      const selectedIds=new Set(selected.map(f=>String(f.id)));
      selected.push(...fallbackAvailable.filter(f=>!selectedIds.has(String(f.id))).slice(0,4-selected.length));
    }
    // If fewer than six available posts exist, show nearby reservations too so
    // users can see that those foods are already being claimed rather than
    // thinking the listings are stale.
    if(selected.length<4){
      const selectedIds=new Set(selected.map(f=>String(f.id)));
      selected.push(...[...geoReserved,...fallbackReserved].filter(f=>!selectedIds.has(String(f.id))).slice(0,4-selected.length));
    }
    window.currentFoods=selected;
    
  }else{
    window.currentFoods=[...geoAvailable,...fallbackAvailable,...geoReserved,...fallbackReserved];
  }

  grid.classList.remove('hidden');
  $('#homeFoodFooter')?.classList.toggle('hidden',!isHomePage);
  renderFoodList(window.currentFoods);
}

function normalizeSearchText(value){
  return String(value||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
}

function levenshteinDistance(a,b){
  if(a===b)return 0;
  if(!a)return b.length;
  if(!b)return a.length;
  if(a.length>b.length)[a,b]=[b,a];
  let previous=Array.from({length:a.length+1},(_,i)=>i);
  for(let j=1;j<=b.length;j++){
    const current=[j];
    for(let i=1;i<=a.length;i++){
      current[i]=Math.min(
        current[i-1]+1,
        previous[i]+1,
        previous[i-1]+(a[i-1]===b[j-1]?0:1)
      );
    }
    previous=current;
  }
  return previous[a.length];
}

function fuzzyWordMatch(query,word){
  if(!query||!word)return false;
  if(word.includes(query)||query.includes(word))return true;
  if(query.length<=2)return false;
  const distance=levenshteinDistance(query,word);
  const maxDistance=query.length<=4?1:query.length<=7?2:3;
  return distance<=maxDistance;
}

function fuzzyFoodMatch(name,query){
  const text=normalizeSearchText(name);
  const q=normalizeSearchText(query);
  if(!q)return true;
  if(text.includes(q))return true;
  const words=text.split(' ').filter(Boolean);
  const queryWords=q.split(' ').filter(Boolean);
  return queryWords.every(queryWord=>words.some(word=>fuzzyWordMatch(queryWord,word)));
}

function renderFoodList(source){
  const grid=$('#foodGrid'),search=$('#foodSearch'),filter=$('#categoryFilter'),empty=$('#emptyState');if(!grid)return;
  const q=(search?.value||'').trim();
  const cat=normalizeCategory(filter?.value||'all');
  const list=(source||[]).filter(f=>{
    const name=String(f.name||f.food_name||'');
    const c=normalizeCategory(getCategoryName(f));
    return (!q||fuzzyFoodMatch(name,q))&&(cat==='all'||c===cat);
  });
  grid.innerHTML=list.map(foodCard).join('');
  if(empty){
    if(list.length===0&&!empty.querySelector('h3'))empty.innerHTML='<div>🍽️</div><h3>No food found</h3><p>Try another search or check back for new donations.</p>';
    empty.classList.toggle('hidden',list.length>0);
  }
  const resultsCount=$('#resultsCount');
  if(resultsCount){ const reservedCount=list.filter(f=>f.status==='reserved').length; resultsCount.textContent=`${list.length} ${list.length===1?'post':'posts'} shown${reservedCount?` · ${reservedCount} being claimed`:''}`; }
  grid.querySelectorAll('.view-food-btn').forEach(b=>b.addEventListener('click',()=>{const f=(source||[]).find(x=>String(x.id)===String(b.dataset.id));if(f)openFoodDetails(f)}));
}

function renderFoods(){
  if(!$('#foodGrid'))return;
  const search=$('#foodSearch'),filter=$('#categoryFilter');
  search?.addEventListener('input',()=>renderFoodList(window.currentFoods||getStaticFoods()));
  filter?.addEventListener('change',()=>renderFoodList(window.currentFoods||getStaticFoods()));
  setupFoodDetailModal();setupClaimModal();setupFoodRealtime();
  loadFoodCategories().then(()=>loadFoodPosts()).catch(error=>showToast(error?.message||'Could not load food listings.'));
}


function setupHeaderNotifications(uid){
  if(!uid||!window.sb)return;
  const navActions=document.querySelector('header .nav-actions');
  if(!navActions)return;
  let wrap=document.querySelector('header .header-notification');
  if(!wrap){
    wrap=document.createElement('div');
    wrap.className='header-notification';
    wrap.innerHTML=`<button class="header-notification-btn" id="headerNotificationBtn" type="button" aria-label="Notifications" aria-expanded="false" title="Notifications"><i data-feather="bell"></i><span class="header-notification-badge hidden" id="headerNotificationBadge">0</span></button><div class="header-notification-menu" id="headerNotificationMenu" aria-hidden="true"><div class="header-notification-list" id="headerNotificationList"><span class="admin-muted">Loading notifications…</span></div><a class="header-notification-see-all" href="${window.location.pathname.includes('/pages/')?'notifications.html':'pages/notifications.html'}">See All</a></div>`;
    const loginLink=loginLinkForHeader();
    const placeHeaderNotification=()=>{
      const mobileSlot=document.getElementById('mobileNotificationSlot');
      const mobileActions=document.querySelector('header .mobile-header-actions');
      const useMobile=window.matchMedia('(max-width: 800px)').matches;

      // On mobile the notification control belongs to the header action row,
      // never to the slide-down hamburger navigation panel.
      if(useMobile && mobileSlot && mobileActions){
        mobileSlot.appendChild(wrap);
        return;
      }

      if(loginLink && loginLink.parentElement===navActions){
        loginLink.insertAdjacentElement('afterend',wrap);
      }else{
        navActions.appendChild(wrap);
      }
    };
    placeHeaderNotification();
    if(!window.headerNotificationPlacementHandler){
      window.headerNotificationPlacementHandler=()=>{
        const activeWrap=document.querySelector('.header-notification');
        if(!activeWrap)return;
        const mobileSlot=document.getElementById('mobileNotificationSlot');
        const mobileActions=document.querySelector('header .mobile-header-actions');
        const navActions=document.querySelector('header .nav-actions');
        const loginLink=loginLinkForHeader();
        if(window.matchMedia('(max-width: 800px)').matches && mobileSlot && mobileActions){
          mobileSlot.appendChild(activeWrap);
        }else if(loginLink && navActions && loginLink.parentElement===navActions){
          loginLink.insertAdjacentElement('afterend',activeWrap);
        }else if(navActions){
          navActions.appendChild(activeWrap);
        }
      };
      window.addEventListener('resize',window.headerNotificationPlacementHandler);
    }
    wrap.dataset.userId=uid;
    const btn=wrap.querySelector('#headerNotificationBtn');
    btn.addEventListener('click',async(e)=>{e.stopPropagation();const open=wrap.classList.toggle('open');btn.setAttribute('aria-expanded',String(open));wrap.querySelector('#headerNotificationMenu')?.setAttribute('aria-hidden',String(!open));if(open)await loadHeaderNotificationItems(wrap.dataset.userId);});
    wrap.querySelector('.header-notification-menu').addEventListener('click',e=>e.stopPropagation());
    document.addEventListener('click',()=>{wrap.classList.remove('open');btn.setAttribute('aria-expanded','false');wrap.querySelector('#headerNotificationMenu')?.setAttribute('aria-hidden','true');});
  }
  wrap.dataset.userId=uid;
  loadHeaderNotificationItems(uid);
  if(window.headerNotificationRealtimeChannel&&window.headerNotificationRealtimeUserId!==uid){window.sb.removeChannel(window.headerNotificationRealtimeChannel);window.headerNotificationRealtimeChannel=null;}
  if(!window.headerNotificationRealtimeChannel){
    window.headerNotificationRealtimeUserId=uid;
    window.headerNotificationRealtimeChannel=window.sb.channel(`frss-header-notifications-${uid}`).on('postgres_changes',{event:'*',schema:'public',table:'notifications',filter:`user_id=eq.${uid}`},()=>loadHeaderNotificationItems(uid)).subscribe();
  }
}
function loginLinkForHeader(){return document.querySelector('header .nav-actions a[href*="login.html"], header .nav-actions .user-name-btn')}
async function loadHeaderNotificationItems(uid){
  const list=document.getElementById('headerNotificationList'),badge=document.getElementById('headerNotificationBadge');
  if(!list||!window.sb||!uid)return;
  const {data,error}=await window.sb.from('notifications').select('id,type,title,message,is_read,created_at').eq('user_id',uid).order('created_at',{ascending:false}).limit(5);
  if(error){list.innerHTML='<span class="admin-muted">Notifications are unavailable.</span>';return;}
  const {count,error:countError}=await window.sb.from('notifications').select('id',{count:'exact',head:true}).eq('user_id',uid).eq('is_read',false);
  const rows=data||[],unread=countError?rows.filter(n=>!n.is_read).length:(count||0);
  badge?.classList.toggle('hidden',unread===0);if(badge)badge.textContent=String(unread>9?'9+':unread);
  list.innerHTML=rows.length?rows.map(n=>`<button class="header-notification-item ${n.is_read?'is-read':''}" type="button" data-notification-id="${escapeHtml(n.id)}"><span class="header-notification-icon"><i data-feather="${escapeHtml(notificationTypeIcon(n.type))}"></i></span><span class="header-notification-copy"><strong>${escapeHtml(n.title||'Notification')}</strong><small>${escapeHtml(n.message||'')}</small><em>${escapeHtml(formatNotificationTime(n.created_at))}</em></span>${n.is_read?'':'<span class="header-notification-dot"></span>'}</button>`).join(''):'<div class="header-notification-empty"><i data-feather="bell-off"></i><span>No notifications yet.</span></div>';
  renderFeatherIcons();
  list.querySelectorAll('[data-notification-id]').forEach(item=>item.addEventListener('click',async()=>{const id=item.dataset.notificationId;await window.sb.from('notifications').update({is_read:true}).eq('id',id);await loadHeaderNotificationItems(uid);}));
}

async function setupAuthNavigation(){
  const loginLink=document.querySelector('header .nav-actions a[href*="login.html"]');
  if(!loginLink || !window.sb?.auth) return;
  const render=async(user)=>{
    window.currentUserId=user?.id||null;
    if(!user){
      loginLink.textContent='Log in';
      loginLink.href=window.location.pathname.includes('/pages/')?'login.html':'pages/login.html';
      loginLink.classList.remove('user-name-btn');
      loginLink.removeAttribute('title');
      loginLink.removeAttribute('aria-label');
      document.querySelector('.header-notification')?.remove();
      if(window.headerNotificationRealtimeChannel){window.sb.removeChannel(window.headerNotificationRealtimeChannel);window.headerNotificationRealtimeChannel=null;}
      return;
    }
    let fullName=String(user.user_metadata?.full_name||user.user_metadata?.name||'').trim();
    {
      try{
        const {data}=await window.sb.from('profiles').select('full_name').eq('id',user.id).maybeSingle();
        fullName=String(data?.full_name||fullName).trim();
      }catch(e){ console.warn('Could not load profile name:',e); }
    }
    if(!fullName) fullName=String(user.email||'').split('@')[0]||'Account';
    loginLink.textContent=fullName;
    loginLink.href=window.location.pathname.includes('/pages/')?'dashboard.html':'pages/dashboard.html';
    loginLink.classList.add('user-name-btn');
    loginLink.title='Open your dashboard';
    loginLink.setAttribute('aria-label',`${fullName} — open dashboard`);
    setupHeaderNotifications(user.id);
  };
  const {data:{user}}=await window.sb.auth.getUser();
  await render(user);
  window.sb.auth.onAuthStateChange((_event,session)=>{ setTimeout(()=>render(session?.user||null).catch(error=>console.warn('Could not refresh account navigation:',error)),0); });
}

function setupDashboardShell(){
  const adminDashboard=document.getElementById('adminDashboard');
  const userDashboard=document.getElementById('userDashboard');
  if(!adminDashboard&&!userDashboard)return;

  // Fail closed: the shared app script must never reveal a dashboard before
  // the dashboard page has authenticated the user and resolved their role.
  adminDashboard?.classList.add('hidden');
  userDashboard?.classList.add('hidden');
}

function setupReveal(){const els=document.querySelectorAll('.reveal');els.forEach(e=>e.classList.add('animate'));if(!('IntersectionObserver'in window)){els.forEach(e=>e.classList.add('visible'));return}const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.12});els.forEach(e=>io.observe(e))}
function setupCopy(){document.querySelectorAll('[data-copy]').forEach(btn=>btn.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(btn.dataset.copy);showToast('Copied to clipboard')}catch{showToast('Copy unavailable in this browser')}}))}
document.addEventListener('DOMContentLoaded',()=>{setupDashboardShell();setupTheme();setupMenu();setupScroll();setupAuthNavigation().catch(error=>console.warn('Could not load account navigation:',error));renderFoods();setupReveal();setupCopy();renderFeatherIcons(); const loc=getSavedLocation(); if(loc){setLocationUI(loc)} else {['homeLocationBtn','findLocationBtn'].forEach(id=>document.getElementById(id)?.addEventListener('click',enableLocationAndLoad));}});