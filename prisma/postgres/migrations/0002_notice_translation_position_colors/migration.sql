ALTER TABLE "OpsOperationalPosition" ADD COLUMN "color" TEXT;
ALTER TABLE "OpsOperationalNotice" ADD COLUMN "titleAr" TEXT;
ALTER TABLE "OpsOperationalNotice" ADD COLUMN "messageAr" TEXT;

UPDATE "OpsOperationalNotice"
SET "titleAr" = 'الوسادة الهوائية', "messageAr" = 'الوسادة الهوائية مغلقة حاليًا'
WHERE LOWER("title") = 'airbag' AND "titleAr" IS NULL AND "messageAr" IS NULL;
