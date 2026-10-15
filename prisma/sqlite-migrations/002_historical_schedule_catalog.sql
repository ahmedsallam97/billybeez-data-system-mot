-- Explain existing historical codes without rewriting published cells or raw values.
INSERT INTO OpsScheduleCode (id,code,label,labelAr,category,colorKey,countsAsWorking,active,sortOrder)
VALUES ('ops-code-holiday-h','H','Holiday','عطلة','LEAVE','holiday',0,1,70)
ON CONFLICT(code) DO NOTHING;
INSERT INTO OpsScheduleCode (id,code,label,labelAr,category,colorKey,countsAsWorking,active,sortOrder)
VALUES ('ops-code-anp','ANP','Absence without permission','غياب بدون إذن','ABSENCE','absent',0,1,80)
ON CONFLICT(code) DO NOTHING;
INSERT INTO OpsScheduleCode (id,code,label,labelAr,category,colorKey,countsAsWorking,active,sortOrder)
VALUES ('ops-code-historical-overtime','OVERTIME','Historical overtime occurrence','واقعة إضافي تاريخية','OVERTIME','overtime',0,0,90)
ON CONFLICT(code) DO NOTHING;
