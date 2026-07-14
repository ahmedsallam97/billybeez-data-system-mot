"use client";

import { formatUiMessage, uiMessageStyle } from "./uiMessages";
import { formatCairoDateLabel, formatCairoShortTime } from "./dateTime";

function ActionAlert({ tone, title, name, value, detail }) {
  return (
    <div className={`order-action-alert order-action-alert-${tone}`}>
      <span className="order-action-alert-title">{title}</span>
      <b className="order-action-alert-time">{formatCairoShortTime(value)}</b>
      <b className="order-action-alert-person">{detail || name || "-"}</b>
    </div>
  );
}

export default function OrderAlerts({ order, uiMessages, exitEmployeeName, labelMethod, actionLabels = {}, showArchive = true, showClosed = false }) {
  const exitName = typeof exitEmployeeName === "function" ? exitEmployeeName(order) : order.exitEmployee;
  const paymentName = order.paymentEmployee || "";
  const deliveryName = order.deliveryEmployee || "";
  const geideaName = order.geideaEmployee || "";
  const methodLabel = labelMethod ? labelMethod(order.paymentMethod) : order.paymentMethod;
  const paymentTone = order.paymentMethod === "VISA" ? "visa" : order.paymentMethod === "WAFFARHA" ? "waffarha" : "cash";
  const leftUnpaid = order.customerLeft && order.paymentStatus !== "PAID";
  const leftNeedsGeidea = order.customerLeft && order.paymentStatus === "PAID" && !order.geideaRegisteredAt;
  const suppressActionAlert = !showArchive && (leftUnpaid || leftNeedsGeidea);

  return (
    <>
      {leftUnpaid && (
        <div className="warning" style={uiMessageStyle(uiMessages.leftUnpaid)}>
          {formatUiMessage(uiMessages.leftUnpaid)}
        </div>
      )}
      {leftNeedsGeidea && (
        <div className="warning warning-orange" style={uiMessageStyle(uiMessages.leftNeedsGeidea)}>
          {formatUiMessage(uiMessages.leftNeedsGeidea)}
        </div>
      )}
      {!suppressActionAlert && order.geideaRegisteredAt && (
        <ActionAlert tone="geidea" title={actionLabels.geidea || "السيستم"} name={geideaName} value={order.geideaRegisteredAt} />
      )}
      {!suppressActionAlert && !order.geideaRegisteredAt && order.paymentStatus === "PAID" && (
        <ActionAlert tone={paymentTone} title={methodLabel} name={paymentName} value={order.paidAt || order.updatedAt} />
      )}
      {!suppressActionAlert && !order.geideaRegisteredAt && order.paymentStatus !== "PAID" && order.kitchenStatus === "DELIVERED" && (
        <ActionAlert tone="delivered" title={actionLabels.delivered || "تم التسليم"} name={deliveryName} value={order.deliveredAt || order.updatedAt} />
      )}
      {showArchive && order.customerLeft && (
        <ActionAlert
          tone="exit"
          title={actionLabels.exit || "خروج"}
          name={exitName}
          value={order.customerLeftAt || order.updatedAt}
        />
      )}
      {showArchive && order.archivedAt && (
        <ActionAlert
          tone="archive"
          title={actionLabels.archive || "أرشفة"}
          detail={formatCairoDateLabel(order.archivedAt)}
          value={order.archivedAt}
        />
      )}
      {showClosed && order.closedAt && (
        <ActionAlert
          tone="closed"
          title={actionLabels.closed || "قفل"}
          detail={formatCairoDateLabel(order.closedAt)}
          value={order.closedAt}
        />
      )}
    </>
  );
}
