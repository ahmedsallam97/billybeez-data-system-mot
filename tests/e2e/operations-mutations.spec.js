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

  test("attendance can be opened, completed, finalized and corrected", async ({ request }) => {
    const openResponse = await request.post("/api/operations/attendance", { data: { action: "open", date: rehearsalDate } });
    expect(openResponse.ok()).toBeTruthy();
    const day = (await openResponse.json()).day;

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
});
