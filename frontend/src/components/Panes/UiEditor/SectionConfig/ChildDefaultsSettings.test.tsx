/* @vitest-environment jsdom */
import {
  setListRootViewMode,
  setParentDefaultChildSectionType,
} from "openapi/http";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createListRootSectionImpl,
  createProjectConfig,
  ListRootViewModeEnum,
  SectionTypeEnum,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChildDefaultsSettings } from "./ChildDefaultsSettings";
vi.mock("openapi/http", async () => {
  const actual = await import("openapi/http");
  return {
    ...actual,
    setParentDefaultChildSectionType: vi.fn(async () => ({
      data: null,
      response: new Response("null", { status: 200 }),
      status: 200,
    })),
    setListRootViewMode: vi.fn(async () => ({
      data: null,
      response: new Response("null", { status: 200 }),
      status: 200,
    })),
  };
});
const mockedRouteSetParentDefaultChildSectionType = vi.mocked(
  setParentDefaultChildSectionType,
);
const mockedRouteSetListRootViewMode = vi.mocked(setListRootViewMode);
type RenderedChildDefaultsSettings = {
  host: HTMLDivElement;
  root: Root;
};
async function renderChildDefaultsSettings(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(<ChildDefaultsSettings sectionId={sectionId} />);
  });
  return { host, root } satisfies RenderedChildDefaultsSettings;
}
describe("ChildDefaultsSettings", () => {
  const sectionId = "list-root-section";
  const variantId = "list-root-variant";
  const implId = "list-root-impl";
  const sectionCore: Core = {
    id: sectionId,
    name: "ListRoot",
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
    mockedRouteSetParentDefaultChildSectionType.mockReset();
    mockedRouteSetListRootViewMode.mockReset();
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: null,
      shareSessionId: null,
      sessionRunCount: 0,
      shareDeploymentName: null,
      shareDeploymentVersion: null,
      deploymentMode: null,
    });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      });
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = {
        [implId]: createListRootSectionImpl({
          id: implId,
          defaultChildSectionType: SectionTypeEnum.Callable,
          viewMode: ListRootViewModeEnum.default,
        }),
      };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
      state.shownParamIds = {};
    });
  });
  afterEach(() => {
    resetProjectStores();
    mockedRouteSetParentDefaultChildSectionType.mockReset();
    mockedRouteSetListRootViewMode.mockReset();
    document.body.innerHTML = "";
  });
  it("posts default child-type and view-mode updates through the canonical endpoints", async () => {
    const { host, root } = await renderChildDefaultsSettings(sectionId);
    try {
      const selects = host.querySelectorAll<HTMLSelectElement>("select");
      if (selects.length !== 2) {
        throw new Error(`Expected 2 selects, got ${selects.length}`);
      }
      const childTypeSelect = selects[0];
      const viewModeSelect = selects[1];
      await act(async () => {
        childTypeSelect.value = SectionTypeEnum.Dict;
        childTypeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(mockedRouteSetParentDefaultChildSectionType).toHaveBeenCalledWith(
        expect.objectContaining({
          projectConfigId: "project-1",
          sectionId,
          defaultChildSectionType: SectionTypeEnum.Dict,
        }),
      );
      expect(
        getCurrEffectiveSectionImpl(useProjectState.getState(), sectionId)
          .defaultChildSectionType,
      ).toBe(SectionTypeEnum.Dict);
      await act(async () => {
        viewModeSelect.value = ListRootViewModeEnum.kanban;
        viewModeSelect.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(mockedRouteSetListRootViewMode).toHaveBeenCalledWith(
        expect.objectContaining({
          projectConfigId: "project-1",
          sectionId,
          viewMode: ListRootViewModeEnum.kanban,
        }),
      );
      expect(
        getCurrEffectiveSectionImpl(useProjectState.getState(), sectionId)
          .viewMode,
      ).toBe(ListRootViewModeEnum.kanban);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
