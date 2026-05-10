import {
  getLatestProjectState,
  setCode,
  setGenCodePrefix,
  setGenCodeSuffix,
} from "openapi/http";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import {
  CodeLanguageEnum,
  SectionTypeEnum,
  createProjectCodegenPythonTarget,
  createProjectConfig,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flushPendingCodeUpdate, queueCodeUpdate } from "./codeUpdates";
vi.mock("openapi/http", () => ({
  getLatestProjectState: vi.fn(),
  setCode: vi.fn(),
  setGenCodePrefix: vi.fn(),
  setGenCodeSuffix: vi.fn(),
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
function openAPIResult(data: unknown, status = 200) {
  return {
    data,
    response: { status },
  };
}
function setupCodeSection({
  hasPythonCodegen,
  codeLanguage,
  codeFileBinding,
}: {
  hasPythonCodegen: boolean;
  codeLanguage: CodeLanguageEnum;
  codeFileBinding: Record<string, unknown> | null;
}) {
  useProjectState.setState((state) => {
    state.projectConfig = createProjectConfig({
      id: "project-1",
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
    vi.mocked(setGenCodePrefix).mockResolvedValue(openAPIResult(null) as never);
    vi.mocked(setGenCodeSuffix).mockResolvedValue(openAPIResult(null) as never);
  });
  afterEach(() => {
    vi.useRealTimers();
    resetProjectStores();
  });
  it("leaves bound Python Watch Code project-state sync to websocket updates", async () => {
    const { processProjectStateUpdateFromBackend } = await import(
      "./sectionInfos"
    );
    setupCodeSection({
      hasPythonCodegen: true,
      codeLanguage: CodeLanguageEnum.python,
      codeFileBinding: {
        path: "pkg/bound.py",
        canonical_path: "pkg/bound.py",
        access_mode: "read_write",
        autoBinding: false,
      },
    });
    vi.mocked(setCode).mockResolvedValue(openAPIResult(null) as never);
    queueCodeUpdate(sectionId, "print('latest')");
    await flushPendingCodeUpdate(sectionId);
    expect(setCode).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-1",
        sectionId,
        code: "print('latest')",
        frontendOpId: expect.any(String),
      },
    });
    expect(getLatestProjectState).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
  it("does not rehydrate after unrelated code edits", async () => {
    const { processProjectStateUpdateFromBackend } = await import(
      "./sectionInfos"
    );
    setupCodeSection({
      hasPythonCodegen: true,
      codeLanguage: CodeLanguageEnum.python,
      codeFileBinding: null,
    });
    vi.mocked(setCode).mockResolvedValue(openAPIResult(null) as never);
    queueCodeUpdate(sectionId, "print('latest')");
    await flushPendingCodeUpdate(sectionId);
    expect(setCode).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-1",
        sectionId,
        code: "print('latest')",
        frontendOpId: expect.any(String),
      },
    });
    expect(getLatestProjectState).not.toHaveBeenCalled();
    expect(processProjectStateUpdateFromBackend).not.toHaveBeenCalled();
  });
});
