"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

const dictionaries = {
  en: {
    "app.name": "BillyBeez Data System",
    "nav.manager": "Manager",
    "nav.cashier": "Data",
    "nav.kitchen": "Restaurant",
    "nav.logout": "Logout",
    "nav.language": "العربية",
    "nav.languageLabel": "Switch language",
    "nav.themeClassic": "Purple Theme",
    "nav.themeRed": "Red Theme",
    "nav.themeBlue": "Blue Theme",
    "nav.themeOrange": "Orange Theme",
    "title.cashier": "Data Interface",
    "title.kitchen": "Restaurant Interface",
    "title.manager": "Manager Interface",
    "role.ADMIN": "Admin",
    "role.MANAGER": "Manager",
    "role.CASHIER": "Data",
    "role.KITCHEN": "Restaurant",
    "common.loading": "Loading...",
    "common.close": "Close",
    "common.save": "Save",
    "common.saveEmployee": "Save Employee",
    "common.cancel": "Cancel",
    "common.print": "Print",
    "common.printInvoice": "Print Invoice",
    "common.clearFilters": "Clear Filters",
    "common.noItems": "No items",
    "common.noData": "No data",
    "common.yes": "Yes",
    "common.no": "No",
    "common.name": "Name",
    "common.department": "Department",
    "common.actions": "Actions",
    "common.delete": "Delete",
    "common.qty": "Qty",
    "common.inactive": "Inactive",
    "common.edit": "Edit",
    "common.activate": "Activate",
    "common.deactivate": "Deactivate",
    "common.egp": "EGP",
    "common.all": "All",
    "common.active": "Active",
    "common.archive": "Archive",
    "common.archived": "Archived",
    "common.today": "Today",
    "common.orderHistory": "Order History",
    "common.currentOrders": "Current Orders",
    "common.archivedOrders": "Archived Orders",
    "common.order": "Order",
    "common.orderId": "Order ID",
    "common.bracelet": "Bracelet",
    "common.phone": "Phone",
    "common.children": "Children",
    "common.cashier": "Data",
    "common.employee": "Employee",
    "common.employeeButton": "Employee",
    "common.restaurantEmployee": "Restaurant Employee",
    "common.paymentEmployee": "Receiver",
    "common.exitEmployee": "Exit Employee",
    "common.kitchen": "Restaurant",
    "common.payment": "Payment",
    "common.paymentMethod": "Payment Method",
    "common.status": "Status",
    "common.method": "Method",
    "common.orderTotal": "Order Total",
    "common.businessDay": "Business Day",
    "common.closed": "Closed",
    "common.inProgress": "In Progress",
    "common.closedAt": "Closed At",
    "common.archivedAt": "Archived At",
    "common.geideaRegisteredAt": "Geidea Registered At",
    "common.geideaRegisteredBy": "Registered on Geidea by",
    "common.visibleOrders": "Visible orders",
    "common.cash": "Cash",
    "common.visa": "Visa",
    "common.unpaid": "Unpaid",
    "common.paid": "Paid",
    "common.delivered": "Delivered",
    "common.pending": "Pending",
    "common.open": "Open",
    "common.systemRegistered": "Registered on Geidea",
    "alert.leftUnpaid": "Customer left without paying",
    "alert.leftNeedsSystem": "Customer left and the order is not registered on Geidea",
    "business.open": "Business day open",
    "business.closed": "Business day closed",
    "business.password": "Day control password",
    "business.passwordRequired": "Enter the day control password",
    "business.openDay": "Open Day",
    "business.closeDay": "Close Day",
    "business.confirmOpen": "Open the business day?",
    "business.confirmClose": "Close the business day?",
    "business.updateFailed": "Business day update failed",
    "business.opened": "Business day opened",
    "business.closedToast": "Business day closed",
    "business.message.open": "Business day is open",
    "business.message.hours": "Business hours are from 7:00 AM to 1:00 AM",
    "business.message.manualOpen": "Business day is manually open",
    "business.message.manualClosed": "Business day is manually closed",
    "login.title": "BDS MOT",
    "login.username": "Username",
    "login.password": "Password",
    "login.submit": "Login",
    "login.failed": "Login failed",
    "cashier.addNewOrder": "Add New Order",
    "cashier.currentCount": "{count} current orders",
    "cashier.archivedCount": "{count} archived orders",
    "cashier.searchOrdersPlaceholder": "Search by bracelet, phone, or child name",
    "cashier.editOrder": "Edit Order",
    "cashier.backToOrders": "Back to orders",
    "cashier.braceletPlaceholder": "Bracelet number",
    "cashier.phonePlaceholder": "Customer phone (optional)",
    "cashier.childCount": "{count} child",
    "cashier.childName": "Child name {count}",
    "cashier.cart": "Cart",
    "cashier.noItemsSelected": "No items selected",
    "cashier.newItemsTotal": "New Items Total",
    "cashier.totalAfterAdd": "Order Total After Add",
    "cashier.addItems": "Add Items",
    "cashier.saveChanges": "Save Changes",
    "cashier.saveOrder": "Save Order",
    "cashier.clearCart": "Clear Cart",
    "cashier.cancel": "Cancel",
    "cashier.editButton": "Edit Order",
    "cashier.customerLeft": "Customer Left",
    "cashier.customerPresent": "Customer Present",
    "cashier.customerEnter": "Enter",
    "cashier.editExitEmployee": "Edit Exit Employee",
    "cashier.managerPasswordPrompt": "Enter manager password",
    "cashier.registerSystem": "Geidea",
    "cashier.saveFailed": "Order save failed",
    "cashier.updateFailed": "Order update failed",
    "cashier.saved": "Order {id} saved",
    "cashier.itemsAdded": "Items added to order",
    "cashier.orderUpdated": "Order updated",
    "cashier.orderUpdatedWithItems": "Order updated and items added",
    "cashier.leftToast": "Customer marked as left",
    "cashier.presentToast": "Customer marked as present",
    "cashier.selectExitEmployee": "Select Operation Employee",
    "cashier.exitEmployeeRequired": "Select the operation employee first",
    "cashier.archiveFailed": "Archive failed",
    "cashier.registeredToast": "Order registered on Geidea",
    "kitchen.orders": "Restaurant Orders",
    "kitchen.deliveryFailed": "Delivery update failed",
    "kitchen.deliveredToast": "Order marked delivered",
    "kitchen.paymentFailed": "Payment failed",
    "kitchen.paymentToast": "Payment saved as {method}",
    "kitchen.archiveFailed": "Archive failed",
    "kitchen.archivedToast": "Order archived",
    "kitchen.registeredToast": "Order registered on Geidea",
    "kitchen.archiveOrder": "Archive",
    "kitchen.startPreparation": "Start Prep",
    "kitchen.markDelivered": "Delivered",
    "kitchen.payCash": "Pay Cash",
    "kitchen.payVisa": "Pay Visa",
    "kitchen.paidCash": "Paid Cash",
    "kitchen.paidVisa": "Paid Visa",
    "kitchen.selectPaymentEmployee": "Select receiver",
    "kitchen.editPaymentEmployee": "Edit Payment Employee",
    "kitchen.editGeideaEmployee": "Edit Geidea Employee",
    "kitchen.selectRestaurantEmployee": "Select Geidea Employee",
    "kitchen.noRestaurantEmployees": "No restaurant employees",
    "kitchen.paymentEmployeeRequired": "Select the receiver first",
    "kitchen.restaurantEmployeeRequired": "Select a restaurant employee first",
    "kitchen.registerSystem": "Geidea",
    "kitchenTicket.title": "Kitchen Ticket",
    "kitchenTicket.filtered": "Meals and sandwiches only",
    "kitchenTicket.allItems": "No meal category detected, all items printed",
    "manager.totalPaidSales": "Total Paid Sales",
    "manager.orders": "Orders",
    "manager.leftUnpaid": "Left Unpaid",
    "manager.history": "History",
    "manager.tabOrders": "Orders",
    "manager.tabReview": "Day Review",
    "manager.tabReports": "Reports",
    "manager.tabSettings": "Settings",
    "manager.tabActivity": "Activity",
    "manager.confirmDanger": "Are you sure you want to continue?",
    "manager.todayOrders": "Today Orders",
    "manager.autoClosed": "Auto-closed {count} orders",
    "manager.closedCount": "Moved {count} orders to history",
    "manager.notRegisteredGeidea": "Not Registered on Geidea",
    "manager.dayReview": "Day Review",
    "manager.dayReviewHint": "Review these numbers before closing the business day",
    "manager.cashTotal": "Cash Total",
    "manager.visaTotal": "Visa Total",
    "manager.exportExcel": "Export Excel",
    "manager.exportPdf": "Export PDF",
    "manager.searchPlaceholder": "Search order, bracelet, phone, child, data, day",
    "manager.paymentBreakdown": "Payment Breakdown",
    "manager.topProducts": "Top Products",
    "manager.statusBreakdown": "Status Breakdown",
    "manager.cashierPerformance": "Data Performance",
    "manager.employees": "Employees",
    "manager.topBracelets": "Top Bracelets",
    "manager.dailySales": "Daily Sales",
    "manager.recentActivity": "Recent Activity",
    "manager.noActivity": "No activity yet",
    "manager.noOrder": "No order",
    "manager.details": "Details",
    "manager.unarchive": "Unarchive",
    "manager.orderDetails": "Order details",
    "manager.setCashPaid": "Set Cash Paid",
    "manager.setVisaPaid": "Set Visa Paid",
    "manager.cashPaid": "Paid Cash",
    "manager.visaPaid": "Paid Visa",
    "manager.markDelivered": "Mark Delivered",
    "manager.markCustomerLeft": "Mark Customer Left",
    "manager.archive": "Archive",
    "manager.registerSystem": "Geidea",
    "manager.paymentUpdateFailed": "Payment update failed",
    "manager.orderUpdateFailed": "Order update failed",
    "manager.paymentToast": "Payment saved as {method}",
    "manager.addItem": "Add Item",
    "manager.itemAdded": "Item added",
    "manager.itemRemoved": "Item removed",
    "manager.selectProductFirst": "Select a product first",
    "manager.selectReceiver": "Select receiver",
    "manager.selectGeideaEmployee": "Select Geidea employee",
    "manager.employeeManagement": "Employee Management",
    "manager.employeeManagementHint": "Add, edit, activate, or deactivate operation and restaurant employees",
    "manager.productManagement": "Product Management",
    "manager.productManagementHint": "Manage products, prices, categories, images, and availability",
    "manager.productName": "Product name",
    "manager.productPrice": "Price",
    "manager.categoryName": "Category",
    "manager.productImage": "Image URL",
    "manager.popularProduct": "Popular",
    "manager.regularProduct": "Regular",
    "manager.employeeSearch": "Search employees",
    "manager.productSearch": "Search products",
    "manager.userSearch": "Search users",
    "manager.addProduct": "Add Product",
    "manager.updateProduct": "Update Product",
    "manager.productSaved": "Product saved",
    "manager.productSaveFailed": "Product save failed",
    "manager.userManagement": "User Permissions",
    "manager.userManagementHint": "Manage login users, roles, and active access",
    "manager.addUser": "Add User",
    "manager.updateUser": "Update User",
    "manager.userSaved": "User saved",
    "manager.userSaveFailed": "User save failed",
    "manager.passwordOptional": "New password (optional)",
    "manager.employeeName": "Employee name",
    "manager.addEmployee": "Add Employee",
    "manager.updateEmployee": "Update Employee",
    "manager.employeeSaveFailed": "Employee save failed",
    "manager.employeeSaved": "Employee saved",
    "manager.orderUpdated": "Order updated",
    "audit.openedBusinessDay": "Opened business day",
    "audit.closedBusinessDay": "Closed business day",
    "audit.createdOrder": "Created order {id}",
    "audit.archivedOrder": "Archived order",
    "audit.geideaRegistered": "Registered order on Geidea",
    "audit.geideaAutoRegistered": "Registered order on Geidea during day close",
    "audit.movedToHistory": "Moved order to history",
    "audit.markedDelivered": "Marked delivered",
    "audit.markedPaidBy": "Marked paid by {method}",
    "audit.addedItemLines": "Added {count} item lines",
    "audit.unarchivedOrder": "Unarchived order",
    "audit.customerLeft": "Customer left",
    "audit.customerReturned": "Customer returned",
    "audit.createdEmployee": "Created employee {name}",
    "audit.updatedEmployee": "Updated employee {name}",
    "invoice.title": "BDS MOT Invoice",
    "invoice.welcome": "Welcome To",
    "invoice.company": "BillyBeez MOA",
    "invoice.tin": "TIN",
    "invoice.date": "Date",
    "invoice.item": "Item",
    "invoice.rate": "Rate",
    "invoice.amount": "Amt",
    "invoice.subtotal": "Subtotal",
    "invoice.points": "Points",
    "invoice.thanks": "Thanks for making memories with us!",
    "invoice.contact": "Contact us",
  },
  ar: {
    "app.name": "نظام بيانات BillyBeez",
    "nav.manager": "المدير",
    "nav.cashier": "الداتا",
    "nav.kitchen": "المطعم",
    "nav.logout": "تسجيل خروج",
    "nav.language": "English",
    "nav.languageLabel": "تغيير اللغة",
    "nav.themeClassic": "الثيم البنفسجي",
    "nav.themeRed": "الثيم الأحمر",
    "nav.themeBlue": "الثيم الأزرق",
    "nav.themeOrange": "الثيم البرتقاني",
    "title.cashier": "واجهة الداتا",
    "title.kitchen": "واجهة المطعم",
    "title.manager": "واجهة المدير",
    "role.ADMIN": "أدمن",
    "role.MANAGER": "مدير",
    "role.CASHIER": "الداتا",
    "role.KITCHEN": "المطعم",
    "common.loading": "جاري التحميل...",
    "common.close": "إغلاق",
    "common.save": "حفظ",
    "common.saveEmployee": "حفظ الموظف",
    "common.cancel": "إلغاء",
    "common.print": "طباعة",
    "common.printInvoice": "طباعة الفاتورة",
    "common.clearFilters": "مسح الفلاتر",
    "common.noItems": "لا توجد منتجات",
    "common.noData": "لا توجد بيانات",
    "common.yes": "نعم",
    "common.no": "لا",
    "common.name": "الاسم",
    "common.department": "القسم",
    "common.actions": "الإجراءات",
    "common.delete": "حذف",
    "common.qty": "الكمية",
    "common.inactive": "غير مفعل",
    "common.edit": "تعديل",
    "common.activate": "تفعيل",
    "common.deactivate": "تعطيل",
    "common.egp": "جنيه",
    "common.all": "الكل",
    "common.active": "الحالية",
    "common.archive": "الأرشيف",
    "common.archived": "مؤرشف",
    "common.today": "اليوم",
    "common.orderHistory": "سجل الطلبات",
    "common.currentOrders": "الطلبات الحالية",
    "common.archivedOrders": "الطلبات المؤرشفة",
    "common.order": "الطلب",
    "common.orderId": "رقم الطلب",
    "common.bracelet": "البريسلت",
    "common.phone": "التليفون",
    "common.children": "الأطفال",
    "common.cashier": "الداتا",
    "common.employee": "موظف الداتا",
    "common.employeeButton": "الموظف",
    "common.restaurantEmployee": "موظف المطعم",
    "common.paymentEmployee": "المستلم",
    "common.exitEmployee": "موظف تسجيل الخروج",
    "common.kitchen": "المطعم",
    "common.payment": "الدفع",
    "common.paymentMethod": "طريقة الدفع",
    "common.status": "الحالة",
    "common.method": "الطريقة",
    "common.orderTotal": "إجمالي الطلب",
    "common.businessDay": "يوم التشغيل",
    "common.closed": "مغلق",
    "common.inProgress": "جاري",
    "common.closedAt": "وقت الإغلاق",
    "common.archivedAt": "وقت الأرشفة",
    "common.geideaRegisteredAt": "وقت التسجيل على جيديا",
    "common.geideaRegisteredBy": "تم التسجيل على جيديا بواسطة",
    "common.visibleOrders": "الطلبات الظاهرة",
    "common.cash": "كاش",
    "common.visa": "فيزا",
    "common.unpaid": "غير مدفوع",
    "common.paid": "مدفوع",
    "common.delivered": "تم التسليم",
    "common.pending": "قيد الانتظار",
    "common.open": "مفتوح",
    "common.systemRegistered": "تم التسجيل على جيديا",
    "alert.leftUnpaid": "العميل خرج من غير ما يحاسب",
    "alert.leftNeedsSystem": "العميل خرج ولسه متسجلش على جيديا",
    "business.open": "اليوم مفتوح",
    "business.closed": "اليوم مقفول",
    "business.password": "باسورد فتح وقفل اليوم",
    "business.passwordRequired": "اكتب باسورد فتح وقفل اليوم",
    "business.openDay": "فتح اليوم",
    "business.closeDay": "قفل اليوم",
    "business.confirmOpen": "تأكيد فتح يوم التشغيل؟",
    "business.confirmClose": "تأكيد قفل يوم التشغيل؟",
    "business.updateFailed": "فشل تحديث يوم التشغيل",
    "business.opened": "تم فتح يوم التشغيل",
    "business.closedToast": "تم قفل يوم التشغيل",
    "business.message.open": "يوم التشغيل مفتوح",
    "business.message.hours": "ساعات التشغيل من 7 صباحا إلى 1 صباحا",
    "business.message.manualOpen": "يوم التشغيل مفتوح يدويا",
    "business.message.manualClosed": "يوم التشغيل مقفول يدويا",
    "login.title": "BDS MOT",
    "login.username": "اسم المستخدم",
    "login.password": "كلمة المرور",
    "login.submit": "دخول",
    "login.failed": "فشل تسجيل الدخول",
    "cashier.addNewOrder": "إضافة طلب جديد",
    "cashier.currentCount": "{count} طلب حالي",
    "cashier.archivedCount": "{count} طلب مؤرشف",
    "cashier.searchOrdersPlaceholder": "بحث بالبريسلت أو التليفون أو اسم الطفل",
    "cashier.editOrder": "تعديل الطلب",
    "cashier.backToOrders": "رجوع للطلبات",
    "cashier.braceletPlaceholder": "البريسلت",
    "cashier.phonePlaceholder": "التليفون (اختياري)",
    "cashier.childCount": "{count} طفل",
    "cashier.childName": "اسم الطفل {count}",
    "cashier.cart": "السلة",
    "cashier.noItemsSelected": "لم يتم اختيار منتجات",
    "cashier.newItemsTotal": "إجمالي المنتجات الجديدة",
    "cashier.totalAfterAdd": "إجمالي الطلب بعد الإضافة",
    "cashier.addItems": "إضافة المنتجات",
    "cashier.saveChanges": "حفظ التعديل",
    "cashier.saveOrder": "حفظ الطلب",
    "cashier.clearCart": "تفريغ السلة",
    "cashier.cancel": "إلغاء",
    "cashier.editButton": "تعديل على الأوردر",
    "cashier.customerLeft": "تم الخروج",
    "cashier.customerPresent": "موجود",
    "cashier.customerEnter": "دخول",
    "cashier.editExitEmployee": "تعديل موظف الخروج",
    "cashier.managerPasswordPrompt": "اكتب باسورد المدير",
    "cashier.registerSystem": "جيديا",
    "cashier.saveFailed": "فشل حفظ الطلب",
    "cashier.updateFailed": "فشل تعديل الطلب",
    "cashier.saved": "تم حفظ الطلب {id}",
    "cashier.itemsAdded": "تم إضافة المنتجات للطلب",
    "cashier.orderUpdated": "تم تعديل الطلب",
    "cashier.orderUpdatedWithItems": "تم تعديل الطلب وإضافة المنتجات",
    "cashier.leftToast": "تم تسجيل خروج العميل",
    "cashier.presentToast": "تم رجوع العميل لموجود",
    "cashier.selectExitEmployee": "اختر موظف الـ Operation",
    "cashier.exitEmployeeRequired": "اختار موظف الـ Operation الأول",
    "cashier.archiveFailed": "فشل الأرشفة",
    "cashier.registeredToast": "تم تسجيل الطلب على جيديا",
    "kitchen.orders": "طلبات المطعم",
    "kitchen.deliveryFailed": "فشل تحديث التسليم",
    "kitchen.deliveredToast": "تم تسجيل الطلب كتم التسليم",
    "kitchen.paymentFailed": "فشل الدفع",
    "kitchen.paymentToast": "تم حفظ الدفع كـ {method}",
    "kitchen.archiveFailed": "فشل الأرشفة",
    "kitchen.archivedToast": "تم أرشفة الطلب",
    "kitchen.registeredToast": "تم تسجيل الطلب على جيديا",
    "kitchen.archiveOrder": "أرشفة",
    "kitchen.startPreparation": "بدأ التجهيز",
    "kitchen.markDelivered": "تم التسليم",
    "kitchen.payCash": "دفع كاش",
    "kitchen.payVisa": "دفع فيزا",
    "kitchen.paidCash": "مدفوع كاش",
    "kitchen.paidVisa": "مدفوع فيزا",
    "kitchen.selectPaymentEmployee": "اختر المستلم",
    "kitchen.editPaymentEmployee": "تعديل موظف الدفع",
    "kitchen.editGeideaEmployee": "تعديل موظف جيديا",
    "kitchen.selectRestaurantEmployee": "اختر موظف جيديا",
    "kitchen.noRestaurantEmployees": "لا يوجد موظفين مطعم",
    "kitchen.paymentEmployeeRequired": "اختار المستلم الأول",
    "kitchen.restaurantEmployeeRequired": "اختار موظف المطعم الأول",
    "kitchen.registerSystem": "جيديا",
    "kitchenTicket.title": "تيكت المطبخ",
    "kitchenTicket.filtered": "الوجبات والساندويتشات فقط",
    "kitchenTicket.allItems": "لم يتم العثور على قسم وجبات، تم طباعة كل الأصناف",
    "manager.totalPaidSales": "إجمالي المبيعات المدفوعة",
    "manager.orders": "الطلبات",
    "manager.leftUnpaid": "خرج ولم يدفع",
    "manager.history": "السجل",
    "manager.tabOrders": "الطلبات",
    "manager.tabReview": "مراجعة اليوم",
    "manager.tabReports": "التقارير",
    "manager.tabSettings": "الإعدادات",
    "manager.tabActivity": "النشاط",
    "manager.confirmDanger": "متأكد إنك عايز تكمل؟",
    "manager.todayOrders": "طلبات اليوم",
    "manager.autoClosed": "تم نقل {count} طلب للسجل",
    "manager.closedCount": "تم نقل {count} طلب للسجل",
    "manager.notRegisteredGeidea": "لم يتم التسجيل على جيديا",
    "manager.dayReview": "مراجعة اليوم",
    "manager.dayReviewHint": "راجع الأرقام دي قبل قفل يوم التشغيل",
    "manager.cashTotal": "إجمالي الكاش",
    "manager.visaTotal": "إجمالي الفيزا",
    "manager.exportExcel": "تصدير Excel",
    "manager.exportPdf": "تصدير PDF",
    "manager.searchPlaceholder": "بحث برقم الطلب، البريسلت، التليفون، الطفل، الداتا، اليوم",
    "manager.paymentBreakdown": "تفاصيل طرق الدفع",
    "manager.topProducts": "أكثر المنتجات مبيعا",
    "manager.statusBreakdown": "تفاصيل الحالات",
    "manager.cashierPerformance": "أداء الداتا",
    "manager.employees": "الموظفين",
    "manager.topBracelets": "أعلى بريسلت",
    "manager.dailySales": "مبيعات الأيام",
    "manager.recentActivity": "آخر العمليات",
    "manager.noActivity": "لا توجد عمليات بعد",
    "manager.noOrder": "بدون طلب",
    "manager.details": "التفاصيل",
    "manager.unarchive": "إلغاء الأرشفة",
    "manager.orderDetails": "تفاصيل الطلب",
    "manager.setCashPaid": "تسجيل دفع كاش",
    "manager.setVisaPaid": "تسجيل دفع فيزا",
    "manager.cashPaid": "مدفوع كاش",
    "manager.visaPaid": "مدفوع فيزا",
    "manager.markDelivered": "تم التسليم",
    "manager.markCustomerLeft": "تم خروج العميل",
    "manager.archive": "أرشفة",
    "manager.registerSystem": "جيديا",
    "manager.paymentUpdateFailed": "فشل تعديل الدفع",
    "manager.orderUpdateFailed": "فشل تحديث الطلب",
    "manager.paymentToast": "تم حفظ الدفع كـ {method}",
    "manager.addItem": "إضافة منتج",
    "manager.itemAdded": "تم إضافة المنتج",
    "manager.itemRemoved": "تم حذف المنتج",
    "manager.selectProductFirst": "اختار منتج الأول",
    "manager.selectReceiver": "اختر المستلم",
    "manager.selectGeideaEmployee": "اختر موظف جيديا",
    "manager.employeeManagement": "إدارة الموظفين",
    "manager.employeeManagementHint": "إضافة وتعديل وتفعيل أو تعطيل موظفين التشغيل والمطعم",
    "manager.productManagement": "إدارة المنتجات والأسعار",
    "manager.productManagementHint": "إدارة المنتجات والأسعار والأقسام والصور والتفعيل",
    "manager.productName": "اسم المنتج",
    "manager.productPrice": "السعر",
    "manager.categoryName": "القسم",
    "manager.productImage": "رابط الصورة",
    "manager.popularProduct": "الأكثر طلبا",
    "manager.regularProduct": "عادي",
    "manager.employeeSearch": "بحث في الموظفين",
    "manager.productSearch": "بحث في المنتجات",
    "manager.userSearch": "بحث في اليوزرز",
    "manager.addProduct": "إضافة منتج",
    "manager.updateProduct": "تعديل المنتج",
    "manager.productSaved": "تم حفظ المنتج",
    "manager.productSaveFailed": "فشل حفظ المنتج",
    "manager.userManagement": "إدارة صلاحيات اليوزرز",
    "manager.userManagementHint": "إدارة يوزرز الدخول والأدوار والتفعيل",
    "manager.addUser": "إضافة يوزر",
    "manager.updateUser": "تعديل اليوزر",
    "manager.userSaved": "تم حفظ اليوزر",
    "manager.userSaveFailed": "فشل حفظ اليوزر",
    "manager.passwordOptional": "كلمة مرور جديدة (اختياري)",
    "manager.employeeName": "اسم الموظف",
    "manager.addEmployee": "إضافة موظف",
    "manager.updateEmployee": "تحديث الموظف",
    "manager.employeeSaveFailed": "فشل حفظ الموظف",
    "manager.employeeSaved": "تم حفظ الموظف",
    "manager.orderUpdated": "تم تحديث الطلب",
    "audit.openedBusinessDay": "تم فتح يوم التشغيل",
    "audit.closedBusinessDay": "تم قفل يوم التشغيل",
    "audit.createdOrder": "تم إنشاء الطلب {id}",
    "audit.archivedOrder": "تم أرشفة الطلب",
    "audit.geideaRegistered": "تم تسجيل الطلب على جيديا",
    "audit.geideaAutoRegistered": "تم تسجيل الطلب تلقائيا على جيديا عند قفل اليوم",
    "audit.movedToHistory": "تم نقل الطلب إلى السجل",
    "audit.markedDelivered": "تم تسجيل الطلب كتم التسليم",
    "audit.markedPaidBy": "تم تسجيل الدفع كـ {method}",
    "audit.addedItemLines": "تم إضافة {count} سطور منتجات",
    "audit.unarchivedOrder": "تم إلغاء أرشفة الطلب",
    "audit.customerLeft": "تم تسجيل خروج العميل",
    "audit.customerReturned": "تم رجوع العميل لموجود",
    "audit.createdEmployee": "تم إنشاء الموظف {name}",
    "audit.updatedEmployee": "تم تحديث الموظف {name}",
    "invoice.title": "فاتورة BDS MOT",
    "invoice.welcome": "Welcome To",
    "invoice.company": "BillyBeez MOA",
    "invoice.tin": "الرقم الضريبي",
    "invoice.date": "التاريخ",
    "invoice.item": "الصنف",
    "invoice.rate": "السعر",
    "invoice.amount": "الإجمالي",
    "invoice.subtotal": "المجموع",
    "invoice.points": "النقاط",
    "invoice.thanks": "شكرا لصنع ذكريات سعيدة معنا!",
    "invoice.contact": "للتواصل",
  },
};

const statusKeys = {
  PAID: "common.paid",
  UNPAID: "common.unpaid",
  DELIVERED: "common.delivered",
  PENDING: "common.pending",
  OPEN: "common.open",
};

const methodKeys = {
  CASH: "common.cash",
  VISA: "common.visa",
  UNPAID: "common.unpaid",
};

const categoryKeys = {
  All: "common.all",
  Drinks: "category.drinks",
  Burgers: "category.burgers",
  Meals: "category.meals",
  Snacks: "category.snacks",
  Imported: "category.imported",
};

const departmentKeys = {
  OPERATION: "department.operation",
  RESTAURANT: "department.restaurant",
};

const roleKeys = {
  ADMIN: "role.ADMIN",
  MANAGER: "role.MANAGER",
  CASHIER: "role.CASHIER",
  KITCHEN: "role.KITCHEN",
};

const themeOrder = ["classic", "red", "blue", "orange"];

const themeLabelKeys = {
  classic: "nav.themeClassic",
  red: "nav.themeRed",
  blue: "nav.themeBlue",
  orange: "nav.themeOrange",
};

function nextThemeName(theme) {
  const currentIndex = themeOrder.indexOf(theme);
  return themeOrder[(currentIndex + 1) % themeOrder.length] || themeOrder[0];
}

dictionaries.en["category.drinks"] = "Drinks";
dictionaries.en["category.burgers"] = "Burgers";
dictionaries.en["category.meals"] = "Meals";
dictionaries.en["category.snacks"] = "Snacks";
dictionaries.en["category.imported"] = "Imported";
dictionaries.en["department.operation"] = "Operation";
dictionaries.en["department.restaurant"] = "Restaurant";
dictionaries.ar["category.drinks"] = "مشروبات";
dictionaries.ar["category.burgers"] = "برجر";
dictionaries.ar["category.meals"] = "وجبات";
dictionaries.ar["category.snacks"] = "سناكس";
dictionaries.ar["category.imported"] = "مستورد";
dictionaries.ar["department.operation"] = "التشغيل";
dictionaries.ar["department.restaurant"] = "المطعم";

const businessMessageKeys = {
  "Business day is open": "business.message.open",
  "Business hours are from 7:00 AM to 1:00 AM": "business.message.hours",
  "Business day is manually open": "business.message.manualOpen",
  "Business day is manually closed": "business.message.manualClosed",
  "Business day manually closed": "business.message.manualClosed",
};

function auditTranslation(text, t, labelMethod) {
  if (!text) return "";
  if (text === "Opened business day") return t("audit.openedBusinessDay");
  if (text === "Closed business day") return t("audit.closedBusinessDay");
  if (text === "Archived order") return t("audit.archivedOrder");
  if (text === "Registered order on Geidea") return t("audit.geideaRegistered");
  if (text === "Registered order on Geidea during day close") return t("audit.geideaAutoRegistered");
  if (text === "Moved order to history") return t("audit.movedToHistory");
  if (text === "Marked delivered") return t("audit.markedDelivered");
  if (text === "Unarchived order") return t("audit.unarchivedOrder");
  if (text === "Customer left") return t("audit.customerLeft");
  if (text === "Customer returned") return t("audit.customerReturned");

  let match = text.match(/^Created order (.+)$/);
  if (match) return t("audit.createdOrder", { id: match[1] });

  match = text.match(/^Marked paid by (.+)$/);
  if (match) return t("audit.markedPaidBy", { method: labelMethod(match[1]) });

  match = text.match(/^Added (.+) item lines$/);
  if (match) return t("audit.addedItemLines", { count: match[1] });

  match = text.match(/^Created employee (.+)$/);
  if (match) return t("audit.createdEmployee", { name: match[1] });

  match = text.match(/^Updated employee (.+)$/);
  if (match) return t("audit.updatedEmployee", { name: match[1] });

  return text;
}

const UiContext = createContext(null);

function readInitialValue(key, fallback) {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) || fallback;
}

function interpolate(text, values) {
  return Object.entries(values || {}).reduce(
    (current, [key, value]) => current.replaceAll(`{${key}}`, String(value)),
    text,
  );
}

function formatDateTimeValue(value, language) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "-";

  const parts = new Intl.DateTimeFormat("en-US-u-nu-latn", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).formatToParts(date).reduce((current, part) => {
    current[part.type] = part.value;
    return current;
  }, {});

  const period = parts.dayPeriod;

  if (language === "ar") {
    return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${period}`;
  }

  return `${parts.month}/${parts.day}/${parts.year}, ${parts.hour}:${parts.minute}:${parts.second} ${period}`;
}

function formatNumberValue(value, options = {}) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";

  return new Intl.NumberFormat("en-US-u-nu-latn", {
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 2,
  }).format(number);
}

export function UiPreferencesProvider({ children }) {
  const [language, setLanguage] = useState("ar");
  const [theme, setTheme] = useState("classic");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setLanguage(readInitialValue("bbLanguage", "ar"));
    setTheme(readInitialValue("bbTheme", "classic"));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const dir = language === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("bbLanguage", language);
    window.localStorage.setItem("bbTheme", theme);
  }, [language, theme, hydrated]);

  const value = useMemo(() => {
    const t = (key, values) => interpolate(dictionaries[language]?.[key] || dictionaries.en[key] || key, values);
    const labelStatus = (status) => t(statusKeys[status] || status);
    const labelMethod = (method) => t(methodKeys[method] || method);
    const labelOrderStage = (order) => {
      if (order?.geideaRegisteredAt) return t("common.closed");
      if (order?.paymentStatus === "PAID") return `${t("common.paid")} ${labelMethod(order.paymentMethod)}`;
      if (order?.kitchenStatus === "DELIVERED") return t("common.delivered");
      return t("common.inProgress");
    };
    const labelCategory = (category) => t(categoryKeys[category] || category);
    const labelDepartment = (department) => t(departmentKeys[department] || department);
    const labelRole = (role) => t(roleKeys[role] || role);
    const labelTheme = (themeName) => t(themeLabelKeys[themeName] || themeLabelKeys.classic);
    const labelBusinessMessage = (message) => t(businessMessageKeys[message] || message || "common.loading");
    const labelAudit = (text) => auditTranslation(text, t, labelMethod);
    const formatNumber = (amount, options) => formatNumberValue(amount, options);
    const currency = (amount) => `${formatNumber(amount)} ${t("common.egp")}`;
    const formatDateTime = (value) => formatDateTimeValue(value, language);

    return {
      language,
      theme,
      isArabic: language === "ar",
      t,
      formatNumber,
      currency,
      labelStatus,
      labelOrderStage,
      labelMethod,
      labelCategory,
      labelDepartment,
      labelRole,
      labelTheme,
      labelBusinessMessage,
      labelAudit,
      formatDateTime,
      toggleLanguage: () => setLanguage((current) => (current === "ar" ? "en" : "ar")),
      toggleTheme: () => setTheme((current) => nextThemeName(current)),
    };
  }, [language, theme]);

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useI18n() {
  const context = useContext(UiContext);
  if (!context) throw new Error("useI18n must be used inside UiPreferencesProvider");
  return context;
}
