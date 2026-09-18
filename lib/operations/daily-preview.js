function timeRange(start, end) {
  return [start, end].filter(Boolean).join(" – ");
}

function previewCardLines(card, data = {}) {
  if (card === "trips") {
    if (!data.trips?.length) return ["No trips planned"];
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
          item.chickenNuggets ? `${item.chickenNuggets} nuggets` : null,
          item.beefBurgers ? `${item.beefBurgers} beef burgers` : null,
          item.chickenBurgers ? `${item.chickenBurgers} chicken burgers` : null,
          item.braceletType ? `Bracelet: ${item.braceletType}` : null,
        ]
          .filter(Boolean)
          .join(" · "),
      ])
      .filter(Boolean);
  }
  if (card === "birthdays") {
    if (!data.events?.length) return ["No events planned"];
    return data.events
      .flatMap((item) => [
        item.childName ? `${item.childName} Birthday` : item.name,
        [
          item.customerName ? `Customer: ${item.customerName}` : null,
          item.customerPhone,
          timeRange(item.startTime, item.endTime),
          item.expectedGuests != null ? `${item.expectedGuests} guests` : null,
          item.chickenNuggets ? `${item.chickenNuggets} nuggets` : null,
          item.beefBurgers ? `${item.beefBurgers} beef burgers` : null,
          item.chickenBurgers ? `${item.chickenBurgers} chicken burgers` : null,
          item.partyRoomHours ? `Party room: ${item.partyRoomHours}h` : null,
          item.location,
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
        `${item.wristbandType}${item.color ? `: ${item.color}` : ""} · ${Math.max(0, item.availableStock - item.allocated - item.issued)} remaining`,
    );
  }
  return [];
}

module.exports = { previewCardLines };
