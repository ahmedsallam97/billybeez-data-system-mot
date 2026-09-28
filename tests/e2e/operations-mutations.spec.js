const { test, expect } = require("@playwright/test");

let rehearsalDate;
let employeeId;
let secondEmployeeId;

test.describe("isolated operations mutations", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(process.env.E2E_MUTATIONS !== "1", "Mutation coverage runs only against an isolated disposable database");

  test("offer create, update and delete keep one record", async ({ request }) => {
    const title = `E2E offer ${Date.now()}`;
    const createdResponse = await request.post("/api/operations/daily", { data: { action: "createOffer", date: "2099-11-01", branch: "MOT", title, offerMode: "PERMANENT", priceBefore: 400, priceAfter: 280, discountPercent: 30, childrenCount: 2, weekdays: [0, 1, 2, 3] } });
    expect(createdResponse.ok()).toBeTruthy();
    const created = (await createdResponse.json()).record;

    const updatedResponse = await request.patch("/api/operations/daily", { data: { action: "updateOffer", branch: "MOT", offerId: created.id, title: `${title} updated`, offerMode: "PERMANENT", priceBefore: 400, priceAfter: 260, discountPercent: 35, childrenCount: 2, weekdays: [0, 1, 2, 3] } });
    expect(updatedResponse.ok()).toBeTruthy();
    const updated = (await updatedResponse.json()).record;
    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe(`${title} updated`);

    const deletedResponse = await request.patch("/api/operations/daily", { data: { action: "deleteOffer", branch: "MOT", offerId: created.id } });
    expect(deletedResponse.ok()).toBeTruthy();
    const deleted = (await deletedResponse.json()).record;
    expect(deleted.id).toBe(created.id);
    expect(deleted.active).toBeFalsy();
  });

  test("monthly appraisals can be approved and completed through Employee of the Month", async ({ request, page }) => {
    await page.goto("/operations?tab=performance&year=2099&month=10", { waitUntil: "networkidle" });
    const approveAll = page.getByRole("button", { name: /Approve all monthly appraisals|اعتماد كل تقييمات الشهر/ });
    await expect(approveAll).toBeVisible();
    await expect(approveAll).toBeEnabled();

    const initialResponse = await request.get("/api/operations/performance?year=2099&month=10");
    expect(initialResponse.ok()).toBeTruthy();
    const initial = await initialResponse.json();
    expect(initial.appraisals.filter((item) => item.status === "DRAFT")).toHaveLength(2);

    const manualTarget = initial.appraisals[0];
    const manualResponse = await request.post("/api/operations/performance", { data: { action: "appraisalManualOverride", year: 2099, month: 10, reason: "Historical signed appraisal entered during E2E", rows: [{ employeeId: manualTarget.employeeId, totalScore: 95 }] } });
    expect(manualResponse.ok()).toBeTruthy();
    const manualAppraisal = (await manualResponse.json()).appraisals[0];
    expect(manualAppraisal.version).toBe(2);
    expect(manualAppraisal.totalScore).toBe(95);
    expect(manualAppraisal.status).toBe("DRAFT");
    const manualPeriodResponse = await request.get("/api/operations/performance?year=2099&month=10");
    const manualPeriod = await manualPeriodResponse.json();
    const visibleManual = manualPeriod.appraisals.find((item) => item.employeeId === manualTarget.employeeId);
    expect(visibleManual.totalScore).toBe(95);
    expect(visibleManual.entryMode).toBe("MANUAL");
    expect(visibleManual.manualReason).toContain("Historical signed appraisal");
    expect(manualPeriod.appraisals).toHaveLength(2);

    const approvalResponse = await request.post("/api/operations/performance", { data: { action: "appraisalApproveAll", year: 2099, month: 10 } });
    expect(approvalResponse.ok()).toBeTruthy();
    expect((await approvalResponse.json()).approved).toBe(2);

    await page.reload({ waitUntil: "networkidle" });
    const calculate = page.getByRole("button", { name: /Calculate candidates|حساب المرشحين/ });
    await expect(calculate).toBeEnabled();

    const createResponse = await request.post("/api/operations/performance", { data: { action: "eotmCreate", year: 2099, month: 10 } });
    expect(createResponse.ok()).toBeTruthy();
    const competitionId = (await createResponse.json()).competition.id;
    const calculatedResponse = await request.get("/api/operations/performance?year=2099&month=10");
    const calculated = await calculatedResponse.json();
    const competition = calculated.competitions.find((item) => item.id === competitionId);
    expect(competition.candidates).toHaveLength(2);

    const winnerId = competition.candidates[0].employeeId;
    const winnerResponse = await request.post("/api/operations/performance", { data: { action: "eotmWinner", competitionId, employeeId: winnerId } });
    expect(winnerResponse.ok()).toBeTruthy();
    const lockResponse = await request.post("/api/operations/performance", { data: { action: "eotmLock", competitionId } });
    expect(lockResponse.ok()).toBeTruthy();
    expect((await lockResponse.json()).competition.status).toBe("LOCKED");

    const lockedOverride = await request.post("/api/operations/performance", { data: { action: "appraisalManualOverride", year: 2099, month: 10, reason: "This should be rejected after lock", rows: [{ employeeId: manualTarget.employeeId, totalScore: 99 }] } });
    expect(lockedOverride.status()).toBe(400);
    expect((await lockedOverride.json()).error).toContain("Reopen the locked Employee of the Month competition");

    const finalResponse = await request.get("/api/operations/performance?year=2099&month=10");
    const finalCompetition = (await finalResponse.json()).competitions.find((item) => item.id === competitionId);
    expect(finalCompetition.status).toBe("LOCKED");
    expect(finalCompetition.winnerEmployeeId).toBe(winnerId);
  });

  test("schedule publishing supports exact roster image copy, PNG fallback, revision and deletion", async ({ request, page, context }) => {
    const year = 2099;
    const month = 11;
    const layoutOfferResponse = await request.post("/api/operations/daily", { data: { action: "createOffer", date: "2099-11-01", branch: "MOT", title: "E2E poster layout", offerMode: "PERMANENT", priceBefore: 400, priceAfter: 300, discountPercent: 25, childrenCount: 2, weekdays: [] } });
    expect(layoutOfferResponse.ok()).toBeTruthy();
    const layoutOffer = (await layoutOfferResponse.json()).record;
    const draftResponse = await request.post("/api/operations/schedules", { data: { action: "createBlankDraft", year, month } });
    expect(draftResponse.ok()).toBeTruthy();
    const draft = (await draftResponse.json()).schedule;
    rehearsalDate = draft.periodStart;
    const employeesResponse = await request.get("/api/operations/employees?status=ACTIVE");
    expect(employeesResponse.ok()).toBeTruthy();
    const employees = (await employeesResponse.json()).employees.filter((employee) => ["OPERATION", "CASHIER"].includes(employee.department));
    expect(employees.length).toBeGreaterThan(1);
    employeeId = employees[0].id;
    secondEmployeeId = employees[1].id;
    const assignmentResponse = await request.patch("/api/operations/schedules", { data: { scheduleId: draft.id, employeeId, workDate: rehearsalDate, value: "AM" } });
    expect(assignmentResponse.ok()).toBeTruthy();

    const publishedResponse = await request.post("/api/operations/schedules", { data: { action: "publish", scheduleId: draft.id } });
    expect(publishedResponse.ok()).toBeTruthy();
    expect((await publishedResponse.json()).schedule.status).toBe("PUBLISHED");

    await page.addInitScript(() => {
      try { Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); } catch {}
      try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }); } catch {}
    });
    await page.goto("/operations/daily-preview", { waitUntil: "networkidle" });
    await page.locator('input[type="date"]').fill(rehearsalDate);
    await expect(page.locator(".daily-operations-poster")).toBeVisible();
    const dailySummary = page.locator(".ops-daily-summary-pair");
    await expect(dailySummary).toBeVisible();
    await expect(dailySummary.locator(":scope > .ops-bottom-card")).toHaveCount(2);
    const summaryBox = await dailySummary.boundingBox();
    const offersBox = await page.locator(".ops-offers-section").boundingBox();
    expect(summaryBox.y + summaryBox.height).toBeLessThanOrEqual(offersBox.y + 1);
    const logo = page.locator(".daily-operations-poster img").first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBeTruthy();
    const openPagesBeforeFallback = context.pages().length;
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Copy roster image|نسخ صورة الروستر/ }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const png = Buffer.concat(chunks);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBeGreaterThan(700);
    expect(png.readUInt32BE(20)).toBeGreaterThan(400);
    expect(context.pages()).toHaveLength(openPagesBeforeFallback);

    const copyPage = await context.newPage();
    await copyPage.addInitScript(() => {
      window.__clipboardWrites = 0;
      class TestClipboardItem { constructor(items) { this.items = items; } }
      Object.defineProperty(window, "ClipboardItem", { configurable: true, value: TestClipboardItem });
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write: async (items) => { await items[0].items["image/png"]; window.__clipboardWrites += 1; } } });
    });
    await copyPage.goto("/operations/daily-preview", { waitUntil: "networkidle" });
    await copyPage.locator('input[type="date"]').fill(rehearsalDate);
    await expect(copyPage.locator(".daily-operations-poster")).toBeVisible();
    const openPagesBeforeCopy = context.pages().length;
    await copyPage.getByRole("button", { name: /Copy roster image|نسخ صورة الروستر/ }).click();
    await expect(copyPage.locator(".alert.success")).toContainText(/copied|تم نسخ/);
    expect(await copyPage.evaluate(() => window.__clipboardWrites)).toBe(1);
    expect(context.pages()).toHaveLength(openPagesBeforeCopy);
    await copyPage.close();

    const revisionResponse = await request.post("/api/operations/schedules", { data: { action: "createRevision", scheduleId: draft.id } });
    expect(revisionResponse.ok()).toBeTruthy();
    const revision = (await revisionResponse.json()).schedule;
    expect(revision.status).toBe("DRAFT");

    const deletedResponse = await request.post("/api/operations/schedules", { data: { action: "deleteDraft", scheduleId: revision.id } });
    expect(deletedResponse.ok()).toBeTruthy();
    const deletedOfferResponse = await request.patch("/api/operations/daily", { data: { action: "deleteOffer", branch: "MOT", offerId: layoutOffer.id } });
    expect(deletedOfferResponse.ok()).toBeTruthy();
  });

  test("attendance can be opened from a dated action link, completed, finalized and corrected", async ({ request, page }) => {
    const openResponse = await request.post("/api/operations/attendance", { data: { action: "open", date: rehearsalDate } });
    expect(openResponse.ok()).toBeTruthy();
    const day = (await openResponse.json()).day;

    await page.goto(`/operations?tab=daily&date=${rehearsalDate}`, { waitUntil: "networkidle" });
    await expect(page.getByLabel(/Date|التاريخ/)).toHaveValue(rehearsalDate);
    await expect(page.locator(".attendance-table-wrap")).toBeVisible();

    const openedResponse = await request.get(`/api/operations/attendance?date=${rehearsalDate}`);
    expect(openedResponse.ok()).toBeTruthy();
    const openedRecord = (await openedResponse.json()).day.records[0];
    const completeResponse = await request.patch("/api/operations/attendance", { data: { action: "update", recordId: openedRecord.id, status: "PRESENT", actualIn: "10:00", actualOut: "18:00" } });
    expect(completeResponse.ok()).toBeTruthy();

    const finalizeResponse = await request.patch("/api/operations/attendance", { data: { action: "finalize", dayId: day.id } });
    expect(finalizeResponse.ok()).toBeTruthy();
    expect((await finalizeResponse.json()).day.status).toBe("FINALIZED");

    const attendance = await request.get(`/api/operations/attendance?date=${rehearsalDate}`);
    const record = (await attendance.json()).day.records[0];
    const correctionResponse = await request.patch("/api/operations/attendance", { data: { action: "correct", recordId: record.id, status: "PRESENT", actualIn: "10:00", actualOut: "18:00", reason: "E2E correction verification" } });
    expect(correctionResponse.ok()).toBeTruthy();
    expect((await correctionResponse.json()).record.source).toBe("CORRECTION");
  });

  test("daily evaluation can apply actions, close and receive an authorized correction", async ({ request }) => {
    const openResponse = await request.post("/api/operations/evaluations", { data: { action: "open", date: rehearsalDate } });
    expect(openResponse.ok()).toBeTruthy();

    const saveResponse = await request.post("/api/operations/evaluations", { data: { action: "save", date: rehearsalDate, evaluations: [{ employeeId, exceptions: [], penaltyNote: "E2E penalty", guidanceNote: "E2E guidance", supervisorNote: "Reviewed" }] } });
    expect(saveResponse.ok()).toBeTruthy();

    const savedResponse = await request.get(`/api/operations/evaluations?date=${rehearsalDate}`);
    const saved = (await savedResponse.json()).day.evaluations.find((item) => item.employeeId === employeeId);
    expect(saved.maxScore).toBe(50);
    expect(saved.finalScore).toBe(10);
    expect(saved.penaltyNote).toBe("E2E penalty");
    expect(saved.guidanceNote).toBe("E2E guidance");

    const closeResponse = await request.post("/api/operations/evaluations", { data: { action: "close", date: rehearsalDate, teamNote: "E2E closed" } });
    expect(closeResponse.ok()).toBeTruthy();
    expect((await closeResponse.json()).day.status).toBe("CLOSED");

    const correctionResponse = await request.post("/api/operations/evaluations", { data: { action: "correct", date: rehearsalDate, reason: "E2E correction verification", evaluations: [{ employeeId, exceptions: [], penaltyNote: "", guidanceNote: "", supervisorNote: "Corrected" }] } });
    expect(correctionResponse.ok()).toBeTruthy();
    const correctedResponse = await request.get(`/api/operations/evaluations?date=${rehearsalDate}`);
    const corrected = (await correctedResponse.json()).day.evaluations.find((item) => item.employeeId === employeeId);
    expect(corrected.status).toBe("MODIFIED");
    expect(corrected.finalScore).toBe(50);
  });

  test("employee upload remains bound to the selected employee through download and removal", async ({ request }) => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const wrongTarget = await request.post(`/api/operations/employees/${employeeId}/documents`, { multipart: { employeeId: secondEmployeeId, documentType: "OTHER", file: { name: "wrong-target.png", mimeType: "image/png", buffer: png } } });
    expect(wrongTarget.status()).toBe(409);

    const uploadResponse = await request.post(`/api/operations/employees/${employeeId}/documents`, { multipart: { employeeId, documentType: "OTHER", displayName: "E2E restore proof", notes: "Disposable fixture", file: { name: "e2e-proof.png", mimeType: "image/png", buffer: png } } });
    expect(uploadResponse.ok()).toBeTruthy();
    const document = (await uploadResponse.json()).document;
    expect(document.employeeId).toBe(employeeId);

    const downloadResponse = await request.get(`/api/operations/employees/${employeeId}/documents/${document.id}?download=1`);
    expect(downloadResponse.ok()).toBeTruthy();
    expect(Buffer.compare(await downloadResponse.body(), png)).toBe(0);

    const deleteResponse = await request.delete(`/api/operations/employees/${employeeId}/documents/${document.id}`);
    expect(deleteResponse.ok()).toBeTruthy();
    expect((await request.get(`/api/operations/employees/${employeeId}/documents/${document.id}`)).status()).toBe(404);
  });

  test("Employee 360 persists feedback, guidance and incident follow-up", async ({ request }) => {
    const feedbackResponse = await request.post(`/api/operations/employees/${employeeId}/360`, { data: { action: "guestFeedback", feedbackDate: rehearsalDate, rating: 5, category: "E2E", comment: "Fixture feedback" } });
    expect(feedbackResponse.ok()).toBeTruthy();
    const feedbackId = (await feedbackResponse.json()).record.id;

    const guidanceResponse = await request.post(`/api/operations/employees/${employeeId}/360`, { data: { action: "guidance", recordDate: rehearsalDate, recordType: "GUIDANCE", title: "Fixture guidance", details: "Fixture details", points: -15 } });
    expect(guidanceResponse.ok()).toBeTruthy();
    const guidanceId = (await guidanceResponse.json()).record.id;

    const incidentResponse = await request.post(`/api/operations/employees/${employeeId}/360`, { data: { action: "incident", incidentDate: rehearsalDate, incidentType: "OPERATIONAL", title: "Fixture incident", description: "Fixture description", severity: "LOW", status: "OPEN" } });
    expect(incidentResponse.ok()).toBeTruthy();
    const incidentId = (await incidentResponse.json()).incident.id;
    const updateResponse = await request.post(`/api/operations/employees/${employeeId}/360`, { data: { action: "incidentUpdate", incidentId, status: "CLOSED", followUpAction: "Verified and closed" } });
    expect(updateResponse.ok()).toBeTruthy();

    const profileResponse = await request.get(`/api/operations/employees/${employeeId}/360`);
    expect(profileResponse.ok()).toBeTruthy();
    const profile = (await profileResponse.json()).employee;
    expect(profile.guestFeedback.some((item) => item.id === feedbackId)).toBeTruthy();
    expect(profile.guidanceRecords.some((item) => item.id === guidanceId)).toBeTruthy();
    expect(profile.incidents.find((item) => item.id === incidentId)?.status).toBe("CLOSED");
  });

  test("an existing Part-Time employee converts to a real HRIS identity with a contract", async ({ request }) => {
    const employeesResponse = await request.get("/api/operations/employees?status=ACTIVE");
    const employees = (await employeesResponse.json()).employees;
    const partTime = employees.find((item) => !item.hrisNumber && item.employmentType === "PART_TIME");
    expect(partTime).toBeTruthy();

    const conversionResponse = await request.post(`/api/operations/employees/${partTime.id}/360`, { data: {
      action: "convertToHris",
      hrisNumber: "99876",
      effectiveDate: "2099-12-01",
      contractEnd: "2100-11-30",
      jobTitle: partTime.jobTitle || "Ride Operator",
      jobCode: "E2E-HRIS",
      reason: "Isolated HRIS conversion rehearsal",
    } });
    expect(conversionResponse.ok()).toBeTruthy();
    const converted = (await conversionResponse.json()).employee;
    expect(converted.id).toBe(partTime.id);
    expect(converted.hrisNumber).toBe("99876");
    expect(converted.localEmployeeCode).toBe("");
    expect(converted.employmentType).toBe("HRIS");

    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const contractResponse = await request.post(`/api/operations/employees/${partTime.id}/documents`, { multipart: {
      employeeId: partTime.id,
      documentType: "CONTRACT",
      displayName: "E2E signed HRIS contract",
      issueDate: "2099-12-01",
      expiryDate: "2100-11-30",
      notes: "Isolated fixture",
      file: { name: "hris-contract.png", mimeType: "image/png", buffer: png },
    } });
    expect(contractResponse.ok()).toBeTruthy();

    const profileResponse = await request.get(`/api/operations/employees/${partTime.id}/360`);
    const profile = (await profileResponse.json()).employee;
    expect(profile.employmentEvents.some((item) => item.eventType === "CONVERTED_TO_HRIS" && item.newValue.includes("99876"))).toBeTruthy();
    expect(profile.employmentPeriods.flatMap((period) => period.assignments).some((item) => item.changeReason === "PT_TO_HRIS" && item.jobCode === "E2E-HRIS")).toBeTruthy();
    expect(profile.documents.some((item) => item.documentType === "CONTRACT" && item.displayName === "E2E signed HRIS contract")).toBeTruthy();

    const repeatResponse = await request.post(`/api/operations/employees/${partTime.id}/360`, { data: { action: "convertToHris", hrisNumber: "99876", effectiveDate: "2099-12-01", jobTitle: "Ride Operator" } });
    expect(repeatResponse.status()).toBe(400);
    expect((await repeatResponse.json()).error).toContain("already assigned to HRIS");
  });
});
