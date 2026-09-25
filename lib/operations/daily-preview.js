const { colorNameFor, stockAvailable } = require("./planning");

function timeRange(start, end) {
  return [start, end].filter(Boolean).join(" – ");
}

function mealLines(item = {}) {
  let configured = {};
  try {
    const parsed = typeof item.mealCountsJson === "string" ? JSON.parse(item.mealCountsJson || "{}") : item.mealCountsJson;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) configured = parsed;
  } catch {}
  const quantities = new Map(
    Object.entries(configured)
      .map(([label, quantity]) => [String(label).trim(), Math.max(0, Number(quantity || 0))])
      .filter(([label, quantity]) => label && quantity > 0),
  );
  const legacy = [
    ["Chicken Nuggets", item.chickenNuggets],
    ["Beef Burger", item.beefBurgers],
    ["Chicken Burger", item.chickenBurgers],
  ];
  for (const [label, quantity] of legacy) {
    const value = Math.max(0, Number(quantity || 0));
    if (value > 0 && !quantities.has(label)) quantities.set(label, value);
  }
  return [...quantities].map(([label, quantity]) => `${quantity} ${label}`);
}

function previewCardLines(card, data = {}) {
  if (card === "trips") {
    if (!data.trips?.length) return [];
    return data.trips
      .flatMap((item) => [
        item.name,
        [
          timeRange(item.startTime, item.endTime),
          item.expectedChildren != null
            ? `${item.expectedChildren} children`
            : null,
          item.staffingRequired != null
            ? `${item.staffingRequired} staff required`
            : null,
          item.supervisorName ? `Supervisor: ${item.supervisorName}` : null,
          item.supervisorPhone,
          ...mealLines(item),
          item.braceletType ? `Bracelet: ${item.braceletType}` : null,
          item.braceletColor ? `Color: ${item.braceletColor}` : null,
          item.braceletMaterial ? `Material: ${item.braceletMaterial}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      ])
      .filter(Boolean);
  }
  if (card === "birthdays") {
    if (!data.events?.length) return [];
    return data.events
      .flatMap((item) => [
        item.childName ? `${item.childName} Birthday` : item.name,
        [
          item.customerName ? `Customer: ${item.customerName}` : null,
          item.customerPhone,
          timeRange(item.startTime, item.endTime),
          item.expectedGuests != null ? `${item.expectedGuests} guests` : null,
          ...mealLines(item),
          item.partyRoomHours ? `Party room: ${item.partyRoomHours}h` : null,
          item.location,
          item.braceletColor ? `Bracelet: ${item.braceletMaterial || ""} ${item.braceletColor}`.trim() : null,
        ]
          .filter(Boolean)
          .join(" · "),
      ])
      .filter(Boolean);
  }
  if (card === "offers") {
    if (!data.offers?.length) return ["No active offers"];
    return data.offers
      .flatMap((item) => [
        item.title,
        item.priceBefore != null || item.priceAfter != null
          ? `${item.priceBefore != null ? `Was ${item.priceBefore} EGP` : ""}${item.priceBefore != null && item.priceAfter != null ? " · " : ""}${item.priceAfter != null ? `Now ${item.priceAfter} EGP` : ""}`
          : null,
        item.details,
      ])
      .filter(Boolean);
  }
  if (card === "bracelets") {
    const bracelets = (data.wristbands || []).filter((item) => !item.stockCategory || item.stockCategory === "BRACELET");
    if (!bracelets.length) return ["No wristband stock recorded"];
    return bracelets.map(
      (item) =>
        `${item.usageType || item.wristbandType} ⇒ ${item.material || "Bracelet"}${item.color ? ` ${item.colorName || colorNameFor(item.color)}` : ""} · ${stockAvailable(item)} remaining`,
    );
  }
  return [];
}

module.exports = { previewCardLines };
