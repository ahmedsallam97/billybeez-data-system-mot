"use client";
import {useEffect,useRef,useState} from 'react';
import {useRouter,useSearchParams} from 'next/navigation';
import {useI18n} from '../../i18n';
import {readApiResponse} from '@/lib/client/read-api-response';
export const FILTER_KEYS=['q','employeeId','branch','currentRole','targetRole','owner','status','readiness','nextReviewDate','responsible','dueDate','overdue','from','until','period'];
export default function usePlanningPage(mode){
 const {isArabic:ar}=useI18n(),t=(en,arabic)=>ar?arabic:en,router=useRouter(),params=useSearchParams(),[data,setData]=useState(null),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[dirty,setDirty]=useState(false),version=useRef(0);
 const filters=Object.fromEntries(FILTER_KEYS.map(key=>[key,params.get(key)||''])),create=params.get('create')==='1';
 async function load(){const current=++version.current;try{const query=new URLSearchParams({mode});if(filters.branch)query.set('branch',filters.branch);if(filters.until)query.set('until',filters.until);const result=await readApiResponse(await fetch('/api/operations/planning?'+query,{cache:'no-store'}),'Planning data could not be loaded');if(current===version.current){setData(result);setError('');}}catch(e){if(current===version.current)setError(e.message);}}
 useEffect(()=>{load();return()=>{version.current++;};},[mode,filters.branch,filters.until]);
 useEffect(()=>{const unload=event=>{if(dirty&&!create){event.preventDefault();event.returnValue='';}},link=event=>{if(!dirty||create)return;const target=event.target.closest('a[href]');if(target&&!target.getAttribute('href').startsWith('#')&&!confirm(t('Discard unsaved changes before leaving?','تجاهل التغييرات غير المحفوظة قبل المغادرة؟'))){event.preventDefault();event.stopPropagation();}};window.addEventListener('beforeunload',unload);document.addEventListener('click',link,true);return()=>{window.removeEventListener('beforeunload',unload);document.removeEventListener('click',link,true);};},[dirty,create,ar]);
 async function save(body,legacy=false,message){setBusy(true);setError('');try{const result=await readApiResponse(await fetch(legacy?'/api/operations/performance':'/api/operations/planning',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({branch:data.branch,...body})}),'The change could not be saved');setDirty(false);await load();setNotice(message||t('Saved. History has been retained.','تم الحفظ مع الاحتفاظ بالسجل.'));return result;}catch(e){setError(e.message);return false;}finally{setBusy(false);}}
 function navigate(values,replace=false){if(busy)return;if(dirty&&!create&&!replace&&!confirm(t('Discard unsaved changes?','تجاهل التغييرات غير المحفوظة؟')))return;const url=new URL(location.href);for(const [key,value]of Object.entries(values))value?url.searchParams.set(key,value):url.searchParams.delete(key);setDirty(false);router[replace?'replace':'push'](url.pathname+url.search,{scroll:false});}
 const changeFilter=(key,value)=>navigate(key===null?Object.fromEntries(FILTER_KEYS.map(item=>[item,''])):{[key]:value},true);
 return {mode,ar,t,params,filters,create,data,error,notice,busy,load,navigate,changeFilter,markDirty:()=>setDirty(true),submit:body=>save(body),legacySave:(body,message)=>save(body,true,message)};
}
