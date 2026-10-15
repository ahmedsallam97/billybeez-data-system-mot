import {redirect} from 'next/navigation';
export default async function Page({searchParams}){const query=new URLSearchParams(await searchParams);redirect('/opmanager/settings/live-editors/roster'+(query.size?'?'+query:''));}
