import { expect, test } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const SETTINGS_URL = new URL("/settings", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";

const MAX_VIEWPORT_DESCENDANTS = 7000;
const MAX_TOTAL_ELEMENTS = 7800;
const MAX_AVG_NODE_DESCENDANTS = 170;
const MAX_MAX_NODE_DESCENDANTS = 1400;
const MAX_MAX_NODE_DEPTH = 16;
const MAX_CM_LINE_WRAPPERS = 0;

test("all settings DOM stays within flattening guardrails", async ({
  page,
}) => {
  await ensureAppReady(page);
  await page.goto(SETTINGS_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(READY_SELECTOR);

  const allTab = page.getByRole("button", {
    name: "All Settings",
    exact: true,
  });
  await expect(allTab).toBeVisible();
  await allTab.click();

  // Ensure the benchmark scene is loaded before measuring DOM shape.
  await page.waitForFunction(
    () => document.querySelectorAll(".react-flow__node").length >= 40,
  );

  const metrics = await page.evaluate(() => {
    const viewport = document.querySelector(".react-flow__viewport");
    const nodes = Array.from(document.querySelectorAll(".react-flow__node"));
    const nodeStats = nodes.map((node) => {
      const descendants = node.querySelectorAll("*").length;
      let maxDepth = 0;
      const walk = (el: Element, depth: number) => {
        if (depth > maxDepth) {
          maxDepth = depth;
        }
        for (const child of el.children) {
          walk(child, depth + 1);
        }
      };
      walk(node, 0);
      return { descendants, maxDepth };
    });
    const descendants = nodeStats
      .map((x) => x.descendants)
      .sort((a, b) => a - b);
    const depths = nodeStats.map((x) => x.maxDepth).sort((a, b) => a - b);
    const sum = (arr: number[]) => arr.reduce((acc, val) => acc + val, 0);
    const avg = (arr: number[]) =>
      arr.length === 0 ? 0 : sum(arr) / arr.length;

    return {
      nodeCount: nodes.length,
      totalElements: document.querySelectorAll("*").length,
      viewportDescendantCount: viewport
        ? viewport.querySelectorAll("*").length
        : 0,
      paramRowCount: document.querySelectorAll('[data-param-row="true"]')
        .length,
      descendants: {
        avg: Number(avg(descendants).toFixed(2)),
        max: descendants.length === 0 ? 0 : descendants[descendants.length - 1],
      },
      depth: {
        max: depths.length === 0 ? 0 : depths[depths.length - 1],
      },
      // These count wrapper patterns previously removed during DOM flattening.
      groupResizeCount: Array.from(document.querySelectorAll("*")).filter(
        (el) => Array.from(el.classList).includes("group/resize"),
      ).length,
      spanValueBorderCount: document.querySelectorAll(
        "span.section-value.grid-row-start-1.border-box",
      ).length,
      legacyComboboxContainerDivCount: Array.from(
        document.querySelectorAll("div"),
      ).filter((el) => {
        const classes = Array.from(el.classList);
        return (
          classes.includes("relative") &&
          classes.includes("w-full") &&
          classes.includes("min-w-0") &&
          classes.includes("flex-col") &&
          classes.includes("items-stretch") &&
          classes.includes("overflow-visible")
        );
      }).length,
      comboboxSearchContainerCount: Array.from(
        document.querySelectorAll("search"),
      ).filter((el) => {
        const classes = Array.from(el.classList);
        return (
          classes.includes("relative") &&
          classes.includes("w-full") &&
          classes.includes("min-w-0") &&
          classes.includes("flex-col") &&
          classes.includes("items-stretch") &&
          classes.includes("overflow-visible")
        );
      }).length,
      legacyComboboxRightWrapperCount: Array.from(
        document.querySelectorAll("div"),
      ).filter((el) => {
        const classes = Array.from(el.classList);
        return (
          classes.includes("absolute") &&
          classes.includes("inset-y-0") &&
          classes.includes("right-0") &&
          classes.includes("grid") &&
          classes.includes("select-none") &&
          classes.includes("place-items-center")
        );
      }).length,
      flattenedComboboxRightButtonCount: Array.from(
        document.querySelectorAll("button"),
      ).filter((el) => {
        const classes = Array.from(el.classList);
        return (
          classes.includes("absolute") &&
          classes.includes("inset-y-0") &&
          classes.includes("right-1")
        );
      }).length,
      legacySwitchWrapperCount: document.querySelectorAll(
        "div.section-value.flex.justify-self-start.self-center",
      ).length,
      flattenedSwitchRootCount: document.querySelectorAll(
        "button.section-value.justify-self-start.self-center",
      ).length,
      cmLineCount: document.querySelectorAll(".cm-line").length,
    };
  });

  expect(metrics.nodeCount).toBeGreaterThanOrEqual(40);
  expect(metrics.paramRowCount).toBeGreaterThanOrEqual(500);

  expect(metrics.totalElements).toBeLessThanOrEqual(MAX_TOTAL_ELEMENTS);
  expect(metrics.viewportDescendantCount).toBeLessThanOrEqual(
    MAX_VIEWPORT_DESCENDANTS,
  );
  expect(metrics.descendants.avg).toBeLessThanOrEqual(MAX_AVG_NODE_DESCENDANTS);
  expect(metrics.descendants.max).toBeLessThanOrEqual(MAX_MAX_NODE_DESCENDANTS);
  expect(metrics.depth.max).toBeLessThanOrEqual(MAX_MAX_NODE_DEPTH);

  expect(metrics.groupResizeCount).toBe(0);
  expect(metrics.spanValueBorderCount).toBe(0);
  expect(metrics.legacyComboboxContainerDivCount).toBe(0);
  expect(metrics.comboboxSearchContainerCount).toBeGreaterThan(0);
  expect(metrics.legacyComboboxRightWrapperCount).toBe(0);
  expect(metrics.flattenedComboboxRightButtonCount).toBeGreaterThan(0);
  expect(metrics.legacySwitchWrapperCount).toBe(0);
  expect(metrics.flattenedSwitchRootCount).toBeGreaterThan(0);
  expect(metrics.cmLineCount).toBeLessThanOrEqual(MAX_CM_LINE_WRAPPERS);
});
