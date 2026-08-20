import { test, expect } from '@playwright/test';

test.describe('Typical-day modal', () => {
  test('requires an answer and preserves the selected response', async ({ page }) => {
    await page.goto('/pages/instructions.html');

    const modal = page.locator('#typicalDayModal');
    await expect(modal).toBeHidden();

    await page.getByRole('button', { name: 'Start' }).click();
    await expect(modal).toBeVisible();
    await expect(page.getByText('An important part of this project is to find out how children spend their time during the week.')).toBeVisible();
    await expect(page).toHaveURL(/pages\/instructions\.html/);

    await page.getByRole('button', { name: 'Yes, yesterday was typical.' }).click();
    await expect(page).toHaveURL(/typicalday=typical/);
  });
});

