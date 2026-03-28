import { expect, test, type ConsoleMessage, type Page } from "@playwright/test";
import {
  addKwargFromFrontend,
  cleanupIsolatedProject,
  createCallableSection,
  createTextBlockSection,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  getViewportBoundsForPlacement,
  openIsolatedProject,
  postBackend,
  setCodeObjNameFromFrontend,
  setOverviewTab,
  setParamEnteredValueFromFrontend,
  setSectionNameFromFrontend,
  setSectionSizesFromFrontend,
} from "../../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const READY_SELECTOR = ".react-flow__pane";

type ProjectCodegenTarget = {
  language: string;
  sectionPolicy?: {
    sectionOverrides: Record<
      string,
      {
        mode: string;
        representation: string;
      }
    >;
  };
  codeObjValuePolicy?: {
    codeObjOverrides: Record<
      string,
      {
        representation: string;
      }
    >;
  };
};

type LoadedCodegenProjectState = {
  projectConfig: {
    id: string;
    sectionVariantMap: Record<string, string>;
    codegenTargets: ProjectCodegenTarget[];
    topLevelSections: Record<
      string,
      {
        x?: number;
        y?: number;
        w?: number | null;
        h?: number | null;
      }
    >;
  };
  sectionVariants: Record<
    string,
    {
      impl: string;
    }
  >;
  sectionImpls: Record<
    string,
    {
      type: string;
      code?: string;
      size?: {
        width?: number | string;
        height?: number | string;
      };
      codeObjVariantMap?: Record<string, string>;
    }
  >;
  singletonSections: {
    GenPythonCode: string | null;
    GenPythonMetadata: string | null;
  };
};

type LatestCodegenProjectState = {
  projectConfig: {
    sectionVariantMap: Record<string, string>;
  };
  parentSectionMap: Record<string, string | null>;
  sections: Record<
    string,
    {
      sharedModifier?: { children?: string[] };
    }
  >;
  sectionVariants: Record<
    string,
    {
      impl: string;
    }
  >;
  sectionImpls: Record<
    string,
    {
      type: string;
      children?: string[];
    }
  >;
};

type LatestCodegenProjectStateResponse = {
  projectState: LatestCodegenProjectState | null;
};

type CreateTopLevelSectionResponse = {
  sectionId?: string;
  metaControlParamId?: string | null;
};

type BackendLspDiagnosticsPayload = {
  projectConfigId: string;
  genCode: {
    projectConfigId: string;
    isGenCode: boolean;
    errors: Record<
      string,
      {
        callable: string[];
        params: Record<string, string[]>;
      }
    >;
  };
  codeSections: Record<string, unknown[]>;
  unmappedGenCode: Array<{ message: string }>;
};

async function expandRunInstructionsAccordion(
  page: Page,
  testId: string,
): Promise<void> {
  const trigger = page.getByTestId(testId);
  await expect(trigger).toBeVisible();
  const expanded = await trigger.getAttribute("aria-expanded");
  if (expanded !== "true") {
    await trigger.click();
  }
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
}

async function openCodegenAccordions(page: Page): Promise<void> {
  await expandRunInstructionsAccordion(
    page,
    "run-instructions-accordion-codegen-targets",
  );
  await expandRunInstructionsAccordion(
    page,
    "run-instructions-accordion-codegen-policy",
  );
}

function projectConfigNameFromPage(page: Page): string {
  const pagePath = new URL(page.url()).pathname;
  const basePath = new URL(BASE_URL).pathname;
  let relativePath = pagePath;

  if (basePath !== "/") {
    const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
    if (relativePath.startsWith(normalizedBase)) {
      relativePath = relativePath.slice(normalizedBase.length);
    } else if (relativePath.startsWith(basePath)) {
      relativePath = relativePath.slice(basePath.length);
    }
  }

  return decodeURIComponent(relativePath.replace(/^\/+/, ""));
}

async function loadCodegenProjectState(
  page: Page,
): Promise<LoadedCodegenProjectState> {
  const response = await postBackend<LoadedCodegenProjectState>(
    page,
    "/loadProjectConfig",
    { projectConfigName: projectConfigNameFromPage(page) },
  );
  if (!response) {
    throw new Error("Missing project config response.");
  }
  return response;
}

async function loadLatestCodegenProjectState(
  page: Page,
  projectConfigId: string,
): Promise<LatestCodegenProjectState> {
  const response = await postBackend<LatestCodegenProjectStateResponse>(
    page,
    "/getLatestProjectState",
    { projectConfigId },
  );
  if (!response?.projectState) {
    throw new Error("Missing latest project state response.");
  }
  return response.projectState;
}

function getSectionChildren(
  state: LatestCodegenProjectState,
  sectionId: string,
): string[] {
  const coreChildren = state.sections[sectionId]?.sharedModifier?.children;
  if (coreChildren) {
    return coreChildren;
  }
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return [];
  }
  const implId = state.sectionVariants[variantId]?.impl;
  if (!implId) {
    return [];
  }
  return state.sectionImpls[implId]?.children ?? [];
}

async function getGeneratedPythonSectionSize(page: Page): Promise<{
  width: number | string | undefined;
  height: number | string | undefined;
}> {
  const state = await loadCodegenProjectState(page);
  const generatedSectionId = state.singletonSections.GenPythonCode;
  if (!generatedSectionId) {
    throw new Error("Expected generated python singleton section.");
  }
  const variantId = state.projectConfig.sectionVariantMap[generatedSectionId];
  if (!variantId) {
    throw new Error(
      `Expected generated python variant mapping for ${generatedSectionId}.`,
    );
  }
  const implId = state.sectionVariants[variantId]?.impl;
  if (!implId) {
    throw new Error(
      `Expected generated python impl mapping for variant ${variantId}.`,
    );
  }
  const size = state.sectionImpls[implId]?.size;
  return {
    width: size?.width,
    height: size?.height,
  };
}

function hasPythonTarget(state: LoadedCodegenProjectState): boolean {
  return state.projectConfig.codegenTargets.some(
    (target) => target.language === "python",
  );
}

function getPythonTarget(
  state: LoadedCodegenProjectState,
): ProjectCodegenTarget {
  const pythonTarget = state.projectConfig.codegenTargets.find(
    (target) => target.language === "python",
  );
  if (!pythonTarget) {
    throw new Error("Missing python codegen target.");
  }
  return pythonTarget;
}

async function createMetaControlCodeParamSection(
  page: Page,
  projectConfigId: string,
  sectionName: string,
  paramName: string,
  value: string,
): Promise<{ sectionId: string; paramInfoId: string }> {
  const response = (await createTopLevelSectionFromFrontend(page, {
    projectConfigId,
    implType: "MetaControl",
    controlCodeObjType: "CodeParam",
  })) as CreateTopLevelSectionResponse | null;
  const sectionId = response?.sectionId;
  const paramInfoId = response?.metaControlParamId;
  if (!sectionId || !paramInfoId) {
    throw new Error("Missing meta control section or param id.");
  }
  await setSectionNameFromFrontend(page, {
    projectConfigId,
    sectionId,
    name: sectionName,
  });
  await setCodeObjNameFromFrontend(page, {
    projectConfigId,
    codeObjId: paramInfoId,
    name: paramName,
  });
  await setParamEnteredValueFromFrontend(page, {
    projectConfigId,
    sectionId,
    paramInfoId,
    value,
  });
  return { sectionId, paramInfoId };
}

async function setGenCodePrefixFromFrontend(
  page: Page,
  projectConfigId: string,
  genCodePrefix: string,
): Promise<void> {
  await page.evaluate(
    async ({ targetProjectConfigId, nextPrefix }) => {
      const { res200 } = await import("/src/utils/endpointUtils");
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );
      const { route_get_latest_project_state, route_set_gen_code_prefix } =
        await import("/src/utils/generatedEndpoints");

      const response = await route_set_gen_code_prefix({
        projectConfigId: targetProjectConfigId,
        genCodePrefix: nextPrefix,
        frontendOpId: null,
      });
      if (!res200(response)) {
        throw new Error(
          `Failed frontend test mutation route_set_gen_code_prefix for ${targetProjectConfigId}: ${response.status}`,
        );
      }

      const latestProjectStateResponse = await route_get_latest_project_state({
        projectConfigId: targetProjectConfigId,
      });
      if (!res200(latestProjectStateResponse)) {
        throw new Error(
          `Failed to hydrate latest project state for ${targetProjectConfigId}: ${latestProjectStateResponse.status}`,
        );
      }
      processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
    },
    { targetProjectConfigId: projectConfigId, nextPrefix: genCodePrefix },
  );
}

async function setGenCodeSuffixFromFrontend(
  page: Page,
  projectConfigId: string,
  genCodeSuffix: string,
): Promise<void> {
  await page.evaluate(
    async ({ targetProjectConfigId, nextSuffix }) => {
      const { res200 } = await import("/src/utils/endpointUtils");
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );
      const { route_get_latest_project_state, route_set_gen_code_suffix } =
        await import("/src/utils/generatedEndpoints");

      const response = await route_set_gen_code_suffix({
        projectConfigId: targetProjectConfigId,
        genCodeSuffix: nextSuffix,
        frontendOpId: null,
      });
      if (!res200(response)) {
        throw new Error(
          `Failed frontend test mutation route_set_gen_code_suffix for ${targetProjectConfigId}: ${response.status}`,
        );
      }

      const latestProjectStateResponse = await route_get_latest_project_state({
        projectConfigId: targetProjectConfigId,
      });
      if (!res200(latestProjectStateResponse)) {
        throw new Error(
          `Failed to hydrate latest project state for ${targetProjectConfigId}: ${latestProjectStateResponse.status}`,
        );
      }
      processProjectStateUpdateFromBackend(latestProjectStateResponse.data);
    },
    { targetProjectConfigId: projectConfigId, nextSuffix: genCodeSuffix },
  );
}

async function setCallableFromUi(
  page: Page,
  sectionId: string,
  callableName: string,
): Promise<void> {
  const callableSearch = page.locator(`[id="${sectionId}-search"]`);
  await expect(callableSearch).toBeVisible();
  await callableSearch.click();
  await page.keyboard.type(callableName);
  await page.keyboard.press("Enter");
}

function findTopLevelTerminalSectionId(
  state: LoadedCodegenProjectState,
): string | null {
  for (const sectionId of Object.keys(state.projectConfig.topLevelSections)) {
    const variantId = state.projectConfig.sectionVariantMap[sectionId];
    if (!variantId) {
      continue;
    }
    const implId = state.sectionVariants[variantId]?.impl;
    if (!implId) {
      continue;
    }
    if (state.sectionImpls[implId]?.type === "Terminal") {
      return sectionId;
    }
  }
  return null;
}

function isIgnorableConsoleError(message: string): boolean {
  return message.includes(
    "Accessing element.ref was removed in React 19. ref is now a regular prop.",
  );
}

async function getFirstParamInfoId(
  page: Page,
  sectionId: string,
): Promise<string> {
  const firstParam = page
    .locator(
      `.react-flow__node[data-id="${sectionId}"] [id^="ParamContainer-${sectionId}-"]`,
    )
    .first();
  await expect(firstParam).toBeVisible({ timeout: 20000 });
  const paramContainerId = await firstParam.getAttribute("id");
  const prefix = `ParamContainer-${sectionId}-`;
  if (!paramContainerId || !paramContainerId.startsWith(prefix)) {
    throw new Error(
      `Unexpected param container id for ${sectionId}: ${paramContainerId}`,
    );
  }
  return paramContainerId.slice(prefix.length);
}

async function loadBackendLspDiagnostics(
  page: Page,
  projectConfigId: string,
): Promise<BackendLspDiagnosticsPayload> {
  const diagnostics = await postBackend<BackendLspDiagnosticsPayload>(
    page,
    "/getLatestLspDiagnostics",
    { projectConfigId },
  );
  if (!diagnostics) {
    throw new Error(
      `Missing latest LSP diagnostics response for ${projectConfigId}.`,
    );
  }
  return diagnostics;
}

async function getBackendParamTypeErrorMessage(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  paramInfoId: string,
): Promise<string | null> {
  const diagnostics = await loadBackendLspDiagnostics(page, projectConfigId);
  return (
    diagnostics.genCode.errors[sectionId]?.params?.[paramInfoId]?.[0] ?? null
  );
}

async function getBackendCallableTypeErrorMessage(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string | null> {
  const diagnostics = await loadBackendLspDiagnostics(page, projectConfigId);
  return diagnostics.genCode.errors[sectionId]?.callable?.[0] ?? null;
}

async function setParamValueFromFrontend(
  page: Page,
  payload: {
    projectConfigId: string;
    sectionId: string;
    paramInfoId: string;
    value: string;
  },
): Promise<void> {
  await page.evaluate(
    async ({
      targetProjectConfigId,
      targetSectionId,
      targetParamInfoId,
      nextValue,
    }) => {
      const { res200 } = await import("/src/utils/endpointUtils");
      const { route_set_param_entered_value } = await import(
        "/src/utils/generatedEndpoints"
      );

      const response = await route_set_param_entered_value({
        projectConfigId: targetProjectConfigId,
        sectionId: targetSectionId,
        paramInfoId: targetParamInfoId,
        value: nextValue,
        frontendOpId: null,
      });
      if (!res200(response)) {
        throw new Error(
          `Failed frontend test mutation route_set_param_entered_value for ${targetProjectConfigId}: ${response.status}`,
        );
      }
    },
    {
      targetProjectConfigId: payload.projectConfigId,
      targetSectionId: payload.sectionId,
      targetParamInfoId: payload.paramInfoId,
      nextValue: payload.value,
    },
  );
}

test("python codegen toggle persists and reconciles the generated code section", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setOverviewTab(page, "RunInstructions");
  const projectContext = await openIsolatedProject(page);

  try {
    await openCodegenAccordions(page);

    const pythonToggle = page.getByTestId(
      "run-instructions-python-codegen-toggle",
    );
    await expect(pythonToggle).toHaveAttribute("aria-checked", "true");

    const initialState = await loadCodegenProjectState(page);
    expect(hasPythonTarget(initialState)).toBe(true);
    if (!initialState.singletonSections.GenPythonCode) {
      throw new Error("Expected generated python singleton section.");
    }
    const initialGeneratedCodeNode = page.locator(
      `.react-flow__node[data-id="${initialState.singletonSections.GenPythonCode}"]`,
    );
    await expect(initialGeneratedCodeNode).toHaveCount(1);

    await pythonToggle.click();
    await expect(pythonToggle).toHaveAttribute("aria-checked", "false");
    await expect(
      page.getByTestId("run-instructions-codegen-policy-disabled-message"),
    ).toBeVisible();
    await expect
      .poll(async () => hasPythonTarget(await loadCodegenProjectState(page)))
      .toBe(false);
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections.GenPythonCode,
      )
      .toBeNull();
    await expect(initialGeneratedCodeNode).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);

    const pythonToggleAfterDisableReload = page.getByTestId(
      "run-instructions-python-codegen-toggle",
    );
    await expect(pythonToggleAfterDisableReload).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect(
      page.getByTestId("run-instructions-codegen-policy-disabled-message"),
    ).toBeVisible();

    await pythonToggleAfterDisableReload.click();
    await expect(pythonToggleAfterDisableReload).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(
      page.getByTestId("run-instructions-codegen-policy-disabled-message"),
    ).toHaveCount(0);
    await expect
      .poll(async () => hasPythonTarget(await loadCodegenProjectState(page)))
      .toBe(true);

    const reenabledState = await loadCodegenProjectState(page);
    if (!reenabledState.singletonSections.GenPythonCode) {
      throw new Error("Expected regenerated python code singleton section.");
    }
    await expect(
      page.locator(
        `.react-flow__node[data-id="${reenabledState.singletonSections.GenPythonCode}"]`,
      ),
    ).toHaveCount(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);
    await expect(
      page.getByTestId("run-instructions-python-codegen-toggle"),
    ).toHaveAttribute("aria-checked", "true");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("python metadata toggle persists and reconciles the metadata section", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setOverviewTab(page, "RunInstructions");
  const projectContext = await openIsolatedProject(page);

  try {
    await openCodegenAccordions(page);

    const metadataToggle = page.getByTestId(
      "run-instructions-python-metadata-toggle",
    );
    await expect(metadataToggle).toHaveAttribute("aria-checked", "false");
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections
            .GenPythonMetadata,
      )
      .toBeNull();

    await metadataToggle.click();
    await expect(metadataToggle).toHaveAttribute("aria-checked", "true");
    await expect
      .poll(async () =>
        Boolean(
          (await loadCodegenProjectState(page)).singletonSections
            .GenPythonMetadata,
        ),
      )
      .toBe(true);

    const enabledState = await loadCodegenProjectState(page);
    if (!enabledState.singletonSections.GenPythonMetadata) {
      throw new Error("Expected generated python metadata singleton section.");
    }
    const metadataNode = page.locator(
      `.react-flow__node[data-id="${enabledState.singletonSections.GenPythonMetadata}"]`,
    );
    await expect(metadataNode).toHaveCount(1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);

    const metadataToggleAfterEnableReload = page.getByTestId(
      "run-instructions-python-metadata-toggle",
    );
    await expect(metadataToggleAfterEnableReload).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(metadataNode).toHaveCount(1);

    await metadataToggleAfterEnableReload.click();
    await expect(metadataToggleAfterEnableReload).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections
            .GenPythonMetadata,
      )
      .toBeNull();
    await expect(metadataNode).toHaveCount(0);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);
    await expect(
      page.getByTestId("run-instructions-python-metadata-toggle"),
    ).toHaveAttribute("aria-checked", "false");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python updates for callable and param changes and reports missing param type errors", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\n",
    );

    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }
    const generatedCodeContent = page.locator(
      `.react-flow__node[data-id="${generatedSectionId}"] [data-section-main-editor] .cm-content`,
    );
    await expect(generatedCodeContent).toBeVisible();

    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    await setCallableFromUi(page, sectionId, "math.sqrt");

    const paramInfoId = await getFirstParamInfoId(page, sectionId);
    const paramContainer = page.locator(
      `[id="ParamContainer-${sectionId}-${paramInfoId}"]`,
    );
    await expect(paramContainer).toBeVisible();

    await expect(generatedCodeContent).toContainText("math.sqrt");
    const generatedCodeAfterCallable =
      (await generatedCodeContent.textContent()) ?? "";
    expect(generatedCodeAfterCallable).toContain("math.sqrt");

    await expect
      .poll(async () =>
        getBackendParamTypeErrorMessage(
          page,
          projectContext.projectConfigId,
          sectionId,
          paramInfoId,
        ),
      )
      .toMatch(/argument|parameter/i);

    await expect
      .poll(async () => (await paramContainer.getAttribute("class")) ?? "")
      .toMatch(/bg-red-200/);

    await setParamValueFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      paramInfoId,
      value: "3",
    });

    await expect
      .poll(async () => (await generatedCodeContent.textContent()) ?? "")
      .not.toBe(generatedCodeAfterCallable);
    await expect(generatedCodeContent).toContainText("math.sqrt");
    await expect(generatedCodeContent).toContainText("3");

    await expect
      .poll(async () =>
        getBackendParamTypeErrorMessage(
          page,
          projectContext.projectConfigId,
          sectionId,
          paramInfoId,
        ),
      )
      .toBeNull();

    await expect
      .poll(async () => (await paramContainer.getAttribute("class")) ?? "")
      .not.toMatch(/bg-red-200/);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

// Importing a previously missing callable module should clear the generated
// Python symbol error and auto-populate the callable params without any manual
// refetch action from the user.
test("generated python import fixes auto-refetch callable params without manual refresh", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    await setCallableFromUi(page, sectionId, "math.sqrt");

    await expect
      .poll(async () =>
        getBackendCallableTypeErrorMessage(
          page,
          projectContext.projectConfigId,
          sectionId,
        ),
      )
      .toMatch(/not defined|unknown/i);

    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\n",
    );

    await expect
      .poll(async () =>
        getBackendCallableTypeErrorMessage(
          page,
          projectContext.projectConfigId,
          sectionId,
        ),
      )
      .toBeNull();

    const firstParam = page
      .locator(
        `.react-flow__node[data-id="${sectionId}"] [id^="ParamContainer-${sectionId}-"]`,
      )
      .first();
    await expect(firstParam).toBeVisible({ timeout: 20000 });
    await expect(firstParam.locator(".section-key").first()).toHaveText(/x/i);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("ui config does not crash when callable params appear and the callable is reselected", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    const sectionNode = page.locator(
      `.react-flow__node[data-id="${sectionId}"]`,
    );
    await expect(sectionNode).toBeVisible();
    const sectionChrome = sectionNode
      .locator(`section[data-section-id="${sectionId}"]`)
      .first();
    await expect(sectionChrome).toBeVisible();

    await sectionChrome.click();
    const uiConfigTab = page.getByTestId("ui-editor-tab-ui-config");
    await expect(uiConfigTab).toBeVisible();
    await uiConfigTab.click();

    await setCallableFromUi(page, sectionId, "math.sqrt");
    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\n",
    );

    const paramInfoId = await getFirstParamInfoId(page, sectionId);
    await expect(
      sectionNode.locator(`[id="ParamContainer-${sectionId}-${paramInfoId}"]`),
    ).toBeVisible();

    const latestState = await loadCodegenProjectState(page);
    const generatedSectionId = latestState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }

    await page
      .locator(`.react-flow__node[data-id="${generatedSectionId}"]`)
      .click();
    await sectionChrome.click();

    await expect(page.getByText("Unhandled Thrown Error!")).toHaveCount(0);
    await expect(page.locator("#UiEditorPane")).toBeVisible();
    await expect(
      sectionNode.locator(`[id="ParamContainer-${sectionId}-${paramInfoId}"]`),
    ).toBeVisible();
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python updates when text section text changes", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }
    const generatedCodeContent = page.locator(
      `.react-flow__node[data-id="${generatedSectionId}"] [data-section-main-editor] .cm-content`,
    );
    await expect(generatedCodeContent).toBeVisible();

    const { sectionId } = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "__pw_python_codegen_text__",
    );
    const generatedCodeBeforeTextUpdate =
      (await generatedCodeContent.textContent()) ?? "";

    await postBackend(page, "/setTextBlockText", {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      text: "hello from text block",
    });

    await expect
      .poll(async () => (await generatedCodeContent.textContent()) ?? "")
      .toContain("hello from text block");
    await expect
      .poll(async () => (await generatedCodeContent.textContent()) ?? "")
      .not.toBe(generatedCodeBeforeTextUpdate);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python updates when a list section is moved into a dict section", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const dictResponse = (await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "Dict",
      name: "Settings",
      position: { x: 280, y: 100 },
    })) as CreateTopLevelSectionResponse | null;
    const dictSectionId = dictResponse?.sectionId;
    if (!dictSectionId) {
      throw new Error("Expected created dict section id.");
    }

    const listResponse = (await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "ListRoot",
      name: "Items",
      position: { x: 40, y: 100 },
    })) as CreateTopLevelSectionResponse | null;
    const listSectionId = listResponse?.sectionId;
    if (!listSectionId) {
      throw new Error("Expected created list section id.");
    }

    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }
    const generatedCodeContent = page.locator(
      `.react-flow__node[data-id="${generatedSectionId}"] [data-section-main-editor] .cm-content`,
    );
    await expect(generatedCodeContent).toBeVisible();
    await expect(generatedCodeContent).toContainText("state.Settings = {}");
    await expect(generatedCodeContent).toContainText("state.Items = []");

    await Promise.all([
      page.waitForRequest("**/moveSections"),
      page.evaluate(
        async ({ sectionId, parentSectionId }) => {
          const { moveSectionsWithBackend } = await import(
            "/src/state/actions/sections/moveSections"
          );
          moveSectionsWithBackend({
            sectionIds: [sectionId],
            newParentId: parentSectionId,
            newIndex: 0,
            positionsById: null,
          });
        },
        { sectionId: listSectionId, parentSectionId: dictSectionId },
      ),
    ]);

    await expect
      .poll(async () => {
        const latestState = await loadLatestCodegenProjectState(
          page,
          projectContext.projectConfigId,
        );
        const children = getSectionChildren(latestState, dictSectionId);
        return {
          parentId: latestState.parentSectionMap[listSectionId] ?? null,
          childIDs: children,
        };
      })
      .toMatchObject({
        parentId: dictSectionId,
        childIDs: [listSectionId],
      });

    await expect
      .poll(async () => (await generatedCodeContent.textContent()) ?? "")
      .not.toContain("state.Items = []");
    await expect(generatedCodeContent).toContainText(
      "state.Settings__Items = []",
    );
    await expect(generatedCodeContent).toContainText(
      "'Items': state.Settings__Items",
    );
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python run hides internal readiness markers across repeated runs and survives reload", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);
  const pageErrors: string[] = [];
  const onPageError = (error: Error) => {
    const message = error?.stack || error?.message || String(error);
    if (!pageErrors.includes(message)) {
      pageErrors.push(message);
    }
  };
  page.on("pageerror", onPageError);
  page.on("console", (message: ConsoleMessage) => {
    const text = message.text();
    if (message.type() === "error" && !isIgnorableConsoleError(text)) {
      // Keep the listener installed so Playwright surfaces these in test logs,
      // but do not fail the test on benign unload-time fetch cancellations.
    }
  });

  try {
    await setGenCodePrefixFromFrontend(
      page,
      projectContext.projectConfigId,
      "import math\nRUN_MARKER = 'RUN_OK_MARKER'\n",
    );

    const sectionId = await createCallableSection(
      page,
      projectContext.projectConfigId,
    );
    await setSectionNameFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      name: "root_value",
    });
    await setCallableFromUi(page, sectionId, "math.sqrt");

    const paramInfoId = await getFirstParamInfoId(page, sectionId);
    await setParamValueFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      paramInfoId,
      value: "9",
    });
    await setGenCodeSuffixFromFrontend(
      page,
      projectContext.projectConfigId,
      "state = SettaState()\nprint(RUN_MARKER, state.root_value)\n",
    );

    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }

    await page.evaluate(async (id) => {
      const { runCodeBlock } = await import(
        "/src/state/actions/runOrImportCode"
      );
      await runCodeBlock(id);
    }, generatedSectionId);

    await expect
      .poll(async () =>
        findTopLevelTerminalSectionId(await loadCodegenProjectState(page)),
      )
      .not.toBeNull();

    const loadedState = await loadCodegenProjectState(page);
    const createdTerminalId = findTopLevelTerminalSectionId(loadedState);
    if (!createdTerminalId) {
      throw new Error(
        "Expected generated-entry run to create a top-level terminal.",
      );
    }
    const terminalNode = page.locator(
      `.react-flow__node[data-id="${createdTerminalId}"]`,
    );
    await expect(terminalNode).toBeVisible();
    await expect
      .poll(async () => {
        const box = await terminalNode.boundingBox();
        if (!box) {
          return null;
        }
        return {
          width: Math.round(box.width),
          height: Math.round(box.height),
        };
      })
      .toMatchObject({ width: expect.any(Number), height: expect.any(Number) });
    const terminalBox = await terminalNode.boundingBox();
    if (!terminalBox) {
      throw new Error("Expected generated-entry terminal bounds.");
    }
    expect(terminalBox.width).toBeGreaterThan(650);
    expect(terminalBox.height).toBeGreaterThan(190);
    await expect
      .poll(async () => {
        return ((await terminalNode.textContent()) ?? "").replace(/\s+/g, " ");
      })
      .toContain("RUN_OK_MARKER");
    await expect
      .poll(async () => {
        const output = (await terminalNode.textContent()) ?? "";
        return output.includes("python3") || output.includes("python");
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const output = (await terminalNode.textContent()) ?? "";
        return (output.match(/RUN_OK_MARKER/g) ?? []).length;
      })
      .toBe(1);
    await expect
      .poll(async () => {
        const output = ((await terminalNode.textContent()) ?? "").replace(
          /\r/g,
          "",
        );
        const markerIndex = output.indexOf("RUN_OK_MARKER");
        if (markerIndex < 0) {
          return false;
        }
        return /\n%\s*\n/.test(output.slice(markerIndex));
      })
      .toBe(false);
    await expect
      .poll(async () => {
        const output = ((await terminalNode.textContent()) ?? "").replace(
          /\r/g,
          "",
        );
        const firstNonEmptyLine =
          output
            .split("\n")
            .map((line) => line.trim())
            .find((line) => line.length > 0) ?? "";
        return firstNonEmptyLine;
      })
      .not.toBe("%");

    await Promise.all([
      page.waitForRequest("**/runCode"),
      page.evaluate(async (id) => {
        const { runCodeBlock } = await import(
          "/src/state/actions/runOrImportCode"
        );
        await runCodeBlock(id);
      }, generatedSectionId),
    ]);
    await Promise.all([
      page.waitForRequest("**/runCode"),
      page.evaluate(async (id) => {
        const { runCodeBlock } = await import(
          "/src/state/actions/runOrImportCode"
        );
        await runCodeBlock(id);
      }, generatedSectionId),
    ]);
    await expect
      .poll(async () => {
        return ((await terminalNode.textContent()) ?? "").replace(/\s+/g, " ");
      })
      .not.toContain("SETTA_RDY");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);

    const reloadedTerminalNode = page.locator(
      `.react-flow__node[data-id="${createdTerminalId}"]`,
    );
    await expect(reloadedTerminalNode).toBeVisible();
    await expect
      .poll(async () => {
        return ((await reloadedTerminalNode.textContent()) ?? "").replace(
          /\s+/g,
          " ",
        );
      })
      .toContain("RUN_OK_MARKER");
    await expect(reloadedTerminalNode).not.toContainText("SETTA_RDY");
    await expect(page.locator(".react-flow__pane")).toBeVisible();
    await expect(
      page.getByText("Unexpected Application Error", { exact: true }),
    ).toHaveCount(0);
    expect(pageErrors).toEqual([]);
  } finally {
    page.off("pageerror", onPageError);
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("generated python keeps its resized section size after param dict mutations", async ({
  page,
}) => {
  test.setTimeout(90000);
  await ensureAppReady(page);
  const projectContext = await openIsolatedProject(page);

  try {
    const initialState = await loadCodegenProjectState(page);
    const generatedSectionId = initialState.singletonSections.GenPythonCode;
    if (!generatedSectionId) {
      throw new Error("Expected generated python singleton section.");
    }

    const generatedResizable = page.locator(
      `[id="${generatedSectionId}-CustomResizable"]`,
    );
    await expect(generatedResizable).toBeVisible();
    const initialBox = await generatedResizable.boundingBox();
    if (!initialBox) {
      throw new Error("Expected generated python resizable bounds.");
    }

    await setSectionSizesFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionSizes: {
        [generatedSectionId]: {
          width: 760,
          height: 280,
        },
      },
    });

    await expect
      .poll(async () => getGeneratedPythonSectionSize(page))
      .toEqual({ width: 760, height: 280 });

    await expect
      .poll(async () => (await generatedResizable.boundingBox())?.width ?? 0)
      .toBeGreaterThan(initialBox.width + 120);

    const viewportBounds = await getViewportBoundsForPlacement(page);
    if (!viewportBounds) {
      throw new Error("Unable to resolve viewport bounds for dict placement.");
    }
    const sectionResponse = await createTopLevelSectionFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      implType: "Dict",
      viewportBounds,
    });
    const sectionId = sectionResponse?.sectionId;
    if (!sectionId) {
      throw new Error("Missing sectionId when creating dict section.");
    }

    await addKwargFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
    });
    const paramInfoId = await getFirstParamInfoId(page, sectionId);

    await setCodeObjNameFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      codeObjId: paramInfoId,
      name: "renamed_key",
    });
    await setParamEnteredValueFromFrontend(page, {
      projectConfigId: projectContext.projectConfigId,
      sectionId,
      paramInfoId,
      value: "123",
    });

    await expect
      .poll(async () => getGeneratedPythonSectionSize(page))
      .toEqual({ width: 760, height: 280 });

    await expect
      .poll(async () => (await generatedResizable.boundingBox())?.width ?? 0)
      .toBeGreaterThan(initialBox.width + 120);
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("python section override persists through Run Instructions edits", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setOverviewTab(page, "RunInstructions");
  const projectContext = await openIsolatedProject(page);

  try {
    const { sectionId, sectionName } = await createTextBlockSection(
      page,
      projectContext.projectConfigId,
      "__pw_python_codegen_section_override__",
    );

    await openCodegenAccordions(page);
    await page
      .getByTestId("run-instructions-section-override-select")
      .selectOption({ label: sectionName });
    await page.getByTestId("run-instructions-section-override-add").click();
    const overrideRow = page.getByTestId(
      `run-instructions-section-override-${sectionId}`,
    );
    await expect(overrideRow).toBeVisible();
    await page
      .getByTestId(`run-instructions-section-override-mode-${sectionId}`)
      .selectOption("exclude");

    await expect
      .poll(async () => {
        const state = await loadCodegenProjectState(page);
        return (
          getPythonTarget(state).sectionPolicy?.sectionOverrides?.[sectionId]
            ?.mode ?? null
        );
      })
      .toBe("exclude");
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections.GenPythonCode,
      )
      .not.toBeNull();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);
    await expect(
      page.getByTestId(`run-instructions-section-override-${sectionId}`),
    ).toBeVisible();
    await expect(
      page.getByTestId(`run-instructions-section-override-mode-${sectionId}`),
    ).toHaveValue("exclude");

    await page
      .getByTestId(`run-instructions-section-override-remove-${sectionId}`)
      .click();
    await expect(
      page.getByTestId(`run-instructions-section-override-${sectionId}`),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await loadCodegenProjectState(page);
        return (
          getPythonTarget(state).sectionPolicy?.sectionOverrides?.[sectionId] ??
          null
        );
      })
      .toBeNull();
    await expect(
      page.getByTestId("run-instructions-section-override-select"),
    ).toHaveValue("");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});

test("python code obj override persists through Run Instructions edits", async ({
  page,
}) => {
  test.setTimeout(60000);
  await setOverviewTab(page, "RunInstructions");
  const projectContext = await openIsolatedProject(page);

  try {
    const sectionName = "__pw_python_codegen_codeobj_section__";
    const paramName = "__pw_python_codegen_codeobj_param__";
    const paramValue = "1 + 2";
    const { paramInfoId } = await createMetaControlCodeParamSection(
      page,
      projectContext.projectConfigId,
      sectionName,
      paramName,
      paramValue,
    );

    await openCodegenAccordions(page);
    await page
      .getByTestId("run-instructions-codeobj-override-select")
      .selectOption({ label: `${sectionName} / ${paramName}` });
    await page.getByTestId("run-instructions-codeobj-override-add").click();
    const overrideRow = page.getByTestId(
      `run-instructions-codeobj-override-${paramInfoId}`,
    );
    await expect(overrideRow).toBeVisible();
    await page
      .getByTestId(
        `run-instructions-codeobj-override-representation-${paramInfoId}`,
      )
      .selectOption("string");

    await expect
      .poll(async () => {
        const state = await loadCodegenProjectState(page);
        return (
          getPythonTarget(state).codeObjValuePolicy?.codeObjOverrides?.[
            paramInfoId
          ]?.representation ?? null
        );
      })
      .toBe("string");
    await expect
      .poll(
        async () =>
          (await loadCodegenProjectState(page)).singletonSections.GenPythonCode,
      )
      .not.toBeNull();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector(READY_SELECTOR);
    await openCodegenAccordions(page);
    await expect(
      page.getByTestId(
        `run-instructions-codeobj-override-representation-${paramInfoId}`,
      ),
    ).toHaveValue("string");

    await page
      .getByTestId(`run-instructions-codeobj-override-remove-${paramInfoId}`)
      .click();
    await expect(
      page.getByTestId(`run-instructions-codeobj-override-${paramInfoId}`),
    ).toHaveCount(0);
    await expect
      .poll(async () => {
        const state = await loadCodegenProjectState(page);
        return (
          getPythonTarget(state).codeObjValuePolicy?.codeObjOverrides?.[
            paramInfoId
          ] ?? null
        );
      })
      .toBeNull();
    await expect(
      page.getByTestId("run-instructions-codeobj-override-select"),
    ).toHaveValue("");
  } finally {
    await cleanupIsolatedProject(page, projectContext);
  }
});
