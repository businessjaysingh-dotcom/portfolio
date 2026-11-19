/* Progressive motion; reduced-motion stays the default until explicit page opt-in. */
(()=>{
 const root=document.documentElement,board=document.querySelector('.notes-board');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');let started=false;
 function start(){
  if(started||root.dataset.uiMotion==='paused'||!('IntersectionObserver' in window))return;
  started=true;
  const observer=new window.IntersectionObserver(entries=>{
   for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}
  },{threshold:.08,rootMargin:'0px 0px 24px 0px'});
  document.querySelectorAll('.pdesk-story,.project-copy,.case-card,.resources>div,#brief-preview').forEach(element=>{element.classList.add('motion-reveal');observer.observe(element);});
 }
 const sync=()=>{root.dataset.uiMotion=(reduced.matches&&root.dataset.motionOptin!=='true')||board?.dataset.motion==='paused'?'paused':'playing';start();};
 sync();
 if(board&&'MutationObserver' in window)new window.MutationObserver(sync).observe(board,{attributes:true,attributeFilter:['data-motion']});
 reduced.addEventListener?.('change',sync);
})();
