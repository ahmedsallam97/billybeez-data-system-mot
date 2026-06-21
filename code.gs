const SHEET_ID = "1wXkhCImyXrm7C-_LqvKkRvXsYeZLbBHTlktzVFqRSKM";

const SHEETS = {
  USERS: "Users",
  PRODUCTS: "Products",
  ORDERS: "Orders",
  ORDER_ITEMS: "OrderItems",
};

const SHEET_HEADERS = {
  Users: ["id", "name", "username", "password", "role"],
  Products: ["productId", "categoryId", "productName", "price", "imageUrl", "categoryName"],
  Orders: ["orderId", "braceletNo", "childName", "cashierName", "time", "status", "total", "kitchenStatus", "paymentStatus", "customerLeft", "archivedAt"],
  OrderItems: ["itemId", "orderId", "productId", "productName", "qty", "price", "total"],
};

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

/* =========================
   ORDERS
========================= */

function createOrder(body) {
  const data = JSON.parse(body);

  if (!data.braceletNo) {
    return { success: false, error: "Bracelet number is required" };
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

  return orders
    .filter((r) => includeArchived ? isArchived(r) : !isArchived(r))
    .map((r) => {
      const order = mapOrderRow(r);
      const orderItems = items
        .filter((i) => i[1] == order.orderId)
        .map(mapItemRow);

      return {
        ...order,
        items: orderItems,
      };
    })
    .reverse();
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
    },
    items: orderItems.map(mapItemRow),
  };
}

/* =========================
   DASHBOARD (MANAGER)
========================= */

function getDashboard() {
  const sheet = getSheet(SHEETS.ORDERS);
  const data = getRows(sheet);

  let totalSales = 0;
  let pending = 0;
  const braceletMap = {};

  data.forEach((r) => {
    const bracelet = r[1];
    const status = r[5];
    const total = toNumber(r[6]);

    totalSales += total;

    if (status != "Paid") pending++;

    if (!braceletMap[bracelet]) {
      braceletMap[bracelet] = 0;
    }

    braceletMap[bracelet] += total;
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
    topBracelets,
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
    const imageUrl = row[4] || buildProductImageUrl(productName);

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

function buildProductImageUrl(productName) {
  const label = encodeURIComponent(String(productName || "Product").trim());
  return "https://placehold.co/320x240/f2eefa/5B2C83?text=" + label;
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
  };
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

function isCustomerLeft(row) {
  return row[9] === true || String(row[9]).toUpperCase() == "TRUE" || row[5] == "Left Unpaid";
}

function isArchived(row) {
  return !!row[10] || row[5] == "Archived";
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
