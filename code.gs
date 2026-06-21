const SHEET_ID = "1wXkhCImyXrm7C-_LqvKkRvXsYeZLbBHTlktzVFqRSKM";

const SHEETS = {
  USERS: "Users",
  PRODUCTS: "Products",
  ORDERS: "Orders",
  ORDER_ITEMS: "OrderItems",
  DATA_EMPLOYEES: "الموظفين",
};

const SHEET_HEADERS = {
  Users: ["id", "name", "username", "password", "role"],
  Products: ["productId", "categoryId", "productName", "price", "imageUrl", "categoryName"],
  Orders: ["orderId", "braceletNo", "childName", "cashierName", "time", "status", "total", "kitchenStatus", "paymentStatus", "customerLeft", "archivedAt", "dataEmployee", "childrenCount", "paymentMethod"],
  OrderItems: ["itemId", "orderId", "productId", "productName", "qty", "price", "total"],
  "الموظفين": ["employeeId", "employeeName", "active"],
};

const DATA_EMPLOYEE_NAMES = [
  "محمد عصام",
  "محمد جمال",
  "صلاح محمد",
  "مصطفي عمارة",
  "محمد مدكور",
  "يوسف فهمي",
  "محمد عادل",
  "عبدالرحمن هشام",
  "مصطفي خالد",
  "مهرا سمير",
  "الاء نصار",
  "سلمي سلطان",
];

const CATEGORY_NAMES = {
  DR001: "Drinks",
  BK001: "Bakery",
  OT001: "Snacks",
  PA001: "Pasta",
  CR001: "Crepe",
  SN001: "Meals",
  PI001: "Pizza",
  BU001: "Burger",
  SA001: "Salad",
};

/* =========================
   ROUTER
========================= */

function doGet(e) {
  try {
    const params = (e && e.parameter) || {};

    switch (params.action) {
      case "login":
        return jsonResponse(login(params.username, params.password));

      case "getProducts":
        return jsonResponse(getProducts());

      case "getDataEmployees":
        return jsonResponse(getDataEmployees());

      case "getPendingOrders":
        return jsonResponse(getPendingOrders());

      case "getOrders":
        return jsonResponse(getOrders(params));

      case "getOrderDetails":
        return jsonResponse(getOrderDetails(params.orderId));

      case "getKitchenOrders":
        return jsonResponse(getKitchenOrders(params));

      case "getInvoice":
        return jsonResponse(getInvoice(params.orderId));

      case "getDashboard":
        return jsonResponse(getDashboard());

      default:
        return jsonResponse({ status: "ok" });
    }
  } catch (error) {
    return jsonResponse({ success: false, error: error.message });
  }
}

function doPost(e) {
  try {
    const params = (e && e.parameter) || {};
    const body = (e && e.postData && e.postData.contents) || "{}";

    switch (params.action) {
      case "createOrder":
        return jsonResponse(createOrder(body));

      case "updateOrderStatus":
        return jsonResponse(updateOrderStatus(body));

      case "addOrderItems":
        return jsonResponse(addOrderItems(body));

      case "markCustomerLeft":
        return jsonResponse(markCustomerLeft(body));

      case "archiveOrder":
        return jsonResponse(archiveOrder(body));

      default:
        return jsonResponse({ success: false, error: "Unknown action" });
    }
  } catch (error) {
    return jsonResponse({ success: false, error: error.message });
  }
}

/* =========================
   LOGIN
========================= */

function login(username, password) {
  if (!username || !password) return { success: false };

  const sheet = getSheet(SHEETS.USERS);
  const data = getRows(sheet);

  const user = data.find((r) => r[2] == username && r[3] == password);

  if (!user) return { success: false };

  return {
    success: true,
    user: {
      id: user[0],
      name: user[1],
      username: user[2],
      role: user[4],
    },
  };
}

/* =========================
   PRODUCTS
========================= */

function getProducts() {
  const sheet = getSheet(SHEETS.PRODUCTS);
  const data = getRows(sheet);

  return data.map((r) => ({
    productId: r[0],
    categoryId: r[1],
    productName: r[2],
    price: toNumber(r[3]),
    imageUrl: r[4] || "",
    categoryName: r[5] || r[1] || "Other",
  }));
}

function getDataEmployees() {
  const employeesSheet = getSheet(SHEETS.DATA_EMPLOYEES);
  const employees = getRows(employeesSheet)
    .filter((r) => r[1] && String(r[2] || "TRUE").toUpperCase() != "FALSE")
    .map((r) => ({
      id: r[0],
      name: r[1],
    }));

  if (employees.length > 0) return employees;

  const users = getRows(getSheet(SHEETS.USERS))
    .filter((r) => r[1])
    .map((r) => ({
      id: r[0],
      name: r[1],
    }));

  return users;
}

function syncDataEmployeesFromUsers() {
  const employeesSheet = getSheet(SHEETS.DATA_EMPLOYEES);
  const existing = getRows(employeesSheet).map((r) => String(r[1] || "").trim());
  const values = [];

  DATA_EMPLOYEE_NAMES.forEach((name, index) => {
    if (!existing.includes(name)) {
      values.push(["EMP" + String(index + 1).padStart(3, "0"), name, "TRUE"]);
    }
  });

  if (values.length > 0) {
    employeesSheet
      .getRange(employeesSheet.getLastRow() + 1, 1, values.length, values[0].length)
      .setValues(values);
  }

  return { success: true, added: values.length };
}

/* =========================
   ORDERS
========================= */

function createOrder(body) {
  const data = JSON.parse(body);

  if (!data.braceletNo) {
    return { success: false, error: "Bracelet number is required" };
  }

  if (!isValidBracelet(data.braceletNo)) {
    return { success: false, error: "Bracelet must be 6 digits and start with 0, 1, 2, or 3" };
  }

  if (!data.childName) {
    return { success: false, error: "Child name is required" };
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    return { success: false, error: "Order items are required" };
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = ss.getSheetByName(SHEETS.ORDERS);
  const items = ss.getSheetByName(SHEETS.ORDER_ITEMS);
  const orderId = "ORD-" + Date.now();
  const now = new Date();

  const itemResult = buildItemRows(orderId, data.items, now);

  items
    .getRange(items.getLastRow() + 1, 1, itemResult.rows.length, itemResult.rows[0].length)
    .setValues(itemResult.rows);

  orders.appendRow([
    orderId,
    data.braceletNo,
    data.childName,
    data.cashierName || "",
    now,
    "Pending",
    itemResult.total,
    "Pending",
    "Unpaid",
    "",
    "",
    data.dataEmployee || "",
    Math.max(1, toNumber(data.childrenCount || 1)),
    data.paymentMethod || "Cash",
  ]);

  return {
    success: true,
    orderId,
    total: itemResult.total,
    warnings: [],
  };
}

/* =========================
   PENDING ORDERS
========================= */

function getPendingOrders() {
  const sheet = getSheet(SHEETS.ORDERS);
  const data = getRows(sheet);

  return data
    .filter((r) => getPaymentStatus(r) != "Paid" && !isArchived(r))
    .map(mapOrderRow);
}

/* =========================
   ORDER HISTORY
========================= */

function getOrders(params) {
  const sheet = getSheet(SHEETS.ORDERS);
  const data = getRows(sheet);
  const bracelet = params.bracelet || "";
  const status = params.status || "";
  const from = params.from ? new Date(params.from) : null;
  const to = params.to ? new Date(params.to) : null;

  if (to) {
    to.setHours(23, 59, 59, 999);
  }

  return data
    .filter((r) => {
      const orderDate = r[4] instanceof Date ? r[4] : new Date(r[4]);

      if (bracelet && String(r[1]) != String(bracelet)) return false;
      if (status && String(r[5]) != String(status)) return false;
      if (from && orderDate < from) return false;
      if (to && orderDate > to) return false;

      return true;
    })
    .map(mapOrderRow)
    .reverse();
}

function getKitchenOrders(params) {
  const includeArchived = params.archived == "true";
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = getRows(ss.getSheetByName(SHEETS.ORDERS));
  const items = getRows(ss.getSheetByName(SHEETS.ORDER_ITEMS));

  return buildOrdersWithItems(
    orders.filter((r) => includeArchived ? isArchived(r) : !isArchived(r)),
    items
  ).reverse();
}

function getOrderDetails(orderId) {
  if (!orderId) return { success: false, error: "Order ID is required" };

  const invoice = getInvoice(orderId);

  if (!invoice.success) return invoice;

  return {
    success: true,
    order: {
      orderId: invoice.order.id,
      bracelet: invoice.order.bracelet,
      childName: invoice.order.child,
      cashier: invoice.order.cashier,
      time: invoice.order.time,
      status: invoice.order.status,
      total: invoice.order.total,
      kitchenStatus: invoice.order.kitchenStatus,
      paymentStatus: invoice.order.paymentStatus,
      customerLeft: invoice.order.customerLeft,
      archivedAt: invoice.order.archivedAt,
      dataEmployee: invoice.order.dataEmployee,
      childrenCount: invoice.order.childrenCount,
      paymentMethod: invoice.order.paymentMethod,
    },
    items: invoice.items,
  };
}

/* =========================
   UPDATE STATUS
========================= */

function updateOrderStatus(body) {
  const data = JSON.parse(body);

  if (!data.orderId || !data.status) {
    return { success: false, error: "Order ID and status are required" };
  }

  const sheet = getSheet(SHEETS.ORDERS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.orderId) {
      const rowNumber = i + 1;
      const current = rows[i];
      let status = data.status;

      if (status == "Delivered") {
        sheet.getRange(rowNumber, 8).setValue("Delivered");
        if (getPaymentStatus(current) != "Paid") {
          sheet.getRange(rowNumber, 6).setValue("Delivered");
        }
      } else if (status == "Paid") {
        sheet.getRange(rowNumber, 9).setValue("Paid");
        sheet.getRange(rowNumber, 6).setValue("Paid");
        sheet.getRange(rowNumber, 14).setValue(data.paymentMethod || getPaymentMethod(current) || "Cash");
      } else {
        sheet.getRange(rowNumber, 6).setValue(status);
      }

      return { success: true };
    }
  }

  return { success: false, error: "Order not found" };
}

function markCustomerLeft(body) {
  const data = JSON.parse(body);

  if (!data.orderId) {
    return { success: false, error: "Order ID is required" };
  }

  const sheet = getSheet(SHEETS.ORDERS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.orderId) {
      const rowNumber = i + 1;
      sheet.getRange(rowNumber, 10).setValue("TRUE");

      if (getPaymentStatus(rows[i]) != "Paid") {
        sheet.getRange(rowNumber, 6).setValue("Left Unpaid");
      }

      return { success: true };
    }
  }

  return { success: false, error: "Order not found" };
}

function archiveOrder(body) {
  const data = JSON.parse(body);

  if (!data.orderId) {
    return { success: false, error: "Order ID is required" };
  }

  const sheet = getSheet(SHEETS.ORDERS);
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.orderId) {
      const rowNumber = i + 1;
      sheet.getRange(rowNumber, 11).setValue(new Date());
      sheet.getRange(rowNumber, 6).setValue("Archived");
      return { success: true };
    }
  }

  return { success: false, error: "Order not found" };
}

function addOrderItems(body) {
  const data = JSON.parse(body);

  if (!data.orderId) {
    return { success: false, error: "Order ID is required" };
  }

  if (!Array.isArray(data.items) || data.items.length === 0) {
    return { success: false, error: "Order items are required" };
  }

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = ss.getSheetByName(SHEETS.ORDERS);
  const items = ss.getSheetByName(SHEETS.ORDER_ITEMS);
  const rows = orders.getDataRange().getValues();
  let orderRow = -1;
  let currentTotal = 0;

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] == data.orderId) {
      orderRow = i + 1;
      currentTotal = toNumber(rows[i][6]);
      break;
    }
  }

  if (orderRow === -1) {
    return { success: false, error: "Order not found" };
  }

  const itemResult = buildItemRows(data.orderId, data.items, new Date());

  items
    .getRange(items.getLastRow() + 1, 1, itemResult.rows.length, itemResult.rows[0].length)
    .setValues(itemResult.rows);

  const newTotal = currentTotal + itemResult.total;
  orders.getRange(orderRow, 7).setValue(newTotal);

  return {
    success: true,
    orderId: data.orderId,
    addedTotal: itemResult.total,
    total: newTotal,
  };
}

/* =========================
   INVOICE
========================= */

function getInvoice(orderId) {
  if (!orderId) return { success: false, error: "Order ID is required" };

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const orders = getRows(ss.getSheetByName(SHEETS.ORDERS));
  const items = getRows(ss.getSheetByName(SHEETS.ORDER_ITEMS));

  const order = orders.find((r) => r[0] == orderId);

  if (!order) return { success: false, error: "Order not found" };

  const orderItems = items.filter((r) => r[1] == orderId);

  return {
    success: true,
    order: {
      id: order[0],
      bracelet: order[1],
      child: order[2],
      cashier: order[3],
      time: order[4],
      status: order[5],
      total: toNumber(order[6]),
      kitchenStatus: getKitchenStatus(order),
      paymentStatus: getPaymentStatus(order),
      customerLeft: isCustomerLeft(order),
      archivedAt: order[10] || "",
      dataEmployee: order[11] || "",
      childrenCount: Math.max(1, toNumber(order[12] || 1)),
      paymentMethod: getPaymentMethod(order),
    },
    items: orderItems.map(mapItemRow),
  };
}

/* =========================
   DASHBOARD (MANAGER)
========================= */

function getDashboard() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const data = getRows(ss.getSheetByName(SHEETS.ORDERS));
  const items = getRows(ss.getSheetByName(SHEETS.ORDER_ITEMS));

  let totalSales = 0;
  let pending = 0;
  const braceletMap = {};
  const paymentMap = { Cash: 0, Visa: 0, Unspecified: 0 };
  const paymentCountMap = { Cash: 0, Visa: 0, Unspecified: 0 };
  const statusMap = {};
  const cashierMap = {};
  const dataEmployeeMap = {};
  const dailyMap = {};

  data.forEach((r) => {
    const bracelet = r[1];
    const status = r[5];
    const total = toNumber(r[6]);
    const paymentStatus = getPaymentStatus(r);
    const paymentMethod = getPaymentMethod(r);
    const cashier = r[3] || "Unknown";
    const dataEmployee = r[11] || "Unassigned";
    const dateKey = formatDateKey(r[4]);

    if (paymentStatus == "Paid") {
      totalSales += total;
      paymentMap[paymentMethod] = (paymentMap[paymentMethod] || 0) + total;
      paymentCountMap[paymentMethod] = (paymentCountMap[paymentMethod] || 0) + 1;
    }

    if (paymentStatus != "Paid") pending++;
    statusMap[status || "Pending"] = (statusMap[status || "Pending"] || 0) + 1;

    if (!braceletMap[bracelet]) {
      braceletMap[bracelet] = 0;
    }

    braceletMap[bracelet] += total;
    cashierMap[cashier] = (cashierMap[cashier] || 0) + total;
    dataEmployeeMap[dataEmployee] = (dataEmployeeMap[dataEmployee] || 0) + total;
    dailyMap[dateKey] = (dailyMap[dateKey] || 0) + total;
  });

  const productMap = {};

  items.forEach((item) => {
    const name = item[3] || "Unknown";
    const qty = toNumber(item[4]);
    const total = toNumber(item[6]);

    if (!productMap[name]) {
      productMap[name] = { product: name, qty: 0, total: 0 };
    }

    productMap[name].qty += qty;
    productMap[name].total += total;
  });

  const topBracelets = Object.keys(braceletMap)
    .map((k) => ({
      bracelet: k,
      total: braceletMap[k],
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  return {
    totalSales,
    ordersCount: data.length,
    pending,
    paidOrders: data.filter((r) => getPaymentStatus(r) == "Paid").length,
    unpaidOrders: data.filter((r) => getPaymentStatus(r) != "Paid").length,
    archivedOrders: data.filter(isArchived).length,
    leftUnpaid: data.filter((r) => isCustomerLeft(r) && getPaymentStatus(r) != "Paid").length,
    paymentBreakdown: mapToList(paymentMap, "method"),
    paymentCounts: mapToList(paymentCountMap, "method"),
    statusBreakdown: mapToList(statusMap, "status"),
    topBracelets,
    topProducts: Object.keys(productMap)
      .map((k) => productMap[k])
      .sort((a, b) => b.total - a.total)
      .slice(0, 8),
    cashierPerformance: mapToList(cashierMap, "name").sort((a, b) => b.total - a.total),
    dataEmployeePerformance: mapToList(dataEmployeeMap, "name").sort((a, b) => b.total - a.total),
    dailySales: Object.keys(dailyMap)
      .sort()
      .map((date) => ({ date, total: dailyMap[date] })),
    orders: buildOrdersWithItems(data, items).reverse(),
  };
}

/* =========================
   HELPERS
========================= */

function setupSheets() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const created = [];
  const updated = [];

  Object.keys(SHEET_HEADERS).forEach((name) => {
    let sheet = ss.getSheetByName(name);

    if (!sheet) {
      sheet = ss.insertSheet(name);
      created.push(name);
    }

    const headers = SHEET_HEADERS[name];
    const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0];
    const needsHeaders = headers.some((header, index) => currentHeaders[index] !== header);

    if (needsHeaders) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      updated.push(name);
    }
  });

  return {
    success: true,
    created,
    updated,
  };
}

function getSheet(name) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(name);

  if (!sheet) {
    throw new Error("Sheet not found: " + name);
  }

  return sheet;
}

function getRows(sheet) {
  const data = sheet.getDataRange().getValues();
  data.shift();
  return data;
}

function toNumber(value) {
  const number = Number(value);
  return isNaN(number) ? 0 : number;
}

function isValidBracelet(value) {
  return /^[0-3][0-9]{5}$/.test(String(value || "").trim());
}

function populateProductMetadata() {
  const sheet = getSheet(SHEETS.PRODUCTS);
  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return { success: true, updated: 0 };
  }

  const range = sheet.getRange(2, 1, lastRow - 1, 6);
  const rows = range.getValues();
  let updated = 0;

  const values = rows.map((row) => {
    const categoryId = row[1];
    const productName = row[2];
    const categoryName = row[5] || CATEGORY_NAMES[categoryId] || categoryId || "Other";
    const imageUrl = !row[4] || String(row[4]).indexOf("placehold.co") > -1
      ? buildProductImageUrl(productName, categoryId)
      : row[4];

    if (row[4] !== imageUrl || row[5] !== categoryName) {
      updated++;
    }

    row[4] = imageUrl;
    row[5] = categoryName;

    return row;
  });

  range.setValues(values);

  return {
    success: true,
    updated,
  };
}

function buildItemRows(orderId, orderItems, now) {
  let total = 0;
  const rows = orderItems.map((item, index) => {
    const price = toNumber(item.price);
    const qty = Math.max(1, toNumber(item.qty || item.quantity || 1));
    const lineTotal = price * qty;
    total += lineTotal;

    return [
      "OI-" + now.getTime() + "-" + (index + 1),
      orderId,
      item.productId,
      item.productName,
      qty,
      price,
      lineTotal,
    ];
  });

  return { rows, total };
}

function buildProductImageUrl(productName, categoryId) {
  const name = String(productName || "food").toLowerCase();
  const category = String(CATEGORY_NAMES[categoryId] || "food").toLowerCase();
  const query = encodeURIComponent(name + "," + category);
  return "https://loremflickr.com/320/240/" + query;
}

function mapOrderRow(r) {
  return {
    orderId: r[0],
    bracelet: r[1],
    childName: r[2],
    cashier: r[3],
    time: r[4],
    status: r[5],
    total: toNumber(r[6]),
    kitchenStatus: getKitchenStatus(r),
    paymentStatus: getPaymentStatus(r),
    customerLeft: isCustomerLeft(r),
    archivedAt: r[10] || "",
    dataEmployee: r[11] || "",
    childrenCount: Math.max(1, toNumber(r[12] || 1)),
    paymentMethod: getPaymentMethod(r),
  };
}

function buildOrdersWithItems(orders, items) {
  const itemMap = {};

  items.forEach((item) => {
    const orderId = item[1];

    if (!itemMap[orderId]) {
      itemMap[orderId] = [];
    }

    itemMap[orderId].push(mapItemRow(item));
  });

  return orders.map((row) => {
    const order = mapOrderRow(row);

    return {
      ...order,
      items: itemMap[order.orderId] || [],
    };
  });
}

function mapItemRow(i) {
  return {
    name: i[3],
    qty: toNumber(i[4]),
    price: toNumber(i[5]),
    total: toNumber(i[6]),
  };
}

function getKitchenStatus(row) {
  return row[7] || (row[5] == "Delivered" || row[5] == "Paid" ? "Delivered" : "Pending");
}

function getPaymentStatus(row) {
  return row[8] || (row[5] == "Paid" ? "Paid" : "Unpaid");
}

function getPaymentMethod(row) {
  return row[13] || (getPaymentStatus(row) == "Paid" ? "Unspecified" : "");
}

function isCustomerLeft(row) {
  return row[9] === true || String(row[9]).toUpperCase() == "TRUE" || row[5] == "Left Unpaid";
}

function isArchived(row) {
  return !!row[10] || row[5] == "Archived";
}

function mapToList(map, keyName) {
  return Object.keys(map).map((key) => ({
    [keyName]: key,
    total: map[key],
  }));
}

function formatDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);

  if (isNaN(date.getTime())) {
    return "Unknown";
  }

  return Utilities.formatDate(date, Session.getScriptTimeZone(), "yyyy-MM-dd");
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
