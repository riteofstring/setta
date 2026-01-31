import { expect, test, type Locator, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type CreateTopLevelSectionResponse = { sectionId: string };

test("draw realtime updates send binary websocket frames", async ({ page }) => {
  await installFrameCapture(page);
  await ensureAppReady(page);

  const { drawSection, projectConfigId } = await ensureDrawSection(page);
  const canvas = drawSection.locator("canvas").first();
  await waitForCanvasReady(canvas);
  await enableRealtimeCoverage(page, projectConfigId);

  await resetSentFrames(page);

  await drawStroke(page, canvas);

  await expect
    .poll(async () => (await getSentFrameSummary(page)).binaryCount, {
      timeout: 5000,
    })
    .toBeGreaterThan(0);

  const { textFrames } = await getSentFrameSummary(page);
  const hasBinaryPayloadField = textFrames.some((payload) =>
    payload.includes('"binaryPayload"'),
  );
  expect(hasBinaryPayloadField).toBe(false);
});

async function ensureAppReady(page: Page): Promise<void> {
  await page.goto(PROJECT_URL);
  if (await isAppReady(page)) {
    return;
  }
  if (!BOOTSTRAP_TOKEN) {
    throw new Error(
      "Missing SETTA_BOOTSTRAP_TOKEN. Open /__setta__/bootstrap to mint one.",
    );
  }
  await page.goto(`${BACKEND_ORIGIN}/__setta__/bootstrap#token=${BOOTSTRAP_TOKEN}`);
  await page.waitForURL(PROJECT_URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".react-flow__pane");
}

async function isAppReady(page: Page): Promise<boolean> {
  try {
    await page.waitForSelector(".react-flow__pane", { timeout: 10000 });
    return true;
  } catch {
    return false;
  }
}

async function ensureDrawSection(
  page: Page,
): Promise<{ drawSection: Locator; projectConfigId: string }> {
  const sectionName = await resolveUniqueSectionName(page, "__pw_draw__");
  const existing = findSectionCandidates(page, sectionName);
  if ((await existing.count()) > 0) {
    const first = existing.first();
    await expect(first).toBeVisible();
    const projectConfigId = await getCurrentProjectConfigId(page);
    return { drawSection: first, projectConfigId };
  }

  const projectConfigId = await getCurrentProjectConfigId(page);
  const created = await postBackend<CreateTopLevelSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Draw",
    },
  );
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating draw section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId,
    name: sectionName,
  });

  const section = findSectionCandidates(page, sectionName).first();
  await expect(section).toBeVisible();
  return { drawSection: section, projectConfigId };
}

async function waitForCanvasReady(canvas: Locator): Promise<void> {
  await expect
    .poll(async () => {
      const box = await canvas.boundingBox();
      return Boolean(box && box.width > 0 && box.height > 0);
    })
    .toBe(true);
}

async function drawStroke(page: Page, canvas: Locator): Promise<void> {
  const box = await canvas.boundingBox();
  if (!box) {
    throw new Error("Draw canvas not visible.");
  }
  const startX = box.x + box.width * 0.2;
  const startY = box.y + box.height * 0.2;
  const endX = box.x + box.width * 0.7;
  const endY = box.y + box.height * 0.7;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 6 });
  await page.mouse.up();
}

async function enableRealtimeCoverage(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  await page.evaluate(async (id) => {
    const { applyListenerCoverageSnapshot } = await import(
      "/src/state/actions/listenerCoverage"
    );
    applyListenerCoverageSnapshot({
      projectConfigId: id,
      dependencies: [],
      hasRealtimeWildcard: true,
    });
  }, projectConfigId);
}

async function installFrameCapture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const windowWithFrames = window as typeof window & {
      __sentFrames?: unknown[];
    };
    windowWithFrames.__sentFrames = [];
    const originalSend = WebSocket.prototype.send;
    WebSocket.prototype.send = function patchedSend(data: unknown) {
      windowWithFrames.__sentFrames?.push(data);
      return originalSend.call(this, data);
    };
  });
}

async function resetSentFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const windowWithFrames = window as typeof window & {
      __sentFrames?: unknown[];
    };
    windowWithFrames.__sentFrames = [];
  });
}

async function getSentFrameSummary(page: Page): Promise<{
  binaryCount: number;
  textFrames: string[];
}> {
  return await page.evaluate(() => {
    const windowWithFrames = window as typeof window & {
      __sentFrames?: unknown[];
    };
    const frames = windowWithFrames.__sentFrames ?? [];
    let binaryCount = 0;
    const textFrames: string[] = [];
    frames.forEach((frame) => {
      if (typeof frame === "string") {
        textFrames.push(frame);
        return;
      }
      if (frame instanceof ArrayBuffer) {
        binaryCount += 1;
        return;
      }
    });
    return { binaryCount, textFrames };
  });
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

async function resolveUniqueSectionName(
  page: Page,
  baseName: string,
): Promise<string> {
  const existingTitles = new Set(await getSectionTitles(page));
  if (!existingTitles.has(baseName)) {
    return baseName;
  }
  for (let i = 1; i <= 5; i += 1) {
    const candidate = `${baseName}-${i}`;
    if (!existingTitles.has(candidate)) {
      return candidate;
    }
  }
  return `${baseName}-${Date.now()}`;
}

async function getSectionTitles(page: Page): Promise<string[]> {
  const titles = await page
    .locator('section[class*="card-section"] header.section-title p')
    .allTextContents();
  return titles.map((title) => title.trim()).filter((title) => title.length > 0);
}

function findSectionCandidates(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}
