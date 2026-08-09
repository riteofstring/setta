/* @vitest-environment jsdom */

import {
  getWorkspaceDocument,
  loadWorkspaceDocument,
  type WorkspaceSection,
} from "@setta/workspace";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { playgroundDocument } from "./playgroundDocument";
import {
  commitPlaygroundMetaControlEditRequest,
  commitPlaygroundMetaControlTextValue,
  MetaControlSectionBody,
  registerPlaygroundSectionKinds,
} from "./sectionKinds";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function getMetaSection(sectionId: string): WorkspaceSection {
  const section = getWorkspaceDocument().sections[sectionId];
  if (!section) {
    throw new Error(`The playground document lost meta section ${sectionId}.`);
  }
  return section;
}

function getMetaDataNumber(sectionId: string, field: string): number {
  const data = getMetaSection(sectionId).data;
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Meta section ${sectionId} lost its opaque data.`);
  }
  const value = data[field];
  if (typeof value !== "number") {
    throw new Error(`Meta section ${sectionId} lost its numeric ${field} field.`);
  }
  return value;
}

function getMetaDataString(sectionId: string, field: string): string {
  const data = getMetaSection(sectionId).data;
  if (data === null || data === undefined || typeof data !== "object" || Array.isArray(data)) {
    throw new Error(`Meta section ${sectionId} lost its opaque data.`);
  }
  const value = data[field];
  if (typeof value !== "string") {
    throw new Error(`Meta section ${sectionId} lost its string ${field} field.`);
  }
  return value;
}

describe("the playground representative meta controls", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeAll(registerPlaygroundSectionKinds);

  beforeEach(() => {
    loadWorkspaceDocument(playgroundDocument);
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  async function mount(sectionId: string) {
    await act(async () => {
      root.render(createElement(MetaControlSectionBody, { section: getMetaSection(sectionId) }));
    });
  }

  it("loads Button and Text at the captured 202 x 46 outer geometry", () => {
    for (const sectionId of ["meta-button", "meta-text"]) {
      expect(getMetaSection(sectionId).size).toEqual({ width: 200, height: 44 });
      expect(playgroundDocument.topLevelSections[sectionId]).toMatchObject({ w: 200, h: 44 });
    }
  });

  it("commits Button actions and edit requests into opaque section data", async () => {
    await mount("meta-button");
    const button = host.querySelector<HTMLButtonElement>("button");
    expect(button?.textContent).toBe("Trigger");
    await act(async () => button?.click());
    expect(getMetaDataNumber("meta-button", "actionCount")).toBe(1);

    commitPlaygroundMetaControlEditRequest("meta-button");
    expect(getMetaDataNumber("meta-button", "editRequests")).toBe(1);
  });

  it("renders Text and commits its controlled callback through the section-data funnel", async () => {
    await mount("meta-text");
    const dummy = document.getElementById("meta-text-value-MetaControl");
    if (!dummy) {
      throw new Error("The playground Text meta control did not render its idle editor.");
    }
    expect(dummy.getAttribute("aria-label")).toBe("Text value");
    expect(dummy.className).toContain("single-cell-child");
    commitPlaygroundMetaControlTextValue("meta-text", "threshold");
    expect(getMetaDataString("meta-text", "value")).toBe("threshold");
  });

  it("fails specifically for an unknown host control kind", () => {
    expect(() =>
      MetaControlSectionBody({
        section: {
          ...getMetaSection("meta-text"),
          id: "meta-mystery",
          data: { control: "mystery", showSectionTitle: false },
        },
      }),
    ).toThrowError("Meta control section meta-mystery names the unknown control mystery.");
  });
});
