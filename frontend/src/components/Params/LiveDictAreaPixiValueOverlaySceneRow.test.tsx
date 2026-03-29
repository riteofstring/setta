/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveDictAreaPixiValueOverlaySceneRow } from "./LiveDictAreaPixiValueOverlaySceneRow";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";

type MockParamContainerProps = {
  bg: string;
  border: string;
  hasSectionStyleTheme: boolean;
  isKwarg: boolean;
  maybeErrorMessage: string;
  paramInfoId: string;
  renderMode: string;
  sectionId: string;
};

type MockParamNameInputProps = {
  bg: string;
  border: string;
  hasChildren: boolean;
  paramInfoId: string;
  sectionId: string;
};

const projectState = vi.hoisted(() => ({
  codeObj: {
    coreNameEditable: false,
    description: "Scene-backed description",
  },
  selectedParams: [] as string[],
}));
const searchState = vi.hoisted(() => ({
  focused: null as { paramInfoId: string; sectionId: string } | null,
  lookup: new Set<string>(),
}));
const typeErrorState = vi.hoisted(() => ({
  errors: {} as Record<string, { params?: Record<string, string[]> }>,
}));
const paramContainerCalls = vi.hoisted(() => [] as MockParamContainerProps[]);
const paramNameInputCalls = vi.hoisted(() => [] as MockParamNameInputProps[]);

vi.mock(import("state/actions/sectionInfos"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getCurrEffectiveCodeObjImplWithTypeGuard: () => projectState.codeObj,
    getCurrEffectiveSectionImplWithTypeGuard: () => ({
      selectedParams: projectState.selectedParams,
    }),
  };
});

vi.mock(import("state/definitions"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useProjectSearch: (selector: (state: typeof searchState) => unknown) =>
      selector(searchState),
    useProjectState: (selector: (state: typeof projectState) => unknown) =>
      selector(projectState),
    useTypeErrors: (selector: (state: typeof typeErrorState) => unknown) =>
      selector(typeErrorState),
  };
});

vi.mock("./ParamContainer", () => ({
  ParamContainer: ({
    children,
    ...props
  }: MockParamContainerProps & { children: React.ReactNode }) => {
    paramContainerCalls.push(props);
    return (
      <div
        data-param-container-row={props.paramInfoId}
        data-param-render-mode={props.renderMode}
      >
        {children}
      </div>
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

describe("LiveDictAreaPixiValueOverlaySceneRow", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    projectState.codeObj = {
      coreNameEditable: false,
      description: "Scene-backed description",
    };
    projectState.selectedParams = [];
    searchState.focused = null;
    searchState.lookup = new Set<string>();
    typeErrorState.errors = {};
    paramContainerCalls.length = 0;
    paramNameInputCalls.length = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    paramContainerCalls.length = 0;
    paramNameInputCalls.length = 0;
  });

  it("mounts a direct full editor row without the generic ParamSwitch shell", () => {
    const target: LiveDictAreaPixiValueRowTarget = {
      blockId: "unpinned",
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
      x: 0,
      y: 0,
    };

    act(() => {
      root.render(
        <LiveDictAreaPixiValueOverlaySceneRow
          hasSectionStyleTheme={false}
          target={target}
        />,
      );
    });

    expect(paramContainerCalls).toHaveLength(1);
    expect(paramContainerCalls[0]).toMatchObject({
      hasSectionStyleTheme: false,
      isKwarg: false,
      maybeErrorMessage: "",
      paramInfoId: "gridColor",
      renderMode: "full",
      sectionId: "settings-section",
    });
    expect(paramNameInputCalls).toHaveLength(0);
    expect(
      container.querySelector(
        "[data-live-dict-area-editor-overlay-row='true'][data-live-dict-area-editor-overlay-row-id='gridColor']",
      ),
    ).not.toBeNull();
    expect(container.querySelector("[data-param-switch-row-id]")).toBeNull();
    expect(container.textContent).toContain("Grid Color");
  });

  it("keeps kwarg rows on the real ParamNameInput path", () => {
    projectState.codeObj = {
      coreNameEditable: true,
      description: "Editable kwarg",
    };

    const target: LiveDictAreaPixiValueRowTarget = {
      blockId: "pinned",
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
      x: 0,
      y: 0,
    };

    act(() => {
      root.render(
        <LiveDictAreaPixiValueOverlaySceneRow
          hasSectionStyleTheme={true}
          target={target}
        />,
      );
    });

    expect(paramContainerCalls).toHaveLength(1);
    expect(paramContainerCalls[0]?.isKwarg).toBe(true);
    expect(paramNameInputCalls).toHaveLength(1);
    expect(paramNameInputCalls[0]).toMatchObject({
      hasChildren: false,
      paramInfoId: "kwargs",
      sectionId: "settings-section",
    });
  });
});
