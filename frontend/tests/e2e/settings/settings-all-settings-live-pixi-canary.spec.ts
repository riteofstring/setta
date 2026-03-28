import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL);
const READY_SELECTOR = ".react-flow__pane";
const LIVE_DICT_AREA_RENDERER_STORAGE_KEY = "setta.liveDictAreaRendererMode";
const LIVE_PIXI_MODE = "pixi-node-body";

test("all settings canary can replace the live dict-area body with a Pixi scene host", async ({
  page,
}) => {
  await ensureAppReady(page);

  await page.addInitScript(
    ({ mode, storageKey }) => {
      window.sessionStorage.setItem(storageKey, mode);
    },
    {
      mode: LIVE_PIXI_MODE,
      storageKey: LIVE_DICT_AREA_RENDERER_STORAGE_KEY,
    },
  );

  const url = new URL(SETTINGS_URL);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allSettingsTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allSettingsTab).toBeVisible();
  await allSettingsTab.click();

  const metrics = await page.waitForFunction(() => {
    const sceneRoot = document.querySelector<HTMLElement>(
      "[data-live-dict-area-render-mode='pixi-node-body']",
    );
    if (!sceneRoot) {
      return null;
    }
    const sceneHost = sceneRoot.querySelector<HTMLElement>(
      "[data-live-dict-area-scene='pixi']",
    );
    const sceneCanvas = sceneHost?.querySelector("canvas");
    if (!sceneHost || !sceneCanvas) {
      return null;
    }

    return {
      localParamContainerCount: sceneRoot.querySelectorAll(
        '[id^="ParamContainer-"]',
      ).length,
      rowCount: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-row-count") ?? "0",
        10,
      ),
      sceneBlockCount: Number.parseInt(
        sceneHost.getAttribute("data-live-dict-area-scene-block-count") ?? "0",
        10,
      ),
    };
  });

  const result = await metrics.jsonValue();

  expect(result).not.toBeNull();
  expect(result?.sceneBlockCount).toBeGreaterThan(0);
  expect(result?.rowCount).toBeGreaterThan(0);
  expect(result?.localParamContainerCount).toBe(0);
});
