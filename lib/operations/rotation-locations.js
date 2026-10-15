// Physical locations, not substring matching: Play is the existing Playground identity.
const COMBINATIONS = [
  {code:'LOCKER-PARK',label:'Locker-Park',labelAr:'لوكر–بارك',parts:['LOCKER','PARK']},
  {code:'LOCKER-DROP',label:'Locker-Drop',labelAr:'لوكر–دروب',parts:['LOCKER','DROP']},
  {code:'PARK-PLAY',label:'Park-Play',labelAr:'بارك–بلاي',parts:['PARK','PLAYGROUND']},
  {code:'PARK-TRAMPOLINE',label:'Park-Trampoline',labelAr:'بارك–ترامبولين',parts:['PARK','TRAMPOLINE']},
  {code:'DATA-LOCKER',label:'Data-Locker',labelAr:'داتا–لوكر',parts:['DATA','LOCKER']},
  {code:'PLAY-DROP',label:'Play-Drop',labelAr:'بلاي–دروب',parts:['PLAYGROUND','DROP']},
  {code:'PLAY-TRAMPOLINE',label:'Play-Trampoline',labelAr:'بلاي–ترامبولين',parts:['PLAYGROUND','TRAMPOLINE']},
];
const normalize=code=>String(code||'').trim().toUpperCase()==='PLAY'?'PLAYGROUND':String(code||'').trim().toUpperCase();
function components(position){const code=normalize(position?.code||position);return COMBINATIONS.find(c=>c.code===code)?.parts||[code];}
const isCombined=position=>components(position).length>1;
const assignmentPosition=(assignment,positions)=>positions.find(p=>p.id===(assignment.operationalPositionId||assignment.position?.id))||assignment.position||{code:assignment.positionCode};
function sharedComponents(first,second){return components(first).filter(code=>components(second).includes(code));}
function physicalConflict(first,second){return (isCombined(first)||isCombined(second))&&sharedComponents(first,second).length>0;}
function coversPosition(assignment,target,positions){const assigned=assignmentPosition(assignment,positions);return isCombined(target)?assigned.id===target.id:components(assigned).includes(normalize(target.code));}
module.exports={COMBINATIONS,components,isCombined,assignmentPosition,sharedComponents,physicalConflict,coversPosition};
