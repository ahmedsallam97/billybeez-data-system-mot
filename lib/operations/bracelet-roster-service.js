const { normalizeBraceletTypes } = require('./stock-catalog');
const { stockAvailable } = require('./planning');
const { rosterBracelets, rosterBraceletTypes } = require('./bracelet-roster');
function fail(message, status = 409) { throw Object.assign(new Error(message), { status }); }
function parse(value, fallback = {}) { try { return JSON.parse(value || '{}'); } catch { return fallback; } }
function selectionKey(branch, date) { return `OPS_ROSTER_BRACELETS:${branch}:${date}`; }

async function bookingBraceletContext(db,branch,date){
  const where={branch,workDate:date,status:{not:'CANCELLED'}};
  const [trips,birthdays]=await Promise.all([db.opsDailyTrip.count({where}),db.opsDailyEvent.count({where:{...where,eventType:'BIRTHDAY'}})]);
  return {hasTrips:trips>0,hasBirthdays:birthdays>0};
}
async function loadBraceletRoster(db, { branch, date, items, day, context }) {
  const frozen = day?.status === 'CLOSED' && parse(day.readinessSnapshotJson).braceletRoster;
  if (frozen?.rows) return { ...frozen, closed: true };
  const [catalogRow, row] = await Promise.all([
    db.systemSetting.findUnique({ where: { key: 'OPS_PLANNING_CATALOGS' } }),
    db.systemSetting.findUnique({ where: { key: selectionKey(branch, date) } }),
  ]);
  const saved = parse(row?.value);
  const selections = saved.selections || {};
  const bookings=context||await bookingBraceletContext(db,branch,date);
  return { revision: Number(saved.revision || 0), selections, closed: day?.status === 'CLOSED', rows: rosterBracelets(items, parse(catalogRow?.value).stockCatalog?.braceletUsages, selections,bookings) };
}

async function saveBraceletRoster(db, user, input) {
  const { hasPermission } = require('../accounts/registry');
  const { resolveScope } = require('../accounts/enforcement');
  const { operationsBranch } = require('./business-access');
  if (!hasPermission(user, 'stock.edit')) fail('Permission denied', 403);
  const date = String(input.date || '');
  const parsed = new Date(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) fail('Invalid date', 400);
  if (!input.selections || typeof input.selections !== 'object' || Array.isArray(input.selections)) fail('Invalid bracelet selections', 400);
  return db.$transaction(async tx => {
    const branch = await operationsBranch(tx, user, input.branch);
    const scope = await resolveScope(tx, user, 'stock.edit');
    if (!scope.unrestricted && (!scope.branches.includes(branch) || ['OWN', 'TEAM'].includes(scope.recordScope))) fail('This shared action requires branch access', 403);
    const day = await tx.opsOperationsDay.findFirst({ where: { branch, workDate: date }, orderBy: { version: 'desc' } });
    if (day?.status === 'CLOSED') fail('Reopen the operations day before changing bracelet selections');
    const key = selectionKey(branch, date);
    const previous = await tx.systemSetting.findUnique({ where: { key } });
    const state = parse(previous?.value);
    const revision = Number(state.revision || 0);
    if (!Number.isInteger(input.expectedRevision) || input.expectedRevision !== revision) fail('Bracelet selections changed. Reload before saving.');
    const catalog = parse((await tx.systemSetting.findUnique({ where: { key: 'OPS_PLANNING_CATALOGS' } }))?.value).stockCatalog || {};
    const context=await bookingBraceletContext(tx,branch,date);
    const types = rosterBraceletTypes(catalog.braceletUsages,context);
    const items = await tx.opsWristbandStock.findMany({ where: { branch, stockCategory: 'BRACELET', workDate: { in: ['ALL', date] } } });
    const global = items.filter(item => item.workDate === 'ALL');
    const inventory = global.length ? global : items;
    const selections = Object.fromEntries(Object.entries(state.selections||{}).filter(([code])=>!types.some(type=>type.code===code)&&normalizeBraceletTypes(catalog.braceletUsages).some(type=>type.code===code)));
    for (const [code, id] of Object.entries(input.selections)) {
      if (!types.some(type => type.code === code) || typeof id !== 'string') fail('Invalid bracelet type selection');
      if (!id) continue;
      if (!inventory.some(item => item.id === id && item.usageType === code && stockAvailable(item) > 0)) fail('Select available bracelet stock belonging to this type and branch');
      selections[code] = id;
    }
    const value = JSON.stringify({ revision: revision + 1, selections, updatedAt: new Date().toISOString(), updatedBy: user.id });
    if (previous) {
      const updated = await tx.systemSetting.updateMany({ where: { key, value: previous.value }, data: { value } });
      if (updated.count !== 1) fail('Bracelet selections changed. Reload before saving.');
    } else await tx.systemSetting.create({ data: { key, value } });
    await tx.auditLog.create({ data: { userId: user.id, action: 'OPS_ROSTER_BRACELETS_UPDATED', summary: `Updated roster bracelet selections for ${date}`, metadata: JSON.stringify({ branch, date, before: state.selections || {}, after: selections }) } });
    return { revision: revision + 1, selections, closed: false, rows: rosterBracelets(inventory, catalog.braceletUsages, selections,context) };
  });
}
module.exports = { loadBraceletRoster, saveBraceletRoster, selectionKey };
