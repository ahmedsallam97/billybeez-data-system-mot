function orderedRows(rows, displayOrder=[], id=item=>item.employeeId || item.employee?.id || item.id) {
  const ranks=new Map(displayOrder.map((value,index)=>[value,index]));
  return [...rows].sort((a,b)=>(ranks.get(id(a))??Number.MAX_SAFE_INTEGER)-(ranks.get(id(b))??Number.MAX_SAFE_INTEGER) || String(a.employee?.name || a.name || '').localeCompare(String(b.employee?.name || b.name || '')) || String(id(a)).localeCompare(String(id(b))));
}
function moveEmployee(order,id,target) {
  const next=order.filter(item=>item!==id);next.splice(Math.max(0,Math.min(next.length,target)),0,id);return next;
}
module.exports={orderedRows,moveEmployee};
