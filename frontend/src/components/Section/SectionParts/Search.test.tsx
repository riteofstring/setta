/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useProjectState,
  useShareSession,
  type ZustandProjectState,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCore,
  createProjectConfig,
  createSingletonSections,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionSearch } from "./Search";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await import("utils/generatedEndpoints");
  return {
    ...actual,
    route_clear_text_field_completion: vi.fn(async () => ({
      data: null,
      status: 200,
      hasResponse: true,
    })),
  };
});

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

type RenderedSearch = {
  host: HTMLDivElement;
  root: Root;
};

async function renderSectionSearch(
  sectionId: string,
  callable: string | null,
): Promise<RenderedSearch> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<SectionSearch sectionId={sectionId} callable={callable} />);
  });

  return { host, root };
}

describe("SectionSearch", () => {
  const sectionId = "callable-section";
  const sectionVariantId = "callable-section-variant";
  const sectionImplId = "callable-section-impl";
  const previewSectionVariantId = "callable-section-preview-variant";
  const previewSectionImplId = "callable-section-preview-impl";
  const currentCallableId = "callable-current";
  const currentCallableVariantId = "callable-current-variant";
  const currentCallableImplId = "callable-current-impl";
  const staleCallableId = "callable-stale";
  const staleCallableVariantId = "callable-stale-variant";
  const staleCallableImplId = "callable-stale-impl";

  beforeEach(() => {
    resetProjectStores();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: null,
      shareSessionId: null,
      sessionRunCount: 0,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: sectionVariantId },
      }),
      sections: {
        [sectionId]: createCore({
          id: sectionId,
          name: "Callable",
          variants: [sectionVariantId],
          defaultVariant: sectionVariantId,
        }),
      },
      sectionImpls: {
        [sectionImplId]: createCallableSectionImpl(
          createUserDefaultCallableSectionImpl(),
          {
            id: sectionImplId,
            callable: staleCallableId,
            codeObjVariantMap: {
              [currentCallableId]: currentCallableVariantId,
            },
          },
        ),
      },
      sectionVariants: {
        [sectionVariantId]: createVariant({
          id: sectionVariantId,
          name: "Variant",
          impl: sectionImplId,
          nonPresetImpls: [sectionImplId],
        }),
      },
      codeObjs: {
        [currentCallableId]: createCore({
          id: currentCallableId,
          name: "math.sqrt",
          variants: [currentCallableVariantId],
          defaultVariant: currentCallableVariantId,
        }),
        [staleCallableId]: createCore({
          id: staleCallableId,
          name: "math.sqrt",
          variants: [staleCallableVariantId],
          defaultVariant: staleCallableVariantId,
        }),
      },
      codeObjImpls: {
        [currentCallableImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: currentCallableImplId,
            description: "current callable impl",
            value: "1",
          },
        ),
        [staleCallableImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: staleCallableImplId,
            description: "stale callable impl",
            value: "2",
          },
        ),
      },
      codeObjVariants: {
        [currentCallableVariantId]: createVariant({
          id: currentCallableVariantId,
          name: "Current",
          impl: currentCallableImplId,
          nonPresetImpls: [currentCallableImplId],
        }),
        [staleCallableVariantId]: createVariant({
          id: staleCallableVariantId,
          name: "Stale",
          impl: staleCallableImplId,
          nonPresetImpls: [staleCallableImplId],
        }),
      },
      artifactGroups: {},
      singletonSections: createSingletonSections(),
      parentSectionMap: { [sectionId]: null },
      shownParamIds: {},
      previewSectionVariantMap: {},
      requiredDecodedImages: [],
    } as ZustandProjectState);
  });

  afterEach(() => {
    resetProjectStores();
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("renders without crashing when the callable prop points at a stale variant-owned code object", async () => {
    const { host, root } = await renderSectionSearch(
      sectionId,
      staleCallableId,
    );

    try {
      expect(host.textContent ?? "").not.toContain("Unhandled Thrown Error!");
      expect(host.querySelector(`#${sectionId}-search`)).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it("shows the preview variant callable when the active variant has no callable", async () => {
    useProjectState.setState((state) => {
      state.sections[sectionId].variants = [
        sectionVariantId,
        previewSectionVariantId,
      ];
      state.sectionImpls[sectionImplId].callable = null;
      state.sectionImpls[sectionImplId].codeObjVariantMap = {};
      state.sectionImpls[previewSectionImplId] = createCallableSectionImpl(
        createUserDefaultCallableSectionImpl(),
        {
          id: previewSectionImplId,
          callable: currentCallableId,
          codeObjVariantMap: {
            [currentCallableId]: currentCallableVariantId,
          },
        },
      );
      state.sectionVariants[previewSectionVariantId] = createVariant({
        id: previewSectionVariantId,
        name: "Preview",
        impl: previewSectionImplId,
        nonPresetImpls: [previewSectionImplId],
      });
    });

    const { host, root } = await renderSectionSearch(
      sectionId,
      currentCallableId,
    );

    try {
      expect(host.textContent ?? "").not.toContain("math.sqrt");

      await act(async () => {
        useProjectState.setState((state) => {
          state.previewSectionVariantMap[sectionId] = previewSectionVariantId;
        });
      });

      expect(host.textContent ?? "").toContain("math.sqrt");
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
