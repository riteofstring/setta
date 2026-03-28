import { expect, test, type Page } from "@playwright/test";
import {
  cleanupIsolatedProject,
  createCallableSection,
  createTextBlockSection,
  createTopLevelSectionFromFrontend,
  ensureAppReady,
  openIsolatedProject,
  postBackend,
  setCodeObjNameFromFrontend,
  setOverviewTab,
  setParamEnteredValueFromFrontend,
  setSectionNameFromFrontend,
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
    }
  >;
  singletonSections: {
    GenPythonCode: string | null;
    GenPythonMetadata: string | null;
  };
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
