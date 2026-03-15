/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TextInputCodeMirror,
  resolveTooltipParentDivId,
} from "./TextInputCodeMirror";

const { applyActiveSectionChangeMock } = vi.hoisted(() => ({
  applyActiveSectionChangeMock: vi.fn(),
}));

vi.mock("state/actions/activeSectionController", () => ({
  applyActiveSectionChange: applyActiveSectionChangeMock,
}));

vi.mock("state/actions/lsp", () => ({
  setTextFieldWaitingForLSP: () => () => undefined,
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCurrProjectConfigId: () => "project-config-1",
}));

vi.mock("state/definitions", () => ({
  useShareSession: (selector: (state: { isDeploymentMode: boolean }) => unknown) =>
    selector({ isDeploymentMode: false }),
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_text_field_completion: vi.fn(),
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyle", () => ({
  useCodeMirrorStyle: () => "theme",
}));

vi.mock("components/Utils/CodeMirror/useCodeMirrorTooltipParent", () => ({
  useCodeMirrorTooltipParent: () => null,
}));

vi.mock("components/Utils/CodeMirror/getExtensions", () => ({
  getExtensions: () => ["extension"],
}));

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");

  return {
    default: (props: {
      className?: string;
      onBlur?: () => void;
      onCreateEditor?: (view: {
        contentDOM: { focus: (options?: { preventScroll?: boolean }) => void };
        dispatch: (transaction: unknown) => void;
        focus: () => void;
        posAtCoords: ({
          x,
          y,
        }: {
          x: number;
          y: number;
        }) => number | null;
      }) => void;
    }) => {
      React.useEffect(() => {
        props.onCreateEditor?.({
          contentDOM: { focus: () => undefined },
          dispatch: () => undefined,
          focus: () => undefined,
          posAtCoords: () => 0,
        });
      }, [props]);

      return React.createElement("div", {
        "data-testid": "real-codemirror",
        className: props.className,
        onBlur: props.onBlur,
        tabIndex: 0,
      });
    },
  };
});

vi.mock("./DummyCodeMirror", async () => {
  const React = await import("react");

  return {
    DummyCodeMirror: (props: {
      divId: string;
      className?: string;
      code?: string;
      placeholder?: string;
      onFocus?: () => void;
      onMouseDownCapture?: (event: MouseEvent) => void;
    }) =>
      React.createElement(
        "div",
        {
          "data-testid": "dummy-codemirror",
          id: props.divId,
          className: props.className,
          onFocus: props.onFocus,
          onMouseDownCapture: props.onMouseDownCapture,
          tabIndex: 0,
        },
        props.code ?? props.placeholder ?? "",
      ),
  };
});

describe("resolveTooltipParentDivId", () => {
  it("returns null when tooltipParentDivId is undefined", () => {
    expect(resolveTooltipParentDivId(undefined)).toBeNull();
  });

  it("returns null when tooltipParentDivId is null", () => {
    expect(resolveTooltipParentDivId(null)).toBeNull();
  });

  it("returns the provided tooltip parent id", () => {
    expect(resolveTooltipParentDivId(CODEMIRROR_TOOLTIP_PARENT_ID)).toBe(
      CODEMIRROR_TOOLTIP_PARENT_ID,
    );
  });
});

describe("TextInputCodeMirror activation", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    applyActiveSectionChangeMock.mockClear();
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("keeps the real editor mounted after blur once a field is activated", async () => {
    await act(async () => {
      root.render(
        createElement(TextInputCodeMirror, {
          sectionId: "section-1",
          paramInfoId: "param-1",
          value: "mode",
          defaultVal: "Mode",
          onChange: () => undefined,
          dummyDivId: "dummy-mode-input",
          dummyCodeClassName: "dummy",
          realCodeClassName: "real",
          color: "green",
          language: "python",
          autocomplete: false,
        }),
      );
    });

    const dummyCodeMirror = host.querySelector(
      '[data-testid="dummy-codemirror"]',
    );
    expect(dummyCodeMirror).not.toBeNull();
    expect(host.querySelector('[data-testid="real-codemirror"]')).toBeNull();

    await act(async () => {
      dummyCodeMirror?.dispatchEvent(
        new MouseEvent("mousedown", {
          bubbles: true,
          button: 0,
          clientX: 12,
          clientY: 18,
        }),
      );
    });

    expect(applyActiveSectionChangeMock).toHaveBeenCalledWith({
      interaction: "input-focus",
      sectionId: "section-1",
    });
    expect(host.querySelector('[data-testid="dummy-codemirror"]')).toBeNull();

    const realCodeMirror = host.querySelector(
      '[data-testid="real-codemirror"]',
    );
    expect(realCodeMirror).not.toBeNull();

    await act(async () => {
      realCodeMirror?.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
    });

    expect(host.querySelector('[data-testid="dummy-codemirror"]')).toBeNull();
    expect(host.querySelector('[data-testid="real-codemirror"]')).not.toBeNull();
  });
});
