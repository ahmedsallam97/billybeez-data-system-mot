import {requirePermission} from '@/lib/auth';
import {notFound} from 'next/navigation';
import {SETTINGS_PAGES,PERFORMANCE_SECTIONS,TEMPLATE_SECTIONS} from '@/lib/operations/settings-routes';
import DashboardSettingsClient from './DashboardSettingsClient';
export default async function SettingsCategoryPage({category,section}){const item=SETTINGS_PAGES.find(row=>row[0]===category);if(!item)notFound();await requirePermission(item[5]);if(section){const entries=category==='performance-settings'?PERFORMANCE_SECTIONS:TEMPLATE_SECTIONS;if(!entries.some(row=>row[0]===section))notFound();}return <DashboardSettingsClient category={category} section={section}/>;}
