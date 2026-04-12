/* @vitest-environment jsdom */

import { act, useState } from "react";
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
import { GetParamSwitch } from "./GetParamSwitch";
import { ParamSwitch } from "./ParamSwitch";

vi.mock("./ParamSwitch", () => ({
  ParamSwitch: vi.fn(({ paramInfoId }: { paramInfoId: string }) => (
    <div data-param-id={paramInfoId} />
  )),
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

function seedGetParamSwitchState() {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const firstParamId = "param-1";
  const secondParamId = "param-2";
  const firstParamVariantId = "param-variant-1";
  const secondParamVariantId = "param-variant-2";
  const firstParamImplId = "param-impl-1";
  const secondParamImplId = "param-impl-2";

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
      [firstParamId]: firstParamVariantId,
      [secondParamId]: secondParamVariantId,
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
  const firstParamCore: Core = {
    id: firstParamId,
    name: "alpha_param",
    displayName: "",
    variants: [firstParamVariantId],
    defaultVariant: firstParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const secondParamCore: Core = {
    id: secondParamId,
    name: "beta_param",
    displayName: "",
    variants: [secondParamVariantId],
    defaultVariant: secondParamVariantId,
    sharedModifier: {},
    unsharedKeys: [],
  };
  const firstParamVariant: Variant = {
    id: firstParamVariantId,
    name: "ParamVariantOne",
    impl: firstParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const secondParamVariant: Variant = {
    id: secondParamVariantId,
    name: "ParamVariantTwo",
    impl: secondParamImplId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };
  const firstParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: firstParamImplId,
    name: "AlphaParam",
    description: "",
    isPreset: false,
    coreNameType: ParamNameTypeEnum.TEXT,
    coreNameEditable: true,
    passingStyle: ParameterPassingStyleEnum.DEFAULT,
    defaultVal: "",
    value: "",
  };
  const secondParamImpl = {
    type: CodeObjTypeEnum.CodeParam,
    id: secondParamImplId,
    name: "BetaParam",
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
    state.sectionImpls = { [implId]: dictImpl };
    state.codeObjs = {
      [firstParamId]: firstParamCore,
      [secondParamId]: secondParamCore,
    };
    state.codeObjVariants = {
      [firstParamVariantId]: firstParamVariant,
      [secondParamVariantId]: secondParamVariant,
    };
    state.codeObjImpls = {
      [firstParamImplId]: firstParamImpl,
      [secondParamImplId]: secondParamImpl,
    };
    state.parentSectionMap = { [sectionId]: null };
    state.previewSectionVariantMap = {};
    state.shownParamIds = {
      [variantId]: {
        pinned: { requiredParamIdsToPaths: {}, topLevelParamIds: [] },
        unpinned: {
          requiredParamIdsToPaths: {
            [firstParamId]: [firstParamId],
            [secondParamId]: [secondParamId],
          },
          topLevelParamIds: [firstParamId, secondParamId],
        },
      },
    };
  });
  syncStoreInitialState(useProjectState);

  return {
    sectionId,
    paramIds: [firstParamId, secondParamId],
    requiredParamIdsToPaths: {
      [firstParamId]: [firstParamId],
      [secondParamId]: [secondParamId],
    },
  };
}

describe("GetParamSwitch render stability", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useSettings.setState(createSettingsState());
    syncStoreInitialState(useSettings);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    vi.mocked(ParamSwitch).mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
    resetProjectStores();
  });

  it("does not rematerialize unchanged rows when only the parent rerenders", async () => {
    const { sectionId, paramIds, requiredParamIdsToPaths } =
      seedGetParamSwitchState();
    const onResizeStart = vi.fn();
    let bumpParentRerender: (() => void) | null = null;

    function ParentRerenderHarness() {
      const [, setParentRenderCount] = useState(0);
      bumpParentRerender = () => {
        setParentRenderCount((count) => count + 1);
      };

      return (
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={paramIds}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={onResizeStart}
          isTopLevel={true}
          listKey="unpinned"
          hasSectionStyleTheme={false}
        />
      );
    }

    await act(async () => {
      root.render(<ParentRerenderHarness />);
    });

    const initialMaterializationCount =
      vi.mocked(ParamSwitch).mock.calls.length;
    expect(initialMaterializationCount).toBe(2);
    expect(bumpParentRerender).not.toBeNull();

    await act(async () => {
      bumpParentRerender?.();
    });

    expect(vi.mocked(ParamSwitch).mock.calls.length).toBe(
      initialMaterializationCount,
    );
  });

  it("passes subtree-scoped required paths to each row", async () => {
    const { sectionId } = seedGetParamSwitchState();
    const requiredParamIdsToPaths = {
      "param-parent": ["param-parent"],
      "param-child": ["param-parent", "param-child"],
      "param-sibling": ["param-sibling"],
    };

    await act(async () => {
      root.render(
        <GetParamSwitch
          sectionId={sectionId}
          paramIds={["param-parent", "param-sibling"]}
          requiredParamIdsToPaths={requiredParamIdsToPaths}
          onResizeStart={vi.fn()}
          isTopLevel={true}
          listKey="unpinned"
          hasSectionStyleTheme={false}
        />,
      );
    });

    expect(vi.mocked(ParamSwitch)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(ParamSwitch).mock.calls[0]?.[0]).toMatchObject({
      paramInfoId: "param-parent",
      requiredParamIdsToPaths: {
        "param-parent": ["param-parent"],
        "param-child": ["param-parent", "param-child"],
      },
    });
    expect(vi.mocked(ParamSwitch).mock.calls[1]?.[0]).toMatchObject({
      paramInfoId: "param-sibling",
      requiredParamIdsToPaths: {
        "param-sibling": ["param-sibling"],
      },
    });
  });
});
