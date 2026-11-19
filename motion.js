/* Progressive motion: content stays visible without JS or with reduced motion. */
(()=>{
 const root=document.documentElement,board=document.querySelector('.notes-board');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const sync=()=>{root.dataset.uiMotion=reduced.matches||board?.dataset.motion==='paused'?'paused':'playing';};
 sync();
 if(board&&'MutationObserver' in window)new window.MutationObserver(sync).observe(board,{attributes:true,attributeFilter:['data-motion']});
 reduced.addEventListener?.('change',sync);
 if(reduced.matches||!('IntersectionObserver' in window))return;
 const observer=new window.IntersectionObserver(entries=>{
  for(const entry of entries)if(entry.isIntersecting){entry.target.classList.add('is-revealed');observer.unobserve(entry.target);}
 },{threshold:.08,rootMargin:'0px 0px 24px 0px'});
 document.querySelectorAll('.pdesk-story,.project-copy,.case-card,.resources>div,#brief-preview').forEach(element=>{
  element.classList.add('motion-reveal');observer.observe(element);
 });
})();
