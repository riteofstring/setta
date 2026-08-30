import { writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createCdpPage } from "./lib/cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "./lib/headless-chrome.mjs";

const DEFAULT_URL = "http://localhost:5174/";
const DEFAULT_VIEWPORT = { height: 696, width: 1_492 };
const READY_TIMEOUT_MS = 15_000;

const LAYOUT_SNAPSHOT_EXPRESSION = `(() => {
  const rect = (element) => {
    if (!element) {
      return null;
    }
    const value = element.getBoundingClientRect();
    return {
      bottom: value.bottom,
      height: value.height,
      left: value.left,
      right: value.right,
      top: value.top,
      width: value.width,
    };
  };
  const approximatelyEqual = (left, right) => Math.abs(left - right) <= 1;
  const sameRect = (left, right) =>
    left !== null &&
    right !== null &&
    approximatelyEqual(left.bottom, right.bottom) &&
    approximatelyEqual(left.left, right.left) &&
    approximatelyEqual(left.right, right.right) &&
    approximatelyEqual(left.top, right.top);
  const shellElement = document.querySelector('[data-workspace-shell="true"]');
  const centerElement = document.querySelector('.setta-workspace-shell-center');
  const canvasElement = document.querySelector('.setta-workspace-shell-canvas');
  const flowElement = document.querySelector('.react-flow');
  const tabsElement = document.querySelector('[data-testid="workspace-saved-view-tabs"]');
  const minimapElement = document.querySelector('[data-testid="rf__minimap"]');
  const paneElements = Array.from(
    document.querySelectorAll('[data-workspace-shell-pane-region]'),
  );
  const shell = rect(shellElement);
  const center = rect(centerElement);
  const canvas = rect(canvasElement);
  const flow = rect(flowElement);
  const tabs = rect(tabsElement);
  const minimap = rect(minimapElement);
  const panes = paneElements.map((element) => ({
    pane: element.getAttribute('data-workspace-shell-pane-region'),
    rect: rect(element),
  }));
  const shellStyle = shellElement ? getComputedStyle(shellElement) : null;
  const minimapStyle = minimapElement ? getComputedStyle(minimapElement) : null;
  const tabsPresent = tabs !== null;
  return {
    assertions: {
      canvasAndFlowShareBounds: sameRect(canvas, flow),
      minimapWithinFlow:
        minimap === null || flow === null
          ? null
          : minimap.left >= flow.left - 1 &&
            minimap.right <= flow.right + 1 &&
            minimap.top >= flow.top - 1 &&
            minimap.bottom <= flow.bottom + 1,
      panesStopAboveTabs:
        !tabsPresent
          ? null
          : panes.every(({ rect: paneRect }) =>
              paneRect === null ? false : paneRect.bottom <= tabs.top + 1,
            ),
      tabsFollowFlow:
        !tabsPresent || flow === null
          ? null
          : approximatelyEqual(flow.bottom, tabs.top),
      tabsHaveReferenceHeight:
        !tabsPresent ? null : approximatelyEqual(tabs.height, 36),
      tabsSpanShell:
        !tabsPresent || shell === null
          ? null
          : approximatelyEqual(tabs.left, shell.left) &&
            approximatelyEqual(tabs.right, shell.right),
    },
    document: {
      devicePixelRatio: window.devicePixelRatio,
      readyState: document.readyState,
      title: document.title,
      url: location.href,
    },
    rects: { canvas, center, flow, minimap, panes, shell, tabs },
    styles: {
      minimap: minimapStyle
        ? {
            height: minimapStyle.height,
            position: minimapStyle.position,
            width: minimapStyle.width,
          }
        : null,
      shell: shellStyle
        ? {
            display: shellStyle.display,
            gridTemplateColumns: shellStyle.gridTemplateColumns,
            gridTemplateRows: shellStyle.gridTemplateRows,
          }
        : null,
    },
  };
})()`;

function argumentValue(name) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) {
    return null;
  }
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`--${name} requires a value.`);
  }
  return value;
}

function positiveIntegerArgument(name, fallback) {
  const raw = argumentValue(name);
  const value = raw === null ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer.`);
  }
  return value;
}

function inspectionUrl() {
  const raw = argumentValue("url") ?? DEFAULT_URL;
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--url must use http or https.");
  }
  return url.href;
}

function screenshotPath() {
  const requested =
    argumentValue("screenshot") ??
    path.join(os.tmpdir(), "setta-playground-inspection.png");
  return path.resolve(requested);
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      `Browser evaluation failed: ${response.exceptionDetails.exception?.description ?? response.exceptionDetails.text}`,
    );
  }
  return response.result?.value;
}

async function waitForReady(client, requireTabs) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await evaluate(
      client,
      `document.readyState === "complete" &&
        document.querySelector('[data-workspace-shell="true"]') !== null &&
        document.querySelector('.react-flow') !== null &&
        (${String(requireTabs)} === false ||
          document.querySelector('[data-testid="workspace-saved-view-tabs"]') !== null)`,
    );
    if (ready === true) {
      await evaluate(
        client,
        "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
      );
      return;
    }
    await delay(50);
  }
  throw new Error("The Playground did not reach an inspectable state.");
}

function collectPageIssues(client) {
  const issues = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    issues.push(
      exceptionDetails?.exception?.description ??
        exceptionDetails?.text ??
        "Unidentified runtime exception",
    );
  });
  client.on("Runtime.consoleAPICalled", ({ args, type }) => {
    if (type !== "error" && type !== "assert") {
      return;
    }
    issues.push(
      args
        .map((argument) => argument.value ?? argument.description ?? "")
        .join(" "),
    );
  });
  client.on("Log.entryAdded", ({ entry }) => {
    if (entry?.level === "error") {
      issues.push(entry.text ?? "Unidentified browser log error");
    }
  });
  return issues;
}

async function requireLiveUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Live Playground request failed with HTTP ${String(response.status)}.`,
    );
  }
}

async function main() {
  const url = inspectionUrl();
  const viewport = {
    deviceScaleFactor: 1,
    height: positiveIntegerArgument("height", DEFAULT_VIEWPORT.height),
    mobile: false,
    width: positiveIntegerArgument("width", DEFAULT_VIEWPORT.width),
  };
  const requireTabs = process.argv.includes("--require-tabs");
  const outputScreenshotPath = screenshotPath();
  await requireLiveUrl(url);
  const browser = startHeadlessChrome(argumentValue("chrome-binary"));
  let client = null;
  try {
    const port = await waitForHeadlessChrome(browser);
    const page = await createCdpPage(port);
    client = page.client;
    await Promise.all([
      client.send("Log.enable"),
      client.send("Page.enable"),
      client.send("Runtime.enable"),
    ]);
    const issues = collectPageIssues(client);
    await client.send("Emulation.setDeviceMetricsOverride", viewport);
    const loaded = client.waitForEvent("Page.loadEventFired", READY_TIMEOUT_MS);
    await client.send("Page.navigate", { url });
    await loaded;
    await waitForReady(client, requireTabs);
    const geometry = await evaluate(client, LAYOUT_SNAPSHOT_EXPRESSION);
    const screenshot = await client.send("Page.captureScreenshot", {
      captureBeyondViewport: false,
      format: "png",
      fromSurface: true,
    });
    if (typeof screenshot.data !== "string") {
      throw new Error("Chrome returned no screenshot data.");
    }
    writeFileSync(outputScreenshotPath, screenshot.data, "base64");
    const assertions = Object.values(geometry.assertions);
    const tabsSatisfied = !requireTabs || geometry.rects.tabs !== null;
    const passed =
      issues.length === 0 &&
      tabsSatisfied &&
      assertions.every((assertion) => assertion !== false);
    const { product, userAgent } = await client.send("Browser.getVersion");
    console.log(
      JSON.stringify(
        {
          browser: { product, userAgent },
          geometry,
          issues,
          passed,
          screenshotPath: outputScreenshotPath,
          viewport,
        },
        null,
        2,
      ),
    );
    return passed;
  } finally {
    client?.close();
    await stopHeadlessChrome(browser);
  }
}

if (!(await main())) {
  process.exitCode = 1;
}
