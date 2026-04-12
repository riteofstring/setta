/* @vitest-environment jsdom */

import { Profiler, act, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  ParamNameTypeEnum,
  ParameterPassingStyleEnum,
  SectionTypeEnum,
  createCore,
  createProjectConfig,
  createVariant,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KwargsActionButtons } from "./KwargsControls";

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: ({
    content,
    title,
  }: {
    content?: string;
    title?: string;
  }) => ({
    "data-tooltip-content": content ?? title ?? "",
  }),
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

type RenderedProfiledActionButtons = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledActionButtons(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedProfiledActionButtons> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="kwargs-action-buttons-profiler" onRender={onRender}>
        <KwargsActionButtons
          sectionId="section-1"
          argsIconButtonColorClassName="text-setta-500"
          argsIconGlyphColorClassName="text-current"
          canEditLayout={true}
          canEditStructure={true}
          variantIsFrozen={false}
        />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("KwargsActionButtons store subscriptions", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const paramId = "param-1";
  const paramVariantId = "param-variant-1";
  const paramImplId = "param-impl-1";

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

  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
      });
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = {
        [implId]: {
          type: SectionTypeEnum.Dict,
          id: implId,
          name: "Dict",
          isFrozen: false,
          isInOtherProjectConfigs: false,
          tagColor: null,
          styleColor: null,
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
          selectedParams: [paramId],
          ignoreTypeErrors: { callable: false, params: {} },
          edgeInputParams: [],
          edgeOutputPorts: [],
          topLevelParamId: null,
          isJsonSource: false,
          jsonSourceKeys: [],
          jsonSourceMissing: false,
        },
      };
      state.codeObjs = {
        [paramId]: createCore({
          id: paramId,
          name: "param",
          variants: [paramVariantId],
          defaultVariant: paramVariantId,
        }),
      };
      state.codeObjVariants = {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          name: "Param Variant",
          impl: paramImplId,
          nonPresetImpls: [],
        }),
      };
      state.codeObjImpls = {
        [paramImplId]: {
          type: CodeObjTypeEnum.CodeParam,
          id: paramImplId,
          name: "Param",
          description: "",
          isPreset: false,
          coreNameType: ParamNameTypeEnum.TEXT,
          coreNameEditable: true,
          passingStyle: ParameterPassingStyleEnum.DEFAULT,
          defaultVal: "",
          value: "",
        },
      };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
    });
    syncStoreInitialState(useProjectState);
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("stays out of unrelated param-filter commits", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledActionButtons(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls[implId];
          if (impl?.type !== SectionTypeEnum.Dict) {
            throw new Error("Expected dict section impl for test setup");
          }
          impl.paramFilter = "user typed filter";
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(
        host.querySelector('button[aria-label="Delete selected args"]'),
      ).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when the selected params change", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledActionButtons(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls[implId];
          if (impl?.type !== SectionTypeEnum.Dict) {
            throw new Error("Expected dict section impl for test setup");
          }
          impl.selectedParams = [];
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      const deleteButton = host.querySelector(
        'button[aria-label="Delete selected args"]',
      );
      expect(deleteButton?.getAttribute("disabled")).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
