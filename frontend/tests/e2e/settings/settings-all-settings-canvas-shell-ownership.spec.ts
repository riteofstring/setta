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
    const kwargsControls = outer?.querySelector<HTMLElement>(".section-args");
    const node = outer?.closest<HTMLElement>(".react-flow__node");
    const viewport = node?.closest<HTMLElement>(".react-flow__viewport");
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
    if (!(kwargsControls instanceof HTMLElement)) {
      throw new Error(`Missing callable toolbar for ${sectionId}`);
    }
    if (!(node instanceof HTMLElement)) {
      throw new Error(`Missing React Flow node wrapper for ${sectionId}`);
    }
    if (!(viewport instanceof HTMLElement)) {
      throw new Error(`Missing React Flow viewport for ${sectionId}`);
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
    const viewportTransform = window.getComputedStyle(viewport).transform;
    const nodeTransformMatch = /^matrix\(([^)]+)\)$/.exec(nodeTransform);
    const viewportTransformMatch = /^matrix\(([^)]+)\)$/.exec(viewportTransform);

    if (!nodeTransformMatch) {
      throw new Error(`Unexpected node transform for ${sectionId}: ${nodeTransform}`);
    }
    if (!viewportTransformMatch) {
      throw new Error(
        `Unexpected viewport transform for ${sectionId}: ${viewportTransform}`,
      );
    }

    const [, nodeTransformBody] = nodeTransformMatch;
    const nodeMatrixParts = nodeTransformBody
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));
    const [, viewportTransformBody] = viewportTransformMatch;
    const viewportMatrixParts = viewportTransformBody
      .split(",")
      .map((value) => Number.parseFloat(value.trim()));

    if (
      nodeMatrixParts.length < 6 ||
      nodeMatrixParts.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(`Invalid node transform matrix for ${sectionId}: ${nodeTransform}`);
    }
    if (
      viewportMatrixParts.length < 6 ||
      viewportMatrixParts.some((value) => !Number.isFinite(value))
    ) {
      throw new Error(
        `Invalid viewport transform matrix for ${sectionId}: ${viewportTransform}`,
      );
    }

    const viewportScale = viewportMatrixParts[0];
    if (!Number.isFinite(viewportScale) || viewportScale <= 0) {
      throw new Error(
        `Invalid viewport scale for ${sectionId}: ${viewportTransform}`,
      );
    }

    const nodeX = nodeMatrixParts[4];
    const nodeY = nodeMatrixParts[5];
    const canvasLeft = Number.parseFloat(canvas.style.left);
    const canvasTop = Number.parseFloat(canvas.style.top);
    const canvasScaleX = canvas.width / canvas.clientWidth;
    const canvasScaleY = canvas.height / canvas.clientHeight;
    const nodeRect = node.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const kwargsRect = kwargsControls.getBoundingClientRect();
    const headerOffsetX = (headerRect.left - nodeRect.left) / viewportScale;
    const headerOffsetY = (headerRect.top - nodeRect.top) / viewportScale;
    const headerWidth = headerRect.width / viewportScale;
    const headerHeight = headerRect.height / viewportScale;
    const kwargsOffsetX = (kwargsRect.left - nodeRect.left) / viewportScale;
    const kwargsOffsetY = (kwargsRect.top - nodeRect.top) / viewportScale;
    const kwargsWidth = kwargsRect.width / viewportScale;
    const kwargsHeight = kwargsRect.height / viewportScale;
    const headerSampleX =
      (nodeX - canvasLeft + headerOffsetX + headerWidth * 0.5) * canvasScaleX;
    const headerSampleY =
      (nodeY - canvasTop + headerOffsetY + headerHeight * 0.5) * canvasScaleY;
    const bodySampleX =
      (nodeX - canvasLeft + Math.min(inner.offsetWidth * 0.6, inner.offsetWidth - 24)) *
      canvasScaleX;
    const bodySampleY =
      (nodeY -
        canvasTop +
        Math.min(inner.offsetHeight - 24, kwargsOffsetY + kwargsHeight + 24)) *
      canvasScaleY;
    const kwargsSampleX =
      (nodeX - canvasLeft + kwargsOffsetX + kwargsWidth * 0.72) * canvasScaleX;
    const kwargsSampleY =
      (nodeY - canvasTop + kwargsOffsetY + kwargsHeight * 0.5) * canvasScaleY;

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

    const kwargsStyle = window.getComputedStyle(kwargsControls);

    return {
      bodyPixel: sampleCanvasPixel(bodySampleX, bodySampleY),
      headerHeight,
      headerPixel: sampleCanvasPixel(headerSampleX, headerSampleY),
      kwargsBottomBorderColor: kwargsStyle.borderBottomColor,
      kwargsOwnershipFlag:
        kwargsControls.dataset.canvasOwnedCallableToolbar ?? null,
      kwargsPixel: sampleCanvasPixel(kwargsSampleX, kwargsSampleY),
      kwargsShadow: kwargsStyle.boxShadow,
      kwargsToolbarBackground: kwargsStyle.backgroundColor,
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
  expect(shellState.kwargsOwnershipFlag).toBe("true");
  expect(shellState.kwargsToolbarBackground).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.kwargsBottomBorderColor).toBe("rgba(0, 0, 0, 0)");
  expect(shellState.kwargsShadow).toBe("none");
  expect(shellState.kwargsPixel).not.toBe("0,0,0,0");
  expect(shellState.kwargsPixel).not.toBe(shellState.bodyPixel);
});
