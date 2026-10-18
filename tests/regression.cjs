const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const root = require('node:path').resolve(__dirname, '..');
let passed = 0;
async function test(name, action) { await action(); passed++; console.log('PASS', name); }
function classes() { const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x),toggle:(x,on)=>{if(on??!values.has(x))values.add(x);else values.delete(x);}}; }
function element(extra={}) { return {classList:classes(),innerHTML:'',textContent:'',dataset:{},querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){},...extra}; }
const elements={foodGrid:element(),emptyState:element(),resultsCount:element(),homeFoodFooter:element()};
const document={documentElement:element(),body:element(),querySelector:s=>elements[s.slice(1)]||null,getElementById:id=>elements[id]||null,querySelectorAll:()=>[],addEventListener(){}};
const window={location:{pathname:'/frss/index.html',origin:'https://example.test'},addEventListener(){}};
const context=vm.createContext({window,document,console,setTimeout,clearTimeout,setInterval,clearInterval,navigator:{},sessionStorage:{getItem:()=>null},localStorage:{getItem:()=>null},Date,Number,Math});
vm.runInContext(fs.readFileSync(root+'/js/app.js','utf8'),context);
vm.runInContext(fs.readFileSync(root+'/js/auth.js','utf8'),context);
const run=code=>vm.runInContext(code,context);
(async()=>{
 for(const [name,food] of [
  ['null',{latitude:null,longitude:null}],['missing',{}],['empty',{latitude:'',longitude:''}],['whitespace',{latitude:' ',longitude:' '}],['out of latitude range',{latitude:91,longitude:0}],['out of longitude range',{latitude:0,longitude:-181}],['non-numeric',{latitude:'oops',longitude:120}],['one missing',{latitude:14,longitude:null}]
 ]) await test('Reject '+name+' coordinates',()=>{context.food=food;assert.equal(run('getFoodCoordinates(food)'),null);});
 await test('Real zero coordinates remain valid',()=>{context.food={latitude:0,longitude:0};assert.equal(run('getFoodCoordinates(food).lat'),0);});
 await test('Numeric string coordinates remain valid',()=>{context.food={latitude:'14.5',longitude:'120.9'};assert.equal(run('getFoodCoordinates(food).lng'),120.9);});
 await test('Home image fallback uses the correct path',()=>assert.equal(run("localAssetPath('img/modal-food-reference.jpg')"),'img/modal-food-reference.jpg'));
 window.location.pathname='/frss/pages/find-food.html';
 await test('Nested page image fallback uses the correct path',()=>assert.equal(run("localAssetPath('img/modal-food-reference.jpg')"),'../img/modal-food-reference.jpg'));
 await test('OAuth/recovery redirects preserve the deployment subpath',()=>assert.equal(run('authRedirectBase()'),'https://example.test/frss'));
 await test('Thrown authentication error restores button state',async()=>{
  window.sb={auth:{}};context.button={disabled:false,textContent:'Log in'};
  const result=await run("runAuthAction(button,'Logging in…',async()=>{throw new Error('offline')})");
  assert.equal(result.error.message,'offline');assert.equal(context.button.disabled,false);assert.equal(context.button.textContent,'Log in');
 });
 await test('Missing auth SDK returns a recoverable error',async()=>{
  window.sb=null;context.button={disabled:false,textContent:'Create account'};
  const result=await run("runAuthAction(button,'Creating…',async()=>({}))");
  assert.match(result.error.message,/Authentication is unavailable/);assert.equal(context.button.disabled,false);
 });
 await test('Returned API errors restore buttons',async()=>{
  window.sb={auth:{}};context.button={disabled:false,textContent:'Send reset link'};
  const result=await run("runAuthAction(button,'Sending…',async()=>({error:new Error('denied')}))");assert.equal(result.error.message,'denied');assert.equal(context.button.textContent,'Send reset link');
 });
 await test('Successful authentication restores button label',async()=>{
  const result=await run("runAuthAction(button,'Sending…',async()=>({data:{ok:true},error:null}))");assert.equal(result.data.ok,true);assert.equal(context.button.disabled,false);
 });
 await test('Duplicate auth submission does not send another request',async()=>{
  context.button.disabled=true;context.calls=0;await run("runAuthAction(button,'Sending…',async()=>{calls++;return {}})");assert.equal(context.calls,0);context.button.disabled=false;
 });
 await test('Thrown claim status error becomes a usable error result',async()=>{
  window.sb={rpc:async()=>{throw new Error('offline')}};assert.equal(await run("updateClaimStatus('claim','completed')"),false);
 });
 const queries=[];
 function query(result){const q={};for(const m of ['select','in','or','gt','order','eq'])q[m]=(...args)=>{queries.push([m,...args]);return q};q.then=(resolve,reject)=>Promise.resolve(result).then(resolve,reject);return q;}
 const future=new Date(Date.now()+86400000).toISOString();
 document.body.classList.add('find-page');
 window.sb={auth:{getUser:async()=>({data:{user:null},error:null})},from:()=>query({data:[{id:'no-coords',food_name:'Bread',latitude:null,longitude:null,status:'available',remaining_quantity:2,expiration_at:future},{id:'held',food_name:'Rice',latitude:14.5,longitude:120.9,status:'reserved',remaining_quantity:0,expiration_at:future}],error:null})};
 await test('Listings retain missing-coordinate fallback and fully reserved food',async()=>{
  await context.loadFoodPosts({lat:14.5,lng:120.9});
  assert.equal(window.currentFoods.length,2);const missing=window.currentFoods.find(f=>f.id==='no-coords');assert.equal(missing.has_coordinates,false);assert.equal(missing.distance_km,null);
  assert.ok(queries.some(q=>q[0]==='or'&&q[1]==='status.eq.reserved,remaining_quantity.gt.0'));assert.ok(elements.foodGrid.innerHTML.includes('Rice'));
 });
 await test('Homepage empty state is visible and contains a message',()=>{
  elements.emptyState.innerHTML='';run('renderFoodList([])');assert.match(elements.emptyState.innerHTML,/No food found/);assert.equal(elements.emptyState.classList.contains('hidden'),false);
 });
 await test('Unread badge counts beyond the five-item preview',async()=>{
  elements.headerNotificationList=element();elements.headerNotificationBadge=element();
  window.sb={from:()=>{let count=false;const q={select:(_s,o)=>{count=!!o?.head;return q},eq:()=>q,order:()=>q,limit:()=>q,then:(resolve,reject)=>Promise.resolve(count?{count:12,error:null}:{data:Array.from({length:5},(_,i)=>({id:String(i),is_read:true})),error:null}).then(resolve,reject)};return q;}};
  await context.loadHeaderNotificationItems('user');assert.equal(elements.headerNotificationBadge.textContent,'9+');assert.equal(elements.headerNotificationBadge.classList.contains('hidden'),false);
 });
 console.log(`${passed} regression checks passed`);
})().catch(error=>{console.error(error);process.exitCode=1});
