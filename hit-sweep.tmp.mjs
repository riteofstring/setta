import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:4173";

const collect = (page, min) =>
  page.evaluate((minSize) => {
    const selector = [
      "button",
      '[role="button"]',
      "input",
      "select",
      "textarea",
      "summary",
      "a[href]",
      ".setta-workspace__section-resize-control",
    ].join(", ");
    const offenders = [];
    const scaleOf = (el) => {
      const viewport = el.closest(".react-flow__viewport");
      if (!viewport) return 1;
      const transform = new DOMMatrixReadOnly(getComputedStyle(viewport).transform);
      return transform.a || 1;
    };
    for (const el of document.querySelectorAll(selector)) {
      if (!el.checkVisibility({ opacityProperty: false })) continue;
      let rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      if ((el.type === "checkbox" || el.type === "radio") && el.labels?.[0]) {
        rect = el.labels[0].getBoundingClientRect();
      }
      const scale = scaleOf(el);
      const width = rect.width / scale;
      const height = rect.height / scale;
      if (width >= minSize - 0.5 && height >= minSize - 0.5) continue;
      const name =
        el.getAttribute("aria-label") ||
        (el.labels && el.labels[0]?.textContent?.trim()) ||
        el.textContent?.trim().slice(0, 40) ||
        el.getAttribute("title") ||
        "";
      offenders.push({
        name,
        cls: typeof el.className === "string" ? el.className.slice(0, 90) : el.tagName,
        tag: el.tagName.toLowerCase(),
        w: Math.round(width * 10) / 10,
        h: Math.round(height * 10) / 10,
      });
    }
    return offenders;
  }, min);

const sweepStates = async (page, min, report) => {
  await page.goto(`${BASE}/?visual-matrix`);
  await page.getByRole("region", { name: "Visual matrix workspace", exact: true }).waitFor();
  await page.waitForTimeout(400);
  report["matrix idle"] = await collect(page, min);

  await page.getByRole("button", { name: "Select two sections" }).click();
  await page.waitForTimeout(250);
  report["matrix selected"] = await collect(page, min);

  await page.getByRole("button", { name: "Style Default chrome" }).click();
  await page.waitForTimeout(250);
  report["matrix style menu"] = await collect(page, min);
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/`);
  await page.waitForTimeout(600);
  report["playground idle"] = await collect(page, min);

  for (const panel of ["Help", "Settings", "Data"]) {
    const button = page.getByRole("button", { name: new RegExp(panel, "i") }).first();
    if ((await button.count()) === 0) continue;
    await button.click();
    await page.waitForTimeout(250);
    report[`playground ${panel}`] = await collect(page, min);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(150);
  }

  const creation = page.getByRole("button", { name: /add section/i }).first();
  if ((await creation.count()) > 0) {
    await creation.click();
    await page.waitForTimeout(250);
    report["playground creation menu"] = await collect(page, min);
    await page.keyboard.press("Escape");
  }
};

const run = async () => {
  const browser = await chromium.launch();
  const fineReport = {};
  const finePage = await (
    await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  ).newPage();
  await sweepStates(finePage, 40, fineReport);

  const coarseReport = {};
  const coarsePage = await (
    await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true })
  ).newPage();
  coarseReport["_coarse-media"] = await coarsePage.evaluate(
    () => matchMedia("(pointer: coarse)").matches,
  );
  await sweepStates(coarsePage, 44, coarseReport);

  console.log(JSON.stringify({ fine: fineReport, coarse: coarseReport }, null, 1));
  await browser.close();
};

await run();
