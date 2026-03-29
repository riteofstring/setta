/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, type ZustandProjectState } from "state/definitions";
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

type RenderedParamSwitch = {
  host: HTMLDivElement;
  root: Root;
};

async function renderParamSwitch(
  sectionId: string,
  paramInfoId: string,
): Promise<RenderedParamSwitch> {
  const { DragDropProvider } = await import(
    "forks/dnd-kit/adapter/DragDropProvider"
  );
  const { ParamSwitch } = await import("./ParamSwitch");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <DragDropProvider dndContext={{ isSorting: false, isMovingFree: false }}>
        <ParamSwitch
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          requiredParamIdsToPaths={{}}
          onResizeStart={() => {}}
          listKey="unpinned"
          hasSectionStyleTheme={false}
        />
      </DragDropProvider>,
    );
  });

  return { host, root };
}

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

describe("ParamSwitch", () => {
  const sectionId = "callable-section";
  const sectionVariantId = "callable-section-variant";
  const sectionImplId = "callable-section-impl";
  const currentParamId = "param-current";
  const currentParamVariantId = "param-current-variant";
  const currentParamImplId = "param-current-impl";
  const staleParamId = "param-stale";
  const staleParamVariantId = "param-stale-variant";
  const staleParamImplId = "param-stale-impl";

  beforeEach(() => {
    resetProjectStores();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
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
            codeObjVariantMap: {
              [currentParamId]: currentParamVariantId,
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
        [currentParamId]: createCore({
          id: currentParamId,
          name: "x",
          variants: [currentParamVariantId],
          defaultVariant: currentParamVariantId,
        }),
        [staleParamId]: createCore({
          id: staleParamId,
          name: "stale",
          variants: [staleParamVariantId],
          defaultVariant: staleParamVariantId,
        }),
      },
      codeObjImpls: {
        [currentParamImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: currentParamImplId,
            value: "1",
          },
        ),
        [staleParamImplId]: createCodeParamCodeObjImpl(
          createUserDefaultCodeParamCodeObjImpl(),
          {
            id: staleParamImplId,
            value: "2",
          },
        ),
      },
      codeObjVariants: {
        [currentParamVariantId]: createVariant({
          id: currentParamVariantId,
          name: "Current",
          impl: currentParamImplId,
          nonPresetImpls: [currentParamImplId],
        }),
        [staleParamVariantId]: createVariant({
          id: staleParamVariantId,
          name: "Stale",
          impl: staleParamImplId,
          nonPresetImpls: [staleParamImplId],
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

  it("renders nothing instead of crashing when a stale param id is still referenced during a variant switch", async () => {
    const { host, root } = await renderParamSwitch(sectionId, staleParamId);

    try {
      expect(host.textContent ?? "").not.toContain("Unhandled Thrown Error!");
      expect(host.childElementCount).toBe(0);
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });

  it("survives variant transitions that remove and then restore a mounted param", async () => {
    const { host, root } = await renderParamSwitch(sectionId, currentParamId);

    try {
      expect(host.textContent ?? "").not.toContain("Unhandled Thrown Error!");

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls[sectionImplId];
          impl.codeObjVariantMap = {};
        });
      });

      expect(host.textContent ?? "").not.toContain("Unhandled Thrown Error!");
      expect(host.childElementCount).toBe(0);

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls[sectionImplId];
          impl.codeObjVariantMap = {
            [currentParamId]: currentParamVariantId,
          };
        });
      });

      expect(host.textContent ?? "").not.toContain("Unhandled Thrown Error!");
    } finally {
      await act(async () => {
        root.unmount();
      });
    }
  });
});
