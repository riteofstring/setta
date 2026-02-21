import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const HOME_URL = new URL("/home", BASE_URL).toString();
const PROJECT_URL = resolveProjectUrl();
const READY_SELECTOR = ".react-flow__pane";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type TopLevelSectionLayout = { x: number; y: number; zIndex?: number };
type SectionCore = { sharedModifier: { children?: string[] } };
type ProjectStateResponse = {
  projectConfig: {
    sectionVariantMap: Record<string, string>;
    topLevelSections: Record<string, TopLevelSectionLayout>;
  };
  parentSectionMap: Record<string, string | null>;
  sections: Record<string, SectionCore>;
  sectionVariants: Record<string, { impl: string }>;
  sectionImpls: Record<string, { type: string; children?: string[] }>;
};

test("group section children can move within, into, and out", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const groupId = await createTopLevelSectionOfType(page, "Group");
    const childAId = await createTopLevelSectionOfType(page, "Code");
    const childBId = await createTopLevelSectionOfType(page, "Code");

    await moveSections(page, projectConfigId, [childAId], {
      newParentId: groupId,
      newIndex: 0,
      positionsById: null,
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const children = getSectionChildren(state, groupId);
        return {
          children,
          parentA: state.parentSectionMap[childAId] ?? null,
          isTopLevelA: Boolean(state.projectConfig.topLevelSections[childAId]),
        };
      })
      .toEqual({
        children: [childAId],
        parentA: groupId,
        isTopLevelA: false,
      });

    await moveSections(page, projectConfigId, [childBId], {
      newParentId: groupId,
      newIndex: 1,
      positionsById: null,
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const children = getSectionChildren(state, groupId);
        return {
          children,
          parentB: state.parentSectionMap[childBId] ?? null,
        };
      })
      .toEqual({
        children: [childAId, childBId],
        parentB: groupId,
      });

    await moveSections(page, projectConfigId, [childBId], {
      newParentId: groupId,
      newIndex: 0,
      positionsById: null,
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        return getSectionChildren(state, groupId);
      })
      .toEqual([childBId, childAId]);

    await moveSections(page, projectConfigId, [childAId], {
      newParentId: null,
      newIndex: null,
      positionsById: {
        [childAId]: { x: 40, y: 40 },
      },
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const children = getSectionChildren(state, groupId);
        return {
          children,
          parentA: state.parentSectionMap[childAId] ?? null,
          isTopLevelA: Boolean(state.projectConfig.topLevelSections[childAId]),
        };
      })
      .toEqual({
        children: [childBId],
        parentA: null,
        isTopLevelA: true,
      });
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("list root section children can move within, into, and out", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const listRootId = await createTopLevelSectionOfType(page, "ListRoot");
    const childAId = await createTopLevelSectionOfType(page, "Code");
    const childBId = await createTopLevelSectionOfType(page, "Code");

    await moveSections(page, projectConfigId, [childAId], {
      newParentId: listRootId,
      newIndex: 0,
      positionsById: null,
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const children = getSectionChildren(state, listRootId);
        return {
          children,
          parentA: state.parentSectionMap[childAId] ?? null,
          isTopLevelA: Boolean(state.projectConfig.topLevelSections[childAId]),
        };
      })
      .toEqual({
        children: [childAId],
        parentA: listRootId,
        isTopLevelA: false,
      });

    await moveSections(page, projectConfigId, [childBId], {
      newParentId: listRootId,
      newIndex: 1,
      positionsById: null,
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const children = getSectionChildren(state, listRootId);
        return {
          children,
          parentB: state.parentSectionMap[childBId] ?? null,
        };
      })
      .toEqual({
        children: [childAId, childBId],
        parentB: listRootId,
      });

    await moveSections(page, projectConfigId, [childBId], {
      newParentId: listRootId,
      newIndex: 0,
      positionsById: null,
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        return getSectionChildren(state, listRootId);
      })
      .toEqual([childBId, childAId]);

    await moveSections(page, projectConfigId, [childAId], {
      newParentId: null,
      newIndex: null,
      positionsById: {
        [childAId]: { x: 80, y: 40 },
      },
    });

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const children = getSectionChildren(state, listRootId);
        return {
          children,
          parentA: state.parentSectionMap[childAId] ?? null,
          isTopLevelA: Boolean(state.projectConfig.topLevelSections[childAId]),
        };
      })
      .toEqual({
        children: [childBId],
        parentA: null,
        isTopLevelA: true,
      });
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

async function moveSections(
  page: Page,
  projectConfigId: string,
  sectionIds: string[],
  {
    newParentId,
    newIndex,
    positionsById,
  }: {
    newParentId: string | null;
    newIndex: number | null;
    positionsById: Record<string, { x: number; y: number }> | null;
  },
): Promise<void> {
  await postBackend(page, "/moveSections", {
    projectConfigId,
    sectionIds,
    newParentId,
    newIndex,
    positionsById,
  });
}

function resolveSectionImpl(
  state: ProjectStateResponse,
  sectionId: string,
): ProjectStateResponse["sectionImpls"][string] | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  return state.sectionImpls[variant.impl] ?? null;
}

function getSectionChildren(
  state: ProjectStateResponse,
  sectionId: string,
): string[] {
  const coreChildren = state.sections[sectionId]?.sharedModifier?.children;
  if (coreChildren) {
    return coreChildren;
  }
  const impl = resolveSectionImpl(state, sectionId);
  return impl?.children ?? [];
}

async function loadProjectState(
  page: Page,
  projectConfigName: string,
): Promise<ProjectStateResponse> {
  const response = await postBackend<ProjectStateResponse>(
    page,
    "/loadProjectConfig",
    { projectConfigName },
  );
  if (!response) {
    throw new Error("Missing project config response.");
  }
  return response;
}

async function createNewProjectConfig(
  page: Page,
): Promise<{ projectConfigId: string; projectConfigName: string }> {
  await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "New Config" }).click();
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

async function createTopLevelSectionOfType(
  page: Page,
  implType: "Group" | "ListRoot" | "Code",
): Promise<string> {
  const sectionId = await page.evaluate(async (type) => {
    const { createTopLevelSection } = await import(
      "/src/state/actions/sections/createSections"
    );
    const { SectionTypeEnum } = await import("/src/utils/generatedTypes");
    const resolvedType = SectionTypeEnum[type] ?? type;
    return await createTopLevelSection({
      implType: resolvedType,
      implOverrides: null,
      position: null,
    });
  }, implType);
  if (!sectionId) {
    throw new Error("Missing sectionId when creating section.");
  }
  return sectionId;
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
    return;
  }
  await postBackend(page, "/deleteProjectConfigs", { ids: [match.id] });
}

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
