/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LiveDictAreaPixiValueOverlayRowState } from "./liveDictAreaPixiValueOverlayRowState";
import { LiveDictAreaPixiValueOverlaySceneRow } from "./LiveDictAreaPixiValueOverlaySceneRow";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";

type MockParamContainerProps = {
  maybeErrorMessage: string;
  paramInfoId: string;
  sectionId: string;
};

type MockParamNameInputProps = {
  bg: string;
  border: string;
  hasChildren: boolean;
  paramInfoId: string;
  sectionId: string;
};

const paramInputCalls = vi.hoisted(() => [] as MockParamContainerProps[]);
const paramNameInputCalls = vi.hoisted(() => [] as MockParamNameInputProps[]);
const resizeHandleCalls = vi.hoisted(
  () => [] as { showResizeHandle: boolean }[],
);

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

vi.mock("./ParamItems/ParamInput", () => ({
  ParamInput: (props: MockParamContainerProps) => {
    paramInputCalls.push(props);
    return (
      <div
        data-param-input-row={props.paramInfoId}
        data-param-input-section={props.sectionId}
      />
    );
  },
}));

vi.mock("./ParamItems/ParamNameInput", () => ({
  ParamNameInput: (props: MockParamNameInputProps) => {
    paramNameInputCalls.push(props);
    return (
      <div
        data-param-name-input-row={props.paramInfoId}
        data-param-name-input-section={props.sectionId}
      />
    );
  },
}));

vi.mock("./ResizeHandle", () => ({
  ResizeHandle: ({ showResizeHandle }: { showResizeHandle: boolean }) => {
    resizeHandleCalls.push({ showResizeHandle });
    return <div data-resize-handle={showResizeHandle ? "visible" : "hidden"} />;
  },
}));

describe("LiveDictAreaPixiValueOverlaySceneRow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    paramInputCalls.length = 0;
    paramNameInputCalls.length = 0;
    resizeHandleCalls.length = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    paramInputCalls.length = 0;
    paramNameInputCalls.length = 0;
    resizeHandleCalls.length = 0;
  });

  it("mounts a direct full editor row surface without the generic ParamContainer shell", () => {
    const target: LiveDictAreaPixiValueRowTarget = {
      blockId: "unpinned",
      editorKind: "other",
      handleColumnResizeStart: vi.fn(),
      height: 22,
      label: "Grid Color",
      listKey: "unpinned",
      requiredParamIdsToPaths: {
        gridColor: ["gridColor"],
      },
      rowId: "gridColor",
      sectionId: "settings-section",
      styleColor: null,
      width: 280,
      x: 0,
      y: 0,
    };
    const rowState: LiveDictAreaPixiValueOverlayRowState = {
      coreNameEditable: false,
      description: "Scene-backed description",
      errorMessage: "",
      isFocusedSearchResult: false,
      isSearchResult: false,
      isSelected: false,
      paramName: "Grid Color Display",
    };

    act(() => {
      root.render(
        <LiveDictAreaPixiValueOverlaySceneRow
          hasSectionStyleTheme={false}
          rowState={rowState}
          target={target}
        />,
      );
    });

    expect(paramInputCalls).toHaveLength(1);
    expect(paramInputCalls[0]).toMatchObject({
      maybeErrorMessage: "",
      paramInfoId: "gridColor",
      sectionId: "settings-section",
    });
    expect(paramNameInputCalls).toHaveLength(0);
    expect(resizeHandleCalls).toEqual([{ showResizeHandle: true }]);
    expect(
      container.querySelector(
        "article[data-live-dict-area-editor-overlay-row='true'][data-live-dict-area-editor-overlay-row-id='gridColor']",
      ),
    ).not.toBeNull();
    expect(
      container
        .querySelector(
          "article[data-live-dict-area-editor-overlay-row='true'][data-live-dict-area-editor-overlay-row-id='gridColor']",
        )
        ?.getAttribute("data-live-dict-area-editor-overlay-row-surface"),
    ).toBe("full-row");
    expect(
      container.querySelector(
        "article[data-param-row='true'][data-param-render-mode='full']",
      ),
    ).not.toBeNull();
    expect(container.querySelector("[data-param-switch-row-id]")).toBeNull();
    expect(container.textContent).toContain("Grid Color Display");
  });

  it("keeps kwarg rows on the real ParamNameInput path", () => {
    const target: LiveDictAreaPixiValueRowTarget = {
      blockId: "pinned",
      editorKind: "other",
      handleColumnResizeStart: vi.fn(),
      height: 22,
      label: "kwargs",
      listKey: "pinned",
      requiredParamIdsToPaths: {
        kwargs: ["kwargs"],
      },
      rowId: "kwargs",
      sectionId: "settings-section",
      styleColor: null,
      width: 280,
      x: 0,
      y: 0,
    };
    const rowState: LiveDictAreaPixiValueOverlayRowState = {
      coreNameEditable: true,
      description: "Editable kwarg",
      errorMessage: "",
      isFocusedSearchResult: false,
      isSearchResult: false,
      isSelected: false,
      paramName: "kwargs",
    };

    act(() => {
      root.render(
        <LiveDictAreaPixiValueOverlaySceneRow
          hasSectionStyleTheme={true}
          rowState={rowState}
          target={target}
        />,
      );
    });

    expect(paramInputCalls).toHaveLength(1);
    expect(paramNameInputCalls).toHaveLength(1);
    expect(paramNameInputCalls[0]).toMatchObject({
      hasChildren: false,
      paramInfoId: "kwargs",
      sectionId: "settings-section",
    });
  });

  it("keeps normal CodeMirror canary rows on a value-only editor surface", () => {
    const target: LiveDictAreaPixiValueRowTarget = {
      blockId: "unpinned",
      editorKind: "codemirror",
      handleColumnResizeStart: vi.fn(),
      height: 22,
      label: "Default Zoom Level",
      listKey: "unpinned",
      requiredParamIdsToPaths: {
        defaultZoomLevel: ["defaultZoomLevel"],
      },
      rowId: "defaultZoomLevel",
      sectionId: "settings-section",
      styleColor: null,
      width: 280,
      x: 0,
      y: 0,
    };
    const rowState: LiveDictAreaPixiValueOverlayRowState = {
      coreNameEditable: false,
      description: "Live Pixi CodeMirror canary row",
      errorMessage: "",
      isFocusedSearchResult: false,
      isSearchResult: false,
      isSelected: false,
      paramName: "Default Zoom Level",
    };

    act(() => {
      root.render(
        <LiveDictAreaPixiValueOverlaySceneRow
          hasSectionStyleTheme={false}
          rowState={rowState}
          target={target}
        />,
      );
    });

    expect(paramInputCalls).toHaveLength(1);
    expect(paramInputCalls[0]).toMatchObject({
      maybeErrorMessage: "",
      paramInfoId: "defaultZoomLevel",
      sectionId: "settings-section",
    });
    expect(paramNameInputCalls).toHaveLength(0);
    expect(resizeHandleCalls).toEqual([]);
    expect(
      container
        .querySelector(
          "article[data-live-dict-area-editor-overlay-row='true'][data-live-dict-area-editor-overlay-row-id='defaultZoomLevel']",
        )
        ?.getAttribute("data-live-dict-area-editor-overlay-row-surface"),
    ).toBe("value-only");
    expect(container.querySelector(".section-key")).toBeNull();
  });
});
