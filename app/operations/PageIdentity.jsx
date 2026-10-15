"use client";
import {usePathname} from 'next/navigation';
import {pageId} from '@/lib/operations/page-routes';
import {useOperationsUi} from './OperationsUiContext';
import {useEffect} from 'react';
export default function PageIdentity(){
 const pathname=usePathname(),id=pageId(pathname),{userId}=useOperationsUi();
 useEffect(()=>{if(id)try{localStorage.setItem(`ops-last-view:${userId}`,JSON.stringify({id,date:new URLSearchParams(location.search).get('date')}));}catch{}},[id,userId]);
 if(!id)return null;
 return null;
}
