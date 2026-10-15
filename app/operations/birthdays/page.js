import DedicatedOperationsPage from '../DedicatedOperationsPage';
import Workspace from '../DailySetupWorkspace';
import { requirePermission } from '@/lib/auth';
import { basePrisma } from '@/lib/db';
import { periodBookings } from '@/lib/operations/booking-period';
export default async function BirthdaysPage({searchParams}){const user=await requirePermission('birthdays.view');const bookings=await periodBookings(basePrisma,user,'birthdays',await searchParams);return <DedicatedOperationsPage id="birthdays"><Workspace section="birthdays" bookings={bookings}/></DedicatedOperationsPage>;}
