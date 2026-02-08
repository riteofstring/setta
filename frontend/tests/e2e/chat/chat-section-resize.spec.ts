import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady } from "../helpers";

const BACKEND_ORIGIN =
  process.env.SETTA_BACKEND_ORIGIN ?? "http://127.0.0.1:8000";
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

type CreateSectionResponse = { sectionId?: string };

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type IsolatedProjectContext = {
  projectConfigId: string;
  defaultProjectConfigId: string | null;
};

type LatestProjectStateResponse = {
  projectState?: {
    projectConfig?: {
      topLevelSections?: Record<
        string,
        {
          w?: number | null;
          h?: number | null;
          x?: number;
          y?: number;
          zIndex?: number;
        }
      >;
      sectionVariantMap?: Record<string, string>;
    };
    sectionVariants?: Record<string, { impl?: string }>;
  };
};

test("chat section resize persists after reload", async ({ page }) => {
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const { sectionId } = await createChatSection(
      page,
      projectContext.projectConfigId,
      "__pw_chat_resize__",
    );
    const node = page.locator(`.react-flow__node[data-id="${sectionId}"]`);
    await expect(node).toBeVisible();
    const section = node.locator("section").first();

    const initialLayout = await getSectionLayoutFromState(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    const baseWidth = initialLayout.width ?? 400;
    const baseHeight = initialLayout.height ?? 200;

    await postBackend(page, "/setTopLevelSectionLayout", {
      projectConfigId: projectContext.projectConfigId,
      topLevelSections: {
        [sectionId]: {
          x: initialLayout.x ?? 0,
          y: initialLayout.y ?? 0,
          zIndex: initialLayout.zIndex ?? 0,
          w: baseWidth + 160,
          h: baseHeight + 120,
        },
      },
    });

    await expect
      .poll(
        async () =>
          (await getSectionLayoutFromState(
            page,
            projectContext.projectConfigId,
            sectionId,
          )).width ?? 0,
        { timeout: 10000 },
      )
      .toBeGreaterThan(baseWidth);
    await expect
      .poll(
        async () =>
          (await getSectionLayoutFromState(
            page,
            projectContext.projectConfigId,
            sectionId,
          )).height ?? 0,
        { timeout: 10000 },
      )
      .toBeGreaterThan(baseHeight);

    await page.reload();
    await page.waitForSelector(".react-flow__pane");

    const reloadedLayout = await getSectionLayoutFromState(
      page,
      projectContext.projectConfigId,
      sectionId,
    );
    if (reloadedLayout.width === null || reloadedLayout.height === null) {
      throw new Error("Missing reloaded section layout size.");
    }
    expect(reloadedLayout.width).toBeGreaterThan(baseWidth);
    expect(reloadedLayout.height).toBeGreaterThan(baseHeight);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

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
    .locator('section[class*="card-section"] header.section-title h2')
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

async function createChatSection(
  page: Page,
  projectConfigId: string,
  baseName: string,
): Promise<{ sectionId: string; name: string }> {
  const sectionName = await resolveUniqueSectionName(page, baseName);
  const created = await postBackend<CreateSectionResponse>(
    page,
    "/createTopLevelSection",
    {
      projectConfigId,
      implType: "Chat",
    },
  );
  if (!created?.sectionId) {
    throw new Error("Missing sectionId when creating chat section.");
  }
  await postBackend(page, "/setSectionName", {
    projectConfigId,
    sectionId: created.sectionId,
    name: sectionName,
  });
  return { sectionId: created.sectionId, name: sectionName };
}

async function getSectionLayoutFromState(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<{
  width: number | null;
  height: number | null;
  x: number | null;
  y: number | null;
  zIndex: number | null;
}> {
  const response = await postBackend<LatestProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  const layout =
    response?.projectState?.projectConfig?.topLevelSections?.[sectionId];
  return {
    width: typeof layout?.w === "number" ? layout.w : null,
    height: typeof layout?.h === "number" ? layout.h : null,
    x: typeof layout?.x === "number" ? layout.x : null,
    y: typeof layout?.y === "number" ? layout.y : null,
    zIndex: typeof layout?.zIndex === "number" ? layout.zIndex : null,
  };
}
