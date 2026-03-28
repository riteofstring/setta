import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  route_get_latest_project_state,
  route_set_code,
  route_set_gen_code_prefix,
  route_set_gen_code_suffix,
} from "utils/generatedEndpoints";
import {
  CodeLanguageEnum,
  SectionTypeEnum,
  createProjectCodegenPythonTarget,
  createProjectConfig,
  createSingletonSections,
  type Core,
  type ProjectStateSingleConfigWithCompletedOpIds,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPendingCodeUpdate, queueCodeUpdate } from "./codeUpdates";

vi.mock("utils/generatedEndpoints", () => ({
  route_get_latest_project_state: vi.fn(),
  route_set_code: vi.fn(),
  route_set_gen_code_prefix: vi.fn(),
  route_set_gen_code_suffix: vi.fn(),
}));

vi.mock("./sectionInfos", async () => {
  const actual =
    await vi.importActual<typeof import("./sectionInfos")>("./sectionInfos");
  return {
    ...actual,
    processProjectStateUpdateFromBackend: vi.fn(),
  };
});

const sectionId = "section-1";
const variantId = "variant-1";
const implId = "impl-1";

const sectionCore: Core = {
  id: sectionId,
  name: "Section",
  displayName: "",
  variants: [variantId],
  defaultVariant: variantId,
  sharedModifier: {},
  unsharedKeys: [],
};

const sectionVariant: Variant = {
  id: variantId,
  name: "Variant",
  impl: implId,
  nonPresetImpls: [],
  modifier: {},
  isFrozen: false,
};

function latestProjectStateFixture(): ProjectStateSingleConfigWithCompletedOpIds {
  return {
    projectState: {
      sections: {},
      sectionImpls: {},
      sectionVariants: {},
      codeObjs: {},
      codeObjImpls: {},
      codeObjVariants: {},
      projectConfig: createProjectConfig({
        id: "project-1",
        watchCodeEnabled: true,
        codegenTargets: [createProjectCodegenPythonTarget()],
      }),
      singletonSections: createSingletonSections(),
      parentSectionMap: {},
      shownParamIds: {},
      requiredDecodedImages: [],
      genCodeBinding: null,
    },
    completedOpIds: [],
    pendingOpIds: [],
  };
}

function setupCodeSection({
  watchCodeEnabled,
  hasPythonCodegen,
  codeLanguage,
  codeFileBinding,
}: {
  watchCodeEnabled: boolean;
  hasPythonCodegen: boolean;
  codeLanguage: CodeLanguageEnum;
  codeFileBinding: Record<string, unknown> | null;
}) {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
      watchCodeEnabled,
      codegenTargets: hasPythonCodegen
        ? [createProjectCodegenPythonTarget()]
        : [],
      sectionVariantMap: { [sectionId]: variantId },
    });
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = {
      [implId]: {
        type: SectionTypeEnum.Code,
        id: implId,
        name: "Code",
        isFrozen: false,
        isInOtherProjectConfigs: false,
        tagColor: null,
        size: { width: 500, height: 300 },
        aspectRatio: false,
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
        isMinimized: false,
        positionAndSizeLocked: false,
        isPreset: false,
        code: "print('hi')",
        codeFileBinding,
        codeLanguage,
        diagnosticsIgnoreState: {
          muted: false,
          suppressedCodes: [],
        },
      },
    };
    state.previewSectionVariantMap = {};
  });
}

describe("queueCodeUpdate", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.mocked(route_set_gen_code_prefix).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    vi.mocked(route_set_gen_code_suffix).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    resetProjectStores();
  });

  it("rehydrates project state after a successful bound Python Watch Code edit", async () => {
    const { processProjectStateUpdateFromBackend } = await import(
      "./sectionInfos"
    );

    setupCodeSection({
      watchCodeEnabled: true,
      hasPythonCodegen: true,
      codeLanguage: CodeLanguageEnum.python,
      codeFileBinding: {
        path: "pkg/bound.py",
        canonical_path: "pkg/bound.py",
        access_mode: "read_write",
        autoBinding: false,
      },
    });
    vi.mocked(route_set_code).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });
    const latestProjectState = latestProjectStateFixture();
    vi.mocked(route_get_latest_project_state).mockResolvedValue({
      status: 200,
      data: latestProjectState,
      hasResponse: true,
    });

    queueCodeUpdate(sectionId, "print('latest')");
    await flushPendingCodeUpdate(sectionId);

    expect(route_set_code).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId,
      code: "print('latest')",
      frontendOpId: expect.any(String),
    });
    expect(route_get_latest_project_state).toHaveBeenCalledWith({
      projectConfigId: "project-1",
    });
    expect(processProjectStateUpdateFromBackend).toHaveBeenCalledWith(
      latestProjectState,
    );
  });

  it("does not rehydrate after unrelated code edits", async () => {
    const { processProjectStateUpdateFromBackend } = await import(
      "./sectionInfos"
    );

    setupCodeSection({
      watchCodeEnabled: true,
      hasPythonCodegen: true,
      codeLanguage: CodeLanguageEnum.python,
      codeFileBinding: null,
    });
    vi.mocked(route_set_code).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    queueCodeUpdate(sectionId, "print('latest')");
    await flushPendingCodeUpdate(sectionId);

    expect(route_set_code).toHaveBeenCalledWith({
      projectConfigId: "project-1",
      sectionId,
      code: "print('latest')",
      frontendOpId: expect.any(String),
    });
    expect(route_get_latest_project_state).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
});
