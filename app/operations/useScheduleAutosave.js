"use client";
import { useEffect, useRef, useState } from "react";
import { readApiResponse } from "@/lib/client/read-api-response";

// Each cell has one ordered queue. An old response can never replace a newer edit.
export default function useScheduleAutosave({scheduleId,setPayload,setError,isArabic,branch}) {
  const entries=useRef(new Map()); const activeId=useRef(scheduleId); const mounted=useRef(true);
  const [states,setStates]=useState({});
  activeId.current=scheduleId;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{entries.current.clear();setStates({});},[scheduleId]);
  const dirty=()=>[...entries.current.values()].some(entry=>entry.savedVersion<entry.version);
  const saving=()=>[...entries.current.values()].some(entry=>entry.running);
  function canLeave() {
    if(saving()) {setError(isArabic?"انتظر اكتمال حفظ الخلايا قبل تغيير الصفحة أو النسخة.":"Wait for cell saves to finish before changing the page or revision.");return false;}
    if(!dirty()) return true;
    return window.confirm(isArabic?"توجد تعديلات لم تحفظ. هل تريد تجاهلها والمغادرة؟":"Some edits have not been saved. Discard them and leave?");
  }
  useEffect(()=>{
    const unload=event=>{if(dirty()){event.preventDefault();event.returnValue="";}};
    const navigate=event=>{
      const link=event.target.closest?.("a[href]");
      if(!dirty()||!link||event.defaultPrevented||link.target==="_blank"||link.hasAttribute("download"))return;
      const target=new URL(link.href,window.location.href);
      if(target.origin===window.location.origin&&target.pathname===window.location.pathname&&target.search===window.location.search)return;
      if(!canLeave()){event.preventDefault();event.stopPropagation();}
    };
    window.addEventListener("beforeunload",unload);document.addEventListener("click",navigate,true);
    return()=>{window.removeEventListener("beforeunload",unload);document.removeEventListener("click",navigate,true);};
  },[isArabic]);
  const current=entry=>mounted.current&&activeId.current===entry.scheduleId&&entries.current.get(entry.key)===entry;
  function status(entry,value){if(current(entry))setStates(previous=>({...previous,[entry.key]:value}));}
  async function drain(entry) {
    if(entry.running)return;
    entry.running=true;status(entry,"saving");
    try {
      while(entry.savedVersion<entry.version&&current(entry)) {
        const version=entry.version; const value=entry.value;
        try {
          const response=await fetch("/api/operations/schedules",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({scheduleId:entry.scheduleId,employeeId:entry.employee.id,workDate:entry.workDate,value,branch,expectedUpdatedAt:entry.expectedUpdatedAt??null})});
          const data=await readApiResponse(response,"Schedule save failed");
          entry.savedVersion=version;entry.expectedUpdatedAt=data.assignment.updatedAt;
          if(current(entry)) setPayload(previous=>previous?.schedule?.id!==entry.scheduleId?previous:({...previous,schedule:{...previous.schedule,state:data.state?.revision>=(previous.schedule.state?.revision||0)?data.state:previous.schedule.state,assignments:entry.version===version?previous.schedule.assignments.map(item=>item.employeeId===entry.employee.id&&item.workDate===entry.workDate?{...data.assignment,employee:entry.employee}:item):previous.schedule.assignments}}));
        } catch(error) {
          if(entry.version>version) continue;
          status(entry,"error"); if(current(entry))setError(error.message);return;
        }
      }
      status(entry,"saved");if(current(entry)&&!dirty())setError("");
    } finally {entry.running=false;}
  }
  function queue(employee,workDate,value,expectedUpdatedAt) {
    const key=`${employee.id}:${workDate}`;
    const entry=entries.current.get(key)||{key,scheduleId,employee,workDate,version:0,savedVersion:0,running:false,expectedUpdatedAt};
    entry.value=value;entry.version+=1;entries.current.set(key,entry);status(entry,"saving");void drain(entry);
  }
  function retry(key) {const entry=entries.current.get(key);if(entry){setError("");void drain(entry);}}
  const pending=Object.values(states).filter(state=>state==="saving").length; const failed=Object.values(states).filter(state=>state==="error").length;
  return {states,queue,retry,canLeave,pending,failed};
}
