import { expect, type Page } from "@playwright/test";
import {
  addKwargFromFrontend,
  createTopLevelSectionFromFrontend,
  postBackend,
  setCallableFromFrontend,
  setCodeObjNameFromFrontend,
  setParamEnteredValueFromFrontend,
  setSectionNameFromFrontend,
} from "../../helpers";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
export const READY_SELECTOR = ".setta-gpu-flow__pane";

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

export type CreateTopLevelSectionResponse = {
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

type RetainedParamRowDebug = {
  ownerSectionId: string;
  rowId: string;
  rowLabel: string;
  rowState: {
    error: boolean;
  };
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

export async function openCodegenAccordions(page: Page): Promise<void> {
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

export async function loadCodegenProjectState(
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

export async function loadLatestCodegenProjectState(
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

export async function createSectionVariantFromFrontend(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string> {
  return await page.evaluate(
    async ({
      targetProjectConfigId,
      targetSectionId,
    }: {
      targetProjectConfigId: string;
      targetSectionId: string;
    }) => {
      const { createNewSectionVariant, getLatestProjectState } = await import(
        "/src/openapi/http"
      );
      const { callOpenAPI, res200 } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );

      const createResponse = await callOpenAPI(
        createNewSectionVariant({
          body: {
            projectConfigId: targetProjectConfigId,
            sectionId: targetSectionId,
            frontendOpId: null,
          },
        } as Parameters<typeof createNewSectionVariant>[0]),
      );
      if (!res200(createResponse)) {
        throw new Error(
          `create_new_section_variant failed: ${createResponse.status}`,
        );
      }

      const latestResponse = await callOpenAPI(
        getLatestProjectState({
          body: {
            projectConfigId: targetProjectConfigId,
          },
        } as Parameters<typeof getLatestProjectState>[0]),
      );
      if (!res200(latestResponse)) {
        throw new Error(
          `get_latest_project_state failed: ${latestResponse.status}`,
        );
      }
      processProjectStateUpdateFromBackend(latestResponse.data);
      return createResponse.data.variantId;
    },
    {
      targetProjectConfigId: projectConfigId,
      targetSectionId: sectionId,
    },
  );
}

export async function setSectionVariantFromFrontend(
  page: Page,
  projectConfigId: string,
  sectionId: string,
  variantId: string,
): Promise<void> {
  await page.evaluate(
    async ({
      targetProjectConfigId,
      targetSectionId,
      targetVariantId,
    }: {
      targetProjectConfigId: string;
      targetSectionId: string;
      targetVariantId: string;
    }) => {
      const { setSectionVariant } = await import("/src/openapi/http");
      const { callOpenAPI, res200 } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );

      const response = await callOpenAPI(
        setSectionVariant({
          body: {
            projectConfigId: targetProjectConfigId,
            sectionId: targetSectionId,
            variantId: targetVariantId,
            frontendOpId: null,
          },
        } as Parameters<typeof setSectionVariant>[0]),
      );
      if (!res200(response)) {
        throw new Error(`set_section_variant failed: ${response.status}`);
      }
    },
    {
      targetProjectConfigId: projectConfigId,
      targetSectionId: sectionId,
      targetVariantId: variantId,
    },
  );
}

export function getSectionChildren(
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

export async function getGeneratedPythonSectionSize(page: Page): Promise<{
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

export function hasPythonTarget(state: LoadedCodegenProjectState): boolean {
  return state.projectConfig.codegenTargets.some(
    (target) => target.language === "python",
  );
}

export function getPythonTarget(
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

export async function createMetaControlCodeParamSection(
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

export async function setGenCodePrefixFromFrontend(
  page: Page,
  projectConfigId: string,
  genCodePrefix: string,
): Promise<void> {
  await page.evaluate(
    async ({ targetProjectConfigId, nextPrefix }) => {
      const { getLatestProjectState, setGenCodePrefix } = await import(
        "/src/openapi/http"
      );
      const { callOpenAPI, res200 } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );

      const response = await callOpenAPI(
        setGenCodePrefix({
          body: {
            projectConfigId: targetProjectConfigId,
            genCodePrefix: nextPrefix,
            frontendOpId: null,
          },
        } as Parameters<typeof setGenCodePrefix>[0]),
      );
      if (!res200(response)) {
        throw new Error(
          `Failed frontend test mutation setGenCodePrefix for ${targetProjectConfigId}: ${response.status}`,
        );
      }

      const latestProjectStateResponse = await callOpenAPI(
        getLatestProjectState({
          body: {
            projectConfigId: targetProjectConfigId,
          },
        } as Parameters<typeof getLatestProjectState>[0]),
      );
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

export async function setGenCodeSuffixFromFrontend(
  page: Page,
  projectConfigId: string,
  genCodeSuffix: string,
): Promise<void> {
  await page.evaluate(
    async ({ targetProjectConfigId, nextSuffix }) => {
      const { getLatestProjectState, setGenCodeSuffix } = await import(
        "/src/openapi/http"
      );
      const { callOpenAPI, res200 } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const { processProjectStateUpdateFromBackend } = await import(
        "/src/state/actions/sectionInfos"
      );

      const response = await callOpenAPI(
        setGenCodeSuffix({
          body: {
            projectConfigId: targetProjectConfigId,
            genCodeSuffix: nextSuffix,
            frontendOpId: null,
          },
        } as Parameters<typeof setGenCodeSuffix>[0]),
      );
      if (!res200(response)) {
        throw new Error(
          `Failed frontend test mutation setGenCodeSuffix for ${targetProjectConfigId}: ${response.status}`,
        );
      }

      const latestProjectStateResponse = await callOpenAPI(
        getLatestProjectState({
          body: {
            projectConfigId: targetProjectConfigId,
          },
        } as Parameters<typeof getLatestProjectState>[0]),
      );
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

export async function setCallableFromUi(
  page: Page,
  sectionId: string,
  callableName: string,
): Promise<void> {
  const state = await loadCodegenProjectState(page);
  await setCallableFromFrontend(page, {
    projectConfigId: state.projectConfig.id,
    sectionId,
    callableName,
    refetchParams: true,
  });
}

export async function activateSectionForEditor(
  page: Page,
  sectionId: string,
): Promise<void> {
  await page.evaluate(async (targetSectionId) => {
    const { setActiveSectionIds } = await import(
      "/src/state/actions/activeSections"
    );
    const { useLocalStorage } = await import("/src/state/definitions");
    useLocalStorage.setState({ uiEditorVis: true });
    setActiveSectionIds([targetSectionId], { syncMode: "ui-only" });
  }, sectionId);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { getActiveSectionUIIds } = await import(
          "/src/state/activeSectionUI"
        );
        return getActiveSectionUIIds();
      }),
    )
    .toEqual([sectionId]);
}

export async function showCallableUiConfigTab(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { useLocalStorage } = await import("/src/state/definitions");
    useLocalStorage.setState((state) => ({
      uiEditorTab: {
        ...state.uiEditorTab,
        Callable: "UIConfig",
      },
      uiEditorVis: true,
    }));
  });
}

export function findTopLevelTerminalSectionId(
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

export function isIgnorableConsoleError(message: string): boolean {
  return message.includes(
    "Accessing element.ref was removed in React 19. ref is now a regular prop.",
  );
}

export async function getFirstParamInfoId(
  page: Page,
  sectionId: string,
): Promise<string> {
  await expect
    .poll(async () => {
      const ids = await getShownParamInfoIds(page, sectionId);
      return ids[0] ?? null;
    })
    .not.toBeNull();
  const paramInfoId = (await getShownParamInfoIds(page, sectionId))[0] ?? null;
  if (!paramInfoId) {
    throw new Error(`No visible params found for ${sectionId}.`);
  }
  return paramInfoId;
}

async function getShownParamInfoIds(
  page: Page,
  sectionId: string,
): Promise<string[]> {
  return await page.evaluate(async (targetSectionId) => {
    const { getCurrShownParamIds } = await import(
      "/src/state/actions/sectionInfos"
    );
    const { useProjectState } = await import("/src/state/definitions");
    const shown = getCurrShownParamIds(
      useProjectState.getState(),
      targetSectionId,
      false,
      true,
    );
    return shown.topLevelParamIds;
  }, sectionId);
}

export async function readRetainedParamRowDebug(
  page: Page,
  sectionId: string,
  paramInfoId: string,
): Promise<RetainedParamRowDebug | null> {
  return await page.evaluate(
    ({ targetSectionId, targetParamInfoId }) => {
      const rows = window.__SETTA_GPU_FLOW_DEBUG_RETAINED_ROWS__?.() ?? [];
      return (
        rows.find(
          (row) =>
            row.ownerSectionId === targetSectionId &&
            row.rowId === targetParamInfoId,
        ) ?? null
      );
    },
    {
      targetParamInfoId: paramInfoId,
      targetSectionId: sectionId,
    },
  );
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

export async function getBackendParamTypeErrorMessage(
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

export async function getBackendCallableTypeErrorMessage(
  page: Page,
  projectConfigId: string,
  sectionId: string,
): Promise<string | null> {
  const diagnostics = await loadBackendLspDiagnostics(page, projectConfigId);
  return diagnostics.genCode.errors[sectionId]?.callable?.[0] ?? null;
}

export async function setParamValueFromFrontend(
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
      const { setParamEnteredValue } = await import("/src/openapi/http");
      const { callOpenAPI, res200 } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const { useProjectState } = await import("/src/state/definitions");
      const sectionVariantId =
        useProjectState.getState().projectConfig.sectionVariantMap[
          targetSectionId
        ] ?? null;
      if (!sectionVariantId) {
        throw new Error(
          `No active section variant for ${targetSectionId} while setting param value.`,
        );
      }

      const response = await callOpenAPI(
        setParamEnteredValue({
          body: {
            projectConfigId: targetProjectConfigId,
            sectionId: targetSectionId,
            sectionVariantId,
            paramInfoId: targetParamInfoId,
            value: nextValue,
            frontendOpId: null,
          },
        } as Parameters<typeof setParamEnteredValue>[0]),
      );
      if (!res200(response)) {
        throw new Error(
          `Failed frontend test mutation setParamEnteredValue for ${targetProjectConfigId}: ${response.status}`,
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
