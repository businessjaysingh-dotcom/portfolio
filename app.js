'use strict';
const sections = ['research', 'build', 'resources'];
function chooseView(name) {
  if (!sections.includes(name)) return;
  document.querySelector('.notes-board').dataset.focus = name;
  if(typeof hitRects!=='undefined')requestAnimationFrame(sizeHitAreas);
  document.querySelectorAll('.monitor-tab').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  document.querySelectorAll('.bench-controls [data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  const link = document.querySelector('#bench-go');
  link.href = `#${name}`;
  link.setAttribute('aria-label', `Explore ${name[0].toUpperCase() + name.slice(1)}`);
  const captions = {research: 'Check a building’s records and follow the original sources.', build: 'Keep the request, prepared reply and next task together.', resources: 'Work through a template and save a copy with your changes.'};
  document.querySelector('#bench-status').textContent = captions[name];
  const action=document.querySelector('#bench-open');
  action.textContent=name==='resources'?'Open the templates ↓':`Open ${name} example ↗`;
  action.setAttribute('aria-label',name==='resources'?'Open the templates section':`Open the ${name} demonstration`);
  document.querySelectorAll('.header nav a[href^="#"]').forEach(a=>{if(a.hash===`#${name}`)a.setAttribute('aria-current','location');else a.removeAttribute('aria-current');});
}
document.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => chooseView(b.dataset.view)));
document.querySelector('.wordmark').addEventListener('click', () => chooseView('research'));
document.querySelectorAll('svg [data-view]').forEach(b => b.addEventListener('keydown', e => {if(e.key === 'Enter' || e.key === ' '){e.preventDefault(); chooseView(b.dataset.view);}}));
const motionButton = document.querySelector('#motion-toggle');
const motionBoard = document.querySelector('.notes-board');
const motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
let manualMotionPause=null;
function syncMotionPreference() {
  const paused=manualMotionPause===null?motionPreference.matches:manualMotionPause;
  motionButton.disabled=false;
  motionBoard.dataset.motion=paused?'paused':'playing';
  document.documentElement.dataset.motionOptin=String(motionPreference.matches&&!paused);
  motionButton.setAttribute('aria-pressed',String(paused));
  motionButton.textContent=paused?'Enable motion':'Pause motion';
}
motionButton.addEventListener('click',()=>{manualMotionPause=motionBoard.dataset.motion!=='paused';syncMotionPreference();});
motionPreference.addEventListener('change', syncMotionPreference);
syncMotionPreference();
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    motionBoard.dataset.visible = String(entry.isIntersecting);
  }, {threshold: 0.05}).observe(motionBoard);
}
const dialog = document.querySelector('#project-dialog');
const content = document.querySelector('#project-content');
let opener;
const details = {
 research: `<h2 id="dialog-title">One building. A brief to keep.</h2><p class="lead">The record, its original source and the question still open belong together.</p><p class="detail-meta">ANONYMISED PUBLIC-DATA SAMPLE / CAPTURED 7 NOV 2026</p><img src="assets/brief-preview.png?v=finish1" alt="Anonymised finished brief from the working sample."><div class="detail-columns"><div><h3>The task and output</h3><p>The saved sample lets a visitor choose records and keep them in a brief. Names, addresses and identifying record details are hidden in this example.</p><p>The live desk can look up a visitor’s own Toronto address. The saved example is dated and is not refreshed live.</p></div><div><h3>What still needs checking</h3><p>A point match does not establish the whole legal lot or permitted use. Active permits are not a complete history. An empty query is not clearance.</p></div></div><h3>Original public sources</h3><ul><li><a href="https://gis.toronto.ca/arcgis/rest/services/cot_geospatial11/MapServer/3" target="_blank" rel="noopener noreferrer">City of Toronto zoning layer ↗</a></li><li><a href="https://open.toronto.ca/dataset/building-permits-active-permits/" target="_blank" rel="noopener noreferrer">City of Toronto active-permits dataset ↗</a></li></ul>`,
 build: `<h2 id="dialog-title">A place for the note and the next step.</h2><p class="lead">An inquiry, its notes and its next task belong together. This working prototype shows that flow using fictional people.</p><p class="detail-meta">WORKING PROTOTYPE / FICTIONAL SAMPLE DATA</p><img src="assets/workspace.png" alt="Actual working prototype showing fictional contacts, notes and Today tasks."><div class="detail-columns"><div><h3>The working part</h3><p>The prototype has contact records, activity notes, tasks and a Today view. The sample contact keeps its original inquiry, a prepared reply note and the task that follows. The agent remains responsible for confirming missing facts and sending from their own account.</p></div><div><h3>What’s shown here</h3><p>The screenshot shows the actual prototype. The sample below lets you move between a note, a next step and Today. It runs only on this page and sends nothing.</p></div></div><div class="demo-preview"><div class="demo-top"><span>ILLUSTRATION / MADE-UP CONTACT</span><div class="demo-tabs" role="tablist" aria-label="Explore a sample contact"><button role="tab" id="demo-note-tab" aria-controls="demo-note" aria-selected="true" tabindex="0" data-demo="note">Note</button><button role="tab" id="demo-task-tab" aria-controls="demo-task" aria-selected="false" tabindex="-1" data-demo="task">Next step</button><button role="tab" id="demo-today-tab" aria-controls="demo-today" aria-selected="false" tabindex="-1" data-demo="today">Today</button></div></div><div class="demo-body"><div role="tabpanel" id="demo-note" aria-labelledby="demo-note-tab"><span class="demo-label">ALEX / SAMPLE NOTE</span><h4>Keep the context with the person.</h4><p>Alex asked to see the two-bedroom this Saturday. The available times still need confirming.</p></div><div role="tabpanel" id="demo-task" aria-labelledby="demo-task-tab" hidden><span class="demo-label">NEXT STEP</span><h4>Confirm two available times.</h4><p>A clear action, rather than another thread to remember.</p></div><div role="tabpanel" id="demo-today" aria-labelledby="demo-today-tab" hidden><span class="demo-label">TODAY / SAMPLE</span><h4>Alex: confirm viewing times.</h4><p id="task-status">Open sample task. Nothing is sent.</p><button id="complete-task" type="button">Mark sample task complete</button></div></div></div><p class="detail-meta">This sample changes only this page in your browser. It resets when the example is reopened.</p>`
};
function setupDemo() {
 const buttons = [...content.querySelectorAll('[data-demo]')];
 function choose(name, focus = false) {
   buttons.forEach(b => { const active = b.dataset.demo === name; b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; });
   content.querySelectorAll('[role="tabpanel"]').forEach(p => p.hidden = p.id !== `demo-${name}`);
   if (focus) buttons.find(b => b.dataset.demo === name)?.focus();
 }
 buttons.forEach((b, i) => {
   b.addEventListener('click', () => choose(b.dataset.demo));
   b.addEventListener('keydown', e => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return; e.preventDefault(); const n = e.key === 'Home' ? 0 : e.key === 'End' ? 2 : (i + (e.key === 'ArrowRight' ? 1 : 2)) % 3; choose(buttons[n].dataset.demo, true); });
 });
 content.querySelector('#complete-task')?.addEventListener('click', e => { content.querySelector('#task-status').textContent = 'Sample task complete. Nothing was sent.'; content.querySelector('#task-status').classList.add('complete-status'); e.currentTarget.disabled = true; e.currentTarget.textContent = 'Sample complete ✓'; });
}
function openProject(kind, button) {
 if (!details[kind]) return;
 opener = button;
 content.innerHTML = details[kind];
 document.querySelector('#dialog-kind').textContent = kind === 'research' ? '01 / RESEARCH DEMONSTRATION' : '02 / BUILD DEMONSTRATION';
 setupDemo(); dialog.showModal(); dialog.scrollTop = 0;
}
document.querySelectorAll('[data-project]').forEach(b => b.addEventListener('click', () => openProject(b.dataset.project,b)));
document.querySelector('#bench-open').addEventListener('click',e=>{const view=motionBoard.dataset.focus;if(view==='resources'){location.hash='resources';document.querySelector('#resources').scrollIntoView({behavior:motionPreference.matches?'instant':'smooth'});}else openProject(view,e.currentTarget);});
dialog.querySelector('.close').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => opener?.focus());
dialog.addEventListener('click', e => { if (e.target !== dialog) return; const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); });

document.querySelectorAll('svg [data-project]').forEach(b => b.addEventListener('keydown', e => {if(e.key === 'Enter' || e.key === ' '){e.preventDefault(); b.dispatchEvent(new MouseEvent('click', {bubbles:true}));}}));

// URLs and navigation must describe the same screen the visitor sees.
function syncHashView(){const name=location.hash.slice(1);if(sections.includes(name))chooseView(name);else if(!name||name==='home')chooseView('research');}
window.addEventListener('hashchange',syncHashView);
// Give only isolated actions a full physical hit area. Tiny adjacent screen tabs
// have the larger equivalent controls directly below the artwork.
const hitRects=[...document.querySelectorAll('[data-hit-area]')].map(el=>({el,x:+el.getAttribute('x'),y:+el.getAttribute('y'),w:+el.getAttribute('width'),h:+el.getAttribute('height')}));
function sizeHitAreas(){for(const item of hitRects){const m=item.el.getScreenCTM();if(!m)continue;const sx=Math.hypot(m.a,m.b),sy=Math.hypot(m.c,m.d);if(!sx||!sy)continue;const w=Math.max(item.w,44/sx),h=Math.max(item.h,44/sy);item.el.setAttribute('x',item.x+(item.w-w)/2);item.el.setAttribute('y',item.y+(item.h-h)/2);item.el.setAttribute('width',w);item.el.setAttribute('height',h);}}
new ResizeObserver(sizeHitAreas).observe(document.querySelector('.drawing'));sizeHitAreas();
syncHashView();

// A same-hash click emits no hashchange; synchronize direct links too.
document.querySelectorAll('a[href^="#"]').forEach(a=>a.addEventListener('click',()=>{const view=a.getAttribute('href').slice(1);if(sections.includes(view))chooseView(view);else if(view==='home')chooseView('research');}));

// No mailbox identity, message ID or tracking parameters are included in the link.
if(location.hash==='#email-preview'||new URLSearchParams(location.search).get('from')==='email'){
 const banner=document.getElementById('email-return'),button=document.getElementById('email-return-button'),note=document.getElementById('email-return-note');
 if(banner&&button&&note){banner.hidden=false;button.addEventListener('click',()=>{
  let fromMail=false;try{const ref=new URL(document.referrer);fromMail=ref.protocol==='https:'&&ref.hostname==='mail.google.com'&&ref.pathname.startsWith('/mail/');}catch{}
  if(fromMail&&history.length>1){history.back();return;}
  note.textContent='On your phone, use Done or switch back to Gmail. You can also use Open Gmail below and choose the account that received Jay’s email. This page will stay open.';
 });}
}
