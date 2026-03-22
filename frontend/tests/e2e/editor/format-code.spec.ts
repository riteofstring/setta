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
const REQUEST_TIMEOUT_MS = 5000;

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
    const codeArea = section.locator("article.section-full-no-title").first();
    await expect(codeArea).toBeVisible();
    await codeArea.click();

    const responsePromise = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/formatCode") && response.status() === 422
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
    await issuesButton.click();

    await expect(page.getByText("Problems").first()).toBeVisible();
    const detailSnippet = extractFirstDetailLine(detail);
    if (detailSnippet) {
      await expect(page.getByText(detailSnippet).first()).toBeVisible();
    } else {
      await expect(page.getByText("Formatter").first()).toBeVisible();
    }

    const lintTarget = section.locator(".cm-lintRange, .cm-lintPoint").first();
    await expect.poll(async () => await lintTarget.count()).toBeGreaterThan(0);
    const lintTargetBox = await lintTarget.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        x: rect.left + Math.max(rect.width / 2, 1),
        y: rect.top + Math.max(rect.height / 2, 1),
      };
    });
    await page.mouse.move(lintTargetBox.x, lintTargetBox.y);
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
    const codeArea = section.locator("article.section-full-no-title").first();
    await expect(codeArea).toBeVisible();
    await codeArea.click();

    const responsePromise = page.waitForResponse((response) => {
      return (
        response.url().includes("/api/formatCode") && response.status() === 422
      );
    });
    await page.keyboard.press(FORMAT_SHORTCUT);
    await responsePromise;

    const issuesButton = section
      .locator("header.section-title")
      .getByRole("button", { name: /Issues/ })
      .first();
    await expect(issuesButton).toBeVisible();
    await issuesButton.click();

    const problemsLabel = page.getByText("Problems").first();
    await expect(problemsLabel).toBeVisible();
    const popover = page
      .locator("[data-radix-popper-content-wrapper]")
      .filter({ has: problemsLabel })
      .first();
    await expect(popover).toBeVisible();
    const popoverContent = popover.locator("> div").first();
    await expect(popoverContent).toHaveClass(/rounded-md/);
    await expect(popoverContent).toHaveClass(/backdrop-blur/);

    const beforeDelta = await getCenterDelta(issuesButton, popover);

    await setViewportTransform(page, { x: 160, y: 120, zoom: 1 });

    await expect
      .poll(async () => {
        const afterDelta = await getCenterDelta(issuesButton, popover);
        return Math.max(
          Math.abs(afterDelta.dx - beforeDelta.dx),
          Math.abs(afterDelta.dy - beforeDelta.dy),
        );
      })
      .toBeLessThan(4);
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
        response.url().includes("/api/formatCode") && response.status() === 422
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
    await issuesButton.click();

    await expect(page.getByText("Generated code issues").first()).toBeVisible();
    const detailSnippet = extractFirstDetailLine(detail);
    if (detailSnippet) {
      await expect(page.getByText(detailSnippet).first()).toBeVisible();
    } else {
      await expect(page.getByText("Formatter").first()).toBeVisible();
    }
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
    const codeArea = section.locator("article.section-full-no-title").first();
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
  const projectConfigId = await resolveProjectConfigId(page, projectConfigName);
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
    throw new Error(
      `Unable to resolve project config id for ${projectConfigName}.`,
    );
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
    const parsed = JSON.parse(text) as unknown;
    const detail = getErrorDetail(parsed);
    if (detail) {
      return detail.trim();
    }
  } catch {
    return text.trim();
  }
  return text.trim();
}

function getErrorDetail(value: unknown): string | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const message = record.message;
  if (typeof message === "string") {
    return message;
  }
  const detail = record.detail;
  if (typeof detail === "string") {
    return detail;
  }
  if (detail && typeof detail === "object") {
    const nested = detail as Record<string, unknown>;
    const nestedMessage = nested.message;
    if (typeof nestedMessage === "string") {
      return nestedMessage;
    }
    const nestedDetail = nested.detail;
    if (typeof nestedDetail === "string") {
      return nestedDetail;
    }
  }
  const error = record.error;
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    const nestedMessage = nested.message;
    if (typeof nestedMessage === "string") {
      return nestedMessage;
    }
    const nestedDetail = nested.detail;
    if (typeof nestedDetail === "string") {
      return nestedDetail;
    }
  }
  return null;
}

function extractFirstDetailLine(detail: string): string {
  const trimmed = detail.trim();
  if (!trimmed) {
    return "";
  }
  const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
  return firstLine;
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
): Promise<{ dx: number; dy: number }> {
  const [anchorBox, popoverBox] = await Promise.all([
    anchor.boundingBox(),
    popover.boundingBox(),
  ]);
  if (!anchorBox || !popoverBox) {
    throw new Error("Unable to measure popover/anchor bounds.");
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
