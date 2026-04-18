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
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canvasOwnedSectionId: null as string | null,
  graphSurfaceImplementation: "legacy-dom" as
    | "canvas-shell-underlay"
    | "legacy-dom",
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

vi.mock("components/Params/GetParamSwitch", () => ({
  GetParamSwitch: ({ paramIds }: { paramIds: string[] }) => (
    <div data-testid="param-children">{paramIds.join(",")}</div>
  ),
}));

vi.mock("./ParamItems/ParamInput", () => ({
  ParamInput: ({ paramInfoId }: { paramInfoId: string }) => (
    <div data-testid={`param-input-${paramInfoId}`} />
  ),
}));

vi.mock("./ResizeHandle", () => ({
  ResizeHandle: () => <div data-testid="resize-handle" />,
}));

vi.mock("forks/xyflow/core/container/graphSurfaceImplementation", () => ({
  useGraphSurfaceImplementation: () => mocks.graphSurfaceImplementation,
}));

vi.mock("forks/xyflow/core/container/sectionShellCanvasOwnership", () => ({
  isCanvasOwnedSectionLightweightParamLabel: () => false,
  isCanvasOwnedSectionLightweightNestedChildren: () => false,
  isCanvasOwnedSectionNestedGuide: (candidateSectionId: string) =>
    candidateSectionId === mocks.canvasOwnedSectionId,
  isCanvasOwnedSectionLightweightResizeHandle: () => false,
}));

type RenderedParamContainer = {
  host: HTMLDivElement;
  root: Root;
  row: HTMLElement;
};

class ResizeObserverStub {
  observe() {}
  disconnect() {}
  unobserve() {}
}

const sectionId = "callable-section";
const sectionVariantId = "callable-section-variant";
const sectionImplId = "callable-section-impl";
const paramInfoId = "param-current";
const paramVariantId = "param-current-variant";
const paramImplId = "param-current-impl";

async function renderParamContainer({
  isNestedParam,
  paramChildren,
}: {
  isNestedParam: boolean;
  paramChildren: string[];
}): Promise<RenderedParamContainer> {
  const { ParamContainer } = await import("./ParamContainer");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <ParamContainer
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        requiredParamIdsToPaths={{}}
        onResizeStart={() => {}}
        listKey="unpinned"
        isKwarg={false}
        isNestedParam={isNestedParam}
        hasSectionStyleTheme={false}
        paramChildren={paramChildren}
        border=""
        bg=""
      >
        <span data-testid="param-label">Param</span>
      </ParamContainer>,
    );
  });

  const row = host.querySelector("article");
  expect(row).not.toBeNull();

  return {
    host,
    root,
    row: row as HTMLElement,
  };
}

async function unmountRenderedParamContainer({
  host,
  root,
}: RenderedParamContainer) {
  await act(async () => {
    root.unmount();
  });
  host.remove();
}

describe("ParamContainer", () => {
  beforeEach(() => {
    resetProjectStores();
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    mocks.canvasOwnedSectionId = null;
    mocks.graphSurfaceImplementation = "legacy-dom";
    useProjectState.setState({
      projectConfig: createProjectConfig({
        id: "project-1",
        showParamDisplayNames: false,
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
        [sectionImplId]: createCallableSectionImpl({
          id: sectionImplId,
          codeObjVariantMap: {
            [paramInfoId]: paramVariantId,
          },
        }),
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
        [paramInfoId]: createCore({
          id: paramInfoId,
          name: "x",
          variants: [paramVariantId],
          defaultVariant: paramVariantId,
        }),
      },
      codeObjImpls: {
        [paramImplId]: createCodeParamCodeObjImpl({
          id: paramImplId,
          description: "current param",
        }),
      },
      codeObjVariants: {
        [paramVariantId]: createVariant({
          id: paramVariantId,
          name: "Current",
          impl: paramImplId,
          nonPresetImpls: [paramImplId],
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

  it("renders the leaf layout for top-level params without child rows", async () => {
    const rendered = await renderParamContainer({
      isNestedParam: false,
      paramChildren: [],
    });

    try {
      expect(rendered.row.id).toBe(
        `ParamContainer-${sectionId}-${paramInfoId}`,
      );
      expect(rendered.row.className).toContain("section-key-value");
      expect(rendered.row.className).not.toContain(
        "section-args-nested-key-value",
      );
      expect(rendered.row.className).not.toContain("section-lg-value");
      expect(
        rendered.host.querySelector('[data-testid="param-children"]'),
      ).toBeNull();
    } finally {
      await unmountRenderedParamContainer(rendered);
    }
  });

  it("renders the nested-root layout when top-level params have child rows", async () => {
    const rendered = await renderParamContainer({
      isNestedParam: false,
      paramChildren: ["param-child"],
    });

    try {
      expect(rendered.row.className).toContain("section-args-nested-key-value");
      expect(rendered.row.className).not.toContain("section-lg-value");
      expect(rendered.host.textContent).toContain("param-child");
    } finally {
      await unmountRenderedParamContainer(rendered);
    }
  });

  it("renders the nested-child layout whenever the param is nested", async () => {
    const rendered = await renderParamContainer({
      isNestedParam: true,
      paramChildren: ["param-child"],
    });

    try {
      expect(rendered.row.className).toContain("section-lg-value");
      expect(rendered.row.className).not.toContain(
        "section-args-nested-key-value",
      );
      expect(rendered.host.textContent).toContain("param-child");
    } finally {
      await unmountRenderedParamContainer(rendered);
    }
  });

  it("marks nested child guides as canvas-owned on the canary canvas path", async () => {
    mocks.canvasOwnedSectionId = sectionId;
    mocks.graphSurfaceImplementation = "canvas-shell-underlay";

    const rendered = await renderParamContainer({
      isNestedParam: false,
      paramChildren: ["param-child"],
    });

    try {
      const nestedGuide = rendered.host.querySelector(
        '[data-canvas-owned-nested-guide="true"]',
      );
      expect(nestedGuide).not.toBeNull();
      expect(nestedGuide?.className).toContain("before:opacity-0");
    } finally {
      await unmountRenderedParamContainer(rendered);
    }
  });
});
