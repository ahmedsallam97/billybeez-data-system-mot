const { resolveScope } = require('../accounts/enforcement');
async function periodBookings(db, user, kind, params = {}) {
 const requested = String(params.bookingMonth || params.date || new Date().toISOString()).slice(0,7);
 const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(requested) ? requested : new Date().toISOString().slice(0,7);
 const from=month+'-01', until=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5)),0)).toISOString().slice(0,10);
 const scope=await resolveScope(db,user,kind+'.view');
 const where={workDate:{gte:from,lte:until},...(!scope.unrestricted?{branch:{in:scope.branches}}:{}),...(kind==='birthdays'?{eventType:'BIRTHDAY'}:{})};
 const rows=await (kind==='trips'?db.opsDailyTrip:db.opsDailyEvent).findMany({where,orderBy:[{workDate:'asc'},{startTime:'asc'}],select:{id:true,name:true,branch:true,workDate:true,startTime:true,endTime:true,status:true,staffingRequired:true,...(kind==='trips'?{expectedChildren:true}:{expectedGuests:true,childName:true})}});
 return {month,from,until,rows};
}
module.exports={periodBookings};
