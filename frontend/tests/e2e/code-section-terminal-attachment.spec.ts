import { expect, test, type Page } from "@playwright/test";
import { ensureAppReady, postBackend } from "./helpers";

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
    }
  >;
};

test("run attaches a terminal and reuses it", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await postBackend(page, "/setSectionName", {
      projectConfigId,
      sectionId,
      name: "Runner Code",
    });

    await runCodeBlockInPage(page, sectionId);
    const firstTerminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    await runCodeBlockInPage(page, sectionId);
    const secondTerminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    expect(secondTerminalId).toBe(firstTerminalId);
    const embeddedTerminal = page.locator(
      `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${firstTerminalId}"]`,
    );
    await expect(embeddedTerminal).toBeVisible();
    const terminalNode = page.locator(
      `.react-flow__node[data-id="${firstTerminalId}"]`,
    );
    await expect(terminalNode).toHaveCount(0);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("embedded terminal keeps code editor visible", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const codeEditor = page.locator(
      `.react-flow__node[data-id="${sectionId}"] article[data-section-main-editor]`,
    );
    const terminalContainer = page.locator(
      `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );

    await expect(codeEditor).toBeVisible();
    await expect(terminalContainer).toBeVisible();

    await expect
      .poll(async () => {
        const codeBox = await codeEditor.boundingBox();
        const terminalBox = await terminalContainer.boundingBox();
        if (!codeBox || !terminalBox) {
          return { codeHeight: 0, terminalHeight: 0 };
        }
        return { codeHeight: codeBox.height, terminalHeight: terminalBox.height };
      })
      .toEqual(
        expect.objectContaining({
          codeHeight: expect.any(Number),
          terminalHeight: expect.any(Number),
        }),
      );

    await expect
      .poll(async () => {
        const codeBox = await codeEditor.boundingBox();
        const terminalBox = await terminalContainer.boundingBox();
        if (!codeBox || !terminalBox) {
          return false;
        }
        return codeBox.height > terminalBox.height && codeBox.height > 120;
      })
      .toBe(true);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("terminal can attach via moveSectionsWithBackend", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    const terminalSectionId = await createTerminalSection(page);

    const codeNode = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"]`,
    );
    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalSectionId}"]`,
    );

    await expect(codeNode).toBeVisible();
    await expect(terminalNode).toBeVisible();

    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalSectionId],
      newParentId: codeSectionId,
      newIndex: 0,
      positionsById: null,
    });

    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalSectionId);
    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        return Boolean(state.projectConfig.topLevelSections[terminalSectionId]);
      })
      .toBe(false);

    const embeddedTerminal = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalSectionId}"]`,
    );
    await expect(embeddedTerminal).toBeVisible();
    await expect(
      page.locator(`.react-flow__node[data-id="${terminalSectionId}"]`),
    ).toHaveCount(0);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("attach then drag-detach round trip", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigId, projectConfigName } =
    await createNewProjectConfig(page);

  try {
    const codeSectionId = await createCodeSection(page);
    const terminalSectionId = await createTerminalSection(page);

    const codeNode = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"]`,
    );
    const terminalNode = page.locator(
      `.react-flow__node[data-id="${terminalSectionId}"]`,
    );

    await expect(codeNode).toBeVisible();
    await expect(terminalNode).toBeVisible();

    await postBackend(page, "/moveSections", {
      projectConfigId,
      sectionIds: [terminalSectionId],
      newParentId: codeSectionId,
      newIndex: 0,
      positionsById: null,
    });

    const attachedId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      codeSectionId,
    );
    expect(attachedId).toBe(terminalSectionId);
    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        return Boolean(state.projectConfig.topLevelSections[terminalSectionId]);
      })
      .toBe(false);

    const embeddedTerminal = page.locator(
      `.react-flow__node[data-id="${codeSectionId}"] [data-attached-terminal-section-id="${terminalSectionId}"]`,
    );
    await expect(embeddedTerminal).toBeVisible();

    await page.keyboard.down("Alt");
    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    const terminalBox = await embeddedTerminal.boundingBox();
    const codeBox = await codeNode.boundingBox();

    if (!paneBox || !terminalBox || !codeBox) {
      throw new Error("Missing bounding boxes for drag.");
    }

    const startX = terminalBox.x + terminalBox.width / 2;
    const startY = terminalBox.y + terminalBox.height / 2;
    const targetX = Math.min(
      codeBox.x + codeBox.width + 320,
      paneBox.x + paneBox.width - 40,
    );
    const targetY = Math.min(
      codeBox.y + 40,
      paneBox.y + paneBox.height - 40,
    );

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(targetX, targetY, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const impl = resolveSectionImpl(state, codeSectionId);
        const children = impl?.children ?? [];
        const attached = impl?.attachedTerminalSectionId ?? null;
        const isTopLevel = Boolean(
          state.projectConfig.topLevelSections[terminalSectionId],
        );
        return attached === null && children.length === 0 && isTopLevel;
      })
      .toBe(true);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

test("embedded terminal can detach via drag and drop", async ({ page }) => {
  test.setTimeout(90000);
  await ensureAppReady(page);

  const { projectConfigName } = await createNewProjectConfig(page);

  try {
    const sectionId = await createCodeSection(page);
    await runCodeBlockInPage(page, sectionId);
    const terminalId = await waitForAttachedTerminalId(
      page,
      projectConfigName,
      sectionId,
    );

    const terminalContainer = page.locator(
      `.react-flow__node[data-id="${sectionId}"] [data-attached-terminal-section-id="${terminalId}"]`,
    );
    await expect(terminalContainer).toBeVisible();

    await page.keyboard.down("Alt");

    const pane = page.locator(".react-flow__pane");
    const paneBox = await pane.boundingBox();
    const terminalBox = await terminalContainer.boundingBox();
    const codeBox = await page
      .locator(`.react-flow__node[data-id="${sectionId}"]`)
      .boundingBox();

    if (!paneBox || !terminalBox || !codeBox) {
      throw new Error("Missing bounding boxes for drag.");
    }

    const startX = terminalBox.x + terminalBox.width / 2;
    const startY = terminalBox.y + terminalBox.height / 2;
    const targetX = Math.min(
      codeBox.x + codeBox.width + 320,
      paneBox.x + paneBox.width - 40,
    );
    const targetY = Math.min(
      codeBox.y + 40,
      paneBox.y + paneBox.height - 40,
    );

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.waitForTimeout(250);
    await page.mouse.move(targetX, targetY, { steps: 8 });
    await page.mouse.up();
    await page.keyboard.up("Alt");

    await expect
      .poll(async () => {
        const state = await loadProjectState(page, projectConfigName);
        const terminalLayout =
          state.projectConfig.topLevelSections[terminalId];
        const codeImpl = resolveSectionImpl(state, sectionId);
        const children = codeImpl?.children ?? [];
        return Boolean(terminalLayout) && !children.includes(terminalId);
      })
      .toBe(true);
  } finally {
    await deleteProjectConfigByName(page, projectConfigName);
  }
});

async function runCodeBlockInPage(page: Page, sectionId: string): Promise<void> {
  await page.evaluate(async (id) => {
    const { runCodeBlock } = await import("/src/state/actions/runOrImportCode");
    await runCodeBlock(id);
  }, sectionId);
}



async function waitForAttachedTerminalId(
  page: Page,
  projectConfigName: string,
  sectionId: string,
): Promise<string> {
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
    const attachedImpl = resolveSectionImpl(state, attachedId);
    if (!attachedImpl || attachedImpl.type !== "Terminal") {
      await page.waitForTimeout(250);
      continue;
    }
    return attachedId;
  }
  throw new Error("Timed out waiting for attached terminal.");
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

async function createCodeSection(page: Page): Promise<string> {
  return await createTopLevelSectionOfType(page, "Code");
}

async function createTerminalSection(page: Page): Promise<string> {
  return await createTopLevelSectionOfType(page, "Terminal");
}

async function createTopLevelSectionOfType(
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
