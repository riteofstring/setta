/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useSettings } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  SectionTypeEnum,
  createProjectConfig,
  createSettingsState,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const renderCalls = vi.hoisted(() => ({
  getParamSwitch: vi.fn(() => <div data-testid="nested-param-switch" />),
  useParamDndChildrenForParent: vi.fn(
    (_parentId: string, fallback: string[]) => fallback,
  ),
}));

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

vi.mock("./GetParamSwitch", () => ({
  GetParamSwitch: renderCalls.getParamSwitch,
}));

vi.mock("./ParamDndContext", async () => {
  const actual =
    await vi.importActual<typeof import("./ParamDndContext")>(
      "./ParamDndContext",
    );

  return {
    ...actual,
    useParamDndChildrenForParent: renderCalls.useParamDndChildrenForParent,
  };
});

vi.mock("./ParamItems/ParamInput", () => ({
  ParamInput: () => <div data-testid="param-input" />,
}));

vi.mock("./ResizeHandle", () => ({
  ResizeHandle: () => <div data-testid="resize-handle" />,
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

const { ParamContainer } = await import("./ParamContainer");

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function seedParamContainerState() {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const parentParamId = "param-parent";
  const parentParamVariantId = "param-parent-variant";
  const parentParamImplId = "param-parent-impl";
  const childParamId = "param-child";
  const childParamVariantId = "param-child-variant";
  const childParamImplId = "param-child-impl";

  const projectConfig = createProjectConfig({
    id: "project-1",
    sectionVariantMap: { [sectionId]: variantId },
    topLevelSections: {
      [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
    },
  });

  const sectionCore: Core = {
    id: sectionId,
    name: "Dict",
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
  const dictImpl = {
    type: SectionTypeEnum.Dict,
    id: implId,
    name: "Dict",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    size: { width: 240, height: 160 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    codeObjVariantMap: {
      [parentParamId]: parentParamVariantId,
      [childParamId]: childParamVariantId,
    },
    hideUnpinnedParams: false,
    paramFilter: "",
    columnWidth: null,
    configLanguage: ConfigLanguageEnum.python,
    pinnedParams: [],
    selectedParams: [],
    ignoreTypeErrors: { callable: false, params: {} },
    edgeInputParams: [],
    edgeOutputPorts: [],
    topLevelParamId: null,
    isJsonSource: false,
    jsonSourceKeys: [],
    jsonSourceMissing: false,
  };
  const parentParamCore: Core = {
    id: parentParamId,
    name: "parent_param",
    displayName: "",
    variants: [parentParamVariantId],
    defaultVariant: parentParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const childParamCore: Core = {
    id: childParamId,
    name: "child_param",
    displayName: "",
    variants: [childParamVariantId],
    defaultVariant: childParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const parentParamVariant: Variant = {
    id: parentParamVariantId,
    name: "ParentParamVariant",
    impl: parentParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const childParamVariant: Variant = {
    id: childParamVariantId,
    name: "ChildParamVariant",
    impl: childParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const parentParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: parentParamImplId,
    name: "ParentParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: false,
    children: [childParamId],
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };
  const childParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: childParamImplId,
    name: "ChildParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: false,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: dictImpl };
    state.codeObjs = {
      [parentParamId]: parentParamCore,
      [childParamId]: childParamCore,
    };
    state.codeObjVariants = {
      [parentParamVariantId]: parentParamVariant,
      [childParamVariantId]: childParamVariant,
    };
    state.codeObjImpls = {
      [parentParamImplId]: parentParamImpl,
      [childParamImplId]: childParamImpl,
    };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.requiredDecodedImages = [];
  });
  syncStoreInitialState(useProjectState);

  return { childParamId, parentParamId, sectionId };
}

describe("ParamContainer render stability", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    renderCalls.getParamSwitch.mockClear();
    renderCalls.useParamDndChildrenForParent.mockClear();
    renderCalls.useParamDndChildrenForParent.mockImplementation(
      (_parentId: string, fallback: string[]) => fallback,
    );
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("uses static child arrays when drag children are disabled", async () => {
    const { childParamId, parentParamId, sectionId } =
      seedParamContainerState();

    await act(async () => {
      root.render(
        <ParamContainer
          sectionId={sectionId}
          paramInfoId={parentParamId}
          requiredParamIdsToPaths={{
            [parentParamId]: [parentParamId],
            [childParamId]: [parentParamId, childParamId],
          }}
          onResizeStart={vi.fn()}
          isKwarg={false}
          isNestedParam={false}
          hasSectionStyleTheme={false}
          isTopLevelWithPad={false}
          paramChildren={[childParamId]}
          onMouseDown={vi.fn()}
          onClick={vi.fn()}
          maybeErrorMessage=""
          border=""
          bg=""
          dndAttributes={undefined}
          dndListeners={undefined}
          dndRef={undefined}
          dndStyle={undefined}
          dndClassName=""
          listKey="unpinned"
          useDndChildren={false}
        >
          <span>Parent</span>
        </ParamContainer>,
      );
    });

    expect(renderCalls.useParamDndChildrenForParent).not.toHaveBeenCalled();
    expect(renderCalls.getParamSwitch).toHaveBeenCalledWith(
      expect.objectContaining({
        paramIds: [childParamId],
      }),
      undefined,
    );
  });

  it("uses dnd child arrays when drag children are enabled", async () => {
    const { childParamId, parentParamId, sectionId } =
      seedParamContainerState();
    const dndChildParamId = "param-child-dnd";
    renderCalls.useParamDndChildrenForParent.mockImplementation(() => [
      dndChildParamId,
    ]);

    await act(async () => {
      root.render(
        <ParamContainer
          sectionId={sectionId}
          paramInfoId={parentParamId}
          requiredParamIdsToPaths={{
            [parentParamId]: [parentParamId],
            [childParamId]: [parentParamId, childParamId],
            [dndChildParamId]: [parentParamId, dndChildParamId],
          }}
          onResizeStart={vi.fn()}
          isKwarg={false}
          isNestedParam={false}
          hasSectionStyleTheme={false}
          isTopLevelWithPad={false}
          paramChildren={[childParamId]}
          onMouseDown={vi.fn()}
          onClick={vi.fn()}
          maybeErrorMessage=""
          border=""
          bg=""
          dndAttributes={undefined}
          dndListeners={undefined}
          dndRef={undefined}
          dndStyle={undefined}
          dndClassName=""
          listKey="unpinned"
          useDndChildren={true}
        >
          <span>Parent</span>
        </ParamContainer>,
      );
    });

    expect(renderCalls.useParamDndChildrenForParent).toHaveBeenCalledWith(
      parentParamId,
      [childParamId],
    );
    expect(renderCalls.getParamSwitch).toHaveBeenCalledWith(
      expect.objectContaining({
        paramIds: [dndChildParamId],
      }),
      undefined,
    );
  });
});
