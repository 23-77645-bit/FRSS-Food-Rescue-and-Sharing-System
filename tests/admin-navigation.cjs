const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
function node(id){return {id,hidden:false,textContent:'',dataset:{},attrs:{},handlers:{},classList:{values:new Set(),add(x){this.values.add(x)},remove(x){this.values.delete(x)},contains(x){return this.values.has(x)},toggle(x,on){if(on)this.add(x);else this.remove(x)}},setAttribute(k,v){this.attrs[k]=v},removeAttribute(k){delete this.attrs[k]},addEventListener(k,fn){this.handlers[k]=fn},focus(){},matches(){return false}}}
const panels=['users','food','claims','cases','reputation','content','settings','audit'].map(k=>node('admin-'+k));
const summary=['users','food','claims','categories','reports'].map(node);
const center=node('adminControlCenter');
const title=node('title'),subtitle=node('subtitle');
center.querySelector=s=>s==='.admin-section-heading h2'?title:s==='.admin-section-heading .admin-muted'?subtitle:panels.find(p=>'#'+p.id===s)||null;
center.querySelectorAll=()=>panels;
const links=['overview','users','food','claims','categories','reports','cases','reputation','content','settings','audit'].map(k=>{const n=node(k);n.dataset.adminView=k;return n});
const rail=node('adminRail');rail.querySelectorAll=()=>links;rail.querySelector=()=>links[0];rail.contains=()=>false;
const overview=node('overview');overview.querySelectorAll=()=>[];
const analytics=node('adminOverviewAnalytics');analytics.append=()=>{};
const dashboard=node('adminDashboard');dashboard.querySelector=()=>overview;dashboard.querySelectorAll=()=>[...summary,center];
const ids={adminDashboard:dashboard,adminRail:rail,adminDrawerToggle:node('toggle'),adminRailScrim:node('scrim'),adminControlCenter:center,adminOverviewAnalytics:analytics,adminWorkspaceTitle:node('heading'),adminWorkspaceSubtitle:node('subtitle'),adminCurrentSection:node('current')};
const document={getElementById:id=>ids[id]||null,body:node('body'),addEventListener(){}};
const window={addEventListener(){},scrollTo(){}};
const context=vm.createContext({document,window,matchMedia:()=>({matches:false}),history:{replaceState(){}},location:{hash:''}});
vm.runInContext(fs.readFileSync(root+'/js/admin-workspace.js','utf8'),context);
window.FRSSAdminWorkspace.init();
assert.equal(center.hidden,true);assert.equal(overview.hidden,false);
for(const key of links.map(l=>l.dataset.adminView)){
 window.FRSSAdminWorkspace.select(key);
 assert.equal(dashboard.dataset.view,key);
 assert.equal(links.filter(l=>l.classList.contains('is-active')).length,1);
 assert.equal(links.find(l=>l.dataset.adminView===key).attrs['aria-current'],'page');
 if(panels.some(p=>p.id==='admin-'+key)){assert.equal(center.hidden,false);assert.deepEqual(panels.filter(p=>!p.hidden).map(p=>p.id),['admin-'+key]);}
 else assert.equal(center.hidden,true);
 assert.equal(overview.hidden,key!=='overview');
}
rail.handlers.pointerenter();assert.equal(rail.classList.contains('is-expanded'),true);
rail.handlers.pointerleave();assert.equal(rail.classList.contains('is-expanded'),false);
console.log('PASS all 11 admin views select the correct content and active navigation item');
console.log('PASS sidebar expands on pointer entry and collapses on pointer exit');
