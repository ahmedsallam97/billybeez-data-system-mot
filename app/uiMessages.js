"use client";

export const defaultUiMessages = {
  kitchenTicketQueued: {
    label: "Kitchen ticket queue message",
    text: "تيكت المطبخ موجود بالفعل في صف الطباعة",
    backgroundColor: "#005eb8",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  printJobPending: {
    label: "Preparation status message",
    text: "جاري تجهيز الأوردر",
    backgroundColor: "#e8f1ff",
    textColor: "#005eb8",
    borderColor: "#9dc3ef",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 34,
    radius: 8,
  },
  geideaRegistered: {
    label: "Geidea registered alert",
    text: "تم التسجيل على جيديا بواسطة\n{employee} · {time}",
    backgroundColor: "#e8f8ff",
    textColor: "#005eb8",
    borderColor: "#b8d7f7",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 41,
    radius: 8,
  },
  paymentSaved: {
    label: "Payment saved toast",
    text: "تم حفظ الدفع كـ {method}",
    backgroundColor: "#32124c",
    textColor: "#ffffff",
    borderColor: "#e31937",
    fontSize: 16,
    fontWeight: 900,
    minHeight: 48,
    radius: 8,
  },
  leftUnpaid: {
    label: "Customer left unpaid alert",
    text: "العميل خرج من غير ما يحاسب",
    backgroundColor: "#fde5eb",
    textColor: "#8f061f",
    borderColor: "#f3a2b2",
    fontSize: 14,
    fontWeight: 900,
    minHeight: 41,
    radius: 8,
  },
  leftNeedsGeidea: {
    label: "Customer left without Geidea alert",
    text: "العميل خرج ولسه متسجلش على جيديا",
    backgroundColor: "#ffe2c2",
    textColor: "#8f3400",
    borderColor: "#e66b00",
    fontSize: 14,
    fontWeight: 900,
    minHeight: 41,
    radius: 8,
  },
  exitEmployee: {
    label: "Exit employee alert",
    text: "موظف تسجيل الخروج\n{employee}",
    backgroundColor: "#fff3e8",
    textColor: "#c55100",
    borderColor: "#ffd2ad",
    fontSize: 13,
    fontWeight: 900,
    minHeight: 41,
    radius: 8,
  },
  archivedAt: {
    label: "Archived alert",
    text: "وقت الأرشفة: {time}",
    backgroundColor: "#eef6ff",
    textColor: "#005eb8",
    borderColor: "#b8d7f7",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 32,
    radius: 8,
  },
  closedAt: {
    label: "Closed alert",
    text: "مغلق: {time}",
    backgroundColor: "#eef6ff",
    textColor: "#005eb8",
    borderColor: "#b8d7f7",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 32,
    radius: 8,
  },
  printJobPrinted: {
    label: "Kitchen ticket printed alert",
    text: "تم طباعة تيكت المطبخ",
    backgroundColor: "#e8f8e5",
    textColor: "#197b1f",
    borderColor: "#a4d99d",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 34,
    radius: 8,
  },
  printJobFailed: {
    label: "Kitchen ticket failed alert",
    text: "فشل طباعة تيكت المطبخ",
    backgroundColor: "#fde5eb",
    textColor: "#8f061f",
    borderColor: "#f3a2b2",
    fontSize: 12,
    fontWeight: 900,
    minHeight: 34,
    radius: 8,
  },
};

export const uiMessageKeys = Object.keys(defaultUiMessages);

export function normalizeUiMessages(value) {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      parsed = {};
    }
  }

  return uiMessageKeys.reduce((messages, key) => {
    messages[key] = { ...defaultUiMessages[key], ...(parsed?.[key] || {}) };
    return messages;
  }, {});
}

export function uiMessageStyle(message) {
  if (!message) return {};
  return {
    backgroundColor: message.backgroundColor,
    color: message.textColor,
    borderColor: message.borderColor,
    borderLeftColor: message.borderColor,
    borderInlineStartColor: message.borderColor,
    borderInlineEndColor: message.borderColor,
    borderRadius: `${Number(message.radius) || 8}px`,
    fontSize: `${Number(message.fontSize) || 12}px`,
    fontWeight: Number(message.fontWeight) || 900,
    minHeight: `${Number(message.minHeight) || 34}px`,
  };
}

export function formatUiMessage(message, values = {}) {
  return String(message?.text || "").replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}
