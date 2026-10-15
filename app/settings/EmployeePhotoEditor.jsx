"use client";
import ActionButton from "@/app/ActionButton";
import {PermissionButton} from '@/app/account/PermissionControls';

import {useRef,useState} from "react";
import {useSearchParams} from "next/navigation";
import {EmployeePhoto} from "../operations/RecognitionArtwork";
import styles from "./EmployeePhotoEditor.module.css";
import ExpandablePreview from "./ExpandablePreview";

const DEFAULT_FRAME={x:50,y:50,zoom:1,fit:"cover"};
const clamp=value=>Math.max(0,Math.min(100,value));

export default function EmployeePhotoEditor({employees,artwork,setArtwork,isArabic,busy,uploading,uploadPhoto,save}){
  const params=useSearchParams();
  const [selected,setSelected]=useState(params.get("employeeId")||employees[0]?.id||"");
  const drag=useRef(null);
  const employee=employees.find(item=>item.id===selected)||employees[0];
  if(!employee)return null;
  const t=(en,ar)=>isArabic?ar:en;
  const photoId=employee.documents?.[0]?.id;
  const frame=artwork.employeePhotoFrames?.[employee.id]||DEFAULT_FRAME;
  const framedEmployee={...employee,photoUrl:photoId?`/api/operations/employees/${employee.id}/documents/${photoId}`:""};
  const change=patch=>setArtwork(current=>({...current,employeePhotoFrames:{...current.employeePhotoFrames,[employee.id]:{...DEFAULT_FRAME,...current.employeePhotoFrames?.[employee.id],...patch}}}));
  const reset=()=>setArtwork(current=>{const frames={...current.employeePhotoFrames};delete frames[employee.id];return {...current,employeePhotoFrames:frames};});
  return <section id="employee-photo-framing" className={styles.editor} aria-label={t("Employee photo framing","ضبط صور الموظفين")}>
    <header><span>{t("EMPLOYEE PHOTOS","صور الموظفين")}</span><h3>{t("Put every face in the frame","اضبط الصورة لإظهار الوجه بوضوح")}</h3><p>{t("Drag the photo, or use the sliders. The saved framing applies to awards and Hall of Fame; the original photo stays intact.","اسحب الصورة أو استخدم أدوات التحكم. يُحفظ الضبط للجوائز وقاعة المتميزين مع الاحتفاظ بالصورة الأصلية.")}</p></header>
    <label>{t("Choose employee","اختر الموظف")}<select aria-label={t("Choose employee","اختر الموظف")} value={employee.id} onChange={event=>setSelected(event.target.value)}>{employees.map(item=><option key={item.id} value={item.id}>{item.nameEn||item.name}</option>)}</select></label>
    <div className={styles.body}>
      <ExpandablePreview label={t("Photo crop preview","معاينة قص الصورة")} isArabic={isArabic}><div className={styles.canvas} aria-label={t("Photo crop preview","معاينة قص الصورة")} onPointerDown={event=>{if(!photoId||busy)return;const rect=event.currentTarget.getBoundingClientRect();drag.current={x:event.clientX,y:event.clientY,frame,width:rect.width,height:rect.height};event.currentTarget.setPointerCapture(event.pointerId);}} onPointerMove={event=>{const start=drag.current;if(!start)return;change({x:clamp(start.frame.x+(event.clientX-start.x)/start.width*100),y:clamp(start.frame.y+(event.clientY-start.y)/start.height*100)});}} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}><EmployeePhoto employee={framedEmployee} config={artwork}/></div><b>{artwork.employeeNameOverrides?.[employee.id]||employee.nameEn||employee.name}</b><small>{photoId?t("Drag to reposition • cropped preview","اسحب لتغيير الموضع • معاينة القص"):t("Upload an employee photo to start.","ارفع صورة الموظف أولًا.")}</small></ExpandablePreview>
      <fieldset disabled={busy||Boolean(uploading)||!photoId} className={styles.controls}>
        <label>{t("Photo framing","ملاءمة الصورة")}<select aria-label={t("Photo framing","ملاءمة الصورة")} value={frame.fit} onChange={event=>change({fit:event.target.value})}><option value="cover">{t("Fill / crop","ملء / قص")}</option><option value="contain">{t("Show full photo","إظهار الصورة كاملة")}</option></select></label>
        {[["zoom","Zoom","حجم الصورة",.5,3,.05],["x","Horizontal position","الموضع الأفقي",0,100,1],["y","Vertical position","الموضع الرأسي",0,100,1]].map(([key,en,ar,min,max,step])=><label key={key}><span>{t(en,ar)} <output>{key==="zoom"?`${Math.round(frame[key]*100)}%`:`${Math.round(frame[key])}%`}</output></span><input aria-label={t(en,ar)} type="range" min={min} max={max} step={step} value={frame[key]} onChange={event=>change({[key]:Number(event.target.value)})}/></label>)}
        <ActionButton type="button" className="secondary" onClick={reset}>{t("Use template framing","استخدام ضبط القالب")}</ActionButton>
      </fieldset>
    </div>
    <label>{t("Artwork display name","الاسم الظاهر في الجائزة")}<input value={artwork.employeeNameOverrides?.[employee.id]||""} placeholder={employee.nameEn||employee.name} onChange={event=>setArtwork(current=>({...current,employeeNameOverrides:{...current.employeeNameOverrides,[employee.id]:event.target.value}}))}/></label>
    <footer><label className={styles.upload}>{t("Upload / replace photo","رفع / تغيير الصورة")}<input aria-label={`Upload photo for ${employee.nameEn||employee.name}`} disabled={busy||Boolean(uploading)} type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>{const file=event.target.files?.[0];event.target.value="";uploadPhoto(employee.id,file);}}/></label><PermissionButton permission="editors.templates" type="button" disabled={busy||Boolean(uploading)} onClick={save}>{t("Save photo framing","حفظ ضبط الصور")}</PermissionButton></footer>
  </section>;
}

