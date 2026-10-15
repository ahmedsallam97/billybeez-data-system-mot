const activeErrors=new WeakMap();
function fieldLabel(field,fallback='Field'){
 const explicit=field.getAttribute('aria-label');if(explicit)return explicit;
 const label=field.labels?.[0];if(label){const copy=label.cloneNode(true);copy.querySelectorAll('input,select,textarea,button,small,[role=alert]').forEach(node=>node.remove());const text=copy.textContent.trim();if(text)return text;}
 return field.name||fallback;
}
function associateFieldError(field,id){
 let state=activeErrors.get(field);if(!state){state={ids:new Set(),previousInvalid:field.getAttribute('aria-invalid'),previousLabel:field.getAttribute('aria-label')};if(!state.previousLabel){state.generatedLabel=fieldLabel(field);field.setAttribute('aria-label',state.generatedLabel);}activeErrors.set(field,state);}
 state.ids.add(id);field.setAttribute('aria-invalid','true');
 field.setAttribute('aria-describedby',[...new Set((field.getAttribute('aria-describedby')||'').split(/\s+/).filter(Boolean).concat(id))].join(' '));
 return ()=>{const current=activeErrors.get(field);if(!current||!current.ids.delete(id))return;
  const remaining=(field.getAttribute('aria-describedby')||'').split(/\s+/).filter(token=>token&&token!==id);if(remaining.length)field.setAttribute('aria-describedby',remaining.join(' '));else field.removeAttribute('aria-describedby');
  if(!current.ids.size){if(current.previousInvalid!=null)field.setAttribute('aria-invalid',current.previousInvalid);else field.removeAttribute('aria-invalid');if(current.generatedLabel&&field.getAttribute('aria-label')===current.generatedLabel)field.removeAttribute('aria-label');activeErrors.delete(field);}
 };
}
module.exports={fieldLabel,associateFieldError};
