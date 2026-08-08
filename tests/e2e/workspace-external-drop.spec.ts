import { AxeBuilder } from "@axe-core/playwright";
import { expect, test, type JSHandle, type Locator, type Page } from "@playwright/test";

const EXTERNAL_SAMPLE_MIME = "application/x-setta-workspace-sample";

type ClientPoint = Readonly<{ x: number; y: number }>;

async function externalTransfer(
  page: Page,
  type: string,
  value: string,
  includeFile = false,
): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle(
    ({ file, mime, payload }) => {
      const transfer = new DataTransfer();
      transfer.setData(mime, payload);
      if (file) {
        transfer.items.add(new File(["sample"], "sample.txt", { type: "text/plain" }));
      }
      return transfer;
    },
    { file: includeFile, mime: type, payload: value },
  );
}

async function previewExternalDrop(
  target: Locator,
  dataTransfer: JSHandle<DataTransfer>,
  point: ClientPoint,
): Promise<void> {
  const eventInit = { clientX: point.x, clientY: point.y, dataTransfer };
  await target.dispatchEvent("dragenter", eventInit);
  await target.dispatchEvent("dragover", eventInit);
}

async function trackGeometryReads(target: Locator): Promise<void> {
  await target.evaluate((element) => {
    const original = element.getBoundingClientRect.bind(element);
    let reads = 0;
    element.setAttribute("data-test-geometry-reads", "0");
    element.getBoundingClientRect = () => {
      reads += 1;
      element.setAttribute("data-test-geometry-reads", String(reads));
      return original();
    };
  });
}

async function geometryReads(target: Locator): Promise<number> {
  return target.evaluate((element) => Number(element.getAttribute("data-test-geometry-reads")));
}

test("generic external drops expose feedback and hand accepted data to the host", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");

  const canvas = page.getByRole("application", { name: "Section workspace canvas" });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Workspace canvas must have browser geometry.");
  }
  const point = {
    x: Math.round(canvasBox.x + canvasBox.width * 0.68),
    y: Math.round(canvasBox.y + canvasBox.height * 0.42),
  };
  const acceptedTransfer = await externalTransfer(
    page,
    EXTERNAL_SAMPLE_MIME,
    "Imported through the generic host callback.",
    true,
  );
  await previewExternalDrop(canvas, acceptedTransfer, point);

  await expect(canvas).toHaveAttribute("data-workspace-external-drop-state", "valid");
  const validFeedback = page.locator('[data-workspace-external-drop-feedback="valid"]');
  await expect(validFeedback).toContainText("Drop allowed");
  await expect(validFeedback).toContainText("Import sample note");
  await expect(page.locator('[data-workspace-external-drop-target="canvas"]')).toHaveAttribute(
    "data-workspace-external-drop-valid",
    "true",
  );
  const accessibility = await new AxeBuilder({ page }).include("[data-setta-workspace]").analyze();
  expect(accessibility.violations).toEqual([]);
  await expect(page.locator("[data-setta-workspace]")).toHaveScreenshot(
    "external-drop-feedback.png",
  );

  await canvas.dispatchEvent("drop", {
    clientX: point.x,
    clientY: point.y,
    dataTransfer: acceptedTransfer,
  });
  const imported = page.getByRole("article", { name: "Imported section 1" });
  await expect(imported).toBeVisible();
  await expect(imported).toContainText("Imported through the generic host callback.");
  await expect(canvas).toHaveAttribute("data-workspace-external-drop-state", "idle");
  await expect(page.locator(".announcement")).toContainText(EXTERNAL_SAMPLE_MIME);
  await expect(page.locator(".announcement")).toContainText("with 1 file");
  await expect(page.locator(".announcement")).toContainText("on the canvas at index 0");
  const importedBox = await imported.boundingBox();
  if (!importedBox) {
    throw new Error("Imported section must have browser geometry.");
  }
  expect(Math.abs(importedBox.x - point.x)).toBeLessThan(2);
  expect(Math.abs(importedBox.y - point.y)).toBeLessThan(2);

  await trackGeometryReads(imported);
  const rejectedTransfer = await externalTransfer(page, "text/plain", "Unsupported");
  await previewExternalDrop(canvas, rejectedTransfer, {
    x: point.x - 120,
    y: point.y + 120,
  });
  await expect(canvas).toHaveAttribute("data-workspace-external-drop-state", "invalid");
  await expect(page.locator('[data-workspace-external-drop-feedback="invalid"]')).toContainText(
    "Only sample-note drops are supported here.",
  );
  await canvas.dispatchEvent("drop", {
    clientX: point.x - 120,
    clientY: point.y + 120,
    dataTransfer: rejectedTransfer,
  });
  await expect(page.getByRole("article")).toHaveCount(1);
  expect(await geometryReads(imported)).toBe(1);

  const optedOutContent = imported.locator(".sample-section-copy");
  const optedOutBox = await optedOutContent.boundingBox();
  if (!optedOutBox) {
    throw new Error("Opted-out host content must have browser geometry.");
  }
  await previewExternalDrop(optedOutContent, acceptedTransfer, {
    x: optedOutBox.x + 8,
    y: optedOutBox.y + 8,
  });
  await expect(canvas).toHaveAttribute("data-workspace-external-drop-state", "idle");
  await expect(page.locator("[data-workspace-external-drop-feedback]")).toHaveCount(0);
  await optedOutContent.dispatchEvent("drop", {
    clientX: optedOutBox.x + 8,
    clientY: optedOutBox.y + 8,
    dataTransfer: acceptedTransfer,
  });
  await expect(page.getByRole("article")).toHaveCount(1);
});

test("read-only external-drop feedback reflows without invoking the host", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/?read-only");

  const canvas = page.getByRole("application", { name: "Section workspace canvas" });
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) {
    throw new Error("Read-only workspace canvas must have browser geometry.");
  }
  const point = {
    x: Math.round(canvasBox.x + canvasBox.width / 2),
    y: Math.round(canvasBox.y + canvasBox.height / 2),
  };
  const transfer = await externalTransfer(page, EXTERNAL_SAMPLE_MIME, "Unavailable import");
  await previewExternalDrop(canvas, transfer, point);

  await expect(canvas).toHaveAttribute("data-workspace-external-drop-state", "invalid");
  const feedback = page.locator('[data-workspace-external-drop-feedback="invalid"]');
  await expect(feedback).toContainText(
    "Dropped content cannot be added while structure editing is off.",
  );
  const feedbackBox = await feedback.boundingBox();
  if (!feedbackBox) {
    throw new Error("External-drop feedback must have browser geometry.");
  }
  expect(feedbackBox.x).toBeGreaterThanOrEqual(0);
  expect(feedbackBox.x + feedbackBox.width).toBeLessThanOrEqual(320);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await canvas.dispatchEvent("drop", {
    clientX: point.x,
    clientY: point.y,
    dataTransfer: transfer,
  });
  await expect(page.getByRole("article")).toHaveCount(0);
  await expect(canvas).toHaveAttribute("data-workspace-external-drop-state", "idle");
});
