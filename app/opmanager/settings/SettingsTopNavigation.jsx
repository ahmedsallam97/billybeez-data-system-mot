"use client";
import {useEffect,useId,useRef,useState} from 'react';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useI18n} from '../../i18n';
import {useAccount} from '../../account/AccountContext';
import {settingsNavigationGroups} from '@/lib/operations/settings-routes';
import styles from './SettingsTopNavigation.module.css';

export default function SettingsTopNavigation() {
 const {isArabic}=useI18n(),{user}=useAccount(),pathname=usePathname();
 const groups=settingsNavigationGroups(user?.permissions),root=useRef(null),buttons=useRef({}),menus=useRef({});
 const [open,setOpen]=useState(null),prefix=useId().replaceAll(':','');
 const label=page=>isArabic?page.ar:page.en;
 useEffect(()=>setOpen(null),[pathname]);
 useEffect(()=>{
  if(!open)return;
  const outside=event=>{if(!document.querySelector('dialog[open]')&&!root.current?.contains(event.target))setOpen(null);};
  const escape=event=>{
   // A discard dialog owns Escape until the manager returns to the menu.
   if(event.key==='Escape'&&!event.defaultPrevented&&!document.querySelector('dialog[open]')){
    event.preventDefault();setOpen(null);buttons.current[open]?.focus();
   }
  };
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 const focusItem=(group,index)=>requestAnimationFrame(()=>{
  const links=menus.current[group]?.querySelectorAll('[role=menuitem]');
  if(links?.length)links[(index+links.length)%links.length]?.focus();
 });
 const onTriggerKey=(event,id)=>{
  if(event.key==='Tab'&&open===id){setOpen(null);return;}
  if(!['ArrowDown','ArrowUp'].includes(event.key))return;
  event.preventDefault();setOpen(id);focusItem(id,event.key==='ArrowUp'?-1:0);
 };
 const onMenuKey=(event,id)=>{
  const links=[...menus.current[id].querySelectorAll('[role=menuitem]')],index=links.indexOf(document.activeElement);
  if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
   event.preventDefault();focusItem(id,event.key==='Home'?0:event.key==='End'?-1:index+(event.key==='ArrowDown'?1:-1));
  }else if(event.key==='Tab'){
   event.preventDefault();setOpen(null);
   const next=event.shiftKey?id:groups[groups.findIndex(group=>group.id===id)+1]?.id;
   if(next)buttons.current[next]?.focus();
   else{
    const target=[...document.querySelectorAll('a[href],button,input,select,textarea,summary,[tabindex]')].find(node=>
     !root.current.contains(node)&&(root.current.compareDocumentPosition(node)&Node.DOCUMENT_POSITION_FOLLOWING)&&node.tabIndex>=0&&!node.matches(':disabled')&&node.getClientRects().length);
    target?.focus();
   }
  }
 };
 return <nav ref={root} className={styles.navigation} aria-label={isArabic?'تنقل الإعدادات':'Settings navigation'} data-settings-top-nav>
  {groups.map(group=>{
   const current=group.pages.find(page=>page.href===pathname),expanded=open===group.id,triggerId=`${prefix}-${group.id}-trigger`,menuId=`${prefix}-${group.id}-menu`;
   return <div className={styles.group} key={group.id}>
    <button ref={node=>{buttons.current[group.id]=node;}} type="button" className={styles.trigger} id={triggerId} data-settings-group={group.id} data-active={Boolean(current)} aria-haspopup="menu" aria-expanded={expanded} aria-controls={expanded?menuId:undefined} onClick={event=>{setOpen(expanded?null:group.id);if(!expanded&&event.detail===0)focusItem(group.id,0);}} onKeyDown={event=>onTriggerKey(event,group.id)}>
     <span className={styles.groupName}>{label(group)}<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span>
     {current&&<span className={styles.currentPage}>{label(current)}</span>}
    </button>
    {expanded&&<div ref={node=>{menus.current[group.id]=node;}} className={styles.menu} id={menuId} role="menu" aria-labelledby={triggerId} onKeyDown={event=>onMenuKey(event,group.id)}>
     {group.pages.map(page=><Link key={page.id} className={styles.item} role="menuitem" tabIndex={-1} href={page.href} data-settings-persist={page.persist} aria-current={pathname===page.href?'page':undefined} onClick={event=>{if(!event.defaultPrevented)setOpen(null);}}>{label(page)}{pathname===page.href&&<span aria-hidden="true">✓</span>}</Link>)}
    </div>}
   </div>;
  })}
 </nav>;
}
