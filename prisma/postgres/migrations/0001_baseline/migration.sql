-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'CASHIER', 'KITCHEN', 'DATA');

-- CreateEnum
CREATE TYPE "Department" AS ENUM ('OPERATION', 'CASHIER', 'KITCHEN');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('OPEN', 'DELIVERED', 'PAID', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowState" AS ENUM ('OPEN', 'PREPARING', 'DELIVERED', 'PAID', 'GEIDEA_REGISTERED', 'CUSTOMER_LEFT', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "KitchenStatus" AS ENUM ('PENDING', 'DELIVERED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VISA', 'KIDZAPP', 'WAFFARHA', 'E_INVOICE', 'CUSTOM_1', 'CUSTOM_2');

-- CreateEnum
CREATE TYPE "ProductDepartment" AS ENUM ('ENTRANCE', 'KITCHEN', 'KITCHEN_CASHIER');

-- CreateEnum
CREATE TYPE "DeviceType" AS ENUM ('FRONT', 'KITCHEN', 'KITCHEN_CASHIER');

-- CreateEnum
CREATE TYPE "PaymentProviderType" AS ENUM ('CASH', 'VISA', 'CUSTOM');

-- CreateEnum
CREATE TYPE "PrintJobType" AS ENUM ('KITCHEN', 'INVOICE');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PRINTED', 'FAILED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('HRIS', 'PART_TIME', 'OTHER');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXITED');

-- CreateEnum
CREATE TYPE "OpsScheduleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "OpsAttendanceDayStatus" AS ENUM ('OPEN', 'FINALIZED', 'REOPENED');

-- CreateEnum
CREATE TYPE "OpsAttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'MISSING', 'EARLY_LEAVE', 'LEAVE', 'REPLACEMENT_LEAVE', 'SICK_LEAVE', 'HOLIDAY', 'OFF', 'UNEXPECTED_PRESENT');

-- CreateEnum
CREATE TYPE "OpsAttendanceSource" AS ENUM ('SYSTEM', 'MANUAL', 'IMPORT', 'DEVICE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "OpsLeaveTransactionStatus" AS ENUM ('VALID', 'REVERSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpsLeaveBookingStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "OpsDayStatus" AS ENUM ('OPEN', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "OpsRotationStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OpsAssignmentSource" AS ENUM ('AUTO', 'MANUAL');

-- CreateEnum
CREATE TYPE "OpsEvaluationDayStatus" AS ENUM ('OPEN', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "OpsEmployeeEvaluationStatus" AS ENUM ('DEFAULT_FULL', 'DEFAULT_ZERO', 'REVIEWED', 'EXCEPTION', 'MODIFIED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OpsAppraisalStatus" AS ENUM ('DRAFT', 'REVIEWED', 'APPROVED', 'REOPENED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "OpsMonthCloseStatus" AS ENUM ('OPEN', 'READY', 'CLOSED', 'REOPENED');

-- CreateEnum
CREATE TYPE "OpsCompetitionStatus" AS ENUM ('DRAFT', 'CALCULATED', 'UNDER_REVIEW', 'WINNER_APPROVED', 'LOCKED', 'REOPENED');

-- CreateEnum
CREATE TYPE "OpsSuccessionReadiness" AS ENUM ('NOT_ASSESSED', 'DEVELOPING', 'READY_SOON', 'READY_NOW', 'ON_HOLD', 'PROMOTED', 'COMPLETED', 'CLOSED');

-- CreateEnum
CREATE TYPE "OpsDevelopmentStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'NOT_REQUIRED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "employeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT,
    "nameEn" TEXT,
    "operationalName" TEXT,
    "gender" TEXT,
    "operationsTeamLeader" BOOLEAN NOT NULL DEFAULT false,
    "sourceEmployeeId" TEXT,
    "hrisNumber" TEXT,
    "localEmployeeCode" TEXT,
    "nationalId" TEXT,
    "jobTitle" TEXT,
    "employmentType" "EmploymentType" NOT NULL DEFAULT 'OTHER',
    "employmentStatus" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "hireDate" TIMESTAMP(3),
    "joinDate" TIMESTAMP(3),
    "department" "Department" NOT NULL DEFAULT 'OPERATION',
    "branch" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "phone" TEXT,
    "address" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "emergencyRelation" TEXT,
    "personalNotes" TEXT,
    "supervisorId" TEXT,
    "photoDocumentId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeDocument" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "classification" TEXT NOT NULL DEFAULT 'INTERNAL',
    "notes" TEXT,
    "uploadedBy" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "replacedById" TEXT,

    CONSTRAINT "EmployeeDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeEmploymentEvent" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmployeeEmploymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeTrainingRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "completedDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "provider" TEXT,
    "certificateId" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeTrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeQualification" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "operationalPositionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_QUALIFIED',
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeQualification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeGuestFeedback" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "feedbackDate" TIMESTAMP(3) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'GUEST',
    "guestName" TEXT,
    "guestPhone" TEXT,
    "rating" INTEGER,
    "category" TEXT,
    "comment" TEXT NOT NULL,
    "followUp" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeGuestFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeGuidanceRecord" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "recordDate" TIMESTAMP(3) NOT NULL,
    "recordType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "points" DOUBLE PRECISION,
    "actionTaken" TEXT,
    "followUpDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeGuidanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeIncident" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "incidentDate" TIMESTAMP(3) NOT NULL,
    "incidentType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "location" TEXT,
    "peopleInvolved" TEXT,
    "immediateAction" TEXT,
    "followUpAction" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeIncident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" "ProductDepartment" NOT NULL DEFAULT 'KITCHEN',
    "color" TEXT,
    "availabilityRules" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "showInDataOrder" BOOLEAN NOT NULL DEFAULT true,
    "showInQuickOrder" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "originalPrice" DOUBLE PRECISION,
    "netSales" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION,
    "taxRate" DOUBLE PRECISION,
    "department" "ProductDepartment" NOT NULL DEFAULT 'KITCHEN',
    "etaItemCode" TEXT,
    "etaCodeType" TEXT,
    "etaUnitType" TEXT,
    "etaTaxType" TEXT,
    "etaTaxSubType" TEXT,
    "imageUrl" TEXT,
    "iconText" TEXT,
    "cardColorStart" TEXT,
    "cardColorEnd" TEXT,
    "cardTextColor" TEXT,
    "cardAccentColor" TEXT,
    "availabilityRules" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "popular" BOOLEAN NOT NULL DEFAULT false,
    "printOnKitchen" BOOLEAN NOT NULL DEFAULT true,
    "showInDataOrder" BOOLEAN NOT NULL DEFAULT true,
    "showInQuickOrder" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "businessDate" TEXT,
    "invoiceSerial" TEXT,
    "deviceId" TEXT,
    "customerId" TEXT,
    "customerName" TEXT,
    "braceletNo" TEXT NOT NULL,
    "customerPhone" TEXT,
    "childNames" TEXT NOT NULL,
    "childrenCount" INTEGER NOT NULL DEFAULT 1,
    "allowOpenCharges" BOOLEAN NOT NULL DEFAULT false,
    "comments" TEXT,
    "total" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "OrderStatus" NOT NULL DEFAULT 'OPEN',
    "workflowState" "WorkflowState" NOT NULL DEFAULT 'OPEN',
    "kitchenStatus" "KitchenStatus" NOT NULL DEFAULT 'PENDING',
    "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "paymentProviderId" TEXT,
    "customerLeft" BOOLEAN NOT NULL DEFAULT false,
    "customerLeftAt" TIMESTAMP(3),
    "geideaRegisteredAt" TIMESTAMP(3),
    "etaUuid" TEXT,
    "etaSubmissionId" TEXT,
    "etaStatus" TEXT,
    "etaQrCode" TEXT,
    "internalQrPayload" TEXT,
    "archivedAt" TIMESTAMP(3),
    "cashierId" TEXT,
    "dataEmployeeId" TEXT,
    "deliveryEmployeeId" TEXT,
    "geideaEmployeeId" TEXT,
    "paymentEmployeeId" TEXT,
    "exitEmployeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActiveBraceletLock" (
    "braceletNo" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActiveBraceletLock_pkey" PRIMARY KEY ("braceletNo")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "price" DOUBLE PRECISION NOT NULL,
    "netSales" DOUBLE PRECISION,
    "taxAmount" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "comments" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cardSerial" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "entrancePoints" INTEGER NOT NULL DEFAULT 0,
    "restaurantPoints" INTEGER NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyReward" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "walletType" TEXT NOT NULL,
    "rewardType" TEXT NOT NULL,
    "pointsCost" INTEGER NOT NULL,
    "discountPercent" DOUBLE PRECISION,
    "discountAmount" DOUBLE PRECISION,
    "productId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "availabilityRules" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "walletType" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceBefore" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "orderId" TEXT,
    "rewardId" TEXT,
    "actorUserId" TEXT,
    "actorName" TEXT,
    "reason" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyRedemption" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "rewardId" TEXT,
    "orderId" TEXT,
    "walletType" TEXT NOT NULL,
    "pointsUsed" INTEGER NOT NULL,
    "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Child" (
    "id" TEXT NOT NULL,
    "customerId" TEXT,
    "orderId" TEXT,
    "name" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3),
    "comments" TEXT,
    "allowOpenCharges" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Child_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "deviceNo" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DeviceType" NOT NULL DEFAULT 'FRONT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "invoicePrinterName" TEXT,
    "kitchenPrinterName" TEXT,
    "posSerial" TEXT,
    "branchCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PaymentProviderType" NOT NULL DEFAULT 'CUSTOM',
    "method" "PaymentMethod" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "editable" BOOLEAN NOT NULL DEFAULT true,
    "showInFrontOrder" BOOLEAN NOT NULL DEFAULT true,
    "showInDataOrder" BOOLEAN NOT NULL DEFAULT true,
    "showInQuickOrder" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 100,
    "reportBucket" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderPayment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "paymentProviderId" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderTransactionRecord" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "businessDate" TEXT,
    "braceletNo" TEXT NOT NULL,
    "childNames" TEXT,
    "orderTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "orderCreatedAt" TIMESTAMP(3),
    "orderCreatedByUserId" TEXT,
    "orderCreatedByUserName" TEXT,
    "orderCreatedByEmployeeId" TEXT,
    "orderCreatedByEmployeeName" TEXT,
    "preparationStartedAt" TIMESTAMP(3),
    "preparationStartedByUserId" TEXT,
    "preparationStartedByUserName" TEXT,
    "preparationStartedByEmployeeId" TEXT,
    "preparationStartedByEmployeeName" TEXT,
    "deliveredAt" TIMESTAMP(3),
    "deliveredByUserId" TEXT,
    "deliveredByUserName" TEXT,
    "deliveredByEmployeeId" TEXT,
    "deliveredByEmployeeName" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT,
    "paidByUserId" TEXT,
    "paidByUserName" TEXT,
    "paidByEmployeeId" TEXT,
    "paidByEmployeeName" TEXT,
    "geideaRegisteredAt" TIMESTAMP(3),
    "geideaByUserId" TEXT,
    "geideaByUserName" TEXT,
    "geideaByEmployeeId" TEXT,
    "geideaByEmployeeName" TEXT,
    "customerLeftAt" TIMESTAMP(3),
    "customerLeftByUserId" TEXT,
    "customerLeftByUserName" TEXT,
    "customerLeftByEmployeeId" TEXT,
    "customerLeftByEmployeeName" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderTransactionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "orderReference" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintJob" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" "PrintJobType" NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "ticketNumber" INTEGER,
    "printerName" TEXT,
    "payload" TEXT NOT NULL,
    "error" TEXT,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrintJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessDay" (
    "id" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "closedOrderCount" INTEGER NOT NULL DEFAULT 0,
    "closedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "DailyClosingSnapshot" (
    "id" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "ordersCount" INTEGER NOT NULL DEFAULT 0,
    "paidOrdersCount" INTEGER NOT NULL DEFAULT 0,
    "unpaidOrdersCount" INTEGER NOT NULL DEFAULT 0,
    "cashTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "visaTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unpaidTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notRegisteredGeidea" INTEGER NOT NULL DEFAULT 0,
    "leftUnpaid" INTEGER NOT NULL DEFAULT 0,
    "archivedOrdersCount" INTEGER NOT NULL DEFAULT 0,
    "topProductsJson" TEXT NOT NULL DEFAULT '[]',
    "paymentBreakdownJson" TEXT NOT NULL DEFAULT '[]',
    "statusBreakdownJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyClosingSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterSequence" (
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounterSequence_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "OrderHistory" (
    "id" TEXT NOT NULL,
    "originalOrderId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "braceletNo" TEXT NOT NULL,
    "customerPhone" TEXT,
    "childNames" TEXT NOT NULL,
    "childrenCount" INTEGER NOT NULL,
    "allowOpenCharges" BOOLEAN NOT NULL DEFAULT false,
    "total" DOUBLE PRECISION NOT NULL,
    "status" TEXT NOT NULL,
    "kitchenStatus" TEXT NOT NULL,
    "paymentStatus" TEXT NOT NULL,
    "paymentMethod" TEXT NOT NULL,
    "customerLeft" BOOLEAN NOT NULL,
    "customerLeftAt" TIMESTAMP(3),
    "cashierName" TEXT,
    "dataEmployeeName" TEXT,
    "deliveryEmployeeName" TEXT,
    "geideaEmployeeName" TEXT,
    "paymentEmployeeName" TEXT,
    "exitEmployeeName" TEXT,
    "geideaRegisteredAt" TIMESTAMP(3),
    "itemsJson" TEXT NOT NULL,
    "orderCreatedAt" TIMESTAMP(3) NOT NULL,
    "orderUpdatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentPeriod" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "exitReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmploymentAssignment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeId" TEXT NOT NULL,
    "employmentPeriodId" TEXT NOT NULL,
    "positionName" TEXT NOT NULL,
    "jobCode" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "changeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmploymentAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyOffPattern" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WeeklyOffPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsSchedule" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "operationalYear" INTEGER NOT NULL,
    "operationalMonth" INTEGER NOT NULL,
    "periodStart" TEXT NOT NULL,
    "periodEnd" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "OpsScheduleStatus" NOT NULL DEFAULT 'DRAFT',
    "basedOnScheduleId" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsScheduleCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "category" TEXT NOT NULL,
    "colorKey" TEXT NOT NULL,
    "countsAsWorking" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpsScheduleCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsShiftDefinition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "colorKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpsShiftDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsScheduleAssignment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "scheduleId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "workDate" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "shiftCode" TEXT,
    "source" TEXT NOT NULL,
    "importRawValue" TEXT,
    "importMetadata" TEXT,
    "manualLock" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsScheduleAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsScheduleValidationRun" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "scheduleId" TEXT NOT NULL,
    "criticalCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "infoCount" INTEGER NOT NULL DEFAULT 0,
    "issuesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsScheduleValidationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAttendanceDay" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "workDate" TEXT NOT NULL,
    "status" "OpsAttendanceDayStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "finalizedAt" TIMESTAMP(3),
    "finalizedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsAttendanceDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAttendanceRecord" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "attendanceDayId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "scheduleAssignmentId" TEXT,
    "expectedCode" TEXT NOT NULL,
    "expectedStart" TEXT,
    "expectedEnd" TEXT,
    "actualIn" TEXT,
    "actualOut" TEXT,
    "status" "OpsAttendanceStatus" NOT NULL DEFAULT 'MISSING',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0,
    "source" "OpsAttendanceSource" NOT NULL DEFAULT 'SYSTEM',
    "note" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsAttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAttendanceCorrection" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "attendanceRecordId" TEXT NOT NULL,
    "oldSnapshotJson" TEXT NOT NULL,
    "newSnapshotJson" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsAttendanceCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsLeaveAccount" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeId" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "leaveYear" INTEGER NOT NULL,
    "entitlement" DOUBLE PRECISION,
    "policyVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsLeaveAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsLeaveTransaction" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "leaveAccountId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceReferenceId" TEXT,
    "note" TEXT,
    "reversesTransactionId" TEXT,
    "status" "OpsLeaveTransactionStatus" NOT NULL DEFAULT 'VALID',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsLeaveTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsLeaveBooking" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "status" "OpsLeaveBookingStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedDays" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsLeaveBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsLeaveBookingAllocation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "leaveBookingId" TEXT NOT NULL,
    "leaveDate" TEXT NOT NULL,
    "leaveType" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "leaveTransactionId" TEXT,

    CONSTRAINT "OpsLeaveBookingAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsOfficialHolidayPeriod" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "name" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsOfficialHolidayPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsOvertimeAccount" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsOvertimeAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsOvertimeTransaction" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "overtimeAccountId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "transactionDate" TEXT NOT NULL,
    "minutes" INTEGER NOT NULL,
    "transactionType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "relatedAttendanceId" TEXT,
    "reversalOfTransactionId" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsOvertimeTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsOperationsDay" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "workDate" TEXT NOT NULL,
    "status" "OpsDayStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "readinessScore" INTEGER NOT NULL DEFAULT 0,
    "readinessSnapshotJson" TEXT,
    "teamNote" TEXT,
    "handoverNote" TEXT,
    "handoverAcknowledgedBy" TEXT,
    "handoverAcknowledgedAt" TIMESTAMP(3),
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,

    CONSTRAINT "OpsOperationsDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsOperationalPosition" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "requiresQualification" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpsOperationalPosition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsPositionStaffingRequirement" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "operationalPositionId" TEXT NOT NULL,
    "shiftCode" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "minEmployees" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,

    CONSTRAINT "OpsPositionStaffingRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsRotationPlan" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "operationsDayId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OpsRotationStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedBy" TEXT,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "generationSnapshotJson" TEXT,

    CONSTRAINT "OpsRotationPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsRotationAssignment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "rotationPlanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "operationalPositionId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "source" "OpsAssignmentSource" NOT NULL DEFAULT 'AUTO',
    "manualLock" BOOLEAN NOT NULL DEFAULT false,
    "overrideReason" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsRotationAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsBreakAssignment" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "rotationPlanId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsBreakAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsDailyTrip" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "workDate" TEXT NOT NULL,
    "tripPartnerId" TEXT,
    "name" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "expectedChildren" INTEGER,
    "supervisors" TEXT,
    "supervisorName" TEXT,
    "supervisorPhone" TEXT,
    "mealType" TEXT,
    "mealIncluded" BOOLEAN,
    "chickenNuggets" INTEGER NOT NULL DEFAULT 0,
    "beefBurgers" INTEGER NOT NULL DEFAULT 0,
    "chickenBurgers" INTEGER NOT NULL DEFAULT 0,
    "mealCountsJson" TEXT NOT NULL DEFAULT '{}',
    "braceletType" TEXT,
    "braceletColor" TEXT,
    "braceletMaterial" TEXT,
    "staffingRequired" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsDailyTrip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsDailyEvent" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "workDate" TEXT NOT NULL,
    "birthdayCustomerId" TEXT,
    "name" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "eventType" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "childName" TEXT,
    "mealType" TEXT,
    "chickenNuggets" INTEGER NOT NULL DEFAULT 0,
    "beefBurgers" INTEGER NOT NULL DEFAULT 0,
    "chickenBurgers" INTEGER NOT NULL DEFAULT 0,
    "mealCountsJson" TEXT NOT NULL DEFAULT '{}',
    "partyRoomHours" DOUBLE PRECISION,
    "expectedGuests" INTEGER,
    "braceletType" TEXT,
    "braceletColor" TEXT,
    "braceletMaterial" TEXT,
    "location" TEXT,
    "staffingRequired" INTEGER,
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsDailyEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsDailyOffer" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "title" TEXT NOT NULL,
    "details" TEXT,
    "priceBefore" DOUBLE PRECISION,
    "priceAfter" DOUBLE PRECISION,
    "discountPercent" DOUBLE PRECISION,
    "childrenCount" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "permanent" BOOLEAN NOT NULL DEFAULT false,
    "weekdaysJson" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsDailyOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsTripPartner" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "name" TEXT NOT NULL,
    "supervisorName" TEXT,
    "supervisorPhone" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsTripPartner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsBirthdayCustomer" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "customerName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "childName" TEXT,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsBirthdayCustomer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsOperationalNotice" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'INFO',
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "startTime" TEXT,
    "endTime" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsOperationalNotice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsWristbandStock" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'MOT',
    "workDate" TEXT NOT NULL,
    "wristbandType" TEXT NOT NULL,
    "stockCategory" TEXT NOT NULL DEFAULT 'BRACELET',
    "unit" TEXT NOT NULL DEFAULT 'ITEM',
    "color" TEXT,
    "colorName" TEXT,
    "usageType" TEXT,
    "material" TEXT,
    "size" TEXT,
    "rollStyle" TEXT,
    "cashierQuantity" INTEGER NOT NULL DEFAULT 0,
    "warehouseQuantity" INTEGER NOT NULL DEFAULT 0,
    "availableStock" INTEGER NOT NULL,
    "allocated" INTEGER NOT NULL DEFAULT 0,
    "issued" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsWristbandStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEvaluationCriteriaVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsEvaluationCriteriaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEvaluationCriterion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "criteriaVersionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "category" TEXT NOT NULL,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpsEvaluationCriterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEvaluationDeductionReason" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "criterionId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "labelAr" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OpsEvaluationDeductionReason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsDailyEvaluationDay" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "evaluationDate" TEXT NOT NULL,
    "criteriaVersionId" TEXT NOT NULL,
    "status" "OpsEvaluationDayStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "teamNote" TEXT,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsDailyEvaluationDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEmployeeDailyEvaluation" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "dailyEvaluationDayId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "attendanceRecordId" TEXT,
    "maxScore" DOUBLE PRECISION NOT NULL,
    "finalScore" DOUBLE PRECISION NOT NULL,
    "status" "OpsEmployeeEvaluationStatus" NOT NULL DEFAULT 'DEFAULT_FULL',
    "supervisorNote" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsEmployeeDailyEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEvaluationException" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeDailyEvaluationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "reasonId" TEXT,
    "deduction" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsEvaluationException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsAppraisalFormulaVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "configJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsAppraisalFormulaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsMonthlyAppraisal" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "formulaVersionId" TEXT NOT NULL,
    "status" "OpsAppraisalStatus" NOT NULL DEFAULT 'DRAFT',
    "totalScore" DOUBLE PRECISION NOT NULL,
    "componentSnapshotJson" TEXT NOT NULL,
    "sourceSnapshotJson" TEXT NOT NULL,
    "calculationExplanationJson" TEXT NOT NULL,
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsMonthlyAppraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsMonthClose" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OpsMonthCloseStatus" NOT NULL DEFAULT 'OPEN',
    "readinessSnapshotJson" TEXT NOT NULL,
    "closedBy" TEXT,
    "closedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsMonthClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEotmFormulaVersion" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "effectiveTo" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "configJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsEotmFormulaVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEotmCompetition" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "OpsCompetitionStatus" NOT NULL DEFAULT 'DRAFT',
    "formulaVersionId" TEXT NOT NULL,
    "winnerEmployeeId" TEXT,
    "approvedBy" TEXT,
    "approvedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "lockedAt" TIMESTAMP(3),
    "reopenedBy" TEXT,
    "reopenedAt" TIMESTAMP(3),
    "reopenReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsEotmCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsEotmCandidate" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "competitionId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL DEFAULT true,
    "eligibilityReason" TEXT,
    "finalScore" DOUBLE PRECISION,
    "rank" INTEGER,
    "componentSnapshotJson" TEXT NOT NULL,
    "sourceSnapshotJson" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsEotmCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsSuccessionCandidate" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "employeeId" TEXT NOT NULL,
    "currentRole" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "readinessStatus" "OpsSuccessionReadiness" NOT NULL DEFAULT 'NOT_ASSESSED',
    "readinessReviewDate" TIMESTAMP(3),
    "targetReadinessDate" TEXT,
    "managementNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsSuccessionCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsSuccessionDevelopmentAction" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "candidateId" TEXT NOT NULL,
    "competency" TEXT NOT NULL,
    "note" TEXT,
    "status" "OpsDevelopmentStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "targetDate" TEXT,
    "completionDate" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpsSuccessionDevelopmentAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpsSuccessionReview" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "candidateId" TEXT NOT NULL,
    "previousReadiness" "OpsSuccessionReadiness" NOT NULL,
    "newReadiness" "OpsSuccessionReadiness" NOT NULL,
    "reviewDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "reviewedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpsSuccessionReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_employeeId_idx" ON "User"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_name_key" ON "Employee"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_sourceEmployeeId_key" ON "Employee"("sourceEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_hrisNumber_key" ON "Employee"("hrisNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_localEmployeeCode_key" ON "Employee"("localEmployeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_nationalId_key" ON "Employee"("nationalId");

-- CreateIndex
CREATE INDEX "Employee_employmentType_employmentStatus_idx" ON "Employee"("employmentType", "employmentStatus");

-- CreateIndex
CREATE INDEX "Employee_jobTitle_idx" ON "Employee"("jobTitle");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeDocument_storageKey_key" ON "EmployeeDocument"("storageKey");

-- CreateIndex
CREATE INDEX "EmployeeDocument_employeeId_documentType_idx" ON "EmployeeDocument"("employeeId", "documentType");

-- CreateIndex
CREATE INDEX "EmployeeDocument_expiryDate_idx" ON "EmployeeDocument"("expiryDate");

-- CreateIndex
CREATE INDEX "EmployeeEmploymentEvent_employeeId_effectiveDate_idx" ON "EmployeeEmploymentEvent"("employeeId", "effectiveDate");

-- CreateIndex
CREATE INDEX "EmployeeTrainingRecord_employeeId_completedDate_idx" ON "EmployeeTrainingRecord"("employeeId", "completedDate");

-- CreateIndex
CREATE INDEX "EmployeeTrainingRecord_expiryDate_idx" ON "EmployeeTrainingRecord"("expiryDate");

-- CreateIndex
CREATE INDEX "EmployeeQualification_operationalPositionId_status_idx" ON "EmployeeQualification"("operationalPositionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeQualification_employeeId_operationalPositionId_key" ON "EmployeeQualification"("employeeId", "operationalPositionId");

-- CreateIndex
CREATE INDEX "EmployeeGuestFeedback_employeeId_feedbackDate_idx" ON "EmployeeGuestFeedback"("employeeId", "feedbackDate");

-- CreateIndex
CREATE INDEX "EmployeeGuestFeedback_status_idx" ON "EmployeeGuestFeedback"("status");

-- CreateIndex
CREATE INDEX "EmployeeGuidanceRecord_employeeId_recordDate_idx" ON "EmployeeGuidanceRecord"("employeeId", "recordDate");

-- CreateIndex
CREATE INDEX "EmployeeGuidanceRecord_recordType_status_idx" ON "EmployeeGuidanceRecord"("recordType", "status");

-- CreateIndex
CREATE INDEX "EmployeeIncident_employeeId_incidentDate_idx" ON "EmployeeIncident"("employeeId", "incidentDate");

-- CreateIndex
CREATE INDEX "EmployeeIncident_severity_status_idx" ON "EmployeeIncident"("severity", "status");

-- CreateIndex
CREATE INDEX "Category_department_idx" ON "Category"("department");

-- CreateIndex
CREATE INDEX "Category_department_active_idx" ON "Category"("department", "active");

-- CreateIndex
CREATE INDEX "Product_department_idx" ON "Product"("department");

-- CreateIndex
CREATE INDEX "Product_department_active_idx" ON "Product"("department", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Order_invoiceSerial_key" ON "Order"("invoiceSerial");

-- CreateIndex
CREATE INDEX "Order_invoiceSerial_idx" ON "Order"("invoiceSerial");

-- CreateIndex
CREATE INDEX "Order_deviceId_idx" ON "Order"("deviceId");

-- CreateIndex
CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- CreateIndex
CREATE INDEX "Order_businessDate_idx" ON "Order"("businessDate");

-- CreateIndex
CREATE INDEX "Order_workflowState_idx" ON "Order"("workflowState");

-- CreateIndex
CREATE INDEX "Order_archivedAt_idx" ON "Order"("archivedAt");

-- CreateIndex
CREATE INDEX "Order_archivedAt_createdAt_idx" ON "Order"("archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Order_braceletNo_archivedAt_idx" ON "Order"("braceletNo", "archivedAt");

-- CreateIndex
CREATE INDEX "Order_geideaRegisteredAt_idx" ON "Order"("geideaRegisteredAt");

-- CreateIndex
CREATE UNIQUE INDEX "ActiveBraceletLock_orderId_key" ON "ActiveBraceletLock"("orderId");

-- CreateIndex
CREATE INDEX "ActiveBraceletLock_updatedAt_idx" ON "ActiveBraceletLock"("updatedAt");

-- CreateIndex
CREATE INDEX "Customer_phone_idx" ON "Customer"("phone");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_customerId_key" ON "LoyaltyAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_cardSerial_key" ON "LoyaltyAccount"("cardSerial");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_active_idx" ON "LoyaltyAccount"("active");

-- CreateIndex
CREATE INDEX "LoyaltyReward_walletType_active_idx" ON "LoyaltyReward"("walletType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyTransaction_idempotencyKey_key" ON "LoyaltyTransaction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_accountId_createdAt_idx" ON "LoyaltyTransaction"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_orderId_idx" ON "LoyaltyTransaction"("orderId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_walletType_type_idx" ON "LoyaltyTransaction"("walletType", "type");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_accountId_createdAt_idx" ON "LoyaltyRedemption"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_orderId_idx" ON "LoyaltyRedemption"("orderId");

-- CreateIndex
CREATE INDEX "LoyaltyRedemption_rewardId_idx" ON "LoyaltyRedemption"("rewardId");

-- CreateIndex
CREATE INDEX "Child_customerId_idx" ON "Child"("customerId");

-- CreateIndex
CREATE INDEX "Child_orderId_idx" ON "Child"("orderId");

-- CreateIndex
CREATE INDEX "Child_name_idx" ON "Child"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Device_deviceNo_key" ON "Device"("deviceNo");

-- CreateIndex
CREATE INDEX "Device_type_idx" ON "Device"("type");

-- CreateIndex
CREATE INDEX "Device_active_idx" ON "Device"("active");

-- CreateIndex
CREATE INDEX "PaymentProvider_type_idx" ON "PaymentProvider"("type");

-- CreateIndex
CREATE INDEX "PaymentProvider_active_idx" ON "PaymentProvider"("active");

-- CreateIndex
CREATE INDEX "OrderPayment_orderId_idx" ON "OrderPayment"("orderId");

-- CreateIndex
CREATE INDEX "OrderPayment_paymentProviderId_idx" ON "OrderPayment"("paymentProviderId");

-- CreateIndex
CREATE INDEX "OrderPayment_method_idx" ON "OrderPayment"("method");

-- CreateIndex
CREATE UNIQUE INDEX "OrderTransactionRecord_orderId_key" ON "OrderTransactionRecord"("orderId");

-- CreateIndex
CREATE INDEX "OrderTransactionRecord_braceletNo_idx" ON "OrderTransactionRecord"("braceletNo");

-- CreateIndex
CREATE INDEX "OrderTransactionRecord_businessDate_idx" ON "OrderTransactionRecord"("businessDate");

-- CreateIndex
CREATE INDEX "OrderTransactionRecord_createdAt_idx" ON "OrderTransactionRecord"("createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_orderReference_idx" ON "AuditLog"("orderReference");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "PrintJob_status_idx" ON "PrintJob"("status");

-- CreateIndex
CREATE INDEX "PrintJob_type_idx" ON "PrintJob"("type");

-- CreateIndex
CREATE INDEX "PrintJob_ticketNumber_idx" ON "PrintJob"("ticketNumber");

-- CreateIndex
CREATE INDEX "PrintJob_createdAt_idx" ON "PrintJob"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessDay_businessDate_key" ON "BusinessDay"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "DailyClosingSnapshot_businessDate_key" ON "DailyClosingSnapshot"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "OrderHistory_originalOrderId_key" ON "OrderHistory"("originalOrderId");

-- CreateIndex
CREATE INDEX "OrderHistory_businessDate_idx" ON "OrderHistory"("businessDate");

-- CreateIndex
CREATE INDEX "OrderHistory_closedAt_idx" ON "OrderHistory"("closedAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentPeriod_sourceId_key" ON "EmploymentPeriod"("sourceId");

-- CreateIndex
CREATE INDEX "EmploymentPeriod_employeeId_startDate_idx" ON "EmploymentPeriod"("employeeId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "EmploymentAssignment_sourceId_key" ON "EmploymentAssignment"("sourceId");

-- CreateIndex
CREATE INDEX "EmploymentAssignment_employeeId_effectiveFrom_idx" ON "EmploymentAssignment"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "EmploymentAssignment_jobCode_idx" ON "EmploymentAssignment"("jobCode");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyOffPattern_sourceId_key" ON "WeeklyOffPattern"("sourceId");

-- CreateIndex
CREATE INDEX "WeeklyOffPattern_employeeId_effectiveFrom_idx" ON "WeeklyOffPattern"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "OpsSchedule_sourceId_key" ON "OpsSchedule"("sourceId");

-- CreateIndex
CREATE INDEX "OpsSchedule_operationalYear_operationalMonth_status_idx" ON "OpsSchedule"("operationalYear", "operationalMonth", "status");

-- CreateIndex
CREATE INDEX "OpsSchedule_periodStart_periodEnd_status_idx" ON "OpsSchedule"("periodStart", "periodEnd", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpsSchedule_operationalYear_operationalMonth_version_key" ON "OpsSchedule"("operationalYear", "operationalMonth", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OpsScheduleCode_code_key" ON "OpsScheduleCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsShiftDefinition_code_key" ON "OpsShiftDefinition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsScheduleAssignment_sourceId_key" ON "OpsScheduleAssignment"("sourceId");

-- CreateIndex
CREATE INDEX "OpsScheduleAssignment_employeeId_workDate_idx" ON "OpsScheduleAssignment"("employeeId", "workDate");

-- CreateIndex
CREATE INDEX "OpsScheduleAssignment_workDate_code_idx" ON "OpsScheduleAssignment"("workDate", "code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsScheduleAssignment_scheduleId_employeeId_workDate_key" ON "OpsScheduleAssignment"("scheduleId", "employeeId", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "OpsScheduleValidationRun_sourceId_key" ON "OpsScheduleValidationRun"("sourceId");

-- CreateIndex
CREATE INDEX "OpsScheduleValidationRun_scheduleId_createdAt_idx" ON "OpsScheduleValidationRun"("scheduleId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAttendanceDay_sourceId_key" ON "OpsAttendanceDay"("sourceId");

-- CreateIndex
CREATE INDEX "OpsAttendanceDay_workDate_status_idx" ON "OpsAttendanceDay"("workDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAttendanceDay_workDate_version_key" ON "OpsAttendanceDay"("workDate", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAttendanceRecord_sourceId_key" ON "OpsAttendanceRecord"("sourceId");

-- CreateIndex
CREATE INDEX "OpsAttendanceRecord_employeeId_attendanceDayId_idx" ON "OpsAttendanceRecord"("employeeId", "attendanceDayId");

-- CreateIndex
CREATE INDEX "OpsAttendanceRecord_scheduleAssignmentId_idx" ON "OpsAttendanceRecord"("scheduleAssignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAttendanceRecord_attendanceDayId_employeeId_key" ON "OpsAttendanceRecord"("attendanceDayId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAttendanceCorrection_sourceId_key" ON "OpsAttendanceCorrection"("sourceId");

-- CreateIndex
CREATE INDEX "OpsAttendanceCorrection_attendanceRecordId_createdAt_idx" ON "OpsAttendanceCorrection"("attendanceRecordId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLeaveAccount_sourceId_key" ON "OpsLeaveAccount"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLeaveAccount_employeeId_leaveType_leaveYear_key" ON "OpsLeaveAccount"("employeeId", "leaveType", "leaveYear");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLeaveTransaction_sourceId_key" ON "OpsLeaveTransaction"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLeaveTransaction_reversesTransactionId_key" ON "OpsLeaveTransaction"("reversesTransactionId");

-- CreateIndex
CREATE INDEX "OpsLeaveTransaction_leaveAccountId_effectiveDate_idx" ON "OpsLeaveTransaction"("leaveAccountId", "effectiveDate");

-- CreateIndex
CREATE INDEX "OpsLeaveTransaction_sourceType_sourceReferenceId_idx" ON "OpsLeaveTransaction"("sourceType", "sourceReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLeaveTransaction_leaveAccountId_sourceType_sourceReferen_key" ON "OpsLeaveTransaction"("leaveAccountId", "sourceType", "sourceReferenceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLeaveBooking_sourceId_key" ON "OpsLeaveBooking"("sourceId");

-- CreateIndex
CREATE INDEX "OpsLeaveBooking_employeeId_startDate_endDate_idx" ON "OpsLeaveBooking"("employeeId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLeaveBookingAllocation_sourceId_key" ON "OpsLeaveBookingAllocation"("sourceId");

-- CreateIndex
CREATE INDEX "OpsLeaveBookingAllocation_leaveDate_leaveType_idx" ON "OpsLeaveBookingAllocation"("leaveDate", "leaveType");

-- CreateIndex
CREATE UNIQUE INDEX "OpsLeaveBookingAllocation_leaveBookingId_leaveDate_key" ON "OpsLeaveBookingAllocation"("leaveBookingId", "leaveDate");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOfficialHolidayPeriod_sourceId_key" ON "OpsOfficialHolidayPeriod"("sourceId");

-- CreateIndex
CREATE INDEX "OpsOfficialHolidayPeriod_startDate_endDate_active_idx" ON "OpsOfficialHolidayPeriod"("startDate", "endDate", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOvertimeAccount_sourceId_key" ON "OpsOvertimeAccount"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOvertimeAccount_employeeId_key" ON "OpsOvertimeAccount"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOvertimeTransaction_sourceId_key" ON "OpsOvertimeTransaction"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOvertimeTransaction_reversalOfTransactionId_key" ON "OpsOvertimeTransaction"("reversalOfTransactionId");

-- CreateIndex
CREATE INDEX "OpsOvertimeTransaction_employeeId_transactionDate_idx" ON "OpsOvertimeTransaction"("employeeId", "transactionDate");

-- CreateIndex
CREATE INDEX "OpsOvertimeTransaction_overtimeAccountId_transactionDate_idx" ON "OpsOvertimeTransaction"("overtimeAccountId", "transactionDate");

-- CreateIndex
CREATE INDEX "OpsOvertimeTransaction_relatedAttendanceId_idx" ON "OpsOvertimeTransaction"("relatedAttendanceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOperationsDay_sourceId_key" ON "OpsOperationsDay"("sourceId");

-- CreateIndex
CREATE INDEX "OpsOperationsDay_workDate_status_idx" ON "OpsOperationsDay"("workDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOperationsDay_workDate_version_key" ON "OpsOperationsDay"("workDate", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOperationalPosition_sourceId_key" ON "OpsOperationalPosition"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsOperationalPosition_code_key" ON "OpsOperationalPosition"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsPositionStaffingRequirement_sourceId_key" ON "OpsPositionStaffingRequirement"("sourceId");

-- CreateIndex
CREATE INDEX "OpsPositionStaffingRequirement_operationalPositionId_effect_idx" ON "OpsPositionStaffingRequirement"("operationalPositionId", "effectiveFrom");

-- CreateIndex
CREATE UNIQUE INDEX "OpsRotationPlan_sourceId_key" ON "OpsRotationPlan"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsRotationPlan_operationsDayId_version_key" ON "OpsRotationPlan"("operationsDayId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OpsRotationAssignment_sourceId_key" ON "OpsRotationAssignment"("sourceId");

-- CreateIndex
CREATE INDEX "OpsRotationAssignment_employeeId_startTime_endTime_idx" ON "OpsRotationAssignment"("employeeId", "startTime", "endTime");

-- CreateIndex
CREATE UNIQUE INDEX "OpsBreakAssignment_sourceId_key" ON "OpsBreakAssignment"("sourceId");

-- CreateIndex
CREATE INDEX "OpsBreakAssignment_employeeId_startTime_idx" ON "OpsBreakAssignment"("employeeId", "startTime");

-- CreateIndex
CREATE INDEX "OpsDailyTrip_branch_workDate_status_idx" ON "OpsDailyTrip"("branch", "workDate", "status");

-- CreateIndex
CREATE INDEX "OpsDailyTrip_tripPartnerId_idx" ON "OpsDailyTrip"("tripPartnerId");

-- CreateIndex
CREATE INDEX "OpsDailyEvent_branch_workDate_status_idx" ON "OpsDailyEvent"("branch", "workDate", "status");

-- CreateIndex
CREATE INDEX "OpsDailyEvent_birthdayCustomerId_idx" ON "OpsDailyEvent"("birthdayCustomerId");

-- CreateIndex
CREATE INDEX "OpsDailyOffer_branch_effectiveFrom_effectiveTo_active_idx" ON "OpsDailyOffer"("branch", "effectiveFrom", "effectiveTo", "active");

-- CreateIndex
CREATE INDEX "OpsTripPartner_branch_name_idx" ON "OpsTripPartner"("branch", "name");

-- CreateIndex
CREATE UNIQUE INDEX "OpsTripPartner_branch_name_key" ON "OpsTripPartner"("branch", "name");

-- CreateIndex
CREATE INDEX "OpsBirthdayCustomer_branch_customerName_idx" ON "OpsBirthdayCustomer"("branch", "customerName");

-- CreateIndex
CREATE UNIQUE INDEX "OpsBirthdayCustomer_branch_phone_key" ON "OpsBirthdayCustomer"("branch", "phone");

-- CreateIndex
CREATE INDEX "OpsOperationalNotice_branch_effectiveFrom_effectiveTo_activ_idx" ON "OpsOperationalNotice"("branch", "effectiveFrom", "effectiveTo", "active");

-- CreateIndex
CREATE INDEX "OpsWristbandStock_branch_workDate_idx" ON "OpsWristbandStock"("branch", "workDate");

-- CreateIndex
CREATE UNIQUE INDEX "OpsWristbandStock_branch_workDate_wristbandType_key" ON "OpsWristbandStock"("branch", "workDate", "wristbandType");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvaluationCriteriaVersion_sourceId_key" ON "OpsEvaluationCriteriaVersion"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvaluationCriteriaVersion_code_key" ON "OpsEvaluationCriteriaVersion"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvaluationCriterion_sourceId_key" ON "OpsEvaluationCriterion"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvaluationCriterion_criteriaVersionId_code_key" ON "OpsEvaluationCriterion"("criteriaVersionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvaluationDeductionReason_sourceId_key" ON "OpsEvaluationDeductionReason"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvaluationDeductionReason_criterionId_code_key" ON "OpsEvaluationDeductionReason"("criterionId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsDailyEvaluationDay_sourceId_key" ON "OpsDailyEvaluationDay"("sourceId");

-- CreateIndex
CREATE INDEX "OpsDailyEvaluationDay_evaluationDate_status_idx" ON "OpsDailyEvaluationDay"("evaluationDate", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpsDailyEvaluationDay_evaluationDate_version_key" ON "OpsDailyEvaluationDay"("evaluationDate", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEmployeeDailyEvaluation_sourceId_key" ON "OpsEmployeeDailyEvaluation"("sourceId");

-- CreateIndex
CREATE INDEX "OpsEmployeeDailyEvaluation_employeeId_dailyEvaluationDayId_idx" ON "OpsEmployeeDailyEvaluation"("employeeId", "dailyEvaluationDayId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEmployeeDailyEvaluation_dailyEvaluationDayId_employeeId_key" ON "OpsEmployeeDailyEvaluation"("dailyEvaluationDayId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvaluationException_sourceId_key" ON "OpsEvaluationException"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEvaluationException_employeeDailyEvaluationId_criterionI_key" ON "OpsEvaluationException"("employeeDailyEvaluationId", "criterionId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAppraisalFormulaVersion_sourceId_key" ON "OpsAppraisalFormulaVersion"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsAppraisalFormulaVersion_code_key" ON "OpsAppraisalFormulaVersion"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsMonthlyAppraisal_sourceId_key" ON "OpsMonthlyAppraisal"("sourceId");

-- CreateIndex
CREATE INDEX "OpsMonthlyAppraisal_year_month_status_idx" ON "OpsMonthlyAppraisal"("year", "month", "status");

-- CreateIndex
CREATE INDEX "OpsMonthlyAppraisal_employeeId_year_month_idx" ON "OpsMonthlyAppraisal"("employeeId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "OpsMonthlyAppraisal_employeeId_year_month_version_key" ON "OpsMonthlyAppraisal"("employeeId", "year", "month", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OpsMonthClose_sourceId_key" ON "OpsMonthClose"("sourceId");

-- CreateIndex
CREATE INDEX "OpsMonthClose_year_month_status_idx" ON "OpsMonthClose"("year", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpsMonthClose_year_month_version_key" ON "OpsMonthClose"("year", "month", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEotmFormulaVersion_sourceId_key" ON "OpsEotmFormulaVersion"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEotmFormulaVersion_code_key" ON "OpsEotmFormulaVersion"("code");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEotmCompetition_sourceId_key" ON "OpsEotmCompetition"("sourceId");

-- CreateIndex
CREATE INDEX "OpsEotmCompetition_year_month_status_idx" ON "OpsEotmCompetition"("year", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEotmCompetition_year_month_version_key" ON "OpsEotmCompetition"("year", "month", "version");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEotmCandidate_sourceId_key" ON "OpsEotmCandidate"("sourceId");

-- CreateIndex
CREATE INDEX "OpsEotmCandidate_competitionId_eligible_rank_idx" ON "OpsEotmCandidate"("competitionId", "eligible", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "OpsEotmCandidate_competitionId_employeeId_key" ON "OpsEotmCandidate"("competitionId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsSuccessionCandidate_sourceId_key" ON "OpsSuccessionCandidate"("sourceId");

-- CreateIndex
CREATE INDEX "OpsSuccessionCandidate_targetRole_readinessStatus_active_idx" ON "OpsSuccessionCandidate"("targetRole", "readinessStatus", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OpsSuccessionCandidate_employeeId_targetRole_active_key" ON "OpsSuccessionCandidate"("employeeId", "targetRole", "active");

-- CreateIndex
CREATE UNIQUE INDEX "OpsSuccessionDevelopmentAction_sourceId_key" ON "OpsSuccessionDevelopmentAction"("sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "OpsSuccessionReview_sourceId_key" ON "OpsSuccessionReview"("sourceId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeDocument" ADD CONSTRAINT "EmployeeDocument_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeEmploymentEvent" ADD CONSTRAINT "EmployeeEmploymentEvent_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeTrainingRecord" ADD CONSTRAINT "EmployeeTrainingRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeQualification" ADD CONSTRAINT "EmployeeQualification_operationalPositionId_fkey" FOREIGN KEY ("operationalPositionId") REFERENCES "OpsOperationalPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeGuestFeedback" ADD CONSTRAINT "EmployeeGuestFeedback_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeGuidanceRecord" ADD CONSTRAINT "EmployeeGuidanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeIncident" ADD CONSTRAINT "EmployeeIncident_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentProviderId_fkey" FOREIGN KEY ("paymentProviderId") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_dataEmployeeId_fkey" FOREIGN KEY ("dataEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryEmployeeId_fkey" FOREIGN KEY ("deliveryEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_geideaEmployeeId_fkey" FOREIGN KEY ("geideaEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentEmployeeId_fkey" FOREIGN KEY ("paymentEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_exitEmployeeId_fkey" FOREIGN KEY ("exitEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActiveBraceletLock" ADD CONSTRAINT "ActiveBraceletLock_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRedemption" ADD CONSTRAINT "LoyaltyRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "LoyaltyReward"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Child" ADD CONSTRAINT "Child_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_paymentProviderId_fkey" FOREIGN KEY ("paymentProviderId") REFERENCES "PaymentProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintJob" ADD CONSTRAINT "PrintJob_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentPeriod" ADD CONSTRAINT "EmploymentPeriod_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentAssignment" ADD CONSTRAINT "EmploymentAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmploymentAssignment" ADD CONSTRAINT "EmploymentAssignment_employmentPeriodId_fkey" FOREIGN KEY ("employmentPeriodId") REFERENCES "EmploymentPeriod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeeklyOffPattern" ADD CONSTRAINT "WeeklyOffPattern_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsScheduleAssignment" ADD CONSTRAINT "OpsScheduleAssignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "OpsSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsScheduleAssignment" ADD CONSTRAINT "OpsScheduleAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsScheduleValidationRun" ADD CONSTRAINT "OpsScheduleValidationRun_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "OpsSchedule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsAttendanceRecord" ADD CONSTRAINT "OpsAttendanceRecord_attendanceDayId_fkey" FOREIGN KEY ("attendanceDayId") REFERENCES "OpsAttendanceDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsAttendanceRecord" ADD CONSTRAINT "OpsAttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsAttendanceRecord" ADD CONSTRAINT "OpsAttendanceRecord_scheduleAssignmentId_fkey" FOREIGN KEY ("scheduleAssignmentId") REFERENCES "OpsScheduleAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsAttendanceCorrection" ADD CONSTRAINT "OpsAttendanceCorrection_attendanceRecordId_fkey" FOREIGN KEY ("attendanceRecordId") REFERENCES "OpsAttendanceRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsLeaveAccount" ADD CONSTRAINT "OpsLeaveAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsLeaveTransaction" ADD CONSTRAINT "OpsLeaveTransaction_leaveAccountId_fkey" FOREIGN KEY ("leaveAccountId") REFERENCES "OpsLeaveAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsLeaveBooking" ADD CONSTRAINT "OpsLeaveBooking_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsLeaveBookingAllocation" ADD CONSTRAINT "OpsLeaveBookingAllocation_leaveBookingId_fkey" FOREIGN KEY ("leaveBookingId") REFERENCES "OpsLeaveBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsOvertimeAccount" ADD CONSTRAINT "OpsOvertimeAccount_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsOvertimeTransaction" ADD CONSTRAINT "OpsOvertimeTransaction_overtimeAccountId_fkey" FOREIGN KEY ("overtimeAccountId") REFERENCES "OpsOvertimeAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsOvertimeTransaction" ADD CONSTRAINT "OpsOvertimeTransaction_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsPositionStaffingRequirement" ADD CONSTRAINT "OpsPositionStaffingRequirement_operationalPositionId_fkey" FOREIGN KEY ("operationalPositionId") REFERENCES "OpsOperationalPosition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsRotationPlan" ADD CONSTRAINT "OpsRotationPlan_operationsDayId_fkey" FOREIGN KEY ("operationsDayId") REFERENCES "OpsOperationsDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsRotationAssignment" ADD CONSTRAINT "OpsRotationAssignment_rotationPlanId_fkey" FOREIGN KEY ("rotationPlanId") REFERENCES "OpsRotationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsRotationAssignment" ADD CONSTRAINT "OpsRotationAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsRotationAssignment" ADD CONSTRAINT "OpsRotationAssignment_operationalPositionId_fkey" FOREIGN KEY ("operationalPositionId") REFERENCES "OpsOperationalPosition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsBreakAssignment" ADD CONSTRAINT "OpsBreakAssignment_rotationPlanId_fkey" FOREIGN KEY ("rotationPlanId") REFERENCES "OpsRotationPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsBreakAssignment" ADD CONSTRAINT "OpsBreakAssignment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsDailyTrip" ADD CONSTRAINT "OpsDailyTrip_tripPartnerId_fkey" FOREIGN KEY ("tripPartnerId") REFERENCES "OpsTripPartner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsDailyEvent" ADD CONSTRAINT "OpsDailyEvent_birthdayCustomerId_fkey" FOREIGN KEY ("birthdayCustomerId") REFERENCES "OpsBirthdayCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvaluationCriterion" ADD CONSTRAINT "OpsEvaluationCriterion_criteriaVersionId_fkey" FOREIGN KEY ("criteriaVersionId") REFERENCES "OpsEvaluationCriteriaVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvaluationDeductionReason" ADD CONSTRAINT "OpsEvaluationDeductionReason_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "OpsEvaluationCriterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsDailyEvaluationDay" ADD CONSTRAINT "OpsDailyEvaluationDay_criteriaVersionId_fkey" FOREIGN KEY ("criteriaVersionId") REFERENCES "OpsEvaluationCriteriaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEmployeeDailyEvaluation" ADD CONSTRAINT "OpsEmployeeDailyEvaluation_dailyEvaluationDayId_fkey" FOREIGN KEY ("dailyEvaluationDayId") REFERENCES "OpsDailyEvaluationDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEmployeeDailyEvaluation" ADD CONSTRAINT "OpsEmployeeDailyEvaluation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvaluationException" ADD CONSTRAINT "OpsEvaluationException_employeeDailyEvaluationId_fkey" FOREIGN KEY ("employeeDailyEvaluationId") REFERENCES "OpsEmployeeDailyEvaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvaluationException" ADD CONSTRAINT "OpsEvaluationException_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "OpsEvaluationCriterion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEvaluationException" ADD CONSTRAINT "OpsEvaluationException_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "OpsEvaluationDeductionReason"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsMonthlyAppraisal" ADD CONSTRAINT "OpsMonthlyAppraisal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsMonthlyAppraisal" ADD CONSTRAINT "OpsMonthlyAppraisal_formulaVersionId_fkey" FOREIGN KEY ("formulaVersionId") REFERENCES "OpsAppraisalFormulaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEotmCompetition" ADD CONSTRAINT "OpsEotmCompetition_formulaVersionId_fkey" FOREIGN KEY ("formulaVersionId") REFERENCES "OpsEotmFormulaVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEotmCompetition" ADD CONSTRAINT "OpsEotmCompetition_winnerEmployeeId_fkey" FOREIGN KEY ("winnerEmployeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEotmCandidate" ADD CONSTRAINT "OpsEotmCandidate_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "OpsEotmCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsEotmCandidate" ADD CONSTRAINT "OpsEotmCandidate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsSuccessionCandidate" ADD CONSTRAINT "OpsSuccessionCandidate_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsSuccessionDevelopmentAction" ADD CONSTRAINT "OpsSuccessionDevelopmentAction_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "OpsSuccessionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpsSuccessionReview" ADD CONSTRAINT "OpsSuccessionReview_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "OpsSuccessionCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
