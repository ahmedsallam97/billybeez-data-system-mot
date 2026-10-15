"use client";
import {filterPlans} from '@/lib/operations/career-planning';
import usePlanningPage from './planning/usePlanningPage';
import PlanningPageFrame from './planning/PlanningPageFrame';
import {Filters} from './planning/PlanningControls';
import PerformanceReports from './planning/PerformanceReports';
import {prioritizePlans} from './planning/PlanDetailsWorkspace';
export default function PerformanceReportsPageClient(){const page=usePlanningPage('reports'),{data,filters,changeFilter,t,ar}=page;const plans=data?prioritizePlans(filterPlans(data.succession,filters,data.planOwners,data.asOf),data.developments,data.asOf):[];return <PlanningPageFrame page={page} title={t('Performance Reports','تقارير الأداء')} description={t('See priorities, progress and documented decisions. Follow links to the source records.','تابع الأولويات والتقدم والقرارات الموثقة، وافتح السجلات الأصلية من الروابط.')}>{data&&<PerformanceReports data={data} plans={plans} filters={filters} t={t} ar={ar} filtersSlot={<Filters data={data} filters={filters} change={changeFilter} mode="reports" t={t} ar={ar}/>}/>}</PlanningPageFrame>;}
