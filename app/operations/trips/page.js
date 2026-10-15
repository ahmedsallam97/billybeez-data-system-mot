import DedicatedOperationsPage from '../DedicatedOperationsPage';
import Workspace from '../DailySetupWorkspace';
import { requirePermission } from '@/lib/auth';
import { basePrisma } from '@/lib/db';
import { periodBookings } from '@/lib/operations/booking-period';
export default async function TripsPage({searchParams}){const user=await requirePermission('trips.view');const bookings=await periodBookings(basePrisma,user,'trips',await searchParams);return <DedicatedOperationsPage id="trips"><Workspace section="trips" bookings={bookings}/></DedicatedOperationsPage>;}
