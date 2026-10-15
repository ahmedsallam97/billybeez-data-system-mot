function tripIdentity(name) {
  return String(name || "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}
async function assertUniqueTrip(tx, { branch, workDate, startTime, name, id }) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime || "")) throw new Error("A valid trip start time is required");
  const rows = await tx.opsDailyTrip.findMany({ where: { branch, workDate, startTime, status: { not: "CANCELLED" }, ...(id ? { id: { not: id } } : {}) }, select: { name: true } });
  if (rows.some((item) => tripIdentity(item.name) === tripIdentity(name))) throw new Error("This trip already exists for the same branch, date and start time");
}
module.exports = { tripIdentity, assertUniqueTrip };
