import type { ConsoleMessage } from "@playwright/test";
import { chromium, type FullConfig } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PLAYWRIGHT_EXECUTABLE_PATH =
  process.env.PLAYWRIGHT_EXECUTABLE_PATH || undefined;
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

function matchesExpectedProjectUrl(
  candidateUrl: string,
  expectedProjectUrl: URL,
): boolean {
  const parsedCandidateUrl = new URL(candidateUrl);
  const expectedPathname = expectedProjectUrl.pathname;
  return (
    parsedCandidateUrl.origin === expectedProjectUrl.origin &&
    (parsedCandidateUrl.pathname === expectedPathname ||
      // Default bootstrap can settle on launcher home after the initial
      // frontend-root handoff; treat that as a ready authenticated shell.
      (expectedPathname === "/" && parsedCandidateUrl.pathname === "/home"))
  );
}

async function globalSetup(config: FullConfig) {
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await waitForBackend(BACKEND_ORIGIN, 60000);
  const storagePath = config.projects[0]?.use?.storageState as
    | string
    | undefined;
  if (!storagePath) {
    throw new Error("storageState path missing in Playwright config.");
  }
  const browser = await chromium.launch(
    PLAYWRIGHT_EXECUTABLE_PATH
      ? { executablePath: PLAYWRIGHT_EXECUTABLE_PATH }
      : undefined,
  );
  const context = await browser.newContext();
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const onPageError = (err: Error) => {
    const message = err?.stack || err?.message || String(err);
    if (message && !pageErrors.includes(message)) {
      pageErrors.push(message);
    }
  };
  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") {
      return;
    }
    const message = msg.text();
    if (message && !consoleErrors.includes(message)) {
      consoleErrors.push(message);
    }
  };
  page.on("pageerror", onPageError);
  page.on("console", onConsole);
  try {
    await page.goto(
      `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`,
    );
    const expectedProjectUrl = new URL(PROJECT_URL);
    if (!matchesExpectedProjectUrl(page.url(), expectedProjectUrl)) {
      await page.waitForURL(
        (url) => {
          return matchesExpectedProjectUrl(url.toString(), expectedProjectUrl);
        },
        { waitUntil: "domcontentloaded" },
      );
    }
    // `.app-shell` exists in static index.html, but `.setta-titlebar-offset` only
    // appears once React renders `AppShell`.
    await page.waitForSelector(".setta-titlebar-offset", { state: "attached" });

    await context.storageState({ path: storagePath });
  } catch (err) {
    const debugLines: string[] = [];
    debugLines.push(`Current URL: ${page.url()}`);
    if (pageErrors.length) {
      debugLines.push("");
      debugLines.push("Page errors:");
      debugLines.push(...pageErrors.slice(0, 5));
    }
    if (consoleErrors.length) {
      debugLines.push("");
      debugLines.push("Console errors:");
      debugLines.push(...consoleErrors.slice(0, 10));
    }
    throw new Error(
      `Playwright global setup failed: ${String(err)}\n${debugLines.join("\n")}`,
    );
  } finally {
    page.off("pageerror", onPageError);
    page.off("console", onConsole);
    await browser.close();
  }
}

export default globalSetup;

async function waitForBackend(
  origin: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(origin, { method: "GET" });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`Backend responded with ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for backend: ${String(lastError)}`);
}
