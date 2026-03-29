/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveDictAreaPixiValueRowOverlay } from "./LiveDictAreaPixiValueRowOverlay";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";

type MockParamSwitchProps = {
  hasSectionStyleTheme: boolean;
  listKey: string;
  onResizeStart: React.MouseEventHandler;
  paramInfoId: string;
  renderMode: string;
  requiredParamIdsToPaths: Record<string, string[]>;
  sectionId: string;
};

const localStorageState = vi.hoisted(() => ({
  darkMode: false,
}));

const temporaryMiscState = vi.hoisted(() => ({}) as Record<string, unknown>);
const paramSwitchCalls = vi.hoisted(() => [] as MockParamSwitchProps[]);

vi.mock(import("state/definitions"), async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useLocalStorage: (selector: (state: typeof localStorageState) => unknown) =>
      selector(localStorageState),
    useTemporaryMiscState: (
      selector: (state: Record<string, unknown>) => unknown,
    ) => selector(temporaryMiscState),
  };
});

vi.mock("./ParamSwitch", () => ({
  ParamSwitch: (props: MockParamSwitchProps) => {
    paramSwitchCalls.push(props);
    return (
      <div
        data-param-switch-has-section-style-theme={
          props.hasSectionStyleTheme ? "true" : "false"
        }
        data-param-switch-list-key={props.listKey}
        data-param-switch-render-mode={props.renderMode}
        data-param-switch-row-id={props.paramInfoId}
        data-param-switch-section-id={props.sectionId}
      />
    );
  },
}));

describe("LiveDictAreaPixiValueRowOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    paramSwitchCalls.length = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    paramSwitchCalls.length = 0;
  });

  it("mounts a single direct ParamSwitch row with the Pixi editor-overlay contract", () => {
    const target: LiveDictAreaPixiValueRowTarget = {
      blockId: "pinned",
      handleColumnResizeStart: vi.fn(),
      height: 44,
      label: "Pinned Value",
      listKey: "pinned",
      requiredParamIdsToPaths: {
        "pinned-value": ["pinned-group", "pinned-value"],
      },
      rowId: "pinned-value",
      sectionId: "section-1",
      styleColor: null,
      x: 16,
      y: 24,
    };

    act(() => {
      root.render(
        <LiveDictAreaPixiValueRowOverlay
          editorKind="combobox"
          target={target}
        />,
      );
    });

    const overlay = container.querySelector<HTMLElement>(
      "[data-live-dict-area-editor-overlay='active']",
    );
    expect(overlay).not.toBeNull();
    expect(
      overlay?.getAttribute("data-live-dict-area-editor-overlay-kind"),
    ).toBe("value-row");
    expect(
      overlay?.getAttribute("data-live-dict-area-editor-overlay-editor-kind"),
    ).toBe("combobox");
    expect(
      overlay?.getAttribute("data-live-dict-area-editor-overlay-row-id"),
    ).toBe("pinned-value");
    expect(paramSwitchCalls).toHaveLength(1);
    expect(paramSwitchCalls[0]).toMatchObject({
      hasSectionStyleTheme: false,
      listKey: "pinned",
      paramInfoId: "pinned-value",
      renderMode: "full",
      requiredParamIdsToPaths: {
        "pinned-value": ["pinned-group", "pinned-value"],
      },
      sectionId: "section-1",
    });
    expect(
      container.querySelector(
        "[data-param-switch-row-id='pinned-value'][data-param-switch-render-mode='full']",
      ),
    ).not.toBeNull();
  });
});
