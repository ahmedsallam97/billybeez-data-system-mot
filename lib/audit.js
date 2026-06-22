const { prisma } = require("./db");

async function writeAudit({ action, orderId, user, summary, metadata }) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        orderId: orderId || null,
        userId: user?.id || null,
        summary: summary || null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      },
    });
  } catch (error) {
    console.error("Audit log failed", error);
  }
}

module.exports = { writeAudit };
