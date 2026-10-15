// Editor proposals only. These never change a publication or a report snapshot.
const STEPS={
 TRIP:[['PHOTOGRAPHY','Photography','التصوير'],['BRACELETS','Bracelet fitting','تركيب البريسلت'],['ENTRY','Guest entry','دخول الضيوف'],['MEALS','Meals','الوجبات'],['PLAY_PERIOD','Play period','فترة اللعب'],['SUPERVISOR_ATTRACTIONS','Supervisors using attractions','استخدام المشرفين للألعاب'],['EXIT_GATHERING','Gathering for exit','التجمع للخروج'],['FINAL_EXIT','Final exit','الخروج النهائي']],
 BIRTHDAY:[['BALLOON_ARCH','Balloon arch preparation','تجهيز قوس البالونات'],['ROOM_CLEANLINESS','Party-room cleanliness','نظافة غرفة الحفلة'],['AIR_CONDITIONING','Air conditioning','التكييف'],['BIRTHDAY_VIDEO','Birthday video','فيديو عيد الميلاد'],['SONGS','Songs','الأغاني'],['CAKE_ENTRANCE','Cake entrance','دخول التورتة'],['PHOTOGRAPHY','Photography','التصوير'],['MEAL_DISTRIBUTION','Meal distribution','توزيع الوجبات'],['GUEST_EXIT','Guest exit','خروج الضيوف']],
};
function appendProcessSuggestions(reportType,current=[]){
 const codes=new Set(current.map(row=>row.code));
 const next=[...current];let order=Math.max(0,...current.map(row=>Number(row.order)||0));
 for(const [code,label,labelAr] of STEPS[reportType]||[]){if(codes.has(code))continue;order+=10;next.push({code,label,labelAr,order,active:true,instructions:'',instructionsAr:'',required:true,responsibleEmployeeRequired:code==='BALLOON_ARCH',evidenceRequired:false,branches:['*']});}
 return next;
}
module.exports={appendProcessSuggestions};
