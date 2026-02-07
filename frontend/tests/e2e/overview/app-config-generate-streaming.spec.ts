import { expect, test } from "@playwright/test";

import { ensureAppReady, seedLocalStorage } from "../helpers";

test("streaming generation updates the app preview incrementally", async ({
  page,
}) => {
  const title1 = `Streaming One ${Date.now()}`;
  const title2 = `Streaming Two ${Date.now()}`;

  await page.addInitScript(({ nextTitle1, nextTitle2 }) => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (url.includes("/api/streamAppSpec")) {
        const encoder = new TextEncoder();
        const patch1 = {
          op: "set",
          path: "/elements/stream-root",
          value: {
            key: "stream-root",
            type: "Card",
            props: {
              title: nextTitle1,
              description: "First streaming patch.",
            },
            children: [],
          },
        };
        const patch2 = { op: "set", path: "/root", value: "stream-root" };
        const patch3 = {
          op: "set",
          path: "/elements/stream-root/props",
          value: {
            title: nextTitle2,
            description: "Second streaming patch.",
          },
        };
        const chunk1 = `${JSON.stringify(patch1)}\n${JSON.stringify(patch2)}\n`;
        const chunk2 = `${JSON.stringify(patch3)}\n`;
        const body = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(chunk1));
            // Leave enough time for the test to observe the intermediate UI.
            setTimeout(() => controller.enqueue(encoder.encode(chunk2)), 4000);
            setTimeout(() => controller.close(), 4200);
          },
        });
        return new Response(body, {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        });
      }
      return originalFetch(input, init);
    };
  }, { nextTitle1: title1, nextTitle2: title2 });

  await seedLocalStorage(page, { overviewTab: "App", overviewVis: true });
  await ensureAppReady(page);

  await expect(page.getByText("App Config")).toBeVisible();

  const showPreviewButton = page.getByRole("button", { name: "Show Preview" });
  if (await showPreviewButton.isVisible()) {
    await showPreviewButton.click();
  }
  await expect(page.getByText("App Preview")).toBeVisible();

  await page.getByRole("button", { name: "Generate (Streaming)" }).click();
  await expect(page.getByText("Streaming Generation")).toBeVisible();

  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByText("First streaming patch.")).toBeVisible({
    timeout: 10000,
  });
  await expect(page.getByText("Second streaming patch.")).toBeVisible({
    timeout: 10000,
  });
});
