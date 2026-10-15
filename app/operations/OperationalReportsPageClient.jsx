"use client";
import {useI18n} from '../i18n';
import {useSearchParams} from 'next/navigation';
import OperationalReportsWorkspace from './OperationalReportsWorkspace';
export default function OperationalReportsPageClient({reportType}){const {isArabic}=useI18n(),params=useSearchParams();const year=Number(params.get('year')),month=Number(params.get('month'));return <OperationalReportsWorkspace reportType={reportType} initialBranch={params.get('branch')||undefined} initialDate={/^\d{4}-\d{2}-\d{2}$/.test(params.get('date')||'')?params.get('date'):undefined} initialReportId={params.get('reportId')||undefined} language={isArabic?'ar':'en'} year={year>=2020&&year<=2100?year:undefined} month={month>=1&&month<=12?month:undefined}/>;}
