import {requirePermission} from '@/lib/auth';
import {redirect} from 'next/navigation';
import {legacySettingsPath} from '@/lib/operations/settings-routes';
export default async function LegacySettings({searchParams}){await requirePermission('settings.view');redirect(legacySettingsPath(await searchParams));}
