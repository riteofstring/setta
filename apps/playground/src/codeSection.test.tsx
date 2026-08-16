/* @vitest-environment jsdom */
import { beforeEach as beforeEachWorkspaceTestHost } from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../../packages/workspace/test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});

import {
  createWorkspaceHost,
  getWorkspaceCodeSectionData,
  WORKSPACE_CODE_SECTION_KIND,
  WorkspaceProvider,
  type WorkspaceHost,
} from "@setta/workspace";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import {
  PlaygroundCodeSectionInspector,
  registerPlaygroundSectionKinds,
} from "./sectionKinds";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The built-in Code Editor section reaches this unrelated host entirely through public package
// APIs: it is registered beside the host's own kinds in the one registration call, its document
// data is the package's typed contract rather than host-decoded opaque data, and the host's own
// Inspector UI authors that contract through the package's typed write.

const SECTION_ID = "code-editor";

// React tracks a controlled input's last value on the node itself, so a test that assigns
// `value` directly is swallowed as "unchanged". Write through the native setter it wraps.
function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  );
  if (!descriptor?.set) {
    throw new Error("This environment has no native input value setter.");
  }
  descriptor.set.call(input, value);
}

describe("the playground's built-in code section", () => {
  let container: HTMLDivElement;
  let root: Root;
  let workspaceHost: WorkspaceHost;

  beforeEach(() => {
    workspaceHost = createWorkspaceHost();
    registerPlaygroundSectionKinds(workspaceHost);
    workspaceHost.loadDocument(playgroundDocument);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    workspaceHost.dispose();
  });

  it("composes with the host's own registered kinds", () => {
    const section = workspaceHost.getSnapshot().sections[SECTION_ID];
    expect(section?.kind).toBe(WORKSPACE_CODE_SECTION_KIND);
    expect(
      getWorkspaceCodeSectionData(workspaceHost, SECTION_ID),
    ).toMatchObject({
      language: "python",
      lineNumbers: true,
      indentWidth: 4,
      readOnly: false,
      wrapLines: false,
    });
    expect(
      getWorkspaceCodeSectionData(workspaceHost, SECTION_ID).code,
    ).toContain("def train(");
  });

  it("authors every typed option from host Inspector UI", () => {
    act(() => {
      root.render(
        createElement(
          WorkspaceProvider,
          { host: workspaceHost },
          createElement(PlaygroundCodeSectionInspector, {
            sectionId: SECTION_ID,
          }),
        ),
      );
    });
    const language = container.querySelector<HTMLSelectElement>("select");
    const [wrapLines, lineNumbers] =
      container.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    const indentWidth = container.querySelector<HTMLInputElement>(
      'input[type="number"]',
    );
    if (!language || !wrapLines || !lineNumbers || !indentWidth) {
      throw new Error(
        "The host code section Inspector lost one of its controls.",
      );
    }
    expect(container.querySelector("legend")?.textContent).toBe(
      "Editor options",
    );
    expect(
      language.classList.contains("playground-section-option-control"),
    ).toBe(true);
    expect(
      indentWidth.classList.contains("playground-section-option-number"),
    ).toBe(true);
    expect(
      wrapLines.classList.contains("playground-section-option-switch"),
    ).toBe(true);
    expect(wrapLines.closest("label")?.textContent).toContain("Wrap lines");

    act(() => {
      language.value = "yaml";
      language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      wrapLines.click();
    });
    act(() => {
      lineNumbers.click();
    });
    act(() => {
      setNativeInputValue(indentWidth, "2");
      indentWidth.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(
      getWorkspaceCodeSectionData(workspaceHost, SECTION_ID),
    ).toMatchObject({
      language: "yaml",
      wrapLines: true,
      lineNumbers: false,
      indentWidth: 2,
    });
  });

  it("refuses a typed write that leaves the contract", () => {
    expect(() =>
      getWorkspaceCodeSectionData(workspaceHost, "item-panel"),
    ).toThrow(/is a item-list section, not a code section/u);
  });
});
