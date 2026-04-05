/* @vitest-environment jsdom */
import { createChildSections, getLatestProjectState } from "openapi/http";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCodeSectionImpl,
  createProjectConfig,
  createProjectStateSingleConfigWithCompletedOpIDs,
  SectionTypeEnum,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachedTerminalControls } from "./AttachedTerminalControls";
const { processProjectStateUpdateFromBackendMock } = vi.hoisted(() => ({
  processProjectStateUpdateFromBackendMock: vi.fn(),
}));
vi.mock("state/actions/sectionInfos", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/sectionInfos")
  >("state/actions/sectionInfos");
  return {
    ...actual,
    processProjectStateUpdateFromBackend:
      processProjectStateUpdateFromBackendMock,
  };
});
vi.mock("openapi/http", async () => {
  const actual = await import("openapi/http");
  return {
    ...actual,
    createChildSections: vi.fn(async () => ({
      data: { sectionIds: ["terminal-section"] },
      response: new Response(`{"sectionIds":["terminal-section"]}`, {
        status: 200,
      }),
      status: 200,
    })),
    getLatestProjectState: vi.fn(async () => ({
      data: createProjectStateSingleConfigWithCompletedOpIDs(),
      response: new Response("{}", {
        status: 200,
      }),
      status: 200,
    })),
  };
});
const mockedRouteCreateChildSections = vi.mocked(createChildSections);
const mockedRouteGetLatestProjectState = vi.mocked(getLatestProjectState);
function latestProjectStateFixture() {
  return createProjectStateSingleConfigWithCompletedOpIDs({
    projectState: {
      projectConfig: createProjectConfig({
        id: "project-1",
      }),
    },
  });
}
type RenderedAttachedTerminalControls = {
  host: HTMLDivElement;
  root: Root;
};
async function renderAttachedTerminalControls(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      <AttachedTerminalControls isUserView={false} sectionId={sectionId} />,
    );
  });
  return { host, root } satisfies RenderedAttachedTerminalControls;
}
describe("AttachedTerminalControls", () => {
  const sectionId = "code-section";
  const variantId = "code-variant";
  const implId = "code-impl";
  const sectionCore: Core = {
    id: sectionId,
    name: "Code",
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
    mockedRouteCreateChildSections.mockClear();
    mockedRouteGetLatestProjectState.mockClear();
    processProjectStateUpdateFromBackendMock.mockClear();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      });
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = {
        [implId]: createCodeSectionImpl({
          id: implId,
          attachedTerminalSectionId: null,
          children: [],
        }),
      };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
    });
  });
  afterEach(() => {
    resetProjectStores();
    mockedRouteCreateChildSections.mockClear();
    mockedRouteGetLatestProjectState.mockClear();
    processProjectStateUpdateFromBackendMock.mockClear();
    document.body.innerHTML = "";
  });
  it("posts terminal child creation through the canonical endpoint and refreshes project state", async () => {
    const { host, root } = await renderAttachedTerminalControls(sectionId);
    const latestProjectState = latestProjectStateFixture();
    mockedRouteGetLatestProjectState.mockResolvedValue({
      data: latestProjectState,
      response: new Response("{}", {
        status: 200,
      }),
      status: 200,
    });
    try {
      const button = host.querySelector<HTMLButtonElement>(
        "[data-attached-terminal-toggle]",
      );
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Expected attached-terminal toggle button");
      }
      await act(async () => {
        button.click();
      });
      expect(mockedRouteCreateChildSections).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        parentId: sectionId,
        implType: SectionTypeEnum.Terminal,
        numChildren: 1,
        startIdx: 0,
      });
      expect(mockedRouteGetLatestProjectState).toHaveBeenCalledWith({
        projectConfigId: "project-1",
      });
      expect(processProjectStateUpdateFromBackendMock).toHaveBeenCalledWith(
        latestProjectState,
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
