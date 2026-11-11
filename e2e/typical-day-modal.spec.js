import { test, expect } from '@playwright/test';

test.describe('Typical-day modal', () => {
  test('requires an answer and preserves the selected response', async ({ page }) => {
    await page.goto('/pages/instructions.html');

    const childDetailsModal = page.locator('#childDetailsModal');
    const modal = page.locator('#typicalDayModal');
    await expect(childDetailsModal).toBeHidden();
    await expect(modal).toBeHidden();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(childDetailsModal).toBeVisible();
    await expect(modal).toBeHidden();
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(childDetailsModal).toBeVisible();
    await expect(page).not.toHaveURL(/childAge=/);
    await page.getByRole('spinbutton', { name: 'Age' }).fill('5');
    await page.getByRole('combobox', { name: 'Sex' }).selectOption('female');
    await page.getByRole('button', { name: 'Continue' }).click();
    await expect(page).toHaveURL(/childAge=5/);
    await expect(page).toHaveURL(/childSex=female/);
    await expect(childDetailsModal).toBeHidden();
    await expect(modal).toBeVisible();
    await expect(page.getByText('An important part of this project is to find out how children spend their time during the week.')).toBeVisible();

    await page.getByRole('button', { name: 'Yes, yesterday was typical.' }).click();
    await expect(page).toHaveURL(/typicalday=typical/);
    await expect(page).toHaveURL(/childAge=5/);
    await expect(page).toHaveURL(/childSex=female/);
  });

  test('includes child age and sex in the submitted CSV', async ({ page }) => {
    let csvData;
    await page.route('https://pipe.jspsych.org/api/data/', async (route) => {
      csvData = route.request().postDataJSON().data;
      await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    });

    await page.goto('/?instructions=completed&childAge=5&childSex=female');
    await page.waitForFunction(() => window.timelineManager?.keys?.length > 0);
    await page.evaluate(() => {
      const timelineKey = window.timelineManager.keys[0];
      window.timelineManager.activities[timelineKey] = [{
        activity: 'Test activity',
        category: 'Test category',
        startTime: '2026-11-10 08:00',
        endTime: '2026-11-10 09:00'
      }];
      window.timelineManager.general.primary_redirect_url = null;
    });

    await page.evaluate(async () => {
      const { sendData } = await import('/js/utils.js');
      await sendData({ mode: 'datapipe' });
    });

    expect(csvData).toContain('childAge');
    expect(csvData).toContain('childSex');
    expect(csvData).toContain('5,female');
  });
});
