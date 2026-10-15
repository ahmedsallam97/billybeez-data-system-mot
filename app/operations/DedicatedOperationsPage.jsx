import {requirePermission} from '@/lib/auth';
import AppShell from '../AppShell';
import {getDashboardSettings} from '@/lib/operations/dashboard-settings-server';
import {PAGES} from '@/lib/operations/page-routes';
export default async function DedicatedOperationsPage({id,children}) {
 const user=await requirePermission(PAGES[id][3]);
 const settings=await getDashboardSettings();
 return <AppShell title="title.operations" user={user} initialSettings={settings}>{children}</AppShell>;
}
