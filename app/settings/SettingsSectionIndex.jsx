"use client";
import { useEffect, useId, useRef, useState } from 'react';
import { useI18n } from '../i18n';

export default function SettingsSectionIndex({ children }) {
 const {isArabic:ar}=useI18n(),root=useRef(null),counter=useRef(0),prefix=useId().replaceAll(':',''),[sections,setSections]=useState([]),[longPage,setLongPage]=useState(false),[expanded,setExpanded]=useState(false);
 useEffect(()=>{
  let frame;
  const visible=heading=>{
   if(!heading.getClientRects().length||heading.closest('dialog'))return false;
   for(let parent=heading.parentElement;parent&&parent!==root.current;parent=parent.parentElement){
    if(parent.tagName==='DETAILS'&&!parent.open&&!parent.querySelector(':scope > summary')?.contains(heading))return false;
   }
   return true;
  };
  const scan=()=>{
   const headings=[...root.current.querySelectorAll('h2,h3,h4')].filter(visible);
   const next=headings.map(heading=>{if(!heading.id)heading.id=`settings-${prefix}-${counter.current++}`;const group=heading.closest('article,section,form'),dirty=Boolean(group?.querySelector('[data-setting-status=dirty],[data-setting-status=error]'));return {id:heading.id,title:heading.textContent.trim(),dirty};}).filter(row=>row.title).slice(0,24);
   setSections(current=>JSON.stringify(current)===JSON.stringify(next)?current:next);
   setLongPage(root.current.getBoundingClientRect().height>Math.max(560,window.innerHeight*.8));
  };
  const schedule=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(scan);};
  const observer=new MutationObserver(schedule);observer.observe(root.current,{childList:true,subtree:true,attributes:true,attributeFilter:['hidden','open','data-setting-status']});
  const resize=new ResizeObserver(schedule);resize.observe(root.current);window.addEventListener('resize',schedule);scan();return()=>{observer.disconnect();resize.disconnect();window.removeEventListener('resize',schedule);cancelAnimationFrame(frame);};
 },[prefix,ar]);
 return <div className="ui-settings-index-scope">{sections.length>1&&longPage&&<nav className="ui-settings-section-index" aria-label={ar?'أقسام هذه الصفحة':'Sections on this page'} data-expanded={expanded}>
  <button type="button" aria-expanded={expanded} aria-controls={`${prefix}-sections`} onClick={()=>setExpanded(value=>!value)}><b>{ar?'في هذه الصفحة':'On this page'}</b><span>{sections.length} {ar?'أقسام':'sections'}{sections.some(row=>row.dirty)&&(ar?' · تغييرات غير محفوظة':' · unsaved changes')}</span><span aria-hidden="true">{expanded?'⌃':'⌄'}</span></button>
  <div id={`${prefix}-sections`} className="ui-settings-section-links">{sections.map(row=><a key={row.id} href={`#${row.id}`} data-unsaved={row.dirty} onClick={()=>setExpanded(false)}>{row.title}{row.dirty&&<span>{ar?' · غير محفوظ':' · unsaved'}</span>}</a>)}</div>
 </nav>}<div ref={root}>{children}</div></div>;
}
