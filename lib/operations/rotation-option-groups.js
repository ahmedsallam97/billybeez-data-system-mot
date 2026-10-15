// Presentation only: the API remains the source of assignment eligibility.
function rotationOptionGroups(options = [], allowDisabled = false) {
  const available = [], unavailable = [];
  for (const option of options) {
    const reason = option.reason || (option.requiresOverride && !allowDisabled ? 'OVERRIDE_REQUIRED' : '');
    (reason ? unavailable : available).push({ ...option, displayReason: reason });
  }
  return { available, unavailable };
}
module.exports = { rotationOptionGroups };
