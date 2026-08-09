import { AxeBuilder } from "@axe-core/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const BASE = "http://127.0.0.1:4173";
const OUT = "docs/evidence/setta-ui-redesign/phase-4-accessibility";
mkdirSync(OUT, { recursive: true });

const manifest = [];
const axeResults = {};

const shoot = async (page, name, description, options = {}) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, ...options });
  manifest.push({ description, name: `${name}.png` });
};

const run = async () => {
  const browser = await chromium.launch();

  // 1. Visual matrix: dark + RTL + reduced motion, selected state.
  const darkRtl = await (
    await browser.newContext({ viewport: { width: 1440, height: 1000 } })
  ).newPage();
  await darkRtl.emulateMedia({ reducedMotion: "reduce" });
  await darkRtl.goto(`${BASE}/?visual-matrix&appearance=dark`);
  const matrixRegion = darkRtl.getByRole("region", {
    exact: true,
    name: "Visual matrix workspace",
  });
  await matrixRegion.getByRole("article", { name: "Vertical pair" }).waitFor();
  await darkRtl.locator("html").evaluate((el) => el.setAttribute("dir", "rtl"));
  await darkRtl.getByRole("button", { name: "Select two sections" }).click();
  await shoot(
    darkRtl,
    "matrix-dark-rtl-reduced-selected",
    "Visual matrix in dark appearance with dir=rtl, prefers-reduced-motion, and a two-section selection revealing state controls.",
  );
  axeResults["matrix dark rtl"] = (
    await new AxeBuilder({ page: darkRtl }).include("[data-setta-workspace]").analyze()
  ).violations;

  // 2. Default playground at 320 px, dark scheme, Data panel open.
  const narrow = await (
    await browser.newContext({ viewport: { width: 320, height: 720 } })
  ).newPage();
  await narrow.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await narrow.goto(`${BASE}/`);
  await narrow.getByText("Example workspace loaded.").waitFor();
  await narrow.getByRole("button", { exact: true, name: "Data" }).click();
  await narrow.getByRole("dialog", { name: "Data and diagnostics" }).waitFor();
  const overflow = await narrow.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  axeResults["_320 no horizontal overflow"] = overflow;
  await shoot(
    narrow,
    "playground-dark-320-data-panel",
    "Default playground at 320 CSS px in dark system appearance and reduced motion with the Data and diagnostics overlay open.",
    { fullPage: true },
  );
  axeResults["playground dark 320"] = (
    await new AxeBuilder({ page: narrow }).analyze()
  ).violations;

  // 3. Populated playground at 200% page scale.
  const zoom = await (
    await browser.newContext({ viewport: { width: 1440, height: 900 } })
  ).newPage();
  await zoom.goto(`${BASE}/`);
  await zoom.getByText("Example workspace loaded.").waitFor();
  const session = await zoom.context().newCDPSession(zoom);
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
  await shoot(
    zoom,
    "playground-zoom-200",
    "Populated default playground at 200% page scale.",
  );
  await session.send("Emulation.setPageScaleFactor", { pageScaleFactor: 1 });

  // 4. Coarse pointer: matrix selected with the style menu open.
  const coarse = await (
    await browser.newContext({ viewport: { width: 1440, height: 1000 }, hasTouch: true })
  ).newPage();
  await coarse.goto(`${BASE}/?visual-matrix`);
  const coarseRegion = coarse.getByRole("region", {
    exact: true,
    name: "Visual matrix workspace",
  });
  await coarseRegion.getByRole("article", { name: "Vertical pair" }).waitFor();
  await coarse.getByRole("button", { name: "Select two sections" }).click();
  await coarseRegion.getByRole("button", { name: "Style Default chrome" }).click();
  await coarseRegion.getByRole("dialog", { name: "Style Default chrome" }).waitFor();
  await shoot(
    coarse,
    "matrix-coarse-style-menu",
    "Visual matrix under a coarse pointer with the selected-state style menu open at 44 px targets.",
  );

  writeFileSync(
    `${OUT}/capture-manifest.json`,
    `${JSON.stringify({ captures: manifest }, null, 2)}\n`,
  );
  console.log(JSON.stringify(axeResults, null, 1));
  await browser.close();
};

await run();
