import { expect, test, type Page } from "@playwright/test";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BOOTSTRAP_TOKEN = process.env.SETTA_BOOTSTRAP_TOKEN ?? "";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const PROJECT_URL =
  process.env.SETTA_PROJECT_URL ??
  (process.env.SETTA_PROJECT_PATH
    ? new URL(process.env.SETTA_PROJECT_PATH, BASE_URL).toString()
    : BASE_URL);

const PROMPT_SECTION_BASE_NAME = "__pw_prompt__";

type CreateSectionResponse = {
  sectionId?: string;
};

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};

type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};

test.describe.serial("prompt section", () => {
  test("creates a prompt section", async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => {
      pageErrors.push(err.message ?? String(err));
    });

    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const sectionName = await resolveUniqueSectionName(
        page,
        PROMPT_SECTION_BASE_NAME,
      );
      const created = await postBackend<CreateSectionResponse>(
        page,
        "/createTopLevelSection",
        {
          projectConfigId: projectContext.projectConfigId,
          implType: "Prompt",
        },
      );
      if (!created?.sectionId) {
        throw new Error("Missing sectionId when creating prompt section.");
      }

      await postBackend(page, "/setSectionName", {
        projectConfigId: projectContext.projectConfigId,
        sectionId: created.sectionId,
        name: sectionName,
      });

      const node = page.locator(`[data-testid="rf__node-${created.sectionId}"]`);
      await expect(node).toBeVisible();
      await expect(
        node.locator("header.section-title").getByText(sectionName),
      ).toBeVisible();
      await expect(node.getByText("No prompt rendered yet.")).toBeVisible();

      const minHeightErrors = pageErrors.filter(
        (message) =>
          message.includes("getMinSectionHeight") ||
          message.includes("minHeight"),
      );
      expect(minHeightErrors).toEqual([]);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });
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

async function openIsolatedProject(page: Page): Promise<IsolatedProjectContext> {
  const metadata = await postBackend<ProjectMetadataResponse>(
    page,
    "/loadAllProjectMetadata",
    {},
  );
  if (!metadata) {
    throw new Error("Missing project metadata response.");
  }
  const name = await postBackend<string>(page, "/createProjectConfig", {
    previewImgColor: "bg-blue-500/60",
  });
  if (!name) {
    throw new Error("Missing project config name.");
  }
  const url = new URL(name, BASE_URL).toString();
  await page.goto(url);
  await page.waitForSelector(".react-flow__pane");
  const projectConfigId = await getCurrentProjectConfigId(page);
  return {
    projectConfigId,
    defaultProjectConfigId: metadata.defaultProjectConfigId ?? null,
  };
}

async function cleanupIsolatedProject(
  page: Page,
  context: IsolatedProjectContext | null,
): Promise<void> {
  if (!context) {
    return;
  }
  if (
    context.defaultProjectConfigId &&
    context.defaultProjectConfigId !== context.projectConfigId
  ) {
    await postBackend(page, "/setAsDefaultProject", {
      projectConfigId: context.defaultProjectConfigId,
    });
  }
  await postBackend(page, "/deleteProjectConfigs", {
    ids: [context.projectConfigId],
  });
}

async function resolveUniqueSectionName(
  page: Page,
  baseName: string,
): Promise<string> {
  const titles = await page
    .locator('section[class*="card-section"] header.section-title p, section[class*="card-section"] header.section-title h2')
    .allTextContents();
  const existingTitles = new Set(
    titles.map((title) => title.trim()).filter(Boolean),
  );
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
