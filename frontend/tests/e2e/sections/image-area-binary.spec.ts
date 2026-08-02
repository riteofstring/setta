import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  setImageAreaImagePathFromFrontend,
  setSectionNameFromFrontend,
} from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const TEST_IMAGE_PATH = "artifacts/pw_image.png";
const ONE_BY_ONE_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Yp0oL0AAAAASUVORK5CYII=";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type CreateTopLevelSectionResponse = { sectionId: string };
type ContentRef = {
  contentId: string;
  byteLength: number;
  mimeType: string | null;
  sha256: string | null;
};

test("image artifacts render from binary store", async ({ page }) => {
  await ensureAppReady(page);

  const projectConfigId = await getCurrentProjectConfigId(page);
  const sectionName = await resolveUniqueSectionName(page, "__pw_image__");

  const sectionId = await createImageSection(
    page,
    projectConfigId,
    sectionName,
  );

  const binaryRef = await uploadTestPng(page);
  await updateImageArtifact(page, TEST_IMAGE_PATH, binaryRef);
  // Set the path after the artifact exists so the first frontend fetch sees the
  // binary payload (the updateArtifacts endpoint does not broadcast changes in
  // IDE mode, so ordering matters for reliability).
  await setImagePath(page, projectConfigId, sectionId, TEST_IMAGE_PATH);

  const section = findSectionCandidates(page, sectionName).first();
  await expect(section).toBeVisible();

  const img = section.locator("img");
  await expect
    .poll(async () => {
      if ((await img.count()) === 0) {
        return 0;
      }
      return await img.evaluate((el) =>
        el instanceof HTMLImageElement ? el.naturalWidth : 0,
      );
    }, { timeout: 20000 })
    .toBeGreaterThan(0);

  const src = await img.evaluate((el) => el.getAttribute("src") ?? "");
  expect(src.startsWith("blob:")).toBe(true);
});

async function createImageSection(
  page: Page,
  projectConfigId: string,
  sectionName: string,
): Promise<string> {
  const existing = findSectionCandidates(page, sectionName);
  if ((await existing.count()) > 0) {
    await expect(existing.first()).toBeVisible();
    const sectionId = await existing.first().getAttribute("data-section-id");
    if (sectionId) {
      return sectionId;
    }
  }

  const created = (await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "Image",
  })) as CreateTopLevelSectionResponse | null;
  const sectionId = created?.sectionId;
  if (!sectionId) {
    throw new Error("Missing sectionId when creating image section.");
  }
  await setSectionNameFromFrontend(page, {
    projectConfigId,
    sectionId,
    name: sectionName,
  });
  return sectionId;
}

async function setImagePath(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  imagePath: string,
): Promise<void> {
  await setImageAreaImagePathFromFrontend(page, {
    projectConfigId,
    sectionId,
    imagePath,
  });
}

async function uploadTestPng(page: Page): Promise<ContentRef> {
  const buffer = Buffer.from(ONE_BY_ONE_PNG_BASE64, "base64");
  const response = await page.request.post(`${BACKEND_ORIGIN}/api/binary/upload`, {
    multipart: {
      file: {
        name: "pw.png",
        mimeType: "image/png",
        buffer,
      },
    },
  });
  if (!response.ok()) {
    throw new Error(`Binary upload failed: ${response.status()}`);
  }
  return (await response.json()) as ContentRef;
}

async function updateImageArtifact(
  page: Page,
  imagePath: string,
  binaryRef: ContentRef,
): Promise<void> {
  await postBackend(page, "/updateArtifacts", {
    artifacts: [
      {
        type: "Image",
        id: imagePath,
        value: binaryRef,
      },
    ],
    uploadScope: "generic",
  });
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

async function postBackend<T>(
  page: Page,
  path: string,
  payload: Record<string, unknown> | null,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload ?? {},
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
