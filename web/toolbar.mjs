// Native popovers provide light dismissal, Escape and normal Tab navigation.
export function setupToolbar({vscode}) {
  const theme=document.getElementById('theme');
  const system=matchMedia('(prefers-color-scheme: dark)');
  let preference='auto';
  try {const saved=localStorage.getItem('tableorbit-theme');if(['auto','light','dark'].includes(saved))preference=saved;} catch { /* optional storage */ }
  theme.value=preference;
  function applyTheme(){
    const hostDark=document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast');
    document.documentElement.dataset.theme=vscode?(hostDark?'dark':'light'):(preference==='auto'?(system.matches?'dark':'light'):preference);
  }
  if(vscode){
    theme.value='auto';theme.disabled=true;document.getElementById('theme-host-note').hidden=false;
    new MutationObserver(applyTheme).observe(document.body,{attributes:true,attributeFilter:['class']});
  }
  theme.addEventListener('change',()=>{
    preference=theme.value;
    try {localStorage.setItem('tableorbit-theme',preference);} catch { /* optional storage */ }
    applyTheme();
  });
  system.addEventListener('change',applyTheme);applyTheme();
  const menus=[...document.querySelectorAll('.toolbar-menu')];
  function position(menu){
    const trigger=document.querySelector(`[popovertarget="${menu.id}"]`);
    const rect=trigger.getBoundingClientRect();
    menu.style.left=`${Math.max(8,Math.min(rect.left,innerWidth-menu.offsetWidth-8))}px`;
    menu.style.top=`${rect.bottom+6}px`;
    menu.style.maxHeight=`${Math.max(100,innerHeight-rect.bottom-14)}px`;
  }
  for(const menu of menus){
    menu.addEventListener('toggle',event=>{if(event.newState==='open')position(menu);});
    menu.addEventListener('click',event=>{
      if(!event.target.closest('button'))return;
      const dialog=document.querySelector('dialog[open]');
      if(dialog){
        const trigger=document.querySelector(`[popovertarget="${menu.id}"]`);
        // The action becomes hidden when this menu closes. Return to its visible trigger.
        dialog.addEventListener('close',()=>trigger.focus(),{once:true});
      }
      menu.hidePopover();
    });
  }
  addEventListener('resize',()=>menus.filter(menu=>menu.matches(':popover-open')).forEach(position));
}
