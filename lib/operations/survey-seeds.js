const questions = {
  TRIP: [
    ['How satisfied were you with the booking and arrival arrangements?', 'ما مدى رضاك عن ترتيبات الحجز والاستقبال؟'],
    ['How clearly did our team explain the visit plan and safety rules?', 'ما مدى وضوح شرح فريقنا لخطة الزيارة وقواعد السلامة؟'],
    ['How satisfied were you with the cleanliness of the venue?', 'ما مدى رضاك عن نظافة المكان؟'],
    ['How safe and supervised did the children feel during the activities?', 'ما مدى شعورك بأمان الأطفال وجودة الإشراف أثناء الأنشطة؟'],
    ['How helpful and courteous was the team with children and supervisors?', 'ما مدى تعاون ولطف الفريق مع الأطفال والمشرفين؟'],
    ['How suitable were the activities for the children’s ages and interests?', 'ما مدى ملاءمة الأنشطة لأعمار الأطفال واهتماماتهم؟'],
    ['How satisfied were you with timing, organization and group coordination?', 'ما مدى رضاك عن الالتزام بالمواعيد والتنظيم وتنسيق المجموعة؟'],
    ['How satisfied are you overall, and would you arrange another visit?', 'ما مدى رضاك العام، وهل ترغب في تنظيم زيارة أخرى؟'],
  ],
  BIRTHDAY: [
    ['How satisfied were you with the booking and party preparation?', 'ما مدى رضاك عن الحجز والتحضير للحفل؟'],
    ['How satisfied were you with the welcome and the assigned birthday host?', 'ما مدى رضاك عن الاستقبال والمضيف المسؤول عن عيد الميلاد؟'],
    ['How satisfied were you with the party room, decorations and cleanliness?', 'ما مدى رضاك عن غرفة الحفل والزينة والنظافة؟'],
    ['How safe and supervised did the children feel during the party?', 'ما مدى شعورك بأمان الأطفال وجودة الإشراف أثناء الحفل؟'],
    ['How enjoyable and age-appropriate were the games and activities?', 'ما مدى متعة الألعاب والأنشطة وملاءمتها لأعمار الأطفال؟'],
    ['How satisfied were you with the food and drinks included in your package?', 'ما مدى رضاك عن الطعام والمشروبات المتضمنة في الباقة؟'],
    ['How satisfied were you with the cake celebration, timing and organization?', 'ما مدى رضاك عن احتفال الكعكة والالتزام بالمواعيد والتنظيم؟'],
    ['How satisfied are you overall, and would you recommend our birthday parties?', 'ما مدى رضاك العام، وهل توصي الآخرين بإقامة أعياد الميلاد لدينا؟'],
  ],
};
function surveyQuestions(type) {
  return questions[type].map(([text,textAr],i)=>({ code:`${type}_Q${i+1}`, order:i+1, active:true, required:false, text,textAr,choices:[
    {code:'EXCELLENT',label:'Excellent',labelAr:'ممتاز',numericValue:5,active:true,commentRequired:false,followUpSuggested:false},
    {code:'GOOD',label:'Good',labelAr:'جيد',numericValue:4,active:true,commentRequired:false,followUpSuggested:false},
    {code:'SATISFACTORY',label:'Satisfactory',labelAr:'مقبول',numericValue:3,active:true,commentRequired:false,followUpSuggested:false},
    {code:'POOR',label:'Poor',labelAr:'ضعيف',numericValue:2,active:true,commentRequired:true,followUpSuggested:true},
    {code:'VERY_POOR',label:'Very poor',labelAr:'ضعيف جداً',numericValue:1,active:true,commentRequired:true,followUpSuggested:true},
    {code:'NOT_APPLICABLE',label:'Not applicable',labelAr:'لا ينطبق',numericValue:0,active:true,commentRequired:false,followUpSuggested:false},
  ]}));
}
module.exports={surveyQuestions};
