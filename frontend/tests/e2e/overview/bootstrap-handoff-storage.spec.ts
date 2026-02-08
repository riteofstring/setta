import { expect, test } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";

test("bootstrap does not persist handoff values before consuming a token", async ({
  page,
}) => {
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap`, {
    waitUntil: "domcontentloaded",
  });
  await page.evaluate(() => {
    localStorage.removeItem("setta.launcherOrigin");
    localStorage.removeItem("setta.workspaceHistoryHandoff");
  });

  const launcherOrigin = encodeURIComponent("http://attacker.example:9999");
  await page.goto(
    `${BACKEND_ORIGIN}/__setta__/bootstrap#lo=${launcherOrigin}&wh=payload`,
    {
      waitUntil: "domcontentloaded",
    },
  );

  const stored = await page.evaluate(() => {
    return {
      launcherOrigin: localStorage.getItem("setta.launcherOrigin"),
      workspaceHistoryHandoff: localStorage.getItem(
        "setta.workspaceHistoryHandoff",
      ),
    };
  });

  expect(stored.launcherOrigin).toBeNull();
  expect(stored.workspaceHistoryHandoff).toBeNull();
});
