const { test, expect } = require("@playwright/test");

test.describe("isolated operations mutations", () => {
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

  test("schedule publishing supports exact roster PNG download fallback, revision and deletion", async ({ request, page }) => {
    const year = 2099;
    const month = 11;
    const draftResponse = await request.post("/api/operations/schedules", { data: { action: "createBlankDraft", year, month } });
    expect(draftResponse.ok()).toBeTruthy();
    const draft = (await draftResponse.json()).schedule;

    const publishedResponse = await request.post("/api/operations/schedules", { data: { action: "publish", scheduleId: draft.id } });
    expect(publishedResponse.ok()).toBeTruthy();
    expect((await publishedResponse.json()).schedule.status).toBe("PUBLISHED");

    await page.addInitScript(() => {
      try { Object.defineProperty(navigator, "share", { configurable: true, value: undefined }); } catch {}
      try { Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }); } catch {}
    });
    await page.goto("/operations/daily-preview", { waitUntil: "networkidle" });
    await page.locator('input[type="date"]').fill(draft.periodStart);
    await expect(page.locator(".daily-operations-poster")).toBeVisible();
    const logo = page.locator(".daily-operations-poster img").first();
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((image) => image.complete && image.naturalWidth > 0)).toBeTruthy();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: /Copy image & open WhatsApp|نسخ الصورة وفتح واتساب/ }).click();
    const download = await downloadPromise;
    const stream = await download.createReadStream();
    const chunks = [];
    for await (const chunk of stream) chunks.push(chunk);
    const png = Buffer.concat(chunks);
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBeGreaterThan(700);
    expect(png.readUInt32BE(20)).toBeGreaterThan(400);

    const revisionResponse = await request.post("/api/operations/schedules", { data: { action: "createRevision", scheduleId: draft.id } });
    expect(revisionResponse.ok()).toBeTruthy();
    const revision = (await revisionResponse.json()).schedule;
    expect(revision.status).toBe("DRAFT");

    const deletedResponse = await request.post("/api/operations/schedules", { data: { action: "deleteDraft", scheduleId: revision.id } });
    expect(deletedResponse.ok()).toBeTruthy();
  });
});
