const { prisma } = require("./db");

async function writeAudit({ action, orderId, user, summary, metadata, before, after, reason }) {
  try {
    const auditMetadata = {
      ...(metadata || {}),
      ...(reason ? { reason } : {}),
      ...(before ? { before } : {}),
      ...(after ? { after } : {}),
    };

    await prisma.auditLog.create({
      data: {
        action,
        orderId: orderId || null,
        orderReference: orderId || null,
        userId: user?.id || null,
        summary: summary || null,
        metadata: Object.keys(auditMetadata).length ? JSON.stringify(auditMetadata) : null,
      },
    });
  } catch (error) {
    console.error("Audit log failed", error);
  }
}

module.exports = { writeAudit };
