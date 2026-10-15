const { normalizeBraceletTypes } = require('./stock-catalog');
const { stockAvailable, colorNameFor } = require('./planning');

function fail(message, status = 409) { throw Object.assign(new Error(message), { status }); }

// A type describes usage only. Variant identity always comes from inventory.
function braceletStockIdentity(body, catalog = {}) {
  const usageType = String(body.usageType || body.wristbandType || '').trim().toUpperCase();
  if (!normalizeBraceletTypes(catalog.braceletUsages).some(type => type.code === usageType)) fail('A configured bracelet type is required');
  const material = String(body.material || '').trim().toUpperCase();
  const materials = catalog.braceletMaterials || [{ code: 'PAPER' }];
  if (!materials.some(item => item.code === material)) fail('Select a configured bracelet material');
  const color = String(body.color || '').trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) fail('A bracelet stock color in #RRGGBB format is required');
  const colorName = String(body.colorName || colorNameFor(color)).trim();
  if (!colorName || colorName.length > 100) fail('Color name must contain 1–100 characters');
  return { usageType, material, color, colorName };
}

function rosterBraceletTypes(types=[], context={}) {
  return normalizeBraceletTypes(types).filter(type=>type.showInRoster || type.code==='TRIP'&&context.hasTrips || type.code==='BIRTHDAY'&&context.hasBirthdays);
}
function rosterBracelets(items = [], types = [], selections = {}, context={}) {
  return rosterBraceletTypes(types,context).map(type => {
    const options = items.filter(item => item.stockCategory === 'BRACELET' && item.usageType === type.code).map(item => ({
      id: item.id, material: item.material, color: item.color, colorName: item.colorName || colorNameFor(item.color), remaining: stockAvailable(item),
    }));
    const available = options.filter(item => item.remaining > 0);
    const explicit = selections[type.code];
    const selected = explicit ? options.find(item => item.id === explicit) : available.length === 1 ? available[0] : null;
    const state = selected ? (selected.remaining > 0 ? 'READY' : 'OUT_OF_STOCK') : explicit ? 'UNAVAILABLE' : available.length > 1 ? 'SELECT_STOCK' : 'NO_STOCK';
    return { ...type, stockId: selected?.id || null, selection: explicit || '', state, color: selected?.color || null,
      colorName: selected?.colorName || '', material: selected?.material || '', remaining: selected?.remaining || 0, options };
  });
}

module.exports = { braceletStockIdentity, rosterBracelets, rosterBraceletTypes };
