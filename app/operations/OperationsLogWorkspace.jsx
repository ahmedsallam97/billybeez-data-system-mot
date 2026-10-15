"use client";
import { useEffect, useState } from 'react';
import { usePermission } from '../account/AccountContext';
import { useI18n } from '../i18n';
import { PageHeader } from '../ui/DesktopLayout';
import { OperationalError } from '../ui/OperationalFeedback';
import AuditTable from '../ui/AuditTable';
import ActionButton from '../ActionButton';
import { readApiResponse } from '@/lib/client/read-api-response';
export default function OperationsLogWorkspace() {
 const canViewEmployees=usePermission('employees.view');
 const [people,setPeople]=useState([]);
 const {isArabic:ar}=useI18n(),[data,setData]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function load(){setBusy(true);setError('');try{setData(await readApiResponse(await fetch('/api/reports/audit?take=200',{cache:'no-store'}),'Could not load operations log'));}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{load();},[]);
 useEffect(()=>{if(!canViewEmployees)return;let active=true;fetch('/api/operations/employees').then(readApiResponse).then(data=>{if(active)setPeople(data.employees||[]);}).catch(()=>{});return()=>{active=false;};},[canViewEmployees]);
 return <section><PageHeader description={ar?'راجع من غيّر السجلات وما تغيّر ومتى. المعرّفات والقيم السابقة متاحة داخل التفاصيل.':'Review who changed a record, what happened and when. IDs and previous values are available in details.'} actions={<ActionButton disabled={busy} onClick={load}>{ar?'تحديث':'Refresh'}</ActionButton>}/><OperationalError error={error}/>{busy&&!data&&<p role="status">{ar?'جارٍ تحميل السجل…':'Loading operations log…'}</p>}{data&&<AuditTable entries={data.logs||[]} people={people}/>}</section>;
}
