import { expect, test, type Locator, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const CANVAS_SELECTOR = ".canvas-flow__canvas";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const WEBGL_RENDERER = "webgl-texture-nodes";

test("CanvasFlow WebGL Settings nodes stay interactive and reuse textures", async ({
  page,
}) => {
  test.setTimeout(180000);
  await installCanvasFlowRendererInitScript(page);
  await ensureAppReady(page);
  await gotoSettingsAllWebgl(page);

  const canvas = page.locator(CANVAS_SELECTOR);
  await expect(canvas).toBeVisible({ timeout: 180000 });
  await expect(canvas).toHaveAttribute("data-renderer-mode", WEBGL_RENDERER);
  await expect(canvas).toHaveAttribute("data-webgl-context-created", "true");

  await flushCanvasPaint(page);
  const warmedUploads = await readCanvasDatasetNumber(
    page,
    "webglTextureUploadsTotal",
  );
  expect(warmedUploads).toBeGreaterThan(0);

  await clickSettingsButtonLikeControl(page);
  await fillSettingsTextInput(page);
  await toggleSettingsCheckboxOrSwitch(page);
  await openSettingsComboboxOrPopover(page);
  await scrollSettingsNodeBody(page);
  await verifyKeyboardFocusInSettingsNode(page);
  await zoomCanvasFlowToward(page, 0.5);
  await verifyKeyboardFocusInSettingsNode(page);
  await dragFirstSettingsNode(page);

  const uploadsBeforeViewportGesture = await readCanvasDatasetNumber(
    page,
    "webglTextureUploadsTotal",
  );
  const frameBeforeViewportGesture = await readCanvasDatasetNumber(
    page,
    "webglFrame",
  );
  await dispatchCanvasWheelZoom(page);
  await expect
    .poll(async () => await readCanvasDatasetNumber(page, "webglFrame"))
    .toBeGreaterThan(frameBeforeViewportGesture);
  expect(await readCanvasDatasetNumber(page, "drawElementImageMs")).toBe(0);
  expect(await readCanvasDatasetNumber(page, "webglTextureUploadsTotal")).toBe(
    uploadsBeforeViewportGesture,
  );
});

async function installCanvasFlowRendererInitScript(page: Page) {
  await page.addInitScript(() => {
    const renderer = new URL(window.location.href).searchParams.get(
      "__setta_canvasflow_renderer",
    );
    if (renderer === "webgl-texture-nodes") {
      (
        window as typeof window & {
          __settaCanvasFlowRenderer?: string;
        }
      ).__settaCanvasFlowRenderer = "webgl-texture-nodes";
    }
  });
}

async function gotoSettingsAllWebgl(page: Page) {
  const settingsUrl = new URL(SETTINGS_URL);
  settingsUrl.searchParams.set("__setta_canvasflow_renderer", WEBGL_RENDERER);
  await page.goto(settingsUrl.toString(), { waitUntil: "domcontentloaded" });
  await expect(page.locator(CANVAS_SELECTOR)).toBeVisible({ timeout: 180000 });
  await forceCanvasFlowZoomOnWheel(page);
  await page.locator(CANVAS_SELECTOR).evaluate((canvas) => {
    (canvas as HTMLCanvasElement).dataset.canvasFlowDiagnostics = "enabled";
  });
  const allSettingsTab = page.getByRole("button", {
    exact: true,
    name: "All Settings",
  });
  await expect(allSettingsTab).toBeVisible({ timeout: 180000 });
  await allSettingsTab.click();
  await expect
    .poll(async () => await readCanvasDatasetNumber(page, "registeredNodes"), {
      timeout: 180000,
    })
    .toBeGreaterThan(13);
}

async function forceCanvasFlowZoomOnWheel(page: Page) {
  await page.evaluate(async () => {
    const { useSettings } = await import("/src/state/definitions.ts");
    useSettings.setState((state) => ({
      gui: {
        ...state.gui,
        panOnScroll: false,
        zoomOnScroll: true,
      },
    }));
  });
}

async function clickSettingsButtonLikeControl(page: Page) {
  const button = await findFirstEnabledVisible(
    page,
    '.canvas-flow__node button[aria-haspopup="menu"]:visible',
  );
  await expect(button).toBeVisible({ timeout: 30000 });
  const beforeUploads = await readCanvasDatasetNumber(
    page,
    "webglTextureUploadsTotal",
  );
  await button.click({ force: true, timeout: 10000 });
  await page.keyboard.press("Escape");
  await expect
    .poll(
      async () =>
        await readCanvasDatasetNumber(page, "webglTextureUploadsTotal"),
    )
    .toBeGreaterThanOrEqual(beforeUploads);
}

async function fillSettingsTextInput(page: Page) {
  const input = page
    .locator(
      '.canvas-flow__node :is(input[type="text"], input:not([type]), textarea):visible',
    )
    .first();
  await expect(input).toBeVisible({ timeout: 30000 });
  await input.fill("canvasflow webgl");
  await expect(input).toHaveValue("canvasflow webgl");
}

async function toggleSettingsCheckboxOrSwitch(page: Page) {
  const toggle = page
    .locator(
      '.canvas-flow__node :is([role="switch"], [role="checkbox"], input[type="checkbox"]):visible',
    )
    .first();
  await expect(toggle).toBeVisible({ timeout: 30000 });
  await toggle.click({ force: true, timeout: 10000 });
}

async function openSettingsComboboxOrPopover(page: Page) {
  const combobox = page
    .locator(
      '.canvas-flow__node :is([role="combobox"], [aria-haspopup="listbox"]):visible',
    )
    .first();
  await expect(combobox).toBeVisible({ timeout: 30000 });
  await combobox.click({ force: true, timeout: 10000 });
  await page
    .locator(
      ':is([role="listbox"], [role="option"], [data-radix-popper-content-wrapper])',
    )
    .first()
    .waitFor({ state: "visible", timeout: 1000 })
    .catch(() => undefined);
  await page.keyboard.press("Escape");
}

async function scrollSettingsNodeBody(page: Page) {
  const scrollTarget = page.locator('[data-canvas-flow-scroll-probe="true"]');
  const found = await page.evaluate(() => {
    const nodes = Array.from(
      document.querySelectorAll<HTMLElement>(".canvas-flow__node"),
    );
    for (const node of nodes) {
      const candidates = [
        node,
        ...Array.from(node.querySelectorAll<HTMLElement>("*")),
      ];
      for (const candidate of candidates) {
        const style = window.getComputedStyle(candidate);
        const canScroll =
          /(auto|scroll)/.test(style.overflowY) &&
          candidate.scrollHeight > candidate.clientHeight + 8;
        if (!canScroll) {
          continue;
        }
        candidate.scrollTop = 0;
        candidate.dataset.canvasFlowScrollProbe = "true";
        return true;
      }
    }
    return false;
  });
  expect(found).toBe(true);
  await expect(scrollTarget).toBeVisible({ timeout: 30000 });
  const box = await scrollTarget.boundingBox();
  if (!box) {
    throw new Error("Missing scrollable Settings node body bounding box.");
  }
  const before = await scrollTarget.evaluate((element) => element.scrollTop);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 180);
  await expect
    .poll(async () => scrollTarget.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(before);
}

async function verifyKeyboardFocusInSettingsNode(page: Page) {
  await page.keyboard.press("Escape");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    await page.keyboard.press("Tab");
    const focusState = await readCanvasFlowFocusState(page);
    if (focusState.inCanvasNode) {
      expect(focusState.withinCanvasBounds).toBe(true);
      expect(focusState.hasVisibleFocusStyle).toBe(true);
      return;
    }
  }
  throw new Error("Unable to keyboard-focus a visible Settings node control.");
}

async function readCanvasFlowFocusState(page: Page) {
  return page.evaluate((canvasSelector) => {
    const active = document.activeElement;
    const canvas = document.querySelector<HTMLCanvasElement>(canvasSelector);
    if (!(active instanceof HTMLElement) || !canvas) {
      return {
        hasVisibleFocusStyle: false,
        inCanvasNode: false,
        withinCanvasBounds: false,
      };
    }
    const node = active.closest(".canvas-flow__node");
    const activeRect = active.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const style = window.getComputedStyle(active);
    const hasVisibleFocusStyle =
      active.matches(":focus-visible") ||
      style.outlineStyle !== "none" ||
      style.boxShadow !== "none";
    const withinCanvasBounds =
      activeRect.right >= canvasRect.left &&
      activeRect.left <= canvasRect.right &&
      activeRect.bottom >= canvasRect.top &&
      activeRect.top <= canvasRect.bottom;
    return {
      hasVisibleFocusStyle,
      inCanvasNode: Boolean(node),
      withinCanvasBounds,
    };
  }, CANVAS_SELECTOR);
}

async function findFirstEnabledVisible(
  page: Page,
  selector: string,
): Promise<Locator> {
  const candidates = page.locator(selector);
  const count = Math.min(await candidates.count(), 80);
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates.nth(index);
    if (
      (await candidate.isVisible().catch(() => false)) &&
      (await candidate.isEnabled().catch(() => false))
    ) {
      return candidate;
    }
  }
  throw new Error(
    `No enabled visible CanvasFlow Settings control: ${selector}`,
  );
}

async function dragFirstSettingsNode(page: Page) {
  const node = page.locator(".canvas-flow__node").first();
  await expect(node).toBeVisible({ timeout: 30000 });
  const frameBeforeDrag = await readCanvasDatasetNumber(page, "webglFrame");
  const box = await node.boundingBox();
  if (!box) {
    throw new Error("Missing Settings node bounding box.");
  }
  await page.mouse.move(box.x + 18, box.y + 18);
  await page.mouse.down();
  await page.mouse.move(box.x + 58, box.y + 38, { steps: 8 });
  await page.mouse.up();
  await expect
    .poll(async () => await readCanvasDatasetNumber(page, "webglFrame"))
    .toBeGreaterThanOrEqual(frameBeforeDrag);
}

async function zoomCanvasFlowToward(page: Page, targetZoom: number) {
  const canvas = page.locator(CANVAS_SELECTOR);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const currentZoom = await readCanvasDatasetNumber(page, "viewportZoom");
    if (
      (currentZoom > targetZoom && currentZoom <= targetZoom + 0.08) ||
      (currentZoom <= targetZoom && currentZoom >= targetZoom - 0.08)
    ) {
      return;
    }
    await canvas.evaluate((element, target) => {
      const zoom = Number.parseFloat(
        (element as HTMLCanvasElement).dataset.viewportZoom ?? "1",
      );
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(
        new WheelEvent("wheel", {
          bubbles: true,
          cancelable: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
          deltaMode: WheelEvent.DOM_DELTA_PIXEL,
          deltaY: zoom > target ? 220 : -220,
        }),
      );
    }, targetZoom);
    await page.waitForTimeout(90);
  }
}

async function flushCanvasPaint(page: Page) {
  await page.evaluate(async (selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (!canvas) {
      throw new Error("Missing CanvasFlow canvas.");
    }
    const previousFrame = Number.parseInt(canvas.dataset.webglFrame ?? "0", 10);
    (
      canvas as HTMLCanvasElement & { requestPaint?: () => void }
    ).requestPaint?.();
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const frame = Number.parseInt(canvas.dataset.webglFrame ?? "0", 10);
      if (frame > previousFrame) {
        return;
      }
    }
  }, CANVAS_SELECTOR);
}

async function dispatchCanvasWheelZoom(page: Page) {
  await page.evaluate(async (selector) => {
    const canvas = document.querySelector<HTMLCanvasElement>(selector);
    if (!canvas) {
      throw new Error("Missing CanvasFlow canvas.");
    }
    const rect = canvas.getBoundingClientRect();
    const event = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      deltaY: -96,
    });
    canvas.dispatchEvent(event);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  }, CANVAS_SELECTOR);
}

async function readCanvasDatasetNumber(page: Page, key: string) {
  return page.locator(CANVAS_SELECTOR).evaluate((canvas, datasetKey) => {
    const parsed = Number.parseFloat(
      (canvas as HTMLCanvasElement).dataset[datasetKey as string] ?? "0",
    );
    return Number.isFinite(parsed) ? parsed : 0;
  }, key);
}
