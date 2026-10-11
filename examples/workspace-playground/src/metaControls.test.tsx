/* @vitest-environment jsdom */

import {
  createWorkspaceHost,
  WorkspaceProvider,
  type WorkspaceHost,
  type WorkspaceSection,
  type WorkspaceSectionData,
} from "@riteofstring/setta";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import {
  commitPlaygroundMetaControlEditRequest,
  commitPlaygroundMetaControlValue,
  MetaControlSectionBody,
  registerPlaygroundSectionKinds,
} from "./sectionKinds";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let workspaceHost: WorkspaceHost;

function getMetaSection(sectionId: string): WorkspaceSection {
  const section = workspaceHost.getSnapshot().sections[sectionId];
  if (!section) {
    throw new Error(`The playground document lost meta section ${sectionId}.`);
  }
  return section;
}

function getMetaDataNumber(sectionId: string, field: string): number {
  const data = getMetaSection(sectionId).data;
  if (
    data === null ||
    data === undefined ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(`Meta section ${sectionId} lost its opaque data.`);
  }
  const value = data[field];
  if (typeof value !== "number") {
    throw new Error(
      `Meta section ${sectionId} lost its numeric ${field} field.`,
    );
  }
  return value;
}

function getMetaDataString(sectionId: string, field: string): string {
  const data = getMetaSection(sectionId).data;
  if (
    data === null ||
    data === undefined ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(`Meta section ${sectionId} lost its opaque data.`);
  }
  const value = data[field];
  if (typeof value !== "string") {
    throw new Error(
      `Meta section ${sectionId} lost its string ${field} field.`,
    );
  }
  return value;
}

function getMetaDataArray(
  sectionId: string,
  field: string,
): Array<WorkspaceSectionData> {
  const data = getMetaSection(sectionId).data;
  if (
    data === null ||
    data === undefined ||
    typeof data !== "object" ||
    Array.isArray(data)
  ) {
    throw new Error(`Meta section ${sectionId} lost its opaque data.`);
  }
  const value = data[field];
  if (!Array.isArray(value)) {
    throw new Error(`Meta section ${sectionId} lost its array ${field} field.`);
  }
  return value;
}

function getRequiredElement<ElementType extends Element>(
  parent: ParentNode,
  selector: string,
  description: string,
): ElementType {
  const element = parent.querySelector<ElementType>(selector);
  if (!element) {
    throw new Error(`The playground ${description} did not render.`);
  }
  return element;
}

describe("the playground representative meta controls", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    workspaceHost = createWorkspaceHost();
    registerPlaygroundSectionKinds(workspaceHost);
    workspaceHost.loadDocument(playgroundDocument);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
    workspaceHost.dispose();
  });

  async function mount(sectionId: string) {
    await act(async () => {
      root.render(
        createElement(
          WorkspaceProvider,
          { host: workspaceHost },
          createElement(MetaControlSectionBody, {
            section: getMetaSection(sectionId),
          }),
        ),
      );
    });
  }

  it("loads all twelve controls with their frozen default and fixture geometry", () => {
    for (const sectionId of [
      "meta-button",
      "meta-color",
      "meta-rotary",
      "meta-switch",
      "meta-text",
      "meta-time",
    ]) {
      expect(getMetaSection(sectionId).size).toEqual({
        width: 200,
        height: 44,
      });
      expect(playgroundDocument.topLevelSections[sectionId]).toMatchObject({
        w: 200,
        h: 44,
      });
    }
    for (const sectionId of ["meta-dropdown", "meta-password", "meta-slider"]) {
      expect(getMetaSection(sectionId).size).toEqual({
        width: 200,
        height: "auto",
      });
      expect(playgroundDocument.topLevelSections[sectionId]).toMatchObject({
        w: 200,
        h: 44,
      });
    }
    expect(getMetaSection("meta-date").size).toEqual({
      width: 200,
      height: "auto",
    });
    expect(playgroundDocument.topLevelSections["meta-date"]).toMatchObject({
      w: 200,
      h: null,
    });
    expect(getMetaSection("meta-textarea").size).toEqual({
      width: 200,
      height: 98,
    });
    expect(playgroundDocument.topLevelSections["meta-textarea"]).toMatchObject({
      w: 200,
      h: 98,
    });
    expect(getMetaSection("meta-dropzone").size).toEqual({
      width: 240,
      height: 120,
    });
    expect(playgroundDocument.topLevelSections["meta-dropzone"]).toMatchObject({
      w: 240,
      h: 120,
    });
  });

  it("commits Button actions and edit requests into opaque section data", async () => {
    await mount("meta-button");
    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toBe("Trigger");
    await act(async () => button?.click());
    expect(getMetaDataNumber("meta-button", "actionCount")).toBe(1);

    commitPlaygroundMetaControlEditRequest(workspaceHost, "meta-button");
    expect(getMetaDataNumber("meta-button", "editRequests")).toBe(1);
  });

  it("renders the complete host fixture through the package dispatcher", async () => {
    await mount("meta-dropdown");
    expect(
      getRequiredElement(
        host,
        "[role='combobox']",
        "Dropdown combobox",
      ).getAttribute("aria-label"),
    ).toBe("Dropdown value");

    await mount("meta-slider");
    expect(
      getRequiredElement(host, "[role='slider']", "Slider thumb").getAttribute(
        "aria-label",
      ),
    ).toBe("Slider value");

    await mount("meta-rotary");
    expect(
      getRequiredElement(host, "[role='slider']", "Rotary knob").getAttribute(
        "aria-label",
      ),
    ).toBe("Rotary value");

    await mount("meta-switch");
    expect(
      getRequiredElement(host, "[role='switch']", "Switch action").getAttribute(
        "aria-label",
      ),
    ).toBe("Switch value");

    await mount("meta-text");
    const dummy = getRequiredElement<HTMLElement>(
      host,
      '[id$="-meta-text-value-MetaControl"]',
      "Text idle editor",
    );
    expect(dummy.getAttribute("aria-label")).toBe("Text value");
    expect(dummy.className).toContain("single-cell-child");

    await mount("meta-date");
    expect(
      host.querySelector("[role='group'][aria-label='Date value']"),
    ).not.toBeNull();

    await mount("meta-time");
    const timeInput = getRequiredElement<HTMLInputElement>(
      host,
      "input[type='time']",
      "Time input",
    );
    expect(timeInput.getAttribute("aria-label")).toBe("Time value");
    expect(timeInput.value).toBe("13:45");

    await mount("meta-textarea");
    expect(
      getRequiredElement<HTMLElement>(
        host,
        '[id$="-meta-textarea-value-MetaControl"]',
        "TextArea idle editor",
      ).className,
    ).toContain("min-h-24");

    await mount("meta-password");
    expect(
      getRequiredElement(
        host,
        "input[type='password']",
        "Password input",
      ).getAttribute("aria-label"),
    ).toBe("Password value");

    await mount("meta-color");
    expect(
      getRequiredElement(
        host,
        "input[type='color']",
        "Color input",
      ).getAttribute("aria-label"),
    ).toBe("Color value");

    await mount("meta-button");
    expect(
      getRequiredElement(host, "button", "Button action").textContent,
    ).toBe("Trigger");

    await mount("meta-dropzone");
    expect(
      host.querySelector(
        "[role='group'][aria-label='Dropzone dropzone: Drop a file here']",
      ),
    ).not.toBeNull();
  });

  it("commits controlled values and dropzone metadata through host-owned section data", async () => {
    commitPlaygroundMetaControlValue(
      workspaceHost,
      "meta-text",
      "text",
      "threshold",
    );
    expect(getMetaDataString("meta-text", "value")).toBe("threshold");

    await mount("meta-switch");
    const switchButton =
      host.querySelector<HTMLButtonElement>("[role='switch']");
    if (!switchButton) {
      throw new Error(
        "The playground Switch meta control did not render its action.",
      );
    }
    await act(async () => switchButton.click());
    expect(getMetaDataString("meta-switch", "value")).toBe("true");

    await mount("meta-dropzone");
    const serverButton = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Server file...",
    );
    if (!serverButton) {
      throw new Error(
        "The playground Dropzone meta control did not render its server action.",
      );
    }
    await act(async () => serverButton.click());
    expect(getMetaDataArray("meta-dropzone", "attachments")).toEqual([
      expect.objectContaining({
        kind: "file",
        name: "server-example.csv",
        size: 2048,
      }),
    ]);
  });

  it("fails specifically for an unknown host control kind", () => {
    expect(() =>
      renderToStaticMarkup(
        createElement(
          WorkspaceProvider,
          { host: workspaceHost },
          createElement(MetaControlSectionBody, {
            section: {
              ...getMetaSection("meta-text"),
              id: "meta-mystery",
              data: { control: "mystery", showSectionTitle: false },
            },
          }),
        ),
      ),
    ).toThrowError(
      "Meta control section meta-mystery names the unknown control mystery.",
    );
  });
});
