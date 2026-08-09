import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { chromium } from "@playwright/test";

import { repositoryRoot } from "./lib/process.mjs";

const playgroundUrl = "http://127.0.0.1:4173";
const serverReadyTimeoutMs = 180_000;
const settleMs = 400;

function captureLabel() {
  const labelIndex = process.argv.indexOf("--label");
  if (labelIndex === -1) {
    return "before";
  }
  const label = process.argv[labelIndex + 1];
  if (!label || !/^[a-z0-9-]+$/.test(label)) {
    throw new Error("The capture label must be a non-empty kebab-case identifier.");
  }
  return label;
}

async function playgroundReachable() {
  try {
    const response = await fetch(playgroundUrl);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForPlayground() {
  const deadline = Date.now() + serverReadyTimeoutMs;
  while (Date.now() < deadline) {
    if (await playgroundReachable()) {
      return;
    }
    await delay(1_000);
  }
  throw new Error(`The playground did not become reachable at ${playgroundUrl}.`);
}

async function startPlaygroundServer() {
  if (await playgroundReachable()) {
    return null;
  }
  const server = spawn("corepack", ["pnpm", "dev"], {
    cwd: repositoryRoot,
    detached: true,
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForPlayground();
  return server;
}

function stopPlaygroundServer(server) {
  if (server?.pid) {
    process.kill(-server.pid, "SIGTERM");
  }
}

async function settle(page) {
  await page.waitForTimeout(settleMs);
}

async function restorePlaygroundExample(page) {
  await page.goto("/");
  await page.getByText("Example workspace loaded.").waitFor();
  await page.getByRole("button", { exact: true, name: "Data" }).click();
  await page.getByRole("button", { name: "Reset example…" }).click();
  await page
    .getByRole("group", { name: "Confirm reset" })
    .getByRole("button", { name: "Reset example" })
    .click();
  await page
    .getByRole("dialog", { name: "Data and diagnostics" })
    .getByRole("button", { name: "Close" })
    .click();
  await page
    .getByRole("region", { exact: true, name: "Section workspace" })
    .getByRole("article", { name: "Welcome note" })
    .waitFor();
}

async function openVisualMatrix(page, query = "") {
  await page.goto(`/?visual-matrix${query}`);
  const workspace = page.getByRole("region", { exact: true, name: "Visual matrix workspace" });
  await workspace.getByRole("article", { name: "Vertical pair" }).waitFor();
  return workspace;
}

const scenarios = [
  {
    async capture(page) {
      await page.goto("/");
      await page.getByRole("region", { exact: true, name: "Section workspace" }).waitFor();
      await page.getByText("Example workspace loaded.").waitFor();
    },
    description: "Fresh first launch of the default playground, above the fold.",
    name: "default-first-launch",
    viewport: { height: 900, width: 1440 },
  },
  {
    async capture(page) {
      await page.goto("/");
      await page.getByRole("region", { exact: true, name: "Section workspace" }).waitFor();
      await page.getByText("Example workspace loaded.").waitFor();
    },
    description: "Fresh first launch of the default playground, complete page.",
    fullPage: true,
    name: "default-first-launch-full",
    viewport: { height: 900, width: 1440 },
  },
  {
    async capture(page) {
      await restorePlaygroundExample(page);
    },
    description: "Default playground after restoring the example document.",
    name: "default-populated-example",
    viewport: { height: 900, width: 1440 },
  },
  {
    async capture(page) {
      await restorePlaygroundExample(page);
      return page.getByRole("region", { exact: true, name: "Section workspace" });
    },
    description: "Populated workspace canvas, toolbar, and minimap in isolation.",
    name: "default-populated-canvas",
    viewport: { height: 900, width: 1440 },
  },
  {
    async capture(page) {
      await restorePlaygroundExample(page);
      const workspace = page.getByRole("region", { exact: true, name: "Section workspace" });
      const article = workspace.getByRole("article", { name: "Welcome note" });
      await article.getByRole("button", { name: "Select Welcome note" }).click();
      await article.getByRole("button", { name: "Style Welcome note" }).click();
      await article.getByRole("dialog", { name: "Style Welcome note" }).waitFor();
    },
    description: "Section style menu opened on the populated example.",
    name: "default-section-style-menu",
    viewport: { height: 900, width: 1440 },
  },
  {
    async capture(page) {
      await restorePlaygroundExample(page);
      await page.getByRole("button", { name: "Add section" }).click();
      await page.getByRole("dialog", { name: "Add a section" }).waitFor();
    },
    description: "Section creation menu on the populated example.",
    name: "default-creation-menu",
    viewport: { height: 900, width: 1440 },
  },
  {
    async capture(page) {
      await restorePlaygroundExample(page);
    },
    description: "Default playground reflow at 320 CSS pixels.",
    fullPage: true,
    name: "default-narrow-320",
    viewport: { height: 568, width: 320 },
  },
  {
    async capture(page) {
      await restorePlaygroundExample(page);
    },
    description: "Layout-equivalent of 200% page zoom on a 1440x900 window.",
    name: "default-zoom-200",
    viewport: { height: 450, width: 720 },
  },
  {
    async capture(page) {
      return openVisualMatrix(page);
    },
    description: "Visual matrix canvas in the light appearance.",
    name: "visual-matrix-light",
    viewport: { height: 1000, width: 1440 },
  },
  {
    async capture(page) {
      return openVisualMatrix(page, "&appearance=dark");
    },
    colorScheme: "dark",
    description: "Visual matrix canvas in the dark appearance.",
    name: "visual-matrix-dark",
    viewport: { height: 1000, width: 1440 },
  },
  {
    async capture(page) {
      const workspace = await openVisualMatrix(page);
      await page.getByRole("button", { name: "Select two sections" }).click();
      await workspace
        .getByRole("article", { name: "Compact chrome" })
        .getByRole("heading", { name: "Compact chrome" })
        .hover();
      return workspace;
    },
    description: "Visual matrix canvas with a multi-selection and one hovered section.",
    name: "visual-matrix-selection",
    viewport: { height: 1000, width: 1440 },
  },
  {
    async capture(page) {
      await openVisualMatrix(page);
      return page.getByRole("toolbar", { name: "Visual matrix workspace controls" });
    },
    description: "Built-in viewport toolbar in isolation.",
    name: "visual-matrix-toolbar",
    viewport: { height: 1000, width: 1440 },
  },
  {
    async capture(page) {
      await openVisualMatrix(page);
      return page.getByRole("img", { name: "Visual matrix workspace minimap" });
    },
    description: "Built-in minimap in isolation.",
    name: "visual-matrix-minimap",
    viewport: { height: 1000, width: 1440 },
  },
];

async function captureScenario(browser, outputDirectory, scenario) {
  const context = await browser.newContext({
    baseURL: playgroundUrl,
    colorScheme: scenario.colorScheme ?? "light",
    viewport: scenario.viewport,
  });
  try {
    const page = await context.newPage();
    const target = await scenario.capture(page);
    await settle(page);
    const screenshotPath = path.join(outputDirectory, `${scenario.name}.png`);
    const options = { animations: "disabled", caret: "hide", path: screenshotPath };
    await (target
      ? target.screenshot(options)
      : page.screenshot({ ...options, fullPage: scenario.fullPage ?? false }));
    console.log(`Captured ${scenario.name}.png`);
  } finally {
    await context.close();
  }
}

const label = captureLabel();
const outputDirectory = path.join(repositoryRoot, "docs/evidence/setta-ui-redesign", label);
mkdirSync(outputDirectory, { recursive: true });

const server = await startPlaygroundServer();
const browser = await chromium.launch();
try {
  for (const scenario of scenarios) {
    await captureScenario(browser, outputDirectory, scenario);
  }
  writeFileSync(
    path.join(outputDirectory, "capture-manifest.json"),
    `${JSON.stringify(
      {
        baseUrl: playgroundUrl,
        command: `node scripts/capture-visual-evidence.mjs --label ${label}`,
        environment: {
          architecture: process.arch,
          node: process.version,
          platform: process.platform,
        },
        scenarios: scenarios.map(({ colorScheme, description, fullPage, name, viewport }) => ({
          colorScheme: colorScheme ?? "light",
          description,
          fullPage: fullPage ?? false,
          name,
          viewport,
        })),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`Wrote ${String(scenarios.length)} screenshots to ${outputDirectory}`);
} finally {
  await browser.close();
  stopPlaygroundServer(server);
}
