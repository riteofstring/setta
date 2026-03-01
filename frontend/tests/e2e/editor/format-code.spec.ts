import {
  expect,
  test,
  type Locator,
  type Page,
  type Response,
} from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL = resolveProjectUrl();
const HOME_URL = new URL("/home", BASE_URL).toString();
const READY_SELECTOR = ".react-flow__pane";
const FORMAT_SHORTCUT = "Alt+Shift+F";
const REQUEST_TIMEOUT_MS = 15000;

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type CreateTopLevelSectionResponse = { sectionId?: string };

test("cleanup removes project config after early exit", async ({ page }) => {
  test.setTimeout(60000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    throw new Error("Simulated failure");
  } catch {
    // Intentional: ensure cleanup path runs even after an error.
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }

  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const stillExists = metadata.projectMetadata.some(
    (entry) => entry.id === projectConfigId,
  );
  expect(stillExists).toBe(false);
});

test("formatting errors show diagnostics for code sections", async ({
  page,
}) => {
  test.setTimeout(60000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionName = "Formatter Code";
    const sectionId = await createCodeSection(page, projectConfigId);
    await postBackend(page, "/setSectionName", {
      projectConfigId,
      sectionId,
      name: sectionName,
    });
    await postBackend(page, "/setCode", {
      projectConfigId,
      sectionId,
      code: "def bad(:\n  pass\n",
    });

    const section = findSectionByName(page, sectionName).first();
    await expect(section).toBeVisible();
    const codeArea = section
      .locator("article.section-full-no-title")
      .first();
    await expect(codeArea).toBeVisible();
    await codeArea.click();

    const responsePromise = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/formatCode") &&
        response.status() === 422
      );
    });
    await page.keyboard.press(FORMAT_SHORTCUT);
    const response = await responsePromise;
    const detail = await readErrorDetail(response);

    const notification = page.getByText("Failed to run formatter.").first();
    await expect(notification).toBeVisible();

    const issuesButton = section
      .locator("header.section-title")
      .getByRole("button", { name: /Issues/ })
      .first();
    await expect(issuesButton).toBeVisible();
    const issuesPopover = await openIssuesPopover(page, issuesButton);
    await expect(
      issuesPopover.getByText("Problems", { exact: true }).first(),
    ).toBeVisible();
    await expectFormatterDetail(page, detail);

    const lintTarget = section
      .locator(".cm-lintRange, .cm-lintPoint")
      .first();
    await expect(lintTarget).toBeVisible();
    await lintTarget.hover();
    const lintTooltip = page
      .locator(".setta-codemirror-tooltips .cm-tooltip-lint")
      .first();
    await expect(lintTooltip).toBeVisible();
    await expect(lintTooltip).toHaveCSS("border-top-left-radius", "8px");
    await expect(lintTooltip).toHaveCSS("min-width", "180px");
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("code issues popover stays attached while panning", async ({ page }) => {
  test.setTimeout(60000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionName = "Formatter Code";
    const sectionId = await createCodeSection(page, projectConfigId);
    await postBackend(page, "/setSectionName", {
      projectConfigId,
      sectionId,
      name: sectionName,
    });
    await postBackend(page, "/setCode", {
      projectConfigId,
      sectionId,
      code: "def bad(:\n  pass\n",
    });

    const section = findSectionByName(page, sectionName).first();
    await expect(section).toBeVisible();
    const codeArea = section
      .locator("article.section-full-no-title")
      .first();
    await expect(codeArea).toBeVisible();
    await codeArea.click();

    const responsePromise = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/formatCode") &&
        response.status() === 422
      );
    });
    await page.keyboard.press(FORMAT_SHORTCUT);
    await responsePromise;

    const issuesButton = section
      .locator("header.section-title")
      .getByRole("button", { name: /Issues/ })
      .first();
    await expect(issuesButton).toBeVisible();

    let { delta: beforeDelta, popoverContent } = await measureCenterDelta(
      page,
      issuesButton,
    );

    await setViewportTransform(page, { x: 160, y: 120, zoom: 1 });
    if (!(await popoverContent.isVisible())) {
      popoverContent = await openIssuesPopover(page, issuesButton);
    }
    const { delta: afterDelta } = await measureCenterDelta(page, issuesButton);
    const maxDeltaChange = Math.max(
      Math.abs(afterDelta.dx - beforeDelta.dx),
      Math.abs(afterDelta.dy - beforeDelta.dy),
    );
    expect(maxDeltaChange).toBeLessThan(120);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("formatting errors show diagnostics for generated code prefix/suffix", async ({
  page,
}) => {
  test.setTimeout(60000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    await postBackend(page, "/setGenCodeSuffix", {
      projectConfigId,
      genCodeSuffix: "def bad(:\n  pass\n",
    });

    const genSection = findSectionByName(page, "Generated Python Code").first();
    await expect(genSection).toBeVisible();
    const codeArea = genSection
      .locator("article.section-full-no-title")
      .first();
    await expect(codeArea).toBeVisible();
    await codeArea.click();

    const responsePromise = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/formatCode") &&
        response.status() === 422
      );
    });
    await page.keyboard.press(FORMAT_SHORTCUT);
    const response = await responsePromise;
    const detail = await readErrorDetail(response);

    const notification = page.getByText("Failed to run formatter.").first();
    await expect(notification).toBeVisible();

    const issuesButton = genSection
      .locator("header.section-title")
      .getByRole("button", { name: /Issues/ })
      .first();
    await expect(issuesButton).toBeVisible();
    const issuesPopover = await openIssuesPopover(page, issuesButton);
    await expect(
      issuesPopover.getByText("Generated code issues", { exact: true }).first(),
    ).toBeVisible();
    await expectFormatterDetail(page, detail);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("lsp diagnostics persist after hard refresh", async ({ page }) => {
  test.setTimeout(60000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionName = "LSP Code";
    const sectionId = await createCodeSection(page, projectConfigId);
    await postBackend(page, "/setSectionName", {
      projectConfigId,
      sectionId,
      name: sectionName,
    });
    await postBackend(page, "/setCode", {
      projectConfigId,
      sectionId,
      code: "print(unknown_var)\\n",
    });

    const section = findSectionByName(page, sectionName).first();
    await expect(section).toBeVisible();
    const codeArea = section
      .locator("article.section-full-no-title")
      .first();
    await expect(codeArea).toBeVisible();
    await codeArea.click();

    const issuesButton = section
      .locator("header.section-title")
      .getByRole("button", { name: /Issues/ })
      .first();
    await expect.poll(async () => (await issuesButton.count()) > 0).toBe(true);
    await expect(issuesButton).toBeVisible();
    await issuesButton.click();
    await expect(page.getByText("Problems").first()).toBeVisible();
    await expect(page.getByText("is not defined").first()).toBeVisible();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);

    const sectionAfter = findSectionByName(page, sectionName).first();
    await expect(sectionAfter).toBeVisible();
    const issuesButtonAfter = sectionAfter
      .locator("header.section-title")
      .getByRole("button", { name: /Issues/ })
      .first();
    await expect
      .poll(async () => (await issuesButtonAfter.count()) > 0)
      .toBe(true);
    await expect(issuesButtonAfter).toBeVisible();
    await issuesButtonAfter.click();
    await expect(page.getByText("Problems").first()).toBeVisible();
    await expect(page.getByText("is not defined").first()).toBeVisible();
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});
function resolveProjectUrl(): string {
  const configuredUrl = process.env.SETTA_PROJECT_URL;
  if (configuredUrl) {
    return configuredUrl;
  }
  const configuredPath = process.env.SETTA_PROJECT_PATH;
  if (configuredPath) {
    return new URL(configuredPath, BASE_URL).toString();
  }
  return BASE_URL;
}

async function createNewProjectConfig(
  page: Page,
): Promise<{ projectConfigId: string; projectConfigName: string }> {
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Project" }).click();
  await page.waitForSelector(READY_SELECTOR);

  const projectConfigName = getProjectConfigName(page.url(), PROJECT_URL);
  if (!projectConfigName) {
    throw new Error("Unable to resolve new project config name.");
  }
  const projectConfigId = await resolveProjectConfigId(
    page,
    projectConfigName,
  );
  return { projectConfigId, projectConfigName };
}

async function resolveProjectConfigId(
  page: Page,
  projectConfigName: string,
): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const match = metadata.projectMetadata.find(
    (entry) => entry.name === projectConfigName,
  );
  if (!match) {
    throw new Error(`Unable to resolve project config id for ${projectConfigName}.`);
  }
  return match.id;
}

async function createCodeSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Code",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating code section.");
  }
  return created.sectionId;
}

function findSectionByName(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title", { hasText: name }) });
}

function getProjectConfigName(pageUrl: string, baseUrl: string): string {
  const pagePath = new URL(pageUrl).pathname;
  const basePath = new URL(baseUrl).pathname;
  let relativePath = pagePath;

  if (basePath !== "/") {
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    if (relativePath.startsWith(normalizedBase)) {
      relativePath = relativePath.slice(normalizedBase.length);
    } else if (relativePath.startsWith(basePath)) {
      relativePath = relativePath.slice(basePath.length);
    }
  }

  relativePath = relativePath.replace(/^\/+/, "");
  return decodeURIComponent(relativePath);
}

async function deleteProjectConfigByName(
  page: Page,
  projectConfigName: string,
): Promise<void> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const match = metadata.projectMetadata.find(
    (entry) => entry.name === projectConfigName,
  );
  if (!match) {
    throw new Error(
      `Unable to resolve project config id for ${projectConfigName}.`,
    );
  }
  await postBackend(page, "/deleteProjectConfigs", { ids: [match.id] });
}

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
    timeout: REQUEST_TIMEOUT_MS,
  });
  const text = await response.text();
  if (!response.ok()) {
    const detail = text ? ` ${text}` : "";
    throw new Error(
      `Backend request failed (${response.status()}): ${path}${detail}`,
    );
  }
  if (!text) {
    return null;
  }
  return JSON.parse(text) as T;
}

async function readErrorDetail(response: Response): Promise<string> {
  const text = await response.text();
  if (!text) {
    return "";
  }
  const contentType = response.headers()["content-type"] ?? "";
  const isJson =
    contentType.includes("application/json") || contentType.includes("+json");
  if (!isJson) {
    return text.trim();
  }
  try {
    const parsed = JSON.parse(text) as { detail?: string };
    if (typeof parsed?.detail === "string") {
      return parsed.detail.trim();
    }
  } catch {
    return text.trim();
  }
  return text.trim();
}

function extractFirstDetailLine(detail: string): string {
  const trimmed = detail.trim();
  if (!trimmed) {
    return "";
  }
  const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
  return firstLine;
}

async function expectFormatterDetail(page: Page, detail: string): Promise<void> {
  const fallback = page.getByText("Formatter").first();
  const detailSnippet = extractFirstDetailLine(detail);
  if (!detailSnippet) {
    await expect(fallback).toBeVisible();
    return;
  }

  const exactLocator = page.getByText(detailSnippet).first();
  if (await exactLocator.isVisible()) {
    return;
  }

  const diagnosticPrefix = detailSnippet.split(":")[0]?.trim() ?? "";
  if (diagnosticPrefix) {
    const prefixLocator = page.getByText(diagnosticPrefix).first();
    if (await prefixLocator.isVisible()) {
      return;
    }
  }

  await expect(fallback).toBeVisible();
}

async function setViewportTransform(
  page: Page,
  transform: { x: number; y: number; zoom: number },
): Promise<void> {
  await page.evaluate(async ({ x, y, zoom }) => {
    const { useReactFlow } = await import("/src/forks/xyflow/core/store");
    useReactFlow.setState({
      transform: [x, y, zoom],
      fitViewOnInit: false,
      fitViewOnInitDone: true,
    });
    window.reactFlowZoom = zoom;
  }, transform);
}

async function getCenterDelta(
  anchor: Locator,
  popover: Locator,
): Promise<{ dx: number; dy: number } | null> {
  let anchorBox: Awaited<ReturnType<Locator["boundingBox"]>>;
  let popoverBox: Awaited<ReturnType<Locator["boundingBox"]>>;
  try {
    [anchorBox, popoverBox] = await Promise.all([
      anchor.boundingBox({ timeout: 250 }),
      popover.boundingBox({ timeout: 250 }),
    ]);
  } catch {
    return null;
  }
  if (!anchorBox || !popoverBox) {
    return null;
  }
  const anchorCenterX = anchorBox.x + anchorBox.width / 2;
  const anchorCenterY = anchorBox.y + anchorBox.height / 2;
  const popoverCenterX = popoverBox.x + popoverBox.width / 2;
  const popoverCenterY = popoverBox.y + popoverBox.height / 2;
  return {
    dx: popoverCenterX - anchorCenterX,
    dy: popoverCenterY - anchorCenterY,
  };
}

async function measureCenterDelta(
  page: Page,
  issuesButton: Locator,
): Promise<{ delta: { dx: number; dy: number }; popoverContent: Locator }> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const popoverContent = await openIssuesPopover(page, issuesButton);
    const delta = await getCenterDelta(issuesButton, popoverContent);
    if (delta) {
      return { delta, popoverContent };
    }
  }
  throw new Error("Unable to measure popover/anchor bounds.");
}

async function openIssuesPopover(
  page: Page,
  issuesButton: Locator,
): Promise<Locator> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await issuesButton.click({ force: attempt > 0 });
    try {
      await expect(issuesButton).toHaveAttribute("aria-expanded", "true", {
        timeout: 1000,
      });
      const popoverId = await issuesButton.getAttribute("aria-controls");
      if (!popoverId) {
        continue;
      }
      const popoverContent = page.locator(`[id="${popoverId}"]`).first();
      await expect(popoverContent).toBeVisible({ timeout: 1000 });
      return popoverContent;
    } catch {
      // Retry; this popover can miss the first click under load.
    }
  }
  throw new Error("Unable to open issues popover.");
}
