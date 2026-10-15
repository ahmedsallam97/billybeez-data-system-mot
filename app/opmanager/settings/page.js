import {redirect} from 'next/navigation';
import {requireUser} from '@/lib/auth';
import {legacySettingsPath} from '@/lib/operations/settings-routes';
export default async function SettingsEntry({searchParams}){const user=await requireUser(),params=await searchParams;if(!params.category&&!params.tab&&!user.permissions['settings.view'])params.category=user.permissions['users.view']?'access':user.permissions['roles.view']?'roles':user.permissions['users.activity']?'account-activity':'dashboard';redirect(legacySettingsPath(params));}
