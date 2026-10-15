import {redirect} from 'next/navigation';
import {legacyOperationsPath} from '@/lib/operations/page-routes';
import OperationsEntry from './OperationsEntry';
import AppShell from '../AppShell';
import {requirePermission} from '@/lib/auth';
import {getDashboardSettings,getOperationsToday} from '@/lib/operations/dashboard-settings-server';
import {resolveEntry} from '@/lib/operations/dashboard-settings';
export default async function OperationsLegacyPage({searchParams}) {
 const params=await searchParams;
 if(params?.uiEntry==='1'){const user=await requirePermission(null);const settings=await getDashboardSettings();return <AppShell title="title.operations" user={user} initialSettings={settings}><OperationsEntry today={await getOperationsToday()}/></AppShell>;}
 redirect(legacyOperationsPath(params));
}
