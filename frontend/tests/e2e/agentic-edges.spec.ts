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

const LOCAL_STORAGE_KEY = "setta_data";

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

type CreatedSection = {
  sectionId: string;
  name: string;
  locator: Locator;
};

test.describe.serial("agentic edges", () => {
  test("chat context links create and remove agentic edges", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const chatSection = await createTopLevelSection(page, {
        projectConfigId: projectContext.projectConfigId,
        implType: "Chat",
        baseName: "__pw_agent_chat__",
      });
      const contextSection = await createTopLevelSection(page, {
        projectConfigId: projectContext.projectConfigId,
        implType: "Dict",
        baseName: "__pw_agent_context__",
      });

      await postBackend(page, "/createAgenticEdge", {
        projectConfigId: projectContext.projectConfigId,
        sourceSectionId: contextSection.sectionId,
        targetSectionId: chatSection.sectionId,
        kind: "section_chat",
      });

      await expect
        .poll(async () =>
          page.locator(".react-flow__agentic-edge-path").count(),
        )
        .toBe(1);

      await chatSection.locator.click();
      await ensureUiEditorVisible(page);

      const uiEditor = page.locator("#UiEditorPane");
      await expect(uiEditor.getByText("Context & Links")).toBeVisible();

      const contextBlock = uiEditor
        .locator("div", {
          has: uiEditor.getByText("Context sources"),
        })
        .first();

      await expect(
        contextBlock.getByText(contextSection.name),
      ).toBeVisible();

      await contextBlock.getByRole("button", { name: "Remove" }).click();
      await expect(
        contextBlock.getByText("No context links yet."),
      ).toBeVisible();

      await expect
        .poll(async () =>
          page.locator(".react-flow__agentic-edge-path").count(),
        )
        .toBe(0);
    } finally {
      await cleanupIsolatedProject(page, projectContext);
    }
  });

  test("agent link mode creates and deletes chat edges", async ({ page }) => {
    await ensureAppReady(page);
    const projectContext = await openIsolatedProject(page);

    try {
      const chatA = await createTopLevelSection(page, {
        projectConfigId: projectContext.projectConfigId,
        implType: "Chat",
        baseName: "__pw_agent_link_a__",
      });
      const chatB = await createTopLevelSection(page, {
        projectConfigId: projectContext.projectConfigId,
        implType: "Chat",
        baseName: "__pw_agent_link_b__",
      });

      await chatA.locator.click();
      const linkButton = chatA.locator.getByTitle("Create agentic link");
      await linkButton.click();
      await chatB.locator.click();

      await expect
        .poll(async () =>
          page.locator(".react-flow__agentic-edge-path").count(),
        )
        .toBe(1);

      await ensureUiEditorVisible(page);
      await chatA.locator.click();

      const uiEditor = page.locator("#UiEditorPane");
      const linkedAgentsBlock = uiEditor
        .locator("div", {
          has: uiEditor.getByText("Linked agents"),
        })
        .first();
      await expect(linkedAgentsBlock.getByText(chatB.name)).toBeVisible();

      const edgeGroup = page.locator(".react-flow__agentic-edge").first();
      await edgeGroup.click({ force: true });
      await expect(
        page.locator(".react-flow__agentic-edge-path.agentic-edge--selected"),
      ).toHaveCount(1);

      await page.keyboard.press("Delete");

      await expect
        .poll(async () =>
          page.locator(".react-flow__agentic-edge-path").count(),
        )
        .toBe(0);

  await expect(
    linkedAgentsBlock.getByText("No linked agents yet."),
  ).toBeVisible();
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
  timeoutMs = 20000,
): Promise<T | null> {
  const response = await page.request.post(`${BACKEND_ORIGIN}/api${path}`, {
    data: payload,
    timeout: timeoutMs,
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
  try {
    if (
      context.defaultProjectConfigId &&
      context.defaultProjectConfigId !== context.projectConfigId
    ) {
      await postBackend(
        page,
        "/setAsDefaultProject",
        { projectConfigId: context.defaultProjectConfigId },
        10000,
      );
    }
    await postBackend(
      page,
      "/deleteProjectConfigs",
      { ids: [context.projectConfigId] },
      10000,
    );
  } catch (error) {
    console.warn("Failed to cleanup isolated project:", error);
  }
}

async function resolveUniqueSectionName(
  page: Page,
  baseName: string,
): Promise<string> {
  const titles = await page
    .locator('section[class*="card-section"] header.section-title p')
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

function findSectionCandidates(page: Page, name: string): Locator {
  return page
    .locator('section[class*="card-section"]')
    .filter({ has: page.locator("header.section-title p", { hasText: name }) });
}

async function createTopLevelSection(
  page: Page,
  {
    projectConfigId,
    implType,
    baseName,
  }: {
    projectConfigId: string;
    implType: string;
    baseName: string;
  },
): Promise<CreatedSection> {
  const name = await resolveUniqueSectionName(page, baseName);
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType,
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name,
  });
  const locator = findSectionCandidates(page, name).first();
  await expect(locator).toBeVisible();
  return { sectionId: created.sectionId, name, locator };
}

async function ensureUiEditorVisible(page: Page): Promise<void> {
  const isVisible = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return false;
    }
    try {
      const payload = JSON.parse(raw);
      const state = payload.state ?? payload;
      return Boolean(state.uiEditorVis);
    } catch {
      return false;
    }
  }, LOCAL_STORAGE_KEY);

  if (isVisible) {
    return;
  }

  await page.locator("#UiEditorPane button").first().click();
  await page.waitForFunction((key) => {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return false;
    }
    try {
      const payload = JSON.parse(raw);
      const state = payload.state ?? payload;
      return Boolean(state.uiEditorVis);
    } catch {
      return false;
    }
  }, LOCAL_STORAGE_KEY);
}
