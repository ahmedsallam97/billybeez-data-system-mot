const defaultKitchenCategoryPatterns = [
  /meal/i,
  /sandwich/i,
  /burger/i,
  /وجبات/,
  /وجبة/,
  /ساند/,
  /برجر/,
];

function normalizeList(values) {
  return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))];
}

function parseKitchenTicketRules(value) {
  if (!value) {
    return { categoryIds: [], categoryNames: [], productIds: [] };
  }

  try {
    const parsed = JSON.parse(value);
    return {
      categoryIds: normalizeList(parsed.categoryIds),
      categoryNames: normalizeList(parsed.categoryNames),
      productIds: normalizeList(parsed.productIds),
    };
  } catch {
    return {
      categoryIds: [],
      categoryNames: normalizeList(String(value).split(",")),
      productIds: [],
    };
  }
}

function kitchenTicketRuleValue(rules) {
  return JSON.stringify({
    categoryIds: normalizeList(rules?.categoryIds),
    categoryNames: normalizeList(rules?.categoryNames),
    productIds: normalizeList(rules?.productIds),
  });
}

function isKitchenTicketItem(item, rules) {
  const parsedRules = typeof rules === "string" ? parseKitchenTicketRules(rules) : rules;
  const productIds = new Set(normalizeList(parsedRules?.productIds));
  const categoryIds = new Set(normalizeList(parsedRules?.categoryIds));
  const categoryNames = new Set(normalizeList(parsedRules?.categoryNames).map((name) => name.toLowerCase()));

  if (productIds.has(item.productId)) return true;
  if (categoryIds.has(item.categoryId)) return true;
  if (categoryNames.has(String(item.categoryName || "").toLowerCase())) return true;

  if (!productIds.size && !categoryIds.size && !categoryNames.size) {
    const searchable = `${item.categoryName || ""} ${item.name || ""}`;
    return defaultKitchenCategoryPatterns.some((pattern) => pattern.test(searchable));
  }

  return false;
}

function filterKitchenTicketItems(items, rulesValue) {
  const rules = parseKitchenTicketRules(rulesValue);
  const matchedItems = (items || []).filter((item) => isKitchenTicketItem(item, rules));
  const hasConfiguredRules = Boolean(rules.categoryIds.length || rules.categoryNames.length || rules.productIds.length);

  return {
    matchedItems,
    items: matchedItems.length || hasConfiguredRules ? matchedItems : (items || []),
    rules,
  };
}

module.exports = {
  filterKitchenTicketItems,
  kitchenTicketRuleValue,
  parseKitchenTicketRules,
};
