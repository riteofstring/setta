import { expect, type Page } from "@playwright/test";

export const SETTINGS_READY_SELECTOR = ".react-flow__pane";

export const SETTINGS_BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
export const SETTINGS_URL = new URL("/settings", SETTINGS_BASE_URL).toString();

export type SettingsTabName = "Core" | "Param Defaults" | "All Settings";

export type SettingsDomMetrics = {
  allElements: number;
  nodeCount: number;
  paramRows: number;
  maxChildren: number;
  maxDepth: number;
};

export type LongTaskMetrics = {
  from: SettingsTabName;
  to: SettingsTabName;
  observedWindowMs: number;
  longTaskCount: number;
  totalLongTaskMs: number;
  maxLongTaskMs: number;
};

export async function openSettingsTab(
  page: Page,
  tabName: SettingsTabName,
): Promise<void> {
  const tab = page.getByRole("button", { name: tabName, exact: true });
  await expect(tab).toBeVisible();
  await tab.click();
  await waitForSettingsTabReady(page, tabName);
}

export async function waitForSettingsTabReady(
  page: Page,
  tabName: SettingsTabName,
): Promise<void> {
  if (tabName === "Core") {
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 5,
    );
    return;
  }

  if (tabName === "Param Defaults") {
    await page.waitForFunction(
      () => document.querySelectorAll(".react-flow__node").length === 13,
    );
    return;
  }

  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node").length > 20,
  );
}

export async function collectSettingsDomMetrics(
  page: Page,
): Promise<SettingsDomMetrics> {
  return await page.evaluate(() => {
    const allElements = document.querySelectorAll("*").length;
    const nodeCount = document.querySelectorAll(".react-flow__node").length;
    const paramRows = document.querySelectorAll("[data-param-row]").length;

    const all = Array.from(document.querySelectorAll("*"));
    let maxChildren = 0;
    for (const element of all) {
      if (element.children.length > maxChildren) {
        maxChildren = element.children.length;
      }
    }

    let maxDepth = 0;
    const walk = (element: Element, depth: number) => {
      if (depth > maxDepth) {
        maxDepth = depth;
      }
      for (const child of Array.from(element.children)) {
        walk(child, depth + 1);
      }
    };
    walk(document.body, 1);

    return {
      allElements,
      nodeCount,
      paramRows,
      maxChildren,
      maxDepth,
    };
  });
}

export async function measureSettingsTabSwitchLongTasks(
  page: Page,
  input: {
    from: SettingsTabName;
    to: SettingsTabName;
    observationWindowMs?: number;
  },
): Promise<LongTaskMetrics> {
  await openSettingsTab(page, input.from);
  const observationWindowMs = input.observationWindowMs ?? 2200;
  const result = await page.evaluate(
    async ({ from, to, windowMs }) => {
      if (
        typeof PerformanceObserver === "undefined" ||
        !PerformanceObserver.supportedEntryTypes.includes("longtask")
      ) {
        throw new Error("Longtask PerformanceObserver is unavailable.");
      }

      const clickTab = (tabName: string) => {
        const button = Array.from(document.querySelectorAll("button")).find(
          (candidate) => candidate.textContent?.trim().startsWith(tabName),
        );
        if (!button) {
          throw new Error(`Could not find settings tab: ${tabName}`);
        }
        button.click();
      };

      const entries: number[] = [];
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          entries.push(entry.duration);
        }
      });
      observer.observe({ type: "longtask" });

      const startedAt = performance.now();
      clickTab(to);
      await new Promise((resolve) => setTimeout(resolve, windowMs));
      observer.disconnect();
      const observedWindowMs = performance.now() - startedAt;

      return {
        from,
        to,
        observedWindowMs: Math.round(observedWindowMs),
        longTaskCount: entries.length,
        totalLongTaskMs: Math.round(entries.reduce((sum, ms) => sum + ms, 0)),
        maxLongTaskMs: entries.length ? Math.round(Math.max(...entries)) : 0,
      };
    },
    {
      from: input.from,
      to: input.to,
      windowMs: observationWindowMs,
    },
  );
  await waitForSettingsTabReady(page, input.to);
  return result;
}
