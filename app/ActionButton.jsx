"use client";
import { forwardRef, createContext, useContext } from 'react';
import Link from 'next/link';
import { useUiText } from './i18n';

const ActionContext=createContext('');
export function ActionScope({label,children}){return <ActionContext.Provider value={label}>{children}</ActionContext.Provider>;}
const paths = {
 publish:'M5 20h14M12 16V3m-5 5 5-5 5 5',
 reset:'M3 10a9 9 0 1 1 2 8M3 3v7h7',
 save:'M4 3h13l4 4v14H3V3h1m3 0v6h10V3M7 21v-8h10v8',
 cancel:'m6 6 12 12M18 6 6 18',
 add:'M12 4v16M4 12h16',
 edit:'m15 4 5 5M4 20l4-1L20 7l-5-5L3 14l1 6Z',
 delete:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
 print:'M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6v-7m11-2h1',
 copy:'M8 8h13v13H8V8ZM16 8V3H3v13h5',
 download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
 upload:'M12 16V3m-5 5 5-5 5 5M4 17v4h16v-4',
 refresh:'M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5',
 back:'M20 12H4m6-6-6 6 6 6',
 next:'M4 12h16m-6-6 6 6-6 6',
 preview:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
 settings:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm-2-6h4l1 3 3 1 3 1v4l-3 2-1 3 1 3-3 2-3-1-3 1-3-2 1-3-1-3-3-2V7l3-1 3-1 1-3',
 whatsapp:'M21 11.5a9 9 0 1 1-16.8-4.4L3 21l5-1.5M8 7c-2 2 3 8 6 9 2 .7 3-2 2-3l-2-1-1 1c-2-1-3-2-4-4l1-1-1-2-1 1Z',
 generate:'m12 3 2 6 6 3-6 2-2 6-2-6-6-2 6-3 2-6M20 3v4m-2-2h4',
 lock:'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0v4m-3 4v3',
 unlock:'M6 10h12v11H6V10Zm3 0V6a3 3 0 0 1 6 0m-3 8v3',
 expand:'M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6',
 collapse:'M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6',
 filter:'M3 4h18l-7 8v8l-4-2v-6l-7-8Z',
 check:'m4 12 5 5L20 6',
};
export function ActionGlyph({ name }) { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.edit}/></svg>; }
export function ActionLink({ children, icon, className='', title, ...props }) {
 const localize = useUiText();
 const label = typeof children === 'string' ? children : '';
 const glyph = icon || actionForLabel(label);
 return <Link {...props} className={`${className}${glyph && label ? ' bb-action-icon' : ''}`} title={localize(title || label)} aria-label={localize(props['aria-label'] || label)}>{glyph && label ? <><ActionGlyph name={glyph}/><span className="bb-action-sr-only">{localize(children)}</span></> : localize(children)}</Link>;
}
export function actionForLabel(label) {
 const rules = [
  ['publish',/^publish\b|^نشر/i],['reset',/^reset\b|^restore.*defaults|^استعادة القسم|^إعادة تعيين|^استعادة الافتراضي/i],
  ['whatsapp',/whats.?app|واتساب/i],['copy',/\bcopy\b|نسخ/i],['print',/\bprint\b|طباعة/i],['settings',/^settings$|^إعدادات$/i],
  ['back',/^back$|^return$|^رجوع$|^عودة$|^yesterday$|^أمس$/i],['next',/^next$|^tomorrow$|^غدًا$/i],
  ['cancel',/^cancel|^close$|^إلغاء|^اغلاق$|^إغلاق$|^إنهاء التعديل$|^finish editing/i],['save',/^save\b|^حفظ|^update quantities|^تحديث الكميات/i],
  ['delete',/^delete\b|^remove\b|^حذف|^إزالة/i],['upload',/^upload\b|^import\b|^رفع|^استيراد/i],['download',/^download\b|^export\b|^تنزيل|^تصدير/i],
  ['preview',/^preview\b|^معاينة/i],['edit',/^edit\b|^تعديل/i],['add',/^\+?\s*add\b|^\+?\s*إضافة|^create\b|^إنشاء/i],
  ['unlock',/^reopen\b|^unlock\b|^إعادة فتح|^فتح القفل/i],['lock',/^lock\b|^إغلاق اليوم|^قفل/i],['refresh',/^refresh\b|^reload\b|^reset\b|^restore\b|^تحديث|^استعادة|^إعادة تعيين/i],
  ['expand',/^expand\b|^fullscreen|^توسيع|^ملء الشاشة/i],['collapse',/^collapse\b|^exit fullscreen|^تصغير|^الخروج من ملء/i],['generate',/^generate\b|^calculate\b|^توليد|^حساب/i],
  ['filter',/^filter$|^تصفية$/i],['check',/^approve\b|^confirm\b|^اعتماد|^تأكيد/i],
 ];
 return rules.find(([,pattern])=>pattern.test(label))?.[0] || null;
}
function text(children) { if(typeof children==='string')return children.trim(); if(Array.isArray(children)&&children.every(item=>typeof item==='string'||typeof item==='number'))return children.join('').trim();return ''; }
const ActionButton = forwardRef(function ActionButton({children,icon,iconOnly=true,className='',title,...props},ref) {
 const localize = useUiText();
 const scope=useContext(ActionContext);
 const label=text(children),glyph=icon||actionForLabel(label);
 const actionTitle=title || (scope && /^(save|حفظ)( draft| المسودة)?$/i.test(label) ? `${localize(label)} · ${scope}` : label);
 const highRisk = /^(publish|reset|delete|remove|نشر|حذف|إزالة|إعادة تعيين|استعادة القسم)/i.test(label);
 const compact=!highRisk && iconOnly && glyph && label && props.role!=='tab' && !props['aria-haspopup'];
 return <button {...props} ref={ref} data-action={highRisk ? glyph : undefined} className={`${className}${compact?' bb-action-icon':''}${highRisk?' bb-action-explicit':''}`} title={localize(actionTitle || ((compact||highRisk)?label:undefined))} aria-label={localize(props['aria-label']||((compact||highRisk)?label:undefined))}>{compact?<><ActionGlyph name={glyph}/><span className="bb-action-sr-only">{localize(children)}</span></>:highRisk&&glyph?<><ActionGlyph name={glyph}/><span>{localize(children)}</span></>:localize(children)}</button>;
});
export default ActionButton;
