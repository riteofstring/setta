/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TextInputCodeMirror } from "./TextInputCodeMirror";

const codeMirrorProps = vi.hoisted(() => [] as Record<string, unknown>[]);

vi.mock("@uiw/react-codemirror", async () => {
  const React = await import("react");
  return {
    default: (props: Record<string, unknown>) => {
      codeMirrorProps.push(props);
      React.useEffect(() => {
        const onCreateEditor = props.onCreateEditor as
          | ((view: {
              contentDOM: { focus: (options?: FocusOptions) => void };
              dispatch: (transaction: unknown) => void;
              focus: () => void;
              posAtCoords: () => number;
            }) => void)
          | undefined;
        onCreateEditor?.({
          contentDOM: {
            focus: () => undefined,
          },
          dispatch: () => undefined,
          focus: () => undefined,
          posAtCoords: () => 0,
        });
      }, []);
      return React.createElement("div", {
        id: props.id as string | undefined,
        className: props.className as string | undefined,
        "data-testid": "codemirror",
      });
    },
  };
});

vi.mock("components/Utils/CodeMirror/useCodeMirrorStyle", () => ({
  useCodeMirrorStyle: () => "theme",
}));

vi.mock("./useCodeMirrorTooltipParent", () => ({
  useCodeMirrorTooltipParent: () => null,
}));

vi.mock("./getExtensions", () => ({
  getExtensions: () => ["base-extension"],
}));

vi.mock("./getOnCreateEditor", async () => {
  const actual = await vi.importActual<typeof import("./getOnCreateEditor")>(
    "./getOnCreateEditor",
  );
  return {
    ...actual,
    wrappedCompletionsFn: vi.fn(actual.wrappedCompletionsFn),
  };
});

vi.mock("state/definitions", () => ({
  useShareSession: (
    selector: (state: { isDeploymentMode: boolean }) => boolean,
  ) => selector({ isDeploymentMode: false }),
}));

describe("TextInputCodeMirror render path", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    codeMirrorProps.length = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    codeMirrorProps.length = 0;
  });

  it("mounts the real editor immediately without a second initialization rerender for auto-activated Pixi handoffs", async () => {
    await act(async () => {
      root.render(
        <TextInputCodeMirror
          sectionId="section-1"
          paramInfoId="param-1"
          value="1.0"
          defaultVal=""
          onChange={() => undefined}
          dummyCodeClassName="dummy"
          realCodeClassName="real"
          singleLine={true}
          wrapLines={false}
          dummyDivId="dummy-editor"
          shouldAutoActivateOnMount={true}
        />,
      );
    });

    expect(container.querySelector("#dummy-editor")).toBeNull();
    expect(
      container.querySelector("[data-testid='codemirror']"),
    ).not.toBeNull();
    expect(codeMirrorProps).toHaveLength(1);
    expect(codeMirrorProps[0]?.id).toBe("CodeMirror-section-1-param-1");
    const codeMirrorRoot = container.querySelector(
      "#CodeMirror-section-1-param-1",
    );
    expect(codeMirrorRoot).not.toBeNull();
    expect(codeMirrorRoot?.className.includes("opacity-0")).toBe(false);
  });

  it("keeps the dummy shell until activation for non-auto mounts", () => {
    act(() => {
      root.render(
        <TextInputCodeMirror
          sectionId="section-1"
          paramInfoId="param-1"
          value="1.0"
          defaultVal=""
          onChange={() => undefined}
          dummyCodeClassName="dummy"
          realCodeClassName="real"
          singleLine={true}
          wrapLines={false}
          dummyDivId="dummy-editor"
        />,
      );
    });

    expect(container.querySelector("#dummy-editor")).not.toBeNull();
    expect(container.querySelector("[data-testid='codemirror']")).toBeNull();
    expect(codeMirrorProps).toHaveLength(0);
  });
});
