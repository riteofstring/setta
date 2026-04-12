/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useMisc, useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  SectionTypeEnum,
  createProjectConfig,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ParamUI } from "./ParamUI";

let textInputCodeMirrorRenderCount = 0;

vi.mock("components/Utils/CodeMirror/TextInputCodeMirror", () => ({
  TextInputCodeMirror: () => {
    textInputCodeMirrorRenderCount += 1;
    return <div data-testid="text-input-code-mirror" />;
  },
}));

vi.mock("state/hooks/lsp", () => ({
  useTextFieldWaitingForLSPResult: () => false,
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({ canEditParams: true }),
}));

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

function seedParamUiState() {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const paramId = "param-1";
  const paramVariantId = "param-variant-1";
  const paramImplId = "param-impl-1";

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

  const sectionImpl = {
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
    codeObjVariantMap: { [paramId]: paramVariantId },
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

  const paramCore: Core = {
    id: paramId,
    name: "alpha_param",
    displayName: "",
    variants: [paramVariantId],
    defaultVariant: paramVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const paramVariant: Variant = {
    id: paramVariantId,
    name: "ParamVariantOne",
    impl: paramImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const paramImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: paramImplId,
    name: "AlphaParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };

  useProjectState.setState((state) => {
    state.projectConfig = projectConfig;
    state.sections = { [sectionId]: sectionCore };
    state.sectionVariants = { [variantId]: sectionVariant };
    state.sectionImpls = { [implId]: sectionImpl };
    state.codeObjs = { [paramId]: paramCore };
    state.codeObjVariants = { [paramVariantId]: paramVariant };
    state.codeObjImpls = { [paramImplId]: paramImpl };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.requiredDecodedImages = [];
  });
  syncStoreInitialState(useProjectState);
  useMisc.setState({ isSelectingParams: false });
  useShareSession.setState({ isDeploymentMode: false });

  return { paramId, sectionId };
}

describe("ParamUI", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    textInputCodeMirrorRenderCount = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("keeps the code input subtree out of parent rerenders when effective props stay the same", async () => {
    const { paramId, sectionId } = seedParamUiState();
    const onChange = vi.fn();
    const onRevealPassword = vi.fn();
    const onDropzoneStateless = vi.fn();

    await act(async () => {
      root.render(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramId}
          value=""
          onChange={onChange}
          onDropzoneStateless={onDropzoneStateless}
          onRevealPassword={onRevealPassword}
          isPasswordRevealPending={false}
          maybeErrorMessage=""
        />,
      );
    });

    expect(textInputCodeMirrorRenderCount).toBe(1);

    await act(async () => {
      root.render(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramId}
          value=""
          onChange={onChange}
          onDropzoneStateless={onDropzoneStateless}
          onRevealPassword={onRevealPassword}
          isPasswordRevealPending={false}
          maybeErrorMessage=""
        />,
      );
    });

    expect(textInputCodeMirrorRenderCount).toBe(1);
  });

  it("rerenders the code input subtree when the value prop changes", async () => {
    const { paramId, sectionId } = seedParamUiState();
    const onChange = vi.fn();

    await act(async () => {
      root.render(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramId}
          value=""
          onChange={onChange}
          onDropzoneStateless={vi.fn()}
          onRevealPassword={vi.fn()}
          isPasswordRevealPending={false}
          maybeErrorMessage=""
        />,
      );
    });

    await act(async () => {
      root.render(
        <ParamUI
          sectionId={sectionId}
          paramInfoId={paramId}
          value="next"
          onChange={onChange}
          onDropzoneStateless={vi.fn()}
          onRevealPassword={vi.fn()}
          isPasswordRevealPending={false}
          maybeErrorMessage=""
        />,
      );
    });

    expect(textInputCodeMirrorRenderCount).toBe(2);
  });
});
