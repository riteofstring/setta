import { expect, test } from "@playwright/test";

import { ensureAppReady } from "./helpers";

test("header tooltip hint is hidden", async ({ page }) => {
  await ensureAppReady(page);

  await expect(page.getByText(/for tool tips/i)).toHaveCount(0);
});
