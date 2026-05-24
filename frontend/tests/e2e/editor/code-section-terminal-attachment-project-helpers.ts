import type { Page } from "@playwright/test";
import { moveSectionsFromFrontend, postBackend } from "../helpers";

export const BASE_URL =
  process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
export const HOME_URL = new URL("/home", BASE_URL).toString();
export const PROJECT_URL = resolveProjectUrl();
export const READY_SELECTOR = ".setta-gpu-flow__pane";

type ProjectMetadataEntry = { id: string; name: string };
type ProjectMetadataResponse = {
  defaultProjectConfigId: string | null;
  projectMetadata: ProjectMetadataEntry[];
};
type TopLevelSectionLayout = { x: number; y: number; zIndex?: number };
type SectionCore = {
  sharedModifier: { attachedTerminalSectionId?: string | null };
};
type ProjectStateResponse = {
  projectConfig: {
    sectionVariantMap: Record<string, string>;
    topLevelSections: Record<string, TopLevelSectionLayout>;
  };
  sections: Record<string, SectionCore>;
  sectionVariants: Record<string, { impl: string }>;
  sectionImpls: Record<
    string,
    {
      type: string;
      attachedTerminalSectionId?: string | null;
      children?: string[];
      code?: string;
      size?: {
        width: number | "auto";
        height: number | "auto";
      };
    }
  >;
};

export async function waitForAttachedTerminalId(
  page: Page,
  projectConfigName: string,
  sectionId: string,
  options?: { requireChild?: boolean },
): Promise<string> {
  const requireChild = options?.requireChild ?? false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await loadProjectState(page, projectConfigName);
    const core = state.sections[sectionId];
    const coreAttachedId =
      core?.sharedModifier.attachedTerminalSectionId ?? null;
    const impl = resolveSectionImpl(state, sectionId);
    if (!core && !impl) {
      await page.waitForTimeout(250);
      continue;
    }
    const attachedId =
      coreAttachedId ?? impl?.attachedTerminalSectionId ?? null;
    if (!attachedId) {
      await page.waitForTimeout(250);
      continue;
    }
    if (requireChild) {
      if (!impl?.children || !impl.children.includes(attachedId)) {
        await page.waitForTimeout(250);
        continue;
      }
    }
    const attachedImpl = resolveSectionImpl(state, attachedId);
    if (!attachedImpl || attachedImpl.type !== "Terminal") {
      await page.waitForTimeout(250);
      continue;
    }
    return attachedId;
  }
  throw new Error("Timed out waiting for attached terminal.");
}

export function resolveSectionImpl(
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

export async function loadProjectState(
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

export async function moveSectionsViaBackend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionIds: string[];
    newParentId: string | null;
    newIndex: number | null;
    positionsById: Record<string, { x: number; y: number }> | null;
  },
): Promise<void> {
  await moveSectionsFromFrontend(page, payload);
}

export async function createNewProjectConfig(
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

export async function resolveProjectConfigId(
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

export async function createCodeSection(page: Page): Promise<string> {
  return await createTopLevelSectionOfType(page, "Code");
}

export async function createTerminalSection(page: Page): Promise<string> {
  return await createTopLevelSectionOfType(page, "Terminal");
}

export async function createTopLevelSectionOfType(
  page: Page,
  implType: "Code" | "Terminal",
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

export function getProjectConfigName(pageUrl: string, baseUrl: string): string {
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

export async function deleteProjectConfigById(
  page: Page,
  projectConfigId: string,
): Promise<void> {
  if (page.isClosed()) {
    return;
  }
  // Clean up via the same surface area as users (home page), otherwise the
  // still-mounted project page can keep sending layout updates for the deleted
  // config and starve the delete request.
  try {
    await page.goto(HOME_URL, { waitUntil: "domcontentloaded" });
  } catch (error) {
    if (page.isClosed()) {
      return;
    }
    throw error;
  }

  try {
    await postBackend(page, "/deleteProjectConfigs", {
      ids: [projectConfigId],
    });
  } catch (error) {
    if (page.isClosed()) {
      return;
    }
    throw error;
  }
}

export function resolveProjectUrl(): string {
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
