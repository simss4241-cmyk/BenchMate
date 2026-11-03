import { SAMPLE } from './sample.js';
import { STORAGE_KEY, initialState, restore, available, reserve } from './state.js';

const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths = {
  board:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><circle cx="16" cy="16" r="1.5"/><path d="M8 10v6h5m3-3V8h-5"/>',
  stash:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  spark:'<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Zm7 0v4m-2-2h4"/>',
  project:'<path d="m5 20 6-6m-3-7 5-5 7 7-5 5-3-3-7 7-2-2 7-7-2-2Z"/>',
  box:'<path d="m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 10v8M3 8l9 5 9-5m-14-7 9 5"/>',
  tool:'<path d="M20 4a6 6 0 0 1-7 8L5 20l-2-2 8-8a6 6 0 0 1 8-7l-4 4 2 2 4-4"/>',
  motor:'<ellipse cx="12" cy="7" rx="7" ry="4"/><path d="M5 7v9c0 5 14 5 14 0V7m-7-4V1m0 10v4"/>',
  drive:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="10" r="4"/><path d="m12 10 5 7m-10 0h3"/>',
  sound:'<path d="M5 9v6h4l5 4V5l-5 4H5m12-2a8 8 0 0 1 0 10m3-13a12 12 0 0 1 0 16"/>',
  arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check:'<path d="m5 12 4 4L20 5"/>',
  location:'<path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  chat:'<path d="M4 4h16v12H9l-5 4V4Z"/>',
};
function icon(name) { return `<span class="icon" aria-hidden="true"><svg viewBox="0 0 24 24">${paths[name] || paths.box}</svg></span>`; }
const tabs=[['stash','Stash','Your parts, possibilities','stash'],['boardroom','Boardroom','Follow the traces','board'],['ideas','Build Ideas','Find the next thing','spark'],['projects','Projects','Bring it together','project']];
let state, storageWorks=true;
try { state=restore(localStorage.getItem(STORAGE_KEY)); } catch { state=initialState();storageWorks=false; }
let selected=1, filter='all', query='', scenario='mobility', toastTimer;
let tab=tabs.some(t=>t[0]===location.hash.slice(1))?location.hash.slice(1):'stash';
function persist() {
  try { localStorage.setItem(STORAGE_KEY,JSON.stringify(state)); }
  catch { storageWorks=false; }
}
function toast(text) { clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>{$('#toast').hidden=true;},4500); }
function hero(kicker,title,description,button='') { return `<section class="hero"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p class="lede">${description}</p></div>${button}</section>`; }
function button(text,action,{primary=false,small=false,disabled=false,extra='',symbol='arrow'}={}) { return `<button class="button${primary?' primary':''}${small?' small':''}" data-action="${action}" ${extra}${disabled?' disabled':''}>${icon(symbol)}${text}</button>`; }
function tour() {
  const i=tabs.findIndex(t=>t[0]===tab);
  const descriptions=['Start with what you found. Open a part, then follow it into a build.','Pick a numbered outline. Read the evidence and the unknowns.','Explore a saved example. Turn the conversation into requirements.','Reserve one sample motor. Watch the saved project count change.'];
  const next=['Explore the board','Open Build Ideas','See the project','Try a reservation'];
  return `<section class="tour" aria-label="Guided preview"><span class="round">${i+1}/4</span><div><h3>A find. A plan. A next step.</h3><p>${descriptions[i]}</p></div>${button(next[i],i===3?'reserve':'go',{small:true,extra:i===3?'data-item="motor"':`data-tab="${tabs[i+1][0]}"`})}</section>`;
}
function stats() {
  const totalReserved=state.reserved.motor+state.reserved.buzzer;
  return `<section class="stats" aria-label="Sample inventory summary">${[[available(state,'motor')+available(state,'buzzer'),'AVAILABLE PART UNITS','box'],[totalReserved,'RESERVED FOR JUNO','project'],[1,'MAPPED BOARD','board'],[1,'REUSABLE TOOL','tool']].map(([n,l,i])=>`<div class="stat">${icon(i)}<strong>${String(n).padStart(2,'0')}</strong><span>${l}</span></div>`).join('')}</section>`;
}
function partCards() {
  const parts=SAMPLE.parts.filter(p=>(filter==='all'||(filter==='available'?p.kind==='part'&&available(state,p.id)>0:p.kind===filter))&&`${p.name} ${p.purpose}`.toLowerCase().includes(query.toLowerCase()));
  return parts.length?parts.map(p=>`<button class="part-card" data-action="inspect" data-item="${p.id}" aria-label="Inspect ${esc(p.name)}"><div class="part-photo">${p.image?`<img src="./${p.image}" alt="Three recovered silver can motors on a workbench" loading="lazy">`:`<span class="symbol">${icon(p.id==='donor'?'drive':p.id==='iron'?'tool':'sound')}</span>`}<span class="badge">${esc(p.identity)}</span></div><div class="part-body"><div class="part-type">${esc(p.kind.toUpperCase())}<span>${esc(p.condition)}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.purpose)}</p><div class="part-foot"><span>${esc(p.location)}</span><span class="quantity">${p.kind==='part'?`${available(state,p.id)} / ${p.total} free`:p.kind==='tool'?'1 reusable tool':'Potential salvage'}</span></div></div></button>`).join(''):'<div class="empty">No sample records match. Try another filter.</div>';
}
function stash() {
  return hero('COLLECT. UNDERSTAND. CREATE.','A little scrap. A lot of potential.','Your finds, in one place. Start with the sample motors and see how evidence becomes a useful inventory.',button('Inspect the motors','inspect',{primary:true,extra:'data-item="motor"',symbol:'motor'}))+stats()+tour()+`<div class="layout"><section aria-labelledby="stash-title"><div class="section-title"><h2 id="stash-title">The stash <span class="count">4 SAMPLE RECORDS</span></h2></div><div class="filters" aria-label="Filter sample inventory">${[['all','All finds'],['available','Available'],['donor','Donors'],['tool','Tools']].map(([key,label])=>`<button class="filter${key===filter?' active':''}" data-action="filter" data-filter="${key}" aria-pressed="${key===filter}">${label}</button>`).join('')}<input id="search" class="search" type="search" placeholder="Search the sample stash…" aria-label="Search sample stash" value="${esc(query)}"></div><div class="cards" id="part-cards">${partCards()}</div></section><aside class="panel pad sidebar-panel"><span class="mini-label">EVIDENCE FIRST</span><h3>Your bench, with a memory.</h3><p>A photo can suggest an identity. It cannot prove a part works.</p><ol class="steps"><li><b>01</b>Review what the photo actually shows.</li><li><b>02</b>Keep identity and condition separate.</li><li><b>03</b>Reserve recovered parts when a project is ready.</li></ol><div class="hint">This sample has three motor units: two reserved to Juno, one available. Try assigning the last one.</div><p class="small-note">Sample quantities illustrate the workflow. They are not the owner's live inventory.</p></aside></div>`;
}
function boardroom() {
  const c=SAMPLE.board.components.find(c=>c.number===selected)||SAMPLE.board.components[0];
  const overlays=[...SAMPLE.board.components].sort((a,b)=>b.bounds.width*b.bounds.height-a.bounds.width*a.bounds.height).map((v,i)=>{
    const b=v.bounds;return `<button class="outline${v.number===selected?' selected':''}" data-action="component" data-number="${v.number}" style="left:${b.x*100}%;top:${b.y*100}%;width:${b.width*100}%;height:${b.height*100}%;z-index:${i+1}" aria-label="Component ${v.number}: ${esc(v.name)}" aria-pressed="${v.number===selected}" title="#${v.number} ${esc(v.name)}"><span class="number">${v.number}</span></button>`;
  }).join('');
  return hero('FOLLOW THE TRACES.','Every board has a story.','Explore a recorded 18-annotation map. Identities are candidates; components still on this board are not recovered stock.')+tour()+`<div class="board-toolbar"><h2>${icon('board')} ECU board <span class="count">18 ANNOTATIONS</span></h2><span class="confidence">RECORDED MODEL EXAMPLE</span></div><div class="board-layout"><section aria-label="Board photo and numbered components"><div class="board-image"><img src="./assets/ecu.jpg" alt="ECU circuit board with a large left connector, capacitors, and integrated circuits">${overlays}</div><p class="small-note">Select an outline or its numbered list entry. Map recorded with Muse Spark 1.3. No new inference runs here.</p><div class="component-list" aria-label="Numbered component list">${SAMPLE.board.components.map(v=>`<button class="component-row${v.number===selected?' active':''}" data-action="component" data-number="${v.number}" aria-pressed="${v.number===selected}"><span class="number">${v.number}</span><span><strong>${esc(v.name)}</strong><small>${esc(v.category)} · ${esc(v.confidence)} visual confidence</small></span></button>`).join('')}</div></section><section class="panel inspector" id="component-inspector" tabindex="-1" aria-label="Selected component inspector"><div class="mini-label">COMPONENT #${c.number} · INSPECTOR</div><h2>${esc(c.name)}</h2><span class="confidence${c.confidence==='low'?' low':''}">${esc(c.confidence)} visual confidence</span><div class="field"><span class="field-label">Visible markings</span><p>${esc(c.markings||'Not readable in this view.')}</p></div><div class="field"><span class="field-label">Likely purpose</span><p>${esc(c.purpose||'Function remains unresolved.')}</p></div><div class="field"><span class="field-label">Visible evidence</span><p>${esc(c.evidence||'Needs a clearer view.')}</p></div><div class="field"><span class="field-label">Still unknown</span><p>${esc(c.unknown||'Electrical condition and compatibility have not been established.')}</p></div><div class="hint">Mapped on the board ≠ available stock. The full app records recovery only after the user physically removes a part.</div></section></div>`;
}
function examples() {
  const coverage=state.reserved.motor;
  if(scenario==='verify')return {question:'What do we still need to verify before using these motors?',answer:`<p>The photo supports a small can-motor candidate. It does not establish a voltage, current rating, or useful torque.</p><ul><li>Read any side markings and measure the shaft and case.</li><li>Check the motor's behavior and load needs before selecting a driver.</li><li>Choose compatible power, control, and mechanics based on that evidence.</li></ul><p>The sample motors remain <strong>untested</strong>. This preview supplies no wiring instructions or invented ratings.</p>`};
  if(scenario==='stock')return {question:'How do we know what belongs to Juno?',answer:`<p>The sample ledger has <strong>${state.reserved.motor} of 3 motor units</strong> reserved for Project Juno. That leaves <strong>${available(state,'motor')} available</strong>.</p><p>Chat is the explanation; the saved allocation is the record. A suggestion alone does not move stock.</p>${button('Open project inventory','go',{extra:'data-tab="projects"',small:true,symbol:'box'})}`};
  return {question:'I want to give Juno wheels. What can we plan with this stash?',answer:`<p>Start with the recovered motors as candidates. <strong>${coverage} motor unit${coverage===1?' is':'s are'} already reserved to Juno</strong> in this sample.</p><p>The next useful step is a requirements list: drive motors, a compatible driver, control, power, and a rolling chassis. The driver and controller are still missing; ratings and mechanical fit still need checking.</p><p>The soldering iron is a reusable tool, not a part to install.</p>${button(state.planSaved?'View saved parts plan':'Review sample parts suggestion',state.planSaved?'go':'plan',{primary:true,extra:state.planSaved?'data-tab="projects"':'',symbol:'spark'})}`};
}
function ideas() {
  const e=examples();return hero('A PLACE FOR EACH POSSIBILITY.','What could we build?','Ideas get room to grow, with a conversation of their own. Choose a saved example below—these replies are not live AI.')+tour()+`<div class="chat-layout"><aside class="panel chat-sidebar"><div class="eyebrow">BUILD IDEAS</div><h2>A home for the next thing.</h2><p>Talk through a build using what is actually on the bench.</p><button class="conversation" data-action="scenario" data-scenario="mobility">${icon('project')} <strong>Project Juno</strong><small>A small rover for an impatient Muse agent.</small></button><div class="hint">Examples are scripted for this preview. The full app keeps project conversations and saved inventory connected.</div></aside><section class="panel"><div class="chat-head"><div><h2>Project Juno</h2><small>YOUR BENCH PARTNER · SAVED EXAMPLE</small></div>${button(`${state.reserved.motor+state.reserved.buzzer} reserved`,'go',{extra:'data-tab="projects"',small:true,symbol:'box'})}</div><div class="chat-feed"><div class="message"><span class="speaker">YOU · EXAMPLE QUESTION</span><p>${e.question}</p></div><div class="message assistant"><span class="speaker">BENCHMATE · SCRIPTED PREVIEW RESPONSE</span>${e.answer}</div></div><div class="example-bar"><p>No message is sent to a model. Pick a question to explore the example.</p><div class="chips">${[['mobility','Plan Juno’s mobility'],['verify','What needs verification?'],['stock','What belongs to Juno?']].map(([key,label])=>`<button class="chip${scenario===key?' active':''}" data-action="scenario" data-scenario="${key}" aria-pressed="${scenario===key}">${label}</button>`).join('')}</div></div></section></div>`;
}
const requirements=()=>`<div class="requirements"><div class="requirement"><div><h3>Drive motors · 2 units</h3><p>Small DC can motors are candidates; ratings, fit and load capability need checking.</p></div><span class="covered">${Math.min(state.reserved.motor,2)}/2 RESERVED</span></div>${[['Motor driver','1 unit · still to find','Choose after motor voltage and current needs are established.'],['Controller','1 unit · still to find','Control and interface requirements are unresolved.'],['Power source','Quantity unresolved','Select after power needs are known; no compatibility claim.'],['Chassis and wheels','Fit unresolved','Mechanical mounting and wheel/shaft fit need checking.']].map(([name,status,check])=>`<div class="requirement"><div><h3>${name}</h3><p>${check}</p></div><span class="missing">${status.toUpperCase()}</span></div>`).join('')}</div>`;
function projects() {
  const total=state.reserved.motor+state.reserved.buzzer;
  return hero('FROM SPARE PARTS TO SOMETHING REAL.','Bring it together.','Keep the plan, parts, progress, and next step in one place. Try a sample reservation; the counts and receipt update together.')+tour()+`<div class="layout"><section class="panel"><div class="project-head"><span class="project-symbol">${icon('project')}</span><div><span class="mini-label">PLANNING · SAMPLE PROJECT</span><h2>Project Juno</h2></div></div><div class="project-content"><p>Give our impatient Muse agent a rolling platform. Start by understanding the recovered motors.</p><div class="next"><span class="mini-label">NEXT UP</span><p>Establish the motor ratings and load needs before selecting the driver and power design.</p></div><div class="project-section"><div class="section-title"><h3>Suggested parts</h3>${button(state.planSaved?'Review saved example':'Review sample suggestion','plan',{small:true,symbol:'spark'})}</div><p class="small-note">A planning list. Saving it does not change quantities or reserve stock.</p>${state.planSaved?requirements():'<div class="hint">No saved requirements yet. Review the example suggestion, then save the plan.</div>'}</div><div class="project-section"><div class="section-title"><h3>Parts on this project <span class="count">${total} UNITS</span></h3>${button('Reserve sample parts','reserve',{extra:'data-item="motor"',small:true,symbol:'box'})}</div>${['motor','buzzer'].filter(id=>state.reserved[id]>0).map(id=>`<div class="inventory-row">${icon(id==='motor'?'motor':'sound')}<div><h3>${id==='motor'?'Small DC can motors':'Piezo buzzer'}</h3><p>${state.reserved[id]} unit${state.reserved[id]===1?'':'s'} · reserved · untested</p><p>${available(state,id)} available in the sample stash</p></div>${button('View Stash record','inspect',{extra:`data-item="${id}"`,small:true,symbol:'arrow'})}</div>`).join('')}${state.receipts.map(r=>`<div class="receipt"><h3>✓ Saved to the sample bench</h3><p>Reserved ${r.quantity} × ${r.item==='motor'?'Small DC can motors':'Piezo buzzer'} for Project Juno.</p><small>Browser-local sample receipt. No real inventory or API was changed.</small></div>`).join('')}</div></div></section><aside class="panel pad sidebar-panel"><span class="mini-label">PROJECT INVENTORY</span><h3>Juno’s corner of the bench.</h3><div class="project-summary"><div class="summary-number"><strong>${total}</strong><small>reserved units</small></div><div class="summary-number"><strong>0</strong><small>installed units</small></div></div><p>Planning reservations keep the same stock from being promised twice.</p><div class="hint">${available(state,'motor')?`One of the three sample motors is still free. Reserve it and watch both Stash and Projects update.`:'All three sample motors are now reserved. A fourth cannot be assigned. Reset the sample to try again.'}</div>${button('Open the conversation','go',{extra:'data-tab="ideas"',small:true,symbol:'chat'})}<p class="small-note">No claim is made that these motors are compatible, tested, or installed.</p></aside></div>`;
}
function render() {
  const previousScroll=document.querySelector('.component-list')?.scrollTop||0;
  $('#navigation').innerHTML=tabs.map(([key,title,sub,i])=>`<a class="nav-link${tab===key?' active':''}" href="#${key}" ${tab===key?'aria-current="page"':''}>${icon(i)}<span><strong>${title}</strong><small>${sub}</small></span></a>`).join('');
  $('#breadcrumb').textContent=tabs.find(t=>t[0]===tab)[1].toUpperCase();
  $('#main').innerHTML=(!storageWorks?'<div class="storage-warning">Browser storage is unavailable. Sample changes last for this open page only.</div>':'')+({stash,boardroom,ideas,projects}[tab])();
  const list=document.querySelector('.component-list');if(list)list.scrollTop=previousScroll;
  document.querySelectorAll('[data-icon]').forEach(e=>{e.innerHTML=icon(e.dataset.icon);});
}
function go(next) { if(next===tab){render();return;} location.hash=next; }
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(next==='main')return;tab=tabs.some(t=>t[0]===next)?next:'stash';render();$('#main').focus({preventScroll:true});});
$('#reset').addEventListener('click',()=>{state=initialState();selected=1;filter='all';query='';scenario='mobility';persist();$('#modal').close();render();toast('Sample reset. Two motors reserved, one available.');});
document.addEventListener('input',e=>{if(e.target.id==='search'){query=e.target.value;$('#part-cards').innerHTML=partCards();}});
let pending;
const modal=$('#modal');
function openDialog(title,body,actions='') {modal.innerHTML=`<button class="modal-close" data-action="close" aria-label="Close dialog">×</button><div class="dialog-kicker">BROWSER-LOCAL SAMPLE</div><h2 id="modal-title">${title}</h2>${body}<div class="dialog-actions">${actions}</div>`;modal.showModal();}
function inspect(id) {
  const p=SAMPLE.parts.find(p=>p.id===id);if(!p)return;
  const free=p.kind==='part'?available(state,id):null;
  openDialog(esc(p.name),`${p.image?`<img class="dialog-photo" src="./${p.image}" alt="The three recovered sample motors">`:''}<p>${esc(p.purpose)}</p><div class="detail-grid"><div><small>Identity</small><b>${esc(p.identity)}</b></div><div><small>Condition</small><b>${esc(p.condition)}</b></div><div><small>Location</small><b>${esc(p.location)}</b></div><div><small>${p.kind==='part'?'Sample availability':'Record type'}</small><b>${p.kind==='part'?`${free} free / ${p.total} total`:p.kind==='tool'?'Reusable equipment':'Intact donor'}</b></div></div><div class="hint">${p.kind==='part'?'Identification does not establish voltage, current, working condition or compatibility. Sample quantities are illustrative.':p.kind==='donor'?'Potential salvage stays on the donor until the user records physical recovery. It cannot be reserved as recovered stock.':'Tools stay separate from installable parts. The full app can track equipment without consuming it into a build.'}</div>`,button('Close','close',{small:true,symbol:'check'})+(p.kind==='part'?button(free?'Reserve for Juno':'No units available','reserve',{primary:true,disabled:!free,extra:`data-item="${id}"`,symbol:'box'}):''));
}
function openReservation(id='motor') {
  if(modal.open)modal.close();
  const p=SAMPLE.parts.find(p=>p.id===id&&p.kind==='part');if(!p)return;
  const free=available(state,id);
  pending={id,expectedAvailable:free,actionId:crypto.randomUUID?crypto.randomUUID():`sample-${Date.now()}-${Math.random().toString(36).slice(2)}`};
  openDialog('Set a sample part aside.',`<p><strong>${esc(p.name)}</strong> → Project Juno</p><div class="hint">${free} available of ${p.total} total. This is a planning reservation; the part remains untested.</div><form id="reserve-form"><label class="input-label" for="quantity">Quantity<input id="quantity" name="quantity" type="number" min="1" max="${Math.max(free,1)}" value="1" step="1" required ${!free?'disabled':''}></label><div id="reserve-error" class="error" role="alert" hidden></div><div class="dialog-actions">${button('Cancel','close',{small:true,symbol:'arrow'})}<button type="submit" class="button primary" ${!free?'disabled':''}>${icon('check')}Confirm sample reservation</button></div></form>`);
  $('#quantity').focus();
  $('#reserve-form').addEventListener('submit',e=>{
    e.preventDefault();
    const result=reserve(state,{...pending,quantity:Number($('#quantity').value)});
    if(!result.ok){$('#reserve-error').textContent=result.error;$('#reserve-error').hidden=false;return;}
    e.submitter.disabled=true;state=result.state;persist();modal.close();tab='projects';location.hash='projects';render();toast(`Saved: ${result.receipt.quantity} sample unit reserved for Juno.`);
  });
}
function openPlan() {openDialog('Review a sample suggestion.',`<p>This is an authored example of the full app's suggested-parts workflow. No model has been called.</p>${requirements()}<div class="hint">Saving this list changes the project plan only. It reserves no stock and verifies no electrical specifications.</div>`,button('Cancel','close',{small:true,symbol:'arrow'})+button('Save sample parts list','save-plan',{primary:true,symbol:'check'}));}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-action]');if(!b||b.disabled)return;
  const a=b.dataset.action;
  if(a==='close'){e.preventDefault();modal.close();return;}
  if(a==='go')go(b.dataset.tab);
  if(a==='inspect')inspect(b.dataset.item);
  if(a==='reserve')openReservation(b.dataset.item||'motor');
  if(a==='filter'){filter=b.dataset.filter;render();}
  if(a==='component'){selected=Number(b.dataset.number);render();const inspector=$('#component-inspector');inspector.focus({preventScroll:true});if(matchMedia('(max-width:720px)').matches)inspector.scrollIntoView({block:'start'});}
  if(a==='scenario'){scenario=b.dataset.scenario;render();}
  if(a==='plan')openPlan();
  if(a==='save-plan'){state={...state,planSaved:true};persist();modal.close();go('projects');toast('Sample parts plan saved. Stock and reservations are unchanged.');}
});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)modal.close();}});
window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){state=restore(e.newValue);if(modal.open){const error=$('#reserve-error');if(error){error.textContent='Sample stock changed in another tab. Close this form and review the latest quantity.';error.hidden=false;}}else render();}});
render();
