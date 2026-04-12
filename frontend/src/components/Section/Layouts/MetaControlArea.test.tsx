/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeObjTypeEnum,
  createCore,
  createProjectConfig,
  createVariant,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaControlArea } from "./MetaControlArea";

vi.mock("components/Section/Layouts/MetaControl/MetaControlNode", () => ({
  MetaControlContent: ({
    controlParamId,
    showSectionTitle,
  }: {
    controlParamId: string;
    showSectionTitle: boolean;
  }) => (
    <div
      data-testid="mock-meta-control-content"
      data-control-param-id={controlParamId}
      data-show-section-title={showSectionTitle ? "true" : "false"}
    />
  ),
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

type RenderedProfiledMetaControlArea = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledMetaControlArea(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedProfiledMetaControlArea> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="meta-control-area-profiler" onRender={onRender}>
        <MetaControlArea sectionId="section-1" />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("MetaControlArea store subscriptions", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";
  const paramId = "param-1";
  const paramVariantId = "param-variant-1";
  const paramImplId = "param-impl-1";

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
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: "Meta control",
          variants: [variantId],
          defaultVariant: variantId,
        }),
      };
      state.sectionVariants = {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      };
      state.sectionImpls = {
        [implId]: {
          type: SectionTypeEnum.MetaControl,
          id: implId,
          name: "Meta control",
          isFrozen: false,
          isInOtherProjectConfigs: false,
          tagColor: null,
          styleColor: null,
          size: { width: 200, height: 100 },
          aspectRatio: false,
          aspectRatioExtraHeight: 0,
          aspectRatioExtraWidth: 0,
          isMinimized: false,
          positionAndSizeLocked: false,
          isPreset: false,
          metaControlParamId: paramId,
          codeObjVariantMap: { [paramId]: paramVariantId },
          showSectionTitle: false,
        },
      };
      state.codeObjs = {
        [paramId]: createCore({
          id: paramId,
          name: "Prompt",
          variants: [paramVariantId],
          defaultVariant: paramVariantId,
        }),
      };
      state.codeObjVariants = {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          name: "Variant",
          impl: paramImplId,
          nonPresetImpls: [],
        }),
      };
      state.codeObjImpls = {
        [paramImplId]: {
          type: CodeObjTypeEnum.TextParam,
          id: paramImplId,
          name: "Prompt",
          description: "",
          isPreset: false,
          coreNameType: "TEXT",
          coreNameEditable: false,
          passingStyle: "DEFAULT",
          typeAnnotation: "",
          defaultVal: "",
          value: "Hello",
          uiType: "plain",
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

  it("stays out of unrelated project-state commits when meta-control inputs are unchanged", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledMetaControlArea(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Unrelated preview-variant churn should not re-commit mounted meta-control bodies.
        useProjectState.setState((state) => {
          state.previewSectionVariantMap = {
            otherSection: "other-variant",
          };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      const content = host.querySelector(
        "[data-testid='mock-meta-control-content']",
      );
      expect(content).not.toBeNull();
      expect(content?.getAttribute("data-show-section-title")).toBe("false");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when the subscribed show-section-title state changes", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledMetaControlArea(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // The mounted meta-control body must still update when its own section chrome mode changes.
        useProjectState.setState((state) => {
          const impl = state.sectionImpls[implId];
          if (impl.type !== SectionTypeEnum.MetaControl) {
            throw new Error("Expected MetaControl section impl.");
          }
          impl.showSectionTitle = true;
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      const content = host.querySelector(
        "[data-testid='mock-meta-control-content']",
      );
      expect(content).not.toBeNull();
      expect(content?.getAttribute("data-show-section-title")).toBe("true");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
