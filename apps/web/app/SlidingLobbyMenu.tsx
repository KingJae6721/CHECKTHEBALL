import {useLayoutEffect,useRef,type ReactNode} from 'react';
// Only the outgoing visual is cloned. React mounts/subscribes the live menu once.
export default function SlidingLobbyMenu({enabled,page,depth,children}:{enabled:boolean;page:string;depth:number;children:ReactNode}){
 const live=useRef<HTMLDivElement>(null),ghost=useRef<HTMLDivElement>(null);
 const previous=useRef<{page:string;depth:number;node:HTMLElement;scrollTop:number}|null>(null);
 const animations=useRef<Animation[]>([]);
 function stop(){for(const animation of animations.current)animation.cancel();animations.current=[];ghost.current?.replaceChildren();}
 useLayoutEffect(()=>()=>stop(),[]);
 useLayoutEffect(()=>{
  if(!enabled){stop();previous.current=null;return;}
  const slot=live.current,panel=slot?.firstElementChild as HTMLElement|null;if(!slot||!panel)return;
  const old=previous.current,changed=!!old&&old.page!==page;
  if(changed){
   stop();panel.scrollTop=0;
   if(!window.matchMedia('(prefers-reduced-motion: reduce)').matches&&typeof slot.animate==='function'&&ghost.current){
    const outgoing=old.node;outgoing.setAttribute('aria-hidden','true');outgoing.setAttribute('inert','');
    outgoing.removeAttribute('id');outgoing.querySelectorAll('[id],[data-menu-title],[autofocus]').forEach(node=>{node.removeAttribute('id');node.removeAttribute('data-menu-title');node.removeAttribute('autofocus');});
    outgoing.querySelectorAll('input,select,textarea,button').forEach(node=>{node.removeAttribute('name');const control=node as HTMLInputElement;if(!control.disabled)control.style.opacity='1';control.disabled=true;});
    ghost.current.replaceChildren(outgoing);outgoing.scrollTop=old.scrollTop;
    const direction=depth<old.depth?-1:1,options={duration:340,easing:'cubic-bezier(.22,.72,.24,1)'};
    const exit=outgoing.animate([{transform:'translateX(0)',opacity:1},{transform:`translateX(${-direction*100}%)`,opacity:0}],options);
    const enter=slot.animate([{transform:`translateX(${direction*100}%)`,opacity:.25},{transform:'translateX(0)',opacity:1}],options);
    const running=[exit,enter];animations.current=running;
    void Promise.all(running.map(animation=>animation.finished)).then(()=>{if(animations.current===running){ghost.current?.replaceChildren();animations.current=[];}}).catch(()=>{});
   }
  }
  const node=panel.cloneNode(true) as HTMLElement;
  // The parent's back-arrow padding changes immediately; preserve the old layout.
  node.style.paddingTop=getComputedStyle(panel).paddingTop;
  previous.current={page,depth,node,scrollTop:panel.scrollTop};
 });
 if(!enabled)return <>{children}</>;
 return <div className="lobby-menu-motion"><div ref={ghost} className="lobby-menu-motion-ghost" aria-hidden="true" inert/><div ref={live} className="lobby-menu-motion-live" onScrollCapture={()=>{const snapshot=previous.current,panel=live.current?.firstElementChild;if(snapshot?.page===page&&panel)snapshot.scrollTop=panel.scrollTop;}}>{children}</div></div>;
}
