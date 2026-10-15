"use client";
import {useRef,useState} from 'react';
import {useUiText} from '../i18n';
import SafeDialog from '../ui/SafeDialog';
import {OperationalError} from '../ui/OperationalFeedback';
import {PermissionButton} from '../account/PermissionControls';
import ActionButton from '../ActionButton';
import styles from './IncidentUpdateDialog.module.css';

export default function IncidentUpdateDialog({incident,onClose,onSave,error}){
 const localize=useUiText(),pending=useRef(false),[status,setStatus]=useState(incident.status),[followUp,setFollowUp]=useState(incident.followUpAction||''),[busy,setBusy]=useState(false),[attempted,setAttempted]=useState(false);
 const dirty=status!==incident.status||followUp!==(incident.followUpAction||'');
 async function submit(event){event.preventDefault();if(pending.current)return;pending.current=true;setBusy(true);setAttempted(true);try{if(await onSave({action:'incidentUpdate',incidentId:incident.id,status,followUpAction:followUp}))onClose();}finally{pending.current=false;setBusy(false);}}
 return <SafeDialog className={styles.dialog} titleId="incident-update-title" onClose={onClose} dirty={dirty} busy={busy} initialFocus="select">{close=><>
  <div className="modal-head"><div><h2 id="incident-update-title">{localize('Update incident')}</h2><p>{incident.title}</p></div><ActionButton type="button" disabled={busy} onClick={close}>Close</ActionButton></div>
  <OperationalError error={attempted?error:null}/>
  <form onSubmit={submit}><fieldset disabled={busy} className={`ui-dialog-fields ${styles.fields}`}><label>{localize('Status')}<select required aria-label={localize('Incident status')} value={status} onChange={event=>setStatus(event.target.value)}>{['OPEN','INVESTIGATING','CLOSED'].map(value=><option key={value} value={value}>{localize(value)}</option>)}</select></label><label>{localize('Follow-up action')}<textarea aria-label={localize('Follow-up action')} value={followUp} onChange={event=>setFollowUp(event.target.value)}/></label><div className={styles.actions}><PermissionButton permission="employees.edit" type="submit">{busy?localize('Saving…'):localize('Save incident update')}</PermissionButton></div></fieldset></form>
 </>}</SafeDialog>;
}
