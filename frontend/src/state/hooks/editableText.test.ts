/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useEditableOnSubmit } from "./editableText";

type EditableHarnessProps = {
  initialValue: string;
  onSetTitle: (value: string) => void;
  condition: (value: string) => boolean | Promise<boolean>;
};

let latestEditable: ReturnType<typeof useEditableOnSubmit> | null = null;

function EditableHarness({
  initialValue,
  onSetTitle,
  condition,
}: EditableHarnessProps) {
  latestEditable = useEditableOnSubmit(initialValue, onSetTitle, condition);
  return createElement("div");
}

type RenderedHarness = {
  host: HTMLDivElement;
  root: Root;
};

const originalReactActEnvironment = (
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT;

let renderedHarness: RenderedHarness | null = null;

function setReactActEnvironment(value: boolean | undefined) {
  const target = globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT?: boolean;
  };
  if (value === undefined) {
    delete target.IS_REACT_ACT_ENVIRONMENT;
    return;
  }
  target.IS_REACT_ACT_ENVIRONMENT = value;
}

async function renderHarness(
  props: EditableHarnessProps,
): Promise<RenderedHarness> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(createElement(EditableHarness, props));
  });

  const rendered = { host, root };
  renderedHarness = rendered;
  return rendered;
}

async function unmountHarness(rendered: RenderedHarness | null): Promise<void> {
  if (!rendered) {
    return;
  }
  await act(async () => {
    rendered.root.unmount();
  });
  rendered.host.remove();
}

describe("useEditableOnSubmit", () => {
  beforeEach(() => {
    setReactActEnvironment(true);
    latestEditable = null;
  });

  afterEach(async () => {
    await unmountHarness(renderedHarness);
    renderedHarness = null;
    setReactActEnvironment(originalReactActEnvironment);
    document.body.innerHTML = "";
  });

  it("prefers the latest value when blur callers provide a stale string snapshot", async () => {
    const onSetTitle = vi.fn();

    await renderHarness({
      initialValue: "initial",
      onSetTitle,
      condition: () => true,
    });

    if (!latestEditable) {
      throw new Error("Editable harness did not render.");
    }

    await act(async () => {
      latestEditable?.onChange("latest");
    });
    await act(async () => {
      await latestEditable?.onBlur("stale");
    });

    expect(onSetTitle).toHaveBeenCalledWith("latest");
  });
});
