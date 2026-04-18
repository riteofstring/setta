import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const TARGET_SECTION_ID = "settings-section__callableSectionDefault";

test("canvas shell path owns the resting callable section chrome", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();

  await page.waitForFunction((sectionId) => {
    const header = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"] header.section-title`,
    );
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".react-flow__section-shell-backdrop canvas",
    );
    return (
      document.querySelector(`section[data-section-id="${sectionId}"]`) !==
        null &&
      document.getElementById(`${sectionId}-CustomResizable`) !== null &&
      canvas !== null &&
      canvas.clientWidth > 0 &&
      canvas.clientHeight > 0 &&
      canvas.width > 0 &&
      canvas.height > 0 &&
      (header?.offsetHeight ?? 0) > 0
    );
  }, TARGET_SECTION_ID);

  const shellState = await page.evaluate((sectionId) => {
    const outer = document.querySelector<HTMLElement>(
      `section[data-section-id="${sectionId}"]`,
    );
    const inner = document.getElementById(`${sectionId}-CustomResizable`);
    const header = outer?.querySelector<HTMLElement>("header.section-title");
    const node = outer?.closest<HTMLElement>(".react-flow__node");
    const canvas = document.querySelector(
      ".react-flow__section-shell-backdrop canvas",
    );

    if (!(outer instanceof HTMLElement)) {
      throw new Error(`Missing outer shell for ${sectionId}`);
    }
    if (!(inner instanceof HTMLElement)) {
      throw new Error(`Missing inner shell for ${sectionId}`);
    }
    if (!(header instanceof HTMLElement)) {
      throw new Error(`Missing section header for ${sectionId}`);
    }
    if (!(node instanceof HTMLElement)) {
      throw new Error(`Missing React Flow node wrapper for ${sectionId}`);
    }
    if (!(canvas instanceof HTMLCanvasElement)) {
      throw new Error("Missing retained shell canvas");
    }

    const outerStyle = window.getComputedStyle(outer);
    const innerStyle = window.getComputedStyle(inner);
    const innerBeforeStyle = window.getComputedStyle(inner, "::before");
    const canvasContext = canvas.getContext("2d");

    if (!canvasContext) {
      throw new Error("Missing retained shell canvas context");
    }

    const nodeTransform = window.getComputedStyle(node).transform;
    const transformMatch = /^matrix\(([^)]+)\)$/.exec(nodeTransform);

    if (!transformMatch) {
      throw new Error(`Unexpected node transform for ${sectionId}: ${nodeTransform}`);
    }

    const [, transformBody] = transformMatch;
    const matrixParts = transformBody
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));

    if (matrixParts.length < 6 || matrixParts.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid node transform matrix for ${sectionId}: ${nodeTransform}`);
    }

    const nodeX = matrixParts[4];
    const nodeY = matrixParts[5];
    const canvasLeft = Number.parseFloat(canvas.style.left);
    const canvasTop = Number.parseFloat(canvas.style.top);
    const canvasScaleX = canvas.width / canvas.clientWidth;
    const canvasScaleY = canvas.height / canvas.clientHeight;
    const headerHeight = header.offsetHeight;
    const sampleX =
      (nodeX - canvasLeft + Math.min(Math.max(inner.offsetWidth * 0.2, 24), 48)) *
      canvasScaleX;
    const headerSampleY =
      (nodeY - canvasTop + Math.min(Math.max(headerHeight * 0.5, 6), 18)) *
      canvasScaleY;
    const bodySampleY = Math.min(
      (nodeY - canvasTop + inner.offsetHeight - 12) * canvasScaleY,
      (nodeY - canvasTop + headerHeight + Math.max(12, headerHeight * 0.4)) *
        canvasScaleY,
    );

    function sampleCanvasPixel(canvasX: number, canvasY: number) {
      const clampedX = Math.max(
        0,
        Math.min(canvas.width - 1, Math.round(canvasX)),
      );
      const clampedY = Math.max(
        0,
        Math.min(canvas.height - 1, Math.round(canvasY)),
      );
      const [r, g, b, a] = canvasContext.getImageData(
        clampedX,
        clampedY,
        1,
        1,
      ).data;
      return `${r},${g},${b},${a}`;
    }

    return {
      bodyPixel: sampleCanvasPixel(sampleX, bodySampleY),
      headerHeight,
      headerPixel: sampleCanvasPixel(sampleX, headerSampleY),
      outerOwnershipFlag: outer.dataset.canvasOwnedShell ?? null,
      innerOwnershipFlag: inner.dataset.canvasOwnedShell ?? null,
      outerBackground: outerStyle.backgroundColor,
      outerBorderColor: outerStyle.borderTopColor,
      innerBackground: innerStyle.backgroundColor,
      innerBeforeBorderWidth: innerBeforeStyle.borderTopWidth,
    };
  }, TARGET_SECTION_ID);

  expect(shellState.outerOwnershipFlag).toBe("true");
  expect(shellState.innerOwnershipFlag).toBe("true");
  expect(shellState.outerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.outerBorderColor).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.innerBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.innerBeforeBorderWidth).toBe("0px");
  expect(shellState.headerHeight).toBeGreaterThan(0);
  expect(shellState.headerPixel).not.toBe("0,0,0,0");
  expect(shellState.bodyPixel).not.toBe("0,0,0,0");
  expect(shellState.headerPixel).not.toBe(shellState.bodyPixel);
});
