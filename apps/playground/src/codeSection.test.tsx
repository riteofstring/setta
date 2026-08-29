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
import { registerPlaygroundSectionKinds } from "./sectionKinds";
import { PlaygroundCodeSectionInspector } from "./sectionOptionInspectors";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "code-editor";

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

function requireControl<T extends HTMLElement>(
  control: T | null | undefined,
  description: string,
): T {
  if (!control) {
    throw new Error(`The host code section Inspector lost its ${description}.`);
  }
  return control;
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
      mode: "editable",
      wrapLines: false,
    });
    expect(
      getWorkspaceCodeSectionData(workspaceHost, SECTION_ID).code,
    ).toContain("def train(");
  });

  it("authors every typed option from host Inspector UI", () => {
    const renderInspector = () => {
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
    };
    renderInspector();
    const selects = container.querySelectorAll<HTMLSelectElement>("select");
    const switches = container.querySelectorAll<HTMLInputElement>(
      'input[type="checkbox"]',
    );
    const language = requireControl(selects[0], "language select");
    const mode = requireControl(selects[1], "mode select");
    const wrapLines = requireControl(switches[0], "wrap lines switch");
    const lineNumbers = requireControl(switches[1], "line numbers switch");
    const indentWidth = requireControl(
      container.querySelector<HTMLInputElement>('input[type="number"]'),
      "indent width control",
    );
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

    expect([...mode.options].map((option) => option.value)).toStrictEqual([
      "editable",
      "read-only",
      "generated-document",
    ]);
    expect(mode.closest("label")?.textContent).toContain("Mode");

    expect(container.querySelectorAll('input[type="number"]')).toHaveLength(1);

    act(() => {
      language.value = "yaml";
      language.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      mode.value = "generated-document";
      mode.dispatchEvent(new Event("change", { bubbles: true }));
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

    const authored = getWorkspaceCodeSectionData(workspaceHost, SECTION_ID);
    expect(authored).toMatchObject({
      language: "yaml",
      wrapLines: true,
      lineNumbers: false,
      indentWidth: 2,
      mode: "generated-document",

      generatedRegion: {
        from: "import setta".length,
        to: authored.code.length,
      },
    });

    renderInspector();
    const generatedFrom = requireControl(
      container.querySelectorAll<HTMLInputElement>('input[type="number"]')[1],
      "generated region from control",
    );
    act(() => {
      setNativeInputValue(generatedFrom, String(authored.code.length + 40));
      generatedFrom.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      getWorkspaceCodeSectionData(workspaceHost, SECTION_ID),
    ).toMatchObject({
      generatedRegion: {
        from: authored.code.length - 1,
        to: authored.code.length,
      },
    });
  });

  it("refuses a typed write that leaves the contract", () => {
    expect(() =>
      getWorkspaceCodeSectionData(workspaceHost, "item-panel"),
    ).toThrow(/is a item-list section, not a code section/u);
  });
});
