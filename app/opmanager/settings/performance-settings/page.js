import {redirect} from 'next/navigation';
export default async function Page({searchParams}){const query=new URLSearchParams(await searchParams);redirect('/opmanager/settings/performance-settings/reports'+(query.size?'?'+query:''));}
