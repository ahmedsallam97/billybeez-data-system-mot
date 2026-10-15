const {expect}=require('@playwright/test');
async function openDisclosure(page,label){const summary=page.locator('details>summary').filter({hasText:label}).first();await expect(summary).toBeVisible();if(!await summary.evaluate(el=>el.parentElement.open))await summary.click();}
module.exports={openDisclosure};
