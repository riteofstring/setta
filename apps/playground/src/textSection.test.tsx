/* @vitest-environment jsdom */

import {
  getWorkspaceDocument,
  getWorkspaceTextSectionData,
  loadWorkspaceDocument,
  WORKSPACE_TEXT_SECTION_KIND,
} from "@setta/workspace";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import { PlaygroundTextSectionInspector, registerPlaygroundSectionKinds } from "./sectionKinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The built-in Text section reaches this unrelated host entirely through public package APIs: it
// is registered beside the host's own kinds in the one registration call, its document data is the
// package's typed contract rather than host-decoded opaque data, and the host's own Inspector UI
// authors that contract through the package's typed write.

const RENDERED_SECTION_ID = "text-rendered";
const SOURCE_SECTION_ID = "text-source";

// React tracks a controlled input's last value on the node itself, so a test that assigns
// `value` directly is swallowed as "unchanged". Write through the native setter it wraps.
function setNativeInputValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  if (!descriptor?.set) {
    throw new Error("This environment has no native input value setter.");
  }
  descriptor.set.call(input, value);
}

describe("the playground's built-in text section", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    registerPlaygroundSectionKinds();
  });

  beforeEach(() => {
    loadWorkspaceDocument(playgroundDocument);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("composes both display modes with the host's own registered kinds", () => {
    for (const sectionId of [RENDERED_SECTION_ID, SOURCE_SECTION_ID]) {
      expect(getWorkspaceDocument().sections[sectionId]?.kind).toBe(WORKSPACE_TEXT_SECTION_KIND);
    }
    expect(getWorkspaceTextSectionData(RENDERED_SECTION_ID)).toMatchObject({
      format: "markdown",
      displayMode: "render",
      fontSizePx: 14,
      readOnly: false,
    });
    expect(getWorkspaceTextSectionData(SOURCE_SECTION_ID).displayMode).toBe("edit");
    // Both fixtures carry the same source, so the gate can compare the two surfaces directly.
    expect(getWorkspaceTextSectionData(RENDERED_SECTION_ID).text).toBe(
      getWorkspaceTextSectionData(SOURCE_SECTION_ID).text,
    );
  });

  it("authors every typed option from host Inspector UI", () => {
    act(() => {
      root.render(
        createElement(PlaygroundTextSectionInspector, { sectionId: RENDERED_SECTION_ID }),
      );
    });
    const format = container.querySelector<HTMLSelectElement>("select");
    const readOnly = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
    const fontSizePx = container.querySelector<HTMLInputElement>('input[type="number"]');
    if (!format || !readOnly || !fontSizePx) {
      throw new Error("The host text section Inspector lost one of its controls.");
    }
    expect(container.querySelector("legend")?.textContent).toBe("Text options");
    expect(format.classList.contains("playground-section-option-control")).toBe(true);
    expect(fontSizePx.classList.contains("playground-section-option-number")).toBe(true);
    expect(readOnly.classList.contains("playground-section-option-switch")).toBe(true);
    expect(readOnly.closest("label")?.textContent).toContain("Read only");

    act(() => {
      format.value = "plaintext";
      format.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      readOnly.click();
    });
    act(() => {
      setNativeInputValue(fontSizePx, "20");
      fontSizePx.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(getWorkspaceTextSectionData(RENDERED_SECTION_ID)).toMatchObject({
      format: "plaintext",
      readOnly: true,
      fontSizePx: 20,
    });
  });

  it("refuses a typed read outside the built-in kind", () => {
    expect(() => getWorkspaceTextSectionData("code-editor")).toThrow(
      /is a setta\.code section, not a text section/u,
    );
  });
});
