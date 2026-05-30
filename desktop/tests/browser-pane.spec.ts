import { test, expect, _electron as electron } from "@playwright/test";
import { join, resolve } from "node:path";

import type { BrowserPaneSnapshot } from "../src/shared/types";

const desktopRoot = resolve(__dirname, "..");

test("WebContentsView browser pane supports phase 1 automation", async () => {
  const electronApp = await electron.launch({
    args: [join(desktopRoot, "out/main/index.js")],
    cwd: desktopRoot,
    env: {
      ...process.env,
      SETTA_BACKEND_READY_TIMEOUT_MS: "20000",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await page.waitForSelector('[data-testid="browser-pane-host"]');
    await page.waitForFunction(() => window.setta !== undefined);
    await expect(page.getByTestId("backend-status")).toContainText("Online", { timeout: 20000 });

    await page.evaluate(() => window.setta.browserPane.loadPreview());
    await page.evaluate(() => window.setta.browserPane.focus());

    const title = await page.evaluate(() => window.setta.browserPane.inspect("#preview-title"));
    expect(title).toMatchObject({
      documentHasFocus: true,
      tagName: "h1",
      text: "Setta Preview",
      title: "Setta Browser Preview",
    });

    const button = await page.evaluate(() => window.setta.browserPane.inspect("#preview-action"));
    const point = centerPoint(requireSnapshot(button).rect);
    await page.evaluate((clickPoint) => window.setta.browserPane.click(clickPoint), point);
    const clicked = await page.evaluate(() => window.setta.browserPane.inspect("#preview-action"));
    expect(clicked?.text).toBe("Click 1");

    const input = await page.evaluate(() => window.setta.browserPane.inspect("#preview-input"));
    await page.evaluate(
      (inputPoint) => window.setta.browserPane.click(inputPoint),
      centerPoint(requireSnapshot(input).rect),
    );
    await page.evaluate(() => window.setta.browserPane.typeText("smoke"));
    const typed = await page.evaluate(() => window.setta.browserPane.inspect("#preview-input"));
    expect(typed?.value).toBe("smoke");

    const screenshot = await page.evaluate(() => window.setta.browserPane.captureScreenshot());
    expect(screenshot.pngBytes).toBeGreaterThan(1000);
    expect(screenshot.width).toBeGreaterThan(100);
    expect(screenshot.height).toBeGreaterThan(100);

    const events = await page.evaluate(() => window.setta.browserPane.events());
    expect(events.console).toContain("preview-ready");
    expect(events.console).toContain("preview-clicked:1");
    expect(events.network.some((entry) => entry.includes("browser-preview.html 200"))).toBe(true);

    const beforeResize = await page.evaluate(() => window.setta.browserPane.status());
    await page.setViewportSize({ height: 700, width: 1000 });
    await page.waitForTimeout(100);
    const afterResize = await page.evaluate(() => window.setta.browserPane.status());
    expect(afterResize.bounds.width).not.toBe(beforeResize.bounds.width);
  } finally {
    await electronApp.close();
  }
});

function centerPoint(rect: BrowserPaneSnapshot["rect"]) {
  return {
    x: Math.round(rect.x + rect.width / 2),
    y: Math.round(rect.y + rect.height / 2),
  };
}

function requireSnapshot(snapshot: BrowserPaneSnapshot | null) {
  if (!snapshot) {
    throw new Error("expected browser pane snapshot");
  }
  return snapshot;
}
