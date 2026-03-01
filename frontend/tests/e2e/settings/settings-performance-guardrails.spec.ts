import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";
import {
  collectSettingsDomMetrics,
  measureSettingsTabSwitchLongTasks,
  openSettingsTab,
  SETTINGS_READY_SELECTOR,
  SETTINGS_URL,
  type LongTaskMetrics,
  type SettingsDomMetrics,
} from "./perfScenario";

test("settings tab switching long-task cost stays within budget", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(SETTINGS_READY_SELECTOR);

  // This path captures the expensive transition into the largest settings view.
  const coreToAll = await measureSettingsTabSwitchLongTasks(page, {
    from: "Core",
    to: "All Settings",
  });
  const paramDefaultsToAll = await measureSettingsTabSwitchLongTasks(page, {
    from: "Param Defaults",
    to: "All Settings",
  });
  const allToCore = await measureSettingsTabSwitchLongTasks(page, {
    from: "All Settings",
    to: "Core",
  });

  const metrics: Record<string, LongTaskMetrics> = {
    coreToAll,
    paramDefaultsToAll,
    allToCore,
  };
  await test
    .info()
    .attach("settings-tab-switch-longtask-metrics.json", {
      body: JSON.stringify(metrics, null, 2),
      contentType: "application/json",
    });

  expect(coreToAll.totalLongTaskMs).toBeLessThanOrEqual(2800);
  expect(coreToAll.maxLongTaskMs).toBeLessThanOrEqual(1700);

  expect(paramDefaultsToAll.totalLongTaskMs).toBeLessThanOrEqual(3000);
  expect(paramDefaultsToAll.maxLongTaskMs).toBeLessThanOrEqual(1900);

  expect(allToCore.totalLongTaskMs).toBeLessThanOrEqual(1200);
  expect(allToCore.maxLongTaskMs).toBeLessThanOrEqual(900);
});

test("settings DOM complexity stays within guardrail budgets", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(SETTINGS_READY_SELECTOR);

  // We snapshot each tab separately so budgets track the heaviest known view.
  await openSettingsTab(page, "Core");
  const coreMetrics = await collectSettingsDomMetrics(page);

  await openSettingsTab(page, "Param Defaults");
  const paramDefaultsMetrics = await collectSettingsDomMetrics(page);

  await openSettingsTab(page, "All Settings");
  const allSettingsMetrics = await collectSettingsDomMetrics(page);

  const metrics: Record<string, SettingsDomMetrics> = {
    core: coreMetrics,
    paramDefaults: paramDefaultsMetrics,
    allSettings: allSettingsMetrics,
  };
  await test.info().attach("settings-dom-metrics.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });

  expect(coreMetrics.allElements).toBeLessThanOrEqual(5000);
  expect(coreMetrics.nodeCount).toBeLessThanOrEqual(10);
  expect(coreMetrics.paramRows).toBeLessThanOrEqual(360);

  expect(paramDefaultsMetrics.allElements).toBeLessThanOrEqual(3000);
  expect(paramDefaultsMetrics.nodeCount).toBeLessThanOrEqual(20);
  expect(paramDefaultsMetrics.paramRows).toBeLessThanOrEqual(150);

  expect(allSettingsMetrics.allElements).toBeLessThanOrEqual(11000);
  expect(allSettingsMetrics.nodeCount).toBeLessThanOrEqual(60);
  expect(allSettingsMetrics.paramRows).toBeLessThanOrEqual(850);
  expect(allSettingsMetrics.maxDepth).toBeLessThanOrEqual(34);
  expect(allSettingsMetrics.maxChildren).toBeLessThanOrEqual(220);
});
