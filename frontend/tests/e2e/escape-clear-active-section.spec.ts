import { expect, test, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const AUTH_COOKIE_NAME = process.env.SETTA_AUTH_COOKIE_NAME ?? "setta_auth";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);
const READY_SELECTOR = ".react-flow__pane";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};

test("escape clears active section when focused in section input", async ({
  page,
}) => {
  await ensureAppReady(page);
  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionId = await createCallableSection(page, projectConfigId);

  try {
    await clearSelectedParams(page, projectConfigId);
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();

    const sectionCard = sectionNode.locator("section").first();
    await sectionCard.click();
    await expect
      .poll(async () => await isSectionActiveByClass(page, sectionId))
      .toBe(true);

    const searchTarget = page.locator(`[id="${sectionId}-search"]`);
    await expect(searchTarget).toBeVisible();
    await searchTarget.click();
    await expect
      .poll(async () => await isFocusedInsideSection(page, sectionId))
      .toBe(true);

    await page.keyboard.press("Escape");

    await expect
      .poll(async () => await isSectionActiveByClass(page, sectionId))
      .toBe(false);
    await expect
      .poll(async () => await isDocumentFocusNeutral(page))
      .toBe(true);
  } finally {
    await postBackend(page, "/deleteSections", {
      projectConfigId,
      sectionIds: [sectionId],
    });
  }
});

async function ensureAppReady(page: Page): Promise<void> {
  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
  if (await isAppReady(page)) {
    return;
  }

  const hasCookie = await hasAuthCookie(page);
  if (!hasCookie && BOOTSTRAP_TOKEN) {
    await page.goto(
      `${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`,
    );
    try {
      await waitForProjectUrl(page);
    } catch {
      // Fall through to the final readiness check below.
    }
  }

  await page.goto(PROJECT_URL, { waitUntil: "domcontentloaded" });
  if (await isAppReady(page)) {
    return;
  }

  if (!BOOTSTRAP_TOKEN && !hasCookie) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN and no auth cookie present. Open /__setta__/bootstrap to mint one.",
    );
  }
  throw new Error("Setta UI did not become ready. Check bootstrap auth.");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(READY_SELECTOR, { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function waitForProjectUrl(page: Page): Promise<void> {
  await page.waitForURL(
    (url) => url.toString().startsWith(PROJECT_URL),
    { timeout: 20000, waitUntil: "domcontentloaded" },
  );
}

async function hasAuthCookie(page: Page): Promise<boolean> {
  const cookies = await page
    .context()
    .cookies([PROJECT_URL, BACKEND_ORIGIN]);
  return cookies.some((cookie) => cookie.name === AUTH_COOKIE_NAME);
}

async function getCurrentProjectConfigId(page: Page): Promise<string> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }

  const currentPath = new URL(page.url()).pathname;
  const projectName = currentPath.split("/").filter(Boolean)[0];
  if (projectName) {
    const match = metadata.projectMetadata.find((p) => p.name === projectName);
    if (match?.id) {
      return match.id;
    }
  }

  if (metadata.defaultProjectConfigId) {
    return metadata.defaultProjectConfigId;
  }

  throw new Error("Unable to resolve projectConfigId for test.");
}

async function createCallableSection(
  page: Page,
  projectConfigId: string,
): Promise<string> {
  const response = await postBackend<{ sectionId?: string }>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Callable",
    },
  );
  if (!response?.sectionId) {
    throw new Error("Missing sectionId when creating callable section.");
  }
  return response.sectionId;
}

async function clearSelectedParams(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  await postBackend(page, "/unselectAllParams", { projectConfigId });
}

async function isDocumentFocusNeutral(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    return (
      document.activeElement === document.body ||
      document.activeElement === document.documentElement
    );
  });
}

async function isSectionActiveByClass(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const node = document.querySelector(`.react-flow__node[data-id="${id}"]`);
    if (!node) {
      return false;
    }
    const section = node.querySelector("section");
    if (!(section instanceof HTMLElement)) {
      return false;
    }
    return section.classList.contains("outline-blue-600");
  }, sectionId);
}

async function isFocusedInsideSection(
  page: Page,
  sectionId: string,
): Promise<boolean> {
  return page.evaluate((id) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) {
      return false;
    }
    if (active.id === `${id}-search`) {
      return true;
    }
    const sectionNode = active.closest(".react-flow__node");
    return sectionNode?.getAttribute("data-id") === id;
  }, sectionId);
}

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
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
