import {requireUser} from '@/lib/auth';
import {getDashboardSettings} from '@/lib/operations/dashboard-settings-server';
import AppShell from '../../AppShell';
import SettingsFrame from './SettingsFrame';
export default async function SettingsLayout({children}){const user=await requireUser();const settings=await getDashboardSettings();return <AppShell title="title.settings" user={user} initialSettings={settings}><SettingsFrame initialSettings={settings}>{children}</SettingsFrame></AppShell>;}
